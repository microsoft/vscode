# Codex App-Server Harness — Implementation Roadmap

**Branch:** `gcianci/codex-app-server-harness` (off `origin/main` @ `8748be1f1a8`)
**Target location:** `src/vs/platform/agentHost/node/codex/`
**Reference model:** Claude harness at `src/vs/platform/agentHost/node/claude/`
**Protocol:** `codex app-server` JSON-RPC 2.0 over stdio. **Not** `codex exec`, **not** `@openai/codex-sdk`.
**Protocol docs:** <https://developers.openai.com/codex/app-server>
**Context docs:** [HARNESSES.md](codebase/HARNESSES.md), [ARCHITECTURE.md](codebase/ARCHITECTURE.md), [STRUCTURE.md](codebase/STRUCTURE.md), [CONVENTIONS.md](codebase/CONVENTIONS.md), `/Users/gcianci/workspace/codex-acp-harness-context.md`

---

## Locked architectural decisions

| # | Decision | Rationale snapshot |
|---|---|---|
| 1 | **Binary distribution: user-installed.** `chat.agentHost.codexAgent.path` is mandatory. No bundling in v1. | Dev mode; bundling is a separate decision later. |
| 2 | **Type vendoring: local codegen, committed.** `codex app-server generate-ts --experimental`. Header records `codex --version`. Version pinned in `build/codex/codex-version.txt`. | Single source of truth between binary and types. Avoids upstream-CI drift. |
| 3 | **Process model: one shared `codex app-server` per agent-host-process lifetime.** Threads multiplexed over one JSON-RPC connection. | Matches the protocol's subscription/idle-grace design and the official Codex VS Code extension. ~150 MB once, not N×. |
| 4 | **Auth-rotation handling: token passthrough on proxy.** Proxy holds current Copilot token by ref, injects at request time. Codex sees a stable apiKey (the proxy nonce) and is never restarted on rotation. | Invisible to user; no mid-turn disruption. |
| 5 | **Prewarming: deferred to Phase 6.** | Architectural enabler is free with shared process; the actual map/TTL/republish logic is polish. |
| 6 | **Spawn timing: lazy.** First `listSessions` or `createSession` triggers spawn. No idle shutdown. | Symmetric with other lazy choices. ~100 ms one-time cold start. |
| 7 | **Session id == codex threadId.** `createSession` blocks ~100 ms on `thread/start`. No provisional state. | Trivial round-trip with disk, `ahpx`, restored sessions. |
| 8 | **Restore: lazy `thread/resume` on first `sendMessage`.** `thread/read` only at restore time. | Browsing 20 restored sessions doesn't load 20 threads into codex memory. |
| 9 | **Permissions:** per-session approval chip only; no global setting. Approval requests go through tool-call lifecycle (`SessionToolCallPendingConfirmation` → `respondToPermissionRequest`). Structured questions go through input-request (`SessionInputRequested` → `respondToUserInputRequest`). | Mirrors Claude. |
| 10 | **Cwd model:** reject `createSession` without `workingDirectory`. Cwd immutable per session. **No worktree isolation in v1** (Phase 7+ if wanted). Register `IAgentHostSessionWorkingDirectoryResolver` for the codex resource scheme. | Codex requires a real cwd for sandbox; worktree machinery is a Copilot-specific multi-day port. |
| 11 | **Workbench settings:** `chat.agentHost.codexAgent.path`, `chat.agentHost.codexAgent.codexHome`, `chat.agentHost.codexAgent.binaryArgs`. Per-session knobs (sandbox, approval, webSearch, additional dirs, network, reasoning effort) come via the dynamic config schema in Phase 5. | Tight surface; per-session config lives in `resolveSessionConfig`. |
| 12 | **Models:** reuse Copilot model list filtered to `gpt-5*` / `codex*`. Refresh on first need + token rotation. Per-model `supportedEfforts` drives the reasoning-effort chip. | One source of truth (CAPI); same model entries codex would see. |
| 13 | **Session-type picker: register in both.** Agents window auto-derives from `rootState.agents` (free). Add `sessions.chat.codexAgent.enabled` + `CodexSessionType` to `CopilotChatSessionsProvider` in Phase 6 so codex appears in the chat-window picker too. | Parity with Claude. |
| 14 | **Tool-call fidelity: Level 2.** Generic in Phase 2; dedicated cards (shell / file edit / web fetch / search) in Phase 6. **Plan/diff streaming integration with editing session is out of scope.** | Match user value to effort. |
| 15 | **Cancellation:** `turn/interrupt`, no process kill. Keep streamed content; turn transitions to `cancelled`. No client-side timeout — wait for codex's response indefinitely. Late-arriving `turn/completed` wins. | Simple, predictable. |
| 16 | **Steering:** implement `setPendingMessages` → `turn/steer { threadId, input, expectedTurnId }` with full input list. On `expectedTurnId` mismatch, no-op (framework requeues via normal `sendMessage`). | Phase 2 essential — primary mid-turn UX. |
| 17 | **Attachments (Phase 2):** text/file mentions inlined as paths; embedded images → temp file + `{ type: "localImage", path }`; `Simple` attachments → append `modelRepresentation` to prompt. Skills/app mentions deferred. Resurrect `codexPromptResolver.ts` as the seam. | Covers the common chat input cases. |
| 18 | **Auth:** `account/login/start { type: "apiKey", apiKey: <proxy-nonce> }` once after `initialize`. No codex-specific auth UI. ChatGPT login flows, rate-limit displays, plan-tier surfacing — all skipped. | Proxy intercepts everything; codex thinks it's an API-key client. |
| 19 | **Tests:** unit tests with fake JSON-RPC peer in CI. Real-binary integration tests written but env-gated (`CODEX_INTEGRATION_TEST=1`), opt-in for dev. No snapshot tests on generated types (the committed files are the snapshot). | Stable CI without codex installed; real-binary coverage when needed. |

