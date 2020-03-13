/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncStatus, SyncResource, IUserDataSyncService, UserDataSyncError } from 'vs/platform/userDataSync/common/userDataSync';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';

export class UserDataSyncService extends Disposable implements IUserDataSyncService {

	_serviceBrand: undefined;

	private readonly channel: IChannel;

	private _status: SyncStatus = SyncStatus.Uninitialized;
	get status(): SyncStatus { return this._status; }
	private _onDidChangeStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangeStatus.event;

	get onDidChangeLocal(): Event<SyncResource> { return this.channel.listen<SyncResource>('onDidChangeLocal'); }

	private _conflictsSources: SyncResource[] = [];
	get conflictsSources(): SyncResource[] { return this._conflictsSources; }
	private _onDidChangeConflicts: Emitter<SyncResource[]> = this._register(new Emitter<SyncResource[]>());
	readonly onDidChangeConflicts: Event<SyncResource[]> = this._onDidChangeConflicts.event;

	private _lastSyncTime: number | undefined = undefined;
	get lastSyncTime(): number | undefined { return this._lastSyncTime; }
	private _onDidChangeLastSyncTime: Emitter<number> = this._register(new Emitter<number>());
	readonly onDidChangeLastSyncTime: Event<number> = this._onDidChangeLastSyncTime.event;

	private _onSyncErrors: Emitter<[SyncResource, UserDataSyncError][]> = this._register(new Emitter<[SyncResource, UserDataSyncError][]>());
	readonly onSyncErrors: Event<[SyncResource, UserDataSyncError][]> = this._onSyncErrors.event;

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
		this.channel.call<[SyncStatus, SyncResource[], number | undefined]>('_getInitialData').then(([status, conflicts, lastSyncTime]) => {
			this.updateStatus(status);
			this.updateConflicts(conflicts);
			if (lastSyncTime) {
				this.updateLastSyncTime(lastSyncTime);
			}
			this._register(this.channel.listen<SyncStatus>('onDidChangeStatus')(status => this.updateStatus(status)));
			this._register(this.channel.listen<number>('onDidChangeLastSyncTime')(lastSyncTime => this.updateLastSyncTime(lastSyncTime)));
		});
		this._register(this.channel.listen<SyncResource[]>('onDidChangeConflicts')(conflicts => this.updateConflicts(conflicts)));
		this._register(this.channel.listen<[SyncResource, Error][]>('onSyncErrors')(errors => this._onSyncErrors.fire(errors.map(([source, error]) => ([source, UserDataSyncError.toUserDataSyncError(error)])))));
	}

	pull(): Promise<void> {
		return this.channel.call('pull');
	}

	sync(): Promise<void> {
		return this.channel.call('sync');
	}

	accept(source: SyncResource, content: string): Promise<void> {
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

	resolveContent(resource: URI): Promise<string | null> {
		return this.channel.call('resolveContent', [resource]);
	}

	isFirstTimeSyncWithMerge(): Promise<boolean> {
		return this.channel.call('isFirstTimeSyncWithMerge');
	}

	private async updateStatus(status: SyncStatus): Promise<void> {
		this._status = status;
		this._onDidChangeStatus.fire(status);
	}

	private async updateConflicts(conflicts: SyncResource[]): Promise<void> {
		this._conflictsSources = conflicts;
		this._onDidChangeConflicts.fire(conflicts);
	}

	private updateLastSyncTime(lastSyncTime: number): void {
		if (this._lastSyncTime !== lastSyncTime) {
			this._lastSyncTime = lastSyncTime;
			this._onDidChangeLastSyncTime.fire(lastSyncTime);
		}
	}
}

registerSingleton(IUserDataSyncService, UserDataSyncService);
