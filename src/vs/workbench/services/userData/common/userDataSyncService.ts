/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, SyncStatus, IRemoteUserDataService, ISynchroniser, USER_DATA_PREVIEW_SCHEME } from 'vs/workbench/services/userData/common/userData';
import { Disposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SettingsSynchroniser } from 'vs/workbench/services/userData/common/settingsSync';
import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { InMemoryFileSystemProvider } from 'vs/workbench/services/userData/common/inMemoryUserDataProvider';

export class UserDataSyncService extends Disposable implements IUserDataSyncService {

	_serviceBrand: any;

	private readonly synchronisers: ISynchroniser[];

	private _status: SyncStatus = SyncStatus.Uninitialized;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	constructor(
		@IFileService fileService: IFileService,
		@IRemoteUserDataService private readonly remoteUserDataService: IRemoteUserDataService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this._register(fileService.registerProvider(USER_DATA_PREVIEW_SCHEME, new InMemoryFileSystemProvider()));
		this.synchronisers = [
			this.instantiationService.createInstance(SettingsSynchroniser)
		];
		this.updateStatus();
		this._register(Event.any(this.remoteUserDataService.onDidChangeEnablement, ...this.synchronisers.map(s => Event.map(s.onDidChangeStatus, () => undefined)))(() => this.updateStatus()));
	}

	async sync(): Promise<boolean> {
		if (!this.remoteUserDataService.isEnabled()) {
			throw new Error('Not enabled');
		}
		for (const synchroniser of this.synchronisers) {
			if (!await synchroniser.sync()) {
				return false;
			}
		}
		return true;
	}

	async apply(previewResource: URI): Promise<boolean> {
		if (!this.remoteUserDataService.isEnabled()) {
			throw new Error('Not enabled');
		}
		for (const synchroniser of this.synchronisers) {
			if (await synchroniser.apply(previewResource)) {
				return true;
			}
		}
		return false;
	}

	handleConflicts(): boolean {
		if (!this.remoteUserDataService.isEnabled()) {
			throw new Error('Not enabled');
		}
		for (const synchroniser of this.synchronisers) {
			if (synchroniser.handleConflicts()) {
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
		if (!this.remoteUserDataService.isEnabled()) {
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

registerSingleton(IUserDataSyncService, UserDataSyncService);
