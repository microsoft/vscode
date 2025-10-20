/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// #######################################################################
// ###                                                                 ###
// ###      electron.d.ts types we expose from electron-browser        ###
// ###                    (copied from Electron 29.x)                  ###
// ###                                                                 ###
// #######################################################################

type Event<Params extends object = {}> = {
	preventDefault: () => void;
	readonly defaultPrevented: boolean;
} & Params;

export interface IpcRendererEvent extends Event {

	// Docs: https://electronjs.org/docs/api/structures/ipc-renderer-event

	// Note: API with `Transferable` intentionally commented out because you
	// cannot transfer these when `contextIsolation: true`.
	// /**
	//  * A list of MessagePorts that were transferred with this message
	//  */
	// ports: MessagePort[];
	/**
	 * The `IpcRenderer` instance that emitted the event originally
	 */
	sender: IpcRenderer;
}

export interface IpcRenderer {

	// Docs: https://electronjs.org/docs/api/ipc-renderer

	/**
	 * Resolves with the response from the main process.
	 *
	 * Send a message to the main process via `channel` and expect a result
	 * asynchronously. Arguments will be serialized with the Structured Clone
	 * Algorithm, just like `window.postMessage`, so prototype chains will not be
	 * included. Sending Functions, Promises, Symbols, WeakMaps, or WeakSets will throw
	 * an exception.
	 *
	 * The main process should listen for `channel` with `ipcMain.handle()`.
	 *
	 * For example:
	 *
	 * If you need to transfer a `MessagePort` to the main process, use
	 * `ipcRenderer.postMessage`.
	 *
	 * If you do not need a response to the message, consider using `ipcRenderer.send`.
	 *
	 * > **Note** Sending non-standard JavaScript types such as DOM objects or special
	 * Electron objects will throw an exception.
	 *
	 * Since the main process does not have support for DOM objects such as
	 * `ImageBitmap`, `File`, `DOMMatrix` and so on, such objects cannot be sent over
	 * Electron's IPC to the main process, as the main process would have no way to
	 * decode them. Attempting to send such objects over IPC will result in an error.
	 *
	 * > **Note** If the handler in the main process throws an error, the promise
	 * returned by `invoke` will reject. However, the `Error` object in the renderer
	 * process will not be the same as the one thrown in the main process.
	 */
	invoke(channel: string, ...args: unknown[]): Promise<unknown>;
	/**
	 * Listens to `channel`, when a new message arrives `listener` would be called with
	 * `listener(event, args...)`.
	 */
	on(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): this;
	/**
	 * Adds a one time `listener` function for the event. This `listener` is invoked
	 * only the next time a message is sent to `channel`, after which it is removed.
	 */
	once(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): this;
	// Note: API with `Transferable` intentionally commented out because you
	// cannot transfer these when `contextIsolation: true`.
	// /**
	//  * Send a message to the main process, optionally transferring ownership of zero or
	//  * more `MessagePort` objects.
	//  *
	//  * The transferred `MessagePort` objects will be available in the main process as
	//  * `MessagePortMain` objects by accessing the `ports` property of the emitted
	//  * event.
	//  *
	//  * For example:
	//  *
	//  * For more information on using `MessagePort` and `MessageChannel`, see the MDN
	//  * documentation.
	//  */
	// postMessage(channel: string, message: unknown, transfer?: MessagePort[]): void;
	/**
	 * Removes the specified `listener` from the listener array for the specified
	 * `channel`.
	 */
	removeListener(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): this;
	/**
	 * Send an asynchronous message to the main process via `channel`, along with
	 * arguments. Arguments will be serialized with the Structured Clone Algorithm,
	 * just like `window.postMessage`, so prototype chains will not be included.
	 * Sending Functions, Promises, Symbols, WeakMaps, or WeakSets will throw an
	 * exception.
	 *
	 * > **NOTE:** Sending non-standard JavaScript types such as DOM objects or special
	 * Electron objects will throw an exception.
	 *
	 * Since the main process does not have support for DOM objects such as
	 * `ImageBitmap`, `File`, `DOMMatrix` and so on, such objects cannot be sent over
	 * Electron's IPC to the main process, as the main process would have no way to
	 * decode them. Attempting to send such objects over IPC will result in an error.
	 *
	 * The main process handles it by listening for `channel` with the `ipcMain`
	 * module.
	 *
	 * If you need to transfer a `MessagePort` to the main process, use
	 * `ipcRenderer.postMessage`.
	 *
	 * If you want to receive a single response from the main process, like the result
	 * of a method call, consider using `ipcRenderer.invoke`.
	 */
	send(channel: string, ...args: unknown[]): void;
}

export interface WebFrame {
	/**
	 * Changes the zoom level to the specified level. The original size is 0 and each
	 * increment above or below represents zooming 20% larger or smaller to default
	 * limits of 300% and 50% of original size, respectively. The formula for this is
	 * `scale := 1.2 ^ level`.
	 *
	 * > **NOTE**: The zoom policy at the Chromium level is same-origin, meaning that
	 * the zoom level for a specific domain propagates across all instances of windows
	 * with the same domain. Differentiating the window URLs will make zoom work
	 * per-window.
	 */
	setZoomLevel(level: number): void;
}

export interface ProcessMemoryInfo {

	// Docs: https://electronjs.org/docs/api/structures/process-memory-info

	/**
	 * The amount of memory not shared by other processes, such as JS heap or HTML
	 * content in Kilobytes.
	 */
	private: number;
	/**
	 * The amount of memory currently pinned to actual physical RAM in Kilobytes.
	 *
	 * @platform linux,win32
	 */
	residentSet: number;
	/**
	 * The amount of memory shared between processes, typically memory consumed by the
	 * Electron code itself in Kilobytes.
	 */
	shared: number;
}

/**
 * Additional information around a `app.on('login')` event.
 */
export interface AuthInfo {
	isProxy: boolean;
	scheme: string;
	host: string;
	port: number;
	realm: string;
}

export interface WebUtils {

	// Docs: https://electronjs.org/docs/api/web-utils

	/**
	 * The file system path that this `File` object points to. In the case where the
	 * object passed in is not a `File` object an exception is thrown. In the case
	 * where the File object passed in was constructed in JS and is not backed by a
	 * file on disk an empty string is returned.
	 *
	 * This method superceded the previous augmentation to the `File` object with the
	 * `path` property.  An example is included below.
	 */
	getPathForFile(file: File): string;
}
