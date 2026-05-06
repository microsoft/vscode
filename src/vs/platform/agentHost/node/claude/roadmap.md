# Claude Agent in the Agent Host — Roadmap

## North star

A `ClaudeAgent` implementing `IAgent`, registered alongside the existing
`CopilotAgent`, that uses the **Claude Agent SDK** to drive Anthropic-format
tool-using sessions — but with all `messages` API traffic **proxied through a
local server** that translates Anthropic requests into calls to GitHub Copilot's
CAPI via `ICopilotApiService`. Users authenticate once with their GitHub
Copilot credentials and get Claude models without ever talking to Anthropic
directly.

## Architecture (target)

```
┌────────────────────────┐
│  Claude Agent SDK      │
│  (subprocess per agent)│
│   ANTHROPIC_BASE_URL ─►│──HTTP──┐
│   ANTHROPIC_AUTH_TOKEN │        │
│     = nonce.sessionId  │        │
└────────────────────────┘        │
                                  ▼
                  ┌──────────────────────────────────┐
                  │  IClaudeProxyService (127.0.0.1) │
                  │   /v1/messages                   │
                  │   /v1/models                     │
                  │   /v1/messages/count_tokens      │
                  │   • bearer = nonce.sessionId     │
                  │   • model ID resolution          │
                  │   • anthropic-beta filter        │
                  └──────────────────────────────────┘
                                  │
                                  ▼
                  ┌──────────────────────────────────┐
                  │  ICopilotApiService              │  ← Phase 1 ✅
                  │   token mint • CAPI • SSE        │
                  │   raw MessageStreamEvent yield   │  ← Phase 1.5
                  └──────────────────────────────────┘
                                  │
                                  ▼
                              GitHub CAPI
```

`ClaudeAgent` (Phase 4+) sits on top of the SDK and implements the same
`IAgent` surface as `CopilotAgent`, so the workbench / sessions UI doesn't
need to know whether it's talking to Copilot or Claude.

### Reference implementations (verified, with caveats)

Two extension-side files are the canonical reference for the patterns we need
to reproduce in the agent host. **Verify behavior against the file before
porting** — the council found several reference miscitations in the v1
roadmap.

- `extensions/copilot/src/extension/chatSessions/claude/node/claudeLanguageModelServer.ts`
  — proxy pattern: `127.0.0.1` ephemeral port, `nonce.sessionId` bearer auth,
  `anthropic-beta` filtering (uses `b.startsWith(supported + '-')` — see
  `filterSupportedBetas` at line 381). Uses `@anthropic-ai/sdk` types.
  **Caveat:** only routes `POST /v1/messages` (lines 106–121). `/v1/models`
  and `/v1/messages/count_tokens` are net-new work in Phase 2.
- `extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts`
  — `ClaudeCodeSession` lifecycle: per-session `Query` kept alive across turns,
  request queue with deferred-prompt async iterable, yield-restart on
  settings/tools change, MCP gateway with idle timer, restart-on-toggle for
  customizations. **Caveats:**
    - Uses `_abortController.abort()` (line 719), not `Query.interrupt()` —
      Phase 9 should mirror this. `Query.interrupt()` exists in 0.2.112 but
      is not used by the production reference.
    - Uses `mcpServers` config for HTTP-based MCP (lines 391–416) — does
      **not** use `createSdkMcpServer` + `tool()`. The in-process tool path
      lives in `extensions/copilot/src/extension/chatSessions/claude/common/mcpServers/ideMcpServer.ts`.
    - Uses `systemPrompt: { type: 'preset', preset: 'claude_code' }` (line
      478). There is **no** `tools: { type: 'preset' }` — that was a roadmap
      v1 error.
    - Pins `settingSources: ['user', 'project', 'local']` (line 482). Does
      **not** include `managed`.
- `extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeSdkService.ts`
  — wraps SDK functions including `forkSession(sessionId, options)` (top-level
  function, lines 57, 121–124), `listSubagents`, `getSubagentMessages` (lines
  60–74).
- `src/vs/platform/agentHost/node/copilot/copilotAgent.ts` — `IAgent` reference
  for capability surface and customization hooks.

---

## Phases

Each phase ships behind the previous one; each is small enough to land as one
PR and ends at a verifiable boundary (tests, a CLI smoke, or an end-to-end
manual run).

### Phase 1 — `ICopilotApiService` ✅ **DONE**

Foundational gateway to the Copilot CAPI: token mint + cache + invalidation,
`messages` (streaming + non-streaming), `models`, abort propagation, SSE body
cancellation. Lives at `node/shared/copilotApiService.ts`. Fully unit-tested
(70 tests). Council-reviewed and hardened (C1/C2/S1/S2 fixes applied).

### Phase 1.5 — Widen `ICopilotApiService` to raw Anthropic events ✅ **DONE**

Widened `messages()` from text-only deltas to the full
`Anthropic.MessageStreamEvent` stream. Replaced bespoke request/response types
with `@anthropic-ai/sdk` types. Added `countTokens()` (throws — CAPI has no
endpoint). 71 unit tests.

**`messagesText()` was planned but cut** — no downstream phase consumes it.
This is a greenfield service with no backcompat obligations; if a future caller
wants text-only streaming, it can filter `messages()` output in a few lines.

**Final interface shape:**

```typescript
interface ICopilotApiServiceRequestOptions {
    headers?: Readonly<Record<string, string>>;
    signal?: AbortSignal;
}

interface ICopilotApiService {
    messages(token: string, req: Anthropic.MessageCreateParamsStreaming,    options?: ICopilotApiServiceRequestOptions): AsyncGenerator<Anthropic.MessageStreamEvent>;
    messages(token: string, req: Anthropic.MessageCreateParamsNonStreaming, options?: ICopilotApiServiceRequestOptions): Promise<Anthropic.Message>;
    countTokens(token: string, req: Anthropic.MessageCountTokensParams, options?: ICopilotApiServiceRequestOptions): Promise<Anthropic.MessageTokensCount>;
    models(token: string, options?: ICopilotApiServiceRequestOptions): Promise<CCAModel[]>;
}
```

