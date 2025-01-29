/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { ISocket, SocketCloseEvent, SocketCloseEventType, SocketDiagnostics, SocketDiagnosticsEventType } from '../../../base/parts/ipc/common/ipc.net.js';
import { ISocketFactory } from '../common/remoteSocketFactoryService.js';
import { RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode, RemoteConnectionType, WebSocketRemoteConnection } from '../common/remoteAuthorityResolver.js';
import { mainWindow } from '../../../base/browser/window.js';

export interface IWebSocketFactory {
	create(url: string, debugLabel: string): IWebSocket;
}

export interface IWebSocketCloseEvent {
	/**
	 * Returns the WebSocket connection close code provided by the server.
	 */
	readonly code: number;
	/**
	 * Returns the WebSocket connection close reason provided by the server.
	 */
	readonly reason: string;
	/**
	 * Returns true if the connection closed cleanly; false otherwise.
	 */
	readonly wasClean: boolean;
	/**
	 * Underlying event.
	 */
	readonly event: any | undefined;
}

export interface IWebSocket {
	readonly onData: Event<ArrayBuffer>;
	readonly onOpen: Event<void>;
	readonly onClose: Event<IWebSocketCloseEvent | void>;
	readonly onError: Event<any>;

	traceSocketEvent?(type: SocketDiagnosticsEventType, data?: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView | any): void;
	send(data: ArrayBuffer | ArrayBufferView): void;
	close(): void;
}

class BrowserWebSocket extends Disposable implements IWebSocket {

	private readonly _onData = new Emitter<ArrayBuffer>();
	public readonly onData = this._onData.event;

	private readonly _onOpen = this._register(new Emitter<void>());
	public readonly onOpen = this._onOpen.event;

	private readonly _onClose = this._register(new Emitter<IWebSocketCloseEvent>());
	public readonly onClose = this._onClose.event;

	private readonly _onError = this._register(new Emitter<any>());
	public readonly onError = this._onError.event;

	private readonly _debugLabel: string;
	private readonly _socket: WebSocket;
	private readonly _fileReader: FileReader;
	private readonly _queue: Blob[];
	private _isReading: boolean;
	private _isClosed: boolean;

	private readonly _socketMessageListener: (ev: MessageEvent) => void;

	public traceSocketEvent(type: SocketDiagnosticsEventType, data?: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView | any): void {
		SocketDiagnostics.traceSocketEvent(this._socket, this._debugLabel, type, data);
	}

