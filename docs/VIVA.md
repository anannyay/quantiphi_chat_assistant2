# Viva and demo guide

## A 30-second introduction

“Cadence is a streaming AI chat application with a React frontend, Express backend, and MongoDB conversation storage. Its differentiator is a tone selector that changes the system instruction on the server for every message. I separated provider and storage adapters so I can test failures and run an explicitly labeled demo without credentials.”

## Explain the important code

| Open                   | Explain                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `server/domain.js`     | Zod validates the request; an allowlist maps a tone name to a server-owned instruction.                       |
| `server/provider.js`   | The OpenAI Responses API returns an async stream. Text deltas are forwarded; terminal completion is required. |
| `server/app.js`        | Prompt is persisted first; response is streamed; completed answer is saved before the final event.            |
| `server/repository.js` | A common interface supports MongoDB in live mode and local JSON in demo mode.                                 |
| `src/api.js`           | A buffered UTF-8 decoder handles arbitrary network chunk boundaries.                                          |
| `tests/api.test.js`    | Dependency injection makes provider failures and overlapping requests reproducible.                           |

## Likely questions

**Why SSE rather than WebSockets?**

The browser submits one request and receives a one-way stream. SSE framing over fetch is sufficient and works with AbortController. WebSockets would add connection state without helping this interaction. Fetch is used instead of EventSource because sending a prompt requires a POST body.

**How does the tone toggle actually work?**

The frontend sends a small enum value. The backend validates it and constructs the `instructions` field of the OpenAI Responses request. Tone is applied to the next submitted message; it does not rewrite existing answers or change a reply mid-stream.

**Can a user put arbitrary system instructions in the request?**

Extra JSON fields are rejected. The server selects the tone instruction. A user can still write instruction-like text inside a normal prompt; an allowlist is not a complete defense against prompt injection and does not guarantee perfect model adherence.

**What happens if the API fails halfway through?**

The server saves any partial answer with error status and emits an error frame. The UI labels it incomplete. The next request excludes incomplete assistant text from context. Live mode never switches to scripted answers behind the user's back.

**What happens when Stop is pressed?**

The frontend aborts fetch. Express notices the closed response and aborts the upstream API request. Any accumulated text is saved with interrupted status. A hard server crash may lose text since the initial save; startup marks orphaned streaming placeholders interrupted.

**Why MongoDB?**

It is required by the brief, and the conversation maps naturally to a document containing messages. Unique ID and updated-time indexes support retrieval and the history list. Each replace is atomic at document level; the application lock prevents competing writes in this single-process design.

**What would you improve for production?**

Authentication and per-user authorization first. Then distributed concurrency control, idempotent retries, paginated history, token-aware context limits, usage budgets, monitoring, and periodic stream checkpoints. The current app is intentionally scoped to a local assessment workspace.

**How do you know streaming is correct?**

Tests split a UTF-8 stream byte by byte, including an emoji. Other tests reject streams without `done`, simulate provider failures, and prove that overlapping generations are rejected. The MongoDB integration test exercises a real database in CI.

**What is demo mode?**

It uses deterministic scripted answers and local JSON, not a real language model or MongoDB. It demonstrates the UX without credentials. Live mode requires both OpenAI and MongoDB and clearly changes the UI status.

## Before demonstrating

- Run `npm run check`.
- If showing live mode, confirm the header says Live AI and send a real question.
- Reopen the saved answer after a refresh.
- Keep `.env` out of the screen share when showing the repository.
- Be able to point to each boundary above and describe one limitation honestly.
