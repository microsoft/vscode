/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncStoreManagementService, UserDataSyncStoreType, IUserDataSyncStore } from 'vs/platform/userDataSync/common/userDataSync';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { AbstractUserDataSyncStoreManagementService } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { IProductService } from 'vs/platform/product/common/productService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { UserDataSyncStoreManagementServiceChannelClient } from 'vs/platform/userDataSync/common/userDataSyncIpc';

class UserDataSyncStoreManagementService extends AbstractUserDataSyncStoreManagementService implements IUserDataSyncStoreManagementService {

	private readonly channelClient: UserDataSyncStoreManagementServiceChannelClient;

	constructor(
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		super(productService, configurationService, storageService);
		this.channelClient = this._register(new UserDataSyncStoreManagementServiceChannelClient(sharedProcessService.getChannel('userDataSyncStoreManagement')));
		this._register(this.channelClient.onDidChangeUserDataSyncStore(() => this.updateUserDataSyncStore()));
	}

	async switch(type: UserDataSyncStoreType): Promise<void> {
		return this.channelClient.switch(type);
	}

	async getPreviousUserDataSyncStore(): Promise<IUserDataSyncStore> {
		return this.channelClient.getPreviousUserDataSyncStore();
	}

}

registerSingleton(IUserDataSyncStoreManagementService, UserDataSyncStoreManagementService);
