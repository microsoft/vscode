# Auth Rework: Standards-Based Authentication for the Agent Host Protocol

## Problem

The current authentication mechanism is imperative and VS Code-specific:

1. The renderer discovers agents via `listAgents()` and checks `IAgentDescriptor.requiresAuth`.
2. It obtains a GitHub OAuth token from VS Code's built-in authentication service.
3. It pushes the token via `setAuthToken(token)` — a fire-and-forget JSON-RPC notification.
4. The agent host fans the token out to all registered `IAgent` providers.

This couples the agent host to VS Code internals. An external client (CLI tool, web app, another editor) connecting over WebSocket has no way to know _what_ authentication is required, _where_ to get a token, or _what scopes_ are needed. The client must have out-of-band knowledge that "this server needs a GitHub OAuth token."

## Design Goals

- **Self-describing**: The server declares its auth requirements so arbitrary clients can discover them without prior knowledge of the server's internals.
- **Standards-aligned**: Use the semantics and vocabulary of RFC 6750 (Bearer Token Usage) and RFC 9728 (OAuth 2.0 Protected Resource Metadata) adapted for JSON-RPC.
- **Challenge-on-failure**: When auth is missing or invalid, the server responds with a structured challenge (like `WWW-Authenticate`) that tells the client exactly what to do.
- **Transport-agnostic**: Works over WebSocket JSON-RPC and MessagePort IPC alike.
- **Multi-provider**: Supports multiple independent auth requirements (e.g. GitHub + a future enterprise IdP) each with their own scopes and authorization servers.
- **Non-breaking migration**: Can coexist with `setAuthToken` during a transition period.

## Relevant Standards

### RFC 6750 — Bearer Token Usage

Defines how bearer tokens are transmitted (`Authorization: Bearer <token>`) and how servers challenge clients when auth is missing or invalid:

```
WWW-Authenticate: Bearer realm="example",
                         error="invalid_token",
                         error_description="The access token expired"
```

Key error codes: `invalid_request`, `invalid_token`, `insufficient_scope`.

### RFC 9728 — OAuth 2.0 Protected Resource Metadata

Defines a metadata document that a protected resource publishes to describe itself:

```json
{
  "resource": "https://resource.example.com",
  "authorization_servers": ["https://as.example.com"],
  "scopes_supported": ["profile", "email"],
  "bearer_methods_supported": ["header"]
}
```

Clients discover this metadata either via a well-known URL or via the `resource_metadata` parameter in a `WWW-Authenticate` challenge. This tells the client _where_ to get a token and _what scopes_ to request.

## Proposed Design

### Overview

The authentication flow has three phases, mirroring the HTTP flow from RFC 9728 §5:

```
┌─────────┐                          ┌──────────────┐              ┌─────────────────┐
│  Client  │                          │  Agent Host  │              │  Authorization  │
│          │                          │   (Server)   │              │     Server      │
└────┬─────┘                          └──────┬───────┘              └────────┬────────┘
     │                                       │                              │
     │  1. initialize                        │                              │
     │ ───────────────────────────────────>   │                              │
     │                                       │                              │
     │  2. initialize result                 │                              │
     │     { auth: [{ scheme, resource,      │                              │
     │        authorization_servers,         │                              │
     │        scopes_supported }] }          │                              │
     │ <───────────────────────────────────  │                              │
     │                                       │                              │
     │  3. Obtain token from AS              │                              │
     │ ─────────────────────────────────────────────────────────────────>   │
     │                                       │                              │
     │  4. Token                             │                              │
     │ <─────────────────────────────────────────────────────────────────  │
     │                                       │                              │
     │  5. authenticate { scheme, token }    │                              │
     │ ───────────────────────────────────>   │                              │
     │                                       │                              │
     │  6. { authenticated: true }           │                              │
     │ <───────────────────────────────────  │                              │
     │                                       │                              │
     │  7. createSession / other commands    │                              │
     │ ───────────────────────────────────>   │                              │
```

### Phase 1: Discovery (in `initialize` response)

The `initialize` result is extended with a `resourceMetadata` field, modeled on RFC 9728 §2:

