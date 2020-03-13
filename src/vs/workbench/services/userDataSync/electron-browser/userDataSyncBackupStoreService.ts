/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IResourceRefHandle, IUserDataSyncBackupStoreService, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class UserDataSyncBackupStoreService implements IUserDataSyncBackupStoreService {

	_serviceBrand: undefined;
	private readonly channel: IChannel;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		this.channel = sharedProcessService.getChannel('userDataSyncBackupStoreService');
	}

	backup(key: SyncResource, content: string): Promise<void> {
		return this.channel.call('backup', [key, content]);
	}


	getAllRefs(key: SyncResource): Promise<IResourceRefHandle[]> {
		return this.channel.call('getAllRefs', [key]);
	}

	resolveContent(key: SyncResource, ref: string): Promise<string | null> {
		return this.channel.call('resolveContent', [key, ref]);
	}

}

registerSingleton(IUserDataSyncBackupStoreService, UserDataSyncBackupStoreService);
