/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BugB-Tech. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Database Service for Specter
 * 
 * SQLite wrapper service for local data storage
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../log/common/log.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import * as path from 'path';
import * as fs from 'fs';
import { Database } from '@vscode/sqlite3';
import { DatabaseMigrations } from './migrations.js';

export interface IDatabaseService {
	/**
	 * Initialize the database connection
	 */
	initialize(): Promise<void>;

	/**
	 * Execute a SQL statement (INSERT, UPDATE, DELETE)
	 * @param sql SQL statement
	 * @param params Parameters for the SQL statement
	 * @returns Number of affected rows
	 */
	execute(sql: string, params?: any[]): Promise<number>;

	/**
	 * Query the database (SELECT)
	 * @param sql SQL query
	 * @param params Parameters for the query
	 * @returns Array of rows
	 */
	query<T = any>(sql: string, params?: any[]): Promise<T[]>;

	/**
	 * Get a single row from the database
	 * @param sql SQL query
	 * @param params Parameters for the query
	 * @returns Single row or undefined
	 */
	get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;

	/**
	 * Run multiple SQL statements in a transaction
	 * @param statements Array of SQL statements with parameters
	 */
	transaction(statements: Array<{ sql: string; params?: any[] }>): Promise<void>;

	/**
	 * Get the current schema version
	 */
	getCurrentVersion(): Promise<number>;

	/**
	 * Close the database connection
	 */
	close(): Promise<void>;
}

export class DatabaseService extends Disposable implements IDatabaseService {

	private db: Database | null = null;
	private readonly dbPath: string;
	private isInitialized: boolean = false;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		// Determine database file path
		// Use userDataPath from environment service
		const userDataPath = this.environmentService.userDataPath;
		const specterDir = path.join(userDataPath, 'specter');
		this.dbPath = path.join(specterDir, 'specter.db');

