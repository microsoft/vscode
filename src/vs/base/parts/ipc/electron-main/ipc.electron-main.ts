/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, filterEvent, mapEvent, fromNodeEventEmitter, signalEvent } from 'vs/base/common/event';
import { IPCServer, ClientConnectionEvent } from 'vs/base/parts/ipc/node/ipc';
import { Protocol } from 'vs/base/parts/ipc/node/ipc.electron';
import { ipcMain } from 'electron';

interface IIPCEvent {
	event: { sender: Electron.WebContents; };
	message: string;
}

function createScopedOnMessageEvent(senderId: number, eventName: string): Event<string> {
	const onMessage = fromNodeEventEmitter<IIPCEvent>(ipcMain, eventName, (event, message: string) => ({ event, message }));
	const onMessageFromSender = filterEvent(onMessage, ({ event }) => event.sender.id === senderId);
	return mapEvent(onMessageFromSender, ({ message }) => message);
}

export class Server extends IPCServer {

	private static getOnDidClientConnect(): Event<ClientConnectionEvent> {
		const onHello = fromNodeEventEmitter<Electron.WebContents>(ipcMain, 'ipc:hello', ({ sender }) => sender);

		return mapEvent(onHello, webContents => {
			const onMessage = createScopedOnMessageEvent(webContents.id, 'ipc:message');
			const onDidClientDisconnect = signalEvent(createScopedOnMessageEvent(webContents.id, 'ipc:disconnect'));
			const protocol = new Protocol(webContents, onMessage);

			return { protocol, onDidClientDisconnect };
		});
	}

	constructor() {
		super(Server.getOnDidClientConnect());
	}
}