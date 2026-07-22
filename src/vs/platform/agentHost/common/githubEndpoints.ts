/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { ProtectedResourceMetadata } from './state/protocol/state.js';

/**
 * The GitHub endpoints an agent host talks to, derived from an optional
 * GitHub Enterprise base URI. All values are string URIs with no trailing slash.
 */
export interface IGitHubEndpoints {
	/** REST API base (e.g. `https://api.github.com`), used as the resource identifier and the REST host. */
	readonly apiBaseUri: string;
	/** GraphQL endpoint (distinct from `apiBaseUri` for on-prem: `/api/graphql`, not `/api/v3/graphql`). */
	readonly graphQlUri: string;
	/** OAuth authorization server URI, advertised in `authorization_servers`. */
	readonly oauthServer: string;
	/**
	 * The configured GitHub Enterprise host (authority only, e.g. `acme.ghe.com`),
	 * or `undefined` for github.com. Used to point the Copilot CLI at an enterprise
	 * host via `COPILOT_GH_HOST`.
	 */
	readonly enterpriseHost: string | undefined;
}

const GITHUB_DOT_COM_COPILOT_API_BASE_URI = 'https://api.githubcopilot.com';

/** Canonical github.com endpoints, used when no enterprise URI is configured. */
const GITHUB_DOT_COM_ENDPOINTS: IGitHubEndpoints = {
	apiBaseUri: 'https://api.github.com',
	graphQlUri: 'https://api.github.com/graphql',
	oauthServer: 'https://github.com/login/oauth',
	enterpriseHost: undefined,
};

/**
 * Derives the {@link IGitHubEndpoints} for a GitHub Enterprise base URI, mirroring
 * the URL derivation in the built-in `github-authentication` extension
 * (`githubServer.ts` / `common/env.ts`):
 *
 * - unset / empty / unparseable → github.com defaults (byte-for-byte, preserving
 *   the resource identifiers used by every non-enterprise install).
 * - GitHub Enterprise **Cloud** (authority ends in `.ghe.com`) → API on an `api.`
 *   subdomain: `https://api.<authority>`.
 * - GitHub Enterprise **Server** (on-prem) → API under `/api/v3`, GraphQL under
 *   `/api/graphql`.
 *
 * The OAuth server is always `<scheme>://<authority>/login/oauth` for enterprise.
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

	// A github.com authority is never a GitHub Enterprise host — treat it as the
	// default rather than deriving a nonsensical `github.com/api/v3`. Guards the
	// case where the enterprise host can't be resolved and falls back to github.com.
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

/**
 * The GitHub Copilot protected resource for the given endpoints. Shared by the
 * endpoint service and tests so the resource identity is defined once.
 */
export function gitHubCopilotResource(endpoints: IGitHubEndpoints): ProtectedResourceMetadata {
	return {
		resource: endpoints.apiBaseUri,
		resource_name: 'GitHub Copilot',
		authorization_servers: [endpoints.oauthServer],
		scopes_supported: ['read:user', 'user:email'],
		required: true,
	};
}

/** The GitHub repository protected resource for the given endpoints. */
export function gitHubRepoResource(endpoints: IGitHubEndpoints): ProtectedResourceMetadata {
	return {
		resource: `${endpoints.apiBaseUri}/repos`,
		resource_name: 'GitHub Repository',
		authorization_servers: [endpoints.oauthServer],
		scopes_supported: ['repo'],
		required: false,
	};
}
