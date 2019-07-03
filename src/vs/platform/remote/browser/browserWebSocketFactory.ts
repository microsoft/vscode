/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWebSocketFactory, IConnectCallback } from 'vs/platform/remote/common/remoteAgentConnection';
import { ISocket } from 'vs/base/parts/ipc/common/ipc.net';
import { VSBuffer } from 'vs/base/common/buffer';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';

class BrowserSocket implements ISocket {
	public readonly socket: WebSocket;

	constructor(socket: WebSocket) {
		this.socket = socket;
	}

	public dispose(): void {
		this.socket.close();
	}

	public onData(_listener: (e: VSBuffer) => void): IDisposable {
		const fileReader = new FileReader();
		const queue: Blob[] = [];
		let isReading = false;
		fileReader.onload = function (event) {
			isReading = false;
			const buff = <ArrayBuffer>(<any>event.target).result;

			try {
				_listener(VSBuffer.wrap(new Uint8Array(buff)));
			} catch (err) {
				onUnexpectedError(err);
			}

			if (queue.length > 0) {
				enqueue(queue.shift()!);
			}
		};
		const enqueue = (blob: Blob) => {
			if (isReading) {
				queue.push(blob);
				return;
			}
			isReading = true;
			fileReader.readAsArrayBuffer(blob);
		};
		const listener = (e: MessageEvent) => {
			enqueue(<Blob>e.data);
		};
		this.socket.addEventListener('message', listener);
		return {
			dispose: () => this.socket.removeEventListener('message', listener)
		};
	}

	public onClose(listener: () => void): IDisposable {
		this.socket.addEventListener('close', listener);
		return {
			dispose: () => this.socket.removeEventListener('close', listener)
		};
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

export const browserWebSocketFactory = new class implements IWebSocketFactory {
	connect(host: string, port: number, query: string, callback: IConnectCallback): void {
		const errorListener = (err: any) => callback(err, undefined);
		const socket = new WebSocket(`ws://${host}:${port}/?${query}&skipWebSocketFrames=false`);
		socket.onopen = function (event) {
			socket.removeEventListener('error', errorListener);
			callback(undefined, new BrowserSocket(socket));
		};
		socket.addEventListener('error', errorListener);
	}
};