---

## Process & ownership model (consequence of decisions 3 + 4 + 6)

- **`CodexAgent`** (`IAgent` impl) owns:
  - One `CodexAppServerClient` (the JSON-RPC client over stdio).
  - One `ICodexProxyHandle` from `CodexProxyService`.
  - One `Map<threadId, CodexAgentSession>`.
  - One `models` observable.
  - A small connection-state machine (`uninitialized` → `initializing` → `ready` → `disconnected`).
- **`CodexAgentSession`** holds:
  - `threadId` (== our session URI id).
  - `workingDirectory`, `model`, current `turnId`, abort handling.
  - **Does NOT own a process or proxy handle.**
- **Notifications** are routed by `params.threadId` into the right `CodexAgentSession`. Unknown threadId → log + drop.
- **Fatal recovery**: on process exit or transport error, mark every session disconnected, surface one `SessionError` per session, respawn, re-`initialize`, `account/login/start` again, `thread/resume` each open thread.
- **Auth rotation**: caught by `CodexProxyService`'s "current token" cell. Codex isn't restarted.

---

## Phase 1 — Infrastructure: CAPI proxy + protocol types + JSON-RPC client

**Goal.** Plumbing only. Compiles green. No `IAgent` wiring yet. Doesn't change runtime behavior for anyone.

**Deliverables.**

1. **`codexProxyService.ts`** — port from `origin/codex-agent-host` (~457 LoC). Adapt to **token passthrough**: instead of `start(token)`, expose `start()` returning `{ baseUrl, nonce }` and a separate `setToken(token: string)` that the proxy stores in a cell and reads on each request. The Copilot api service drives `setToken` calls on rotation. Refcounted handle remains.
2. **`protocol/generated/{ClientRequest,ClientNotification,ServerRequest,ServerNotification,types}.ts`** — vendored via `codex app-server generate-ts --experimental`. Header in each file:
   ```
   // AUTOGENERATED — do not edit.
   // Source: codex app-server generate-ts --experimental
   // codex --version: <pinned version>
   // Regenerate: npm run codex:gen-protocol
   ```
