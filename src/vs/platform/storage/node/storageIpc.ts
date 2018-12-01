/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, Emitter, debounceEvent } from 'vs/base/common/event';
import { StorageMainService, IStorageChangeEvent } from 'vs/platform/storage/node/storageMainService';
import { IUpdateRequest, IStorageDatabase, IStorageItemsChangeEvent } from 'vs/base/node/storage';
import { mapToSerializable, serializableToMap, values } from 'vs/base/common/map';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';

type Key = string;
type Value = string;
type Item = [Key, Value];

interface ISerializableUpdateRequest {
	insert?: Item[];
	delete?: Key[];
}

interface ISerializableItemsChangeEvent {
	items: Item[];
}

export class GlobalStorageDatabaseChannel extends Disposable implements IServerChannel {

	private static STORAGE_CHANGE_DEBOUNCE_TIME = 100;

	private _onDidChangeItems: Emitter<ISerializableItemsChangeEvent> = this._register(new Emitter<ISerializableItemsChangeEvent>());
	get onDidChangeItems(): Event<ISerializableItemsChangeEvent> { return this._onDidChangeItems.event; }

	constructor(private storageMainService: StorageMainService) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Listen for changes in global storage to send to listeners
		// that are listening. Use a debouncer to reduce IPC traffic.
		this._register(debounceEvent(this.storageMainService.onDidChangeStorage, (prev: IStorageChangeEvent[], cur: IStorageChangeEvent) => {
			if (!prev) {
				prev = [cur];
			} else {
				prev.push(cur);
			}

			return prev;
		}, GlobalStorageDatabaseChannel.STORAGE_CHANGE_DEBOUNCE_TIME)(events => {
			if (events.length) {
				this._onDidChangeItems.fire(this.serializeEvents(events));
			}
		}));
	}

	private serializeEvents(events: IStorageChangeEvent[]): ISerializableItemsChangeEvent {
		const items = new Map<Key, Value>();
		events.forEach(event => items.set(event.key, this.storageMainService.get(event.key, null)));

		return { items: mapToSerializable(items) } as ISerializableItemsChangeEvent;
	}

	listen(_, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeItems': return this.onDidChangeItems;
		}

		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, arg?: any): Thenable<any> {
		switch (command) {
			case 'getItems': {
				return Promise.resolve(mapToSerializable(this.storageMainService.items));
			}

			case 'updateItems': {
				const items = arg as ISerializableUpdateRequest;
				if (items.insert) {
					for (const [key, value] of items.insert) {
						this.storageMainService.store(key, value);
					}
				}

				if (items.delete) {
					items.delete.forEach(key => this.storageMainService.remove(key));
				}

				return Promise.resolve(); // do not wait for modifications to complete
			}

			case 'checkIntegrity': {
				return this.storageMainService.checkIntegrity(arg);
			}
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class GlobalStorageDatabaseChannelClient extends Disposable implements IStorageDatabase {

	_serviceBrand: any;

	private _onDidChangeItemsExternal: Emitter<IStorageItemsChangeEvent> = this._register(new Emitter<IStorageItemsChangeEvent>());
	get onDidChangeItemsExternal(): Event<IStorageItemsChangeEvent> { return this._onDidChangeItemsExternal.event; }

	private onDidChangeItemsOnMainListener: IDisposable;

	constructor(private channel: IChannel) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.onDidChangeItemsOnMainListener = this.channel.listen('onDidChangeItems')((e: ISerializableItemsChangeEvent) => this.onDidChangeItemsOnMain(e));
	}

	private onDidChangeItemsOnMain(e: ISerializableItemsChangeEvent): void {
		if (Array.isArray(e.items)) {
			this._onDidChangeItemsExternal.fire({ items: serializableToMap(e.items) });
		}
	}

	getItems(): Thenable<Map<string, string>> {
		return this.channel.call('getItems').then((data: Item[]) => serializableToMap(data));
	}

	updateItems(request: IUpdateRequest): Thenable<void> {
		let updateCount = 0;
		const serializableRequest: ISerializableUpdateRequest = Object.create(null);

		if (request.insert) {
			serializableRequest.insert = mapToSerializable(request.insert);
			updateCount += request.insert.size;
		}

		if (request.delete) {
			serializableRequest.delete = values(request.delete);
			updateCount += request.delete.size;
		}

		if (updateCount === 0) {
			return Promise.resolve(); // prevent work if not needed
		}

		return this.channel.call('updateItems', serializableRequest);
	}

	checkIntegrity(full: boolean): Thenable<string> {
		return this.channel.call('checkIntegrity', full);
	}

	close(): Thenable<void> {

		// when we are about to close, we start to ignore main-side changes since we close anyway
		this.onDidChangeItemsOnMainListener = dispose(this.onDidChangeItemsOnMainListener);

		return Promise.resolve(); // global storage is closed on the main side
	}

	dispose(): void {
		super.dispose();

		this.onDidChangeItemsOnMainListener = dispose(this.onDidChangeItemsOnMainListener);
	}
}