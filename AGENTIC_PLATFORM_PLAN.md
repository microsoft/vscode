# Son of Anton — Agentic Platform Plan

> Status: proposal · Owner: TBD · Last updated: 2026-05-01

This document captures a deep-dive review of the Son of Anton agentic stack and a concrete, sequenced plan to evolve it into a production-ready platform whose centre of gravity is **seamless integration of subscription-based coding services** — Claude (Pro/Team/Max), OpenAI Codex / ChatGPT Plus, and GitHub Copilot — with **low-latency, fully streamed** responses across the UI.

The plan is organised so that each phase produces a working, demoable slice. Items are tagged with a priority (P0–P3) and an effort estimate. Filenames are concrete pointers into the existing codebase.

---

## 1. Executive summary

Son of Anton's foundation is more developed than typical for a VS Code fork: indexer, mcp-gateway, model-router, lsif, context-sanitiser, checkpoints, and build-dag are all real implementations rather than stubs; prompt caching is wired into `LlmClient`; the model router preserves `cache_control` directives across format translation. That gives us a real starting line.

The dominant gap is that the platform today only knows how to talk to provider APIs via personal API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`). For the product to be useful to developers who already pay for Claude, ChatGPT, or Copilot, we need three things to land together:

1. A **credential broker** in the IDE that owns OAuth flows and stores tokens in the OS keychain.
2. **Provider adapters** in `model-router` — one per subscription — that fetch credentials from the broker, translate to/from a uniform request/event shape, and pass streaming responses through unchanged.
3. **End-to-end streaming** through the chat UI, so the latency penalty of subscription-routed traffic (Copilot adds ~300ms; Codex via the ChatGPT backend more) is hidden behind perceived responsiveness.

Without these three landing together, no individual one delivers user-visible value. They form a coherent first phase.

After that phase, several second-order improvements become the right next focus: real embeddings (the current provider is a mock), multi-session UI to make the orchestrator/specialist pattern usable, cost and quota visibility, observability, and a handful of correctness fixes (an undefined agent referenced in hooks, sanitiser not on the hot path, etc.).

The rest of this document is the detailed plan.

---

## 2. Goals and non-goals

### Goals

- A user with **only a Claude.ai subscription** can install Son of Anton, log in via their browser, and chat with Opus/Sonnet/Haiku without ever seeing an API key.
- A user with **only a ChatGPT Plus subscription** can do the same against Codex models.
- A user with **only a GitHub Copilot subscription** can do the same against Copilot's hosted Claude/GPT/Gemini models.
- A user can connect **multiple providers simultaneously** and see per-agent routing decisions (e.g. "orchestrator: Opus via Claude Pro; code: Sonnet via Copilot").
- **First token under 1.0s p50** for cached requests against any connected provider.
- Streaming text, streaming tool calls, streaming thinking blocks all visible in the chat UI as they arrive.
- Failure of any one provider falls back transparently to another connected provider with zero data loss mid-stream.
- API-key flows continue to work for power users and CI environments.

### Non-goals

- We are not building our own authentication server. All OAuth flows go directly to the provider.
- We are not proxying provider traffic through any cloud service we operate. Auth and inference both originate from the user's machine.
- We are not implementing offline / on-device inference in this phase. Local model support is a future concern.
- We are not changing the agent definition surface (`AgentParticipants.ts`) in this phase. Specialists and orchestrator stay as they are.
- We are not adding a billing/metering layer. Cost visibility is read-only against what providers expose.

---

## 3. Current state — review findings

The detailed review that informed this plan is summarised here. Each finding is referenced by ID later in the rollout.

### 3.1 Code intelligence pipeline (`services/indexer`, `services/lsif`, `services/build-dag`, `services/context-sanitiser`)

- **F-1 [P0]** Embedding provider is a **mock** producing deterministic SHA-256 pseudo-vectors. Config exposes `mock | voyage | local` but only mock is implemented (`services/indexer/src/embedding/embeddingWriter.ts`). Every "semantic search" result today is meaningless; benchmarks are misleading.
- **F-2 [P1]** Embedding cache is keyed by chunk ID (file path + symbol name). Renaming or moving a function invalidates an embedding whose content is unchanged. Should be keyed by content hash with a separate chunk-ID → hash mapping.
- **F-3 [P1]** Hybrid retrieval scoring (`semanticSearch.ts`) combines `0.8 * semantic + 0.2 * log2(1 + inDegree) / 10`. No recency signal, no path-proximity signal, no per-agent weighting. Weights should be configurable per agent role.
- **F-4 [P1]** Context sanitiser only runs as a background workspace scan (`WorkspaceScanner`). Model-bound payloads from mcp-gateway are never sanitised. Real prompt-injection vectors are open.
- **F-5 [P2]** Sanitiser performance: buffers entire request bodies, runs 127 regexes line-by-line synchronously. Hundreds of ms on the critical path for large contexts.
- **F-6 [P2]** LSIF runners run sequentially per language in `services/lsif/src/pipeline.ts`. Three languages = 3× wall time.
- **F-7 [P2]** Build-DAG keeps state in an in-memory `DagStore`; lost on restart and unjoinable with the code graph in FalkorDB. Should persist as `:Target -[:DEPENDS_ON]-> :Target` / `:Target -[:BUILDS]-> :File` edges.

### 3.2 Model router and prompt caching (`services/model-router`)

- **F-8 [P0]** Only API-key auth. No OAuth, no token refresh, no credential broker. Single biggest gap.
- **F-9 [P1]** `MetricsCollector` records latency, tokens, cost (including `cache_read_input_tokens`) but no `/metrics` endpoint exposes them. Both Prometheus and JSON variants needed.
- **F-10 [P1]** No cache-hit-rate observation per request. Without this we cannot tune the system-prompt / CLAUDE.md / graph-context cache layering described in CLAUDE.md.
- **F-11 [P2]** mcp-gateway issues one FalkorDB query per tool call with no in-flight deduplication. Concurrent identical requests fan out.
- **F-12 [P2]** `cache_control` breakpoints are added ad-hoc in `LlmClient.ts`. Should be a `buildCachedRequest()` helper that takes four named slots (system-prompt, CLAUDE.md, graph-context, dynamic) and emits ≤4 breakpoints in the right order.

### 3.3 Sessions UI (`src/vs/sessions/`)

- **F-13 [P0]** Chat UI does not stream — `newChatViewPane.ts` batches and dumps. No token streaming, no live tool calls, no thinking blocks. Single biggest perceived-quality regression vs. competitors.
- **F-14 [P0]** Single active session model. `ISessionsManagementService.activeSession` is singular. The orchestrator/specialist architecture cannot show multiple concurrent agents — its main value is invisible.
- **F-15 [P1]** No cost / quota / rate-limit visibility anywhere in the UI. CLAUDE.md's "configurable spend cap and kill switch" is unreachable.
- **F-16 [P1]** Errors are silent: `newChatViewPane.ts` line 1054–1062 logs them and shows nothing to the user.
- **F-17 [P2]** Diff/review is comment-based (`changesView.ts`, `codeReviewService.ts`). No per-hunk accept/reject. The merge editor's hunk widgets exist and could be reused.
- **F-18 [P2]** Agent invocation depends on keyboard shortcut (Cmd/Ctrl+L) and a sidebar entry gated by GitHub auth. No command-palette entries for common tasks; no slash-command surface in the chat input.
- **F-19 [P2]** `src/vs/sessions/prompts/` contains a single file (`create-pr.prompt.md`). Should be the slash-command registry.

### 3.4 Agent / hook / MCP wiring

- **F-20 [P1]** `.son-of-anton/hooks.json` references `anton-pentest` in two hooks but no such agent is registered in `extensions/son-of-anton/src/agents/AgentParticipants.ts`. Silent failure.
- **F-21 [P2]** No load-time validation that hook agent IDs map to registered participants.
- **F-22 [P2]** `.agents/skills/` is empty. Either delete or seed with high-value skills (`pr-review`, `add-tests`, etc.).
- **F-23 [P3]** Specialists cannot spawn sub-agents. Capability gap blocked behind the multi-session UI work in F-14.

### 3.5 Observability and dev loop

- **F-24 [P1]** Only model-router has a metrics module; no service exposes a metrics endpoint. Add a shared `services/_lib` exporter and apply uniformly.
- **F-25 [P2]** No cross-service tracing. A single agent request spans IDE → router → mcp-gateway → FalkorDB → Qdrant → sanitiser → provider. No correlation ID; debugging is painful.
- **F-26 [P2]** No services-integration CI job. CLAUDE.md's "integration tests must run against the Docker Compose stack" is aspirational.
- **F-27 [P3]** Some services still have legacy `index.js` files alongside their TypeScript implementation (`indexer`, `lsif`, `mcp-gateway`, `penetration-tester`, `spec-pipeline`). Audit and remove if stale.

---

## 4. Target architecture

### 4.1 High level

```
┌─ IDE renderer (Electron) ─────────────────────────────────┐
│                                                           │
│  Auth wizard / connected-accounts settings                │
│  CredentialBroker  ── owns OAuth flows                    │
│      │                                                    │
│      ▼                                                    │
│  vscode.SecretStorage  (Keychain / Credential Vault /     │
│                         libsecret)                        │
│                                                           │
│  Chat UI                                                  │
│      ↑ uniform event stream (text/tool/thinking/usage)    │
│      │                                                    │
│  newChatViewPane.ts  +  changesView                       │
│                                                           │
└──────────────────────┬────────────────────────────────────┘
                       │ localhost-only
                       │ (Unix socket / named pipe)
                       ▼
