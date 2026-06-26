# DIAL Chat Model Provider — Architecture

## Overview

VS Code extension that registers a `LanguageModelChatProvider` (`vendor: dial`) and proxies Copilot chat requests to DIAL Core chat-completions API.

```
VS Code Chat (Copilot)
        │
        ▼
  extension.ts                     ← sync activate; provider + commands
        │
        ├── CredentialStore        ← orchestrates auth, emits onDidChange
        │       └── DialAuth       ← OIDC discovery, DCR, login, refresh
        │              (oidcPkce, keycloakClientRegistration,
        │               oauthBrowserLogin, oauthLocalServer,
        │               oidcClientSettings)
        │
        ├── DialModelService       ← deployments cache, streamChat
        │       └── DialClient     ← HTTP + SSE streaming
        │              (chatRequestBuilder, deploymentMetadata,
        │               messageConversion, httpError, runtimeGuards)
        │
        └── DialSecrets            ← single OS-keychain facade
                │
                ▼
         DIAL Core API
```

## Modules

### Core flow

| File                    | Role                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `extension.ts`          | Entry point. Builds reactive chain, registers `vscode.lm.registerLanguageModelChatProvider`. Model list must return synchronously.                                                                                                                                                   |
| `config.ts`             | Reads VS Code settings into immutable `DialConfig`; validates `dial.serverUrl` (HTTPS or loopback HTTP only).                                                                                                                                                                        |
| `credentialStore.ts`    | Resolves API-key / OIDC credentials, attempts silent restore from `SecretStorage`, emits `onDidChange`, validates JWT freshness via `jwtUtils`.                                                                                                                                      |
| `dialModelService.ts`   | On credential change → fetch deployments, refresh every 5 min. `streamChat()` builds request and delegates to `DialClient`.                                                                                                                                                          |
| `dialClient.ts`         | Axios client, deployments API, streaming chat completions, `tokenizeText()` (`POST /v1/deployments/{id}/tokenize`), error extraction, bidirectional retry between `max_tokens` ↔ `max_completion_tokens`, temperature drop.                                                          |
| `chatRequestBuilder.ts` | Applies deployment feature flags and DIAL defaults; provides retry helpers (`forceMaxTokens`, `forceMaxCompletionTokens`, `dropTemperature`, …) and context-window recovery (`isContextLengthExceededError`, `parseContextLengthError`, `clampOutputTokenLimit`).                    |
| `messageConversion.ts`  | Converts VS Code messages/tools to DIAL payload; text, tool calls/results, and inline images (`custom_content.attachments` with base64 `data`); `flattenRequestMessageText()` for token counting.                                                                                    |
| `tokenization.ts`       | `vscode`-free tokenize helpers: tokenize request body, `outputs[]` parsing, and endpoint error classification.                                                                                                                           |
| `deploymentMetadata.ts` | Normalizes `/openai/deployments` into `DialDeployment` (features, limits, `input_attachment_types`). Derives `maxInputTokens` as `maxTotalTokens − maxOutput − safetyMargin` (prompt budget; explicit `maxPromptTokens` wins, no margin). Silently drops invalid feature flag types. |

### Auth & secrets

| File                            | Role                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `dialAuth.ts`                   | OIDC discovery, login flow, token exchange and refresh; handles stale-client recovery.                           |
| `dialSecrets.ts`                | Single facade over `vscode.SecretStorage`; the only module that touches `context.secrets` directly.              |
| `oidcClientSettings.ts`         | Persistence of OIDC `client_id` (settings) and `client_secret` (keychain via `DialSecrets`); managed-flag.       |
| `oidcPkce.ts`                   | PKCE `code_verifier` / `code_challenge` (S256) plus `state` generation.                                          |
| `oauthBrowserLogin.ts`          | High-level browser sign-in orchestration (start loopback server, open browser, await callback).                  |
| `oauthBrowserProcess.ts`        | Detects/launches Chrome / Edge / system browser per `dial.oauthBrowserProfile` (uses `execFileSync` — no shell). |
| `oauthLocalServer.ts`           | Loopback HTTP listener on `dial.oauthCallbackPort`; validates `state`, extracts `code`.                          |
| `keycloakClientRegistration.ts` | Anonymous & authenticated Dynamic Client Registration against Keycloak.                                          |

### Support

| File                        | Role                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `attachmentCapabilities.ts` | Maps `input_attachment_types` to Copilot `imageInput`; MIME allow-list for outbound attachments.                   |
| `types.ts`                  | Shared TypeScript types. Feature flags use snake_case matching DIAL listing JSON.                                  |
| `runtimeGuards.ts`          | JSON shape validators (`isRecord`, `readNumber`, `readBoolean`, …) — every untrusted payload passes through these. |
| `jwtUtils.ts`               | JWT claim parsing, opaque summary for logs, expiry check.                                                          |
| `httpError.ts`              | Uniform formatting of axios / fetch errors into log-safe strings; reads streaming error bodies.                    |
| `logger.ts`                 | Output channel `DIAL` (`vscode.LogOutputChannel`).                                                                 |
| `logSanitize.ts`            | Redacts secrets/tokens from log payloads before they reach the output channel.                                     |

## Request flow

1. Copilot calls `provideLanguageModelChatInformation` → cached deployments from `DialModelService.models`.
2. User sends a message → `provideLanguageModelChatResponse`.
3. `streamChat` converts messages/tools (inline images → `custom_content.attachments` with base64 `data`), builds `DialChatRequest`.
4. `DialClient.streamChatCompletion` applies deployment constraints, POSTs to `/openai/deployments/{name}/chat/completions?stream=true`.
5. SSE chunks mapped to `LanguageModelTextPart` / `LanguageModelToolCallPart` on the progress callback.

