/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Database, Statement } from 'vscode-sqlite3';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { ThrottledDelayer, timeout } from 'vs/base/common/async';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { mapToString, setToString } from 'vs/base/common/map';
import { basename } from 'path';
import { mark } from 'vs/base/common/performance';
import { rename, unlinkIgnoreError, copy, renameIgnoreError } from 'vs/base/node/pfs';

export enum StorageHint {

	// A hint to the storage that the storage
	// does not exist on disk yet. This allows
	// the storage library to improve startup
	// time by not checking the storage for data.
	STORAGE_DOES_NOT_EXIST
}

export interface IStorageOptions {
	hint?: StorageHint;
}

export interface IUpdateRequest {
	insert?: Map<string, string>;
	delete?: Set<string>;
}

export interface IStorageItemsChangeEvent {
	items: Map<string, string>;
}

export interface IStorageDatabase {

	readonly onDidChangeItemsExternal: Event<IStorageItemsChangeEvent>;

	getItems(): Thenable<Map<string, string>>;
	updateItems(request: IUpdateRequest): Thenable<void>;

	close(): Thenable<void>;

	checkIntegrity(full: boolean): Thenable<string>;
}

export interface IStorage extends IDisposable {

	readonly items: Map<string, string>;
	readonly size: number;
	readonly onDidChangeStorage: Event<string>;

	init(): Thenable<void>;

	get(key: string, fallbackValue: string): string;
	get(key: string, fallbackValue?: string): string | undefined;

	getBoolean(key: string, fallbackValue: boolean): boolean;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined;

	getInteger(key: string, fallbackValue: number): number;
	getInteger(key: string, fallbackValue?: number): number | undefined;

	set(key: string, value: any): Thenable<void>;
	delete(key: string): Thenable<void>;

	beforeClose(): void;
	close(): Thenable<void>;

	checkIntegrity(full: boolean): Thenable<string>;
}

enum StorageState {
	None,
	Initialized,
	Closed
}

export class Storage extends Disposable implements IStorage {
	_serviceBrand: any;

	private static readonly DEFAULT_FLUSH_DELAY = 100;

	private _onDidChangeStorage: Emitter<string> = this._register(new Emitter<string>());
	get onDidChangeStorage(): Event<string> { return this._onDidChangeStorage.event; }

	private state = StorageState.None;

	private cache: Map<string, string> = new Map<string, string>();

	private flushDelayer: ThrottledDelayer<void>;
	private flushDelay = Storage.DEFAULT_FLUSH_DELAY;

	private pendingDeletes: Set<string> = new Set<string>();
	private pendingInserts: Map<string, string> = new Map();

