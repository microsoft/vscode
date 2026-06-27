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

### Execution order (non-numeric)

Phase numbers are stable identifiers — code comments, plan files
(`phaseN-plan.md`), and `TODO: Phase N` throws all reference them — so we
do **not** renumber. The actual landing order diverges from numeric order
to unblock self-hosting sooner:

**1 → 1.5 → 2 → 3 → 4 → 5 → 6 → 9 → 13 → 7 → 8 → 10 → 10.5 → 11 → 12 → 6.5 → 6.7 → 14 → 15 → 16 → 17 → 18 → 19**

Phase 13 (session restoration) is pulled forward immediately after Phase 9
because it unlocks two high-leverage capabilities:

- **Restoring old chats** — clients can reload an existing transcript and
  continue it. Today `getSessionMessages` is a stub, so any Claude session
  is effectively single-process-lifetime.
- **Self-hosting** — the team can dogfood Claude sessions across agent-host
  restarts without losing turn history.

Phase 13's dependencies are already met: the SDK exposes
`getSessionMessages` out-of-process (no live `Query` required, CONTEXT M7),
the `IClaudeSessionTranscriptStore` seam landed in Phase 5, and Phase 6's
live mapper exists and can be factored to share with the replay path.

**Deferrals to land Phase 13 early:**
- **Subagent transcripts** — Phase 13's mapper handles parent-session
  transcripts only. Subagent URI dispatch (`<parent>/subagent/<toolCallId>`
  → `getSubagentMessages`) ships when Phase 12 lands. Parent transcripts
  show subagent `tool_use`/`tool_result` block pairs as completed
  `ToolCall`s with `_meta.toolKind = 'subagent'`; the workbench renders
  them as opaque markers until Phase 12 wires the second SDK call.
- **Tool-call replay fidelity** — without Phase 7, live tool calls don't
  emit signals, but replayed `tool_use`/`tool_result` pairs still flatten
  to terminal `ToolCall` states per CONTEXT M7. Replay works; live tool
  UX still waits for Phase 7.
- **Fork (Phase 6.5)** — Phase 6.5, if/when it lands, reconstructs the
  `turnId → SessionMessage.uuid` mapping itself by walking the SDK
  transcript. Phase 13 deliberately surfaces no by-product map: fork is
  rare, the mapping is reconstructible, and a wider mapper return type
  would tax every caller forever to optimize a cold path.

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
| `allowDangerouslySkipPermissions` | `true` | Required to enable `permissionMode: 'bypassPermissions'` (sdk.d.ts:1291). The SDK applies its built-in auto-approval / auto-denial per `permissionMode` before invoking `canUseTool`; the host's `canUseTool` is a pure UI bridge that surfaces whatever the SDK delegates and returns the user's verdict (the `AskUserQuestion` / `ExitPlanMode` interactive built-ins are exempt from auto-approval and always reach the host). | `claudeCodeAgent.ts` line 433 |
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

### Phase 4 — `ClaudeAgent` skeleton implementing `IAgent` ✅ **DONE**

Landed in [#313780](https://github.com/microsoft/vscode/pull/313780)
(commit `7211c0f3746`). Live-system smoke completed 2026-05-01 — see
[phase4-plan.md](./phase4-plan.md) §7.8.

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

### Phase 5 — Session lifecycle: create / dispose / list / shutdown ✅ **DONE**

Implement the lifecycle methods that don't require live LLM traffic.
**Provisional / materialize is the load-bearing model in this phase**
(CONTEXT M9): `createSession` returns a session URI synchronously **without**
spawning an SDK subprocess and **without** writing the on-disk session
file (the JSONL sidecar). `IAgentCreateSessionResult.provisional: true`
tells `AgentService` to defer the `sessionAdded` notification and the
`SessionReady` lifecycle dispatch. The session materializes on first
`sendMessage` (Phase 6); `IAgent.onDidMaterializeSession` then fires and
`AgentService` flushes the deferred notifications. Provisional records
are therefore **invisible to other workbench clients** until materialised.

- `createSession(config)` — allocate a fresh UUID `sessionId`, construct the
  URI via `AgentSession.uri(this.id, sessionId)`, construct a
  `ClaudeAgentSession` (new file `node/claude/claudeAgentSession.ts`).
  Return `{ session, workingDirectory, provisional: true }`. **Do not**
  write the JSONL sidecar yet — the session-data DB row is the only
  pre-materialise persistence (Phase 5's `_provisionalSessions` map carries
  the in-memory state). The SDK starts lazily on first `sendMessage`
  (Phase 6).
- **`createSession({ fork })` — deferred to Phase 6.5 (now ✅ done).** At
  Phase 5 the fork branch threw `TODO: Phase 6.5`; it now forks the SDK
  transcript on demand. See "Phase 6.5 — Fork" below.
- `disposeSession(session)` — tear down the session's `Query` (if alive),
  MCP gateway, in-flight aborts. Provisional sessions dispose by removing
  the in-memory record (no SDK / sidecar to clean up).
- `listSessions()` — `IAgent.listSessions()` returns
  `Promise<IAgentSessionMetadata[]>` (`agentService.ts:394`). Call SDK
  `listSessions()` with `dir` undefined (across all projects), map each
  `SDKSessionInfo` → `IAgentSessionMetadata`. **Sidecar policy:** the
  per-session `.session.json` sidecar (when present) is a *best-effort
  enrichment* layer — it is read to fill in `customizationDirectory` and
  similar host-only fields, but **not used as a filter** (CONTEXT M12).
  Sessions without a sidecar are still listed; sessions whose sidecar is
  malformed are still listed with the host-only fields cleared. Provisional
  sessions are intentionally absent until materialised.
- `getSessionMessages(session)` — empty stub for now; full implementation
  in Phase 13.
- `getSessionMetadata?(session)` (optional `IAgent` method) — returns the
  enriched metadata for a single session, including sidecar fields. Phase
  5 implements the read path; Phase 11 wires writes (
  `setMetadata('claude.customizationDirectory', …)`).
- `resolveSessionConfig` / `sessionConfigCompletions` — schema for
  Claude-specific session knobs (model, working directory). Per-field
  metadata flags (`sessionMutable`, etc.) come from CONTEXT M12; today the
  IAgent protocol exposes no generic live-edit setter, so `sessionMutable`
  fields whose values change mid-session round-trip as a fresh
  `createSession` (a restart) until the protocol grows that surface.
- **`shutdown()`** — gracefully close every active `Query`, dispose the
  proxy, drain in-flight requests. Provisional sessions are dropped from
  the in-memory map (no I/O).

**Read-through cache for the transcript** lands here as a seam:

- `IClaudeSessionTranscriptStore` interface — `getTranscript(sessionId)`
  returns parsed `SessionMessage[]`, keyed on `(sessionId, lastMessageUuid,
  fileLastModified)`.
- Default impl wraps `getSessionMessages` from the SDK.
- Future hybrid impl (using `sessionStore` once it exits alpha) can be
  swapped in without touching `ClaudeAgentSession`.

Tests: create a session, list it (including externally-created), get its
(empty) messages, dispose it, verify it's gone from `listSessions`.
`shutdown()` is idempotent and cancels in-flight work.
`createSession({ fork })` throws `TODO: Phase 6.5` with no side effects.
A provisional session is **not** visible to a second `listSessions` caller
until materialised.

Exit criteria: sessions can be created (non-fork) provisionally and
materialised on first `sendMessage` (Phase 6 owns the materialise edge);
restarts find materialised sessions; externally-created Claude Code
sessions appear; agent host can shut down cleanly. Fork is deferred to
Phase 6.5.

### Phase 6 — `sendMessage` + streaming progress events (single-turn, no tools) ✅ **DONE**

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

### Phase 6.5 — Fork ✅ **DONE**

> **Status:** ✅ done. `createSession({ fork })` is implemented and
> live-E2E verified (fork-and-continue + restart restore, 2026-06-24).
> Implementation contract / retrospective:
> [phase6.5-plan.md](./phase6.5-plan.md). The summary below stays
> high-level for roadmap continuity; two design points shifted during
> implementation (see the materialisation note and the plan's Drift
> section): the turn→uuid lookup is a pure on-demand resolver
> (`resolveForkAnchorUuid` in [claudeReplayMapper.ts](./claudeReplayMapper.ts)),
> and fork **defers** the SDK `Query` to the first `sendMessage` rather
> than materialising eagerly.
>
> **Sequencing note:** numbered 6.5 to stay consistent with the throw
> message and `phase6-plan.md` §8.1, but **executed after Phase 13** because
> the clean fix shares Phase 13's transcript reconstruction.

**Why deferred — structural mismatch.** Copilot's fork path
([`copilotAgent.ts:660-714`](../copilot/copilotAgent.ts)) calls
`sourceEntry.getNextTurnEventId(turnId) → toEventId`, an O(1) primitive the
Copilot SDK provides natively. The Claude SDK has no equivalent: `forkSession`
takes `upToMessageId` — an SDK message UUID, INCLUSIVE per
[`sdk.d.ts:558`](../../../../../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts) —
not a protocol turn id, and offers no helper to translate one to the other.

The agent-host needs that translation. Workbench's
[`agentHostSessionHandler.ts:2167`](../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts)
passes `turnId` for the **last KEPT turn N** ("keep `[0..N]` INCLUSIVE"); the
SDK wants the *uuid of the last SDK message of turn N*. The Claude
extension's
[`claudeChatSessionContentProvider.ts:341`](../../../../../../extensions/copilot/src/extension/chatSessions/vscode-node/claudeChatSessionContentProvider.ts)
sidesteps this because its UI semantic is "fork BEFORE request X" (EXCLUSIVE)
and it uses request-id directly as the SDK uuid via `messageIndex - 1`. The
agent-host can't do that — its inputs are *protocol turn ids*, not message
uuids — and no on-disk primitive exists for the mapping in either the SDK's
JSONL transcript or our session-data DB.

**What was attempted and reverted (do-not-redo).** An in-fork heuristic that
forward-scanned the SDK's JSONL transcript past `type:'user'` tool-result
frames (an `_isGenuineUserRequest` predicate skipped mid-turn tool replies)
until the next genuine user request, then took the last `type:'assistant'`
before that as the fork anchor. The attempt also threaded protocol
`turnId → SDKUserMessage.uuid` (mirroring
[`claudeCodeAgent.ts:569`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts))
and routed the new session id through `Options.resume`. The heuristic worked
today but is non-contractual: it relies on the SDK packing tool-results into
`type:'user'` with pure tool_result content arrays, on the absence of
turn-ending mid-tool states, and on subagents living in separate
`agent-*.jsonl` files. Any of those could change in an SDK version bump and
silently break fork. **Decision:** revert and ship the contract-based
solution backed by Phase 13's mapper.

**Chosen approach (when this phase lands):**

- **Walk JSONL on demand.** Phase 6.5 calls
  `sdk.getSessionMessages(srcId, { includeSystemMessages: true })`
  itself, scans the returned `SessionMessage[]` for the assistant
  envelope `uuid` corresponding to the desired `turnId` (Phase 13's
  mapper already documents that `Turn.id === SessionMessage.uuid` for
  the user-text envelope that starts each turn; the matching assistant
  envelope is the last `type: 'assistant'` message before the next
  user-text turn). One JSONL read per fork. Originally planned as a
  persisted O(1) DB lookup with live ingest on every turn, then as a
  by-product map returned from Phase 13's mapper — both reverted
  because fork is the only consumer and is rare. Neither the per-turn
  write tax nor the wider mapper return type was worth a speedup
  nobody asked for.
- `createSession({ fork })` then calls
  `sdk.forkSession(srcId, { upToMessageId: <looked-up-uuid> })` and
  routes the new session id through `Options.resume` so the SDK loads
  the forked transcript.
- Persist the customization-directory metadata via `setMetadata` on the
  forked session (mirrors
  [`copilotAgent.ts`](../copilot/copilotAgent.ts)).
- **If a second consumer for the mapping ever appears** (e.g.
  server-side in-place message edit, telemetry uuid joins), add
  `backfillTurnMapping` on `ClaudeSessionMetadataStore` and populate it
  from a one-shot mapper pass at `getSessionMessages` time (~30 lines).

**Dependencies:**

- **Hard:** Phase 13 (transcript reconstruction). Phase 6.5 reuses the
  same `IClaudeAgentSdkService.getSessionMessages` binding Phase 13
  added, and consumes `SessionMessage.uuid` directly.
- **Soft:** Phase 13's `IClaudeSessionTranscriptStore` (the Phase-5 seam)
  remains unimplemented; revisit only if a caching layer becomes worth
  the abstraction cost.

**Architectural model:** Copilot's `getNextTurnEventId(turnId)`. Phase 6.5
is the Claude-side equivalent — except Claude derives the lookup on demand
from the JSONL transcript, rather than persisting it.

**Materialisation note.** Unlike non-fork `createSession` (Phase 5/6's
provisional path), `forkSession` writes the forked SDK transcript file
synchronously, so the result is **non-provisional**. But — corrected
during implementation — fork does **not** start the SDK `Query` or fire
`onDidMaterializeSession` from inside `createSession`. Doing so raced
ahead of `AgentService.createSession`'s own (synchronous, non-provisional)
registration and produced `unknown session` warnings for both the
materialize event and pipeline progress signals. Instead fork resolves
the forked `workingDirectory` from `getSessionInfo` and returns; the
`Query` materialises lazily on the first `sendMessage`, which resumes
from disk via `_resumeSession`. This matches CONTEXT M9's "`forkSession`
only writes the new session file; it does not start a `Query` … the SDK
`Query` is still not started until the first `sendMessage`" and Copilot,
whose resume path likewise never fires the materialize event.

**Workbench client behavior.** The Agents-window "Fork conversation from
this point" affordance **is** wired for Claude and works end-to-end
(verified live 2026-06-24): forking a turn produces a new "Forked: …"
session truncated to that turn INCLUSIVE, which accepts new turns via
`Options.resume` and survives an agent-host restart.

Tests (when this phase lands): unit tests for the mapping ingest (turn end
→ persisted row), unit tests for `createSession({ fork })` looking up the
mapping and calling `forkSession` with the right uuid, integration test
parallel to Copilot's fork tests (create → N turns → fork at N-1 →
new turn on fork → verify prefix turns intact).

