/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../base/common/arrays.js';
import { CancelablePromise, createCancelablePromise, RunOnceScheduler } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { isEqual } from '../../../base/common/resources.js';
import { isBoolean, isUndefined } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IExtensionGalleryService } from '../../extensionManagement/common/extensionManagement.js';
import { IFileService } from '../../files/common/files.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { ExtensionsSynchroniser } from './extensionsSync.js';
import { GlobalStateSynchroniser } from './globalStateSync.js';
import { KeybindingsSynchroniser } from './keybindingsSync.js';
import { PromptsSynchronizer } from './promptsSync/promptsSync.js';
import { SettingsSynchroniser } from './settingsSync.js';
import { SnippetsSynchroniser } from './snippetsSync.js';
import { TasksSynchroniser } from './tasksSync.js';
import { McpSynchroniser } from './mcpSync.js';
import { UserDataProfilesManifestSynchroniser } from './userDataProfilesManifestSync.js';
import {
	ALL_SYNC_RESOURCES, createSyncHeaders, IUserDataManualSyncTask, IUserDataSyncResourceConflicts, IUserDataSyncResourceError,
	IUserDataSyncResource, ISyncResourceHandle, IUserDataSyncTask, ISyncUserDataProfile, IUserDataManifest, IUserDataSyncConfiguration,
	IUserDataSyncEnablementService, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService,
	SyncResource, SyncStatus, UserDataSyncError, UserDataSyncErrorCode, UserDataSyncStoreError, USER_DATA_SYNC_CONFIGURATION_SCOPE, IUserDataSyncResourceProviderService, IUserDataSyncActivityData, IUserDataSyncLocalStoreService,
	IUserDataSyncLatestData,
	IUserData,
	isUserDataManifest,
} from './userDataSync.js';

type SyncErrorClassification = {
	owner: 'sandy081';
	comment: 'Information about the error that occurred while syncing';
	code: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'error code' };
	service: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Settings Sync service for which this error has occurred' };
	serverCode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Settings Sync service error code' };
	url?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Settings Sync resource URL for which this error has occurred' };
	resource?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Settings Sync resource for which this error has occurred' };
	executionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Settings Sync execution id for which this error has occurred' };
};

type SyncErrorEvent = {
	code: string;
	service: string;
	serverCode?: string;
	url?: string;
	resource?: string;
	executionId?: string;
};

const LAST_SYNC_TIME_KEY = 'sync.lastSyncTime';

export class UserDataSyncService extends Disposable implements IUserDataSyncService {

	_serviceBrand: undefined;

	private _status: SyncStatus = SyncStatus.Uninitialized;
	get status(): SyncStatus { return this._status; }
	private _onDidChangeStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangeStatus.event;

	private _onDidChangeLocal = this._register(new Emitter<SyncResource>());
	readonly onDidChangeLocal = this._onDidChangeLocal.event;

	private _conflicts: IUserDataSyncResourceConflicts[] = [];
	get conflicts(): IUserDataSyncResourceConflicts[] { return this._conflicts; }
	private _onDidChangeConflicts = this._register(new Emitter<IUserDataSyncResourceConflicts[]>());
	readonly onDidChangeConflicts = this._onDidChangeConflicts.event;

	private _syncErrors: IUserDataSyncResourceError[] = [];
	private _onSyncErrors = this._register(new Emitter<IUserDataSyncResourceError[]>());
	readonly onSyncErrors = this._onSyncErrors.event;

	private _lastSyncTime: number | undefined = undefined;
	get lastSyncTime(): number | undefined { return this._lastSyncTime; }
	private _onDidChangeLastSyncTime: Emitter<number> = this._register(new Emitter<number>());
	readonly onDidChangeLastSyncTime: Event<number> = this._onDidChangeLastSyncTime.event;

	private _onDidResetLocal = this._register(new Emitter<void>());
	readonly onDidResetLocal = this._onDidResetLocal.event;

	private _onDidResetRemote = this._register(new Emitter<void>());
	readonly onDidResetRemote = this._onDidResetRemote.event;

