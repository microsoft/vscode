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
import { generateUuid } from '../../../../base/common/uuid.js';
import { IExtensionGalleryService, IAllowedExtensionsService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionManagementService as BaseExtensionManagementService } from '../common/extensionManagementService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IExtensionManagementServerService, IWorkbenchExtensionManagementService } from '../common/extensionManagement.js';
import { Schemas } from '../../../../base/common/network.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDownloadService } from '../../../../platform/download/common/download.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IExtensionManifestPropertiesService } from '../../extensions/common/extensionManifestPropertiesService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IExtensionsScannerService } from '../../../../platform/extensionManagement/common/extensionsScannerService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
let ExtensionManagementService = class ExtensionManagementService extends BaseExtensionManagementService {
    constructor(environmentService, extensionManagementServerService, extensionGalleryService, userDataProfileService, userDataProfilesService, configurationService, productService, downloadService, userDataSyncEnablementService, dialogService, workspaceTrustRequestService, extensionManifestPropertiesService, fileService, logService, instantiationService, extensionsScannerService, allowedExtensionsService, storageService, telemetryService) {
        super(extensionManagementServerService, extensionGalleryService, userDataProfileService, userDataProfilesService, configurationService, productService, downloadService, userDataSyncEnablementService, dialogService, workspaceTrustRequestService, extensionManifestPropertiesService, fileService, logService, instantiationService, extensionsScannerService, allowedExtensionsService, storageService, telemetryService);
        this.environmentService = environmentService;
    }
    async installVSIXInServer(vsix, server, options) {
        if (vsix.scheme === Schemas.vscodeRemote && server === this.extensionManagementServerService.localExtensionManagementServer) {
            const downloadedLocation = joinPath(this.environmentService.tmpDir, generateUuid());
            await this.downloadService.download(vsix, downloadedLocation, 'extensionManagement.downloadRemoteVsix');
            vsix = downloadedLocation;
        }
        return super.installVSIXInServer(vsix, server, options);
    }
};
ExtensionManagementService = __decorate([
    __param(0, INativeWorkbenchEnvironmentService),
    __param(1, IExtensionManagementServerService),
    __param(2, IExtensionGalleryService),
    __param(3, IUserDataProfileService),
    __param(4, IUserDataProfilesService),
    __param(5, IConfigurationService),
    __param(6, IProductService),
    __param(7, IDownloadService),
    __param(8, IUserDataSyncEnablementService),
    __param(9, IDialogService),
    __param(10, IWorkspaceTrustRequestService),
    __param(11, IExtensionManifestPropertiesService),
    __param(12, IFileService),
    __param(13, ILogService),
    __param(14, IInstantiationService),
    __param(15, IExtensionsScannerService),
    __param(16, IAllowedExtensionsService),
    __param(17, IStorageService),
    __param(18, ITelemetryService)
], ExtensionManagementService);
export { ExtensionManagementService };
registerSingleton(IWorkbenchExtensionManagementService, ExtensionManagementService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9lbGVjdHJvbi1icm93c2VyL2V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQW1CLHdCQUF3QixFQUFrQix5QkFBeUIsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBRTlLLE9BQU8sRUFBRSwwQkFBMEIsSUFBSSw4QkFBOEIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZILE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQThCLGlDQUFpQyxFQUFFLG9DQUFvQyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdkosT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxN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