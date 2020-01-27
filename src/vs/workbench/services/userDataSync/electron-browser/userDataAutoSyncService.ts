/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataAutoSyncService, UserDataSyncErrorCode, SyncSource } from 'vs/platform/userDataSync/common/userDataSync';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { Disposable } from 'vs/base/common/lifecycle';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event } from 'vs/base/common/event';

export class UserDataAutoSyncService extends Disposable implements IUserDataAutoSyncService {

	_serviceBrand: undefined;

	private readonly channel: IChannel;
	get onError(): Event<{ code: UserDataSyncErrorCode, source?: SyncSource }> { return this.channel.listen('onError'); }

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService
	) {
		super();
		this.channel = sharedProcessService.getChannel('userDataAutoSync');
	}

	triggerAutoSync(): Promise<void> {
		return this.channel.call('triggerAutoSync');
	}

}

registerSingleton(IUserDataAutoSyncService, UserDataAutoSyncService);
