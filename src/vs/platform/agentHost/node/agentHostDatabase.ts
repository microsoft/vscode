/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import type { Database, RunResult } from '@vscode/sqlite3';
import { dirname } from '../../../base/common/path.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { AgentProvider } from '../common/agent.js';

/**
 * Durable origin used to resolve competing registrations for the same session.
 * In particular, discovery may upgrade a restored session to external, but must
 * never override an explicitly created Agent Host session. Removing legacy
 * migration alone does not make this redundant; it can only be removed if
 * registration APIs encode these conflict rules without relying on stored origin.
 */
export type AgentSessionRegistrationSource = 'explicit' | 'restore' | 'discovery';

export interface IAgentHostDatabaseSession {
	readonly session: string;
	readonly provider: AgentProvider;
	readonly startTime: number;
	readonly modifiedTime: number;
	readonly external: boolean | undefined;
	readonly source: AgentSessionRegistrationSource;
}

export interface IAgentHostDatabaseSessionOptions {
	readonly provider: AgentProvider;
	readonly startTime: number;
	/** Last observed provider modification time; defaults to {@link startTime}. */
	readonly modifiedTime?: number;
	readonly source: AgentSessionRegistrationSource;
}

export interface IAgentHostDatabaseRegisterOptions {
	readonly checkTombstone: boolean;
}

export interface IAgentHostDatabaseExternalUpdate {
	readonly session: string;
	readonly external: boolean;
}

