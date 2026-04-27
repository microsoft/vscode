/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';

/**
 * Tracks the last bearer token pushed to a given agent host connection
 * for each protected resource, so that redundant `authenticate` RPCs can
 * be suppressed when neither the resource nor the token has changed.
 *
 * One instance per connection. Owned by the contribution that drives
 * authentication for that connection so the cache is dropped naturally
 * when the connection is disposed.
 */
export class AgentHostAuthTokenCache {
	private readonly _lastTokens = new Map<string, string>();

	/**
	 * Record that we just sent `token` for `resource`, and return whether
	 * this is a change from the last token sent. When `false`, callers
	 * should skip the `authenticate` RPC.
	 */
	updateAndIsChanged(resource: string, token: string): boolean {
		const previous = this._lastTokens.get(resource);
		if (previous === token) {
			return false;
		}
		this._lastTokens.set(resource, token);
		return true;
	}

	/**
	 * Clear the cached token for a specific resource, or all resources if
	 * no argument is given. Call after a failed `authenticate` RPC (per-resource)
	 * or when the agent host process restarts (all resources).
	 */
	clear(resource?: string): void {
		if (resource !== undefined) {
			this._lastTokens.delete(resource);
		} else {
			this._lastTokens.clear();
		}
	}
}

/**
 * Resolves a bearer token for a protected resource by trying each
 * authorization server in order. First attempts an exact scope match,
 * then falls back to finding the session whose scopes are the narrowest
 * superset of the requested scopes.
 */
export async function resolveTokenForResource(
	resourceServer: URI,
	authorizationServers: readonly string[],
	scopes: readonly string[],
	authenticationService: IAuthenticationService,
	logService: ILogService,
	logPrefix: string,
): Promise<string | undefined> {
	for (const server of authorizationServers) {
		const serverUri = URI.parse(server);
		const providerId = await authenticationService.getOrActivateProviderIdForServer(serverUri, resourceServer);
		if (!providerId) {
			logService.trace(`${logPrefix} No auth provider found for server: ${server}`);
			continue;
		}
		logService.trace(`${logPrefix} Resolved auth provider '${providerId}' for server: ${server}`);

		// Try exact scope match first
		const sessions = await authenticationService.getSessions(providerId, [...scopes], { authorizationServer: serverUri }, true);
		if (sessions.length > 0) {
			return sessions[0].accessToken;
		}

		// Fall back: get all sessions and find the narrowest superset of requested scopes
		const allSessions = await authenticationService.getSessions(providerId, undefined, { authorizationServer: serverUri }, true);
		const requestedSet = new Set(scopes);
		let bestToken: string | undefined;
		let bestExtraScopes = Infinity;
		for (const session of allSessions) {
			const sessionScopes = new Set(session.scopes);
			let isSuperset = true;
			for (const scope of requestedSet) {
				if (!sessionScopes.has(scope)) {
					isSuperset = false;
					break;
				}
			}
			if (isSuperset) {
				const extraScopes = sessionScopes.size - requestedSet.size;
				if (extraScopes < bestExtraScopes) {
					bestExtraScopes = extraScopes;
					bestToken = session.accessToken;
				}
			}
		}
		if (bestToken) {
			return bestToken;
		}
	}
	return undefined;
}
