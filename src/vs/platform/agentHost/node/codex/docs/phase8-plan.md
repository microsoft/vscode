# Codex Phase 8 — Prompt attachments + session hardening ✅

## Scope

Close the remaining parity gaps with the Claude integration that don't
require SDK-side changes. Everything in this phase is internal to the
agent host; no new wire protocol surface.

## What landed

### 1. Prompt resolver (`codexPromptResolver.ts`)

New file mirroring `claudePromptResolver.ts`. The Codex SDK accepts a
plain `string` prompt, so attachments are rendered as inline text:

- **Simple attachments** with `modelRepresentation` are appended as
  plain-text blocks separated by blank lines.
- **Resource attachments** are rendered as URI reference bullet lists
  wrapped in `<system-reminder>` tags, with optional line-number
  suffixes for selections.
- **Embedded resource attachments** are dropped (no Codex-side consumer).

`sendMessage` now calls `resolvePromptWithAttachments(prompt, attachments)`
instead of passing the raw prompt string. Previously, the `attachments`
parameter was ignored entirely (`_attachments`).

### 2. Session sequencer

All `sendMessage` calls are serialized per session id via
`SequencerByKey<string>` from `base/common/async.ts`. This prevents:

- Concurrent first-message calls from racing to materialize the same
  provisional session.
- Two sends from interleaving their `runStreamed` event loops on the
  same `Thread`.

Mirrors `ClaudeAgent._sessionSequencer`.

### 3. Provisional / materialized session split

Sessions now live in two maps:

| Map                     | Type                                 | Lifecycle              |
| ----------------------- | ------------------------------------ | ---------------------- |
| `_provisionalSessions`  | `Map<string, ICodexSession>`         | Created in `createSession`, removed on materialize or dispose |
| `_sessions`             | `DisposableMap<string, ICodexSessionEntry>` | Created on first `sendMessage` or resume, removed on dispose |

`ICodexSessionEntry` implements `IDisposable` so the `DisposableMap`
can clean up resources automatically on `clearAndDisposeAll()` /
`deleteAndDispose()`.

### 4. Session resume

When `sendMessage` arrives for a session id unknown to both maps (e.g.
after an agent-host restart), `_resumeSession(sessionId, sessionUri)`
creates a fresh in-memory entry and fires `onDidMaterializeSession`.
The codex SDK's `resumeThread(id)` re-attaches to the existing on-disk
JSONL, so the conversation continues without loss. Mirrors Claude's
`_resumeSession`.

### 5. `getSessionMetadata` (optional IAgent method)

Implemented for both provisional and materialized sessions. Returns
model, workingDirectory, and timestamps. Claude's metadata store is
not needed yet because codex's model and cwd are already in the
session state.

### 6. Model info enrichment

`toAgentModelInfo` now extracts `policyState` and billing `multiplier`
from the CAPI model payload, matching Claude's implementation. This
surfaces policy badges and cost indicators in the model picker.

### 7. Steering message support (`setPendingMessages`)

`setPendingMessages` now buffers the steering message's text. On the
next `sendMessage`, the buffered steering prompt is prepended to the
resolved user prompt. The Codex SDK has no mid-turn injection mechanism,
so this is the best-effort equivalent of Claude's `injectSteering`.

Queued messages are intentionally ignored (consumed server-side).

### 8. Proper dispose cleanup

`shutdown()` and `dispose()` now use `DisposableMap.clearAndDisposeAll()`
and also clean up provisional sessions. `disposeSession` uses
`deleteAndDispose` so the entry's abort controller fires.

## What's still deferred

See [phase-deferred.md](./phase-deferred.md):

- `listSessions()` / `getSessionMessages()` — SDK has no API.
- `canUseTool` / interactive approvals — SDK has no per-call callback.
- Customizations / MCP — significant bridging work.
- Fork — SDK has no truncation support.
- Subagents — no SDK equivalent.
