/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableValue } from '../../../../base/common/observable.js';
import { Platform, platform } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { McpServerDefinition, McpServerTransportType } from '../common/mcpTypes.js';

export class McpDiscovery implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.mcp.discovery';

	constructor(
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@IMcpRegistry mcpRegistry: IMcpRegistry
	) {

		const homeDir = environmentService.userHome;
		//#region hacked in reading for claude desktop config
		let configPath: URI;
		if (platform === Platform.Windows) {
			const appData = /* process.env.APPDATA ||*/ URI.joinPath(environmentService.userHome, 'AppData', 'Roaming');
			configPath = URI.joinPath(appData, 'Claude', 'claude_desktop_config.json');
		} else if (platform === Platform.Mac) {
			configPath = URI.joinPath(environmentService.userHome, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
		} else {
			const configDir = /*process.env.XDG_CONFIG_HOME || */URI.joinPath(environmentService.userHome, '.config');
			configPath = URI.joinPath(configDir, 'Claude', 'claude_desktop_config.json');
		}


		fileService.readFile(configPath).then((content) => {
			let parsed: {
				mcpServers: Record<string, {
					command: string;
					args?: string[];
					env?: Record<string, string>;
				}>;
			};

			try {
				parsed = JSON.parse(content.value.toString());
			} catch {
				return;
			}
			const definitions = Object.entries(parsed.mcpServers).map(([name, server]): McpServerDefinition => {
				return {
					id: `claude_desktop_config.${name}`,
					label: name,
					launch: {
						type: McpServerTransportType.Stdio,
						args: server.args || [],
						command: server.command,
						env: server.env || {},
						cwd: homeDir,
					}
				};
			});

			mcpRegistry.registerCollection({
				id: 'claude_desktop_config',
				label: 'Claude Desktop',
				isTrustedByDefault: false,
				remoteAuthority: null,
				scope: StorageScope.APPLICATION,
				serverDefinitions: observableValue(this, definitions),
			});
		}, () => { });

		//#endregion
	}
}
