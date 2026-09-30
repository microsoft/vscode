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

function createScopedOnMessageEvent(ipcEventSource: Event.NodeEventEmitter, senderId: number, eventName: string): Event<VSBuffer | null> {
	const onMessage = Event.fromNodeEventEmitter<IIPCEvent>(ipcEventSource, eventName, (event, message) => ({ event, message }));
	const onMessageFromSender = Event.filter(onMessage, ({ event }) => event.sender.id === senderId);

	return Event.map(onMessageFromSender, ({ message }) => message ? VSBuffer.wrap(message) : message);
}

/**
 * An implementation of `IPCServer` on top of Electron `ipcMain` API.
 */
export class Server extends IPCServer {

	private static readonly Clients = new Map<number, IDisposable>();

	private static getOnDidClientConnect(ipcEventSource: Event.NodeEventEmitter): Event<ClientConnectionEvent> {
		const onHello = Event.fromNodeEventEmitter<WebContents>(ipcEventSource, 'vscode:hello', ({ sender }) => sender);

		return Event.map(onHello, webContents => {
			const id = webContents.id;
			const client = Server.Clients.get(id);

			client?.dispose();

			const lifetime = new DisposableStore();
			const onDidClientDisconnect = lifetime.add(new Emitter<void>());
			const disconnect = lifetime.add(toDisposable(() => {
				onDidClientDisconnect.fire();
				if (Server.Clients.get(id) === disconnect) {
					Server.Clients.delete(id);
				}
				lifetime.dispose();
			}));
			Server.Clients.set(id, disconnect);

			const onMessage = createScopedOnMessageEvent(ipcEventSource, id, 'vscode:message') as Event<VSBuffer>;
			lifetime.add(Event.once(Event.any(
				Event.signal(createScopedOnMessageEvent(ipcEventSource, id, 'vscode:disconnect')),
				Event.signal(Event.fromNodeEventEmitter(webContents, 'render-process-gone')),
				Event.signal(Event.fromNodeEventEmitter(webContents, 'destroyed')),
			))(() => disconnect.dispose()));
			const protocol = new ElectronProtocol(webContents, onMessage);

			return { protocol, onDidClientDisconnect: onDidClientDisconnect.event };
		});
	}

	constructor(ipcEventSource: Event.NodeEventEmitter = validatedIpcMain) {
		super(Server.getOnDidClientConnect(ipcEventSource));
	}
}
