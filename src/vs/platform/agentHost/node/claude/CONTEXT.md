# Claude Agent (Agent Host)

The Claude-side of the agent host: a `ClaudeAgent` implementation of `IAgent`
that drives Anthropic-format tool-using sessions via the Claude Agent SDK,
with all `messages` traffic proxied through a local server that translates
Anthropic requests into GitHub Copilot CAPI calls.

## Language

**Agent Host**:
The utility process that owns all `IAgent` providers (Copilot, Claude). Hosts
this code.

**Claude Agent**:
The `IAgent` provider for the Claude SDK. Owns the lifecycle of the Claude
proxy and one `Query` per session.
_Avoid_: "Claude provider" (overloaded with `AgentProvider` ID).

**Claude Proxy** / `ClaudeProxyService`:
A local HTTP server that speaks the **Anthropic Messages API** wire format on
the inbound side and `ICopilotApiService` on the outbound side. Registered
as a singleton in the agent host DI container; **one proxy per agent host
process**, shared across any Claude-family agents.
_Avoid_: "Anthropic proxy", "language model server".

**CAPI**:
GitHub Copilot's chat completions API, accessed through `ICopilotApiService`.
The terminal hop after the proxy.

## Relationships

- The **Agent Host** owns one **Claude Proxy** for the lifetime of the process.
- The **Claude Agent** uses the **Claude Proxy** to talk to **CAPI**; the
  proxy is injected via DI, not constructed by the agent.
- The **Claude Proxy** translates inbound **Anthropic Messages API** requests
  into outbound `ICopilotApiService` calls, then to **CAPI**.
- The **Claude Agent SDK** subprocess sees the **Claude Proxy** as its
  Anthropic API endpoint via `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`.

## Flagged ambiguities

_None yet._

## Phase 2 — `IClaudeProxyService` design log

Decisions that have been grilled and locked in. Each entry is the closed
form of a design question.

### Q1 — Naming
`IClaudeProxyService` / `ClaudeProxyService`. Files under `node/claude/`.

### Q2 — Lifecycle / DI
Registered as a DI singleton in `agentHostMain.ts` alongside
`ICopilotApiService`. One instance per agent host process.

### Q3 — API shape

```ts
interface IClaudeProxyHandle extends IDisposable {
    readonly baseUrl: string;
    readonly nonce: string;
}

interface IClaudeProxyService {
    readonly _serviceBrand: undefined;
    start(githubToken: string): Promise<IClaudeProxyHandle>;
    dispose(): void;
}
```

- **Refcounted**: each `start()` increments, each `handle.dispose()`
  decrements. At refcount 0 the listener closes, the token slot clears,
  and the nonce is destroyed. The next `start()` rebinds with a new
  port and a fresh nonce.
- **Shared token slot, last-writer-wins**. Single-tenant per roadmap;
  multi-tenant is a Phase 4+ concern.
- **Subprocess ownership**: callers that hand the handle's `baseUrl` /
  `nonce` to a Claude SDK subprocess MUST kill that subprocess before
  disposing the handle. The subprocess cannot outlive the handle.

### Q4 — Auth
Enforce `Authorization: Bearer <nonce>.<sessionId>` on authenticated
routes. Parse and log `sessionId` at trace level only; treat it as
opaque in Phase 2. `x-api-key` is ignored.

Bearer enforcement runs FIRST on authenticated routes, so a bad token
yields 401 — never 501 or 404.

### Q5 — Routes

| Route | Status | Notes |
| --- | --- | --- |
| `POST /v1/messages` | full impl | streaming + non-streaming |
| `GET /v1/models` | net new | passthrough filtered to `vendor: 'Anthropic'` and `supported_endpoints` containing `/v1/messages`; reshaped to `Anthropic.ModelInfo`: `{ id, type: 'model', display_name, created_at: '1970-01-01T00:00:00Z', capabilities: null, max_input_tokens: null, max_tokens: null }`. (RFC3339 string instead of `0` because the SDK type forces it — settled by council C1.) |
| `POST /v1/messages/count_tokens` | net new | returns 501 with Anthropic error envelope: `{ type: 'error', error: { type: 'api_error', message: 'count_tokens not supported by CAPI' } }` |
| `GET /` | health | plain-text `'ok'` |
| anything else | 404 | Anthropic error envelope |

No `OPTIONS` handler — same-process consumer, CORS does not apply.

### Q6 — Model ID translation
The SDK does literal prefix matching (e.g. `id.startsWith('claude-opus-4-6')`).
CAPI uses dotted versions (`claude-opus-4.6`), the SDK uses hyphenated
Anthropic-canonical IDs (`claude-opus-4-6-20250929`). Translation is
**bidirectional**.

- Port `extensions/copilot/src/extension/chatSessions/claude/{common,node}/claudeModelId.ts`
  into `node/claude/claudeModelId.ts` with a comment marking it as a
  mirror that must be kept in sync. Lift the same test fixtures.
- Two pure helpers exposed: `tryParseClaudeModelId(id)` returning a
  `ParsedClaudeModelId` with `toSdkModelId()` / `toEndpointModelId()`.
  No service, no class — the parser caches internally.
- Three rewrite points in the proxy:
  1. inbound `requestBody.model` (SDK → CAPI)
  2. outbound `model` fields on streaming events and non-streaming
     responses (CAPI → SDK), e.g. `message_start.message.model`
  3. `GET /v1/models` response IDs (CAPI → SDK)
- **Inbound parse failure**: 404 with Anthropic `not_found_error` —
  before any CAPI call.
- **Outbound parse failure**: log a warning, pass the raw value through.
  Worse than translating, strictly better than dropping the response.
