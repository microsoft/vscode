/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { parseOtlpLogLevel, type OtlpLogLevelName } from './otlpLogEmitter.js';

/**
 * `_meta` key on an `McpServerCustomization` whose value is an RFC 6570 URI
 * template for that server's diagnostic log channel. Clients expand
 * `{level}` to one of the OTLP level names and subscribe to the result; the
 * host delivers `otlp/exportLogs` notifications on that channel.
 *
 * Diagnostic records can contain MCP payloads, tool arguments, paths, and
 * server stderr. They must never be mixed into the host's own log stream or
 * exported as telemetry.
 */
export const MCP_SERVER_LOGS_META_KEY = 'vscode.agentHost/mcpServerLogs';

const MCP_SERVER_LOGS_PREFIX = 'ahp-otlp://mcp-logs/';

/**
 * Builds the `{level}` channel template advertised under {@link MCP_SERVER_LOGS_META_KEY}.
 * The session and server name are base64url-encoded so the segments survive
 * URI normalization by clients (which would otherwise decode `%2F` into `/`).
 */
export function buildMcpServerLogsChannelTemplate(session: string, serverName: string): string {
	return `${MCP_SERVER_LOGS_PREFIX}${encodeSegment(session)}/${encodeSegment(serverName)}/{level}`;
}

/** Parses a concrete (level-expanded) MCP server logs channel URI. */
export function parseMcpServerLogsChannel(uri: string): { readonly session: string; readonly serverName: string; readonly level: OtlpLogLevelName } | undefined {
	const match = /^ahp-otlp:\/\/mcp-logs\/(?<session>[A-Za-z0-9_-]+)\/(?<serverName>[A-Za-z0-9_-]+)\/(?<level>[^/?#]+)$/i.exec(uri);
	const level = match?.groups && parseOtlpLogLevel(match.groups.level);
	if (!match?.groups || !level) {
		return undefined;
	}
	try {
		return { session: decodeBase64(match.groups.session).toString(), serverName: decodeBase64(match.groups.serverName).toString(), level };
	} catch {
		return undefined;
	}
}

function encodeSegment(value: string): string {
	return encodeBase64(VSBuffer.fromString(value), false, true);
}

/** Reads the logs channel template from an MCP server customization's `_meta`. */
export function readMcpServerLogsChannelTemplate(meta: Readonly<Record<string, unknown>> | undefined): string | undefined {
	const value = meta?.[MCP_SERVER_LOGS_META_KEY];
	return typeof value === 'string' ? value : undefined;
}
