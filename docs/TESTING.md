# Testing and verification

## Automated checks

```bash
npm ci
npm run check
npm run format:check
docker compose up -d
npm run test:mongo
```

The standard suite has 15 tests covering:

- Distinct server-owned tone instructions and rejection of unsupported tones.
- Empty/oversized prompts and attempted extra instruction fields.
- Bounded context and omission of incomplete assistant responses.
- Byte-fragmented SSE frames and multi-byte UTF-8.
- Missing completion and explicit error frames.
- Saving content, roles, tone, timestamps and title, including reopening file storage.
- Safe error handling and preservation of partial provider output.
- Missing conversation, deletion, and generation/deletion conflicts.
- Actual OpenAI request construction with a stubbed SDK boundary.
- Rejection of upstream truncation.
- Browser disconnect cancellation and interrupted-response persistence.
- No successful completion event when the final database write fails.

The separate MongoDB integration suite creates a uniquely named test database, validates round-trip persistence and indexes, then drops only that test database. Use `TEST_MONGODB_URI` to override its default connection.

GitHub Actions provisions MongoDB and runs the test suite, production build, MongoDB test, and formatter check on every push and pull request.

## Manual acceptance scenarios

| Scenario                                        | Expected result                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| Start with no environment configuration         | Demo workspace badge; scripted replies; local JSON history                        |
| Enable live mode without credentials            | Startup fails with an actionable configuration error                              |
| Submit a question                               | User bubble appears, assistant text arrives progressively                         |
| Switch Professional to Concise before next send | New request carries concise policy; old answer retains its original tone badge    |
| Press Enter / Shift+Enter                       | Send / insert newline; IME composition does not send prematurely                  |
| Stop an in-progress response                    | Generation stops and partial answer is labeled interrupted                        |
| Reload and select a conversation                | Stored messages and metadata are restored                                         |
| Search a title                                  | Matching history entries remain; no-match state appears                           |
| Delete a thread                                 | Confirmation appears; cancel preserves the thread                                 |
| Copy / export                                   | Clipboard contains reply text; downloaded Markdown includes messages and metadata |
| Disconnect provider                             | Error appears; no fabricated fallback answer                                      |
| Narrow viewport                                 | Sidebar collapses behind a menu; composer remains available                       |
| Open a dialog using the keyboard                | Focus is trapped; Escape closes it; focus returns to previous element             |

## Scope of verification

Mocked OpenAI tests verify request shape and stream handling, not model behavior, billing, or account access. A successful live call must be checked with a real user-configured key. MongoDB integration tests verify the storage adapter independently of the AI provider.

The UI escapes raw HTML through React Markdown; remote Markdown images are disabled. The app is not authenticated or designed for untrusted multi-user hosting. These are explicit deployment limits, not features hidden behind a demo.