	private activeProfileSynchronizers = new Map<string, [ProfileSynchronizer, IDisposable]>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncStoreManagementService private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataSyncResourceProviderService private readonly userDataSyncResourceProviderService: IUserDataSyncResourceProviderService,
		@IUserDataSyncLocalStoreService private readonly userDataSyncLocalStoreService: IUserDataSyncLocalStoreService,
	) {
		super();
		this._status = userDataSyncStoreManagementService.userDataSyncStore ? SyncStatus.Idle : SyncStatus.Uninitialized;
		this._lastSyncTime = this.storageService.getNumber(LAST_SYNC_TIME_KEY, StorageScope.APPLICATION, undefined);
		this._register(toDisposable(() => this.clearActiveProfileSynchronizers()));

		this._register(new RunOnceScheduler(() => this.cleanUpStaleStorageData(), 5 * 1000 /* after 5s */)).schedule();
	}

	async createSyncTask(manifest: IUserDataManifest | null, disableCache?: boolean): Promise<IUserDataSyncTask> {
		this.checkEnablement();

		this.logService.info('Sync started.');
		const startTime = new Date().getTime();
		const executionId = generateUuid();
		try {
			const syncHeaders = createSyncHeaders(executionId);
			if (disableCache) {
				syncHeaders['Cache-Control'] = 'no-cache';
			}
			manifest = await this.userDataSyncStoreService.manifest(manifest, syncHeaders);
		} catch (error) {
			const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
			reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
			throw userDataSyncError;
		}

		const executed = false;
		const that = this;
		let cancellablePromise: CancelablePromise<void> | undefined;
		return {
			manifest,
			async run(): Promise<void> {
				if (executed) {
					throw new Error('Can run a task only once');
				}
				cancellablePromise = createCancelablePromise(token => that.sync(manifest, false, executionId, token));
				await cancellablePromise.finally(() => cancellablePromise = undefined);
				that.logService.info(`Sync done. Took ${new Date().getTime() - startTime}ms`);
				that.updateLastSyncTime();
			},
			stop(): Promise<void> {
				cancellablePromise?.cancel();
				return that.stop();
			}
		};
	}

	async createManualSyncTask(): Promise<IUserDataManualSyncTask> {
		this.checkEnablement();

		if (this.userDataSyncEnablementService.isEnabled()) {
			throw new UserDataSyncError('Cannot start manual sync when sync is enabled', UserDataSyncErrorCode.LocalError);
		}

		this.logService.info('Sync started.');
		const startTime = new Date().getTime();
		const executionId = generateUuid();
		const syncHeaders = createSyncHeaders(executionId);
		let latestUserDataOrManifest: IUserDataSyncLatestData | IUserDataManifest | null;
		try {
			latestUserDataOrManifest = await this.userDataSyncStoreService.getLatestData(syncHeaders);
		} catch (error) {
			const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
			this.telemetryService.publicLog2<SyncErrorEvent, SyncErrorClassification>('sync.download.latest',
				{
					code: userDataSyncError.code,
					serverCode: userDataSyncError instanceof UserDataSyncStoreError ? String(userDataSyncError.serverCode) : undefined,
					url: userDataSyncError instanceof UserDataSyncStoreError ? userDataSyncError.url : undefined,
					resource: userDataSyncError.resource,
					executionId,
					service: this.userDataSyncStoreManagementService.userDataSyncStore!.url.toString()
				});

			// Fallback to manifest in stable
			try {
				latestUserDataOrManifest = await this.userDataSyncStoreService.manifest(null, syncHeaders);
			} catch (error) {
				const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
				reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
				throw userDataSyncError;
			}
		}

		/* Manual sync shall start on clean local state */
		await this.resetLocal();

		const that = this;
		const cancellableToken = new CancellationTokenSource();
		return {
			id: executionId,
			async merge(): Promise<void> {
				return that.sync(latestUserDataOrManifest, true, executionId, cancellableToken.token);
			},
			async apply(): Promise<void> {
				try {
					try {
						await that.applyManualSync(latestUserDataOrManifest, executionId, cancellableToken.token);
					} catch (error) {
						if (UserDataSyncError.toUserDataSyncError(error).code === UserDataSyncErrorCode.MethodNotFound) {
							that.logService.info('Client is making invalid requests. Cleaning up data...');
							await that.cleanUpRemoteData();
							that.logService.info('Applying manual sync again...');
							await that.applyManualSync(latestUserDataOrManifest, executionId, cancellableToken.token);
						} else {
							throw error;
						}
					}
				} catch (error) {
					that.logService.error(error);
					throw error;
				}
				that.logService.info(`Sync done. Took ${new Date().getTime() - startTime}ms`);
				that.updateLastSyncTime();
			},
			async stop(): Promise<void> {
				cancellableToken.cancel();
				await that.stop();
				await that.resetLocal();
			}
		};
	}

	private async sync(manifestOrLatestData: IUserDataManifest | IUserDataSyncLatestData | null, preview: boolean, executionId: string, token: CancellationToken): Promise<void> {
		this._syncErrors = [];
		try {
			if (this.status !== SyncStatus.HasConflicts) {
				this.setStatus(SyncStatus.Syncing);
			}

			// Sync Default Profile First
			const defaultProfileSynchronizer = this.getOrCreateActiveProfileSynchronizer(this.userDataProfilesService.defaultProfile, undefined);
			this._syncErrors.push(...await this.syncProfile(defaultProfileSynchronizer, manifestOrLatestData, preview, executionId, token));

			// Sync other profiles
			const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find(s => s.resource === SyncResource.Profiles);
			if (userDataProfileManifestSynchronizer) {
				const syncProfiles = (await (userDataProfileManifestSynchronizer as UserDataProfilesManifestSynchroniser).getLastSyncedProfiles()) || [];
				if (token.isCancellationRequested) {
					return;
				}
				await this.syncRemoteProfiles(syncProfiles, manifestOrLatestData, preview, executionId, token);
			}
		} finally {
			if (this.status !== SyncStatus.HasConflicts) {
				this.setStatus(SyncStatus.Idle);
			}
			this._onSyncErrors.fire(this._syncErrors);
		}
	}

	private async syncRemoteProfiles(remoteProfiles: ISyncUserDataProfile[], manifest: IUserDataManifest | IUserDataSyncLatestData | null, preview: boolean, executionId: string, token: CancellationToken): Promise<void> {
		for (const syncProfile of remoteProfiles) {
			if (token.isCancellationRequested) {
				return;
			}
			const profile = this.userDataProfilesService.profiles.find(p => p.id === syncProfile.id);
			if (!profile) {
				this.logService.error(`Profile with id:${syncProfile.id} and name: ${syncProfile.name} does not exist locally to sync.`);
				continue;
			}
			this.logService.info('Syncing profile.', syncProfile.name);
			const profileSynchronizer = this.getOrCreateActiveProfileSynchronizer(profile, syncProfile);
			this._syncErrors.push(...await this.syncProfile(profileSynchronizer, manifest, preview, executionId, token));
		}
		// Dispose & Delete profile synchronizers which do not exist anymore
		for (const [key, profileSynchronizerItem] of this.activeProfileSynchronizers.entries()) {
			if (this.userDataProfilesService.profiles.some(p => p.id === profileSynchronizerItem[0].profile.id)) {
				continue;
			}
			await profileSynchronizerItem[0].resetLocal();
			profileSynchronizerItem[1].dispose();
			this.activeProfileSynchronizers.delete(key);
		}
	}

	private async applyManualSync(manifestOrLatestData: IUserDataManifest | IUserDataSyncLatestData | null, executionId: string, token: CancellationToken): Promise<void> {
		try {
			this.setStatus(SyncStatus.Syncing);
			const profileSynchronizers = this.getActiveProfileSynchronizers();
			for (const profileSynchronizer of profileSynchronizers) {
				if (token.isCancellationRequested) {
					return;
				}
				await profileSynchronizer.apply(executionId, token);
			}

			const defaultProfileSynchronizer = profileSynchronizers.find(s => s.profile.isDefault);
			if (!defaultProfileSynchronizer) {
				return;
			}

			const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find(s => s.resource === SyncResource.Profiles);
			if (!userDataProfileManifestSynchronizer) {
				return;
			}

			// Sync remote profiles which are not synced locally
			const remoteProfiles = (await (userDataProfileManifestSynchronizer as UserDataProfilesManifestSynchroniser).getRemoteSyncedProfiles(getRefOrUserData(manifestOrLatestData, undefined, SyncResource.Profiles) ?? null)) || [];
			const remoteProfilesToSync = remoteProfiles.filter(remoteProfile => profileSynchronizers.every(s => s.profile.id !== remoteProfile.id));
			if (remoteProfilesToSync.length) {
				await this.syncRemoteProfiles(remoteProfilesToSync, manifestOrLatestData, false, executionId, token);
			}
		} finally {
			this.setStatus(SyncStatus.Idle);
		}
	}

	private async syncProfile(profileSynchronizer: ProfileSynchronizer, manifestOrLatestData: IUserDataManifest | IUserDataSyncLatestData | null, preview: boolean, executionId: string, token: CancellationToken): Promise<IUserDataSyncResourceError[]> {
		const errors = await profileSynchronizer.sync(manifestOrLatestData, preview, executionId, token);
		return errors.map(([syncResource, error]) => ({ profile: profileSynchronizer.profile, syncResource, error }));
	}

	private async stop(): Promise<void> {
		if (this.status !== SyncStatus.Idle) {
			await Promise.allSettled(this.getActiveProfileSynchronizers().map(profileSynchronizer => profileSynchronizer.stop()));
		}
	}

	async resolveContent(resource: URI): Promise<string | null> {
		const content = await this.userDataSyncResourceProviderService.resolveContent(resource);
		if (content) {
			return content;
		}
		for (const profileSynchronizer of this.getActiveProfileSynchronizers()) {
			for (const synchronizer of profileSynchronizer.enabled) {
				const content = await synchronizer.resolveContent(resource);
				if (content) {
					return content;
				}
			}
		}
		return null;
	}

	async replace(syncResourceHandle: ISyncResourceHandle): Promise<void> {
		this.checkEnablement();

		const profileSyncResource = this.userDataSyncResourceProviderService.resolveUserDataSyncResource(syncResourceHandle);
		if (!profileSyncResource) {
			return;
		}

		const content = await this.resolveContent(syncResourceHandle.uri);
		if (!content) {
			return;
		}

		await this.performAction(profileSyncResource.profile, async synchronizer => {
			if (profileSyncResource.syncResource === synchronizer.resource) {
				await synchronizer.replace(content);
				return true;
			}
			return undefined;
		});

		return;
	}

	async accept(syncResource: IUserDataSyncResource, resource: URI, content: string | null | undefined, apply: boolean | { force: boolean }): Promise<void> {
		this.checkEnablement();

		await this.performAction(syncResource.profile, async synchronizer => {
			if (syncResource.syncResource === synchronizer.resource) {
				await synchronizer.accept(resource, content);
				if (apply) {
					await synchronizer.apply(isBoolean(apply) ? false : apply.force, createSyncHeaders(generateUuid()));
				}
				return true;
			}
			return undefined;
		});
	}

	async hasLocalData(): Promise<boolean> {
		const result = await this.performAction(this.userDataProfilesService.defaultProfile, async synchronizer => {
			// skip global state synchronizer
			if (synchronizer.resource !== SyncResource.GlobalState && await synchronizer.hasLocalData()) {
				return true;
			}
			return undefined;
		});
		return !!result;
	}

	async hasPreviouslySynced(): Promise<boolean> {
		const result = await this.performAction(this.userDataProfilesService.defaultProfile, async synchronizer => {
			if (await synchronizer.hasPreviouslySynced()) {
				return true;
			}
			return undefined;
		});
		return !!result;
	}

	async reset(): Promise<void> {
		this.checkEnablement();
		await this.resetRemote();
		await this.resetLocal();
	}

	async resetRemote(): Promise<void> {
		this.checkEnablement();
		try {
			await this.userDataSyncStoreService.clear();
			this.logService.info('Cleared data on server');
		} catch (e) {
			this.logService.error(e);
		}
		this._onDidResetRemote.fire();
	}

	async resetLocal(): Promise<void> {
		this.checkEnablement();
		this._lastSyncTime = undefined;
		this.storageService.remove(LAST_SYNC_TIME_KEY, StorageScope.APPLICATION);
		for (const [synchronizer] of this.activeProfileSynchronizers.values()) {
			try {
				await synchronizer.resetLocal();
			} catch (e) {
				this.logService.error(e);
			}
		}
		this.clearActiveProfileSynchronizers();
		this._onDidResetLocal.fire();
		this.logService.info('Did reset the local sync state.');
	}

	private async cleanUpStaleStorageData(): Promise<void> {
		const allKeys = this.storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE);
		const lastSyncProfileKeys: [string, string][] = [];
		for (const key of allKeys) {
			if (!key.endsWith('.lastSyncUserData')) {
				continue;
			}
			const segments = key.split('.');
			if (segments.length === 3) {
				lastSyncProfileKeys.push([key, segments[0]]);
			}
		}
		if (!lastSyncProfileKeys.length) {
			return;
		}

		const disposables = new DisposableStore();

		try {
			let defaultProfileSynchronizer = this.activeProfileSynchronizers.get(this.userDataProfilesService.defaultProfile.id)?.[0];
			if (!defaultProfileSynchronizer) {
				defaultProfileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, this.userDataProfilesService.defaultProfile, undefined));
			}
			const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find(s => s.resource === SyncResource.Profiles) as UserDataProfilesManifestSynchroniser;
			if (!userDataProfileManifestSynchronizer) {
				return;
			}
			const lastSyncedProfiles = await userDataProfileManifestSynchronizer.getLastSyncedProfiles();
			const lastSyncedCollections = lastSyncedProfiles?.map(p => p.collection) ?? [];
			for (const [key, collection] of lastSyncProfileKeys) {
				if (!lastSyncedCollections.includes(collection)) {
					this.logService.info(`Removing last sync state for stale profile: ${collection}`);
					this.storageService.remove(key, StorageScope.APPLICATION);
				}
			}
		} finally {
			disposables.dispose();
		}
	}

	async cleanUpRemoteData(): Promise<void> {
		const remoteProfiles = await this.userDataSyncResourceProviderService.getRemoteSyncedProfiles();
		const remoteProfileCollections = remoteProfiles.map(profile => profile.collection);
		const allCollections = await this.userDataSyncStoreService.getAllCollections();
		const redundantCollections = allCollections.filter(c => !remoteProfileCollections.includes(c));
		if (redundantCollections.length) {
			this.logService.info(`Deleting ${redundantCollections.length} redundant collections on server`);
			await Promise.allSettled(redundantCollections.map(collectionId => this.userDataSyncStoreService.deleteCollection(collectionId)));
			this.logService.info(`Deleted redundant collections on server`);
		}
		const updatedRemoteProfiles = remoteProfiles.filter(profile => allCollections.includes(profile.collection));
		if (updatedRemoteProfiles.length !== remoteProfiles.length) {
			const profileManifestSynchronizer = this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, this.userDataProfilesService.defaultProfile, undefined);
			try {
				this.logService.info('Resetting the last synced state of profiles');
				await profileManifestSynchronizer.resetLocal();
				this.logService.info('Did reset the last synced state of profiles');
				this.logService.info(`Updating remote profiles with invalid collections on server`);
				await profileManifestSynchronizer.updateRemoteProfiles(updatedRemoteProfiles, null);
				this.logService.info(`Updated remote profiles on server`);
			} finally {
				profileManifestSynchronizer.dispose();
			}
		}
	}

	async saveRemoteActivityData(location: URI): Promise<void> {
		this.checkEnablement();
		const data = await this.userDataSyncStoreService.getActivityData();
		await this.fileService.writeFile(location, data);
	}

	async extractActivityData(activityDataResource: URI, location: URI): Promise<void> {
		const content = (await this.fileService.readFile(activityDataResource)).value.toString();
		const activityData: IUserDataSyncActivityData = JSON.parse(content);

		if (activityData.resources) {
			for (const resource in activityData.resources) {
				for (const version of activityData.resources[resource]) {
					await this.userDataSyncLocalStoreService.writeResource(resource as SyncResource, version.content, new Date(version.created * 1000), undefined, location);
				}
			}
		}

		if (activityData.collections) {
			for (const collection in activityData.collections) {
				for (const resource in activityData.collections[collection].resources) {
					for (const version of activityData.collections[collection].resources?.[resource] ?? []) {
						await this.userDataSyncLocalStoreService.writeResource(resource as SyncResource, version.content, new Date(version.created * 1000), collection, location);
					}
				}
			}
		}
	}

	private async performAction<T>(profile: IUserDataProfile, action: (synchroniser: IUserDataSynchroniser) => Promise<T | undefined>): Promise<T | null> {
		const disposables = new DisposableStore();
		try {
			const activeProfileSyncronizer = this.activeProfileSynchronizers.get(profile.id);
			if (activeProfileSyncronizer) {
				const result = await this.performActionWithProfileSynchronizer(activeProfileSyncronizer[0], action, disposables);
				return isUndefined(result) ? null : result;
			}

			if (profile.isDefault) {
				const defaultProfileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, undefined));
				const result = await this.performActionWithProfileSynchronizer(defaultProfileSynchronizer, action, disposables);
				return isUndefined(result) ? null : result;
			}

			const userDataProfileManifestSynchronizer = disposables.add(this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, profile, undefined));
			const manifest = await this.userDataSyncStoreService.manifest(null);
			const syncProfiles = (await userDataProfileManifestSynchronizer.getRemoteSyncedProfiles(manifest?.latest?.profiles ?? null)) || [];
			const syncProfile = syncProfiles.find(syncProfile => syncProfile.id === profile.id);
			if (syncProfile) {
				const profileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, syncProfile.collection));
				const result = await this.performActionWithProfileSynchronizer(profileSynchronizer, action, disposables);
				return isUndefined(result) ? null : result;
			}

			return null;
		} finally {
			disposables.dispose();
		}
	}

	private async performActionWithProfileSynchronizer<T>(profileSynchronizer: ProfileSynchronizer, action: (synchroniser: IUserDataSynchroniser) => Promise<T | undefined>, disposables: DisposableStore): Promise<T | undefined> {
		const allSynchronizers = [...profileSynchronizer.enabled, ...profileSynchronizer.disabled.reduce<(IUserDataSynchroniser & IDisposable)[]>((synchronizers, syncResource) => {
			if (syncResource !== SyncResource.WorkspaceState) {
				synchronizers.push(disposables.add(profileSynchronizer.createSynchronizer(syncResource)));
			}
			return synchronizers;
		}, [])];
		for (const synchronizer of allSynchronizers) {
			const result = await action(synchronizer);
			if (!isUndefined(result)) {
				return result;
			}
		}
		return undefined;
	}

	private setStatus(status: SyncStatus): void {
		const oldStatus = this._status;
		if (this._status !== status) {
			this._status = status;
			this._onDidChangeStatus.fire(status);
			if (oldStatus === SyncStatus.HasConflicts) {
				this.updateLastSyncTime();
			}
		}
	}

	private updateConflicts(): void {
		const conflicts = this.getActiveProfileSynchronizers().map(synchronizer => synchronizer.conflicts).flat();
		if (!equals(this._conflicts, conflicts, (a, b) => a.profile.id === b.profile.id && a.syncResource === b.syncResource && equals(a.conflicts, b.conflicts, (a, b) => isEqual(a.previewResource, b.previewResource)))) {
			this._conflicts = conflicts;
			this._onDidChangeConflicts.fire(conflicts);
		}
	}

	private updateLastSyncTime(): void {
		if (this.status === SyncStatus.Idle) {
			this._lastSyncTime = new Date().getTime();
			this.storageService.store(LAST_SYNC_TIME_KEY, this._lastSyncTime, StorageScope.APPLICATION, StorageTarget.MACHINE);
			this._onDidChangeLastSyncTime.fire(this._lastSyncTime);
		}
	}

	getOrCreateActiveProfileSynchronizer(profile: IUserDataProfile, syncProfile: ISyncUserDataProfile | undefined): ProfileSynchronizer {
		let activeProfileSynchronizer = this.activeProfileSynchronizers.get(profile.id);
		if (activeProfileSynchronizer && activeProfileSynchronizer[0].collection !== syncProfile?.collection) {
			this.logService.error('Profile synchronizer collection does not match with the remote sync profile collection');
			activeProfileSynchronizer[1].dispose();
			activeProfileSynchronizer = undefined;
			this.activeProfileSynchronizers.delete(profile.id);
		}
		if (!activeProfileSynchronizer) {
			const disposables = new DisposableStore();
			const profileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, syncProfile?.collection));
			disposables.add(profileSynchronizer.onDidChangeStatus(e => this.setStatus(e)));
			disposables.add(profileSynchronizer.onDidChangeConflicts(conflicts => this.updateConflicts()));
			disposables.add(profileSynchronizer.onDidChangeLocal(e => this._onDidChangeLocal.fire(e)));
			this.activeProfileSynchronizers.set(profile.id, activeProfileSynchronizer = [profileSynchronizer, disposables]);
		}
		return activeProfileSynchronizer[0];
	}

	private getActiveProfileSynchronizers(): ProfileSynchronizer[] {
		const profileSynchronizers: ProfileSynchronizer[] = [];
		for (const [profileSynchronizer] of this.activeProfileSynchronizers.values()) {
			profileSynchronizers.push(profileSynchronizer);
		}
		return profileSynchronizers;
	}

	private clearActiveProfileSynchronizers(): void {
		this.activeProfileSynchronizers.forEach(([, disposable]) => disposable.dispose());
		this.activeProfileSynchronizers.clear();
	}

	private checkEnablement(): void {
		if (!this.userDataSyncStoreManagementService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
	}

}


