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

	sendData(channel: CoreDataChannel, data: any): void {
		this._onDidSendData.fire({
			channel,
			data
		});
	}
}



registerSingleton(IDataChannelService, DataChannelService, InstantiationType.Delayed);
