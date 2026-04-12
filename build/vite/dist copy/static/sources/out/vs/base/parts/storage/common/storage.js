/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThrottledDelayer } from '../../../common/async.js';
import { Event, PauseableEmitter } from '../../../common/event.js';
import { Disposable } from '../../../common/lifecycle.js';
import { parse, stringify } from '../../../common/marshalling.js';
import { isObject, isUndefinedOrNull } from '../../../common/types.js';
export var StorageHint;
(function (StorageHint) {
    // A hint to the storage that the storage
    // does not exist on disk yet. This allows
    // the storage library to improve startup
    // time by not checking the storage for data.
    StorageHint[StorageHint["STORAGE_DOES_NOT_EXIST"] = 0] = "STORAGE_DOES_NOT_EXIST";
    // A hint to the storage that the storage
    // is backed by an in-memory storage.
    StorageHint[StorageHint["STORAGE_IN_MEMORY"] = 1] = "STORAGE_IN_MEMORY";
})(StorageHint || (StorageHint = {}));
export function isStorageItemsChangeEvent(thing) {
    const candidate = thing;
    return candidate?.changed instanceof Map || candidate?.deleted instanceof Set;
}
export var StorageState;
(function (StorageState) {
    StorageState[StorageState["None"] = 0] = "None";
    StorageState[StorageState["Initialized"] = 1] = "Initialized";
    StorageState[StorageState["Closed"] = 2] = "Closed";
})(StorageState || (StorageState = {}));
export class Storage extends Disposable {
    static { this.DEFAULT_FLUSH_DELAY = 100; }
    constructor(database, options = Object.create(null)) {
        super();
        this.database = database;
        this.options = options;
        this._onDidChangeStorage = this._register(new PauseableEmitter());
        this.onDidChangeStorage = this._onDidChangeStorage.event;
        this.state = StorageState.None;
        this.cache = new Map();
        this.flushDelayer = this._register(new ThrottledDelayer(Storage.DEFAULT_FLUSH_DELAY));
        this.pendingDeletes = new Set();
        this.pendingInserts = new Map();
        this.pendingClose = undefined;
        this.whenFlushedCallbacks = [];
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.database.onDidChangeItemsExternal(e => this.onDidChangeItemsExternal(e)));
    }
    onDidChangeItemsExternal(e) {
        this._onDidChangeStorage.pause();
        try {
            // items that change external require us to update our
            // caches with the values. we just accept the value and
            // emit an event if there is a change.
            e.changed?.forEach((value, key) => this.acceptExternal(key, value));
            e.deleted?.forEach(key => this.acceptExternal(key, undefined));
        }
        finally {
            this._onDidChangeStorage.resume();
        }
    }
    acceptExternal(key, value) {
        if (this.state === StorageState.Closed) {
            return; // Return early if we are already closed
        }
        let changed = false;
        // Item got removed, check for deletion
        if (isUndefinedOrNull(value)) {
            changed = this.cache.delete(key);
        }
        // Item got updated, check for change
        else {
            const currentValue = this.cache.get(key);
            if (currentValue !== value) {
                this.cache.set(key, value);
                changed = true;
            }
        }
        // Signal to outside listeners
        if (changed) {
            this._onDidChangeStorage.fire({ key, external: true });
        }
    }
    get items() {
        return this.cache;
    }
    get size() {
        return this.cache.size;
    }
    async init() {
        if (this.state !== StorageState.None) {
            return; // either closed or already initialized
        }
        this.state = StorageState.Initialized;
        if (this.options.hint === StorageHint.STORAGE_DOES_NOT_EXIST) {
            // return early if we know the storage file does not exist. this is a performance
            // optimization to not load all items of the underlying storage if we know that
            // there can be no items because the storage does not exist.
            return;
        }
        this.cache = await this.database.getItems();
    }
    get(key, fallbackValue) {
        const value = this.cache.get(key);
        if (isUndefinedOrNull(value)) {
            return fallbackValue;
        }
        return value;
    }
    getBoolean(key, fallbackValue) {
        const value = this.get(key);
        if (isUndefinedOrNull(value)) {
            return fallbackValue;
        }
        return value === 'true';
    }
    getNumber(key, fallbackValue) {
        const value = this.get(key);
        if (isUndefinedOrNull(value)) {
            return fallbackValue;
        }
        return parseInt(value, 10);
    }
    getObject(key, fallbackValue) {
        const value = this.get(key);
        if (isUndefinedOrNull(value)) {
            return fallbackValue;
        }
        return parse(value);
    }
    async set(key, value, external = false) {
        if (this.state === StorageState.Closed) {
            return; // Return early if we are already closed
        }
        // We remove the key for undefined/null values
        if (isUndefinedOrNull(value)) {
            return this.delete(key, external);
        }
        // Otherwise, convert to String and store
        const valueStr = isObject(value) || Array.isArray(value) ? stringify(value) : String(value);
        // Return early if value already set
        const currentValue = this.cache.get(key);
        if (currentValue === valueStr) {
            return;
        }
        // Update in cache and pending
        this.cache.set(key, valueStr);
        this.pendingInserts.set(key, valueStr);
        this.pendingDeletes.delete(key);
        // Event
        this._onDidChangeStorage.fire({ key, external });
        // Accumulate work by scheduling after timeout
        return this.doFlush();
    }
    async delete(key, external = false) {
        if (this.state === StorageState.Closed) {
            return; // Return early if we are already closed
        }
        // Remove from cache and add to pending
        const wasDeleted = this.cache.delete(key);
        if (!wasDeleted) {
            return; // Return early if value already deleted
        }
        if (!this.pendingDeletes.has(key)) {
            this.pendingDeletes.add(key);
        }
        this.pendingInserts.delete(key);
        // Event
        this._onDidChangeStorage.fire({ key, external });
        // Accumulate work by scheduling after timeout
        return this.doFlush();
    }
    async optimize() {
        if (this.state === StorageState.Closed) {
            return; // Return early if we are already closed
        }
        // Await pending data to be flushed to the DB
        // before attempting to optimize the DB
        await this.flush(0);
        return this.database.optimize();
    }
    async close() {
        if (!this.pendingClose) {
            this.pendingClose = this.doClose();
        }
        return this.pendingClose;
    }
    async doClose() {
        // Update state
        this.state = StorageState.Closed;
        // Trigger new flush to ensure data is persisted and then close
        // even if there is an error flushing. We must always ensure
        // the DB is closed to avoid corruption.
        //
        // Recovery: we pass our cache over as recovery option in case
        // the DB is not healthy.
        try {
            await this.doFlush(0 /* as soon as possible */);
        }
        catch {
            // Ignore
        }
        await this.database.close(() => this.cache);
    }
    get hasPending() {
        return this.pendingInserts.size > 0 || this.pendingDeletes.size > 0;
    }
    async flushPending() {
        if (!this.hasPending) {
            return; // return early if nothing to do
        }
        // Get pending data
        const updateRequest = { insert: this.pendingInserts, delete: this.pendingDeletes };
        // Reset pending data for next run
        this.pendingDeletes = new Set();
        this.pendingInserts = new Map();
        // Update in storage and release any
        // waiters we have once done
        return this.database.updateItems(updateRequest).finally(() => {
            if (!this.hasPending) {
                while (this.whenFlushedCallbacks.length) {
                    this.whenFlushedCallbacks.pop()?.();
                }
            }
        });
    }
    async flush(delay) {
        if (this.state === StorageState.Closed || // Return early if we are already closed
            this.pendingClose // return early if nothing to do
        ) {
            return;
        }
        return this.doFlush(delay);
    }
    async doFlush(delay) {
        if (this.options.hint === StorageHint.STORAGE_IN_MEMORY) {
            return this.flushPending(); // return early if in-memory
        }
        return this.flushDelayer.trigger(() => this.flushPending(), delay);
    }
    async whenFlushed() {
        if (!this.hasPending) {
            return; // return early if nothing to do
        }
        return new Promise(resolve => this.whenFlushedCallbacks.push(resolve));
    }
    isInMemory() {
        return this.options.hint === StorageHint.STORAGE_IN_MEMORY;
    }
}
export class InMemoryStorageDatabase {
    constructor() {
        this.onDidChangeItemsExternal = Event.None;
        this.items = new Map();
    }
    async getItems() {
        return this.items;
    }
    async updateItems(request) {
        request.insert?.forEach((value, key) => this.items.set(key, value));
        request.delete?.forEach(key => this.items.delete(key));
    }
    async optimize() { }
    async close() { }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvcGFydHMvc3RvcmFnZS9jb21tb24vc3RvcmFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDbkUsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLDhCQUE4QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRXZFLE1BQU0sQ0FBTixJQUFZLFdBV1g7QUFYRCxXQUFZLFdBQVc7SUFFdEIseUNBQXlDO0lBQ3pDLDBDQUEwQztJQUMxQyx5Q0FBeUM7SUFDekMsNkNBQTZDO0lBQzdDLGlGQUFzQixDQUFBO0lBRXRCLHlDQUF5QztJQUN6QyxxQ0FBcUM7SUFDckMsdUVBQWlCLENBQUE7QUFDbEIsQ0FBQyxFQVhXLFdBQVcsS0FBWCxXQUFXLFFBV3RCO0FBZ0JELE1BQU0sVUFBVSx5QkFBeUIsQ0FBQyxLQUFjO0lBQ3ZELE1BQU0sU0FBUyxHQUFHLEtBQTZDLENBQUM7SUFFaEUsT0FBTyxTQUFTLEVBQUUsT0FBTyxZQUFZLEdBQUcsSUFBSSxTQUFTLEVBQUUsT0FBTyxZQUFZLEdBQUcsQ0FBQztBQUMvRSxDQUFDO0FBa0VELE1BQU0sQ0FBTixJQUFZLFlBSVg7QUFKRCxXQUFZLFlBQVk7SUFDdkIsK0NBQUksQ0FBQTtJQUNKLDZEQUFXLENBQUE7SUFDWCxtREFBTSxDQUFBO0FBQ1AsQ0FBQyxFQUpXLFlBQVksS0FBWixZQUFZLFFBSXZCO0FBRUQs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