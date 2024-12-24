/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IUserDataSyncLogService, IUserDataSyncStoreService, UserDataSyncErrorCode } from './userDataSync.js';

export interface IUserDataSyncAccount {
	readonly authenticationProviderId: string;
	readonly token: string;
}

export const IUserDataSyncAccountService = createDecorator<IUserDataSyncAccountService>('IUserDataSyncAccountService');
export interface IUserDataSyncAccountService {
	readonly _serviceBrand: undefined;

	readonly onTokenFailed: Event<boolean/*bail out*/>;
	readonly account: IUserDataSyncAccount | undefined;
	readonly onDidChangeAccount: Event<IUserDataSyncAccount | undefined>;
	updateAccount(account: IUserDataSyncAccount | undefined): Promise<void>;

}

export class UserDataSyncAccountService extends Disposable implements IUserDataSyncAccountService {

	_serviceBrand: any;

	private _account: IUserDataSyncAccount | undefined;
	get account(): IUserDataSyncAccount | undefined { return this._account; }
	private _onDidChangeAccount = this._register(new Emitter<IUserDataSyncAccount | undefined>());
	readonly onDidChangeAccount = this._onDidChangeAccount.event;

	private _onTokenFailed: Emitter<boolean> = this._register(new Emitter<boolean>());
	readonly onTokenFailed: Event<boolean> = this._onTokenFailed.event;

	private wasTokenFailed: boolean = false;

	constructor(
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
	) {
		super();
		this._register(userDataSyncStoreService.onTokenFailed(code => {
			this.logService.info('Settings Sync auth token failed', this.account?.authenticationProviderId, this.wasTokenFailed, code);
			this.updateAccount(undefined);
			if (code === UserDataSyncErrorCode.Forbidden) {
				this._onTokenFailed.fire(true /*bail out immediately*/);
			} else {
				this._onTokenFailed.fire(this.wasTokenFailed /* bail out if token failed before */);
			}
			this.wasTokenFailed = true;
		}));
		this._register(userDataSyncStoreService.onTokenSucceed(() => this.wasTokenFailed = false));
	}

	async updateAccount(account: IUserDataSyncAccount | undefined): Promise<void> {
		if (account && this._account ? account.token !== this._account.token || account.authenticationProviderId !== this._account.authenticationProviderId : account !== this._account) {
			this._account = account;
			if (this._account) {
				this.userDataSyncStoreService.setAuthToken(this._account.token, this._account.authenticationProviderId);
			}
			this._onDidChangeAccount.fire(account);
		}
	}

}

