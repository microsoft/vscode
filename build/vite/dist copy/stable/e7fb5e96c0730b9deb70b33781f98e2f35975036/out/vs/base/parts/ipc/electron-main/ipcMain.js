/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import electron from 'electron';
import { onUnexpectedError } from '../../../common/errors.js';
import { VSCODE_AUTHORITY } from '../../../common/network.js';
class ValidatedIpcMain {
    constructor() {
        // We need to keep a map of original listener to the wrapped variant in order
        // to properly implement `removeListener`. We use a `WeakMap` because we do
        // not want to prevent the `key` of the map to get garbage collected.
        this.mapListenerToWrapper = new WeakMap();
    }
    /**
     * Listens to `channel`, when a new message arrives `listener` would be called with
     * `listener(event, args...)`.
     */
    on(channel, listener) {
        // Remember the wrapped listener so that later we can
        // properly implement `removeListener`.
        const wrappedListener = (event, ...args) => {
            if (this.validateEvent(channel, event)) {
                listener(event, ...args);
            }
        };
        this.mapListenerToWrapper.set(listener, wrappedListener);
        electron.ipcMain.on(channel, wrappedListener);
        return this;
    }
    /**
     * Adds a one time `listener` function for the event. This `listener` is invoked
     * only the next time a message is sent to `channel`, after which it is removed.
     */
    once(channel, listener) {
        electron.ipcMain.once(channel, (event, ...args) => {
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
    handle(channel, listener) {
        electron.ipcMain.handle(channel, (event, ...args) => {
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
    removeHandler(channel) {
        electron.ipcMain.removeHandler(channel);
        return this;
    }
    /**
     * Removes the specified `listener` from the listener array for the specified
     * `channel`.
     */
    removeListener(channel, listener) {
        const wrappedListener = this.mapListenerToWrapper.get(listener);
        if (wrappedListener) {
            electron.ipcMain.removeListener(channel, wrappedListener);
            this.mapListenerToWrapper.delete(listener);
        }
        return this;
    }
    validateEvent(channel, event) {
        if (!channel?.startsWith('vscode:')) {
            onUnexpectedError(`Refused to handle ipcMain event for channel '${channel}' because the channel is unknown.`);
            return false; // unexpected channel
        }
        const sender = event.senderFrame;
        const url = sender?.url;
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
        }
        catch (error) {
            onUnexpectedError(`Refused to handle ipcMain event for channel '${channel}' because of a malformed URL '${url}'.`);
            return false; // unexpected URL
        }
        if (process.env.VSCODE_DEV) {
            if (url === process.env.DEV_WINDOW_SRC && (host === 'localhost' || host.startsWith('localhost:'))) {
                return true; // development support where the window is served from localhost
            }
        }
        if (host !== VSCODE_AUTHORITY) {
            onUnexpectedError(`Refused to handle ipcMain event for channel '${channel}' because of a bad origin of '${host}'.`);
            return false; // unexpected sender
        }
        if (sender?.parent !== null) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXBjTWFpbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvcGFydHMvaXBjL2VsZWN0cm9uLW1haW4vaXBjTWFpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLFFBQVEsTUFBTSxVQUFVLENBQUM7QUFDaEMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFOUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFJOUQsTUFBTSxnQkFBZ0I7SUFBdEI7UUFFQyw2RUFBNkU7UUFDN0UsMkVBQTJFO1FBQzNFLHFFQUFxRTtRQUNwRCx5QkFBb0IsR0FBRyxJQUFJLE9BQU8sRUFBb0MsQ0FBQztJQW1JekYsQ0FBQztJQWpJQTs7O09BR0c7SUFDSCxFQUFFLENBQUMsT0FBZSxFQUFFLFFBQXlCO1FBRTVDLHFEQUFxRDtRQUNyRCx1Q0FBdUM7UUFDdkMsTUFBTSxlQUFlLEdBQUcsQ0FBQyxLQUE0QixFQUFFLEdBQUcsSUFBZSxFQUFFLEVBQUU7WUFDNUUsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN4QyxRQUFRLENBQUMsS0FBSyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDMUIsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUVGLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBRXpELFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxlQUFlLENBQUMsQ0FBQztRQUU5QyxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRDs7O09BR0c7SUFDSCxJQUFJLENBQUMsT0FBZSxFQUFFLFFBQXlCO1FBQzlDLFFBQVEsQ0FBQyxPQUFPLENBQUMs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