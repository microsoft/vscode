/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Database, Statement, OPEN_READWRITE, OPEN_CREATE } from 'vscode-sqlite3';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { RunOnceScheduler, Queue } from 'vs/base/common/async';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { mapToString, setToString } from 'vs/base/common/map';
import { basename } from 'path';
import { mark } from 'vs/base/common/performance';

export interface IStorageOptions {
	path: string;
	createPath: boolean;

	logging?: IStorageLoggingOptions;
}

export interface IStorageLoggingOptions {
	errorLogger?: (error: string | Error) => void;
	infoLogger?: (msg: string) => void;

	info?: boolean;
	trace?: boolean;
	profile?: boolean;
}

enum StorageState {
	None,
	Initialized,
	Closed
}

export interface IStorage extends IDisposable {

	readonly size: number;
	readonly onDidChangeStorage: Event<string>;

	init(): Promise<void>;

	get(key: string, fallbackValue: string): string;
	get(key: string, fallbackValue?: string): string | undefined;

	getBoolean(key: string, fallbackValue: boolean): boolean;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined;

	getInteger(key: string, fallbackValue: number): number;
	getInteger(key: string, fallbackValue?: number): number | undefined;

	set(key: string, value: any): Promise<void>;
	delete(key: string): Promise<void>;

	close(): Thenable<void>;

	getItems(): Promise<Map<string, string>>;
	checkIntegrity(full: boolean): Promise<string>;
}

export class Storage extends Disposable implements IStorage {
	_serviceBrand: any;

	private static readonly FLUSH_DELAY = 100;

	private _onDidChangeStorage: Emitter<string> = this._register(new Emitter<string>());
	get onDidChangeStorage(): Event<string> { return this._onDidChangeStorage.event; }

	private state = StorageState.None;

	private storage: SQLiteStorageImpl;
	private cache: Map<string, string> = new Map<string, string>();

	private pendingQueue: Queue<void>;
	private pendingScheduler: RunOnceScheduler;
	private pendingDeletes: Set<string> = new Set<string>();
	private pendingInserts: Map<string, string> = new Map();
	private pendingPromises: { resolve: Function, reject: Function }[] = [];

	constructor(options: IStorageOptions) {
		super();

		this.storage = new SQLiteStorageImpl(options);

		this.pendingQueue = this._register(new Queue());
		this.pendingScheduler = this._register(new RunOnceScheduler(() => this.flushPending(), Storage.FLUSH_DELAY));
	}

	get size(): number {
		return this.cache.size;
	}

