/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/arrays';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { isUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IHeaders } from 'vs/base/parts/request/common/request';
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
import { ALL_SYNC_RESOURCES, Change, createSyncHeaders, IManualSyncTask, IResourcePreview, ISyncResourceHandle, ISyncResourcePreview, ISyncTask, IUserDataManifest, IUserDataSyncConfiguration, IUserDataSyncEnablementService, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, MergeState, SyncResource, SyncStatus, UserDataSyncError, UserDataSyncErrorCode, UserDataSyncStoreError, USER_DATA_SYNC_CONFIGURATION_SCOPE } from 'vs/platform/userDataSync/common/userDataSync';

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

	private _conflicts: [SyncResource, IResourcePreview[]][] = [];
	get conflicts(): [SyncResource, IResourcePreview[]][] { return this._conflicts; }
	private _onDidChangeConflicts: Emitter<[SyncResource, IResourcePreview[]][]> = this._register(new Emitter<[SyncResource, IResourcePreview[]][]>());
	readonly onDidChangeConflicts: Event<[SyncResource, IResourcePreview[]][]> = this._onDidChangeConflicts.event;

	private _syncErrors: [SyncResource, UserDataSyncError][] = [];
	private _onSyncErrors: Emitter<[SyncResource, UserDataSyncError][]> = this._register(new Emitter<[SyncResource, UserDataSyncError][]>());
	readonly onSyncErrors: Event<[SyncResource, UserDataSyncError][]> = this._onSyncErrors.event;

	private _lastSyncTime: number | undefined = undefined;
	get lastSyncTime(): number | undefined { return this._lastSyncTime; }
	private _onDidChangeLastSyncTime: Emitter<number> = this._register(new Emitter<number>());
	readonly onDidChangeLastSyncTime: Event<number> = this._onDidChangeLastSyncTime.event;

	private _onDidResetLocal = this._register(new Emitter<void>());
	readonly onDidResetLocal = this._onDidResetLocal.event;
	private _onDidResetRemote = this._register(new Emitter<void>());
	readonly onDidResetRemote = this._onDidResetRemote.event;

	private profileSynchronizers: Map<string, [ProfileSynchronizer, IDisposable]> | undefined;

	constructor(
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncStoreManagementService private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
	) {
		super();
		this._status = userDataSyncStoreManagementService.userDataSyncStore ? SyncStatus.Idle : SyncStatus.Uninitialized;
		this._lastSyncTime = this.storageService.getNumber(LAST_SYNC_TIME_KEY, StorageScope.APPLICATION, undefined);
		this._register(toDisposable(() => this.clearProfileSynchronizers()));
	}

	async createSyncTask(manifest: IUserDataManifest | null, disableCache?: boolean): Promise<ISyncTask> {
		this.checkEnablement();

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
				cancellablePromise = createCancelablePromise(token => that.sync(manifest, executionId, token));
				return cancellablePromise.finally(() => cancellablePromise = undefined);
			},
			stop(): Promise<void> {
				cancellablePromise?.cancel();
				return that.stop();
			}
		};
	}

	async createManualSyncTask(): Promise<IManualSyncTask> {
		this.checkEnablement();

		if (this.userDataSyncEnablementService.isEnabled()) {
			throw new UserDataSyncError('Cannot start manual sync when sync is enabled', UserDataSyncErrorCode.LocalError);
		}

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

		const profileSynchronizer = this.getProfileSynchronizers();
		const onstop = async () => {
			await this.stop();
			await this.resetLocal();
		};
		return new ManualSyncTask(executionId, manifest, syncHeaders, profileSynchronizer[0].enabled, onstop, this.configurationService, this.logService);
	}

	private async sync(manifest: IUserDataManifest | null, executionId: string, token: CancellationToken): Promise<void> {
		// Return if cancellation is requested
		if (token.isCancellationRequested) {
			return;
		}
		const profileSynchronizers = this.getProfileSynchronizers();
		const startTime = new Date().getTime();
		this._syncErrors = [];
		try {
			this.logService.trace('Sync started.');
			if (this.status !== SyncStatus.HasConflicts) {
				this.setStatus(SyncStatus.Syncing);
			}
			for (const profileSynchronizer of profileSynchronizers) {
				if (token.isCancellationRequested) {
					return;
				}
				this._syncErrors.push(...await profileSynchronizer.sync(manifest, executionId, token));
			}
			this.logService.info(`Sync done. Took ${new Date().getTime() - startTime}ms`);
			this.updateLastSyncTime();
		} finally {
			this._onSyncErrors.fire(this._syncErrors);
		}
	}

	private async stop(): Promise<void> {
		if (this.status !== SyncStatus.Idle && this.profileSynchronizers) {
			await Promise.allSettled([...this.profileSynchronizers.values()].map(([profileSynchronizer]) => profileSynchronizer.stop()));
		}
	}

	async replace(uri: URI): Promise<void> {
		this.checkEnablement();

		await this.performSynchronizerAction(async synchronizer => {
			if (await synchronizer.replace(uri)) {
				return true;
			}
			return undefined;
		});
	}

	async accept(syncResource: SyncResource, resource: URI, content: string | null | undefined, apply: boolean): Promise<void> {
		this.checkEnablement();

		await this.performSynchronizerAction(async synchronizer => {
			if (synchronizer.resource === syncResource) {
				await synchronizer.accept(resource, content);
				if (apply) {
					await synchronizer.apply(false, createSyncHeaders(generateUuid()));
				}
				return true;
			}
			return undefined;
		});
	}

	async resolveContent(resource: URI): Promise<string | null> {
		return this.performSynchronizerAction(async synchronizer => {
			const content = await synchronizer.resolveContent(resource);
			if (content) {
				return content;
			}
			return undefined;
		});
	}

	async getRemoteSyncResourceHandles(resource: SyncResource): Promise<ISyncResourceHandle[]> {
		const result = await this.performSynchronizerAction(async synchronizer => {
			if (synchronizer.resource === resource) {
				return synchronizer.getRemoteSyncResourceHandles();
			}
			return undefined;
		});
		return result || [];
	}

	async getLocalSyncResourceHandles(resource: SyncResource): Promise<ISyncResourceHandle[]> {
		const result = await this.performSynchronizerAction(async synchronizer => {
			if (synchronizer.resource === resource) {
				return synchronizer.getLocalSyncResourceHandles();
			}
			return undefined;
		});
		return result || [];
	}

	async getAssociatedResources(resource: SyncResource, syncResourceHandle: ISyncResourceHandle): Promise<{ resource: URI; comparableResource: URI }[]> {
		const result = await this.performSynchronizerAction(async synchronizer => {
			if (synchronizer.resource === resource) {
				return synchronizer.getAssociatedResources(syncResourceHandle);
			}
			return undefined;
		});
		return result || [];
	}

	async getMachineId(resource: SyncResource, syncResourceHandle: ISyncResourceHandle): Promise<string | undefined> {
		const result = await this.performSynchronizerAction(async synchronizer => {
			if (synchronizer.resource === resource) {
				const result = await synchronizer.getMachineId(syncResourceHandle);
				return result || null;
			}
			return undefined;
		});
		return result || undefined;
	}

	async hasLocalData(): Promise<boolean> {
		const result = await this.performSynchronizerAction(async synchronizer => {
			// skip global state synchronizer
			if (synchronizer.resource !== SyncResource.GlobalState && await synchronizer.hasLocalData()) {
				return true;
			}
			return undefined;
		});
		return !!result;
	}

	async hasPreviouslySynced(): Promise<boolean> {
		const result = await this.performSynchronizerAction(async synchronizer => {
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
		this.storageService.remove(LAST_SYNC_TIME_KEY, StorageScope.APPLICATION);
		if (this.profileSynchronizers) {
			for (const [synchronizer] of this.profileSynchronizers.values()) {
				try {
					await synchronizer.resetLocal();
				} catch (e) {
					this.logService.error(e);
				}
			}
			this.clearProfileSynchronizers();
		}
		this._onDidResetLocal.fire();
		this.logService.info('Did reset the local sync state.');
	}

	private async performSynchronizerAction<T>(action: (synchroniser: IUserDataSynchroniser) => Promise<T | undefined>): Promise<T | null> {
		const disposables = new DisposableStore();
		try {
			let profileSynchronizers = this.profileSynchronizers;
			if (!profileSynchronizers) {
				profileSynchronizers = this.createProfileSynchronizers();
				profileSynchronizers.forEach(([, disposable]) => disposables.add(disposable));
			}
			for (const [profileSynchronizer] of profileSynchronizers.values()) {
				const allSynchronizers = [...profileSynchronizer.enabled, ...profileSynchronizer.disabled.map(syncResource => disposables.add(profileSynchronizer.createSynchronizer(syncResource)))];
				for (const synchronizer of allSynchronizers) {
					const result = await action(synchronizer);
					if (!isUndefined(result)) {
						return result;
					}
				}
			}
			return null;
		} finally {
			disposables.dispose();
		}
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

	private setConflicts(conflicts: [SyncResource, IResourcePreview[]][]): void {
		if (!equals(this._conflicts, conflicts, ([syncResourceA, conflictsA], [syncResourceB, conflictsB]) => syncResourceA === syncResourceA && equals(conflictsA, conflictsB, (a, b) => isEqual(a.previewResource, b.previewResource)))) {
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

	getProfileSynchronizers(): ProfileSynchronizer[] {
		if (!this.profileSynchronizers) {
			this.profileSynchronizers = this.createProfileSynchronizers();
		}
		return [...this.profileSynchronizers.values()].map(([profileSynchronizer]) => profileSynchronizer);
	}

	private createProfileSynchronizers(): Map<string, [ProfileSynchronizer, IDisposable]> {
		const profileSynchronizers = new Map<string, [ProfileSynchronizer, IDisposable]>();
		for (const profile of [this.userDataProfilesService.defaultProfile]) {
			const disposables = new DisposableStore();
			const profileSynchronizer = disposables.add(profile.isDefault ? this.instantiationService.createInstance(DefaultProfileSynchronizer) : this.instantiationService.createInstance(ProfileSynchronizer, profile));
			disposables.add(profileSynchronizer.onDidChangeStatus(e => this.setStatus(e)));
			disposables.add(profileSynchronizer.onDidChangeConflicts(e => this.setConflicts(e)));
			disposables.add(profileSynchronizer.onDidChangeLocal(e => this._onDidChangeLocal.fire(e)));
			profileSynchronizers.set(profile.id, [profileSynchronizer, disposables]);
		}
		return profileSynchronizers;
	}

	private clearProfileSynchronizers(): void {
		if (this.profileSynchronizers) {
			this.profileSynchronizers.forEach(([, disposable]) => disposable.dispose());
			this.profileSynchronizers.clear();
			this.profileSynchronizers = undefined;
		}
	}

	private checkEnablement(): void {
		if (!this.userDataSyncStoreManagementService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
	}

}

class ManualSyncTask extends Disposable implements IManualSyncTask {

	private previewsPromise: CancelablePromise<[SyncResource, ISyncResourcePreview][]> | undefined;
	private previews: [SyncResource, ISyncResourcePreview][] | undefined;

	private synchronizingResources: [SyncResource, URI[]][] = [];
	private _onSynchronizeResources = this._register(new Emitter<[SyncResource, URI[]][]>());
	readonly onSynchronizeResources = this._onSynchronizeResources.event;

	private isDisposed: boolean = false;

	get status(): SyncStatus {
		if (this.synchronisers.some(s => s.status === SyncStatus.HasConflicts)) {
			return SyncStatus.HasConflicts;
		}
		if (this.synchronisers.some(s => s.status === SyncStatus.Syncing)) {
			return SyncStatus.Syncing;
		}
		return SyncStatus.Idle;
	}

	constructor(
		readonly id: string,
		readonly manifest: IUserDataManifest | null,
		private readonly syncHeaders: IHeaders,
		private readonly synchronisers: IUserDataSynchroniser[],
		private readonly onStop: () => Promise<void>,
		private readonly configurationService: IConfigurationService,
		private readonly logService: IUserDataSyncLogService,
	) {
		super();
	}

	async preview(): Promise<[SyncResource, ISyncResourcePreview][]> {
		try {
			if (this.isDisposed) {
				throw new Error('Disposed');
			}
			if (!this.previewsPromise) {
				this.previewsPromise = createCancelablePromise(token => this.getPreviews(token));
			}
			if (!this.previews) {
				this.previews = await this.previewsPromise;
			}
			return this.previews;
		} catch (error) {
			this.logService.error(error);
			throw error;
		}
	}

	async accept(resource: URI, content?: string | null): Promise<[SyncResource, ISyncResourcePreview][]> {
		try {
			return await this.performAction(resource, sychronizer => sychronizer.accept(resource, content));
		} catch (error) {
			this.logService.error(error);
			throw error;
		}
	}

	async merge(resource?: URI): Promise<[SyncResource, ISyncResourcePreview][]> {
		try {
			if (resource) {
				return await this.performAction(resource, sychronizer => sychronizer.merge(resource));
			} else {
				return await this.mergeAll();
			}
		} catch (error) {
			this.logService.error(error);
			throw error;
		}
	}

	async discard(resource: URI): Promise<[SyncResource, ISyncResourcePreview][]> {
		try {
			return await this.performAction(resource, sychronizer => sychronizer.discard(resource));
		} catch (error) {
			this.logService.error(error);
			throw error;
		}
	}

	async discardConflicts(): Promise<[SyncResource, ISyncResourcePreview][]> {
		try {
			if (!this.previews) {
				throw new Error('Missing preview. Create preview and try again.');
			}
			if (this.synchronizingResources.length) {
				throw new Error('Cannot discard while synchronizing resources');
			}

			const conflictResources: URI[] = [];
			for (const [, syncResourcePreview] of this.previews) {
				for (const resourcePreview of syncResourcePreview.resourcePreviews) {
					if (resourcePreview.mergeState === MergeState.Conflict) {
						conflictResources.push(resourcePreview.previewResource);
					}
				}
			}

			for (const resource of conflictResources) {
				await this.discard(resource);
			}
			return this.previews;
		} catch (error) {
			this.logService.error(error);
			throw error;
		}
	}

	async apply(): Promise<[SyncResource, ISyncResourcePreview][]> {
		try {
			if (!this.previews) {
				throw new Error('You need to create preview before applying');
			}
			if (this.synchronizingResources.length) {
				throw new Error('Cannot pull while synchronizing resources');
			}
			const previews: [SyncResource, ISyncResourcePreview][] = [];
			for (const [syncResource, preview] of this.previews) {
				this.synchronizingResources.push([syncResource, preview.resourcePreviews.map(r => r.localResource)]);
				this._onSynchronizeResources.fire(this.synchronizingResources);

				const synchroniser = this.synchronisers.find(s => s.resource === syncResource)!;

				/* merge those which are not yet merged */
				for (const resourcePreview of preview.resourcePreviews) {
					if ((resourcePreview.localChange !== Change.None || resourcePreview.remoteChange !== Change.None) && resourcePreview.mergeState === MergeState.Preview) {
						await synchroniser.merge(resourcePreview.previewResource);
					}
				}

				/* apply */
				const newPreview = await synchroniser.apply(false, this.syncHeaders);
				if (newPreview) {
					previews.push(this.toSyncResourcePreview(synchroniser.resource, newPreview));
				}

				this.synchronizingResources.splice(this.synchronizingResources.findIndex(s => s[0] === syncResource), 1);
				this._onSynchronizeResources.fire(this.synchronizingResources);
			}
			this.previews = previews;
			return this.previews;
		} catch (error) {
			this.logService.error(error);
			throw error;
		}
	}

	async pull(): Promise<void> {
		try {
			if (!this.previews) {
				throw new Error('You need to create preview before applying');
			}
			if (this.synchronizingResources.length) {
				throw new Error('Cannot pull while synchronizing resources');
			}
			for (const [syncResource, preview] of this.previews) {
				this.synchronizingResources.push([syncResource, preview.resourcePreviews.map(r => r.localResource)]);
				this._onSynchronizeResources.fire(this.synchronizingResources);
				const synchroniser = this.synchronisers.find(s => s.resource === syncResource)!;
				for (const resourcePreview of preview.resourcePreviews) {
					await synchroniser.accept(resourcePreview.remoteResource);
				}
				await synchroniser.apply(true, this.syncHeaders);
				this.synchronizingResources.splice(this.synchronizingResources.findIndex(s => s[0] === syncResource), 1);
				this._onSynchronizeResources.fire(this.synchronizingResources);
			}
			this.previews = [];
		} catch (error) {
			this.logService.error(error);
			throw error;
		}
	}

	async push(): Promise<void> {
		try {
			if (!this.previews) {
				throw new Error('You need to create preview before applying');
			}
			if (this.synchronizingResources.length) {
				throw new Error('Cannot pull while synchronizing resources');
			}
			for (const [syncResource, preview] of this.previews) {
				this.synchronizingResources.push([syncResource, preview.resourcePreviews.map(r => r.localResource)]);
				this._onSynchronizeResources.fire(this.synchronizingResources);
				const synchroniser = this.synchronisers.find(s => s.resource === syncResource)!;
				for (const resourcePreview of preview.resourcePreviews) {
					await synchroniser.accept(resourcePreview.localResource);
				}
				await synchroniser.apply(true, this.syncHeaders);
				this.synchronizingResources.splice(this.synchronizingResources.findIndex(s => s[0] === syncResource), 1);
				this._onSynchronizeResources.fire(this.synchronizingResources);
			}
			this.previews = [];
		} catch (error) {
			this.logService.error(error);
			throw error;
		}
	}

	async stop(): Promise<void> {
		await this.onStop();
		this.reset();
	}

	private async performAction(resource: URI, action: (synchroniser: IUserDataSynchroniser) => Promise<ISyncResourcePreview | null>): Promise<[SyncResource, ISyncResourcePreview][]> {
		if (!this.previews) {
			throw new Error('Missing preview. Create preview and try again.');
		}

		const index = this.previews.findIndex(([, preview]) => preview.resourcePreviews.some(({ localResource, previewResource, remoteResource }) =>
			isEqual(resource, localResource) || isEqual(resource, previewResource) || isEqual(resource, remoteResource)));
		if (index === -1) {
			return this.previews;
		}

		const [syncResource, previews] = this.previews[index];
		const resourcePreview = previews.resourcePreviews.find(({ localResource, remoteResource, previewResource }) => isEqual(localResource, resource) || isEqual(remoteResource, resource) || isEqual(previewResource, resource));
		if (!resourcePreview) {
			return this.previews;
		}

		let synchronizingResources = this.synchronizingResources.find(s => s[0] === syncResource);
		if (!synchronizingResources) {
			synchronizingResources = [syncResource, []];
			this.synchronizingResources.push(synchronizingResources);
		}
		if (!synchronizingResources[1].some(s => isEqual(s, resourcePreview.localResource))) {
			synchronizingResources[1].push(resourcePreview.localResource);
			this._onSynchronizeResources.fire(this.synchronizingResources);
		}

		const synchroniser = this.synchronisers.find(s => s.resource === this.previews![index][0])!;
		const preview = await action(synchroniser);
		preview ? this.previews.splice(index, 1, this.toSyncResourcePreview(synchroniser.resource, preview)) : this.previews.splice(index, 1);

		const i = this.synchronizingResources.findIndex(s => s[0] === syncResource);
		this.synchronizingResources[i][1].splice(synchronizingResources[1].findIndex(r => isEqual(r, resourcePreview.localResource)), 1);
		if (!synchronizingResources[1].length) {
			this.synchronizingResources.splice(i, 1);
			this._onSynchronizeResources.fire(this.synchronizingResources);
		}

		return this.previews;
	}

	private async mergeAll(): Promise<[SyncResource, ISyncResourcePreview][]> {
		if (!this.previews) {
			throw new Error('You need to create preview before merging or applying');
		}
		if (this.synchronizingResources.length) {
			throw new Error('Cannot merge or apply while synchronizing resources');
		}
		const previews: [SyncResource, ISyncResourcePreview][] = [];
		for (const [syncResource, preview] of this.previews) {
			this.synchronizingResources.push([syncResource, preview.resourcePreviews.map(r => r.localResource)]);
			this._onSynchronizeResources.fire(this.synchronizingResources);

			const synchroniser = this.synchronisers.find(s => s.resource === syncResource)!;

			/* merge those which are not yet merged */
			let newPreview: ISyncResourcePreview | null = preview;
			for (const resourcePreview of preview.resourcePreviews) {
				if ((resourcePreview.localChange !== Change.None || resourcePreview.remoteChange !== Change.None) && resourcePreview.mergeState === MergeState.Preview) {
					newPreview = await synchroniser.merge(resourcePreview.previewResource);
				}
			}

			if (newPreview) {
				previews.push(this.toSyncResourcePreview(synchroniser.resource, newPreview));
			}

			this.synchronizingResources.splice(this.synchronizingResources.findIndex(s => s[0] === syncResource), 1);
			this._onSynchronizeResources.fire(this.synchronizingResources);
		}
		this.previews = previews;
		return this.previews;
	}

	private async getPreviews(token: CancellationToken): Promise<[SyncResource, ISyncResourcePreview][]> {
		const result: [SyncResource, ISyncResourcePreview][] = [];
		const remoteUserDataSyncConfiguration: IUserDataSyncConfiguration = await this.getUserDataSyncConfiguration();
		for (const synchroniser of this.synchronisers) {
			if (token.isCancellationRequested) {
				return [];
			}
			const preview = await synchroniser.preview(this.manifest, remoteUserDataSyncConfiguration, this.syncHeaders);
			if (preview) {
				result.push(this.toSyncResourcePreview(synchroniser.resource, preview));
			}
		}
		return result;
	}

	private async getUserDataSyncConfiguration(): Promise<IUserDataSyncConfiguration> {
		const local = this.configurationService.getValue<IUserDataSyncConfiguration>(USER_DATA_SYNC_CONFIGURATION_SCOPE);
		const settingsSynchronizer = this.synchronisers.find(synchronizer => synchronizer instanceof SettingsSynchroniser);
		if (settingsSynchronizer) {
			const remote = await (<SettingsSynchroniser>settingsSynchronizer).getRemoteUserDataSyncConfiguration(this.manifest);
			return { ...local, ...remote };
		}
		return local;
	}

	private toSyncResourcePreview(syncResource: SyncResource, preview: ISyncResourcePreview): [SyncResource, ISyncResourcePreview] {
		return [
			syncResource,
			{
				isLastSyncFromCurrentMachine: preview.isLastSyncFromCurrentMachine,
				resourcePreviews: preview.resourcePreviews.map(toStrictResourcePreview)
			}
		];
	}

	private reset(): void {
		if (this.previewsPromise) {
			this.previewsPromise.cancel();
			this.previewsPromise = undefined;
		}
		this.previews = undefined;
		this.synchronizingResources = [];
	}

	override dispose(): void {
		this.reset();
		this.isDisposed = true;
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

	private _conflicts: [SyncResource, IResourcePreview[]][] = [];
	get conflicts(): [SyncResource, IResourcePreview[]][] { return this._conflicts; }
	private _onDidChangeConflicts: Emitter<[SyncResource, IResourcePreview[]][]> = this._register(new Emitter<[SyncResource, IResourcePreview[]][]>());
	readonly onDidChangeConflicts: Event<[SyncResource, IResourcePreview[]][]> = this._onDidChangeConflicts.event;

	constructor(
		protected profile: IUserDataProfile,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IUserDataSyncStoreManagementService private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
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
		const disposables = new DisposableStore();
		const synchronizer = disposables.add(this.createSynchronizer(syncResource));
		disposables.add(synchronizer.onDidChangeStatus(() => this.updateStatus()));
		disposables.add(synchronizer.onDidChangeConflicts(() => this.updateConflicts()));
		disposables.add(synchronizer.onDidChangeLocal(() => this._onDidChangeLocal.fire(syncResource)));
		const order = this.getOrder(syncResource);
		this._enabled.push([synchronizer, order, disposables]);
	}

	protected deRegisterSynchronizer(syncResource: SyncResource): void {
		const index = this._enabled.findIndex(([synchronizer]) => synchronizer.resource === syncResource);
		if (index !== -1) {
			const removed = this._enabled.splice(index, 1);
			for (const [synchronizer, , disposable] of removed) {
				if (synchronizer.status !== SyncStatus.Idle) {
					const hasConflicts = synchronizer.conflicts.length > 0;
					synchronizer.stop();
					if (hasConflicts) {
						this.updateConflicts();
					}
					this.updateStatus();
				}
				disposable.dispose();
			}
		}
	}

	createSynchronizer(syncResource: SyncResource): IUserDataSynchroniser & IDisposable {
		switch (syncResource) {
			case SyncResource.Settings: return this.instantiationService.createInstance(SettingsSynchroniser, this.profile.settingsResource);
			case SyncResource.Keybindings: return this.instantiationService.createInstance(KeybindingsSynchroniser, this.profile.keybindingsResource);
			case SyncResource.Snippets: return this.instantiationService.createInstance(SnippetsSynchroniser, this.profile.snippetsHome);
			case SyncResource.Tasks: return this.instantiationService.createInstance(TasksSynchroniser, this.profile.tasksResource);
			case SyncResource.GlobalState: return this.instantiationService.createInstance(GlobalStateSynchroniser);
			case SyncResource.Extensions: return this.instantiationService.createInstance(ExtensionsSynchroniser, this.profile.extensionsResource);
		}
	}

	async sync(manifest: IUserDataManifest | null, executionId: string, token: CancellationToken): Promise<[SyncResource, UserDataSyncError][]> {

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
					await synchroniser.sync(manifest, syncHeaders);
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
		const conflicts: [SyncResource, IResourcePreview[]][] = this.enabled.filter(s => s.status === SyncStatus.HasConflicts).map(s => ([s.resource, s.conflicts.map(toStrictResourcePreview)]));
		if (!equals(this._conflicts, conflicts, ([syncResourceA, conflictsA], [syncResourceB, conflictsB]) => syncResourceA === syncResourceA && equals(conflictsA, conflictsB, (a, b) => isEqual(a.previewResource, b.previewResource)))) {
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
		}
	}

}

class DefaultProfileSynchronizer extends ProfileSynchronizer {

	constructor(
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@IUserDataSyncStoreManagementService userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
	) {
		super(userDataProfilesService.defaultProfile, userDataSyncEnablementService, instantiationService, extensionGalleryService, userDataSyncStoreManagementService, telemetryService, logService);
		this._register(userDataProfilesService.onDidChangeProfiles(() => {
			if ((userDataProfilesService.defaultProfile.extensionsResource && !this.profile.extensionsResource) ||
				(!userDataProfilesService.defaultProfile.extensionsResource && this.profile.extensionsResource)) {
				this.deRegisterSynchronizer(SyncResource.Extensions);
				this.profile = userDataProfilesService.defaultProfile;
				this.registerSynchronizer(SyncResource.Extensions);
			}
		}));
	}

}

function canBailout(e: any): boolean {
	if (e instanceof UserDataSyncError) {
		switch (e.code) {
			case UserDataSyncErrorCode.TooLarge:
			case UserDataSyncErrorCode.TooManyRequests:
			case UserDataSyncErrorCode.TooManyRequestsAndRetryAfter:
			case UserDataSyncErrorCode.LocalTooManyRequests:
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

function toStrictResourcePreview(resourcePreview: IResourcePreview): IResourcePreview {
	return {
		baseResource: resourcePreview.baseResource,
		localResource: resourcePreview.localResource,
		previewResource: resourcePreview.previewResource,
		remoteResource: resourcePreview.remoteResource,
		acceptedResource: resourcePreview.acceptedResource,
		localChange: resourcePreview.localChange,
		remoteChange: resourcePreview.remoteChange,
		mergeState: resourcePreview.mergeState,
	};
}