		this.logService.info('[Specter] Database path:', this.dbPath);
	}

	/**
	 * Initialize the database connection and run migrations
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			this.logService.info('[Specter] Database already initialized');
			return;
		}

		try {
			// Ensure directory exists
			const dbDir = path.dirname(this.dbPath);
			if (!fs.existsSync(dbDir)) {
				fs.mkdirSync(dbDir, { recursive: true });
				this.logService.info('[Specter] Created database directory:', dbDir);
			}

			// Open database connection
			this.db = await this.openDatabase();
			this.logService.info('[Specter] Database connection opened');

			// Enable foreign keys
			await this.executeInternal('PRAGMA foreign_keys = ON;');

			// Create version table if it doesn't exist
			await this.executeInternal(DatabaseMigrations.getVersionTableSQL());

			// Run migrations
			await this.runMigrations();

			this.isInitialized = true;
			this.logService.info('[Specter] Database initialized successfully');

		} catch (error) {
			this.logService.error('[Specter] Failed to initialize database:', error);
			throw error;
		}
	}

	/**
	 * Open the SQLite database connection
	 */
	private openDatabase(): Promise<Database> {
		return new Promise((resolve, reject) => {
			const db = new Database(this.dbPath, (err) => {
				if (err) {
					reject(err);
				} else {
					resolve(db);
				}
			});
		});
	}

	/**
	 * Run pending migrations
	 */
	private async runMigrations(): Promise<void> {
		const currentVersion = await this.getCurrentVersion();
		this.logService.info('[Specter] Current schema version:', currentVersion);

		const pendingMigrations = DatabaseMigrations.getPendingMigrations(currentVersion);

		if (pendingMigrations.length === 0) {
			this.logService.info('[Specter] No pending migrations');
			return;
		}

		this.logService.info('[Specter] Running', pendingMigrations.length, 'migration(s)');

		for (const migration of pendingMigrations) {
			this.logService.info('[Specter] Applying migration', migration.version, ':', migration.name);

			try {
				// For initial schema, read from schema.sql
				if (migration.version === 1) {
					const schemaStatements = DatabaseMigrations.getInitialSchema();
					for (const statement of schemaStatements) {
						await this.executeInternal(statement);
					}
				} else {
					// For other migrations, execute up statements
					for (const statement of migration.up) {
						await this.executeInternal(statement);
					}
				}

				// Update version
				await this.executeInternal(DatabaseMigrations.getUpdateVersionSQL(migration.version));
				this.logService.info('[Specter] Migration', migration.version, 'applied successfully');

			} catch (error) {
				this.logService.error('[Specter] Migration', migration.version, 'failed:', error);
				throw error;
			}
		}

		this.logService.info('[Specter] All migrations completed');
	}

	/**
	 * Get the current schema version
	 */
	async getCurrentVersion(): Promise<number> {
		try {
			const result = await this.get<{ version: number }>(
				DatabaseMigrations.getCurrentVersionSQL()
			);
			return result?.version ?? 0;
		} catch (error) {
			// If table doesn't exist, version is 0
			return 0;
		}
	}

	/**
	 * Execute a SQL statement (INSERT, UPDATE, DELETE)
	 */
	async execute(sql: string, params: any[] = []): Promise<number> {
		this.ensureInitialized();

		try {
			const changes = await this.executeInternal(sql, params);
			this.logService.trace('[Specter] Execute:', sql, 'params:', params, 'changes:', changes);
			return changes;
		} catch (error) {
			this.logService.error('[Specter] Execute failed:', sql, error);
			throw error;
		}
	}

	/**
	 * Internal execute method
	 */
	private executeInternal(sql: string, params: any[] = []): Promise<number> {
		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error('Database not initialized'));
				return;
			}

			this.db.run(sql, params, function (err) {
				if (err) {
					reject(err);
				} else {
					resolve(this.changes);
				}
			});
		});
	}

	/**
	 * Query the database (SELECT)
	 */
	async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error('Database not initialized'));
				return;
			}

			this.db.all(sql, params, (err, rows) => {
				if (err) {
					this.logService.error('[Specter] Query failed:', sql, err);
					reject(err);
				} else {
					this.logService.trace('[Specter] Query:', sql, 'params:', params, 'rows:', rows.length);
					resolve(rows as T[]);
				}
			});
		});
	}

	/**
	 * Get a single row from the database
	 */
	async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
		this.ensureInitialized();

		return new Promise((resolve, reject) => {
			if (!this.db) {
				reject(new Error('Database not initialized'));
				return;
			}

			this.db.get(sql, params, (err, row) => {
				if (err) {
					this.logService.error('[Specter] Get failed:', sql, err);
					reject(err);
				} else {
					this.logService.trace('[Specter] Get:', sql, 'params:', params, 'row:', row);
					resolve(row as T | undefined);
				}
			});
		});
	}

	/**
	 * Run multiple SQL statements in a transaction
	 */
	async transaction(statements: Array<{ sql: string; params?: any[] }>): Promise<void> {
		this.ensureInitialized();

		try {
			await this.executeInternal('BEGIN TRANSACTION;');

			for (const stmt of statements) {
				await this.executeInternal(stmt.sql, stmt.params);
			}

			await this.executeInternal('COMMIT;');
			this.logService.trace('[Specter] Transaction completed:', statements.length, 'statements');

		} catch (error) {
			await this.executeInternal('ROLLBACK;');
			this.logService.error('[Specter] Transaction failed, rolled back:', error);
			throw error;
		}
	}

	/**
	 * Close the database connection
	 */
	async close(): Promise<void> {
		if (this.db) {
			return new Promise((resolve, reject) => {
				this.db!.close((err) => {
					if (err) {
						this.logService.error('[Specter] Failed to close database:', err);
						reject(err);
					} else {
						this.logService.info('[Specter] Database connection closed');
						this.db = null;
						this.isInitialized = false;
						resolve();
					}
				});
			});
		}
	}

	/**
	 * Ensure database is initialized
	 */
	private ensureInitialized(): void {
		if (!this.isInitialized || !this.db) {
			throw new Error('Database not initialized. Call initialize() first.');
		}
	}

	/**
	 * Dispose and close database connection
	 */
	override dispose(): void {
		if (this.db) {
			this.close().catch(err => {
				this.logService.error('[Specter] Error closing database during dispose:', err);
			});
		}
		super.dispose();
	}
}
