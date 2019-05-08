/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';

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

export class NullBroadcastService implements IBroadcastService {
	_serviceBrand: any;
	onBroadcast: Event<IBroadcast> = Event.None;
	broadcast(_b: IBroadcast): void {

	}
}