```typescript
interface IInitializeResult {
	protocolVersion: number;
	serverSeq: number;
	snapshots: ISnapshot[];
	defaultDirectory?: URI;

	/** RFC 9728-style resource metadata describing auth requirements. */
	resourceMetadata?: IResourceMetadata;
}

/**
 * Describes the agent host as an OAuth 2.0 protected resource.
 * Modeled on RFC 9728 (OAuth 2.0 Protected Resource Metadata).
 */
interface IResourceMetadata {
	/**
	 * Identifier for this resource (the agent host).
	 * Analogous to RFC 9728 `resource`.
	 */
	resource: string;

	/**
	 * Independent auth requirements. Each entry describes one
	 * authentication scheme the server accepts. A client must
	 * satisfy at least one to use authenticated features.
	 */
	authSchemes: IAuthScheme[];
}

/**
 * A single authentication scheme the server accepts.
 */
interface IAuthScheme {
	/**
	 * The auth scheme name. Initially only "bearer" (RFC 6750).
	 * Future schemes (e.g. "dpop", "device_code") can be added.
	 */
	scheme: 'bearer';

	/**
	 * An opaque identifier for this auth requirement, used to
	 * correlate `authenticate` calls and challenges. Allows the
	 * server to require multiple independent tokens (e.g. one
	 * per agent provider).
	 *
	 * Example: "github" for GitHub Copilot auth.
	 */
	id: string;

	/**
	 * Human-readable label for display in auth UIs.
	 * Analogous to RFC 9728 `resource_name`.
	 */
	label: string;

	/**
	 * Authorization server issuer identifiers (RFC 8414).
	 * Tells the client where to obtain tokens.
	 * Analogous to RFC 9728 `authorization_servers`.
	 *
	 * Example: ["https://github.com/login/oauth"]
	 */
	authorizationServers: string[];

	/**
	 * OAuth scopes the server needs.
	 * Analogous to RFC 9728 `scopes_supported`.
	 *
	 * Example: ["read:user", "user:email", "repo", "workflow"]
	 */
	scopesSupported?: string[];

	/**
	 * Whether this auth requirement is mandatory for any
	 * functionality, or only for specific agents/features.
	 */
	required?: boolean;
}
```

**Why in `initialize`?** RFC 9728 publishes metadata at a well-known URL. In our JSON-RPC world, the `initialize` handshake _is_ the well-known endpoint — it's the first thing every client calls, and it's already where we exchange capabilities. This avoids an extra round-trip and keeps the discovery atomic.

### Phase 2: Token Delivery (`authenticate` command)

Replace the fire-and-forget `setAuthToken` notification with a proper JSON-RPC **request** so the client gets confirmation:

```typescript
/**
 * Client → Server request to authenticate.
 * Analogous to sending `Authorization: Bearer <token>` (RFC 6750 §2.1).
 */
interface IAuthenticateParams {
	/**
	 * The auth scheme identifier from the server's resourceMetadata.
	 * Correlates to IAuthScheme.id.
	 */
	schemeId: string;

	/** The scheme type (initially always "bearer"). */
	scheme: 'bearer';

	/** The bearer token value (RFC 6750). */
	token: string;
}

interface IAuthenticateResult {
	/** Whether the token was accepted. */
	authenticated: boolean;
}
```

This is a **request** (not a notification) so:
- The client knows immediately if the token was accepted or rejected.
- The server can validate the token before returning success.
- Errors use structured challenges (see Phase 3).

The client can call `authenticate` multiple times (e.g. when a token is refreshed), and can authenticate for multiple scheme IDs independently.

### Phase 3: Challenges on Failure

When a command fails because authentication is missing or invalid, the server returns a JSON-RPC error with structured challenge data in the `data` field, modeled on RFC 6750 §3:

```typescript
/**
 * JSON-RPC error data for authentication failures.
 * Modeled on RFC 6750 WWW-Authenticate challenge parameters.
 */
interface IAuthChallenge {
	/** The scheme ID that needs (re-)authentication. */
	schemeId: string;

	/** RFC 6750 §3.1 error code. */
	error: 'invalid_request' | 'invalid_token' | 'insufficient_scope';

	/** Human-readable error description (RFC 6750 §3 error_description). */
	errorDescription?: string;

	/** Required scopes, if the error is insufficient_scope (RFC 6750 §3 scope). */
	scope?: string;
}
```

