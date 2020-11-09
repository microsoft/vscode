/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// #######################################################################
// ###                                                                 ###
// ###      electron.d.ts types we expose from electron-sandbox        ###
// ###                    (copied from Electron 9.x)                   ###
// ###                                                                 ###
// #######################################################################


export interface IpcRenderer {
	/**
	 * Listens to `channel`, when a new message arrives `listener` would be called with
	 * `listener(event, args...)`.
	 */
	on(channel: string, listener: (event: unknown, ...args: any[]) => void): void;

	/**
	 * Adds a one time `listener` function for the event. This `listener` is invoked
	 * only the next time a message is sent to `channel`, after which it is removed.
	 */
	once(channel: string, listener: (event: unknown, ...args: any[]) => void): void;

	/**
	 * Removes the specified `listener` from the listener array for the specified
	 * `channel`.
	 */
	removeListener(channel: string, listener: (event: unknown, ...args: any[]) => void): void;

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
}

export interface WebFrame {
	/**
	 * Changes the zoom level to the specified level. The original size is 0 and each
	 * increment above or below represents zooming 20% larger or smaller to default
	 * limits of 300% and 50% of original size, respectively.
	 */
	setZoomLevel(level: number): void;
}

export interface CrashReporter {
	/**
	 * Set an extra parameter to be sent with the crash report. The values specified
	 * here will be sent in addition to any values set via the `extra` option when
	 * `start` was called.
	 *
	 * Parameters added in this fashion (or via the `extra` parameter to
	 * `crashReporter.start`) are specific to the calling process. Adding extra
	 * parameters in the main process will not cause those parameters to be sent along
	 * with crashes from renderer or other child processes. Similarly, adding extra
	 * parameters in a renderer process will not result in those parameters being sent
	 * with crashes that occur in other renderer processes or in the main process.
	 *
	 * **Note:** Parameters have limits on the length of the keys and values. Key names
	 * must be no longer than 39 bytes, and values must be no longer than 127 bytes.
	 * Keys with names longer than the maximum will be silently ignored. Key values
	 * longer than the maximum length will be truncated.
	 */
	addExtraParameter(key: string, value: string): void;
}

export interface ProcessMemoryInfo {

	// Docs: http://electronjs.org/docs/api/structures/process-memory-info

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

export interface CrashReporterStartOptions {
	/**
	 * URL that crash reports will be sent to as POST.
	 */
	submitURL: string;
	/**
	 * Defaults to `app.name`.
	 */
	productName?: string;
	/**
	 * Deprecated alias for `{ globalExtra: { _companyName: ... } }`.
	 *
	 * @deprecated
	 */
	companyName?: string;
	/**
	 * Whether crash reports should be sent to the server. If false, crash reports will
	 * be collected and stored in the crashes directory, but not uploaded. Default is
	 * `true`.
	 */
	uploadToServer?: boolean;
	/**
	 * If true, crashes generated in the main process will not be forwarded to the
	 * system crash handler. Default is `false`.
	 */
	ignoreSystemCrashHandler?: boolean;
	/**
	 * If true, limit the number of crashes uploaded to 1/hour. Default is `false`.
	 *
	 * @platform darwin,win32
	 */
	rateLimit?: boolean;
	/**
	 * If true, crash reports will be compressed and uploaded with `Content-Encoding:
	 * gzip`. Not all collection servers support compressed payloads. Default is
	 * `false`.
	 *
	 * @platform darwin,win32
	 */
	compress?: boolean;
	/**
	 * Extra string key/value annotations that will be sent along with crash reports
	 * that are generated in the main process. Only string values are supported.
	 * Crashes generated in child processes will not contain these extra parameters to
	 * crash reports generated from child processes, call `addExtraParameter` from the
	 * child process.
	 */
	extra?: Record<string, string>;
	/**
	 * Extra string key/value annotations that will be sent along with any crash
	 * reports generated in any process. These annotations cannot be changed once the
	 * crash reporter has been started. If a key is present in both the global extra
	 * parameters and the process-specific extra parameters, then the global one will
	 * take precedence. By default, `productName` and the app version are included, as
	 * well as the Electron version.
	 */
	globalExtra?: Record<string, string>;
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
