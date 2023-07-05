/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionGalleryService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILogService } from 'vs/platform/log/common/log';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IStorageService, IS_NEW_KEY, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { AbstractExtensionsInitializer } from 'vs/platform/userDataSync/common/extensionsSync';
import { IIgnoredExtensionsManagementService } from 'vs/platform/userDataSync/common/ignoredExtensions';
import { IRemoteUserData, IUserDataSyncEnablementService, IUserDataSyncStoreManagementService, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncStoreClient } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export class RemoteExtensionsInitializerContribution implements IWorkbenchContribution {
	constructor(
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IStorageService private readonly storageService: IStorageService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IUserDataSyncStoreManagementService private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IRemoteAuthorityResolverService private readonly remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
	) {
		this.initializeRemoteExtensions();
	}

	private async initializeRemoteExtensions(): Promise<void> {
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
		if (!this.storageService.getBoolean(newRemoteConnectionKey, StorageScope.APPLICATION, true)) {
			this.logService.trace(`Skipping initializing remote extensions because the window with this remote authority was opened before.`);
			return;
		}
		this.storageService.store(newRemoteConnectionKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE);
		// Skip: Not a new workspace
		if (!this.storageService.isNew(StorageScope.WORKSPACE)) {
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
		const userData = await userDataSyncStoreClient.readResource(SyncResource.Extensions, null);

		const serviceCollection = new ServiceCollection();
		serviceCollection.set(IExtensionManagementService, remoteExtensionManagementServer.extensionManagementService);
		const instantiationService = this.instantiationService.createChild(serviceCollection);
		const extensionsToInstallInitializer = instantiationService.createInstance(RemoteExtensionsInitializer);

		await extensionsToInstallInitializer.initialize(userData);
	}
}

class RemoteExtensionsInitializer extends AbstractExtensionsInitializer {

	constructor(
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IIgnoredExtensionsManagementService ignoredExtensionsManagementService: IIgnoredExtensionsManagementService,
		@IFileService fileService: IFileService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IStorageService storageService: IStorageService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
	) {
		super(extensionManagementService, ignoredExtensionsManagementService, fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService);
	}

	protected override async doInitialize(remoteUserData: IRemoteUserData): Promise<void> {
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
			await Promise.allSettled(extensionsToInstall.map(async e => {
				const manifest = await this.extensionGalleryService.getManifest(e, CancellationToken.None);
				if (manifest && this.extensionManifestPropertiesService.canExecuteOnWorkspace(manifest)) {
					const syncedExtension = remoteExtensions.find(e => areSameExtensions(e.identifier, e.identifier));
					await this.extensionManagementService.installFromGallery(e, { installPreReleaseVersion: syncedExtension?.preRelease, donotIncludePackAndDependencies: true });
				}
			}));
		}
	}
}