**Learnings from implementation:**

1. **VS Code DI constructor ordering:** `GetLeadingNonServiceArgs` strips
   `BrandedService`-decorated params from the **end** of the tuple, so
   non-service params (like `fetchFn`) must come **first** in the constructor.
   Putting them after service params causes `createInstance` to select the
   wrong overload.
2. **Signal-sharing bug in deduped async operations:** the original
   `_getCopilotToken` forwarded the caller's `AbortSignal` into the shared
   token mint promise. Because the mint is deduped across concurrent callers,
   aborting caller A's signal would cancel the mint for all callers sharing
   it. Fix: omit the signal from the mint call; each caller forwards its
   signal only to its own API request.
3. **Avoid `as unknown as` for SSE event parsing.** Instead of casting raw
   JSON to `Anthropic.MessageStreamEvent`, use a `Set` of known event type
   strings as a runtime type guard. This also cleanly separates `error` event
   handling (which should throw) from valid event types.
4. **`@vscode/copilot-api` typings:** the package's `.d.ts` files use
   extensionless relative imports incompatible with `moduleResolution:
   "nodenext"`. Ambient declarations in `src/typings/copilot-api.d.ts` are
   required until the package is fixed. Keep `any` out of those declarations
   (`unknown` instead).

**Open question (carried to Phase 2):**

- Where does **model ID translation** live? Tentatively the proxy (Phase 2),
  so `model` in `MessageCreateParams` stays an opaque string here.

### Phase 2 — `IClaudeProxyService` (local proxy) ✅ **DONE**

A local HTTP server that speaks Anthropic's `/v1/messages`, `/v1/models`, and
`/v1/messages/count_tokens` wire format on the inbound side, and
`ICopilotApiService` on the outbound side. **No `IAgent` integration in this
phase** — the deliverable is a service that any consumer can spin up, point a
Claude SDK / `curl` at, and get streamed responses out.

Reference: `claudeLanguageModelServer.ts` is the existing implementation of
the `/v1/messages` route (only). `/v1/models` and `/v1/messages/count_tokens`
are net-new.

Scope:

