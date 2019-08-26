/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, IUserDataProviderService, IUserDataExtension, SyncStatus } from 'vs/workbench/services/userData/common/userData';
import { Disposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Emitter, Event } from 'vs/base/common/event';
import { timeout } from 'vs/base/common/async';

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
		@IUserDataProviderService private readonly userDataProviderService: IUserDataProviderService
	) {
		super();
	}


	async synchronise(): Promise<void> {
		this.syncStatus = SyncStatus.Syncing;
		await timeout(5000);
		this.syncStatus = SyncStatus.SyncDone;
	}

	getExtensions(): Promise<IUserDataExtension[]> {
		return Promise.resolve([]);
	}

}

registerSingleton(IUserDataSyncService, UserDataSyncService);
