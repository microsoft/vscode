/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO@bpasero remove me once we are on Electron 22

export interface ParentPort extends NodeJS.EventEmitter {

	// Docs: https://electronjs.org/docs/api/parent-port

	/**
	 * Emitted when the process receives a message. Messages received on this port will
	 * be queued up until a handler is registered for this event.
	 */
	on(event: 'message', listener: (messageEvent: Electron.MessageEvent) => void): this;
	once(event: 'message', listener: (messageEvent: Electron.MessageEvent) => void): this;
	addListener(event: 'message', listener: (messageEvent: Electron.MessageEvent) => void): this;
	removeListener(event: 'message', listener: (messageEvent: Electron.MessageEvent) => void): this;
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
