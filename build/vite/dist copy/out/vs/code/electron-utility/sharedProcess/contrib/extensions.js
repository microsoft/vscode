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
import { IExtensionGalleryService, IGlobalExtensionEnablementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionStorageService, IExtensionStorageService } from '../../../../platform/extensionManagement/common/extensionStorage.js';
import { migrateUnsupportedExtensions } from '../../../../platform/extensionManagement/common/unsupportedExtensionsMigration.js';
import { INativeServerExtensionManagementService } from '../../../../platform/extensionManagement/node/extensionManagementService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
let ExtensionsContributions = class ExtensionsContributions extends Disposable {
    constructor(extensionManagementService, extensionGalleryService, extensionStorageService, extensionEnablementService, userDataProfilesService, storageService, logService) {
        super();
        this.extensionManagementService = extensionManagementService;
        this.extensionGalleryService = extensionGalleryService;
        this.extensionStorageService = extensionStorageService;
        this.extensionEnablementService = extensionEnablementService;
        this.userDataProfilesService = userDataProfilesService;
        this.logService = logService;
        extensionManagementService.cleanUp();
        this.migrateUnsupportedExtensions();
        ExtensionStorageService.removeOutdatedExtensionVersions(extensionManagementService, storageService);
    }
    async migrateUnsupportedExtensions() {
        for (const profile of this.userDataProfilesService.profiles) {
            await migrateUnsupportedExtensions(profile, this.extensionManagementService, this.extensionGalleryService, this.extensionStorageService, this.extensionEnablementService, this.logService);
        }
    }
};
ExtensionsContributions = __decorate([
    __param(0, INativeServerExtensionManagementService),
    __param(1, IExtensionGalleryService),
    __param(2, IExtensionStorageService),
    __param(3, IGlobalExtensionEnablementService),
    __param(4, IUserDataProfilesService),
    __param(5, IStorageService),
    __param(6, ILogService)
], ExtensionsContributions);
export { ExtensionsContributions };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2NvZGUvZWxlY3Ryb24tdXRpbGl0eS9zaGFyZWRQcm9jZXNzL2NvbnRyaWIvZXh0ZW5zaW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLGlDQUFpQyxFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDckosT0FBTyxFQUFFLHVCQUF1QixFQUFFLHdCQUF3QixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDeEksT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sbUZBQW1GLENBQUM7QUFDakksT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkVBQTZFLENBQUM7QUFDdEksT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUVuRyxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF3QixTQUFRLFVBQVU7SUFDdEQsWUFDMkQsMEJBQW1FLEVBQ2xGLHVCQUFpRCxFQUNqRCx1QkFBaUQsRUFDeEMsMEJBQTZELEVBQ3RFLHVCQUFpRCxFQUMzRSxjQUErQixFQUNsQixVQUF1QjtRQUVyRCxLQUFLLEVBQUUsQ0FBQztRQVJrRCwrQkFBMEIsR0FBMUIsMEJBQTBCLENBQXlDO1FBQ2xGLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBMEI7UUFDakQsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUEwQjtRQUN4QywrQkFBMEIsR0FBMUIsMEJBQTBCLENBQW1DO1FBQ3RFLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBMEI7UUFFOUQsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUlyRCwwQkFBMEIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUVyQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztRQUNwQyx1QkFBdUIsQ0FBQywrQkFBK0IsQ0FBQywwQkFBMEIsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUNyRyxDQUFDO0lBRU8sS0FBSyxDQUFDLDRCQUE0QjtRQUN6QyxLQUFLLE1BQU0sT0FBTyxJQUFJLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUM3RCxNQUFNLDRCQUE0QixDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLHVCQUF1QixFQUFFLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLENBQUMsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzVMLENBQUM7SUFDRixDQUFDO0NBRUQsQ0FBQTtBQXhCWSx1QkFBdUI7SUFFakMsV0FBQSx1Q0FBdUMsQ0FBQTtJQUN2QyxXQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSxpQ0FBaUMsQ0FBQTtJQUNqQyxXQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxXQUFXLENBQUE7R0FSRCx1QkFBdUIsQ0F3Qm5DIn0=