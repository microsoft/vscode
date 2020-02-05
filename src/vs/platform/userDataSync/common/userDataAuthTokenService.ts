/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataAuthTokenService } from 'vs/platform/userDataSync/common/userDataSync';

export class UserDataAuthTokenService extends Disposable implements IUserDataAuthTokenService {

	_serviceBrand: any;

	private _onDidChangeToken: Emitter<string | undefined> = this._register(new Emitter<string | undefined>());
	readonly onDidChangeToken: Event<string | undefined> = this._onDidChangeToken.event;

	private _token: string | undefined;

	constructor() {
		super();
	}

	async getToken(): Promise<string | undefined> {
		return this._token;
	}

	async setToken(token: string | undefined): Promise<void> {
		if (token !== this._token) {
			this._token = token;
			this._onDidChangeToken.fire(token);
		}
	}
}
