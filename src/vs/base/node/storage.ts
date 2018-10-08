/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Database, Statement } from 'sqlite3';

export interface ISQLiteStorageOptions {
	path: string;

	logging?: ISQLiteStorageLoggingOptions;
}

export interface ISQLiteStorageLoggingOptions {
	errorLogger?: (error: string | Error) => void;
	infoLogger?: (msg: string) => void;

	verbose?: boolean;
	trace?: boolean;
	profile?: boolean;
}

export class SQLiteStorage {
	private db: Promise<Database>;
	private logger: SQLiteStorageLogger;

	constructor(private options: ISQLiteStorageOptions) {
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

	setItems(keyValueMap: Map<string, string>): Promise<void> {
		if (keyValueMap.size === 0) {
			return Promise.resolve();
		}

		return this.db.then(db => {
			return this.transaction(db, () => {
				this.prepare(db, 'INSERT INTO ItemTable VALUES (?,?)', stmt => {
					keyValueMap.forEach((value, key) => {
						stmt.run([key, value]);
					});
				});
			});
		});
	}

	deleteItems(keys: Set<string>): Promise<void> {
		if (keys.size === 0) {
			return Promise.resolve();
		}

		return this.db.then(db => {
			return this.transaction(db, () => {
				this.prepare(db, 'DELETE FROM ItemTable WHERE key=?', stmt => {
					keys.forEach(key => {
						stmt.run(key);
					});
				});
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

		// @ts-ignore
		stmt.on('error', statementErrorListener);

		stmt.finalize(error => {
			if (error) {
				statementErrorListener(error);
			}

			// @ts-ignore
			stmt.removeListener('error', statementErrorListener);
		});
	}
}

class SQLiteStorageLogger {
	private logInfo: boolean;
	private logError: boolean;

	constructor(private options?: ISQLiteStorageLoggingOptions) {
		this.logInfo = this.verbose && !!options.infoLogger;
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