class ProfileSynchronizer extends Disposable {

	private _enabled: [IUserDataSynchroniser, number, IDisposable][] = [];
	get enabled(): IUserDataSynchroniser[] { return this._enabled.sort((a, b) => a[1] - b[1]).map(([synchronizer]) => synchronizer); }

	get disabled(): SyncResource[] { return ALL_SYNC_RESOURCES.filter(syncResource => !this.userDataSyncEnablementService.isResourceEnabled(syncResource)); }

	private _status: SyncStatus = SyncStatus.Idle;
	get status(): SyncStatus { return this._status; }
	private _onDidChangeStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangeStatus.event;

	private _onDidChangeLocal = this._register(new Emitter<SyncResource>());
	readonly onDidChangeLocal = this._onDidChangeLocal.event;

	private _conflicts: IUserDataSyncResourceConflicts[] = [];
	get conflicts(): IUserDataSyncResourceConflicts[] { return this._conflicts; }
	private _onDidChangeConflicts = this._register(new Emitter<IUserDataSyncResourceConflicts[]>());
	readonly onDidChangeConflicts = this._onDidChangeConflicts.event;

	constructor(
		readonly profile: IUserDataProfile,
		readonly collection: string | undefined,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IUserDataSyncStoreManagementService private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._register(userDataSyncEnablementService.onDidChangeResourceEnablement(([syncResource, enablement]) => this.onDidChangeResourceEnablement(syncResource, enablement)));
		this._register(toDisposable(() => this._enabled.splice(0, this._enabled.length).forEach(([, , disposable]) => disposable.dispose())));
		for (const syncResource of ALL_SYNC_RESOURCES) {
			if (userDataSyncEnablementService.isResourceEnabled(syncResource)) {
				this.registerSynchronizer(syncResource);
			}
		}
	}

