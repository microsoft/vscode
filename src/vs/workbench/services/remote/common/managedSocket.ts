/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ISocket, SocketCloseEvent, SocketDiagnostics, SocketDiagnosticsEventType } from 'vs/base/parts/ipc/common/ipc.net';
import { makeRawSocketHeaders, socketRawEndHeaderSequence } from 'vs/platform/remote/common/managedSocket';
import { IExtensionHostProxy } from 'vs/workbench/services/extensions/common/extensionHostProxy';

export class ManagedSocket extends Disposable implements ISocket {
	public static connect(
		socketId: number,
		proxy: IExtensionHostProxy,
		path: string, query: string, debugLabel: string,

		half: {
			onClose: Emitter<SocketCloseEvent>;
			onData: Emitter<VSBuffer>;
			onEnd: Emitter<void>;
		}
	): Promise<ManagedSocket> {
		const socket = new ManagedSocket(socketId, proxy, debugLabel, half.onClose, half.onData, half.onEnd);

		socket.write(VSBuffer.fromString(makeRawSocketHeaders(path, query, debugLabel)));

		const d = new DisposableStore();
		return new Promise<ManagedSocket>((resolve, reject) => {
			d.add(socket.onData(d => {
				if (d.indexOf(socketRawEndHeaderSequence) !== -1) {
					resolve(socket);
				}
			}));

			d.add(socket.onClose(err => reject(err ?? new Error('socket closed'))));
			d.add(socket.onEnd(() => reject(new Error('socket ended'))));
		}).finally(() => d.dispose());
	}

	public onData: Event<VSBuffer>;
	public onClose: Event<SocketCloseEvent>;
	public onEnd: Event<void>;

	private readonly didDisposeEmitter = this._register(new Emitter<void>());
	public onDidDispose = this.didDisposeEmitter.event;

	private ended = false;

	private constructor(
		private readonly socketId: number,
		private readonly proxy: IExtensionHostProxy,
		private readonly debugLabel: string,
		onCloseEmitter: Emitter<SocketCloseEvent>,
		onDataEmitter: Emitter<VSBuffer>,
		onEndEmitter: Emitter<void>,
	) {
		super();
		this.onClose = this._register(onCloseEmitter).event;
		this.onData = this._register(onDataEmitter).event;
		this.onEnd = this._register(onEndEmitter).event;
	}

	write(buffer: VSBuffer): void {
		this.proxy.remoteSocketWrite(this.socketId, buffer);
	}

	end(): void {
		this.ended = true;
		this.proxy.remoteSocketEnd(this.socketId);
	}

	drain(): Promise<void> {
		return this.proxy.remoteSocketDrain(this.socketId);
	}

	traceSocketEvent(type: SocketDiagnosticsEventType, data?: any): void {
		SocketDiagnostics.traceSocketEvent(this, this.debugLabel, type, data);
	}

	override dispose(): void {
		if (!this.ended) {
			this.proxy.remoteSocketEnd(this.socketId);
		}

		this.didDisposeEmitter.fire();
		super.dispose();
	}
}