┌─ services/model-router ───────────────────────────────────┐
│                                                           │
│  Inbound: agent request (uniform shape)                   │
│      │                                                    │
│      ▼                                                    │
│  Routing layer (existing)  →  picks provider+model        │
│      │                                                    │
│      ▼                                                    │
│  ProviderAdapter registry                                 │
│   ├─ AnthropicOAuth      ─┐                               │
│   ├─ AnthropicApiKey      │                               │
│   ├─ ChatGPTOAuth         ├── credential lookup via       │
│   ├─ OpenAIApiKey         │   localhost broker            │
│   ├─ Copilot              │                               │
│   └─ OpenRouter          ─┘                               │
│      │                                                    │
│      ▼                                                    │
│  Each adapter:                                            │
│   - normalises outbound request                           │
│   - opens streaming SSE to provider                       │
│   - translates inbound events → uniform event shape       │
│   - records latency, tokens, cache hits, cost             │
│                                                           │
└──────────────────────┬────────────────────────────────────┘
                       │ HTTP/2 keep-alive pool per provider
                       ▼
                  Provider edge
```

### 4.2 Key invariants

- **The router never persists tokens.** It holds them in process memory only for the lifetime of an in-flight request. On 401, it re-asks the broker.
- **The broker is the only component that touches OS keychain APIs.** Process boundary protects credentials.
- **One uniform event shape** flows from every adapter into the rest of the system. Agents downstream are provider-agnostic.
- **Streaming is end-to-end.** No layer buffers a complete response when streaming is available from the provider.

### 4.3 Uniform event shape

The single most leveraged piece of this plan. Every provider adapter emits this shape; everything above the adapter consumes only this shape.

```ts
type AgentEvent =
  | { type: 'message_start';      requestId: string; provider: string; model: string }
  | { type: 'text_delta';         text: string }
  | { type: 'tool_use_start';     toolUseId: string; name: string; input?: unknown }
  | { type: 'tool_use_delta';     toolUseId: string; partialInput: string }
  | { type: 'tool_use_stop';      toolUseId: string }
  | { type: 'thinking_delta';     text: string; signature?: string }
  | { type: 'usage';              inputTokens: number; outputTokens: number;
                                  cacheCreationInputTokens?: number;
                                  cacheReadInputTokens?: number }
  | { type: 'message_stop';       stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error' }
  | { type: 'error';              code: string; message: string; retryable: boolean };
```

This is intentionally close to Anthropic's event shape — it has the most expressive set (cache tokens, thinking, fine-grained tool deltas). OpenAI/Copilot adapters synthesise events to fit; missing data is `undefined`, not invented.

---

## 5. Provider adapters

Implementation notes for each adapter. All live under `services/model-router/src/providers/`.

### 5.1 Anthropic OAuth (Claude Pro / Team / Max) — **P0** · 2–3 days

- OAuth 2.0 + PKCE against `https://claude.ai/oauth/authorize`.
- Token lifecycle:
  - Initial flow handled by IDE; broker stores `access_token`, `refresh_token`, `expires_at`.
  - Adapter requests fresh access token from broker before each model call.
  - On 401, adapter invalidates its cached token and re-asks; broker performs refresh transparently.
- Wire format identical to Anthropic API. `Authorization: Bearer ...` instead of `x-api-key`.
- `anthropic-version` header pinned to a known-good version.
- Streaming via SSE — already supported. `cache_control` works identically. Tool use works identically.
- Quota: response headers expose `anthropic-ratelimit-*`. Adapter records and forwards to UI.
- Telemetry header `User-Agent: SonOfAnton/<version>` so we can see ourselves on the provider side if needed.

### 5.2 ChatGPT OAuth (Codex / ChatGPT Plus) — **P0** · 3–4 days

- OAuth via `auth.openai.com`. Browser flow returns a session token.
- Talks to ChatGPT's backend, *not* the standard OpenAI API. Different base URL, different request shape, different model IDs (`gpt-5-codex`, `o4-mini`, etc. as available).
- Streaming: SSE, but event shape differs from `chat.completions` API. Adapter contains the largest event-translation layer.
- Tool use: ChatGPT's function-calling shape; mappable to the uniform shape but with care around streamed-argument buffering.
- Quota: subscription has implicit per-window limits; surface from response headers where present.
- The protocol drift here is the time-sink. Build a small fixture-based test suite from captured SSE streams before writing the adapter.

### 5.3 GitHub Copilot — **P1** · 2 days

- VS Code's `vscode.authentication.getSession('github', [...scopes])` already works in the fork. Add `copilot` scope.
- Exchange GH OAuth token for a Copilot session token at `https://api.github.com/copilot_internal/v2/token`. Token lifetime ~30 min — refresh proactively at T-5min, never on 401.
- Inference endpoint: `https://api.githubcopilot.com/chat/completions`. Streaming SSE in OpenAI format. Mostly compatible with the existing OpenAI adapter.
- Copilot hosts multiple model families (Claude variants, GPT variants, Gemini). Surface available models by hitting the models list endpoint; cache per session.
- Headers: `Editor-Version`, `Editor-Plugin-Version`, `Copilot-Integration-Id` per Copilot's expectations.
- This is a fast win because most VS Code users already have a Copilot subscription and most of the auth surface is inherited from upstream.

### 5.4 Anthropic API key (existing) — **P1** · refactor only

- Keep functioning. Demote in the auth wizard ordering. Reuse the Anthropic OAuth wire path with header swap.

### 5.5 OpenAI API key (existing) — **P1** · refactor only

- Keep functioning. Same demotion logic.

### 5.6 OpenRouter (existing) — **P1** · refactor only

- Keep functioning. Useful for model-comparison and access to long-tail models.

### 5.7 Adapter contract

Every adapter implements:

```ts
interface ProviderAdapter {
  readonly id: string;                          // 'anthropic-oauth' | 'copilot' | ...
  readonly displayName: string;
  isAvailable(): Promise<boolean>;              // does broker have a credential?
  listModels(): Promise<ModelDescriptor[]>;
  send(req: UniformRequest, signal: AbortSignal): AsyncIterable<AgentEvent>;
}
```

The `send` method is an async generator — backpressure flows naturally up through the IDE.

---

## 6. Credential broker

New code in `extensions/son-of-anton/src/auth/`.

### 6.1 Responsibilities

- Owns the OAuth flow for each provider that supports OAuth.
- Persists tokens in `vscode.SecretStorage`.
- Refreshes tokens on demand.
- Exposes a localhost-only RPC consumed by `model-router`.
- Enforces single-active-IDE: refuses to serve a token if a different IDE process is the active session for that workspace.

### 6.2 Transport

- **Unix domain socket** on macOS/Linux at `$XDG_RUNTIME_DIR/son-of-anton-broker.sock`.
- **Named pipe** on Windows at `\\.\pipe\son-of-anton-broker-<userSid>`.
- Never TCP. No port allocation, no cross-origin concerns, no firewall prompts.
- Authentication: peer-credentials check via `SO_PEERCRED` (Linux) / `LOCAL_PEERCRED` (macOS) / `GetNamedPipeClientProcessId` (Windows). Only same-user processes are allowed.

### 6.3 RPC surface

```ts
// All requests carry { providerId: string, requestId: string }
broker.getToken({ providerId })
  → { token: string, expiresAt: number, headers?: Record<string,string> }

broker.invalidate({ providerId })
  → { ok: true }

broker.refresh({ providerId })           // optional explicit refresh
  → { ok: true }

broker.status()
  → { providers: Array<{ id, connected, expiresAt?, displayName }> }

broker.connect({ providerId })           // initiates OAuth flow in IDE
  → { ok: true }                          // resolves after browser round-trip

broker.disconnect({ providerId })
  → { ok: true }
```

### 6.4 Failure semantics

- If broker is down, router responds 503 with `Retry-After: 1` to the IDE. IDE shows "Connection to credential broker lost" with a "Restart broker" action.
- If a token cannot be refreshed (refresh token expired/revoked), broker emits a `provider-disconnected` event over a long-lived event stream that the IDE listens to; IDE prompts re-auth.

---

## 7. End-to-end streaming

Three pieces, all of which must land together to be useful.

### 7.1 Provider adapters emit the uniform event stream

Covered in §4.3 and §5. No adapter buffers a complete response when streaming is available. Adapters use `undici`'s native streaming.

### 7.2 mcp-gateway streams tool results

Today `services/mcp-gateway/src/server.ts` returns complete tool responses. For long operations (semantic search across the whole repo, lsif rebuild, deep `find_references`) the agent waits.

Switch tool handlers to async generators:

```ts
async function* handleSemanticSearch(args): AsyncIterable<ToolResultChunk> {
  yield { kind: 'progress', message: 'Embedding query...' };
  const results = await embedAndSearch(args);
  for (const batch of chunk(results, 10)) {
    yield { kind: 'partial', items: batch };
  }
  yield { kind: 'done' };
}
```

The MCP transport already supports SSE; tool results become chunked SSE messages with `event: progress` / `event: partial` / `event: done`.

### 7.3 Chat UI consumes the uniform event stream

`src/vs/sessions/contrib/chat/browser/newChatViewPane.ts` rewrite:

- A `<MessageRenderer>` component that owns one `AgentEvent` async iterator.
- Text deltas append to a live text node — no React-style diffing on every token; use a persistent text element with `appendChild(textNode)`.
- `tool_use_start` opens a collapsible card; `tool_use_delta` fills the JSON arguments as they stream; `tool_use_stop` finalises and shows the tool result inline once mcp-gateway returns.
- `thinking_delta` renders into a muted, collapsed-by-default panel above the response.
- `usage` events update a per-message cost chip in real time.
- `error` events render inline with a "Retry" button (failover to next available provider; see §10.6).

Cancel button on every active message wires to `AbortSignal` propagated all the way down to `adapter.send(req, signal)` — the provider connection is closed mid-stream, freeing quota immediately.

---

## 8. Latency optimisations

These compound — none alone is decisive but together they materially change perceived speed.

### 8.1 Aggressive prompt caching against Anthropic OAuth

Claude subscriptions support `cache_control` identically to API. The cached tier should be:

1. **System prompt** (fully static) — break here.
2. **CLAUDE.md** (static per session) — break here.
3. **Graph context** (semi-static for a given task) — break here.
4. **Dynamic content** (the user message and recent turns).

Existing `LlmClient.ts` adds `cache_control: ephemeral` ad-hoc; replace with `buildCachedRequest({ systemPrompt, projectMemory, graphContext, conversation })` (per F-12) to make this declarative and verifiable in tests.

### 8.2 Copilot CAPI keep-warm

First request after a Copilot token refresh is ~200ms slower because the edge wakes up. Refresh tokens proactively at T-5min, never on 401. Also send a small `models` query immediately after refresh to warm the connection.

### 8.3 Connection pooling

`undici` agent with `keepAliveTimeout: 60_000`, `connections: 8`, `pipelining: 1`. One pool per provider. Cuts ~80ms off Anthropic round-trips by avoiding TLS handshake.

### 8.4 Endpoint probing

On startup and every 30 minutes:

- Anthropic: probe `/v1/messages?dryRun=1` (or a tiny known-cheap call) against each available regional endpoint; pin to fastest.
- Copilot: GitHub edges are CDN-routed — let DNS handle it.
- Codex: single endpoint; nothing to probe.

Latency probe results recorded per-provider and exposed via `/metrics`.

### 8.5 Speculative prefetch for orchestrator routing

When the orchestrator is about to delegate to a specialist, the router can begin establishing the provider connection (TLS, HTTP/2 stream open) before the prompt is fully assembled. Saves connection-setup latency on the critical path of multi-step agent runs.

---

## 9. UX changes

### 9.1 First-run auth wizard — **P0**

Replace the current GitHub-only welcome gate (`src/vs/sessions/contrib/welcome/`) with a multi-provider picker:

- "Connect Claude (recommended for orchestrator)"
- "Connect ChatGPT / Codex"
- "Connect GitHub Copilot"
- "Use API keys (advanced)"
- "Skip for now" — works in read-only / index-only mode.

Each connect action opens the provider's OAuth in the system browser. On success, the IDE shows a green check, the connected models, and an indication of any quota/window data.

### 9.2 Connected accounts panel

New section in Settings → Son of Anton → Accounts:

- Per-provider row: status (connected / disconnected / refresh-failed), connected-at, expiry, quota fragment (if exposed by provider).
- Disconnect button calls `broker.disconnect`.
- Reconnect button re-runs OAuth.

### 9.3 Per-agent provider selection

CLAUDE.md prescribes:

| Task type | Model | Rationale |
|---|---|---|
| Orchestrator planning | Opus | Highest capability |
| Code generation | Sonnet | Best balance |
| Exploration / summaries | Haiku | Fastest |

Make this visible in the chat UI: each specialist's avatar shows a small badge — `Sonnet · Copilot` or `Opus · Claude Pro`. Click to override per session.

The router's existing routing rules become user-editable through this UI — saved to `.son-of-anton/routing.json`.

### 9.4 Cost / quota panel — **P1**

Status bar widget:

- API-key users: `$0.42 · 12K/200K tokens · 4/30 RPM`.
- Subscription users: `Claude Pro · 12% of 5h window`, or `Copilot · session valid 24m`.
- Click opens a per-session breakdown with per-tool, per-model costs.
- Hard-stop modal when a user-configured spend cap is hit (CLAUDE.md's "kill switch").

### 9.5 Streaming chat UI — **P0**

See §7.3. Single largest perceived-quality jump available.

### 9.6 Multi-session / parallel-agent UI — **P0**

Sessions become a list in the left rail. Orchestrator-spawned specialists nest under their parent. Each row shows status, elapsed time, last message preview. Switching between active sessions does not interrupt them.

This unlocks the architecture that already exists in `extensions/son-of-anton/src/agents/AgentParticipants.ts`.

### 9.7 Per-hunk accept/reject — **P2**

Reuse the merge editor's hunk widgets in `changesView.ts`. Each agent-proposed change becomes a stack of hunk cards with accept / reject / accept-all.

### 9.8 Discoverable invocations — **P2**

Command-palette entries:

- `Anton: New Code Review`
- `Anton: Refactor Selection`
- `Anton: Explain This`
- `Anton: Add Tests for File`
- `Anton: Open Session List`

Each routes directly to the right specialist, bypassing the orchestrator round-trip — measurable latency win for common tasks.

### 9.9 Slash commands — **P2**

`src/vs/sessions/prompts/` becomes the slash-command registry. One markdown file per command:

- `/review` → runs the review skill
- `/explain`
- `/test`
- `/refactor`
- `/migrate`

Each file is front-matter + body: agent ID, model preference, system prompt fragment. Discoverable from the chat input via `/`.

### 9.10 Error UX — **P1**

Errors render inline in the chat with the offending tool / step highlighted, the error message, and a retry affordance. Retry is provider-aware — if the failure was Copilot-side and Claude OAuth is connected, the retry button reads "Retry on Claude Pro."

---

## 10. Reliability and failover

### 10.1 Provider failover

Configurable failover chain per agent role:

```jsonc
// .son-of-anton/routing.json
{
  "orchestrator": {
    "primary":  { "provider": "anthropic-oauth", "model": "claude-opus-4-7" },
    "fallback": [
      { "provider": "copilot",        "model": "claude-opus" },
      { "provider": "anthropic-key",  "model": "claude-opus-4-7" }
    ]
  }
}
```

Triggered on:
- HTTP 5xx mid-stream (after first byte) — finish current event boundary, then re-issue against fallback.
- Connection reset.
- Quota exhausted (provider-specific signal).

The uniform event stream is the contract that makes mid-stream failover possible — the user sees a single continuous response.

### 10.2 Cancellation

`AbortSignal` propagation from chat UI → router → adapter → provider. On cancel:
- Adapter closes the SSE connection (don't drain).
- Router emits a final `message_stop` with `stopReason: 'error'` and `error.code: 'cancelled'`.
- mcp-gateway in-flight tool calls are also cancelled.

### 10.3 Network partitions

If broker is reachable but provider is not, adapter retries with exponential backoff up to 3 times per CLAUDE.md, then surfaces a clear error.

If broker is unreachable, router fails fast with 503 — no retries — so the IDE knows immediately to surface a "broker offline" error.

---

## 11. Observability

### 11.1 Shared metrics library — **P1**

New package `services/_lib/metrics/` (TypeScript) exporting:

- `histogram(name, labels)` / `counter(name, labels)` / `gauge(name, labels)`
- `expressMetricsMiddleware()` — wraps every route with a request histogram.
- `prometheusHandler()` — `/metrics` endpoint.

Adopt across all services. Standard label set: `service`, `route`, `provider` (where relevant), `agent_role` (where relevant).

### 11.2 Cache-hit-rate instrumentation — **P1**

In each provider adapter, on every `usage` event, record:

- `llm_cache_creation_tokens_total{provider, model, agent_role}`
- `llm_cache_read_tokens_total{provider, model, agent_role}`
- `llm_input_tokens_total{provider, model, agent_role}`
- `llm_output_tokens_total{provider, model, agent_role}`

Plus a derived `llm_cache_hit_rate{...}` panel in the cost UI.

### 11.3 Cross-service tracing — **P2**

OpenTelemetry SDK with W3C trace-context propagation. Minimal initial wiring:

- Every IDE → router request opens a root span.
- Router propagates `traceparent` to mcp-gateway and to provider edges.
- Each service logs `traceId` on every request line.
- Optional: ship traces to a local Jaeger via Docker Compose; off by default.

### 11.4 Per-request structured logs

Adopt `pino` with `pino-pretty` in dev, JSON in prod. Required fields per request: `traceId`, `requestId`, `service`, `route`, `agentRole`, `provider`, `latencyMs`, `status`.

---

## 12. Correctness fixes

### 12.1 Define or rename `anton-pentest`

`.son-of-anton/hooks.json` references `anton-pentest`. Either define the agent in `extensions/son-of-anton/src/agents/AgentParticipants.ts` (preferred — pentest behaviour is meaningfully different from anton-security) or rename hook entries to `anton-security`.

### 12.2 Validate hook agent references at load time

A small validator that loads `hooks.json` on extension activation and asserts every `agent` field maps to a registered participant. Fail fast with a clear error in the dev console.

### 12.3 Skills directory

`.agents/skills/` is empty. Decide:
- If skills are not a thing for Son of Anton: delete the directory.
- If they are: seed with `pr-review`, `add-tests`, `migrate-to-typescript`, `update-deps`.

### 12.4 Service stub migration

Audit `services/{indexer,lsif,mcp-gateway,penetration-tester,spec-pipeline}/index.js` files. Per CLAUDE.md these must migrate to TypeScript before stable. Either delete (if stale) or migrate.

### 12.5 Build-DAG persistence

Persist build dependency graph to FalkorDB as `:Target -[:DEPENDS_ON]-> :Target` and `:Target -[:BUILDS]-> :File` edges. Enables joining build and code graphs in queries (e.g. "what's the build target for the file containing this symbol?").

---

## 13. Rollout plan

Three sprints to land the subscription-integration foundation, then the existing review backlog.

### Sprint 1 — Auth foundation and end-to-end streaming · ~2 weeks

**Goal:** A user can log in with Claude Pro and see a fully streamed response with live tool calls.

- [x] **CredentialBroker** in `extensions/son-of-anton/src/auth/` (§6).
  - Localhost socket / named pipe transport with peer-creds check.
  - `vscode.SecretStorage` integration.
  - RPC surface implemented; integration tests with a fake provider.
- [x] **Uniform event shape** in a shared types package consumed by router and IDE (§4.3).
- [x] **AnthropicOAuth adapter** in `services/model-router/src/providers/anthropic-oauth.ts` (§5.1).
  - PKCE flow.
  - `cache_control` preserved end-to-end.
- [x] **Streaming chat UI rewrite** in `src/vs/sessions/contrib/chat/browser/` (§7.3, §9.5).
  - Text, tool_use, thinking, usage, error all rendered live.
  - Cancel button propagates AbortSignal.
- [x] **mcp-gateway tool-result streaming** in `services/mcp-gateway/src/server.ts` (§7.2). _(partial: streaming wrapper + types landed, semantic_search migrated as proof of concept; remaining 17 tools migrate in follow-up)_
- [x] **Auth wizard MVP** with Claude OAuth only (§9.1).

**Demo:** "Log in with Claude, ask a code-review question, watch tokens stream and tool calls appear inline."

### Sprint 2 — Multi-provider + multi-session · ~2 weeks

**Goal:** A user can connect Claude, Codex, and Copilot, and run two specialists in parallel.

- [x] **ChatGPTOAuth adapter** with event normaliser (§5.2). Captured-SSE fixture suite.
- [ ] **Copilot adapter** using existing GH auth flow (§5.3).
- [ ] **Connected accounts panel** (§9.2).
- [ ] **Per-agent provider selection UI** (§9.3) with `.son-of-anton/routing.json`.
- [ ] **Multi-session UI** (§9.6, F-14). Sessions list, nesting, parallel execution.
- [ ] **Cost / quota panel** (§9.4, F-15).
- [ ] **Error UX** (§9.10, F-16). Inline errors with retry-on-other-provider.

**Demo:** "Run a code review on Claude Pro and a test-writing task on Copilot at the same time; watch them complete independently."

### Sprint 3 — Reliability, observability, polish · ~2 weeks

**Goal:** Production-quality instrumentation and failover.

- [ ] **Provider failover** (§10.1).
- [ ] **Connection pooling** and **endpoint probing** (§8.3, §8.4).
- [ ] **Shared metrics library** + `/metrics` on every service (§11.1, F-9, F-24).
- [ ] **Cache-hit-rate instrumentation** (§11.2, F-10).
- [ ] **Cross-service tracing** (§11.3, F-25).
- [ ] **`buildCachedRequest()` helper** (§8.1, F-12).
- [ ] **Cancellation end-to-end** (§10.2).
- [ ] **Hooks validator** (F-21) and **`anton-pentest` resolution** (F-20).

**Demo:** "Pull the plug on Copilot mid-response, watch the IDE seamlessly continue on Claude Pro. Open Grafana, see cache hit rate at 78%."

### Backlog — Code intelligence and polish · ongoing

To be tackled after Sprint 3 lands, in roughly this order:

- [ ] **F-1** Real embedding provider (Voyage / local).
- [ ] **F-4** Context sanitiser on the hot path.
- [ ] **F-2** Embedding cache by content hash.
- [ ] **F-3** Per-agent retrieval ranking weights.
- [ ] **F-11** mcp-gateway request coalescing.
- [ ] **F-17** Per-hunk accept/reject in changes view.
- [ ] **F-18** Command-palette entries.
- [ ] **F-19** Slash-command surface in chat input.
- [ ] **F-7** Build-DAG persistence to FalkorDB.
- [ ] **F-5** Sanitiser performance refactor.
- [ ] **F-6** Parallel LSIF runners.
- [ ] **F-23** Recursive sub-agent spawning.
- [ ] **F-22** Skills directory decision.
- [ ] **F-26** Services-integration CI job.
- [ ] **F-27** JS stub audit.

---

## 14. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Provider OAuth flows change without notice | Medium | High | Captured-SSE fixture suites per provider; adapter version-pinned; user-visible error when version drifts. |
| Subscription terms forbid third-party clients | Low | Critical | Confirm ToS for each provider before shipping. Anthropic and OpenAI both publish public OAuth endpoints; Copilot has a documented public surface used by official editors. |
| Token leak through logs | Low | High | Token redaction filter in pino; tokens never serialised; broker process boundary as defence in depth. |
| Provider rate-limit drift mid-task | Medium | Medium | Failover chain; user-visible quota chip. |
| `cache_control` semantics differ across providers | Medium | Medium | Cache breakpoints only emitted on Anthropic-compatible paths; OpenAI/Copilot adapters strip them. Cache-hit telemetry catches drift. |
| Local broker socket conflicts with another fork install | Low | Low | Socket name includes user ID + workspace hash; broker refuses to bind if another instance is alive for the same user. |
| Streaming UI rewrite regresses existing features | Medium | Medium | Feature-flag the new chat view; keep the old code path until the new one passes the existing test suite plus new streaming integration tests. |
| Multi-session UI adds memory pressure | Low | Medium | Cap concurrent active sessions (config; default 4); idle sessions hibernate their event log to disk. |

---

## 15. Success metrics

Tracked from Sprint 3 onward, exposed in the dashboard.

- **Time to first token (TTFT) p50** by provider — target < 1.0s for cached requests, < 2.5s uncached.
- **Tool-call round-trip p50** — target < 600ms for `find_references`, < 200ms for `symbol_lookup`.
- **Cache hit rate** by agent role — target > 70% for orchestrator, > 50% for specialists.
- **Auth success rate** for first-run wizard — target > 95%.
- **Cancel-to-stop latency** — target < 250ms (provider connection close + UI reflect).
- **Failover success rate** when primary provider 5xxs — target > 90% completes on fallback.
- **% of sessions using a subscription provider** vs API key — leading indicator of product fit.

---

## 16. Open questions

- Should the credential broker be a dedicated process (better isolation) or a module inside the IDE renderer (simpler)? Initial proposal is in-renderer; revisit if security review demands process isolation.
- Should we support offline fallback to a local model (e.g. Llama 3.1 via llama.cpp) when no provider is connected? Out of scope for this plan but may inform the adapter abstraction.
- How should we expose model preferences for users with overlapping subscriptions (e.g. Claude Pro + Copilot Claude)? Default: prefer the provider that exposes `cache_control` (Anthropic-direct beats Copilot-proxied for cached workloads).
- Do we want a "BYO Claude API base URL" option for users on Anthropic's enterprise proxy? Likely yes; cheap to add to the API-key adapter.
- Should usage-window data be aggregated across sessions per provider, or per-session only? Aggregated is more useful but requires persistence.

---

## 17. Appendix — referenced files

The plan references concrete files in the existing codebase:

- `extensions/son-of-anton/src/llm/LlmClient.ts` — current ad-hoc cache_control wiring; target of `buildCachedRequest()` refactor.
- `extensions/son-of-anton/src/agents/AgentParticipants.ts` — orchestrator + specialist registry.
- `services/model-router/src/server.ts` — request routing entry point.
- `services/model-router/src/router.ts` — routing rules.
- `services/model-router/src/translators.ts` — Anthropic/OpenAI format translation.
- `services/model-router/src/metrics.ts` — existing metrics collector to extend.
- `services/mcp-gateway/src/server.ts` — tool dispatch; target of streaming refactor.
- `services/indexer/src/embedding/embeddingWriter.ts` — current mock embedding implementation.
- `services/indexer/src/semanticSearch.ts` — hybrid retrieval scoring.
- `services/context-sanitiser/src/sanitiser.ts` — current line-by-line scanner.
- `src/vs/sessions/contrib/chat/browser/newChatViewPane.ts` — chat UI; target of streaming rewrite.
- `src/vs/sessions/contrib/welcome/browser/welcome.contribution.ts` — gating welcome flow; replaced by auth wizard.
- `src/vs/sessions/contrib/sessions/browser/sessionsManagementService.ts` — single-session model; target of multi-session refactor.
- `src/vs/sessions/contrib/changesView/browser/changesView.ts` — changes view; target of hunk-level accept/reject.
- `.son-of-anton/hooks.json` — hook definitions; contains `anton-pentest` reference to fix.

End of plan.