Exit criteria: fork is contract-based (no JSONL shape inference), works
with restored sessions, and honors the workbench's "keep `[0..N]`
INCLUSIVE" semantic. The reverted heuristic is **not** retained behind a
flag.

### Phase 6.7 — Restore Checkpoint via in-place `truncateSession`

> **Status:** ✅ done. In-place `truncateSession` for Claude is implemented
> and live-E2E verified — both "Restore Checkpoint" (point-restore via
> `resumeSessionAt`) and "Start Over" (remove-all via `deleteSession` +
> same-id recreate), 2026-06-26. Implementation contract / retrospective:
> [phase6.7-plan.md](./phase6.7-plan.md). **Superseded the "Do NOT implement
> `IAgent.truncateSession`" decision in Phase 13 and CONTEXT M10's "no
> in-place primitive" claim** — both were written before the SDK's
> `resumeSessionAt` option was examined; it provides in-place,
> same-session-id conversation truncation (see "How — `resumeSessionAt`"
> below, grounded in a 2026-06-24 source + offline-probe investigation).
>
> **Sequencing note:** numbered 6.7 to sit next to fork (6.5), with which it
> shares the transcript-anchor resolver. Executed after Phase 6.5 because it
> reuses `resolveForkAnchorUuid`
> ([claudeReplayMapper.ts](./claudeReplayMapper.ts)) and Phase 13's mapper.

**Why this is needed — what "Restore Checkpoint" requires.** The workbench's
"Restore Checkpoint" UX is a two-sided operation:

- **Client side (already generic, provider-agnostic).** The Agents-window
  chat editing session
  ([`agentHostSnapshotController.ts`](../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSnapshotController.ts))
  keeps one checkpoint per request and rolls the **on-disk files** back to
  the chosen request's "before" state via `restoreSnapshot`. This already
  works for Claude — it is pure file I/O over the captured tool-call edits.
- **Server side (provider-specific, the gap).** After a restore the handler
  ([`agentHostSessionHandler.ts:~1502`](../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts))
  notices the chat model now has fewer requests than the protocol has turns
  and dispatches `ActionType.ChatTruncated` on the **existing** session
  channel. `AgentSideEffects`
  ([`agentSideEffects.ts:~911`](../agentSideEffects.ts)) routes that to the
  provider's optional `IAgent.truncateSession(session, turnId)`. Copilot
  implements it in place via the SDK RPC `history.truncate({ eventId })`
  ([`copilotAgent.ts:~1987`](../copilot/copilotAgent.ts) →
  `copilotAgentSession.truncateAtEventId`), keeping the **same** session id
  and URI. **Claude omits `truncateSession`**, so the agent's conversation
  history is never pruned: the next turn replays the stale tail and the
  checkpoint restore is cosmetically right (files) but semantically wrong
  (the model still "remembers" the undone turns).

**Why Phase 13 / CONTEXT M10 said "impossible" — and what changed.** Both
documents concluded the Claude SDK had **no in-place history truncation**: its
only rewind primitive was believed to be `forkSession`, which **always mints a
new session id**, and unlike "Fork conversation" (Phase 6.5) — where the
workbench *follows* the new "Forked: …" URI — Restore Checkpoint dispatches on,
and must keep continuing, the **same** session URI. A new-id primitive can't
satisfy that without a URI→id indirection hack. **That premise was incomplete:**
the SDK exposes `resumeSessionAt`, which truncates in place on the *same*
session id, plus `rewindFiles` / `enableFileCheckpointing` for the file side.

**How — `resumeSessionAt` (the in-place conversation primitive).** From
[`sdk.d.ts`](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts):
`resumeSessionAt` — *"When resuming, only resume messages up to and including
the message with this UUID. Use with `resume`. … from `SDKAssistantMessage.uuid`."*
The decisive behaviors, verified by reading the bundled CLI/SDK and an offline
transcript probe (2026-06-24):

1. **Load-time truncation, same id.** The CLI maps `resumeSessionAt` →
   `--resume-session-at`, which requires `--resume`. On load it slices the
   loaded transcript to `messages.slice(0, indexOf(uuid) + 1)` — up to and
   **including** the anchor. Because this is `resume` (not `forkSession`), the
   session id — and therefore the protocol URI — is **unchanged**. No alias
   layer, no URI swap.
2. **On disk the file branches; it is not physically shrunk.** The non-fork
   resume path calls `resetSessionFile()` then **appends** subsequent turns to
   the *same* `<id>.jsonl`. The orphaned tail stays on disk; the new turn's
   `parentUuid` points at the resume anchor — a branched tree.
3. **`getSessionMessages` returns the truncated history (what matters).** The
   host reconstructs history via `getSessionMessages` (Phase 13 / CONTEXT M7).
   Its reader picks the **last-written leaf** (highest file-order index) and
   walks up `parentUuid` to the root, so orphaned branches are excluded.
   **Proven empirically:** appending a branch off the 8th line of a real
   9,517-line transcript made `getSessionMessages` return **2 messages**
   instead of 1,750 — the entire orphaned tail disappeared from the
   reconstructed history. So from the host's perspective the conversation is
   genuinely truncated, even though the JSONL retains dead lines.

**Approach — mirror Copilot's shape, no alias indirection.**

1. **Resolve the anchor.** Reuse Phase 6.5's resolver exactly:
   `getSessionMessages(sessionId, { includeSystemMessages: true })` →
   `resolveForkAnchorUuid(messages, turnId)`. The anchor is an
   `SDKAssistantMessage.uuid` — the same axis `resumeSessionAt` wants — and the
   same translation Phase 6.5 already encodes (CONTEXT M9: protocol `turnId` =
   the user msg that *started* turn T → the uuid of the *last* SessionMessage
   of turn T). Protocol semantics: `turnId` = **last turn to KEEP**
   (`[0..turnId]` INCLUSIVE), matching the workbench and Copilot.
2. **Restart the `Query` at the anchor, same id.** Tear down the live `Query`
   and re-resume with `Options.resume = sessionId` **plus**
   `Options.resumeSessionAt = <anchorUuid>`. The session id / URI is preserved;
   the next `sendMessage` continues from the truncated point. (Plumb
   `resumeSessionAt` through `IClaudeAgentSdkService` `Options` →
   `_resumeSession`, alongside the existing `resume` handling.)
3. **Reconcile local state.** Prune our session-data DB turns past the kept
   boundary (`deleteTurnsAfter(turnId)`, mirroring
   `copilotAgentSession.truncateAtEventId`) so future `getNextTurnEventId` /
   anchor lookups don't reference dropped turns. No metadata id rebinding is
   needed — the id is unchanged.
4. **Serialize** the whole operation through `_sessionSequencer` (as Copilot
   does) so it can't race an in-flight `sendMessage` / `disposeSession`.
   Provisional sessions short-circuit (nothing to truncate).

**Remove-all case (`turnId` undefined).** `resumeSessionAt` needs an anchor, so
"remove every turn" has no `SDKAssistantMessage` to point at. Handle it
separately: dispose the current `Query` and rebind the **same** protocol URI to
a fresh provisional session (CONTEXT M9 non-fork provisional path), so the next
`sendMessage` materializes a clean transcript under a new id. (This is the one
sub-case where the SDK id changes — acceptable because "remove all" is
semantically a new conversation; revisit if the workbench needs the id stable
even here.)

**Known caveats (call out in the plan, not blockers):**
- **Write timing — truncation finalizes on the next turn (by design — DECIDED).**
  Verified from the CLI source: a `resume + resumeSessionAt` restart truncates
  the transcript **only in memory**. At `query()` / resume time the CLI calls
  `resetSessionFile()` (sets `sessionFile = null`) and re-appends **metadata
  only** (`last-prompt`, `custom-title`, `tag`, `agent-*` — none are
  conversation types, so `getSessionMessages` ignores them). The branch line
  that actually drops the tail (a message whose `parentUuid` = the anchor) is
  written **lazily on the next user message**, via
  `insertMessageChain` → `materializeSessionFile()` (re-opens the same
  `<id>.jsonl` in **append** mode — the old tail is still present) →
  `appendEntry`. (Contrast Copilot's `truncateAtEventId`, which rewrites the
  on-disk transcript **immediately**.)
  - **Chosen behavior (option (a), decided):** lean into this. If a user
    restores a checkpoint and then **restarts / reloads without sending a
    message**, the conversation comes back **as if the restore never happened**
    — full pre-restore history. This is the desired product behavior: undoing
    part of a conversation only to never interact with it again is rare, and
    re-showing the full history is the least surprising outcome. We explicitly
    do **not** force a durable write at truncate time (the rejected option (b):
    sentinel branch entry / self-compaction) — it would add transcript-shape
    handling to defend a case we want to behave this way anyway.
  - **Why this is robust, not just tolerated.** In the current handler the
    `ChatTruncated` dispatch is **coupled to sending the next turn** — it fires
    immediately before `ChatTurnStarted`
    ([`agentHostSessionHandler.ts:~1502`](../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts)).
    So "restore and walk away" never calls `truncateSession` at all, and a
    restore that *is* followed by a turn persists the branch as part of that
    turn. The in-memory window (truncated context, tail still on disk) exists
    only between the `truncateSession` call and the immediately-following
    `sendMessage`; a crash in that sub-second gap simply yields the
    full-history fallback, which is the chosen behavior. **The plan must keep
    this coupling intact** — if the handler is ever changed to dispatch
    `ChatTruncated` standalone (decoupled from a turn), revisit whether option
    (b) is needed.
- **Monotonic file growth.** Branching leaves orphaned tail lines in the JSONL
  forever; repeated restores compound it. `getSessionMessages` ignores them
  (proven), so this is a disk-space / cosmetic concern, not correctness. Note
  it; a compaction sweep is out of scope (option (b) was rejected, so we are not
  building one now).
- **Live round-trip unverified.** Load + read semantics were confirmed from
  source and an offline transcript probe, but a live `resume + resumeSessionAt`
  through our `ClaudeAgentSession` wrapper (auth + a real model turn) was
  **not** exercised. Make that the plan's task 1: after resume-at + a new turn,
  assert our wrapper's next `getSessionMessages` shows the truncated history,
  confirm the option-(a) fallback (truncate → reload *without* a follow-up turn
  → full pre-restore history returns), and confirm a *subsequent* truncate
  still resolves its anchor (it should — the reader follows the active leaf).
- **`rewindFiles` is not the conversation primitive.** Per the SDK docs,
  `rewindFiles` restores files only and *"does not rewind the conversation."*
  Our file rollback is already handled client-side by
  `AgentHostSnapshotController`; we do **not** need `rewindFiles`/
  `enableFileCheckpointing` for `truncateSession`. (They remain an option if we
  ever want server-side file rollback, but that's out of scope here.)

**Doc consistency (required when this lands).** CONTEXT M10 must be corrected:
its "Claude: deliberately not implemented" subsection, the "no in-place
transcript-mutation primitive" table (which lists only `forkSession`,
`Query.interrupt()`, compaction), the Copilot-vs-Claude asymmetry row, and the
"rewind must compose with fork at the UI layer" note are all now wrong —
`resumeSessionAt` is the missing primitive. Update them to describe the
`resumeSessionAt` mechanism and point at this phase.

**Dependencies:**
- **Hard:** Phase 6.5 (`resolveForkAnchorUuid`) and Phase 13 (transcript
  reconstruction / mapper). Soft reuse of the `forkSession` binding is **not**
  needed — truncate uses `resume` + `resumeSessionAt`, not fork.
- **Touches:** `IAgent.truncateSession` (optional today — declared in
  [`agentService.ts`](../../common/agentService.ts), the user-selected
  contract), `claudeAgent.ts`, `claudeAgentSession.ts`,
  `IClaudeAgentSdkService` `Options` (add `resumeSessionAt` passthrough), and
  the session-data DB prune helper.

**Architectural model:** Copilot's `truncateSession` →
`truncateAtEventId` (CONTEXT M10 §"Copilot: in-place via SDK RPC"). Phase 6.7
is the Claude-side equivalent: where Copilot rewrites the transcript via its
session-mutation RPC, Claude restarts the `Query` with `resume +
resumeSessionAt` — both keep the same session id / URI.

