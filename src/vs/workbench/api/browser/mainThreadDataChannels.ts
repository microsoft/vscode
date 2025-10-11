/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IDataChannelService } from '../../../platform/dataChannel/common/dataChannel.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostDataChannelsShape, MainContext, MainThreadDataChannelsShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadDataChannels)
export class MainThreadDataChannels extends Disposable implements MainThreadDataChannelsShape {

	private readonly _proxy: ExtHostDataChannelsShape;

	constructor(
		extHostContext: IExtHostContext,
		@IDataChannelService private readonly _dataChannelService: IDataChannelService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDataChannels);

		this._register(this._dataChannelService.onDidSendData(e => {
			this._proxy.$onDidReceiveData(e.channelId, e.data);
		}));
	}
}
