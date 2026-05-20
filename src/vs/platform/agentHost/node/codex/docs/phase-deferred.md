# Codex — deferred phases ⛔

What Claude has that Codex doesn't (yet), and why each item is
non-trivial to port. None of these block the MVP; each becomes worth
the cost once a user-facing feature genuinely needs it.

## `listSessions` / `getSessionMessages`

Status: both return `[]`.

The codex SDK has no `listSessions()` or `getSessionMessages()`
equivalent. Transcripts are persisted at
`~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-<timestamp>-<uuid>.jsonl`
in a private, undocumented format. The top-level records observed in
codex 0.132 are:

| `type`          | Notes                                                  |
| --------------- | ------------------------------------------------------ |
| `session_meta`  | One per session. Carries `id`, `cwd`, `model_provider`, `base_instructions.text`, git context, etc. |
| `turn_context`  | Per-turn. Carries `turn_id`, `cwd`, `approval_policy`, `sandbox_policy`, `permission_profile`, model. |
| `response_item` | Per logical item the model emitted. `payload.type` is the same union as the SDK's `ThreadItem` (message / command_execution / file_change / mcp_tool_call / reasoning / …). |
| `event_msg`     | Per lifecycle event. `payload.type ∈ {task_started, user_message, task_complete, …}`. |

To implement Phase 8 properly:

1. Locate the per-session JSONL by sessionId (the filename embeds the
   uuid, but we'd need to walk the `<yyyy>/<mm>/<dd>` dirs).
2. Parse each record, sort by `timestamp`.
3. Group `response_item` + matching `event_msg.user_message` into the
   protocol `Turn[]` shape used by `IAgent.getSessionMessages`.
4. Map every `response_item.payload` through `mapItemCompleted` so the
   replay action stream is byte-identical to a live turn.

The blocker is that step 3's grouping logic is heuristic — `turn_id`
on `response_item` is not always populated, and `event_msg`
boundaries don't always correlate with `turn_context` records. The
codex CLI's own resume picker uses an internal Rust struct
([`SessionMeta`](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/messages_v1.rs))
that we'd need to replicate.

**Trigger for taking this on:** users start losing conversation
history on agent host restarts in a way that affects daily use.

## Per-session metadata overlay

Status: deferred.

Claude's `ClaudeSessionMetadataStore` writes a `.session.json` sidecar
to record `customizationDirectory`, `model`, `permissionMode` —
fields that the SDK's session record doesn't carry. Codex doesn't have
this need today because:

- `model` and `cwd` are already in `session_meta`.
- `customizationDirectory` doesn't apply — see "Customizations" below.
- `approvalPolicy` and `sandboxMode` are in `turn_context` per-turn
  records.

If we ever wire customizations / per-session model picks that aren't
in the codex defaults, port the Claude store.

## Customizations / MCP / agents.md

Status: deferred.

Codex has its own customization model in `~/.codex/config.toml` plus
`~/.codex/AGENTS.md` instructions. The platform's
`IAgentPluginManager` / `CustomizationRef[]` model assumes the agent
host owns the customization directory, which clashes with codex's
filesystem ownership of `~/.codex`.

A real implementation would:

1. Render the workbench's customization set into the codex
   `[mcp_servers]` / agents.md format.
2. Inject the per-session customization directory via
   `--config <path>` overrides.
3. Reload codex on a customization toggle (codex's CLI process needs
   to be torn down between customization changes).

This is a multi-week project. The MVP just no-ops the
customization hooks — `setClientCustomizations` returns `[]` and
`setCustomizationEnabled` does nothing.

## canUseTool / interactive approvals

Status: not feasible with current codex SDK.

The codex CLI's `approval_policy` is set at thread start. The events
stream has no per-tool-call permission callback the way Claude's
`canUseTool` works. The closest analogue is `approval_policy =
'on-request'`, which makes the model self-gate without a UI hop, and
`'on-failure'`, which only asks after a tool errors.

If/when codex exposes a per-call approval event, wire it up in
`mapCodexEvent` as a `IAgentToolPendingConfirmationSignal` and
implement `respondToPermissionRequest`. Until then both methods are
no-ops, and the workbench's per-call approval UI is suppressed because
`SessionToolCallReady` is dispatched with `confirmed: NotNeeded`.

## Subagents

Status: not applicable.

Codex has no parallel-task / sub-conversation primitive equivalent to
Claude's `Task` tool. The whole `claudeSubagentRegistry.ts` /
`claudeSubagentResolver.ts` / `claudeSubagentSignals.ts` infrastructure
has no analogue here.

If multi-agent codex workflows ever land, they'll likely come through
codex's `multi_agent` feature flag (see `codex features list`), and
the mapping will look more like a separate `IAgent` provider than a
subagent of `CodexAgent`.

## Fork

Status: deferred.

`createSession({ fork })` throws. Codex SDK's `resumeThread(id)`
re-attaches to an existing thread but does not truncate it at a
specific turn. Synthesising fork-with-truncation requires:

1. Locate the on-disk JSONL.
2. Find the byte offset for the requested `turnId`.
3. Copy records up to that offset into a new file with a fresh uuid.
4. Update `session_meta.id`.
5. Call `resumeThread(newId)`.

Steps 2 and 4 depend on the JSONL format being stable, which it
isn't — `session_meta` schema changes have shipped in patch releases.
Take this on once we have transcript-replay infrastructure (Phase 8)
that already understands the file format and can ride along.

## Workbench-side polish

Status: minor.

- The "Action for unknown changeset" warning from
  `AgentHostStateManager` fires because codex sessions never register
  changesets. A future small task: have `CodexAgent` emit an empty
  changeset catalog on session materialize so the warning stops.
- Codex doesn't surface a session title — the workbench falls back to
  generating one from the first user message. If codex ever adds
  thread titles, dispatch `SessionTitleChanged` from
  `mapItemCompleted`.
