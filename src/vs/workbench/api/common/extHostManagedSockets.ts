/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostManagedSocketsShape, MainContext, MainThreadManagedSocketsShape } from 'vs/workbench/api/common/extHost.protocol';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import * as vscode from 'vscode';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { VSBuffer } from 'vs/base/common/buffer';

export interface IExtHostManagedSockets extends ExtHostManagedSocketsShape {
	setFactory(socketFactoryId: number, makeConnection: () => Thenable<vscode.ManagedMessagePassing>): void;
	readonly _serviceBrand: undefined;
}

export const IExtHostManagedSockets = createDecorator<IExtHostManagedSockets>('IExtHostManagedSockets');

export class ExtHostManagedSockets implements IExtHostManagedSockets {
	declare readonly _serviceBrand: undefined;

	private readonly _proxy: MainThreadManagedSocketsShape;
	private _remoteSocketIdCounter = 0;
	private _factory: ManagedSocketFactory | null = null;
	private readonly _managedRemoteSockets: Map<number, ManagedSocket> = new Map();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadManagedSockets);
	}

	setFactory(socketFactoryId: number, makeConnection: () => Thenable<vscode.ManagedMessagePassing>): void {
		// Terminate all previous sockets
		for (const socket of this._managedRemoteSockets.values()) {
			// calling dispose() will lead to it removing itself from the map
			socket.dispose();
		}
		// Unregister previous factory
		if (this._factory) {
			this._proxy.$unregisterSocketFactory(this._factory.socketFactoryId);
		}

		this._factory = new ManagedSocketFactory(socketFactoryId, makeConnection);
		this._proxy.$registerSocketFactory(this._factory.socketFactoryId);
	}

	async $openRemoteSocket(socketFactoryId: number): Promise<number> {
		if (!this._factory || this._factory.socketFactoryId !== socketFactoryId) {
			throw new Error(`No socket factory with id ${socketFactoryId}`);
		}

		const id = (++this._remoteSocketIdCounter);
		const socket = await this._factory.makeConnection();
		const disposable = new DisposableStore();
		this._managedRemoteSockets.set(id, new ManagedSocket(id, socket, disposable));

		disposable.add(toDisposable(() => this._managedRemoteSockets.delete(id)));
		disposable.add(socket.onDidEnd(() => {
			this._proxy.$onDidManagedSocketEnd(id);
			disposable.dispose();
		}));
		disposable.add(socket.onDidClose(e => {
			this._proxy.$onDidManagedSocketClose(id, e?.stack ?? e?.message);
			disposable.dispose();
		}));
		disposable.add(socket.onDidReceiveMessage(e => this._proxy.$onDidManagedSocketHaveData(id, VSBuffer.wrap(e))));

		return id;
	}

	$remoteSocketWrite(socketId: number, buffer: VSBuffer): void {
		this._managedRemoteSockets.get(socketId)?.actual.send(buffer.buffer);
	}

	$remoteSocketEnd(socketId: number): void {
		const socket = this._managedRemoteSockets.get(socketId);
		if (socket) {
			socket.actual.end();
			socket.dispose();
		}
	}

	async $remoteSocketDrain(socketId: number): Promise<void> {
		await this._managedRemoteSockets.get(socketId)?.actual.drain?.();
	}
}

class ManagedSocketFactory {
	constructor(
		public readonly socketFactoryId: number,
		public readonly makeConnection: () => Thenable<vscode.ManagedMessagePassing>,
	) { }
}

class ManagedSocket extends Disposable {
	constructor(
		public readonly socketId: number,
		public readonly actual: vscode.ManagedMessagePassing,
		disposer: DisposableStore,
	) {
		super();
		this._register(disposer);
	}
}
