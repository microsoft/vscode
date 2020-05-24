/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const ipcRenderer = (window as any).vscode.ipcRenderer as {

	/**
	 * Listens to `channel`, when a new message arrives `listener` would be called with
	 * `listener(event, args...)`.
	 */
	on(channel: string, listener: Function): void;

	/**
	 * Adds a one time `listener` function for the event. This `listener` is invoked
	 * only the next time a message is sent to `channel`, after which it is removed.
	 */
	once(channel: string, listener: Function): void;

	/**
	 * Removes the specified `listener` from the listener array for the specified
	 * `channel`.
	 */
	removeListener(channel: string, listener: Function): void;

	/**
	 * Send an asynchronous message to the main process via `channel`, along with
	 * arguments. Arguments will be serialized with the Structured Clone Algorithm,
	 * just like `postMessage`, so prototype chains will not be included. Sending
	 * Functions, Promises, Symbols, WeakMaps, or WeakSets will throw an exception.
	 *
	 * > **NOTE**: Sending non-standard JavaScript types such as DOM objects or special
	 * Electron objects is deprecated, and will begin throwing an exception starting
	 * with Electron 9.
	 *
	 * The main process handles it by listening for `channel` with the `ipcMain`
	 * module.
	 */
	send(channel: string, ...args: any[]): void;
};

export const webFrame = (window as any).vscode.webFrame as {

	/**
	 * The current zoom factor.
	 */
	getZoomFactor(): number;
};
