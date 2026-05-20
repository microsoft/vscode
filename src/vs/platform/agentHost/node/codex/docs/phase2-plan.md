# Codex Phase 2 — Local Responses proxy ✅

A small in-process HTTP server that speaks the OpenAI Responses API on
its inbound side and `ICopilotApiService.responses()` on its outbound
side, so the codex CLI can target `http://127.0.0.1:<port>/v1` /
`Bearer <nonce>` and the agent host transparently routes through CAPI.

## What landed

- [`codexProxyService.ts`](../codexProxyService.ts) — refcounted service
  mirroring `ClaudeProxyService`:
  - `ICodexProxyService.start(githubToken)` returns an
    `ICodexProxyHandle` with `baseUrl` (no trailing slash) and `nonce`.
  - On first `start()` it binds an HTTP server on `127.0.0.1:0` (random
    port).
  - Each subsequent caller bumps the refcount; the most recent token
    wins (single-tenant assumption — we have one consumer).
  - `dispose()` aborts every in-flight request and closes the listener.

- Routes:
  - `GET /` → 200 `ok` (unauthenticated health check; needed so codex
    can probe the endpoint without surfacing a 401).
  - `POST /v1/responses`, `POST /responses`, `POST //responses` →
    forwards to `ICopilotApiService.responses(token, body)`. The codex
    CLI hits `/v1/responses` in the standard configuration but will
    emit `//responses` when its `openai_base_url` ends in `/`; accept
    all three so we're robust to user-supplied trailing slashes.
  - Any other path/method → 404 JSON envelope.

- Auth: `Bearer <nonce>` (plain — no `nonce.sessionId` suffix the way
  Claude does, because codex's SDK sets `CODEX_API_KEY` straight into
  the `Authorization: Bearer …` header with no path-suffix).

- Streaming: the upstream `Response.body` is read with a
  `ReadableStreamDefaultReader` and the chunks are flushed straight to
  the inbound `http.ServerResponse`. Content-type is copied from the
  upstream response so SSE clients see `text/event-stream`.

- Cancellation: the inbound socket's `close` event fires an
  `AbortController` that cancels the outbound CAPI request. The
  service's `dispose()` aborts every in-flight controller.

## Errors

| Outbound failure              | Inbound response                          |
| ----------------------------- | ----------------------------------------- |
| `CopilotApiError` from CAPI   | `{status} api_error <message>`            |
| Network / unknown             | `502 api_error <message>`                 |
| Client disconnected mid-pipe  | silent — write side has been destroyed    |

## Why a custom provider, not the built-in `openai`

The codex CLI's built-in `openai` provider has `supports_websockets =
true`, which makes it attempt a WebSocket upgrade for the Responses API
(see the codex repo at
`codex-rs/model-provider-info/src/lib.rs::create_openai_provider`). Our
proxy is plain HTTP+SSE — the WebSocket attempt would 404 against our
server. Built-in provider IDs are also rejected if overridden in
`config.toml` (`config_toml.rs::validate_reserved_model_provider_ids`).

So `CodexAgent` constructs the SDK with a **custom provider**
(`model_provider: 'capi-proxy'`) whose definition overrides
`base_url`, `wire_api`, `env_key`, `requires_openai_auth`, and inherits
the default `supports_websockets = false`. This is the same pattern
the codex repo itself documents in
[`codex-rs/responses-api-proxy/README.md`](https://github.com/openai/codex/blob/main/codex-rs/responses-api-proxy/README.md).
