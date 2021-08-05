/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { RunOnceScheduler } from 'vs/base/common/async';
import { RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode } from 'vs/platform/remote/common/remoteAuthorityResolver';
// eslint-disable-next-line code-import-patterns
import * as WebSocket from 'ws';
// eslint-disable-next-line code-layering, code-import-patterns
import { IWebSocket, IWebSocketCloseEvent } from 'vs/platform/remote/browser/browserSocketFactory';
import { ISocket, SocketCloseEvent, SocketCloseEventType } from 'vs/base/parts/ipc/common/ipc.net';
import { VSBuffer } from 'vs/base/common/buffer';

export type SocketMessageListener = (event: { data: any; type: string; target: WebSocket }) => void;
export type SocketOpenListener = (this: WebSocket) => void;

/**
 * @coder Wraps server-side web socket in an interface that can be consumed
 * by `ServerSocket`. This allows IPC-style protocol handlers to interact with it.
 */
export class ServerWebSocket extends Disposable implements IWebSocket {

	private readonly _onData = new Emitter<ArrayBuffer>();
	public readonly onData = this._onData.event;

	public readonly onOpen: Event<void>;

	private readonly _onClose = this._register(new Emitter<IWebSocketCloseEvent>());
	public readonly onClose = this._onClose.event;

	private readonly _onError = this._register(new Emitter<any>());
	public readonly onError = this._onError.event;

	private _isClosed = false;

	public readonly socket: WebSocket;

	private readonly _socketMessageListener: SocketMessageListener = (ev) => {
		this._onData.fire(ev.data);
	};

	constructor(socket: WebSocket) {
		super();
		this.socket = socket;

		this.onOpen = Event.fromNodeEventEmitter(this.socket, 'open');

		// WebSockets emit error events that do not contain any real information
		// Our only chance of getting to the root cause of an error is to
		// listen to the close event which gives out some real information:
		// - https://www.w3.org/TR/websockets/#closeevent
		// - https://tools.ietf.org/html/rfc6455#section-11.7
		//
		// But the error event is emitted before the close event, so we therefore
		// delay the error event processing in the hope of receiving a close event
		// with more information

		let pendingErrorEvent: any | null = null;

		const sendPendingErrorNow = () => {
			const err = pendingErrorEvent;
			pendingErrorEvent = null;
			this._onError.fire(err);
		};

		const errorRunner = this._register(new RunOnceScheduler(sendPendingErrorNow, 0));

		const sendErrorSoon = (err: any) => {
			errorRunner.cancel();
			pendingErrorEvent = err;
			errorRunner.schedule();
		};

		const sendErrorNow = (err: any) => {
			errorRunner.cancel();
			pendingErrorEvent = err;
			sendPendingErrorNow();
		};

		this.socket.on('message', this._socketMessageListener);

		this.socket.addEventListener('close', (e) => {
			this._isClosed = true;

			if (pendingErrorEvent) {
				// An error event is pending
				// The browser appears to be online...
				if (!e.wasClean) {
					// Let's be optimistic and hope that perhaps the server could not be reached or something
					sendErrorNow(new RemoteAuthorityResolverError(e.reason || `WebSocket close with status code ${e.code}`, RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable, e));
				} else {
					// this was a clean close => send existing error
					errorRunner.cancel();
					sendPendingErrorNow();
				}
			}

			this._onClose.fire({ code: e.code, reason: e.reason, wasClean: e.wasClean, event: e });
		});

		this.socket.addEventListener('error', sendErrorSoon);
	}

	send(data: ArrayBuffer | ArrayBufferView): void {
		if (this._isClosed) {
			// Refuse to write data to closed WebSocket...
			return;
		}
		this.socket.send(data);
	}

	close(): void {
		this._isClosed = true;
		this.socket.close();
		this.socket.removeAllListeners();
		this.dispose();
	}
}

export class ServerSocket implements ISocket {
	public readonly webSocket: ServerWebSocket;

	constructor(webSocket: ServerWebSocket) {
		this.webSocket = webSocket;
	}

	public dispose(): void {
		this.webSocket.close();
	}

	public onData(listener: (e: VSBuffer) => void): IDisposable {
		return this.webSocket.onData((data) => listener(VSBuffer.wrap(new Uint8Array(data))));
	}

	public onClose(listener: (e: SocketCloseEvent) => void): IDisposable {
		const adapter = (e: IWebSocketCloseEvent | void) => {
			if (typeof e === 'undefined') {
				listener(e);
			} else {
				listener({
					type: SocketCloseEventType.WebSocketCloseEvent,
					code: e.code,
					reason: e.reason,
					wasClean: e.wasClean,
					event: e.event
				});
			}
		};
		return this.webSocket.onClose(adapter);
	}

	public onEnd(listener: () => void): IDisposable {
		return Disposable.None;
	}

	public write(buffer: VSBuffer): void {
		this.webSocket.send(buffer.buffer);
	}

	public end(): void {
		this.webSocket.close();
	}

	public drain(): Promise<void> {
		return Promise.resolve();
	}
}
