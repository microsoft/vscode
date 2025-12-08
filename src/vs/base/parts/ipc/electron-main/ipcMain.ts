/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcMain as unsafeIpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';

type ipcMainListener = (event: IpcMainEvent, ...args: any[]) => void;

class ValidatedIpcMain implements Event.NodeEventEmitter {

	// We need to keep a map of original listener to the wrapped variant in order
	// to properly implement `removeListener`. We use a `WeakMap` because we do
	// not want to prevent the `key` of the map to get garbage collected.
	private readonly mapListenerToWrapper = new WeakMap<ipcMainListener, ipcMainListener>();

	/**
	 * Listens to `channel`, when a new message arrives `listener` would be called with
	 * `listener(event, args...)`.
	 */
	on(channel: string, listener: ipcMainListener): this {

		// Remember the wrapped listener so that later we can
		// properly implement `removeListener`.
		const wrappedListener = (event: IpcMainEvent, ...args: any[]) => {
			if (this.validateEvent(channel, event)) {
				listener(event, ...args);
			}
		};

		this.mapListenerToWrapper.set(listener, wrappedListener);

		unsafeIpcMain.on(channel, wrappedListener);

		return this;
	}

	/**
	 * Adds a one time `listener` function for the event. This `listener` is invoked
	 * only the next time a message is sent to `channel`, after which it is removed.
	 */
	once(channel: string, listener: ipcMainListener): this {
		unsafeIpcMain.once(channel, (event: IpcMainEvent, ...args: any[]) => {
			if (this.validateEvent(channel, event)) {
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
	handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<unknown>): this {
		unsafeIpcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: any[]) => {
			if (this.validateEvent(channel, event)) {
				return listener(event, ...args);
			}

			return Promise.reject(`Invalid channel '${channel}' or sender for ipcMain.handle() usage.`);
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
	removeListener(channel: string, listener: ipcMainListener): this {
		const wrappedListener = this.mapListenerToWrapper.get(listener);
		if (wrappedListener) {
			unsafeIpcMain.removeListener(channel, wrappedListener);
			this.mapListenerToWrapper.delete(listener);
		}

		return this;
	}

	private validateEvent(channel: string, event: IpcMainEvent | IpcMainInvokeEvent): boolean {
		if (!channel || !channel.startsWith('vscode:')) {
			onUnexpectedError(`Refused to handle ipcMain event for channel '${channel}' because the channel is unknown.`);
			return false; // unexpected channel
		}

		const sender = event.senderFrame;

		const url = sender.url;
		// `url` can be `undefined` when running tests from playwright https://github.com/microsoft/vscode/issues/147301
		// and `url` can be `about:blank` when reloading the window
		// from performance tab of devtools https://github.com/electron/electron/issues/39427.
		// It is fine to skip the checks in these cases.
		if (!url || url === 'about:blank') {
			return true;
		}

		let host = 'unknown';
		try {
			host = new URL(url).host;
		} catch (error) {
			onUnexpectedError(`Refused to handle ipcMain event for channel '${channel}' because of a malformed URL '${url}'.`);
			return false; // unexpected URL
		}

		if (host !== 'vscode-app') {
			onUnexpectedError(`Refused to handle ipcMain event for channel '${channel}' because of a bad origin of '${host}'.`);
			return false; // unexpected sender
		}

		if (sender.parent !== null) {
			onUnexpectedError(`Refused to handle ipcMain event for channel '${channel}' because sender of origin '${host}' is not a main frame.`);
			return false; // unexpected frame
		}

		return true;
	}
}

/**
 * A drop-in replacement of `ipcMain` that validates the sender of a message
 * according to https://github.com/electron/electron/blob/main/docs/tutorial/security.md
 *
 * @deprecated direct use of Electron IPC is not encouraged. We have utilities in place
 * to create services on top of IPC, see `ProxyChannel` for more information.
 */
export const validatedIpcMain = new ValidatedIpcMain();
