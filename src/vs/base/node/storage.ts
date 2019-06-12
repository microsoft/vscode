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
import { basename } from 'vs/base/common/path';
import { copy, renameIgnoreError, unlink } from 'vs/base/node/pfs';
import { fill } from 'vs/base/common/arrays';

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

	getItems(): Promise<Map<string, string>>;
	updateItems(request: IUpdateRequest): Promise<void>;

	close(recovery?: () => Map<string, string>): Promise<void>;

	checkIntegrity(full: boolean): Promise<string>;
}

export interface IStorage extends IDisposable {

	readonly items: Map<string, string>;
	readonly size: number;
	readonly onDidChangeStorage: Event<string>;

	init(): Promise<void>;

	get(key: string, fallbackValue: string): string;
	get(key: string, fallbackValue?: string): string | undefined;

	getBoolean(key: string, fallbackValue: boolean): boolean;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined;

	getNumber(key: string, fallbackValue: number): number;
	getNumber(key: string, fallbackValue?: number): number | undefined;

	set(key: string, value: string | boolean | number | undefined | null): Promise<void>;
	delete(key: string): Promise<void>;

	close(): Promise<void>;

	checkIntegrity(full: boolean): Promise<string>;
}

enum StorageState {
	None,
	Initialized,
	Closed
}

export class Storage extends Disposable implements IStorage {
	_serviceBrand: any;

	private static readonly DEFAULT_FLUSH_DELAY = 100;

	private readonly _onDidChangeStorage: Emitter<string> = this._register(new Emitter<string>());
	get onDidChangeStorage(): Event<string> { return this._onDidChangeStorage.event; }

	private state = StorageState.None;

	private cache: Map<string, string> = new Map<string, string>();

	private flushDelayer: ThrottledDelayer<void>;

	private pendingDeletes: Set<string> = new Set<string>();
	private pendingInserts: Map<string, string> = new Map();

