/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { toErrorMessage } from '../common/errorMessage.js';
import { ErrorNoTelemetry, getErrorMessage } from '../common/errors.js';
import { mark } from '../common/performance.js';
class MissingStoresError extends Error {
    constructor(db) {
        super('Missing stores');
        this.db = db;
    }
}
export class DBClosedError extends Error {
    constructor(dbName) {
        super(`IndexedDB database '${dbName}' is closed.`);
        this.code = 'DBClosed';
    }
}
export class IndexedDB {
    static async create(name, version, stores) {
        const database = await IndexedDB.openDatabase(name, version, stores);
        return new IndexedDB(database, name);
    }
    static async openDatabase(name, version, stores) {
        mark(`code/willOpenDatabase/${name}`);
        try {
            return await IndexedDB.doOpenDatabase(name, version, stores);
        }
        catch (err) {
            if (err instanceof MissingStoresError) {
                console.info(`Attempting to recreate the IndexedDB once.`, name);
                try {
                    // Try to delete the db
                    await IndexedDB.deleteDatabase(err.db);
                }
                catch (error) {
                    console.error(`Error while deleting the IndexedDB`, getErrorMessage(error));
                    throw error;
                }
                return await IndexedDB.doOpenDatabase(name, version, stores);
            }
            throw err;
        }
        finally {
            mark(`code/didOpenDatabase/${name}`);
        }
    }
    static doOpenDatabase(name, version, stores) {
        return new Promise((c, e) => {
            const request = indexedDB.open(name, version);
            request.onerror = () => e(request.error);
            request.onsuccess = () => {
                const db = request.result;
                for (const store of stores) {
                    if (!db.objectStoreNames.contains(store)) {
                        console.error(`Error while opening IndexedDB. Could not find '${store}'' object store`);
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
    static deleteDatabase(database) {
        return new Promise((c, e) => {
            // Close any opened connections
            database.close();
            // Delete the db
            const deleteRequest = indexedDB.deleteDatabase(database.name);
            deleteRequest.onerror = (err) => e(deleteRequest.error);
            deleteRequest.onsuccess = () => c();
        });
    }
    constructor(database, name) {
        this.name = name;
        this.database = null;
        this.pendingTransactions = [];
        this.database = database;
    }
    hasPendingTransactions() {
        return this.pendingTransactions.length > 0;
    }
    close() {
        if (this.pendingTransactions.length) {
            this.pendingTransactions.splice(0, this.pendingTransactions.length).forEach(transaction => transaction.abort());
        }
        this.database?.close();
        this.database = null;
    }
    async runInTransaction(store, transactionMode, dbRequestFn) {
        if (!this.database) {
            throw new DBClosedError(this.name);
        }
        const transaction = this.database.transaction(store, transactionMode);
        this.pendingTransactions.push(transaction);
        return new Promise((c, e) => {
            transaction.oncomplete = () => {
                if (Array.isArray(request)) {
                    c(request.map(r => r.result));
                }
                else {
                    c(request.result);
                }
            };
            transaction.onerror = () => e(transaction.error ? ErrorNoTelemetry.fromError(transaction.error) : new ErrorNoTelemetry('unknown error'));
            transaction.onabort = () => e(transaction.error ? ErrorNoTelemetry.fromError(transaction.error) : new ErrorNoTelemetry('unknown error'));
            const request = dbRequestFn(transaction.objectStore(store));
        }).finally(() => this.pendingTransactions.splice(this.pendingTransactions.indexOf(transaction), 1));
    }
    async getKeyValues(store, isValid) {
        if (!this.database) {
            throw new DBClosedError(this.name);
        }
        const transaction = this.database.transaction(store, 'readonly');
        this.pendingTransactions.push(transaction);
        return new Promise(resolve => {
            const items = new Map();
            const objectStore = transaction.objectStore(store);
            // Open a IndexedDB Cursor to iterate over key/values
            const cursor = objectStore.openCursor();
            if (!cursor) {
                return resolve(items); // this means the `ItemTable` was empty
            }
            // Iterate over rows of `ItemTable` until the end
            cursor.onsuccess = () => {
                if (cursor.result) {
                    // Keep cursor key/value in our map
                    if (isValid(cursor.result.value)) {
                        items.set(cursor.result.key.toString(), cursor.result.value);
                    }
                    // Advance cursor to next row
                    cursor.result.continue();
                }
                else {
                    resolve(items); // reached end of table
                }
            };
            // Error handlers
            const onError = (error) => {
                console.error(`IndexedDB getKeyValues(): ${toErrorMessage(error, true)}`);
                resolve(items);
            };
            cursor.onerror = () => onError(cursor.error);
            transaction.onerror = () => onError(transaction.error);
        }).finally(() => this.pendingTransactions.splice(this.pendingTransactions.indexOf(transaction), 1));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXhlZERCLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL2luZGV4ZWREQi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDM0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGVBQWUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUVoRCxNQUFNLGtCQUFtQixTQUFRLEtBQUs7SUFDckMsWUFBcUIsRUFBZTtRQUNuQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQURKLE9BQUUsR0FBRixFQUFFLENBQWE7SUFFcEMsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGFBQWMsU0FBUSxLQUFLO0lBRXZDLFlBQVksTUFBYztRQUN6QixLQUFLLENBQUMsdUJBQXVCLE1BQU0sY0FBYyxDQUFDLENBQUM7UUFGM0MsU0FBSSxHQUFHLFVBQVUsQ0FBQztJQUczQixDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sU0FBUztJQUVyQixNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFZLEVBQUUsT0FBMkIsRUFBRSxNQUFnQjtRQUM5RSxNQUFNLFFBQVEsR0FBRyxNQUFNLFNBQVMsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNyRSxPQUFPLElBQUksU0FBUyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsSUFBWSxFQUFFLE9BQTJCLEVBQUUsTUFBZ0I7UUFDNUYsSUFBSSxDQUFDLHlCQUF5QixJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3RDLElB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