/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncStatus, ISettingsSyncService, IConflictSetting, SyncSource } from 'vs/platform/userDataSync/common/userDataSync';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class SettingsSyncService extends Disposable implements ISettingsSyncService {

	_serviceBrand: undefined;

	private readonly channel: IChannel;

	readonly resourceKey = 'settings';
	readonly source = SyncSource.Settings;

	private _status: SyncStatus = SyncStatus.Uninitialized;
	get status(): SyncStatus { return this._status; }
	private _onDidChangeStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangeStatus.event;

	private _conflicts: IConflictSetting[] = [];
	get conflicts(): IConflictSetting[] { return this._conflicts; }
	private _onDidChangeConflicts: Emitter<IConflictSetting[]> = this._register(new Emitter<IConflictSetting[]>());
	readonly onDidChangeConflicts: Event<IConflictSetting[]> = this._onDidChangeConflicts.event;

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
		this.channel.call<IConflictSetting[]>('_getInitialConflicts').then(conflicts => {
			if (conflicts.length) {
				this.updateConflicts(conflicts);
			}
			this._register(this.channel.listen<IConflictSetting[]>('onDidChangeConflicts')(conflicts => this.updateConflicts(conflicts)));
		});
	}

	pull(): Promise<void> {
		return this.channel.call('pull');
	}

	push(): Promise<void> {
		return this.channel.call('push');
	}

	sync(): Promise<void> {
		return this.channel.call('sync');
	}

	stop(): Promise<void> {
		return this.channel.call('stop');
	}

	resetLocal(): Promise<void> {
		return this.channel.call('resetLocal');
	}

	hasPreviouslySynced(): Promise<boolean> {
		return this.channel.call('hasPreviouslySynced');
	}

	hasLocalData(): Promise<boolean> {
		return this.channel.call('hasLocalData');
	}

	accept(content: string): Promise<void> {
		return this.channel.call('accept', [content]);
	}

	resolveSettingsConflicts(conflicts: { key: string, value: any | undefined }[]): Promise<void> {
		return this.channel.call('resolveConflicts', [conflicts]);
	}

	getRemoteContent(preview?: boolean): Promise<string | null> {
		return this.channel.call('getRemoteContent', [!!preview]);
	}

	private async updateStatus(status: SyncStatus): Promise<void> {
		this._status = status;
		this._onDidChangeStatus.fire(status);
	}

	private async updateConflicts(conflicts: IConflictSetting[]): Promise<void> {
		this._conflicts = conflicts;
		this._onDidChangeConflicts.fire(conflicts);
	}

}

registerSingleton(ISettingsSyncService, SettingsSyncService);
