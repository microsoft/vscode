/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IProductService } from '../../product/common/productService.js';
import { IStorageService } from '../../storage/common/storage.js';
import { IUserDataSyncStore, IUserDataSyncStoreManagementService, UserDataSyncStoreType } from './userDataSync.js';
import { IUserDataSyncAccount, IUserDataSyncAccountService } from './userDataSyncAccount.js';
import { AbstractUserDataSyncStoreManagementService } from './userDataSyncStoreService.js';

export class UserDataSyncAccountServiceChannel implements IServerChannel {
	constructor(private readonly service: IUserDataSyncAccountService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeAccount': return this.service.onDidChangeAccount;
			case 'onTokenFailed': return this.service.onTokenFailed;
		}
		throw new Error(`[UserDataSyncAccountServiceChannel] Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case '_getInitialData': return Promise.resolve(this.service.account);
			case 'updateAccount': return this.service.updateAccount(args);
		}
		throw new Error('Invalid call');
	}
}

export class UserDataSyncAccountServiceChannelClient extends Disposable implements IUserDataSyncAccountService {

	declare readonly _serviceBrand: undefined;

	private _account: IUserDataSyncAccount | undefined;
	get account(): IUserDataSyncAccount | undefined { return this._account; }

	get onTokenFailed(): Event<boolean> { return this.channel.listen<boolean>('onTokenFailed'); }

	private _onDidChangeAccount = this._register(new Emitter<IUserDataSyncAccount | undefined>());
	readonly onDidChangeAccount = this._onDidChangeAccount.event;

	constructor(private readonly channel: IChannel) {
		super();
		this.channel.call<IUserDataSyncAccount | undefined>('_getInitialData').then(account => {
			this._account = account;
			this._register(this.channel.listen<IUserDataSyncAccount | undefined>('onDidChangeAccount')(account => {
				this._account = account;
				this._onDidChangeAccount.fire(account);
			}));
		});
	}

	updateAccount(account: IUserDataSyncAccount | undefined): Promise<undefined> {
		return this.channel.call('updateAccount', account);
	}

}

export class UserDataSyncStoreManagementServiceChannel implements IServerChannel {
	constructor(private readonly service: IUserDataSyncStoreManagementService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeUserDataSyncStore': return this.service.onDidChangeUserDataSyncStore;
		}
		throw new Error(`[UserDataSyncStoreManagementServiceChannel] Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'switch': return this.service.switch(args[0]);
			case 'getPreviousUserDataSyncStore': return this.service.getPreviousUserDataSyncStore();
		}
		throw new Error('Invalid call');
	}
}

export class UserDataSyncStoreManagementServiceChannelClient extends AbstractUserDataSyncStoreManagementService implements IUserDataSyncStoreManagementService {

	constructor(
		private readonly channel: IChannel,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
	) {
		super(productService, configurationService, storageService);
		this._register(this.channel.listen<void>('onDidChangeUserDataSyncStore')(() => this.updateUserDataSyncStore()));
	}

	async switch(type: UserDataSyncStoreType): Promise<void> {
		return this.channel.call('switch', [type]);
	}

	async getPreviousUserDataSyncStore(): Promise<IUserDataSyncStore> {
		const userDataSyncStore = await this.channel.call<IUserDataSyncStore>('getPreviousUserDataSyncStore');
		return this.revive(userDataSyncStore);
	}

	private revive(userDataSyncStore: IUserDataSyncStore): IUserDataSyncStore {
		return {
			url: URI.revive(userDataSyncStore.url),
			type: userDataSyncStore.type,
			defaultUrl: URI.revive(userDataSyncStore.defaultUrl),
			insidersUrl: URI.revive(userDataSyncStore.insidersUrl),
			stableUrl: URI.revive(userDataSyncStore.stableUrl),
			canSwitch: userDataSyncStore.canSwitch,
			authenticationProviders: userDataSyncStore.authenticationProviders,
		};
	}
}