	constructor(
		protected database: IStorageDatabase,
		private options: IStorageOptions = Object.create(null)
	) {
		super();

		this.flushDelayer = this._register(new ThrottledDelayer(this.flushDelay));

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.database.onDidChangeItemsExternal(e => this.onDidChangeItemsExternal(e)));
	}

	private onDidChangeItemsExternal(e: IStorageItemsChangeEvent): void {
		// items that change external require us to update our
		// caches with the values. we just accept the value and
		// emit an event if there is a change.
		e.items.forEach((value, key) => this.accept(key, value));
	}

	private accept(key: string, value: string): void {
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
			this._onDidChangeStorage.fire(key);
		}
	}

	get items(): Map<string, string> {
		return this.cache;
	}

	get size(): number {
		return this.cache.size;
	}

	init(): Thenable<void> {
		if (this.state !== StorageState.None) {
			return Promise.resolve(); // either closed or already initialized
		}

		this.state = StorageState.Initialized;

		if (this.options.hint === StorageHint.STORAGE_DOES_NOT_EXIST) {
			// return early if we know the storage file does not exist. this is a performance
			// optimization to not load all items of the underlying storage if we know that
			// there can be no items because the storage does not exist.
			return Promise.resolve();
		}

		return this.database.getItems().then(items => {
			this.cache = items;
		});
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

	getInteger(key: string, fallbackValue: number): number;
	getInteger(key: string, fallbackValue?: number): number | undefined;
	getInteger(key: string, fallbackValue?: number): number | undefined {
		const value = this.get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return parseInt(value, 10);
	}

	set(key: string, value: any): Thenable<void> {
		if (this.state === StorageState.Closed) {
			return Promise.resolve(); // Return early if we are already closed
		}

		// We remove the key for undefined/null values
		if (isUndefinedOrNull(value)) {
			return this.delete(key);
		}

		// Otherwise, convert to String and store
		const valueStr = String(value);

		// Return early if value already set
		const currentValue = this.cache.get(key);
		if (currentValue === valueStr) {
			return Promise.resolve();
		}

		// Update in cache and pending
		this.cache.set(key, valueStr);
		this.pendingInserts.set(key, valueStr);
		this.pendingDeletes.delete(key);

		// Event
		this._onDidChangeStorage.fire(key);

		// Accumulate work by scheduling after timeout
		return this.flushDelayer.trigger(() => this.flushPending(), this.flushDelay);
	}

	delete(key: string): Thenable<void> {
		if (this.state === StorageState.Closed) {
			return Promise.resolve(); // Return early if we are already closed
		}

		// Remove from cache and add to pending
		const wasDeleted = this.cache.delete(key);
		if (!wasDeleted) {
			return Promise.resolve(); // Return early if value already deleted
		}

		if (!this.pendingDeletes.has(key)) {
			this.pendingDeletes.add(key);
		}

		this.pendingInserts.delete(key);

		// Event
		this._onDidChangeStorage.fire(key);

		// Accumulate work by scheduling after timeout
		return this.flushDelayer.trigger(() => this.flushPending(), this.flushDelay);
	}

	beforeClose(): void {
		this.flushDelay = 0; // when we are about to close, reduce our flush delay to 0 to consume too much time
	}

	close(): Thenable<void> {
		if (this.state === StorageState.Closed) {
			return Promise.resolve(); // return if already closed
		}

		// Update state
		this.state = StorageState.Closed;

		// Trigger new flush to ensure data is persisted and then close
		// even if there is an error flushing. We must always ensure
		// the DB is closed to avoid corruption.
		const onDone = () => this.database.close();
		return this.flushDelayer.trigger(() => this.flushPending(), 0 /* as soon as possible */).then(onDone, onDone);
	}

	private flushPending(): Thenable<void> {
		if (this.pendingInserts.size === 0 && this.pendingDeletes.size === 0) {
			return Promise.resolve(); // return early if nothing to do
		}

		// Get pending data
		const updateRequest: IUpdateRequest = { insert: this.pendingInserts, delete: this.pendingDeletes };

		// Reset pending data for next run
		this.pendingDeletes = new Set<string>();
		this.pendingInserts = new Map<string, string>();

		// Update in storage
		return this.database.updateItems(updateRequest);
	}

	checkIntegrity(full: boolean): Thenable<string> {
		return this.database.checkIntegrity(full);
	}
}

interface IOpenDatabaseResult {
	db: Database;
	path: string;
}

export interface ISQLiteStorageDatabaseOptions {
	logging?: ISQLiteStorageDatabaseLoggingOptions;
}

export interface ISQLiteStorageDatabaseLoggingOptions {
	logError?: (error: string | Error) => void;
	logTrace?: (msg: string) => void;
}

export class SQLiteStorageDatabase implements IStorageDatabase {

	static IN_MEMORY_PATH = ':memory:';

	get onDidChangeItemsExternal(): Event<IStorageItemsChangeEvent> { return Event.None; } // since we are the only client, there can be no external changes

	private static measuredRequireDuration: boolean; // TODO@Ben remove me after a while

	private static BUSY_OPEN_TIMEOUT = 2000; // timeout in ms to retry when opening DB fails with SQLITE_BUSY

	private name: string;
	private logger: SQLiteStorageDatabaseLogger;

	private whenOpened: Promise<IOpenDatabaseResult>;

	constructor(path: string, options: ISQLiteStorageDatabaseOptions = Object.create(null)) {
		this.name = basename(path);
		this.logger = new SQLiteStorageDatabaseLogger(options.logging);

		this.whenOpened = this.open(path);
	}

	getItems(): Promise<Map<string, string>> {
		return this.whenOpened.then(({ db }) => {
			const items = new Map<string, string>();

			return this.all(db, 'SELECT * FROM ItemTable').then(rows => {
				rows.forEach(row => items.set(row.key, row.value));

				if (this.logger.isTracing) {
					this.logger.trace(`[storage ${this.name}] getItems(): ${mapToString(items)}`);
				}

				return items;
			});
		});
	}

	updateItems(request: IUpdateRequest): Promise<void> {
		let updateCount = 0;
		if (request.insert) {
			updateCount += request.insert.size;
		}
		if (request.delete) {
			updateCount += request.delete.size;
		}

		if (updateCount === 0) {
			return Promise.resolve();
		}

		if (this.logger.isTracing) {
			this.logger.trace(`[storage ${this.name}] updateItems(): insert(${request.insert ? mapToString(request.insert) : '0'}), delete(${request.delete ? setToString(request.delete) : '0'})`);
		}

		return this.whenOpened.then(({ db }) => {
			return this.transaction(db, () => {
				if (request.insert && request.insert.size > 0) {
					this.prepare(db, 'INSERT INTO ItemTable VALUES (?,?)', stmt => {
						request.insert!.forEach((value, key) => {
							stmt.run([key, value]);
						});
					});
				}

				if (request.delete && request.delete.size) {
					this.prepare(db, 'DELETE FROM ItemTable WHERE key=?', stmt => {
						request.delete!.forEach(key => {
							stmt.run(key);
						});
					});
				}
			});
		});
	}

