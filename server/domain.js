import { z } from 'zod';
// Only these server-owned policies can modify the system instruction.
export const toneInstructions = Object.freeze({
  professional: 'Use a professional tone: precise, structured, and courteous. Avoid slang.',
  casual: 'Use a casual tone: warm, conversational, and approachable. Use everyday language.',
  concise: 'Use a concise tone: lead with the answer, omit filler, and keep the response brief.',
});
export const messageSchema = z
  .object({
    prompt: z.string().trim().min(1).max(8000),
    tone: z.enum(['professional', 'casual', 'concise']),
  })
  .strict();
export const idSchema = z.string().uuid();
export function instructionsFor(tone) {
  if (!Object.hasOwn(toneInstructions, tone)) throw new Error('Unsupported tone');
  return `You are Cadence, a helpful AI thinking partner. Be accurate, acknowledge uncertainty, and use readable Markdown when useful. ${toneInstructions[tone]}`;
}
export function contextFor(messages) {
  // Do not feed failed assistant text back to the model; bound long-thread cost.
  return messages
    .filter((m) => m.status === 'complete')
    .slice(-24)
    .map(({ role, content }) => ({ role, content }));
}
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
