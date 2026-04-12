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
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { NativeMcpDiscoveryHelperChannelName } from '../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { NativeFilesystemMcpDiscovery } from '../common/discovery/nativeMcpDiscoveryAbstract.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
let NativeMcpDiscovery = class NativeMcpDiscovery extends NativeFilesystemMcpDiscovery {
    constructor(mainProcess, logService, labelService, fileService, instantiationService, mcpRegistry, configurationService) {
        super(null, labelService, fileService, instantiationService, mcpRegistry, configurationService);
        this.mainProcess = mainProcess;
        this.logService = logService;
    }
    start() {
        const service = ProxyChannel.toService(this.mainProcess.getChannel(NativeMcpDiscoveryHelperChannelName));
        service.load().then(data => this.setDetails(data), err => {
            this.logService.warn('Error getting main process MCP environment', err);
            this.setDetails(undefined);
        });
    }
};
NativeMcpDiscovery = __decorate([
    __param(0, IMainProcessService),
    __param(1, ILogService),
    __param(2, ILabelService),
    __param(3, IFileService),
    __param(4, IInstantiationService),
    __param(5, IMcpRegistry),
    __param(6, IConfigurationService)
], NativeMcpDiscovery);
export { NativeMcpDiscovery };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlTXBjRGlzY292ZXJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2VsZWN0cm9uLWJyb3dzZXIvbmF0aXZlTXBjRGlzY292ZXJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDNUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQW9DLG1DQUFtQyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDcEosT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDakcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXRELElBQU0sa0JBQWtCLEdBQXhCLE1BQU0sa0JBQW1CLFNBQVEsNEJBQTRCO0lBQ25FLFlBQ3VDLFdBQWdDLEVBQ3hDLFVBQXVCLEVBQ3RDLFlBQTJCLEVBQzVCLFdBQXlCLEVBQ2hCLG9CQUEyQyxFQUNwRCxXQUF5QixFQUNoQixvQkFBMkM7UUFFbEUsS0FBSyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLG9CQUFvQixFQUFFLFdBQVcsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBUjFELGdCQUFXLEdBQVgsV0FBVyxDQUFxQjtRQUN4QyxlQUFVLEdBQVYsVUFBVSxDQUFhO0lBUXRELENBQUM7SUFFZSxLQUFLO1FBQ3BCLE1BQU0sT0FBTyxHQUFHLFlBQVksQ0FBQyxTQUFTLENBQ3JDLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLG1DQUFtQyxDQUFDLENBQUMsQ0FBQztRQUVuRSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUNsQixJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQzdCLEdBQUcsQ0FBQyxFQUFFO1lBQ0wsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsNENBQTRDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDeEUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM1QixDQUFDLENBQ0QsQ0FBQztJQUNILENBQUM7Q0FDRCxDQUFBO0FBekJZLGtCQUFrQjtJQUU1QixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsV0FBVyxDQUFBO0lBQ1gsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLHFCQUFxQixDQUFBO0dBUlgsa0JBQWtCLENBeUI5QiJ9