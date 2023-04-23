/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFind } from 'vs/base/common/arrays';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ISocketFactory } from 'vs/platform/remote/common/remoteAgentConnection';
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
	register<T extends RemoteConnectionType>(
		type: T,
		factory: (messagePassing: RemoteConnectionOfType<T>) => ISocketFactory<RemoteConnectionOfType<T>> | undefined
	): void;

	/**
	 * Gets a socket factory for the given message passing data.
	 */
	create<T extends RemoteConnection>(messagePassing: T): ISocketFactory<T> | undefined;
}

export class RemoteSocketFactoryService implements IRemoteSocketFactoryService {
	declare readonly _serviceBrand: undefined;

	private readonly factories: { [T in RemoteConnectionType]?: ((messagePassing: RemoteConnectionOfType<T>) => ISocketFactory<RemoteConnectionOfType<T>> | undefined)[] } = {};


	public register<T extends RemoteConnectionType>(
		type: T,
		factory: (messagePassing: RemoteConnectionOfType<T>) => ISocketFactory<RemoteConnectionOfType<T>> | undefined
	): void {
		this.factories[type] ??= [];
		this.factories[type]!.push(factory);
	}

	public create<T extends RemoteConnection>(messagePassing: T): ISocketFactory<T> | undefined {
		return mapFind(
			(this.factories[messagePassing.type] || []) as ((messagePassing: T) => ISocketFactory<T> | undefined)[],
			factory => factory(messagePassing),
		);
	}
}
