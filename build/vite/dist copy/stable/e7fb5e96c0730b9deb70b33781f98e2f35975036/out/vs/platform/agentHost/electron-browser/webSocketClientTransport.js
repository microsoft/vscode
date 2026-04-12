/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// WebSocket client transport for connecting to remote agent host processes.
// Uses plain JSON serialization — URIs are string-typed in the protocol.
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { connectionTokenQueryName } from '../../../base/common/network.js';
// ---- Client transport -------------------------------------------------------
/**
 * A WebSocket client transport that connects to a remote agent host server.
 * Uses the native browser WebSocket API (available in Electron renderer).
 * Implements {@link IClientTransport} with JSON serialization and URI revival.
 */
export class WebSocketClientTransport extends Disposable {
    get isOpen() {
        return this._ws?.readyState === WebSocket.OPEN;
    }
    constructor(_address, _connectionToken) {
        super();
        this._address = _address;
        this._connectionToken = _connectionToken;
        this._onMessage = this._register(new Emitter());
        this.onMessage = this._onMessage.event;
        this._onClose = this._register(new Emitter());
        this.onClose = this._onClose.event;
        this._onOpen = this._register(new Emitter());
        this.onOpen = this._onOpen.event;
    }
    /**
     * Initiate the WebSocket connection. Resolves when the connection
     * is open, or rejects on error/timeout.
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this._store.isDisposed) {
                reject(new Error('Transport is disposed'));
                return;
            }
            let url = this._address.startsWith('ws://') || this._address.startsWith('wss://')
                ? this._address
                : `ws://${this._address}`;
            if (this._connectionToken) {
                const separator = url.includes('?') ? '&' : '?';
                url += `${separator}${connectionTokenQueryName}=${encodeURIComponent(this._connectionToken)}`;
            }
            const ws = new WebSocket(url);
            this._ws = ws;
            const onOpen = () => {
                cleanup();
                this._onOpen.fire();
                resolve();
            };
            const onError = () => {
                cleanup();
                reject(new Error(`WebSocket connection failed: ${this._address}`));
            };
            const onClose = () => {
                cleanup();
                reject(new Error(`WebSocket closed before connection was established: ${this._address}`));
            };
            const cleanup = () => {
                ws.removeEventListener('open', onOpen);
                ws.removeEventListener('error', onError);
                ws.removeEventListener('close', onClose);
            };
            ws.addEventListener('open', onOpen);
            ws.addEventListener('error', onError);
            ws.addEventListener('close', onClose);
            // Wire up long-lived listeners after connection
            ws.addEventListener('message', (event) => {
                try {
                    const text = typeof event.data === 'string' ? event.data : '';
                    const message = JSON.parse(text);
                    this._onMessage.fire(message);
                }
                catch {
                    // Malformed message - drop.
                }
            });
            ws.addEventListener('close', () => {
                this._onClose.fire();
            });
            ws.addEventListener('error', () => {
                // Error always precedes close - closing is handled in the close handler.
                this._onClose.fire();
            });
        });
    }
    send(message) {
        if (this._ws?.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify(message));
        }
    }
    dispose() {
        this._ws?.close();
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViU29ja2V0Q2xpZW50VHJhbnNwb3J0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L2VsZWN0cm9uLWJyb3dzZXIvd2ViU29ja2V0Q2xpZW50VHJhbnNwb3J0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLDRFQUE0RTtBQUM1RSx5RUFBeUU7QUFFekUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUkzRSxnRkFBZ0Y7QUFFaEY7Ozs7R0FJRztBQUNILE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxVQUFVO0lBYXZELElBQUksTUFBTTtRQUNULE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxVQUFVLEtBQUssU0FBUyxDQUFDLElBQUksQ0FBQztJQUNoRCxDQUFDO0lBRUQsWUFDa0IsUUFBZ0IsRUFDaEIsZ0JBQXlCO1FBRTFDLEtBQUssRUFBRSxDQUFDO1FBSFMsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUNoQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQVM7UUFqQjFCLGVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFvQixDQUFDLENBQUM7UUFDckUsY0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDO1FBRTFCLGFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUN2RCxZQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7UUFFdEIsWUFBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEs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