# Codex Phase 1 — CAPI Responses passthrough ✅

Add an outbound surface to `ICopilotApiService` that mirrors the
existing Anthropic `messages()` method but forwards to CAPI's OpenAI
Responses endpoint (`{capiBaseUrl}/responses`), so the local proxy
introduced in [Phase 2](./phase2-plan.md) has a typed target to call.

## What landed

- `ICopilotApiService.responses(githubToken, body, options): Promise<Response>`
  — raw passthrough. Caller owns the response body; we don't deserialize
  because the proxy streams SSE bytes through byte-for-byte.
- `CopilotApiService.responses()` — builds the same per-request
  metadata (`Content-Type`, `Authorization: Bearer <gh-token>`,
  `X-Request-Id`, `OpenAI-Intent: conversation`) as the existing
  `messages()` flow and routes via `CAPIClient.makeRequest` with
  `RequestType.ChatResponses`. The `@vscode/copilot-api` package
  resolves that request-type to `{capiBaseUrl}/responses`.

## Why a separate method (and not `messages()`)

The Anthropic Messages format and the OpenAI Responses format are
structurally different (request body, SSE event names, tool-call
encoding). `messages()` deserialises into `Anthropic.MessageStreamEvent`
because the Claude proxy needs to map events; the codex proxy is a
pure passthrough so it only needs the raw `Response`. Sharing the
request-id / OpenAI-Intent / token-rotation machinery (via
`CAPIClient`) is the only useful overlap, and that's what the new
method reuses.

## Error handling

- Non-2xx responses throw `CopilotApiError(status, …)` — same envelope
  the proxy already knows how to surface.
- 401/403 evicts the cached `CAPIClient` for that token via
  `_invalidateClientForToken`, so a subsequent retry rebuilds the client
  with the new token (or the same token after credential refresh).

## Things deliberately NOT added

- No SSE parsing helpers — the proxy pipes raw bytes.
- No non-streaming variant — codex always streams. If a non-streaming
  caller ever appears, add `responses({…}, { stream: false })` to the
  request body and read JSON from `Response.json()`.
- No request-body validation — CAPI rejects malformed bodies and the
  rejection round-trips back to the codex CLI as the same status code.
