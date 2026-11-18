/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../files/common/files.js';
import { makeMcpServerCustomization, readJsonFile } from '../../../../../agentPlugins/common/pluginParsers.js';
import { McpServerStatus, type McpServerCustomization, type McpServerState } from '../../../../common/state/protocol/channels-session/state.js';

/**
 * The JSON files a Claude session reads MCP server declarations from,
 * in precedence order (project before user — first-seen wins).
 */
function claudeMcpFiles(workingDirectory: URI | undefined, userHome: URI): URI[] {
	const files: URI[] = [];
	if (workingDirectory) {
		files.push(URI.joinPath(workingDirectory, '.claude', 'settings.json'));
		files.push(URI.joinPath(workingDirectory, '.mcp.json'));
	}
	files.push(URI.joinPath(userHome, '.claude', 'settings.json'));
	return files;
}

/**
 * Extracts the `{ name: config }` MCP server map from one parsed JSON
 * file. `settings.json` carries many unrelated top-level keys, so we
 * ONLY treat its explicit `mcpServers` block as servers. A bare
 * `.mcp.json` MAY instead be a flat `{ name: config }` map.
 */
function extractMcpServerMap(uri: URI, raw: unknown): Record<string, unknown> | undefined {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return undefined;
	}
	const obj = raw as Record<string, unknown>;
	if (Object.hasOwn(obj, 'mcpServers')) {
		const servers = obj.mcpServers;
		return (servers && typeof servers === 'object' && !Array.isArray(servers)) ? servers as Record<string, unknown> : undefined;
	}
	return uri.path.endsWith('.mcp.json') ? obj : undefined;
}

/**
 * Scans a Claude session's `settings.json` / `.mcp.json` files (project +
 * user scope) for declared MCP servers and returns them as
 * {@link McpServerCustomization} entries pointing at the real source file.
 *
 * Pre-materialize, the state is {@link McpServerStatus.Stopped} (declared
 * but not yet connected). Post-materialize, the live connection status is
 * enriched from the SDK's `mcpServerStatus()` by the projector.
 */
export async function scanClaudeMcpServers(
	workingDirectory: URI | undefined,
	userHome: URI,
	fileService: IFileService,
): Promise<readonly McpServerCustomization[]> {
	const seen = new Set<string>();
	const result: McpServerCustomization[] = [];
	for (const uri of claudeMcpFiles(workingDirectory, userHome)) {
		const raw = await readJsonFile(uri, fileService);
		const servers = extractMcpServerMap(uri, raw);
		if (!servers) {
			continue;
		}
		for (const [name, config] of Object.entries(servers)) {
			if (!config || typeof config !== 'object' || Array.isArray(config) || seen.has(name)) {
				continue;
			}
			seen.add(name);
			result.push(makeMcpServerCustomization(uri, name));
		}
	}
	result.sort((a, b) => a.name.localeCompare(b.name));
	return result;
}

/**
 * Maps an SDK MCP connection status onto the protocol MCP state. Precise
 * `Error` / `AuthRequired` states (which carry extra payload) are deferred;
 * anything not clearly `connected` / `disabled` reports as `Starting`.
 */
export function deriveMcpState(status: string): McpServerState {
	switch (status) {
		case 'connected':
			return { kind: McpServerStatus.Ready };
		case 'disabled':
			return { kind: McpServerStatus.Stopped };
		default:
			return { kind: McpServerStatus.Starting };
	}
}
