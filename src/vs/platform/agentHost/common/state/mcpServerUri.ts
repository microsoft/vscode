/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/** URI scheme for MCP server resources surfaced as `McpServerSummary.resource`. */
export const MCP_SERVER_SCHEME = 'mcp';

/**
 * Build an `mcp:/<sessionPath>/<serverId>` URI.
 *
 * The path encodes the session URI's path component (typically a UUID) so
 * the server URI is **self-identifying to a session** per
 * `McpMessageParams` — the host service can derive the owning session by
 * parsing this URI in O(1) without a side map.
 */
export function buildMcpServerUri(session: URI, serverId: string): URI {
	const sessionPath = session.path.replace(/^\/+/, '');
	return URI.from({
		scheme: MCP_SERVER_SCHEME,
		path: `/${sessionPath}/${encodeURIComponent(serverId)}`,
	});
}

/**
 * Parse an `mcp:/<sessionPath>/<serverId>` URI back into its parts. Returns
 * `undefined` if the URI is not in the expected scheme/shape.
 */
export function parseMcpServerUri(uri: URI): { sessionPath: string; serverId: string } | undefined {
	if (uri.scheme !== MCP_SERVER_SCHEME) {
		return undefined;
	}
	const path = uri.path.replace(/^\/+/, '');
	const lastSlash = path.lastIndexOf('/');
	if (lastSlash < 1) {
		return undefined;
	}
	return {
		sessionPath: path.slice(0, lastSlash),
		serverId: decodeURIComponent(path.slice(lastSlash + 1)),
	};
}
