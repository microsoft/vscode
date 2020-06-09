/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IUserDataSyncAccountService, IUserDataSyncAccount } from 'vs/platform/userDataSync/common/userDataSyncAccount';

export class UserDataSyncAccountService extends Disposable implements IUserDataSyncAccountService {

	declare readonly _serviceBrand: undefined;

	private readonly channel: IChannel;

	private _token: IUserDataSyncAccount | undefined;
	get account(): IUserDataSyncAccount | undefined { return this._token; }
	private _onDidChangeToken = this._register(new Emitter<IUserDataSyncAccount | undefined>());
	readonly onDidChangeAccount = this._onDidChangeToken.event;

	private _onTokenFailed: Emitter<void> = this._register(new Emitter<void>());
	readonly onTokenFailed: Event<void> = this._onTokenFailed.event;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		super();
		this.channel = sharedProcessService.getChannel('userDataSyncAccount');
		this._register(this.channel.listen<void[]>('onTokenFailed')(_ => this.sendTokenFailed()));
	}

	updateAccount(account: IUserDataSyncAccount | undefined): Promise<undefined> {
		this._token = account;
		return this.channel.call('updateAccount', account);
	}

	sendTokenFailed(): void {
		this._onTokenFailed.fire();
	}
}

registerSingleton(IUserDataSyncAccountService, UserDataSyncAccountService);
