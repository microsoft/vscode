/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IDataChannelService = createDecorator<IDataChannelService>('dataChannelService');

export interface IDataChannelService {
	readonly _serviceBrand: undefined;

	readonly onDidSendData: Event<IDataChannelEvent>;

	getDataChannel<T>(channelId: string): CoreDataChannel<T>;
}

export interface CoreDataChannel<T = unknown> {
	sendData(data: T): void;
}

export interface IDataChannelEvent<T = unknown> {
	channelId: string;
	data: T;
}

export const IDataWatcherService = createDecorator<IDataWatcherService>('dataWatcherService');

export const enum DataWatcherKind {
	AgentSession = 'agentSession',
}

export interface IAgentSessionDataWatcherParams {
	readonly kind: DataWatcherKind.AgentSession;
	readonly resource: URI;
}

export type IDataWatcherParams =
	| IAgentSessionDataWatcherParams;

export interface IDataWatcher<T = unknown> extends IDisposable {
	readonly data: IObservable<T | undefined>;
}

export interface IDataWatcherProvider {
	createDataWatcher(params: IDataWatcherParams): IDataWatcher | undefined;
}

export interface IDataWatcherService {
	readonly _serviceBrand: undefined;

	registerDataWatcherProvider(kind: DataWatcherKind, provider: IDataWatcherProvider): IDisposable;
	createDataWatcher(params: IDataWatcherParams): IDataWatcher | undefined;
}

export class NullDataChannelService implements IDataChannelService {
	_serviceBrand: undefined;
	get onDidSendData(): Event<IDataChannelEvent<unknown>> {
		return Event.None;
	}
	getDataChannel<T>(_channelId: string): CoreDataChannel<T> {
		return {
			sendData: () => { },
		};
	}
}
