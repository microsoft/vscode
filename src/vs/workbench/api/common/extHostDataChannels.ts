/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ExtHostDataChannelsShape } from './extHost.protocol.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export interface IExtHostDataChannels extends ExtHostDataChannelsShape {
	readonly _serviceBrand: undefined;
	createDataChannel<T>(extension: IExtensionDescription, channelId: string): vscode.DataChannel<T>;
}

export const IExtHostDataChannels = createDecorator<IExtHostDataChannels>('IExtHostDataChannels');

export class ExtHostDataChannels implements IExtHostDataChannels {
	declare readonly _serviceBrand: undefined;

	private readonly _channels = new Map<string, DataChannelImpl<any>>();

	constructor() {
	}

	createDataChannel<T>(extension: IExtensionDescription, channelId: string): vscode.DataChannel<T> {
		checkProposedApiEnabled(extension, 'dataChannels');

		let channel = this._channels.get(channelId);
		if (!channel) {
			channel = new DataChannelImpl<T>(channelId);
			this._channels.set(channelId, channel);
		}
		return channel;
	}

	$onDidReceiveData(channelId: string, data: any): void {
		const channel = this._channels.get(channelId);
		if (channel) {
			channel._fireDidReceiveData(data);
		}
	}
}

class DataChannelImpl<T> extends Disposable implements vscode.DataChannel<T> {
	private readonly _onDidReceiveData = new Emitter<vscode.DataChannelEvent<T>>();
	public readonly onDidReceiveData: Event<vscode.DataChannelEvent<T>> = this._onDidReceiveData.event;

	constructor(private readonly channelId: string) {
		super();
		this._register(this._onDidReceiveData);
	}

	_fireDidReceiveData(data: T): void {
		this._onDidReceiveData.fire({ data });
	}

	override toString(): string {
		return `DataChannel(${this.channelId})`;
	}
}
