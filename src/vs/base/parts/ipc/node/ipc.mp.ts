/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessagePortMain, isUtilityProcess, MessageEvent } from 'vs/base/parts/sandbox/node/electronTypes';
import { VSBuffer } from 'vs/base/common/buffer';
import { ClientConnectionEvent, IMessagePassingProtocol, IPCServer } from 'vs/base/parts/ipc/common/ipc';
import { Emitter, Event } from 'vs/base/common/event';
import { assertType } from 'vs/base/common/types';
import { firstOrDefault } from 'vs/base/common/arrays';

/**
 * The MessagePort `Protocol` leverages MessagePortMain style IPC communication
 * for the implementation of the `IMessagePassingProtocol`.
 */
class Protocol implements IMessagePassingProtocol {

	readonly onMessage = Event.fromNodeEventEmitter<VSBuffer>(this.port, 'message', (e: MessageEvent) => VSBuffer.wrap(e.data));

	constructor(private port: MessagePortMain) {

		// we must call start() to ensure messages are flowing
		port.start();
	}

	send(message: VSBuffer): void {
		this.port.postMessage(message.buffer);
	}

	disconnect(): void {
		this.port.close();
	}
}

/**
 * An implementation of a `IPCServer` on top of MessagePort style IPC communication.
 * The clients register themselves via Electron Utility Process IPC transfer.
 */
export class Server extends IPCServer {

	private static getOnDidClientConnect(): Event<ClientConnectionEvent> {
		assertType(isUtilityProcess(process), 'Electron Utility Process');

		const onCreateMessageChannel = new Emitter<MessagePortMain>();

		process.parentPort.on('message', (e: Electron.MessageEvent) => {
			const port = firstOrDefault(e.ports);
			if (port) {
				onCreateMessageChannel.fire(port);
			}
		});

		return Event.map(onCreateMessageChannel.event, port => {
			const protocol = new Protocol(port);

			const result: ClientConnectionEvent = {
				protocol,
				// Not part of the standard spec, but in Electron we get a `close` event
				// when the other side closes. We can use this to detect disconnects
				// (https://github.com/electron/electron/blob/11-x-y/docs/api/message-port-main.md#event-close)
				onDidClientDisconnect: Event.fromNodeEventEmitter(port, 'close')
			};

			return result;
		});
	}

	constructor() {
		super(Server.getOnDidClientConnect());
	}
}

interface INodeMessagePortFragment {
	on(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
	removeListener(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
}

export function once(port: INodeMessagePortFragment, message: unknown, callback: () => void): void {
	const listener = (e: MessageEvent) => {
		if (e.data === message) {
			port.removeListener('message', listener);
			callback();
		}
	};

	port.on('message', listener);
}
