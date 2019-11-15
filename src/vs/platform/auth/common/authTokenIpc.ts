/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IAuthTokenService } from 'vs/platform/auth/common/auth';

export class AuthTokenChannel implements IServerChannel {

	constructor(private readonly service: IAuthTokenService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeStatus': return this.service.onDidChangeStatus;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case '_getInitialStatus': return Promise.resolve(this.service.status);
			case 'getToken': return this.service.getToken();
			case 'exchangeCodeForToken':
				this.service._onDidGetCallback.fire(args);
				return Promise.resolve();
			case 'refreshToken': return this.service.refreshToken();
			case 'login': return this.service.login(args);
			case 'logout': return this.service.logout();
		}
		throw new Error('Invalid call');
	}
}
