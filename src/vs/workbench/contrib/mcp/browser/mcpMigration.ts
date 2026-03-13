/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMcpServerConfiguration, IMcpServerVariable, IMcpStdioServerConfiguration, McpServerType } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { mcpConfigurationSection } from '../../../contrib/mcp/common/mcpConfiguration.js';
import { IWorkbenchMcpManagementService } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { parse } from '../../../../base/common/jsonc.js';
import { isObject, Mutable } from '../../../../base/common/types.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { IJSONEditingService } from '../../../services/configuration/common/jsonEditing.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { McpCommandIds } from '../common/mcpCommandIds.js';
import { localize } from '../../../../nls.js';

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
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
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
		this.watchForMcpConfiguration(this.userDataProfileService.currentProfile.settingsResource, false);

		const remoteEnvironment = await this.remoteAgentService.getEnvironment();
		if (remoteEnvironment) {
			try {
				const userRemoteMcpConfig = await this.parseMcpConfig(remoteEnvironment.settingsPath);
				if (userRemoteMcpConfig && userRemoteMcpConfig.servers && Object.keys(userRemoteMcpConfig.servers).length > 0) {
					await Promise.all(Object.entries(userRemoteMcpConfig.servers).map(([name, config], index) => this.mcpManagementService.install({ name, config, inputs: index === 0 ? userRemoteMcpConfig.inputs : undefined }, { target: ConfigurationTarget.USER_REMOTE })));
					await this.removeMcpConfig(remoteEnvironment.settingsPath);
				}
			} catch (error) {
				this.logService.error(`MCP migration: Failed to migrate remote MCP config`, error);
			}
			this.watchForMcpConfiguration(remoteEnvironment.settingsPath, true);
		}

	}

	private watchForMcpConfiguration(file: URI, isRemote: boolean): void {
		this._register(this.fileService.watch(file));
		this._register(this.fileService.onDidFilesChange(e => {
			if (e.contains(file)) {
				this.checkForMcpConfigInFile(file, isRemote);
			}
		}));
	}

	private async checkForMcpConfigInFile(settingsFile: URI, isRemote: boolean): Promise<void> {
		try {
			const mcpConfig = await this.parseMcpConfig(settingsFile);
			if (mcpConfig && mcpConfig.servers && Object.keys(mcpConfig.servers).length > 0) {
				this.showMcpConfigErrorNotification(isRemote);
			}
		} catch (error) {
			// Ignore parsing errors - file might not exist or be malformed
		}
	}

	private showMcpConfigErrorNotification(isRemote: boolean): void {
		const message = isRemote
			? localize('mcp.migration.remoteConfigFound', 'MCP servers should no longer be configured in remote user settings. Use the dedicated MCP configuration instead.')
			: localize('mcp.migration.userConfigFound', 'MCP servers should no longer be configured in user settings. Use the dedicated MCP configuration instead.');

		const openConfigLabel = isRemote
			? localize('mcp.migration.openRemoteConfig', 'Open Remote User MCP Configuration')
			: localize('mcp.migration.openUserConfig', 'Open User MCP Configuration');

		const commandId = isRemote ? McpCommandIds.OpenRemoteUserMcp : McpCommandIds.OpenUserMcp;

		this.notificationService.prompt(
			Severity.Error,
			message,
			[{
				label: localize('mcp.migration.update', 'Update Now'),
				run: async () => {
					await this.migrateMcpConfig();
					await this.commandService.executeCommand(commandId);
				},
			}, {
				label: openConfigLabel,
				keepOpen: true,
				run: () => this.commandService.executeCommand(commandId)
			}]
		);
	}

	private async parseMcpConfig(settingsFile: URI): Promise<IMcpConfiguration | undefined> {
		try {
			const content = await this.fileService.readFile(settingsFile);
			const settingsObject: IStringDictionary<unknown> = parse(content.value.toString());
			if (!isObject(settingsObject)) {
				return undefined;
			}
			const mcpConfiguration = settingsObject[mcpConfigurationSection] as IMcpConfiguration;
			if (mcpConfiguration && mcpConfiguration.servers) {
				for (const [, config] of Object.entries(mcpConfiguration.servers)) {
					if (config.type === undefined) {
						(<Mutable<IMcpServerConfiguration>>config).type = (<IMcpStdioServerConfiguration>config).command ? McpServerType.LOCAL : McpServerType.REMOTE;
					}
				}
			}
			return mcpConfiguration;
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.warn(`MCP migration: Failed to parse MCP config from ${settingsFile}:`, error);
			}
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
