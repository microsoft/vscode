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
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { GlobalExtensionEnablementService } from '../../../../platform/extensionManagement/common/extensionEnablementService.js';
import { EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUserDataProfileStorageService } from '../../../../platform/userDataProfile/common/userDataProfileStorageService.js';
import { TreeItemCollapsibleState } from '../../../common/views.js';
import { IWorkbenchExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
import { IUserDataProfileService } from '../common/userDataProfile.js';
let ExtensionsResourceInitializer = class ExtensionsResourceInitializer {
    constructor(userDataProfileService, extensionManagementService, extensionGalleryService, extensionEnablementService, logService) {
        this.userDataProfileService = userDataProfileService;
        this.extensionManagementService = extensionManagementService;
        this.extensionGalleryService = extensionGalleryService;
        this.extensionEnablementService = extensionEnablementService;
        this.logService = logService;
    }
    async initialize(content) {
        const profileExtensions = JSON.parse(content);
        const installedExtensions = await this.extensionManagementService.getInstalled(undefined, this.userDataProfileService.currentProfile.extensionsResource);
        const extensionsToEnableOrDisable = [];
        const extensionsToInstall = [];
        for (const e of profileExtensions) {
            const isDisabled = this.extensionEnablementService.getDisabledExtensions().some(disabledExtension => areSameExtensions(disabledExtension, e.identifier));
            const installedExtension = installedExtensions.find(installed => areSameExtensions(installed.identifier, e.identifier));
            if (!installedExtension || (!installedExtension.isBuiltin && installedExtension.preRelease !== e.preRelease)) {
                extensionsToInstall.push(e);
            }
            if (isDisabled !== !!e.disabled) {
                extensionsToEnableOrDisable.push({ extension: e.identifier, enable: !e.disabled });
            }
        }
        const extensionsToUninstall = installedExtensions.filter(extension => !extension.isBuiltin && !profileExtensions.some(({ identifier }) => areSameExtensions(identifier, extension.identifier)));
        for (const { extension, enable } of extensionsToEnableOrDisable) {
            if (enable) {
                this.logService.trace(`Initializing Profile: Enabling extension...`, extension.id);
                await this.extensionEnablementService.enableExtension(extension);
                this.logService.info(`Initializing Profile: Enabled extension...`, extension.id);
            }
            else {
                this.logService.trace(`Initializing Profile: Disabling extension...`, extension.id);
                await this.extensionEnablementService.disableExtension(extension);
                this.logService.info(`Initializing Profile: Disabled extension...`, extension.id);
            }
        }
        if (extensionsToInstall.length) {
            const galleryExtensions = await this.extensionGalleryService.getExtensions(extensionsToInstall.map(e => ({ ...e.identifier, version: e.version, hasPreRelease: e.version ? undefined : e.preRelease })), CancellationToken.None);
            await Promise.all(extensionsToInstall.map(async (e) => {
                const extension = galleryExtensions.find(galleryExtension => areSameExtensions(galleryExtension.identifier, e.identifier));
                if (!extension) {
                    return;
                }
                if (await this.extensionManagementService.canInstall(extension) === true) {
                    this.logService.trace(`Initializing Profile: Installing extension...`, extension.identifier.id, extension.version);
                    await this.extensionManagementService.installFromGallery(extension, {
                        isMachineScoped: false, /* set isMachineScoped value to prevent install and sync dialog in web */
                        donotIncludePackAndDependencies: true,
                        installGivenVersion: !!e.version,
                        installPreReleaseVersion: e.preRelease,
                        profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
                        context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true, [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
                    });
                    this.logService.info(`Initializing Profile: Installed extension...`, extension.identifier.id, extension.version);
                }
                else {
                    this.logService.info(`Initializing Profile: Skipped installing extension because it cannot be installed.`, extension.identifier.id);
                }
            }));
        }
        if (extensionsToUninstall.length) {
            await Promise.all(extensionsToUninstall.map(e => this.extensionManagementService.uninstall(e)));
        }
    }
};
ExtensionsResourceInitializer = __decorate([
    __param(0, IUserDataProfileService),
    __param(1, IExtensionManagementService),
    __param(2, IExtensionGalleryService),
    __param(3, IGlobalExtensionEnablementService),
    __param(4, ILogService)
], ExtensionsResourceInitializer);
export { ExtensionsResourceInitializer };
let ExtensionsResource = class ExtensionsResource {
    constructor(extensionManagementService, extensionGalleryService, userDataProfileStorageService, instantiationService, logService) {
        this.extensionManagementService = extensionManagementService;
        this.extensionGalleryService = extensionGalleryService;
        this.userDataProfileStorageService = userDataProfileStorageService;
        this.instantiationService = instantiationService;
        this.logService = logService;
    }
    async getContent(profile, exclude) {
        const extensions = await this.getLocalExtensions(profile);
        return this.toContent(extensions, exclude);
    }
    toContent(extensions, exclude) {
        return JSON.stringify(exclude?.length ? extensions.filter(e => !exclude.includes(e.identifier.id.toLowerCase())) : extensions);
    }
    async apply(content, profile, progress, token) {
        return this.withProfileScopedServices(profile, async (extensionEnablementService) => {
            const profileExtensions = await this.getProfileExtensions(content);
            const installedExtensions = await this.extensionManagementService.getInstalled(undefined, profile.extensionsResource);
            const extensionsToEnableOrDisable = [];
            const extensionsToInstall = [];
            for (const e of profileExtensions) {
                const isDisabled = extensionEnablementService.getDisabledExtensions().some(disabledExtension => areSameExtensions(disabledExtension, e.identifier));
                const installedExtension = installedExtensions.find(installed => areSameExtensions(installed.identifier, e.identifier));
                if (!installedExtension || (!installedExtension.isBuiltin && installedExtension.preRelease !== e.preRelease)) {
                    extensionsToInstall.push(e);
                }
                if (isDisabled !== !!e.disabled) {
                    extensionsToEnableOrDisable.push({ extension: e.identifier, enable: !e.disabled });
                }
            }
            const extensionsToUninstall = installedExtensions.filter(extension => !extension.isBuiltin && !profileExtensions.some(({ identifier }) => areSameExtensions(identifier, extension.identifier)) && !extension.isApplicationScoped);
            for (const { extension, enable } of extensionsToEnableOrDisable) {
                if (enable) {
                    this.logService.trace(`Importing Profile (${profile.name}): Enabling extension...`, extension.id);
                    await extensionEnablementService.enableExtension(extension);
                    this.logService.info(`Importing Profile (${profile.name}): Enabled extension...`, extension.id);
                }
                else {
                    this.logService.trace(`Importing Profile (${profile.name}): Disabling extension...`, extension.id);
                    await extensionEnablementService.disableExtension(extension);
                    this.logService.info(`Importing Profile (${profile.name}): Disabled extension...`, extension.id);
                }
            }
            if (extensionsToInstall.length) {
                this.logService.info(`Importing Profile (${profile.name}): Started installing extensions.`);
                const galleryExtensions = await this.extensionGalleryService.getExtensions(extensionsToInstall.map(e => ({ ...e.identifier, version: e.version, hasPreRelease: e.version ? undefined : e.preRelease })), CancellationToken.None);
                const installExtensionInfos = [];
                await Promise.all(extensionsToInstall.map(async (e) => {
                    const extension = galleryExtensions.find(galleryExtension => areSameExtensions(galleryExtension.identifier, e.identifier));
                    if (!extension) {
                        return;
                    }
                    if (await this.extensionManagementService.canInstall(extension) === true) {
                        installExtensionInfos.push({
                            extension,
                            options: {
                                isMachineScoped: false, /* set isMachineScoped value to prevent install and sync dialog in web */
                                donotIncludePackAndDependencies: true,
                                installGivenVersion: !!e.version,
                                installPreReleaseVersion: e.preRelease,
                                profileLocation: profile.extensionsResource,
                                context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true }
                            }
                        });
                    }
                    else {
                        this.logService.info(`Importing Profile (${profile.name}): Skipped installing extension because it cannot be installed.`, extension.identifier.id);
                    }
                }));
                if (installExtensionInfos.length) {
                    if (token) {
                        await this.extensionManagementService.requestPublisherTrust(installExtensionInfos);
                        for (const installExtensionInfo of installExtensionInfos) {
                            if (token.isCancellationRequested) {
                                return;
                            }
                            progress?.(localize('installingExtension', "Installing extension {0}...", installExtensionInfo.extension.displayName ?? installExtensionInfo.extension.identifier.id));
                            await this.extensionManagementService.installFromGallery(installExtensionInfo.extension, installExtensionInfo.options);
                        }
                    }
                    else {
                        await this.extensionManagementService.installGalleryExtensions(installExtensionInfos);
                    }
                }
                this.logService.info(`Importing Profile (${profile.name}): Finished installing extensions.`);
            }
            if (extensionsToUninstall.length) {
                await Promise.all(extensionsToUninstall.map(e => this.extensionManagementService.uninstall(e)));
            }
        });
    }
    async copy(from, to, disableExtensions) {
        await this.extensionManagementService.copyExtensions(from.extensionsResource, to.extensionsResource);
        const extensionsToDisable = await this.withProfileScopedServices(from, async (extensionEnablementService) => extensionEnablementService.getDisabledExtensions());
        if (disableExtensions) {
            const extensions = await this.extensionManagementService.getInstalled(1 /* ExtensionType.User */, to.extensionsResource);
            for (const extension of extensions) {
                extensionsToDisable.push(extension.identifier);
            }
        }
        await this.withProfileScopedServices(to, async (extensionEnablementService) => Promise.all(extensionsToDisable.map(extension => extensionEnablementService.disableExtension(extension))));
    }
    async getLocalExtensions(profile) {
        return this.withProfileScopedServices(profile, async (extensionEnablementService) => {
            const result = new Map();
            const installedExtensions = await this.extensionManagementService.getInstalled(undefined, profile.extensionsResource);
            const disabledExtensions = extensionEnablementService.getDisabledExtensions();
            for (const extension of installedExtensions) {
                const { identifier, preRelease } = extension;
                const disabled = disabledExtensions.some(disabledExtension => areSameExtensions(disabledExtension, identifier));
                if (extension.isBuiltin && !disabled) {
                    // skip enabled builtin extensions
                    continue;
                }
                if (!extension.isBuiltin) {
                    if (!extension.identifier.uuid) {
                        // skip user extensions without uuid
                        continue;
                    }
                }
                const existing = result.get(identifier.id.toLowerCase());
                if (existing?.disabled) {
                    // Remove the duplicate disabled extension
                    result.delete(identifier.id.toLowerCase());
                }
                const profileExtension = { identifier, displayName: extension.manifest.displayName };
                if (disabled) {
                    profileExtension.disabled = true;
                }
                if (!extension.isBuiltin && extension.pinned) {
                    profileExtension.version = extension.manifest.version;
                }
                if (!profileExtension.version && preRelease) {
                    profileExtension.preRelease = true;
                }
                profileExtension.applicationScoped = extension.isApplicationScoped;
                result.set(profileExtension.identifier.id.toLowerCase(), profileExtension);
            }
            return [...result.values()];
        });
    }
    async getProfileExtensions(content) {
        return JSON.parse(content);
    }
    async withProfileScopedServices(profile, fn) {
        return this.userDataProfileStorageService.withProfileScopedStorageService(profile, async (storageService) => {
            const disposables = new DisposableStore();
            const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IStorageService, storageService])));
            const extensionEnablementService = disposables.add(instantiationService.createInstance(GlobalExtensionEnablementService));
            try {
                return await fn(extensionEnablementService);
            }
            finally {
                disposables.dispose();
            }
        });
    }
};
ExtensionsResource = __decorate([
    __param(0, IWorkbenchExtensionManagementService),
    __param(1, IExtensionGalleryService),
    __param(2, IUserDataProfileStorageService),
    __param(3, IInstantiationService),
    __param(4, ILogService)
], ExtensionsResource);
export { ExtensionsResource };
export class ExtensionsResourceTreeItem {
    constructor() {
        this.type = "extensions" /* ProfileResourceType.Extensions */;
        this.handle = "extensions" /* ProfileResourceType.Extensions */;
        this.label = { label: localize('extensions', "Extensions") };
        this.collapsibleState = TreeItemCollapsibleState.Expanded;
        this.contextValue = "extensions" /* ProfileResourceType.Extensions */;
        this.excludedExtensions = new Set();
    }
    async getChildren() {
        const extensions = (await this.getExtensions()).sort((a, b) => (a.displayName ?? a.identifier.id).localeCompare(b.displayName ?? b.identifier.id));
        const that = this;
        return extensions.map(e => ({
            ...e,
            handle: e.identifier.id.toLowerCase(),
            parent: this,
            label: { label: e.displayName || e.identifier.id },
            description: e.applicationScoped ? localize('all profiles and disabled', "All Profiles") : undefined,
            collapsibleState: TreeItemCollapsibleState.None,
            checkbox: that.checkbox ? {
                get isChecked() { return !that.excludedExtensions.has(e.identifier.id.toLowerCase()); },
                set isChecked(value) {
                    if (value) {
                        that.excludedExtensions.delete(e.identifier.id.toLowerCase());
                    }
                    else {
                        that.excludedExtensions.add(e.identifier.id.toLowerCase());
                    }
                },
                tooltip: localize('exclude', "Select {0} Extension", e.displayName || e.identifier.id),
                accessibilityInformation: {
                    label: localize('exclude', "Select {0} Extension", e.displayName || e.identifier.id),
                }
            } : undefined,
            themeIcon: Codicon.extensions,
            command: {
                id: 'extension.open',
                title: '',
                arguments: [e.identifier.id, undefined, true]
            }
        }));
    }
    async hasContent() {
        const extensions = await this.getExtensions();
        return extensions.length > 0;
    }
}
let ExtensionsResourceExportTreeItem = class ExtensionsResourceExportTreeItem extends ExtensionsResourceTreeItem {
    constructor(profile, instantiationService) {
        super();
        this.profile = profile;
        this.instantiationService = instantiationService;
    }
    isFromDefaultProfile() {
        return !this.profile.isDefault && !!this.profile.useDefaultFlags?.extensions;
    }
    getExtensions() {
        return this.instantiationService.createInstance(ExtensionsResource).getLocalExtensions(this.profile);
    }
    async getContent() {
        return this.instantiationService.createInstance(ExtensionsResource).getContent(this.profile, [...this.excludedExtensions.values()]);
    }
};
ExtensionsResourceExportTreeItem = __decorate([
    __param(1, IInstantiationService)
], ExtensionsResourceExportTreeItem);
export { ExtensionsResourceExportTreeItem };
let ExtensionsResourceImportTreeItem = class ExtensionsResourceImportTreeItem extends ExtensionsResourceTreeItem {
    constructor(content, instantiationService) {
        super();
        this.content = content;
        this.instantiationService = instantiationService;
    }
    isFromDefaultProfile() {
        return false;
    }
    getExtensions() {
        return this.instantiationService.createInstance(ExtensionsResource).getProfileExtensions(this.content);
    }
    async getContent() {
        const extensionsResource = this.instantiationService.createInstance(ExtensionsResource);
        const extensions = await extensionsResource.getProfileExtensions(this.content);
        return extensionsResource.toContent(extensions, [...this.excludedExtensions.values()]);
    }
};
ExtensionsResourceImportTreeItem = __decorate([
    __param(1, IInstantiationService)
], ExtensionsResourceImportTreeItem);
export { ExtensionsResourceImportTreeItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc1Jlc291cmNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL2V4dGVuc2lvbnNSZXNvdXJjZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUNqSSxPQUFPLEVBQUUsOENBQThDLEVBQUUsMENBQTBDLEVBQUUsd0JBQXdCLEVBQXdCLDJCQUEyQixFQUFFLGlDQUFpQyxFQUF5QyxNQUFNLHdFQUF3RSxDQUFDO0FBQzNVLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBRS9HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFakYsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sOEVBQThFLENBQUM7QUFDOUgsT0FBTyxFQUEwQix3QkFBd0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzVGLE9BQU8sRUFBRSxvQ0FBb0MsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FB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