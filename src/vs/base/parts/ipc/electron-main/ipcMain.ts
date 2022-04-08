/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, ipcMain as unsafeIpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { onUnexpectedError } from 'vs/base/common/errors';

export const validatedIpcMain = new class {

	/**
	 * Listens to `channel`, when a new message arrives `listener` would be called with
	 * `listener(event, args...)`.
	 */
	on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void): this {
		unsafeIpcMain.on(channel, (event: IpcMainEvent, ...args: any[]) => {
			if (validateEvent(channel, event)) {
				listener(event, ...args);
			}
		});

		return this;
	}

	/**
	 * Adds a one time `listener` function for the event. This `listener` is invoked
	 * only the next time a message is sent to `channel`, after which it is removed.
	 */
	once(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void): this {
		unsafeIpcMain.once(channel, (event: IpcMainEvent, ...args: any[]) => {
			if (validateEvent(channel, event)) {
				listener(event, ...args);
			}
		});

		return this;
	}

	/**
	 * Adds a handler for an `invoke`able IPC. This handler will be called whenever a
	 * renderer calls `ipcRenderer.invoke(channel, ...args)`.
	 *
	 * If `listener` returns a Promise, the eventual result of the promise will be
	 * returned as a reply to the remote caller. Otherwise, the return value of the
	 * listener will be used as the value of the reply.
	 *
	 * The `event` that is passed as the first argument to the handler is the same as
	 * that passed to a regular event listener. It includes information about which
	 * WebContents is the source of the invoke request.
	 *
	 * Errors thrown through `handle` in the main process are not transparent as they
	 * are serialized and only the `message` property from the original error is
	 * provided to the renderer process. Please refer to #24427 for details.
	 */
	handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => (Promise<void>) | (any)): this {
		unsafeIpcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: any[]) => {
			if (validateEvent(channel, event)) {
				return listener(event, ...args);
			}

			return Promise.reject('Invalid channel or sender for ipcMain.handle() usage.');
		});

		return this;
	}

	/**
	 * Removes any handler for `channel`, if present.
	 */
	removeHandler(channel: string): this {
		unsafeIpcMain.removeHandler(channel);

		return this;
	}

	/**
	 * Removes the specified `listener` from the listener array for the specified
	 * `channel`.
	 */
	removeListener(channel: string, listener: (...args: any[]) => void): this {
		unsafeIpcMain.removeListener(channel, listener);

		return this;
	}
};

function validateEvent(channel: string, event: IpcMainEvent | IpcMainInvokeEvent): boolean {
	if (!channel || !channel.startsWith('vscode:')) {
		onUnexpectedError(`Refused to handle ipcMain event for channel ${channel} because the channel is unknown.`);
		return false; // unexpected channel
	}

	if (!event.senderFrame) {
		return true; // happens when renderer uses `ipcRenderer.postMessage`
	}

	const host = new URL(event.senderFrame.url).host;
	if (host !== 'vscode-app') {
		onUnexpectedError(`Refused to handle ipcMain event for channel ${channel} because of a bad origin of '${host}'.`);
		return false; // unexpected sender
	}

	if (!isMainFrame(event.senderFrame)) {
		onUnexpectedError(`Refused to handle ipcMain event for channel ${channel} because 'event.senderFrame' is not a main frame.`);
		return false; // unexpected frame
	}

	return true;
}

function isMainFrame(frame: Electron.WebFrameMain): boolean {
	const windows = BrowserWindow.getAllWindows();
	for (const window of windows) {
		if (frame.frameTreeNodeId === window.webContents.mainFrame.frameTreeNodeId) {
			return true;
		}
	}

	return false;
}
