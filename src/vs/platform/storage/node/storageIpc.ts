/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, buffer } from 'vs/base/common/event';
import { IStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { IStorageMainService } from 'vs/platform/storage/node/storageMainService';
import { IUpdateRequest, IStorageDatabase } from 'vs/base/node/storage';

export class GlobalStorageDatabaseChannel implements IServerChannel {

	onDidChangeStorage: Event<IStorageChangeEvent>;

	constructor(private service: IStorageMainService) {
		this.onDidChangeStorage = buffer(service.onDidChangeStorage, true);
	}

	listen(_, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeStorage': return this.onDidChangeStorage;
		}

		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, arg?: any): Thenable<any> {
		switch (command) {
			case 'getItems': {
				return Promise.resolve(itemsToSerializable(this.service.items));
			}

			case 'updateItems': {
				const items = arg as IUpdateRequest;
				if (Array.isArray(items.insert)) {
					items.insert.forEach((value, key) => this.service.store(key, value));
				}

				if (Array.isArray(items.delete)) {
					items.delete.forEach(key => this.service.remove(key));
				}

				return Promise.resolve(); // do not wait for modifications to complete
			}

			case 'checkIntegrity': {
				return this.service.checkIntegrity(arg);
			}
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class GlobalStorageDatabaseChannelClient implements IStorageDatabase {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

	get onDidChangeStorage(): Event<IStorageChangeEvent> {
		return this.channel.listen('onDidChangeStorage');
	}

	getItems(): Thenable<Map<string, string>> {
		return this.channel.call('getItems').then((data: [string, string][]) => serializableToItems(data));
	}

	updateItems(request: IUpdateRequest): Thenable<void> {
		return this.channel.call('updateItems', request);
	}

	checkIntegrity(full: boolean): Thenable<string> {
		return this.channel.call('checkIntegrity', full);
	}

	close(): Thenable<void> {
		return Promise.resolve(); // global storage is closed on the main side
	}
}

function itemsToSerializable(items: Map<string, string>): [string, string][] {
	const data: [string, string][] = [];

	items.forEach((value, key) => {
		data.push([key, value]);
	});

	return data;
}

function serializableToItems(data: [string, string][]): Map<string, string> {
	const items = new Map<string, string>();

	for (const [key, value] of data) {
		items.set(key, value);
	}

	return items;
}