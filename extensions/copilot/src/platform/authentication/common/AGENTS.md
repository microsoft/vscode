# Authentication Service Usage Guide

## Overview

`IAuthenticationService` manages GitHub and Copilot authentication. It provides GitHub sessions (OAuth tokens) and Copilot tokens (CAPI tokens).

## Choosing a Session Kind

`getGitHubSession` requires a `kind` parameter. Choose thoughtfully:

- **`'any'`** — Accepts whatever GitHub session is available, even one with minimal scopes (e.g., just `user:email`). Use this when you only need basic access and don't require repo or write permissions.
- **`'permissive'`** — Requires a session with broader scopes (`read:user`, `user:email`, `repo`, `workflow`). Use when you need private repo access or write permissions.

## The Three Overloads of `getGitHubSession`

### 1. Interactive — prompt user to sign in

Returns `AuthenticationSession` (never `undefined`). Throws if the user cancels.

Requires `createIfNone` with a `StrictAuthenticationPresentationOptions` containing a **localized `detail` string** explaining why auth is needed:

```ts
const session = await authService.getGitHubSession('any', {
  createIfNone: { detail: l10n.t('Sign in to GitHub to use feature X.') }
});
```

### 2. Interactive — force a new session

Same as above but forces re-authentication even if a session exists. Use when the current token has lost authorization:

```ts
const session = await authService.getGitHubSession('any', {
  forceNewSession: { detail: l10n.t('Sign in again to restore access.') }
});
```

### 3. Silent — no user prompt

Returns `AuthenticationSession | undefined`. Never shows UI. Use when auth is optional:

```ts
const session = await authService.getGitHubSession('any', { silent: true });
if (!session) {
  // No session available, handle gracefully
}
```

## Important Constraints

- **`createIfNone` and `forceNewSession` do NOT accept `boolean`**. You must pass a `StrictAuthenticationPresentationOptions` with a required `detail` string.  Passing `true`, `false`, or `{}` will not compile.
- **The `detail` string must be localized** using `l10n.t('...')`.
- The silent overload's options type is `Omit<AuthenticationGetSessionOptions, 'createIfNone' | 'forceNewSession'>` — you cannot sneak a boolean `createIfNone` through it.

## Synchronous Cache Properties

For non-blocking checks (no network, no UI), use the cached properties:

- `authService.anyGitHubSession` — cached `'any'` session or `undefined`
- `authService.permissiveGitHubSession` — cached `'permissive'` session or `undefined`
- `authService.copilotToken` — cached Copilot token (without the raw token string) or `undefined`

React to `onDidAuthenticationChange` for identity changes (sign in/out, account switch).
React to `onDidCopilotTokenChange` for token-level updates (quota, feature flags, routine ~20-minute refreshes).

## GitHub Session Provenance

Both built-in GitHub providers supply the proposed
`AuthenticationSession.authorizationServer` URI:
`https://github.com/login/oauth` for public GitHub, and
`<deployment>/login/oauth` for GitHub Enterprise, including restored sessions.
The generic API field is optional, but these built-in sessions require it.
Missing provenance is an incompatible session, not permission to infer a host.
The extension manifest enables `authIssuers`. A branded product that overrides
Copilot's proposal allowlist must append it to the complete existing list;
an `authIssuers`-only override would disable the other required proposals.
Use `resolveGitHubSessionUri` to validate and derive the deployment base; never
parse an account's display label or infer its host from its ID. The selected
provider still determines public versus enterprise routing: a public session
having an issuer does not make it enterprise. Callers requesting a specific-account
scope upgrade must pass that account and issuer explicitly. The authentication
service does not infer those hints from its cache.
Only the authentication provider owns enterprise host configuration. Copilot
neither reads nor watches those settings: even a disagreeing setting cannot
retarget a returned credential. There is no configured-host cross-check, legacy
fallback, or inferred-session map. An unresolved enterprise session must not use
GitHub.com as a fallback. Preserve the issuer's deployment path when removing
`/login/oauth`, then pass it to the CAPI library's existing domain mapping without
rewriting API paths or ports. MCP retains its existing
`copilot-api.<authority>/mcp/` mapping.
Public MCP uses its fixed endpoint, including for static-token sessions without
issuer metadata; enterprise MCP requires the session's issuer.

The authentication service owns GitHub sessions and publishes their derived enterprise
URI to the token store. A separate URI-change event lets the domain service update
routing without reading provider settings or depending on the authentication service.
The store does not retain GitHub sessions. Token bootstrap checks that its session
matches the published URI before making requests.
Token responses and explicit debug overrides remain authoritative for the final
Copilot API URL. Enterprise MCP definitions include the issuer and reject stale
definitions before and after acquiring permissions, without adding account-rebinding policy.

## Copilot Tokens

Most callers just need a valid CAPI token. `getCopilotToken()` handles refresh automatically:

```ts
const token = await authService.getCopilotToken();
```

## Minimal Mode

When `authService.isMinimalMode` is `true`, the service will not fetch permissive tokens:
- Interactive `'permissive'` calls throw `MinimalModeError`
- Silent `'permissive'` calls return `undefined`

## Auth State Flows

There are three states a user can be in:

1. **Not signed in** — No `'any'` session exists. The user has no GitHub session at all. An interactive `createIfNone` call will show VS Code's built-in sign-in dialog.

2. **Signed in from VS Code** — The user explicitly signed in through VS Code (e.g., via Accounts menu or a `createIfNone` prompt). In this case, VS Code automatically acquires the permissive token since it requests the broader scopes upfront. Both `'any'` and `'permissive'` sessions are available.

3. **Signed in passively** (e.g., via Settings Sync) — The user is signed into GitHub through a passive mechanism that only grants minimal scopes. Copilot Chat works with the `'any'` token, but no `'permissive'` token is available. A `'permissive'` call with `createIfNone` will prompt the user to grant additional permissions.
