/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Platform } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { INativeMcpDiscoveryData } from '../../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { McpCollectionSortOrder, McpServerDefinition, McpServerTransportType } from '../mcpTypes.js';

export interface NativeMpcDiscoveryAdapter {
	readonly remoteAuthority: string | null;
	readonly id: string;
	readonly label: string;
	readonly order: number;

	getFilePath(details: INativeMcpDiscoveryData): URI | undefined;
	adaptFile(contents: VSBuffer, details: INativeMcpDiscoveryData): McpServerDefinition[] | undefined;
}

export class ClaudeDesktopMpcDiscoveryAdapter implements NativeMpcDiscoveryAdapter {
	public readonly id: string = `claude-desktop.${this.remoteAuthority}`;
	public readonly label: string = 'Claude Desktop';
	public readonly order = McpCollectionSortOrder.Filesystem;

	constructor(public readonly remoteAuthority: string | null) { }

	getFilePath({ platform, winAppData, homedir }: INativeMcpDiscoveryData): URI | undefined {
		if (platform === Platform.Windows) {
			const appData = winAppData || URI.joinPath(homedir, 'AppData', 'Roaming');
			return URI.joinPath(appData, 'Claude', 'claude_desktop_config.json');
		} else if (platform === Platform.Mac) {
			return URI.joinPath(homedir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
		} else {
			const configDir = /*process.env.XDG_CONFIG_HOME || */URI.joinPath(homedir, '.config');
			return URI.joinPath(configDir, 'Claude', 'claude_desktop_config.json');
		}
	}

	adaptFile(contents: VSBuffer, { homedir }: INativeMcpDiscoveryData): McpServerDefinition[] | undefined {
		let parsed: {
			mcpServers: Record<string, {
				command: string;
				args?: string[];
				env?: Record<string, string>;
			}>;
		};

		try {
			parsed = JSON.parse(contents.toString());
		} catch {
			return;
		}
		return Object.entries(parsed.mcpServers).map(([name, server]): McpServerDefinition => {
			return {
				id: `claude_desktop_config.${name}`,
				label: name,
				launch: {
					type: McpServerTransportType.Stdio,
					args: server.args || [],
					command: server.command,
					env: server.env || {},
					cwd: homedir,
				}
			};
		});
	}
}