This is returned as the `data` payload of a JSON-RPC error response:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "error": {
    "code": -32007,
    "message": "Authentication required",
    "data": {
      "challenges": [
        {
          "schemeId": "github",
          "error": "invalid_token",
          "errorDescription": "The access token expired"
        }
      ]
    }
  }
}
```

A dedicated error code (`-32007 AHP_AUTH_REQUIRED`) signals this is an auth error so clients can handle it programmatically without parsing the message string.

### Phase 4: Auth State Notifications

The server pushes auth state changes via notifications so clients know when auth expires or the required scopes change:

```typescript
/**
 * Server → Client notification when auth state changes.
 */
interface IAuthStateNotification {
	type: 'notify/authRequired';

	/** The scheme ID whose auth state changed. */
	schemeId: string;

	/** The new state. */
	state: 'authenticated' | 'expired' | 'revoked' | 'required';

	/** Optional challenge with details (e.g. new scopes needed). */
	challenge?: IAuthChallenge;
}
```

This replaces the implicit "push a token whenever you see an account change" model with an explicit server-driven signal.

## Concrete Example: GitHub Copilot Auth

### Server-side (CopilotAgent)

When the Copilot agent registers, it publishes an auth scheme:

```typescript
// In CopilotAgent.getAuthSchemes():
[{
	scheme: 'bearer',
	id: 'github',
	label: 'GitHub',
	authorizationServers: ['https://github.com/login/oauth'],
	scopesSupported: ['read:user', 'user:email'],
	required: true,
}]
```

The agent host aggregates auth schemes from all agents into `IInitializeResult.resourceMetadata`.

### Client-side (VS Code renderer)

```typescript
// After initialize:
const metadata = initResult.resourceMetadata;
if (metadata) {
	for (const scheme of metadata.authSchemes) {
		if (scheme.scheme === 'bearer' && scheme.authorizationServers.some(
			as => as.includes('github.com')
		)) {
			// We know how to handle GitHub auth
			const token = await this._getGitHubToken(scheme.scopesSupported);
			await agentHostService.authenticate({
				schemeId: scheme.id,
				scheme: 'bearer',
				token,
			});
		}
	}
}
```

### Client-side (generic external client)

A CLI tool connecting over WebSocket:

```typescript
const ws = new WebSocket('ws://localhost:3000');
const initResult = await rpc.request('initialize', { protocolVersion: 1, clientId: 'cli-1' });

for (const scheme of initResult.resourceMetadata?.authSchemes ?? []) {
	if (scheme.scheme === 'bearer') {
		console.log(`Auth required: ${scheme.label}`);
		console.log(`Get a token from: ${scheme.authorizationServers[0]}`);
		console.log(`Scopes: ${scheme.scopesSupported?.join(', ')}`);

		// Client can use any OAuth library to get the token
		const token = await doOAuthFlow(scheme.authorizationServers[0], scheme.scopesSupported);
		await rpc.request('authenticate', { schemeId: scheme.id, scheme: 'bearer', token });
	}
}
```

## Protocol Changes Summary

### New JSON-RPC request: `authenticate`

| Direction | Type | Params | Result |
|---|---|---|---|
| Client → Server | Request | `IAuthenticateParams` | `IAuthenticateResult` |

### New JSON-RPC error code

| Code | Name | When |
|---|---|---|
| `-32007` | `AHP_AUTH_REQUIRED` | A command failed because auth is missing or invalid |

### Extended: `initialize` result

| Field | Type | Description |
|---|---|---|
| `resourceMetadata` | `IResourceMetadata` | Optional. Auth and resource information. |

### New notification

| Type | Direction | When |
|---|---|---|
| `notify/authRequired` | Server → Client | Auth state changed (expired, revoked, new requirements) |

### Deprecated

| Item | Replacement | Migration |
|---|---|---|
| `setAuthToken` notification | `authenticate` request | Keep accepting `setAuthToken` for one version, log deprecation |
| `IAgentDescriptor.requiresAuth` | `IResourceMetadata.authSchemes` | Derive from `authSchemes` during transition |

## Interface Changes in `agentService.ts`

### `IAgentService`

```diff
  interface IAgentService {
-   setAuthToken(token: string): Promise<void>;
+   authenticate(params: IAuthenticateParams): Promise<IAuthenticateResult>;
  }