3. **`build/codex/generate-protocol.mjs`** + **`build/codex/codex-version.txt`** + **`package.json`** script `codex:gen-protocol`. Resolution order: `$CODEX_BIN` → `chat.agentHost.codexAgent.path` from `.codex-dev.json` → `which codex`. Fails loudly on version mismatch (override: `--no-version-check`).
4. **`codexAppServerClient.ts`** — ~250 LoC. Generic JSON-RPC over a `Duplex` pair: NDJSON, no `jsonrpc` field on wire, integer id counter, `request<M>` / `notify<M>` / `onNotification<M>` / `onRequest<M>`, `-32601` on unknown server-request methods, 2 s grace force-kill after `stdin.end()`. Typed by the generated protocol files.
5. **Tests** under `src/vs/platform/agentHost/test/node/codex/`:
   - `codexAppServerClient.test.ts` — fake peer over a pair of `Duplex` streams. Covers request/response roundtrip, server→client notifications and requests, unknown method → `-32601`, process exit rejects outstanding requests, 2 s grace kill.
   - `codexProxyService.test.ts` — port from old branch, add tests for `setToken` rotation behavior.

**Settings introduced.**
- `chat.agentHost.codexAgent.path` *(string)* — absolute path to `codex` binary. Required.
- `chat.agentHost.codexAgent.codexHome` *(string)* — overrides `$CODEX_HOME`. Optional.
- `chat.agentHost.codexAgent.binaryArgs` *(string[])* — extra args to `codex app-server`. Optional.

All three registered in the settings contribution file added in `f3831aeef7d`. Forwarded as env vars by the agent host starters: `VSCODE_AGENT_HOST_CODEX_APP_SERVER_PATH`, `CODEX_HOME`, `VSCODE_AGENT_HOST_CODEX_APP_SERVER_ARGS`.

**Exit criteria.**
- `npm run compile-check-ts-native` clean.
- Unit tests pass.
- No file modified outside `src/vs/platform/agentHost/node/codex/`, `src/vs/platform/agentHost/test/node/codex/`, `build/codex/`, and the settings contribution file.

**Decision lock-ins this phase records.** Decisions 1, 2, 4, 11, 19.

---

## Phase 2 — Minimal `CodexAgent` implementing `IAgent`

**Goal.** End-to-end smoke. Open Agents window, click "New Codex session", send "what is 2*2", get the reply back via CAPI proxy → app-server → CAPI. Steering works. No replay, no permissions, no chips, no fancy tool cards.

**Deliverables.**

