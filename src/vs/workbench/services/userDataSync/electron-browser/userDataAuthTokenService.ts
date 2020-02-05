/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataAuthTokenService } from 'vs/platform/userDataSync/common/userDataSync';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';

export class UserDataAuthTokenService extends Disposable implements IUserDataAuthTokenService {

	_serviceBrand: undefined;

	private readonly channel: IChannel;
	private _onDidChangeToken: Emitter<string | undefined> = this._register(new Emitter<string | undefined>());
	readonly onDidChangeToken: Event<string | undefined> = this._onDidChangeToken.event;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		super();
		this.channel = sharedProcessService.getChannel('authToken');
	}

	getToken(): Promise<string | undefined> {
		return this.channel.call('getToken');
	}

	setToken(token: string | undefined): Promise<undefined> {
		return this.channel.call('setToken', token);
	}
}

registerSingleton(IUserDataAuthTokenService, UserDataAuthTokenService);
