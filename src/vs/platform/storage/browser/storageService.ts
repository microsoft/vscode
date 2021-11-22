/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSafari } from 'vs/base/browser/browser';
import { IndexedDB } from 'vs/base/browser/indexedDB';
import { Promises } from 'vs/base/common/async';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { InMemoryStorageDatabase, isStorageItemsChangeEvent, IStorage, IStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest, Storage } from 'vs/base/parts/storage/common/storage';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractStorageService, IS_NEW_KEY, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';

export class BrowserStorageService extends AbstractStorageService {

	private static BROWSER_DEFAULT_FLUSH_INTERVAL = 5 * 1000; // every 5s because async operations are not permitted on shutdown

	private globalStorage: IStorage | undefined;
	private workspaceStorage: IStorage | undefined;

	private globalStorageDatabase: IIndexedDBStorageDatabase | undefined;
	private workspaceStorageDatabase: IIndexedDBStorageDatabase | undefined;

	get hasPendingUpdate(): boolean {
		return Boolean(this.globalStorageDatabase?.hasPendingUpdate || this.workspaceStorageDatabase?.hasPendingUpdate);
	}

	constructor(
		private readonly payload: IWorkspaceInitializationPayload,
		@ILogService private readonly logService: ILogService
	) {
		super({ flushInterval: BrowserStorageService.BROWSER_DEFAULT_FLUSH_INTERVAL });
	}

	private getId(scope: StorageScope): string {
		return scope === StorageScope.GLOBAL ? 'global' : this.payload.id;
	}

	protected async doInitialize(): Promise<void> {

		// Create Storage in Parallel
		const [workspaceStorageDatabase, globalStorageDatabase] = await Promises.settled([
			IndexedDBStorageDatabase.create({ id: this.getId(StorageScope.WORKSPACE) }, this.logService),
			IndexedDBStorageDatabase.create({ id: this.getId(StorageScope.GLOBAL), broadcastChanges: true /* only for global storage */ }, this.logService)
		]);

		// Workspace Storage
		this.workspaceStorageDatabase = this._register(workspaceStorageDatabase);
		this.workspaceStorage = this._register(new Storage(this.workspaceStorageDatabase));
		this._register(this.workspaceStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.WORKSPACE, key)));

		// Global Storage
		this.globalStorageDatabase = this._register(globalStorageDatabase);
		this.globalStorage = this._register(new Storage(this.globalStorageDatabase));
		this._register(this.globalStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.GLOBAL, key)));

		// Init both
		await Promises.settled([
			this.workspaceStorage.init(),
			this.globalStorage.init()
		]);

		// Check to see if this is the first time we are "opening" the application
		const firstOpen = this.globalStorage.getBoolean(IS_NEW_KEY);
		if (firstOpen === undefined) {
			this.globalStorage.set(IS_NEW_KEY, true);
		} else if (firstOpen) {
			this.globalStorage.set(IS_NEW_KEY, false);
		}

		// Check to see if this is the first time we are "opening" this workspace
		const firstWorkspaceOpen = this.workspaceStorage.getBoolean(IS_NEW_KEY);
		if (firstWorkspaceOpen === undefined) {
			this.workspaceStorage.set(IS_NEW_KEY, true);
		} else if (firstWorkspaceOpen) {
			this.workspaceStorage.set(IS_NEW_KEY, false);
		}
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		return this.getId(scope);
	}

	async migrate(toWorkspace: IWorkspaceInitializationPayload): Promise<void> {
		throw new Error('Migrating storage is currently unsupported in Web');
	}

	protected override shouldFlushWhenIdle(): boolean {
		// this flush() will potentially cause new state to be stored
		// since new state will only be created while the document
		// has focus, one optimization is to not run this when the
		// document has no focus, assuming that state has not changed
		//
		// another optimization is to not collect more state if we
		// have a pending update already running which indicates
		// that the connection is either slow or disconnected and
		// thus unhealthy.
		return document.hasFocus() && !this.hasPendingUpdate;
	}

	close(): void {

		// Safari: there is an issue where the page can hang on load when
		// a previous session has kept IndexedDB transactions running.
		// The only fix seems to be to cancel any pending transactions
		// (https://github.com/microsoft/vscode/issues/136295)
		//
		// On all other browsers, we keep the databases opened because
		// we expect data to be written when the unload happens.
		if (isSafari) {
			this.globalStorageDatabase?.close();
			this.workspaceStorageDatabase?.close();
		}

		// Always dispose to ensure that no timeouts or callbacks
		// get triggered in this phase.
		this.dispose();
	}

	async clear(): Promise<void> {

		// Clear key/values
		for (const scope of [StorageScope.GLOBAL, StorageScope.WORKSPACE]) {
			for (const target of [StorageTarget.USER, StorageTarget.MACHINE]) {
				for (const key of this.keys(scope, target)) {
					this.remove(key, scope);
				}
			}

			await this.getStorage(scope)?.whenFlushed();
		}

		// Clear databases
		await Promises.settled([
			this.globalStorageDatabase?.clear() ?? Promise.resolve(),
			this.workspaceStorageDatabase?.clear() ?? Promise.resolve()
		]);
	}
}

interface IIndexedDBStorageDatabase extends IStorageDatabase, IDisposable {

	/**
	 * Whether an update in the DB is currently pending
	 * (either update or delete operation).
	 */
	readonly hasPendingUpdate: boolean;

