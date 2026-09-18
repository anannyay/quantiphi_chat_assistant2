import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ZodError } from 'zod';
import { HttpError, idSchema, messageSchema } from './domain.js';
import { newConversation } from './repository.js';
export function createApp({ repository, provider, mode, model }) {
  const app = express();
  const active = new Set(); // Per-thread mutex for one server process; see architecture.md.
  app.use(helmet()); app.use(express.json({ limit: '32kb' }));
  app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Try again in a minute.' } }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode, model: mode === 'demo' ? 'Scripted demo' : model, storage: mode === 'demo' ? 'Local JSON' : 'MongoDB' }));
  app.get('/api/conversations', async (_req, res) => res.json(await repository.list()));
  app.post('/api/conversations', async (_req, res) => res.status(201).json(await repository.save(newConversation())));
  async function find(id) { idSchema.parse(id); const c = await repository.get(id); if (!c) throw new HttpError(404, 'Conversation not found.'); return c; }
  app.get('/api/conversations/:id', async (req, res) => res.json(await find(req.params.id)));
  app.delete('/api/conversations/:id', async (req, res) => {
    await find(req.params.id);
    if (active.has(req.params.id)) throw new HttpError(409, 'Stop the response before deleting this conversation.');
    await repository.delete(req.params.id); res.status(204).end();
  });
  app.post('/api/conversations/:id/messages', async (req, res) => {
    const { prompt, tone } = messageSchema.parse(req.body); idSchema.parse(req.params.id);
    if (active.has(req.params.id)) throw new HttpError(409, 'This conversation is already generating a reply.');
    active.add(req.params.id);
    const controller = new AbortController(); let conversation, assistant;
    // Browser disconnects cancel the upstream request, preventing wasted generation.
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect); const timeout = setTimeout(() => controller.abort(), 90000);
    const emit = (type, data) => { if (!res.destroyed) res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); };
    try {
      conversation = await find(req.params.id);
      if (conversation.messages.length >= 200) throw new HttpError(409, 'This thread is full. Start a new conversation.');
      const now = new Date().toISOString();
      const user = { id: randomUUID(), role: 'user', content: prompt, tone, createdAt: now, status: 'complete' };
      assistant = { id: randomUUID(), role: 'assistant', content: '', tone, createdAt: now, status: 'streaming' };
      if (!conversation.messages.length) conversation.title = prompt.slice(0, 64);
      conversation.messages.push(user, assistant); conversation.updatedAt = now;
      await repository.save(conversation); // Save the prompt before the network call.
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders(); emit('start', { conversationId: conversation.id, user, assistant, title: conversation.title });
      for await (const delta of provider.stream(conversation.messages.slice(0, -1), tone, controller.signal)) { assistant.content += delta; emit('delta', { delta }); }
      assistant.status = 'complete'; conversation.updatedAt = new Date().toISOString();
      await repository.save(conversation); // A done event guarantees durable persistence.
      emit('done', { message: assistant });
    } catch (error) {
      if (assistant) {
        assistant.status = controller.signal.aborted ? 'interrupted' : 'error';
        try { await repository.save(conversation); } catch { console.error('Failed to persist interrupted response'); }
      }
      if (!res.headersSent) throw error;
      emit('error', { error: controller.signal.aborted ? 'Response stopped or timed out. Partial text was saved.' : 'Could not complete the response. Check the connection or API configuration and try again.' });
    } finally { clearTimeout(timeout); res.off('close', disconnect); active.delete(req.params.id); if (res.headersSent) res.end(); }
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API route not found.')));
  app.use(express.static(path.resolve('dist')));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    const status = error instanceof ZodError ? 400 : error.status || 500;
    res.status(status).json({ error: error instanceof ZodError ? 'Invalid request. Use a valid tone and a prompt between 1 and 8,000 characters.' : status < 500 ? error.message : 'Something went wrong. Please try again.' });
  }); return app;
}
