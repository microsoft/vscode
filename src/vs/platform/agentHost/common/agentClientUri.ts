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
 * @param originalUri The URI on the client (e.g. `file:///path`)
 * @param clientId The client identifier (from the protocol `clientId`)
 */
export function toAgentClientUri(originalUri: URI, clientId: string): URI {
	const originalAuthority = originalUri.authority || '-';
	return URI.from({
		scheme: AGENT_CLIENT_SCHEME,
		authority: clientId,
		path: `/${originalUri.scheme}/${originalAuthority}${originalUri.path}`,
	});
}

/**
 * Extracts the original client-side URI from a {@link AGENT_CLIENT_SCHEME} URI.
 *
 * The inverse of {@link toAgentClientUri}.
 */
export function fromAgentClientUri(agentClientUri: URI): URI {
	const path = agentClientUri.path;

	const schemeEnd = path.indexOf('/', 1);
	if (schemeEnd === -1) {
		return URI.from({ scheme: 'file', path });
	}

	const originalScheme = path.substring(1, schemeEnd);

	const authorityEnd = path.indexOf('/', schemeEnd + 1);
	if (authorityEnd === -1) {
		const originalAuthority = path.substring(schemeEnd + 1);
		return URI.from({ scheme: originalScheme, authority: originalAuthority === '-' ? '' : originalAuthority, path: '/' });
	}

	let originalAuthority = path.substring(schemeEnd + 1, authorityEnd);
	if (originalAuthority === '-') {
		originalAuthority = '';
	}

	const originalPath = path.substring(authorityEnd);

	return URI.from({
		scheme: originalScheme,
		authority: originalAuthority || undefined,
		path: originalPath,
	});
}
