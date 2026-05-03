# Phase 2 Plan — `IClaudeProxyService`

**Status:** ✅ done. Shipped `ClaudeProxyService` + helpers + tests +
DI registration in `agentHostMain.ts`. Council-reviewed and hardened
(F1/F2 race fixes applied; F3 test coverage added). Smoke-validated
end-to-end against real CAPI for all three surfaces (`GET /v1/models`,
streaming `POST /v1/messages`, non-streaming `POST /v1/messages`). No
callers wire it up yet — Phase 4 (`ClaudeAgent`) does that. Two
documented deviations from the original plan are inlined below as
"Shipped:" notes.

A self-contained design + implementation plan for Phase 2 of the Claude
agent roadmap.

> Sibling docs: [`roadmap.md`](./roadmap.md) (the multi-phase plan
> Phase 2 lives in), [`CONTEXT.md`](./CONTEXT.md) (the glossary that
> defines `Agent Host`, `Claude Agent`, `Claude Proxy`, `CAPI`).

---

## 1. Context

### What ships before this phase

**Phase 1 (done):** `ICopilotApiService` at
`src/vs/platform/agentHost/node/shared/copilotApiService.ts`. A
gateway to GitHub Copilot's chat completions API ("**CAPI**") that
exposes:

```ts
interface ICopilotApiService {
    readonly _serviceBrand: undefined;
    messages(githubToken: string, body: Anthropic.MessageCreateParamsNonStreaming, options?: ICopilotApiServiceRequestOptions): Promise<Anthropic.Message>;
    messages(githubToken: string, body: Anthropic.MessageCreateParamsStreaming, options?: ICopilotApiServiceRequestOptions): AsyncGenerator<Anthropic.MessageStreamEvent>;
    countTokens(githubToken: string): Promise<never>; // throws — CAPI does not support this
    models(githubToken: string): Promise<CCAModel[]>;
}

interface ICopilotApiServiceRequestOptions {
    headers?: Record<string, string>;
    signal?: AbortSignal;
}
```

`messages()` is a TypeScript overload — streaming returns an
`AsyncGenerator` of pre-parsed `Anthropic.MessageStreamEvent` objects;
non-streaming returns a `Promise<Anthropic.Message>`. CAPI is wire-
compatible with the Anthropic Messages API.

`ICopilotApiService` is hand-rolled HTTP (not the `@anthropic-ai/sdk`
client) and currently throws plain `Error` on both non-2xx and SSE
error events. **Q10's passthrough design depends on widening this
contract — see §1.5.**

**Phase 1.5 (done):** widened `ICopilotApiService` to use raw
`Anthropic.MessageStreamEvent` types and accept
`ICopilotApiServiceRequestOptions { headers?, signal? }`.

### What this phase delivers

A `ClaudeProxyService` — a local HTTP server that **speaks the
Anthropic Messages API on the inbound side and `ICopilotApiService`
on the outbound side**. The Claude Agent SDK
(`@anthropic-ai/claude-agent-sdk@0.2.112`) runs as a subprocess and
sees this proxy as its Anthropic API endpoint via
`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`.

Phase 2 does NOT include the `ClaudeAgent` itself (Phase 4) — only
the proxy and its DI registration in the agent host.

### Why a proxy at all

- The SDK is hard-wired to call `https://api.anthropic.com`-shaped
  endpoints. We can't redirect at the SDK level.
- We don't ship Anthropic API keys; we ship GitHub Copilot tokens.
  The proxy authenticates via Bearer-token-with-nonce, mints CAPI
  tokens internally, and forwards.
- All routing/translation logic stays out of the SDK subprocess.

### Reference implementation

A working version exists in the Copilot **extension** at
`extensions/copilot/src/extension/chatSessions/claude/`. Our proxy
**borrows** from it (model-ID parser, beta filter, disconnect
detection) but is structurally different in two ways:

