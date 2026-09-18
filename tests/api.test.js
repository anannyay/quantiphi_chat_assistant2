import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { FileRepository } from '../server/repository.js';
import { OpenAIProvider } from '../server/provider.js';

async function fixture(
  t,
  provider = {
    async *stream(_messages, tone) {
      yield `${tone}: `;
      yield 'Hello 🌱';
    },
  },
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cadence-test-'));
  const repository = await new FileRepository(dir).init();
  t.after(async () => {
    await repository.close();
    await rm(dir, { recursive: true, force: true });
  });
  const app = createApp({ repository, provider, mode: 'demo' });
  const { body: conversation } = await request(app).post('/api/conversations').expect(201);
  return { app, repository, conversation, dir };
}
test('stream persists prompt, response, timestamps and tone; history survives reopening', async (t) => {
  const { app, conversation, dir } = await fixture(t);
  const result = await request(app)
    .post(`/api/conversations/${conversation.id}/messages`)
    .send({ prompt: 'Hello', tone: 'casual' })
    .expect(200)
    .expect('Content-Type', /text\/event-stream/);
  const events = result.text
    .trim()
    .split('\n\n')
    .map((line) => JSON.parse(line.slice(6)));
  assert.deepEqual(
    events.map((e) => e.type),
    ['start', 'delta', 'delta', 'done'],
  );
  const reopened = await new FileRepository(dir).init();
  const saved = await reopened.get(conversation.id);
  assert.equal(saved.title, 'Hello');
  assert.deepEqual(
    saved.messages.map((m) => m.role),
    ['user', 'assistant'],
  );
  assert.equal(saved.messages[1].content, 'casual: Hello 🌱');
  assert.equal(saved.messages[1].status, 'complete');
  assert.equal(saved.messages[1].tone, 'casual');
  assert.ok(Date.parse(saved.messages[1].createdAt));
  const list = await request(app).get('/api/conversations').expect(200);
  assert.equal(list.body[0].messageCount, 2);
  assert.equal(list.body[0].messages, undefined);
});
test('invalid inputs are rejected before modifying storage or calling the provider', async (t) => {
  let calls = 0;
  const { app, conversation, repository } = await fixture(t, {
    async *stream() {
      calls++;
      yield 'no';
    },
  });
  for (const payload of [
    { prompt: ' ', tone: 'casual' },
    { prompt: 'Hi', tone: 'unknown' },
    { prompt: 'Hi', tone: 'concise', system: 'override' },
  ]) {
    await request(app)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send(payload)
      .expect(400);
  }
  assert.equal(calls, 0);
  assert.equal((await repository.get(conversation.id)).messages.length, 0);
  await request(app).get('/api/conversations/not-a-uuid').expect(400);
});
test('provider failure saves a partial response with error status', async (t) => {
  const { app, conversation, repository } = await fixture(t, {
    async *stream() {
      yield 'Partial';
      throw new Error('Secret provider diagnostics');
    },
  });
  const response = await request(app)
    .post(`/api/conversations/${conversation.id}/messages`)
    .send({ prompt: 'Hi', tone: 'professional' })
    .expect(200);
  assert.match(response.text, /"type":"error"/);
  assert.doesNotMatch(response.text, /Secret provider diagnostics/);
  const message = (await repository.get(conversation.id)).messages[1];
  assert.equal(message.status, 'error');
  assert.equal(message.content, 'Partial');
});
test('missing conversation returns 404 and delete removes the record', async (t) => {
  const { app, conversation } = await fixture(t);
  await request(app).delete(`/api/conversations/${conversation.id}`).expect(204);
  await request(app).get(`/api/conversations/${conversation.id}`).expect(404);
  await request(app)
    .post(`/api/conversations/${conversation.id}/messages`)
    .send({ prompt: 'Hi', tone: 'casual' })
    .expect(404);
});
test('overlapping generation and deletion are rejected while a stream holds the thread lock', async (t) => {
  let release, announce;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    announce = resolve;
  });
  const { app, conversation } = await fixture(t, {
    async *stream() {
      announce();
      await gate;
      yield 'Done';
    },
  });
  const first = request(app)
    .post(`/api/conversations/${conversation.id}/messages`)
    .send({ prompt: 'First', tone: 'casual' })
    .then((r) => r);
  await started;
  try {
    await request(app)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ prompt: 'Second', tone: 'concise' })
      .expect(409);
    await request(app).delete(`/api/conversations/${conversation.id}`).expect(409);
  } finally {
    release();
    await first;
  }
});
test('OpenAI adapter sends actual system instructions and full validated context', async () => {
  const provider = new OpenAIProvider('test-key-not-real', 'test-model');
  let captured;
  provider.client = {
    responses: {
      create: async (params) => {
        captured = params;
        return (async function* () {
          yield { type: 'response.output_text.delta', delta: 'Hello' };
          yield { type: 'response.completed' };
        })();
      },
    },
  };
  let result = '';
  for await (const chunk of provider.stream(
    [{ role: 'user', content: 'Hi', status: 'complete' }],
    'concise',
    new AbortController().signal,
  ))
    result += chunk;
  assert.equal(result, 'Hello');
  assert.match(captured.instructions, /concise tone/);
  assert.deepEqual(captured.input, [{ role: 'user', content: 'Hi' }]);
  assert.equal(captured.stream, true);
  assert.equal(captured.store, false);
});
test('OpenAI adapter rejects upstream stream truncation', async () => {
  const provider = new OpenAIProvider('test-key-not-real', 'test-model');
  provider.client = {
    responses: {
      create: async () =>
        (async function* () {
          yield { type: 'response.output_text.delta', delta: 'Partial' };
        })(),
    },
  };
  await assert.rejects(async () => {
    for await (const chunk of provider.stream([], 'casual', new AbortController().signal)) {
      assert.equal(chunk, 'Partial');
    }
  }, /before completion/);
});
