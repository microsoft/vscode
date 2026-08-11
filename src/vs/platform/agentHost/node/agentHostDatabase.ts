/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import type { Database, RunResult } from '@vscode/sqlite3';
import { dirname } from '../../../base/common/path.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { AgentProvider } from '../common/agent.js';

export interface IAgentHostDatabaseSession {
	readonly session: string;
	readonly provider: AgentProvider;
	readonly startTime: number;
}

export interface IAgentHostDatabase extends IDisposable {
	registerSession(session: string, provider: AgentProvider, startTime: number): Promise<void>;
	unregisterSession(session: string): Promise<void>;
	listSessions(): Promise<readonly IAgentHostDatabaseSession[]>;
	isSessionRegistryEmpty(): Promise<boolean>;
	isSessionRegistryBackfilled(): Promise<boolean>;
	markSessionRegistryBackfilled(): Promise<void>;
	close(): Promise<void>;
}

const migrations = [
	{
		version: 1,
		sql: [
			`CREATE TABLE IF NOT EXISTS sessions (
				session_uri TEXT PRIMARY KEY NOT NULL,
				provider    TEXT NOT NULL,
				start_time  INTEGER NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS metadata (
				key   TEXT PRIMARY KEY NOT NULL,
				value TEXT NOT NULL
			)`,
		].join(';\n'),
	},
] as const;

function openDatabase(path: string): Promise<Database> {
	return new Promise((resolve, reject) => {
		import('@vscode/sqlite3').then(sqlite3 => {
			const database = new sqlite3.default.Database(path, error => error ? reject(error) : resolve(database));
		}, reject);
	});
}

function exec(database: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve()));
}

function run(database: Database, sql: string, parameters: readonly unknown[]): Promise<void> {
	return new Promise((resolve, reject) => {
		database.run(sql, parameters, function (this: RunResult, error: Error | null) {
			error ? reject(error) : resolve();
		});
	});
}

function get(database: Database, sql: string, parameters: readonly unknown[]): Promise<Record<string, unknown> | undefined> {
	return new Promise((resolve, reject) => {
		database.get(sql, parameters, (error: Error | null, row: Record<string, unknown> | undefined) => error ? reject(error) : resolve(row));
	});
}

function all(database: Database, sql: string, parameters: readonly unknown[]): Promise<Record<string, unknown>[]> {
	return new Promise((resolve, reject) => {
		database.all(sql, parameters, (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows));
	});
}

function close(database: Database): Promise<void> {
	return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

export class AgentHostDatabase implements IAgentHostDatabase {

	private _databasePromise: Promise<Database> | undefined;
	private _closed: Promise<void> | true | undefined;

	constructor(private readonly _path: string) { }

	registerSession(session: string, provider: AgentProvider, startTime: number): Promise<void> {
		return this._run(
			`INSERT INTO sessions (session_uri, provider, start_time)
				VALUES (?, ?, ?)
				ON CONFLICT(session_uri) DO UPDATE SET provider = excluded.provider`,
			[session, provider, startTime],
		);
	}

	unregisterSession(session: string): Promise<void> {
		return this._run('DELETE FROM sessions WHERE session_uri = ?', [session]);
	}

	async listSessions(): Promise<readonly IAgentHostDatabaseSession[]> {
		const rows = await all(await this._ensureDatabase(), 'SELECT session_uri, provider, start_time FROM sessions', []);
		return rows.map(row => ({
			session: row.session_uri as string,
			provider: row.provider as AgentProvider,
			startTime: row.start_time as number,
		}));
	}

	async isSessionRegistryEmpty(): Promise<boolean> {
		const row = await get(await this._ensureDatabase(), 'SELECT 1 AS present FROM sessions LIMIT 1', []);
		return row === undefined;
	}

	async isSessionRegistryBackfilled(): Promise<boolean> {
		const row = await get(await this._ensureDatabase(), `SELECT value FROM metadata WHERE key = 'sessionRegistryBackfilled'`, []);
		return row?.value === 'true';
	}

	markSessionRegistryBackfilled(): Promise<void> {
		return this._run(
			`INSERT INTO metadata (key, value) VALUES ('sessionRegistryBackfilled', 'true')
				ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[],
		);
	}

	private async _run(sql: string, parameters: readonly unknown[]): Promise<void> {
		await run(await this._ensureDatabase(), sql, parameters);
	}

	private _ensureDatabase(): Promise<Database> {
		if (this._closed) {
			return Promise.reject(new Error('AgentHostDatabase has been disposed'));
		}
		if (!this._databasePromise) {
			this._databasePromise = (async () => {
				if (this._path !== ':memory:') {
					await fs.promises.mkdir(dirname(this._path), { recursive: true });
				}
				const database = await openDatabase(this._path);
				try {
					database.serialize();
					const versionRow = await get(database, 'PRAGMA user_version', []);
					const currentVersion = (versionRow?.user_version as number | undefined) ?? 0;
					for (const migration of migrations) {
						if (migration.version > currentVersion) {
							await exec(database, 'BEGIN TRANSACTION');
							try {
								await exec(database, migration.sql);
								await exec(database, `PRAGMA user_version = ${migration.version}`);
								await exec(database, 'COMMIT');
							} catch (error) {
								await exec(database, 'ROLLBACK');
								throw error;
							}
						}
					}
					return database;
				} catch (error) {
					await close(database);
					throw error;
				}
			})().catch(error => {
				this._databasePromise = undefined;
				throw error;
			});
		}
		return this._databasePromise;
	}

	async close(): Promise<void> {
		await (this._closed ??= this._databasePromise?.then(database => close(database)).catch(() => { }) || true);
	}

	dispose(): void {
		void this.close();
	}
}
