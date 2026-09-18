import OpenAI from 'openai';
import { setTimeout as delay } from 'node:timers/promises';
import { contextFor, instructionsFor } from './domain.js';
export class OpenAIProvider {
  constructor(apiKey, model) {
    this.client = new OpenAI({ apiKey, maxRetries: 1, timeout: 60000 });
    this.model = model;
  }
  async *stream(messages, tone, signal) {
    const stream = await this.client.responses.create(
      {
        model: this.model,
        instructions: instructionsFor(tone),
        input: contextFor(messages),
        stream: true,
        store: false,
        max_output_tokens: 1800,
      },
      { signal },
    );
    let complete = false;
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta')
        yield event.delta;
      if (event.type === 'response.completed') complete = true;
      if (['error', 'response.failed', 'response.incomplete'].includes(event.type))
        throw new Error('The AI could not finish this response.');
    }
    if (!complete) throw new Error('The AI stream ended before completion.');
  }
}
// Explicitly scripted; never silently substitutes for a failed live API call.
export class DemoProvider {
  async *stream(messages, tone, signal) {
    const topic = messages
      .at(-1)
      .content.replace(/[\r\n]/g, ' ')
      .slice(0, 160);
    const text = {
      professional: `## Let's give your idea a clear direction\n\nYou asked: “${topic}”\n\nA useful approach is to move from the desired outcome to a small, testable first step.\n\n1. **Define the outcome.** Describe what success looks like in one sentence.\n2. **Identify the constraints.** Consider your audience, available time, and resources.\n3. **Make it concrete.** Create an initial draft or prototype, then gather feedback.\n\n> Clarity comes from making the next step specific.\n\n**Demo note:** This is a scripted example of the professional tone. Connect OpenAI and MongoDB for real, contextual answers.`,
      casual: `Let's work through it together. ✨\n\nSo, you're thinking about “${topic}”\n\nI'd start small:\n\n- **Pick the goal.** What would a great result actually look like?\n- **Get something down.** A rough first version beats staring at a blank page.\n- **Try it out.** Get a little feedback, make a tweak, and keep going.\n\nYou don't need every detail figured out to take the first step.\n\n*Demo note: this is a scripted casual reply. Connect OpenAI and MongoDB for a real conversation.*`,
      concise: `For “${topic}”:\n\n1. Define the goal.\n2. Make a first draft.\n3. Test, refine, repeat.\n\n*Scripted demo response. Connect OpenAI and MongoDB for real answers.*`,
    }[tone];
    for (const chunk of text.match(/.{1,5}|\n/g)) {
      await delay(12, undefined, { signal });
      yield chunk;
    }
  }
}