Tests: unit test that `truncateSession(session, turnId)` resolves the right
anchor (reuses `resolveForkAnchorUuid`) and restarts the `Query` with
`resumeSessionAt = <anchorUuid>` and unchanged id; unit test that
`turnId === undefined` takes the fresh-provisional remove-all path; integration
test parallel to Copilot's truncate path (create → N turns → truncate at turn K
→ **send a new turn** → assert the new turn continues from turn K, turns
`(K, N]` are gone from a fresh `getSessionMessages`, and the session URI is
unchanged — the `getSessionMessages` assertion runs *after* the new turn, per
the write-timing caveat). **Option-(a) fallback test:** truncate at turn K →
**reload / restart the agent host *without* a follow-up turn** → assert the full
pre-restore history (`[0..N]`) returns and the id is unchanged — i.e. the
restore is treated as if it never happened. Task 1 is the live wrapper
round-trip described in "Known caveats".

Exit criteria: "Restore Checkpoint" is fully functional for Claude — files roll
back (already working client-side) **and** the conversation is truncated in
place via `resumeSessionAt`, with the session URI/id stable across the
operation. Write-timing behavior follows the decided **option (a)**: a restart
*after* the post-truncate turn shows the truncated history; a restart *in the
gap / restore-and-walk-away* restores the full pre-restore history (covered by
the option-(a) fallback test). CONTEXT M10 and the Phase 13 note are corrected
to reference `resumeSessionAt`. No transcript-file shape inference and no
URI→id alias layer.

### Phase 7 — Tool calls + permission + user input ✅ **DONE**

Wire the SDK's tool-use loop through to the agent host's tool infrastructure.
**Transcript-only in this phase** — file edit tracking is Phase 8.

- Map Claude's tool-use events → `AgentSignal` tool-call request parts.
- Map tool-result events → tool-result response parts.
- **Tool-call → turn attribution.** Maintain a per-session
  `Map<tool_use_id, turnId>` populated when the assistant message
  carrying the `tool_use` block streams in. The map is consulted from
  every Phase-7 tool-related callback (`canUseTool`, elicitation
  handlers, tool-result emission, file-edit tracking in Phase 8) so each
  signal carries the protocol turn id of the request that scheduled it.
  Mirrors CONTEXT M2 / M3 / M7 — the SDK never re-states the turn id on
  per-block events, so the host owns the binding.
- **`respondToPermissionRequest` — dual-routing in `canUseTool`.** The
  SDK's `canUseTool(name, input)` callback fires for every tool, but only
  *some* tools should round-trip through the workbench client; the rest
  are auto-allowed (or denied) by the host without an elicitation. Maintain
  an `INTERACTIVE_CLAUDE_TOOLS` set (read, write, edit, bash, etc.) and
  branch:
  - Interactive tool → emit `AgentSignal` permission-request part keyed
    on the tool_use_id (lookup turn id via the attribution map), wait
    for the client's `respondToPermissionRequest`, return the matching
    SDK verdict.
  - Non-interactive tool → immediate auto-allow (or deny per policy);
    no client round-trip, no signal emitted.
  Mirror the routing with `respondToUserInputRequest` for the SDK's
  `ask_user` / elicitation flow (`agentService.ts:384–385`) — same
  attribution-map lookup.
- Mirror per-tool annotations (`Read`, `Write`, `Edit`, `Bash`, etc.) so
  the client can render them.

Tests: a session that asks for `Read`, gets prompted, approves, sees the
tool output streamed back. A session that triggers an `ask_user` request,
client responds, SDK continues. A session that fires a non-interactive tool
emits no permission signal. Each emitted signal carries the correct turn
id via the attribution map.

Exit criteria: a real "read this file" prompt completes end-to-end.

#### Deferred enhancements (Phase 7)

