/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event } from 'vs/base/common/event';
import { StorageMainService } from 'vs/platform/storage/node/storageMainService';
import { IUpdateRequest, IStorageDatabase } from 'vs/base/node/storage';
import { mapToSerializable, serializableToMap, values } from 'vs/base/common/map';

export interface ISerializableUpdateRequest {
	insert?: [string, string][];
	delete?: string[];
}

export class GlobalStorageDatabaseChannel implements IServerChannel {

	// readonly onDidChangeStorage: Event<IStorageChangeEvent>;

	constructor(private storageMainService: StorageMainService) {
		// this.onDidChangeStorage = buffer(storageMainService.onDidChangeStorage, true);
	}

	listen(_, event: string): Event<any> {
		// switch (event) {
		// 	case 'onDidChangeStorage': return this.onDidChangeStorage;
		// }

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

export class GlobalStorageDatabaseChannelClient implements IStorageDatabase {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

	// get onDidChangeStorage(): Event<IStorageChangeEvent> {
	// 	return this.channel.listen('onDidChangeStorage');
	// }

	getItems(): Thenable<Map<string, string>> {
		return this.channel.call('getItems').then((data: [string, string][]) => serializableToMap(data));
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
		return Promise.resolve(); // global storage is closed on the main side
	}
}