/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/arrays';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { isBoolean, isUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ExtensionsSynchroniser } from 'vs/platform/userDataSync/common/extensionsSync';
import { GlobalStateSynchroniser } from 'vs/platform/userDataSync/common/globalStateSync';
import { KeybindingsSynchroniser } from 'vs/platform/userDataSync/common/keybindingsSync';
import { SettingsSynchroniser } from 'vs/platform/userDataSync/common/settingsSync';
import { SnippetsSynchroniser } from 'vs/platform/userDataSync/common/snippetsSync';
import { TasksSynchroniser } from 'vs/platform/userDataSync/common/tasksSync';
import { UserDataProfilesManifestSynchroniser } from 'vs/platform/userDataSync/common/userDataProfilesManifestSync';
import {
	ALL_SYNC_RESOURCES, Change, createSyncHeaders, IUserDataManualSyncTask, IUserDataSyncResourceConflicts, IUserDataSyncResourceError,
	IUserDataSyncResource, ISyncResourceHandle, IUserDataSyncTask, ISyncUserDataProfile, IUserDataManifest, IUserDataResourceManifest, IUserDataSyncConfiguration,
	IUserDataSyncEnablementService, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService,
	MergeState, SyncResource, SyncStatus, UserDataSyncError, UserDataSyncErrorCode, UserDataSyncStoreError, USER_DATA_SYNC_CONFIGURATION_SCOPE, IUserDataSyncResourceProviderService
} from 'vs/platform/userDataSync/common/userDataSync';

type SyncErrorClassification = {
	owner: 'sandy081';
	comment: 'Information about the error that occurred while syncing';
	code: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'error code' };
	service: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Settings Sync service for which this error has occurred' };
	serverCode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Settings Sync service error code' };
	url?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Settings Sync resource URL for which this error has occurred' };
	resource?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Settings Sync resource for which this error has occurred' };
	executionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Settings Sync execution id for which this error has occurred' };
};

const LAST_SYNC_TIME_KEY = 'sync.lastSyncTime';

export class UserDataSyncService extends Disposable implements IUserDataSyncService {