	private onDidChangeResourceEnablement(syncResource: SyncResource, enabled: boolean): void {
		if (enabled) {
			this.registerSynchronizer(syncResource);
		} else {
			this.deRegisterSynchronizer(syncResource);
		}
	}

	protected registerSynchronizer(syncResource: SyncResource): void {
		if (this._enabled.some(([synchronizer]) => synchronizer.resource === syncResource)) {
			return;
		}
		if (syncResource === SyncResource.Extensions && !this.extensionGalleryService.isEnabled()) {
			this.logService.info('Skipping extensions sync because gallery is not configured');
			return;
		}
		if (syncResource === SyncResource.Profiles) {
			if (!this.profile.isDefault) {
				return;
			}
		}
		if (syncResource === SyncResource.WorkspaceState) {
			return;
		}
		if (syncResource !== SyncResource.Profiles && this.profile.useDefaultFlags?.[syncResource]) {
			this.logService.debug(`Skipping syncing ${syncResource} in ${this.profile.name} because it is already synced by default profile`);
			return;
		}
		const disposables = new DisposableStore();
		const synchronizer = disposables.add(this.createSynchronizer(syncResource));
		disposables.add(synchronizer.onDidChangeStatus(() => this.updateStatus()));
		disposables.add(synchronizer.onDidChangeConflicts(() => this.updateConflicts()));
		disposables.add(synchronizer.onDidChangeLocal(() => this._onDidChangeLocal.fire(syncResource)));
		const order = this.getOrder(syncResource);
		this._enabled.push([synchronizer, order, disposables]);
	}