	/**
	 * For testing only.
	 */
	clear(): Promise<void>;
}

class InMemoryIndexedDBStorageDatabase extends InMemoryStorageDatabase implements IIndexedDBStorageDatabase {

	readonly hasPendingUpdate = false;

	async clear(): Promise<void> {
		(await this.getItems()).clear();
	}

	dispose(): void {
		// No-op
	}
}

interface IndexedDBStorageDatabaseOptions {
	id: string;
	broadcastChanges?: boolean;
}

export class IndexedDBStorageDatabase extends Disposable implements IIndexedDBStorageDatabase {

	static async create(options: IndexedDBStorageDatabaseOptions, logService: ILogService): Promise<IIndexedDBStorageDatabase> {
		try {
			const database = new IndexedDBStorageDatabase(options, logService);
			await database.whenConnected;

			return database;
		} catch (error) {
			logService.error(`[IndexedDB Storage ${options.id}] create(): ${toErrorMessage(error, true)}`);

			return new InMemoryIndexedDBStorageDatabase();
		}
	}

	private static readonly STORAGE_DATABASE_PREFIX = 'vscode-web-state-db-';
	private static readonly STORAGE_OBJECT_STORE = 'ItemTable';

	private static readonly STORAGE_BROADCAST_CHANNEL = 'vscode.web.state.changes';

	private readonly _onDidChangeItemsExternal = this._register(new Emitter<IStorageItemsChangeEvent>());
	readonly onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;

	private broadcastChannel: BroadcastChannel | undefined;

	private pendingUpdate: Promise<boolean> | undefined = undefined;
	get hasPendingUpdate(): boolean { return !!this.pendingUpdate; }

	private readonly name: string;
	private readonly whenConnected: Promise<IndexedDB>;

	private constructor(
		options: IndexedDBStorageDatabaseOptions,
		private readonly logService: ILogService
	) {
		super();

		this.name = `${IndexedDBStorageDatabase.STORAGE_DATABASE_PREFIX}${options.id}`;
		this.broadcastChannel = options.broadcastChanges && ('BroadcastChannel' in window) ? new BroadcastChannel(IndexedDBStorageDatabase.STORAGE_BROADCAST_CHANNEL) : undefined;

		this.whenConnected = this.connect();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Check for global storage change events from other
		// windows/tabs via `BroadcastChannel` mechanisms.
		if (this.broadcastChannel) {
			const listener = (event: MessageEvent) => {
				if (isStorageItemsChangeEvent(event.data)) {
					this._onDidChangeItemsExternal.fire(event.data);
				}
			};

			this.broadcastChannel.addEventListener('message', listener);
			this._register(toDisposable(() => {
				this.broadcastChannel?.removeEventListener('message', listener);
				this.broadcastChannel?.close();
			}));
		}
	}

	private async connect(): Promise<IndexedDB> {
		try {
			return await IndexedDB.create(this.name, undefined, [IndexedDBStorageDatabase.STORAGE_OBJECT_STORE]);
		} catch (error) {
			this.logService.error(`[IndexedDB Storage ${this.name}] connect() error: ${toErrorMessage(error)}`);

			throw error;
		}
	}

	async getItems(): Promise<Map<string, string>> {
		const db = await this.whenConnected;

		function isValid(value: unknown): value is string {
			return typeof value === 'string';
		}

		return db.getKeyValues<string>(IndexedDBStorageDatabase.STORAGE_OBJECT_STORE, isValid);
	}

	async updateItems(request: IUpdateRequest): Promise<void> {

		// Run the update
		let didUpdate = false;
		this.pendingUpdate = this.doUpdateItems(request);
		try {
			didUpdate = await this.pendingUpdate;
		} finally {
			this.pendingUpdate = undefined;
		}

		// Broadcast changes to other windows/tabs if enabled
		// and only if we actually did update storage items.
		if (this.broadcastChannel && didUpdate) {
			const event: IStorageItemsChangeEvent = {
				changed: request.insert,
				deleted: request.delete
			};

			this.broadcastChannel.postMessage(event);
		}
	}

	private async doUpdateItems(request: IUpdateRequest): Promise<boolean> {

		// Return early if the request is empty
		const toInsert = request.insert;
		const toDelete = request.delete;
		if ((!toInsert && !toDelete) || (toInsert?.size === 0 && toDelete?.size === 0)) {
			return false;
		}

		const db = await this.whenConnected;

		// Update `ItemTable` with inserts and/or deletes
		await db.runInTransaction(IndexedDBStorageDatabase.STORAGE_OBJECT_STORE, 'readwrite', objectStore => {
			const requests: IDBRequest[] = [];

			// Inserts
			if (toInsert) {
				for (const [key, value] of toInsert) {
					requests.push(objectStore.put(value, key));
				}
			}

			// Deletes
			if (toDelete) {
				for (const key of toDelete) {
					requests.push(objectStore.delete(key));
				}
			}

			return requests;
		});

		return true;
	}

	async close(): Promise<void> {
		const db = await this.whenConnected;

		// Wait for pending updates to having finished
		await this.pendingUpdate;

		// Finally, close IndexedDB
		return db.close();
	}

	async clear(): Promise<void> {
		const db = await this.whenConnected;

		await db.runInTransaction(IndexedDBStorageDatabase.STORAGE_OBJECT_STORE, 'readwrite', objectStore => objectStore.clear());
	}
}