	init(): Promise<void> {
		if (this.state !== StorageState.None) {
			return Promise.resolve(); // either closed or already initialized
		}

		this.state = StorageState.Initialized;

		return this.storage.getItems().then(items => {
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

	set(key: string, value: any): Promise<void> {
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

		return this.update();
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

		return this.update();
	}

	private update(): Promise<void> {

		// Schedule
		if (!this.pendingScheduler.isScheduled()) {
			this.pendingScheduler.schedule();
		}

		return new Promise((resolve, reject) => this.pendingPromises.push({ resolve, reject }));
	}

	close(): Thenable<void> {
		if (this.state === StorageState.Closed) {
			return Promise.resolve(); // return if already closed
		}

		// Update state
		this.state = StorageState.Closed;

		// Dispose scheduler (no more scheduling possible)
		this.pendingScheduler.dispose();

		// Flush & close
		return this.flushPending().then(() => {
			return this.storage.close();
		});
	}

	private flushPending(): Thenable<void> {

		// We use a Queue to ensure that:
		// - there is only ever one call to storage.updateItems() at the same time
		// - upon close() we are certain that all calls to storage.updateItems()
		//   have finished. Otherwise there is a risk that we close() the DB while
		//   a transaction is active.
		return this.pendingQueue.queue(() => {

			// Get pending data
			const pendingPromises = this.pendingPromises;
			const pendingDeletes = this.pendingDeletes;
			const pendingInserts = this.pendingInserts;

			// Reset pending data for next run
			this.pendingPromises = [];
			this.pendingDeletes = new Set<string>();
			this.pendingInserts = new Map<string, string>();

			return this.storage.updateItems({ insert: pendingInserts, delete: pendingDeletes }).then(() => {

				// Resolve pending
				pendingPromises.forEach(promise => promise.resolve());
			}, error => {

				// Forward error to pending
				pendingPromises.forEach(promise => promise.reject(error));
			});
		});
	}

	getItems(): Promise<Map<string, string>> {
		return this.storage.getItems();
	}

	checkIntegrity(full: boolean): Promise<string> {
		return this.storage.checkIntegrity(full);
	}
}

export interface IUpdateRequest {
	insert?: Map<string, string>;
	delete?: Set<string>;
}

export class SQLiteStorageImpl {

	private static measuredRequireDuration: boolean; // TODO@Ben remove me after a while

	private db: Promise<Database>;
	private name: string;
	private logger: SQLiteStorageLogger;

	constructor(private options: IStorageOptions) {
		this.name = basename(options.path);
		this.logger = new SQLiteStorageLogger(options.logging);
		this.db = this.open();
	}

	getItems(): Promise<Map<string, string>> {
		return this.db.then(db => {
			const items = new Map<string, string>();

			return this.each(db, 'SELECT * FROM ItemTable', row => {
				items.set(row.key, row.value);
			}).then(() => {
				if (this.logger.verbose) {
					this.logger.info(`[storage ${this.name}] getItems(): ${mapToString(items)}`);
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

		if (this.logger.verbose) {
			this.logger.info(`[storage ${this.name}] updateItems(): insert(${request.insert ? mapToString(request.insert) : '0'}), delete(${request.delete ? setToString(request.delete) : '0'})`);
		}

		return this.db.then(db => {
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
		this.logger.info(`[storage ${this.name}] close()`);

		return this.db.then(db => {
			return new Promise((resolve, reject) => {
				db.close(error => {
					if (error) {
						this.logger.error(`[storage ${this.name}] close(): ${error}`);

						return reject(error);
					}

					return resolve();
				});
			});
		});
	}

	checkIntegrity(full: boolean): Promise<string> {
		this.logger.info(`[storage ${this.name}] checkIntegrity(full: ${full})`);

		return this.db.then(db => {
			return this.get(db, full ? 'PRAGMA integrity_check' : 'PRAGMA quick_check').then(row => {
				return full ? row['integrity_check'] : row['quick_check'];
			});
		});
	}

	private open(): Promise<Database> {
		this.logger.info(`[storage ${this.name}] open()`);

		return new Promise((resolve, reject) => {
			this.doOpen(this.options.path, this.options.createPath).then(resolve, error => {
				this.logger.error(`[storage ${this.name}] open(): Error (open DB): ${error}`);
				this.logger.error(`[storage ${this.name}] open(): Falling back to in-memory DB`);

				// In case of any error to open the DB, use an in-memory
				// DB so that we always have a valid DB to talk to.
				this.doOpen(':memory:', true).then(resolve, reject);
			});
		});
	}

	private doOpen(path: string, createPath: boolean): Promise<Database> {
		return new Promise((resolve, reject) => {
			let measureRequireDuration = false;
			if (!SQLiteStorageImpl.measuredRequireDuration) {
				SQLiteStorageImpl.measuredRequireDuration = true;
				measureRequireDuration = true;

				mark('willRequireSQLite');
			}
			import('vscode-sqlite3').then(sqlite3 => {
				if (measureRequireDuration) {
					mark('didRequireSQLite');
				}

				const db = new (this.logger.verbose ? sqlite3.verbose().Database : sqlite3.Database)(path, createPath ? OPEN_READWRITE | OPEN_CREATE : OPEN_READWRITE, error => {
					if (error) {
						return reject(error);
					}

					// Return early if we did not create the DB
					if (!createPath) {
						return resolve(db);
					}

					// Otherwise: Setup schema
					mark('willSetupSQLiteSchema');
					this.exec(db, [
						'PRAGMA user_version = 1;',
						'CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)'
					].join('')).then(() => {
						mark('didSetupSQLiteSchema');

						resolve(db);
					}, error => {
						mark('didSetupSQLiteSchema');

						reject(error);
					});
				});

				// Check for errors
				db.on('error', error => this.logger.error(`[storage ${this.name}] Error (event): ${error}`));

				// Tracing
				if (this.logger.trace) {
					db.on('trace', sql => this.logger.info(`[storage ${this.name}] Trace (event): ${sql}`));
				}

				// Profiling
				if (this.logger.profile) {
					db.on('profile', (sql, time) => this.logger.info(`[storage ${this.name}] Profile (event): ${sql} (${time}ms)`));
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

	private each(db: Database, sql: string, callback: (row: any) => void): Promise<void> {
		return new Promise((resolve, reject) => {
			let hadError = false;
			db.each(sql, (error, row) => {
				if (error) {
					this.logger.error(`[storage ${this.name}] each(): ${error}`);

					hadError = true;

					return reject(error);
				}

				if (!hadError) {
					callback(row);
				}
			}, error => {
				if (error) {
					this.logger.error(`[storage ${this.name}] each(): ${error}`);

					return reject(error);
				}

				return resolve();
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

		runCallback(stmt);

		const statementErrorListener = error => {
			this.logger.error(`[storage ${this.name}] prepare(): ${error} (${sql})`);
		};

		stmt.on('error', statementErrorListener);

		stmt.finalize(error => {
			if (error) {
				statementErrorListener(error);
			}

			stmt.removeListener('error', statementErrorListener);
		});
	}
}

class SQLiteStorageLogger {
	private readonly logInfo: boolean;
	private readonly logError: boolean;

	constructor(private readonly options?: IStorageLoggingOptions) {
		this.logInfo = !!(this.verbose && options && options.infoLogger);
		this.logError = !!(options && options.errorLogger);
	}

	get verbose(): boolean {
		return !!(this.options && (this.options.info || this.options.trace || this.options.profile));
	}

	get trace(): boolean {
		return !!(this.options && this.options.trace);
	}

	get profile(): boolean {
		return !!(this.options && this.options.profile);
	}

	info(msg: string): void {
		if (this.logInfo) {
			this.options!.infoLogger!(msg);
		}
	}

	error(error: string | Error): void {
		if (this.logError) {
			this.options!.errorLogger!(error);
		}
	}
}

export class NullStorage extends Disposable implements IStorage {

	readonly size = 0;
	readonly onDidChangeStorage = Event.None;

	private items = new Map<string, string>();

	init(): Promise<void> { return Promise.resolve(); }

	get(key: string, fallbackValue: string): string;
	get(key: string, fallbackValue?: string): string | undefined;
	get(key: string, fallbackValue?: string): string | undefined {
		return void 0;
	}

	getBoolean(key: string, fallbackValue: boolean): boolean;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined;
	getBoolean(key: string, fallbackValue?: boolean): boolean | undefined {
		return void 0;
	}

	getInteger(key: string, fallbackValue: number): number;
	getInteger(key: string, fallbackValue?: number): number | undefined;
	getInteger(key: string, fallbackValue?: number): number | undefined {
		return void 0;
	}

	set(key: string, value: any): Promise<void> {
		return Promise.resolve();
	}

	delete(key: string): Promise<void> {
		return Promise.resolve();
	}

	close(): Promise<void> {
		return Promise.resolve();
	}

	getItems(): Promise<Map<string, string>> {
		return Promise.resolve(this.items);
	}

	checkIntegrity(full: boolean): Promise<string> {
		return Promise.resolve('ok');
	}
}