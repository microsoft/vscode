/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { mcpConfigurationSection } from '../../../contrib/mcp/common/mcpConfiguration.js';
import { IWorkbenchMcpManagementService } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { parse } from '../../../../base/common/jsonc.js';
import { isObject } from '../../../../base/common/types.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { IJSONEditingService } from '../../../services/configuration/common/jsonEditing.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { localize } from '../../../../nls.js';
let McpConfigMigrationContribution = class McpConfigMigrationContribution extends Disposable {
    static { this.ID = 'workbench.mcp.config.migration'; }
    constructor(mcpManagementService, userDataProfileService, fileService, remoteAgentService, jsonEditingService, logService, notificationService, commandService) {
        super();
        this.mcpManagementService = mcpManagementService;
        this.userDataProfileService = userDataProfileService;
        this.fileService = fileService;
        this.remoteAgentService = remoteAgentService;
        this.jsonEditingService = jsonEditingService;
        this.logService = logService;
        this.notificationService = notificationService;
        this.commandService = commandService;
        this.migrateMcpConfig();
    }
    async migrateMcpConfig() {
        try {
            const userMcpConfig = await this.parseMcpConfig(this.userDataProfileService.currentProfile.settingsResource);
            if (userMcpConfig && userMcpConfig.servers && Object.keys(userMcpConfig.servers).length > 0) {
                await Promise.all(Object.entries(userMcpConfig.servers).map(([name, config], index) => this.mcpManagementService.install({ name, config, inputs: index === 0 ? userMcpConfig.inputs : undefined })));
                await this.removeMcpConfig(this.userDataProfileService.currentProfile.settingsResource);
            }
        }
        catch (error) {
            this.logService.error(`MCP migration: Failed to migrate user MCP config`, error);
        }
        this.watchForMcpConfiguration(this.userDataProfileService.currentProfile.settingsResource, false);
        const remoteEnvironment = await this.remoteAgentService.getEnvironment();
        if (remoteEnvironment) {
            try {
                const userRemoteMcpConfig = await this.parseMcpConfig(remoteEnvironment.settingsPath);
                if (userRemoteMcpConfig && userRemoteMcpConfig.servers && Object.keys(userRemoteMcpConfig.servers).length > 0) {
                    await Promise.all(Object.entries(userRemoteMcpConfig.servers).map(([name, config], index) => this.mcpManagementService.install({ name, config, inputs: index === 0 ? userRemoteMcpConfig.inputs : undefined }, { target: 4 /* ConfigurationTarget.USER_REMOTE */ })));
                    await this.removeMcpConfig(remoteEnvironment.settingsPath);
                }
            }
            catch (error) {
                this.logService.error(`MCP migration: Failed to migrate remote MCP config`, error);
            }
            this.watchForMcpConfiguration(remoteEnvironment.settingsPath, true);
        }
    }
    watchForMcpConfiguration(file, isRemote) {
        this._register(this.fileService.watch(file));
        this._register(this.fileService.onDidFilesChange(e => {
            if (e.contains(file)) {
                this.checkForMcpConfigInFile(file, isRemote);
            }
        }));
    }
    async checkForMcpConfigInFile(settingsFile, isRemote) {
        try {
            const mcpConfig = await this.parseMcpConfig(settingsFile);
            if (mcpConfig && mcpConfig.servers && Object.keys(mcpConfig.servers).length > 0) {
                this.showMcpConfigErrorNotification(isRemote);
            }
        }
        catch (error) {
            // Ignore parsing errors - file might not exist or be malformed
        }
    }
    showMcpConfigErrorNotification(isRemote) {
        const message = isRemote
            ? localize('mcp.migration.remoteConfigFound', 'MCP servers should no longer be configured in remote user settings. Use the dedicated MCP configuration instead.')
            : localize('mcp.migration.userConfigFound', 'MCP servers should no longer be configured in user settings. Use the dedicated MCP configuration instead.');
        const openConfigLabel = isRemote
            ? localize('mcp.migration.openRemoteConfig', 'Open Remote User MCP Configuration')
            : localize('mcp.migration.openUserConfig', 'Open User MCP Configuration');
        const commandId = isRemote ? "workbench.mcp.openRemoteUserMcpJson" /* McpCommandIds.OpenRemoteUserMcp */ : "workbench.mcp.openUserMcpJson" /* McpCommandIds.OpenUserMcp */;
        this.notificationService.prompt(Severity.Error, message, [{
                label: localize('mcp.migration.update', 'Update Now'),
                run: async () => {
                    await this.migrateMcpConfig();
                    await this.commandService.executeCommand(commandId);
                },
            }, {
                label: openConfigLabel,
                keepOpen: true,
                run: () => this.commandService.executeCommand(commandId)
            }]);
    }
    async parseMcpConfig(settingsFile) {
        try {
            const content = await this.fileService.readFile(settingsFile);
            const settingsObject = parse(content.value.toString());
            if (!isObject(settingsObject)) {
                return undefined;
            }
            const mcpConfiguration = settingsObject[mcpConfigurationSection];
            if (mcpConfiguration && mcpConfiguration.servers) {
                for (const [, config] of Object.entries(mcpConfiguration.servers)) {
                    if (config.type === undefined) {
                        config.type = config.command ? "stdio" /* McpServerType.LOCAL */ : "http" /* McpServerType.REMOTE */;
                    }
                }
            }
            return mcpConfiguration;
        }
        catch (error) {
            if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                this.logService.warn(`MCP migration: Failed to parse MCP config from ${settingsFile}:`, error);
            }
            return;
        }
    }
    async removeMcpConfig(settingsFile) {
        try {
            await this.jsonEditingService.write(settingsFile, [
                {
                    path: [mcpConfigurationSection],
                    value: undefined
                }
            ], true);
        }
        catch (error) {
            this.logService.warn(`MCP migration: Failed to remove MCP config from ${settingsFile}:`, error);
        }
    }
};
McpConfigMigrationContribution = __decorate([
    __param(0, IWorkbenchMcpManagementService),
    __param(1, IUserDataProfileService),
    __param(2, IFileService),
    __param(3, IRemoteAgentService),
    __param(4, IJSONEditingService),
    __param(5, ILogService),
    __param(6, INotificationService),
    __param(7, ICommandService)
], McpConfigMigrationContribution);
export { McpConfigMigrationContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwTWlncmF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2Jyb3dzZXIvbWNwTWlncmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFHckUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDMUYsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFL0csT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDdEcsT0FBTyxFQUF1QixZQUFZLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV0SCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFFBQVEsRUFBVyxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbkYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBT3ZDLElBQU0sOEJBQThCLEdBQXBDLE1BQU0sOEJBQStCLFNBQVEsVUFBVTthQUV0RCxPQUFFLEdBQUcsZ0NBQWdDLEFBQW5DLENBQW9DO0lBRTdDLFlBQ2tELG9CQUFvRCxFQUMz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