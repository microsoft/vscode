/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncResource, IUserDataSyncStoreService, IUserDataSyncStore, getUserDataSyncStore, IUserData, IUserDataManifest, IResourceRefHandle } from 'vs/platform/userDataSync/common/userDataSync';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProductService } from 'vs/platform/product/common/productService';

export class UserDataSyncStoreService implements IUserDataSyncStoreService {

	_serviceBrand: undefined;
	private readonly channel: IChannel;
	readonly userDataSyncStore: IUserDataSyncStore | undefined;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		this.channel = sharedProcessService.getChannel('userDataSyncStoreService');
		this.userDataSyncStore = getUserDataSyncStore(productService, configurationService);
	}

	read(key: SyncResource, oldValue: IUserData | null, source?: SyncResource): Promise<IUserData> {
		throw new Error('Not Supported');
	}

	write(key: SyncResource, content: string, ref: string | null, source?: SyncResource): Promise<string> {
		throw new Error('Not Supported');
	}

	manifest(): Promise<IUserDataManifest | null> {
		throw new Error('Not Supported');
	}

	clear(): Promise<void> {
		throw new Error('Not Supported');
	}

	getAllRefs(key: SyncResource): Promise<IResourceRefHandle[]> {
		return this.channel.call('getAllRefs', [key]);
	}

	resolveContent(key: SyncResource, ref: string): Promise<string | null> {
		return this.channel.call('resolveContent', [key, ref]);
	}

	delete(key: SyncResource): Promise<void> {
		return this.channel.call('delete', [key]);
	}

}

registerSingleton(IUserDataSyncStoreService, UserDataSyncStoreService);
