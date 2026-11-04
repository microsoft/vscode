/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

export const MCP_RESOURCE_SCHEME = 'mcp-resource';
export const TOOL_RESULT_RESOURCE_SCHEME = 'session-db-resource';

/** Identifies embedded tool result content in a session database. */
export interface IToolResultResourceUriFields {
	sessionUri: string;
	toolCallId: string;
	ordinal: number;
}

/** Builds a database reference whose path is only a display name, never a filesystem path. */
export function buildToolResultResourceUri(sessionUri: string, toolCallId: string, ordinal: number, name: string): string {
	return URI.from({
		scheme: TOOL_RESULT_RESOURCE_SCHEME,
		path: `/${name.replace(/[\\/]/g, '_') || 'resource'}`,
		query: JSON.stringify({ sessionUri, toolCallId, ordinal }),
	}).toString();
}

/** Parses the database identity independently of the display-only path. */
export function parseToolResultResourceUri(uri: URI): IToolResultResourceUriFields | undefined {
	if (uri.scheme !== TOOL_RESULT_RESOURCE_SCHEME) {
		return undefined;
	}
	try {
		const fields = JSON.parse(uri.query) as Partial<IToolResultResourceUriFields> | null;
		if (fields && typeof fields.sessionUri === 'string' && fields.sessionUri
			&& typeof fields.toolCallId === 'string' && fields.toolCallId
			&& typeof fields.ordinal === 'number' && Number.isSafeInteger(fields.ordinal) && fields.ordinal >= 0) {
			return { sessionUri: fields.sessionUri, toolCallId: fields.toolCallId, ordinal: fields.ordinal };
		}
	} catch {
		// Invalid references are not database resource requests.
	}
	return undefined;
}

/** Builds a host-routable MCP resource reference while retaining its display name in the path. */
export function buildMcpResourceUri(channel: string, uri: string, name?: string): string {
	return URI.from({
		scheme: MCP_RESOURCE_SCHEME,
		path: `/${(name || basename(URI.parse(uri)) || 'resource').replace(/[\\/]/g, '_')}`,
		query: JSON.stringify({ channel, uri }),
	}).toString();
}

/** Parses the routing fields of a host-owned MCP resource reference. */
export function parseMcpResourceUri(uri: URI): { channel: string; uri: string } | undefined {
	if (uri.scheme !== MCP_RESOURCE_SCHEME) {
		return undefined;
	}
	try {
		const fields = JSON.parse(uri.query) as { channel?: string; uri?: string } | null;
		if (fields && typeof fields.channel === 'string' && fields.channel && typeof fields.uri === 'string' && fields.uri) {
			return { channel: fields.channel, uri: fields.uri };
		}
	} catch {
		// Invalid references are not MCP resource requests.
	}
	return undefined;
}