	constructor(url: string, debugLabel: string) {
		super();
		this._debugLabel = debugLabel;
		this._socket = new WebSocket(url);
		this.traceSocketEvent(SocketDiagnosticsEventType.Created, { type: 'BrowserWebSocket', url });
		this._fileReader = new FileReader();
		this._queue = [];
		this._isReading = false;
		this._isClosed = false;

		this._fileReader.onload = (event) => {
			this._isReading = false;
			const buff = <ArrayBuffer>(<any>event.target).result;

			this.traceSocketEvent(SocketDiagnosticsEventType.Read, buff);
			this._onData.fire(buff);

			if (this._queue.length > 0) {
				enqueue(this._queue.shift()!);
			}
		};

		const enqueue = (blob: Blob) => {
			if (this._isReading) {
				this._queue.push(blob);
				return;
			}
			this._isReading = true;
			this._fileReader.readAsArrayBuffer(blob);
		};

		this._socketMessageListener = (ev: MessageEvent) => {
			const blob = (<Blob>ev.data);
			this.traceSocketEvent(SocketDiagnosticsEventType.BrowserWebSocketBlobReceived, { type: blob.type, size: blob.size });
			enqueue(blob);
		};
		this._socket.addEventListener('message', this._socketMessageListener);

		this._register(dom.addDisposableListener(this._socket, 'open', (e) => {
			this.traceSocketEvent(SocketDiagnosticsEventType.Open);
			this._onOpen.fire();
		}));

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

		this._register(dom.addDisposableListener(this._socket, 'close', (e: CloseEvent) => {
			this.traceSocketEvent(SocketDiagnosticsEventType.Close, { code: e.code, reason: e.reason, wasClean: e.wasClean });

			this._isClosed = true;

			if (pendingErrorEvent) {
				if (!navigator.onLine) {
					// The browser is offline => this is a temporary error which might resolve itself
					sendErrorNow(new RemoteAuthorityResolverError('Browser is offline', RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable, e));
				} else {
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
			}

			this._onClose.fire({ code: e.code, reason: e.reason, wasClean: e.wasClean, event: e });
		}));

		this._register(dom.addDisposableListener(this._socket, 'error', (err) => {
			this.traceSocketEvent(SocketDiagnosticsEventType.Error, { message: err?.message });
			sendErrorSoon(err);
		}));
	}

	send(data: ArrayBuffer | ArrayBufferView): void {
		if (this._isClosed) {
			// Refuse to write data to closed WebSocket...
			return;
		}
		this.traceSocketEvent(SocketDiagnosticsEventType.Write, data);
		this._socket.send(data);
	}

	close(): void {
		this._isClosed = true;
		this.traceSocketEvent(SocketDiagnosticsEventType.Close);
		this._socket.close();
		this._socket.removeEventListener('message', this._socketMessageListener);
		this.dispose();
	}
}

const defaultWebSocketFactory = new class implements IWebSocketFactory {
	create(url: string, debugLabel: string): IWebSocket {
		return new BrowserWebSocket(url, debugLabel);
	}
};

class BrowserSocket implements ISocket {

	public readonly socket: IWebSocket;
	public readonly debugLabel: string;

	public traceSocketEvent(type: SocketDiagnosticsEventType, data?: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView | any): void {
		if (typeof this.socket.traceSocketEvent === 'function') {
			this.socket.traceSocketEvent(type, data);
		} else {
			SocketDiagnostics.traceSocketEvent(this.socket, this.debugLabel, type, data);
		}
	}

	constructor(socket: IWebSocket, debugLabel: string) {
		this.socket = socket;
		this.debugLabel = debugLabel;
	}

	public dispose(): void {
		this.socket.close();
	}

	public onData(listener: (e: VSBuffer) => void): IDisposable {
		return this.socket.onData((data) => listener(VSBuffer.wrap(new Uint8Array(data))));
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
		return this.socket.onClose(adapter);
	}

	public onEnd(listener: () => void): IDisposable {
		return Disposable.None;
	}

	public write(buffer: VSBuffer): void {
		this.socket.send(buffer.buffer);
	}

	public end(): void {
		this.socket.close();
	}

	public drain(): Promise<void> {
		return Promise.resolve();
	}
}


export class BrowserSocketFactory implements ISocketFactory<RemoteConnectionType.WebSocket> {

	private readonly _webSocketFactory: IWebSocketFactory;

	constructor(webSocketFactory: IWebSocketFactory | null | undefined) {
		this._webSocketFactory = webSocketFactory || defaultWebSocketFactory;
	}

	supports(connectTo: WebSocketRemoteConnection): boolean {
		return true;
	}

	connect({ host, port }: WebSocketRemoteConnection, path: string, query: string, debugLabel: string): Promise<ISocket> {
		return new Promise<ISocket>((resolve, reject) => {
			const webSocketSchema = (/^https:/.test(mainWindow.location.href) ? 'wss' : 'ws');
			const socket = this._webSocketFactory.create(`${webSocketSchema}://${(/:/.test(host) && !/\[/.test(host)) ? `[${host}]` : host}:${port}${path}?${query}&skipWebSocketFrames=false`, debugLabel);
			const errorListener = socket.onError(reject);
			socket.onOpen(() => {
				errorListener.dispose();
				resolve(new BrowserSocket(socket, debugLabel));
			});
		});
	}
}
