/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from 'vs/base/common/errors';
import { mark } from 'vs/base/common/performance';
import { isArray } from 'vs/base/common/types';

class MissingStoresError extends Error {
	constructor(readonly db: IDBDatabase) {
		super('Missing stores');
	}
}

export class IndexedDB {

	static async create(name: string, version: number, stores: string[]): Promise<IndexedDB> {
		const database = await IndexedDB.openDatabase(name, version, stores);
		return new IndexedDB(database, name);
	}

	static async openDatabase(name: string, version: number, stores: string[]): Promise<IDBDatabase> {
		mark(`code/willOpenDatabase/${name}`);
		try {
			return await IndexedDB.doOpenDatabase(name, version, stores);
		} catch (err) {
			if (err instanceof MissingStoresError) {
				console.info(`Attempting to recreate the indexedDB once.`, name);

				try {
					// Try to delete the db
					await IndexedDB.deleteDatabase(err.db);
				} catch (error) {
					console.error(`Error while deleting the indexedDB`, getErrorMessage(error));
					throw error;
				}

				return await IndexedDB.doOpenDatabase(name, version, stores);
			}

			throw err;
		} finally {
			mark(`code/didOpenDatabase/${name}`);
		}
	}

	private static doOpenDatabase(name: string, version: number, stores: string[]): Promise<IDBDatabase> {
		return new Promise((c, e) => {
			const request = window.indexedDB.open(name, version);
			request.onerror = () => e(request.error);
			request.onsuccess = () => {
				const db = request.result;
				for (const store of stores) {
					if (!db.objectStoreNames.contains(store)) {
						console.error(`Error while opening indexedDB. Could not find ${store} object store`);
						e(new MissingStoresError(db));
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

	private static deleteDatabase(indexedDB: IDBDatabase): Promise<void> {
		return new Promise((c, e) => {
			// Close any opened connections
			indexedDB.close();

			// Delete the db
			const deleteRequest = window.indexedDB.deleteDatabase(indexedDB.name);
			deleteRequest.onerror = (err) => e(deleteRequest.error);
			deleteRequest.onsuccess = () => c();
		});
	}

	private database: IDBDatabase | null = null;
	private readonly pendingTransactions: IDBTransaction[] = [];

	constructor(database: IDBDatabase, private readonly name: string) {
		this.database = database;
	}

	getDatabase(): IDBDatabase | null {
		return this.database;
	}

	hasPendingTransactions(): boolean {
		return this.pendingTransactions.length > 0;
	}

	close(): void {
		if (this.pendingTransactions.length) {
			this.pendingTransactions.splice(0, this.pendingTransactions.length).forEach(transaction => transaction.abort());
		}
		if (this.database) {
			this.database.close();
		}
		this.database = null;
	}

	runInTransaction<T>(store: string, transactionMode: IDBTransactionMode, dbRequestFn: (store: IDBObjectStore) => IDBRequest<T>[]): Promise<T[]>
	runInTransaction<T>(store: string, transactionMode: IDBTransactionMode, dbRequestFn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T>
	async runInTransaction<T>(store: string, transactionMode: IDBTransactionMode, dbRequestFn: (store: IDBObjectStore) => IDBRequest<T> | IDBRequest<T>[]): Promise<T | T[]> {
		if (!this.database) {
			throw new Error(`Database '${this.name}' is not opened.`);
		}
		const transaction = this.database.transaction([store], transactionMode);
		this.pendingTransactions.push(transaction);
		return new Promise<T | T[]>((c, e) => {
			transaction.oncomplete = () => {
				if (isArray(request)) {
					c(request.map(r => r.result));
				} else {
					c(request.result);
				}
			};
			transaction.onerror = () => e(transaction.error);
			const request = dbRequestFn(transaction.objectStore(store));
		}).finally(() => this.pendingTransactions.splice(this.pendingTransactions.indexOf(transaction), 1));
	}

}
