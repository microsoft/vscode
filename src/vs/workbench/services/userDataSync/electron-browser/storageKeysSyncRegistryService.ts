/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';
import { StorageKeysSyncRegistryChannelClient } from 'vs/platform/userDataSync/common/userDataSyncIpc';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';

class StorageKeysSyncRegistryService extends StorageKeysSyncRegistryChannelClient implements IStorageKeysSyncRegistryService {

	constructor(
		@ISharedProcessService mainProcessService: ISharedProcessService
	) {
		super(mainProcessService.getChannel('storageKeysSyncRegistryService'));
	}
}

registerSingleton(IStorageKeysSyncRegistryService, StorageKeysSyncRegistryService);
