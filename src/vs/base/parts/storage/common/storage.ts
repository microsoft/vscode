/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from '../../../common/async.js';
import { Event, PauseableEmitter } from '../../../common/event.js';
import { Disposable, IDisposable } from '../../../common/lifecycle.js';
import { parse, stringify } from '../../../common/marshalling.js';
import { isObject, isUndefinedOrNull } from '../../../common/types.js';

export enum StorageHint {

	// A hint to the storage that the storage
	// does not exist on disk yet. This allows
	// the storage library to improve startup
	// time by not checking the storage for data.
	STORAGE_DOES_NOT_EXIST,

	// A hint to the storage that the storage
	// is backed by an in-memory storage.
	STORAGE_IN_MEMORY
}

export interface IStorageOptions {
	readonly hint?: StorageHint;
}

export interface IUpdateRequest {
	readonly insert?: Map<string, string>;
	readonly delete?: Set<string>;
}

export interface IStorageItemsChangeEvent {
	readonly changed?: Map<string, string>;
	readonly deleted?: Set<string>;
}

export function isStorageItemsChangeEvent(thing: unknown): thing is IStorageItemsChangeEvent {
	const candidate = thing as IStorageItemsChangeEvent | undefined;

	return candidate?.changed instanceof Map || candidate?.deleted instanceof Set;
}

export interface IStorageDatabase {

	readonly onDidChangeItemsExternal: Event<IStorageItemsChangeEvent>;

	getItems(): Promise<Map<string, string>>;
	updateItems(request: IUpdateRequest): Promise<void>;

	optimize(): Promise<void>;

	close(recovery?: () => Map<string, string>): Promise<void>;
}

export interface IStorageChangeEvent {

	/**
	 * The `key` of the storage entry that was changed
	 * or was removed.
	 */
	readonly key: string;

	/**
	 * A hint how the storage change event was triggered. If
	 * `true`, the storage change was triggered by an external
	 * source, such as:
	 * - another process (for example another window)
	 * - operations such as settings sync or profiles change
	 */
	readonly external?: boolean;
}

export type StorageValue = string | boolean | number | undefined | null | object;

export interface IStorage extends IDisposable {

	readonly onDidChangeStorage: Event<IStorageChangeEvent>;

	readonly items: Map<string, string>;
	readonly size: number;

	init(): Promise<void>;

	get(key: string, fallbackValue: string): string;
	get(key: string, fallbackValue?: string): string | undefined;

	getBoolean(key: string, fallbackValue: boolean): boolean;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined;

	getNumber(key: string, fallbackValue: number): number;
	getNumber(key: string, fallbackValue?: number): number | undefined;

	getObject<T extends object>(key: string, fallbackValue: T): T;
	getObject<T extends object>(key: string, fallbackValue?: T): T | undefined;

	set(key: string, value: StorageValue, external?: boolean): Promise<void>;
	delete(key: string, external?: boolean): Promise<void>;

	flush(delay?: number): Promise<void>;
	whenFlushed(): Promise<void>;

	optimize(): Promise<void>;

	close(): Promise<void>;
}

export enum StorageState {
	None,
	Initialized,
	Closed
}

export class Storage extends Disposable implements IStorage {

	private static readonly DEFAULT_FLUSH_DELAY = 100;

	private readonly _onDidChangeStorage = this._register(new PauseableEmitter<IStorageChangeEvent>());
	readonly onDidChangeStorage = this._onDidChangeStorage.event;

	private state = StorageState.None;

	private cache = new Map<string, string>();

	private readonly flushDelayer = this._register(new ThrottledDelayer<void>(Storage.DEFAULT_FLUSH_DELAY));

	private pendingDeletes = new Set<string>();
	private pendingInserts = new Map<string, string>();

	private pendingClose: Promise<void> | undefined = undefined;

	private readonly whenFlushedCallbacks: Function[] = [];

