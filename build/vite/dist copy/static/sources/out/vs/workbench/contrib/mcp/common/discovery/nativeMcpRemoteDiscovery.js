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
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { NativeMcpDiscoveryHelperChannelName } from '../../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { NativeFilesystemMcpDiscovery } from './nativeMcpDiscoveryAbstract.js';
/**
 * Discovers MCP servers on the remote filesystem, if any.
 */
let RemoteNativeMpcDiscovery = class RemoteNativeMpcDiscovery extends NativeFilesystemMcpDiscovery {
    constructor(remoteAgent, logService, labelService, fileService, instantiationService, mcpRegistry, configurationService) {
        super(remoteAgent.getConnection()?.remoteAuthority || null, labelService, fileService, instantiationService, mcpRegistry, configurationService);
        this.remoteAgent = remoteAgent;
        this.logService = logService;
    }
    async start() {
        const connection = this.remoteAgent.getConnection();
        if (!connection) {
            return this.setDetails(undefined);
        }
        await connection.withChannel(NativeMcpDiscoveryHelperChannelName, async (channel) => {
            const service = ProxyChannel.toService(channel);
            service.load().then(data => this.setDetails(data), err => {
                this.logService.warn('Error getting remote process MCP environment', err);
                this.setDetails(undefined);
            });
        });
    }
};
RemoteNativeMpcDiscovery = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, ILogService),
    __param(2, ILabelService),
    __param(3, IFileService),
    __param(4, IInstantiationService),
    __param(5, IMcpRegistry),
    __param(6, IConfigurationService)
], RemoteNativeMpcDiscovery);
export { RemoteNativeMpcDiscovery };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlTWNwUmVtb3RlRGlzY292ZXJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2NvbW1vbi9kaXNjb3ZlcnkvbmF0aXZlTWNwUmVtb3RlRGlzY292ZXJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RSxPQUFPLEVBQW9DLG1DQUFtQyxFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDdkosT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDL0YsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3RELE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRS9FOztHQUVHO0FBQ0ksSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSw0QkFBNEI7SUFDekUsWUFDdUMsV0FBZ0MsRUFDeEMsVUFBdUIsRUFDdEMsWUFBMkIsRUFDNUIsV0FBeUIsRUFDaEIsb0JBQTJDLEVBQ3BELFdBQXlCLEVBQ2hCLG9CQUEyQztRQUVsRSxLQUFLLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxFQUFFLGVBQWUsSUFBSSxJQUFJLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsRUFBRSxXQUFXLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQVIxRyxnQkFBVyxHQUFYLFdBQVcsQ0FBcUI7UUFDeEMsZUFBVSxHQUFWLFVBQVUsQ0FBYTtJQVF0RCxDQUFDO0lBRWUsS0FBSyxDQUFDLEtBQUs7UUFDMUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNwRCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ25DLENBQUM7UUFFRCxNQUFNLFVBQVUsQ0FBQyxXQUFXLENBQUMsbUNBQW1DLEVBQUUsS0FBSyxFQUFDLE9BQU8sRUFBQyxFQUFFO1lBQ2pGLE1BQU0sT0FBTyxHQUFHLFlBQVksQ0FBQyxTQUFTLENBQW1DLE9BQU8sQ0FBQyxDQUFDO1lBRWxGLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQ2xCLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFDN0IsR0FBRyxDQUFDLEVBQUU7Z0JBQ0wsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQzFFLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDNUIsQ0FBQyxDQUNELENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRCxDQUFBO0FBL0JZLHdCQUF3QjtJQUVsQyxXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsV0FBVyxDQUFBO0lBQ1gsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLHFCQUFxQixDQUFBO0dBUlgsd0JBQXdCLENBK0JwQyJ9