import 'dotenv/config';
import { FileRepository, MongoRepository } from './repository.js';
import { DemoProvider, OpenAIProvider } from './provider.js';
import { createApp } from './app.js';
const mode = process.env.APP_MODE || 'demo';
if (!['demo', 'live'].includes(mode)) throw new Error('APP_MODE must be demo or live');
if (mode === 'live' && (!process.env.OPENAI_API_KEY || !process.env.MONGODB_URI)) throw new Error('Live mode requires OPENAI_API_KEY and MONGODB_URI. Configure .env first.');
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const repository = await (mode === 'live' ? new MongoRepository(process.env.MONGODB_URI, process.env.MONGODB_DB || 'cadence') : new FileRepository()).init();
// Recover unfinished placeholders after a process crash.
for (const summary of await repository.list()) {
  const record = await repository.get(summary.id);
  if (record.messages.some(m => m.status === 'streaming')) {
    record.messages.forEach(m => { if (m.status === 'streaming') m.status = 'interrupted'; }); await repository.save(record);
  }
}
const provider = mode === 'live' ? new OpenAIProvider(process.env.OPENAI_API_KEY, model) : new DemoProvider();
const server = createApp({ repository, provider, mode, model }).listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () => console.log(`Cadence running on http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001} (${mode})`));
async function shutdown() { server.close(async () => { await repository.close(); process.exit(0); }); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
