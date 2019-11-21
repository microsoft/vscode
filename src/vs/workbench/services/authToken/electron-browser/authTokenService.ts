/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IAuthTokenService, AuthTokenStatus } from 'vs/platform/auth/common/auth';
import { IURLService } from 'vs/platform/url/common/url';
import { URI } from 'vs/base/common/uri';

export class AuthTokenService extends Disposable implements IAuthTokenService {

	_serviceBrand: undefined;

	private readonly channel: IChannel;

	private _status: AuthTokenStatus = AuthTokenStatus.Initializing;
	get status(): AuthTokenStatus { return this._status; }
	private _onDidChangeStatus: Emitter<AuthTokenStatus> = this._register(new Emitter<AuthTokenStatus>());
	readonly onDidChangeStatus: Event<AuthTokenStatus> = this._onDidChangeStatus.event;

	readonly _onDidGetCallback: Emitter<URI> = this._register(new Emitter<URI>());

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IURLService private readonly urlService: IURLService
	) {
		super();
		this.channel = sharedProcessService.getChannel('authToken');
		this._register(this.channel.listen<AuthTokenStatus>('onDidChangeStatus')(status => this.updateStatus(status)));
		this.channel.call<AuthTokenStatus>('_getInitialStatus').then(status => this.updateStatus(status));

		this.urlService.registerHandler(this);
	}

	handleURL(uri: URI) {
		if (uri.authority === 'vscode.login') {
			this.channel.call('exchangeCodeForToken', uri);
			return Promise.resolve(true);
		} else {
			return Promise.resolve(false);
		}
	}

	getToken(): Promise<string> {
		return this.channel.call('getToken');
	}

	login(): Promise<void> {
		const callbackUri = this.urlService.create({ authority: 'vscode.login ' });
		return this.channel.call('login', callbackUri);
	}

	refreshToken(): Promise<void> {
		return this.channel.call('getToken');
	}

	logout(): Promise<void> {
		return this.channel.call('logout');
	}

	private async updateStatus(status: AuthTokenStatus): Promise<void> {
		if (status !== AuthTokenStatus.Initializing) {
			this._status = status;
			this._onDidChangeStatus.fire(status);
		}
	}

}

registerSingleton(IAuthTokenService, AuthTokenService);
