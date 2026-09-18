# API contract

Base URL: `/api`. All request bodies are JSON. All ordinary errors return `{ "error": "Human-readable message" }`.

| Method | Path                          | Result                                          |
| ------ | ----------------------------- | ----------------------------------------------- |
| GET    | `/health`                     | Runtime mode, model, and storage adapter        |
| GET    | `/conversations`              | Summaries ordered by latest update              |
| POST   | `/conversations`              | New empty conversation (201)                    |
| GET    | `/conversations/:id`          | Conversation with all messages                  |
| DELETE | `/conversations/:id`          | Delete conversation (204); 409 while generating |
| POST   | `/conversations/:id/messages` | Stream a response using SSE                     |

## Send a message

```http
POST /api/conversations/550e8400-e29b-41d4-a716-446655440000/messages
Content-Type: application/json

{"prompt":"Explain server-sent events","tone":"concise"}
```

`prompt`: trimmed nonempty string, maximum 8,000 characters. `tone`: exactly `professional`, `casual`, or `concise`. Unknown fields are rejected. IDs must be valid UUIDs.

```text
data: {"type":"start","conversationId":"...","user":{...},"assistant":{...},"title":"Explain server-sent events"}

data: {"type":"delta","delta":"SSE lets a server"}

data: {"type":"delta","delta":" push updates to a browser."}

data: {"type":"done","message":{"id":"...","role":"assistant","content":"SSE lets a server push updates to a browser.","tone":"concise","createdAt":"...","status":"complete"}}

```

Each frame ends with a blank line. `start` includes stable server-generated IDs and timestamps. `delta` is text to append. `done` includes the complete, persisted assistant message.

Once streaming headers have been sent, failures use an event instead of a new HTTP status:

```text
data: {"type":"error","error":"Could not complete the response. Check the connection or API configuration and try again."}

```

A missing `done` must be treated as interrupted. The client does not assume EOF means success.

## Errors and limits

| Status | Meaning                                                                           |
| ------ | --------------------------------------------------------------------------------- |
| 400    | Invalid UUID, prompt, tone, malformed JSON, or extra fields                       |
| 404    | Conversation or API route does not exist                                          |
| 409    | Another response is active, thread is full, or deletion conflicts with generation |
| 413    | Request body exceeds 32 KB                                                        |
| 429    | More than 120 API requests per minute from one IP                                 |
| 500    | Unexpected server failure; internal details are not returned                      |

Generation has a 90-second overall cancellation timer and a 1,800-token output cap. The OpenAI SDK timeout is 60 seconds with one configured retry. Closing the connection or pressing Stop cancels the upstream request.

`GET /health` reports configured runtime state, not a continuous deep probe of MongoDB or OpenAI. No authentication is implemented: keep the app local until adding user isolation.
