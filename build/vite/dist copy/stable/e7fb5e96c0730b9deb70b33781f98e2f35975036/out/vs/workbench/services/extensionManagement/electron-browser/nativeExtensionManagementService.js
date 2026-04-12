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
import { IAllowedExtensionsService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { joinPath } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IDownloadService } from '../../../../platform/download/common/download.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ProfileAwareExtensionManagementChannelClient } from '../common/extensionManagementChannelClient.js';
import { ExtensionIdentifier, isResolverExtension } from '../../../../platform/extensions/common/extensions.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
let NativeExtensionManagementService = class NativeExtensionManagementService extends ProfileAwareExtensionManagementChannelClient {
    constructor(channel, productService, allowedExtensionsService, userDataProfileService, uriIdentityService, fileService, downloadService, nativeEnvironmentService, logService) {
        super(channel, productService, allowedExtensionsService, userDataProfileService, uriIdentityService);
        this.fileService = fileService;
        this.downloadService = downloadService;
        this.nativeEnvironmentService = nativeEnvironmentService;
        this.logService = logService;
    }
    filterEvent(profileLocation, isApplicationScoped) {
        return isApplicationScoped || this.uriIdentityService.extUri.isEqual(this.userDataProfileService.currentProfile.extensionsResource, profileLocation);
    }
    async install(vsix, options) {
        const { location, cleanup } = await this.downloadVsix(vsix);
        try {
            return await super.install(location, options);
        }
        finally {
            await cleanup();
        }
    }
    async downloadVsix(vsix) {
        if (vsix.scheme === Schemas.file) {
            return { location: vsix, async cleanup() { } };
        }
        this.logService.trace('Downloading extension from', vsix.toString());
        const location = joinPath(this.nativeEnvironmentService.extensionsDownloadLocation, generateUuid());
        await this.downloadService.download(vsix, location, 'extensionManagement.downloadNativeVsix');
        this.logService.info('Downloaded extension to', location.toString());
        const cleanup = async () => {
            try {
                await this.fileService.del(location);
            }
            catch (error) {
                this.logService.error(error);
            }
        };
        return { location, cleanup };
    }
    async switchExtensionsProfile(previousProfileLocation, currentProfileLocation, preserveExtensions) {
        if (this.nativeEnvironmentService.remoteAuthority) {
            const previousInstalledExtensions = await this.getInstalled(1 /* ExtensionType.User */, previousProfileLocation);
            const resolverExtension = previousInstalledExtensions.find(e => isResolverExtension(e.manifest, this.nativeEnvironmentService.remoteAuthority));
            if (resolverExtension) {
                if (!preserveExtensions) {
                    preserveExtensions = [];
                }
                preserveExtensions.push(new ExtensionIdentifier(resolverExtension.identifier.id));
            }
        }
        return super.switchExtensionsProfile(previousProfileLocation, currentProfileLocation, preserveExtensions);
    }
};
NativeExtensionManagementService = __decorate([
    __param(1, IProductService),
    __param(2, IAllowedExtensionsService),
    __param(3, IUserDataProfileService),
    __param(4, IUriIdentityService),
    __param(5, IFileService),
    __param(6, IDownloadService),
    __param(7, INativeWorkbenchEnvironmentService),
    __param(8, ILogService)
], NativeExtensionManagementService);
export { NativeExtensionManagementService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9lbGVjdHJvbi1icm93c2VyL25hdGl2ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBS2hHLE9BQU8sRUFBRSx5QkFBeUIsRUFBbUMsTUFBTSx3RUFBd0UsQ0FBQztBQUNwSixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSw0Q0FBNEMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdHLE9BQU8sRUFBRSxtQkFBbUIsRUFBaUIsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMvSCxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFakYsSUFBTSxnQ0FBZ0MsR0FBdEMsTUFBTSxnQ0FBaUMsU0FBUSw0Q0FB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