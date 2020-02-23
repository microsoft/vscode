/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IAuthenticationTokenService } from 'vs/platform/authentication/common/authentication';


export class AuthenticationTokenServiceChannel implements IServerChannel {
	constructor(private readonly service: IAuthenticationTokenService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeToken': return this.service.onDidChangeToken;
			case 'onTokenFailed': return this.service.onTokenFailed;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'setToken': return this.service.setToken(args);
			case 'getToken': return this.service.getToken();
		}
		throw new Error('Invalid call');
	}
}
