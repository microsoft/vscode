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
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IAnyWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class BrowserStorageService extends AbstractStorageService {

	private static BROWSER_DEFAULT_FLUSH_INTERVAL = 5 * 1000; // every 5s because async operations are not permitted on shutdown

	private applicationStorage: IStorage | undefined;
	private globalStorage: IStorage | undefined;
	private workspaceStorage: IStorage | undefined;

	private applicationStorageDatabase: IIndexedDBStorageDatabase | undefined;
	private globalStorageDatabase: IIndexedDBStorageDatabase | undefined;
	private workspaceStorageDatabase: IIndexedDBStorageDatabase | undefined;

	get hasPendingUpdate(): boolean {
		return Boolean(
			this.applicationStorageDatabase?.hasPendingUpdate ||
			this.globalStorageDatabase?.hasPendingUpdate ||
			this.workspaceStorageDatabase?.hasPendingUpdate
		);
	}

	constructor(
		private readonly payload: IAnyWorkspaceIdentifier,
		@ILogService private readonly logService: ILogService,
		@IUserDataProfilesService private readonly userDataProfileService: IUserDataProfilesService
	) {
		super({ flushInterval: BrowserStorageService.BROWSER_DEFAULT_FLUSH_INTERVAL });
	}

	private getId(scope: StorageScope): string {
		switch (scope) {
			case StorageScope.APPLICATION:
				return 'global'; // use the default profile global DB for application scope
			case StorageScope.GLOBAL:
				if (this.userDataProfileService.currentProfile.isDefault) {
					return 'global'; // default profile DB has a fixed name for backwards compatibility
				} else {
					return `global-${this.userDataProfileService.currentProfile.id}`;
				}
			case StorageScope.WORKSPACE:
				return this.payload.id;
		}
	}

	protected async doInitialize(): Promise<void> {

		// Create Storage in Parallel
		const promises: Promise<IIndexedDBStorageDatabase>[] = [];
		promises.push(IndexedDBStorageDatabase.create({ id: this.getId(StorageScope.APPLICATION), broadcastChanges: true }, this.logService));
		promises.push(IndexedDBStorageDatabase.create({ id: this.getId(StorageScope.WORKSPACE) }, this.logService));
		if (!this.userDataProfileService.currentProfile.isDefault) {

			// If we are in default profile, the global storage is
			// actually the same as application storage. As such we
			// avoid creating the storage library a second time on
			// the same DB.

			promises.push(IndexedDBStorageDatabase.create({ id: this.getId(StorageScope.GLOBAL), broadcastChanges: true }, this.logService));
		}
		const [applicationStorageDatabase, workspaceStorageDatabase, globalStorageDatabase] = await Promises.settled(promises);

		// Workspace Storage
		this.workspaceStorageDatabase = this._register(workspaceStorageDatabase);
		this.workspaceStorage = this._register(new Storage(this.workspaceStorageDatabase));
		this._register(this.workspaceStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.WORKSPACE, key)));

		// Application Storage
		this.applicationStorageDatabase = this._register(applicationStorageDatabase);
		this.applicationStorage = this._register(new Storage(this.applicationStorageDatabase));
		this._register(this.applicationStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.APPLICATION, key)));

		// Global Storage
		if (globalStorageDatabase) {
			this.globalStorageDatabase = this._register(globalStorageDatabase);
			this.globalStorage = this._register(new Storage(this.globalStorageDatabase));
		} else {
			this.globalStorage = this.applicationStorage;
		}
		this._register(this.globalStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.GLOBAL, key)));

		// Init storages
		await Promises.settled([
			this.workspaceStorage.init(),
			this.globalStorage.init(),
			this.applicationStorage.init()
		]);

		// Apply is-new markers
		for (const storage of [this.applicationStorage, this.globalStorage, this.workspaceStorage]) {
			const firstOpen = storage.getBoolean(IS_NEW_KEY);
			if (firstOpen === undefined) {
				storage.set(IS_NEW_KEY, true);
			} else if (firstOpen) {
				storage.set(IS_NEW_KEY, false);
			}
		}
	}

	protected getStorage(scope: StorageScope): IStorage | undefined {
		switch (scope) {
			case StorageScope.APPLICATION:
				return this.applicationStorage;
			case StorageScope.GLOBAL:
				return this.globalStorage;
			default:
				return this.workspaceStorage;
		}
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		return this.getId(scope);
	}

	async migrate(toWorkspace: IAnyWorkspaceIdentifier): Promise<void> {
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
			this.applicationStorage?.close();
			this.globalStorageDatabase?.close();
			this.workspaceStorageDatabase?.close();
		}

		// Always dispose to ensure that no timeouts or callbacks
		// get triggered in this phase.
		this.dispose();
	}

	async clear(): Promise<void> {

		// Clear key/values
		for (const scope of [StorageScope.APPLICATION, StorageScope.GLOBAL, StorageScope.WORKSPACE]) {
			for (const target of [StorageTarget.USER, StorageTarget.MACHINE]) {
				for (const key of this.keys(scope, target)) {
					this.remove(key, scope);
				}
			}

			await this.getStorage(scope)?.whenFlushed();
		}

		// Clear databases
		await Promises.settled([
			this.applicationStorageDatabase?.clear() ?? Promise.resolve(),
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
