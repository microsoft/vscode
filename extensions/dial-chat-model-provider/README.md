# DIAL Chat Model Provider

> **Bundled in this fork.** This extension ships with [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode) under `extensions/dial-chat-model-provider/`. Upstream extension repository: [sergey-zinchenko/DialChatModelProvider](https://github.com/sergey-zinchenko/DialChatModelProvider). Fork customizations: [FORK.md](../../FORK.md).

VS Code extension that registers a [Language Model Chat Provider](https://code.visualstudio.com/api/extension-guides/language-model) for [DIAL Core](https://github.com/epam/ai-dial-core). Once installed and signed in, DIAL deployments appear in the Copilot model picker and other clients of `vscode.lm.*`.

## Quickstart

### Pick an auth mode first

The extension has one switch — **`dial.authMethod`** — with two values:

| `dial.authMethod`      | What `DIAL: Login` does                                                                                                                      | Use when                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **`openid`** (default) | Discovers Keycloak, opens your browser to sign in (Authorization Code + PKCE). Registers a fresh client automatically if you don't have one. | You're a normal user. Scenarios **B**, **C**, **D** below.                                   |
| `apikey`               | Skips the browser entirely. Just sends your API key in the request header.                                                                   | Your admin issued you a long-lived API key instead of an OIDC account. Scenario **A** below. |

If you don't touch `dial.authMethod`, you stay in OIDC mode — `DIAL: Login` will go through the browser, not ask for an API key.

All commands below are invoked from the Command Palette: `Ctrl+Shift+P` (Windows / Linux) or `Cmd+Shift+P` (macOS), then start typing `DIAL:`.

### A. I have a DIAL URL and an API key

1. **`DIAL: Open Settings`**, set:
    - `dial.serverUrl` = `https://dial.example.com`
    - `dial.authMethod` = **`apikey`** _(this is the one scenario where you flip the switch)_
2. **`DIAL: Set API Key`** — paste your key (stored in the OS keychain).
3. **`DIAL: Login`** — picks up the key and fetches available models.

> If you skip step 2, `DIAL: Login` will prompt for the key and store it for you.

### B. I only have a DIAL URL — let the extension register a client

The easiest OIDC path. Works when your Keycloak realm allows anonymous Dynamic Client Registration (most setups).

1. **`DIAL: Open Settings`**, set `dial.serverUrl` = `https://dial.example.com`. Leave `dial.authMethod` at its default (`openid`) — **do not** switch it to `apikey`, that disables the browser flow.
2. **`DIAL: Login`** — the extension fetches `/.well-known/openid-configuration`, registers a public OIDC client (PKCE, no secret), opens your browser to sign in, stores tokens in the OS keychain, and writes the freshly registered `client_id` back to settings.

That's it. If it works once, it keeps working — the refresh token rolls the session.

### C. I have a DIAL URL and a `client_id` (public client)

Your admin pre-registered a **public** OIDC client (PKCE, no secret) and gave you the `client_id`. `dial.authMethod` stays at the default `openid`.

1. **`DIAL: Open Settings`**, set:
    - `dial.serverUrl` = `https://dial.example.com`
    - `dial.oidcClientId` = `<the client_id from your admin>`
2. **`DIAL: Login`** — discovery + browser sign-in + token exchange.

Make sure your admin allowed `http://127.0.0.1:47821/oauth-callback` as a redirect URI on that client. If they pinned a different port, set `dial.oauthCallbackPort` to match.

### D. I have a DIAL URL, a `client_id` and a `client_secret` (confidential client)

Same as C but with a secret. `dial.authMethod` stays at `openid`. The secret never goes into `settings.json` — only the OS keychain.

1. **`DIAL: Open Settings`**, set:
    - `dial.serverUrl` = `https://dial.example.com`
    - `dial.oidcClientId` = `<client_id>`
2. **`DIAL: Set OIDC Client Secret`** — paste the secret.
3. **`DIAL: Login`**.

### Need authenticated registration?

If your Keycloak realm disallows anonymous DCR and your admin issued you a one-time **initial access token**: keep `dial.authMethod = openid`, run **`DIAL: Set OIDC Initial Access Token`**, paste the token, then **`DIAL: Login`**. The token is consumed once during registration and discarded.

### Something went wrong?

- **`DIAL: Login` opens an API-key prompt when you expected a browser** → you're in `apikey` mode. Open Settings and set `dial.authMethod` back to `openid`.
- **"Client not found" / "invalid_client"** after a realm reset, port change, or admin tweak → **`DIAL: Clear OAuth Client`**, then **`DIAL: Login`** again. It drops the auto-registered client and registers a fresh one.
- **"OIDC discovery failed"** → check `dial.serverUrl` (correct host, HTTPS, reachable from your network).
- **Models don't appear** → open **View → Output → DIAL** and look at the last few log lines. Logs never contain tokens, only diagnostic claim metadata.

## What it does

- **OIDC sign-in with PKCE** (RFC 7636 + RFC 8252): system browser, loopback callback `http://127.0.0.1:PORT/oauth-callback`, no embedded webview.
- **Dynamic Client Registration** against Keycloak (anonymous or with initial access token). The client is created on first login and remembered.
- **Long-lived sessions**: `offline_access` scope → refresh token; tokens auto-rotate before expiry. Transient upstream errors (HTTP 5xx / network) don't drop the session.
- **API-Key auth** as an alternative to OIDC.
- **All secrets in the OS keychain** (`vscode.SecretStorage` → Windows Credential Manager / macOS Keychain / libsecret). Nothing sensitive ever lands in `settings.json`.
- **Model discovery** via `GET /openai/models` (models only; legacy fallback `/openai/deployments`), optional filter by DIAL Admin Topics (`dial.requiredTopics`), client-side split into chat and embedding; refreshed every 5 minutes.
- **Streaming chat completions** with tool calling, `CancellationToken` → `AbortSignal` wired end-to-end, UTF-8-safe SSE decoder.
- **Accurate token budgeting** — token counts come from the DIAL tokenize endpoint (`/v1/deployments/{id}/tokenize`), cached by content hash; transient failures retry with configurable exponential backoff (`dial.httpRetry*`). The input budget reported to the IDE reserves the output cap out of the model's context window so the conversation is compacted before it overflows.

## Settings

Only non-sensitive values. Secrets are entered via commands and stored in the OS keychain (see [Commands](#commands)).

| Setting                    | Type   | Default                                  | Description                                                       |
| -------------------------- | ------ | ---------------------------------------- | ----------------------------------------------------------------- |
| `dial.serverUrl`           | string | _empty_                                  | Base DIAL URL (e.g. `https://dial.example.com`). HTTPS required.  |
| `dial.authMethod`          | enum   | `openid`                                 | `openid` (OIDC + PKCE) or `apikey`.                               |
| `dial.oidcClientId`        | string | _empty_                                  | Public OIDC client ID. Filled automatically by DCR if left empty. |
| `dial.oidcScopes`          | string | `openid profile offline_access dial-api` | Space-separated OIDC scopes. Must include `openid`.               |
| `dial.oauthCallbackPort`   | number | `47821`                                  | Loopback port for the OAuth redirect URI.                         |
| `dial.oauthBrowserProfile` | enum   | `auto`                                   | `auto` / `system` / `persistent` — which browser profile to use.  |
| `dial.requiredTopics`      | string[] | _empty_                                | Show only models whose DIAL Topics include at least one tag (OR match). Maps to API field `description_keywords`. |

## Commands

All commands are accessible from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) by typing `DIAL:`.

### Sign-in / session

| Command                    | What it does                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `DIAL: Login`              | Runs OIDC sign-in (PKCE) or prompts for an API key, depending on `dial.authMethod`. Stores tokens in the OS keychain.               |
| `DIAL: Logout`             | Clears access token, refresh token, and any stored API key.                                                                         |
| `DIAL: Clear OAuth Client` | Deletes the auto-registered OIDC client from settings (use this if Keycloak reports "Client not found" or you want to start fresh). |
| `DIAL: Open Settings`      | Opens the `dial.*` section of VS Code Settings.                                                                                     |

### Setting secrets (all go straight to the OS keychain — never to `settings.json`)

| Command                               | When to use                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DIAL: Set API Key`                   | Storing an API key ahead of time when `dial.authMethod = apikey`. (Otherwise `DIAL: Login` will prompt for it.)       |
| `DIAL: Set OIDC Client Secret`        | An admin gave you a **confidential** client (`client_id` + `client_secret`). Set the secret here, the id in settings. |
| `DIAL: Set OIDC Initial Access Token` | Your Keycloak realm requires authenticated DCR — paste the one-time token issued by an admin.                         |

## How authentication works

You configure a single value — `dial.serverUrl`. Everything else (where to sign in, which client to use, how to refresh tokens) is discovered at runtime. This section describes that discovery so you know what to expect and what your Keycloak admin has to allow.

### 1. OIDC discovery

On every login (and the first call after settings change) the extension does:

```
GET {dial.serverUrl}/.well-known/openid-configuration
```

This must return the standard OpenID Connect discovery document. DIAL Core proxies the upstream IdP, so the URL you put in `dial.serverUrl` is enough — you don't configure the Keycloak realm URL separately.

From the discovery document the extension reads:

| Field                           | Used for                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `issuer`                        | Sanity check; logged.                                                                    |
| `authorization_endpoint`        | The URL opened in your browser for sign-in (with PKCE challenge and CSRF `state`).       |
| `token_endpoint`                | Exchanging the authorization code for tokens, and later refreshing them.                 |
| `registration_endpoint`         | Dynamic Client Registration (see below). If missing, auto-registration is not available. |
| `scopes_supported` _(optional)_ | If present, the extension logs a warning when requested scopes are not advertised.       |

If discovery fails (wrong `dial.serverUrl`, CORS-style proxy mistake, TLS error), login aborts with a clear error in the output channel.

### 2. Dynamic Client Registration (DCR) — what happens on first login

When `dial.oidcClientId` is empty, the extension registers a fresh OIDC client automatically:

1. **Pick an endpoint.** Keycloak exposes two registration endpoints:
    - the OIDC-spec `registration_endpoint` from discovery — works without admin credentials when **Client Registration Policies → Anonymous request** allows it;
    - Keycloak's `…/clients-registrations/default` — used only when an initial access token is configured (via `DIAL: Set OIDC Initial Access Token`).

    The extension prefers the default endpoint when a token is present, otherwise the openid-connect one.

2. **POST a client representation** with:
    - `redirect_uris: ["http://127.0.0.1:47821/oauth-callback"]` (the loopback URI; the port is whatever `dial.oauthCallbackPort` is set to);
    - `response_types: ["code"]`, `grant_types: ["authorization_code", "refresh_token"]`;
    - `token_endpoint_auth_method: "none"` — the client is **public** (no secret); PKCE alone protects the code exchange (RFC 8252 §8.5);
    - `scope` / `default_client_scopes` listing the scopes from `dial.oidcScopes` minus `openid` (Keycloak auto-assigns `openid` to clients).

3. **Read the response.** What we keep:
    - `client_id` → saved to `dial.oidcClientId` (public identifier).
    - `client_secret` if present → saved to the OS keychain. (For `token_endpoint_auth_method: "none"` Keycloak normally doesn't issue one.)
    - `registration_access_token` if present → used immediately to PUT the client and assign the requested default client scopes, then discarded.

4. **Mark the client as extension-managed.** This lets `DIAL: Clear OAuth Client` know it can delete it; clients you entered by hand are left alone.

If DCR fails (no `registration_endpoint`, policy denies the request, scope not on the whitelist), the extension logs a precise error pointing at the relevant Keycloak admin screen.

### 3. Sign-in (Authorization Code + PKCE)

With the `client_id` in hand:

1. Build the authorization URL using `authorization_endpoint`, the client id, scopes, `code_challenge` (S256), and a random `state`.
2. Open it in your system browser; spin up a one-shot HTTP server on `127.0.0.1:{dial.oauthCallbackPort}` to receive the redirect.
3. After you sign in Keycloak redirects to `http://127.0.0.1:PORT/oauth-callback?code=…&state=…`. The local server verifies `state` (CSRF) and immediately exits.
4. POST `token_endpoint` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`, and `client_secret` if you have a confidential client.
5. Save `access_token` and `refresh_token` to the OS keychain, save token expiry to `globalState`.

### 4. Refresh

Before every API call the extension checks whether the access token is within ~30–60 seconds of expiry. If so it POSTs `token_endpoint` with `grant_type=refresh_token`. Refresh-token rotation is honored: whatever Keycloak returns replaces the previous one. If Keycloak rejects the refresh (`invalid_grant`, `session not active`, HTTP 401), the entire session is wiped and you'll be asked to run `DIAL: Login` again.

### What your Keycloak admin needs to enable

If you're setting up DIAL/Keycloak for a team, this is the minimum checklist:

- **Discovery document** must be reachable at `{dial.serverUrl}/.well-known/openid-configuration` (DIAL Core handles this when its upstream `auth.issuer` is configured).
- **Client Registration Policies → Anonymous request** (or **Authenticated request** if you'll hand out initial access tokens):
    - Allowed `redirect_uris` pattern must include `http://127.0.0.1:*/oauth-callback` (or your team's pinned `dial.oauthCallbackPort`).
    - Allowed Client Scopes must include `dial-api`, `offline_access`, and `profile` (`openid` is implicit).
- The DIAL API audience (`dial-api`) must be mapped into access-token claims so DIAL Core can authorize calls.

If anonymous DCR isn't acceptable, hand each user an initial access token instead and they'll use `DIAL: Set OIDC Initial Access Token`.

### 5. Deployment discovery

Once authenticated the extension loads **models only** from DIAL Core, then filters and splits them on the client:

1. **`GET {dial.serverUrl}/openai/models`** — primary listing (models only; legacy fallback: `/openai/deployments`).
2. **Topic filter** — when `dial.requiredTopics` is set, keep models whose DIAL Admin **Topics** (`description_keywords` in the listing API) include at least one configured tag.
3. **Kind split** — chat vs embedding is inferred from `capabilities.chat_completion` / `capabilities.embeddings` (fallback: `type` field).

Chat models appear in the Copilot model picker; embedding models are registered separately for Copilot `@workspace` / semantic search via `chat.embeddingModel`. Lists are cached and refreshed every 5 minutes (or immediately on `DIAL: Login`). Per-deployment metadata decides what Copilot may send and what the extension forwards:

- **Tools and token limits** — `tools_supported`, `max_tokens_supported`, `max_completion_tokens_supported`, `custom_temperature_supported` (GPT-5 / o-series use `max_completion_tokens`; models with `custom_temperature_supported: false` omit `temperature`). When `tools_supported` is explicitly `false`, tools are not forwarded.
- **Reasoning effort** — `features.reasoning_efforts` (string array from DIAL Core) drives the Thinking Effort picker and `reasoning_effort` on chat requests.
- **Image attachments in Copilot chat** — when a deployment lists `input_attachment_types` with any `image/*` MIME (see [DIAL models config](https://github.com/epam/ai-dial-core/blob/development/docs/dynamic-settings/models.md)), the model appears as vision-capable in the picker. Dropped images are sent to DIAL as `custom_content.attachments` with base64 `data` (same shape as DIAL Chat). Models that only allow non-image types (for example `audio/*`) do not advertise image input.

### 6. Copilot BYOK (full DIAL routing)

This extension marks chat models as **BYOK** (`isBYOK: true`) so Copilot can use them without a GitHub Copilot subscription when running a VS Code build with the **`embeddings`** and **`chatProvider`** proposed APIs (for example [feat/forward-reasoning](https://github.com/sergey-zinchenko/vscode/tree/feat/forward-reasoning)).

| VS Code setting | Value format | Purpose |
| --- | --- | --- |
| `chat.embeddingModel` | `dial.{embeddingDeploymentId}` | Codebase indexing / semantic search |
| `chat.utilityModel` | `dial/{chatDeploymentId}` | Titles, summaries, background tasks |
| `chat.utilitySmallModel` | `dial/{chatDeploymentId}` | Commit messages, intent detection |
| `chat.tools.riskAssessment.model` | `dial/{chatDeploymentId}` | Tool risk assessment |

Run **`DIAL: Apply Copilot Model Defaults`** to set these workspace settings automatically from the first loaded chat and embedding deployments.

## Logs

Open **View → Output → DIAL**. Logs are local to your machine — nothing is sent anywhere. They never contain access tokens, refresh tokens, authorization codes, PKCE verifiers, client secrets, or API keys: only JWT claim metadata (`sub`, `aud`, `scope`, `exp`, roles), public identifiers, and message character counts.

## Requirements

- VS Code 1.110 or newer.
- A reachable DIAL Core instance over HTTPS (HTTP is allowed only for loopback hosts).

## Trademarks and attribution

This extension is an HTTP client for [AI DIAL Core](https://github.com/epam/ai-dial-core), an open-source agentic AI orchestration platform developed and maintained by [EPAM Systems, Inc.](https://www.epam.com/) and distributed under the Apache License 2.0.

**"DIAL", "AI DIAL", "AI DIAL Core", and the DIAL logo** (file `dial-logo.png` shipped with this extension) are trademarks of EPAM Systems, Inc. They are used here solely for identification — to indicate compatibility of this extension with the upstream platform.

This extension is an **independent project**. It is not an official EPAM product, and it is not affiliated with, sponsored by, or endorsed by EPAM Systems, Inc. The Apache License 2.0 explicitly does not grant trademark rights (see Section 6 of the License); all references to the DIAL name and logo remain the property of their respective owner.

For full attribution and third-party notices see [`NOTICE`](./NOTICE) bundled with this extension.

## License

This extension is distributed under the [Apache License 2.0](./LICENSE). See [`NOTICE`](./NOTICE) for third-party attributions and trademark information.
