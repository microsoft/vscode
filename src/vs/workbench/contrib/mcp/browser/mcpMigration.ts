/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMcpServerConfiguration, IMcpServerVariable, IMcpStdioServerConfiguration } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { mcpConfigurationSection } from '../../../contrib/mcp/common/mcpConfiguration.js';
import { IWorkbenchMcpManagementService } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { parse } from '../../../../base/common/jsonc.js';
import { isObject, Mutable } from '../../../../base/common/types.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { IJSONEditingService } from '../../../services/configuration/common/jsonEditing.js';

interface IMcpConfiguration {
	inputs?: IMcpServerVariable[];
	servers?: IStringDictionary<IMcpServerConfiguration>;
}

export class McpConfigMigrationContribution extends Disposable implements IWorkbenchContribution {

	static ID = 'workbench.mcp.config.migration';

	constructor(
		@IWorkbenchMcpManagementService private readonly mcpManagementService: IWorkbenchMcpManagementService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IFileService private readonly fileService: IFileService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.migrateMcpConfig();
	}

	private async migrateMcpConfig(): Promise<void> {
		try {
			const userMcpConfig = await this.parseMcpConfig(this.userDataProfileService.currentProfile.settingsResource);
			if (userMcpConfig && userMcpConfig.servers && Object.keys(userMcpConfig.servers).length > 0) {
				await Promise.all(Object.entries(userMcpConfig.servers).map(([name, config], index) => this.mcpManagementService.install({ name, config, inputs: index === 0 ? userMcpConfig.inputs : undefined })));
				await this.removeMcpConfig(this.userDataProfileService.currentProfile.settingsResource);
			}
		} catch (error) {
			this.logService.error(`MCP migration: Failed to migrate user MCP config`, error);
		}

		const remoteEnvironment = await this.remoteAgentService.getEnvironment();
		if (!remoteEnvironment) {
			return;
		}
		try {
			const userRemoteMcpConfig = await this.parseMcpConfig(remoteEnvironment.mcpResource);
			if (userRemoteMcpConfig && userRemoteMcpConfig.servers && Object.keys(userRemoteMcpConfig.servers).length > 0) {
				await Promise.all(Object.entries(userRemoteMcpConfig.servers).map(([name, config], index) => this.mcpManagementService.install({ name, config, inputs: index === 0 ? userRemoteMcpConfig.inputs : undefined }, { target: ConfigurationTarget.USER_REMOTE })));
				await this.removeMcpConfig(remoteEnvironment.mcpResource);
			}
		} catch (error) {
			this.logService.error(`MCP migration: Failed to migrate remote MCP config`, error);
		}
	}

	private async parseMcpConfig(settingsFile: URI): Promise<IMcpConfiguration | undefined> {
		try {
			const content = await this.fileService.readFile(settingsFile);
			const settingsObject: IStringDictionary<any> = parse(content.value.toString());
			if (!isObject(settingsObject)) {
				return undefined;
			}
			const mcpConfiguration = settingsObject[mcpConfigurationSection] as IMcpConfiguration;
			if (mcpConfiguration && mcpConfiguration.servers) {
				for (const [, config] of Object.entries(mcpConfiguration.servers)) {
					if (config.type === undefined) {
						(<Mutable<IMcpServerConfiguration>>config).type = (<IMcpStdioServerConfiguration>config).command ? 'stdio' : 'http';
					}
				}
			}
			return mcpConfiguration;
		} catch (error) {
			this.logService.warn(`MCP migration: Failed to parse MCP config from ${settingsFile}:`, error);
			return;
		}
	}

	private async removeMcpConfig(settingsFile: URI): Promise<void> {
		try {
			await this.jsonEditingService.write(settingsFile, [
				{
					path: [mcpConfigurationSection],
					value: undefined
				}
			], true);
		} catch (error) {
			this.logService.warn(`MCP migration: Failed to remove MCP config from ${settingsFile}:`, error);
		}
	}
}
