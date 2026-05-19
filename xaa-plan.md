# Plan: Cross App Access (XAA) / Enterprise-Managed Auth for MCP Servers

Tracking issue: [microsoft/vscode#316625](https://github.com/microsoft/vscode/issues/316625)

## Background

[xaa.dev](https://xaa.dev) demonstrates the OAuth **Identity Assertion Authorization Grant (ID-JAG)** spec: a user signs into an SSO IdP once, the IdP mints a signed assertion saying "user U authorizes app A to act at resource B", and the resource exchanges that assertion for an access token. No per-resource browser flow, no per-resource consent.

For VS Code MCP, this means: configure one issuer, sign in once, get silent token exchange for every MCP server the org has approved. Admins govern app-to-app trust at the IdP instead of every server reprompting.

## User-facing model

- **Per-server opt-in** via a new `oauth.enterpriseManaged: true` field on MCP HTTP server config. *(Preview)*
- **One org-level VS Code setting** `mcp.enterpriseManagedAuth.issuer` (application scope, preview-tagged) — the SSO authorization server URL.
- **First-run UX**:
  1. If issuer is unset → quick-pick prompts for the URL, writes to user settings.
  2. If no live IdP session → Auth Code + PKCE against the issuer. One browser trip ever.
  3. Silent token exchange → ID-JAG → resource access token → MCP server connects.
- **Nth-run UX**: completely silent for every subsequent enterprise-managed server.

## Design highlights

- **No new branch in `_addAuthHeader`.** Enterprise-managed reuses the existing metadata-discovery path. Ext-host plumbs a single `enterpriseManaged` boolean through `IMcpAuthenticationDetails`; all XAA-specific routing lives on the main thread inside `$getTokenFromServerMetadata`.
- **No new `IAuthenticationProvider` method.** Extend `AuthenticationProviderSessionOptions` with `audience?: string`. Non-XAA providers ignore it; XAA reads it. This automatically covers `getSessionsFromChallenges` / `createSessionFromChallenges` too (same options bag).
- **One built-in `XaaAuthenticationProvider`** per configured issuer. Reuses `DynamicAuthProvider` internals (DCR + CIMD already wired) for the IdP login leg, performs RFC 8693 token exchange for an ID-JAG, redeems at the resource's token endpoint.
- **Metadata discovery only.** If a server doesn't expose RFC 8414 OAuth metadata, `enterpriseManaged: true` hard-fails with a precise error. No silent fallback to direct OAuth.
- **`McpServerTransportHTTPAuthentication` (the `authentication` block) is deprecated dead code** and is *not* touched. New field lives on `McpServerTransportHTTPOAuth`.

## Scopes — where they go in the three-leg flow

| Leg | Purpose | Scopes |
|---|---|---|
| 1. User signs into IdP | Auth Code + PKCE against issuer | IdP scopes only (typically `openid profile email`). One-time, fixed per issuer. |
| 2. IdP token exchange → ID-JAG | RFC 8693, carries `audience=<resource>` | `scope` is optional per spec; xaa.dev's exact behavior to be captured. |
| 3. Resource redeems ID-JAG → access token | jwt-bearer / assertion grant | **MCP server scopes belong here.** Resolved from existing `resourceMetadata.scopes_supported` chain in `mainThreadMcp.ts:237`. |

From the provider's perspective `createSession(scopes, options)` looks identical to today; the XAA provider internally routes scopes to the redemption leg.

---

## Implementation plan

Ordered so each step is independently reviewable and testable. Steps 1–4 are pure plumbing; step 5 lights it up.

### Step 1 — Config surface (DTO + JSON schema + setting)

Smallest possible diff, no runtime behavior.

**Files**
- `src/vs/workbench/contrib/mcp/common/mcpTypes.ts`
  - Add `readonly enterpriseManaged?: boolean` to `McpServerTransportHTTPOAuth` (~line 546).
  - Mirror in `McpServerLaunch.Serialized` (~line 573) and `fromSerialized` (~line 583).
- `src/vs/workbench/contrib/mcp/common/mcpConfiguration.ts`
  - Add `enterpriseManaged` property inside the `oauth` schema (~line 279). Description prefixed with `"(Preview) "`, references the setting key.
  - Register `mcp.enterpriseManagedAuth.issuer`: `application` scope, `string` + `format: 'uri'`, default `""`, description starts with `"(Preview) "`, `tags: ['preview']`.

**Verification**
- `npm run compile-check-ts-native` clean.
- `mcp.json` IntelliSense shows the new property in `oauth`. Setting appears in Settings UI with a Preview chip.

---

### Step 2 — Plumb the flag through the RPC

Still no behavior change — the field just rides along.

**Files**
- `src/vs/workbench/api/common/extHost.protocol.ts` — `enterpriseManaged?: boolean` on `IMcpAuthenticationDetails` (~line 3589).
- `src/vs/workbench/api/common/extHostMcp.ts` — at the `IMcpAuthenticationDetails` construction site (`McpHTTPHandle`, ~line 704), set `enterpriseManaged: this._launch.oauth?.enterpriseManaged`.

**Verification**
- Type check.
- Existing dynamic-auth path still works against an MCP server that doesn't opt in.

---

### Step 3 — `audience` on `AuthenticationProviderSessionOptions`

Lands the API extension behind a proposed-API flag.

**Files**
- `src/vscode-dts/vscode.proposed.<name>.d.ts` — add `audience?: string` on `AuthenticationProviderSessionOptions` (match existing in-flight auth proposal convention).
- `src/vs/workbench/services/authentication/common/authentication.ts` — mirror on `IAuthenticationProviderSessionOptions`.
- Pass-through in:
  - `mainThreadAuthentication.ts` (`$createSession` / `$getSessions` + challenge siblings)
  - `extHostAuthentication.ts` (same)
  - `mainThreadMcp.ts` `_getSessionForProvider`

**Verification**
- Type check across all layers.
- Existing providers untouched at runtime.

---

### Step 4 — `XaaAuthenticationProvider` scaffold

Ship the provider with `createSession` throwing "not yet implemented". Register lazily on first enterprise-managed request, keyed by issuer URL.

**Files**
- New: `src/vs/workbench/api/common/extHostXaaAuthProvider.ts` (or similar; alongside `DynamicAuthProvider`). Wraps a `DynamicAuthProvider` for the IdP login leg.
- `extHostAuthentication.ts` — add `$registerXaaAuthProvider(issuer, serverMetadata, ...)` analogous to `$registerDynamicAuthProvider`. Persists client registration via existing `IDynamicAuthenticationProviderStorageService`.
- `mainThreadAuthentication.ts` — `IAuthenticationService.createOrGetXaaProvider(issuer)`:
  - Reads/writes client registration via storage service.
  - Resolves CIMD via `serverMetadata.client_id_metadata_document_supported` + `productService.authClientIdMetadataUrl` (mirrors `mainThreadAuthentication.ts:168`).
  - DCR fallback via `fetchDynamicRegistration`.

**Verification**
- IdP login leg works end-to-end against xaa.dev.
- `createSession` for a resource audience throws cleanly with a "not implemented" message we can spot in logs.

---

### Step 5 — Wire `$getTokenFromServerMetadata` to route XAA

This is where it lights up.

**Files**
- `src/vs/workbench/api/browser/mainThreadMcp.ts` — `$getTokenFromServerMetadata` (~line 230):

  ```ts
  if (authDetails.enterpriseManaged) {
    if (!authDetails.resourceMetadata?.resource) {
      throw new Error(/* localized: no OAuth metadata, can't use enterprise-managed */);
    }
    const issuer = await this._ensureXaaIssuer();   // reads setting; quick-pick on first use
    const providerId = await this._authenticationService.createOrGetXaaProvider(issuer);
    return this._getSessionForProvider(
      id,
      server,
      providerId,
      resolvedScopes,
      undefined,
      errorOnUserInteraction,
      undefined,
      authDetails.resourceMetadata.resource,       // audience → flows through new options field
    );
  }
  // existing path unchanged
  ```

- `_ensureXaaIssuer()` reads `mcp.enterpriseManagedAuth.issuer`; on miss, opens `IQuickInputService.input` with HTTPS URL validation and writes via `IConfigurationService.updateValue(..., ConfigurationTarget.USER)`.
- Reuse the existing `resource?: string` slot on `_getSessionForProvider` as the audience hand-off into options.

**Verification (end-to-end against xaa.dev sandbox)**
- First enterprise-managed server → quick-pick → IdP browser sign-in → silent token exchange → MCP server connects.
- Second enterprise-managed server (different audience) → no browser, no quick-pick → connects.
- Sign out of IdP session → both servers stop (existing `McpServerAuthTracker` does this for free).

---

### Step 6 — XAA provider `createSession` implementation

The actual token-exchange logic. Internal to the provider — only this step depends on capturing xaa.dev's exact wire format, so the open question lives here.

- Inside `XaaAuthenticationProvider.createSession(scopes, options)`:
  1. `await this._ensureIdpSession()` — Auth Code + PKCE against issuer (delegated to inner `DynamicAuthProvider`).
  2. POST to issuer token endpoint:
     - `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`
     - `subject_token=<idp access token>`
     - `subject_token_type=urn:ietf:params:oauth:token-type:access_token`
     - `requested_token_type=urn:ietf:params:oauth:token-type:id-jag`
     - `audience=options.audience`
  3. POST returned ID-JAG to the resource's token endpoint (discovered via resource's authorization-server metadata — motivates eventually adding a structured `resourceServer` option in step 3).
  4. Cache resource access token per-audience using `DynamicAuthProvider`'s `TokenStore` shape.
- Refresh: re-do step 2 + 3 silently on near-expiry. If IdP session is dead, re-auth once.
- `onDidChangeSessions` fires for all per-audience sessions when the IdP session is removed.

**Verification**
- HAR capture against xaa.dev for legs 2 + 3, confirm payloads.
- Token refresh path verified by waiting out expiry.
- Sign-out invalidates all derived sessions.

---

### Step 7 — UX polish

- Error mapping: distinguish *resource refused the exchange* (admin hasn't trusted VS Code at this server) vs. *issuer rejected the token exchange* vs. *IdP session expired*.
- "Learn more" link from the quick-pick → docs page (TBD).
- Telemetry event for first-time XAA setup (similar shape to existing `mcp/authSetup`).

---

## Out of scope for v1

- Policy/MDM-managed issuer (follow-up).
- Non-MCP consumers reaching XAA via `getSession` + challenge path. Works today if a caller passes `audience` in options; broader auto-routing is a follow-up.
- Multiple concurrent issuers. Architecture supports keyed providers, but UX assumes one org per install.

---

## Risk register

| Risk | Mitigation |
|---|---|
| ID-JAG draft changes wire format | All wire-format code is in step 6, behind the provider class — swappable. Proposed-API gate means schema can break. |
| MCP server publishes incomplete OAuth metadata | Step 5 hard-fails with a precise error. No silent fallback. |
| User pastes a hostile issuer URL | `application`-scope setting prevents workspace override; HTTPS-only validation; follow-up policy hook for orgs. |
| Resource refuses the assertion | Specific error; doesn't blow away the IdP session, just this server fails. |
