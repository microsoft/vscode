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
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IMcpGalleryService } from '../common/mcpManagement.js';
import { McpUserResourceManagementService as CommonMcpUserResourceManagementService, McpManagementService as CommonMcpManagementService } from '../common/mcpManagementService.js';
import { IMcpResourceScannerService } from '../common/mcpResourceScannerService.js';
let McpUserResourceManagementService = class McpUserResourceManagementService extends CommonMcpUserResourceManagementService {
    constructor(mcpResource, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, environmentService) {
        super(mcpResource, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, environmentService);
    }
    async installFromGallery(server, options) {
        this.logService.trace('MCP Management Service: installGallery', server.name, server.galleryUrl);
        this._onInstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });
        try {
            const manifest = await this.updateMetadataFromGallery(server);
            const packageType = options?.packageType ?? (manifest.remotes?.length
                ? "remote" /* RegistryType.REMOTE */
                : (manifest.packages?.[0]?.registryType ?? "remote" /* RegistryType.REMOTE */));
            const { mcpServerConfiguration, notices } = this.getMcpServerConfigurationFromManifest(manifest, packageType);
            if (notices.length > 0) {
                this.logService.warn(`MCP Management Service: Warnings while installing ${server.name}`, notices);
            }
            const installable = {
                name: server.name,
                config: {
                    ...mcpServerConfiguration.config,
                    gallery: server.galleryUrl ?? true,
                    version: server.version
                },
                inputs: mcpServerConfiguration.inputs
            };
            await this.mcpResourceScannerService.addMcpServers([installable], this.mcpResource, this.target);
            await this.updateLocal();
            const local = (await this.getInstalled()).find(s => s.name === server.name);
            if (!local) {
                throw new Error(`Failed to install MCP server: ${server.name}`);
            }
            return local;
        }
        catch (e) {
            this._onDidInstallMcpServers.fire([{ name: server.name, source: server, error: e, mcpResource: this.mcpResource }]);
            throw e;
        }
    }
};
McpUserResourceManagementService = __decorate([
    __param(1, IMcpGalleryService),
    __param(2, IFileService),
    __param(3, IUriIdentityService),
    __param(4, ILogService),
    __param(5, IMcpResourceScannerService),
    __param(6, IEnvironmentService)
], McpUserResourceManagementService);
export { McpUserResourceManagementService };
export class McpManagementService extends CommonMcpManagementService {
    createMcpResourceManagementService(mcpResource) {
        return this.instantiationService.createInstance(McpUserResourceManagementService, mcpResource);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwTWFuYWdlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9tY3Avbm9kZS9tY3BNYW5hZ2VtZW50U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDM0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlFLE9BQU8sRUFBcUIsa0JBQWtCLEVBQStGLE1BQU0sNEJBQTRCLENBQUM7QUFDaEwsT0FBTyxFQUFFLGdDQUFnQyxJQUFJLHNDQUFzQyxFQUFFLG9CQUFvQixJQUFJLDBCQUEwQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbkwsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFN0UsSUFBTSxnQ0FBZ0MsR0FBdEMsTUFBTSxnQ0FBaUMsU0FBUSxzQ0FBc0M7SUFDM0YsWUFDQyxXQUFnQixFQUNJLGlCQUFxQyxFQUMzQyxXQUF5QixFQUNsQixrQkFBdUMsRUFDL0MsVUFBdUIsRUFDUix5QkFBcUQsRUFDNUQsa0JBQXVDO1FBRTVELEtBQUssQ0FBQyxXQUFXLEVBQUUsaUJBQWlCLEVBQUUsV0FBVyxFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSx5QkFBeUIsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0lBQ25JLENBQUM7SUFFUSxLQUFLLENBQUMsa0JBQWtCLENBQUMsTUFBeUIsRUFBRSxPQUF3QjtRQUNwRixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyx3Q0FBd0MsRUFBRSxNQUFN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