	_serviceBrand: any;

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
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncStoreManagementService private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataSyncResourceProviderService private readonly userDataSyncResourceProviderService: IUserDataSyncResourceProviderService,
	) {
		super();
		this._status = userDataSyncStoreManagementService.userDataSyncStore ? SyncStatus.Idle : SyncStatus.Uninitialized;
		this._lastSyncTime = this.storageService.getNumber(LAST_SYNC_TIME_KEY, StorageScope.APPLICATION, undefined);
		this._register(toDisposable(() => this.clearActiveProfileSynchronizers()));
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
		let manifest: IUserDataManifest | null;
		try {
			manifest = await this.userDataSyncStoreService.manifest(null, syncHeaders);
		} catch (error) {
			const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
			reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
			throw userDataSyncError;
		}

		/* Manual sync shall start on clean local state */
		await this.resetLocal();

		const that = this;
		const cancellableToken = new CancellationTokenSource();
		return {
			id: executionId,
			async merge(): Promise<void> {
				return that.sync(manifest, true, executionId, cancellableToken.token);
			},
			async apply(): Promise<void> {
				try {
					try {
						await that.applyManualSync(manifest, executionId, cancellableToken.token);
					} catch (error) {
						if (UserDataSyncError.toUserDataSyncError(error).code === UserDataSyncErrorCode.MethodNotFound) {
							that.logService.info('Client is making invalid requests. Cleaning up data...');
							await that.cleanUpRemoteData();
							that.logService.info('Applying manual sync again...');
							await that.applyManualSync(manifest, executionId, cancellableToken.token);
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

	private async sync(manifest: IUserDataManifest | null, merge: boolean, executionId: string, token: CancellationToken): Promise<void> {
		this._syncErrors = [];
		try {
			if (this.status !== SyncStatus.HasConflicts) {
				this.setStatus(SyncStatus.Syncing);
			}

			// Sync Default Profile First
			const defaultProfileSynchronizer = this.getOrCreateActiveProfileSynchronizer(this.userDataProfilesService.defaultProfile, undefined);
			this._syncErrors.push(...await this.syncProfile(defaultProfileSynchronizer, manifest, merge, executionId, token));

			// Sync other profiles
			const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find(s => s.resource === SyncResource.Profiles);
			if (userDataProfileManifestSynchronizer) {
				const syncProfiles = (await (userDataProfileManifestSynchronizer as UserDataProfilesManifestSynchroniser).getLastSyncedProfiles()) || [];
				if (token.isCancellationRequested) {
					return;
				}
				await this.syncRemoteProfiles(syncProfiles, manifest, merge, executionId, token);
			}
		} finally {
			this._onSyncErrors.fire(this._syncErrors);
		}
	}

	private async syncRemoteProfiles(remoteProfiles: ISyncUserDataProfile[], manifest: IUserDataManifest | null, merge: boolean, executionId: string, token: CancellationToken): Promise<void> {
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
			this._syncErrors.push(...await this.syncProfile(profileSynchronizer, manifest, merge, executionId, token));
		}
		// Dispose & Delete profile synchronizers which do not exist anymore
		for (const [key, profileSynchronizerItem] of this.activeProfileSynchronizers.entries()) {
			if (this.userDataProfilesService.profiles.some(p => p.id === profileSynchronizerItem[0].profile.id)) {
				continue;
			}
			profileSynchronizerItem[1].dispose();
			this.activeProfileSynchronizers.delete(key);
		}
	}

	private async applyManualSync(manifest: IUserDataManifest | null, executionId: string, token: CancellationToken): Promise<void> {
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
		const remoteProfiles = (await (userDataProfileManifestSynchronizer as UserDataProfilesManifestSynchroniser).getRemoteSyncedProfiles(manifest?.latest ?? null)) || [];
		const remoteProfilesToSync = remoteProfiles.filter(remoteProfile => profileSynchronizers.every(s => s.profile.id !== remoteProfile.id));
		if (remoteProfilesToSync.length) {
			await this.syncRemoteProfiles(remoteProfilesToSync, manifest, false, executionId, token);
		}
	}

	private async syncProfile(profileSynchronizer: ProfileSynchronizer, manifest: IUserDataManifest | null, merge: boolean, executionId: string, token: CancellationToken): Promise<IUserDataSyncResourceError[]> {
		const errors = await profileSynchronizer.sync(manifest, merge, executionId, token);
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

	getRemoteProfiles(): Promise<ISyncUserDataProfile[]> {
		return this.userDataSyncResourceProviderService.getRemoteSyncedProfiles();
	}

	getRemoteSyncResourceHandles(syncResource: SyncResource, profile?: ISyncUserDataProfile): Promise<ISyncResourceHandle[]> {
		return this.userDataSyncResourceProviderService.getRemoteSyncResourceHandles(syncResource, profile);
	}

	async getLocalSyncResourceHandles(syncResource: SyncResource, profile?: IUserDataProfile): Promise<ISyncResourceHandle[]> {
		return this.userDataSyncResourceProviderService.getLocalSyncResourceHandles(syncResource, profile ?? this.userDataProfilesService.defaultProfile);
	}

	async getAssociatedResources(syncResourceHandle: ISyncResourceHandle): Promise<{ resource: URI; comparableResource: URI }[]> {
		return this.userDataSyncResourceProviderService.getAssociatedResources(syncResourceHandle);
	}

	async getMachineId(syncResourceHandle: ISyncResourceHandle): Promise<string | undefined> {
		return this.userDataSyncResourceProviderService.getMachineId(syncResourceHandle);
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
			this.logService.info(`Updating remote profiles with invalid collections on server`);
			const profileManifestSynchronizer = this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, this.userDataProfilesService.defaultProfile, undefined);
			try {
				await profileManifestSynchronizer.updateRemoteProfiles(updatedRemoteProfiles, null);
				this.logService.info(`Updated remote profiles on server`);
			} finally {
				profileManifestSynchronizer.dispose();
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

			if (this.userDataProfilesService.isEnabled()) {
				return null;
			}

			const userDataProfileManifestSynchronizer = disposables.add(this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, profile, undefined));
			const manifest = await this.userDataSyncStoreService.manifest(null);
			const syncProfiles = (await userDataProfileManifestSynchronizer.getRemoteSyncedProfiles(manifest?.latest ?? null)) || [];
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
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
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
			if (!this.userDataProfilesService.isEnabled()) {
				return;
			}
		}
		if (syncResource === SyncResource.WorkspaceState) {
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
			Promise.allSettled([synchronizer.stop(), synchronizer.resetLocal()])
				.then(null, error => this.logService.error(error));
		}
	}

	createSynchronizer(syncResource: Exclude<SyncResource, SyncResource.WorkspaceState>): IUserDataSynchroniser & IDisposable {
		switch (syncResource) {
			case SyncResource.Settings: return this.instantiationService.createInstance(SettingsSynchroniser, this.profile, this.collection);
			case SyncResource.Keybindings: return this.instantiationService.createInstance(KeybindingsSynchroniser, this.profile, this.collection);
			case SyncResource.Snippets: return this.instantiationService.createInstance(SnippetsSynchroniser, this.profile, this.collection);
			case SyncResource.Tasks: return this.instantiationService.createInstance(TasksSynchroniser, this.profile, this.collection);
			case SyncResource.GlobalState: return this.instantiationService.createInstance(GlobalStateSynchroniser, this.profile, this.collection);
			case SyncResource.Extensions: return this.instantiationService.createInstance(ExtensionsSynchroniser, this.profile, this.collection);
			case SyncResource.Profiles: return this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, this.profile, this.collection);
		}
	}

	async sync(manifest: IUserDataManifest | null, merge: boolean, executionId: string, token: CancellationToken): Promise<[SyncResource, UserDataSyncError][]> {

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
			const resourceManifest: IUserDataResourceManifest | null = (this.collection ? manifest?.collections?.[this.collection]?.latest : manifest?.latest) ?? null;
			const userDataSyncConfiguration = merge ? await this.getUserDataSyncConfiguration(resourceManifest) : {};
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
					if (merge) {
						const preview = await synchroniser.preview(resourceManifest, userDataSyncConfiguration, syncHeaders);
						if (preview) {
							for (const resourcePreview of preview.resourcePreviews) {
								if ((resourcePreview.localChange !== Change.None || resourcePreview.remoteChange !== Change.None) && resourcePreview.mergeState === MergeState.Preview) {
									await synchroniser.merge(resourcePreview.previewResource);
								}
							}
						}
					} else {
						await synchroniser.sync(resourceManifest, syncHeaders);
					}
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

	private async getUserDataSyncConfiguration(manifest: IUserDataResourceManifest | null): Promise<IUserDataSyncConfiguration> {
		if (!this.profile.isDefault) {
			return {};
		}
		const local = this.configurationService.getValue<IUserDataSyncConfiguration>(USER_DATA_SYNC_CONFIGURATION_SCOPE);
		const settingsSynchronizer = this.enabled.find(synchronizer => synchronizer instanceof SettingsSynchroniser);
		if (settingsSynchronizer) {
			const remote = await (<SettingsSynchroniser>settingsSynchronizer).getRemoteUserDataSyncConfiguration(manifest);
			return { ...local, ...remote };
		}
		return local;
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
			case SyncResource.GlobalState: return 4;
			case SyncResource.Extensions: return 5;
			case SyncResource.Profiles: return 6;
			case SyncResource.WorkspaceState: return 7;
		}
	}

}

function canBailout(e: any): boolean {
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
	telemetryService.publicLog2<{ code: string; service: string; serverCode?: string; url?: string; resource?: string; executionId?: string }, SyncErrorClassification>('sync/error',
		{
			code: userDataSyncError.code,
			serverCode: userDataSyncError instanceof UserDataSyncStoreError ? String(userDataSyncError.serverCode) : undefined,
			url: userDataSyncError instanceof UserDataSyncStoreError ? userDataSyncError.url : undefined,
			resource: userDataSyncError.resource,
			executionId,
			service: userDataSyncStoreManagementService.userDataSyncStore!.url.toString()
		});
}