1. The reference is a **byte-passthrough** — it pipes upstream SSE
   chunks verbatim. Our `ICopilotApiService.messages()` returns
   pre-parsed event objects, so we MUST construct SSE frames ourselves.
2. The reference forces `stream: true` upstream and has known bugs
   (no backpressure; mid-stream error handler tries to `writeHead`
   after streaming has started). We support both branches and fix
   these.

---

## 1.5. Pre-Phase 2 dependency: widen Phase 1 error contract

**Status:** ✅ done (verified live against CAPI).

Phase 1 originally threw plain `Error` instances on both failure
paths, which discarded the upstream `status` + Anthropic error
envelope. Q10's passthrough design needs both to re-emit verbatim,
so Phase 1.5 widened the error contract.

**Shipped change.** A typed error class carrying SDK-typed envelopes:

```ts
import type Anthropic from '@anthropic-ai/sdk';

export class CopilotApiError extends Error {
    constructor(
        readonly status: number,
        readonly envelope: Anthropic.ErrorResponse,
        message?: string,
    ) {
        super(message ?? envelope.error.message);
        this.name = 'CopilotApiError';
    }
}
```

Both throw sites construct this with the parsed Anthropic envelope:

- **Non-2xx HTTP responses** — conforming bodies are passed through
  verbatim (preserving any `request_id` and SDK-known extras);
  non-conforming bodies (plain text, malformed JSON, missing
  fields) are synthesized into a minimal `{ type: 'error', error:
  { type: 'api_error', message }, request_id: null }` envelope.
- **Streaming `event: error` SSE frames** — `status` is set to the
  sentinel `COPILOT_API_ERROR_STATUS_STREAMING = 520` (the upstream
  HTTP response was 200; the real status is no longer meaningful
  once the stream has started). Consumers should branch on
  `envelope.error.type` rather than `status` for these.

Network/transport failures (connection reset, DNS failure, etc.)
and token-mint failures stay as plain `Error` so consumers can
distinguish API errors from transport/auth-tier errors.

Phase 2's Q10 does an `instanceof CopilotApiError` check and
re-serializes `err.envelope` with `err.status`; non-`CopilotApiError`
falls through to the synthetic 502 path.

**Verified live (smoke probe against real CAPI):** `models()`
success, streaming `messages()` success with full
`message_start → content_block_* → message_delta → message_stop`
sequence and SDK-typed `delta.stop_reason` access, and the
documented token-mint-vs-CAPI-error tier separation.

---

## 2. Design decisions

Each decision was grilled, with alternatives considered, before being
locked in. The numbering matches the design log in `CONTEXT.md`.

### Q1 — Naming

`IClaudeProxyService` / `ClaudeProxyService`. Files under
`src/vs/platform/agentHost/node/claude/`.

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

- **Refcounted.** Each `start()` increments, each `handle.dispose()`
  decrements. At refcount 0 the listener closes, the token slot
  clears, and the nonce is destroyed. The next `start()` rebinds with
  a new port and a fresh nonce.
- **Shared token slot, last-writer-wins.** Single-tenant per roadmap.
  Multi-tenant is Phase 4+.
- **Subprocess ownership invariant.** Callers that hand the handle's
  `baseUrl` / `nonce` to a Claude SDK subprocess MUST kill that
  subprocess before disposing the handle. The subprocess cannot
  outlive the handle.

### Q4 — Auth

Enforce `Authorization: Bearer <nonce>.<sessionId>` on authenticated
routes. Parse and log `sessionId` at trace level only; treat it as
opaque in Phase 2. `x-api-key` is ignored.

Bearer enforcement runs FIRST on authenticated routes — bad token
yields 401, never 501 or 404.

