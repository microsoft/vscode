/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ISocket } from 'vs/base/parts/ipc/common/ipc.net';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { RemoteConnectionOfType, RemoteConnectionType, RemoteConnection } from 'vs/platform/remote/common/remoteAuthorityResolver';

export const IRemoteSocketFactoryService = createDecorator<IRemoteSocketFactoryService>('remoteSocketFactoryService');

export interface IRemoteSocketFactoryService {
	readonly _serviceBrand: undefined;

	/**
	 * Register a socket factory for the given message passing type
	 * @param type passing type to register for
	 * @param factory function that returns the socket factory, or undefined if
	 * it can't handle the data.
	 */
	register<T extends RemoteConnectionType>(type: T, factory: ISocketFactory<T>): IDisposable;

	connect(connectTo: RemoteConnection, path: string, query: string, debugLabel: string): Promise<ISocket>;
}

export interface ISocketFactory<T extends RemoteConnectionType> {
	supports(connectTo: RemoteConnectionOfType<T>): boolean;
	connect(connectTo: RemoteConnectionOfType<T>, path: string, query: string, debugLabel: string): Promise<ISocket>;
}

export class RemoteSocketFactoryService implements IRemoteSocketFactoryService {
	declare readonly _serviceBrand: undefined;

	private readonly factories: { [T in RemoteConnectionType]?: ISocketFactory<T>[] } = {};

	public register<T extends RemoteConnectionType>(type: T, factory: ISocketFactory<T>): IDisposable {
		this.factories[type] ??= [];
		this.factories[type]!.push(factory);
		return toDisposable(() => {
			const idx = this.factories[type]?.indexOf(factory);
			if (typeof idx === 'number' && idx >= 0) {
				this.factories[type]?.splice(idx, 1);
			}
		});
	}

	private getSocketFactory<T extends RemoteConnectionType>(messagePassing: RemoteConnectionOfType<T>): ISocketFactory<T> | undefined {
		const factories = (this.factories[messagePassing.type] || []) as ISocketFactory<T>[];
		return factories.find(factory => factory.supports(messagePassing));
	}

	public connect(connectTo: RemoteConnection, path: string, query: string, debugLabel: string): Promise<ISocket> {
		const socketFactory = this.getSocketFactory(connectTo);
		if (!socketFactory) {
			throw new Error(`No socket factory found for ${connectTo}`);
		}
		return socketFactory.connect(connectTo, path, query, debugLabel);
	}
}
