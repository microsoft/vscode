/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the MIT License. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IDataChannelService = createDecorator<IDataChannelService>('dataChannelService');

export interface IDataChannelEvent {
	channel: CoreDataChannel;
	data: any;
}

export enum CoreDataChannel {
	Console = 'console',
	Variables = 'variables',
	Output = 'output'
}

export interface IDataChannelService {
	readonly _serviceBrand: undefined;
	readonly onDidSendData: Event<IDataChannelEvent>;
	sendData(channel: CoreDataChannel, data: any): void;
}


