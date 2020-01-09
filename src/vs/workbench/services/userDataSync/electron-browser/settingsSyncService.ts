/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncStatus, ISettingsSyncService, IConflictSetting } from 'vs/platform/userDataSync/common/userDataSync';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class SettingsSyncService extends Disposable implements ISettingsSyncService {

	_serviceBrand: undefined;

	private readonly channel: IChannel;

	private _status: SyncStatus = SyncStatus.Uninitialized;
	get status(): SyncStatus { return this._status; }
	private _onDidChangeStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangeStatus.event;

	get onDidChangeLocal(): Event<void> { return this.channel.listen('onDidChangeLocal'); }

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService
	) {
		super();
		this.channel = sharedProcessService.getChannel('settingsSync');
		this.channel.call<SyncStatus>('_getInitialStatus').then(status => {
			this.updateStatus(status);
			this._register(this.channel.listen<SyncStatus>('onDidChangeStatus')(status => this.updateStatus(status)));
		});
	}

	sync(_continue?: boolean): Promise<boolean> {
		return this.channel.call('sync', [_continue]);
	}

	stop(): void {
		this.channel.call('stop');
	}

	getConflicts(): Promise<IConflictSetting[]> {
		return this.channel.call<IConflictSetting[]>('getConflicts');
	}

	resolveConflicts(conflicts: { key: string, value: any | undefined }[]): Promise<void> {
		return this.channel.call('resolveConflicts', [conflicts]);
	}

	private async updateStatus(status: SyncStatus): Promise<void> {
		this._status = status;
		this._onDidChangeStatus.fire(status);
	}

}

registerSingleton(ISettingsSyncService, SettingsSyncService);
