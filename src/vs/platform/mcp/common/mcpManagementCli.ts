/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogger } from '../../log/common/log.js';
import { IMcpConfiguration, IMcpConfigurationHTTP, IMcpConfigurationStdio, McpConfigurationServer } from './mcpPlatformTypes.js';

type ValidatedConfig = { name: string; config: IMcpConfigurationStdio | IMcpConfigurationHTTP };

export class McpManagementCli {
	constructor(
		private readonly _logger: ILogger,
		@IConfigurationService private readonly _userConfigurationService: IConfigurationService,
	) { }

	async addMcpDefinitions(
		definitions: string[],
	) {
		const configs = definitions.map((config) => this.validateConfiguration(config));
		await this.updateMcpInConfig(this._userConfigurationService, configs);
		this._logger.info(`Added MCP servers: ${configs.map(c => c.name).join(', ')}`);
	}

	private async updateMcpInConfig(service: IConfigurationService, configs: ValidatedConfig[]) {
		const mcp = service.getValue<IMcpConfiguration>('mcp') || { servers: {} };
		mcp.servers ??= {};

		for (const config of configs) {
			mcp.servers[config.name] = config.config;
		}

		await service.updateValue('mcp', mcp);
	}

	private validateConfiguration(config: string): ValidatedConfig {
		let parsed: McpConfigurationServer & { name: string };
		try {
			parsed = JSON.parse(config);
		} catch (e) {
			throw new InvalidMcpOperationError(`Invalid JSON '${config}': ${e}`);
		}

		if (!parsed.name) {
			throw new InvalidMcpOperationError(`Missing name property in ${config}`);
		}

		if (!('command' in parsed) && !('url' in parsed)) {
			throw new InvalidMcpOperationError(`Missing command or URL property in ${config}`);
		}

		const { name, ...rest } = parsed;
		return { name, config: rest as IMcpConfigurationStdio | IMcpConfigurationHTTP };
	}
}

class InvalidMcpOperationError extends Error {
	constructor(message: string) {
		super(message);
		this.stack = message;
	}
}
