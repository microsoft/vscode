/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IBroadcastService = createDecorator<IBroadcastService>('broadcastService');

export interface IBroadcast {
	channel: string;
	payload: any;
}

export interface IBroadcastService {
	_serviceBrand: any;

	onBroadcast: Event<IBroadcast>;

	broadcast(b: IBroadcast): void;
}

export class SimpleBroadcastService implements IBroadcastService {

	_serviceBrand: any;

	onBroadcast: Event<IBroadcast> = Event.None;

	broadcast(b: IBroadcast): void { }
}

registerSingleton(IBroadcastService, SimpleBroadcastService, true);