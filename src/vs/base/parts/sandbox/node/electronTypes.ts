/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface MessagePortMain extends NodeJS.EventEmitter {

	// Docs: https://electronjs.org/docs/api/message-port-main

	/**
	 * Emitted when the remote end of a MessagePortMain object becomes disconnected.
	 */
	on(event: 'close', listener: Function): this;
	off(event: 'close', listener: Function): this;
	once(event: 'close', listener: Function): this;
	addListener(event: 'close', listener: Function): this;
	removeListener(event: 'close', listener: Function): this;
	/**
	 * Emitted when a MessagePortMain object receives a message.
	 */
	on(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
	off(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
	once(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
	addListener(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
	removeListener(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
	/**
	 * Disconnects the port, so it is no longer active.
	 */
	close(): void;
	/**
	 * Sends a message from the port, and optionally, transfers ownership of objects to
	 * other browsing contexts.
	 */
	postMessage(message: any, transfer?: MessagePortMain[]): void;
	/**
	 * Starts the sending of messages queued on the port. Messages will be queued until
	 * this method is called.
	 */
	start(): void;
}

export interface MessageEvent {
	data: any;
	ports: MessagePortMain[];
}

export interface ParentPort extends NodeJS.EventEmitter {

	// Docs: https://electronjs.org/docs/api/parent-port

	/**
	 * Emitted when the process receives a message. Messages received on this port will
	 * be queued up until a handler is registered for this event.
	 */
	on(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
	off(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
	once(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
	addListener(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
	removeListener(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
	/**
	 * Sends a message from the process to its parent.
	 */
	postMessage(message: any): void;
}

export interface UtilityNodeJSProcess extends NodeJS.Process {

	/**
	 * A `Electron.ParentPort` property if this is a `UtilityProcess` (or `null`
	 * otherwise) allowing communication with the parent process.
	 */
	parentPort: ParentPort;
}

export function isUtilityProcess(process: NodeJS.Process): process is UtilityNodeJSProcess {
	return !!(process as UtilityNodeJSProcess).parentPort;
}
