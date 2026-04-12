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
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT, IExtensionGalleryService, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { REMOTE_DEFAULT_IF_LOCAL_EXTENSIONS } from '../../../../platform/remote/common/remote.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IRemoteExtensionsScannerService } from '../../../../platform/remote/common/remoteExtensionsScanner.js';
import { IStorageService, IS_NEW_KEY } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { AbstractExtensionsInitializer } from '../../../../platform/userDataSync/common/extensionsSync.js';
import { IIgnoredExtensionsManagementService } from '../../../../platform/userDataSync/common/ignoredExtensions.js';
import { IUserDataSyncEnablementService, IUserDataSyncStoreManagementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { UserDataSyncStoreClient } from '../../../../platform/userDataSync/common/userDataSyncStoreService.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IExtensionManagementServerService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../services/extensions/common/extensionManifestPropertiesService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { IExtensionsWorkbenchService } from '../common/extensions.js';
let InstallRemoteExtensionsContribution = class InstallRemoteExtensionsContribution {
    constructor(remoteAgentService, remoteExtensionsScannerService, extensionGalleryService, extensionManagementServerService, extensionsWorkbenchService, logService, configurationService) {
        this.remoteAgentService = remoteAgentService;
        this.remoteExtensionsScannerService = remoteExtensionsScannerService;
        this.extensionGalleryService = extensionGalleryService;
        this.extensionManagementServerService = extensionManagementServerService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.logService = logService;
        this.configurationService = configurationService;
        this.installExtensionsIfInstalledLocallyInRemote();
        this.installFailedRemoteExtensions();
    }
    async installExtensionsIfInstalledLocallyInRemote() {
        if (!this.remoteAgentService.getConnection()) {
            return;
        }
        if (!this.extensionManagementServerService.remoteExtensionManagementServer) {
            this.logService.error('No remote extension management server available');
            return;
        }
        if (!this.extensionManagementServerService.localExtensionManagementServer) {
            this.logService.error('No local extension management server available');
            return;
        }
        const settingValue = this.configurationService.getValue(REMOTE_DEFAULT_IF_LOCAL_EXTENSIONS);
        if (!settingValue?.length) {
            return;
        }
        const alreadyInstalledLocally = await this.extensionsWorkbenchService.queryLocal(this.extensionManagementServerService.localExtensionManagementServer);
        const alreadyInstalledRemotely = await this.extensionsWorkbenchService.queryLocal(this.extensionManagementServerService.remoteExtensionManagementServer);
        const extensionsToInstall = alreadyInstalledLocally
            .filter(ext => settingValue.some(id => areSameExtensions(ext.identifier, { id })))
            .filter(ext => !alreadyInstalledRemotely.some(e => areSameExtensions(e.identifier, ext.identifier)));
        if (!extensionsToInstall.length) {
            return;
        }
        await Promise.allSettled(extensionsToInstall.map(ext => {
            this.extensionsWorkbenchService.installInServer(ext, this.extensionManagementServerService.remoteExtensionManagementServer, { donotIncludePackAndDependencies: true });
        }));
    }
    async installFailedRemoteExtensions() {
        if (!this.remoteAgentService.getConnection()) {
            return;
        }
        const { failed } = await this.remoteExtensionsScannerService.whenExtensionsReady();
        if (failed.length === 0) {
            this.logService.trace('No extensions relayed from server');
            return;
        }
        if (!this.extensionManagementServerService.remoteExtensionManagementServer) {
            this.logService.error('No remote extension management server available');
            return;
        }
        this.logService.info(`Installing '${failed.length}' extensions relayed from server`);
        const galleryExtensions = await this.extensionGalleryService.getExtensions(failed.map(({ id }) => ({ id })), CancellationToken.None);
        const installExtensionInfo = [];
        for (const { id, installOptions } of failed) {
            const extension = galleryExtensions.find(e => areSameExtensions(e.identifier, { id }));
            if (extension) {
                installExtensionInfo.push({
                    extension, options: {
                        ...installOptions,
                        downloadExtensionsLocally: true,
                    }
                });
            }
            else {
                this.logService.warn(`Relayed failed extension '${id}' from server is not found in the gallery`);
            }
        }
        if (installExtensionInfo.length) {
            await Promise.allSettled(installExtensionInfo.map(e => this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.installFromGallery(e.extension, e.options)));
        }
    }
};
InstallRemoteExtensionsContribution = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, IRemoteExtensionsScannerService),
    __param(2, IExtensionGalleryService),
    __param(3, IExtensionManagementServerService),
    __param(4, IExtensionsWorkbenchService),
    __param(5, ILogService),
    __param(6, IConfigurationService)
], InstallRemoteExtensionsContribution);
export { InstallRemoteExtensionsContribution };
let RemoteExtensionsInitializerContribution = class RemoteExtensionsInitializerContribution {
    constructor(extensionManagementServerService, storageService, remoteAgentService, userDataSyncStoreManagementService, instantiationService, logService, authenticationService, remoteAuthorityResolverService, userDataSyncEnablementService) {
        this.extensionManagementServerService = extensionManagementServerService;
        this.storageService = storageService;
        this.remoteAgentService = remoteAgentService;
        this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
        this.instantiationService = instantiationService;
        this.logService = logService;
        this.authenticationService = authenticationService;
        this.remoteAuthorityResolverService = remoteAuthorityResolverService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.initializeRemoteExtensions();
    }
    async initializeRemoteExtensions() {
        const connection = this.remoteAgentService.getConnection();
        const localExtensionManagementServer = this.extensionManagementServerService.localExtensionManagementServer;
        const remoteExtensionManagementServer = this.extensionManagementServerService.remoteExtensionManagementServer;
        // Skip: Not a remote window
        if (!connection || !remoteExtensionManagementServer) {
            return;
        }
        // Skip: Not a native window
        if (!localExtensionManagementServer) {
            return;
        }
        // Skip: No UserdataSyncStore is configured
        if (!this.userDataSyncStoreManagementService.userDataSyncStore) {
            return;
        }
        const newRemoteConnectionKey = `${IS_NEW_KEY}.${connection.remoteAuthority}`;
        // Skip: Not a new remote connection
        if (!this.storageService.getBoolean(newRemoteConnectionKey, -1 /* StorageScope.APPLICATION */, true)) {
            this.logService.trace(`Skipping initializing remote extensions because the window with this remote authority was opened before.`);
            return;
        }
        this.storageService.store(newRemoteConnectionKey, false, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        // Skip: Not a new workspace
        if (!this.storageService.isNew(1 /* StorageScope.WORKSPACE */)) {
            this.logService.trace(`Skipping initializing remote extensions because this workspace was opened before.`);
            return;
        }
        // Skip: Settings Sync is disabled
        if (!this.userDataSyncEnablementService.isEnabled()) {
            return;
        }
        // Skip: No account is provided to initialize
        const resolvedAuthority = await this.remoteAuthorityResolverService.resolveAuthority(connection.remoteAuthority);
        if (!resolvedAuthority.options?.authenticationSession) {
            return;
        }
        const sessions = await this.authenticationService.getSessions(resolvedAuthority.options?.authenticationSession.providerId);
        const session = sessions.find(s => s.id === resolvedAuthority.options?.authenticationSession?.id);
        // Skip: Session is not found
        if (!session) {
            this.logService.info('Skipping initializing remote extensions because the account with given session id is not found', resolvedAuthority.options.authenticationSession.id);
            return;
        }
        const userDataSyncStoreClient = this.instantiationService.createInstance(UserDataSyncStoreClient, this.userDataSyncStoreManagementService.userDataSyncStore.url);
        userDataSyncStoreClient.setAuthToken(session.accessToken, resolvedAuthority.options.authenticationSession.providerId);
        const userData = await userDataSyncStoreClient.readResource("extensions" /* SyncResource.Extensions */, null);
        const serviceCollection = new ServiceCollection();
        serviceCollection.set(IExtensionManagementService, remoteExtensionManagementServer.extensionManagementService);
        const instantiationService = this.instantiationService.createChild(serviceCollection);
        const extensionsToInstallInitializer = instantiationService.createInstance(RemoteExtensionsInitializer);
        await extensionsToInstallInitializer.initialize(userData);
    }
};
RemoteExtensionsInitializerContribution = __decorate([
    __param(0, IExtensionManagementServerService),
    __param(1, IStorageService),
    __param(2, IRemoteAgentService),
    __param(3, IUserDataSyncStoreManagementService),
    __param(4, IInstantiationService),
    __param(5, ILogService),
    __param(6, IAuthenticationService),
    __param(7, IRemoteAuthorityResolverService),
    __param(8, IUserDataSyncEnablementService)
], RemoteExtensionsInitializerContribution);
export { RemoteExtensionsInitializerContribution };
let RemoteExtensionsInitializer = class RemoteExtensionsInitializer extends AbstractExtensionsInitializer {
    constructor(extensionManagementService, ignoredExtensionsManagementService, fileService, userDataProfilesService, environmentService, logService, uriIdentityService, extensionGalleryService, storageService, extensionManifestPropertiesService) {
        super(extensionManagementService, ignoredExtensionsManagementService, fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService);
        this.extensionGalleryService = extensionGalleryService;
        this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    }
    async doInitialize(remoteUserData) {
        const remoteExtensions = await this.parseExtensions(remoteUserData);
        if (!remoteExtensions) {
            this.logService.info('No synced extensions exist while initializing remote extensions.');
            return;
        }
        const installedExtensions = await this.extensionManagementService.getInstalled();
        const { newExtensions } = this.generatePreview(remoteExtensions, installedExtensions);
        if (!newExtensions.length) {
            this.logService.trace('No new remote extensions to install.');
            return;
        }
        const targetPlatform = await this.extensionManagementService.getTargetPlatform();
        const extensionsToInstall = await this.extensionGalleryService.getExtensions(newExtensions, { targetPlatform, compatible: true }, CancellationToken.None);
        if (extensionsToInstall.length) {
            await Promise.allSettled(extensionsToInstall.map(async (e) => {
                const manifest = await this.extensionGalleryService.getManifest(e, CancellationToken.None);
                if (manifest && this.extensionManifestPropertiesService.canExecuteOnWorkspace(manifest)) {
                    const syncedExtension = remoteExtensions.find(e => areSameExtensions(e.identifier, e.identifier));
                    await this.extensionManagementService.installFromGallery(e, { installPreReleaseVersion: syncedExtension?.preRelease, donotIncludePackAndDependencies: true, context: { [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true } });
                }
            }));
        }
    }
};
RemoteExtensionsInitializer = __decorate([
    __param(0, IExtensionManagementService),
    __param(1, IIgnoredExtensionsManagementService),
    __param(2, IFileService),
    __param(3, IUserDataProfilesService),
    __param(4, IEnvironmentService),
    __param(5, ILogService),
    __param(6, IUriIdentityService),
    __param(7, IExtensionGalleryService),
    __param(8, IStorageService),
    __param(9, IExtensionManifestPropertiesService)
], RemoteExtensionsInitializer);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlRXh0ZW5zaW9uc0luaXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2VsZWN0cm9uLWJyb3dzZXIvcmVtb3RlRXh0ZW5zaW9uc0luaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLDhDQUE4QyxFQUFFLHdCQUF3QixFQUFFLDJCQUEyQixFQUF3QixNQUFNLHdFQUF3RSxDQUFDO0FBQ3JOLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQy9HLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNuRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEcsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDaEgsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDaEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDMUgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDMUcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDM0csT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDcEgsT0FBTyxFQUFtQiw4QkFBOEIsRUFBRSxtQ0FBbUMsRUFBZ0IsTUFBTSwwREFBMEQsQ0FBQztBQUM5SyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUUvRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUN4SCxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUNoSSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUUvRCxJQUFNLG1DQUFtQyxHQUF6QyxNQUFNLG1DQUFtQztJQUMvQyxZQUN1QyxrQkFBdUMsRUFDM0IsOEJBQStELEVBQ3RFLHVCQUFpRCxFQUN4QyxnQ0FBbUUsRUFDekUsMEJBQXVELEVBQ3ZFLFVBQXVCLEVBQ2Isb0JBQTJDO1FBTjdDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDM0IsbUNBQThCLEdBQTlCLDhCQUE4QixDQUFpQztRQUN0RSw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTBCO1FBQ3hDLHFDQUFnQyxHQUFoQyxnQ0FBZ0MsQ0FBbUM7UUFDekUsK0JBQTBCLEdBQTFCLDBCQUEwQixDQUE2QjtRQUN2RSxlQUFVLEdBQVYsVUFBVSxDQUFhO1FBQ2IseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUVuRixJQUFJLENBQUMsMkNBQTJDLEVBQUUsQ0FBQztRQUNuRCxJQUFJLENBQUMsNkJBQTZCLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0lBRU8sS0FBSyxDQUFDLDJDQUEyQztRQUN4RCxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUM7WUFDOUMsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLCtCQUErQixFQUFFLENBQUM7WUFDNUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsaURBQWlELENBQUMsQ0FBQztZQUN6RSxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsOEJBQThCLEVBQUUsQ0FBQztZQUMzRSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxnREFBZ0QsQ0FBQyxDQUFDO1lBQ3hFLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBVyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQ3RHLElBQUksQ0FBQyxZQUFZLEVBQUUsTUFBTSxFQUFFLENBQUM7WUFDM0IsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLHVCQUF1QixHQUFHLE1BQU0sSUFBSSxDQUFDLDBCQUEwQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUN2SixNQUFNLHdCQUF3QixHQUFHLE1BQU0sSUFBSSxDQUFDLDBCQUEwQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsK0JBQStCLENBQUMsQ0FBQztRQUN6SixNQUFNLG1CQUFtQixHQUFHLHVCQUF1QjthQUNqRCxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQzthQUNqRixNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUd0RyxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDakMsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ3RELElBQUksQ0FBQywwQkFBMEIsQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQywrQkFBZ0MsRUFBRSxFQUFFLCtCQUErQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDekssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxLQUFLLENBQUMsNkJBQTZCO1FBQzFDLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQztZQUM5QyxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQ25GLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO1lBQzNELE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQywrQkFBK0IsRUFBRSxDQUFDO1lBQzVFLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLGlEQUFpRCxDQUFDLENBQUM7WUFDekUsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxlQUFlLE1BQU0sQ0FBQyxNQUFNLGtDQUFrQyxDQUFDLENBQUM7UUFDckYsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckksTUFBTSxvQkFBb0IsR0FBMkIsRUFBRSxDQUFDO1FBQ3hELEtBQUssTUFBTSxFQUFFLEVBQUUsRUFBRSxjQUFjLEVBQUUsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUM3QyxNQUFNLFNBQVMsR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3ZGLElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ2Ysb0JBQW9CLENBQUMsSUFBSSxDQUFDO29CQUN6QixTQUFTLEVBQUUsT0FBTyxFQUFFO3dCQUNuQixHQUFHLGNBQWM7d0JBQ2pCLHlCQUF5QixFQUFFLElBQUk7cUJBQy9CO2lCQUNELENBQUMsQ0FBQztZQUNKLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyw2QkFBNkIsRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO1lBQ2xHLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxvQkFBb0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqQyxNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLCtCQUFnQyxDQUFDLDBCQUEwQixDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2TSxDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUF2RlksbUNBQW1DO0lBRTdDLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSwrQkFBK0IsQ0FBQTtJQUMvQixXQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFdBQUEsaUNBQWlDLENBQUE7SUFDakMsV0FBQSwyQkFBMkIsQ0FBQTtJQUMzQixXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEscUJBQXFCLENBQUE7R0FSWCxtQ0FBbUMsQ0F1Ri9DOztBQUVNLElBQU0sdUNBQXVDLEdBQTdDLE1BQU0sdUNBQXVDO0lBQ25ELFlBQ3FELGdDQUFtRSxFQUNyRixjQUErQixFQUMzQixrQkFBdUMsRUFDdkIsa0NBQXVFLEVBQ3JGLG9CQUEyQyxFQUNyRCxVQUF1QixFQUNaLHFCQUE2QyxFQUNwQyw4QkFBK0QsRUFDaEUsNkJBQTZEO1FBUjFELHFDQUFnQyxHQUFoQyxnQ0FBZ0MsQ0FBbUM7UUFDckYsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBQzNCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDdkIsdUNBQWtDLEdBQWxDLGtDQUFrQyxDQUFxQztRQUNyRix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQ3JELGVBQVUsR0FBVixVQUFVLENBQWE7UUFDWiwwQkFBcUIsR0FBckIscUJBQXFCLENBQXdCO1FBQ3BDLG1DQUE4QixHQUE5Qiw4QkFBOEIsQ0FBaUM7UUFDaEUsa0NBQTZCLEdBQTdCLDZCQUE2QixDQUFnQztRQUU5RyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRU8sS0FBSyxDQUFDLDBCQUEwQjtRQUN2QyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDM0QsTUFBTSw4QkFBOEIsR0FBRyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsOEJBQThCLENBQUM7UUFDNUcsTUFBTSwrQkFBK0IsR0FBRyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsK0JBQStCLENBQUM7UUFDOUcsNEJBQTRCO1FBQzVCLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQywrQkFBK0IsRUFBRSxDQUFDO1lBQ3JELE9BQU87UUFDUixDQUFDO1FBQ0QsNEJBQTRCO1FBQzVCLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxDQUFDO1lBQ3JDLE9BQU87UUFDUixDQUFDO1FBQ0QsMkNBQTJDO1FBQzNDLElBQUksQ0FBQyxJQUFJLENBQUMsa0NBQWtDLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUNoRSxPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sc0JBQXNCLEdBQUcsR0FBRyxVQUFVLElBQUksVUFBVSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzdFLG9DQUFvQztRQUNwQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsc0JBQXNCLHFDQUE0QixJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzdGLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLDBHQUEwRyxDQUFDLENBQUM7WUFDbEksT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLG1FQUFrRCxDQUFDO1FBQzFHLDRCQUE0QjtRQUM1QixJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLGdDQUF3QixFQUFFLENBQUM7WUFDeEQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsbUZBQW1GLENBQUMsQ0FBQztZQUMzRyxPQUFPO1FBQ1IsQ0FBQztRQUNELGtDQUFrQztRQUNsQyxJQUFJLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7WUFDckQsT0FBTztRQUNSLENBQUM7UUFDRCw2Q0FBNkM7UUFDN0MsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDakgsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxDQUFDO1lBQ3ZELE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMscUJBQXFCLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzSCxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbEcsNkJBQTZCO1FBQzdCLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGdHQUFnRyxFQUFFLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMzSyxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLENBQUMsa0NBQWtDLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDakssdUJBQXVCLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsaUJBQWlCLENBQUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RILE1BQU0sUUFBUSxHQUFHLE1BQU0sdUJBQXVCLENBQUMsWUFBWSw2Q0FBMEIsSUFBSSxDQUFDLENBQUM7UUFFM0YsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7UUFDbEQsaUJBQWlCLENBQUMsR0FBRyxDQUFDLDJCQUEyQixFQUFFLCtCQUErQixDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDL0csTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDdEYsTUFBTSw4QkFBOEIsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUV4RyxNQUFNLDhCQUE4QixDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUMzRCxDQUFDO0NBQ0QsQ0FBQTtBQXhFWSx1Q0FBdUM7SUFFakQsV0FBQSxpQ0FBaUMsQ0FBQTtJQUNqQyxXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxtQ0FBbUMsQ0FBQTtJQUNuQyxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsV0FBVyxDQUFBO0lBQ1gsV0FBQSxzQkFBc0IsQ0FBQTtJQUN0QixXQUFBLCtCQUErQixDQUFBO0lBQy9CLFdBQUEsOEJBQThCLENBQUE7R0FWcEIsdUNBQXVDLENBd0VuRDs7QUFFRCxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLDZCQUE2QjtJQUV0RSxZQUM4QiwwQkFBdUQsRUFDL0Msa0NBQXVFLEVBQzlGLFdBQXlCLEVBQ2IsdUJBQWlELEVBQ3RELGtCQUF1QyxFQUMvQyxVQUF1QixFQUNmLGtCQUF1QyxFQUNqQix1QkFBaUQsRUFDM0UsY0FBK0IsRUFDTSxrQ0FBdUU7UUFFN0gsS0FBSyxDQUFDLDBCQUEwQixFQUFFLGtDQUFrQyxFQUFFLFdBQVcsRUFBRSx1QkFBdUIsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFKckksNEJBQXVCLEdBQXZCLHVCQUF1QixDQUEwQjtRQUV0Qyx1Q0FBa0MsR0FBbEMsa0NBQWtDLENBQXFDO0lBRzlILENBQUM7SUFFa0IsS0FBSyxDQUFDLFlBQVksQ0FBQyxjQUErQjtRQUNwRSxNQUFNLGdCQUFnQixHQUFHLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNwRSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxrRUFBa0UsQ0FBQyxDQUFDO1lBQ3pGLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNqRixNQUFNLEVBQUUsYUFBYSxFQUFFLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3RGLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsc0NBQXNDLENBQUMsQ0FBQztZQUM5RCxPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sY0FBYyxHQUFHLE1BQU0sSUFBSSxDQUFDLDBCQUEwQixDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDakYsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxSixJQUFJLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLE1BQU0sT0FBTyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFDLENBQUMsRUFBQyxFQUFFO2dCQUMxRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMzRixJQUFJLFFBQVEsSUFBSSxJQUFJLENBQUMsa0NBQWtDLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztvQkFDekYsTUFBTSxlQUFlLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztvQkFDbEcsTUFBTSxJQUFJLENBQUMsMEJBQTBCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxFQUFFLEVBQUUsd0JBQXdCLEVBQUUsZUFBZSxFQUFFLFVBQVUsRUFBRSwrQkFBK0IsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyw4Q0FBOEMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDcE8sQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUF6Q0ssMkJBQTJCO0lBRzlCLFdBQUEsMkJBQTJCLENBQUE7SUFDM0IsV0FBQSxtQ0FBbUMsQ0FBQTtJQUNuQyxXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLFdBQVcsQ0FBQTtJQUNYLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSx3QkFBd0IsQ0FBQTtJQUN4QixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsbUNBQW1DLENBQUE7R0FaaEMsMkJBQTJCLENBeUNoQyJ9