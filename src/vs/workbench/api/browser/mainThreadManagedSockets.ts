/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ISocket, SocketCloseEventType } from 'vs/base/parts/ipc/common/ipc.net';
import { ManagedSocket, RemoteSocketHalf, connectManagedSocket } from 'vs/platform/remote/common/managedSocket';
import { ManagedRemoteConnection, RemoteConnectionType } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRemoteSocketFactoryService, ISocketFactory } from 'vs/platform/remote/common/remoteSocketFactoryService';
import { ExtHostContext, ExtHostManagedSocketsShape, MainContext, MainThreadManagedSocketsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

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

						MainThreadManagedSocket.connect(socketId, that._proxy, path, query, debugLabel, half)
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

	protected override  closeRemote(): void {
		this.proxy.$remoteSocketEnd(this.socketId);
	}

	public override drain(): Promise<void> {
		return this.proxy.$remoteSocketDrain(this.socketId);
	}
}
