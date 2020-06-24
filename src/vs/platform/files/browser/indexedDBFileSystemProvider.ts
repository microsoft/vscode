/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyValueFileSystemProvider } from 'vs/platform/files/common/keyValueFileSystemProvider';
import * as browser from 'vs/base/browser/browser';

export function openDatabase(name: string, version: number, stores: string[]): Promise<IDBDatabase | null> {
	if (browser.isEdge) {
		return Promise.resolve(null);
	}
	return new Promise((c, e) => {
		const request = window.indexedDB.open(name, version);
		request.onerror = (err) => e(request.error);
		request.onsuccess = () => {
			const db = request.result;
			for (const store of stores) {
				if (!db.objectStoreNames.contains(store)) {
					console.error(`Error while creating indexedDB. Could not create ${store} object store`);
					c(null);
					return;
				}
			}
			c(db);
		};
		request.onupgradeneeded = () => {
			const db = request.result;
			for (const store of stores) {
				if (!db.objectStoreNames.contains(store)) {
					db.createObjectStore(store);
				}
			}
		};
	});
}

export class IndexedDBFileSystemProvider extends KeyValueFileSystemProvider {

	constructor(scheme: string, private readonly database: IDBDatabase, private readonly store: string) {
		super(scheme);
	}

	protected async getAllKeys(): Promise<string[]> {
		return new Promise(async (c, e) => {
			const transaction = this.database.transaction([this.store]);
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.getAllKeys();
			request.onerror = () => e(request.error);
			request.onsuccess = () => c(<string[]>request.result);
		});
	}

	protected hasKey(key: string): Promise<boolean> {
		return new Promise<boolean>(async (c, e) => {
			const transaction = this.database.transaction([this.store]);
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.getKey(key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => {
				c(!!request.result);
			};
		});
	}

	protected getValue(key: string): Promise<string> {
		return new Promise(async (c, e) => {
			const transaction = this.database.transaction([this.store]);
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.get(key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => c(request.result || '');
		});
	}

	protected setValue(key: string, value: string): Promise<void> {
		return new Promise(async (c, e) => {
			const transaction = this.database.transaction([this.store], 'readwrite');
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.put(value, key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => c();
		});
	}

	protected deleteKey(key: string): Promise<void> {
		return new Promise(async (c, e) => {
			const transaction = this.database.transaction([this.store], 'readwrite');
			const objectStore = transaction.objectStore(this.store);
			const request = objectStore.delete(key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => c();
		});
	}
}
