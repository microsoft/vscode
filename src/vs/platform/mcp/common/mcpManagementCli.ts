/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	) {
		const configs = definitions.map((config) => this.validateConfiguration(config));
		await this.updateMcpInResource(configs);
		this._logger.info(`Added MCP servers: ${configs.map(c => c.name).join(', ')}`);
	}

	private async updateMcpInResource(configs: ValidatedConfig[]) {
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
