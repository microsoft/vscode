/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISocketFactory, IConnectCallback } from 'vs/platform/remote/common/remoteAgentConnection';
import { ISocket } from 'vs/base/parts/ipc/common/ipc.net';
import { VSBuffer } from 'vs/base/common/buffer';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';

export interface IWebSocketFactory {
	create(url: string): IWebSocket;
}

export interface IWebSocket {
	readonly onData: Event<ArrayBuffer>;
	readonly onOpen: Event<void>;
	readonly onClose: Event<void>;
	readonly onError: Event<any>;

	send(data: ArrayBuffer | ArrayBufferView): void;
	close(): void;
}

class BrowserWebSocket implements IWebSocket {

	private readonly _onData = new Emitter<ArrayBuffer>();
	public readonly onData = this._onData.event;

	public readonly onOpen: Event<void>;
	public readonly onClose: Event<void>;
	public readonly onError: Event<any>;

	private readonly _socket: WebSocket;
	private readonly _fileReader: FileReader;
	private readonly _queue: Blob[];
	private _isReading: boolean;

	private readonly _socketMessageListener: (ev: MessageEvent) => void;

	constructor(socket: WebSocket) {
		this._socket = socket;
		this._fileReader = new FileReader();
		this._queue = [];
		this._isReading = false;

		this._fileReader.onload = (event) => {
			this._isReading = false;
			const buff = <ArrayBuffer>(<any>event.target).result;

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
			enqueue(<Blob>ev.data);
		};
		this._socket.addEventListener('message', this._socketMessageListener);

		this.onOpen = Event.fromDOMEventEmitter(this._socket, 'open');
		this.onClose = Event.fromDOMEventEmitter(this._socket, 'close');
		this.onError = Event.fromDOMEventEmitter(this._socket, 'error');
	}

	send(data: ArrayBuffer | ArrayBufferView): void {
		this._socket.send(data);
	}

	close(): void {
		this._socket.close();
		this._socket.removeEventListener('message', this._socketMessageListener);
	}
}

export const defaultWebSocketFactory = new class implements IWebSocketFactory {
	create(url: string): IWebSocket {
		return new BrowserWebSocket(new WebSocket(url));
	}
};

class BrowserSocket implements ISocket {
	public readonly socket: IWebSocket;

	constructor(socket: IWebSocket) {
		this.socket = socket;
	}

	public dispose(): void {
		this.socket.close();
	}

	public onData(listener: (e: VSBuffer) => void): IDisposable {
		return this.socket.onData((data) => listener(VSBuffer.wrap(new Uint8Array(data))));
	}

	public onClose(listener: () => void): IDisposable {
		return this.socket.onClose(listener);
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

}


export class BrowserSocketFactory implements ISocketFactory {
	private readonly _webSocketFactory: IWebSocketFactory;

	constructor(webSocketFactory: IWebSocketFactory | null | undefined) {
		this._webSocketFactory = webSocketFactory || defaultWebSocketFactory;
	}

	connect(host: string, port: number, query: string, callback: IConnectCallback): void {
		const socket = this._webSocketFactory.create(`ws://${host}:${port}/?${query}&skipWebSocketFrames=false`);
		const errorListener = socket.onError((err) => callback(err, undefined));
		socket.onOpen(() => {
			errorListener.dispose();
			callback(undefined, new BrowserSocket(socket));
		});
	}
}



