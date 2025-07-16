/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

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
