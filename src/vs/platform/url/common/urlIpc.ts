/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IURLHandler, IURLService } from './url';
import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';

export interface IURLServiceChannel extends IChannel {
	call(command: 'open', url: string): TPromise<boolean>;
	call(command: string, arg?: any): TPromise<any>;
}

export class URLServiceChannel implements IURLServiceChannel {

	constructor(private service: IURLService) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'open': return this.service.open(URI.revive(arg));
		}
		return undefined;
	}
}

export class URLServiceChannelClient implements IURLService {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

	open(url: URI): TPromise<boolean, any> {
		return this.channel.call('open', url.toJSON());
	}

	registerHandler(handler: IURLHandler): IDisposable {
		throw new Error('Not implemented.');
	}
}

export interface IURLHandlerChannel extends IChannel {
	call(command: 'handleURL', arg: any): TPromise<boolean>;
	call(command: string, arg?: any): TPromise<any>;
}

export class URLHandlerChannel implements IURLHandlerChannel {

	constructor(private handler: IURLHandler) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'handleURL': return this.handler.handleURL(URI.revive(arg));
		}
		return undefined;
	}
}

export class URLHandlerChannelClient implements IURLHandler {

	constructor(private channel: IChannel) { }

	handleURL(uri: URI): TPromise<boolean> {
		return this.channel.call('handleURL', uri.toJSON());
	}
}