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
	/**
	 * Atomically registers `session` unless it is currently tombstoned (a
	 * single statement, so a concurrent {@link markSessionTombstoned} cannot
	 * race in between a separate read-then-write check). Returns whether the
	 * session was registered. Never clears an existing tombstone — unlike
	 * {@link registerSession}, this is for paths that *revive* a
	 * previously-observed session (provider backfill, restore) rather than
	 * explicitly create one.
	 */
	registerSessionIfNotTombstoned(session: string, provider: AgentProvider, startTime: number): Promise<boolean>;
	unregisterSession(session: string): Promise<void>;
	/** Atomically tombstones and removes a session so concurrent backfill cannot re-register it. */
	tombstoneAndUnregisterSession(session: string): Promise<void>;
	listSessions(): Promise<readonly IAgentHostDatabaseSession[]>;
	isSessionRegistryEmpty(): Promise<boolean>;
	/**
	 * @deprecated superseded by per-provider {@link isProviderBackfilled}.
	 * Retained only so this database can still correctly interpret a
	 * database written by pre-per-provider code (see the implicit-conversion
	 * behavior in {@link AgentService}). Current code never writes this
	 * marker, so it provides no benefit to a downgrade (new database opened
	 * by old code) — see {@link AgentSessionRegistry} for that scenario's
	 * documented behavior.
	 */
	isSessionRegistryBackfilled(): Promise<boolean>;
	/** @deprecated see {@link isSessionRegistryBackfilled}. */
	markSessionRegistryBackfilled(): Promise<void>;
	/** Whether `provider`'s legacy chats have been durably imported into the session registry at least once. */
	isProviderBackfilled(provider: AgentProvider): Promise<boolean>;
	/** Durably records that `provider`'s legacy chats have been imported into the session registry. */
	markProviderBackfilled(provider: AgentProvider): Promise<void>;
	/** Whether `session` was explicitly deleted and must not be resurrected by backfill. */
	isSessionTombstoned(session: string): Promise<boolean>;
	/** Durably records that `session` was explicitly deleted. */
	markSessionTombstoned(session: string): Promise<void>;
	/** Clears a session's deletion tombstone (used on explicit create/restore). */
	clearSessionTombstone(session: string): Promise<void>;
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

/** Like {@link run}, but resolves with the number of rows the statement actually affected. */
function runReturningChanges(database: Database, sql: string, parameters: readonly unknown[]): Promise<number> {
	return new Promise((resolve, reject) => {
		database.run(sql, parameters, function (this: RunResult, error: Error | null) {
			error ? reject(error) : resolve(this.changes);
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

/** Metadata key for the durable per-provider backfill-completion marker. */
function providerBackfillKey(provider: AgentProvider): string {
	return `sessionRegistryBackfilled:${provider}`;
}

/** Metadata key for a session's durable "explicitly deleted" tombstone. */
function tombstoneKey(session: string): string {
	return `sessionTombstone:${session}`;
}

function quoteSqlString(value: string): string {
	return `'${value.replaceAll('\'', '\'\'')}'`;
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

	async registerSessionIfNotTombstoned(session: string, provider: AgentProvider, startTime: number): Promise<boolean> {
		// The tombstone check and the insert are one statement (the INSERT's
		// row source is empty when the subquery matches), so there is no
		// read-then-write gap for a concurrent `markSessionTombstoned` to land
		// in. `changes` is 0 when the subquery matched (tombstoned, nothing
		// inserted) and 1 when the row was inserted or updated.
		const changes = await runReturningChanges(
			await this._ensureDatabase(),
			`INSERT INTO sessions (session_uri, provider, start_time)
				SELECT ?, ?, ?
				WHERE NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')
				ON CONFLICT(session_uri) DO UPDATE SET provider = excluded.provider`,
			[session, provider, startTime, tombstoneKey(session)],
		);
		return changes > 0;
	}

	unregisterSession(session: string): Promise<void> {
		return this._run('DELETE FROM sessions WHERE session_uri = ?', [session]);
	}

	async tombstoneAndUnregisterSession(session: string): Promise<void> {
		const database = await this._ensureDatabase();
		const sessionValue = quoteSqlString(session);
		const tombstoneValue = quoteSqlString(tombstoneKey(session));
		try {
			await exec(
				database,
				`BEGIN IMMEDIATE;
				INSERT INTO metadata (key, value) VALUES (${tombstoneValue}, 'true')
					ON CONFLICT(key) DO UPDATE SET value = excluded.value;
				DELETE FROM sessions WHERE session_uri = ${sessionValue};
				COMMIT;`,
			);
		} catch (error) {
			try {
				await exec(database, 'ROLLBACK');
			} catch (rollbackError) {
				throw new AggregateError([error, rollbackError], `Failed to tombstone session ${session}`);
			}
			throw error;
		}
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

	async isProviderBackfilled(provider: AgentProvider): Promise<boolean> {
		const row = await get(await this._ensureDatabase(), 'SELECT value FROM metadata WHERE key = ?', [providerBackfillKey(provider)]);
		return row?.value === 'true';
	}

	markProviderBackfilled(provider: AgentProvider): Promise<void> {
		return this._run(
			`INSERT INTO metadata (key, value) VALUES (?, 'true')
				ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[providerBackfillKey(provider)],
		);
	}

	async isSessionTombstoned(session: string): Promise<boolean> {
		const row = await get(await this._ensureDatabase(), 'SELECT value FROM metadata WHERE key = ?', [tombstoneKey(session)]);
		return row?.value === 'true';
	}

	markSessionTombstoned(session: string): Promise<void> {
		return this._run(
			`INSERT INTO metadata (key, value) VALUES (?, 'true')
				ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[tombstoneKey(session)],
		);
	}

	clearSessionTombstone(session: string): Promise<void> {
		return this._run('DELETE FROM metadata WHERE key = ?', [tombstoneKey(session)]);
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
