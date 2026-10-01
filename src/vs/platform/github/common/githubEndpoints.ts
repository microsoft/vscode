/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';

/** GitHub endpoints derived from an optional Enterprise base URI, with no trailing slashes. */
export interface IGitHubEndpoints {
	/** REST API base (e.g. `https://api.github.com`). */
	readonly apiBaseUri: string;
	/** GraphQL endpoint (distinct from `apiBaseUri` for on-prem: `/api/graphql`, not `/api/v3/graphql`). */
	readonly graphQlUri: string;
	/** OAuth authorization server URI. */
	readonly oauthServer: string;
	/** The configured GitHub Enterprise authority (e.g. `acme.ghe.com`), or `undefined` for github.com. */
	readonly enterpriseHost: string | undefined;
}

/**
 * The github.com Copilot API host, distinct from `api.github.com`.
 * Enterprise overrides come from the Copilot token's `endpoints.api`, not the enterprise URI.
 */
export const GITHUB_DOT_COM_COPILOT_API_BASE_URI = 'https://api.githubcopilot.com';

/** Canonical github.com endpoints, used when no enterprise URI is configured. */
const GITHUB_DOT_COM_ENDPOINTS: IGitHubEndpoints = {
	apiBaseUri: 'https://api.github.com',
	graphQlUri: 'https://api.github.com/graphql',
	oauthServer: 'https://github.com/login/oauth',
	enterpriseHost: undefined,
};

/**
 * Derives GitHub endpoints from an optional enterprise URI, matching the github-authentication extension.
 * Invalid or github.com URIs use the github.com defaults.
 */
export function deriveGitHubEndpoints(enterpriseUri: string | undefined): IGitHubEndpoints {
	if (!enterpriseUri) {
		return GITHUB_DOT_COM_ENDPOINTS;
	}

	let uri: URI;
	try {
		uri = URI.parse(enterpriseUri);
	} catch {
		return GITHUB_DOT_COM_ENDPOINTS;
	}

	const authority = uri.authority;
	if (!authority) {
		return GITHUB_DOT_COM_ENDPOINTS;
	}

	// Unresolved enterprise hosts can fall back to github.com, which must keep the default endpoints.
	if (authority === 'github.com' || authority === 'www.github.com' || authority === 'api.github.com') {
		return GITHUB_DOT_COM_ENDPOINTS;
	}

	const scheme = uri.scheme || 'https';
	const isCloud = /\.ghe\.com$/.test(authority);
	return {
		apiBaseUri: isCloud ? `${scheme}://api.${authority}` : `${scheme}://${authority}/api/v3`,
		graphQlUri: isCloud ? `${scheme}://api.${authority}/graphql` : `${scheme}://${authority}/api/graphql`,
		oauthServer: `${scheme}://${authority}/login/oauth`,
		enterpriseHost: authority,
	};
}

/**
 * Derives the official GitHub MCP server URL from the per-user Copilot API
 * endpoint returned by `/copilot_internal/user`.
 */
export function gitHubMcpServerUrl(copilotApiBaseUri: string | undefined): string | undefined {
	try {
		const uri = URI.parse(copilotApiBaseUri ?? GITHUB_DOT_COM_COPILOT_API_BASE_URI, true);
		if (!uri.authority) {
			return undefined;
		}
		return uri.with({ path: '/mcp', query: null, fragment: null }).toString(true);
	} catch {
		return undefined;
	}
}