Separately, Copilot calls `provideTokenCount(model, string | message)` → `DialModelService.countTokens` flattens the input to text, serves it from a SHA-1 content cache, and on a miss calls `DialClient.tokenize` (`POST /v1/deployments/{id}/tokenize`) with exponential backoff on transient failures (`dial.httpRetry*`). Concurrent identical inputs share one in-flight request. A missing route / 404 marks the deployment tokenize-unavailable for the session. Together with the `maxInputTokens` budget derived in `deploymentMetadata.ts`, this lets the IDE decide when to compact the conversation.

## Deployment feature flags

From listing `features` (snake_case):

- `tools_supported !== false` → tool calling enabled (default true)
- `input_attachment_types` (deployment root) — if any entry is `image/*`, Copilot gets `capabilities.imageInput`; MIME list also gates what we send in `custom_content.attachments`
- `url_attachments_supported` / `folder_attachments_supported` → legacy `imageInput` when no MIME list (allows VS Code image MIME set)
- `max_completion_tokens_supported` → send `max_completion_tokens`
- `max_tokens_supported` → send `max_tokens`
- `custom_temperature_supported === false` → omit `temperature`

When a flag is missing from listing, DIAL Core defaults apply (`max_tokens_supported: true`, `max_completion_tokens_supported: false`, `custom_temperature_supported: true`). Non-boolean values (`"true"`, `null`, numbers) are treated as missing — the normalizer in `deploymentMetadata.ts` only accepts `string | boolean` and `readFeatureFlag` only trusts `boolean`. Either way, the request goes through with safe defaults.

### Streaming retry state machine (`adjustRequestForUpstreamError`)

When the upstream rejects a parameter on `POST /chat/completions`, the client converges to a working request through a small state machine. Up to 4 attempts per call; each direction of the limit-field swap and each parameter drop fires at most once, so the loop cannot oscillate.

| Upstream complaint                      | Action                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `max_tokens … not supported`            | If `max_completion_tokens` already tried → drop both. Else swap to `max_completion_tokens`.                                                                            |
| `max_completion_tokens … not supported` | If `max_tokens` already tried → drop both. Else swap to `max_tokens`.                                                                                                  |
| `temperature … not supported`           | Drop `temperature` (one-shot).                                                                                                                                         |
| `maximum context length is N …`         | Clamp the output limit to `N − inputTokens − slack` so prompt + output fit (one-shot). If the prompt alone leaves < 256 tokens, surface the error so the IDE compacts. |
| anything else                           | Stop retrying, surface the error to the caller.                                                                                                                        |

`max_tokens.*not supported` is matched with a negative-lookbehind for `completion_` so an error mentioning the **other** field cannot accidentally trigger the wrong swap.

## Auth & secrets

All secrets live in `vscode.SecretStorage`, which is backed by the OS keychain
(Windows Credential Manager / macOS Keychain / libsecret). Public identifiers
stay in workspace settings. Non-secret session state (token expiry timestamp)
lives in `globalState`.

| Data                                                                        | Storage                                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Access / refresh tokens                                                     | `SecretStorage` (`dial.accessToken`, `dial.refreshToken`)                                       |
| Token expiry timestamp (number)                                             | `globalState` (`dial.tokenExpiry`)                                                              |
| API key                                                                     | `SecretStorage` (`dial.apiKey`) — set via prompt or `DIAL: Set API Key`                         |
| OIDC client secret (DCR confidential clients, admin-issued confidential ID) | `SecretStorage` (`dial.oidcClientSecret`) — set via DCR or `DIAL: Set OIDC Client Secret`       |
| OIDC initial access token (authenticated DCR)                               | `SecretStorage` (`dial.oidcInitialAccessToken`) — set via `DIAL: Set OIDC Initial Access Token` |
| OIDC `client_id` (after DCR or admin-issued)                                | Workspace settings (`dial.oidcClientId`, public)                                                |
| Server URL, scopes, callback port, browser profile                          | Workspace settings (public)                                                                     |

`DialSecrets` is the single facade used by `dialAuth.ts` and `oidcClientSettings.ts` for keychain reads/writes; nothing else touches `context.secrets` directly.

### OIDC / PKCE

- **Authorization Code flow + PKCE** (RFC 7636) — `code_verifier` = 32 random bytes (base64url), `code_challenge_method=S256`.
- **CSRF `state`** = 16 random bytes (base64url), verified in the loopback callback.
- **System browser**, no embedded webview (RFC 8252).
- **Loopback redirect** `http://127.0.0.1:PORT/oauth-callback` (port configurable; must be registered in the OIDC client because DCR pins `redirect_uris`).
- Public client (`token_endpoint_auth_method: 'none'`) by default; client secret is supplied only when present in `SecretStorage`.
- **Refresh token rotation** is honored; `invalid_grant`/401/`session not active`/`refresh token expired` wipe all session secrets.
- **HTTPS** is enforced for `dial.serverUrl`: a non-loopback `http://` URL triggers a warning at activation.
- We **never log** access tokens, refresh tokens, the auth code, the code verifier, the state, the client secret, or the API key. Logs contain only opaque identifiers (`sub`, `azp`, `client_id`, `tool_call_id`), claim metadata (`aud`, `scope`, `exp`, roles), and message character counts.

## Development

Toolchain, npm scripts, packaging, and release procedure live in `CONTRIBUTING.md`. Logs go to the **DIAL** output channel (`View → Output → DIAL`).
