/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, SyncStatus, ISynchroniser, IUserDataSyncStoreService, SyncSource, ISettingsSyncService, IUserDataSyncLogService, IUserDataAuthTokenService, IUserDataSynchroniser, UserDataSyncStoreError } from 'vs/platform/userDataSync/common/userDataSync';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SettingsSynchroniser } from 'vs/platform/userDataSync/common/settingsSync';
import { Emitter, Event } from 'vs/base/common/event';
import { ExtensionsSynchroniser } from 'vs/platform/userDataSync/common/extensionsSync';
import { KeybindingsSynchroniser } from 'vs/platform/userDataSync/common/keybindingsSync';
import { GlobalStateSynchroniser } from 'vs/platform/userDataSync/common/globalStateSync';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { localize } from 'vs/nls';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

type SyncConflictsClassification = {
	source?: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

export class UserDataSyncService extends Disposable implements IUserDataSyncService {

	_serviceBrand: any;

	private readonly synchronisers: IUserDataSynchroniser[];

	private _status: SyncStatus = SyncStatus.Uninitialized;
	get status(): SyncStatus { return this._status; }
	private _onDidChangeStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangeStatus.event;

	readonly onDidChangeLocal: Event<void>;

	private _conflictsSource: SyncSource | null = null;
	get conflictsSource(): SyncSource | null { return this._conflictsSource; }

	private readonly keybindingsSynchroniser: KeybindingsSynchroniser;
	private readonly extensionsSynchroniser: ExtensionsSynchroniser;
	private readonly globalStateSynchroniser: GlobalStateSynchroniser;

	constructor(
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISettingsSyncService private readonly settingsSynchroniser: ISettingsSyncService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IUserDataAuthTokenService private readonly userDataAuthTokenService: IUserDataAuthTokenService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.keybindingsSynchroniser = this._register(this.instantiationService.createInstance(KeybindingsSynchroniser));
		this.globalStateSynchroniser = this._register(this.instantiationService.createInstance(GlobalStateSynchroniser));
		this.extensionsSynchroniser = this._register(this.instantiationService.createInstance(ExtensionsSynchroniser));
		this.synchronisers = [this.settingsSynchroniser, this.keybindingsSynchroniser, this.globalStateSynchroniser, this.extensionsSynchroniser];
		this.updateStatus();

		if (this.userDataSyncStoreService.userDataSyncStore) {
			this._register(Event.any(...this.synchronisers.map(s => Event.map(s.onDidChangeStatus, () => undefined)))(() => this.updateStatus()));
			this._register(this.userDataAuthTokenService.onDidChangeToken(e => this.onDidChangeAuthTokenStatus(e)));
		}

		this.onDidChangeLocal = Event.any(...this.synchronisers.map(s => s.onDidChangeLocal));
	}

	async pull(): Promise<void> {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
		if (!(await this.userDataAuthTokenService.getToken())) {
			throw new Error('Not Authenticated. Please sign in to start sync.');
		}
		for (const synchroniser of this.synchronisers) {
			try {
				await synchroniser.pull();
			} catch (e) {
				this.logService.error(`${this.getSyncSource(synchroniser)}: ${toErrorMessage(e)}`);
			}
		}
	}

	async push(): Promise<void> {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
		if (!(await this.userDataAuthTokenService.getToken())) {
			throw new Error('Not Authenticated. Please sign in to start sync.');
		}
		for (const synchroniser of this.synchronisers) {
			try {
				await synchroniser.push();
			} catch (e) {
				this.logService.error(`${this.getSyncSource(synchroniser)}: ${toErrorMessage(e)}`);
			}
		}
	}

	async sync(): Promise<void> {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
		if (!(await this.userDataAuthTokenService.getToken())) {
			throw new Error('Not Authenticated. Please sign in to start sync.');
		}
		if (this.status === SyncStatus.HasConflicts) {
			throw new Error(localize('resolve conflicts', "Please resolve conflicts before resuming sync."));
		}
		const startTime = new Date().getTime();
		this.logService.trace('Started Syncing...');
		for (const synchroniser of this.synchronisers) {
			try {
				await synchroniser.sync();
				// do not continue if synchroniser has conflicts
				if (synchroniser.status === SyncStatus.HasConflicts) {
					break;
				}
			} catch (e) {
				if (e instanceof UserDataSyncStoreError) {
					throw e;
				}
				this.logService.error(`${this.getSyncSource(synchroniser)}: ${toErrorMessage(e)}`);
			}
		}
		this.logService.trace(`Finished Syncing. Took ${new Date().getTime() - startTime}ms`);
	}

	async resolveConflictsAndContinueSync(content: string, remote: boolean): Promise<void> {
		const synchroniser = this.getSynchroniserInConflicts();
		if (!synchroniser) {
			throw new Error(localize('no synchroniser with conflicts', "No conflicts detected."));
		}
		await synchroniser.resolveConflicts(content, remote);
		if (synchroniser.status !== SyncStatus.HasConflicts) {
			await this.sync();
		}
	}

	async stop(): Promise<void> {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
		for (const synchroniser of this.synchronisers) {
			await synchroniser.stop();
		}
	}

	async restart(): Promise<void> {
		const synchroniser = this.getSynchroniserInConflicts();
		if (!synchroniser) {
			throw new Error(localize('no synchroniser with conflicts', "No conflicts detected."));
		}
		await synchroniser.restart();
		if (synchroniser.status !== SyncStatus.HasConflicts) {
			await this.sync();
		}
	}

	async hasPreviouslySynced(): Promise<boolean> {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
		if (!(await this.userDataAuthTokenService.getToken())) {
			throw new Error('Not Authenticated. Please sign in to start sync.');
		}
		for (const synchroniser of this.synchronisers) {
			if (await synchroniser.hasPreviouslySynced()) {
				return true;
			}
		}
		return false;
	}

	async hasRemoteData(): Promise<boolean> {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
		if (!(await this.userDataAuthTokenService.getToken())) {
			throw new Error('Not Authenticated. Please sign in to start sync.');
		}
		for (const synchroniser of this.synchronisers) {
			if (await synchroniser.hasRemoteData()) {
				return true;
			}
		}
		return false;
	}

	async hasLocalData(): Promise<boolean> {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
		if (!(await this.userDataAuthTokenService.getToken())) {
			throw new Error('Not Authenticated. Please sign in to start sync.');
		}
		for (const synchroniser of this.synchronisers) {
			if (await synchroniser.hasLocalData()) {
				return true;
			}
		}
		return false;
	}

	async getRemoteContent(source: SyncSource): Promise<string | null> {
		for (const synchroniser of this.synchronisers) {
			if (synchroniser.source === source) {
				return synchroniser.getRemoteContent();
			}
		}
		return null;
	}

	async isFirstTimeSyncAndHasUserData(): Promise<boolean> {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
		if (!(await this.userDataAuthTokenService.getToken())) {
			throw new Error('Not Authenticated. Please sign in to start sync.');
		}
		if (await this.hasPreviouslySynced()) {
			return false;
		}
		return await this.hasLocalData();
	}

	async reset(): Promise<void> {
		await this.resetRemote();
		await this.resetLocal();
	}

	private async resetRemote(): Promise<void> {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
		if (!(await this.userDataAuthTokenService.getToken())) {
			throw new Error('Not Authenticated. Please sign in to start sync.');
		}
		try {
			await this.userDataSyncStoreService.clear();
			this.logService.info('Completed clearing remote data');
		} catch (e) {
			this.logService.error(e);
		}
	}

	async resetLocal(): Promise<void> {
		if (!this.userDataSyncStoreService.userDataSyncStore) {
			throw new Error('Not enabled');
		}
		if (!(await this.userDataAuthTokenService.getToken())) {
			throw new Error('Not Authenticated. Please sign in to start sync.');
		}
		for (const synchroniser of this.synchronisers) {
			try {
				await synchroniser.resetLocal();
			} catch (e) {
				this.logService.error(`${this.getSyncSource(synchroniser)}: ${toErrorMessage(e)}`);
			}
		}
		this.logService.info('Completed resetting local cache');
	}

	private updateStatus(): void {
		const status = this.computeStatus();
		if (this._status !== status) {
			const oldStatus = this._status;
			const oldConflictsSource = this._conflictsSource;
			this._conflictsSource = this.computeConflictsSource();
			this._status = status;
			if (status === SyncStatus.HasConflicts) {
				// Log to telemetry when there is a sync conflict
				this.telemetryService.publicLog2<{ source: string }, SyncConflictsClassification>('sync/conflictsDetected', { source: this._conflictsSource! });
			}
			if (oldStatus === SyncStatus.HasConflicts && status === SyncStatus.Idle) {
				// Log to telemetry when conflicts are resolved
				this.telemetryService.publicLog2<{ source: string }, SyncConflictsClassification>('sync/conflictsResolved', { source: oldConflictsSource! });
			}
			this._onDidChangeStatus.fire(status);
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

	private computeConflictsSource(): SyncSource | null {
		const synchroniser = this.synchronisers.filter(s => s.status === SyncStatus.HasConflicts)[0];
		return synchroniser ? this.getSyncSource(synchroniser) : null;
	}

	private getSynchroniserInConflicts(): IUserDataSynchroniser | null {
		const synchroniser = this.synchronisers.filter(s => s.status === SyncStatus.HasConflicts)[0];
		return synchroniser || null;
	}

	private getSyncSource(synchroniser: ISynchroniser): SyncSource {
		if (synchroniser instanceof SettingsSynchroniser) {
			return SyncSource.Settings;
		}
		if (synchroniser instanceof KeybindingsSynchroniser) {
			return SyncSource.Keybindings;
		}
		if (synchroniser instanceof ExtensionsSynchroniser) {
			return SyncSource.Extensions;
		}
		return SyncSource.GlobalState;
	}

	private onDidChangeAuthTokenStatus(token: string | undefined): void {
		if (!token) {
			this.stop();
		}
	}
}
