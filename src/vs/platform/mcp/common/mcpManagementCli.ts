/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationTarget } from '../../configuration/common/configuration.js';
import { ILogger } from '../../log/common/log.js';
import { IMcpServerConfiguration, IMcpServerVariable } from './mcpPlatformTypes.js';
import { IMcpManagementService } from './mcpManagement.js';

type ValidatedConfig = { name: string; config: IMcpServerConfiguration; inputs?: IMcpServerVariable[] };

export class McpManagementCli {
	constructor(
		private readonly _logger: ILogger,
		@IMcpManagementService private readonly _mcpManagementService: IMcpManagementService,
	) { }

	async addMcpDefinitions(
		definitions: string[],
		targetString?: string,
	) {
		const configs = definitions.map((config) => this.validateConfiguration(config));
		
		// Parse target string to ConfigurationTarget
		let target: ConfigurationTarget | undefined;
		if (targetString) {
			switch (targetString.toLowerCase()) {
				case 'user':
					target = ConfigurationTarget.USER_LOCAL;
					break;
				case 'workspace':
					target = ConfigurationTarget.WORKSPACE;
					break;
				default:
					this._logger.warn(`Invalid MCP target '${targetString}'. Using default 'user'. Valid options: 'user', 'workspace'.`);
					target = ConfigurationTarget.USER_LOCAL;
					break;
			}
		}
		
		await this.updateMcpInResource(configs, target);
		this._logger.info(`Added MCP servers: ${configs.map(c => c.name).join(', ')}`);
	}

	private async updateMcpInResource(configs: ValidatedConfig[], target?: ConfigurationTarget) {
		// For CLI, we only support user-local target since CLI doesn't have workspace context
		// The target parameter is mainly for logging/informational purposes
		if (target && target !== ConfigurationTarget.USER_LOCAL) {
			this._logger.warn(`CLI only supports 'user' target. Installing to user configuration.`);
		}
		
		await Promise.all(configs.map(({ name, config, inputs }) => this._mcpManagementService.install({ name, config, inputs })));
	}

	private validateConfiguration(config: string): ValidatedConfig {
		let parsed: IMcpServerConfiguration & { name: string; inputs?: IMcpServerVariable[] };
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

		const { name, inputs, ...rest } = parsed;
		return { name, inputs, config: rest as IMcpServerConfiguration };
	}
}

class InvalidMcpOperationError extends Error {
	constructor(message: string) {
		super(message);
		this.stack = message;
	}
}
