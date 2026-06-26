# Change Log

All notable changes to the `dial-chat-model-provider` extension will be documented in this file. See [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.5.3] — 2026-06-13

## [0.5.2] — 2026-06-12

### Fixed

- **Embeddings API.** `POST /openai/deployments/{id}/embeddings` now includes the required `api-version` query parameter (same as chat completions), fixing HTTP 400 from DIAL Core and enabling Copilot `#codebase` semantic search with BYOK embedding models.

## [0.5.1] — 2026-06-12

### Fixed

- **Topic filter applies immediately** when `dial.requiredTopics` changes — no window reload required; cached listing is refiltered and Copilot picker is notified.
- **Topic parsing** reads `descriptionKeywords` (camelCase) in addition to `description_keywords`.
- **Chat kind inference** treats `capabilities.completion` and `type: completion` as chat models.
- **Picker refresh** refetches the model listing when it is older than 60 seconds (e.g. after DIAL Admin topic changes).
- **Diagnostic logs** in Output → DIAL explain which models were excluded by the topic filter and why.

## [0.5.0] — 2026-06-12

### Changed

- **Model listing strategy.** Discovery uses `GET /openai/models` (models only) with fallback to legacy `/openai/deployments`. The `/v1/deployments?interface_type=…` endpoint is no longer used — it returned applications and toolsets alongside models.
- **Client-side kind split.** Chat vs embedding is inferred from listing `capabilities` (or `type`), not from separate server-side interface filters.

### Added

- **`dial.requiredTopics`.** Optional filter: show only models whose DIAL Admin Topics (`description_keywords`) include at least one configured tag (OR match, case-insensitive).

## [0.4.0] — 2026-06-12

### Added