export interface IAgentHostDatabase extends IDisposable {
	/**
	 * Records a session with source-aware provenance. When requested, the
	 * tombstone check and registration are atomic.
	 */
	registerSession(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean>;
	unregisterSession(session: string): Promise<void>;
	/** Atomically tombstones and removes a session so concurrent backfill cannot re-register it. */
	tombstoneAndUnregisterSession(session: string): Promise<void>;
	updateSessionExternal(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void>;
	/** Advances the durable last-observed modification time. */
	updateSessionModifiedTime(session: string, modifiedTime: number): Promise<boolean>;
	getSession(session: string): Promise<IAgentHostDatabaseSession | undefined>;
	listSessions(): Promise<readonly IAgentHostDatabaseSession[]>;
	isSessionRegistryEmpty(): Promise<boolean>;
	/**
	 * @deprecated superseded by per-provider {@link isProviderBackfilled}.
	 * Retained only for reading databases written by pre-per-provider code.
	 * Neither this marker nor per-provider markers gate native discovery.
	 */
	isSessionRegistryBackfilled(): Promise<boolean>;
	/** @deprecated see {@link isSessionRegistryBackfilled}. */
	markSessionRegistryBackfilled(): Promise<void>;
	/** Whether `provider` has completed native discovery at least once (for compatibility/diagnostics). */
	isProviderBackfilled(provider: AgentProvider): Promise<boolean>;
	/** Durably records a completed provider-native discovery pass. */
	markProviderBackfilled(provider: AgentProvider): Promise<void>;
	/** Whether `session` was explicitly deleted and must not be resurrected by backfill. */
	isSessionTombstoned(session: string): Promise<boolean>;
	/** Durably records that `session` was explicitly deleted. */
	markSessionTombstoned(session: string): Promise<void>;
	/** Clears a session's deletion tombstone (used on explicit create/restore). */
	clearSessionTombstone(session: string): Promise<void>;
	/**
	 * Records whether Agent Merge is enabled for `session`. This host-owned index
	 * lets startup find the few monitored sessions without opening every session
	 * database.
	 */
	setSessionAgentMergeEnabled(session: string, enabled: boolean): Promise<void>;
	/** Session URIs currently marked Agent-Merge-enabled. */
	listAgentMergeEnabledSessions(): Promise<readonly string[]>;
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
	{
		version: 2,
		sql: 'ALTER TABLE sessions ADD COLUMN external INTEGER',
	},
	{
		version: 3,
		sql: [
			`ALTER TABLE sessions ADD COLUMN registration_source TEXT NOT NULL DEFAULT 'explicit'`,
			`UPDATE sessions SET registration_source = CASE WHEN external = 1 THEN 'discovery' ELSE 'explicit' END`,
		].join(';\n'),
	},
	{
		version: 4,
		sql: [
			'ALTER TABLE sessions ADD COLUMN modified_time INTEGER NOT NULL DEFAULT 0',
			'UPDATE sessions SET modified_time = start_time',
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

const agentMergeEnabledKeyPrefix = 'agentMergeEnabled:';

/** Metadata key marking a session as Agent-Merge-enabled. */
function agentMergeEnabledKey(session: string): string {
	return `${agentMergeEnabledKeyPrefix}${session}`;
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

	async registerSession(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean> {
		const { provider, startTime, modifiedTime = startTime, source } = sessionOptions;
		const changes = await runReturningChanges(
			await this._ensureDatabase(),
			`INSERT INTO sessions (session_uri, provider, start_time, modified_time, external, registration_source)
				SELECT ?, ?, ?, ?, CASE WHEN ? = 'discovery' THEN 1 ELSE 0 END, ?
				WHERE ? = 0 OR NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')
				ON CONFLICT(session_uri) DO UPDATE SET
					provider = CASE WHEN excluded.registration_source = 'explicit' THEN excluded.provider ELSE sessions.provider END,
					modified_time = MAX(sessions.modified_time, excluded.modified_time),
					external = CASE
						WHEN excluded.registration_source = 'explicit' THEN 0
						WHEN excluded.registration_source = 'restore' THEN 0
						WHEN sessions.registration_source = 'explicit' THEN sessions.external
						ELSE 1
					END,
					registration_source = CASE
						WHEN excluded.registration_source = 'explicit' THEN 'explicit'
						WHEN sessions.registration_source = 'explicit' THEN 'explicit'
						ELSE excluded.registration_source
					END`,
			[session, provider, startTime, modifiedTime, source, source, registerOptions.checkTombstone ? 1 : 0, tombstoneKey(session)],
		);
		if (!registerOptions.checkTombstone) {
			await this.clearSessionTombstone(session);
		}
		return changes > 0;
	}

	async unregisterSession(session: string): Promise<void> {
		const database = await this._ensureDatabase();
		try {
			await exec(
				database,
				`BEGIN IMMEDIATE;
				DELETE FROM sessions WHERE session_uri = ${quoteSqlString(session)};
				DELETE FROM metadata WHERE key = ${quoteSqlString(agentMergeEnabledKey(session))};
				COMMIT;`,
			);
		} catch (error) {
			try {
				await exec(database, 'ROLLBACK');
			} catch (rollbackError) {
				throw new AggregateError([error, rollbackError], `Failed to unregister session ${session}`);
			}
			throw error;
		}
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
				DELETE FROM metadata WHERE key = ${quoteSqlString(agentMergeEnabledKey(session))};
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

	async updateSessionExternal(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void> {
		if (updates.length === 0) {
			return;
		}
		const database = await this._ensureDatabase();
		const statements = updates.map(({ session, external }) => {
			const externalValue = external ? 1 : 0;
			const source = external
				? `'discovery'`
				: `CASE WHEN registration_source = 'explicit' THEN 'explicit' ELSE 'restore' END`;
			return `UPDATE sessions SET external = ${externalValue}, registration_source = ${source} WHERE session_uri = ${quoteSqlString(session)} AND external IS NULL`;
		});
		try {
			await exec(database, `BEGIN IMMEDIATE;\n${statements.join(';\n')};\nCOMMIT`);
		} catch (error) {
			try {
				await exec(database, 'ROLLBACK');
			} catch (rollbackError) {
				throw new AggregateError([error, rollbackError], 'Failed to update legacy session provenance');
			}
			throw error;
		}
	}

	async updateSessionModifiedTime(session: string, modifiedTime: number): Promise<boolean> {
		const changes = await runReturningChanges(
			await this._ensureDatabase(),
			'UPDATE sessions SET modified_time = ? WHERE session_uri = ? AND modified_time < ?',
			[modifiedTime, session, modifiedTime],
		);
		return changes > 0;
	}

	async listSessions(): Promise<readonly IAgentHostDatabaseSession[]> {
		const rows = await all(await this._ensureDatabase(), 'SELECT session_uri, provider, start_time, modified_time, external, registration_source FROM sessions', []);
		return rows.map(row => ({
			session: row.session_uri as string,
			provider: row.provider as AgentProvider,
			startTime: row.start_time as number,
			modifiedTime: row.modified_time as number,
			external: row.external === null ? undefined : row.external === 1,
			source: row.registration_source as AgentSessionRegistrationSource,
		}));
	}

	async getSession(session: string): Promise<IAgentHostDatabaseSession | undefined> {
		const row = await get(await this._ensureDatabase(), 'SELECT session_uri, provider, start_time, modified_time, external, registration_source FROM sessions WHERE session_uri = ?', [session]);
		if (!row) {
			return undefined;
		}
		return {
			session: row.session_uri as string,
			provider: row.provider as AgentProvider,
			startTime: row.start_time as number,
			modifiedTime: row.modified_time as number,
			external: row.external === null || row.external === undefined ? undefined : row.external === 1,
			source: row.registration_source as AgentSessionRegistrationSource,
		};
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

	setSessionAgentMergeEnabled(session: string, enabled: boolean): Promise<void> {
		return enabled
			? this._run(
				`INSERT INTO metadata (key, value) VALUES (?, 'true')
					ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
				[agentMergeEnabledKey(session)],
			)
			: this._run('DELETE FROM metadata WHERE key = ?', [agentMergeEnabledKey(session)]);
	}

	async listAgentMergeEnabledSessions(): Promise<readonly string[]> {
		const rows = await all(
			await this._ensureDatabase(),
			`SELECT key FROM metadata WHERE key LIKE ? || '%' AND value = 'true'`,
			[agentMergeEnabledKeyPrefix],
		);
		return rows.map(row => (row.key as string).slice(agentMergeEnabledKeyPrefix.length));
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
