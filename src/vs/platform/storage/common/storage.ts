/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { IUpdateRequest, IStorageDatabase } from 'vs/base/parts/storage/common/storage';
import { serializableToMap, mapToSerializable } from 'vs/base/common/map';
import { VSBuffer } from 'vs/base/common/buffer';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';

export const IStorageService = createDecorator<IStorageService>('storageService');

export enum WillSaveStateReason {
	NONE = 0,
	SHUTDOWN = 1
}

export interface IWillSaveStateEvent {
	reason: WillSaveStateReason;
}

export interface IStorageService {

	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Emitted whenever data is updated or deleted.
	 */
	readonly onDidChangeStorage: Event<IWorkspaceStorageChangeEvent>;

	/**
	 * Emitted when the storage is about to persist. This is the right time
	 * to persist data to ensure it is stored before the application shuts
	 * down.
	 *
	 * The will save state event allows to optionally ask for the reason of
	 * saving the state, e.g. to find out if the state is saved due to a
	 * shutdown.
	 *
	 * Note: this event may be fired many times, not only on shutdown to prevent
	 * loss of state in situations where the shutdown is not sufficient to
	 * persist the data properly.
	 */
	readonly onWillSaveState: Event<IWillSaveStateEvent>;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	get(key: string, scope: StorageScope, fallbackValue: string): string;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a boolean.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a number using parseInt with a base of 10.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined;

	/**
	 * Store a value under the given key to storage. The value will be converted to a string.
	 * Storing either undefined or null will remove the entry under the key.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	store(key: string, value: string | boolean | number | undefined | null, scope: StorageScope): void;

	/**
	 * Delete an element stored under the provided key from storage.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	remove(key: string, scope: StorageScope): void;

	/**
	 * Log the contents of the storage to the console.
	 */
	logStorage(): void;
}

export const enum StorageScope {

	/**
	 * The stored data will be scoped to all workspaces.
	 */
	GLOBAL,

	/**
	 * The stored data will be scoped to the current workspace.
	 */
	WORKSPACE
}

export interface IWorkspaceStorageChangeEvent {
	key: string;
	scope: StorageScope;
}

export class InMemoryStorageService extends Disposable implements IStorageService {

	_serviceBrand = null as any;

	private readonly _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	readonly onDidChangeStorage: Event<IWorkspaceStorageChangeEvent> = this._onDidChangeStorage.event;

	readonly onWillSaveState = Event.None;

	private globalCache: Map<string, string> = new Map<string, string>();
	private workspaceCache: Map<string, string> = new Map<string, string>();

	private getCache(scope: StorageScope): Map<string, string> {
		return scope === StorageScope.GLOBAL ? this.globalCache : this.workspaceCache;
	}

	get(key: string, scope: StorageScope, fallbackValue: string): string;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined {
		const value = this.getCache(scope).get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return value;
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
		const value = this.getCache(scope).get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return value === 'true';
	}

	getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
		const value = this.getCache(scope).get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return parseInt(value, 10);
	}

	store(key: string, value: string | boolean | number | undefined | null, scope: StorageScope): Promise<void> {

		// We remove the key for undefined/null values
		if (isUndefinedOrNull(value)) {
			return this.remove(key, scope);
		}

		// Otherwise, convert to String and store
		const valueStr = String(value);

		// Return early if value already set
		const currentValue = this.getCache(scope).get(key);
		if (currentValue === valueStr) {
			return Promise.resolve();
		}

		// Update in cache
		this.getCache(scope).set(key, valueStr);

		// Events
		this._onDidChangeStorage.fire({ scope, key });

		return Promise.resolve();
	}

	remove(key: string, scope: StorageScope): Promise<void> {
		const wasDeleted = this.getCache(scope).delete(key);
		if (!wasDeleted) {
			return Promise.resolve(); // Return early if value already deleted
		}

		// Events
		this._onDidChangeStorage.fire({ scope, key });

		return Promise.resolve();
	}

	logStorage(): void {
		logStorage(this.globalCache, this.workspaceCache, 'inMemory', 'inMemory');
	}
}

export class FileStorageDatabase extends Disposable implements IStorageDatabase {

	readonly onDidChangeItemsExternal = Event.None; // TODO@Ben implement global UI storage events

	private cache: Map<string, string> | undefined;

	private pendingUpdate: Promise<void> = Promise.resolve();

	constructor(
		private readonly file: URI,
		private readonly fileService: IFileService
	) {
		super();
	}

	async getItems(): Promise<Map<string, string>> {
		if (!this.cache) {
			try {
				this.cache = await this.doGetItemsFromFile();
			} catch (error) {
				this.cache = new Map();
			}
		}

		return this.cache;
	}

	private async doGetItemsFromFile(): Promise<Map<string, string>> {
		await this.pendingUpdate;

		const itemsRaw = await this.fileService.readFile(this.file);

		return serializableToMap(JSON.parse(itemsRaw.value.toString()));
	}

	async updateItems(request: IUpdateRequest): Promise<void> {
		const items = await this.getItems();

		if (request.insert) {
			request.insert.forEach((value, key) => items.set(key, value));
		}

		if (request.delete) {
			request.delete.forEach(key => items.delete(key));
		}

		await this.pendingUpdate;

		this.pendingUpdate = this.fileService.writeFile(this.file, VSBuffer.fromString(JSON.stringify(mapToSerializable(items)))).then();

		return this.pendingUpdate;
	}

	close(): Promise<void> {
		return this.pendingUpdate;
	}
}

export async function logStorage(global: Map<string, string>, workspace: Map<string, string>, globalPath: string, workspacePath: string): Promise<void> {
	const safeParse = (value: string) => {
		try {
			return JSON.parse(value);
		} catch (error) {
			return value;
		}
	};

	const globalItems = new Map<string, string>();
	const globalItemsParsed = new Map<string, string>();
	global.forEach((value, key) => {
		globalItems.set(key, value);
		globalItemsParsed.set(key, safeParse(value));
	});

	const workspaceItems = new Map<string, string>();
	const workspaceItemsParsed = new Map<string, string>();
	workspace.forEach((value, key) => {
		workspaceItems.set(key, value);
		workspaceItemsParsed.set(key, safeParse(value));
	});

	console.group(`Storage: Global (path: ${globalPath})`);
	let globalValues: { key: string, value: string }[] = [];
	globalItems.forEach((value, key) => {
		globalValues.push({ key, value });
	});
	console.table(globalValues);
	console.groupEnd();

	console.log(globalItemsParsed);

	console.group(`Storage: Workspace (path: ${workspacePath})`);
	let workspaceValues: { key: string, value: string }[] = [];
	workspaceItems.forEach((value, key) => {
		workspaceValues.push({ key, value });
	});
	console.table(workspaceValues);
	console.groupEnd();

	console.log(workspaceItemsParsed);
}