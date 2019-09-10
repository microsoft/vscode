/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, SyncStatus, IRemoteUserDataService } from 'vs/workbench/services/userData/common/userData';
import { Disposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Emitter, Event } from 'vs/base/common/event';
import { ISettingsSyncService } from 'vs/workbench/services/userData/common/settingsSync';

export class UserDataSyncService extends Disposable implements IUserDataSyncService {

	_serviceBrand: any;

	private _onDidChangeSyncStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeSyncStatus: Event<SyncStatus> = this._onDidChangeSyncStatus.event;

	private _syncStatus: SyncStatus = SyncStatus.SyncDone;
	get syncStatus(): SyncStatus {
		return this._syncStatus;
	}
	set syncStatus(status: SyncStatus) {
		if (this._syncStatus !== status) {
			this._syncStatus = status;
			this._onDidChangeSyncStatus.fire(status);
		}
	}

	constructor(
		@IRemoteUserDataService private readonly remoteUserDataService: IRemoteUserDataService,
		@ISettingsSyncService private readonly settingsSyncService: ISettingsSyncService
	) {
		super();
	}


	async synchronise(): Promise<void> {
		if (!this.remoteUserDataService.isEnabled()) {
			throw new Error('Not enabled');
		}
		this.syncStatus = SyncStatus.Syncing;
		await this.settingsSyncService.sync();
		this.syncStatus = SyncStatus.SyncDone;
	}


}

registerSingleton(IUserDataSyncService, UserDataSyncService);
