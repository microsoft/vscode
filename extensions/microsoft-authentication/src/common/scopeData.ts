/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';

const DEFAULT_CLIENT_ID = 'aebc6443-996d-45c2-90f0-388ff96faa56';
const DEFAULT_TENANT = 'organizations';

const OIDC_SCOPES = ['openid', 'email', 'profile', 'offline_access'];
const GRAPH_TACK_ON_SCOPE = 'User.Read';

export class ScopeData {
	/**
	 * The full list of scopes including:
	 * * the original scopes passed to the constructor
	 * * internal VS Code scopes (e.g. `VSCODE_CLIENT_ID:...`)
	 * * the default scopes (`openid`, `email`, `profile`, `offline_access`)
	 */
	readonly allScopes: string[];

	/**
	 * The full list of scopes as a space-separated string. For logging.
	 */
	readonly scopeStr: string;

	/**
	 * The list of scopes to send to the token endpoint. This is the same as `scopes` but without the internal VS Code scopes.
	 */
	readonly scopesToSend: string[];

	/**
	 * The client ID to use for the token request. This is the value of the `VSCODE_CLIENT_ID:...` scope if present, otherwise the default client ID.
	 */
	readonly clientId: string;

	/**
	 * The tenant ID or `organizations`, `common`, `consumers` to use for the token request. This is the value of the `VSCODE_TENANT:...` scope if present, otherwise it's the default.
	 */
	readonly tenant: string;

	/**
	 * The tenant ID to use for the token request. This will only ever be a GUID if one was specified via the `VSCODE_TENANT:...` scope, otherwise undefined.
	 */
	readonly tenantId: string | undefined;

	/**
	 * The claims to include in the token request.
	 */
	readonly claims?: string;

	constructor(readonly originalScopes: readonly string[] = [], claims?: string, authorizationServer?: Uri) {
		const modifiedScopes = [...originalScopes];
		modifiedScopes.sort();
		this.allScopes = modifiedScopes;
		this.scopeStr = modifiedScopes.join(' ');
		this.claims = claims;
		this.scopesToSend = this.getScopesToSend(modifiedScopes);
		this.clientId = this.getClientId(this.allScopes);
		this.tenant = this.getTenant(this.allScopes, authorizationServer);
		this.tenantId = this.getTenantId(this.tenant);
	}

	private getClientId(scopes: string[]): string {
		return scopes.reduce<string | undefined>((prev, current) => {
			if (current.startsWith('VSCODE_CLIENT_ID:')) {
				return current.split('VSCODE_CLIENT_ID:')[1];
			}
			return prev;
		}, undefined) ?? DEFAULT_CLIENT_ID;
	}

	private getTenant(scopes: string[], authorizationServer?: Uri): string {
		if (authorizationServer?.path) {
			// Get tenant portion of URL
			const tenant = authorizationServer.path.split('/')[1];
			if (tenant) {
				return tenant;
			}
		}
		return scopes.reduce<string | undefined>((prev, current) => {
			if (current.startsWith('VSCODE_TENANT:')) {
				return current.split('VSCODE_TENANT:')[1];
			}
			return prev;
		}, undefined) ?? DEFAULT_TENANT;
	}

	private getTenantId(tenant: string): string | undefined {
		switch (tenant) {
			case 'organizations':
			case 'common':
			case 'consumers':
				// These are not valid tenant IDs, so we return undefined
				return undefined;
			default:
				return this.tenant;
		}
	}

	private getScopesToSend(scopes: string[]): string[] {
		const scopesToSend = scopes.filter(s => !s.startsWith('VSCODE_'));

		const set = new Set(scopesToSend);
		for (const scope of OIDC_SCOPES) {
			set.delete(scope);
		}

		// If we only had OIDC scopes, we need to add a tack-on scope to make the request valid
		// by forcing Identity into treating this as a Graph token request.
		if (!set.size) {
			scopesToSend.push(GRAPH_TACK_ON_SCOPE);
		}
		return scopesToSend;
	}
}