	close(): Promise<void> {
		this.logger.trace(`[storage ${this.name}] close()`);

		return this.whenOpened.then(result => {
			return new Promise((resolve, reject) => {
				result.db.close(error => {
					if (error) {
						this.logger.error(`[storage ${this.name}] close(): ${error}`);

						return reject(error);
					}

					// If the DB closed successfully and we are not running in-memory
					// make a backup of the DB so that we can use it as fallback in
					// case the actual DB becomes corrupt.
					if (result.path !== SQLiteStorageDatabase.IN_MEMORY_PATH) {
						return this.backup(result).then(resolve, error => {
							this.logger.error(`[storage ${this.name}] backup(): ${error}`);

							return resolve(); // ignore failing backup
						});
					}

					return resolve();
				});
			});
		});
	}

	private backup(db: IOpenDatabaseResult): Promise<void> {
		if (db.path === SQLiteStorageDatabase.IN_MEMORY_PATH) {
			return Promise.resolve(); // no backups when running in-memory
		}

		const backupPath = this.toBackupPath(db.path);

		return unlinkIgnoreError(backupPath).then(() => copy(db.path, backupPath));
	}

	private toBackupPath(path: string): string {
		return `${path}.backup`;
	}

	checkIntegrity(full: boolean): Promise<string> {
		this.logger.trace(`[storage ${this.name}] checkIntegrity(full: ${full})`);

		return this.whenOpened.then(({ db }) => {
			return this.get(db, full ? 'PRAGMA integrity_check' : 'PRAGMA quick_check').then(row => {
				return full ? row['integrity_check'] : row['quick_check'];
			});
		});
	}

	private open(path: string): Promise<IOpenDatabaseResult> {
		this.logger.trace(`[storage ${this.name}] open()`);

		return new Promise((resolve, reject) => {
			const fallbackToInMemoryDatabase = (error: Error) => {
				this.logger.error(`[storage ${this.name}] open(): Error (open DB): ${error}`);
				this.logger.error(`[storage ${this.name}] open(): Falling back to in-memory DB`);

				// In case of any error to open the DB, use an in-memory
				// DB so that we always have a valid DB to talk to.
				this.doOpen(SQLiteStorageDatabase.IN_MEMORY_PATH).then(resolve, reject);
			};

			this.doOpen(path).then(resolve, error => {

				// TODO@Ben check if this is still happening. This error code should only arise if
				// another process is locking the same DB we want to open at that time. This typically
				// never happens because a DB connection is limited per window. However, in the event
				// of a window reload, it may be possible that the previous connection was not properly
				// closed while the new connection is already established.
				if (error.code === 'SQLITE_BUSY') {
					return this.handleSQLiteBusy(path).then(resolve, fallbackToInMemoryDatabase);
				}

				// This error code indicates that even though the DB file exists,
				// SQLite cannot open it and signals it is corrupt or not a DB.
				if (error.code === 'SQLITE_CORRUPT' || error.code === 'SQLITE_NOTADB') {
					return this.handleSQLiteCorrupt(path, error).then(resolve, fallbackToInMemoryDatabase);
				}

				// Otherwise give up and fallback to in-memory DB
				return fallbackToInMemoryDatabase(error);
			});
		});
	}

	private handleSQLiteBusy(path: string): Promise<IOpenDatabaseResult> {
		this.logger.error(`[storage ${this.name}] open(): Retrying after ${SQLiteStorageDatabase.BUSY_OPEN_TIMEOUT}ms due to SQLITE_BUSY`);

		// Retry after some time if the DB is busy
		return timeout(SQLiteStorageDatabase.BUSY_OPEN_TIMEOUT).then(() => this.doOpen(path));
	}

	private handleSQLiteCorrupt(path: string, error: any): Promise<IOpenDatabaseResult> {
		this.logger.error(`[storage ${this.name}] open(): Unable to open DB due to ${error.code}`);

		// Move corrupt DB to a different filename and try to load from backup
		// If that fails, a new empty DB is being created automatically
		return rename(path, this.toCorruptPath(path))
			.then(() => renameIgnoreError(this.toBackupPath(path), path))
			.then(() => this.doOpen(path));
	}

	private toCorruptPath(path: string): string {
		const randomSuffix = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 4);

