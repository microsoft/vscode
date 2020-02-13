/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncStatus, SyncSource, IUserDataSyncService, UserDataSyncError } from 'vs/platform/userDataSync/common/userDataSync';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { CancellationToken } from 'vs/base/common/cancellation';

export class UserDataSyncService extends Disposable implements IUserDataSyncService {

	_serviceBrand: undefined;

	private readonly channel: IChannel;

	private _status: SyncStatus = SyncStatus.Uninitialized;
	get status(): SyncStatus { return this._status; }
	private _onDidChangeStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangeStatus.event;

	get onDidChangeLocal(): Event<void> { return this.channel.listen('onDidChangeLocal'); }

	private _conflictsSources: SyncSource[] = [];
	get conflictsSources(): SyncSource[] { return this._conflictsSources; }
	private _onDidChangeConflicts: Emitter<SyncSource[]> = this._register(new Emitter<SyncSource[]>());
	readonly onDidChangeConflicts: Event<SyncSource[]> = this._onDidChangeConflicts.event;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService
	) {
		super();
		const userDataSyncChannel = sharedProcessService.getChannel('userDataSync');
		this.channel = {
			call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T> {
				return userDataSyncChannel.call(command, arg, cancellationToken)
					.then(null, error => { throw UserDataSyncError.toUserDataSyncError(error); });
			},
			listen<T>(event: string, arg?: any): Event<T> {
				return userDataSyncChannel.listen(event, arg);
			}
		};
		this.channel.call<[SyncStatus, SyncSource[]]>('_getInitialData').then(([status, conflicts]) => {
			this.updateStatus(status);
			this.updateConflicts(conflicts);
			this._register(this.channel.listen<SyncStatus>('onDidChangeStatus')(status => this.updateStatus(status)));
		});
		this._register(this.channel.listen<SyncSource[]>('onDidChangeConflicts')(conflicts => this.updateConflicts(conflicts)));
	}

	pull(): Promise<void> {
		return this.channel.call('pull');
	}

	sync(): Promise<void> {
		return this.channel.call('sync');
	}

	accept(source: SyncSource, content: string): Promise<void> {
		return this.channel.call('accept', [source, content]);
	}

	reset(): Promise<void> {
		return this.channel.call('reset');
	}

	resetLocal(): Promise<void> {
		return this.channel.call('resetLocal');
	}

	stop(): Promise<void> {
		return this.channel.call('stop');
	}

	getRemoteContent(source: SyncSource, preview: boolean): Promise<string | null> {
		return this.channel.call('getRemoteContent', [source, preview]);
	}

	isFirstTimeSyncWithMerge(): Promise<boolean> {
		return this.channel.call('isFirstTimeSyncWithMerge');
	}

	private async updateStatus(status: SyncStatus): Promise<void> {
		this._status = status;
		this._onDidChangeStatus.fire(status);
	}

	private async updateConflicts(conflicts: SyncSource[]): Promise<void> {
		this._conflictsSources = conflicts;
		this._onDidChangeConflicts.fire(conflicts);
	}

}

registerSingleton(IUserDataSyncService, UserDataSyncService);
