/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

export interface IUserDataSyncAccount {
	readonly authenticationProviderId: string;
	readonly token: string;
}

export const IUserDataSyncAccountService = createDecorator<IUserDataSyncAccountService>('IUserDataSyncAccountService');
export interface IUserDataSyncAccountService {
	readonly _serviceBrand: undefined;

	readonly account: IUserDataSyncAccount | undefined;
	readonly onDidChangeAccount: Event<IUserDataSyncAccount | undefined>;
	updateAccount(userDataSyncAuthToken: IUserDataSyncAccount | undefined): Promise<void>;

	readonly onTokenFailed: Event<void>;
	sendTokenFailed(): void;
}

export class UserDataSyncAccountService extends Disposable implements IUserDataSyncAccountService {

	_serviceBrand: any;

	private _account: IUserDataSyncAccount | undefined;
	get account(): IUserDataSyncAccount | undefined { return this._account; }
	private _onDidChangeAccount = this._register(new Emitter<IUserDataSyncAccount | undefined>());
	readonly onDidChangeAccount = this._onDidChangeAccount.event;

	private _onTokenFailed: Emitter<void> = this._register(new Emitter<void>());
	readonly onTokenFailed: Event<void> = this._onTokenFailed.event;

	async updateAccount(account: IUserDataSyncAccount | undefined): Promise<void> {
		if (account && this._account ? account.token !== this._account.token || account.authenticationProviderId !== this._account.authenticationProviderId : account !== this._account) {
			this._account = account;
			this._onDidChangeAccount.fire(account);
		}
	}

	sendTokenFailed(): void {
		this.updateAccount(undefined);
		this._onTokenFailed.fire();
	}
}

