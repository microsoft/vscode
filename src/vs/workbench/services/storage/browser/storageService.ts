/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BroadcastDataChannel } from '../../../../base/browser/broadcast.js';
import { isSafari } from '../../../../base/browser/browser.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { IndexedDB } from '../../../../base/browser/indexedDB.js';
import { DeferredPromise, Promises } from '../../../../base/common/async.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { InMemoryStorageDatabase, isStorageItemsChangeEvent, IStorage, IStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest, Storage } from '../../../../base/parts/storage/common/storage.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractStorageService, isProfileUsingDefaultStorage, IS_NEW_KEY, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { isUserDataProfile, IUserDataProfile } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IAnyWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';

export class BrowserStorageService extends AbstractStorageService {

	private static BROWSER_DEFAULT_FLUSH_INTERVAL = 5 * 1000; // every 5s because async operations are not permitted on shutdown

	private applicationStorage: IStorage | undefined;
	private applicationStorageDatabase: IIndexedDBStorageDatabase | undefined;
	private readonly applicationStoragePromise = new DeferredPromise<{ indexedDb: IIndexedDBStorageDatabase; storage: IStorage }>();

	private profileStorage: IStorage | undefined;
	private profileStorageDatabase: IIndexedDBStorageDatabase | undefined;
	private profileStorageProfile: IUserDataProfile;
	private readonly profileStorageDisposables = this._register(new DisposableStore());

	private workspaceStorage: IStorage | undefined;
	private workspaceStorageDatabase: IIndexedDBStorageDatabase | undefined;

	get hasPendingUpdate(): boolean {
		return Boolean(
			this.applicationStorageDatabase?.hasPendingUpdate ||
			this.profileStorageDatabase?.hasPendingUpdate ||
			this.workspaceStorageDatabase?.hasPendingUpdate
		);
	}

	constructor(
		private readonly workspace: IAnyWorkspaceIdentifier,
		private readonly userDataProfileService: IUserDataProfileService,
		@ILogService private readonly logService: ILogService,
	) {
		super({ flushInterval: BrowserStorageService.BROWSER_DEFAULT_FLUSH_INTERVAL });

		this.profileStorageProfile = this.userDataProfileService.currentProfile;

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(e => e.join(this.switchToProfile(e.profile))));
	}

	protected async doInitialize(): Promise<void> {

		// Init storages
		await Promises.settled([
			this.createApplicationStorage(),
			this.createProfileStorage(this.profileStorageProfile),
			this.createWorkspaceStorage()
		]);
	}

	private async createApplicationStorage(): Promise<void> {
		const applicationStorageIndexedDB = await IndexedDBStorageDatabase.createApplicationStorage(this.logService);

		this.applicationStorageDatabase = this._register(applicationStorageIndexedDB);
		this.applicationStorage = this._register(new Storage(this.applicationStorageDatabase));

		this._register(this.applicationStorage.onDidChangeStorage(e => this.emitDidChangeValue(StorageScope.APPLICATION, e)));

		await this.applicationStorage.init();

		this.updateIsNew(this.applicationStorage);

		this.applicationStoragePromise.complete({ indexedDb: applicationStorageIndexedDB, storage: this.applicationStorage });
	}

	private async createProfileStorage(profile: IUserDataProfile): Promise<void> {

		// First clear any previously associated disposables
		this.profileStorageDisposables.clear();

		// Remember profile associated to profile storage
		this.profileStorageProfile = profile;

		if (isProfileUsingDefaultStorage(this.profileStorageProfile)) {

			// If we are using default profile storage, the profile storage is
			// actually the same as application storage. As such we
			// avoid creating the storage library a second time on
			// the same DB.

			const { indexedDb: applicationStorageIndexedDB, storage: applicationStorage } = await this.applicationStoragePromise.p;

			this.profileStorageDatabase = applicationStorageIndexedDB;
			this.profileStorage = applicationStorage;

			this.profileStorageDisposables.add(this.profileStorage.onDidChangeStorage(e => this.emitDidChangeValue(StorageScope.PROFILE, e)));
		} else {
			const profileStorageIndexedDB = await IndexedDBStorageDatabase.createProfileStorage(this.profileStorageProfile, this.logService);

			this.profileStorageDatabase = this.profileStorageDisposables.add(profileStorageIndexedDB);
			this.profileStorage = this.profileStorageDisposables.add(new Storage(this.profileStorageDatabase));

			this.profileStorageDisposables.add(this.profileStorage.onDidChangeStorage(e => this.emitDidChangeValue(StorageScope.PROFILE, e)));

			await this.profileStorage.init();

			this.updateIsNew(this.profileStorage);
		}
	}

	private async createWorkspaceStorage(): Promise<void> {
		const workspaceStorageIndexedDB = await IndexedDBStorageDatabase.createWorkspaceStorage(this.workspace.id, this.logService);

		this.workspaceStorageDatabase = this._register(workspaceStorageIndexedDB);
		this.workspaceStorage = this._register(new Storage(this.workspaceStorageDatabase));

		this._register(this.workspaceStorage.onDidChangeStorage(e => this.emitDidChangeValue(StorageScope.WORKSPACE, e)));

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
			case StorageScope.PROFILE:
				return this.profileStorage;
			default:
				return this.workspaceStorage;
		}
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		switch (scope) {
			case StorageScope.APPLICATION:
				return this.applicationStorageDatabase?.name;
			case StorageScope.PROFILE:
				return this.profileStorageDatabase?.name;
			default:
				return this.workspaceStorageDatabase?.name;
		}
	}

	protected async switchToProfile(toProfile: IUserDataProfile): Promise<void> {
		if (!this.canSwitchProfile(this.profileStorageProfile, toProfile)) {
			return;
		}

		const oldProfileStorage = assertIsDefined(this.profileStorage);
		const oldItems = oldProfileStorage.items;

		// Close old profile storage but only if this is
		// different from application storage!
		if (oldProfileStorage !== this.applicationStorage) {
			await oldProfileStorage.close();
		}

		// Create new profile storage & init
		await this.createProfileStorage(toProfile);

		// Handle data switch and eventing
		this.switchData(oldItems, assertIsDefined(this.profileStorage), StorageScope.PROFILE);
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
		return getActiveWindow().document.hasFocus() && !this.hasPendingUpdate;
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
			this.profileStorageDatabase?.close();
			this.workspaceStorageDatabase?.close();
		}

		// Always dispose to ensure that no timeouts or callbacks
		// get triggered in this phase.
		this.dispose();
	}

	async clear(): Promise<void> {

		// Clear key/values
		for (const scope of [StorageScope.APPLICATION, StorageScope.PROFILE, StorageScope.WORKSPACE]) {
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
			this.profileStorageDatabase?.clear() ?? Promise.resolve(),
			this.workspaceStorageDatabase?.clear() ?? Promise.resolve()
		]);
	}

	hasScope(scope: IAnyWorkspaceIdentifier | IUserDataProfile): boolean {
		if (isUserDataProfile(scope)) {
			return this.profileStorageProfile.id === scope.id;
		}

		return this.workspace.id === scope.id;
	}
}

