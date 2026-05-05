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
