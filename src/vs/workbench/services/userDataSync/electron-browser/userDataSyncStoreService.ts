/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncSource, IUserDataSyncStoreService, IUserDataSyncStore, getUserDataSyncStore, ResourceKey, IUserData, IUserDataManifest, IResourceRefHandle } from 'vs/platform/userDataSync/common/userDataSync';
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

	read(key: ResourceKey, oldValue: IUserData | null, source?: SyncSource): Promise<IUserData> {
		throw new Error('Not Supported');
	}

	write(key: ResourceKey, content: string, ref: string | null, source?: SyncSource): Promise<string> {
		throw new Error('Not Supported');
	}

	manifest(): Promise<IUserDataManifest | null> {
		throw new Error('Not Supported');
	}

	clear(): Promise<void> {
		throw new Error('Not Supported');
	}

	getAllRefs(key: ResourceKey): Promise<IResourceRefHandle[]> {
		return this.channel.call('getAllRefs', [key]);
	}

	resolveContent(key: ResourceKey, ref: string): Promise<string | null> {
		return this.channel.call('resolveContent', [key, ref]);
	}

	delete(key: ResourceKey): Promise<void> {
		return this.channel.call('delete', [key]);
	}

}

registerSingleton(IUserDataSyncStoreService, UserDataSyncStoreService);