	private deRegisterSynchronizer(syncResource: SyncResource): void {
		const index = this._enabled.findIndex(([synchronizer]) => synchronizer.resource === syncResource);
		if (index !== -1) {
			const [[synchronizer, , disposable]] = this._enabled.splice(index, 1);
			disposable.dispose();
			this.updateStatus();
			synchronizer.stop().then(null, error => this.logService.error(error));
		}
	}

	createSynchronizer(syncResource: Exclude<SyncResource, SyncResource.WorkspaceState>): IUserDataSynchroniser & IDisposable {
		switch (syncResource) {
			case SyncResource.Settings: return this.instantiationService.createInstance(SettingsSynchroniser, this.profile, this.collection);
			case SyncResource.Keybindings: return this.instantiationService.createInstance(KeybindingsSynchroniser, this.profile, this.collection);
			case SyncResource.Snippets: return this.instantiationService.createInstance(SnippetsSynchroniser, this.profile, this.collection);
			case SyncResource.Prompts: return this.instantiationService.createInstance(PromptsSynchronizer, this.profile, this.collection);
			case SyncResource.Tasks: return this.instantiationService.createInstance(TasksSynchroniser, this.profile, this.collection);
			case SyncResource.Mcp: return this.instantiationService.createInstance(McpSynchroniser, this.profile, this.collection);
			case SyncResource.GlobalState: return this.instantiationService.createInstance(GlobalStateSynchroniser, this.profile, this.collection);
			case SyncResource.Extensions: return this.instantiationService.createInstance(ExtensionsSynchroniser, this.profile, this.collection);
			case SyncResource.Profiles: return this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, this.profile, this.collection);
		}
	}

	async sync(manifestOrLatestData: IUserDataManifest | IUserDataSyncLatestData | null, preview: boolean, executionId: string, token: CancellationToken): Promise<[SyncResource, UserDataSyncError][]> {

		// Return if cancellation is requested
		if (token.isCancellationRequested) {
			return [];
		}

		const synchronizers = this.enabled;
		if (!synchronizers.length) {
			return [];
		}

		try {
			const syncErrors: [SyncResource, UserDataSyncError][] = [];
			const syncHeaders = createSyncHeaders(executionId);
			const userDataSyncConfiguration = preview ? await this.getUserDataSyncConfiguration(manifestOrLatestData) : this.getLocalUserDataSyncConfiguration();
			for (const synchroniser of synchronizers) {
				// Return if cancellation is requested
				if (token.isCancellationRequested) {
					return [];
				}

				// Return if resource is not enabled
				if (!this.userDataSyncEnablementService.isResourceEnabled(synchroniser.resource)) {
					return [];
				}

				try {
					const refOrUserData = getRefOrUserData(manifestOrLatestData, this.collection, synchroniser.resource) ?? null;
					await synchroniser.sync(refOrUserData, preview, userDataSyncConfiguration, syncHeaders);
				} catch (e) {
					const userDataSyncError = UserDataSyncError.toUserDataSyncError(e);
					reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
					if (canBailout(e)) {
						throw userDataSyncError;
					}

					// Log and and continue
					this.logService.error(e);
					this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
					syncErrors.push([synchroniser.resource, userDataSyncError]);
				}
			}

			return syncErrors;
		} finally {
			this.updateStatus();
		}
	}

	async apply(executionId: string, token: CancellationToken): Promise<void> {
		const syncHeaders = createSyncHeaders(executionId);
		for (const synchroniser of this.enabled) {
			if (token.isCancellationRequested) {
				return;
			}
			try {
				await synchroniser.apply(false, syncHeaders);
			} catch (e) {
				const userDataSyncError = UserDataSyncError.toUserDataSyncError(e);
				reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
				if (canBailout(e)) {
					throw userDataSyncError;
				}

				// Log and and continue
				this.logService.error(e);
				this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
			}
		}
	}

	async stop(): Promise<void> {
		for (const synchroniser of this.enabled) {
			try {
				if (synchroniser.status !== SyncStatus.Idle) {
					await synchroniser.stop();
				}
			} catch (e) {
				this.logService.error(e);
			}
		}
	}

	async resetLocal(): Promise<void> {
		for (const synchroniser of this.enabled) {
			try {
				await synchroniser.resetLocal();
			} catch (e) {
				this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
				this.logService.error(e);
			}
		}
	}

	private async getUserDataSyncConfiguration(manifestOrLatestData: IUserDataManifest | IUserDataSyncLatestData | null): Promise<IUserDataSyncConfiguration> {
		if (!this.profile.isDefault) {
			return {};
		}
		const local = this.getLocalUserDataSyncConfiguration();
		const settingsSynchronizer = this.enabled.find(synchronizer => synchronizer instanceof SettingsSynchroniser);
		if (settingsSynchronizer) {
			const remote = await settingsSynchronizer.getRemoteUserDataSyncConfiguration(getRefOrUserData(manifestOrLatestData, this.collection, SyncResource.Settings) ?? null);
			return { ...local, ...remote };
		}
		return local;
	}

	private getLocalUserDataSyncConfiguration(): IUserDataSyncConfiguration {
		return this.configurationService.getValue(USER_DATA_SYNC_CONFIGURATION_SCOPE);
	}

	private setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangeStatus.fire(status);
		}
	}

	private updateStatus(): void {
		this.updateConflicts();
		if (this.enabled.some(s => s.status === SyncStatus.HasConflicts)) {
			return this.setStatus(SyncStatus.HasConflicts);
		}
		if (this.enabled.some(s => s.status === SyncStatus.Syncing)) {
			return this.setStatus(SyncStatus.Syncing);
		}
		return this.setStatus(SyncStatus.Idle);
	}

	private updateConflicts(): void {
		const conflicts = this.enabled.filter(s => s.status === SyncStatus.HasConflicts)
			.filter(s => s.conflicts.conflicts.length > 0)
			.map(s => s.conflicts);
		if (!equals(this._conflicts, conflicts, (a, b) => a.syncResource === b.syncResource && equals(a.conflicts, b.conflicts, (a, b) => isEqual(a.previewResource, b.previewResource)))) {
			this._conflicts = conflicts;
			this._onDidChangeConflicts.fire(conflicts);
		}
	}

	private getOrder(syncResource: SyncResource): number {
		switch (syncResource) {
			case SyncResource.Settings: return 0;
			case SyncResource.Keybindings: return 1;
			case SyncResource.Snippets: return 2;
			case SyncResource.Tasks: return 3;
			case SyncResource.Mcp: return 4;
			case SyncResource.GlobalState: return 5;
			case SyncResource.Extensions: return 6;
			case SyncResource.Prompts: return 7;
			case SyncResource.Profiles: return 8;
			case SyncResource.WorkspaceState: return 9;
		}
	}
}