- **ExitPlanMode richer response shape.** Phase 7 ships a simple 2-button
  Approve/Deny mirror of the production extension's
  [`exitPlanModeHandler.ts`](../../../../../extensions/copilot/src/extension/chatSessions/claude/common/toolPermissionHandlers/exitPlanModeHandler.ts):
  on Approve the host calls `session.setPermissionMode('acceptEdits')` and
  returns `{ behavior: 'allow', updatedInput: input }`; on Deny it returns
  `{ behavior: 'deny', message: 'The user declined the plan, maybe ask
  why?' }` (production extension's exact wording). CopilotAgent already has
  a richer `IExitPlanModeResponse { approved, selectedAction?,
  autoApproveEdits?, feedback? }` contract
  ([copilotAgent.ts:106-123](./copilot/copilotAgent.ts#L106-L123),
  [copilotAgentSession.ts:1439-1518](./copilot/copilotAgentSession.ts#L1439-L1518))
  that supports multi-action plans, an `autoApproveEdits` override (so the
  user can approve _without_ flipping `permissionMode`), and freeform
  feedback capture on rejection. Adopting that shape for Claude requires
  workbench rendering for multi-action plan UX plus a freeform-feedback
  capture path, which is out of scope for Phase 7. The Phase 7 handler MUST
  drop a `// TODO(claude-future): adopt richer IExitPlanModeResponse shape
  — see roadmap.md` marker at the call site so the upgrade path stays
  discoverable. Implement when Phase N introduces multi-action plan UX.

### Phase 8 — File edit tracking ✅ **DONE**

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

### Phase 8.5 — Rich tool-call rendering parity with Copilot ✅ **DONE**

Claude's tool-call cards today only carry the static display name from
[`claudeToolDisplay.ts`](./claudeToolDisplay.ts) (`"Run shell command"`,
`"Find files"`, ...). Copilot's [`copilotToolDisplay.ts`](../copilot/copilotToolDisplay.ts)
formats the actual `tool_use.input` into the row title and tags the row
with a `toolKind` so the workbench renders terminal / search /
subagent specially. Phase 12 already laid the `_meta.toolKind:
'subagent'` half down; this phase finishes the parity for the rest of
the SDK's built-in tools.

Gap surfaced live: a `Bash` permission card reads *"Run shell command"*
with no command attached, and `Bash` / `Grep` / `Glob` rows render in
the generic tool renderer instead of the dedicated terminal / search
renderers.

Scope:

- **Port the Copilot helper shape** into
  [`claudeToolDisplay.ts`](./claudeToolDisplay.ts), keyed off the SDK's
  `tool_use.input` schemas:
  - `getClaudeInvocationMessage(toolName, displayName, input)` →
    markdown that includes the actual params (`` Running `git status` ``,
    `Reading [src/foo.ts](src/foo.ts)`, `` Searching for `pattern` ``,
    `Fetching [https://...](https://...)`).
  - `getClaudePastTenseMessage(toolName, displayName, input, success)` →
    success/failure-aware past-tense (`` Ran `git status` ``,
    `Read foo.ts`, `Searched for ...`); replaces the
    `"<displayName> finished"` hardcode at
    [`claudeMapSessionEvents.ts:332`](./claudeMapSessionEvents.ts#L332).
  - `getClaudeToolKind(toolName)` → `'terminal' | 'subagent' |
    'search' | undefined`. `Bash` / `BashOutput` / `KillBash` →
    `'terminal'`; `Grep` / `Glob` → `'search'`; `Task` →
    `'subagent'` (Phase 12 already does this; consolidate the call
    site).
  - `getClaudeShellLanguage(toolName)` → `'bash'` for the shell tools
    (drives terminal renderer's syntax highlighting).
  - `getClaudeToolInputString(toolName, input)` → the canonical
    "input as code" string used for the code block under the row
    (e.g. the multi-line `command` for `Bash`, the formatted
    arguments for the rest).
  - Per-tool input typings live alongside the helpers
    (`IClaudeBashInput`, `IClaudeGrepInput`, ...), validated
    defensively (Claude's input can be malformed across SDK
    versions — fall back to the static display name on shape
    mismatch).
- **Wire the helpers through both code paths**:
  - [`claudeCanUseTool.ts`](./claudeCanUseTool.ts) — set
    `invocationMessage` on `pending_confirmation` from the rich
    helper so the **permission card shows the actual command /
    file / pattern**, not just the display name. Add `toolKind` and
    `language` to the signal so the card uses the terminal renderer
    when relevant.
  - [`claudeMapSessionEvents.ts`](./claudeMapSessionEvents.ts) —
    set `invocationMessage` on `SessionToolCallReady` for the
    non-interactive (auto-approved) path, set `pastTenseMessage` on
    `SessionToolCallComplete`, and emit `_meta.toolKind` /
    `_meta.language` on the `tool_use` block alongside the existing
    `_meta.toolKind: 'subagent'` (single canonical path; Phase 12's
    spawn helpers consume the same field).
  - **Replay path** — `claudeReplayMapper.ts` writes the same
    `_meta.toolKind` / `_meta.language` and rich
    invocation/past-tense on historical `tool_use` blocks so
    restored sessions render identically to live ones.
- **Snapshot test** in `claudeToolDisplay.test.ts` covering each tool
  row × `{ invocation, pastTense, toolKind, language, inputString }`.
  Mirrors the existing display-name snapshot so any new SDK tool
  added to the `TOOL_ROWS` table forces a snapshot update.

Tests:

- Unit: snapshot table covers every tool; `getClaudeInvocationMessage`
  defends against malformed input shapes and falls back cleanly.
- Integration: an interactive `Bash` request → the
  `pending_confirmation` signal carries the command in
  `invocationMessage` and `_meta.toolKind: 'terminal'`; the same flow
  on completion emits a past-tense message that includes the command.

Manual E2E:

- Live: ask the Claude agent to run a shell command. The permission
  card should render in the **terminal** style with the command
  highlighted; the card should read *Running `git status`* (or
  similar) instead of *Run shell command*. After approval the row
  collapses to *Ran `git status`*. Same for `Grep` / `Glob`
  rendering in the search style.
- Replay: open a historical Claude session that contains shell and
  search tool calls. The historical rows should render in the same
  terminal / search style as the live rows.

Exit criteria: Claude tool-call cards (live and replayed) match
Copilot's rendering quality — permission cards show the actual
invocation, terminal tools render in the terminal renderer, search
tools render in the search renderer. Adding a new SDK tool means
adding one row to `TOOL_ROWS` and updating the snapshot test.

### Phase 9 — Abort + steering + model change + shutdown polish ✅ **DONE**

Implementation contract: [phase9-plan.md](./phase9-plan.md). Unit tests
green, type-check / layer-check clean, and live E2E (Scenarios A–D from
[smoke.md](./smoke.md)) completed 2026-05-13 — abort + resend, steering
preemption with `steering_consumed` echo, `changeModel` hot-swap, and the
`'max'` → `'xhigh'` clamp warning all verified against a live Claude
proxy. The yield-restart primitive is in place; tool-set-diff and
settings-file change triggers are deferred to Phases 10/11 as planned.

Every runtime mutation in this phase classifies into one of M11's three
buckets — **hot-swap**, **defer-and-coalesce**, or **restart-required**
(see [CONTEXT.md M11](./CONTEXT.md) "Hot-swap / defer-and-coalesce /
restart-required taxonomy"). The prompt iterable's yield boundary is the
only mutation barrier; agents synchronise all three buckets at that point.

- **`abortSession`** — cancel the underlying SDK turn via
  `_abortController.abort()`, matching the production reference. Phase 9
  may experiment with `Query.interrupt()` if the abort path turns out to
  orphan the subprocess, but the default plan is the AbortController route
  the extension already proves works. Propagates through SDK → proxy →
  `ICopilotApiService`.
- **Steering / `setPendingMessages`** — yield an `SDKUserMessage` with
  `priority: 'now'` into the *existing* prompt iterable that was passed to
  `query()`. The SDK's `'now'`-priority watcher aborts the in-flight turn
  and dequeues the steering message next. **Do NOT use
  `Query.streamInput()`** — the production reference has zero callers; the
  prompt iterable absorbs that role (CONTEXT M10). `sendMessage`-originated
  messages stay on `priority: 'next'` (or unset — `'next'` is the SDK
  default); steering is the one path that escalates to `'now'`. Emit
  `IAgentSteeringConsumedSignal` only when the SDK echoes the
  `'now'`-priority message on the event stream (model has *seen* it), not
  when the iterable's `yield` resolves (queue acceptance).
- **`changeModel` — bundle-atomic hot-swap.** A single call carries
  `ModelSelection.id` *and* the model's per-model config bag (today:
  `config.effort`). Apply the diff at the next yield boundary by fanning
  out to one or more SDK runtime setters:
  - `id` changed → `Query.setModel(sdkId)`.
  - `config.effort` changed → `Query.applyFlagSettings({ effortLevel })`.
    **Clamp** at the seam: `Options.effort` allows `'max'` but the
    runtime setter does not (CONTEXT M11 effort-clamp table). Mid-session
    `'max'` selections silently degrade to `'xhigh'` on the runtime path.
    Genuine `'max'` mid-session requires the **restart-required** path
    (close the `Query`, spawn a new one with `Options.effort: 'max'`).
  - Both changed → both setters at the same yield boundary, in
    agent-defined order.
  Restart preserves bijective state: when the agent restarts the `Query`
  for any reason (yield-restart, customization-tools-diverge, etc.), it
  re-applies the stored bijective values (`_currentModel`,
  `_currentPermissionMode`, `_currentEffort`) so the user-visible config
  stays continuous.
- **`Query.setPermissionMode()` is reachable but not protocol-exposed.**
  Permission mode is `sessionMutable: true` in the M12 schema and
  bijective in M11, but the IAgent protocol has **no generic live-edit
  setter** today (CONTEXT M12: "protocol surface for routing an arbitrary
  live config edit back into the running session is **TBD**"). Until the
  generic setter lands, a client mid-session edit of `permissionMode`
  round-trips as a fresh `createSession` with the new bag (a restart) —
  not as a `setPermissionMode` RPC. The SDK-internal driver
  (`EnterPlanMode` / `ExitPlanMode` tools — see `claudeCodeAgent.ts:174–181`
  for the reference) is wired regardless because it does not require an
  IAgent surface.
- **Yield-restart** mechanism (port from `claudeCodeAgent.ts`): when
  settings files change or tool set changes mid-turn, drain the current
  generator and restart via `resume: sessionId`. This is the
  **restart-required** bucket; bijective state is re-applied on the new
  `Query` to keep the user-visible config continuous (see `changeModel`
  above).
- **Subprocess crash recovery** — if the SDK subprocess dies mid-turn,
  surface to the client as a turn error and mark the session ready for a
  fresh `_startSession` on the next `sendMessage`.

Tests: abort mid-stream releases the proxy's HTTP connection, steering
(`priority: 'now'` yield) preempts the in-flight turn and emits
`steering_consumed` after model visibility, model+effort swap fires both
SDK setters at the same yield boundary, `'max'` mid-session demotes to
`'xhigh'` on the runtime path (and reaches genuine `'max'` only via
restart), killed subprocess triggers recovery.

Exit criteria: parity with Copilot agent on stop / steer / switch model.

### Phase 10 — Client-provided tools (in-process MCP) ✅ **DONE**

The Claude SDK exposes **two distinct MCP entry points** that classify into
different M11 buckets — do not conflate them:

1. **In-process tools → `createSdkMcpServer` + `Options.mcpServers`** —
   defined at `query()` start, **immutable for the life of the `Query`**
   (CONTEXT M11). Any change to the in-process tool list is
   **restart-required**: yield-restart via `resume: sessionId` so the next
   `Query` is started with the new `mcpServers` bag. This is the path
   client-provided tools take.
2. **External MCP servers → `Query.setMcpServers(...)`** — a runtime SDK
   setter, in M11's **hot-swap** bucket (bijective; no restart). External
   server additions / removals (when we surface them) flow through here,
   not through restart.

The restart-required path:

- `setClientTools(session, clientId, tools)` — convert the protocol's
  `ToolDefinition[]` into SDK MCP tool definitions via SDK's `tool(name,
  description, zodSchema, handler)`, wrap in `createSdkMcpServer`, pass via
  `options.mcpServers` on the next `query()` call.
- Reference for the MCP-tool path: `extensions/copilot/src/extension/chatSessions/claude/common/mcpServers/ideMcpServer.ts`
  (uses `tool()` / `createSdkMcpServer`). **Not** `claudeCodeAgent.ts`.
- The handler is a deferred promise that the host resolves when
  `onClientToolCallComplete` delivers the result.
- **Per-query MCP server recreation** — because in-process `mcpServers`
  are immutable on a live `Query`, recreate from the current tool list on
  each `_startSession` / yield-restart. Tools changing between turns
  triggers a yield-restart (mirror `_toolsMatch` from `claudeCodeAgent.ts`).
  Phase 11's `reloadPlugins` does **not** help here — plugins are
  orthogonal to client-provided tool servers.
- **MCP gateway lifecycle** — port the `_gateway` + `_gatewayIdleTimeout`
  pattern: gateway disposed after N seconds of idle to release resources.

Tests: a client registers a custom tool, the agent invokes it via a Claude
prompt, result returns to the client and is fed back into the SDK; tool
list diff between turns triggers yield-restart, not in-place mutation.

Exit criteria: client tools callable from a Claude session.

**Open questions for this phase:**
- ZodSchema generation from the protocol's JSON Schema
  `ToolDefinition.inputSchema` — use a converter library or hand-roll?
  Check what `ideMcpServer.ts` does.
- Idle timeout for the MCP gateway — sensible default?

### Phase 10.5 — Unified `ClaudeAgentSession` lifecycle ✅ **DONE**

Structural follow-up to Phase 10. The dual-map session pattern
(`_provisionalSessions` + `_sessions`) is the direct source of every
race bug surfaced by Phase 10's council review. Each was fixed with
compensation code; this phase collapses the structure so the
compensation goes away.

**Goal:** one `_sessions` map of `ClaudeAgentSession` objects that own
their own `materialize()` lifecycle. Delete `_provisionalSessions`,
`IClaudeProvisionalSession`, and the `ClaudeMaterializer` class (pure
helpers move to a new `claudeSdkOptions.ts` module).

**Scope:** internal refactor — `IAgent` surface unchanged. 8 bite-size
steps, each landing behind the agentHost test suite. Phase 10's race
regressions remain green and become trivially true once the structural
split is gone. `CopilotAgent` uses the same pattern but stays as
reference only (different lifecycle semantics — no MCP, no
yield-restart).

Exit criteria: zero `_provisionalSessions` / `IClaudeProvisionalSession`
/ `ClaudeMaterializer` references under `src/vs/platform/agentHost/`;
Phase 10 race regressions still passing; E2E scenario (create →
set-model → send → set-client-tools → send → rebind → abort →
dispose) clean across the whole session lifecycle.

Full step-by-step plan: [phase10.5-plan.md](./phase10.5-plan.md).

### Phase 11 — Customizations / plugins (full surface) ✅ **DONE**

Shipped in PR #318113. Two-tier model:

**Inbound (host → SDK):**

- `setClientCustomizations(clientId, customizations, progress?)` — runs inside
  the per-session sequencer (so a fire-and-forget call from `AgentSideEffects`
  cannot race a first `sendMessage`). Calls
  `IAgentPluginManager.syncCustomizations` to download `CustomizationRef[]` to
  local dirs, forwards incremental results via the `progress` callback for
  progressive loading UI, and adopts the resulting `ISyncedCustomization[]` on
  the session.
- `setCustomizationEnabled(uri, enabled)` — flips the per-session enablement
  bit. Drains at the next `send()` pre-flight.
- **Both writes → yield-restart, NOT in-place reload.** `Query.reloadPlugins()`
  in `@anthropic-ai/claude-agent-sdk` is parameterless: it can only re-read
  files at plugin paths captured into `Options.plugins` at startup, so it
  cannot add a new plugin, drop a disabled one, or pick up a content refresh
  via nonce bump. `send()`'s pre-flight runs a single `rebindForRestart()`
  when either `toolDiff` or `clientCustomizationsDiff` is dirty; the
  rematerializer reads `clientCustomizationsDiff.consume()` while building
  `Options`, so the new plugin URI list lands on the rebuilt `Query`.

**Outbound (SDK → host):**

- `onDidCustomizationsChange` event — fires from (1) client-pushed writes via
  the diff observable, (2) materialize completion (surfaces the SDK-discovered
  tier for the first time), (3) pre-flight rebind completion.
- `getCustomizations()` — provider-level catalogue (host-configured); returns
  `[]` for Claude today since there is no host-configured surface yet.
- `getSessionCustomizations(session)` — returns the merged projection of
  client-pushed entries (with per-URI enablement overlay) plus the
  SDK-discovered bundle from `ClaudeSdkCustomizationBundler`. Server-side
  commands / agents / MCP servers from the live `Query` are bundled as a
  single "Discovered in Claude" Open Plugins-conformant on-disk tree under
  `IAgentPluginManager.basePath`, namespaced by working-directory hash and
  nonce-stable across repeated bundles of the same SDK snapshot.
  **(Superseded by Phase 16: the synthetic-stub bundle was replaced by a
  disk scan returning real editable `file:` URIs; `ClaudeSdkCustomizationBundler`
  is deleted.)**

**Per-session ownership.** All customization state lives on
`ClaudeAgentSession`:

- `SessionClientCustomizationsModel` + `SessionClientCustomizationsDiff` under
  `customizations/` (parallel to `clientTools/`) own the synced list,
  enablement map, derived enabled plugin paths, and dirty bit. Dirty is
  driven from the model state observable (widened equality covers `nonce`,
  `displayName`, `description`, `statusMessage`, `agents`, `pluginDir`,
  status, enablement) so same-URI content refreshes correctly flip dirty.
- `ClaudeSdkCustomizationBundler` writes the on-disk Open Plugin tree on
  demand from `getSessionCustomizations`. Repeated calls with the same SDK
  snapshot skip the rewrite. The tree is intentionally a cross-session warm
  cache (not deleted on session dispose).
  **(Superseded by Phase 16 — this bundler is deleted; see Phase 16.)**

Full step-by-step plan: [phase11-plan.md](./phase11-plan.md).

### Phase 12 — Subagents ✅ **DONE**

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

Manual end-to-end validation (run before each release of this surface):

1. **Live spawn renders correctly.** Launch the Agents window
   (`./scripts/code.sh --agents`), start a fresh `claude` session, switch
   the agent picker to **Claude**, and send a prompt that asks for two
   parallel subagents (e.g. *"Spin up 2 subagents that do something, I
   want to make sure they render correctly"*). Verify in the chat:
   - Two parent rows appear, one per Task tool_use, each labeled with
     the `subagent_type` (e.g. "Explore") rather than the literal tool
     name. The row's description matches the `description` field from
     the `tool_use.input` (not the prompt).
   - Each parent row enters the **Running** state immediately (no stuck
     `Streaming` spinner) — confirms `buildTopLevelSubagentReadyAction`
     is emitting the synthetic `SessionToolCallReady` with
     `_meta.toolKind: 'subagent'` even though the SDK skips `canUseTool`
     for the Task tool.
   - Inner tool calls (Glob / Read / etc.) are nested under their
     parent row, with their own past-tense completion messages.
   - Each parent row collapses to **Ran subagent** when its
     `tool_result` lands; no orphan rows survive after the turn ends.
   - Final assistant text from the parent appears below the subagent
     rows.
2. **Replay of a historical session renders correctly.** With the
   Agents window still open, click an older session in the sidebar that
   includes Task spawns (any prior chat where the agent delegated to a
   subagent works). Verify:
   - The historical parent rows render with the same labels as the
     live path — confirms the replay mapper
     (`claudeReplayMapper.ts`) sets `_meta.toolKind: 'subagent'` on
     completed/cancelled Task tool_use blocks, and the workbench
     attaches the same UI affordances.
   - Clicking a subagent marker opens the subagent transcript inline,
     pulled via `ClaudeAgent.getSessionMessages` →
     `getSubagentTranscript(uri, registry, sdk, log, token)`. The
     strategy chain (TextSuffix → PromptMatch → Native) resolves the
     `agentId` from the parent's primed `SubagentRegistry` on first
     open and from the cached `spawn.agentId` on subsequent opens.
   - Inner content (text, thinking, tool calls) appears in the
     subagent view.
   - No console errors / no `[Claude]` warn-logs in the renderer or
     agentHost log for the resolved sessions.

Validated against this build: see the `Spin up 2 subagents...`
run captured in the Phase 12 plan's Step 14 ("E2E validation")
appendix; both flows rendered as specified.

Exit criteria: subagent sessions are first-class for clients.

### Phase 13 — Session restoration (no in-place truncate) ✅ **DONE**

> **Execution order:** lands immediately after Phase 9 to unblock chat
> restoration and self-hosting. See "Execution order (non-numeric)" above.

- **`getSessionMessages(session)`** reconstructs the full turn history from
  the SDK's transcript via `IClaudeSessionTranscriptStore` (Phase 5 seam).
  Out-of-process: calls SDK `getSessionMessages(sessionId, { dir,
  includeSystemMessages: true })` — no live `Query` required (CONTEXT M7).
  Maps `SessionMessage[]` (Anthropic events) → agent host `Turn[]` per the
  CONTEXT M7 grouping rules:
  - `('user', text)` → start new `Turn` with `Turn.id = sessionMessage.uuid`.
  - `('user', tool_result)` → attach to the open `ToolCall`, do NOT start
    a new `Turn`.
  - `('user', empty / hook-injected / shouldQuery: false)` → drop.
  - `('assistant', ...blocks)` → push `Markdown` / `Thinking` /
    `ToolCall` (terminal `Completed` / `Cancelled` only — no live
    lifecycle states) parts onto the active `Turn`.
  - `('system', compact_boundary | allowlisted subtype)` → push
    `SystemNotificationResponsePart` on the active `Turn`; `compact_boundary`
    is **not** a Turn boundary (CONTEXT M7).
  - Tail-Turn `state`: `'completed'` if no orphan `tool_use` blocks remain;
    otherwise mark incomplete (heuristic — see CONTEXT "Open mapping
    questions").
  - Per-Turn `usage` is `undefined` on replay (live-only metadata; CONTEXT
    M8 asymmetry).
- **Mapper factor-out from Phase 6.** Phase 6 ships a live mapper for the
  event stream; Phase 13 lifts that into a shared module so the same code
  drives both live and replay. Critically, **both drivers must hydrate the
  same `Map<tool_use_id, turnId>`** (CONTEXT glossary) so `tool_result`
  events delivered after a session restore resolve back to the announcing
  `tool_use`'s `turnId`. The mapper is the single seam.
- **Subagent markers without subagent transcripts.** Parent-transcript
  `Agent` / `Task` `tool_use` + `tool_result` pairs flatten to a terminal
  `ToolCall` with `_meta.toolKind = 'subagent'` and the result content
  inlined per CONTEXT M7. Until Phase 12 lands the
  `<parent>/subagent/<toolCallId>` URI dispatch and the
  `getSubagentMessages` second SDK call, opening a subagent marker in the
  workbench is a no-op (the host throws `TODO: Phase 12` if the URI shape
  matches).
- **`turnId → lastSdkMessageUuid` is reconstructed on demand, not exposed.**
  Phase 13's `mapSessionMessagesToTurns` returns `readonly Turn[]` and
  nothing else. Phase 6.5 fork (the only consumer of a turn→uuid
  mapping) walks `SessionMessage[]` itself when it lands. Originally
  planned as live ingest + replay backfill into per-session DB rows,
  then as a `{ turns, turnIdToLastAssistantUuid }` mapper return-value
  by-product; both reverted because fork is rare and neither the
  per-turn write tax nor the wider mapper return type was worth it.
  If a second consumer ever appears, `backfillTurnMapping` is a
  ~30-line add on `ClaudeSessionMetadataStore`.
- **Do NOT implement `IAgent.truncateSession`** _(superseded by Phase 6.7)_.
  This reasoning is **outdated**: it assumed `forkSession` (which mints a
  *new* session ID) was the only rewind primitive, so in-place truncate would
  need a URI→sessionId mapping layer. Phase 6.7 found the SDK's
  `resumeSessionAt` option, which truncates **in place on the same session
  id** — no mapping layer required. The original (now-superseded) reasoning is
  preserved below for history:
  - The SDK's `forkSession` always produces a *new* session ID, which conflicts
    with the protocol's expectation that `truncateSession` mutates the existing
    session URI in place. `truncateSession?` is optional in `IAgent`
    (`agentService.ts:430`), so we omit it and document:
    - Clients wanting truncate-like behavior use
      `createSession({ fork: { session, turnIndex, turnId, turnIdMapping } })`
      (Phase 6.5 — currently deferred; until that lands, the fork branch
      throws and the workbench surfaces a session-creation error).
    - The workbench should follow the new URI, just like for any other fork.
    - Adding in-place truncate later would require a URI→sessionId mapping
      layer; we'd revisit when there's user demand. **(Resolved differently by
      Phase 6.7: `resumeSessionAt` keeps the same id, so no mapping layer is
      needed.)**

Tests: persist a session, restart the agent host, reload the session,
verify turns are intact and a new turn appends correctly. Verify
replayed `tool_use` / `tool_result` pairs flatten to terminal
`ToolCall` states with content inlined. Verify a subagent marker
appears with `_meta.toolKind = 'subagent'` but its URI is not yet
dispatchable.

Exit criteria: agent-host restart is invisible for parent transcripts;
self-hosting across restarts works; truncate is documented as
fork-by-another-name. Subagent transcript fetch ships in Phase 12;
fork end-to-end ships in Phase 6.5.

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

### Phase 15 — SDK distribution via `product.json` + main.vscode-cdn.net ✅ **DONE**

> **Implementation contract / retrospective:
> [phase15-plan.md](./phase15-plan.md).** That file documents what
> actually shipped — runtime downloader, the `build/agent-sdk/` tarball
> pipeline, the per-platform `produce.ts` step, and the gulpfile
> `product.json` stamping. The summary below stays high-level for roadmap
> continuity.

**Status:** both the runtime and the build pipeline have landed. Runtime
shape is per-SDK `urlTemplate` + runtime `{sdkTarget}` substitution
(replaced the per-platform `{url, sha256}` pair so macOS Universal bundles
can share one `product.json`). The Claude and Codex SDK distributions are
declared in `product.json` (built by the per-platform
[`produce.ts`](../../../../../../build/agent-sdk/produce.ts) step and
stamped into `product.json` by `packageTask` in
[`gulpfile.vscode.ts`](../../../../../../build/gulpfile.vscode.ts)) and
downloaded on demand by
[`agentSdkDownloader.ts`](../agentSdkDownloader.ts) into
`<userDataPath>/agent-host/sdk-cache/<pkg>/<sdkVersion>/<sdkTarget>/`. The
hand-supplied paths (`chat.agentHost.claudeAgent.path` →
`AgentHostClaudeSdkRootEnvVar`, see
[`claudeAgentSdkService.ts:148`](./claudeAgentSdkService.ts#L148), and the
Codex equivalent) survive as a **dev override** only — set them to bypass
the download. SDK versions are pinned in
[`build/agent-sdk/agents/<sdk>/package.json`](../../../../../../build/agent-sdk/agents/claude/package.json)
(today: Claude `0.3.169`, Codex `0.135.0`).

**Shape:**

- `product.agentSdks.{claude,codex}` ships a `version` and a
  `urlTemplate` — a `format2()`-style template with a `{sdkTarget}`
  placeholder. The runtime resolves `{sdkTarget}` per-launch from
  `(process.platform, process.arch, libc)` via `resolveSdkTarget(pkg)`
  in `agentSdkDownloader.ts`, gated by `IAgentSdkPackage`'s
  `hasSeparateMuslLinuxPackage` flag (Claude: true, Codex: false — its
  Linux binary is statically musl-linked so a single SKU runs on both).
  The build pipeline emits the same template across all platforms — no
  per-platform stamping at packaging time — so a single shipped
  `product.json` works for macOS Universal bundles that serve both
  arm64 and x64 launches.
- `vscode-distro` no longer carries an `agentSdks` fragment — the
  build IS the distribution. OSS `product.json` does not have it either.
- Tarballs ship as the full `node_modules/` subtree extracted into
  `<userDataPath>/agent-host/sdk-cache/<pkg>/<sdkVersion>/<sdkTarget>/`.
  The `sdkTarget` segment keeps Universal launches with different
  resolved targets from thrashing a single cache.
  `ClaudeAgentSdkService._loadSdk` and `CodexAgent._startConnection`
  know the package-internal entrypoints
  (`@anthropic-ai/claude-agent-sdk/sdk.mjs`, `@openai/codex/bin/codex.js`)
  and resolve them off the returned root.
- Trust: `product.json` lives inside the signed application bundle
  and its integrity is covered by `product.checksums`; URLs are HTTPS
  to a Microsoft-controlled CDN. The runtime no longer carries or
  verifies a per-tarball sha256 — `product.checksums` + HTTPS are the
  trust chain.
- Provider registration is gated on
  `IAgentSdkDownloader.isAvailable(pkg)` — true iff the dev-override
  env var is set, OR (`product.agentSdks?.[pkg.id]` is populated AND
  `resolveSdkTarget(pkg)` resolves). If neither, the provider is not
  registered and never appears in the agent picker (matches the
  pre-CDN UX).

**Exit criteria (met):**
- Fresh insiders install can use Claude/Codex without manually
  installing the SDK or setting any path.
- SDK version bumps are now build-pipeline changes that re-pin the SDK
  version in `build/agent-sdk/agents/<sdk>/package.json` (+ lockfile);
  the per-platform `produce.ts` step republishes the tarballs and
  `packageTask` re-stamps `product.agentSdks[pkg]` during packaging.
- Dev override keeps working for SDK development.

**Build pipeline** — see [`build/agent-sdk/`](../../../../../../build/agent-sdk/README.md)
for the tarball production and CDN upload tooling, including the
deterministic-tar setup. The per-platform
[`agent-sdk-produce.yml`](../../../../../../build/azure-pipelines/common/agent-sdk-produce.yml)
template runs `produce.ts` before each `gulp vscode-<platform>-<arch>-min-ci`
step; `packageTask`'s `jsonEditor` callback then merges the results into
`product.json` via `readAgentSdkResults()` (no separate `AgentSDK`
pipeline stage, no `aggregate.ts`). Full retrospective in
[phase15-plan.md](./phase15-plan.md).

### Phase 16 — Editable customization resolution via disk scan

> **Redesigned 2026-06-17.** This phase originally proposed "eager
> session materialization at create time" — warming the SDK inside
> `createSession` so `getSessionCustomizations` could return the
> SDK-resolved tier before the first `sendMessage`. That premise is
> **retired.** Investigation (below) showed the SDK query APIs can't
> deliver what the customization UX actually needs, and that a disk
> scan — not a warm session — is the right resolution path. The
> warm-at-create machinery (and its JSONL-write-timing / cleanup-on-
> discard tail) is no longer part of this phase.

**Status:** follow-up to Phase 11. Phase 11 bundles the SDK-discovered
customization tier (`Query.supportedCommands()` / `supportedAgents()` /
`mcpServerStatus()`) into a synthetic "Discovered in Claude" plugin
tree. The problem: those SDK APIs return **only names + descriptions —
no file paths and no content** (`SlashCommand` / `AgentInfo` /
`McpServerStatus` in `sdk.d.ts`). So today's bundler synthesizes **stub
files** (frontmatter with name + description, empty body) and ships
URIs pointing at those *stubs*. A user who opens a "Discovered in
Claude" item edits a generated stub, not their real
`~/.claude/agents/foo.md` — and there is no real content anywhere in
the projection.

**Driver:** the customization surface must give the user the **real,
editable file path** of each customization (agents, skills, slash
commands, MCP servers). Content follows for free — like
`CopilotAgent`, we ship the real `uri` and the client reads content on
demand by opening it; we do **not** need to ship content bytes through
the protocol.

**Direction:** resolve customizations by **scanning the file system**
(the `CopilotAgent` model), not by trusting the SDK query payloads.
The SDK list becomes a **post-materialize filter**, not the source of
the data.

- **Pre-materialization (provisional / draft):** a disk scan resolves
  the full set with real paths + parsed metadata. No warm SDK session
  required, so `createSession` stays **cold and provisional** — no
  subprocess, no proxy refcount, no JSONL, fully invisible in the
  sidebar until the first `sendMessage`. **The provisional/materialize
  split is preserved, not collapsed.** Show *everything* discovered on
  disk (optimistic — no session yet to say what's actually active).
- **Post-materialization (live session):** intersect the disk-scan
  superset with the SDK's "known" set (`supportedCommands` /
  `supportedAgents` / `mcpServerStatus`, matched by name per type).
  A customization discovered on disk that the live session did **not**
  load (malformed, disabled, wrong `settingSource`, shadowed by
  precedence) is **hidden** post-materialize. The warm session already
  exists here, so the filter is free.

**Why a disk scan (and why it's not really duplicating Claude).**
`CopilotAgent` already scans disk for customizations
(`sessionCustomizationDiscovery.ts` — which *already* walks
`.claude/agents` and `.claude/skills`) and parses frontmatter via the
shared `pluginParsers.ts` (`parseAgentFile` / `parseSkillFile` /
`readSkills` / `readMcpServers`). The Claude provider reuses that
infrastructure. The genuinely net-new surface is only: **user-home
`~/.claude/**`**, **`~/.claude/commands`** (slash commands), and
**Claude's `settings.json` / `.mcp.json` MCP format** — i.e. encoding
Claude's directory conventions, not reimplementing Claude.

**Scope:**

- New Claude customization **disk-scan resolver** (mirrors
  `CopilotAgent`'s discovery) covering, scoped by the session's `cwd`
  + user home + `settingSources`:
  - agents — `~/.claude/agents/**`, `<cwd>/.claude/agents/**`
  - skills — `~/.claude/skills/**`, `<cwd>/.claude/skills/**`
  - slash commands — `~/.claude/commands/**`, `<cwd>/.claude/commands/**`
  - MCP servers — `~/.claude/settings.json`, `<cwd>/.claude/settings.json`,
    `<cwd>/.mcp.json`
  - Reuse `pluginParsers.ts` + `sessionCustomizationDiscovery.ts` where
    possible; add Claude-specific roots + the `settings.json` MCP parser.
- Each resolved item ships a **real `uri`** (editable file path) + parsed
  name/description, replacing the synthetic-stub bundler for the
  discovered tier.
- Rules (CLAUDE.md + `.claude/rules/**`) are scanned and surfaced too;
  they have no SDK counterpart, so they bypass the post-materialize
  filter (always kept).
- `getSessionCustomizations`:
  - **provisional:** client-pushed ∪ full disk scan (no filter).
  - **materialized:** client-pushed ∪ (disk scan ∩ SDK-known set).
- The synthetic-stub `claudeSdkCustomizationBundler` is **deleted**; the
  SDK-only non-editable fallback is generated declaratively inline in
  `buildDiscoveredCustomizations` (no stub files on disk).
- **Read-only built-in tier** (added during implementation): a curated set
  of built-in slash commands (13) + built-in agents (5) is surfaced
  read-only pre-materialize for discoverability (on the `agent-builtin:`
  scheme), then superseded by the live SDK set post-materialize. Lives in
  `claudeBuiltinCommands.ts`. Built-ins are display-only — `contrib/chat`
  is untouched, so clicking one does not render content (accepted; a
  read-only editor view is a future request).
- `createSession` is **unchanged** in lifecycle terms: stays
  provisional, no warm SDK, no `onDidMaterializeSession` at create.
  The provisional path simply gains a disk scan for its customization
  projection.

**What this phase explicitly does NOT do (retired from the old design):**

- No eager / warm materialization inside `createSession`.
- No collapsing of the provisional/materialize split.
- No `IAgentCreateSessionResult.provisional` change, no
  `_sessionSequencer` first-send-branch removal, no `onDidMaterialize`
  ordering rework, no JSONL-write-timing investigation, no
  cleanup-on-discard net. The lifecycle (M9) is untouched.

**Open design points** (settle in the phase plan):

- **SDK-knows-it-but-not-found-on-disk** (built-ins, plugin-provided,
  or an unscanned dir): show it as a **non-editable name/description
  entry** (so the active capability list stays complete) or **drop**
  it? Leaning *show as non-editable* — retains the honest active set
  while only the locatable items are editable.
- **Skills vs commands mapping** — the SDK surfaces skills via
  `reloadSkills()` / `supportedCommands()` as `SlashCommand[]`, but the
  disk layout separates `~/.claude/commands` (slash commands) from
  `~/.claude/skills` (skills). The name-match filter needs a per-type
  mapping so a skill isn't matched against a command.
- **File watching** — do we re-scan on disk change (live updates to the
  customization list) or scan once per `getSessionCustomizations` call?
  Prefer correlated watchers via `fileService.createWatcher` if live.
- **MCP completeness pre-materialize** — disk-scan reads declared MCP
  servers from `settings.json`; their *connection status* is only known
  post-materialize via `mcpServerStatus()`. Pre-materialize entries
  carry config but no live status.

Exit criteria: opening a discovered agent / skill / command from a
Claude session's customization list opens the **real on-disk file**
(editable), not a synthetic stub; a provisional (never-sent) session
lists the full disk-scanned set; a materialized session hides on-disk
customizations the live session did not load, and surfaces
SDK-known-but-not-on-disk items as **non-editable** entries; the
synthetic-stub bundler is **deleted** (the non-editable fallback and the
curated built-in agents/skills tier are generated declaratively inline,
no stub files on disk); `createSession` lifecycle (provisional, cold) is
unchanged. **Shipped.**

### Phase 17 — User/workspace hooks + Claude-native plugins via disk scan ✅ **DONE**

> **Status:** both parts shipped. Part A (hooks) landed as PR #322637; Part B
> (native plugins) landed as PR #322766. Both are surface-only (no
> `Options.plugins` / `claudeSdkOptions.ts` change) — unit-tested,
> council-reviewed, and live-E2E verified (real `telegram@claude-plugins-official`
> + `github-inbox@vscode-team-kit` plugins surface under the customization modal
> with their real cache roots, and a workspace `settings.local.json` disable
> hides them via the watcher). See [phase17-plan.md](./phase17-plan.md) for the
> full retrospective, including the post-E2E fixes (multi-format manifest
> detection, `source`-based post-materialize match, and PB-10 standalone-fallback
> suppression).

> **Driver.** Phase 16's disk scan surfaces agents, skills, slash commands,
> MCP servers, and rules — but **hooks** and **Claude-native plugins** that
> the *user or workspace* has configured are still invisible in the
> customization list. Both already *run* (the runtime loads them via
> `settingSources` + `includeHookEvents`), but the user cannot see or edit
> them from the Agents window. This phase closes that **surfacing** gap for
> both, mirroring Phase 16's provisional/materialize semantics and its
> "real editable `file:` URI, no synthetic stub" rule. It does **not**
> change the SDK loading path.
>
> **Scope is user/workspace-configured surfaces only** — hooks and plugins
> the *user* set up in their `~/.claude` / workspace `.claude`, not what the
> agent host injects into the SDK (the proxy env, the in-process
> client-tool MCP server from Phase 10, or the synced client customizations
> from Phase 11).

**Reference docs** (verified 2026-06-23):

- [Hooks reference](https://code.claude.com/docs/en/hooks.md) — hook
  locations table: `~/.claude/settings.json` (user), `.claude/settings.json`
  (project), `.claude/settings.local.json` (local), plus plugin
  `hooks/hooks.json` and skill/agent frontmatter. `disableAllHooks`
  short-circuits a scope.
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference.md)
  — `enabledPlugins` lives in the same `settings.json` scopes; marketplace
  plugins are cached under `~/.claude/plugins/cache/...`; `@skills-dir`
  plugins live in-place under `~/.claude/skills/<name>/.claude-plugin/`
  and `<cwd>/.claude/skills/<name>/.claude-plugin/`.
- [SDK plugins](https://code.claude.com/docs/en/agent-sdk/plugins.md) — a
  *bare* SDK app must pass plugins as `Options.plugins: [{ type: 'local',
  path }]`. **But with `settingSources` enabled (our config), the runtime
  auto-loads `.claude` plugins** — so the host must NOT also pass them
  (`claudeSkills.ts` skips `.claude` dirs "to avoid duplicates").
  `Options.plugins` stays client-only.
- [SDK hooks](https://code.claude.com/docs/en/agent-sdk/hooks.md) — shell
  command hooks from settings files run **only when the matching
  `settingSources` entry is enabled** (it is, for user/project/local).

#### Part A — Hooks (surface only; already loaded)

Hooks from user/project/local `settings.json` already **fire** at runtime
because `settingSources` loads them and `includeHookEvents: true` streams
their events. The gap is purely **discovery/surfacing** in the customization
list. There is no SDK enumeration API for active hooks (no
`supportedHooks()`), so — unlike agents/skills/MCP — hooks are surfaced from
disk **only** and bypass the post-materialize SDK-intersection filter
(same as rules in Phase 16).

- New scanner under `node/claude/customizations/scan/` that reads the
  `hooks` block from `~/.claude/settings.json`,
  `<cwd>/.claude/settings.json`, and `<cwd>/.claude/settings.local.json`,
  honoring `settingSources`. **Reuse the existing parser**
  ([`pluginParsers.ts`](../../../agentPlugins/common/pluginParsers.ts)):
  `parseHooksJson` already understands Claude's nested
  `{ matcher, hooks: [...] }` shape, the `HOOK_TYPE_MAP` event names, and
  `disableAllHooks`, and emits a protocol `HookCustomization` via
  `makeHookCustomization`. The net-new work is the Claude settings-scope
  roots, not the parser.
- Each surfaced hook group carries the **real `settings.json` URI**
  (editable), the event name, and the matcher — opening it from the
  customization list opens the settings file, like the read-only `/hooks`
  menu but editable.
- A scope whose `disableAllHooks` is `true` contributes no hook entries.
- **Out of scope:** `managed`-policy hooks (matches the existing
  `managed`-excluded `settingSources` non-goal); skill/agent-frontmatter
  hooks (those ride along with their owning component, already surfaced in
  Phase 16).

#### Part B — Claude-native plugins (surface only)

Native plugins are **already loaded** by the SDK runtime via
`settingSources: ['user', 'project', 'local']` — the same mechanism that
auto-loads `.claude` agents / skills / hooks. The gap is purely
**surfacing** them in the customization list. They must **not** be added
to `Options.plugins`: that channel is exclusively for client/host-provided
plugins *outside* `.claude` (the Phase 11 `clientCustomizationsDiff` dirs,
[`claudeAgentSession.ts:324`](./claudeAgentSession.ts#L324) /
[`:414`](./claudeAgentSession.ts#L414)), and the production extension
explicitly **skips `.claude` dirs to avoid duplicate loading**
([`claudeSkills.ts`](../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeSkills.ts)
`isClaudeDirectory` filter; `claudeCodeAgent.ts` builds `Options.plugins`
only from `getPluginLocations()`). Plumbing native plugins in would
**double-load** them.

- **Discover** enabled native plugins by reading `enabledPlugins` from the
  user/project/local `settings.json` scopes and resolving each to its
  on-disk root:
  - marketplace installs → `~/.claude/plugins/cache/<...>/` (the
    current version dir; orphaned version dirs skipped);
  - `@skills-dir` plugins → in-place under `~/.claude/skills/<name>/`
    and `<cwd>/.claude/skills/<name>/` when a `.claude-plugin/plugin.json`
    is present.
  Parse each manifest with the shared `parsePlugin` / `CLAUDE_FORMAT`
  ([`pluginParsers.ts`](../../../agentPlugins/common/pluginParsers.ts)
  `manifestPath: '.claude-plugin/plugin.json'`,
  `hookConfigPath: 'hooks/hooks.json'`) and surface the plugin plus its
  bundled components (skills / agents / hooks / MCP servers) with their
  **real `file:` URIs**.
- **No `Options.plugins` change, no host-side rebind to load.** The
  runtime owns loading; a mid-session `enabledPlugins` edit takes effect on
  the runtime's next `settingSources` read / restart (the same path as any
  `settings.json` change). The `ClaudeCustomizationWatcher` only refreshes
  the **displayed list**.

#### Provisional / materialize semantics (both parts)

Same as Phase 16 — **no eager materialization, no lifecycle change**:

- **Provisional (pre-send):** show the full disk-scanned hook + plugin set
  (optimistic; no live session yet).
- **Materialized (live):** hooks stay disk-only (no SDK filter). Native
  plugins **are** enumerable post-materialize — the SDK `system/init`
  message reports loaded `plugins` and their namespaced `skills` /
  `slash_commands`
  ([SDK plugins](https://code.claude.com/docs/en/agent-sdk/plugins.md)) —
  so a plugin declared in `enabledPlugins` but **not** loaded by the live
  session (bad path, manifest error, untrusted workspace) is hidden
  post-materialize, matching Phase 16's "hide on-disk items the live
  session did not load" rule.
- **Watching:** extend `ClaudeCustomizationWatcher`
  ([`claudeSessionCustomizationDiscovery.ts`](./customizations/claudeSessionCustomizationDiscovery.ts))
  so edits to `settings.json` / `settings.local.json` (hook block +
  `enabledPlugins`) and to a resolved plugin's manifest re-fire
  `onDidCustomizationsChange`. The `.claude` roots are already watched;
  the settings files largely are too (Phase 16 watches `<userHome>/.claude`
  + `<cwd>/.claude` recursively).

**Tests:**

- Unit: hook scanner yields `HookCustomization` entries with real
  settings-file URIs from a temp `~/.claude/settings.json` +
  `<cwd>/.claude/settings.json`; `disableAllHooks` drops a scope;
  `managed` is never read.
- Unit: plugin resolver maps `enabledPlugins` → cache / skills-dir roots,
  parses each manifest, and yields the plugin + bundled components with
  real URIs; a missing/orphaned dir is skipped.
- Unit: provisional `getSessionCustomizations` returns the full
  hook+plugin set; materialized intersects native plugins against the SDK
  `init` plugin list while leaving hooks unfiltered.
- Regression: the existing `claudeSdkOptions.test.ts` still passes
  **unmodified** — `Options.plugins` is untouched (native plugins are
  auto-loaded, not host-plumbed).
- Integration: a temp plugin enabled in `enabledPlugins` is auto-loaded by
  the live session (appears in the captured `init.plugins`) and its skill
  is invocable — **without** any host-added `Options.plugins` entry.

**Manual E2E:**

- Add a `PostToolUse` hook to `~/.claude/settings.json`; it appears in the
  Claude session's customization list with an editable URI, and firing a
  `Write` triggers it.
- Install a marketplace plugin via the Claude CLI, enable it, open a Claude
  session: the plugin and its skills appear in the list and the skill is
  invocable from the agent.

**Exit criteria:** user/workspace-configured hooks and Claude-native
plugins appear in the customization list with **real editable URIs**
(no synthetic stubs); enabled native plugins continue to be auto-loaded by
the runtime (verified via the captured `init.plugins`) with **no**
host-added `Options.plugins` entry; provisional sessions show the full
disk set, materialized sessions hide native plugins the live session did
not load; the `createSession` provisional/cold lifecycle (M9) is
unchanged. Shipped as two PRs: Part A (hooks, #322637) then Part B
(native plugins, #322766). Detailed implementation contract:
[phase17-plan.md](./phase17-plan.md).

### Phase 18 — Transport-branched model source (SDK discovery workaround) ✅ **DONE**

> **Status:** ✅ done (revised 2026-06-24). The original "unify the model path on
> `Query.supportedModels()` via the SDK's gateway model-discovery" approach
> is **abandoned** — a confirmed Claude Agent SDK bug makes it unworkable
> (below). Phase 18 is re-scoped to the small structural seam the eventual
> unification slots into: a **single transport-branched model source**,
> with the proxy hardcoded **on** and a `TODO(Phase 19)`. Proxied mode
> keeps using `ICopilotApiService.models()` exactly as today.

#### Why the original approach died — confirmed SDK bug

The premise was: set `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` so the
SDK discovers models from `ClaudeProxyService`'s `/v1/models`, and read them
via `Query.supportedModels()` — one model call for both proxied and native
modes. **It does not work on a brand-new query**, proven empirically against
both the pinned SDK (`0.3.169`) and the latest (`0.3.191`, bundled CLI
`2.1.191`):

- **`initialize()` does not await gateway discovery.** Timing probe (gateway
  `/v1/models` deliberately delayed): `startup()` resolves ~1.5s **before**
  the `/v1/models` response arrives. Discovery is fire-and-forget; the
  discovered models land in `~/.claude/cache/gateway-models.json` *after*
  `this.initialization` has already resolved.
- **`supportedModels()` is a one-shot snapshot** — `return (await
  this.initialization).models` — and there is **no `models_changed` push**
  to refresh it (even though `commands_changed` exists for exactly this
  reason: the SDK's own docs admit `supportedCommands()` is "captured once
  at initialize"). No refresh control request, no "wait for discovery" flag.
- Net: a cold first query's `supportedModels()` returns only built-in
  aliases (`default/sonnet/haiku/...`); discovered models appear only on a
  **subsequent warm-cache startup**. Also `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
  (which proxied `buildOptions` sets) suppresses discovery entirely.

A minimal standalone repro for the upstream team lives outside the repo at
`~/claude-sdk-model-discovery-repro` (fake gateway + cold/warm `startup() →
supportedModels()`; prints "BUG CONFIRMED"). The clean upstream fix is
either (a) await discovery before resolving `initialize`, or (b) emit a
`models_changed` push. **Until Anthropic ships one, we do not route any
model list through `supportedModels()`-via-discovery.**

#### The workaround (this phase)

Establish the seam the future unification needs, and nothing more:

- **One branch point** in `ClaudeAgent`: `_isProxyEnabled()` returns
  `true` (hardcoded) with `// TODO(Phase 19): read RootConfigState
  ClaudeUseCopilotProxy`. Phase 19 flips this to the real
  `IAgentConfigurationService.getRootValue` read.
- **Proxy branch → `ICopilotApiService.models()`** — today's
  `_refreshModels` path, essentially unchanged (`isClaudeModel` filter +
  `toAgentModelInfo` projection, CAPI-dotted `ModelSelection.id`, the
  `is_chat_default` sort, the `tokenAtStart` stale-write guard). No SDK
  bug exposure, no behavior change, no picker regression.
- **Native branch → `Query.supportedModels()`** — **not built here**;
  throws `TODO: Phase 19`. It is unreachable while `_isProxyEnabled()` is
  hardcoded `true`. Phase 19 implements it (built-in catalogue, which
  `supportedModels()` *does* return reliably — the bug only affects
  gateway-*discovered* models, not the built-ins).
- **Shared `→ IAgentModelInfo` projection (light):** keep
  `toAgentModelInfo(CCAModel)` for the proxy branch; Phase 19 adds
  `fromSdkModelInfo(ModelInfo)` for native. Both already target the same
  `IAgentModelInfo` shape, and the effort-schema construction
  (`createClaudeThinkingLevelSchema` / `isClaudeEffortLevel`) is factored
  so both can share it. That shared target + the single branch point is
  what makes the future unification cheap.

**The future "couple lines" once Anthropic fixes the SDK:** point the
**proxy** branch at `supportedModels()` too (through the proxy with
discovery, now that `supportedModels()` is reliable) and delete the
direct-CAPI list call — the native projection already exists, so the
proxied path collapses onto it. Captured here so the intent survives.

#### Scope

- `ClaudeAgent._isProxyEnabled()` (hardcoded `true` + `TODO(Phase 19)`).
- `_refreshModels` (or a renamed `_resolveModels`) branches on it: proxy →
  existing CAPI path; native → `throw new Error('TODO: Phase 19')`.
- Factor the effort/config-schema helpers so a future `ModelInfo`
  projection can share them (no native projection built yet).
- **No** gateway-discovery flag, **no** enumeration query, **no** proxy
  `/v1/models` change, **no** picker-behavior change. Those are all
  retired with the original approach.

**Out of scope** (moved to Phase 19): the real `RootConfigState` toggle
read, the native `supportedModels()` branch + `ModelInfo → IAgentModelInfo`
projection, and (post-SDK-fix) collapsing proxied onto `supportedModels()`.

#### Tests

- `ClaudeAgent` proxied model path unchanged: `models` observable
  populated from a stubbed `ICopilotApiService.models()`, filtered to
  Claude family, default ordering + multiplier/policy metadata intact,
  stale-write guard preserved (the existing
  [claudeAgent.test.ts:757-820](../../test/node/claudeAgent.test.ts) suite
  should pass essentially unchanged).
- `_isProxyEnabled()` returns `true`; the native branch is unreachable
  (a unit test that forces the native branch asserts it throws
  `TODO: Phase 19`).

#### Exit criteria

The model source is selected at one transport-branch point with the proxy
hardcoded on; proxied mode behaves **identically to today** (direct CAPI,
no SDK bug exposure, no picker regression); the native branch is a typed
`TODO: Phase 19` stub; and the effort-schema helpers are factored for
reuse. Re-routing proxied onto `supportedModels()` is a documented
couple-lines follow-up gated on the upstream SDK fix.

### Phase 19 — Direct (non-proxied) Claude access (BYO Anthropic) ✅ **DONE**

> **Status:** ✅ done. Native (BYO-Anthropic) turns authenticate on the user's
> own credentials from the subprocess env — `ANTHROPIC_API_KEY`, or a
> subscription OAuth token in `CLAUDE_CODE_OAUTH_TOKEN` (from `claude
> setup-token`). The interactive `claude login` keychain session is NOT used in
> headless/SDK mode (verified empirically). The Phase 19.1 native-binary-path
> override was explored and removed — it only selects which `claude` build
> runs, never the credentials. This is the first phase that lets the Claude
> provider talk to Anthropic **without** the Copilot proxy in the path —
> using whatever credentials the user already has (an `ANTHROPIC_API_KEY`,
> a `claude login` OAuth session in `~/.claude`, or a Bedrock/Vertex
> configuration). It also adds the agent-host config switch that selects
> between the two transports and quarantines all proxy-only plumbing
> behind it.

#### Motivation

Today the Claude provider is *Copilot-routed Claude*: every `/v1/messages`
call is minted against a GitHub Copilot token, translated by
`ClaudeProxyService`, and billed through CAPI. That is the right default
for Copilot subscribers, but it excludes two populations:

1. Users who have a **direct Anthropic relationship** (API key or Claude
   subscription via `claude login`) and want to spend *that* quota, not
   their Copilot entitlement.
2. Users on networks / orgs where the Copilot CAPI path is unavailable but
   Anthropic (or a Bedrock/Vertex endpoint) is reachable.

This phase makes the proxy **optional**, selected by an agent-host config
property, and proves the SDK runs end-to-end on its own credentials.

#### The things that change when the proxy is removed

The proxy is load-bearing in several places. The **model picker is no
longer one of them** — Phase 18 already unified model acquisition on
`supportedModels()`, so native mode inherits it (see sub-problem 2). The
remaining concerns each need a native analogue or an explicit "not
available in native mode" decision.

1. **Transport + auth into Anthropic.**
   - *Proxied (today):* `buildOptions` sets `settings.env.ANTHROPIC_BASE_URL`
     = `proxyHandle.baseUrl`, `settings.env.ANTHROPIC_AUTH_TOKEN` =
     `<nonce>.<sessionId>`, and `buildSubprocessEnv()` **strips**
     `ANTHROPIC_API_KEY`. The SDK thinks it's talking to Anthropic; it's
     really talking to `127.0.0.1:<port>` → CAPI.
   - *Native (this phase):* do **not** set `ANTHROPIC_BASE_URL` /
     `ANTHROPIC_AUTH_TOKEN`; do **not** strip `ANTHROPIC_API_KEY`; pass the
     user's relevant env through. The SDK uses its own credential
     resolution (env key → CLI OAuth in `~/.claude` → cloud-provider env).
     The SDK reports which it used via `SDKSystemMessage.apiKeySource`
     (`'user' | 'project' | 'org' | 'temporary' | 'oauth'`, sdk.d.ts:116)
     on the `system/init` message — surface this for diagnostics.
   - **`buildOptions` / `buildSubprocessEnv` must take a transport
     descriptor**, not an `IClaudeProxyHandle`. Today the handle is a
     required positional arg (`claudeSdkOptions.ts`). Introduce a
     discriminated `ClaudeTransport =
     { kind: 'proxy'; handle: IClaudeProxyHandle }
     | { kind: 'native'; passthroughEnvKeys: readonly string[] }`
     and branch the env construction on it. Keep `buildSubprocessEnv`'s
     `VSCODE_*` / `ELECTRON_*` / `NODE_OPTIONS` stripping in **both**
     modes (those are agent-host hygiene, unrelated to Anthropic auth);
     only the `ANTHROPIC_API_KEY` strip is proxy-mode-only.

2. **The model picker — build the native branch + flip the seam.**
   - Phase 18 laid only a **seam**: `ClaudeAgent._isProxyEnabled()` hardcoded
     `true`, proxy branch on `ICopilotApiService.models()`, native branch a
     `TODO: Phase 19` stub. (The original gateway-discovery unification was
     abandoned — confirmed SDK bug; see Phase 18.) Phase 19 finishes it.
   - **Flip the flag to the real read:** `_isProxyEnabled()` →
     `IAgentConfigurationService.getRootValue(..., ClaudeUseCopilotProxy)`
     (defaulting `true`), the same `_transportMode` resolution the config
     switch below describes.
   - **Build the native branch:** `Query.supportedModels()` →
     `ModelInfo → IAgentModelInfo` projection (the `fromSdkModelInfo`
     Phase 18 left unbuilt), reusing the factored effort-schema helpers.
     With **no** `ANTHROPIC_BASE_URL` and **no**
     `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`, `supportedModels()`
     returns the SDK's **built-in** catalogue reliably (the SDK bug only
     affects gateway-*discovered* models, not built-ins — verified). This
     needs the model-enumeration query lifecycle (provider-scoped,
     memoized, `startup() → query(neverYield) → supportedModels()` →
     dispose, ephemeral `CLAUDE_CONFIG_DIR`) that Phase 18 deferred.
   - **No commercial-metadata overlay in native mode** — multiplier /
     policy / default ordering are Copilot/CAPI concepts; native
     `IAgentModelInfo` entries omit them.
   - Native ids are SDK-canonical end to end (`m.value`); `toSdkModelId`
     is an identity at the native seam.
   - **Post-SDK-fix unification (separate follow-up, not Phase 19):** once
     Anthropic fixes the discovery-before-init bug, point the **proxy**
     branch at `supportedModels()` through the proxy too and delete the
     direct-CAPI list call — a couple of lines, since the native
     projection now exists.

3. **Per-turn cost / "tracking between requests".**
   - *Proxied (today):* the proxy is the **only** place that sees CAPI's
     real billed credits (`copilot_usage.total_nano_aiu`), because the SDK
     `result` strips them. `onDidReportCredits` routes each report (keyed
     by the `sessionId` decoded from the Bearer token) to
     `ClaudeAgentSession.recordTurnCredits`, accumulated per turn and
     injected into the `ChatUsage` signal as `_meta.copilotUsage` by
     `_enrichSignalWithCredits`.
   - *Native (this phase):* there is no proxy and no `copilot_usage` —
     CAPI is not billing. The relevant signal is the SDK's own `result`
     message: token `usage` and `total_cost_usd` (an Anthropic-list-price
     estimate; M8). Native turns surface **SDK usage / cost** instead of
     Copilot credits:
     - `recordTurnCredits` / `_enrichSignalWithCredits` are **proxy-only**
       and must no-op in native mode (the agent simply never wires the
       `onDidReportCredits` subscription when the session's transport is
       native).
     - The `ChatUsage` signal in native mode carries the SDK `result`
       usage/cost the live mapper already extracts (M8 — usage is
       live-only; replayed native turns have `usage === undefined`, same
       asymmetry as today).
   - **No cross-request bearer correlation is needed in native mode.** The
     proxy's `<nonce>.<sessionId>` Bearer existed *only* to attribute
     CAPI requests back to a session at the proxy seam. With no proxy,
     the SDK subprocess already belongs to exactly one
     `ClaudeAgentSession` (one `Query` per session), so turn/usage
     attribution is intrinsic — the session reads its own `result`
     messages. This is the answer to "how do we track between requests
     without the proxy": **we don't have to — the per-session subprocess
     is the attribution boundary the proxy Bearer was emulating.**

4. **Auth gating + protected resources.**
   - *Proxied (today):* `authenticate()` requires the
     `GITHUB_COPILOT_PROTECTED_RESOURCE` token; without it
     `_ensureAuthenticated()` throws `AHP_AUTH_REQUIRED` and the proxy is
     never started. `getProtectedResources()` advertises GitHub Copilot +
     GitHub repo.
   - *Native (this phase):* the GitHub Copilot token is **not** required to
     reach Anthropic. The provider must not block session creation behind a
     Copilot sign-in it will never use. Decisions:
     - `getProtectedResources()` in native mode drops
       `GITHUB_COPILOT_PROTECTED_RESOURCE` (keep
       `GITHUB_REPO_PROTECTED_RESOURCE`, which is about repo access for
       git operations, not model auth). The workbench renders auth prompts
       from this list, so dropping it removes the spurious Copilot
       sign-in.
     - `_ensureAuthenticated()` becomes mode-aware: native mode is
       "authenticated" once the agent is constructed (the SDK owns its own
       credential check and will surface a clear `result` error if the
       user has no usable Anthropic credential — map that to a turn error,
       do **not** try to pre-validate the key in the host).
     - **Credential-absent UX:** if the SDK's first turn fails because no
       credential resolved (`apiKeySource` unavailable / 401 from
       Anthropic), surface a targeted error telling the user to set
       `ANTHROPIC_API_KEY` or run `claude login`, rather than a generic
       stream failure. (Pre-flighting the credential without a turn is out
       of scope — the SDK has no cheap "am I authed" probe short of a
       warm query.)

#### The config switch — a RootConfigState property

The transport is selected by a **`RootConfigState` property on the agent
host**, not by a workbench `chat.agentHost.*` setting or an env var. This
is the Agent Host Protocol's own config surface: `rootState.config` is a
`{ schema, values }` bag the host broadcasts to every connected client
over AHP and persists to `agent-host-config.json`. It is read/written
through `IAgentConfigurationService` (`getRootValue` / `updateRootConfig`
/ `onDidRootConfigChange`) and described by a JSON schema so clients can
render and edit it generically. The existing
`EnableCustomTerminalTool` / `RubberDuck` / `Opus48Prompt` keys are
exactly this mechanism.

Why RootConfigState rather than the `claudeAgent.enabled` setting+env
pattern:

- **It's the host's own config plane.** The toggle is a property of *the
  agent host* (it changes how the host talks to Anthropic), not a
  workbench preference that has to be marshalled across the process
  boundary. `ClaudeAgent` already injects `IAgentConfigurationService`
  and reads other root values; it reads this one the same way — **no new
  VS Code setting, no `VSCODE_AGENT_HOST_*` env var, no
  `nodeAgentHostStarter` forwarding.**
- **It works identically for local and remote/headless hosts.** A remote
  operator edits `agent-host-config.json` (or any AHP client writes it via
  `updateRootConfig`); a workbench client renders the schema-described
  property in its host-config UI. One code path, no precedence rules to
  reconcile between a setting and a root-config fallback.
- **It's reactive.** `onDidRootConfigChange` already fires on
  `RootConfigChanged`, so `ClaudeAgent` can re-resolve its transport mode
  live (subject to the restart semantics below) instead of only at
  process start.

Concretely:

- **New `AgentHostConfigKey`** (e.g. `ClaudeUseCopilotProxy =
  'claudeUseCopilotProxy'`) declared in
  [`agentHostCustomizationConfig.ts`](../../common/agentHostCustomizationConfig.ts)
  with a `schemaProperty<boolean>({ ..., default: true })`, **default
  `true`** so existing Copilot users are unaffected. It joins the schema
  merged into `rootState.config` by the `AgentConfigurationService`
  constructor.
  - *Naming open question:* the key is Claude-specific today, but the
    "use the Copilot proxy vs. bring-your-own credentials" axis may
    generalise to Codex later. Decide whether to namespace it
    (`claudeUseCopilotProxy`) or model a more general transport key now.
    Leaning Claude-specific for v1 to avoid speculative generality.
- **`ClaudeAgent` reads it** via
  `this._configurationService.getRootValue(agentHostCustomizationConfigSchema,
  AgentHostConfigKey.ClaudeUseCopilotProxy)` (defaulting to `true` when
  absent) to resolve `_transportMode`, and subscribes to
  `onDidRootConfigChange` to react to edits.
- **No env var, no setting, no starter change.** This deletes the
  `VSCODE_AGENT_HOST_CLAUDE_USE_COPILOT_PROXY` /
  `chat.agentHost.claudeAgent.useCopilotProxy` plumbing the earlier draft
  proposed.
- **Scope: host-level for v1.** All sessions on the host share one
  transport. Per-session transport selection (a session config key, so a
  user could run one chat on Copilot quota and another on their own key)
  is a deliberate **follow-up** — it interacts with restored-session
  transport identity (below) and the picker would need to show two model
  catalogues at once.

#### Where the branch lives (don't scatter it)

The transport choice should resolve **once** into a `ClaudeTransport`
value and flow as data; avoid re-reading the config in five places.

- `ClaudeAgent` resolves the `ClaudeUseCopilotProxy` root value into a
  `_transportMode: 'proxy' | 'native'` and keeps it current by listening to
  `IAgentConfigurationService.onDidRootConfigChange`. **Live-flip
  semantics:** a mode change applies to *new* sessions immediately; already
  materialised sessions keep the transport they started with until they
  restart (their subprocess env is fixed at `buildOptions` time). Document
  this — don't try to hot-swap a running subprocess between proxy and
  native.
- Proxied mode keeps today's behaviour: acquire `IClaudeProxyHandle` in
  `authenticate()`, wire `onDidReportCredits`, advertise the Copilot
  protected resource, populate models from CAPI.
- Native mode: skip the proxy handle entirely (do **not** call
  `IClaudeProxyService.start`), skip the credits subscription, drop the
  Copilot protected resource, populate models via Phase 18's
  `supportedModels()` path **with the gateway-discovery flag off** (no
  CAPI, no commercial-metadata overlay).
- The mode is threaded into the session as part of the materialize inputs
  so `buildOptions` receives a `ClaudeTransport` instead of a bare proxy
  handle. `ClaudeAgentSession` already owns the abort controller, model,
  and permission mode — the transport joins that bag.
- **`IClaudeProxyService` stays a DI singleton** constructed unconditionally
  in `agentHostMain.ts` (cheap until `start()` is called). Native mode
  simply never calls `start()`, so no proxy server ever binds. Do **not**
  gate the service registration on the toggle — that would couple service
  wiring to runtime config and complicate the proxied default.

#### Restored-session transport identity (the subtle one)

A session's transport is part of its identity for replay/continuation:

- A session **created** under proxied mode whose transcript is later
  continued under native mode (user flipped the toggle) would resume a
  conversation billed one way and continue it the other. The SDK doesn't
  care (it's the same JSONL), but **model ids may not resolve**: a proxied
  session stored CAPI-dotted `ModelSelection.id`s; native resume expects
  SDK-canonical. `toSdkModelId` already normalises proxied→SDK, so resume
  *should* work, but the **model picker** for a resumed cross-mode session
  must show the catalogue matching the *current* transport, and a
  stored model id absent from that catalogue must degrade gracefully
  (fall back to the current default, don't hard-fail the resume).
- **Decision for v1:** transport is host-level and resolved live, so a
  restored session adopts whatever mode the host is in *now*. Persist the
  `apiKeySource` / transport used per turn in session metadata for
  diagnostics, but do **not** pin a session to its creation-time
  transport in v1. Revisit if per-session transport lands.

#### Scope checklist

- `ClaudeTransport` discriminated union + `buildOptions` /
  `buildSubprocessEnv` refactor to consume it (replace the required
  `IClaudeProxyHandle` arg).
- `AgentHostConfigKey.ClaudeUseCopilotProxy` RootConfigState property
  (schema + `default: true`) in `agentHostCustomizationConfig.ts`;
  `ClaudeAgent` resolves `_transportMode` via `getRootValue` and reacts to
  `onDidRootConfigChange`. No setting, env var, or starter change.
- `ClaudeAgent._transportMode`, mode-aware `authenticate`,
  `getProtectedResources`, `_ensureAuthenticated`, and the
  `onDidReportCredits` subscription gating.
- Native model path: **build the native branch Phase 18 stubbed.** Flip
  `_isProxyEnabled()` to the real `RootConfigState` read; implement
  `Query.supportedModels()` → `fromSdkModelInfo` projection (built-in
  catalogue, no discovery flag, no overlay) + the provider-scoped
  memoized enumeration-query lifecycle (ephemeral `CLAUDE_CONFIG_DIR`).
- Native usage path: `recordTurnCredits` / `_enrichSignalWithCredits`
  no-op in native; `ChatUsage` carries SDK `result` usage/cost.
- Credential-absent error mapping (no key / 401 → actionable message).
- Surface `apiKeySource` from `system/init` for diagnostics + per-turn
  metadata.

#### Tests

- `buildOptions` native branch: no `ANTHROPIC_BASE_URL` /
  `ANTHROPIC_AUTH_TOKEN`; `ANTHROPIC_API_KEY` **not** stripped;
  `VSCODE_*` / `ELECTRON_*` / `NODE_OPTIONS` still stripped.
- `buildOptions` proxy branch unchanged (regression snapshot).
- Transport resolution: `ClaudeUseCopilotProxy` root value `false` →
  native; `true` or absent → proxied default; `onDidRootConfigChange`
  flipping the value updates `_transportMode` for subsequent sessions.
- `ClaudeAgent` native mode: `authenticate` does not call
  `IClaudeProxyService.start`; `getProtectedResources` omits Copilot;
  `models` populated from a stubbed `supportedModels()` (dedicated
  enumeration query) without any CAPI call; enumeration query is disposed
  and never appears in `listSessions`; `onDidReportCredits` never
  subscribed.
- Model enumeration failure (SDK load / credential error) → `models`
  stays empty and an actionable error surfaces (no static fallback).
- Native `ChatUsage` carries SDK `result` usage and **no**
  `_meta.copilotUsage`; proxied `ChatUsage` still carries it.
- Integration: stub `IClaudeAgentSdkService` so a native session runs a
  full turn with a faked `system/init` (`apiKeySource: 'oauth'`) +
  `result` and asserts the signal sequence + usage shape, with **no**
  proxy server bound.
- Credential-absent: SDK first turn fails 401 → actionable error signal.

#### Manual E2E

- With the `claudeUseCopilotProxy` RootConfigState value set to `false`
  (via `agent-host-config.json` or a client `updateRootConfig`) and a real
  `ANTHROPIC_API_KEY` (or `claude login`), the Claude provider lists
  models **enumerated from `supportedModels()`** (verify the ids match the
  user's plan, not the CAPI catalogue), runs a turn, streams output, and
  renders SDK cost — with the proxy port never bound (verify via logs /
  `lsof`).
- Flip the root value back to `true` → Copilot-routed behaviour returns
  for new sessions, proxy binds, credits render.
- Resume a session created in one mode under the other → picker shows the
  current-mode catalogue, resume succeeds, missing model id degrades to
  the default.

#### Exit criteria

A user can set one config property to run the Claude provider entirely on
their own Anthropic credentials with no Copilot token, CAPI call, or proxy
server in the path; the model picker is populated without CAPI; per-turn
cost surfaces from the SDK `result`; and all proxy-only plumbing
(credits, Bearer correlation, `ANTHROPIC_BASE_URL` injection, Copilot
protected resource) is cleanly quarantined behind the `'proxy'` transport
mode. The proxied path remains the unchanged default.

#### Open questions (settle in the phase plan)

- **Model-enumeration query lifecycle** — owned by Phase 18 (start
  timing, `cwd`, cache duration, restart persistence, harvest from first
  real `Query`). Native inherits whatever Phase 18 lands; the only native
  consideration is re-enumeration on credential change.
- **Cloud providers** — do we explicitly support / document
  Bedrock (`CLAUDE_CODE_USE_BEDROCK`) and Vertex
  (`CLAUDE_CODE_USE_VERTEX`) env passthrough in native mode, or only the
  direct-Anthropic key + OAuth paths for v1?
- **Credential discovery for UX** — can the host cheaply tell *whether*
  any Anthropic credential exists (to pre-disable the provider or warn)
  without spending a turn? Likely no clean probe; confirm.
- **Per-session transport** — defer, but record the metadata now so the
  follow-up doesn't require a migration.
- **`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` in native mode** — in
  proxied mode it's a Copilot leak-tightness guarantee. In native mode
  it's the user's own Anthropic account; do we keep disabling
  nonessential traffic (privacy-preserving default) or respect the
  user's normal CLI behaviour? Leaning keep-disabled.

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

- **Anthropic-direct authentication via the proxy** (`x-api-key` against
  api.anthropic.com *through `ClaudeProxyService`*). The proxy is
  Copilot-routed only and ignores `x-api-key` by design. Direct Anthropic
  access is instead delivered by **Phase 19's native transport**, which
  removes the proxy from the path entirely rather than teaching it to
  forward personal keys.
- **Re-implementing the Anthropic SDK ourselves.** We host the official
  Claude Agent SDK and proxy beneath it; we re-use `@anthropic-ai/sdk`
  types.
- **In-place `truncateSession`.** SDK's `forkSession` always mints a new
  session ID. Clients will use `createSession({ fork })` for truncate-like
  effect once Phase 6.5 lands; we revisit in-place truncate if there's
  demand.
- **File rewind as part of `truncateSession`.** Per-file undo is exposed
  via `resourceRead` / `resourceWrite` URIs (Phase 8).
- **Custom subprocess sandboxing** via `spawnClaudeCodeProcess`. The Agent
  Host itself is the isolation boundary.
- **Including `managed` in `settingSources`.** Match the reference's
  `['user', 'project', 'local']`. Revisit if managed-policy users complain.
  Phase 17's hook + native-plugin disk scan follows the same exclusion —
  `managed`-policy hooks and plugins are not surfaced.
- **Tracking Bash-tool file edits** in Phase 8. Documented gap;
  follow-up if needed.
- **Per-session GitHub token** in the proxy. Single-tenant for v1.
- **Cross-agent feature parity at every step.** Phases 4–14 catch up to
  `CopilotAgent` incrementally; gaps are acceptable mid-flight.