		return `${path}.${randomSuffix}.corrupt`;
	}

	private doOpen(path: string): Promise<IOpenDatabaseResult> {
		// TODO@Ben clean up performance markers
		return new Promise((resolve, reject) => {
			let measureRequireDuration = false;
			if (!SQLiteStorageDatabase.measuredRequireDuration) {
				SQLiteStorageDatabase.measuredRequireDuration = true;
				measureRequireDuration = true;

				mark('willRequireSQLite');
			}
			import('vscode-sqlite3').then(sqlite3 => {
				if (measureRequireDuration) {
					mark('didRequireSQLite');
				}

				const db: Database = new (this.logger.isTracing ? sqlite3.verbose().Database : sqlite3.Database)(path, error => {
					if (error) {
						return db ? db.close(() => reject(error)) : reject(error);
					}

					// The following exec() statement serves two purposes:
					// - create the DB if it does not exist yet
					// - validate that the DB is not corrupt (the open() call does not throw otherwise)
					mark('willSetupSQLiteSchema');
					this.exec(db, [
						'PRAGMA user_version = 1;',
						'CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)'
					].join('')).then(() => {
						mark('didSetupSQLiteSchema');

						return resolve({ path, db });
					}, error => {
						mark('didSetupSQLiteSchema');

						return db.close(() => reject(error));
					});
				});

				// Errors
				db.on('error', error => this.logger.error(`[storage ${this.name}] Error (event): ${error}`));

				// Tracing
				if (this.logger.isTracing) {
					db.on('trace', sql => this.logger.trace(`[storage ${this.name}] Trace (event): ${sql}`));
				}
			});
		});
	}

	private exec(db: Database, sql: string): Promise<void> {
		return new Promise((resolve, reject) => {
			db.exec(sql, error => {
				if (error) {
					this.logger.error(`[storage ${this.name}] exec(): ${error}`);

					return reject(error);
				}

				return resolve();
			});
		});
	}

	private get(db: Database, sql: string): Promise<object> {
		return new Promise((resolve, reject) => {
			db.get(sql, (error, row) => {
				if (error) {
					this.logger.error(`[storage ${this.name}] get(): ${error}`);

					return reject(error);
				}

				return resolve(row);
			});
		});
	}

	private all(db: Database, sql: string): Promise<{ key: string, value: string }[]> {
		return new Promise((resolve, reject) => {
			db.all(sql, (error, rows) => {
				if (error) {
					this.logger.error(`[storage ${this.name}] all(): ${error}`);

					return reject(error);
				}

				return resolve(rows);
			});
		});
	}

	private transaction(db: Database, transactions: () => void): Promise<void> {
		return new Promise((resolve, reject) => {
			db.serialize(() => {
				db.run('BEGIN TRANSACTION');

				transactions();

				db.run('END TRANSACTION', error => {
					if (error) {
						this.logger.error(`[storage ${this.name}] transaction(): ${error}`);

						return reject(error);
					}

					return resolve();
				});
			});
		});
	}

	private prepare(db: Database, sql: string, runCallback: (stmt: Statement) => void): void {
		const stmt = db.prepare(sql);

		const statementErrorListener = error => {
			this.logger.error(`[storage ${this.name}] prepare(): ${error} (${sql})`);
		};

		stmt.on('error', statementErrorListener);

		runCallback(stmt);

		stmt.finalize(error => {
			if (error) {
				statementErrorListener(error);
			}

			stmt.removeListener('error', statementErrorListener);
		});
	}
}

class SQLiteStorageDatabaseLogger {
	private readonly logTrace: (msg: string) => void;
	private readonly logError: (error: string | Error) => void;

	constructor(options?: ISQLiteStorageDatabaseLoggingOptions) {
		if (options && typeof options.logTrace === 'function') {
			this.logTrace = options.logTrace;
		}

		if (options && typeof options.logError === 'function') {
			this.logError = options.logError;
		}
	}

	get isTracing(): boolean {
		return !!this.logTrace;
	}

	trace(msg: string): void {
		if (this.logTrace) {
			this.logTrace(msg);
		}
	}

	error(error: string | Error): void {
		if (this.logError) {
			this.logError(error);
		}
	}
}

export class InMemoryStorageDatabase implements IStorageDatabase {

	readonly onDidChangeItemsExternal = Event.None;

	private items = new Map<string, string>();

	getItems(): Thenable<Map<string, string>> {
		return Promise.resolve(this.items);
	}

	updateItems(request: IUpdateRequest): Thenable<void> {
		if (request.insert) {
			request.insert.forEach((value, key) => this.items.set(key, value));
		}

		if (request.delete) {
			request.delete.forEach(key => this.items.delete(key));
		}

		return Promise.resolve();
	}

	close(): Thenable<void> {
		return Promise.resolve();
	}

	checkIntegrity(full: boolean): Thenable<string> {
		return Promise.resolve('ok');
	}
}