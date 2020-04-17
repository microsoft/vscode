/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataAutoSyncService, UserDataSyncError } from 'vs/platform/userDataSync/common/userDataSync';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { Disposable } from 'vs/base/common/lifecycle';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event } from 'vs/base/common/event';

export class UserDataAutoSyncService extends Disposable implements IUserDataAutoSyncService {

	_serviceBrand: undefined;

	private readonly channel: IChannel;
	get onError(): Event<UserDataSyncError> { return Event.map(this.channel.listen<Error>('onError'), e => UserDataSyncError.toUserDataSyncError(e)); }

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService
	) {
		super();
		this.channel = sharedProcessService.getChannel('userDataAutoSync');
	}

	triggerAutoSync(sources: string[]): Promise<void> {
		return this.channel.call('triggerAutoSync', [sources]);
	}

}

registerSingleton(IUserDataAutoSyncService, UserDataAutoSyncService);
