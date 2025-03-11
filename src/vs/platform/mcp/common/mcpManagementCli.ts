/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ConfigurationService } from '../../configuration/common/configurationService.js';
import { IFileService } from '../../files/common/files.js';
import { ILogger, ILogService } from '../../log/common/log.js';
import { IPolicyService } from '../../policy/common/policy.js';
import { hasWorkspaceFileExtension } from '../../workspace/common/workspace.js';
import { IMcpConfiguration, IMcpConfigurationServer } from './mcpPlatformTypes.js';

type ValidatedConfig = { name: string; config: IMcpConfigurationServer };

export class McpManagementCli {
	constructor(
		private readonly _logger: ILogger,
		@IConfigurationService private readonly _userConfigurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IPolicyService private readonly _policyService: IPolicyService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async addMcpDefinitions(
		workspace: string | undefined,
		definitions: string[],
	) {
		const configs = definitions.map((config) => this.validateConfiguration(config));

		if (workspace) {
			// todo (see below comments)
			throw new InvalidMcpOperationError(`Installing into workspaces is not yet supported`);
		}

		if (!workspace) {
			await this.updateMcpInConfig(this._userConfigurationService, configs);
		} else if (hasWorkspaceFileExtension(workspace)) {
			// This is not right because settings are nested in .code-workspace...
			const workspaceConfigService = new ConfigurationService(URI.file(workspace), this._fileService, this._policyService, this._logService);
			await this.updateMcpInConfig(workspaceConfigService, configs);
			workspaceConfigService.dispose();
		} else {
			// todo: this seems incorrect. IConfigurationService.getValue() fails if
			// if we point it to mcp.json and call `sevice.getValue()` with no args
			// but if we point to launch.json, it writes it there instead of the
			// standalone config file. This technically works but is undesirable.
			const workspaceFile = URI.joinPath(URI.file(workspace), '.vscode', 'settings.json');
			const workspaceFolderConfigService = new ConfigurationService(workspaceFile, this._fileService, this._policyService, this._logService);
			await this.updateMcpInConfig(workspaceFolderConfigService, configs);
			workspaceFolderConfigService.dispose();
		}

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
		let parsed: IMcpConfigurationServer & { name: string };
		try {
			parsed = JSON.parse(config);
		} catch (e) {
			throw new InvalidMcpOperationError(`Invalid JSON '${config}': ${e}`);
		}

		if (!parsed.name) {
			throw new InvalidMcpOperationError(`Missing name property in ${config}`);
		}

		if (!parsed.command) {
			throw new InvalidMcpOperationError(`Missing command property in ${config}`);
		}

		const { name, ...rest } = parsed;
		return { name, config: rest };
	}
}

class InvalidMcpOperationError extends Error {
	constructor(message: string) {
		super(message);
		this.stack = message;
	}
}
