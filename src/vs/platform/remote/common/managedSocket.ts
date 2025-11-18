/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, encodeBase64 } from '../../../base/common/buffer.js';
import { Emitter, Event, PauseableEmitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ISocket, SocketCloseEvent, SocketDiagnostics, SocketDiagnosticsEventType } from '../../../base/parts/ipc/common/ipc.net.js';

export const makeRawSocketHeaders = (path: string, query: string, deubgLabel: string) => {
	// https://tools.ietf.org/html/rfc6455#section-4
	const buffer = new Uint8Array(16);
	for (let i = 0; i < 16; i++) {
		buffer[i] = Math.round(Math.random() * 256);
	}
	const nonce = encodeBase64(VSBuffer.wrap(buffer));

	const headers = [
		`GET ws://localhost${path}?${query}&skipWebSocketFrames=true HTTP/1.1`,
		`Connection: Upgrade`,
		`Upgrade: websocket`,
		`Sec-WebSocket-Key: ${nonce}`
	];

	return headers.join('\r\n') + '\r\n\r\n';
};

export const socketRawEndHeaderSequence = VSBuffer.fromString('\r\n\r\n');

export interface RemoteSocketHalf {
	onData: Emitter<VSBuffer>;
	onClose: Emitter<SocketCloseEvent>;
	onEnd: Emitter<void>;
}

/** Should be called immediately after making a ManagedSocket to make it ready for data flow. */
export async function connectManagedSocket<T extends ManagedSocket>(
	socket: T,
	path: string, query: string, debugLabel: string,
	half: RemoteSocketHalf
): Promise<T> {
	socket.write(VSBuffer.fromString(makeRawSocketHeaders(path, query, debugLabel)));

	const d = new DisposableStore();
	try {
		return await new Promise<T>((resolve, reject) => {
			let dataSoFar: VSBuffer | undefined;
			d.add(socket.onData(d_1 => {
				if (!dataSoFar) {
					dataSoFar = d_1;
				} else {
					dataSoFar = VSBuffer.concat([dataSoFar, d_1], dataSoFar.byteLength + d_1.byteLength);
				}

				const index = dataSoFar.indexOf(socketRawEndHeaderSequence);
				if (index === -1) {
					return;
				}

				resolve(socket);
				// pause data events until the socket consumer is hooked up. We may
				// immediately emit remaining data, but if not there may still be
				// microtasks queued which would fire data into the abyss.
				socket.pauseData();

				const rest = dataSoFar.slice(index + socketRawEndHeaderSequence.byteLength);
				if (rest.byteLength) {
					half.onData.fire(rest);
				}
			}));

			d.add(socket.onClose(err => reject(err ?? new Error('socket closed'))));
			d.add(socket.onEnd(() => reject(new Error('socket ended'))));
		});
	} catch (e) {
		socket.dispose();
		throw e;
	} finally {
		d.dispose();
	}
}

export abstract class ManagedSocket extends Disposable implements ISocket {
	private readonly pausableDataEmitter = this._register(new PauseableEmitter<VSBuffer>());

	public onData: Event<VSBuffer> = (...args) => {
		if (this.pausableDataEmitter.isPaused) {
			queueMicrotask(() => this.pausableDataEmitter.resume());
		}
		return this.pausableDataEmitter.event(...args);
	};
	public onClose: Event<SocketCloseEvent>;
	public onEnd: Event<void>;

	private readonly didDisposeEmitter = this._register(new Emitter<void>());
	public onDidDispose = this.didDisposeEmitter.event;

	private ended = false;

	protected constructor(
		private readonly debugLabel: string,
		half: RemoteSocketHalf,
	) {
		super();

		this._register(half.onData);
		this._register(half.onData.event(data => this.pausableDataEmitter.fire(data)));

		this.onClose = this._register(half.onClose).event;
		this.onEnd = this._register(half.onEnd).event;
	}

	/** Pauses data events until a new listener comes in onData() */
	public pauseData() {
		this.pausableDataEmitter.pause();
	}

	/** Flushes data to the socket. */
	public drain(): Promise<void> {
		return Promise.resolve();
	}

	/** Ends the remote socket. */
	public end(): void {
		this.ended = true;
		this.closeRemote();
	}

	public abstract write(buffer: VSBuffer): void;
	protected abstract closeRemote(): void;

	traceSocketEvent(type: SocketDiagnosticsEventType, data?: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView | unknown): void {
		SocketDiagnostics.traceSocketEvent(this, this.debugLabel, type, data);
	}

	override dispose(): void {
		if (!this.ended) {
			this.closeRemote();
		}

		this.didDisposeEmitter.fire();
		super.dispose();
	}
}
