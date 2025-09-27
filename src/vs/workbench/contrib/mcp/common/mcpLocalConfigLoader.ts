/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { join } from '../../../../base/common/path.js';

export const MCP_SETTINGS_FILENAME = 'cline_mcp_settings.json';

export interface McpDiscoveryConfig {
	enabled?: boolean;
	hostname?: string;
	port?: number;
	use_tls?: boolean;
	timeout_ms?: number;
}

export interface McpLocalSettings {
	mcp_discovery?: McpDiscoveryConfig;
}

export const ILocalMcpConfigService = createDecorator<ILocalMcpConfigService>('ILocalMcpConfigService');

export interface ILocalMcpConfigService {
	readonly _serviceBrand: undefined;
	getDiscoveryConfig(): McpDiscoveryConfig | null;
}

export class LocalMcpConfigService extends Disposable implements ILocalMcpConfigService {
	declare readonly _serviceBrand: undefined;

	private discoveryConfig: McpDiscoveryConfig | null = null;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.loadConfigFile();
	}

	private async loadConfigFile(): Promise<void> {
		const configPath = this.getConfigFilePath();
		
		try {
			const exists = await this.fileService.exists(configPath);
			if (!exists) {
				return; // File not found, do nothing
			}

			const content = await this.fileService.readFile(configPath);
			const fileContent = content.value.toString();
			const parsedJson = JSON.parse(fileContent) as McpLocalSettings;

			if (parsedJson?.mcp_discovery) {
				this.discoveryConfig = parsedJson.mcp_discovery;
				this.logService.info('Successfully loaded local MCP discovery overrides.');
			}
		} catch (error) {
			this.logService.warn(`Failed to load or parse ${MCP_SETTINGS_FILENAME}. Falling back to server config.`, error);
			this.discoveryConfig = null;
		}
	}

	private getConfigFilePath(): URI {
		// Get the user data directory path and append the config filename
		const userDataPath = this.environmentService.userDataPath;
		const configFilePath = join(userDataPath, MCP_SETTINGS_FILENAME);
		return URI.file(configFilePath);
	}

	public getDiscoveryConfig(): McpDiscoveryConfig | null {
		return this.discoveryConfig;
	}
}