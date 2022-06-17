/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSafari } from 'vs/base/browser/browser';
import { IndexedDB } from 'vs/base/browser/indexedDB';
import { DeferredPromise, Promises } from 'vs/base/common/async';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { assertIsDefined } from 'vs/base/common/types';
import { InMemoryStorageDatabase, isStorageItemsChangeEvent, IStorage, IStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest, Storage } from 'vs/base/parts/storage/common/storage';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractStorageService, IS_NEW_KEY, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IAnyWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class BrowserStorageService extends AbstractStorageService {

	private static BROWSER_DEFAULT_FLUSH_INTERVAL = 5 * 1000; // every 5s because async operations are not permitted on shutdown

	private applicationStorage: IStorage | undefined;
	private applicationStorageDatabase: IIndexedDBStorageDatabase | undefined;
	private readonly applicationStoragePromise = new DeferredPromise<{ indededDb: IIndexedDBStorageDatabase; storage: IStorage }>();

	private globalStorage: IStorage | undefined;
	private globalStorageDatabase: IIndexedDBStorageDatabase | undefined;
	private globalStorageProfile: IUserDataProfile;
	private readonly globalStorageDisposables = this._register(new DisposableStore());

	private workspaceStorage: IStorage | undefined;
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
		currentProfile: IUserDataProfile,
		@ILogService private readonly logService: ILogService,
	) {
		super({ flushInterval: BrowserStorageService.BROWSER_DEFAULT_FLUSH_INTERVAL });

		this.globalStorageProfile = currentProfile;
	}

	private getId(scope: StorageScope): string {
		switch (scope) {
			case StorageScope.APPLICATION:
				return 'global'; // use the default profile global DB for application scope
			case StorageScope.GLOBAL:
				if (this.globalStorageProfile.isDefault) {
					return 'global'; // default profile DB has a fixed name for backwards compatibility
				} else {
					return `global-${this.globalStorageProfile.id}`;
				}
			case StorageScope.WORKSPACE:
				return this.payload.id;
		}
	}

	protected async doInitialize(): Promise<void> {

		// Init storages
		await Promises.settled([
			this.createApplicationStorage(),
			this.createGlobalStorage(this.globalStorageProfile),
			this.createWorkspaceStorage()
		]);
	}

	private async createApplicationStorage(): Promise<void> {
		const applicationStorageIndexedDB = await IndexedDBStorageDatabase.create({ id: this.getId(StorageScope.APPLICATION), broadcastChanges: true }, this.logService);

		this.applicationStorageDatabase = this._register(applicationStorageIndexedDB);
		this.applicationStorage = this._register(new Storage(this.applicationStorageDatabase));

		this._register(this.applicationStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.APPLICATION, key)));

		await this.applicationStorage.init();

		this.updateIsNew(this.applicationStorage);

		this.applicationStoragePromise.complete({ indededDb: applicationStorageIndexedDB, storage: this.applicationStorage });
	}

	private async createGlobalStorage(profile: IUserDataProfile): Promise<void> {

		// First clear any previously associated disposables
		this.globalStorageDisposables.clear();

		// Remember profile associated to global storage
		this.globalStorageProfile = profile;

		if (this.globalStorageProfile.isDefault) {

			// If we are in default profile, the global storage is
			// actually the same as application storage. As such we
			// avoid creating the storage library a second time on
			// the same DB.

			const { indededDb: applicationStorageIndexedDB, storage: applicationStorage } = await this.applicationStoragePromise.p;

			this.globalStorageDatabase = applicationStorageIndexedDB;
			this.globalStorage = applicationStorage;
		} else {
			const globalStorageIndexedDB = await IndexedDBStorageDatabase.create({ id: this.getId(StorageScope.GLOBAL), broadcastChanges: true }, this.logService);

			this.globalStorageDatabase = this.globalStorageDisposables.add(globalStorageIndexedDB);
			this.globalStorage = this.globalStorageDisposables.add(new Storage(this.globalStorageDatabase));
		}

		this.globalStorageDisposables.add(this.globalStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.GLOBAL, key)));

		await this.globalStorage.init();

		this.updateIsNew(this.globalStorage);
	}

	private async createWorkspaceStorage(): Promise<void> {
		const workspaceStorageIndexedDB = await IndexedDBStorageDatabase.create({ id: this.getId(StorageScope.WORKSPACE) }, this.logService);

		this.workspaceStorageDatabase = this._register(workspaceStorageIndexedDB);
		this.workspaceStorage = this._register(new Storage(this.workspaceStorageDatabase));

		this._register(this.workspaceStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.WORKSPACE, key)));

		await this.workspaceStorage.init();

		this.updateIsNew(this.workspaceStorage);
	}

	private updateIsNew(storage: IStorage): void {
		const firstOpen = storage.getBoolean(IS_NEW_KEY);
		if (firstOpen === undefined) {
			storage.set(IS_NEW_KEY, true);
		} else if (firstOpen) {
			storage.set(IS_NEW_KEY, false);
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

	protected async switchToProfile(toProfile: IUserDataProfile, preserveData: boolean): Promise<void> {
		const oldGlobalStorage = assertIsDefined(this.globalStorage);
		const oldItems = oldGlobalStorage.items;

		// Close old global storage but only if this is
		// different from application storage!
		if (oldGlobalStorage !== this.applicationStorage) {
			await oldGlobalStorage.close();
		}

		// Create new global storage & init
		await this.createGlobalStorage(toProfile);

		// Handle data switch and eventing
		this.switchData(oldItems, assertIsDefined(this.globalStorage), StorageScope.GLOBAL, preserveData);
	}

	protected async switchToWorkspace(toWorkspace: IAnyWorkspaceIdentifier, preserveData: boolean): Promise<void> {
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
