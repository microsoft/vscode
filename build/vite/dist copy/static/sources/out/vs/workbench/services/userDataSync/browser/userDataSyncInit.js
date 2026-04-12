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
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { AbstractExtensionsInitializer } from '../../../../platform/userDataSync/common/extensionsSync.js';
import { GlobalStateInitializer, UserDataSyncStoreTypeSynchronizer } from '../../../../platform/userDataSync/common/globalStateSync.js';
import { KeybindingsInitializer } from '../../../../platform/userDataSync/common/keybindingsSync.js';
import { SettingsInitializer } from '../../../../platform/userDataSync/common/settingsSync.js';
import { SnippetsInitializer } from '../../../../platform/userDataSync/common/snippetsSync.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { UserDataSyncStoreClient } from '../../../../platform/userDataSync/common/userDataSyncStoreService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IUserDataSyncLogService, IUserDataSyncStoreManagementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { getCurrentAuthenticationSessionInfo } from '../../authentication/browser/authenticationService.js';
import { getSyncAreaLabel } from '../common/userDataSync.js';
import { isWeb } from '../../../../base/common/platform.js';
import { Barrier, Promises } from '../../../../base/common/async.js';
import { EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT, IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionService, toExtensionDescription } from '../../extensions/common/extensions.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IIgnoredExtensionsManagementService } from '../../../../platform/userDataSync/common/ignoredExtensions.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IExtensionStorageService } from '../../../../platform/extensionManagement/common/extensionStorage.js';
import { TasksInitializer } from '../../../../platform/userDataSync/common/tasksSync.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
let UserDataSyncInitializer = class UserDataSyncInitializer {
    constructor(environmentService, secretStorageService, userDataSyncStoreManagementService, fileService, userDataProfilesService, storageService, productService, requestService, logService, uriIdentityService) {
        this.environmentService = environmentService;
        this.secretStorageService = secretStorageService;
        this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
        this.fileService = fileService;
        this.userDataProfilesService = userDataProfilesService;
        this.storageService = storageService;
        this.productService = productService;
        this.requestService = requestService;
        this.logService = logService;
        this.uriIdentityService = uriIdentityService;
        this.initialized = [];
        this.initializationFinished = new Barrier();
        this.globalStateUserData = null;
        this.createUserDataSyncStoreClient().then(userDataSyncStoreClient => {
            if (!userDataSyncStoreClient) {
                this.initializationFinished.open();
            }
        });
    }
    createUserDataSyncStoreClient() {
        if (!this._userDataSyncStoreClientPromise) {
            this._userDataSyncStoreClientPromise = (async () => {
                try {
                    if (!isWeb) {
                        this.logService.trace(`Skipping initializing user data in desktop`);
                        return;
                    }
                    if (!this.storageService.isNew(-1 /* StorageScope.APPLICATION */)) {
                        this.logService.trace(`Skipping initializing user data as application was opened before`);
                        return;
                    }
                    if (!this.storageService.isNew(1 /* StorageScope.WORKSPACE */)) {
                        this.logService.trace(`Skipping initializing user data as workspace was opened before`);
                        return;
                    }
                    if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider && !this.environmentService.options.settingsSyncOptions.enabled) {
                        this.logService.trace(`Skipping initializing user data as settings sync is disabled`);
                        return;
                    }
                    let authenticationSession;
                    try {
                        authenticationSession = await getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService);
                    }
                    catch (error) {
                        this.logService.error(error);
                    }
                    if (!authenticationSession) {
                        this.logService.trace(`Skipping initializing user data as authentication session is not set`);
                        return;
                    }
                    await this.initializeUserDataSyncStore(authenticationSession);
                    const userDataSyncStore = this.userDataSyncStoreManagementService.userDataSyncStore;
                    if (!userDataSyncStore) {
                        this.logService.trace(`Skipping initializing user data as sync service is not provided`);
                        return;
                    }
                    const userDataSyncStoreClient = new UserDataSyncStoreClient(userDataSyncStore.url, this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService);
                    userDataSyncStoreClient.setAuthToken(authenticationSession.accessToken, authenticationSession.providerId);
                    const manifest = await userDataSyncStoreClient.manifest(null);
                    if (manifest === null) {
                        userDataSyncStoreClient.dispose();
                        this.logService.trace(`Skipping initializing user data as there is no data`);
                        return;
                    }
                    this.logService.info(`Using settings sync service ${userDataSyncStore.url.toString()} for initialization`);
                    return userDataSyncStoreClient;
                }
                catch (error) {
                    this.logService.error(error);
                    return;
                }
            })();
        }
        return this._userDataSyncStoreClientPromise;
    }
    async initializeUserDataSyncStore(authenticationSession) {
        const userDataSyncStore = this.userDataSyncStoreManagementService.userDataSyncStore;
        if (!userDataSyncStore?.canSwitch) {
            return;
        }
        const disposables = new DisposableStore();
        try {
            const userDataSyncStoreClient = disposables.add(new UserDataSyncStoreClient(userDataSyncStore.url, this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService));
            userDataSyncStoreClient.setAuthToken(authenticationSession.accessToken, authenticationSession.providerId);
            // Cache global state data for global state initialization
            this.globalStateUserData = await userDataSyncStoreClient.readResource("globalState" /* SyncResource.GlobalState */, null);
            if (this.globalStateUserData) {
                const userDataSyncStoreType = new UserDataSyncStoreTypeSynchronizer(userDataSyncStoreClient, this.storageService, this.environmentService, this.fileService, this.logService).getSyncStoreType(this.globalStateUserData);
                if (userDataSyncStoreType) {
                    await this.userDataSyncStoreManagementService.switch(userDataSyncStoreType);
                    // Unset cached global state data if urls are changed
                    if (!isEqual(userDataSyncStore.url, this.userDataSyncStoreManagementService.userDataSyncStore?.url)) {
                        this.logService.info('Switched settings sync store');
                        this.globalStateUserData = null;
                    }
                }
            }
        }
        finally {
            disposables.dispose();
        }
    }
    async whenInitializationFinished() {
        await this.initializationFinished.wait();
    }
    async requiresInitialization() {
        this.logService.trace(`UserDataInitializationService#requiresInitialization`);
        const userDataSyncStoreClient = await this.createUserDataSyncStoreClient();
        return !!userDataSyncStoreClient;
    }
    async initializeRequiredResources() {
        this.logService.trace(`UserDataInitializationService#initializeRequiredResources`);
        return this.initialize(["settings" /* SyncResource.Settings */, "globalState" /* SyncResource.GlobalState */]);
    }
    async initializeOtherResources(instantiationService) {
        try {
            this.logService.trace(`UserDataInitializationService#initializeOtherResources`);
            await Promise.allSettled([this.initialize(["keybindings" /* SyncResource.Keybindings */, "snippets" /* SyncResource.Snippets */, "tasks" /* SyncResource.Tasks */]), this.initializeExtensions(instantiationService)]);
        }
        finally {
            this.initializationFinished.open();
        }
    }
    async initializeExtensions(instantiationService) {
        try {
            await Promise.all([this.initializeInstalledExtensions(instantiationService), this.initializeNewExtensions(instantiationService)]);
        }
        finally {
            this.initialized.push("extensions" /* SyncResource.Extensions */);
        }
    }
    async initializeInstalledExtensions(instantiationService) {
        if (!this.initializeInstalledExtensionsPromise) {
            this.initializeInstalledExtensionsPromise = (async () => {
                this.logService.trace(`UserDataInitializationService#initializeInstalledExtensions`);
                const extensionsPreviewInitializer = await this.getExtensionsPreviewInitializer(instantiationService);
                if (extensionsPreviewInitializer) {
                    await instantiationService.createInstance(InstalledExtensionsInitializer, extensionsPreviewInitializer).initialize();
                }
            })();
        }
        return this.initializeInstalledExtensionsPromise;
    }
    async initializeNewExtensions(instantiationService) {
        if (!this.initializeNewExtensionsPromise) {
            this.initializeNewExtensionsPromise = (async () => {
                this.logService.trace(`UserDataInitializationService#initializeNewExtensions`);
                const extensionsPreviewInitializer = await this.getExtensionsPreviewInitializer(instantiationService);
                if (extensionsPreviewInitializer) {
                    await instantiationService.createInstance(NewExtensionsInitializer, extensionsPreviewInitializer).initialize();
                }
            })();
        }
        return this.initializeNewExtensionsPromise;
    }
    getExtensionsPreviewInitializer(instantiationService) {
        if (!this.extensionsPreviewInitializerPromise) {
            this.extensionsPreviewInitializerPromise = (async () => {
                const userDataSyncStoreClient = await this.createUserDataSyncStoreClient();
                if (!userDataSyncStoreClient) {
                    return null;
                }
                const userData = await userDataSyncStoreClient.readResource("extensions" /* SyncResource.Extensions */, null);
                return instantiationService.createInstance(ExtensionsPreviewInitializer, userData);
            })();
        }
        return this.extensionsPreviewInitializerPromise;
    }
    async initialize(syncResources) {
        const userDataSyncStoreClient = await this.createUserDataSyncStoreClient();
        if (!userDataSyncStoreClient) {
            return;
        }
        await Promises.settled(syncResources.map(async (syncResource) => {
            try {
                if (this.initialized.includes(syncResource)) {
                    this.logService.info(`${getSyncAreaLabel(syncResource)} initialized already.`);
                    return;
                }
                this.initialized.push(syncResource);
                this.logService.trace(`Initializing ${getSyncAreaLabel(syncResource)}`);
                const initializer = this.createSyncResourceInitializer(syncResource);
                const userData = await userDataSyncStoreClient.readResource(syncResource, syncResource === "globalState" /* SyncResource.GlobalState */ ? this.globalStateUserData : null);
                await initializer.initialize(userData);
                this.logService.info(`Initialized ${getSyncAreaLabel(syncResource)}`);
            }
            catch (error) {
                this.logService.info(`Error while initializing ${getSyncAreaLabel(syncResource)}`);
                this.logService.error(error);
            }
        }));
    }
    createSyncResourceInitializer(syncResource) {
        switch (syncResource) {
            case "settings" /* SyncResource.Settings */: return new SettingsInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
            case "keybindings" /* SyncResource.Keybindings */: return new KeybindingsInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
            case "tasks" /* SyncResource.Tasks */: return new TasksInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
            case "snippets" /* SyncResource.Snippets */: return new SnippetsInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
            case "globalState" /* SyncResource.GlobalState */: return new GlobalStateInitializer(this.storageService, this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.uriIdentityService);
        }
        throw new Error(`Cannot create initializer for ${syncResource}`);
    }
};
UserDataSyncInitializer = __decorate([
    __param(0, IBrowserWorkbenchEnvironmentService),
    __param(1, ISecretStorageService),
    __param(2, IUserDataSyncStoreManagementService),
    __param(3, IFileService),
    __param(4, IUserDataProfilesService),
    __param(5, IStorageService),
    __param(6, IProductService),
    __param(7, IRequestService),
    __param(8, ILogService),
    __param(9, IUriIdentityService)
], UserDataSyncInitializer);
export { UserDataSyncInitializer };
let ExtensionsPreviewInitializer = class ExtensionsPreviewInitializer extends AbstractExtensionsInitializer {
    constructor(extensionsData, extensionManagementService, ignoredExtensionsManagementService, fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService) {
        super(extensionManagementService, ignoredExtensionsManagementService, fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService);
        this.extensionsData = extensionsData;
        this.preview = null;
    }
    getPreview() {
        if (!this.previewPromise) {
            this.previewPromise = super.initialize(this.extensionsData).then(() => this.preview);
        }
        return this.previewPromise;
    }
    initialize() {
        throw new Error('should not be called directly');
    }
    async doInitialize(remoteUserData) {
        const remoteExtensions = await this.parseExtensions(remoteUserData);
        if (!remoteExtensions) {
            this.logService.info('Skipping initializing extensions because remote extensions does not exist.');
            return;
        }
        const installedExtensions = await this.extensionManagementService.getInstalled();
        this.preview = this.generatePreview(remoteExtensions, installedExtensions);
    }
};
ExtensionsPreviewInitializer = __decorate([
    __param(1, IExtensionManagementService),
    __param(2, IIgnoredExtensionsManagementService),
    __param(3, IFileService),
    __param(4, IUserDataProfilesService),
    __param(5, IEnvironmentService),
    __param(6, IUserDataSyncLogService),
    __param(7, IStorageService),
    __param(8, IUriIdentityService)
], ExtensionsPreviewInitializer);
let InstalledExtensionsInitializer = class InstalledExtensionsInitializer {
    constructor(extensionsPreviewInitializer, extensionEnablementService, extensionStorageService, logService) {
        this.extensionsPreviewInitializer = extensionsPreviewInitializer;
        this.extensionEnablementService = extensionEnablementService;
        this.extensionStorageService = extensionStorageService;
        this.logService = logService;
    }
    async initialize() {
        const preview = await this.extensionsPreviewInitializer.getPreview();
        if (!preview) {
            return;
        }
        // 1. Initialise already installed extensions state
        for (const installedExtension of preview.installedExtensions) {
            const syncExtension = preview.remoteExtensions.find(({ identifier }) => areSameExtensions(identifier, installedExtension.identifier));
            if (syncExtension?.state) {
                const extensionState = this.extensionStorageService.getExtensionState(installedExtension, true) || {};
                Object.keys(syncExtension.state).forEach(key => extensionState[key] = syncExtension.state[key]);
                this.extensionStorageService.setExtensionState(installedExtension, extensionState, true);
            }
        }
        // 2. Initialise extensions enablement
        if (preview.disabledExtensions.length) {
            for (const identifier of preview.disabledExtensions) {
                this.logService.trace(`Disabling extension...`, identifier.id);
                await this.extensionEnablementService.disableExtension(identifier);
                this.logService.info(`Disabling extension`, identifier.id);
            }
        }
    }
};
InstalledExtensionsInitializer = __decorate([
    __param(1, IGlobalExtensionEnablementService),
    __param(2, IExtensionStorageService),
    __param(3, IUserDataSyncLogService)
], InstalledExtensionsInitializer);
let NewExtensionsInitializer = class NewExtensionsInitializer {
    constructor(extensionsPreviewInitializer, extensionService, extensionStorageService, galleryService, extensionManagementService, logService) {
        this.extensionsPreviewInitializer = extensionsPreviewInitializer;
        this.extensionService = extensionService;
        this.extensionStorageService = extensionStorageService;
        this.galleryService = galleryService;
        this.extensionManagementService = extensionManagementService;
        this.logService = logService;
    }
    async initialize() {
        const preview = await this.extensionsPreviewInitializer.getPreview();
        if (!preview) {
            return;
        }
        const newlyEnabledExtensions = [];
        const targetPlatform = await this.extensionManagementService.getTargetPlatform();
        const galleryExtensions = await this.galleryService.getExtensions(preview.newExtensions, { targetPlatform, compatible: true }, CancellationToken.None);
        for (const galleryExtension of galleryExtensions) {
            try {
                const extensionToSync = preview.remoteExtensions.find(({ identifier }) => areSameExtensions(identifier, galleryExtension.identifier));
                if (!extensionToSync) {
                    continue;
                }
                if (extensionToSync.state) {
                    this.extensionStorageService.setExtensionState(galleryExtension, extensionToSync.state, true);
                }
                this.logService.trace(`Installing extension...`, galleryExtension.identifier.id);
                const local = await this.extensionManagementService.installFromGallery(galleryExtension, {
                    isMachineScoped: false, /* set isMachineScoped to prevent install and sync dialog in web */
                    donotIncludePackAndDependencies: true,
                    installGivenVersion: !!extensionToSync.version,
                    installPreReleaseVersion: extensionToSync.preRelease,
                    context: { [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
                });
                if (!preview.disabledExtensions.some(identifier => areSameExtensions(identifier, galleryExtension.identifier))) {
                    newlyEnabledExtensions.push(local);
                }
                this.logService.info(`Installed extension.`, galleryExtension.identifier.id);
            }
            catch (error) {
                this.logService.error(error);
            }
        }
        const canEnabledExtensions = newlyEnabledExtensions.filter(e => this.extensionService.canAddExtension(toExtensionDescription(e)));
        if (!(await this.areExtensionsRunning(canEnabledExtensions))) {
            await new Promise((c, e) => {
                const disposable = this.extensionService.onDidChangeExtensions(async () => {
                    try {
                        if (await this.areExtensionsRunning(canEnabledExtensions)) {
                            disposable.dispose();
                            c();
                        }
                    }
                    catch (error) {
                        e(error);
                    }
                });
            });
        }
    }
    async areExtensionsRunning(extensions) {
        await this.extensionService.whenInstalledExtensionsRegistered();
        const runningExtensions = this.extensionService.extensions;
        return extensions.every(e => runningExtensions.some(r => areSameExtensions({ id: r.identifier.value }, e.identifier)));
    }
};
NewExtensionsInitializer = __decorate([
    __param(1, IExtensionService),
    __param(2, IExtensionStorageService),
    __param(3, IExtensionGalleryService),
    __param(4, IExtensionManagementService),
    __param(5, IUserDataSyncLogService)
], NewExtensionsInitializer);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jSW5pdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVN5bmMvYnJvd3Nlci91c2VyRGF0YVN5bmNJbml0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQWdCLE1BQU0sZ0RBQWdELENBQUM7QUFDL0YsT0FBTyxFQUFFLDZCQUE2QixFQUF1QyxNQUFNLDREQUE0RCxDQUFDO0FBQ2hKLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3hJLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUxRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDL0csT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQWdFLHVCQUF1QixFQUFFLG1DQUFtQyxFQUFnQixNQUFNLDBEQUEwRCxDQUFDO0FBQ3BOLE9BQU8sRUFBNkIsbUNBQW1DLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN2SSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0s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