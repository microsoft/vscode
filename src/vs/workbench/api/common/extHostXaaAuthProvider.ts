/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { stringHash } from '../../../base/common/hash.js';
import { buildIdJagExchangeBody, buildResourceRedemptionBody, fetchAuthorizationServerMetadata, getClaimsFromJWT, IAuthorizationJWTClaims, IAuthorizationTokenResponse, isAuthorizationTokenResponse, TOKEN_TYPE_ID_JAG } from '../../../base/common/oauth.js';
import { DynamicAuthProvider } from './extHostAuthentication.js';

type Ctor<T> = new (...args: any[]) => T;

/**
 * Minimal IdP scopes used when bootstrapping the IdP session for an XAA flow.
 * Sufficient for an OpenID Connect login and a refresh token; the resource-scoped
 * permissions are negotiated through the token exchange, not these scopes.
 */
export const IDP_SCOPES = ['openid', 'offline_access'];

interface IResourceCacheEntry {
	readonly audience: string;
	readonly scopes: readonly string[];
	readonly token: IAuthorizationTokenResponse;
	readonly created_at: number;
}

/** Cache key for resource-scoped tokens. Exported for testing. */
export function cacheKey(audience: string, scopes: readonly string[]): string {
	return audience + '|' + [...scopes].sort().join(' ');
}

/**
 * Returns true if the cached token is past (or within 60s of) its expiry. Pure
 * and exported for testing.
 */
export function isExpired(entry: { token: { expires_in?: number }; created_at: number }, now: number = Date.now()): boolean {
	if (!entry.token.expires_in) {
		return false;
	}
	return now > entry.created_at + (entry.token.expires_in * 1000) - 60_000;
}

/**
 * (Preview) Mixin that turns a {@link DynamicAuthProvider} subclass into a Cross App
 * Access (XAA) / enterprise-managed authentication provider, per
 * draft-ietf-oauth-identity-assertion-authz-grant.
 *
 * The IdP login leg is identical to the base class (Auth Code + PKCE against the
 * org-configured issuer, with DCR / CIMD client registration). On top of that:
 *
 *   1. `createSession` ensures an IdP session exists (via the base class).
 *   2. It POSTs to the IdP token endpoint with `grant_type=token-exchange`,
 *      `requested_token_type=id-jag`, `audience=<resource>` to mint an Identity
 *      Assertion (ID-JAG).
 *   3. It discovers the resource's authorization server metadata and POSTs the
 *      ID-JAG to the resource's token endpoint as another `token-exchange` to
 *      obtain a resource-scoped access token.
 *   4. The resource-scoped token is cached in-memory per `(audience, scopes)` and
 *      returned as the session's access token.
 *
 * The audience is read from `options.resource` on
 * {@link vscode.AuthenticationProviderSessionOptions}.
 */
export function XaaifyAuthProvider<TBase extends Ctor<DynamicAuthProvider>>(Base: TBase): TBase {
	return class XaaAuthenticationProvider extends Base {
		private readonly _resourceTokens = new Map<string, IResourceCacheEntry>();

		override async getSessions(scopes: readonly string[] | undefined, options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession[]> {
			if (!options.resource || !scopes) {
				return [];
			}
			const key = cacheKey(options.resource, scopes);
			const entry = this._resourceTokens.get(key);
			if (!entry) {
				return [];
			}
			if (isExpired(entry)) {
				this._resourceTokens.delete(key);
				return [];
			}
			return [toSession(entry.token, entry.scopes)];
		}

		override async createSession(scopes: string[], options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession> {
			const audience = options.resource;
			if (!audience) {
				throw new Error('Enterprise-managed authentication requires a resource audience but none was provided.');
			}

			// 1. Ensure IdP session.
			const idpSession = await this._ensureIdpSession(options);

			// 2. Exchange IdP access token for an ID-JAG.
			const jag = await this._exchangeForIdJag(idpSession.accessToken, audience, scopes);

			// 3. Discover the resource's token endpoint.
			const resourceTokenEndpoint = await this._discoverResourceTokenEndpoint(audience);

			// 4. Redeem the ID-JAG at the resource for a resource-scoped access token.
			const resourceToken = await this._redeemAtResource(resourceTokenEndpoint, jag, audience, scopes);

			// 5. Cache and return.
			this._resourceTokens.set(cacheKey(audience, scopes), {
				audience,
				scopes,
				token: resourceToken,
				created_at: Date.now(),
			});
			return toSession(resourceToken, scopes);
		}

		private async _ensureIdpSession(options: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession> {
			const existing = await super.getSessions(IDP_SCOPES, options);
			if (existing.length) {
				return existing[0];
			}
			return super.createSession([...IDP_SCOPES], options);
		}

		private async _exchangeForIdJag(idpAccessToken: string, audience: string, scopes: string[]): Promise<string> {
			const tokenEndpoint = this._serverMetadata.token_endpoint;
			if (!tokenEndpoint) {
				throw new Error('Authorization server metadata is missing token_endpoint; cannot perform XAA token exchange.');
			}
			const body = buildIdJagExchangeBody(this._clientId, idpAccessToken, audience, scopes);
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
			const data = await response.json();
			if (typeof data?.access_token !== 'string') {
				throw new Error(`XAA token exchange (IdP) returned no access_token. Response: ${JSON.stringify(data)}`);
			}
			if (typeof data.issued_token_type === 'string' && data.issued_token_type !== TOKEN_TYPE_ID_JAG) {
				throw new Error(`XAA token exchange (IdP) returned unexpected issued_token_type '${data.issued_token_type}', wanted '${TOKEN_TYPE_ID_JAG}'.`);
			}
			return data.access_token;
		}

		private async _discoverResourceTokenEndpoint(audience: string): Promise<string> {
			const { metadata, errors } = await fetchAuthorizationServerMetadata(audience);
			if (!metadata?.token_endpoint) {
				throw new Error(`Failed to discover resource authorization server metadata for '${audience}': ${errors.map(e => e.message).join('; ') || 'no token_endpoint in metadata'}`);
			}
			return metadata.token_endpoint;
		}

		private async _redeemAtResource(tokenEndpoint: string, idJag: string, audience: string, scopes: string[]): Promise<IAuthorizationTokenResponse> {
			const body = buildResourceRedemptionBody(this._clientId, idJag, audience, scopes);
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

function toSession(token: IAuthorizationTokenResponse, scopes: readonly string[]): vscode.AuthenticationSession {
	let claims: IAuthorizationJWTClaims | undefined;
	if (token.id_token) {
		try {
			claims = getClaimsFromJWT(token.id_token);
		} catch {
			// ignore
		}
	}
	if (!claims) {
		try {
			claims = getClaimsFromJWT(token.access_token);
		} catch {
			// ignore
		}
	}
	return {
		id: stringHash(token.access_token, 0).toString(),
		accessToken: token.access_token,
		account: {
			id: claims?.sub || 'unknown',
			label: claims?.preferred_username || claims?.name || claims?.email || 'XAA',
		},
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