	constructor(
		protected readonly database: IStorageDatabase,
		private readonly options: IStorageOptions = Object.create(null)
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.database.onDidChangeItemsExternal(e => this.onDidChangeItemsExternal(e)));
	}

	private onDidChangeItemsExternal(e: IStorageItemsChangeEvent): void {
		this._onDidChangeStorage.pause();

		try {
			// items that change external require us to update our
			// caches with the values. we just accept the value and
			// emit an event if there is a change.

			e.changed?.forEach((value, key) => this.acceptExternal(key, value));
			e.deleted?.forEach(key => this.acceptExternal(key, undefined));

		} finally {
			this._onDidChangeStorage.resume();
		}
	}

	private acceptExternal(key: string, value: string | undefined): void {
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

	get items(): Map<string, string> {
		return this.cache;
	}

	get size(): number {
		return this.cache.size;
	}

	async init(): Promise<void> {
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

	get(key: string, fallbackValue: string): string;
	get(key: string, fallbackValue?: string): string | undefined;
	get(key: string, fallbackValue?: string): string | undefined {
		const value = this.cache.get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return value;
	}

	getBoolean(key: string, fallbackValue: boolean): boolean;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined {
		const value = this.get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return value === 'true';
	}

	getNumber(key: string, fallbackValue: number): number;
	getNumber(key: string, fallbackValue?: number): number | undefined;
	getNumber(key: string, fallbackValue?: number): number | undefined {
		const value = this.get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return parseInt(value, 10);
	}

	getObject(key: string, fallbackValue: object): object;
	getObject(key: string, fallbackValue?: object | undefined): object | undefined;
	getObject(key: string, fallbackValue?: object): object | undefined {
		const value = this.get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return parse(value);
	}

	async set(key: string, value: string | boolean | number | null | undefined | object, external = false): Promise<void> {
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

	async delete(key: string, external = false): Promise<void> {
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

	async optimize(): Promise<void> {
		if (this.state === StorageState.Closed) {
			return; // Return early if we are already closed
		}

		// Await pending data to be flushed to the DB
		// before attempting to optimize the DB
		await this.flush(0);

		return this.database.optimize();
	}

	async close(): Promise<void> {
		if (!this.pendingClose) {
			this.pendingClose = this.doClose();
		}

		return this.pendingClose;
	}

	private async doClose(): Promise<void> {

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
		} catch (error) {
			// Ignore
		}

		await this.database.close(() => this.cache);
	}

	private get hasPending() {
		return this.pendingInserts.size > 0 || this.pendingDeletes.size > 0;
	}

	private async flushPending(): Promise<void> {
		if (!this.hasPending) {
			return; // return early if nothing to do
		}

		// Get pending data
		const updateRequest: IUpdateRequest = { insert: this.pendingInserts, delete: this.pendingDeletes };

		// Reset pending data for next run
		this.pendingDeletes = new Set<string>();
		this.pendingInserts = new Map<string, string>();

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

	async flush(delay?: number): Promise<void> {
		if (
			this.state === StorageState.Closed || 	// Return early if we are already closed
			this.pendingClose 						// return early if nothing to do
		) {
			return;
		}

		return this.doFlush(delay);
	}

	private async doFlush(delay?: number): Promise<void> {
		if (this.options.hint === StorageHint.STORAGE_IN_MEMORY) {
			return this.flushPending(); // return early if in-memory
		}

		return this.flushDelayer.trigger(() => this.flushPending(), delay);
	}

	async whenFlushed(): Promise<void> {
		if (!this.hasPending) {
			return; // return early if nothing to do
		}

		return new Promise(resolve => this.whenFlushedCallbacks.push(resolve));
	}

	isInMemory(): boolean {
		return this.options.hint === StorageHint.STORAGE_IN_MEMORY;
	}
}

export class InMemoryStorageDatabase implements IStorageDatabase {

	readonly onDidChangeItemsExternal = Event.None;

	private readonly items = new Map<string, string>();

	async getItems(): Promise<Map<string, string>> {
		return this.items;
	}

	async updateItems(request: IUpdateRequest): Promise<void> {
		request.insert?.forEach((value, key) => this.items.set(key, value));

		request.delete?.forEach(key => this.items.delete(key));
	}

	async optimize(): Promise<void> { }
	async close(): Promise<void> { }
}
