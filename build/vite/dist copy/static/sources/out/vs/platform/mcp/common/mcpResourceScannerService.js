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
import { assertNever } from '../../../base/common/assert.js';
import { Queue } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { parse } from '../../../base/common/json.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { ConfigurationTargetToString } from '../../configuration/common/configuration.js';
import { IFileService, toFileOperationResult } from '../../files/common/files.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
export const IMcpResourceScannerService = createDecorator('IMcpResourceScannerService');
let McpResourceScannerService = class McpResourceScannerService extends Disposable {
    constructor(fileService, uriIdentityService) {
        super();
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
        this.resourcesAccessQueueMap = new ResourceMap();
    }
    async scanMcpServers(mcpResource, target) {
        return this.withProfileMcpServers(mcpResource, target);
    }
    async addMcpServers(servers, mcpResource, target) {
        await this.withProfileMcpServers(mcpResource, target, scannedMcpServers => {
            let updatedInputs = scannedMcpServers.inputs ?? [];
            const existingServers = scannedMcpServers.servers ?? {};
            for (const { name, config, inputs } of servers) {
                existingServers[name] = config;
                if (inputs) {
                    const existingInputIds = new Set(updatedInputs.map(input => input.id));
                    const newInputs = inputs.filter(input => !existingInputIds.has(input.id));
                    updatedInputs = [...updatedInputs, ...newInputs];
                }
            }
            return { servers: existingServers, inputs: updatedInputs, sandbox: scannedMcpServers.sandbox };
        });
    }
    async updateSandboxConfig(updateFn, mcpResource, target) {
        await this.withProfileMcpServers(mcpResource, target, updateFn);
    }
    async removeMcpServers(serverNames, mcpResource, target) {
        await this.withProfileMcpServers(mcpResource, target, scannedMcpServers => {
            for (const serverName of serverNames) {
                if (scannedMcpServers.servers?.[serverName]) {
                    delete scannedMcpServers.servers[serverName];
                }
            }
            return scannedMcpServers;
        });
    }
    async withProfileMcpServers(mcpResource, target, updateFn) {
        return this.getResourceAccessQueue(mcpResource)
            .queue(async () => {
            target = target ?? 2 /* ConfigurationTarget.USER */;
            let scannedMcpServers = {};
            try {
                const content = await this.fileService.readFile(mcpResource);
                const errors = [];
                const result = parse(content.value.toString(), errors, { allowTrailingComma: true, allowEmptyContent: true }) || {};
                if (errors.length > 0) {
                    throw new Error('Failed to parse scanned MCP servers: ' + errors.join(', '));
                }
                if (target === 2 /* ConfigurationTarget.USER */) {
                    scannedMcpServers = this.fromUserMcpServers(result);
                }
                else if (target === 6 /* ConfigurationTarget.WORKSPACE_FOLDER */) {
                    scannedMcpServers = this.fromWorkspaceFolderMcpServers(result);
                }
                else if (target === 5 /* ConfigurationTarget.WORKSPACE */) {
                    const workspaceScannedMcpServers = result;
                    if (workspaceScannedMcpServers.settings?.mcp) {
                        scannedMcpServers = this.fromWorkspaceFolderMcpServers(workspaceScannedMcpServers.settings?.mcp);
                    }
                }
            }
            catch (error) {
                if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                    throw error;
                }
            }
            if (updateFn) {
                scannedMcpServers = updateFn(scannedMcpServers ?? {});
                if (target === 2 /* ConfigurationTarget.USER */) {
                    await this.writeScannedMcpServers(mcpResource, scannedMcpServers);
                }
                else if (target === 6 /* ConfigurationTarget.WORKSPACE_FOLDER */) {
                    await this.writeScannedMcpServersToWorkspaceFolder(mcpResource, scannedMcpServers);
                }
                else if (target === 5 /* ConfigurationTarget.WORKSPACE */) {
                    await this.writeScannedMcpServersToWorkspace(mcpResource, scannedMcpServers);
                }
                else {
                    assertNever(target, `Invalid Target: ${ConfigurationTargetToString(target)}`);
                }
            }
            return scannedMcpServers;
        });
    }
    async writeScannedMcpServers(mcpResource, scannedMcpServers) {
        if ((scannedMcpServers.servers && Object.keys(scannedMcpServers.servers).length > 0)
            || (scannedMcpServers.inputs && scannedMcpServers.inputs.length > 0)
            || scannedMcpServers.sandbox !== undefined) {
            await this.fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify(scannedMcpServers, null, '\t')));
        }
        else {
            await this.fileService.del(mcpResource);
        }
    }
    async writeScannedMcpServersToWorkspaceFolder(mcpResource, scannedMcpServers) {
        await this.fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify(scannedMcpServers, null, '\t')));
    }
    async writeScannedMcpServersToWorkspace(mcpResource, scannedMcpServers) {
        let scannedWorkspaceMcpServers;
        try {
            const content = await this.fileService.readFile(mcpResource);
            const errors = [];
            scannedWorkspaceMcpServers = parse(content.value.toString(), errors, { allowTrailingComma: true, allowEmptyContent: true });
            if (errors.length > 0) {
                throw new Error('Failed to parse scanned MCP servers: ' + errors.join(', '));
            }
        }
        catch (error) {
            if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                throw error;
            }
            scannedWorkspaceMcpServers = { settings: {} };
        }
        if (!scannedWorkspaceMcpServers.settings) {
            scannedWorkspaceMcpServers.settings = {};
        }
        scannedWorkspaceMcpServers.settings.mcp = scannedMcpServers;
        await this.fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify(scannedWorkspaceMcpServers, null, '\t')));
    }
    fromUserMcpServers(scannedMcpServers) {
        const userMcpServers = {
            inputs: scannedMcpServers.inputs,
            sandbox: scannedMcpServers.sandbox
        };
        const servers = Object.entries(scannedMcpServers.servers ?? {});
        if (servers.length > 0) {
            userMcpServers.servers = {};
            for (const [serverName, server] of servers) {
                userMcpServers.servers[serverName] = this.sanitizeServer(server);
            }
        }
        return userMcpServers;
    }
    fromWorkspaceFolderMcpServers(scannedWorkspaceFolderMcpServers) {
        const scannedMcpServers = {
            inputs: scannedWorkspaceFolderMcpServers.inputs,
            sandbox: scannedWorkspaceFolderMcpServers.sandbox
        };
        const servers = Object.entries(scannedWorkspaceFolderMcpServers.servers ?? {});
        if (servers.length > 0) {
            scannedMcpServers.servers = {};
            for (const [serverName, config] of servers) {
                const serverConfig = this.sanitizeServer(config);
                scannedMcpServers.servers[serverName] = serverConfig;
            }
        }
        return scannedMcpServers;
    }
    sanitizeServer(serverOrConfig) {
        let server;
        if (serverOrConfig.config) {
            const oldScannedMcpServer = serverOrConfig;
            server = {
                ...oldScannedMcpServer.config,
                version: oldScannedMcpServer.version,
                gallery: oldScannedMcpServer.gallery
            };
        }
        else {
            server = serverOrConfig;
        }
        if (server.type === undefined || (server.type !== "http" /* McpServerType.REMOTE */ && server.type !== "stdio" /* McpServerType.LOCAL */)) {
            server.type = server.command ? "stdio" /* McpServerType.LOCAL */ : "http" /* McpServerType.REMOTE */;
        }
        return server;
    }
    getResourceAccessQueue(file) {
        let resourceQueue = this.resourcesAccessQueueMap.get(file);
        if (!resourceQueue) {
            resourceQueue = new Queue();
            this.resourcesAccessQueueMap.set(file, resourceQueue);
        }
        return resourceQueue;
    }
};
McpResourceScannerService = __decorate([
    __param(0, IFileService),
    __param(1, IUriIdentityService)
], McpResourceScannerService);
export { McpResourceScannerService };
registerSingleton(IMcpResourceScannerService, McpResourceScannerService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwUmVzb3VyY2VTY2FubmVyU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUmVzb3VyY2VTY2FubmVyU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDN0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUUxRCxPQUFPLEVBQUUsS0FBSyxFQUFjLE1BQU0sOEJBQThCLENBQUM7QUFDakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUcxRCxPQUFPLEVBQXVCLDJCQUEyQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDL0csT0FBTyxFQUF1QixZQUFZLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBMEI5RSxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxlQUFlLENBQTZCLDRCQUE0QixDQUFDLENBQUM7QUFTN0csSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBMEIsU0FBUSxVQUFVO0lBS3hELFlBQ2UsV0FBMEMsRUFDbkMsa0JBQTBEO1FBRS9FLEtBQUssRUFBRSxDQUFDO1FBSHVCLGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ2hCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFKL0QsNEJBQXVCLEdBQUcsSUFBSSxXQUFXLEVBQTZCLENBQUM7SUFPeEYsQ0FBQztJQUVELEtBQUssQ0FBQyxjQUFjLENBQUMsV0FBZ0IsRUFBRSxNQUEwQjtRQUNoRSxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVELEtBQUssQ0FBQyxhQUFhLENBQUMsT0FBZ0MsRUFBRSxXQUFnQixFQUFFLE1BQTBCO1FBQ2pHLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLFdBQVcsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLENBQUMsRUFBRTtZQUN6RSxJQUFJLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDO1lBQ25ELE1BQU0sZUFBZSxHQUFHLGlCQUFpQixDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUM7WUFDeEQsS0FBSyxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDaEQsZUFBZSxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQztnQkFDL0IsSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDWixNQUFNLGdCQUFnQixHQUFHLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDdkUsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUMxRSxhQUFhLEdBQUcsQ0FBQyxHQUFHLGFBQWEsRUFBRSxHQUFHLFNBQVMsQ0FBQyxDQUFDO2dCQUNsRCxDQUFDO1lBQ0YsQ0FBQztZQUNELE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hHLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxRQUEwRCxFQUFFLFdBQWdCLEVBQUUsTUFBMEI7UUFDakksTUFBTSxJQUFJLENBQUMscUJBQXFCLENBQUMsV0FBVyxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFdBQXFCLEVBQUUsV0FBZ0IsRUFBRSxNQUEwQjtRQUN6RixNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixDQUFDLEVBQUU7WUFDekUsS0FBSyxNQUFNLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDdEMsSUFBSSxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO29CQUM3QyxPQUFPLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDOUMsQ0FBQztZQUNGLENBQUM7WUFDRCxPQUFPLGlCQUFpQixDQUFDO1FBQzFCLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVPLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxXQUFnQixFQUFFLE1BQTBCLEVBQUUsUUFBMkQ7UUFDNUksT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxDQUFDO2FBQzdDLEtBQUssQ0FBQyxLQUFLLElBQWlDLEVBQUU7WUFDOUMsTUFBTSxHQUFHLE1BQU0sb0NBQTRCLENBQUM7WUFDNUMsSUFBSSxpQkFBaUIsR0FBdUIsRUFBRSxDQUFDO1lBQy9DLElBQUksQ0FBQztnQkFDSixNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUM3RCxNQUFNLE1BQU0sR0FBaUIsRUFBRSxDQUFDO2dCQUNoQyxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsRUFBRSxNQUFNLEVBQUUsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3BILElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDdkIsTUFBTSxJQUFJLEtBQUssQ0FBQyx1Q0FBdUMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQzlFLENBQUM7Z0JBRUQsSUFBSSxNQUFNLHFDQUE2QixFQUFFLENBQUM7b0JBQ3pDLGlCQUFpQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDckQsQ0FBQztxQkFBTSxJQUFJLE1BQU0saURBQXlDLEVBQUUsQ0FBQztvQkFDNUQsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLDZCQUE2QixDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNoRSxDQUFDO3FCQUFNLElBQUksTUFBTSwwQ0FBa0MsRUFBRSxDQUFDO29CQUNyRCxNQUFNLDBCQUEwQixHQUFnQyxNQUFNLENBQUM7b0JBQ3ZFLElBQUksMEJBQTBCLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDO3dCQUM5QyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsMEJBQTBCLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUNsRyxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsK0NBQXVDLEVBQUUsQ0FBQztvQkFDekUsTUFBTSxLQUFLLENBQUM7Z0JBQ2IsQ0FBQztZQUNGLENBQUM7WUFDRCxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNkLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFFdEQsSUFBSSxNQUFNLHFDQUE2QixFQUFFLENBQUM7b0JBQ3pDLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixDQUFDLFdBQVcsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO2dCQUNuRSxDQUFDO3FCQUFNLElBQUksTUFBTSxpREFBeUMsRUFBRSxDQUFDO29CQUM1RCxNQUFNLElBQUksQ0FBQyx1Q0FBdUMsQ0FBQyxXQUFXLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztnQkFDcEYsQ0FBQztxQkFBTSxJQUFJLE1BQU0sMENBQWtDLEVBQUUsQ0FBQztvQkFDckQsTUFBTSxJQUFJLENBQUMsaUNBQWlDLENBQUMsV0FBVyxFQUFFLGlCQUFpQixDQUFDLENBQUM7Z0JBQzlFLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxXQUFXLENBQUMsTUFBTSxFQUFFLG1CQUFtQiwyQkFBMkIsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQy9FLENBQUM7WUFDRixDQUFDO1lBQ0QsT0FBTyxpQkFBaUIsQ0FBQztRQUMxQixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxLQUFLLENBQUMsc0JBQXNCLENBQUMsV0FBZ0IsRUFBRSxpQkFBcUM7UUFDM0YsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7ZUFDaEYsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLElBQUksaUJBQWlCLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7ZUFDakUsaUJBQWlCLENBQUMsT0FBTyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQzdDLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25ILENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN6QyxDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyx1Q0FBdUMsQ0FBQyxXQUFnQixFQUFFLGlCQUFxQztRQUM1RyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuSCxDQUFDO0lBRU8sS0FBSyxDQUFDLGlDQUFpQyxDQUFDLFdBQWdCLEVBQUUsaUJBQXFDO1FBQ3RHLElBQUksMEJBQW1FLENBQUM7UUFDeEUsSUFBSSxDQUFDO1lBQ0osTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUM3RCxNQUFNLE1BQU0sR0FBaUIsRUFBRSxDQUFDO1lBQ2hDLDBCQUEwQixHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxFQUFFLE1BQU0sRUFBRSxFQUFFLGtCQUFrQixFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBZ0MsQ0FBQztZQUMzSixJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZCLE1BQU0sSUFBSSxLQUFLLENBQUMsdUNBQXVDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzlFLENBQUM7UUFDRixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLHFCQUFxQixDQUFDLEtBQUssQ0FBQywrQ0FBdUMsRUFBRSxDQUFDO2dCQUN6RSxNQUFNLEtBQUssQ0FBQztZQUNiLENBQUM7WUFDRCwwQkFBMEIsR0FBRyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUMvQyxDQUFDO1FBQ0QsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQzFDLDBCQUEwQixDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFDMUMsQ0FBQztRQUNELDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxHQUFHLEdBQUcsaUJBQWlCLENBQUM7UUFDNUQsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLDBCQUEwQixFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUgsQ0FBQztJQUVPLGtCQUFrQixDQUFDLGlCQUFxQztRQUMvRCxNQUFNLGNBQWMsR0FBdUI7WUFDMUMsTUFBTSxFQUFFLGlCQUFpQixDQUFDLE1BQU07WUFDaEMsT0FBTyxFQUFFLGlCQUFpQixDQUFDLE9BQU87U0FDbEMsQ0FBQztRQUNGLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ2hFLElBQUksT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN4QixjQUFjLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUM1QixLQUFLLE1BQU0sQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQzVDLGNBQWMsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsRSxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sY0FBYyxDQUFDO0lBQ3ZCLENBQUM7SUFFTyw2QkFBNkIsQ0FBQyxnQ0FBb0Q7UUFDekYsTUFBTSxpQkFBaUIsR0FBdUI7WUFDN0MsTUFBTSxFQUFFLGdDQUFnQyxDQUFDLE1BQU07WUFDL0MsT0FBTyxFQUFFLGdDQUFnQyxDQUFDLE9BQU87U0FDakQsQ0FBQztRQUNGLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsZ0NBQWdDLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQy9FLElBQUksT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN4QixpQkFBaUIsQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQy9CLEtBQUssTUFBTSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDNUMsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDakQsaUJBQWlCLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxHQUFHLFlBQVksQ0FBQztZQUN0RCxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8saUJBQWlCLENBQUM7SUFDMUIsQ0FBQztJQUVPLGNBQWMsQ0FBQyxjQUF1RTtRQUM3RixJQUFJLE1BQStCLENBQUM7UUFDcEMsSUFBMkIsY0FBZSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ25ELE1BQU0sbUJBQW1CLEdBQXlCLGNBQWMsQ0FBQztZQUNqRSxNQUFNLEdBQUc7Z0JBQ1IsR0FBRyxtQkFBbUIsQ0FBQyxNQUFNO2dCQUM3QixPQUFPLEVBQUUsbUJBQW1CLENBQUMsT0FBTztnQkFDcEMsT0FBTyxFQUFFLG1CQUFtQixDQUFDLE9BQU87YUFDcEMsQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxHQUFHLGNBQXlDLENBQUM7UUFDcEQsQ0FBQztRQUVELElBQUksTUFBTSxDQUFDLElBQUksS0FBSyxTQUFTLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxzQ0FBeUIsSUFBSSxNQUFNLENBQUMsSUFBSSxzQ0FBd0IsQ0FBQyxFQUFFLENBQUM7WUFDdkUsTUFBTyxDQUFDLElBQUksR0FBa0MsTUFBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLG1DQUFxQixDQUFDLGtDQUFxQixDQUFDO1FBQ3JKLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFTyxzQkFBc0IsQ0FBQyxJQUFTO1FBQ3ZDLElBQUksYUFBYSxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3BCLGFBQWEsR0FBRyxJQUFJLEtBQUssRUFBc0IsQ0FBQztZQUNoRCxJQUFJLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxhQUFhLENBQUMsQ0FBQztRQUN2RCxDQUFDO1FBQ0QsT0FBTyxhQUFhLENBQUM7SUFDdEIsQ0FBQztDQUNELENBQUE7QUExTFkseUJBQXlCO0lBTW5DLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxtQkFBbUIsQ0FBQTtHQVBULHlCQUF5QixDQTBMckM7O0FBRUQsaUJBQWlCLENBQUMsMEJBQTBCLEVBQUUseUJBQXlCLG9DQUE0QixDQUFDIn0=