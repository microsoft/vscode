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
var InstallExtensionQuickAccessProvider_1, ManageExtensionsQuickAccessProvider_1;
import { PickerQuickAccessProvider } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { localize } from '../../../../nls.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IExtensionsWorkbenchService } from '../common/extensions.js';
let InstallExtensionQuickAccessProvider = class InstallExtensionQuickAccessProvider extends PickerQuickAccessProvider {
    static { InstallExtensionQuickAccessProvider_1 = this; }
    static { this.PREFIX = 'ext install '; }
    constructor(extensionsWorkbenchService, galleryService, extensionsService, notificationService, logService) {
        super(InstallExtensionQuickAccessProvider_1.PREFIX);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.galleryService = galleryService;
        this.extensionsService = extensionsService;
        this.notificationService = notificationService;
        this.logService = logService;
    }
    _getPicks(filter, disposables, token) {
        // Nothing typed
        if (!filter) {
            return [{
                    label: localize('type', "Type an extension name to install or search.")
                }];
        }
        const genericSearchPickItem = {
            label: localize('searchFor', "Press Enter to search for extension '{0}'.", filter),
            accept: () => this.extensionsWorkbenchService.openSearch(filter)
        };
        // Extension ID typed: try to find it
        if (/\./.test(filter)) {
            return this.getPicksForExtensionId(filter, genericSearchPickItem, token);
        }
        // Extension name typed: offer to search it
        return [genericSearchPickItem];
    }
    async getPicksForExtensionId(filter, fallback, token) {
        try {
            const [galleryExtension] = await this.galleryService.getExtensions([{ id: filter }], token);
            if (token.isCancellationRequested) {
                return []; // return early if canceled
            }
            if (!galleryExtension) {
                return [fallback];
            }
            return [{
                    label: localize('install', "Press Enter to install extension '{0}'.", filter),
                    accept: () => this.installExtension(galleryExtension, filter)
                }];
        }
        catch (error) {
            if (token.isCancellationRequested) {
                return []; // expected error
            }
            this.logService.error(error);
            return [fallback];
        }
    }
    async installExtension(extension, name) {
        try {
            await this.extensionsWorkbenchService.openSearch(`@id:${name}`);
            await this.extensionsService.installFromGallery(extension);
        }
        catch (error) {
            this.notificationService.error(error);
        }
    }
};
InstallExtensionQuickAccessProvider = InstallExtensionQuickAccessProvider_1 = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IExtensionGalleryService),
    __param(2, IExtensionManagementService),
    __param(3, INotificationService),
    __param(4, ILogService)
], InstallExtensionQuickAccessProvider);
export { InstallExtensionQuickAccessProvider };
let ManageExtensionsQuickAccessProvider = class ManageExtensionsQuickAccessProvider extends PickerQuickAccessProvider {
    static { ManageExtensionsQuickAccessProvider_1 = this; }
    static { this.PREFIX = 'ext '; }
    constructor(extensionsWorkbenchService) {
        super(ManageExtensionsQuickAccessProvider_1.PREFIX);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
    }
    _getPicks() {
        return [{
                label: localize('manage', "Press Enter to manage your extensions."),
                accept: () => this.extensionsWorkbenchService.openSearch('')
            }];
    }
};
ManageExtensionsQuickAccessProvider = ManageExtensionsQuickAccessProvider_1 = __decorate([
    __param(0, IExtensionsWorkbenchService)
], ManageExtensionsQuickAccessProvider);
export { ManageExtensionsQuickAccessProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc1F1aWNrQWNjZXNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNRdWlja0FjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUEwQix5QkFBeUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRWpJLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsMkJBQTJCLEVBQXFCLE1BQU0sd0VBQXdFLENBQUM7QUFDbEssT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXJFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRS9ELElBQU0sbUNBQW1DLEdBQXpDLE1BQU0sbUNBQW9DLFNBQVEseUJBQWlEOzthQUVsRyxXQUFNLEdBQUcsY0FBYyxBQUFqQixDQUFrQjtJQUUvQixZQUMrQywwQkFBdUQsRUFDMUQsY0FBd0MsRUFDckMsaUJBQThDLEVBQ3JELG1CQUF5QyxFQUNsRCxVQUF1QjtRQUVyRCxLQUFLLENBQUMscUNBQW1DLENBQUMsTUFBTSxDQUFDLENBQUM7UUFOSiwrQkFBMEIsR0FBMUIsMEJBQTBCLENBQTZCO1FBQzFELG1CQUFjLEdBQWQsY0FBYyxDQUEwQjtRQUNyQyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQTZCO1FBQ3JELHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBc0I7UUFDbEQsZUFBVSxHQUFWLFVBQVUsQ0FBYTtJQUd0RCxDQUFDO0lBRVMsU0FBUyxDQUFDLE1BQWMsRUFBRSxXQUE0QixFQUFFLEtB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