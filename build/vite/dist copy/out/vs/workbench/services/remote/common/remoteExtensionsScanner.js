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
import { IRemoteAgentService } from './remoteAgentService.js';
import { IRemoteExtensionsScannerService, RemoteExtensionsScannerChannelName } from '../../../../platform/remote/common/remoteExtensionsScanner.js';
import * as platform from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IRemoteUserDataProfilesService } from '../../userDataProfile/common/remoteUserDataProfiles.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IActiveLanguagePackService } from '../../localization/common/locale.js';
import { IWorkbenchExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
let RemoteExtensionsScannerService = class RemoteExtensionsScannerService {
    constructor(remoteAgentService, environmentService, userDataProfileService, remoteUserDataProfilesService, activeLanguagePackService, extensionManagementService, logService) {
        this.remoteAgentService = remoteAgentService;
        this.environmentService = environmentService;
        this.userDataProfileService = userDataProfileService;
        this.remoteUserDataProfilesService = remoteUserDataProfilesService;
        this.activeLanguagePackService = activeLanguagePackService;
        this.extensionManagementService = extensionManagementService;
        this.logService = logService;
    }
    whenExtensionsReady() {
        return this.withChannel(channel => channel.call('whenExtensionsReady'), { failed: [] });
    }
    async scanExtensions() {
        try {
            const languagePack = await this.activeLanguagePackService.getExtensionIdProvidingCurrentLocale();
            return await this.withChannel(async (channel) => {
                const profileLocation = this.userDataProfileService.currentProfile.isDefault ? undefined : (await this.remoteUserDataProfilesService.getRemoteProfile(this.userDataProfileService.currentProfile)).extensionsResource;
                const scannedExtensions = await channel.call('scanExtensions', [
                    platform.language,
                    profileLocation,
                    this.extensionManagementService.getInstalledWorkspaceExtensionLocations(),
                    this.environmentService.extensionDevelopmentLocationURI,
                    languagePack
                ]);
                scannedExtensions.forEach((extension) => {
                    extension.extensionLocation = URI.revive(extension.extensionLocation);
                });
                return scannedExtensions;
            }, []);
        }
        catch (error) {
            this.logService.error(error);
            return [];
        }
    }
    withChannel(callback, fallback) {
        const connection = this.remoteAgentService.getConnection();
        if (!connection) {
            return Promise.resolve(fallback);
        }
        return connection.withChannel(RemoteExtensionsScannerChannelName, (channel) => callback(channel));
    }
};
RemoteExtensionsScannerService = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, IUserDataProfileService),
    __param(3, IRemoteUserDataProfilesService),
    __param(4, IActiveLanguagePackService),
    __param(5, IWorkbenchExtensionManagementService),
    __param(6, ILogService)
], RemoteExtensionsScannerService);
registerSingleton(IRemoteExtensionsScannerService, RemoteExtensionsScannerService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVFeHRlbnNpb25zU2Nhbm5lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM5RCxPQUFPLEVBQUUsK0JBQStCLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNwSixPQUFPLEtBQUssUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBR2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN4RyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxvQ0FBb0MsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBSS9HLElBQU0sOEJBQThCLEdBQXBDLE1BQU0sOEJBQThCO0lBSW5DLFlBQ3VDLGtCQUF1QyxFQUM5QixrQkFBZ0QsRUFDckQsc0JBQStDLEVBQ3hDLDZCQUE2RCxFQUNqRSx5QkFBcUQsRUFDM0MsMEJBQWdFLEVBQ3pGLFVBQXVCO1FBTmYsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQjtRQUM5Qix1QkFBa0Is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