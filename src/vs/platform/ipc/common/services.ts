/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IMainProcessService = createDecorator<IMainProcessService>('mainProcessService');

export interface IMainProcessService {
	readonly _serviceBrand: undefined;
	getChannel(channelName: string): IChannel;
	registerChannel(channelName: string, channel: IServerChannel<string>): void;
}

export const ISharedProcessService = createDecorator<ISharedProcessService>('sharedProcessService');

export interface ISharedProcessService {
	readonly _serviceBrand: undefined;
	getChannel(channelName: string): IChannel;
	registerChannel(channelName: string, channel: IServerChannel<string>): void;
}
