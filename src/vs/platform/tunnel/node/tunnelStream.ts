/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Duplex } from 'stream';
import { VSBuffer } from '../../../base/common/buffer.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { ISocket, SocketCloseEventType } from '../../../base/parts/ipc/common/ipc.net.js';
import { NodeSocket } from '../../../base/parts/ipc/node/ipc.net.js';

/**
 * A connected tunnel to a destination, as consumed by the tunnel proxy:
 * a Node {@link Duplex} plus any destination bytes that were already
 * buffered while the tunnel was being established.
 */
export interface ITunnelStream {
	readonly stream: Duplex;
	readonly leftover: VSBuffer;
}

/**
 * Take ownership of a freshly connected remote-editor tunnel (a subset of
 * `PersistentProtocol`) as an {@link ITunnelStream}.
 *
 * - {@link NodeSocket}: unwrap the raw `net.Socket` so Node's native stream
 *   backpressure applies.
 * - Any other {@link ISocket} (managed / exec-server connection) is adapted
 *   to a {@link Duplex}.
 *
 * The protocol's buffered leftover is read and its reader detached
 * synchronously, so no message can be lost between the two.
 */
export function takeRemoteTunnelStream(protocol: { getSocket(): ISocket; readEntireBuffer(): VSBuffer; dispose(): void }): ITunnelStream {
	const socket = protocol.getSocket();
	const leftover = protocol.readEntireBuffer();
	if (socket instanceof NodeSocket) {
		// NodeSocket's 'error' listener routes every non-EPIPE error through
		// onUnexpectedError. When the upstream endpoint dies, every tunnel socket
		// is reset at once; that ECONNRESET is expected teardown, and the proxy
		// attaches its own 'error' handlers, so detach NodeSocket's listeners.
		const stream = socket.socket;
		socket.dispose(false);
		protocol.dispose();
		return { stream, leftover };
	}
	protocol.dispose();
	return { stream: new RemoteSocketStream(socket), leftover };
}

/**
 * A pull-based byte stream to a destination. `read` resolves `undefined` at
 * EOF. `write` resolves once the transport accepted the data (applying its
 * backpressure). `end` half-closes the outgoing direction.
 */
export interface ITunnelByteStream extends IDisposable {
	read(): Promise<VSBuffer | undefined>;
	write(data: VSBuffer): Promise<void>;
	end(): Promise<void>;
}

/**
 * Adapt a pull-based {@link ITunnelByteStream} to an {@link ITunnelStream}.
 * Reads are only issued while the Duplex has readable capacity, so a slow
 * consumer never causes unbounded buffering.
 */
export function createTunnelStream(connection: ITunnelByteStream): ITunnelStream {
	return { stream: new PullTunnelStream(connection), leftover: VSBuffer.alloc(0) };
}

/**
 * The keep-alive `http.Agent` pools tunnel sockets and calls net.Socket-only
 * transport knobs on them when parking or reusing a connection. Streams that
 * are not real sockets expose no-op shims so the agent can pool them.
 */
abstract class TunnelSocketStream extends Duplex {
	setKeepAlive(): this { return this; }
	setNoDelay(): this { return this; }
	setTimeout(): this { return this; }
	ref(): this { return this; }
	unref(): this { return this; }
}

/**
 * Adapts a generic {@link ISocket} (such as a managed / exec-server
 * connection, which has no underlying `net.Socket`) to a Node {@link Duplex}.
 */
class RemoteSocketStream extends TunnelSocketStream {

	private readonly _disposables = new DisposableStore();

	constructor(private readonly _socket: ISocket) {
		super();
		this._disposables.add(this._socket.onData(data => this.push(data.buffer)));
		this._disposables.add(this._socket.onEnd(() => this.push(null)));
		this._disposables.add(this._socket.onClose(e => {
			this.destroy(e?.type === SocketCloseEventType.NodeSocketCloseEvent ? e.error : undefined);
		}));
	}

	override _read(): void {
		// Data is delivered through the onData listener; nothing to pull here.
	}

	override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
		this._socket.write(VSBuffer.wrap(chunk));
		// Respect backpressure: defer completion until the socket has drained its
		// buffer so a fast producer cannot queue unbounded data on a slow managed /
		// exec-server transport.
		this._socket.drain().then(() => callback(), err => callback(err));
	}

	override _final(callback: (error?: Error | null) => void): void {
		this._socket.end();
		callback();
	}

	override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
		this._disposables.dispose();
		this._socket.dispose();
		callback(error);
	}
}

/** Adapts a pull-based {@link ITunnelByteStream} (such as an agent host TCP connection) to a Node {@link Duplex}. */
class PullTunnelStream extends TunnelSocketStream {

	private _reading = false;

	constructor(private readonly _connection: ITunnelByteStream) {
		super({ allowHalfOpen: true });
	}

	override _read(): void {
		if (!this._reading) {
			void this._pump();
		}
	}

	private async _pump(): Promise<void> {
		this._reading = true;
		try {
			while (!this.destroyed) {
				const data = await this._connection.read();
				if (this.destroyed) {
					return;
				}
				if (!data) {
					this.push(null);
					return;
				}
				if (!this.push(data.buffer)) {
					return;
				}
			}
		} catch (error) {
			this.destroy(error instanceof Error ? error : new Error(String(error)));
		} finally {
			this._reading = false;
		}
	}

	override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
		this._connection.write(VSBuffer.wrap(chunk)).then(() => callback(), error => callback(error));
	}

	override _final(callback: (error?: Error | null) => void): void {
		this._connection.end().then(() => callback(), error => callback(error));
	}

	override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
		this._connection.dispose();
		callback(error);
	}
}
