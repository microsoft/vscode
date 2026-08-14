/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { autorun } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { IDataChannelService, IDataWatcherService } from '../../../platform/dataChannel/common/dataChannel.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostDataChannelsShape, IDataWatcherParamsDto, MainContext, MainThreadDataChannelsShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadDataChannels)
export class MainThreadDataChannels extends Disposable implements MainThreadDataChannelsShape {

	private readonly _proxy: ExtHostDataChannelsShape;
	private readonly _dataWatchers = this._register(new DisposableMap<number>());

	constructor(
		extHostContext: IExtHostContext,
		@IDataChannelService private readonly _dataChannelService: IDataChannelService,
		@IDataWatcherService private readonly _dataWatcherService: IDataWatcherService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDataChannels);

		this._register(this._dataChannelService.onDidSendData(e => {
			this._proxy.$onDidReceiveData(e.channelId, e.data);
		}));
	}

	$createDataWatcher(handle: number, params: IDataWatcherParamsDto): void {
		const watcher = this._dataWatcherService.createDataWatcher({
			kind: params.kind,
			resource: URI.revive(params.resource),
		});
		if (!watcher) {
			this._proxy.$acceptDataWatcherData(handle, undefined);
			return;
		}

		const store = new DisposableStore();
		store.add(autorun(reader => {
			this._proxy.$acceptDataWatcherData(handle, watcher.data.read(reader));
		}));
		store.add(watcher);
		this._dataWatchers.set(handle, store);
	}

	$disposeDataWatcher(handle: number): void {
		this._dataWatchers.deleteAndDispose(handle);
	}
}