```

### `IAgent`

```diff
  interface IAgent {
-   setAuthToken(token: string): Promise<void>;
+   /** Declare auth schemes this agent requires. */
+   getAuthSchemes(): IAuthScheme[];
+   /** Authenticate with a specific scheme. Returns true if accepted. */
+   authenticate(schemeId: string, token: string): Promise<boolean>;
  }
```

### `IAgentDescriptor`

```diff
  interface IAgentDescriptor {
    readonly provider: AgentProvider;
    readonly displayName: string;
    readonly description: string;
-   readonly requiresAuth: boolean;
  }
```

`requiresAuth` is removed — clients discover auth requirements from `IResourceMetadata` instead of per-agent descriptors.

## Design Decisions

### Why not `WWW-Authenticate` headers literally?

We're not using HTTP. Embedding RFC 6750's string-encoded header format in JSON-RPC would be awkward. Instead, we use JSON-native equivalents with the same semantics: `IAuthChallenge` mirrors the `WWW-Authenticate` parameters, and `IResourceMetadata` mirrors RFC 9728's metadata document.

### Why in `initialize` and not a separate `getResourceMetadata` command?

Fewer round-trips. Every client calls `initialize` first — embedding auth requirements there means the client knows what auth is needed from the very first response. A separate command would add latency and complexity for zero benefit, since the metadata is small and always needed.

### Why `schemeId` and not just the `scheme` name?

A server might need multiple bearer tokens from different authorization servers (e.g. GitHub + an enterprise IdP). The `schemeId` lets the client and server correlate tokens to specific requirements. It also makes `authenticate` calls idempotent and unambiguous.

### Why a request instead of a notification for `authenticate`?

The current `setAuthToken` is fire-and-forget — the client has no idea if the token was accepted, expired, or for the wrong provider. Making `authenticate` a request with a response lets the client react immediately (retry with different scopes, prompt the user, etc.).

### What about Device Code / OAuth flows that the server drives?

This proposal covers the "client already has a token" case (RFC 6750 bearer). For server-driven flows (device code, authorization code with redirect), the `authorizationServers` metadata tells the client which AS to talk to. The actual OAuth flow is client-side — the server just declares requirements.

A future extension could add an `IAuthScheme` with `scheme: 'device_code'` that includes a device authorization endpoint, letting the server guide the client through a device flow. This is out of scope for the initial implementation.

## Migration Plan

1. **Phase A**: Add `resourceMetadata` to `IInitializeResult` and the `authenticate` command. Keep `setAuthToken` working as-is.
2. **Phase B**: Update VS Code renderer to use `authenticate` instead of `setAuthToken`. External clients can start using the new flow.
3. **Phase C**: Remove `setAuthToken`, `requiresAuth`, and the old imperative push model. Bump protocol version.

## Open Questions

1. **Token validation**: Should the server validate tokens eagerly on `authenticate` (e.g. call a GitHub API endpoint), or defer validation to when a command actually needs it? Eager validation gives better error messages; deferred is simpler and avoids extra network calls.

2. **Per-agent vs. global auth**: The current design has one `resourceMetadata` for the whole server. Should auth schemes be per-agent-provider instead? Per-agent gives finer control (e.g. "Copilot needs GitHub, MockAgent needs nothing") but complicates the protocol. The current proposal uses global metadata with `schemeId` correlation, which the server can internally route to the right agent.

3. **Token refresh**: Should the server expose token expiry information so clients can proactively refresh, or rely on `notify/authRequired` to signal when a refresh is needed? Proactive refresh avoids interruptions but requires the server to parse tokens (which it shouldn't have to for opaque tokens).

4. **Multiple tokens**: Can a client authenticate multiple scheme IDs simultaneously? (Proposed: yes.) Can multiple clients each send their own token? (Proposed: yes, last-writer-wins per schemeId, which matches current behavior.)
