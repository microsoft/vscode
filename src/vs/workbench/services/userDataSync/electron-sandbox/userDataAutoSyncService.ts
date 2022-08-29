/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataAutoSyncService, UserDataSyncError } from 'vs/platform/userDataSync/common/userDataSync';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

class UserDataAutoSyncService implements IUserDataAutoSyncService {

	declare readonly _serviceBrand: undefined;

	private readonly channel: IChannel;
	get onError(): Event<UserDataSyncError> { return Event.map(this.channel.listen<Error>('onError'), e => UserDataSyncError.toUserDataSyncError(e)); }

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		this.channel = sharedProcessService.getChannel('userDataAutoSync');
	}

	triggerSync(sources: string[], hasToLimitSync: boolean, disableCache: boolean): Promise<void> {
		return this.channel.call('triggerSync', [sources, hasToLimitSync, disableCache]);
	}

	turnOn(): Promise<void> {
		return this.channel.call('turnOn');
	}

	turnOff(everywhere: boolean): Promise<void> {
		return this.channel.call('turnOff', [everywhere]);
	}

}

registerSingleton(IUserDataAutoSyncService, UserDataAutoSyncService, false);
