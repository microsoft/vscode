/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebContents } from 'electron';
import { validatedIpcMain } from './ipcMain.js';
import { VSBuffer } from '../../../common/buffer.js';
import { Emitter, Event } from '../../../common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../common/lifecycle.js';
import { ClientConnectionEvent, IPCServer } from '../common/ipc.js';
import { Protocol as ElectronProtocol } from '../common/ipc.electron.js';

interface IIPCEvent {
	event: { sender: WebContents };
	message: Buffer | null;
}

function createScopedOnMessageEvent(eventSource: Event.NodeEventEmitter, senderId: number, eventName: string): Event<VSBuffer | null> {
	const onMessage = Event.fromNodeEventEmitter<IIPCEvent>(eventSource, eventName, (event, message) => ({ event, message }));
	const onMessageFromSender = Event.filter(onMessage, ({ event }) => event.sender.id === senderId);

	return Event.map(onMessageFromSender, ({ message }) => message ? VSBuffer.wrap(message) : message);
}

/**
 * An implementation of `IPCServer` on top of Electron `ipcMain` API.
 */
export class Server extends IPCServer {

	private static readonly Clients = new Map<number, IDisposable>();

	private static getOnDidClientConnect(eventSource: Event.NodeEventEmitter): Event<ClientConnectionEvent> {
		const onHello = Event.fromNodeEventEmitter<WebContents>(eventSource, 'vscode:hello', ({ sender }) => sender);

		return Event.map(onHello, webContents => {
			const id = webContents.id;
			const client = Server.Clients.get(id);

			client?.dispose();

			const disposables = new DisposableStore();
			const onDidClientDisconnect = disposables.add(new Emitter<void>());
			const reconnectDisposable = toDisposable(() => {
				if (Server.Clients.get(id) === reconnectDisposable) {
					Server.Clients.delete(id);
				}
				// Deliver to the channel cleanup listeners before disposing their emitter.
				onDidClientDisconnect.fire();
				disposables.dispose();
			});
			Server.Clients.set(id, reconnectDisposable);
			disposables.add(Event.once(createScopedOnMessageEvent(eventSource, id, 'vscode:disconnect'))(() => reconnectDisposable.dispose()));

			const onMessage = createScopedOnMessageEvent(eventSource, id, 'vscode:message') as Event<VSBuffer>;
			const protocol = new ElectronProtocol(webContents, onMessage);

			return { protocol, onDidClientDisconnect: onDidClientDisconnect.event };
		});
	}

	constructor(eventSource: Event.NodeEventEmitter = validatedIpcMain) {
		super(Server.getOnDidClientConnect(eventSource));
	}
}
