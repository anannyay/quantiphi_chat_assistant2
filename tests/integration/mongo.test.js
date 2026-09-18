import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoRepository, newConversation } from '../../server/repository.js';

// Dedicated integration suite: never touches the application's database.
test('MongoDB round-trip, indexes, summaries and delete', async () => {
  const name = `cadence_test_${randomUUID().replaceAll('-', '')}`;
  const repository = await new MongoRepository(
    process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017',
    name,
  ).init();
  try {
    const record = newConversation();
    record.messages.push({
      id: randomUUID(),
      role: 'user',
      content: 'Hello MongoDB',
      tone: 'professional',
      status: 'complete',
      createdAt: record.createdAt,
    });
    await repository.save(record);
    assert.deepEqual(await repository.get(record.id), record);
    record.title = 'Updated';
    await repository.save(record);
    const list = await repository.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'Updated');
    assert.equal(list[0].messageCount, 1);
    assert.equal(list[0].messages, undefined);
    const indexes = await repository.collection.indexes();
    assert.ok(indexes.some((i) => i.key.id === 1 && i.unique));
    assert.ok(indexes.some((i) => i.key.updatedAt === -1));
    await repository.delete(record.id);
    assert.equal(await repository.get(record.id), null);
  } finally {
    await repository.client.db(name).dropDatabase();
    await repository.close();
  }
});
