/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IMessagePassingProtocol, IPCClient } from 'vs/base/parts/ipc/common/ipc';
import { IDisposable } from 'vs/base/common/lifecycle';
import { VSBuffer } from 'vs/base/common/buffer';

/**
 * Declare minimal `MessageEvent` and `MessagePort` interfaces here
 * so that this utility can be used both from `browser` and
 * `electron-main` namespace where message ports are available.
 */

export interface MessageEvent {

	/**
	 * For our use we only consider `Uint8Array` and `disconnect`
	 * a valid data transfer via message ports. Our protocol
	 * implementation is buffer based and we only need the explicit
	 * `disconnect` because message ports currently have no way of
	 * indicating when their connection is closed.
	 */
	data: Uint8Array | 'disconnect';
}

export interface MessagePort {

	addEventListener(type: 'message', listener: (this: MessagePort, e: MessageEvent) => unknown): void;
	removeEventListener(type: 'message', listener: (this: MessagePort, e: MessageEvent) => unknown): void;

	postMessage(message: Uint8Array | 'disconnect'): void;

	start(): void;
	close(): void;
}

/**
 * The MessagePort `Protocol` leverages MessagePort style IPC communication
 * for the implementation of the `IMessagePassingProtocol`. That style of API
 * is a simple `onmessage` / `postMessage` pattern.
 */
export class Protocol implements IMessagePassingProtocol {

	private readonly onRawData = Event.fromDOMEventEmitter<VSBuffer | 'disconnect'>(this.port, 'message', (e: MessageEvent) => e.data === 'disconnect' ? e.data : VSBuffer.wrap(e.data));

	readonly onMessage = Event.filter(this.onRawData, data => data !== 'disconnect') as Event<VSBuffer>;
	readonly onDisconnect = Event.signal(Event.filter(this.onRawData, data => data === 'disconnect'));

	constructor(private port: MessagePort) {

		// we must call start() to ensure messages are flowing
		port.start();

		// when the other end disconnects, ensure that we close
		// our end as well to stay in sync
		Event.once(this.onDisconnect)(() => port.close());
	}

	send(message: VSBuffer): void {
		this.port.postMessage(message.buffer);
	}

	disconnect(): void {
		this.port.postMessage('disconnect');
		this.port.close();
	}
}

/**
 * An implementation of a `IPCClient` on top of MessagePort style IPC communication.
 */
export class Client extends IPCClient implements IDisposable {

	private protocol: Protocol;

	constructor(port: MessagePort, clientId: string) {
		const protocol = new Protocol(port);
		super(protocol, clientId);

		this.protocol = protocol;
	}

	dispose(): void {
		this.protocol.disconnect();
	}
}
