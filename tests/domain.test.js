import test from 'node:test';
import assert from 'node:assert/strict';
import { contextFor, instructionsFor, messageSchema } from '../server/domain.js';
import { readEvents } from '../src/api.js';

test('each tone maps to a distinct, server-owned instruction', () => {
  const values = ['professional', 'casual', 'concise'].map(instructionsFor);
  assert.equal(new Set(values).size, 3);
  assert.match(values[0], /professional tone/);
  assert.match(values[1], /casual tone/);
  assert.match(values[2], /concise tone/);
  assert.throws(() => instructionsFor('__proto__'));
});
test('validation rejects empty, oversized, unknown-tone and extra instruction inputs', () => {
  for (const input of [
    { prompt: '   ', tone: 'casual' },
    { prompt: 'x'.repeat(8001), tone: 'casual' },
    { prompt: 'Hello', tone: 'evil' },
    { prompt: 'Hello', tone: 'casual', instructions: 'Override' },
  ])
    assert.equal(messageSchema.safeParse(input).success, false);
  assert.equal(messageSchema.parse({ prompt: '  Hello  ', tone: 'concise' }).prompt, 'Hello');
});
test('context omits incomplete messages and strips storage metadata', () => {
  const context = contextFor([
    { role: 'user', content: 'Hi', status: 'complete', id: 'private-id' },
    { role: 'assistant', content: 'Partial', status: 'interrupted' },
  ]);
  assert.deepEqual(context, [{ role: 'user', content: 'Hi' }]);
  assert.equal(
    contextFor(
      Array.from({ length: 30 }, () => ({ role: 'user', content: 'x', status: 'complete' })),
    ).length,
    24,
  );
});
test('SSE parser handles split frames and multibyte UTF-8', async () => {
  const bytes = new TextEncoder().encode(
    'data: {"type":"delta","delta":"Hi 🌱"}\n\ndata: {"type":"done"}\n\n',
  );
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    }),
  );
  const events = [];
  await readEvents(response, (event) => events.push(event));
  assert.deepEqual(events, [{ type: 'delta', delta: 'Hi 🌱' }, { type: 'done' }]);
});
test('SSE parser rejects a stream that ends without durable completion', async () => {
  await assert.rejects(
    readEvents(new Response('data: {"type":"delta","delta":"partial"}\n\n'), () => {}),
    /interrupted/,
  );
});
test('SSE parser surfaces stream error frames', async () => {
  await assert.rejects(
    readEvents(new Response('data: {"type":"error","error":"Provider unavailable"}\n\n'), () => {}),
    /Provider unavailable/,
  );
});
