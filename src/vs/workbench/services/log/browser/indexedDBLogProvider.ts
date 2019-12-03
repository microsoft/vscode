/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyValueLogProvider } from 'vs/workbench/services/log/common/keyValueLogProvider';

export const INDEXEDDB_VSCODE_DB = 'vscode-web-db';
export const INDEXEDDB_LOGS_OBJECT_STORE = 'vscode-logs-store';

export class IndexedDBLogProvider extends KeyValueLogProvider {

	readonly database: Promise<IDBDatabase>;

	constructor(scheme: string) {
		super(scheme);
		this.database = this.openDatabase(1);
	}

	private openDatabase(version: number): Promise<IDBDatabase> {
		return new Promise((c, e) => {
			const request = window.indexedDB.open(INDEXEDDB_VSCODE_DB, version);
			request.onerror = (err) => e(request.error);
			request.onsuccess = () => {
				const db = request.result;
				if (db.objectStoreNames.contains(INDEXEDDB_LOGS_OBJECT_STORE)) {
					c(db);
				}
			};
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(INDEXEDDB_LOGS_OBJECT_STORE)) {
					db.createObjectStore(INDEXEDDB_LOGS_OBJECT_STORE);
				}
				c(db);
			};
		});
	}

	protected async getAllKeys(): Promise<string[]> {
		return new Promise(async (c, e) => {
			const db = await this.database;
			const transaction = db.transaction([INDEXEDDB_LOGS_OBJECT_STORE]);
			const objectStore = transaction.objectStore(INDEXEDDB_LOGS_OBJECT_STORE);
			const request = objectStore.getAllKeys();
			request.onerror = () => e(request.error);
			request.onsuccess = () => c(<string[]>request.result);
		});
	}

	protected hasKey(key: string): Promise<boolean> {
		return new Promise<boolean>(async (c, e) => {
			const db = await this.database;
			const transaction = db.transaction([INDEXEDDB_LOGS_OBJECT_STORE]);
			const objectStore = transaction.objectStore(INDEXEDDB_LOGS_OBJECT_STORE);
			const request = objectStore.getKey(key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => {
				c(!!request.result);
			};
		});
	}

	protected getValue(key: string): Promise<string> {
		return new Promise(async (c, e) => {
			const db = await this.database;
			const transaction = db.transaction([INDEXEDDB_LOGS_OBJECT_STORE]);
			const objectStore = transaction.objectStore(INDEXEDDB_LOGS_OBJECT_STORE);
			const request = objectStore.get(key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => c(request.result || '');
		});
	}

	protected setValue(key: string, value: string): Promise<void> {
		return new Promise(async (c, e) => {
			const db = await this.database;
			const transaction = db.transaction([INDEXEDDB_LOGS_OBJECT_STORE], 'readwrite');
			const objectStore = transaction.objectStore(INDEXEDDB_LOGS_OBJECT_STORE);
			const request = objectStore.put(value, key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => c();
		});
	}

	protected deleteKey(key: string): Promise<void> {
		return new Promise(async (c, e) => {
			const db = await this.database;
			const transaction = db.transaction([INDEXEDDB_LOGS_OBJECT_STORE], 'readwrite');
			const objectStore = transaction.objectStore(INDEXEDDB_LOGS_OBJECT_STORE);
			const request = objectStore.delete(key);
			request.onerror = () => e(request.error);
			request.onsuccess = () => c();
		});
	}
}
