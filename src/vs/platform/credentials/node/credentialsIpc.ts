/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';

export interface ICredentialsArgs {
	service: string;
	account: string;
	secret?: string;
}

export interface ICredentialsChannel extends IChannel {
	call(command: 'readSecret', credentials: ICredentialsArgs): TPromise<string>;
	call(command: 'writeSecret', credentials: ICredentialsArgs): TPromise<void>;
	call(command: 'deleteSecret', credentials: ICredentialsArgs): TPromise<boolean>;
	call(command: string, arg?: any): TPromise<any>;
}

export class CredentialsChannel implements ICredentialsChannel {

	constructor(private service: ICredentialsService) { }

	call(command: string, arg: ICredentialsArgs): TPromise<any> {
		switch (command) {
			case 'readSecret': return this.service.readSecret(arg.service, arg.account);
			case 'writeSecret': return this.service.writeSecret(arg.service, arg.account, arg.secret);
			case 'deleteSecret': return this.service.deleteSecret(arg.service, arg.account);
		}
		return undefined;
	}
}

export class CredentialsChannelClient implements ICredentialsService {

	_serviceBrand: any;

	constructor(private channel: ICredentialsChannel) { }

	readSecret(service: string, account: string): TPromise<string | undefined> {
		return this.channel.call('readSecret', { service, account });
	}

	writeSecret(service: string, account: string, secret: string): TPromise<void> {
		return this.channel.call('writeSecret', { service, account, secret });
	}

	deleteSecret(service: string, account: string): TPromise<boolean> {
		return this.channel.call('deleteSecret', { service, account });
	}
}