interface IIndexedDBStorageDatabase extends IStorageDatabase, IDisposable {

	/**
	 * Name of the database.
	 */
	readonly name: string;

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
	readonly name = 'in-memory-indexedb-storage';

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

	static async createApplicationStorage(logService: ILogService): Promise<IIndexedDBStorageDatabase> {
		return IndexedDBStorageDatabase.create({ id: 'global', broadcastChanges: true }, logService);
	}

	static async createProfileStorage(profile: IUserDataProfile, logService: ILogService): Promise<IIndexedDBStorageDatabase> {
		return IndexedDBStorageDatabase.create({ id: `global-${profile.id}`, broadcastChanges: true }, logService);
	}

	static async createWorkspaceStorage(workspaceId: string, logService: ILogService): Promise<IIndexedDBStorageDatabase> {
		return IndexedDBStorageDatabase.create({ id: workspaceId }, logService);
	}

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

	private readonly _onDidChangeItemsExternal = this._register(new Emitter<IStorageItemsChangeEvent>());
	readonly onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;

	private broadcastChannel: BroadcastDataChannel<IStorageItemsChangeEvent> | undefined;

	private pendingUpdate: Promise<boolean> | undefined = undefined;
	get hasPendingUpdate(): boolean { return !!this.pendingUpdate; }

	readonly name: string;
	private readonly whenConnected: Promise<IndexedDB>;

	private constructor(
		options: IndexedDBStorageDatabaseOptions,
		private readonly logService: ILogService
	) {
		super();

		this.name = `${IndexedDBStorageDatabase.STORAGE_DATABASE_PREFIX}${options.id}`;
		this.broadcastChannel = options.broadcastChanges ? this._register(new BroadcastDataChannel<IStorageItemsChangeEvent>(this.name)) : undefined;

		this.whenConnected = this.connect();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Check for storage change events from other
		// windows/tabs via `BroadcastChannel` mechanisms.
		if (this.broadcastChannel) {
			this._register(this.broadcastChannel.onDidReceiveData(data => {
				if (isStorageItemsChangeEvent(data)) {
					this._onDidChangeItemsExternal.fire(data);
				}
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

			this.broadcastChannel.postData(event);
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

	async optimize(): Promise<void> {
		// not suported in IndexedDB
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
