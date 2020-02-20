/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

export const IAuthenticationTokenService = createDecorator<IAuthenticationTokenService>('IAuthenticationTokenService');

export interface IAuthenticationTokenService {
	_serviceBrand: undefined;

	readonly onDidChangeToken: Event<string | undefined>;
	readonly onTokenFailed: Event<void>;

	getToken(): Promise<string | undefined>;
	setToken(accessToken: string | undefined): Promise<void>;
	sendTokenFailed(): void;
}

export class AuthenticationTokenService extends Disposable implements IAuthenticationTokenService {

	_serviceBrand: any;

	private _onDidChangeToken: Emitter<string | undefined> = this._register(new Emitter<string | undefined>());
	readonly onDidChangeToken: Event<string | undefined> = this._onDidChangeToken.event;

	private _onTokenFailed: Emitter<void> = this._register(new Emitter<void>());
	readonly onTokenFailed: Event<void> = this._onTokenFailed.event;

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

	sendTokenFailed(): void {
		this._onTokenFailed.fire();
	}
}

