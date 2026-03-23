/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { URI } from '../../../base/common/uri.js';
import type { ResourceLabelFormatter } from '../../label/common/label.js';

/**
 * The URI scheme for accessing files on a remote agent host.
 *
 * URIs encode the original scheme, authority, and path so that any
 * remote resource can be represented without assuming `file://`:
 *
 * ```
 * vscode-agent-host://[connectionAuthority]/[originalScheme]/[originalAuthority]/[originalPath]
 * ```
 *
 * For example, `file:///home/user/foo.ts` on remote `my-server` becomes:
 * ```
 * vscode-agent-host://my-server/file//home/user/foo.ts
 * ```
 */
export const AGENT_HOST_SCHEME = 'vscode-agent-host';

/**
 * Wraps a remote URI into a {@link AGENT_HOST_SCHEME} URI that can be
 * resolved through the agent host filesystem provider.
 *
 * @param originalUri The URI on the remote (e.g. `file:///path` or
 *   `agenthost-content:///sessionId/...`)
 * @param connectionAuthority The sanitized connection identifier used as
 *   the URI authority (from {@link agentHostAuthority}).
 */
export function toAgentHostUri(originalUri: URI, connectionAuthority: string): URI {
	if (connectionAuthority === 'local') {
		return originalUri;
	}

	// Path format: /[originalScheme]/[originalAuthority]/[originalPath]
	const originalAuthority = originalUri.authority || '';
	return URI.from({
		scheme: AGENT_HOST_SCHEME,
		authority: connectionAuthority,
		path: `/${originalUri.scheme}${originalAuthority ? `/${originalAuthority}` : ''}${originalUri.path}`,
	});
}

/**
 * Extracts the original URI from a {@link AGENT_HOST_SCHEME} URI.
 *
 * The inverse of {@link toAgentHostUri}.
 */
export function fromAgentHostUri(agentHostUri: URI): URI {
	// Path: /[originalScheme]/[originalAuthority]/[rest of original path]
	const path = agentHostUri.path;

	// Find first segment boundary after leading /
	const schemeEnd = path.indexOf('/', 1);
	if (schemeEnd === -1) {
		// Malformed — treat whole path as file scheme
		return URI.from({ scheme: 'file', path });
	}

	const originalScheme = path.substring(1, schemeEnd);

	// Find second segment boundary (authority/path split)
	const authorityEnd = path.indexOf('/', schemeEnd + 1);
	if (authorityEnd === -1) {
		// No path after authority
		const originalAuthority = path.substring(schemeEnd + 1);
		return URI.from({ scheme: originalScheme, authority: originalAuthority, path: '/' });
	}

	let originalAuthority = path.substring(schemeEnd + 1, authorityEnd);
	let originalPath = path.substring(authorityEnd);
	if (originalScheme === 'file') {
		// file scheme URIs must have an authority of '' (not undefined) to be treated as absolute paths
		originalPath = originalAuthority + originalPath;
		originalAuthority = '';
	}

	return URI.from({
		scheme: originalScheme,
		authority: originalAuthority || undefined,
		path: originalPath,
	});
}

/**
 * Encode a remote address into an identifier that is safe for use in
 * both URI schemes and URI authorities, and is collision-free.
 *
 * If the address contains only alphanumeric characters it is returned as-is.
 * Otherwise it is url-safe base64-encoded (no padding) to guarantee the
 * result contains only `[A-Za-z0-9_-]`.
 */
export function agentHostAuthority(address: string): string {
	if (/^[a-zA-Z0-9]+$/.test(address)) {
		return address;
	}
	return 'b64-' + encodeBase64(VSBuffer.fromString(address), false, true);
}

/**
 * Label formatter for {@link AGENT_HOST_SCHEME} URIs. Strips the two
 * leading path segments (`/scheme/authority`) to display the original
 * file path.
 */
export const AGENT_HOST_LABEL_FORMATTER: ResourceLabelFormatter = {
	scheme: AGENT_HOST_SCHEME,
	formatting: {
		label: '${path}',
		separator: '/',
		stripPathSegments: 2,
	},
};