**Do NOT port `extractSessionId` from the reference verbatim.** The
reference
([claudeLanguageModelServer.ts L348-361](../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeLanguageModelServer.ts#L348-L361))
accepts nonce-only bearer tokens (no `.sessionId`) as a legacy path.
Phase 2 deliberately rejects that — `Bearer <nonce>` (no dot) → 401.
Write a fresh parser in `claudeProxyAuth.ts`; the reference's test
fixtures cannot be lifted unchanged.

### Q5 — Routes

| Route | Status | Notes |
| --- | --- | --- |
| `POST /v1/messages` | full impl | streaming + non-streaming |
| `GET /v1/models` | net new | passthrough filtered to `vendor: 'Anthropic'` and `supported_endpoints` containing `/v1/messages`; reshaped to Anthropic's `Page<ModelInfo>` envelope (see below) |
| `POST /v1/messages/count_tokens` | net new | 501 with Anthropic error envelope: `{ type: 'error', error: { type: 'api_error', message: 'count_tokens not supported by CAPI' } }`. Settled as always-501 because `ICopilotApiService.countTokens()` itself throws (CAPI has no endpoint). The roadmap's earlier "pass-through (or 501)" wording is superseded. |
| `GET /` | health | plain-text `'ok'` |
| anything else | 404 | Anthropic error envelope |

No `OPTIONS` handler — same-process consumer, CORS does not apply.

**`/v1/models` response shape.** The Anthropic SDK's
`client.models.list()` calls `getAPIList('/v1/models', Page<ModelInfo>, ...)`
which expects a `PageResponse<Item>` envelope per
[`pagination.d.ts` L39-44](../../../../node_modules/@anthropic-ai/sdk/core/pagination.d.ts#L39-L44):

```json
{
  "data": [
    { "id": "claude-opus-4-6-20250929", "type": "model", "display_name": "Claude Opus 4.6", "created_at": 0 },
    ...
  ],
  "has_more": false,
  "first_id": null,
  "last_id": null
}
```

Returning a bare array breaks SDK pagination.

### Q6 — Model ID translation

The SDK does literal prefix matching (e.g.
`id.startsWith('claude-opus-4-6')`). CAPI uses dotted versions
(`claude-opus-4.6`); the SDK uses hyphenated Anthropic-canonical IDs
(`claude-opus-4-6-20250929`). Translation is **bidirectional**.

- Port `extensions/copilot/src/extension/chatSessions/claude/{common,node}/claudeModelId.ts`
  into `node/claude/claudeModelId.ts` with a comment marking it as a
  mirror that must be kept in sync. Lift the same test fixtures.
- Two pure helpers: `tryParseClaudeModelId(id)` returning a
  `ParsedClaudeModelId` with `toSdkModelId()` /
  `toEndpointModelId()`. No service, no class — the parser caches
  internally.
- **Three rewrite points** in the proxy:
  1. inbound `requestBody.model` (SDK → CAPI)
  2. outbound `model` fields on streaming events and non-streaming
     responses (CAPI → SDK), e.g. `message_start.message.model`
  3. `GET /v1/models` response IDs (CAPI → SDK)
- **Inbound parse failure**: 404 `not_found_error` — before any CAPI
  call.
- **Outbound parse failure**: log a warning, pass the raw value
  through. Strictly worse than translating, but strictly better than
  dropping the response.
- Model **availability fallback** ("user picked an unavailable model,
  pick the newest Sonnet") is a Phase 4 `ClaudeAgent` concern. The
  proxy stays dumb.

### Q7 — Anthropic-beta + header passthrough

- Lift `filterSupportedBetas()` and the three-entry
  `SUPPORTED_ANTHROPIC_BETAS` allowlist (`interleaved-thinking`,
  `context-management`, `advanced-tool-use`) into
  `node/claude/anthropicBetas.ts` with a "keep in sync" comment.
  Allowlist match is prefix + `-` (date-suffix discipline).
- Applied at `POST /v1/messages` after auth, before model translation.
  If the filtered result is a non-empty string, set it on the outbound
  `ICopilotApiServiceRequestOptions.headers['anthropic-beta']`. If
  `undefined`, omit the header entirely — never forward `''`.
- **Inbound header passthrough** is restricted to `anthropic-version`
  (verbatim) and `anthropic-beta` (filtered). All other client headers
  are dropped, including `x-request-id` / `request-id` — CAPI
  generates its own.
- The proxy ignores `request.metadata` and any SDK-side `betas`
  field; only the `anthropic-beta` header drives behavior.

### Q8 — Streaming: framing, backpressure, mid-stream errors

The reference is a byte-passthrough. We can't do that:
`ICopilotApiService.messages()` returns
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

**Backpressure.** The reference does NOT handle this and we treat
that as a bug, not a guideline. When `res.write()` returns `false`,
`await once(res, 'drain', { signal: ac.signal })` before pulling the
next event from the generator. The signal is required — if the
client closes mid-buffer, `drain` never fires; passing `ac.signal`
lets abort reject the wait and unwind the loop. This also naturally
backpressures the upstream.

**Mid-stream errors.** The reference's `catch` tries to
`writeHead(500)` after streaming has started, which throws — its
mid-stream error handling is silently broken. We emit an Anthropic-
shaped SSE error frame and end:

```
event: error
data: { "type": "error", "error": { "type": "api_error", "message": "..." } }
```

Then `res.end()`. Do not emit `message_stop` after `error` — `error`
is terminal in the Anthropic SDK.

**Non-streaming branch.** When `request.stream !== true`:

- `Content-Type: application/json`
- Single body: `JSON.stringify(message)` where `message` is the
  `Anthropic.Message` returned by the non-streaming
  `ICopilotApiService.messages()` overload, with the `model` field
  rewritten to SDK format.
- The reference forces `stream: true` upstream and SSE-frames
  everything — we explicitly do NOT do this. Honor `request.stream`.

### Q9 — Abort / disconnect propagation

One `AbortController` per inbound request, plumbed through to
`ICopilotApiServiceRequestOptions.signal`. Two distinct abort
sources — must be distinguished, because `server.close()` does NOT
destroy existing sockets and a `return` without writing leaves the
client hanging until TCP timeout.

```ts
type InFlight = { ac: AbortController; res: ServerResponse; clientGone: boolean };
const inFlight = new Set<InFlight>();

const entry: InFlight = { ac: new AbortController(), res, clientGone: false };
inFlight.add(entry);
res.on('close', () => { entry.clientGone = true; entry.ac.abort(); });

try {
    const stream = copilotApi.messages(githubToken, body, { signal: entry.ac.signal, headers });
    for await (const event of stream) { /* emit */ }
} catch (err) {
    if (entry.ac.signal.aborted) {
        if (!entry.clientGone) { res.destroy(); } // dispose-driven; client still listening
        return;
    }
    // else: emit Anthropic SSE error frame (Q8)
} finally {
    inFlight.delete(entry);
}
```

- **Single client-disconnect trigger**: `res.on('close')` sets
  `clientGone = true` and aborts. The reference also uses this;
  `req.on('close')` and `req.on('aborted')` are redundant.
- **No polling**. Pass `signal` to `ICopilotApiService.messages()`;
  the generator rejects with `AbortError` on the next iteration. The
  for-await unwinds naturally.
- **Client-disconnect path**: socket already closed — `return`
  without writing.
- **Dispose-driven path**: socket still open — `res.destroy()`
  before returning so the client doesn't hang.
- **Non-streaming branch**: same pattern. The awaited
  `ICopilotApiService.messages()` rejects with `AbortError`; we
  `res.destroy()` (if dispose-driven) or `return` (if
  client-disconnect) without writing a body.
- **`dispose()` aborts in-flight**. On refcount→0 dispose: for each
  `entry` in `inFlight`, call `entry.ac.abort()`. The catch handler
  then `res.destroy()`s any still-open responses. After all
  in-flight resolves, `server.close()`, clear the token slot, destroy
  the nonce.

### Q10 — Error envelopes

Two distinct flows.

**Proxy-authored errors.** No upstream response exists, so we
construct the Anthropic envelope ourselves via one helper:

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
Anthropic wire format. After §1.5's Phase 1 widening,
`ICopilotApiService` throws `CopilotApiError` carrying `err.status`
+ `err.envelope` (the parsed envelope, verbatim). We just
re-serialize:

```ts
catch (err) {
    if (err instanceof CopilotApiError) {
        res.writeHead(err.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(err.envelope));
        return;
    }
    // network / non-API error — synthesize
    writeJsonError(res, 502, 'api_error', err.message ?? 'Upstream error');
}
```

No subclass ladder. No mapping table. No `err.message` sanitization
— passthrough.

**Mid-stream variant.** Same idea, SSE frame instead of JSON body:

```ts
const envelope = err instanceof CopilotApiError
    ? err.envelope
    : { type: 'error', error: { type: 'api_error', message: err.message ?? 'Upstream error' } };
res.write(`event: error\ndata: ${JSON.stringify(envelope)}\n\n`);
res.end();
```

Status is ignored once headers are sent (Q8). On `signal.aborted`,
write nothing — client is gone (Q9).

### Q11 — File layout

**Shipped:** route handlers were collapsed into private methods on
`ClaudeProxyService` rather than separate `claudeProxyMessages.ts` /
`claudeProxyModels.ts` classes. They share per-request bookkeeping
(`IInFlight`, the `runtime` token slot, the abort plumbing); splitting
them would have required threading the same five arguments through
every call. Final layout:

```
src/vs/platform/agentHost/node/claude/
├── claudeProxyService.ts   # interface + impl + lifecycle + server + dispatch + route handlers
├── claudeModelId.ts        # parser (Q6) — mirror of extension copy
├── anthropicBetas.ts       # filterSupportedBetas + allowlist (Q7)
├── anthropicErrors.ts      # buildErrorEnvelope, writeJsonError, writeUpstreamJsonError, formatSseErrorFrame (Q10)
└── claudeProxyAuth.ts      # parseProxyBearer (Q4)

src/vs/platform/agentHost/test/node/   (flat, matches existing convention)
├── claudeModelId.test.ts
├── anthropicBetas.test.ts
├── claudeProxyAuth.test.ts
└── claudeProxyService.test.ts
```

- **Pure helpers** (`claudeModelId`, `anthropicBetas`,
  `anthropicErrors`, `claudeProxyAuth`) are platform-free pure
  functions, testable in isolation.
- **Route handlers live inside `ClaudeProxyService`** as private
  methods (`_handleModels`, `_handleMessages`,
  `_sendNonStreamingMessage`, `_streamMessages`).
- **`claudeProxyService.ts`** owns the `IClaudeProxyService` interface,
  the impl, `IClaudeProxyHandle`, refcounted lifecycle, the
  `http.createServer()`, the top-level dispatch switch on
  `url.pathname`, the `Set<IInFlight>` of in-flight requests, and all
  route handlers.
- **Interface lives next to impl.** No `common/` split for Phase 2
  — both consumers (`agentHostMain.ts`, future `ClaudeAgent`) are
  in `node`.

---

## 3. Acceptance criteria

Phase 2 is "done" when all of the following pass.

### Hygiene (run frequently during development)

- [ ] `compile-check-ts-native` clean
- [ ] `eslint` clean
- [ ] `valid-layers-check` clean
- [ ] Hygiene check (gulp `hygiene`) clean — copyright headers,
      tabs, string quoting, formatting

### Lifecycle (Q2/Q3)

- [ ] `start(token)` returns a handle with `baseUrl` (e.g.
  `http://127.0.0.1:54321`) and a 256-bit hex `nonce`
- [ ] Two concurrent `start()` calls share one server, share the
  latest token, return handles with the same `baseUrl` and `nonce`
- [ ] Disposing one handle while the other is alive: server stays
  up, in-flight requests on the other handle continue
- [ ] Disposing the last handle: `server.close()` runs, in-flight
  controllers abort, port is freed
- [ ] `start()` after refcount-0 dispose binds a new port and a
  fresh nonce

### Bind safety

- [ ] Server binds only to `127.0.0.1`, not `0.0.0.0`

### Auth (Q4)

- [ ] Missing `Authorization` → 401 `authentication_error`
- [ ] `Bearer wrong-nonce.x` → 401
- [ ] `Bearer <nonce>` (no dot) → 401
- [ ] `Bearer <nonce>.` (empty sessionId) → 401
- [ ] `Bearer <nonce>.abc-123` → request proceeds; sessionId logged
- [ ] `x-api-key: <nonce>` alone → 401
- [ ] **Auth-first precedence on authenticated routes:**
  - [ ] `GET /v1/models` with `Bearer wrong-nonce.x` → 401 (not 200)
  - [ ] `POST /v1/messages/count_tokens` with `Bearer wrong-nonce.x`
    → 401 (not 501)
  - [ ] `POST /v1/messages` with `Bearer wrong-nonce.x` → 401 (not
    200, not a CAPI call made)

### Routes (Q5)

- [ ] `GET /` → 200, body `'ok'`, no auth required
- [ ] `GET /v1/models` (authed) → 200, response shape is
  `{ data: [...], has_more: false, first_id: null, last_id: null }`
  with each item `{ id, type: 'model', display_name, created_at: '1970-01-01T00:00:00Z', capabilities: null, max_input_tokens: null, max_tokens: null }`
  and `id` in SDK format. (RFC3339 string instead of `0` because the
  SDK `Anthropic.ModelInfo` type forces it — settled by council C1.)
- [ ] `POST /v1/messages/count_tokens` (authed) → 501 `api_error`
- [ ] `GET /something-else` (authed) → 404 `not_found_error`

### Model translation (Q6)

- [ ] SDK ID inbound translates to CAPI; CAPI ID inbound also works
- [ ] Unparseable model ID → 404 with no CAPI call
- [ ] `message_start.message.model` rewritten to SDK format on the
  way out (streaming)
- [ ] Non-streaming `message.model` rewritten to SDK format on the
  way out
- [ ] `/v1/models` IDs in SDK format

### Beta filtering (Q7)

- [ ] `anthropic-beta: interleaved-thinking-2025-05-14` → forwarded
- [ ] `anthropic-beta: foo,bar,baz` → header omitted upstream
- [ ] `anthropic-beta: interleaved-thinking-2025-05-14,foo` →
  forwarded as `interleaved-thinking-2025-05-14`
- [ ] `anthropic-beta: interleaved-thinking` (no date) → omitted

### Header passthrough (Q7)

- [ ] `anthropic-version: 2023-06-01` → forwarded verbatim
- [ ] `x-request-id: foo` → dropped
- [ ] Random `x-custom-header` → dropped

### Streaming (Q8)

- [ ] `request.stream === true` → SSE with hand-rolled
  `event:/data:` framing in CAPI's emitted order
- [ ] `request.stream !== true` → JSON body
- [ ] Tool-use streams reach client (`input_json_delta` events
  present)
- [ ] Thinking streams reach client (`thinking_delta` events
  present)
- [ ] No `[DONE]` line emitted
- [ ] `socket.setNoDelay(true)` is called

### Abort (Q9)

- [ ] Mid-stream client disconnect → upstream
  `ICopilotApiService.messages()` receives `signal.aborted`;
  generator unwinds; no further writes
- [ ] `await once(res, 'drain', { signal: ac.signal })` rejects
  promptly when client disconnects mid-buffer (no hang)
- [ ] Mid-stream `dispose()` → all in-flight `res.destroy()`'d;
  client doesn't hang waiting on a half-open socket; server closes
- [ ] Non-streaming client disconnect → no JSON body written
- [ ] Non-streaming `dispose()` → `res.destroy()` called; client
  doesn't hang

### Errors (Q10)

- [ ] Proxy-authored errors emit the Q10 envelope with correct
  status from the table
- [ ] CAPI `CopilotApiError` (per §1.5) → re-emitted with original
  `err.status` + `err.envelope` verbatim
- [ ] Mid-stream CAPI error → SSE `event: error` frame with
  `err.envelope`, then `res.end()`, no `message_stop`
- [ ] Network error (non-`CopilotApiError`) → 502 `api_error`

---

## 4. Testing strategy

Three surfaces.

### Surface 1 — pure-helper unit tests

Zero deps, fast, deterministic. Located in
`src/vs/platform/agentHost/test/node/`:

- `claudeModelId.test.ts` — port the extension's fixture matrix;
  bidirectional round-trip
- `anthropicBetas.test.ts` — port the 7 reference fixtures from
  `extensions/copilot/.../test/extractSessionId.spec.ts`
- `claudeProxyAuth.test.ts` — auth matrix from Q4

### Surface 2 — service-level tests

`claudeProxyService.test.ts` boots the real service against a fake
`ICopilotApiService`; uses real `http.Server` to hit
`127.0.0.1:<port>`.

`FakeCopilotApiService` is the **only** mock — everything else (real
HTTP, real `AbortController`, real parser, real filter) is real. Per
the codebase guideline: minimal mocking, mock only true I/O
boundaries.

```ts
class FakeCopilotApiService implements ICopilotApiService {
    nextMessagesResult: Anthropic.Message
        | AsyncGenerator<Anthropic.MessageStreamEvent>
        | CopilotApiError; // §1.5
    lastCall: {
        githubToken: string;
        body: Anthropic.MessageCreateParams;
        options: ICopilotApiServiceRequestOptions;
    };
    messages(githubToken, body, options): ...
    models(githubToken): ...
    countTokens(githubToken): ...
}
```

Cases: lifecycle / refcount / port / dispose; auth fixtures
end-to-end through real HTTP; auth-first precedence on each
authenticated route; route status matrix; `/v1/models` Page envelope
shape; model translation roundtrip; beta filter forwarded correctly
to mock; streaming order + framing; non-streaming JSON body shape;
mid-stream abort propagates `signal.aborted` to mock; mid-stream
`CopilotApiError` becomes SSE error frame with `err.envelope`;
pre-stream `CopilotApiError` becomes JSON error with `err.status`;
client-disconnect aborts upstream and writes nothing;
dispose-driven abort calls `res.destroy()` on every in-flight
response.

### Surface 3 — real-CAPI smoke (Phase 2, manual)

Validates real CAPI without waiting for Phase 4's `ClaudeAgent`.

Procedure:

1. Temporarily modify the existing `CopilotAgent` (or wherever the
   agent host first authenticates) to call
   `claudeProxyService.start(token)` once a real GitHub token is
   minted, and log the resulting `baseUrl` and `nonce` at info
   level.
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

### What we explicitly do NOT test in Phase 2

- Real Claude Agent SDK subprocess (Phase 4)
- Multi-tenant token isolation (Phase 4+)
- Proxy / PAC support (deferred — see §6)

---

## 5. Implementation order

Build in this order so each step has a green compile, lint, and
tests before the next begins.

0. **Pre-Phase 2 dependency (§1.5)**
   - Widen `ICopilotApiService` to throw `CopilotApiError` (or
     equivalent typed error carrying `status` + Anthropic envelope)
     on both non-2xx and SSE error paths.
   - Update Phase 1 tests to cover the new error contract.
   - Phase 2 cannot start cleanly without this — Q10 depends on it.
1. **Pure helpers + their tests** (no service yet)
   - `claudeModelId.ts` + test
   - `anthropicBetas.ts` + test
   - `anthropicErrors.ts` (types + helpers, no `res.write` yet)
   - `claudeProxyAuth.ts` + test (fresh implementation per Q4 — do
     NOT port `extractSessionId`)
   - Run hygiene + eslint after each
2. **Service shell**
   - `IClaudeProxyService`, `IClaudeProxyHandle` interface
   - lifecycle (start / refcount / dispose) with empty server
   - test the lifecycle without any routes
3. **Routes**
   - `GET /` (health) — easy, builds confidence in dispatch
   - `GET /v1/models` — first real CAPI integration; verify Page
     envelope
   - `POST /v1/messages/count_tokens` — easy 501
   - `POST /v1/messages` — both branches; biggest piece
   - tests at each step
4. **Real CAPI smoke** with the temporary `CopilotAgent` hook
5. **Revert hook, ensure all hygiene/lint/test green**

---

## 6. Deferred for later phases

Captured here so they aren't lost. None of these block Phase 2.

- **HTTP proxy support** (`HTTP_PROXY` / `HTTPS_PROXY` env vars,
  VS Code's `http.proxy` setting, PAC files, proxy auth). The Phase 2
  proxy talks to CAPI through `ICopilotApiService`, so any outbound
  proxying is inherited from whatever HTTP client that service uses.
  If the agent host needs to honor user proxy configuration we'll
  need an explicit agent / dispatcher injection point on
  `ICopilotApiService` and a way to source the config from the
  renderer. Track separately when we pick this up.
- **Model availability fallback.** "User picked a model that's not
  available on CAPI today, pick the newest Sonnet instead." Lives in
  the `ClaudeAgent`, not the proxy. Phase 4.
- **Multi-tenant token isolation.** Multiple GitHub identities
  concurrently using the same agent host process. Phase 4+.

---

## 7. Open questions for reviewers

Areas where additional eyes would be most useful:

1. **Refcounted lifecycle vs. one-shot per agent.** We chose
   refcount because the Claude Agent SDK can be invoked
   concurrently for multiple sessions and we don't want each session
   to bind a new port. Is there a scenario this misses?
2. **Shared token slot, last-writer-wins.** Single-tenant assumption
   — good for Phase 2, but the second writer silently shadows the
   first. Should we instead reject concurrent `start(token)` calls
   if the new token differs from the current one?
3. **Outbound parse failure (Q6) — log + passthrough.** We chose
   passthrough so we don't drop responses, but the SDK's prefix
   matcher may then fail downstream. Is "warn + passthrough" or
   "warn + 502" the better failure mode for a model the parser can't
   recognize?
4. **Real-CAPI smoke as a manual procedure.** It validates the
   full path against real CAPI without Phase 4 infrastructure, but
   it requires a code-modify-then-revert. Worth a dedicated `--smoke`
   CLI flag that triggers the same hook automatically?

## 8. Resolved concerns (council review log)

A prior cross-reviewed council pass surfaced and resolved the
following items, captured here so reviewers don't re-litigate:

- **Phase 1 throws plain `Error`, not `Anthropic.APIError`.**
  Resolved by §1.5 (widen Phase 1 to `CopilotApiError`).
- **`ICopilotApiService` methods take `githubToken` as first
  parameter.** Resolved — interface sketch (§1), Q9 pseudocode, and
  `FakeCopilotApiService` (§4) all updated.
- **Auth-first precedence not in acceptance criteria.** Resolved
  — §3 now has explicit `Bearer wrong-nonce` cases for each
  authenticated route.
- **`/v1/models` needed `Page` envelope, not bare array.** Resolved
  — Q5 specifies the full `{ data, has_more, first_id, last_id }`
  shape.
- **`dispose()` would orphan client sockets.** Resolved — Q9
  distinguishes client-disconnect (socket already closed) from
  dispose-driven abort (`res.destroy()` required).
- **`once(res, 'drain')` could hang on client disconnect.**
  Resolved — Q8 now passes `{ signal: ac.signal }`.
- **`extractSessionId` from reference can't be ported verbatim.**
  Resolved — Q4 explicitly notes a fresh implementation is required;
  reference accepts nonce-only, Phase 2 rejects it.
