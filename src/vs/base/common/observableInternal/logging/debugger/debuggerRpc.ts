/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChannelFactory, IChannelHandler, API, SimpleTypedRpcConnection, MakeSideAsync } from './rpc.js';

export function registerDebugChannel<T extends { channelId: string } & API>(
	channelId: T['channelId'],
	createClient: () => T['client'],
): SimpleTypedRpcConnection<MakeSideAsync<T['host']>> {
	const g = globalThis as any as GlobalObj;

	let queuedNotifications: unknown[] = [];
	let curHost: IHost | undefined = undefined;

	const { channel, handler } = createChannelFactoryFromDebugChannel({
		sendNotification: (data) => {
			if (curHost) {
				curHost.sendNotification(data);
			} else {
				queuedNotifications.push(data);
			}
		},
	});

	let curClient: T['client'] | undefined = undefined;

	(g.$$debugValueEditor_debugChannels ?? (g.$$debugValueEditor_debugChannels = {}))[channelId] = (host) => {
		curClient = createClient();
		curHost = host;
		for (const n of queuedNotifications) {
			host.sendNotification(n);
		}
		queuedNotifications = [];
		return handler;
	};

	return SimpleTypedRpcConnection.createClient<T>(channel, () => {
		if (!curClient) { throw new Error('Not supported'); }
		return curClient;
	});
}

interface GlobalObj {
	$$debugValueEditor_debugChannels: Record<string, (host: IHost) => { handleRequest: (data: unknown) => unknown }>;
}

interface IHost {
	sendNotification: (data: unknown) => void;
}

function createChannelFactoryFromDebugChannel(host: IHost): { channel: ChannelFactory; handler: { handleRequest: (data: unknown) => unknown } } {
	let h: IChannelHandler | undefined;
	const channel: ChannelFactory = (handler) => {
		h = handler;
		return {
			sendNotification: data => {
				host.sendNotification(data);
			},
			sendRequest: data => {
				throw new Error('not supported');
			},
		};
	};
	return {
		channel: channel,
		handler: {
			handleRequest: (data: any) => {
				if (data.type === 'notification') {
					return h?.handleNotification(data.data);
				} else {
					return h?.handleRequest(data.data);
				}
			},
		},
	};
}