	constructor(
		protected database: IStorageDatabase,
		private options: IStorageOptions = Object.create(null)
	) {
		super();

		this.flushDelayer = this._register(new ThrottledDelayer(Storage.DEFAULT_FLUSH_DELAY));

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

	async init(): Promise<void> {
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

	set(key: string, value: string | boolean | number | null | undefined): Promise<void> {
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
		return this.flushDelayer.trigger(() => this.flushPending());
	}

	delete(key: string): Promise<void> {
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
		return this.flushDelayer.trigger(() => this.flushPending());
	}

	async close(): Promise<void> {
		if (this.state === StorageState.Closed) {
			return Promise.resolve(); // return if already closed
		}

		// Update state
		this.state = StorageState.Closed;

		// Trigger new flush to ensure data is persisted and then close
		// even if there is an error flushing. We must always ensure
		// the DB is closed to avoid corruption.
		//
		// Recovery: we pass our cache over as recovery option in case
		// the DB is not healthy.
		try {
			await this.flushDelayer.trigger(() => this.flushPending(), 0 /* as soon as possible */);
		} catch (error) {
			// Ignore
		}

		await this.database.close(() => this.cache);
	}

	private flushPending(): Promise<void> {
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

	checkIntegrity(full: boolean): Promise<string> {
		return this.database.checkIntegrity(full);
	}
}

interface IDatabaseConnection {
	db: Database;

	isInMemory: boolean;

	isErroneous?: boolean;
	lastError?: string;
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

	private static BUSY_OPEN_TIMEOUT = 2000; // timeout in ms to retry when opening DB fails with SQLITE_BUSY
	private static MAX_HOST_PARAMETERS = 256; // maximum number of parameters within a statement

	private path: string;
	private name: string;

	private logger: SQLiteStorageDatabaseLogger;

	private whenConnected: Promise<IDatabaseConnection>;

	constructor(path: string, options: ISQLiteStorageDatabaseOptions = Object.create(null)) {
		this.path = path;
		this.name = basename(path);

		this.logger = new SQLiteStorageDatabaseLogger(options.logging);

		this.whenConnected = this.connect(path);
	}

	async getItems(): Promise<Map<string, string>> {
		const connection = await this.whenConnected;

		const items = new Map<string, string>();

		const rows = await this.all(connection, 'SELECT * FROM ItemTable');
		rows.forEach(row => items.set(row.key, row.value));

		if (this.logger.isTracing) {
			this.logger.trace(`[storage ${this.name}] getItems(): ${items.size} rows`);
		}

		return items;
	}

	async updateItems(request: IUpdateRequest): Promise<void> {
		const connection = await this.whenConnected;

		return this.doUpdateItems(connection, request);
	}

	private doUpdateItems(connection: IDatabaseConnection, request: IUpdateRequest): Promise<void> {
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

		return this.transaction(connection, () => {

			// INSERT
			if (request.insert && request.insert.size > 0) {
				const keysValuesChunks: (string[])[] = [];
				keysValuesChunks.push([]); // seed with initial empty chunk

				// Split key/values into chunks of SQLiteStorageDatabase.MAX_HOST_PARAMETERS
				// so that we can efficiently run the INSERT with as many HOST parameters as possible
				let currentChunkIndex = 0;
				request.insert.forEach((value, key) => {
					let keyValueChunk = keysValuesChunks[currentChunkIndex];

					if (keyValueChunk.length > SQLiteStorageDatabase.MAX_HOST_PARAMETERS) {
						currentChunkIndex++;
						keyValueChunk = [];
						keysValuesChunks.push(keyValueChunk);
					}

					keyValueChunk.push(key, value);
				});

				keysValuesChunks.forEach(keysValuesChunk => {
					this.prepare(connection, `INSERT INTO ItemTable VALUES ${fill(keysValuesChunk.length / 2, '(?,?)').join(',')}`, stmt => stmt.run(keysValuesChunk), () => {
						const keys: string[] = [];
						let length = 0;
						request.insert!.forEach((value, key) => {
							keys.push(key);
							length += value.length;
						});

						return `Keys: ${keys.join(', ')} Length: ${length}`;
					});
				});
			}

			// DELETE
			if (request.delete && request.delete.size) {
				const keysChunks: (string[])[] = [];
				keysChunks.push([]); // seed with initial empty chunk

				// Split keys into chunks of SQLiteStorageDatabase.MAX_HOST_PARAMETERS
				// so that we can efficiently run the DELETE with as many HOST parameters
				// as possible
				let currentChunkIndex = 0;
				request.delete.forEach(key => {
					let keyChunk = keysChunks[currentChunkIndex];

					if (keyChunk.length > SQLiteStorageDatabase.MAX_HOST_PARAMETERS) {
						currentChunkIndex++;
						keyChunk = [];
						keysChunks.push(keyChunk);
					}

					keyChunk.push(key);
				});

				keysChunks.forEach(keysChunk => {
					this.prepare(connection, `DELETE FROM ItemTable WHERE key IN (${fill(keysChunk.length, '?').join(',')})`, stmt => stmt.run(keysChunk), () => {
						const keys: string[] = [];
						request.delete!.forEach(key => {
							keys.push(key);
						});

						return `Keys: ${keys.join(', ')}`;
					});
				});
			}
		});
	}

	async close(recovery?: () => Map<string, string>): Promise<void> {
		this.logger.trace(`[storage ${this.name}] close()`);

		const connection = await this.whenConnected;

		return this.doClose(connection, recovery);
	}

	private doClose(connection: IDatabaseConnection, recovery?: () => Map<string, string>): Promise<void> {
		return new Promise((resolve, reject) => {
			connection.db.close(closeError => {
				if (closeError) {
					this.handleSQLiteError(connection, closeError, `[storage ${this.name}] close(): ${closeError}`);
				}

				// Return early if this storage was created only in-memory
				// e.g. when running tests we do not need to backup.
				if (this.path === SQLiteStorageDatabase.IN_MEMORY_PATH) {
					return resolve();
				}

				// If the DB closed successfully and we are not running in-memory
				// and the DB did not get errors during runtime, make a backup
				// of the DB so that we can use it as fallback in case the actual
				// DB becomes corrupt in the future.
				if (!connection.isErroneous && !connection.isInMemory) {
					return this.backup().then(resolve, error => {
						this.logger.error(`[storage ${this.name}] backup(): ${error}`);

						return resolve(); // ignore failing backup
					});
				}

				// Recovery: if we detected errors while using the DB or we are using
				// an inmemory DB (as a fallback to not being able to open the DB initially)
				// and we have a recovery function provided, we recreate the DB with this
				// data to recover all known data without loss if possible.
				if (typeof recovery === 'function') {

					// Delete the existing DB. If the path does not exist or fails to
					// be deleted, we do not try to recover anymore because we assume
					// that the path is no longer writeable for us.
					return unlink(this.path).then(() => {

						// Re-open the DB fresh
						return this.doConnect(this.path).then(recoveryConnection => {
							const closeRecoveryConnection = () => {
								return this.doClose(recoveryConnection, undefined /* do not attempt to recover again */);
							};

							// Store items
							return this.doUpdateItems(recoveryConnection, { insert: recovery() }).then(() => closeRecoveryConnection(), error => {

								// In case of an error updating items, still ensure to close the connection
								// to prevent SQLITE_BUSY errors when the connection is restablished
								closeRecoveryConnection();

								return Promise.reject(error);
							});
						});
					}).then(resolve, reject);
				}

				// Finally without recovery we just reject
				return reject(closeError || new Error('Database has errors or is in-memory without recovery option'));
			});
		});
	}

	private backup(): Promise<void> {
		const backupPath = this.toBackupPath(this.path);

		return copy(this.path, backupPath);
	}

	private toBackupPath(path: string): string {
		return `${path}.backup`;
	}

	async checkIntegrity(full: boolean): Promise<string> {
		this.logger.trace(`[storage ${this.name}] checkIntegrity(full: ${full})`);

		const connection = await this.whenConnected;
		const row = await this.get(connection, full ? 'PRAGMA integrity_check' : 'PRAGMA quick_check');

		const integrity = full ? row['integrity_check'] : row['quick_check'];

		if (connection.isErroneous) {
			return `${integrity} (last error: ${connection.lastError})`;
		}

		if (connection.isInMemory) {
			return `${integrity} (in-memory!)`;
		}

		return integrity;
	}

	private async connect(path: string, retryOnBusy: boolean = true): Promise<IDatabaseConnection> {
		this.logger.trace(`[storage ${this.name}] open(${path}, retryOnBusy: ${retryOnBusy})`);

		try {
			return await this.doConnect(path);
		} catch (error) {
			this.logger.error(`[storage ${this.name}] open(): Unable to open DB due to ${error}`);

			// SQLITE_BUSY should only arise if another process is locking the same DB we want
			// to open at that time. This typically never happens because a DB connection is
			// limited per window. However, in the event of a window reload, it may be possible
			// that the previous connection was not properly closed while the new connection is
			// already established.
			//
			// In this case we simply wait for some time and retry once to establish the connection.
			//
			if (error.code === 'SQLITE_BUSY' && retryOnBusy) {
				await timeout(SQLiteStorageDatabase.BUSY_OPEN_TIMEOUT);

				return this.connect(path, false /* not another retry */);
			}

			// Otherwise, best we can do is to recover from a backup if that exists, as such we
			// move the DB to a different filename and try to load from backup. If that fails,
			// a new empty DB is being created automatically.
			//
			// The final fallback is to use an in-memory DB which should only happen if the target
			// folder is really not writeable for us.
			//
			try {
				await unlink(path);
				await renameIgnoreError(this.toBackupPath(path), path);

				return await this.doConnect(path);
			} catch (error) {
				this.logger.error(`[storage ${this.name}] open(): Unable to use backup due to ${error}`);

				// In case of any error to open the DB, use an in-memory
				// DB so that we always have a valid DB to talk to.
				return this.doConnect(SQLiteStorageDatabase.IN_MEMORY_PATH);
			}
		}
	}

	private handleSQLiteError(connection: IDatabaseConnection, error: Error & { code?: string }, msg: string): void {
		connection.isErroneous = true;
		connection.lastError = msg;

		this.logger.error(msg);
	}

	private doConnect(path: string): Promise<IDatabaseConnection> {
		return new Promise((resolve, reject) => {
			import('vscode-sqlite3').then(sqlite3 => {
				const connection: IDatabaseConnection = {
					db: new (this.logger.isTracing ? sqlite3.verbose().Database : sqlite3.Database)(path, error => {
						if (error) {
							return connection.db ? connection.db.close(() => reject(error)) : reject(error);
						}

						// The following exec() statement serves two purposes:
						// - create the DB if it does not exist yet
						// - validate that the DB is not corrupt (the open() call does not throw otherwise)
						return this.exec(connection, [
							'PRAGMA user_version = 1;',
							'CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)'
						].join('')).then(() => {
							return resolve(connection);
						}, error => {
							return connection.db.close(() => reject(error));
						});
					}),
					isInMemory: path === SQLiteStorageDatabase.IN_MEMORY_PATH
				};

				// Errors
				connection.db.on('error', error => this.handleSQLiteError(connection, error, `[storage ${this.name}] Error (event): ${error}`));

				// Tracing
				if (this.logger.isTracing) {
					connection.db.on('trace', sql => this.logger.trace(`[storage ${this.name}] Trace (event): ${sql}`));
				}
			}, reject);
		});
	}

	private exec(connection: IDatabaseConnection, sql: string): Promise<void> {
		return new Promise((resolve, reject) => {
			connection.db.exec(sql, error => {
				if (error) {
					this.handleSQLiteError(connection, error, `[storage ${this.name}] exec(): ${error}`);

					return reject(error);
				}

				return resolve();
			});
		});
	}

	private get(connection: IDatabaseConnection, sql: string): Promise<object> {
		return new Promise((resolve, reject) => {
			connection.db.get(sql, (error, row) => {
				if (error) {
					this.handleSQLiteError(connection, error, `[storage ${this.name}] get(): ${error}`);

					return reject(error);
				}

				return resolve(row);
			});
		});
	}

	private all(connection: IDatabaseConnection, sql: string): Promise<{ key: string, value: string }[]> {
		return new Promise((resolve, reject) => {
			connection.db.all(sql, (error, rows) => {
				if (error) {
					this.handleSQLiteError(connection, error, `[storage ${this.name}] all(): ${error}`);

					return reject(error);
				}

				return resolve(rows);
			});
		});
	}

	private transaction(connection: IDatabaseConnection, transactions: () => void): Promise<void> {
		return new Promise((resolve, reject) => {
			connection.db.serialize(() => {
				connection.db.run('BEGIN TRANSACTION');

				transactions();

				connection.db.run('END TRANSACTION', error => {
					if (error) {
						this.handleSQLiteError(connection, error, `[storage ${this.name}] transaction(): ${error}`);

						return reject(error);
					}

					return resolve();
				});
			});
		});
	}

	private prepare(connection: IDatabaseConnection, sql: string, runCallback: (stmt: Statement) => void, errorDetails: () => string): void {
		const stmt = connection.db.prepare(sql);

		const statementErrorListener = (error: Error) => {
			this.handleSQLiteError(connection, error, `[storage ${this.name}] prepare(): ${error} (${sql}). Details: ${errorDetails()}`);
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

	getItems(): Promise<Map<string, string>> {
		return Promise.resolve(this.items);
	}

	updateItems(request: IUpdateRequest): Promise<void> {
		if (request.insert) {
			request.insert.forEach((value, key) => this.items.set(key, value));
		}

		if (request.delete) {
			request.delete.forEach(key => this.items.delete(key));
		}

		return Promise.resolve();
	}

	close(): Promise<void> {
		return Promise.resolve();
	}

	checkIntegrity(full: boolean): Promise<string> {
		return Promise.resolve('ok');
	}
}