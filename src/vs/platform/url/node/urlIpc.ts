/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { URI } from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { IURLService, IURLHandler } from 'vs/platform/url/common/url';

export class URLServiceChannel implements IServerChannel {

	constructor(private service: IURLService) { }

	listen<T>(_, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'open': return this.service.open(URI.revive(arg));
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class URLServiceChannelClient implements IURLService {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

	open(url: URI): Promise<boolean> {
		return this.channel.call('open', url.toJSON());
	}

	registerHandler(handler: IURLHandler): IDisposable {
		throw new Error('Not implemented.');
	}
}

export class URLHandlerChannel implements IServerChannel {

	constructor(private handler: IURLHandler) { }

	listen<T>(_, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'handleURL': return this.handler.handleURL(URI.revive(arg));
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class URLHandlerChannelClient implements IURLHandler {

	constructor(private channel: IChannel) { }

	handleURL(uri: URI): Promise<boolean> {
		return this.channel.call('handleURL', uri.toJSON());
	}
}