- Model **availability fallback** ("user picked an unavailable model,
  pick the newest Sonnet") is a Phase 4 `ClaudeAgent` concern. The
  proxy stays dumb.

### Q7 — Anthropic-beta + header passthrough

- Lift `filterSupportedBetas()` and the three-entry `SUPPORTED_ANTHROPIC_BETAS`
  allowlist (`interleaved-thinking`, `context-management`, `advanced-tool-use`)
  into `node/claude/anthropicBetas.ts` with a "keep in sync" comment.
  Allowlist match is prefix + `-` (date-suffix discipline). Lift the
  same 7 test fixtures.
- Applied at `POST /v1/messages` after auth, before model translation.
  If the filtered result is a non-empty string, set it on the outbound
  `ICopilotApiServiceRequestOptions.headers['anthropic-beta']`. If
  `undefined`, omit the header entirely — never forward `''`.
- Inbound header passthrough is restricted to `anthropic-version`
  (verbatim) and `anthropic-beta` (filtered). All other client headers
  are dropped, including `x-request-id` / `request-id` — CAPI generates
  its own.
- The proxy ignores `request.metadata` and any SDK-side `betas` field;
  only the `anthropic-beta` header drives behavior.

### Q8 — Streaming: framing, backpressure, mid-stream errors

The reference (`extensions/copilot/.../claudeLanguageModelServer.ts`) is a
**byte-passthrough** — it pipes raw upstream SSE chunks straight to the
client. Our proxy can't do that: `ICopilotApiService.messages()` returns
`AsyncGenerator<Anthropic.MessageStreamEvent>` (already-parsed event
objects), so we MUST construct SSE frames ourselves.

**Framing.** Hand-rolled, per event:

```
event: <event.type>\ndata: <JSON.stringify(event)>\n\n
```

Response headers, set once before the first event:
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

After `writeHead(200, …)` call `res.flushHeaders()` so the SDK gets
status + content-type before the first event, and
`req.socket.setNoDelay(true)` so small frames aren't held by Nagle.

**Event mutation.** 1:1 passthrough with one surgical rewrite — the
`model` field on `message_start.message.model` (Q6 outbound CAPI→SDK).
No `[DONE]` line (Anthropic ends with `message_stop`, not OpenAI's
sentinel). No synthesized `ping` events. No event reordering.

**Backpressure.** The reference does NOT handle this and we treat that
as a bug, not a guideline. When `res.write()` returns `false`,
`await once(res, 'drain')` before pulling the next event from the
generator. This naturally backpressures the upstream.

**Mid-stream errors.** The reference's `catch` tries to `writeHead(500)`
after streaming has started, which throws — its mid-stream error
handling is silently broken. We emit an Anthropic-shaped SSE error
frame and end:

```
event: error
data: { "type": "error", "error": { "type": "api_error", "message": "..." } }
```

Then `res.end()`. Do not emit `message_stop` after `error` — `error` is
terminal in the Anthropic SDK.

**Non-streaming branch.** When `request.stream !== true`:
- `Content-Type: application/json`
- Single body: `JSON.stringify(message)` where `message` is the
  `Anthropic.Message` returned by the non-streaming
  `ICopilotApiService.messages()` overload, with the `model` field
  rewritten to SDK format.
- The reference forces `stream: true` upstream and SSE-frames everything
  — we explicitly do NOT do this. Honor `request.stream`.

### Q9 — Abort / disconnect propagation

One `AbortController` per inbound request, plumbed through to
`ICopilotApiServiceRequestOptions.signal`.

```ts
const ac = new AbortController();
res.on('close', () => ac.abort());

try {
    const stream = copilotApi.messages(body, { signal: ac.signal, headers });
    for await (const event of stream) { /* emit */ }
} catch (err) {
    if (ac.signal.aborted) { return; } // client gone — silent
    // else: emit Anthropic SSE error frame (Q8)
}
```

- **Single trigger**: `res.on('close')`. The reference also uses this;
  `req.on('close')` and `req.on('aborted')` are redundant.
- **No polling**. Pass `signal` to `ICopilotApiService.messages()`; the
  generator rejects with `AbortError` on the next iteration. The for-await
  unwinds naturally.
- **No error frame on client-disconnect**. Writing to a closed socket
  either silently drops or throws `ERR_STREAM_WRITE_AFTER_END`. On
  caught error, check `signal.aborted` and `return` without writing.
- **Non-streaming branch**: same pattern. The awaited
  `ICopilotApiService.messages()` rejects with `AbortError`; we `return`
  without writing a body.
- **`dispose()` aborts in-flight**. The service holds a
  `Set<AbortController>` (added on request entry, removed in `finally`).
  On refcount→0 dispose: abort all controllers, then `server.close()`,
  then clear the token slot and destroy the nonce.

### Q10 — Error envelopes

Two distinct flows. Don't conflate.

**Proxy-authored errors.** No upstream response exists, so we construct
the Anthropic envelope ourselves via one helper:

```ts
function writeJsonError(res, status, type, message) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type, message } }));
}
```

Status + `error.type` per case:

| Case | Status | `error.type` |
| --- | --- | --- |
| Missing/malformed `Authorization` | 401 | `authentication_error` |
| Bearer nonce mismatch | 401 | `authentication_error` |
| Bearer with no `.sessionId` | 401 | `authentication_error` |
| Unknown route | 404 | `not_found_error` |
| Bad JSON body | 400 | `invalid_request_error` |
| Missing required field (`model`, `messages`) | 400 | `invalid_request_error` |
| Model parse failure (Q6 inbound) | 404 | `not_found_error` |
| `POST /v1/messages/count_tokens` | 501 | `api_error` |

**CAPI errors — passthrough, not mapping.** CAPI already speaks
Anthropic wire format. The `@anthropic-ai/sdk` parses non-2xx into
`Anthropic.APIError` with `err.status` + `err.error` (the parsed
envelope, verbatim). We just re-serialize:

```ts
catch (err) {
    if (err instanceof Anthropic.APIError && err.error) {
        res.writeHead(err.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(err.error));
        return;
    }
    // network / non-APIError — synthesize
    writeJsonError(res, 502, 'api_error', err.message ?? 'Upstream error');
}
```

No `instanceof` ladder per `APIError` subclass. No mapping table. No
`err.message` sanitization — passthrough.

**Mid-stream variant.** Same idea, SSE frame instead of JSON body:

```ts
res.write(`event: error\ndata: ${JSON.stringify(err.error ?? fallback)}\n\n`);
res.end();
```

Status is ignored once headers are sent (Q8). On `signal.aborted`,
write nothing — client is gone (Q9).

### Q11 — File layout (as shipped)

```
node/claude/
├── claudeProxyService.ts   # interface + impl + lifecycle + server + dispatch + route handlers
├── claudeModelId.ts        # parser (Q6) — mirror of extension copy
├── anthropicBetas.ts       # filterSupportedBetas + allowlist (Q7)
├── anthropicErrors.ts      # buildErrorEnvelope, writeJsonError, writeUpstreamJsonError, formatSseErrorFrame (Q10)
└── claudeProxyAuth.ts      # parseProxyBearer (Q4)

test/node/
├── claudeModelId.test.ts
├── anthropicBetas.test.ts
├── claudeProxyAuth.test.ts
└── claudeProxyService.test.ts
```

- **Pure helpers** (`claudeModelId`, `anthropicBetas`, `anthropicErrors`,
  `claudeProxyAuth`) are platform-free pure functions, testable in
  isolation.
- **Route handlers live inside `ClaudeProxyService`.** The original plan
  split them into separate `claudeProxyMessages.ts` /
  `claudeProxyModels.ts` classes; we collapsed them into private methods
  (`_handleModels`, `_handleMessages`, `_sendNonStreamingMessage`,
  `_streamMessages`) on `ClaudeProxyService` because they share the
  per-request bookkeeping (`IInFlight`, the `runtime` token slot, the
  abort plumbing). Splitting them would require passing the same five
  arguments around; keeping them inline kept the file under 800 lines
  and avoided redundant injection.
- **`claudeProxyService.ts`** owns the `IClaudeProxyService` interface,
  the impl, `IClaudeProxyHandle`, refcounted lifecycle, the
  `http.createServer()`, the top-level dispatch switch on
  `url.pathname`, the `Set<IInFlight>` of in-flight requests, and all
  route handlers.
- **Interface lives next to impl.** No `common/` split for Phase 2 —
  both consumers (`agentHostMain.ts`, future `ClaudeAgent`) are in
  `node`. Promote later if a second platform consumer appears.

### Q12 — Acceptance criteria

Phase 2 is "done" when all of the following pass:

**Hygiene (must run frequently during development, not as a final step):**
- [ ] `compile-check-ts-native` clean
- [ ] `eslint` clean
- [ ] `valid-layers-check` clean
- [ ] Hygiene check (gulp `hygiene`) clean — copyright headers, tabs,
      string quoting, formatting

**Lifecycle (Q2/Q3):**
- [ ] `start(token)` returns a handle with `baseUrl` (e.g.
  `http://127.0.0.1:54321`) and a 256-bit hex `nonce`
- [ ] Two concurrent `start()` calls share one server, share the latest
  token, return handles with the same `baseUrl` and `nonce`
- [ ] Disposing one handle while the other is alive: server stays up,
  in-flight requests on the other handle continue
- [ ] Disposing the last handle: `server.close()` runs, in-flight
  controllers abort, port is freed
- [ ] `start()` after refcount-0 dispose binds a new port and a fresh
  nonce

**Bind safety:** server binds only to `127.0.0.1`, not `0.0.0.0`.

**Auth (Q4):** missing / wrong nonce / no `.sessionId` / `x-api-key`
alone all → 401; `Bearer <nonce>.<sessionId>` proceeds.

**Routes (Q5):**
- [ ] `GET /` → 200 `'ok'`, no auth required
- [ ] `GET /v1/models` (authed) → 200 with Anthropic-shaped model
  objects, IDs in SDK format (Q6 outbound)
- [ ] `POST /v1/messages/count_tokens` (authed) → 501 `api_error`
- [ ] `GET /something-else` (authed) → 404 `not_found_error`

**Model translation (Q6):** SDK ID inbound translates to CAPI; CAPI ID
inbound also works; unparseable → 404 with no CAPI call;
`message_start.message.model` and non-streaming `message.model`
rewritten to SDK format on the way out; `/v1/models` IDs in SDK format.

**Beta filtering (Q7):** date-suffixed allowlist members forwarded;
non-allowlist dropped; empty result → header omitted.

**Header passthrough (Q7):** `anthropic-version` forwarded verbatim;
all others (including `x-request-id`) dropped.

**Streaming (Q8):** `stream:true` → SSE with hand-rolled
`event:/data:` framing in CAPI's emitted order; `stream:false` → JSON
body; tool-use and thinking deltas reach the client; no `[DONE]`;
`socket.setNoDelay(true)`.

**Abort (Q9):** mid-stream client disconnect aborts upstream;
mid-stream `dispose()` aborts all; non-streaming disconnect writes no
body.

**Errors (Q10):** proxy-authored errors emit the Q10 envelope;
`Anthropic.APIError` re-emitted verbatim; non-`APIError` → 502
`api_error`; mid-stream errors become SSE `event: error` frames.

### Q13 — Testing strategy

Three surfaces.

**Surface 1 — pure-helper unit tests** (zero deps, fast,
deterministic):

```
src/vs/platform/agentHost/test/node/
├── claudeModelId.test.ts        # port extension fixtures, bidirectional
├── anthropicBetas.test.ts       # port the 7 reference fixtures
├── claudeProxyAuth.test.ts      # auth matrix
└── claudeProxyService.test.ts   # see Surface 2
```

**Surface 2 — service-level tests** with a single mock
(`FakeCopilotApiService`); everything else (real `http.Server`, real
`AbortController`, real parser, real filter) is real. Per the codebase
guideline: minimal mocking, mock only true I/O boundaries.

```ts
class FakeCopilotApiService implements ICopilotApiService {
    nextMessagesResult: Anthropic.Message
        | AsyncGenerator<Anthropic.MessageStreamEvent>
        | Anthropic.APIError;
    lastCall: { body: Anthropic.MessageCreateParams; options: ICopilotApiServiceRequestOptions };
    messages(body, options): ...
    models(): ...
    countTokens(): ...
}
```

Cases: lifecycle / refcount / port / dispose; auth fixtures end-to-end
through real HTTP; route status matrix; model translation roundtrip;
beta filter forwarded correctly to mock; streaming order + framing;
non-streaming JSON body shape; mid-stream abort propagates
`signal.aborted` to mock; mid-stream `APIError` becomes SSE error
frame; pre-stream `APIError` becomes JSON error; disconnect aborts
upstream.

**Surface 3 — real-CAPI smoke (Phase 2, not deferred).**

Procedure (manual, run at the end of Phase 2 implementation):

1. Temporarily modify the existing `CopilotAgent` (or wherever the
   agent host first authenticates) to call
   `claudeProxyService.start(token)` once a real GitHub token is
   minted, and log the resulting `baseUrl` and `nonce` at info level.
2. Launch the dev build (`./scripts/code.sh --agents` or
   `Run Dev Agents`) and authenticate.
3. Use the **code-oss-logs** skill to read `agenthost.log` from the
   most recent run; grep for the proxy line; extract `baseUrl` +
   `nonce`.
4. From a separate terminal:
   ```bash
   curl -H "Authorization: Bearer ${NONCE}.smoke-test" \
        "${BASE_URL}/v1/models"
   curl -H "Authorization: Bearer ${NONCE}.smoke-test" \
        -H "Content-Type: application/json" \
        -H "anthropic-version: 2023-06-01" \
        --data '{"model":"claude-opus-4-6-20250929","messages":[{"role":"user","content":"say hi"}],"max_tokens":64}' \
        "${BASE_URL}/v1/messages"
   ```
5. Verify: 200; SDK-format model IDs in `/v1/models`; non-streaming
   `Anthropic.Message` shape with `model` rewritten to SDK format.
6. Repeat with `"stream": true` and `--no-buffer`; verify SSE frames.
7. Revert the temporary `CopilotAgent` change.

This validates real CAPI without waiting for Phase 4's `ClaudeAgent`.

**What we explicitly do NOT test in Phase 2:** real Claude Agent SDK
subprocess (Phase 4), multi-tenant token isolation (Phase 4+), proxy
/ PAC support (deferred — see "Deferred for later phases").

## Deferred for later phases

Captured here so they aren't lost. None of these block Phase 2.

- **HTTP proxy support** (`HTTP_PROXY` / `HTTPS_PROXY` env vars, VS Code's
  `http.proxy` setting, PAC files, proxy auth). The Phase 2 proxy talks
  to CAPI through `ICopilotApiService`, so any outbound proxying is
  inherited from whatever HTTP client that service uses. If the agent
  host needs to honor user proxy configuration we'll need an explicit
  agent / dispatcher injection point on `ICopilotApiService` and a way
  to source the config from the renderer. Track separately when we
  pick this up.

## IAgent ↔ Claude SDK mapping

Descriptive catalogue of how the `IAgent` protocol surface
(`src/vs/platform/agentHost/common/agentService.ts`) lines up with the
`@anthropic-ai/claude-agent-sdk` types and the
`extensions/copilot/.../claudeCodeAgent.ts` reference implementation.

**This section is mapping, not planning.** Each entry describes how a
surface fits together; it does not commit to an implementation order or
a phase. Roadmap and phase-plan updates flow from this catalogue in a
separate pass.

Conventions:
- "Host" = the `ClaudeAgent` running in the agent host utility process.
- "SDK" = the `@anthropic-ai/claude-agent-sdk` API + its bundled CLI
  subprocess.
- "Reference extension" = the production Copilot extension's Claude
  support under `extensions/copilot/src/extension/chatSessions/claude/`.
- A "portrait" entry describes one IAgent surface, the SDK primitive(s)
  it lines up with, the direction of data flow, invariants, asymmetries,
  and any gaps where standardization is missing.

### Glossary additions

**`Turn.id` (locked invariant).** Opaque protocol-level identifier for
one user→assistant exchange. **Equal to the SDK uuid of the user
`SessionMessage` that started the turn.** Live: the host sets
`SDKUserMessage.uuid = effectiveTurnId` when yielding the prompt
([claudeAgent.ts:779](claudeAgent.ts#L779)) — the SDK has been
empirically confirmed to honor caller-supplied uuids. Replay:
`Turn.id = sessionMessage.uuid` directly. Single namespace; no
protocol↔SDK uuid mapping table required for fork, truncate, or
transcript reconstruction. Imported sessions from raw Claude Code
become first-class because their on-disk uuids are valid Turn.ids.

**Tool-call attribution map.** Per-session
`Map<tool_use_id, turnId>` populated when an assistant message carries
a `tool_use` block (the active turnId is known from the in-flight
request) and drained when the matching synthetic-user `tool_result`
arrives. Cross-message because `tool_use` and `tool_result` always
live in different SDK messages. This map exists in the live mapper
(planned at `claudeMapSessionEvents.ts`) and must also hydrate from
disk during transcript reconstruction so `tool_result` events
delivered on session restoration map back to the announcing
`tool_use`'s `turnId`.

**`SessionMessage.message: unknown`.** Typed as `unknown` in the SDK,
empirically a discriminated union by envelope `type`: `'user'` →
`MessageParam<user>` (text or `tool_result` blocks), `'assistant'` →
`BetaMessage<assistant>` (text / thinking / tool_use blocks),
`'system'` → `SDKSystemMessage`-family (discriminated by `subtype`).
Narrow at the seam with validators (`vUserMessageContent`,
`vAssistantMessageContent`); silently drop unvalidatable records to
match the JSONL parser semantics of the reference extension.

### Startup-only vs runtime mutability

The SDK splits configuration along a hard line. **Startup-only**
options live on `Options` and are baked into the subprocess at
`startup()` time — changing them requires a new `Query`. **Runtime**
operations live as methods on `Query` and apply to the live session.
A handful of concepts are **bijective** (settable startup *and*
mutable runtime via a setter). The reference extension's pattern for
non-bijective changes is the
"hot-swap-or-defer-or-restart" classification driven from the
in-flight request boundary in
[`claudeCodeAgent.ts`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts):

| Bucket | Examples | When applied |
|---|---|---|
| Hot-swap (cheap, between turns) | `setModel`, `setPermissionMode`, `applyFlagSettings({ effortLevel })` | Awaited just before the next `SDKUserMessage` is yielded |
| Defer-and-coalesce | `reloadPlugins` after `setCustomizationEnabled` | Set a `_pending*` flag while busy; apply at next yield boundary |
| Restart-required | Tool-set diff, settings file change | `_pendingRestart = true`, return from iterable, catch-block restarts session |

Note: there is no `Query.setEffort` method on the SDK. Effort is
applied via `Query.applyFlagSettings({ effortLevel })` and the `'max'`
UI value is clamped to `'xhigh'` at the seam (see [`claudeCodeAgent.ts:196`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts#L196)).

There is deliberately **no mid-turn mutation path**. Every host write
either applies immediately when idle or queues for the next prompt
boundary.

### M1 — `sendMessage(session, prompt, attachments?, turnId?)`

| Direction | Host → SDK |
|---|---|
| SDK primitive | `Query.streamInput(AsyncIterable<SDKUserMessage>)` (after `WarmQuery.query()`) |
| Reference | [claudeCodeAgent.ts](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts) `_createPromptIterable` |

Host wraps the protocol prompt + attachments into a single
`SDKUserMessage` with `uuid = effectiveTurnId` (see Turn.id glossary)
and pushes it onto a per-session prompt iterable. Sequencer-guarded
so concurrent `sendMessage` calls serialize by session. The yield
boundary is also where hot-swap config (`setModel`,
`setPermissionMode`, `applyFlagSettings({ effortLevel })`) is applied
and where any `_pending*` flags are drained.

### M2 — `respondToPermissionRequest(requestId, approved)` and M3 — `respondToUserInputRequest(requestId, response, answers?)`

These two `IAgent` methods are paired with **two protocol signal
types** that surface to the client via `onDidSessionProgress`. They
are the response side of two distinct flows that the host has to
multiplex from **three** SDK callback origins.

**Outbound signals (host → client) on `onDidSessionProgress`:**

| Signal action | Carries | Renders as |
|---|---|---|
| `SessionToolCallReady` (ToolCall enters `PendingConfirmation`) | tool name + parsed input + optional `edits` preview | approve / deny prompt on the running tool call |
| `SessionInputRequested` | `SessionInputRequest { id, message?, url?, questions[]: SessionInputQuestion[] }` — typed text/number/boolean/single-select/multi-select questions, or a URL to open | structured form / select / URL-auth panel |

**Inbound responses (client → host) on `IAgent`:**

| IAgent method | Used for | Resolves |
|---|---|---|
| `respondToPermissionRequest(requestId, approved: boolean)` | tool-permission gates | the deferred parked inside `Options.canUseTool` |
| `respondToUserInputRequest(requestId, response: SessionInputResponseKind, answers?)` | structured user input (form questions, URL accept/decline) | the deferred parked inside `Options.canUseTool` (interactive-tool subset) **or** `Options.onElicitation` |

**Three SDK origins, two flows.** The host receives callbacks from
the SDK at three places; `claudeMessageDispatch` / the host's
permission gate route each to the appropriate IAgent flow.

| SDK callback | When it fires | Routes to flow | Why |
|---|---|---|---|
| `Options.canUseTool(toolName, input, { suggestions })` for arbitrary tool names | Before any tool is executed | **Permission** (`SessionToolCallReady` → `respondToPermissionRequest`) | Standard tool-permission gate |
| `Options.canUseTool('AskUserQuestion' \| 'ExitPlanMode', input, ...)` | Built-in interactive Claude tools | **User input** (`SessionInputRequested` → `respondToUserInputRequest`) | These two tools' "input" is itself a user-facing question / plan; `INTERACTIVE_CLAUDE_TOOLS` is the closed-set discriminator |
| `Options.onElicitation(request, { signal })` | An MCP server (host's own *or* third-party) calls `elicit/create` | **User input** (`SessionInputRequested` → `respondToUserInputRequest`) | MCP elicitation is the canonical path for "structured user input"; the host's in-process MCP server uses it too |

**`canUseTool` return type** (locked invariant, [sdk.d.ts:1582](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L1582)):

```ts
type PermissionResult =
    | { behavior: 'allow';  updatedInput?: Record<string, unknown>; updatedPermissions?: PermissionUpdate[]; toolUseID?: string; ... }
    | { behavior: 'deny';   message: string; interrupt?: boolean; toolUseID?: string; ... };
```

There is **no `behavior: 'ask'` variant.** `'deny'` requires
`message: string` (sent back to the model so it knows why) and
optionally `interrupt: true` to stop the turn entirely. For the
interactive-tool subset, the host returns `{ behavior: 'allow',
updatedInput }` once the user submits answers — the answers ride on
`updatedInput` so the tool's own handler sees the chosen values.

**`onElicitation` return type** ([sdk.d.ts:966](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L966), [sdk.d.ts:1163](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L1163)):

```ts
type OnElicitation = (request: ElicitationRequest, options: { signal: AbortSignal })
    => Promise<ElicitationResult>;  // { action: 'accept' | 'decline' | 'cancel'; content?: ... }
```

`ElicitationRequest.mode` is `'form'` (with `requestedSchema: JSON
Schema`) or `'url'` (with `url: string` for OAuth-style flows). Both
are translatable to the `SessionInputQuestion[]` / `url` fields on
`SessionInputRequest` without loss.

**Hooks deliberately not used for either flow.** The SDK exposes
`Elicitation` and `PreToolUse` hook events that can intercept these
callbacks before they fire. Hooks are not used because the user can
disable them entirely via settings — relying on them for permission
gating would create a silent-bypass class of bugs. `canUseTool` and
`onElicitation` are non-bypassable via SDK contract.

**Per-session sequencer.** Both flows funnel through the same
`_sessionSequencer`; at most one outstanding permission/input
request per session is in flight at a time, matching the protocol's
single-threaded session contract.

#### Sibling: how `CopilotAgent` implements the same surface

The Copilot CLI agent ([`copilotAgentSession.ts`](../copilot/copilotAgentSession.ts))
implements the identical IAgent contract against a different SDK.
The shape is the same; the SDK callbacks differ.

| Concern | `ClaudeAgent` (this folder) | `CopilotAgent` ([../copilot/](../copilot/)) |
|---|---|---|
| Permission SDK callback | `Options.canUseTool(toolName, input, ...)` (one seam, dual-routed) | `SessionConfig.handlePermissionRequest(ITypedPermissionRequest)` — typed kind: `'read' \| 'write' \| ...` |
| Permission return shape | `{ behavior: 'allow', updatedInput? } \| { behavior: 'deny', message }` | `{ kind: 'approve-once' \| 'reject' }` |
| User-input SDK callback(s) | `canUseTool` for `INTERACTIVE_CLAUDE_TOOLS` **and** `Options.onElicitation` (MCP) | `SessionConfig.onUserInputRequest({ question, choices?, allowFreeform? })` — single seam for the `ask_user` tool |
| User-input return shape | `PermissionResult` `{ allow, updatedInput }` (interactive-tool path) or `ElicitationResult` `{ action, content? }` (MCP path) | `{ answer: string, wasFreeform: boolean }` |
| Pending state | `_pendingPermissions: Map<toolCallId, DeferredPromise<boolean>>`, `_pendingUserInputs: Map<requestId, { deferred, questionId }>` | Same two maps, same shape |
| Outbound permission signal | `pending_confirmation` progress event → `SessionToolCallReady` action | `pending_confirmation` progress event with `permissionKind` / `permissionPath` / `parentToolCallId` (subagent routing) |
| Outbound input signal | `ActionType.SessionInputRequested` with `SessionInputRequest { id, questions[] }` | Same action, same shape |
| Inbound resolution | `respondToPermissionRequest`/`respondToUserInputRequest` walk `_sessions.values()`, return `boolean` on first match | Identical pattern ([`copilotAgent.ts:1239-1254`](../copilot/copilotAgent.ts#L1239-L1254)) |
| Auto-approve hook | Defers to SDK `permissionMode` (`default` / `acceptEdits` / `plan` / `bypassPermissions`) | Host-side: internal session-resource paths, `copilot-tool-output-*.txt` SDK temp files, `autopilot` config |
| Edit-preview building | None at this layer (Phase 7) | Builds `FileEdit` with `pending-edit-content:` URI before firing `pending_confirmation` so the client can show a diff |
| `ExitPlanMode` analogue | `INTERACTIVE_CLAUDE_TOOLS` includes `'ExitPlanMode'`; routed through `SessionInputRequested` | `_pendingPlanReviews` map; `_resolveExitPlanMode` maps the response back to `IExitPlanModeResponse { approved, feedback?, selectedAction?, autoApproveEdits? }` |
| Status (Phase 6) | Stub — both methods throw `TODO: Phase 7` ([`claudeAgent.ts:790, 794`](claudeAgent.ts#L790-L794)). Re-implementation explicitly mirrors `copilotAgent.ts:1239-1254` (see [phase7-plan.md](phase7-plan.md)) | Fully implemented |

The Copilot CLI SDK pre-resolves the Claude-side fan-in: its single
`onUserInputRequest` covers the `ask_user` case directly, and
`handlePermissionRequest` carries a richer `kind` so the host can
build a write-edit preview without inspecting tool-name strings.
The Claude SDK is lower-level — `canUseTool` is generic over every
tool, so the host has to do the routing itself via
`INTERACTIVE_CLAUDE_TOOLS`, and `onElicitation` exists as a separate
callback rather than being folded into the permission gate.

### M4 — `abortSession(session)`

| Direction | Host → SDK |
|---|---|
| SDK primitive | `AbortController.abort()` on the controller passed via `Options.abortController` (per-session). `Query.interrupt()` exists but is not the primary mechanism in the reference extension |
| Reference | [`claudeCodeAgent.ts:289, 733-735`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts#L289) |

The abort signal is owned by the host: each session creates its own
`AbortController`, passes it on `Options.abortController`, and aborts
it to cancel the turn. The SDK propagates the signal into all
in-flight HTTP / subprocess work and closes the prompt iterable.
Sequencer-guarded: a queued abort runs after any in-flight
`sendMessage` has yielded its `SDKUserMessage` so the abort always
meets a Query in a defined state. The host also surfaces the
protocol `SessionTurnCancelled` action through the side-effects
layer. `Query.interrupt()` is left for an explicit "interrupt only"
follow-up if abort-signal semantics ever prove insufficient (Phase 9).

### M5 — `changeModel(session, model)`

| Direction | Host → SDK |
|---|---|
| SDK primitive | `Query.setModel(modelId)` (runtime) **or** `Options.model` (startup) |
| Reference | hot-swap path in `_createPromptIterable` |

Bijective. `Options.model` seeds the initial run; `Query.setModel`
swaps mid-session. Applied at the yield boundary alongside
`setPermissionMode` and `applyFlagSettings({ effortLevel })`
(the actual effort primitive — there is no `setEffort` method).
UI `'max'` is clamped to SDK `'xhigh'` at the seam. Effort levels
above the model's `max_thinking_tokens` ceiling are clamped by the
SDK; the host does not need to gate.

### M6 — Customizations cluster

| IAgent surface | Direction | SDK primitive | Notes |
|---|---|---|---|
| `setClientCustomizations(...)` | Host → SDK | None — host-only state | Drives plugin manager sync; visible to SDK only via `Options.plugins` and the `_META_CUSTOMIZATION_DIRECTORY` baked at startup |
| `setClientTools(...)` | Host → SDK | In-process MCP server tool registry | Adds/removes tool definitions on the host's own MCP server; the SDK reads them through the standard MCP protocol |
| `onClientToolCallComplete(...)` | Host → SDK | Resolves the in-process MCP tool's pending promise | Same mechanism as `respondToUserInputRequest` |
| `setCustomizationEnabled(uri, enabled)` | Host → SDK | `Query.reloadPlugins()` (runtime) | **Defer-and-coalesce** when busy: set `_pendingPluginReload`, drain at next yield. Idle path applies immediately. The SDK's `reloadPlugins` returns the refreshed `commands / agents / plugins / mcpServers` — useful as a verification probe but not required for correctness |
| `getCustomizations()` | SDK → Host (projection) | `Query.supportedCommands()` / `supportedAgents()` / `mcpServerStatus()` | Compose the live snapshot from runtime SDK queries plus the host plugin manager's enabled set |
| `getSessionCustomizations(session)` | SDK → Host (projection) | Same SDK queries, scoped per-session | Per-session because each Query has its own loaded plugin set |

**Skills as plugins.** The SDK has no `Options.skills` field. A
directory containing a `skills/` subfolder *is* a valid plugin from
the SDK's point of view (`SdkPluginConfig { type: 'local', path }`).
The host can pass a "skills-only plugin" directory via
`Options.plugins` and the SDK loads every skill in it. Documented as
a first-class pattern, not a hack.

**Mid-turn `reloadPlugins` is undocumented.** The SDK's TS surface
makes no statement about whether `reloadPlugins` interrupts an
in-flight model turn. The defer-and-coalesce pattern makes the
question moot for correctness; if a "force reload now" debug command
is ever added, mid-stream behavior must be tested empirically first.

### M7 — `getSessionMessages(session): Promise<readonly Turn[]>`

| Direction | SDK → Host (replay) |
|---|---|
| SDK primitive | `getSessionMessages(sessionId, { dir, includeSystemMessages: true })` (out-of-process; reads JSONL transcript directly — no live `Query` required) |
| Subagent variant | `getSubagentMessages(rootSessionId, agentId, { dir })` |
| Reference | [sdkSessionAdapter.ts](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/sessionParser/sdkSessionAdapter.ts), [claudeMessageDispatch.ts](../../../../../../extensions/copilot/src/extension/chatSessions/claude/common/claudeMessageDispatch.ts) (live dispatcher) |

**One IAgent method, two SDK calls.** The host disambiguates by URI
shape (`<parent>/subagent/<toolCallId>` → walk up to the root
sessionId, call `getSubagentMessages`; otherwise
`getSessionMessages`). There is no protocol-level `getSubagentMessages`.

**Always pass `includeSystemMessages: true`.** Cost is negligible
(few extra entries per session) and skipping it loses
`compact_boundary` records, which are user-visible context-loss
events. The mapper applies an explicit allowlist when surfacing
system messages as `SystemNotificationResponsePart`:

| `SDKSystemMessage` subtype | Render? | Rationale |
|---|---|---|
| `compact_boundary` | Yes | "Conversation compacted" — context-loss event |
| `notification` (priority ≥ medium) | Yes | Loop-side text notifications |
| `api_retry`, `plugin_install`, `auth_status`, `status` | No | Live UI signals; not transcript content |
| `hook_started`, `hook_progress`, `hook_response` | No | Decorate the associated `ToolCall`, don't stand alone |
| anything else | Drop by default | Conservative; opt in subtypes as needs emerge |

**Pagination.** `getSessionMessages` supports `limit` / `offset`;
`IAgent.getSessionMessages` returns a fully materialized
`readonly Turn[]`. Not a blocker (the reference extension does the
same), but the SDK gives us pagination for free if a paginated
protocol variant is ever added.

#### Flat `SessionMessage[]` → `Turn[]`

The SDK returns a chronologically ordered flat list. The protocol
expects request/response cycles. Grouping rules, derived from real
on-disk transcripts:

```
For each SessionMessage in order:
  ('user', content[0].type === 'text'):
      → start new Turn. Turn.id = sessionMessage.uuid.
        Concatenate text blocks → userMessage.text. Attachments are
        not in SessionMessage (stripped by SDK); replay turns get no
        attachments. Acceptable: replay is for display, not re-send.
  ('user', content[0].type === 'tool_result'):
      → DO NOT start a new Turn. Locate the open ToolCall response
        part in the current Turn whose toolCallId === tool_use_id and
        attach result content + is_error.
  ('user', content empty / hook-injected / shouldQuery: false):
      → noise; skip. These are not turn-starters.
  ('assistant', for each content block in order):
      'text'      → push MarkdownResponsePart
      'thinking'  → push ReasoningResponsePart
      'tool_use'  → push ToolCallResponsePart (open; awaits tool_result);
                    record tool_use_id → Turn.id in the attribution map
      empty       → skip
  ('system', subtype === 'compact_boundary'):
      → push SystemNotificationResponsePart (compact metadata)
  ('system', other allowlisted subtypes):
      → push SystemNotificationResponsePart per allowlist above
  ('system', other):
      → drop
```

**Turn-level fields on replay.**
- `state` is `'completed'` for any Turn that's followed by a later
  message. The tail Turn's state is unknowable from history alone;
  default to `'completed'` if no orphan `tool_use` blocks remain,
  otherwise mark incomplete.
- `usage` is `undefined` on replay. The SDK does not surface
  per-message usage in `SessionMessage`. See M8 for the live-vs-replay
  metadata asymmetry.
- `compact_boundary` is **not** a Turn boundary in either path. Surface
  it as a `SystemNotification` part on the *currently active* Turn and
  continue. The SDK's `logicalParentUuid` already linearises the chain
  across the boundary; the mapper trusts it and does not re-derive.

#### Subagent ToolCall on replay

A subagent invocation lives as one Agent/Task `tool_use` envelope plus
its paired `tool_result` envelope in the parent transcript; the
subagent's own messages live in `<root>/subagents/<agentId>.jsonl` and
require a separate `getSubagentMessages` call. Replay never inlines
subagent Turns — the protocol's URI shape
(`<parent>/subagent/<toolCallId>`) is the navigation seam.

**Content shape on the parent Turn's completed `ToolCall`:**

```ts
result: {
    success,
    pastTenseMessage,
    content: [
        ...mappedToolResultBlocks,                // text/structured from the tool_result envelope
        { type: ToolResultContentType.Subagent,   // navigation marker
          resource: buildSubagentSessionUri(parentURI, toolCallId),
          title, agentName, description }
    ],
}
_meta: { toolKind: 'subagent', subagentDescription: <input.description> }
```

Mirrors the live merge in
[`agentSideEffects.ts`](../agentSideEffects.ts) — the workbench
renderer reads `ToolCallCompletedState.content[]` either way, so live
and replay produce identical shapes.

**`_meta.toolKind = 'subagent'` is the durable discriminator.** The
renderer falls back to `_meta.toolKind` when the Subagent content
block is absent, so the mapper sets it on every Agent/Task tool
invocation regardless of whether the marker is attached.

**Workbench drives the second call.** `getSessionMessages(parentURI)`
returns parent Turns with subagent markers; when the user opens a
marker, the workbench calls `getSessionMessages(subagentURI)`. The
host dispatches by URI shape, walks up to root via
`parseSubagentSessionUri`, and calls SDK `getSubagentMessages`. One
SDK call per `IAgent.getSessionMessages` invocation — subagent
transcripts are fetched lazily, never eagerly.

**HISTORY produces only terminal ToolCall states.** `Streaming` /
`PendingConfirmation` / `Running` / `PendingResultConfirmation` are
live-only lifecycle states. Replay flattens straight to `Completed`
or `Cancelled`. The "running content merges into result on complete"
dance from the live path is not reproduced.

### M8 — Live `Query: AsyncGenerator<SDKMessage>`

| Direction | SDK → Host (live) |
|---|---|
| SDK primitive | `for await (const message of query) {...}` |
| Reference | [claudeCodeAgent.ts](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts) `_processMessages`, [claudeMessageDispatch.ts](../../../../../../extensions/copilot/src/extension/chatSessions/claude/common/claudeMessageDispatch.ts) `dispatchMessage` |

`SDKMessage` is a much wider union than `SessionMessage`. The live
mapper handles cases the replay path never sees:

| `SDKMessage` variant | Mapper action |
|---|---|
| `SDKAssistantMessage` (`type: 'assistant'`) | Same as replay: push response parts. **Reconcile** with any partial accumulator first — final is canonical |
| `SDKPartialAssistantMessage` (`type: 'stream_event'`) | Update `ActiveTurn` response parts incrementally (text deltas concatenate, tool-input JSON deltas accumulate then parse on completion). Drives streaming UI |
| `SDKUserMessage` / `SDKUserMessageReplay` | Tool results streaming back; same flattening as replay |
| `SDKResultMessage` (`type: 'result'`) | **Closes the Turn**: `usage`, `total_cost_usd`, `state` (`success` / `error_max_turns` / `error_during_execution`), `error`. **No replay equivalent.** This is the trigger for `requestComplete` |
| `SDKCompactBoundaryMessage` | Same as replay |
| `SDKNotificationMessage`, `SDKStatusMessage`, `SDKHookStartedMessage`, `SDKHookProgressMessage`, `SDKHookResponseMessage`, `SDKToolProgressMessage`, `SDKAPIRetryMessage`, `SDKPluginInstallMessage`, `SDKTaskStartedMessage`, `SDKTaskUpdatedMessage`, `SDKTaskProgressMessage`, `SDKAuthStatusMessage`, `SDKMemoryRecallMessage`, `SDKToolUseSummaryMessage`, `SDKFilesPersistedEvent`, `SDKRateLimitEvent`, `SDKLocalCommandOutputMessage`, `SDKSessionStateChangedMessage`, `SDKDeferredToolUse`, `SDKElicitationCompleteMessage`, `SDKPromptSuggestionMessage` | Various live-only signals. The reference dispatcher handles only `assistant`, `user`, `result`, and 4 system subtypes (`compact_boundary`, `hook_started`, `hook_progress`, `hook_response`); everything else logs as "known unhandled" or "unknown". Side-channel events drive UI (typing indicator, progress, retry banners, hook badges) but do not become protocol response parts |

**Partials are advisory; final `SDKAssistantMessage` is canonical.**
When the final lands, replace whatever the partial accumulator built.
Trades minor visual flicker for correctness.

**One mapper, two drivers.** Live and replay must hydrate the same
internal maps (especially `tool_use_id → turnId`) so `tool_result`
events delivered after a session restore can resolve to the
announcing `tool_use`'s `turnId`. The mapper is the single seam.

**Boundary asymmetry vs replay.** Live closes a Turn on
`SDKResultMessage`; replay closes a Turn on the next
non-`tool_result` `user` envelope. Live cannot wait for the next user
message — the user might never send one and a perpetually-running
Turn would surface as a hung UI. Replay cannot use `SDKResultMessage`
— the SDK does not persist it to JSONL (it carries live-only `usage`
/ `cost` / `permission_denials`). Same logical Turn, two different
end signals.

**Live-only Turn metadata.** `total_cost_usd`, `usage`,
`permission_denials`, `is_error` arrive on `SDKResultMessage` and are
written to the Turn at the moment it closes. Replayed Turns have none
of this — `usage` is `undefined`, cost is unknown. Acceptable
asymmetry: replay is for display, not accounting. Backfilling from
`getSessionInfo` is possible but deferred until a concrete consumer
needs it.

### M9 — Lifecycle: `createSession` (incl. fork), `onDidMaterializeSession`, `disposeSession`, `onArchivedChanged`, `shutdown`, `dispose`

| Direction | Host → SDK (lifecycle), Client → Host (state) |
|---|---|

The lifecycle surface is **not** a single linear pipeline. It splits
into three orthogonal axes that the catalogue keeps strictly
separate:

1. **Birth axis**: `createSession` (optionally with a `fork` config),
   followed (lazily, on first `sendMessage`) by an internal
   *materialization* that the agent signals via
   `onDidMaterializeSession`. Provisional draft → live SDK `Query`
   and (optionally) a worktree.
2. **Soft-state axis**: `onArchivedChanged(uri, isArchived)`.
   Toggles whether a materialized session's worktree directory is
   present on disk; SDK session and per-session DB are untouched.
3. **Teardown axis**: `disposeSession` (single) and
   `shutdown` / `dispose` (provider-wide). Tears down the SDK
   `Query`, in-memory wrapper, and process-owned worktree.

There is **no separate `IAgent.fork` method.** Forking is a flavor of
`createSession` — clients pass
`IAgentCreateSessionConfig.fork = { session, turnIndex, turnId, turnIdMapping? }`
([agentService.ts:222-234](../../common/agentService.ts#L222-L234))
and the agent decides how to realize it.

There is also **no `IAgent.materialize()` method.** Materialization
is an internal concern of the agent. The IAgent surface exposes only:
- `IAgentCreateSessionResult.provisional?: boolean` — a hint that the
  session has no on-disk state yet.
- `IAgent.onDidMaterializeSession?: Event<IAgentMaterializeSessionEvent>` —
  fired *once* by the agent when a previously-provisional session has
  its SDK session, worktree (if any), and on-disk metadata in place.
  The `IAgentService` uses this event to defer the `sessionAdded`
  protocol notification so observers don't see a half-formed session.

| IAgent surface | SDK primitive(s) | What it does |
|---|---|---|
| `createSession(config)` (no `fork`) → `IAgentCreateSessionResult { provisional: true }` | none (no SDK call) | Records a **provisional** session: id, requested `workingDirectory` (= the repo path the client passed in), title, model, etc. No `Query`. No on-disk session file. The agent reserves the eventual session id locally. The session shows up in `listSessions` but cannot receive messages until materialized. |
| `createSession({ fork: { session, turnIndex, turnId, turnIdMapping? } })` → `IAgentCreateSessionResult { provisional: false }` | `forkSession(parentSessionId, { upToMessageId: lastUuidOfTurn(turnId), title? })` → `{ sessionId }` | **Materializes immediately on disk** because `forkSession` writes the new session file synchronously. SDK rewrites every message UUID and rebuilds the `parentUuid` chain. Result is **not provisional**. No `Query` is started yet — that still happens lazily on first `sendMessage` — but because the session already exists on disk, the materialization path will use `resume: forkedSessionId` in `Options` (see *Fresh vs resumed* below). The agent fires `onDidMaterializeSession` here, immediately after `forkSession` returns. |
| (internal) first `sendMessage` on a provisional session | `query({ options })` with `Options.sessionId = sessionId` (fresh) or `Options.resume = sessionId` (resumed) | Triggers internal materialization. Resolves effective `workingDirectory` (Copilot may create a worktree); constructs `Options`; starts `Query`; fires `onDidMaterializeSession`; then proceeds to send the actual user message. Subsequent `sendMessage` calls reuse the live `Query`. |
| `onArchivedChanged(uri, isArchived)` (optional) | none (SDK untouched) | Soft, reversible. `true`: remove worktree dir from disk if branch is preserved and tree is clean (Copilot's `_cleanupWorktreeOnArchive`). `false`: `git worktree add --existing` against the preserved branch (`_recreateWorktreeOnUnarchive`). SDK session, per-session DB, branch all untouched. Claude does not implement this yet. |
| `disposeSession(sessionId)` | `Query.interrupt()` + `Query.return()` (or asyncDispose) | Full teardown of one session: kill SDK `Query`, drop in-memory wrapper, delete state-manager entry, and (Copilot) remove the worktree if it was created in this process. Triggered by explicit protocol `disposeSession` or the empty-session GC. |
| `shutdown()` | per-session `Query.interrupt()` + asyncDispose, serialized through a sequencer; then SDK client stop | Graceful, async, **memoized** drain of all sessions. Walks `_sessions` ∪ `_createdWorktrees`, runs `_destroyAndDisposeSession` per id through `_sessionSequencer` so it interleaves with concurrent `sendMessage` / `disposeSession`. Claude additionally aborts provisional `AbortController`s first so any racing `await sdk.startup()` unwinds cleanly. |
| `dispose()` | synchronous teardown of provider | Hard provider teardown. Copilot: kicks off `shutdown()` and chains `super.dispose()` in `.finally` (cooperatively reuses the memoized drain). Claude: aborts provisional controllers, then `super.dispose()` synchronously disposes `_sessions` (each wrapper interrupts/asyncDisposes its `Query`), then releases `_proxyHandle` — wrapper-before-proxy ordering is load-bearing. |

#### Birth axis: provisional → materialized

The two-phase contract is locked at the IAgent layer
([agentService.ts](../../common/agentService.ts) IAgent
`createSession` + `IAgentCreateSessionResult.provisional` +
`onDidMaterializeSession`). It is a **client-observable result flag
plus an event**, not a method pair.

- **Provisional state (non-fork `createSession`).** Returns
  immediately with the caller's requested `workingDirectory` (= the
  repo path) and `provisional: true`. No `Query`, no worktree, no
  SDK subprocess, no on-disk session file. The session is listable
  (deferred by `IAgentService` until materialization) but
  message-sending is the trigger that promotes it. Drafting is
  cheap: the user can compose a prompt, cancel, change models, etc.
  without paying for an SDK process or a git worktree.
- **Non-provisional state (fork `createSession`).** `forkSession`
  writes the new session file to disk synchronously, so the result
  has `provisional: false` and `onDidMaterializeSession` fires
  immediately. No `Query` is started yet; that still happens lazily.
  But the materialization path that runs on first `sendMessage` will
  treat the session as *resumed* rather than *fresh* — see below.
- **Internal materialization on first `sendMessage`.** When the
  agent receives `sendMessage` for a still-undermaterialized session
  (whether the on-disk file exists from fork or doesn't exist yet),
  it:
  1. Resolves the effective `workingDirectory`. Copilot's
     `_resolveSessionWorkingDirectory` consults `_createdWorktrees`
     and may run `git worktree add` on a fresh branch. Claude
     currently uses the requested path as-is.
  2. Constructs SDK `Options` with that `cwd` and all other
     startup-only fields.
  3. Calls `query({ options })` → SDK forks the CLI subprocess,
     which inherits `cwd`. Stores the resulting `Query` in
     `_sessions`.
  4. Fires `onDidMaterializeSession` (only if it has not already
     been fired — the fork path fires it earlier).
- **Why worktree before `query()`?** SDK subprocess `cwd` is fixed
  at fork-time and cannot be changed afterwards. Worktree creation
  must complete before `query()` or the SDK runs in the wrong
  directory. Reverse ordering would require a second restart to
  relocate.

##### Fresh vs resumed: `Options.sessionId` vs `Options.resume`

The SDK distinguishes a session id that the host wants the SDK to
**create** from one it wants the SDK to **resume**. They are
mutually exclusive on `Options`. The reference extension picks
between them based on whether the session file already exists on
disk
([claudeCodeAgent.ts:457-459](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts#L457-L459)):

```ts
// Use sessionId for new sessions, resume for existing ones (mutually exclusive)
...(this._isResumed
    ? { resume: this.sessionId }
    : { sessionId: this.sessionId }),
```

Mapping that to the IAgent lifecycle:

| Origin | On-disk session file exists at materialize time? | `Options` field |
|---|---|---|
| Fresh non-fork session (provisional → materialize on first `sendMessage`) | No | `sessionId: <preallocated id>` — SDK creates the session file |
| Forked session (`forkSession` already wrote the file) | Yes | `resume: <forkedSessionId>` — SDK resumes the on-disk transcript |
| Restored / imported session (already on disk from a prior process) | Yes | `resume: <sessionId>` |

The agent must track "is this session id backed by an on-disk file
yet?" across its provisional/materialize lifecycle so it picks the
correct field. The fork path flips the bit at `forkSession` return
time; the fresh path flips it at `query({ sessionId })` return time.

#### Fork sub-flow

Fork is **not** a separate IAgent method. It is a config field on
`createSession`:
[`IAgentCreateSessionConfig.fork`](../../common/agentService.ts#L222-L234).

Protocol → SDK shape:

| Layer | Field | Purpose |
|---|---|---|
| Protocol (`fork`) | `session: URI` | Parent session to fork from |
| Protocol (`fork`) | `turnIndex: number` | Position of the cut, for client-side display / validation |
| Protocol (`fork`) | `turnId: string` | Opaque protocol turn id at the cut. **Equal to the SDK uuid of the user `SessionMessage` that *started* turn T** (see `Turn.id` glossary). The agent must translate this to the uuid of the *last* SessionMessage of turn T before passing it to the SDK — see the `upToMessageId` derivation below. |
| Protocol (`fork`) | `turnIdMapping?: ReadonlyMap<string, string>` | Service-layer-populated old→new protocol turn id table. The agent uses this to rewrite per-turn metadata (event-id mappings, etc.) in the session DB so the forked transcript still resolves correctly |
| SDK (`forkSession` opts) | `upToMessageId` | **Inclusive** message-uuid cutoff. Receives the uuid of the last SessionMessage of turn T — i.e. the SessionMessage immediately before turn T+1's user message, or the final SessionMessage in the transcript if T is the last turn. **Not** the protocol `turnId` itself: passing `turnId` directly would slice at the *user* message that *started* T, dropping T's assistant reply and tool results entirely. |
| SDK (`forkSession` opts) | `title?` | Optional fork title; defaults to `${parentTitle} (fork)` |
| SDK (`forkSession` opts) | `dir?` | Project directory; agent supplies from session config |
| SDK result | `{ sessionId }` | New session UUID, resumable via `resumeSession(sessionId)` — handed back to the IAgent layer as the new session's id |

Key properties of SDK `forkSession`
([sdk.d.ts](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts) lines 552–571):

- **It is a top-level SDK function, not a `Query` method.** No live
  session is required to fork — the SDK reads the parent transcript
  off disk and writes a new one.
- **`upToMessageId` is inclusive on the SessionMessage axis, not the
  Turn axis.** The SDK has no notion of "turn." It slices the
  parent's flat SessionMessage stream up to and including the
  message whose uuid matches `upToMessageId`. To fork "through the
  end of turn T" the agent must walk the parent transcript and pick
  the *last* SessionMessage of T — the message immediately before
  turn T+1's user `SessionMessage`, or the final SessionMessage of
  the transcript if T is the last turn. Passing protocol `turnId`
  directly would cut at T's *user* message and drop the assistant
  reply, tool calls, and tool results that belong to T.
- **UUID remap is exhaustive.** Every message UUID is rewritten and
  the `parentUuid` chain is rebuilt. The protocol-level invariant
  that `Turn.id` ≡ user-message uuid means the host must regenerate
  fresh `Turn.id`s for the forked turns; that's exactly what
  `turnIdMapping` records.
- **No undo history copy.** File-history snapshots are not copied,
  so a fork starts with an empty undo stack on its own files.
- **Fork → materialize is independent.** `forkSession` only writes
  the new session file; it does not start a `Query`. Because the
  file now exists, the IAgent layer marks the result
  `provisional: false` and fires `onDidMaterializeSession`
  immediately, but the SDK `Query` is still not started until the
  first `sendMessage`. At that point the session goes through the
  same internal materialization path as a fresh session, except
  `Options` carries `resume: forkedSessionId` instead of
  `sessionId: <newId>`. A worktree, if requested, is created at
  that moment exactly as for a non-forked session.

#### Soft-state axis: archive ≠ dispose

Archive is **not** "session is on-disk-only, restored via
materialize." Materialization is a one-way edge from provisional to
live. Archive is a **toggle on a materialized session** that controls
only the worktree-on-disk question. Concretely:

| | `disposeSession` | `onArchivedChanged(true)` | `onArchivedChanged(false)` |
|---|---|---|---|
| SDK `Query` | Killed | Untouched | Untouched |
| In-memory wrapper | Dropped | Untouched | Untouched |
| State-manager entry | Deleted | `isArchived: true` persisted | `isArchived: false` persisted |
| Worktree directory | Removed (if process-owned) | Removed (if branch preserved + tree clean) | Re-added via `git worktree add --existing` |
| Branch | Untouched | Preserved | Preserved |
| `listSessions` | Gone | Returned with `isArchived: true` | Returned with `isArchived: false` |
| `restoreSession` | N/A | Works as for any session | Works as for any session |

There is **no required ordering** between archive and dispose. Both
are independent triggers (UI archive vs. GC / explicit dispose) and
both independently include worktree removal on the Copilot path.
Typical flow is the opposite of the question's premise: archive
first (soft, reversible), then maybe dispose later (hard,
irreversible).

`AgentSideEffects` is the seam that persists `isArchived` to the
per-session DB and forwards to `agent.onArchivedChanged?` (errors
logged, not awaited) — so archive is fire-and-forget from the
client's perspective; the provider's worktree work runs in the
background.

#### Teardown axis: `disposeSession` vs `shutdown` vs `dispose`

| Surface | Scope | Sync? | Reuses `shutdown`? | Notes |
|---|---|---|---|---|
| `disposeSession(id)` | one session | async | n/a | Routes through `_sessionSequencer` so it serializes against in-flight `sendMessage`. Worktree removal consults the **in-memory** `_createdWorktrees` map — sessions created in a previous process lifetime are not removed by this path; archive cleanup picks them up via the persisted DB metadata. |
| `shutdown()` | all sessions | async, memoized | self | Walks `_sessions ∪ _createdWorktrees`. Memoization (`_shutdownPromise`) means concurrent calls fold into one drain. Claude aborts provisionals first to unwind racing `sdk.startup()` awaits. |
| `dispose()` | provider | sync surface; may chain async | Copilot: yes; Claude: no | Copilot: `shutdown().finally(super.dispose)` — cooperative. Claude: synchronous wrapper-then-proxy teardown, no graceful drain. The provider choice is intentional: Claude's wrapper is the stronger ownership and must dispose before the IPC handle. |

`AgentService.shutdown` fans out `provider.shutdown()` in parallel;
`AgentService.dispose` calls `provider.dispose()` on every provider
and then `super.dispose()`. The host does not enforce a strict
shutdown-before-dispose order across providers — each provider
internally decides whether `dispose` chains `shutdown` or not.

#### Invariants

- **Provisional sessions own no SDK resources.** A provisional
  session exists only in the host's state manager; killing the
  process leaves no SDK subprocess to clean up. This is why the
  empty-session GC can dispose them without coordination. A forked
  session is **not** provisional even though it has no live `Query`
  yet — its session file is on disk and disposal must remove it.
- **Materialization is one-way and signaled by event, not method.**
  There is no `materialize()` call on `IAgent` and no
  de-materialize. The agent fires `onDidMaterializeSession` exactly
  once per session, either from the fork path (immediately on
  `createSession` return) or from the first-`sendMessage` path
  (after `query()` returns). Once a session has been materialized,
  archive is the soft path back to "on-disk transcript, no live
  worktree."
- **`Options.sessionId` and `Options.resume` are mutually
  exclusive.** The host must track on-disk existence per session id
  to choose the right one. Getting this wrong yields either a
  duplicate-id error from the SDK (passing `sessionId` for a file
  that exists) or a missing-session error (passing `resume` for a
  file that does not).
- **Worktree ownership is provider-owned, not IAgent-owned.** IAgent
  has no `worktree` concept; `workingDirectory` is the only contract.
  Whether that directory is a worktree, a plain repo path, or
  something else is a provider implementation detail.
- **Archive does not unlive a session.** The SDK `Query` keeps
  running if it was running; clients should not assume archive
  implies "no in-flight turn." UI that needs that guarantee must
  combine archive with an explicit `abortSession`.
- **`shutdown` is the graceful path; `dispose` is the floor.** Code
  that needs cleanup ordering (e.g. flushing telemetry, persisting
  final state) must hook into `shutdown`, not `dispose`. `dispose`
  may run after a crash with no async work permitted.

#### Asymmetries between Copilot and Claude

| | CopilotAgent | ClaudeAgent |
|---|---|---|
| Worktree on materialize | Yes (`_resolveSessionWorkingDirectory` + `_createdWorktrees`) | No (uses requested `workingDirectory` as-is) |
| `onArchivedChanged` | Implemented (clean + recreate) | Not implemented |
| `disposeSession` worktree path | Consults in-memory `_createdWorktrees` | No worktree state to clean |
| `shutdown` provisional handling | Drops provisional records + `_activeClients` snapshot | Aborts provisional `AbortController`s first to unwind racing `sdk.startup()` |
| `dispose` strategy | Chain `shutdown().finally(super.dispose)` | Synchronous wrapper-then-proxy teardown (no graceful drain) |
| Sequencer | `_sessionSequencer` (per-session) | `_disposeSequencer` (drain only) |

These asymmetries are deliberate. Copilot's worktree story requires
process-lifetime metadata to clean up correctly, so its dispose path
is heavier and benefits from reusing the memoized graceful drain.
Claude's wrapper owns the SDK `Query` directly and has a
load-bearing wrapper-before-proxy disposal order that doesn't
compose well with a chained shutdown.

### M10 — Steering and truncation: `setPendingMessages`, `IAgentSteeringConsumedSignal`, `truncateSession`

| Direction | Client → Host (write) for steering / truncation, Host → Client (signal) for ack |
|---|---|

Steering and truncation are the two IAgent surfaces that mutate a
session's *content* (rather than its lifecycle or its config).
They are deliberately small surfaces because the host owns the
messy parts (queueing, timing, ack semantics) and the agent only
sees the deltas it can act on.

#### Steering: `setPendingMessages` + `IAgentSteeringConsumedSignal`

| IAgent surface | SDK primitive(s) | What it does |
|---|---|---|
| `setPendingMessages?(session, steeringMessage, queuedMessages)` (optional) | Yield an `SDKUserMessage` with `priority: 'now'` into the prompt iterable that was passed to `query()` ([sdk.d.ts:3067-3086](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L3067-L3086)) | Notifies the agent that the session's pending-message state changed. The agent reacts by yielding the steering content as an `SDKUserMessage` whose `priority` is `'now'`, which the SDK treats as "preempt the current turn and run me first." |
| (outbound signal) `AgentSignal { kind: 'steering_consumed', session, id }` | n/a (host-emitted on SDK ack) | Agent fires this signal when the SDK confirms the steering message was delivered to the model. Host then dispatches `SessionPendingMessageRemoved` so the client clears the pending pill. |

##### Pending-message taxonomy (locked at the protocol layer)

The protocol distinguishes two kinds of pending messages
(`PendingMessageKind` in
[sessionState.ts](../../common/state/sessionState.ts)):

| Kind | Semantics | Lifecycle |
|---|---|---|
| `Steering` | Inject *into the running turn* as additional context. The model sees it before its current generation completes. | Set while turn is in flight; consumed when the SDK acks the inject; removed via `IAgentSteeringConsumedSignal`. |
| `Queued` | Hold until the current turn finishes, then send as a normal `sendMessage`. | Set while turn is in flight; **server consumes server-side** by issuing `sendMessage` when the turn completes; never forwarded to the agent. |

This taxonomy is the reason the `setPendingMessages` signature has
two parameters but only one of them ever carries a value at the
agent boundary:

```ts
setPendingMessages?(
    session: URI,
    steeringMessage: PendingMessage | undefined,
    queuedMessages: readonly PendingMessage[]
): void;
```

`queuedMessages` is **always empty** when this method is called on
the agent. The host keeps the queued list internally; once the
in-flight turn completes, the host pops the head of the queue and
calls `sendMessage` for it. The signature exposes the queue param
only so future agents (e.g. a hypothetical agent that wants to
display the queue itself) could opt in — today no agent does.

##### Why `priority: 'now'` is the steering primitive

`SDKUserMessage` carries an optional `priority` field with three
values that map directly onto an SDK-internal command queue
([cli.js:1030](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/cli.js#L1030):
`{ now: 0, next: 1, later: 2 }`). Lower number = higher dequeue
priority:

| Value | Behaviour | Default for |
|---|---|---|
| `'now'` | The SDK aborts the in-flight turn (`abortController.abort("interrupt")`) the moment a `'now'`-tagged entry lands in the queue, then runs that message as the next turn. | Nothing — must be set explicitly. |
| `'next'` | Queued; runs as a normal turn after the current turn finishes. | User-typed prompts, MCP channel messages, regular slash commands. |
| `'later'` | Queued behind any pending `'next'` messages; runs only when nothing more urgent is waiting. | Task notifications, scheduled cron firings, sub-task results. |

So "steering" reduces to one line: yield an `SDKUserMessage` with
`priority: 'now'` into the same prompt iterable the session was
started with. The SDK's watcher
([cli.js:8661](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/cli.js#L8661))
sees the `'now'` entry, fires the abort, and the dequeue helper
immediately picks the message up because of its weight-`0`
position.

##### `streamInput()` vs prompt iterable vs `interrupt()`

The SDK exposes three operations that *could* be relevant to
mid-turn injection. Only one is actually used in the reference
Claude implementation:

| Mechanism | Reference Claude impl uses it? | Role |
|---|---|---|
| Prompt iterable (passed to `query({ prompt })`) | **Yes** — [claudeCodeAgent.ts:504-506, 518-587](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts#L504-L506) | Long-lived `async function*` that yields *every* `SDKUserMessage` for the session's lifetime. |
| `Query.streamInput(stream)` ([sdk.d.ts:1910](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L1910)) | **No** — zero callers under `extensions/copilot/src/extension/chatSessions/claude/**` | An alternate transport for pushing additional messages into a live `Query`. The reference impl never invokes it; the prompt iterable absorbs that role. |
| `Query.interrupt()` ([sdk.d.ts:1745](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L1745)) | **No** for steering — the abort is implicit, driven by the SDK's own `'now'`-priority watcher. The host *does* use the `AbortController` for explicit aborts (M4). | Stops generation outright; would orphan the steering message. |

Key insight: **transport and routing are orthogonal.** The prompt
iterable (or `streamInput`) is the *channel* by which a message
reaches the SDK; `priority` is the *per-message routing hint* the
SDK applies after the message arrives. Steering on the Claude SDK
does not need a special transport — yielding into the existing
prompt iterable with `priority: 'now'` is sufficient.

##### Reference Claude impl: every message is `'now'`

[claudeCodeAgent.ts:580](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts#L580)
yields *every* user message with `priority: 'now'`, not just
steering messages:

```ts
yield {
    type: 'user',
    message: { role: 'user', content: prompt },
    priority: 'now',
    parent_tool_use_id: null,
    session_id: this.sessionId,
    uuid: request.request.id as `${string}-${string}-${string}-${string}-${string}`
};
```

This is correct *for the world the reference impl lives in*. The
standalone chat-session UI has one text input and no protocol-level
notion of "queued"; from the user's point of view, **every message
typed during a live turn is a steering message** by definition.
There is no other intent it could carry. The reference impl is
therefore not papering over a distinction — the distinction simply
doesn't exist at its layer. Tagging every message `'now'` faithfully
encodes "the user wants this seen as soon as possible":

- If no turn is in flight, the SDK has nothing to abort — `'now'`
  reduces to "run me right away," the same outcome `'next'` would
  produce in an empty queue.
- If a turn *is* in flight, the user is steering — that's the only
  intent the chat-session UI can express.

The IAgent protocol is **richer**: the host explicitly distinguishes
two operations the chat-session UI can't.

| Protocol op | Intent | What the user did |
|---|---|---|
| `sendMessage` | "Run this as a turn." | Hit Enter normally. |
| `setPendingMessages` (Steering) | "Inject into the running turn." | Pressed the dedicated steering control while a turn was generating. |
| `setPendingMessages` (Queued) | "Hold this until the current turn finishes, then send normally." | Hit Enter while a turn was generating, with a UI that exposes a queue. |

Because the host already separates these intents, an IAgent Claude
provider should honor them at the SDK seam:

| Protocol op | SDK priority | Why |
|---|---|---|
| `sendMessage` | `'next'` (or unset — `'next'` is the SDK default) | New turn; should run after the current turn finishes if one is in flight. |
| `setPendingMessages` Steering | `'now'` | Preempt the current turn (this is the whole point of the steering operation). |
| `setPendingMessages` Queued | n/a at agent boundary | Host consumes server-side and re-issues as `sendMessage` (which is `'next'`) when the turn ends. |

So the IAgent Claude provider doesn't mirror the reference impl's
"everything is `'now'`" \u2014 it uses the richer information the host
already gives it. The reference impl isn't wrong; it's just
operating without the distinction the protocol exposes.

##### Steering ack semantics

The signal `IAgentSteeringConsumedSignal { kind: 'steering_consumed', session, id }`
([agentService.ts:359-362](../../common/agentService.ts#L359-L362))
is **not** emitted when the iterable's `yield` resolves — yielding
only means the SDK accepted the message into its command queue.
The agent emits the signal when the SDK actually surfaces the
message to the model (the next `SDKUserMessage` echo on the event
stream after the SDK's `'now'`-watcher has aborted the previous
turn and dequeued this message). This matches the client's
expectation: the pending-message pill should clear when the model
has *seen* the steering, not when the queue accepted it.

The host's reaction to the signal is to dispatch
`SessionPendingMessageRemoved { kind: PendingMessageKind.Steering, id }`
through the state machine
([reducers.ts](../../common/state/protocol/reducers.ts) line 743).
This is the second of the three steering touchpoints on the host:

1. Client writes `SessionPendingMessageSet { kind: Steering, ... }`.
2. Host forwards the new state to `IAgent.setPendingMessages`.
3. Agent emits `steering_consumed` after SDK ack.
4. Host dispatches `SessionPendingMessageRemoved { kind: Steering, id }`.

##### Steering vs `sendMessage` boundary

A steering message is **not** a turn boundary. It does not get a
`Turn.id`, does not appear as a separate user `Turn` in
`getSessionMessages`, and does not emit a `SessionTurnStart`. From
the protocol Turn perspective it is invisible — its content shows
up as part of the *next* assistant message in the current turn,
because the model received it mid-generation and folded it into
the response. The agent's transcript reconstruction
(`getSessionMessages`, M7) collapses the SDK's intermediate
`SDKUserMessage` for steering into the in-progress Turn rather
than starting a new one. This is an asymmetry vs `sendMessage`
that consumers must understand: a UI showing "turns" should not
expect each pending-message-set + steering-consumed pair to add a
row.

#### Truncation: `truncateSession`

| IAgent surface | SDK primitive(s) | What it does |
|---|---|---|
| `truncateSession?(session, turnId?)` (optional) | None on the Claude SDK; provider-specific RPC on Copilot. Claude composes via `forkSession` instead. | Mutates the session's transcript to keep turns up to and including `turnId` (or remove all turns if `turnId` is undefined). The session's URI / id is preserved — this is **in-place** mutation, not "make a new session." |

##### Protocol semantics

From [`agentService.ts:509-513`](../../common/agentService.ts#L509-L513):

> Truncate a session's history. If `turnId` is provided, keeps turns up to and including that turn. If omitted, all turns are removed.

The `?` is load-bearing: this method is **optional**. Agents that
cannot truncate in place leave it `undefined` and the host falls
back to fork (which produces a new session id) at a higher layer
when the user explicitly asks for "rewind here."

##### Copilot: in-place via SDK RPC

CopilotAgent implements `truncateSession`
([copilotAgent.ts:1179-1212](../../node/copilot/copilotAgent.ts#L1179-L1212)).
Two key translations between protocol and SDK semantics:

| Protocol | SDK |
|---|---|
| `turnId` = last turn to **keep** (inclusive) | `eventId` = first event to **remove** (everything from this point forward is dropped) |
| `truncateSession(session, turnId)` | `entry.getNextTurnEventId(turnId)` → `entry.truncateAtEventId(eventId, turnId)` |
| `truncateSession(session)` (omit turnId) | `entry.getFirstTurnEventId()` → `entry.truncateAtEventId(eventId)` (remove all) |

The Copilot SDK exposes a session-mutation RPC
(`truncateAtEventId`) that rewrites the on-disk transcript in
place. The agent serializes the call through `_sessionSequencer`
so it doesn't race with `sendMessage` or `disposeSession`.
Provisional sessions short-circuit (nothing to truncate).

##### Claude: deliberately not implemented

Claude's roadmap explicitly excludes `truncateSession`
([roadmap.md:804-807](../../node/claude/roadmap.md)):

> **Do NOT implement `IAgent.truncateSession`**. The SDK's `forkSession`
> always mints a new session ID, which is incompatible with the protocol's
> expectation that `truncateSession` mutates the existing session URI in
> place. `truncateSession?` is optional in `IAgent`...

The Claude SDK has **no in-place transcript-mutation primitive**.
Available related primitives:

| SDK primitive | Why it doesn't map to `truncateSession` |
|---|---|
| `forkSession(sessionId, { upToMessageId })` | Mints a *new* session id; protocol requires same URI. Already mapped under M9 fork sub-flow. |
| `Query.interrupt()` | Stops generation; doesn't remove past turns. |
| Compaction (`PreCompact` / `PostCompact` hooks, `SDKCompactBoundaryMessage`) | Summarizes earlier turns into a synthetic message; lossy and SDK-driven, not host-driven point truncation. |

Consumers that want "rewind to here" against a Claude session must
either (a) call `createSession({ fork: { ... } })` to get a new
forked URI, or (b) wait for an SDK-level in-place truncate to
land. The IAgent layer's optional `truncateSession?` makes this
choice transparent to clients: they call it if available,
otherwise compose with fork at the UI layer.

##### Asymmetries between Copilot and Claude

| | CopilotAgent | ClaudeAgent |
|---|---|---|
| `truncateSession` | Implemented; serializes through `_sessionSequencer`; protocol→SDK eventId translation | Not implemented (deliberate; SDK has no in-place truncate) |
| `setPendingMessages` (steering) | Implemented; injects via Copilot SDK's `send({ mode: 'immediate' })` | Implemented (planned Phase 9); yields `SDKUserMessage` with `priority: 'now'` into the existing prompt iterable |
| `setPendingMessages` (queued) | n/a — server consumes server-side | n/a — server consumes server-side |
| `IAgentSteeringConsumedSignal` | Emitted on SDK ack | Emitted when the SDK echoes the `'now'`-priority message on the event stream after preempting the in-flight turn |

The two SDKs land on the **same conceptual primitive** — a
per-message hint that means "preempt the current turn and serve
me first" — via different transports:

| Surface | New turn | Steering |
|---|---|---|
| Claude Agent SDK | yield `SDKUserMessage` with `priority: 'next'` (or default) | yield `SDKUserMessage` with `priority: 'now'` |
| Copilot CLI SDK | `session.send({ ... })` (no `mode`) | `session.send({ ..., mode: 'immediate' })` |

#### Invariants

- **Steering preserves the in-flight Turn at the protocol level
  even though the SDK preempts internally.** On the Claude SDK,
  `priority: 'now'` causes the SDK to abort the current
  generation and run the steering message next. The protocol Turn
  reconstruction (M7) folds the resulting messages back into the
  same Turn so consumers see steering as "additional context for
  the current generation," not a new turn. Provider implementations
  must yield via `priority: 'now'` (or the SDK's equivalent
  preempt hint), **not** via `Query.interrupt()` followed by a new
  send — that path produces explicit Turn boundaries.
- **`queuedMessages` is always empty at the agent boundary.** Any
  agent treating non-empty `queuedMessages` is implementing
  behavior the host explicitly excludes from this surface; the
  parameter exists only as a future-proofing slot.
- **Steering doesn't create a new `Turn.id`.** A steering message
  is folded into the current Turn's user-side history at
  reconstruction time. UIs that key off Turn boundaries will not
  see steering as a separate row.
- **`steering_consumed` waits for model visibility, not queue
  acceptance.** The signal must fire after the SDK has actually
  surfaced the message to the model, not when the agent's `yield`
  resolves. Premature signals would clear the pill before the
  user's intent has reached the model.
- **`truncateSession?` being undefined is a valid protocol
  state.** Clients must check for the optional-ness and degrade
  gracefully (e.g., offer fork instead). Agents must not throw
  for "not supported"; they simply don't define the method.
- **Truncation is in-place by definition.** Any operation that
  changes the session URI (forkSession) is M9, not M10. The
  protocol surfaces these as different methods deliberately.

### M11 — Config schema and `Options` ↔ `Query` duality

This is the cross-cutting portrait of *all configuration writes* in
the system, not a single IAgent method. It explains where every
config value enters the SDK (startup `Options` field vs runtime
`Query` setter), how the host's IAgent surface routes each kind of
write, and what the reference Claude impl does with the in-flight
request boundary to make non-bijective writes safe.

The "Startup-only vs runtime mutability" section earlier in this
document
([anchor](#startup-only-vs-runtime-mutability))
is the short version; M11 is the full mapping.

#### The hard split

The Claude SDK exposes configuration on **two surfaces** that look
similar but mean different things:

| Surface | Shape | When applied | Cost of change |
|---|---|---|---|
| `Options` (passed to `query({ options })`) | Plain object, ~70 fields | At subprocess `startup()` only — baked in for the lifetime of the `Query` | Forces a session restart (close current `Query`, spawn a new one) |
| `Query` runtime methods (`setModel`, `setPermissionMode`, `applyFlagSettings`, `setMcpServers`, `reloadPlugins`, `toggleMcpServer`, `reconnectMcpServer`, `setMaxThinkingTokens`) | Methods on the live `Query` instance | At any time the `Query` is live; serialised through the SDK's control-request channel | Cheap; no restart |

A handful of concepts are **bijective** — they appear on both
surfaces and are kept in sync by the SDK:

| Concept | `Options` field | `Query` setter | SDK control request |
|---|---|---|---|
| Active model | `model?: string` | `setModel(model?)` | `SDKControlSetModelRequest` ([sdk.d.ts:2425](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L2425)) |
| Permission mode | `permissionMode?: PermissionMode` | `setPermissionMode(mode)` | `SDKControlSetPermissionModeRequest` ([sdk.d.ts:2433](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L2433)) |
| Effort level | `effort?: EffortLevel` (5 values incl. `'max'`) ([sdk.d.ts:1213](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L1213)) | `applyFlagSettings({ effortLevel })` ([sdk.d.ts:1789](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L1789)) — note: 4-value subset, no `'max'` ([sdk.d.ts:4292](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L4292)) | `SDKControlApplyFlagSettingsRequest` ([sdk.d.ts:2080](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L2080)) |
| Thinking budget | `thinking: { type, budgetTokens? }` / deprecated `maxThinkingTokens` | `setMaxThinkingTokens(n \| null)` (deprecated) | `SDKControlSetMaxThinkingTokensRequest` |
| Dynamic MCP servers | `mcpServers?: Record<string, McpServerConfig>` | `setMcpServers(servers)` | `SDKControlMcpSetServersRequest` |
| Settings layer ("flag settings") | `settings?: string \| Settings` | `applyFlagSettings(partial)` | `SDKControlApplyFlagSettingsRequest` |

Everything else on `Options` is **startup-only**: changing it
requires closing the current `Query` and starting a new one with the
new `Options`. This includes `cwd`, `agent`, `agents`, `tools`,
`toolConfig`, `systemPrompt`, `plugins`, `hooks`, `canUseTool`,
`onElicitation`, `mcpServers` (when not subsequently overridden by
`setMcpServers`), `sandbox`, `settingSources`, and the bulk of the
type ([sdk.d.ts:977-1532](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L977-L1532)).

#### The effort clamp at the seam

The bijection is *not perfect* for effort. The two surfaces use
different value sets:

| Surface | Allowed values |
|---|---|
| `Options.effort: EffortLevel` | `'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'` |
| `applyFlagSettings({ effortLevel })` (typed via `Settings`) | `'low' \| 'medium' \| 'high' \| 'xhigh'` (no `'max'`) |

The reference extension handles this with a single-line clamp where
the runtime path crosses the seam
([claudeCodeAgent.ts:195-196](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts#L195-L196)):

```ts
// Settings.effortLevel does not include 'max'; the SDK treats it as a 'high' fallback.
await this._queryGenerator.applyFlagSettings({ effortLevel: effort as 'low' | 'medium' | 'high' | 'xhigh' | undefined });
```

Mapping consequence: *if* the host UI lets the user pick `'max'`
mid-session, the runtime write silently degrades to `'xhigh'` (or
the SDK's `'high'` fallback if `'xhigh'` is also unavailable on the
active model). To get true `'max'` mid-session the agent must take
the **restart-required** path: store the new effort, close the
`Query`, and spawn a new one with `Options.effort = 'max'`.

#### IAgent surface routes for config writes

Three write paths reach the SDK config layer:

| IAgent surface | Carries | SDK destination | Bucket |
|---|---|---|---|
| `IAgentCreateSessionConfig.config: Record<string, unknown>` | Provider-resolved schema fields (model, permissionMode, plugins, MCP, ...) | `Options.*` on the very first `query()` call | Startup |
| `IAgent.changeModel(session, model: ModelSelection)` | `ModelSelection { id, config?: Record<string, string> }` — model id **plus** the model's per-model config bag (e.g. `{ effort: 'high' }`) ([state.ts:232-236](../../common/state/protocol/state.ts#L232-L236)) | `Query.setModel(sdkId)` for `id`, plus `Query.applyFlagSettings({ effortLevel })` (and any other model-specific runtime setter) for entries in `config` | Hot-swap (bijective, atomic per call) |
| `IAgent.setCustomizationEnabled(uri, enabled)` | One customization toggle | `Query.reloadPlugins()` (or restart if tools diverge) | Defer-and-coalesce or restart-required |

The shape of `ModelSelection.config` is dictated by the model's
`IAgentModelInfo.configSchema` ([agentService.ts:267](../../common/agentService.ts#L267)).
For Claude models, the schema declares an `effort` property whose
allowed values follow the model's supported reasoning-effort set
(see [claudeCodeModels.ts:190-214](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeModels.ts#L190-L214)).
When the user re-picks effort in the chat UI, the workbench rebuilds
`ModelSelection` with the new `config.effort` and calls `changeModel`
— so **`changeModel` is the runtime mutation path for both `id` and
any bijective model-config field**, not just the active model id.

Note what's **not** on the IAgent surface: there is no
`setPermissionMode`, no `setEffort` (a *standalone* setter), no
`setTools`, no `setMcpServers`, no `setSystemPrompt`. Mid-session
mutation of those values is *not* a protocol-level concern — the
host re-issues `createSession` with the new `config` (effectively
forcing a restart) when they need to change. The only two runtime
mutation surfaces that are first-class on IAgent are **active
model + its bijective config bag** (`changeModel`) and
**customization enablement** (`setCustomizationEnabled`), because
those are the two the user changes most often during a live session.

The two unexposed-but-still-runtime SDK setters that are *not*
reached through `changeModel`'s config bag
(`Query.setPermissionMode`, generic `Query.applyFlagSettings({...})`
for non-model-bound settings) are *used internally* by the
reference extension, but driven from chat-session settings that
aren't part of the IAgent protocol. When the IAgent protocol grows
the corresponding surface, these methods become the natural
backing primitives.

#### Hot-swap / defer-and-coalesce / restart-required taxonomy

This is the reference extension's classification of *every* config
write, driven from the in-flight request boundary in
[`claudeCodeAgent.ts`](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts):

| Bucket | Examples | When applied | Mechanism in claudeCodeAgent.ts |
|---|---|---|---|
| Hot-swap (cheap, between turns) | `setModel`, `setPermissionMode`, `applyFlagSettings({ effortLevel })` (the latter two reached via `changeModel`'s `ModelSelection.config` for model-bound fields) | Awaited just before the next `SDKUserMessage` is yielded | `_setModel` / `_setPermissionMode` / `_setEffort` (lines 159-198): if `_queryGenerator` exists, `await` the SDK setter; otherwise stash for the next `startup()` |
| Defer-and-coalesce | `reloadPlugins` after `setCustomizationEnabled` | Set a `_pending*` flag while busy; apply at next yield boundary | `_pendingPrompt` deferred (line 133) gates the prompt iterable; flags are drained when it resolves |
| Restart-required | Tool-set diff, settings file change, any startup-only `Options` field | `_pendingRestart = true`, return from iterable, catch-block restarts session | `_pendingRestart` (line 145) flips at the boundary; iterable returns; outer catch closes the `Query` and reopens with new `Options` |

There is deliberately **no mid-turn mutation path** for any bucket.
Every host write either applies immediately when idle or queues for
the next prompt boundary. This is what makes the prompt iterable
(M1) the central choke point: it is also the only place the agent
honors pending config writes. See M1 for the yield-boundary code.

##### `changeModel` as a single hot-swap call

A single `changeModel` invocation can fan out to **multiple** SDK
runtime setters depending on what changed in the `ModelSelection`:

| `ModelSelection` diff | SDK calls performed at the next yield boundary |
|---|---|
| `id` changed | `Query.setModel(sdkId)` |
| `config.effort` changed | `Query.applyFlagSettings({ effortLevel })` (with the clamp) |
| Both changed | Both setters, in agent-defined order |
| Only model-config changed (same `id`) | The relevant config setters only (no `setModel`) |

From the protocol's point of view the call is **atomic**: the host
sends one new `ModelSelection`, the agent applies the bundle at the
next safe boundary, and the user observes the new model + new
effort together. The agent is responsible for the diff; there is no
per-field protocol method.

#### Bijective-concept lifecycle: write resolution order

For a bijective concept, the *resolved value at any moment* is
determined by a fixed precedence chain:

1. The most recent **runtime setter** call (if any), e.g.
   `Query.setModel('opus-4.7')`. This wins as long as the `Query`
   is live.
2. The **`Options` field** the `Query` was started with. This is
   the floor — every `Query` starts from `Options` and the runtime
   setter only diverges from it.
3. The SDK's **internal default** if neither was set.

When a `Query` restarts (resume, fork, or restart-required write),
precedence resets — only #2 and #3 apply until the next runtime
setter call. The reference extension preserves continuity by
storing the most-recent runtime values
(`_currentModelId`, `_currentPermissionMode`, `_currentEffort`)
and re-applying them on the new `Query` either via `Options`
(carry-through on restart) or via the runtime setter (post-startup
re-application).

This is the invariant that makes "restart-required" work without
losing in-progress UI state: the agent restarts the SDK, but the
session-level *config view* survives because the agent maintains
its own bijective state and re-pushes it.

#### Why this duality is unavoidable

The duality is not a design flaw. It reflects a real cost
difference at the subprocess boundary:

- `Options` are read once at subprocess startup, before the SDK
  loads plugins, builds the system prompt, opens MCP transports,
  and warms the prompt cache. Most fields touch one or more of
  those subsystems, and there's no protocol for a live SDK to
  rebuild them in place.
- `Query` runtime methods are *control-channel writes* over an
  already-running JSON-RPC link
  ([SDKControlRequestInner](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L2373)
  enumerates the full set). They are cheap because they only flip
  flags inside an already-warm subprocess.

The bijective concepts (model, permission mode, effort, MCP
servers, settings) are the cases where the SDK has done the work
to make in-place mutation safe; everything else stays startup-only
because rebuilding is harder than restarting.

#### Invariants

- **A bijective concept's runtime setter is *always* a strict
  subset of its `Options` value set, modulo a documented clamp.**
  When the runtime setter's typed value range is narrower (effort:
  4 vs 5), the agent must clamp at the seam, *not* at the IAgent
  surface — clamping at the IAgent surface would lose the user's
  original intent for the next restart.
- **`changeModel` is bundle-atomic.** A single call carries `id`
  *and* the model's full config bag. The agent applies the diff as
  one or more SDK setters at the same yield boundary; consumers
  must not assume "id stable ⇒ effort stable" or vice versa across
  a `changeModel` call.
- **Non-bijective writes always restart.** Any write to a
  startup-only `Options` field reaches the SDK only through a
  fresh `query()` call. Agents must classify every config write as
  hot-swap / defer-and-coalesce / restart-required up front and
  pick the path; there is no "try runtime, fall back to restart"
  pattern.
- **Restart preserves the bijective state.** When the agent
  restarts the `Query`, it re-applies its stored bijective values
  (model, permission mode, effort, ...) so the user-visible config
  stays continuous across the restart. Failing to do so would make
  every customization toggle silently revert the active model.
- **The IAgent surface is intentionally narrower than the SDK
  surface.** Only `changeModel` and `setCustomizationEnabled` are
  first-class runtime mutations. Everything else flows through
  `IAgentCreateSessionConfig.config` and a session restart. This
  is a protocol choice, not an SDK limitation.
- **The prompt iterable is the only mutation barrier.** All three
  buckets (hot-swap, defer, restart) synchronise at the same point:
  just before yielding the next `SDKUserMessage`. There is no other
  mutation path the SDK exposes that doesn't also entail a turn
  boundary; the host should not invent one.
- **Effort `'max'` is genuinely two-tier.** Mid-session it can only
  reach the SDK as a startup-only value (a restart). Treating it as
  a hot-swap silently demotes to `'xhigh'`. This is the one
  user-visible asymmetry in the bijective set and must be surfaced
  in the UI if the host accepts `'max'` as a runtime selection.

### M12 — Catalog and discovery: `getDescriptor`, `models`, `listSessions`, `getSessionMetadata`, `resolveSessionConfig`, `sessionConfigCompletions`

This is the **read-only** half of the IAgent surface — the cluster
of methods clients call before (or alongside) any session has been
created. They answer four questions the UI needs to render its
catalog:

1. *Who is this agent?* (`getDescriptor`)
2. *What models can I pick?* (`models` observable)
3. *What sessions exist?* (`listSessions`, `getSessionMetadata`)
4. *What config fields does this agent need to create a session?* (`resolveSessionConfig`, `sessionConfigCompletions`)

None of these methods take a session URI in a sense that mutates
state; the two with a `session` parameter (`getSessionMetadata`)
read existing on-disk state without changing it. This is the
property that makes M12 a coherent cluster — it is the *catalog*
layer, not the *control* layer.

#### Surface inventory

| IAgent surface | Method or field | Optional? | Mapping kind |
|---|---|---|---|
| Provider identity | `getDescriptor(): IAgentDescriptor` ([agentService.ts:468](../../common/agentService.ts#L468)) | required | Synthetic (local literal) |
| Available models | `models: IObservable<readonly IAgentModelInfo[]>` ([agentService.ts:471](../../common/agentService.ts#L471)) | required | Direct (one SDK call) + adapter |
| Session catalog | `listSessions(): Promise<IAgentSessionMetadata[]>` ([agentService.ts:474](../../common/agentService.ts#L474)) | required | Direct (one SDK call) + sidecar join |
| Single-session fast path | `getSessionMetadata?(session): Promise<IAgentSessionMetadata \| undefined>` ([agentService.ts:477](../../common/agentService.ts#L477)) | optional | Direct (one SDK call) + sidecar join |
| Creation-time config schema | `resolveSessionConfig(params): Promise<ResolveSessionConfigResult>` ([agentService.ts:425](../../common/agentService.ts#L425)) | required | Synthetic (provider builds locally) |
| Dynamic enum lookups | `sessionConfigCompletions(params): Promise<SessionConfigCompletionsResult>` ([agentService.ts:428](../../common/agentService.ts#L428)) | required | Synthetic / disk-backed |

The two "Synthetic" surfaces are the protocol's way of saying:
*the SDK doesn't have an opinion about your config schema; the
provider does.* CopilotAgent and the Claude provider both build
their schemas from local knowledge (git info, model capabilities,
platform-shared properties).

#### `getDescriptor()` — provider identity

| | Shape |
|---|---|
| Returns | `IAgentDescriptor { provider, displayName, description }` ([agentService.ts:160-165](../../common/agentService.ts#L160-L165)) |
| CopilotAgent | Hardcoded literal `{ provider: 'copilotcli', displayName: 'Copilot CLI', description: '…' }` ([copilotAgent.ts:256-262](../copilot/copilotAgent.ts#L256-L262)) |
| Claude provider | Hardcoded literal `{ provider: 'claude', displayName: 'Claude', description: '…' }` |

`AgentProvider` is `type AgentProvider = string` ([agentService.ts:158](../../common/agentService.ts#L158))
— a plain alias, no nominal brand. The same string serves three
roles:

1. The dispatch key on `IAgent.id` ([agentService.ts:406](../../common/agentService.ts#L406)).
2. The displayed identity in `IAgentDescriptor.provider` ([agentService.ts:162](../../common/agentService.ts#L162)).
3. The URI scheme for sessions, via `AgentSession.uri(provider, id)`
   ([agentService.ts:374-376](../../common/agentService.ts#L374-L376))
   — so Claude sessions live at `claude:/<uuid>`.

`IAgent.id` and `IAgentDescriptor.provider` MUST be equal; CopilotAgent
hardcodes both to `'copilotcli'` ([copilotAgent.ts:206, 258](../copilot/copilotAgent.ts#L206)).
Description is a required, non-empty string — there is no fallback.

#### `models` — observable of available models

| | Shape |
|---|---|
| Field | `models: IObservable<readonly IAgentModelInfo[]>` |
| `IAgentModelInfo` | `{ provider, id, name, supportsVision, maxContextWindow?, configSchema?: ConfigSchema, policyState?, _meta? }` ([agentService.ts:265-274](../../common/agentService.ts#L265-L274)) |
| Claude provider source | **CAPI** via `ICopilotApiService.models(githubToken)` ([copilotApiService.ts:228-281](../shared/copilotApiService.ts#L228-L281)) — *not* `Query.supportedModels()` |
| Result shape | `CCAModel[]` from `@vscode/copilot-api` — carries `vendor`, `supported_endpoints`, `model_picker_enabled`, `model_picker_category`, plus capability metadata |

**This provider runs against CAPI, not Anthropic.** Claude models
reach the IAgent provider through the same Copilot Chat API the
reference extension uses, not through Anthropic's API. The
Copilot subscription is the auth principal; CAPI proxies the
request to Anthropic's `/v1/messages` endpoint server-side. For
the `models` observable this means the SDK's
`Query.supportedModels()` (and the `models` field on
`initializationResult()`) are **not the right source** — they
would return Anthropic's catalog as if you were calling Anthropic
directly, ignoring CAPI's per-subscription gating, picker
enablement, and billing-multiplier metadata.

The shared service `ICopilotApiService` already exposes the right
primitive ([copilotApiService.ts:281](../shared/copilotApiService.ts#L281)):

```ts
models(githubToken: string, options?: ICopilotApiServiceRequestOptions): Promise<CCAModel[]>;
```

The filter pattern extends the reference extension's three
surface-check predicates with two additional checks the impl in
[claudeAgent.ts:47-53](claudeAgent.ts#L47-L53) carries to handle the
CAPI catalog's broader contents (encoded by the test fixtures in
[claudeAgent.test.ts:497-512](../../test/node/claudeAgent.test.ts#L497-L512)):

1. `vendor === 'Anthropic'` — picks Claude models out of the
   multi-vendor catalog.
2. `supported_endpoints.includes('/v1/messages')` — keeps only
   models that route through the Anthropic-format messages
   endpoint the SDK actually talks to. (Claude models surfaced
   only on `/chat/completions` are unusable here.)
3. `model_picker_enabled === true` — respects CAPI's gating of
   models that should not appear in the picker.
4. `capabilities.supports.tool_calls === true` — matches the
   reference extension's surface check at
   [claudeCodeModels.ts:154-164](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeModels.ts#L154-L164).
   The SDK's tool-use loop assumes tool-call capability; surfacing
   a non-tool-capable Claude variant would mislead the user once
   Phase 7 tool calls land.
5. `tryParseClaudeModelId(m.id)` returns a defined value — excludes
   synthetic CAPI model ids (router-style aliases like `'auto'`,
   future non-endpoint ids) that aren't real Claude endpoints.
   Without this, a synthetic id could reach `Options.model` and
   never resolve to a real subprocess model selection.

For each surviving `CCAModel`, the provider maps into
`IAgentModelInfo`:

- `id` ← `CCAModel.id` (the CAPI model id; flows through to
  `ModelSelection.id` in M11).
- `name` ← `CCAModel.name` (display).
- `supportsVision` ← from CAPI capability flags.
- `maxContextWindow` ← from CAPI capability flags.
- `configSchema` ← synthesized from `CCAModel.capabilities.supports.thinking`
  (or analogous CAPI signal) using the same
  `_createThinkingLevelConfigSchema` pattern CopilotAgent uses
  ([copilotAgent.ts:457-484](../copilot/copilotAgent.ts#L457-L484)).
  The set of effort levels for Claude is documented in M11.
- `policyState` ← from CAPI policy flags.
- `_meta` ← billing multiplier and any other CAPI-specific
  side-channel data (matches CopilotAgent's `multiplierNumeric`
  pattern).

The refresh trigger is identical to CopilotAgent: re-call
`ICopilotApiService.models()` whenever the GitHub token changes
(see CopilotAgent's `_refreshModels()` at [copilotAgent.ts:300-317](../copilot/copilotAgent.ts#L300-L317)
and its `authenticate()`-driven invocation at [copilotAgent.ts:295](../copilot/copilotAgent.ts#L295)).
No Claude SDK consultation is needed for the catalog at all —
starting a `Query` purely to list models would be wasteful and
would give the wrong answer.

**Asymmetry with the reference extension:** the reference Claude
extension uses `IEndpointProvider.getAllChatEndpoints()` and
filters to `modelProvider === 'Anthropic'`
([claudeCodeModels.ts:154-164](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeModels.ts#L154-L164)).
`IEndpointProvider` is a workbench-side abstraction over the same
CAPI catalog. The IAgent Claude provider, sitting in the agent
host process, can't reach `IEndpointProvider` directly — but it
doesn't need to. `ICopilotApiService.models()` is the agent-host
equivalent and returns the same CAPI catalog. The two paths
resolve to the same source of truth; the picker presented to the
user is identical.

`IAgentModelInfo._meta` ([agentService.ts:273](../../common/agentService.ts#L273))
is a per-provider side-channel; CopilotAgent uses it for billing
multipliers (`multiplierNumeric`). Since Claude also runs through
CAPI, the same `multiplierNumeric` (and other CAPI metadata) is
available on each `CCAModel` and should flow through verbatim.

#### `listSessions()` — session catalog

| | Shape |
|---|---|
| Returns | `IAgentSessionMetadata[]` ([agentService.ts:100-124](../../common/agentService.ts#L100-L124)) |
| Required fields | `session: URI`, `startTime: number`, `modifiedTime: number` |
| Optional fields | `project`, `summary`, `status`, `activity`, `model`, `workingDirectory`, `customizationDirectory`, `isRead`, `isArchived`, `diffs`, `_meta` |
| Claude SDK source | **Top-level** `listSessions(options?): Promise<SDKSessionInfo[]>` ([sdk.d.ts:729](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L729)) — *not* a `Query` method |
| `SDKSessionInfo` shape | `{ sessionId, summary, lastModified, customTitle?, firstPrompt?, gitBranch?, cwd?, tag?, createdAt }` ([sdk.d.ts:2782-2825](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L2782-L2825)) |

The SDK reads `~/.claude/projects/**/*.jsonl` under the hood; the
provider does **not** scan disk itself. The reference extension
confirms this — every catalog call is a one-line forwarding wrapper
in `ClaudeCodeSdkService` ([claudeCodeSdkService.ts:78-117](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeSdkService.ts#L78-L117)),
and `getAllSessions(token)` ([claudeCodeSessionService.ts:75-110](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/sessionParser/claudeCodeSessionService.ts#L75-L110))
calls `_sdkService.listSessions()` directly with no fallback to
JSONL parsing for the catalog. (Raw JSONL parsing exists but is
restricted to subagent transcripts the SDK doesn't expose; see
[sessionParser/README.md](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/sessionParser/README.md).)

##### CopilotAgent's `listSessions` shape

CopilotAgent ([copilotAgent.ts:525-558](../copilot/copilotAgent.ts#L525-L558))
joins three sources:

1. SDK `client.listSessions()` for the canonical session list.
2. Per-session host-side **sidecar metadata** (`_readStoredSessionMetadata`)
   for fields the SDK doesn't carry — model, customization
   directory, working directory.
3. A `Limiter<>(4)` to bound parallel project-info resolution.

Two filters apply to the result:

- **No-sidecar filter (CopilotAgent only).** Sessions without sidecar
  metadata are *dropped* — so Copilot's `listSessions` returns only
  sessions this host has seen before. Sessions created on another
  machine or in another VS Code install are invisible until they've
  been re-opened through this host. **Claude does NOT inherit this
  filter** — the Claude SDK's session list includes external
  Claude-CLI-created sessions that have no host-side sidecar but
  must still surface (Phase-5 exit criterion). Claude treats the
  sidecar as a best-effort enrichment overlay; missing sidecar
  fields fall back to whatever the SDK supplies
  ([claudeAgent.ts:761-797](claudeAgent.ts#L761-L797)).
- **Provisional sessions are not included** ([copilotAgent.ts:736-742](../copilot/copilotAgent.ts#L736-L742)).
  They have no SDK session yet, so `client.listSessions()` doesn't
  know about them and there's no sidecar until materialization
  (M9).

##### Claude's `listSessions` differences from CopilotAgent

The Claude provider should mirror CopilotAgent's join pattern, but
the two SDKs disagree on which fields they carry:

| Field | CopilotAgent source | Claude source |
|---|---|---|
| `summary` | SDK | SDK (`summary` or `firstPrompt`) |
| `startTime` | SDK | SDK (`createdAt`) |
| `modifiedTime` | SDK | SDK (`lastModified`) |
| `workingDirectory` | sidecar | SDK (`cwd`) — sidecar redundant |
| `model` | sidecar | sidecar (SDK doesn't carry it) |
| `project` | resolved from `cwd` | resolved from `cwd` |
| `customizationDirectory` | sidecar | sidecar |
| `_meta.git` | not populated by `listSessions` | not populated by `listSessions` |
| `isArchived` | host-side archive store, not from SDK | host-side archive store, not from SDK |
| `status` | not populated by `listSessions` | not populated by `listSessions` |

Archive state and live status are *not* part of the catalog mapping
in either provider — they live in higher layers (the host-side
archive store, the live-session tracker) and are stitched in by
the agent service before the result reaches the client.

#### `getSessionMetadata?(session)` — single-session fast path

| | Shape |
|---|---|
| Returns | `Promise<IAgentSessionMetadata \| undefined>` |
| Marker | Optional method (`?`) |
| Claude SDK source | **Top-level** `getSessionInfo(sessionId, options?): Promise<SDKSessionInfo \| undefined>` ([sdk.d.ts:581](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L581)) |

The SDK note on `getSessionInfo` is precise: it *only reads the
single session file rather than every session in the project*. So
this is genuinely a single-file probe, not a filtered enumerate —
the right primitive for "show this session in a list of links" or
"check if this session still exists."

CopilotAgent implements it ([copilotAgent.ts:560-591](../copilot/copilotAgent.ts#L560-L591))
via `client.getSessionMetadata(sessionId)` joined with the same
sidecar read as `listSessions`. Returns `undefined` if either is
missing.

The Claude provider should also implement it (the SDK has the
matching primitive) for parity with CopilotAgent. Callers must
still null-check because the method is optional on the interface.

#### `resolveSessionConfig(params)` — creation-time config schema

| | Shape |
|---|---|
| Input | `IAgentResolveSessionConfigParams { provider?, workingDirectory?, config? }` ([agentService.ts:237-241](../../common/agentService.ts#L237-L241)) |
| Returns | `ResolveSessionConfigResult { schema: SessionConfigSchema, values: Record<string, unknown> }` ([commands.ts:865-870](../../common/state/protocol/commands.ts#L865-L870)) |
| Property type | `SessionConfigPropertySchema` ([state.ts:494-504](../../common/state/protocol/state.ts#L494-L504)) — extends `ConfigPropertySchema` with `enumDynamic?` and `sessionMutable?` |
| Claude SDK source | None — fully synthetic |

There is no SDK call here. Both providers build the schema
locally from host knowledge. CopilotAgent's resolver
([copilotAgent.ts:819-877](../copilot/copilotAgent.ts#L819-L877))
follows a fixed sequence:

1. Probe git state via `IAgentHostGitService` for `defaultBranch /
   currentBranch` (so the schema can include a branch picker only
   when the cwd is a repo).
2. Build the `isolation` enum (`folder | worktree`, with
   `worktree` gated on git presence; default `worktree` in repos).
3. Resolve the *current* `isolationValue` from `params.config` or
   the default.
4. Conditionally add a `branch` property when `gitInfo` is present;
   set `enumDynamic: true` and seed `enum: [branchDefault]`.
5. Merge with `platformSessionSchema.definition` for platform-wide
   properties (`autoApprove`, `mode`, …).
6. Run `sessionSchema.validateOrDefault(params.config, defaults)`
   to produce `values`.

The Claude provider can mirror this skeleton. Provider-specific
properties to consider:

- **`permissionMode`** — six values
  (`'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' |
  'dontAsk' | 'auto'`); a static enum, no `enumDynamic`. Mark
  `sessionMutable: true` (M11 hot-swap; `Query.setPermissionMode()`
  is bijective). The full set matches the SDK's `PermissionMode`
  type at [sdk.d.ts:1560](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L1560).
  `'auto'` is the model-classifier-driven approval mode the SDK
  exposes; surfacing it on the IAgent enum means the client UI
  can pick it without a future schema bump.
- **`isolation` / `branch`** — share with CopilotAgent's pattern;
  branch picker uses `enumDynamic` when isolation is `worktree`.
- **`outputStyle`** — `Query.initializationResult().available_output_styles`
  exposes the list as a *composed* source if the provider chooses
  to surface it.
- **Platform-shared properties** — the same `platformSessionSchema.definition`
  CopilotAgent merges in.

##### Same schema serves creation *and* post-creation display

The `resolveSessionConfig` schema is the **single source of truth**
read surface for both the create-session form and the live-session
settings UI. The two phases differ only in what the caller passes
as `params.config`:

1. At create time, the form passes the user's in-progress values;
   defaults come from `schema.properties[k].default`, and resolved
   values come back as `values[k]`. Submitting the form invokes
   `createSession({ config: values })` —
   [`IAgentCreateSessionConfig.config`](../../common/agentService.ts#L211)
   is the creation-time write bag.
2. After creation, the live-session settings UI re-fetches the
   same schema by calling `resolveSessionConfig` with
   `params.config` reflecting the session's *current* values; only
   properties marked `sessionMutable: true` are interactive.

The write path for a runtime change is *not* `resolveSessionConfig`
itself — that method is read-only. The protocol surface for
routing an arbitrary live config edit back into the running
session is **TBD** — there is no generic `setSessionConfigValues`
on `IAgent` today. The two existing first-class runtime paths,
`changeModel` (atomic id + model-config diff) and
`setCustomizationEnabled` (per-customization toggle), cover the
two cases that have shipped; everything else (including
`permissionMode`) currently has to round-trip as a fresh
`createSession` with the new bag (a restart per M11) until a
generic live-edit method lands.

The forward-looking flow, once that protocol method exists, is:

1. Client calls `resolveSessionConfig(params)` to get the schema +
   current values for the running session.
2. User edits a `sessionMutable: true` property in the settings UI
   (e.g. flips `permissionMode` from `'plan'` to `'default'`).
3. Client routes the edit through the future generic setter
   (working name: `setSessionConfigValues(session, values)`) — the
   bijective post-creation conduit that M11's hot-swap taxonomy
   already classifies on the implementation side.
4. The provider's implementation calls the matching M11 hot-swap
   routine (`Query.setPermissionMode()` for `permissionMode`,
   `Query.setModel()` plus effort apply for `model` + `effort`,
   etc.).
5. The SDK acknowledges, the host re-fetches values, the next
   `resolveSessionConfig` call observes the new state.

So `permissionMode` (and any other M11 hot-swappable property)
lives in **two** IAgent surfaces: the schema declares it as
`sessionMutable: true` (this method), and — once the protocol
surface lands — the runtime mutation flows through the generic
live-edit setter (M11). They MUST agree: if the schema says a
property is mutable but no M11 setter exists, the edit will
round-trip as a no-op or fail. M11's restart-required bucket
(`cwd`, `executable`, `addDirectories`, etc.) MUST NOT be marked
`sessionMutable: true` here.

The reference Claude extension has no equivalent of
`resolveSessionConfig` (the chat-session UI has no creation form;
sessions inherit settings from `vscode.workspace.getConfiguration`
and `~/.claude/settings.json`). The IAgent Claude provider is the
first place this schema gets explicitly assembled for Claude.

#### `sessionConfigCompletions(params)` — dynamic enum lookups

| | Shape |
|---|---|
| Input | `IAgentSessionConfigCompletionsParams extends IAgentResolveSessionConfigParams { property: string, query? }` ([agentService.ts:243-246](../../common/agentService.ts#L243-L246)) |
| Returns | `SessionConfigCompletionsResult { items: SessionConfigValueItem[] }` ([commands.ts:933-936](../../common/state/protocol/commands.ts#L933-L936)) |
| Item shape | `{ value: string, label: string, description? }` ([commands.ts:879-886](../../common/state/protocol/commands.ts#L879-L886)) |
| Claude SDK source | None — synthetic / disk-backed |

**Out of scope for the Claude provider, at least for the initial
landing.** This method only matters when the schema marks a
property `enumDynamic: true`, signalling that the seed `enum` is
incomplete and the real list must be fetched on user input.
CopilotAgent ([copilotAgent.ts:880-887](../copilot/copilotAgent.ts#L880-L887))
uses it for one property — `branch` — backed by an
`IAgentHostGitService` shell-out and capped at
`_BRANCH_COMPLETION_LIMIT = 25` ([copilotAgent.ts:217](../copilot/copilotAgent.ts#L217)).

The Claude provider's anticipated schema (Claude-specific
`permissionMode`, `outputStyle`, plus the platform-shared
properties) has **no `enumDynamic` properties on the Claude side**
— `permissionMode` is a static six-value enum, `outputStyle` is a
static list from `Query.initializationResult().available_output_styles`,
and the rest are booleans / fixed enums. Branch and isolation come
from the platform-shared schema, which the agent service handles
uniformly above the provider.

The practical consequence: the Claude provider's implementation is
likely a one-liner returning `{ items: [] }` until a Claude-specific
dynamic enum surfaces. The interface requires the method to exist,
but a no-op satisfies it. If a future schema property does need
dynamic completions, the provider can opt in property-by-property
(matching CopilotAgent's `if (property === 'branch')` shape) —
branch completions, if they apply, reuse the same
`IAgentHostGitService` shell-out with no Claude-specific code
path.

#### Schema vs values: the duality

`ResolveSessionConfigResult` returns *both* a schema and a values
object, and the JSDoc framing is precise:

> *schema*: JSON Schema describing available configuration
> properties given the current context.
>
> *values*: Current configuration values (echoed back with
> server-resolved defaults applied).

These are not redundant. They encode different kinds of knowledge:

| Field | Encodes | Owner |
|---|---|---|
| `schema.properties[k].default` | Display-time default — what the form renders if the field is empty | Static (provider's schema-build code) |
| `values[k]` | Resolved current value the server will actually use *right now* | Dynamic (`validateOrDefault(params.config, defaults)`) |

The duality matters in three places:

1. **Cross-property resolution.** `values` can encode resolutions
   the schema can't. CopilotAgent's branch resolves to
   `currentBranch` for `folder` isolation but `defaultBranch` for
   `worktree` ([copilotAgent.ts:833](../copilot/copilotAgent.ts#L833))
   — the schema's `default` shows one value, `values` reflects the
   live cross-property resolution.
2. **Validation drift.** `validateOrDefault` strips fields that
   don't validate against the current schema. So a value the user
   supplied but is no longer valid (because some other property
   changed) is silently dropped from `values` and re-derived from
   defaults.
3. **Intentional gaps.** A property may be in `schema` but not in
   `values` — e.g. CopilotAgent omits a `permissions` slot from
   `values` so auto-approval falls through ([copilotAgent.ts:867-870](../copilot/copilotAgent.ts#L867-L870)).
   Clients must treat missing keys in `values` as "no resolved
   value yet," not "value is `undefined`."

`params.config` does **not** round-trip verbatim — it feeds
`validateOrDefault`, which (a) keeps user-supplied values that
validate, (b) replaces invalid values with defaults, (c) fills
missing keys from defaults. The server is the canonical resolver.

#### `enumDynamic` and `sessionMutable`: the two session-only flags

The two extensions to `ConfigPropertySchema` that make
`SessionConfigPropertySchema` distinct ([state.ts:494-504](../../common/state/protocol/state.ts#L494-L504)):

| Flag | Meaning | Client behaviour |
|---|---|---|
| `enumDynamic?: boolean` | The full set of allowed values is too large to enumerate; `enum` carries seed/recent values only | Call `sessionConfigCompletions(property, query)` on user input |
| `sessionMutable?: boolean` | The user may change this property *after* session creation | Show in post-creation settings UI; otherwise the property is creation-time only |

`enumDynamic` is opt-in — providers that statically enumerate
(full enum, no flag) are valid. `sessionMutable` is the
creation-vs-mutation toggle: properties without it become
read-only after `createSession`. For Claude, `permissionMode` is a
clean candidate for `sessionMutable: true` because it sits in M11's
hot-swap bucket (`Query.setPermissionMode()` is bijective);
`isolation` and `cwd` are not (no SDK setter; they pin the
subprocess) so they stay creation-time.

#### Asymmetries between Copilot and Claude

| Surface | CopilotAgent | Claude provider |
|---|---|---|
| `getDescriptor` | Synthetic literal | Synthetic literal |
| `models` | CAPI via `client.listModels()` (CopilotClient wraps CAPI) | **CAPI** via `ICopilotApiService.models(githubToken)` filtered to `vendor === 'Anthropic'` ∩ `supported_endpoints ∋ '/v1/messages'` ∩ `model_picker_enabled === true` — *not* `Query.supportedModels()` |
| `listSessions` | SDK `client.listSessions()` joined with sidecar; **drops sessions without sidecar** | SDK top-level `listSessions(options?)` joined with sidecar; **does NOT drop** — sidecar is a best-effort enrichment overlay so external Claude-CLI sessions surface unconditionally |
| `getSessionMetadata` | SDK `client.getSessionMetadata(id)` joined with sidecar | SDK top-level `getSessionInfo(id, options?)` joined with sidecar |
| `resolveSessionConfig` | Synthetic; git probe + `platformSessionSchema` merge | Synthetic; same skeleton + Claude-specific (`permissionMode`, `outputStyle`, …) |
| `sessionConfigCompletions` | Branch picker via `IAgentHostGitService` | Likely a no-op (`{ items: [] }`) on initial landing — no Claude-specific `enumDynamic` properties |

The catalog cluster is the surface where the two SDKs are *most
symmetric* — both expose the same shapes with cosmetic naming
differences, and both providers reduce them through the same
sidecar-join + synthetic-schema pattern. The "every catalog call is
a one-line wrapper" property of the reference Claude extension
([claudeCodeSdkService.ts:78-117](../../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeSdkService.ts#L78-L117))
is a strong signal that the IAgent provider's catalog code can be
trivially thin. The one notable divergence is `models`: both
providers run against CAPI, but Claude reaches it through the
shared `ICopilotApiService` rather than a vendor-specific SDK
client.

#### Invariants

- **`IAgent.id` ≡ `IAgentDescriptor.provider` ≡ session URI scheme.**
  All three carry the same string. Diverging them would route
  catalog reads, session URIs, and dispatch through inconsistent
  keys.
- **`listSessions` returns only host-known sessions.** Sessions
  without sidecar metadata are filtered out. The catalog is *not*
  a faithful mirror of the SDK's on-disk session list; it is the
  intersection of "SDK knows about it" and "this host has seen it."
- **Provisional sessions never appear in `listSessions`.** They
  have no SDK session yet, so the SDK's catalog call doesn't
  surface them. The host's `sessionAdded` deferred-notification
  pattern (M9) is what makes this safe — clients see materialized
  sessions only.
- **`isArchived` and `status` are stitched in above the agent.**
  Neither field comes from the SDK; the agent service joins them
  from host-side stores before the result reaches the client.
  Providers must not invent these fields locally.
- **`models` is sourced from CAPI, not from the Claude SDK.**
  `Query.supportedModels()` would return Anthropic's catalog
  ignoring CAPI gating; the provider MUST go through
  `ICopilotApiService.models()` and apply the three-predicate
  filter (`vendor === 'Anthropic'`, `supported_endpoints ∋
  '/v1/messages'`, `model_picker_enabled === true`) to match the
  reference extension's picker.
- **`getSessionMetadata?` is a parity surface.** Where the SDK
  has a single-file probe (`getSessionInfo` on Claude,
  `getSessionMetadata` on Copilot), the provider should implement
  this method. Providers that lack the primitive omit the method
  rather than fall back to filtering `listSessions()`.
- **`resolveSessionConfig` is synthetic and provider-owned.** No
  SDK consultation. The provider holds the schema; the host
  contributes only `IAgentHostGitService` and platform-shared
  properties via `platformSessionSchema.definition`.
- **`values` is server-canonical.** Clients must not assume
  `params.config` round-trips verbatim. Round-tripping happens
  only when `validateOrDefault` finds every input field valid
  against the current schema; any drift is silently corrected.
- **`enumDynamic` does not imply non-empty `enum`.** Providers may
  return an empty `enum` with `enumDynamic: true` if no seed
  values are warranted. Clients must call
  `sessionConfigCompletions` rather than rendering the seed list
  as authoritative.
- **`sessionMutable` is the only post-creation mutability signal in
  the schema.** A property without it is creation-time only,
  regardless of whether the underlying SDK setter exists. The
  schema is the contract the client renders; M11's hot-swap
  taxonomy is the *implementation's* answer to runtime mutation.
  These layers must agree: `sessionMutable: true` on a property
  whose SDK write requires a restart would mislead the client.
- **`resolveSessionConfig` is the schema source for runtime
  mutations too.** The settings UI for a running session re-reads
  this method to render `sessionMutable: true` properties; the
  edit then routes through the future generic live-edit setter
  (working name: `setSessionConfigValues`; protocol surface TBD —
  no method on `IAgent` today). The two paths that have shipped
  — `changeModel` and `setCustomizationEnabled` — carry the
  matching M11 hot-swap routines for those specific properties; a
  property that is mutable in the schema MUST have a matching M11
  hot-swap path, and a property that has no M11 path MUST NOT be
  marked `sessionMutable: true`. Until the generic setter lands,
  any `sessionMutable: true` property whose edit isn't covered by
  `changeModel`/`setCustomizationEnabled` is implicitly
  restart-required: clients must round-trip the change as a fresh
  `createSession`.
- **`sessionConfigCompletions` is required-but-may-be-empty.** The
  Claude provider's expected initial implementation is a no-op
  returning `{ items: [] }` because none of its anticipated
  schema properties carry `enumDynamic: true`. Implementing it as
  a no-op is correct and idiomatic; the method exists to back
  `enumDynamic` properties when (and only when) they appear.

### M13 — Authentication: `authenticate`, `getProtectedResources`

Auth is **mostly abstracted away from this mapping exercise**. The
Claude SDK ships a substantial OAuth surface — phantom
`SDKControlClaude*OAuth*` types in the
`SDKControlRequestInner` union ([sdk.d.ts:2373](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L2373)),
`accountInfo()`, `SDKAuthStatusMessage`, `'authentication_failed'`
error reason — but the host pre-empts all of it via a localhost
proxy. The SDK believes it is talking to Anthropic; we never let
it find out otherwise.

#### The only mapping that matters

`authenticate(resource, token)` accepts a GitHub OAuth token. That
token is fed into `IClaudeProxyService.start(token)` to obtain an
`IClaudeProxyHandle { baseUrl, nonce }`. The handle's two fields
become two entries in `Options.settings.env`:

```ts
// claudeAgent.ts:429-434
const settingsEnv: Record<string, string> = {
    ANTHROPIC_BASE_URL: proxyHandle.baseUrl,
    ANTHROPIC_AUTH_TOKEN: `${proxyHandle.nonce}.${sessionId}`,
    // ...
};
```

That's the whole mapping. `ANTHROPIC_BASE_URL` points the SDK at
the local proxy; `ANTHROPIC_AUTH_TOKEN` is the per-session bearer
the proxy validates ([claudeProxyAuth.ts:39-60](claudeProxyAuth.ts#L39-L60)).
Outbound CAPI calls from the proxy use the GitHub token captured
at `start(token)` time. Everything downstream — token minting,
401/403 handling, model listing — is `ICopilotApiService`'s job
(M12), not the agent's.

#### IAgent surface — the bare minimum

| Surface | What the provider does |
|---|---|
| `getProtectedResources()` ([agentService.ts:480](../../common/agentService.ts#L480)) | Return `[GITHUB_COPILOT_PROTECTED_RESOURCE]` ([agentService.ts:200-206](../../common/agentService.ts#L200-L206)). Synchronous, hardcoded, identical to CopilotAgent. |
| `authenticate(resource, token)` ([agentService.ts:502-506](../../common/agentService.ts#L502-L506)) | Reject unknown `resource` with `false`. On a new GitHub token, call `_claudeProxyService.start(token)`, swap `_proxyHandle`, dispose the old handle. Cited at [claudeAgent.ts:238-265](claudeAgent.ts#L238-L265). |
| `AHP_AUTH_REQUIRED` throw | Any session lifecycle method that runs before `authenticate()` has landed must throw `ProtocolError(AHP_AUTH_REQUIRED, msg, this.getProtectedResources())`. CopilotAgent does this at [copilotAgent.ts:382-385](../copilot/copilotAgent.ts#L382-L385); ClaudeAgent currently throws a plain `Error` at [claudeAgent.ts:413-416](claudeAgent.ts#L413-L416) — to be corrected in Phase 6.1 Cycle B (see [phase6.1-plan.md](phase6.1-plan.md)). |

#### Why ClaudeAgent's `authenticate` ordering differs from CopilotAgent

CopilotAgent commits `_githubToken` first, then runs `_stopClient()`
and `_refreshModels()` — both local, infallible side effects.
ClaudeAgent's side effect is `_claudeProxyService.start(token)`,
which can fail (port bind, network probe). So the Claude path
acquires the new handle *first*, only commits `_githubToken` and
`_proxyHandle` after `start()` resolves, then disposes the old
handle. This keeps retry semantics correct: a failed `start()`
leaves token state untouched, so the next `authenticate()` call
sees the same token as still-new and retries instead of short-
circuiting on "unchanged."

That's the only structural divergence worth recording in this
exercise.

#### Invariants

- **Resource id MUST match exactly.** `authenticate()` MUST
  early-out with `false` for unknown `resource` strings; the agent
  service relies on the `false` return to OR-collapse provider
  responses.
- **Token state and side-effect state MUST commit together, in an
  order that lets retry succeed.** Acquire fallible side-effect
  first, commit fields together after success, release the previous
  side-effect last.
- **The SDK's OAuth surface MUST stay dark.** The proxy
  substitution is the contract: `ANTHROPIC_BASE_URL` +
  `ANTHROPIC_AUTH_TOKEN` cover everything; `accountInfo()`,
  `SDKAuthStatusMessage`, and the phantom `SDKControlClaude*OAuth*`
  control types are not surfaced to clients.
- **`ANTHROPIC_API_KEY` MUST be scrubbed on both sides.** Subprocess
  env strips it ([claudeAgent.ts:533](claudeAgent.ts#L533)); the
  proxy refuses inbound `x-api-key` ([claudeProxyAuth.ts:30-32](claudeProxyAuth.ts#L30-L32)).
  Either alone leaves a bypass.
- **`AHP_AUTH_REQUIRED` MUST carry the resource manifest in `data`.**
  Shape is `AuthRequiredErrorData { resources: ProtectedResourceMetadata[] }`
  ([errors.ts:107-110](../../common/state/protocol/errors.ts#L107-L110)).
  Plain `Error` throws break the client's auth UI driver.

### Open mapping questions


Things this catalogue has not yet fully resolved. Captured here so
they aren't lost; not blockers to extending the catalogue further.

- **Tail-Turn state heuristic on replay.** When the JSONL ends with
  an open `tool_use` (no matching `tool_result`), the protocol Turn
  state is genuinely ambiguous. Need a documented rule.
- **`SDKUserMessageReplay` semantics.** The SDK distinguishes
  `SDKUserMessage` (live input) from `SDKUserMessageReplay` (echoed
  on resume) at the type level. The mapper currently treats them
  identically on the live path; verify that's correct under all
  resume paths.
- **System-message allowlist evolution.** The list above is
  conservative. As the agent host gains UI for hook progress, plugin
  install, rate limits, etc., some currently-dropped subtypes may
  promote to `SystemNotification` parts. Track decisions by subtype.
