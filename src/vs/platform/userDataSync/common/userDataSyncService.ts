/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, SyncStatus, IUserDataSyncStoreService, SyncResource, IUserDataSyncLogService, IUserDataSynchroniser, UserDataSyncErrorCode, UserDataSyncError, SyncResourceConflicts, ISyncResourceHandle, IUserDataManifest, ISyncTask, Change, IResourcePreview } from 'vs/platform/userDataSync/common/userDataSync';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { ExtensionsSynchroniser } from 'vs/platform/userDataSync/common/extensionsSync';
import { KeybindingsSynchroniser } from 'vs/platform/userDataSync/common/keybindingsSync';
import { GlobalStateSynchroniser } from 'vs/platform/userDataSync/common/globalStateSync';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { equals } from 'vs/base/common/arrays';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { URI } from 'vs/base/common/uri';
import { SettingsSynchroniser } from 'vs/platform/userDataSync/common/settingsSync';
import { isEqual } from 'vs/base/common/resources';
import { SnippetsSynchroniser } from 'vs/platform/userDataSync/common/snippetsSync';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IHeaders } from 'vs/base/parts/request/common/request';
import { generateUuid } from 'vs/base/common/uuid';

type SyncErrorClassification = {
	resource?: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
	executionId?: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

const LAST_SYNC_TIME_KEY = 'sync.lastSyncTime';

export class UserDataSyncService extends Disposable implements IUserDataSyncService {

	_serviceBrand: any;

	private readonly synchronisers: IUserDataSynchroniser[];

	private _status: SyncStatus = SyncStatus.Uninitialized;
	get status(): SyncStatus { return this._status; }
	private _onDidChangeStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangeStatus.event;

	private _onSynchronizeResource: Emitter<SyncResource> = this._register(new Emitter<SyncResource>());
	readonly onSynchronizeResource: Event<SyncResource> = this._onSynchronizeResource.event;

	readonly onDidChangeLocal: Event<SyncResource>;

	private _conflicts: SyncResourceConflicts[] = [];
	get conflicts(): SyncResourceConflicts[] { return this._conflicts; }
	private _onDidChangeConflicts: Emitter<SyncResourceConflicts[]> = this._register(new Emitter<SyncResourceConflicts[]>());
	readonly onDidChangeConflicts: Event<SyncResourceConflicts[]> = this._onDidChangeConflicts.event;

	private _syncErrors: [SyncResource, UserDataSyncError][] = [];
	private _onSyncErrors: Emitter<[SyncResource, UserDataSyncError][]> = this._register(new Emitter<[SyncResource, UserDataSyncError][]>());
	readonly onSyncErrors: Event<[SyncResource, UserDataSyncError][]> = this._onSyncErrors.event;

	private _lastSyncTime: number | undefined = undefined;
	get lastSyncTime(): number | undefined { return this._lastSyncTime; }
	private _onDidChangeLastSyncTime: Emitter<number> = this._register(new Emitter<number>());
	readonly onDidChangeLastSyncTime: Event<number> = this._onDidChangeLastSyncTime.event;

	private readonly settingsSynchroniser: SettingsSynchroniser;
	private readonly keybindingsSynchroniser: KeybindingsSynchroniser;
	private readonly snippetsSynchroniser: SnippetsSynchroniser;
	private readonly extensionsSynchroniser: ExtensionsSynchroniser;
	private readonly globalStateSynchroniser: GlobalStateSynchroniser;

	constructor(
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.settingsSynchroniser = this._register(this.instantiationService.createInstance(SettingsSynchroniser));
		this.keybindingsSynchroniser = this._register(this.instantiationService.createInstance(KeybindingsSynchroniser));
		this.snippetsSynchroniser = this._register(this.instantiationService.createInstance(SnippetsSynchroniser));
		this.globalStateSynchroniser = this._register(this.instantiationService.createInstance(GlobalStateSynchroniser));
		this.extensionsSynchroniser = this._register(this.instantiationService.createInstance(ExtensionsSynchroniser));
		this.synchronisers = [this.settingsSynchroniser, this.keybindingsSynchroniser, this.snippetsSynchroniser, this.globalStateSynchroniser, this.extensionsSynchroniser];
		this.updateStatus();

		if (this.userDataSyncStoreService.userDataSyncStore) {
			this._register(Event.any(...this.synchronisers.map(s => Event.map(s.onDidChangeStatus, () => undefined)))(() => this.updateStatus()));
			this._register(Event.any(...this.synchronisers.map(s => Event.map(s.onDidChangeConflicts, () => undefined)))(() => this.updateConflicts()));
		}

		this._lastSyncTime = this.storageService.getNumber(LAST_SYNC_TIME_KEY, StorageScope.GLOBAL, undefined);
		this.onDidChangeLocal = Event.any(...this.synchronisers.map(s => Event.map(s.onDidChangeLocal, () => s.resource)));
	}

	async pull(): Promise<void> {
		await this.checkEnablement();
		try {
			for (const synchroniser of this.synchronisers) {
				try {
					this._onSynchronizeResource.fire(synchroniser.resource);
					await synchroniser.pull();
				} catch (e) {
					this.handleSynchronizerError(e, synchroniser.resource);
				}
			}
			this.updateLastSyncTime();
		} catch (error) {
			if (error instanceof UserDataSyncError) {
				this.telemetryService.publicLog2<{ resource?: string, executionId?: string }, SyncErrorClassification>(`sync/error/${error.code}`, { resource: error.resource });
			}
			throw error;
		}
	}

	async push(): Promise<void> {
		await this.checkEnablement();
		try {
			for (const synchroniser of this.synchronisers) {
				try {
					await synchroniser.push();
				} catch (e) {
					this.handleSynchronizerError(e, synchroniser.resource);
				}
			}
			this.updateLastSyncTime();
		} catch (error) {
			if (error instanceof UserDataSyncError) {
				this.telemetryService.publicLog2<{ resource?: string, executionId?: string }, SyncErrorClassification>(`sync/error/${error.code}`, { resource: error.resource });
			}
			throw error;
		}
	}

	private recoveredSettings: boolean = false;
	async sync(): Promise<void> {
		const syncTask = await this.createSyncTask();
		return syncTask.run(CancellationToken.None);
	}

	async createSyncTask(): Promise<ISyncTask> {
		this.telemetryService.publicLog2('sync/getmanifest');
		const executionId = generateUuid();
		let manifest: IUserDataManifest | null;
		try {
			manifest = await this.userDataSyncStoreService.manifest({ 'X-Execution-Id': executionId });
		} catch (error) {
			if (error instanceof UserDataSyncError) {
				this.telemetryService.publicLog2<{ resource?: string, executionId?: string }, SyncErrorClassification>(`sync/error/${error.code}`, { resource: error.resource, executionId });
			}
			throw error;
		}

		let executed = false;
		const that = this;
		return {
			manifest,
			run(token: CancellationToken): Promise<void> {
				if (executed) {
					throw new Error('Can run a task only once');
				}
				return that.doSync(manifest, executionId, token);
			}
		};
	}

	private async doSync(manifest: IUserDataManifest | null, executionId: string, token: CancellationToken): Promise<void> {
		await this.checkEnablement();

		if (!this.recoveredSettings) {
			await this.settingsSynchroniser.recoverSettings();
			this.recoveredSettings = true;
		}

		// Return if cancellation is requested
		if (token.isCancellationRequested) {
			return;
		}

		const startTime = new Date().getTime();
		this._syncErrors = [];
		try {
			this.logService.trace('Sync started.');
			if (this.status !== SyncStatus.HasConflicts) {
				this.setStatus(SyncStatus.Syncing);
			}

			const syncHeaders: IHeaders = { 'X-Execution-Id': executionId };

			for (const synchroniser of this.synchronisers) {
				// Return if cancellation is requested
				if (token.isCancellationRequested) {
					return;
				}
				try {
					this._onSynchronizeResource.fire(synchroniser.resource);
					await synchroniser.sync(manifest, syncHeaders);
				} catch (e) {
					this.handleSynchronizerError(e, synchroniser.resource);
					this._syncErrors.push([synchroniser.resource, UserDataSyncError.toUserDataSyncError(e)]);
				}
			}

			this.logService.info(`Sync done. Took ${new Date().getTime() - startTime}ms`);
			this.updateLastSyncTime();
		} catch (error) {
			if (error instanceof UserDataSyncError) {
				this.telemetryService.publicLog2<{ resource?: string, executionId?: string }, SyncErrorClassification>(`sync/error/${error.code}`, { resource: error.resource, executionId });
			}
			throw error;
		} finally {
			this.updateStatus();
			this._onSyncErrors.fire(this._syncErrors);
		}
	}

	async replace(uri: URI): Promise<void> {
		await this.checkEnablement();
		for (const synchroniser of this.synchronisers) {
			if (await synchroniser.replace(uri)) {
				return;
			}
		}
	}

	async stop(): Promise<void> {
		await this.checkEnablement();

		if (this.status === SyncStatus.Idle) {
			return;
		}

		for (const synchroniser of this.synchronisers) {
			try {
				if (synchroniser.status !== SyncStatus.Idle) {
					await synchroniser.stop();
				}
			} catch (e) {
				this.logService.error(e);
			}
		}

	}

	async acceptPreviewContent(resource: URI, content: string): Promise<void> {
		await this.checkEnablement();
		const synchroniser = this.synchronisers.find(synchroniser => synchroniser.resourcePreviews.some(({ localResource, previewResource, remoteResource }) =>
			isEqual(resource, localResource) || isEqual(resource, previewResource) || isEqual(resource, remoteResource)));
		if (synchroniser) {
			await synchroniser.acceptPreviewContent(resource, content);
		}
	}

	async resolveContent(resource: URI): Promise<string | null> {
		for (const synchroniser of this.synchronisers) {
			const content = await synchroniser.resolveContent(resource);
			if (content) {
				return content;
			}
		}
		return null;
	}

	getRemoteSyncResourceHandles(resource: SyncResource): Promise<ISyncResourceHandle[]> {
		return this.getSynchroniser(resource).getRemoteSyncResourceHandles();
	}

	getLocalSyncResourceHandles(resource: SyncResource): Promise<ISyncResourceHandle[]> {
		return this.getSynchroniser(resource).getLocalSyncResourceHandles();
	}

	getAssociatedResources(resource: SyncResource, syncResourceHandle: ISyncResourceHandle): Promise<{ resource: URI, comparableResource?: URI }[]> {
		return this.getSynchroniser(resource).getAssociatedResources(syncResourceHandle);
	}

	getMachineId(resource: SyncResource, syncResourceHandle: ISyncResourceHandle): Promise<string | undefined> {
		return this.getSynchroniser(resource).getMachineId(syncResourceHandle);
	}

	async isFirstTimeSyncingWithAnotherMachine(): Promise<boolean> {
		await this.checkEnablement();

		if (!await this.userDataSyncStoreService.manifest()) {
			return false;
		}

		// skip global state synchronizer
		const synchronizers = [this.settingsSynchroniser, this.keybindingsSynchroniser, this.snippetsSynchroniser, this.extensionsSynchroniser];

		let hasLocalData: boolean = false;
		for (const synchroniser of synchronizers) {
			if (await synchroniser.hasLocalData()) {
				hasLocalData = true;
				break;
			}
		}

		if (!hasLocalData) {
			return false;
		}

		for (const synchroniser of synchronizers) {
			const preview = await synchroniser.generateSyncResourcePreview();
			if (preview && !preview.isLastSyncFromCurrentMachine
				&& (preview.resourcePreviews.some(({ localChange }) => localChange !== Change.None) || preview.resourcePreviews.some(({ remoteChange }) => remoteChange !== Change.None))) {
				return true;
			}
		}

		return false;
	}

	async reset(): Promise<void> {
		await this.checkEnablement();
		await this.resetRemote();
		await this.resetLocal();
	}

	async resetLocal(): Promise<void> {
		await this.checkEnablement();
		this.storageService.remove(LAST_SYNC_TIME_KEY, StorageScope.GLOBAL);
		for (const synchroniser of this.synchronisers) {
			try {
				await synchroniser.resetLocal();
			} catch (e) {
				this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
				this.logService.error(e);
			}
		}
		this.logService.info('Did reset the local sync state.');
	}

	async hasPreviouslySynced(): Promise<boolean> {
		for (const synchroniser of this.synchronisers) {
			if (await synchroniser.hasPreviouslySynced()) {
				return true;
			}
		}
		return false;
	}

	private async resetRemote(): Promise<void> {
		await this.checkEnablement();
		try {
			await this.userDataSyncStoreService.clear();
			this.logService.info('Cleared data on server');
		} catch (e) {
			this.logService.error(e);
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

	private updateStatus(): void {
		this.updateConflicts();
		const status = this.computeStatus();
		this.setStatus(status);
	}

	private updateConflicts(): void {
		const conflicts = this.computeConflicts();
		if (!equals(this._conflicts, conflicts, (a, b) => a.syncResource === b.syncResource && equals(a.conflicts, b.conflicts, (a, b) => isEqual(a.previewResource, b.previewResource)))) {
			this._conflicts = this.computeConflicts();
			this._onDidChangeConflicts.fire(conflicts);
		}
	}

	private computeStatus(): SyncStatus {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			return SyncStatus.Uninitialized;
		}
		if (this.synchronisers.some(s => s.status === SyncStatus.HasConflicts)) {
			return SyncStatus.HasConflicts;
		}
		if (this.synchronisers.some(s => s.status === SyncStatus.Syncing)) {
			return SyncStatus.Syncing;
		}
		return SyncStatus.Idle;
	}

	private updateLastSyncTime(): void {
		if (this.status === SyncStatus.Idle) {
			this._lastSyncTime = new Date().getTime();
			this.storageService.store(LAST_SYNC_TIME_KEY, this._lastSyncTime, StorageScope.GLOBAL);
			this._onDidChangeLastSyncTime.fire(this._lastSyncTime);
		}
	}

	private handleSynchronizerError(e: Error, source: SyncResource): void {
		if (e instanceof UserDataSyncError) {
			switch (e.code) {
				case UserDataSyncErrorCode.TooLarge:
					throw new UserDataSyncError(e.message, e.code, source);

				case UserDataSyncErrorCode.TooManyRequests:
				case UserDataSyncErrorCode.LocalTooManyRequests:
				case UserDataSyncErrorCode.Gone:
				case UserDataSyncErrorCode.UpgradeRequired:
				case UserDataSyncErrorCode.Incompatible:
					throw e;
			}
		}
		this.logService.error(e);
		this.logService.error(`${source}: ${toErrorMessage(e)}`);
	}

	private computeConflicts(): SyncResourceConflicts[] {
		return this.synchronisers.filter(s => s.status === SyncStatus.HasConflicts)
			.map(s => ({ syncResource: s.resource, conflicts: s.conflicts.map(r => this.toStrictResourcePreview(r)) }));
	}

	private toStrictResourcePreview(resourcePreview: IResourcePreview): IResourcePreview {
		return {
			localResource: resourcePreview.localResource,
			previewResource: resourcePreview.previewResource,
			remoteResource: resourcePreview.remoteResource,
			localChange: resourcePreview.localChange,
			remoteChange: resourcePreview.remoteChange,
			hasConflicts: resourcePreview.hasConflicts,
		};
	}

	getSynchroniser(source: SyncResource): IUserDataSynchroniser {
		return this.synchronisers.filter(s => s.resource === source)[0];
	}

	private async checkEnablement(): Promise<void> {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
	}

}
