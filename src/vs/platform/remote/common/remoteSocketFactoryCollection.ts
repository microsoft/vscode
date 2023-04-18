/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFind } from 'vs/base/common/arrays';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ISocketFactory } from 'vs/platform/remote/common/remoteAgentConnection';
import { MessagePassingOfType, MessagePassingType, ResolvedAuthorityMessagePassing } from 'vs/platform/remote/common/remoteAuthorityResolver';

export const IRemoteSocketFactoryCollection = createDecorator<IRemoteSocketFactoryCollection>('remoteSocketFactoryCollection');

export interface IRemoteSocketFactoryCollection {
	readonly _serviceBrand: undefined;

	/**
	 * Register a socket factory for the given message passing type
	 * @param type passing type to register for
	 * @param factory function that returns the socket factory, or undefined if
	 * it can't handle the data.
	 */
	register<T extends MessagePassingType>(
		type: T,
		factory: (messagePassing: MessagePassingOfType<T>) => ISocketFactory<MessagePassingOfType<T>> | undefined
	): void;

	/**
	 * Gets a socket factory for the given message passing data.
	 */
	create<T extends ResolvedAuthorityMessagePassing>(messagePassing: T): ISocketFactory<T> | undefined;
}

export class RemoteSocketFactoryCollection implements IRemoteSocketFactoryCollection {
	declare readonly _serviceBrand: undefined;

	private readonly factories: { [T in MessagePassingType]?: ((messagePassing: MessagePassingOfType<T>) => ISocketFactory<MessagePassingOfType<T>> | undefined)[] } = {};


	public register<T extends MessagePassingType>(
		type: T,
		factory: (messagePassing: MessagePassingOfType<T>) => ISocketFactory<MessagePassingOfType<T>> | undefined
	): void {
		this.factories[type] ??= [];
		this.factories[type]!.push(factory);
	}

	public create<T extends ResolvedAuthorityMessagePassing>(messagePassing: T): ISocketFactory<T> | undefined {
		return mapFind(
			(this.factories[messagePassing.type] || []) as ((messagePassing: T) => ISocketFactory<T> | undefined)[],
			factory => factory(messagePassing),
		);
	}
}
