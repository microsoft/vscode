/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { stringHash } from '../../../base/common/hash.js';
import { buildIdJagExchangeBody, buildResourceRedemptionBody, fetchAuthorizationServerMetadata, getClaimsFromJWT, IAuthorizationJWTClaims, IAuthorizationTokenResponse, isAuthorizationTokenResponse } from '../../../base/common/oauth.js';
import { DynamicAuthProvider } from './extHostAuthentication.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor<T> = new (...args: any[]) => T;

/**
 * Scopes used when bootstrapping the IdP session for an XAA flow.
 *
 * `openid` is required because the ID-JAG token exchange uses the IdP-issued
 * `id_token` as `subject_token` (per draft-ietf-oauth-identity-assertion-authz-grant
 * section 3.1, the subject token MUST be of type `urn:ietf:params:oauth:token-type:id_token`).
 * `offline_access` is requested so we get a refresh token for the IdP session.
 */
export const IDP_SCOPES: readonly string[] = ['openid', 'offline_access'];

interface IResourceCacheEntry {
	readonly resource: string;
	readonly scopes: readonly string[];
	readonly token: IAuthorizationTokenResponse;
	/** Fallback identity (the IdP login account) for sessions built from this token, used when the resource token has no id_token of its own. */
	readonly account: vscode.AuthenticationSessionAccountInformation;
	readonly created_at: number;
}

/** Cache key for resource-scoped tokens. Exported for testing. */
export function cacheKey(resource: string, scopes: readonly string[]): string {
	return resource + '|' + [...scopes].sort().join(' ');
}

/**
 * Returns true if the cached token is past (or within 60s of) its expiry. Pure
 * and exported for testing.
 *
 * Mints fresh ID-JAG assertions are usually short-lived (minutes). We treat tokens as expired
 * 60s before their nominal expiry to avoid clock skew and in-flight redemptions racing past
 * `exp`. Tokens without `expires_in` defined are treated as never-expiring (cached
 * until the process exits); `expires_in: 0` is treated as immediately expired.
 */
export function isExpired(entry: { token: { expires_in?: number }; created_at: number }, now: number = Date.now()): boolean {
	if (entry.token.expires_in === undefined) {
		return false;
	}
	return now > entry.created_at + (entry.token.expires_in * 1000) - 60_000;
}

/**
 * (Preview) Mixin that turns a {@link DynamicAuthProvider} subclass into a
 * Cross App Access (XAA) / enterprise-managed authentication provider, per
 * `draft-ietf-oauth-identity-assertion-authz-grant`.
 *
 * The IdP login leg is identical to the base class — Auth Code + PKCE against
 * the org-configured issuer, using the pre-registered client credentials. On
 * top of that:
 *
 *   1. `createSession` ensures an IdP session exists (delegated to the base
 *      class with {@link IDP_SCOPES}).
 *   2. It POSTs to the IdP token endpoint with `grant_type=token-exchange`,
 *      `subject_token=<id_token>`, `subject_token_type=id_token`,
 *      `requested_token_type=id-jag`, `audience=<resource AS>`,
 *      `resource=<resource indicator>`, `scope=<requested scopes>` to mint an
 *      ID-JAG.
 *   3. It discovers the resource's authorization server metadata (the audience
 *      URL) and POSTs the ID-JAG to its token endpoint with
 *      `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`,
 *      `assertion=<id-jag>`, `resource=<resource indicator>`,
 *      `scope=<requested scopes>` to obtain a resource-scoped access token.
 *   4. The resource-scoped token is cached in-memory per `(resource, scopes)`
 *      and returned as the session's access token.
 *
 * The resource indicator is read from `options.resource` (RFC 8707) and the
 * resource's authorization server URL from `options.audience` on
 * {@link vscode.AuthenticationProviderSessionOptions}.
 */
