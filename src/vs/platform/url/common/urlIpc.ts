/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { Client, IChannel, IClientRouter, IConnectionHub, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { ILogService } from 'vs/platform/log/common/log';
import { IOpenURLOptions, IURLHandler } from 'vs/platform/url/common/url';

export class URLHandlerChannel implements IServerChannel {

	constructor(private handler: IURLHandler) { }

	listen<T>(_: unknown, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'handleURL': return this.handler.handleURL(URI.revive(arg[0]), arg[1]);
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class URLHandlerChannelClient implements IURLHandler {

	constructor(private channel: IChannel) { }

	handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		return this.channel.call('handleURL', [uri.toJSON(), options]);
	}
}

export class URLHandlerRouter implements IClientRouter<string> {

	constructor(
		private next: IClientRouter<string>,
		private readonly logService: ILogService
	) { }

	async routeCall(hub: IConnectionHub<string>, command: string, arg?: any, cancellationToken?: CancellationToken): Promise<Client<string>> {
		if (command !== 'handleURL') {
			throw new Error(`Call not found: ${command}`);
		}

		if (Array.isArray(arg) && arg.length > 0) {
			const uri = URI.revive(arg[0]);

			this.logService.trace('URLHandlerRouter#routeCall() with URI argument', uri.toString(true));

			if (uri.query) {
				const match = /\bwindowId=(\d+)/.exec(uri.query);

				if (match) {
					const windowId = match[1];

					this.logService.trace(`URLHandlerRouter#routeCall(): found windowId query parameter with value "${windowId}"`, uri.toString(true));

					const regex = new RegExp(`window:${windowId}`);
					const connection = hub.connections.find(c => {
						this.logService.trace('URLHandlerRouter#routeCall(): testing connection', c.ctx);

						return regex.test(c.ctx);
					});
					if (connection) {
						this.logService.trace('URLHandlerRouter#routeCall(): found a connection to route', uri.toString(true));

						return connection;
					} else {
						this.logService.trace('URLHandlerRouter#routeCall(): did not find a connection to route', uri.toString(true));
					}
				} else {
					this.logService.trace('URLHandlerRouter#routeCall(): did not find windowId query parameter', uri.toString(true));
				}
			}
		} else {
			this.logService.trace('URLHandlerRouter#routeCall() without URI argument');
		}

		return this.next.routeCall(hub, command, arg, cancellationToken);
	}

	routeEvent(_: IConnectionHub<string>, event: string): Promise<Client<string>> {
		throw new Error(`Event not found: ${event}`);
	}
}
