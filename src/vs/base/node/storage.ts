/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Database, Statement } from 'sqlite3';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { RunOnceScheduler } from 'vs/base/common/async';
import { isUndefinedOrNull } from 'vs/base/common/types';

export interface IStorageOptions {
	path: string;

	logging?: IStorageLoggingOptions;
}

export interface IStorageLoggingOptions {
	errorLogger?: (error: string | Error) => void;
	infoLogger?: (msg: string) => void;

	verbose?: boolean;
	trace?: boolean;
	profile?: boolean;
}

enum StorageState {
	None,
	Initialized,
	Closed
}

export class Storage extends Disposable {
	_serviceBrand: any;

	private static readonly FLUSH_DELAY = 10;

	private _onDidChangeStorage: Emitter<string> = this._register(new Emitter<string>());
	get onDidChangeStorage(): Event<string> { return this._onDidChangeStorage.event; }

	private state = StorageState.None;

	private storage: SQLiteStorageImpl;
	private cache: Map<string, string> = new Map<string, string>();

	private pendingScheduler: RunOnceScheduler;
	private pendingDeletes: Set<string> = new Set<string>();
	private pendingInserts: Map<string, string> = new Map();
	private pendingPromises: { resolve: Function, reject: Function }[] = [];

	constructor(options: IStorageOptions) {
		super();

		this.storage = new SQLiteStorageImpl(options);

		this.pendingScheduler = new RunOnceScheduler(() => this.flushPending(), Storage.FLUSH_DELAY);
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

	get(key: string, fallbackValue?: any): string {
		const value = this.cache.get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return value;
	}

	getBoolean(key: string, fallbackValue?: boolean): boolean {
		const value = this.get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return value === 'true';
	}

	getInteger(key: string, fallbackValue?: number): number {
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

	close(): Promise<void> {
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

	private flushPending(): Promise<void> {

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
	}
}

export interface IUpdateRequest {
	insert?: Map<string, string>;
	delete?: Set<string>;
}

export class SQLiteStorageImpl {
	private db: Promise<Database>;
	private logger: SQLiteStorageLogger;

	constructor(private options: IStorageOptions) {
		this.logger = new SQLiteStorageLogger(options.logging);
		this.db = this.open();
	}

	getItems(): Promise<Map<string, string>> {
		return this.db.then(db => {
			const items = new Map<string, string>();

			return this.each(db, 'SELECT * FROM ItemTable', row => {
				items.set(row.key, row.value);
			}).then(() => items);
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

		return this.db.then(db => {
			return this.transaction(db, () => {
				if (request.insert && request.insert.size > 0) {
					this.prepare(db, 'INSERT INTO ItemTable VALUES (?,?)', stmt => {
						request.insert.forEach((value, key) => {
							stmt.run([key, value]);
						});
					});
				}

				if (request.delete && request.delete.size) {
					this.prepare(db, 'DELETE FROM ItemTable WHERE key=?', stmt => {
						request.delete.forEach(key => {
							stmt.run(key);
						});
					});
				}
			});
		});
	}

	close(): Promise<void> {
		return this.db.then(db => {
			return new Promise((resolve, reject) => {
				db.close(error => {
					if (error) {
						this.logger.error(error);

						return reject(error);
					}

					resolve();
				});
			});
		});
	}

	private open(): Promise<Database> {
		return new Promise((resolve, reject) => {
			this.doOpen(this.options.path).then(resolve, error => {
				this.logger.error(`Error (open DB): ${error}`);
				this.logger.error('Falling back to in-memory DB');

				// In case of any error to open the DB, use an in-memory
				// DB so that we always have a valid DB to talk to.
				this.doOpen(':memory:').then(resolve, reject);
			});
		});
	}

	private doOpen(path: string): Promise<Database> {
		return new Promise((resolve, reject) => {
			import('sqlite3').then(sqlite3 => {
				const db = new (this.logger.verbose ? sqlite3.verbose().Database : sqlite3.Database)(path, error => {
					if (error) {
						return reject(error);
					}

					// Setup schema
					this.exec(db, [
						'PRAGMA user_version = 1;',
						'CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)'
					].join('')).then(() => resolve(db), error => reject(error));
				});

				// Check for errors
				db.on('error', error => this.logger.error(`Error (event): ${error}`));

				// Tracing
				if (this.options.logging && this.options.logging.trace) {
					db.on('trace', sql => this.logger.info(`Trace (event): ${sql}`));
				}

				// Profiling
				if (this.options.logging && this.options.logging.profile) {
					db.on('profile', (sql, time) => this.logger.info(`Profile (event): ${sql} (${time}ms)`));
				}
			});
		});
	}

	private exec(db: Database, sql: string): Promise<void> {
		return new Promise((resolve, reject) => {
			db.exec(sql, error => {
				if (error) {
					this.logger.error(error);

					return reject(error);
				}

				resolve();
			});
		});
	}

	private each(db: Database, sql: string, callback: (row: any) => void): Promise<void> {
		return new Promise((resolve, reject) => {
			db.each(sql, (error, row) => {
				if (error) {
					this.logger.error(error);

					return reject(error);
				}

				callback(row);
			}, error => {
				if (error) {
					this.logger.error(error);

					return reject(error);
				}

				resolve();
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
						this.logger.error(error);

						return reject(error);
					}

					resolve();
				});
			});
		});
	}

	private prepare(db: Database, sql: string, runCallback: (stmt: Statement) => void): void {
		const stmt = db.prepare(sql);

		runCallback(stmt);

		const statementErrorListener = error => {
			this.logger.error(`Error (statement): ${error} (${sql})`);
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
	private logInfo: boolean;
	private logError: boolean;

	constructor(private options?: IStorageLoggingOptions) {
		this.logInfo = this.verbose && options && !!options.infoLogger;
		this.logError = options && !!options.errorLogger;
	}

	get verbose(): boolean {
		return this.options && (this.options.verbose || this.options.trace || this.options.profile);
	}

	info(msg: string): void {
		if (this.logInfo) {
			this.options.infoLogger(msg);
		}
	}

	error(error: string | Error): void {
		if (this.logError) {
			this.options.errorLogger(error);
		}
	}
}