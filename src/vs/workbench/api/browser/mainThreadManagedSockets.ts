/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, ExtHostContext, MainThreadManagedSocketsShape, ExtHostManagedSocketsShape } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ManagedRemoteConnection, RemoteConnectionType } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { VSBuffer } from 'vs/base/common/buffer';
import { IRemoteSocketFactoryService, ISocketFactory } from 'vs/platform/remote/common/remoteSocketFactoryService';
import { ISocket, SocketCloseEvent, SocketCloseEventType, SocketDiagnostics, SocketDiagnosticsEventType } from 'vs/base/parts/ipc/common/ipc.net';
import { Emitter, Event, PauseableEmitter } from 'vs/base/common/event';
import { makeRawSocketHeaders, socketRawEndHeaderSequence } from 'vs/platform/remote/common/managedSocket';

@extHostNamedCustomer(MainContext.MainThreadManagedSockets)
export class MainThreadManagedSockets extends Disposable implements MainThreadManagedSocketsShape {

	private readonly _proxy: ExtHostManagedSocketsShape;
	private readonly _registrations = new Map<number, IDisposable>();
	private readonly _remoteSockets = new Map<number, RemoteSocketHalf>();

	constructor(
		extHostContext: IExtHostContext,
		@IRemoteSocketFactoryService private readonly _remoteSocketFactoryService: IRemoteSocketFactoryService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostManagedSockets);
	}

	async $registerSocketFactory(socketFactoryId: number): Promise<void> {
		const that = this;
		const socketFactory = new class implements ISocketFactory<RemoteConnectionType.Managed> {

			supports(connectTo: ManagedRemoteConnection): boolean {
				return (connectTo.id === socketFactoryId);
			}

			connect(connectTo: ManagedRemoteConnection, path: string, query: string, debugLabel: string): Promise<ISocket> {
				return new Promise<ISocket>((resolve, reject) => {
					if (connectTo.id !== socketFactoryId) {
						return reject(new Error('Invalid connectTo'));
					}

					const factoryId = connectTo.id;
					that._proxy.$openRemoteSocket(factoryId).then(socketId => {
						const half: RemoteSocketHalf = {
							onClose: new Emitter(),
							onData: new Emitter(),
							onEnd: new Emitter(),
						};
						that._remoteSockets.set(socketId, half);

						ManagedSocket.connect(socketId, that._proxy, path, query, debugLabel, half)
							.then(
								socket => {
									socket.onDidDispose(() => that._remoteSockets.delete(socketId));
									resolve(socket);
								},
								err => {
									that._remoteSockets.delete(socketId);
									reject(err);
								});
					}).catch(reject);
				});
			}
		};
		this._registrations.set(socketFactoryId, this._remoteSocketFactoryService.register(RemoteConnectionType.Managed, socketFactory));

	}

	async $unregisterSocketFactory(socketFactoryId: number): Promise<void> {
		this._registrations.get(socketFactoryId)?.dispose();
	}

	$onDidManagedSocketHaveData(socketId: number, data: VSBuffer): void {
		this._remoteSockets.get(socketId)?.onData.fire(data);
	}

	$onDidManagedSocketClose(socketId: number, error: string | undefined): void {
		this._remoteSockets.get(socketId)?.onClose.fire({
			type: SocketCloseEventType.NodeSocketCloseEvent,
			error: error ? new Error(error) : undefined,
			hadError: !!error
		});
		this._remoteSockets.delete(socketId);
	}

	$onDidManagedSocketEnd(socketId: number): void {
		this._remoteSockets.get(socketId)?.onEnd.fire();
	}
}

export interface RemoteSocketHalf {
	onData: Emitter<VSBuffer>;
	onClose: Emitter<SocketCloseEvent>;
	onEnd: Emitter<void>;
}

export class ManagedSocket extends Disposable implements ISocket {
	public static connect(
		socketId: number,
		proxy: ExtHostManagedSocketsShape,
		path: string, query: string, debugLabel: string,

		half: RemoteSocketHalf
	): Promise<ManagedSocket> {
		const socket = new ManagedSocket(socketId, proxy, debugLabel, half.onClose, half.onData, half.onEnd);

		socket.write(VSBuffer.fromString(makeRawSocketHeaders(path, query, debugLabel)));

		const d = new DisposableStore();
		return new Promise<ManagedSocket>((resolve, reject) => {
			let dataSoFar: VSBuffer | undefined;
			d.add(socket.onData(d => {
				if (!dataSoFar) {
					dataSoFar = d;
				} else {
					dataSoFar = VSBuffer.concat([dataSoFar, d], dataSoFar.byteLength + d.byteLength);
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
		}).finally(() => d.dispose());
	}

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

	private constructor(
		private readonly socketId: number,
		private readonly proxy: ExtHostManagedSocketsShape,
		private readonly debugLabel: string,
		onCloseEmitter: Emitter<SocketCloseEvent>,
		onDataEmitter: Emitter<VSBuffer>,
		onEndEmitter: Emitter<void>,
	) {
		super();

		this._register(onDataEmitter);
		this._register(onDataEmitter.event(data => this.pausableDataEmitter.fire(data)));

		this.onClose = this._register(onCloseEmitter).event;
		this.onEnd = this._register(onEndEmitter).event;
	}

	/** Pauses data events until a new listener comes in onData() */
	pauseData() {
		this.pausableDataEmitter.pause();
	}

	write(buffer: VSBuffer): void {
		this.proxy.$remoteSocketWrite(this.socketId, buffer);
	}

	end(): void {
		this.ended = true;
		this.proxy.$remoteSocketEnd(this.socketId);
	}

	drain(): Promise<void> {
		return this.proxy.$remoteSocketDrain(this.socketId);
	}

	traceSocketEvent(type: SocketDiagnosticsEventType, data?: any): void {
		SocketDiagnostics.traceSocketEvent(this, this.debugLabel, type, data);
	}

	override dispose(): void {
		if (!this.ended) {
			this.proxy.$remoteSocketEnd(this.socketId);
		}

		this.didDisposeEmitter.fire();
		super.dispose();
	}
}
