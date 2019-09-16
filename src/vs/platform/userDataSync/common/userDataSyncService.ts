/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, SyncStatus, ISynchroniser, IUserDataSyncStoreService } from 'vs/platform/userDataSync/common/userDataSync';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SettingsSynchroniser } from 'vs/platform/userDataSync/common/settingsSync';
import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';

export class UserDataSyncService extends Disposable implements IUserDataSyncService {

	_serviceBrand: any;

	private readonly synchronisers: ISynchroniser[];

	private _status: SyncStatus = SyncStatus.Uninitialized;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	readonly onDidChangeLocal: Event<void>;

	constructor(
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.synchronisers = [
			this.instantiationService.createInstance(SettingsSynchroniser)
		];
		this.updateStatus();
		this._register(Event.any(this.userDataSyncStoreService.onDidChangeEnablement, ...this.synchronisers.map(s => Event.map(s.onDidChangeStatus, () => undefined)))(() => this.updateStatus()));
		this.onDidChangeLocal = Event.any(...this.synchronisers.map(s => s.onDidChangeLocal));
	}

	get conflicts(): URI | null {
		const synchroniser = this.synchronisers.filter(s => s.status === SyncStatus.HasConflicts)[0];
		return synchroniser ? synchroniser.conflicts : null;
	}

	async sync(): Promise<boolean> {
		if (!this.userDataSyncStoreService.enabled) {
			throw new Error('Not enabled');
		}
		for (const synchroniser of this.synchronisers) {
			if (!await synchroniser.sync()) {
				return false;
			}
		}
		return true;
	}

	async continueSync(): Promise<boolean> {
		if (!this.userDataSyncStoreService.enabled) {
			throw new Error('Not enabled');
		}
		for (const synchroniser of this.synchronisers) {
			if (await synchroniser.continueSync()) {
				return true;
			}
		}
		return false;
	}

	private updateStatus(): void {
		this.setStatus(this.computeStatus());
	}

	private setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangStatus.fire(status);
		}
	}

	private computeStatus(): SyncStatus {
		if (!this.userDataSyncStoreService.enabled) {
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

}
