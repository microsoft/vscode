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
		// For CLI, check if workspace target is viable by looking for workspace indicators
		if (target === ConfigurationTarget.WORKSPACE) {
			// Check for common workspace files to determine if we're in a workspace context
			const workspaceIndicators = ['.vscode/settings.json', 'package.json', 'tsconfig.json', '.git'];
			const hasWorkspaceContext = workspaceIndicators.some(indicator => {
				try {
					require('fs').accessSync(indicator);
					return true;
				} catch {
					return false;
				}
			});
			
			if (!hasWorkspaceContext) {
				this._logger.warn(`No workspace context detected. Installing to user configuration instead.`);
			} else {
				this._logger.info(`Workspace context detected. Note: CLI workspace installation is limited - consider using VS Code UI for full workspace support.`);
			}
		} else if (target && target !== ConfigurationTarget.USER_LOCAL) {
			this._logger.warn(`CLI currently supports 'user' target best. Installing to user configuration.`);
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
