import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { MongoClient } from 'mongodb';
export function newConversation() {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}
export const summary = ({ messages, ...record }) => ({ ...record, messageCount: messages.length });
// Adapters share a small boundary; HTTP routes never depend on storage details.
export class FileRepository {
  constructor(directory = '.data') {
    this.file = path.resolve(directory, 'conversations.json');
    this.records = new Map();
    this.queue = Promise.resolve();
  }
  async init() {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      this.records = new Map(JSON.parse(await readFile(this.file, 'utf8')).map((c) => [c.id, c]));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this;
  }
  async list() {
    return [...this.records.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(summary);
  }
  async get(id) {
    const c = this.records.get(id);
    return c ? structuredClone(c) : null;
  }
  async save(record) {
    this.records.set(record.id, structuredClone(record));
    await this.flush();
    return record;
  }
  async delete(id) {
    this.records.delete(id);
    await this.flush();
  }
  flush() {
    // Serialize writes and atomically replace JSON to avoid cross-thread corruption.
    const snapshot = JSON.stringify([...this.records.values()], null, 2);
    const operation = this.queue.then(async () => {
      await writeFile(this.file + '.tmp', snapshot);
      await rename(this.file + '.tmp', this.file);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async close() {
    await this.queue;
  }
}
export class MongoRepository {
  constructor(uri, database) {
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    this.database = database;
  }
  async init() {
    await this.client.connect();
    this.collection = this.client.db(this.database).collection('conversations');
    await this.collection.createIndex({ id: 1 }, { unique: true });
    await this.collection.createIndex({ updatedAt: -1 });
    return this;
  }
  async list() {
    return this.collection
      .aggregate([
        { $sort: { updatedAt: -1 } },
        {
          $project: {
            _id: 0,
            id: 1,
            title: 1,
            createdAt: 1,
            updatedAt: 1,
            messageCount: { $size: '$messages' },
          },
        },
      ])
      .toArray();
  }
  async get(id) {
    return this.collection.findOne({ id }, { projection: { _id: 0 } });
  }
  async save(record) {
    await this.collection.replaceOne({ id: record.id }, record, { upsert: true });
    return record;
  }
  async delete(id) {
    await this.collection.deleteOne({ id });
  }
  async close() {
    await this.client.close();
  }
}