- `IClaudeProxyService` interface in `node/claude/claudeProxyService.ts`.
- `start()` returns a `{ port, baseUrl, nonce, dispose }` handle.
- Bind to `127.0.0.1` only, ephemeral port (`listen(0, '127.0.0.1', ...)`).
- **Auth:** per-instance random `nonce`. Bearer format
  `Authorization: Bearer <nonce>.<sessionId>`. The proxy verifies the nonce
  prefix; the `sessionId` segment lets the proxy attribute requests to a
  session. **Require the `.sessionId` segment** (no nonce-only legacy path —
  the reference allows it; we don't need to). `x-api-key` header is
  **ignored** (prevents a user's personal `ANTHROPIC_API_KEY` from
  interfering).
- **`anthropic-beta` filter:** match the reference exactly:
  `b.startsWith(supported + '-')` against the allowlist
  (`SUPPORTED_ANTHROPIC_BETAS` constant). Bare values like `interleaved-thinking`
  are **rejected** by this rule; only date-suffixed variants like
  `interleaved-thinking-2025-05-14` pass.
- **Model ID resolution:** rewrite `requestBody.model` against
  `ICopilotApiService.models()` (CCAModel list), mirroring
  `claudeLanguageModelServer.ts` → `claudeCodeModels.resolveEndpoint()`.
- Routes:
  - `POST /v1/messages` — streaming and non-streaming, request shape passed
    through to `ICopilotApiService.messages()` after model resolution. Stream
    re-emits `MessageStreamEvent`s as SSE.
  - `GET /v1/models` — pass-through to `ICopilotApiService.models()`, mapped
    to Anthropic's `/v1/models` response shape. **Net new** vs. the
    reference.
  - `POST /v1/messages/count_tokens` — pass-through to
    `ICopilotApiService.countTokens()` (or 501 if CAPI doesn't support it).
    **Net new** vs. the reference.
- **GitHub token:** held in-memory on the proxy, set via a setter the agent
  calls after `IAgent.authenticate()`. **Single-tenant token slot** — token
  changes affect all sessions sharing the proxy. Document this constraint;
  per-session tokens are a follow-up.
- Abort propagation: client disconnect → cancel the upstream
  `ICopilotApiService` call (already supports abort).
- **Lifetime:** **one proxy per `ClaudeAgent`**, shared across all sessions.

Tests:

- `/v1/messages` non-streaming → mocked `ICopilotApiService` → correct
  `Anthropic.Message` JSON.
- `/v1/messages` streaming → SSE `MessageStreamEvent`s in order, including
  `tool_use` and `thinking_delta`; `message_stop` closes the stream;
  mid-stream abort cancels upstream.
- `/v1/models` → forwards to `ICopilotApiService.models()`, returns Anthropic
  shape.
- `/v1/messages/count_tokens` → pass-through (or 501).
- Bearer enforcement: missing nonce, wrong nonce, missing `.sessionId`
  segment, `x-api-key` alone → 401 without ever touching `ICopilotApiService`.
- `anthropic-beta`: `interleaved-thinking` (bare) → stripped;
  `interleaved-thinking-2025-05-14` → forwarded.
- Model resolution: Anthropic-canonical ID → CAPI model ID rewrite.
- Bind address is `127.0.0.1` (no external interface).
- `dispose()` closes the listener and rejects in-flight requests.

Exit criteria: `curl` against the proxy with `Bearer <nonce>.test` returns the
same payload shape Anthropic would, and `ICopilotApiService` sees the right
calls.

### Phase 3 — Ground the SDK contract in the production reference ✅ **DONE**

The Copilot extension already ships a working integration of
`@anthropic-ai/claude-agent-sdk` 0.2.112 with a local proxy. That implementation
is our highest-fidelity evidence for what the SDK does and does not need; an
ad-hoc spike cannot beat a production user.

**Reference files** (read these before touching Phase 4):

- [`extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts)
  — `ClaudeCodeSession` builds the SDK `Options` and runs the message loop.
- [`extensions/copilot/src/extension/chatSessions/claude/node/claudeLanguageModelServer.ts`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeLanguageModelServer.ts)
  — `ClaudeLanguageModelServer`, the extension's analogue of our
  `ClaudeProxyService`. Implements `/v1/messages` (only), filters
  `anthropic-beta` to a whitelist (`interleaved-thinking`,
  `context-management`, `advanced-tool-use`), and intentionally ignores
  `x-api-key` to prevent personal-key leakage.
- [`extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeSdkService.ts`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeSdkService.ts)
  — DI wrapper around the SDK with lazy `import()`.

**Use the extension as a reference, not a blueprint.** It has accreted ~20
concerns (MCP gateway, plugins, edit tracker, settings change tracker, OTel
forwarding, hook events, debug file logger, ripgrep PATH munging, runtime data
caching, folder MRU, …) that are *layered on top of* the core SDK ↔ proxy
contract. Phase 4 should start with the smallest `Options` that produces a
working turn, and pull in each additional concern only when a phase actually
needs it. Adopting the full extension shape on day one would obscure which
pieces are essential and make incremental review impossible.

**SDK version:** pin `@anthropic-ai/claude-agent-sdk` at **`0.2.112`** — the
same version `extensions/copilot/package.json` ships. Versions > 0.2.112 add
native binary dependencies that require build-infra changes (see Phase 15).

#### Required for Phase 4 to function at all

These are non-negotiable: omit any of them and either the SDK errors out, the
proxy can't authenticate, the agent host has no cancellation contract, or
egress leaks. Each row cites the production reference so future readers can
see why it's required.

| `Options` field | Value (Phase 4 start) | Why required | Reference |
|---|---|---|---|
| `cwd` | session workspace folder | SDK validates and forwards to tools (Read/Write/Bash). | `claudeCodeAgent.ts` `_doStartSession` |
| `executable` | `process.execPath as 'node'` | Force the SDK to fork the agent host's node process; otherwise it tries to find its own runtime. | `claudeCodeAgent.ts` line 437 |
| `abortController` | per-session `AbortController` | The mechanism the extension actually uses to cancel a turn. `Query.interrupt()` exists but is not used in production. Phase 6 should mirror this. | `claudeCodeAgent.ts` line 138, 274, 435 |
| `allowDangerouslySkipPermissions` | `true` | Disables the SDK's built-in approval UI so we can drive permissions ourselves via `canUseTool`. The two are a *pair* — one without the other is broken. | `claudeCodeAgent.ts` line 433 |
| `canUseTool` | callback into `IClaudeToolPermissionService`-equivalent | Real per-tool permission UX. Phase 4 may stub to `{ behavior: 'allow' }` and defer the real UX to Phase 9. | `claudeCodeAgent.ts` line 463 |
| `model` | `<sdkModelId>` from session state | Required for any meaningful turn. Resolve the canonical Anthropic ID via the model registry. | `claudeCodeAgent.ts` line 442 |
| `permissionMode` | session permission mode | Required (default `'acceptEdits'` in the extension). | `claudeCodeAgent.ts` line 444 |
| `systemPrompt` | `{ type: 'preset', preset: 'claude_code' }` | Without this the SDK has no system prompt at all and behavior degrades. | `claudeCodeAgent.ts` line 482 |
| `settings.env.ANTHROPIC_BASE_URL` | `http://localhost:${proxy.port}` | Routes all CAPI traffic through our proxy. **Note:** under `settings.env`, NOT top-level `Options.env`. | `claudeCodeAgent.ts` line 454 |
| `settings.env.ANTHROPIC_AUTH_TOKEN` | `${proxy.nonce}.${sessionId}` | Per-session bearer; proxy splits at `.` to recover session id. | `claudeCodeAgent.ts` line 455 |
| `settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | `'1'` | Disables Anthropic-direct telemetry/feature flags. Required for our leak-tightness guarantees. | `claudeCodeAgent.ts` line 456 |
| `disallowedTools` | `['WebSearch']` | CAPI doesn't support WebSearch; the SDK will error if invoked. | `claudeCodeAgent.ts` line 440 |
| `stderr` | wire to `ILogService.error` | Without it, SDK errors are invisible. | `claudeCodeAgent.ts` line 487 |

#### Deferred to later phases

Each of these has a clear home; pulling them in earlier than necessary just
expands the Phase 4 surface area for no review benefit.

| Concern | Phase | Production reference |
|---|---|---|
| `settingSources` (load CLAUDE.md / hooks / agents from disk) | Phase 9 (settings/permissions UX). Phase 4 starts with `[]` for SDK isolation. | `claudeCodeAgent.ts` line 486 |
| `mcpServers` (per-session MCP gateway) | Phase 7 (tool integration) | `claudeCodeAgent.ts` line 472 |
| `plugins` (skill plugin locations) | Defer until skills are in scope | `claudeCodeAgent.ts` line 473 |
| `additionalDirectories` (multi-root) | When multi-root support is needed | `claudeCodeAgent.ts` line 432 |
| `effort` (reasoning controls) | When reasoning effort UX exists | `claudeCodeAgent.ts` line 436 |
| `resume` / `sessionId` | Phase 5 (persistence) | `claudeCodeAgent.ts` lines 446–448 |
| `includeHookEvents: true` | When hooks are exposed | `claudeCodeAgent.ts` line 471 |
| OTel env (`deriveClaudeOTelEnv`) | When OTel is wired in agent host | `claudeCodeAgent.ts` line 460 |
| Bundled ripgrep on `PATH` + `USE_BUILTIN_RIPGREP=0` | When bundled ripgrep is needed | `claudeCodeAgent.ts` lines 457–458 |
| `enableFileCheckpointing` + `Query.rewindFiles()` | Phase 8 (checkpoints). Type definitions confirm both exist in 0.2.112; the extension does not use them, so Phase 8 must validate them itself. | `sdk.d.ts` lines 1105, 1280 |
| Edit tracker, settings change tracker, runtime data cache, folder MRU, debug file logger | Workbench-side concerns; out of scope for the agent host core | `claudeCodeAgent.ts` (assorted) |

#### One genuine open question

**Byte-equivalence between our `ClaudeProxyService` and the extension's
`ClaudeLanguageModelServer`.** The extension can't answer this for us; both
proxies must produce streams the SDK accepts, but they're different
implementations and could diverge on edge cases (`input_json_delta` shape,
`message_delta.usage`, error-frame format). Closing path:

- Phase 4 lands a unit test that points the SDK (with a stubbed CAPI) at
  `ClaudeProxyService` and asserts the same `system/init → assistant →
  user(tool_result) → assistant → result` sequence the extension's tests
  assert. Lives in the repo and runs in CI.
- No throw-away spike required.

#### Notes on items the extension does differently from our Phase 2 design

These are not bugs — just places the extension and our proxy currently
diverge. Phase 4 should decide whether to converge.

- **`/v1/models`:** the extension's proxy 404s it; ours forwards to
  `ICopilotApiService.models()`. Either is fine in practice; the SDK does
  not require `/v1/models` to function. Keeping ours is harmless.
- **`/v1/messages/count_tokens`:** the extension's proxy 404s it; ours
  returns 501. The SDK does not call `count_tokens` during a normal turn,
  so neither matters in practice. If a future SDK version starts calling
  it, both proxies will need real support.
- **`anthropic-beta` whitelist:** the extension whitelists
  `interleaved-thinking`, `context-management`, `advanced-tool-use`. Our
  Phase 2 design only mentioned `interleaved-thinking`. Phase 4 should
  widen the whitelist to match.
- **`x-api-key` header:** the extension intentionally ignores it to prevent
  the user's personal Anthropic key from leaking through our proxy. Our
  Phase 2 design already enforces nonce-only auth; matching the
  "explicitly ignore" behavior is a defense-in-depth improvement.

Exit criteria: this section captures (a) the required `Options` shape for
Phase 4, (b) the deferred-concerns map for later phases, and (c) the one
remaining open question (byte-equivalence) with a concrete plan to close it
in Phase 4. No throw-away code committed.

### Phase 4 — `ClaudeAgent` skeleton implementing `IAgent`

> **Implementation contract: [phase4-plan.md](./phase4-plan.md).** That file
> is the source of truth for the Phase 4 PR — code skeleton, registration
> sites, full test list, acceptance checklist, and live-system smoke. The
> summary below stays high-level for roadmap continuity.

A registered `IAgent` whose lifecycle methods are wired but minimal. Mirror
the pattern in `node/copilot/copilotAgent.ts`.

Scope (just enough surface for the agent to be discoverable):

- **`id: AgentProvider`** — new string constant (e.g. `'claude'` or
  `'claude-code'`). `AgentProvider` is a `string` type alias
  (`agentService.ts:113`), not an enum. The provider id IS the URI scheme.
- **Session URI scheme: `<provider>:/<sessionId>`** — i.e. `claude:/<uuid>`,
  produced by `AgentSession.uri(provider, sessionId)`
  (`agentService.ts:301–305`). **No double-slash, no authority component.**
  The URI IS the identity — `AgentSession.id(uri)` extracts the SDK
  `sessionId`. No mapping table.
- `getDescriptor(): IAgentDescriptor` — only `provider`, `displayName`,
  `description`. **No capability flags exist on `IAgentDescriptor`**
  (`agentService.ts:115–120`); capabilities are expressed by *implementing
  optional methods* (`truncateSession?`, `setPendingMessages?`,
  `getCustomizations?`, etc.). This is how the workbench discovers what an
  agent supports.
- `getProtectedResources()` — same github.com resource the Copilot agent
  declares.
- `authenticate(resource, token)` — store the GitHub token, push it into the
  proxy's GitHub-token slot.
- **Lazily acquire `IClaudeProxyService` handle inside `authenticate()`** (not
  in the constructor). `IClaudeProxyService.start()` requires a non-empty
  github token (`claudeProxyService.ts:61`), so eager construction is
  impossible. The handle is refcounted; one outstanding handle per agent is
  the right shared-proxy pattern. See [phase4-plan.md](./phase4-plan.md) §3.3
  for the acquire-then-dispose-old ordering.
- **Strip `ANTHROPIC_API_KEY`** from any spawned SDK subprocess env.
- `models` observable — derived from `ICopilotApiService.models()`, filtered
  to Claude-family models.
- Stub ALL remaining required `IAgent` methods with `throw new Error('TODO: Phase N')`:
  `createSession`, `sendMessage` (including `attachments` and `turnId` params —
  see Phase 6), `disposeSession`, `abortSession`, `getSessionMessages`,
  `listSessions`, `resolveSessionConfig`, `sessionConfigCompletions`,
  `changeModel`, `respondToUserInputRequest`, `respondToPermissionRequest`,
  `setClientTools`, `setClientCustomizations`, `onClientToolCallComplete`,
  `setCustomizationEnabled`, `shutdown`, **`dispose()`** (provider-level teardown
  — not to be confused with `disposeSession`).
- Wire the **`onDidSessionProgress`** event emitter (`Emitter<AgentSessionProgress>`)
  in the constructor and expose it as the required event property. The emitter
  will be fired in Phase 6; it must exist here so `IAgent` compiles.
- The `ClaudeAgent` class must compile against `IAgent` with all required
  methods present. Optional methods (`truncateSession?`, `getCustomizations?`,
  etc.) can be omitted at this stage.

Tests: agent registers, descriptor surfaces, `models` observable populates,
`authenticate` persists the token and pushes it to the proxy, URI helpers
round-trip correctly.

Exit criteria: a workbench client sees the Claude provider listed, can pick
a Claude model, but can't yet send a message.

### Phase 5 — Session lifecycle: create / dispose / list / shutdown

Implement the lifecycle methods that don't require live LLM traffic.

- `createSession(config)` — allocate a fresh UUID `sessionId`, construct the
  URI via `AgentSession.uri(this.id, sessionId)`, construct a
  `ClaudeAgentSession` (new file `node/claude/claudeAgentSession.ts`).
  Persist minimal session metadata via `ISessionDataService`. Do **not**
  start the SDK yet — that happens lazily on first `sendMessage`.
- **Honor `IAgentCreateSessionConfig.fork`**
  (`agentService.ts:161–173`): when `config.fork` is set, route through the
  SDK's `forkSession(sourceSessionId, options)` (top-level SDK function from
  `claudeCodeSdkService.ts:57, 121–124`) to mint a new session ID, build the
  URI from the new ID, and persist the `turnIdMapping`.
- `disposeSession(session)` — tear down the session's `Query` (if alive),
  MCP gateway, in-flight aborts.
- `listSessions()` — `IAgent.listSessions()` returns
  `Promise<IAgentSessionMetadata[]>` (`agentService.ts:394`). Call SDK
  `listSessions()` with `dir` undefined (across all projects), map each
  `SDKSessionInfo` → `IAgentSessionMetadata`.
- `getSessionMessages(session)` — empty stub for now; full implementation
  in Phase 13.
- `resolveSessionConfig` / `sessionConfigCompletions` — schema for
  Claude-specific session knobs (model, working directory).
- **`shutdown()`** — gracefully close every active `Query`, dispose the
  proxy, drain in-flight requests.

**Read-through cache for the transcript** lands here as a seam:

- `IClaudeSessionTranscriptStore` interface — `getTranscript(sessionId)`
  returns parsed `SessionMessage[]`, keyed on `(sessionId, lastMessageUuid,
  fileLastModified)`.
- Default impl wraps `getSessionMessages` from the SDK.
- Future hybrid impl (using `sessionStore` once it exits alpha) can be
  swapped in without touching `ClaudeAgentSession`.

Tests: create a session, list it (including externally-created), get its
(empty) messages, dispose it, verify it's gone from `listSessions`. Fork
via `createSession({ fork })` produces a new URI with the right
`turnIdMapping`. `shutdown()` is idempotent and cancels in-flight work.

Exit criteria: sessions can be created (including via fork) and persisted;
restarts find them; externally-created Claude Code sessions appear; agent
host can shut down cleanly.

### Phase 6 — `sendMessage` + streaming progress events (single-turn, no tools)

Wire the proxy + SDK from Phase 3 into a real session. **Port the lifecycle
machinery from `claudeCodeAgent.ts`:**

- Per-session `Query` kept alive across turns (streaming-input mode:
  `prompt: AsyncIterable<SDKUserMessage>`).
- Lazy start: first `sendMessage` calls `_startSession`, which invokes
  `query()` with either `sessionId` (new) or `resume: sessionId` (restored).
- Request queue (`_queuedRequests`) — protocol's single-threaded session
  contract enforced by serialization.
- Pending-prompt deferred — the async iterable awaits `_pendingPrompt`;
  `sendMessage` resolves it to feed the next prompt.
- `_isResumed` flag flips on first SDK message, so subsequent restarts use
  `resume`.
- **`sendMessage` attachments and `turnId`:** `IAgent.sendMessage` takes
  `attachments?: IAgentAttachment[]` and `turnId?: string`
  (`agentService.ts:351`). Initial implementation converts attachments to
  `SDKUserMessage` content arrays (file content as text blocks, selections
  as text), and passes `turnId` through to the request queue for transcript
  association. Mirror how `copilotAgent.ts:730` handles this.
- Map SDK events → `AgentSignal`s on `onDidSessionProgress`, mirroring
  `mapSessionEvents.ts` in the Copilot folder.

SDK options pinned in this phase (matching the reference):

- **`settingSources: ['user', 'project', 'local']`** — match
  `claudeCodeAgent.ts:482`. Excludes `managed` (intentional in the
  reference).
- **`allowDangerouslySkipPermissions: true`** — **required** (`claudeCodeAgent.ts:434`).
  The agent host owns all permission decisions via `canUseTool`; without this
  flag the SDK adds a second internal permission gate that overrides
  `permissionMode`. Omitting it silently breaks all tool calls.
- **`executable: process.execPath as 'node'`** — **required** (`claudeCodeAgent.ts:437`).
  Tells the SDK which Node binary to use when forking its subprocess.
  Without it the SDK must locate Node on its own, which is undefined inside
  the utility process.
- **`disallowedTools: ['WebSearch']`** — **required** (`claudeCodeAgent.ts:438–440`).
  CAPI does not yet support the WebSearch tool. Without this the SDK may
  invoke it and the upstream CAPI call will fail mid-session.
- **`abortController: this._abortController`** — wire the abort controller
  at query creation time (`claudeCodeAgent.ts:435`). Phase 9 calls
  `_abortController.abort()` on this reference; the field must exist at
  construction time or Phase 9 has no handle to cancel in-flight work.
- **`includeHookEvents: true`** — **required** (`claudeCodeAgent.ts:449`).
  Without it the SDK subprocess does not emit hook events in the output stream.
  Phase 11 customization-hooks wiring depends on receiving these events.
- `spawnClaudeCodeProcess`: **not overridden** (Agent Host is the isolation
  boundary).
- `enableFileCheckpointing: true` — type definitions confirm it exists in
  0.2.112 (`sdk.d.ts:1105`). The production reference does not use it, so
  Phase 8 must validate the actual checkpointing/rewind behavior before
  committing to it. If it doesn't behave as advertised, fall back to the
  in-agent edit-history mechanism described in Phase 8.
- **`systemPrompt: { type: 'preset', preset: 'claude_code' }`** — match
  `claudeCodeAgent.ts:478`. **Not** `tools: { type: 'preset' }` (that was a
  v1 roadmap error).
- `tools`: omit (default Claude Code toolset). Restrict only when client
  asks via Phase 10 client-tools or Phase 11 customizations.
- `cwd`: from session config.
- **`env`** (matching reference `claudeCodeAgent.ts:454–460`):
  - `ANTHROPIC_BASE_URL=<proxy>`
  - `ANTHROPIC_AUTH_TOKEN=<nonce>.<sessionId>`
  - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` — **prevents telemetry
    leakage to Anthropic**.
  - `USE_BUILTIN_RIPGREP=0` + bundled ripgrep prepended to `PATH` — tool
    execution depends on this.
  - Forward OTel env (`OTEL_*`) for observability.
  - **Strip `ANTHROPIC_API_KEY`** from the inherited env.
- `model`: resolved from session config / current model selection.
- `permissionMode`: `acceptEdits` default; client can override.

**Stderr handling** — log SDK stderr at trace level by default; surface to
client only on subprocess crash.

Defer: tool calls (Phase 7), file edit tracking (Phase 8), abort/steering
(Phase 9), client tools (Phase 10), customizations (Phase 11), subagents
(Phase 12), restoration/truncate (Phase 13).

Tests: integration test with a stubbed `ICopilotApiService` returning a
canned Anthropic stream → verify the resulting `AgentSignal` sequence.

Exit criteria: a workbench client sends "hi" and sees a streamed assistant
response in the UI.

### Phase 7 — Tool calls + permission + user input

Wire the SDK's tool-use loop through to the agent host's tool infrastructure.
**Transcript-only in this phase** — file edit tracking is Phase 8.

- Map Claude's tool-use events → `AgentSignal` tool-call request parts.
- Map tool-result events → tool-result response parts.
- **`respondToPermissionRequest`** — gate tool execution like the Copilot
  agent does. Wire through SDK's permission callback / `canUseTool`.
- **`respondToUserInputRequest`** (`agentService.ts:384–385`) — handle the
  SDK's user-input / `ask_user` flow. Forward client-provided answers back
  to the SDK.
- Mirror per-tool annotations (`Read`, `Write`, `Edit`, `Bash`, etc.) so
  the client can render them.

Tests: a session that asks for `Read`, gets prompted, approves, sees the
tool output streamed back. A session that triggers an `ask_user` request,
client responds, SDK continues.

Exit criteria: a real "read this file" prompt completes end-to-end.

### Phase 8 — File edit tracking

Build the Claude analog of `fileEditTracker.ts` from `node/copilot/`.

- Track every file read/write/edit emitted by the SDK as a tool-use event.
- Expose tracked files via `resourceRead` / `resourceWrite` URIs so the
  client can render diffs, accept/reject per-file, and undo.
- Per-file undo: client-driven, **not** part of `truncateSession`.
- **Undo mechanism:**
  - **Preferred:** `enableFileCheckpointing` + `Query.rewindFiles()` (both
    exist in 0.2.112 per `sdk.d.ts:1105, 1280`). Surface stays per-file —
    the SDK rewinds all tracked files; we apply that selectively to honor
    per-file accept/reject.
  - **Fallback if rewind misbehaves:** record file-edit history in the
    agent itself and restore via direct file writes. The production
    reference does not exercise SDK rewind, so Phase 8 owns the
    validation step.
- **Known gap:** Bash-tool edits (`sed -i`, `cat > file`) aren't tracked by
  the SDK. Document; consider a file-watcher diff fallback in a follow-up.

Tests: a session that edits two files, exposes both via `resourceWrite`,
client-side accept of one and reject of the other behaves correctly.

Exit criteria: file diffs render in the workbench; per-file accept/reject
works.

### Phase 9 — Abort + steering + model change + shutdown polish

- **`abortSession`** — cancel the underlying SDK turn via
  `_abortController.abort()`, matching the production reference. Phase 9
  may experiment with `Query.interrupt()` if the abort path turns out to
  orphan the subprocess, but the default plan is the AbortController route
  the extension already proves works. Propagates through SDK → proxy →
  `ICopilotApiService`.
- **Steering / `setPendingMessages`** — use `Query.streamInput()` to push
  additional `SDKUserMessage`s mid-turn.
- `changeModel` — `Query.setModel()` on the live `Query`. Resolve the new
  model ID through the proxy's resolver first.
- `setPermissionMode` (internal SDK concern, not a protocol method) —
  `Query.setPermissionMode()` on the live `Query`. Permission mode changes
  are driven by SDK events (`EnterPlanMode`/`ExitPlanMode` tools), not
  by direct `IAgent` method calls. Wire accordingly
  (see `claudeCodeAgent.ts:174–181` for the reference).
- **Yield-restart** mechanism (port from `claudeCodeAgent.ts`): when
  settings files change or tool set changes mid-turn, drain the current
  generator and restart via `resume: sessionId`.
- **Subprocess crash recovery** — if the SDK subprocess dies mid-turn,
  surface to the client as a turn error and mark the session ready for a
  fresh `_startSession` on the next `sendMessage`.

Tests: abort mid-stream releases the proxy's HTTP connection, steering lands
in the next turn, model swap takes effect, killed subprocess triggers
recovery.

Exit criteria: parity with Copilot agent on stop / steer / switch model.

### Phase 10 — Client-provided tools (in-process MCP)

- `setClientTools(session, clientId, tools)` — convert the protocol's
  `ToolDefinition[]` into SDK MCP tool definitions via SDK's `tool(name,
  description, zodSchema, handler)`, wrap in `createSdkMcpServer`, pass via
  `options.mcpServers` on the next `query()` call.
- Reference for the MCP-tool path: `extensions/copilot/src/extension/chatSessions/claude/common/mcpServers/ideMcpServer.ts`
  (uses `tool()` / `createSdkMcpServer`). **Not** `claudeCodeAgent.ts`.
- The handler is a deferred promise that the host resolves when
  `onClientToolCallComplete` delivers the result.
- **Per-query MCP server recreation** — recreate from current tool list on
  each `_startSession` / yield-restart. Tools changing between turns
  triggers a yield-restart (mirror `_toolsMatch` from `claudeCodeAgent.ts`).
- **MCP gateway lifecycle** — port the `_gateway` + `_gatewayIdleTimeout`
  pattern: gateway disposed after N seconds of idle to release resources.

Tests: a client registers a custom tool, the agent invokes it via a Claude
prompt, result returns to the client and is fed back into the SDK.

Exit criteria: client tools callable from a Claude session.

**Open questions for this phase:**
- ZodSchema generation from the protocol's JSON Schema
  `ToolDefinition.inputSchema` — use a converter library or hand-roll?
  Check what `ideMcpServer.ts` does.
- Idle timeout for the MCP gateway — sensible default?

### Phase 11 — Customizations / plugins (full surface)

**Inbound (host → SDK):**

- `setClientCustomizations(clientId, customizations, progress?)` — call
  `agentPluginManager.syncCustomizations` to download `CustomizationRef[]`
  to local dirs, get back `ISyncedCustomization[]` with local paths.
  Forward incremental results via the `progress` callback
  (`agentService.ts:439`) for progressive loading UI.
- Pass the local paths as `options.plugins: [{ type: 'local', path }, ...]`
  on the next `query()` call.
- **Restart-on-toggle** flag (`_pendingRestart` from `claudeCodeAgent.ts`):
  customization toggles mark the session for restart before the next
  `sendMessage`.
- `setCustomizationEnabled(uri, enabled)` — flips the flag.

**Outbound (SDK → host) — required for Copilot parity
(`agentService.ts:399–417`):**

- `onDidCustomizationsChange` event.
- `getCustomizations()` — return host-known customizations (synced + active).
- `getSessionCustomizations(session)` — per-session active list.
- See `copilotAgent.ts:190–205, 232–240` for the wiring pattern.

Tests: client provides a customization → agent syncs it → next `query()`
includes the local path → SDK init message confirms the plugin loaded;
customization toggle triggers restart; published events fire correctly.

Exit criteria: customization round-trip works; workbench renders Claude
customizations like Copilot's.

### Phase 12 — Subagents

Subagents are inner sessions spawned by the SDK (e.g. when the model
delegates to a sub-task). The protocol has first-class support; we need to
mirror it for Claude.

Scope:

- **Detect subagent starts** in the SDK event stream and emit
  `IAgentSubagentStartedSignal` (`agentService.ts:273–287`). The signal
  carries `{ session, toolCallId, agentName, ... }`; the subagent URI is
  **derived by the host** from `buildSubagentSessionUri(parentSession,
  toolCallId)` — the signal itself does NOT carry a URI.
- **Subagent URI scheme** — helpers are in `state/sessionState.ts`:
  `buildSubagentSessionUri` (line 200) and `parseSubagentSessionUri` (line
  210). See `copilotAgent.ts:34` for the import and `copilotAgent.ts:761`
  for usage.
- `mapSessionEvents.ts` uses `buildSubagentSessionUri` (imported at line
  10) for constructing child URIs during event mapping.
- **`getSessionMessages(subagentUri)`** — return the subagent's transcript
  via SDK's `getSubagentMessages` (`claudeCodeSdkService.ts:65–74`).
- **`listSessions()` filter** — decide whether subagents appear in the
  top-level session list (Copilot's behavior is the reference).
- Restore subagent associations on agent host restart.

Tests: trigger a subagent, verify the signal fires with a valid URI,
verify `getSessionMessages` returns the subagent transcript.

Exit criteria: subagent sessions are first-class for clients.

### Phase 13 — Session restoration (no in-place truncate)

- **`getSessionMessages(session)`** reconstructs the full turn history from
  the SDK's transcript via `IClaudeSessionTranscriptStore` (Phase 5 seam).
  Maps `SessionMessage[]` (Anthropic events) → agent host `Turn[]`. The
  mapper is the same logic used by the live event stream — factor it out in
  Phase 6 and reuse here. Includes subagent transcripts (Phase 12).
- **Do NOT implement `IAgent.truncateSession`**. The SDK's `forkSession`
  always produces a *new* session ID, which conflicts with the protocol's
  expectation that `truncateSession` mutates the existing session URI in
  place. `truncateSession?` is optional in `IAgent`
  (`agentService.ts:430`), so we omit it and document:
  - Clients wanting truncate-like behavior use
    `createSession({ fork: { session, turnIndex, turnId, turnIdMapping } })`
    (Phase 5), which legitimately mints a new session URI.
  - The workbench should follow the new URI, just like for any other fork.
  - Adding in-place truncate later would require a URI→sessionId mapping
    layer; we'd revisit when there's user demand.
- Session forking via `createSession({ fork })` is already covered in
  Phase 5; this phase verifies the round-trip with persisted state.

Tests: persist a session, restart the agent host, reload the session,
verify turns are intact and a new turn appends correctly. Fork via
`createSession({ fork })` produces a new URI with the prefix turns intact.

Exit criteria: agent-host restart is invisible; fork works; truncate is
documented as fork-by-another-name.

### Phase 14 — Hardening + telemetry

- Telemetry events for proxy request/response counts, model usage, token
  refresh frequency, error rates, SDK subprocess crashes (follow telemetry
  instructions in `copilot-instructions.md`).
- Map SDK `result` messages (cost, usage, duration) → telemetry + turn
  metadata.
- Stress test: long-running sessions, large outputs, frequent token
  rotations.
- Leak check on the proxy under abort storms.
- Subprocess lifecycle audit: zombie detection, graceful shutdown timing.
- Dogfood within the team for one cycle, file follow-up issues.

Exit criteria: ready to enable for external preview.

### Phase 15 — SDK upgrade (> 0.2.112)

The initial implementation pins `@anthropic-ai/claude-agent-sdk` at
**`0.2.112`** — the same version the Copilot extension currently ships
(`extensions/copilot/package.json`). Versions above 0.2.112 introduce a
**native binary dependency** (prebuilt platform-specific addons), which
requires additional build infrastructure and cross-platform packaging work
beyond the scope of the initial rollout.

This phase upgrades to a version > 0.2.112 once that infrastructure is
in place.

**Checklist:**
- Identify the minimum version that provides the desired new SDK capabilities
  (check changelog / GitHub releases for `@anthropic-ai/claude-agent-sdk`).
- Audit the native dependency: determine the addon's platform matrix, verify
  the agent-host build pipeline can package and code-sign it for all
  supported targets (win32-x64, darwin-x64, darwin-arm64, linux-x64).
- Validate the upgraded SDK against the full Phase 6–13 integration test
  matrix (`Query.*` API surface, `enableFileCheckpointing`,
  `Query.rewindFiles`, `Query.interrupt`).
- Update `agentHost/package.json` (or the shared platform `package.json`)
  to the new version and update any API callsites that changed between
  0.2.112 and the target version.
- Run the full Phase 6–13 integration test suite against the new SDK version.
- Coordinate with the Copilot extension team to keep both consumers in sync
  (or document the divergence intentionally).

Exit criteria: agent host runs on the upgraded SDK with no regressions;
native dependency is packaged in all production builds.

---

## Open questions (to resolve as we go)

- **CAPI `count_tokens` support** — must answer in Phase 1.5 to define the
  signature.
- **Model ID translation location** — tentatively the proxy. Confirm in
  Phase 1.5.
- **`Query.interrupt()` vs `_abortController.abort()`** — the production
  reference uses `_abortController.abort()`; Phase 9 starts there. If the
  abort path orphans the subprocess in practice, Phase 9 evaluates
  `Query.interrupt()` as a follow-up.
- **`enableFileCheckpointing` / `Query.rewindFiles()` runtime behavior** —
  type definitions confirm both exist in 0.2.112; the production
  reference does not exercise them. Phase 8 owns the validation step
  before committing to the rewind-based undo path.
- **ZodSchema generation strategy for client tools** — Phase 10.
- **MCP gateway idle timeout default** — Phase 10.
- **Transcript cache invalidation key** —
  `(sessionId, lastMessageUuid, fileLastModified)` proposed; alternatives
  in Phase 13.
- **Sessionstore (alpha):** SDK's `sessionStore` option mirrors transcripts
  externally. Currently alpha — parking on SDK as sole source of truth.
  Once it exits alpha, the hybrid model becomes available without changing
  callers.
- **GHE support:** tracked in
  [microsoft/vscode#313396](https://github.com/microsoft/vscode/issues/313396).
  All phases assume github.com auth.
- **Single-tenant proxy token** — one GitHub token per agent affects all
  sessions. Document for now; per-session tokens are a follow-up if needed.

## Non-goals (explicit)

- **Anthropic-direct authentication** (`x-api-key` against
  api.anthropic.com). This is a Copilot-routed Claude, not a BYOK Claude.
- **Re-implementing the Anthropic SDK ourselves.** We host the official
  Claude Agent SDK and proxy beneath it; we re-use `@anthropic-ai/sdk`
  types.
- **In-place `truncateSession`.** SDK's `forkSession` always mints a new
  session ID. Clients use `createSession({ fork })` for truncate-like
  effect; we revisit if there's demand.
- **File rewind as part of `truncateSession`.** Per-file undo is exposed
  via `resourceRead` / `resourceWrite` URIs (Phase 8).
- **Custom subprocess sandboxing** via `spawnClaudeCodeProcess`. The Agent
  Host itself is the isolation boundary.
- **Including `managed` in `settingSources`.** Match the reference's
  `['user', 'project', 'local']`. Revisit if managed-policy users complain.
- **Tracking Bash-tool file edits** in Phase 8. Documented gap;
  follow-up if needed.
- **Per-session GitHub token** in the proxy. Single-tenant for v1.
- **Cross-agent feature parity at every step.** Phases 4–14 catch up to
  `CopilotAgent` incrementally; gaps are acceptable mid-flight.
