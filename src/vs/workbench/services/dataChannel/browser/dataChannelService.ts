/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { CoreDataChannel, DataWatcherKind, IDataChannelEvent, IDataChannelService, IDataWatcher, IDataWatcherParams, IDataWatcherProvider, IDataWatcherService } from '../../../../platform/dataChannel/common/dataChannel.js';
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

export class DataWatcherService implements IDataWatcherService {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<DataWatcherKind, IDataWatcherProvider>();

	registerDataWatcherProvider(kind: DataWatcherKind, provider: IDataWatcherProvider): IDisposable {
		if (this._providers.has(kind)) {
			throw new Error(`Data watcher provider already registered for ${kind}`);
		}

		this._providers.set(kind, provider);
		return toDisposable(() => {
			if (this._providers.get(kind) === provider) {
				this._providers.delete(kind);
			}
		});
	}

	createDataWatcher(params: IDataWatcherParams): IDataWatcher | undefined {
		return this._providers.get(params.kind)?.createDataWatcher(params);
	}
}

registerSingleton(IDataChannelService, DataChannelService, InstantiationType.Delayed);
registerSingleton(IDataWatcherService, DataWatcherService, InstantiationType.Delayed);
