/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { ISocket, SocketCloseEventType } from '../../../base/parts/ipc/common/ipc.net.js';
import { ManagedSocket, RemoteSocketHalf, connectManagedSocket } from '../../../platform/remote/common/managedSocket.js';
import { ManagedRemoteConnection, RemoteConnectionType } from '../../../platform/remote/common/remoteAuthorityResolver.js';
import { IRemoteSocketFactoryService, ISocketFactory } from '../../../platform/remote/common/remoteSocketFactoryService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostManagedSocketsShape, MainContext, MainThreadManagedSocketsShape } from '../common/extHost.protocol.js';

function disposeSocketHalf(half: RemoteSocketHalf): void {
	half.onData.dispose();
	half.onClose.dispose();
	half.onEnd.dispose();
}

@extHostNamedCustomer(MainContext.MainThreadManagedSockets)
export class MainThreadManagedSockets extends Disposable implements MainThreadManagedSocketsShape {

	private readonly _proxy: ExtHostManagedSocketsShape;
	private readonly _registrations = this._register(new DisposableMap<number>());
	private readonly _remoteSockets = new Map<number, RemoteSocketHalf>();

	constructor(
		extHostContext: IExtHostContext,
		@IRemoteSocketFactoryService private readonly _remoteSocketFactoryService: IRemoteSocketFactoryService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostManagedSockets);
	}

	override dispose(): void {
		// Dispose all remaining socket half emitters to prevent leaks
		for (const half of this._remoteSockets.values()) {
			disposeSocketHalf(half);
		}
		this._remoteSockets.clear();
		super.dispose();
	}

	async $registerSocketFactory(socketFactoryId: number): Promise<void> {
		const that = this;
		const store = new DisposableStore();
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

						MainThreadManagedSocket.connect(socketId, that._proxy, path, query, debugLabel, half)
							.then(
								socket => {
									store.add(Event.once(socket.onDidDispose)(() => {
										that._remoteSockets.delete(socketId);
										// Note: the ManagedSocket base class registers and disposes half emitters,
										// so we don't need to dispose them here on successful connection.
									}));
									resolve(socket);
								},
								err => {
									that._remoteSockets.delete(socketId);
									disposeSocketHalf(half);
									reject(err);
								});
					}).catch(reject);
				});
			}
		};
		store.add(this._remoteSocketFactoryService.register(RemoteConnectionType.Managed, socketFactory));
		this._registrations.set(socketFactoryId, store);

	}

	async $unregisterSocketFactory(socketFactoryId: number): Promise<void> {
		this._registrations.deleteAndDispose(socketFactoryId);
	}

	$onDidManagedSocketHaveData(socketId: number, data: VSBuffer): void {
		this._remoteSockets.get(socketId)?.onData.fire(data);
	}

	$onDidManagedSocketClose(socketId: number, error: string | undefined): void {
		const half = this._remoteSockets.get(socketId);
		if (half) {
			half.onClose.fire({
				type: SocketCloseEventType.NodeSocketCloseEvent,
				error: error ? new Error(error) : undefined,
				hadError: !!error
			});
			this._remoteSockets.delete(socketId);
		}
	}

	$onDidManagedSocketEnd(socketId: number): void {
		this._remoteSockets.get(socketId)?.onEnd.fire();
	}
}

export class MainThreadManagedSocket extends ManagedSocket {
	public static connect(
		socketId: number,
		proxy: ExtHostManagedSocketsShape,
		path: string, query: string, debugLabel: string,
		half: RemoteSocketHalf
	): Promise<MainThreadManagedSocket> {
		const socket = new MainThreadManagedSocket(socketId, proxy, debugLabel, half);
		return connectManagedSocket(socket, path, query, debugLabel, half);
	}

	private constructor(
		private readonly socketId: number,
		private readonly proxy: ExtHostManagedSocketsShape,
		debugLabel: string,
		half: RemoteSocketHalf,
	) {
		super(debugLabel, half);
	}

	public override write(buffer: VSBuffer): void {
		this.proxy.$remoteSocketWrite(this.socketId, buffer);
	}

	protected override closeRemote(): void {
		this.proxy.$remoteSocketEnd(this.socketId);
	}

	public override drain(): Promise<void> {
		return this.proxy.$remoteSocketDrain(this.socketId);
	}
}