function canBailout(e: unknown): boolean {
	if (e instanceof UserDataSyncError) {
		switch (e.code) {
			case UserDataSyncErrorCode.MethodNotFound:
			case UserDataSyncErrorCode.TooLarge:
			case UserDataSyncErrorCode.TooManyRequests:
			case UserDataSyncErrorCode.TooManyRequestsAndRetryAfter:
			case UserDataSyncErrorCode.LocalTooManyRequests:
			case UserDataSyncErrorCode.LocalTooManyProfiles:
			case UserDataSyncErrorCode.Gone:
			case UserDataSyncErrorCode.UpgradeRequired:
			case UserDataSyncErrorCode.IncompatibleRemoteContent:
			case UserDataSyncErrorCode.IncompatibleLocalContent:
				return true;
		}
	}
	return false;
}

function reportUserDataSyncError(userDataSyncError: UserDataSyncError, executionId: string, userDataSyncStoreManagementService: IUserDataSyncStoreManagementService, telemetryService: ITelemetryService): void {
	telemetryService.publicLog2<SyncErrorEvent, SyncErrorClassification>('sync/error',
		{
			code: userDataSyncError.code,
			serverCode: userDataSyncError instanceof UserDataSyncStoreError ? String(userDataSyncError.serverCode) : undefined,
			url: userDataSyncError instanceof UserDataSyncStoreError ? userDataSyncError.url : undefined,
			resource: userDataSyncError.resource,
			executionId,
			service: userDataSyncStoreManagementService.userDataSyncStore!.url.toString()
		});
}

function getRefOrUserData(manifestOrLatestData: IUserDataManifest | IUserDataSyncLatestData | null, collection: string | undefined, resource: SyncResource): string | IUserData | undefined {
	if (isUserDataManifest(manifestOrLatestData)) {
		if (collection) {
			return manifestOrLatestData?.collections?.[collection]?.latest?.[resource];
		}
		return manifestOrLatestData?.latest?.[resource];
	}
	if (collection) {
		return manifestOrLatestData?.collections?.[collection]?.resources?.[resource];
	}
	return manifestOrLatestData?.resources?.[resource];
}
