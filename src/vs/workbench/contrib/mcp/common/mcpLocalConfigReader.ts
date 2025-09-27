/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IMcpLocalConfig {
	'chat.mcp.discovery.enabled'?: boolean;
	'chat.mcp.discovery.hostname'?: string;
}

export const IMcpLocalConfigReader = createDecorator<IMcpLocalConfigReader>('IMcpLocalConfigReader');

export interface IMcpLocalConfigReader {
	readonly _serviceBrand: undefined;
	readConfig(): Promise<IMcpLocalConfig | undefined>;
}

export class McpLocalConfigReader implements IMcpLocalConfigReader {
	readonly _serviceBrand: undefined;

	private static readonly CONFIG_FILE_NAME = 'cline_mcp_settings.json';

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService
	) { }

	async readConfig(): Promise<IMcpLocalConfig | undefined> {
		try {
			const homeDir = typeof process !== 'undefined' && process.env?.HOME || '~';
			const cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.';
			
			const possiblePaths = [
				URI.file(homeDir + '/' + McpLocalConfigReader.CONFIG_FILE_NAME),
				URI.file(cwd + '/' + McpLocalConfigReader.CONFIG_FILE_NAME),
				URI.file(homeDir + '/.config/' + McpLocalConfigReader.CONFIG_FILE_NAME)
			];

			for (const configPath of possiblePaths) {
				try {
					const exists = await this.fileService.exists(configPath);
					if (!exists) {
						continue;
					}

					const content = await this.fileService.readFile(configPath);
					const configText = content.value.toString();
					const config = JSON.parse(configText) as IMcpLocalConfig;

					this.logService.debug(`MCP local config loaded from ${configPath.fsPath}`);
					return config;
				} catch (error) {
					this.logService.warn(`Failed to read MCP config from ${configPath.fsPath}:`, error);
					continue;
				}
			}

			return undefined;
		} catch (error) {
			this.logService.error('Error reading MCP local config:', error);
			return undefined;
		}
	}
}