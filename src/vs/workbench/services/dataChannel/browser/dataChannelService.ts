/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IDataChannelService, CoreDataChannel, IDataChannelEvent } from '../../../../platform/dataChannel/common/dataChannel.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export class DataChannelService extends Disposable implements IDataChannelService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidSendData = this._register(new Emitter<IDataChannelEvent>());
	readonly onDidSendData = this._onDidSendData.event;

	constructor() {
		super();
	}

	getDataChannel<T>(channelId: string): CoreDataChannel<T> {
		return new CoreDataChannelImpl<T>(channelId, this._onDidSendData);
	}
}

class CoreDataChannelImpl<T> implements CoreDataChannel<T> {
	constructor(
		private readonly channelId: string,
		private readonly _onDidSendData: Emitter<IDataChannelEvent>
	) { }

	sendData(data: T): void {
		this._onDidSendData.fire({
			channelId: this.channelId,
			data
		});
	}
}

registerSingleton(IDataChannelService, DataChannelService, InstantiationType.Delayed);
