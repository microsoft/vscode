/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';

/**
 * The URI scheme for accessing client-side files from the agent host.
 *
 * This is the inverse of {@link AGENT_HOST_SCHEME}: the agent host uses
 * this scheme to address files that live on the connected client.
 *
 * ```
 * vscode-agent-client://[clientId]/[originalScheme]/[originalAuthority]/[originalPath]
 * ```
 *
 * For example, `file:///Users/user/plugins/my-plugin` on client `client-1` becomes:
 * ```
 * vscode-agent-client://client-1/file/-/Users/user/plugins/my-plugin
 * ```
 */
export const AGENT_CLIENT_SCHEME = 'vscode-agent-client';

/**
 * Wraps a client-side URI into a {@link AGENT_CLIENT_SCHEME} URI that
 * can be resolved through the agent host's client filesystem provider.
 *
 * Opaque-path URIs (e.g. `untitled:Untitled-1`, where `path` has no
 * leading `/`) are marked with a `!` suffix on the encoded scheme slot
 * so the decoder can restore them faithfully. Scheme names are
 * alphanumeric + `+.-` per RFC 3986, so `!` cannot collide.
 *
 * @param originalUri The URI on the client (e.g. `file:///path`)
 * @param clientId The client identifier (from the protocol `clientId`)
 */
export function toAgentClientUri(originalUri: URI, clientId: string): URI {
	const originalAuthority = originalUri.authority || '-';
	const isOpaque = originalUri.path.length > 0 && !originalUri.path.startsWith('/');
	const schemeSlot = isOpaque ? `${originalUri.scheme}!` : originalUri.scheme;
	// Insert a synthetic '/' for opaque paths so the encoded URI is well-formed.
	// The decoder strips it after detecting the opaque marker on the scheme slot.
	const pathBody = isOpaque ? `/${originalUri.path}` : originalUri.path;
	return URI.from({
		scheme: AGENT_CLIENT_SCHEME,
		authority: clientId,
		path: `/${schemeSlot}/${originalAuthority}${pathBody}`,
		query: originalUri.query || undefined,
		fragment: originalUri.fragment || undefined,
	});
}

/**
 * Extracts the original client-side URI from a {@link AGENT_CLIENT_SCHEME} URI.
 *
 * The inverse of {@link toAgentClientUri}.
 */
export function fromAgentClientUri(agentClientUri: URI): URI {
	const path = agentClientUri.path;
	const query = agentClientUri.query || undefined;
	const fragment = agentClientUri.fragment || undefined;

	const schemeEnd = path.indexOf('/', 1);
	if (schemeEnd === -1) {
		return URI.from({ scheme: 'file', path, query, fragment });
	}

	let originalScheme = path.substring(1, schemeEnd);
	const isOpaque = originalScheme.endsWith('!');
	if (isOpaque) {
		originalScheme = originalScheme.substring(0, originalScheme.length - 1);
	}

	const authorityEnd = path.indexOf('/', schemeEnd + 1);
	if (authorityEnd === -1) {
		const originalAuthority = path.substring(schemeEnd + 1);
		return URI.from({ scheme: originalScheme, authority: originalAuthority === '-' ? '' : originalAuthority, path: '/', query, fragment });
	}

	let originalAuthority = path.substring(schemeEnd + 1, authorityEnd);
	if (originalAuthority === '-') {
		originalAuthority = '';
	}

	let originalPath = path.substring(authorityEnd);
	if (isOpaque) {
		// Drop the synthetic leading '/' we inserted in toAgentClientUri.
		originalPath = originalPath.substring(1);
	}

	return URI.from({
		scheme: originalScheme,
		authority: originalAuthority || undefined,
		path: originalPath,
		query,
		fragment,
	});
}
