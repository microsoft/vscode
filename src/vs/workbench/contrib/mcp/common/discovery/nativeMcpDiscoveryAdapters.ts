/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Platform } from '../../../../../base/common/platform.js';
import { Mutable } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { INativeMcpDiscoveryData } from '../../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { DiscoverySource } from '../mcpConfiguration.js';
import { McpCollectionSortOrder, McpServerDefinition, McpServerLaunch, McpServerTransportType } from '../mcpTypes.js';

export interface NativeMpcDiscoveryAdapter {
	readonly remoteAuthority: string | null;
	readonly id: string;
	readonly order: number;
	readonly discoverySource: DiscoverySource;

	getFilePath(details: INativeMcpDiscoveryData): URI | undefined;
	adaptFile(contents: VSBuffer, details: INativeMcpDiscoveryData): Promise<McpServerDefinition[] | undefined>;
}

export async function claudeConfigToServerDefinition(idPrefix: string, contents: VSBuffer, cwd?: URI) {
	let parsed: {
		mcpServers: Record<string, {
			command: string;
			args?: string[];
			env?: Record<string, string>;
			url?: string;
		}>;
	};

	try {
		parsed = JSON.parse(contents.toString());
	} catch {
		return;
	}

	return Promise.all(Object.entries(parsed.mcpServers).map(async ([name, server]): Promise<Mutable<McpServerDefinition>> => {
		const launch: McpServerLaunch = server.url ? {
			type: McpServerTransportType.HTTP,
			uri: URI.parse(server.url),
			headers: [],
		} : {
			type: McpServerTransportType.Stdio,
			args: server.args || [],
			command: server.command,
			env: server.env || {},
			envFile: undefined,
			cwd: cwd?.fsPath,
		};

		return {
			id: `${idPrefix}.${name}`,
			label: name,
			launch,
			cacheNonce: await McpServerLaunch.hash(launch),
		};
	}));
}

export class ClaudeDesktopMpcDiscoveryAdapter implements NativeMpcDiscoveryAdapter {
	public id: string;
	public readonly order = McpCollectionSortOrder.Filesystem;
	public readonly discoverySource: DiscoverySource = DiscoverySource.ClaudeDesktop;

	constructor(public readonly remoteAuthority: string | null) {
		this.id = `claude-desktop.${this.remoteAuthority}`;
	}

	getFilePath({ platform, winAppData, xdgHome, homedir }: INativeMcpDiscoveryData): URI | undefined {
		if (platform === Platform.Windows) {
			const appData = winAppData || URI.joinPath(homedir, 'AppData', 'Roaming');
			return URI.joinPath(appData, 'Claude', 'claude_desktop_config.json');
		} else if (platform === Platform.Mac) {
			return URI.joinPath(homedir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
		} else {
			const configDir = xdgHome || URI.joinPath(homedir, '.config');
			return URI.joinPath(configDir, 'Claude', 'claude_desktop_config.json');
		}
	}

	adaptFile(contents: VSBuffer, { homedir }: INativeMcpDiscoveryData): Promise<McpServerDefinition[] | undefined> {
		return claudeConfigToServerDefinition(this.id, contents, homedir);
	}
}

export class WindsurfDesktopMpcDiscoveryAdapter extends ClaudeDesktopMpcDiscoveryAdapter {
	public override readonly discoverySource: DiscoverySource = DiscoverySource.Windsurf;

	constructor(remoteAuthority: string | null) {
		super(remoteAuthority);
		this.id = `windsurf.${this.remoteAuthority}`;
	}

	override getFilePath({ homedir }: INativeMcpDiscoveryData): URI | undefined {
		return URI.joinPath(homedir, '.codeium', 'windsurf', 'mcp_config.json');
	}
}

export class CursorDesktopMpcDiscoveryAdapter extends ClaudeDesktopMpcDiscoveryAdapter {
	public override readonly discoverySource: DiscoverySource = DiscoverySource.CursorGlobal;

	constructor(remoteAuthority: string | null) {
		super(remoteAuthority);
		this.id = `cursor.${this.remoteAuthority}`;
	}

	override getFilePath({ homedir }: INativeMcpDiscoveryData): URI | undefined {
		return URI.joinPath(homedir, '.cursor', 'mcp.json');
	}
}