1. **`codexAgent.ts`** — `IAgent` impl. Methods:
   - `createSession` — lazy-spawn if not running. Acquire proxy handle, spawn `codex app-server` child with env (`CODEX_HOME`, app-server args), set the **current token** on proxy from `ICopilotApiService`. Send `initialize { capabilities: { experimentalApi: true } }` → `initialized` notification → `account/login/start { type: "apiKey", apiKey: nonce }` → `thread/start`. Block until `thread/started` arrives; mint session URI from the threadId. `provisional: false`.
   - `sendMessage` — `turn/start { threadId, input: [translated attachments] }`. Stream notifications.
   - `setPendingMessages` — translate `steeringMessage` to `turn/steer`. Ignore `queuedMessages` (framework handles).
   - `abortSession` — `turn/interrupt`.
   - `disposeSession` — `thread/unsubscribe`. Drop the `CodexAgentSession` from the map. Process stays alive.
   - `getSessionMessages` — returns `[]` (Phase 3 implements).
   - `listSessions` — returns `[]` (Phase 3 implements).
   - `getDescriptor` — provider id `codex`, displayName "Codex".
   - `models` — bound to `ICopilotApiService.models`, filtered (`gpt-5*` / `codex*`). Phase 5 fills in `supportedEfforts`.
   - `changeModel` — store new model; next `turn/start` uses it.
   - `respondToPermissionRequest` / `respondToUserInputRequest` — pass-through stubs (Phase 4 wires).
   - `getProtectedResources` — declare CAPI requirement (mirror Claude's CCA resource).

2. **`codexAgentSession.ts`** — per-session state (threadId, working directory, model, in-flight turn, AbortController).

3. **`codexMapAppServerEvents.ts`** — minimal mapping (Level 1):
   - `turn/started` → `SessionTurnStarted`
   - `item/started` (agentMessage) → seed `MarkdownResponsePart`
   - `item/agentMessage/delta` → `SessionDelta`
   - `item/completed` (agentMessage) → finalize part
   - `turn/completed` → `SessionTurnComplete` (or `SessionError` + complete if `status: failed`)
   - `thread/closed` → log only
   - Anything else: log + drop

4. **`codexPromptResolver.ts`** — translate `prompt` + `MessageAttachment[]` to codex `input[]`:
   - Text attachments / `Simple` with `modelRepresentation` → append to text item.
   - `Resource` with file URI → inline path mention in text item.
   - `EmbeddedResource` image → write to temp file, push `{ type: "localImage", path }`.
   - Everything else: skip with warning.

5. **Fatal recovery** (inlined in `codexAgent.ts`): on process exit / transport error, fire one `SessionError` per known session, mark them disconnected, respawn + reinitialize + `thread/resume` each.

6. **Workbench-side resolver registration.** `IAgentHostSessionWorkingDirectoryResolver.registerResolver('agent-host-codex', ...)` in the local agent host contribution, mirroring the Claude block.

7. **Register `CodexAgent`** in `src/vs/platform/agentHost/node/agentHostMain.ts`, gated on `process.env[VSCODE_AGENT_HOST_CODEX_APP_SERVER_PATH]`. Slot after the Claude block.

**Tests.** `codexAgent.test.ts` with a fake `CodexAppServerClient` — assert it makes the right calls in the right order, sees deltas turn into the right SessionActions, handles `setPendingMessages` via `turn/steer`. Real-binary smoke test scaffolded under env gate.

**Out of scope this phase.** `thread/list`, `thread/read`, permission/input-request routing, reasoning parts, tool-call cards, per-session config chips, reasoning effort, prewarming, subagents.

**Exit criteria.**
- Launch Agents window with `chat.agentHost.codexAgent.path` set → "Codex" appears in the session-type picker.
- Create session, send a message, see streamed response.
- Cancel mid-turn works.
- Steer mid-turn works (type "actually do X" while turn streaming, see the agent pick it up).
- Codex process is one long-lived child; verify with `ps`.
- Disposing a session calls `thread/unsubscribe`, not process kill.

**Decision lock-ins.** Decisions 3, 6, 7, 10, 12, 14 (Level 1), 15, 16, 17, 18.

---

## Phase 3 — Resume + replay

**Goal.** Restored sessions render full transcripts. `ahpx` CLI works.

**Deliverables.**

1. **`listSessions`** → `thread/list` (paginated, default cwd filter to workspace root, cap entries). Map `Thread` → `IAgentSessionMetadata` (title from `preview`, model from `modelProvider`, working directory from `cwd`).
2. **`getSessionMessages`** → `thread/read { threadId, includeTurns: true }` → reconstruct `Turn[]` via new `codexReplayMapper.ts` (mirrors `claudeReplayMapper.ts`). Item shape from `thread/read.turns` matches live notifications; same mapping kernel can be reused.
3. **Restore path.** When `restoreSession` fires for an unknown threadId, just register a `CodexAgentSession` in our map with a `needsResume` flag. **No `thread/resume` here** — defer to first `sendMessage`. On that first send: `thread/resume { threadId, ... }`; if it returns an error (rollout missing, cwd gone), surface `SessionError` and bail. No fallback to `thread/start`.
4. **Tests.** Replay mapper against captured `thread/read` payload fixtures (capture a few from `~/.codex/sessions/` during development).

**Exit criteria.**
- Reload Agents window: previously-clicked Codex sessions render their full transcript via `thread/read`.
- Clicking a session does **not** load it into codex memory (`thread/loaded/list` confirms).
- First `sendMessage` after click triggers `thread/resume` and the turn proceeds.
- `ahpx session list --remote -u` shows codex sessions with titles + models.
- `ahpx prompt -S codex:/<uuid> "<text>"` appends to that exact session.

**Decision lock-ins.** Decision 8.

---

## Phase 4 — Permissions and interactive user input

**Goal.** Mid-turn approval and structured-question prompts route to the existing AgentService machinery.

**Deliverables.**

1. **Server-request handlers** in `CodexAgent`:
   - `item/commandExecution/requestApproval` → emit `SessionToolCallPendingConfirmation` with the existing tool-call entry's `toolCallId`. Hold the RPC `id`. On `respondToPermissionRequest` from framework, send back `{ accept | decline | acceptForSession | cancel }`. Track decisions per session for `acceptForSession`.
   - `item/fileChange/requestApproval` → same pattern, scoped to the `fileChange` tool call.
   - `item/tool/requestUserInput` → emit `SessionInputRequested` with `SessionInputRequest` payload built from `questions: [{ id, label, options?, isOther? }]`. On `respondToUserInputRequest`, send `{ answers: { [id]: { answers: [...] } } }`.
   - `serverRequest/resolved` → no-op (already handled).
2. **Tool-call registry** per session — `Map<itemId, ToolCallEntry>`. Needed to correlate approval requests with the right tool call. Mirrors `claudeToolCallRegistry.ts`.
3. **Tests** with fake peer covering the full approval/decline + accept-for-session + cancel flows for both command and file-change variants, plus structured questions.

**Out of scope this phase.** Dedicated tool-call cards (Level 2 polish in Phase 6). Approvals still surface via generic tool-call UI.

**Exit criteria.**
- Sandbox config that requires approval → user sees the permission card → approve runs the command → decline ends the tool call cleanly.
- `requestUserInput` flow shows a question card; user response routes back; turn continues.

**Decision lock-ins.** Decision 9.

---

## Phase 5 — Per-session config schema + chip UI

**Goal.** Per-session knobs exposed via the chip lane, in the same UX as Claude/Copilot CLI.

**Deliverables.**

1. **`codexSessionConfigKeys.ts`** — enum + `narrow*` helpers, ported and refined:
   - `codex.sandboxMode` (`readOnly` | `workspaceWrite` | `dangerFullAccess`)
   - `codex.approvalPolicy` (`onRequest` | `unlessTrusted` | `never`)
   - `codex.webSearchMode` (`live` | `cached` | `disabled`)
   - `codex.networkAccessEnabled` *(boolean)*
   - `codex.additionalDirectories` *(string[])*
   - `codex.modelReasoningEffort` (per model from `supportedReasoningEfforts`)
2. **`resolveSessionConfig`** returns the dynamic schema including each property's allowed values, defaults, dep-hide rules. Mirrors Claude's `resolveSessionConfig` shape.
3. **`sessionConfigCompletions`** for `additionalDirectories` (path completion via existing file-completion provider).
4. **Wire to `turn/start`**: build the codex `sandboxPolicy` / `approvalPolicy` / config object from the resolved per-session values. Per `turn/start` docs, overrides set defaults for subsequent turns.
5. **Chip lane.** Add codex's properties to `agentHostGenericConfigChips.ts` `CHIP_ORDER` with the labels and `labelStyle: 'titledValue'`. Dep-hide `additionalDirectories` + `networkAccessEnabled` unless `sandboxMode === 'workspaceWrite'`. Port the entries from the old branch.
6. **`models` observable** gains `supportedEfforts: ModelReasoningEffort[]` per entry from the Copilot model metadata (or fall back to a hardcoded map keyed on model id prefix). The reasoning-effort chip reads from the currently-selected model.

**Tests.** Schema serialization round-trip, dep-hide logic, narrowing.

**Exit criteria.**
- All six codex-specific chips render in the correct order with `titledValue` labels.
- Dep-hide works.
- Changing a chip applies on the next turn.
- Per-model reasoning effort chip shows the right options.

**Decision lock-ins.** Decisions 11 (per-session knobs), 12 (per-model efforts).

---

## Phase 6 — Polish

**Goal.** Reasoning blocks, dedicated tool cards, dual-picker registration, prewarming, telemetry.

**Deliverables.**

1. **Reasoning parts.** Map `item/reasoning/summaryTextDelta` and `item/reasoning/textDelta` to `ReasoningResponsePart`. Use `summaryIndex` boundaries to separate sections.
2. **Dedicated tool cards (Level 2).** New `codexToolDisplay.ts`:
   - `commandExecution` item → terminal tool card. Stream `item/commandExecution/outputDelta` into it.
   - `fileChange` item → file-edit card.
   - `webSearch` item → web-search card.
   - `mcpToolCall` item → generic MCP card.
   - `commandExecution` with `aggregatedOutput` on `item/completed` → final output rendered.
   - Anything else: fall through to generic.
3. **`account/read` snapshot** at startup for telemetry / debugging only. We don't surface auth state.
4. **CopilotChatSessionsProvider registration.** Add `sessions.chat.codexAgent.enabled` config (boolean, default true) and `CodexSessionType` entry in `copilotChatSessions.contribution.ts`, mirroring the Claude block.
5. **Prewarming.** Hold a small pool (1–2) of pre-`thread/start`'d threads in `CodexAgent`. Suppress their `thread/started` from sessions UI; republish when claimed. TTL ~60 s; refill after consume. Tests for: claim happy path, TTL expiry, empty-pool fallback to live `thread/start`, race between background prewarm and user-initiated session creation.
6. **Telemetry events** (gated on `chat.agentHost.otel.enabled`):
   - codex session created / completed / failed
   - codex turn started / completed / failed / interrupted
   - codex proxy handle acquired / released
   - codex process spawned / crashed / restarted
   - codex prewarm hit / miss / TTL eviction
7. **`thread/tokenUsage/updated`** → existing `SessionUsage` action for token-count UI.

**Exit criteria.**
- Reasoning collapses render correctly.
- Shell, file-edit, web-search cards render with proper UX.
- Codex appears in the chat-window session-type picker.
- New codex sessions feel instant (prewarmed).
- Telemetry events visible in OTEL output.

**Decision lock-ins.** Decisions 5, 13, 14 (Level 2).

---

## Out of scope (post-v1)

- **Worktree isolation.** Copilot's per-session git-worktree pattern. Codex sessions run against the raw workspace folder. Add later if requested.
- **Subagent support.** Claude registry/resolver/signals trio. No equivalent codex protocol surface, and not where v1 needs to invest.
- **Plan / diff editing-session integration.** `turn/plan/updated` and `turn/diff/updated` are not wired into the editing-session changeset coordinator. They're logged but don't drive UI. Doing this right is a separate body of work alongside the existing `AgentHostChangesetCoordinator`.
- **Skill mentions / app mentions on input.** `$skill-name`, `app://...` mentions. Out for v1 — codex's skill picker is its own world.
- **Steering with non-text attachments.** `turn/steer` accepts the same `input[]` schema as `turn/start`, but verify image-on-steering preserves correctly in Phase 2; fix later if needed.
- **ChatGPT login / device-code / `chatgptAuthTokens`.** All non-apikey auth modes. Proxy mode is the only mode.
- **Voice / `thread/realtime/*` notifications.** Not in the agent host's interaction model.
- **`thread/fork`, `thread/archive`, `thread/unarchive`, `thread/rollback`, `thread/compact/start`.** Surface in later phases if there's demand.
- **`process/*` API.** Experimental sandbox-bypass process control. We don't expose this; codex's own `commandExecution` is enough.
- **`fs/*` watch API.** The agent host has its own file-monitor coordinator.
- **Bundling the codex binary per-platform.** Separate distribution decision.
- **Windows-specific paths** (WSL launcher, sandbox setup).

---

## Phase dependency graph

```
Phase 1 (infra)            ──► everyone
   │
   ▼
Phase 2 (minimal harness)  ──► Phase 3 (resume) ──► Phase 4 (permissions) ──► Phase 5 (config) ──► Phase 6 (polish)
```

Each phase is one PR. Branch rebases onto current `main` between phases if needed.

---

## Open trackers

- **Protocol version pin.** Recorded in Phase 1.
- **`getProtectedResources`.** Confirm whether codex needs a distinct protected-resource declaration or reuses `GITHUB_COPILOT_PROTECTED_RESOURCE`. Decide in Phase 2.
- **Restart behavior on Copilot sign-out.** Token passthrough handles rotation; sign-out invalidates the token entirely. Phase 2: mark sessions errored, surface a single "signed out" `SessionError` per session, restart cleanly on re-auth.
- **`feedback/upload`.** Codex's feedback API. Not surfacing in v1; revisit if there's value.