export function XaaifyAuthProvider<TBase extends Ctor<DynamicAuthProvider>>(Base: TBase): TBase {
	return class XaaAuthenticationProvider extends Base {
		private readonly _resourceTokens = new Map<string, IResourceCacheEntry>();
		/**
		 * Per-(resource, client_id) client secrets. Lazily populated via the main-thread
		 * prompt. Keyed by both the resource indicator and the client_id because two
		 * different resources may legitimately share a client_id but require different
		 * secrets — keying by client_id alone could send the wrong secret to the wrong AS.
		 */
		private readonly _resourceClientSecrets = new Map<string, string>();

		/** Compound key for {@link _resourceClientSecrets}, matching main-thread secret storage scoping. */
		private _resourceClientSecretKey(resource: string, clientId: string): string {
			return `${resource}|${clientId}`;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		constructor(...args: any[]) {
			super(...args);
			// `authorizationServer` is exposed as a readonly field by the base class — use it
			// directly instead of indexing into `args` so this can't silently break if the
			// base constructor signature changes.
			const issuer = this.authorizationServer;
			this.id = `xaa:${issuer.toString(true)}`;
			this._logger.trace(`[XAA] Provider constructed for issuer ${issuer.toString(true)}. authorization_endpoint=${this._serverMetadata.authorization_endpoint}, token_endpoint=${this._serverMetadata.token_endpoint}`);
		}

		override async getSessions(scopes: readonly string[] | undefined, options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession[]> {
			const resource = options.resource;
			const audience = options.audience;
			// Account-enumeration call (getAccounts): no resource to mint against, so surface the IdP
			// session(s) from the base store. Read-only, so it honors the no-prompt getSessions contract.
			if (!scopes && !resource && !audience) {
				return super.getSessions(scopes, options);
			}
			if (!resource || !scopes || !audience) {
				return [];
			}
			// 1. Fast path: in-memory cache from a prior createSession/getSessions in this window.
			const key = cacheKey(resource, scopes);
			const entry = this._resourceTokens.get(key);
			if (entry && !isExpired(entry)) {
				return [toSession(entry.token, entry.scopes, entry.account)];
			}
			if (entry) {
				// Expired — drop and try to silently re-mint below.
				this._resourceTokens.delete(key);
			}

			// 2. Silent re-mint: the base DynamicAuthProvider persists the IdP session in secret
			//    storage, so on window reload we can pick it up and re-run legs 2-4 (ID-JAG exchange
			//    + resource redemption) without any user interaction. Per the IAuthenticationProvider
			//    contract, getSessions MUST NOT prompt — if anything is missing we just return [].
			const idpSession = await this._tryGetSilentIdpSession();
			if (!idpSession?.idToken) {
				return [];
			}
			try {
				const minted = await this._mintResourceToken(idpSession, [...scopes], audience, resource, options, /* silent */ true);
				if (!minted) {
					return [];
				}
				return [toSession(minted.token, minted.scopes, minted.account)];
			} catch (err) {
				// Silent path: log and fall back to "no session" so the caller decides whether
				// to escalate to createSession (which is allowed to interact).
				this._logger.warn(`[XAA] Silent token mint failed for resource=${resource}; falling back to interactive. Error: ${(err as Error).message}`);
				return [];
			}
		}

		override async createSession(scopes: string[], options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession> {
			const audience = options.audience;
			const resource = options.resource;
			this._logger.trace(`[XAA] createSession scopes=[${scopes.join(' ')}] audience=${audience} resource=${resource}`);
			if (!audience) {
				throw new Error('Enterprise-managed authentication requires `options.audience` (the resource\'s authorization server URL) but none was provided.');
			}
			if (!resource) {
				throw new Error('Enterprise-managed authentication requires `options.resource` (the resource indicator / MCP server URL) but none was provided.');
			}

			// Ensure IdP session via the base class (may interact). Don't pass the XAA options through —
			// the IdP login leg is unrelated to the resource/audience, and the base provider would
			// otherwise look for cached tokens scoped by a foreign audience.
			const idpSession = await this._ensureIdpSession();
			if (!idpSession.idToken) {
				throw new Error('IdP session is missing an id_token; the issuer must support OpenID Connect and the `openid` scope.');
			}

			const minted = await this._mintResourceToken(idpSession, scopes, audience, resource, options, /* silent */ false);
			if (!minted) {
				// `silent=false` only returns undefined if the mint logic itself decided to bail.
				// Today the only such path is missing resource client_secret, which prompts the user;
				// if the prompt is dismissed we still try the redemption with `undefined` (valid for
				// `token_endpoint_auth_method=none`). So in practice this branch is unreachable for
				// silent=false — guard defensively anyway.
				throw new Error('Failed to mint a resource access token for the enterprise-managed MCP server.');
			}
			return toSession(minted.token, minted.scopes, minted.account);
		}

		/**
		 * Mints a resource-scoped access token by running legs 2-4 of the XAA flow:
		 *   2. Exchange IdP id_token → ID-JAG (RFC 8693 token exchange at issuer)
		 *   3. Discover the resource AS token endpoint
		 *   4. Redeem the ID-JAG at the resource AS for an access token (RFC 7523 jwt-bearer grant)
		 *
		 * When `silent` is true, this method MUST NOT prompt the user. If the resource AS uses a
		 * distinct client_id (xaa.dev's "{client}-at-{resource}" pattern) and no client_secret can
		 * be resolved without prompting, this returns `undefined`.
		 *
		 * Caches the resulting token in `_resourceTokens` so subsequent getSessions are O(1).
		 */
		private async _mintResourceToken(
			idpSession: vscode.AuthenticationSession,
			scopes: string[],
			audience: string,
			resource: string,
			options: vscode.AuthenticationProviderSessionOptions,
			silent: boolean,
		): Promise<IResourceCacheEntry | undefined> {
			// Leg 2: id_token → ID-JAG
			const jag = await this._exchangeForIdJag(idpSession.idToken!, audience, resource, scopes);

			// Leg 3: resource AS token endpoint
			const resourceTokenEndpoint = await this._discoverResourceTokenEndpoint(audience);

			// Leg 4 prep: resolve the resource client_id.
			// Per draft-ietf-oauth-identity-assertion-authz-grant section 3.2, the ID-JAG carries a
			// `client_id` claim identifying the requesting app to the resource AS. This is often
			// distinct from the IdP `client_id` (xaa.dev for example uses a
			// `{idp_client_id}-at-{resource}` form), so we extract it from the assertion rather than
			// reusing `this._clientId`. Caller-supplied `options.clientId` (from the MCP server's
			// `oauth.clientId` config) takes precedence over the JAG-extracted value.
			let resourceClientId = this._clientId;
			let resourceClientIdFromJag = false;
			const configuredResourceClientId = typeof options.clientId === 'string' && options.clientId.length > 0 ? options.clientId : undefined;
			if (configuredResourceClientId) {
				resourceClientId = configuredResourceClientId;
				resourceClientIdFromJag = resourceClientId !== this._clientId;
			} else {
				try {
					const jagClaims = getClaimsFromJWT(jag);
					if (typeof jagClaims.client_id === 'string' && jagClaims.client_id.length > 0) {
						resourceClientId = jagClaims.client_id;
						resourceClientIdFromJag = resourceClientId !== this._clientId;
					}
				} catch (err) {
					this._logger.warn(`[XAA] Could not decode ID-JAG to read resource client_id; falling back to IdP client_id. Error: ${(err as Error).message}`);
				}
			}

			// Leg 4 prep: resolve the resource client_secret.
			// If the resource AS uses a distinct client_id, it will reject `this._clientSecret`
			// (the IdP secret) with `invalid_client`. The caller may supply the resource secret
			// directly via `options.clientSecret` (resolved in `mainThreadMcp` from URL-scoped
			// secret storage via the "Set Client Secret" code lens above `oauth.clientId` in
			// mcp.json); otherwise we fall back to a cached per-resource secret or prompt the
			// user. We pass `undefined` if the user leaves the prompt blank — that's valid for
			// clients registered with `token_endpoint_auth_method=none`.
			let resourceClientSecret: string | undefined = this._clientSecret;
			const configuredResourceClientSecret = typeof options.clientSecret === 'string' && options.clientSecret.length > 0 ? options.clientSecret : undefined;
			const secretCacheKey = this._resourceClientSecretKey(resource, resourceClientId);
			if (configuredResourceClientSecret) {
				resourceClientSecret = configuredResourceClientSecret;
				this._resourceClientSecrets.set(secretCacheKey, configuredResourceClientSecret);
			} else if (resourceClientIdFromJag) {
				if (this._resourceClientSecrets.has(secretCacheKey)) {
					resourceClientSecret = this._resourceClientSecrets.get(secretCacheKey);
				} else if (silent) {
					// Silent path: the only way to obtain the resource client_secret here is to
					// prompt the user — which we can't do. Bail; the caller will escalate to
					// createSession (allowed to interact) if it needs the token.
					this._logger.info(`[XAA] Silent mint requires resource client_secret for '${resourceClientId}' but none is cached or configured; deferring to interactive flow.`);
					return undefined;
				} else {
					this._logger.info(`[XAA] Resource AS requires a distinct client_id '${resourceClientId}' — prompting for matching client_secret.`);
					const promptedSecret = await this._proxy.$promptForResourceClientSecret(resourceClientId, resource);
					if (promptedSecret === undefined) {
						// User cancelled — don't cache, so re-prompt is possible on next call.
						return undefined;
					}
					// Blank-on-confirm is a valid answer (public client / token_endpoint_auth_method=none).
					// The main thread returns '' for that case, undefined for cancel.
					this._resourceClientSecrets.set(secretCacheKey, promptedSecret);
					resourceClientSecret = promptedSecret.length > 0 ? promptedSecret : undefined;
				}
			}

			// Leg 4: redemption.
			const resourceToken = await this._redeemAtResource(resourceTokenEndpoint, jag, resource, scopes, resourceClientId, resourceClientSecret);

			const entry: IResourceCacheEntry = {
				resource,
				scopes,
				token: resourceToken,
				// Fallback identity, used when the resource token carries no id_token of its own (the usual case).
				account: idpSession.account,
				created_at: Date.now(),
			};
			this._resourceTokens.set(cacheKey(resource, scopes), entry);
			return entry;
		}

		/**
		 * Returns the IdP session if one is available without any user interaction, otherwise
		 * `undefined`. Critically does NOT call `super.createSession`, so this is safe to use
		 * from {@link getSessions}.
		 */
		private async _tryGetSilentIdpSession(): Promise<vscode.AuthenticationSession | undefined> {
			const cleanOptions: vscode.AuthenticationProviderSessionOptions = {};
			const existing = await super.getSessions(IDP_SCOPES as string[], cleanOptions);
			return existing.length ? existing[0] : undefined;
		}

		private async _ensureIdpSession(): Promise<vscode.AuthenticationSession> {
			this._logger.trace(`[XAA] _ensureIdpSession: scopes=[${IDP_SCOPES.join(' ')}] authorization_endpoint=${this._serverMetadata.authorization_endpoint}`);
			const silent = await this._tryGetSilentIdpSession();
			if (silent?.idToken) {
				this._logger.trace(`[XAA] _ensureIdpSession: reusing existing IdP session`);
				return silent;
			}
			this._logger.trace(`[XAA] _ensureIdpSession: creating new IdP session via super.createSession`);
			return super.createSession([...IDP_SCOPES], {});
		}

		private async _exchangeForIdJag(idToken: string, audience: string, resource: string, scopes: string[]): Promise<string> {
			const tokenEndpoint = this._serverMetadata.token_endpoint;
			if (!tokenEndpoint) {
				throw new Error('Issuer metadata is missing token_endpoint; cannot perform XAA token exchange.');
			}
			const body = buildIdJagExchangeBody(this._clientId, this._clientSecret, idToken, audience, resource, scopes);
			this._logger.trace(`[XAA] POST ${tokenEndpoint} (ID-JAG exchange) audience=${audience} resource=${resource} scope=${scopes.join(' ')}`);
			const response = await fetch(tokenEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Accept': 'application/json',
				},
				body: body.toString(),
			});
			if (!response.ok) {
				throw new Error(`XAA token exchange (IdP) failed: ${response.status} ${await safeText(response)}`);
			}
			const data: unknown = await response.json();
			const issued = (data && typeof data === 'object' && typeof (data as { access_token?: unknown }).access_token === 'string')
				? (data as { access_token: string }).access_token
				: undefined;
			if (!issued) {
				throw new Error(`XAA token exchange (IdP) returned no access_token. Response: ${JSON.stringify(data)}`);
			}
			return issued;
		}

		private async _discoverResourceTokenEndpoint(audience: string): Promise<string> {
			const { metadata, errors } = await fetchAuthorizationServerMetadata(audience);
			if (!metadata?.token_endpoint) {
				throw new Error(`Failed to discover resource authorization server metadata for '${audience}': ${errors.map(e => e.message).join('; ') || 'no token_endpoint in metadata'}`);
			}
			return metadata.token_endpoint;
		}

		private async _redeemAtResource(tokenEndpoint: string, idJag: string, resource: string, scopes: string[], resourceClientId: string, resourceClientSecret: string | undefined): Promise<IAuthorizationTokenResponse> {
			const body = buildResourceRedemptionBody(resourceClientId, resourceClientSecret, idJag, resource, scopes);
			this._logger.trace(`[XAA] POST ${tokenEndpoint} (ID-JAG redemption) client_id=${resourceClientId} resource=${resource} scope=${scopes.join(' ')}`);
			const response = await fetch(tokenEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Accept': 'application/json',
				},
				body: body.toString(),
			});
			if (!response.ok) {
				throw new Error(`XAA token exchange (resource) failed: ${response.status} ${await safeText(response)}`);
			}
			const data = await response.json();
			if (!isAuthorizationTokenResponse(data)) {
				throw new Error(`XAA token exchange (resource) returned an invalid token response: ${JSON.stringify(data)}`);
			}
			return data;
		}
	};
}

/**
 * Builds a session from a token response. Identity precedence: the token's own `id_token`, then
 * `fallbackAccount` (the IdP login identity), then a generic default. Never the `access_token`, which
 * for XAA is an opaque resource credential. Exported for testing.
 */
export function toSession(token: IAuthorizationTokenResponse, scopes: readonly string[], fallbackAccount?: vscode.AuthenticationSessionAccountInformation): vscode.AuthenticationSession {
	let account: vscode.AuthenticationSessionAccountInformation | undefined;
	if (token.id_token) {
		try {
			const claims: IAuthorizationJWTClaims = getClaimsFromJWT(token.id_token);
			account = {
				id: claims.sub || 'unknown',
				label: claims.preferred_username || claims.name || claims.email || 'XAA',
			};
		} catch {
			// ignore — the id_token wasn't a decodable JWT
		}
	}
	account ??= fallbackAccount ?? { id: 'unknown', label: 'XAA' };
	return {
		id: stringHash(token.access_token, 0).toString(),
		accessToken: token.access_token,
		account,
		scopes: [...scopes],
		idToken: token.id_token,
	};
}

async function safeText(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return response.statusText;
	}
}