- **Copilot BYOK integration.** Chat models are marked `isBYOK: true` and `isUserSelectable: true` for Copilot utility flows and setup bypass when no CAPI subscription is available.
- **Embeddings provider.** Registers DIAL embedding deployments via `vscode.lm.registerEmbeddingsProvider` as `dial.{deploymentId}`; implements `POST /openai/deployments/{id}/embeddings`.
- **Deployment kind split.** Chat and embedding deployments are fetched separately via `GET /v1/deployments?interface_type=chat|embedding` ([ai-dial-core#1383](https://github.com/epam/ai-dial-core/issues/1383)); legacy `/openai/deployments` is used as chat-only fallback when v1 listing is unavailable.
- **Command `DIAL: Apply Copilot Model Defaults`.** Writes workspace `chat.embeddingModel`, `chat.utilityModel`, `chat.utilitySmallModel`, and `chat.tools.riskAssessment.model` to route Copilot background flows through DIAL.

### Changed

- **Breaking:** Model discovery uses `/v1/deployments` with interface type filters instead of a single undifferentiated `/openai/deployments` list.
- **Tool stripping.** Chat requests omit `tools` / `tool_choice` when `features.tools_supported === false`.

### Requirements

- VS Code build with proposed APIs **`chatProvider`** and **`embeddings`** (e.g. [feat/forward-reasoning](https://github.com/sergey-zinchenko/vscode/tree/feat/forward-reasoning)) for full Copilot BYOK routing.

## [0.3.0] — 2026-06-12

### Changed

- **Breaking:** Reasoning support now follows DIAL Core [ai-dial-core#1611](https://github.com/epam/ai-dial-core/pull/1611). Deployments advertise supported effort values via `features.reasoning_efforts` (string array). Empty or absent array means reasoning is unsupported.
- **Thinking Effort picker** uses only values from `features.reasoning_efforts`; hardcoded fallback levels and `defaults.reasoning_effort_levels` are no longer used.
- **`reasoning_efforts_supported`** is no longer read from deployment listing.

### Added

- **Allowed-list validation.** Chat requests omit `reasoning_effort` when the chosen value is not listed in `features.reasoning_efforts` (diagnostic action `dropped-not-in-allowed-list`).

## [0.2.7] — 2026-06-03

### Fixed

- **`enableThinking` from Copilot Agent.** When `modelOptions.enableThinking` is `false`, `reasoning_effort` is no longer sent even if the model picker still has a Thinking Effort level. When `true`, effort from `modelConfiguration` / `modelOptions` is applied as before.

## [0.2.6] — 2026-06-03

### Added

- **`configurationSchema` for reasoning.** Deployments with `reasoning_efforts_supported: true` now expose a **Thinking Effort** picker (`reasoningEffort`) in VS Code / Copilot model settings. Values flow through `modelConfiguration` into chat requests.

## [0.2.5] — 2026-06-03

### Fixed

- **Deployment default `reasoning_effort: "none"`** is no longer forwarded to DIAL (treated as “reasoning off”, same as `off` / empty).
- **Richer reasoning diagnostics** — logs raw IDE inputs (`modelConfiguration`, `modelOptions.reasoningEffort`, `modelOptions.enableThinking`) separately from deployment defaults.

## [0.2.4] — 2026-06-03

### Added

- **`reasoning_efforts_supported` deployment flag.** Parsed from DIAL Core listing ([ai-dial-core#1584](https://github.com/epam/ai-dial-core/pull/1584)). When `true`, forwards IDE/Copilot `reasoningEffort` as OpenAI `reasoning_effort` on chat completions; when absent/false, the field is never sent.
- **Diagnostic reasoning logs.** Each chat logs `reasoning: { deploymentSupports, requested, sent, source, action }` in the DIAL output channel.

## [0.2.3] — 2026-06-03

Same as [0.2.2] (SSE usage-only stream fix); version bump for distribution.

## [0.2.2] — 2026-06-03

### Fixed

- **SSE usage-only final chunk.** When upstream sends `stream_options.include_usage` and the last SSE event contains `usage` but no `delta.content` or `tool_calls`, the stream is no longer treated as empty (which previously surfaced as `DIAL: empty stream …`). Usage is still reported via `LanguageModelUsagePart` when supported.

### Changed

- **Simpler tokenization pipeline.** Removed client-side batching, token-bucket rate limiting, and the `length / 4` heuristic fallback. Token counts now come only from the DIAL `/tokenize` endpoint (or `0` for empty text), served from a SHA-1 content cache with in-flight deduplication. Transient failures retry with configurable exponential backoff.
- **Shared HTTP retry settings.** Replaced `dial.tokenizeRequestsPerMinute` with `dial.useServerTokenization`, `dial.httpRetryMaxAttempts` (default 5), `dial.httpRetryBaseDelayMs` (default 1000), and `dial.httpRetryMaxDelayMs` (default 30000). Chat completions use the same backoff for transient errors (503, empty body, connection reset) in addition to existing semantic retries (unsupported parameters, context clamp).
- **Context-length clamp retries.** Output limit shrinking now runs up to 4 times per chat call (upstream may report a higher prompt size on each attempt). Slack increased from 64 to ~0.5% of the window (256–2048 tokens) so a clamped request fits even when "at least N input tokens" undercounts the true prompt.
- **Chat overload resilience.** Streaming timeout default raised to 300 s (`dial.chatStreamTimeoutMs`). Transient `(empty response body)` failures log attempt duration and wait `max(exponentialBackoff, elapsed/3)` before retry so vLLM queue pressure can drain.
- **Chat cancellation.** VS Code `CancellationToken` aborts the in-flight axios POST and destroys the SSE stream; cancel is not retried, wrapped as a DIAL error, or followed by transient backoff sleeps.

## [0.2.0] — 2026-05-30

### Added

- **Server-side token counting.** `provideTokenCount` now delegates to the DIAL `POST /v1/deployments/{id}/tokenize` endpoint, so the IDE sees the model's real token usage instead of a `length / 4` estimate. The estimate is kept as a fallback when the deployment has no tokenizer, the call fails, or the request is cancelled. Tokenize requests are not auth-logged (high frequency).
- **Batched, cached, rate-limited tokenization.** The IDE calls `provideTokenCount` once per message while building a prompt, which bursts the DIAL ingress limiter (nginx per-IP `rpm` zone → HTTP 503) — and that burst even starves the chat completion sharing the same limit. Calls are now (1) served from a per-content cache (counts are deterministic), (2) coalesced into a single batched `inputs[]` request (deduplicated, split at 64 inputs), and (3) capped by a client-side token-bucket rate limiter (new `dial.tokenizeRequestsPerMinute`, default 20; `0` disables server tokenization). When the budget is spent the fast local estimate is returned immediately (no delay), so chat completions keep their share of the limit and history is still counted exactly over time as the cache fills.
- **Resilient tokenize fallback.** A missing route (HTTP 404) disables tokenize for the deployment for the rest of the session; any other failure (e.g. a transient HTTP 503) opens a 60 s cooldown during which the heuristic is returned silently, then the endpoint is retried. The warning is logged at most once per failure streak instead of on every call.

### Fixed

- **Model token budget.** `maxInputTokens` reported to the IDE now reserves the output budget out of the context window: when DIAL exposes `limits.maxTotalTokens` together with a completion cap (`limits.maxCompletionTokens` / defaults), the input budget is `maxTotalTokens − maxOutput` instead of the full window. An explicit `limits.maxPromptTokens` still wins. Combined with live tokenization, this lets the IDE trigger compaction before DIAL rejects an over-budget prompt.
- **Input-budget safety margin.** A derived `maxInputTokens` now also reserves a small margin (`~1 %` of the window, clamped to `64‥2048`). The IDE sums per-message `provideTokenCount` over plain text, but the model counts the fully templated prompt — chat-template framing (role markers / special tokens) adds a few tokens per message that the sum never sees, so without the margin a "full" prompt could land a hair over the true ceiling. Explicit `maxPromptTokens` is treated as authoritative and keeps no margin.
- **Context-window overflow recovery.** If DIAL still rejects a request because prompt + requested output exceed the context window (`maximum context length is N tokens …`), the client now parses the reported limits and retries once with the output limit clamped to fit (`maxContext − inputTokens − slack`), turning a hard HTTP 400 into a slightly shorter successful response. When the prompt alone leaves no room, the error surfaces so the IDE compacts.
- **Read deployment limits in snake_case.** The `/openai/deployments` listing serializes limits as `max_total_tokens` / `max_completion_tokens` / `max_prompt_tokens` (mirroring `input_attachment_types`), but the parser only accepted the camelCase config spelling, so the context window silently fell back to the 120 K default. Both spellings are now accepted.

## [0.1.1] — 2026-05-26

### Fixed

- **Vision / image attachments in Copilot.** Read `input_attachment_types` and `max_input_attachments` from the DIAL deployment listing. Models with any allowed `image/*` MIME now expose `capabilities.imageInput` in the VS Code model picker (previously only `url_attachments_supported` / `folder_attachments_supported` were considered, so most vision models looked unsupported).
- **Forward inline images to DIAL.** Copilot `LanguageModelDataPart` image bytes are encoded as `custom_content.attachments[].data` (base64) on the chat completion request, with MIME allow-list enforcement and optional `max_input_attachments` cap.
- **`input_attachment_types` wildcards.** DIAL patterns such as `*/*`, `audio/*`, and `image/*` are matched against Copilot attachment MIME types (in addition to exact types like `image/png`).
- **Ignore Copilot `cache_control` data parts.** Prompt-cache markers (`mimeType: cache_control`, `data: ephemeral`) are Copilot protocol metadata, not DIAL attachments; they are skipped instead of being sent as `custom_content.attachments`.

## [0.1.0] — 2026-05-24

Initial public release.

### Features

- **VS Code Language Model Chat Provider** (`vendor: dial`). Once authenticated, DIAL deployments appear in the Copilot model picker and any other client of `vscode.lm.*`.
- **OpenID Connect sign-in** (Authorization Code + PKCE per RFC 7636, S256, 16-byte random `state`, system browser per RFC 8252, loopback callback at `http://127.0.0.1:PORT/oauth-callback`).
- **Automatic OIDC client registration** via Keycloak Dynamic Client Registration — anonymous when the realm allows it, or authenticated with an admin-issued initial access token. The negotiated `client_id` is written to settings; the `client_secret` (for confidential clients) goes to the OS keychain.
- **Manual OIDC client** — paste a pre-registered `client_id` (and optional `client_secret`) into the keychain instead of DCR.
- **API-key authentication** as an alternative to OIDC for environments where users get a long-lived key instead of an OIDC account.
- **Streaming chat completions** over SSE (`stream=true`), text and `tool_calls` deltas mapped to `LanguageModelTextPart` / `LanguageModelToolCallPart`.
- **Tool / function calling** with auto / required tool modes.
- **Deployment-aware parameters.** The extension reads `features` from DIAL's deployment listing and tailors each request: `max_tokens_supported` / `max_completion_tokens_supported` choose the output-limit field (GPT-5 / o-series get `max_completion_tokens`, classic models get `max_tokens`), `custom_temperature_supported: false` omits `temperature`, `tools_supported`, attachment flags, and more.
- **Resilient retry** when the upstream model contradicts DIAL's flags. Bidirectional swap between `max_tokens` ↔ `max_completion_tokens` (each direction tried at most once, then field is dropped) and one-shot drop of `temperature`. Capped at 4 attempts, cannot oscillate.
- **`CancellationToken` propagation.** Cancelling the Copilot turn tears down the in-flight axios request and the SSE stream.
- **DIAL: Open Settings**, **DIAL: Login**, **DIAL: Logout**, **DIAL: Clear OAuth Client**, **DIAL: Set API Key**, **DIAL: Set OIDC Client Secret**, **DIAL: Set OIDC Initial Access Token** — all command-palette driven.

### Security model

- **All secrets in the OS keychain** (`vscode.SecretStorage` — Windows Credential Manager / macOS Keychain / libsecret). Settings hold only public identifiers (server URL, scopes, callback port, OIDC `client_id`, browser profile). A single `DialSecrets` facade is the only module that touches `context.secrets`.
- **HTTPS enforcement.** Activation warns when `dial.serverUrl` is non-loopback `http://` — JWT and API-KEY would otherwise travel in clear text.
- **Multi-byte-safe SSE.** `string_decoder.StringDecoder` preserves UTF-8 sequences split across chunks.
- **Refresh-token rotation** is honored; `invalid_grant` / `session not active` / `refresh token expired` clears the session.
- **Sanitised logs.** The DIAL output channel never contains access / refresh tokens, the authorization code, the PKCE verifier, the `state`, the client secret, or the API key. It records only opaque identifiers (`sub`, `azp`, `client_id`, `tool_call_id`), JWT claim metadata (`aud`, `scope`, `exp`, roles), and message character counts. SSE upstream errors are reduced to `message` / `code` / `type` so error payloads cannot echo request bodies into logs.
- **Process safety.** Browser detection in `oauthBrowserProcess.ts` uses `execFileSync` (no shell).

### Quality & dependencies

- **Single runtime dependency: `axios ^1.16.1`** (latest at release time; covers 15 high-severity CVEs that affected the previous line).
- **`npm audit` reports 0 vulnerabilities** thanks to explicit `overrides` for transitive dev packages (`diff`, `serialize-javascript`, `brace-expansion`, `flatted`, `fast-uri`, `follow-redirects`, `picomatch`).
- **22 unit tests** covering JWT expiry logic and the deployment / chat-request builder pipeline (partial feature-flag payloads, garbage flag types, retry helpers, request serialization).
- **Strict TypeScript** (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`) plus ESLint rules that ban `any`, non-null assertions, and parameter reassignment.

### Build & packaging

- **Production bundle** via `webpack --mode production --no-devtool`: minified, no sourcemaps, no debug info shipped.
- **VSIX includes only what end users need:** `README.md`, `CHANGELOG.md`, `LICENSE`, `NOTICE`, `package.json`, `dial-logo.png`, `dist/extension.js`. Source code, sourcemaps, configs, governance files (`ARCHITECTURE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`), `.git`, and `.gitattributes` are excluded.
- **Cross-platform line endings.** `.gitattributes` normalises all text files to LF and marks binary asset extensions as binary, so Windows / macOS / Linux checkouts stay consistent.

### Legal

- **License: Apache-2.0** (`LICENSE`).
- **Trademark attribution** for **AI DIAL / AI DIAL Core** (intellectual property of EPAM Systems, Inc.) lives in `NOTICE` and the README. This extension is an independent integration and is not affiliated with, sponsored by, or endorsed by EPAM Systems, Inc.
- `CODE_OF_CONDUCT.md` and `SECURITY.md` define community and vulnerability-reporting policies (kept in the repo, not shipped in the VSIX).
