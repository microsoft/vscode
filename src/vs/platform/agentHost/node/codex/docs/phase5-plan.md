# Codex Phase 5 — Session lifecycle ✅ (done)

Implement `createSession` / `disposeSession` / `abortSession` /
`shutdown` for `CodexAgent`. `listSessions` and `getSessionMessages`
are stubbed and tracked for [Phase 8](./phase-deferred.md).

## What landed

- **In-memory session table** keyed by raw session id (path part of
  the `codex:/…` URI). Each entry stores:
  - `sessionUri`, `workingDirectory`
  - `thread: Thread | undefined` — the codex SDK wrapper, lazily
    created in `sendMessage` (provisional model — see
    [phase6-plan.md](./phase6-plan.md#provisional-sessions)).
  - `model`, `approvalPolicy`, `sandboxMode` — live values applied on
    every turn (see [phase6-plan.md](./phase6-plan.md#live-config-readback)).
  - `threadOptionsKey` — model/effort/approval/sandbox digest used to
    detect option drift between turns.
  - `abortController` — single source of cancellation per session.

- **`createSession`** — non-fork path:
  - Provisional: returns `{ session, provisional: true,
    workingDirectory }` without spawning the codex CLI, contacting
    CAPI, or writing anything to disk. Idempotent — a duplicate call
    for the same URI returns the same record.
  - Fork: throws. Fork support requires translating turn-id to codex
    JSONL byte offset, which the SDK doesn't expose. Deferred.

- **`disposeSession(session)`** — aborts the controller and removes
  the entry from the map. We do not delete the on-disk JSONL under
  `~/.codex/sessions/` because:
  1. The codex SDK has no delete API.
  2. The user may have other codex clients (the standalone TUI, other
     editors) referencing those transcripts.

- **`abortSession(session)`** — fires the controller's `abort()`. The
  signal is wired into the active `runStreamed({ signal })` call.

- **`shutdown()`** — aborts every session's controller, clears the
  table. Memoised so re-entrant calls share a single drain pass.

- **`dispose()`** — calls `super.dispose()` (which fires the
  internal emitters' `onWillDispose`), then drops the proxy handle.

## What's stubbed out

- **`listSessions()`** — returns `[]`. The codex SDK has no list API
  and the on-disk JSONL format is private. See
  [phase-deferred.md](./phase-deferred.md#listsessions--getsessionmessages).
- **`getSessionMessages(session)`** — returns `[]`. Same rationale.
  Result: when the user reloads the agent host with an existing codex
  session URI in workbench state, the session appears empty in the
  history view until the next message is sent.

## Why the in-memory table doesn't survive agent-host restarts

The codex SDK already persists threads to `~/.codex/sessions/…` and the
agent host wraps that with a thin in-memory entry. A reload of the
agent host drops the wrapper map; any subsequent `sendMessage` for a
session id that exists on disk would fail today with `"Codex session
not found"` because we don't reconstruct provisional entries from disk
on demand.

Mitigations:
1. The workbench's session list won't include sessions whose wrapper
   has been GC'd (because `listSessions()` is stubbed).
2. If a user navigates to a saved-session URI manually, the agent
   surfaces an error rather than silently dropping the message.

A full fix needs Phase 8 (transcript replay) so we can rebuild the
record from disk when `sendMessage` arrives for an unknown id. That
mirrors how Claude's `ClaudeAgent._resumeSession` works.

## Phase 5 completion (Phase 8 batch)

The following Phase 5 completions shipped as part of the Phase 8
session-hardening batch:

- **Proper provisional / materialized session split.** Sessions now live
  in `_provisionalSessions` (plain `Map`) until the first `sendMessage`
  materializes them into `_sessions` (`DisposableMap<string,
  ICodexSessionEntry>`). The `ICodexSessionEntry` wrapper is disposable
  so the `DisposableMap` can clean up resources automatically.

- **Session sequencer.** `sendMessage` calls are serialized per session
  via `SequencerByKey<string>`, preventing concurrent materialize +
  send races. Mirrors Claude's `_sessionSequencer`.

- **Session resume.** When `sendMessage` arrives for a session id
  unknown to both maps (e.g. after agent-host restart), `_resumeSession`
  creates a fresh in-memory entry and fires `onDidMaterializeSession`.
  The codex SDK's `resumeThread(id)` re-attaches to the on-disk JSONL,
  so the conversation continues without loss.

- **`getSessionMetadata` (optional IAgent method).** Returns metadata
  for both provisional and materialized sessions, including model and
  workingDirectory.

- **`listSessions()` and `getSessionMessages(session)`** remain stubbed
  (`[]`) because the codex SDK exposes no enumeration or transcript-read
  API. See [phase-deferred.md](./phase-deferred.md).
