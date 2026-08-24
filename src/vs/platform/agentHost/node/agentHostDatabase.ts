/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import type { Database, RunResult } from '@vscode/sqlite3';
import { Sequencer } from '../../../base/common/async.js';
import { stableStringify } from '../../../base/common/objects.js';
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
	readonly external: boolean | undefined;
	readonly source: AgentSessionRegistrationSource;
}

export interface IAgentHostDatabaseSessionOptions {
	readonly provider: AgentProvider;
	readonly startTime: number;
	readonly source: AgentSessionRegistrationSource;
}

export interface IAgentHostDatabaseRegisterOptions {
	readonly checkTombstone: boolean;
}

export interface IAgentHostDatabaseExternalUpdate {
	readonly session: string;
	readonly external: boolean;
}

export type AgentHostSessionsV2ExclusionReason = 'backing' | 'subagent' | 'providerAbsent' | 'staleExternal';

export interface IAgentHostDatabaseSessionsV2Exclusion {
	readonly provider: AgentProvider;
	readonly session: string;
	readonly reason: AgentHostSessionsV2ExclusionReason;
	readonly fingerprint: string;
}

export type AgentHostCatalogTitleSource = 'user' | 'agent' | 'auto';
export type AgentHostCatalogChatKind = 'default' | 'peer';

export interface IAgentHostDatabaseCatalogChat {
	readonly uri: string;
	readonly order: number;
	readonly kind: AgentHostCatalogChatKind;
	readonly title: string | undefined;
	readonly titleSource: AgentHostCatalogTitleSource | undefined;
	readonly originJson: string | undefined;
}

export interface IAgentHostDatabaseSessionV2Projection {
	readonly session: string;
	readonly sessionGeneration: string;
	readonly modifiedTime: number;
	readonly title: string | undefined;
	readonly titleSource: AgentHostCatalogTitleSource | undefined;
	readonly isRead: boolean;
	readonly isArchived: boolean;
	readonly projectUri: string | undefined;
	readonly projectDisplayName: string | undefined;
	readonly workspaceless: boolean;
	readonly isChatBacking: boolean;
	readonly ehcliAdoptable?: boolean;
	readonly ehcliAdopted?: boolean;
	readonly multiRootJson: string | undefined;
	readonly folderPickerJson: string | undefined;
	readonly changesSummaryJson: string | undefined;
	readonly githubSummaryJson: string | undefined;
	readonly gitSummaryJson: string | undefined;
	readonly sourceControlSummaryJson: string | undefined;
	readonly artifactsJson: string | undefined;
	readonly orchestrationJson: string | undefined;
	readonly sourceRevision: number;
	readonly projectionVersion: number;
	readonly sourceHash: string;
	readonly verified: true;
	readonly workingDirectoriesJson: string;
	readonly chatsJson: string;
}

export interface IAgentHostDatabaseSessionV2 extends IAgentHostDatabaseSessionV2Projection, IAgentHostDatabaseSession { }

export type AgentHostDatabaseSessionV2UpsertResult = 'applied' | 'replayed' | 'stale' | 'conflict' | 'generationMismatch' | 'missingSession' | 'tombstoned';

export interface IAgentHostDatabase extends IDisposable {
	/**
	 * Records an identity in the legacy session registry for compatibility.
	 * When requested, the tombstone check and registration are atomic.
	 */
	registerSession(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean>;
	unregisterSession(session: string): Promise<void>;
	/** Atomically tombstones and removes a session so concurrent backfill cannot re-register it. */
	tombstoneAndUnregisterSession(session: string): Promise<void>;
	updateSessionExternal(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void>;
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
	/** Whether a provider has completed backfill for a specific v2 projection version. */
	isSessionsV2Backfilled(provider: AgentProvider, projectionVersion: number): Promise<boolean>;
	/** Records that a provider completed backfill for a specific v2 projection version. */
	markSessionsV2Backfilled(provider: AgentProvider, projectionVersion: number): Promise<void>;
	/** Durably records a non-deletion exclusion from the current v2 catalog. */
	markSessionsV2Excluded(exclusion: IAgentHostDatabaseSessionsV2Exclusion): Promise<void>;
	/** Durably records multiple non-deletion exclusions in one transaction. */
	markSessionsV2ExcludedBatch?(exclusions: readonly IAgentHostDatabaseSessionsV2Exclusion[]): Promise<void>;
	/** Atomically excludes and removes a current v2 identity. */
	excludeSessionV2(exclusion: IAgentHostDatabaseSessionsV2Exclusion): Promise<void>;
	/** Reads a session's current-v2 exclusion, when present. */
	getSessionsV2Exclusion(provider: AgentProvider, session: string): Promise<IAgentHostDatabaseSessionsV2Exclusion | undefined>;
	/** Lists one provider's current-v2 exclusions without opening session databases. */
	listSessionsV2Exclusions(provider: AgentProvider): Promise<readonly IAgentHostDatabaseSessionsV2Exclusion[]>;
	/** Clears a current-v2 exclusion when a session becomes eligible again. */
	clearSessionsV2Exclusion(provider: AgentProvider, session: string): Promise<void>;
	/** Whether `session` was explicitly deleted and must not be resurrected by backfill. */
	isSessionTombstoned(session: string): Promise<boolean>;
	/** Durably records that `session` was explicitly deleted. */
	markSessionTombstoned(session: string): Promise<void>;
	/** Clears a session's deletion tombstone (used on explicit create/restore). */
	clearSessionTombstone(session: string): Promise<void>;
	/**
	 * Records a normal current-runtime identity in v2 and atomically mirrors its
	 * resolved identity to the legacy registry for downgrade compatibility.
	 */
	registerRuntimeSession(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean>;
	/** Removes a normal current-runtime identity from both registries atomically. */
	unregisterRuntimeSession(session: string): Promise<void>;
	/** Resolves normal current-runtime provenance in both registries atomically. */
	updateRuntimeSessionExternal(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void>;
	/** Cooling-only: union of current and legacy identity keys for runtime deduplication. */
	listRuntimeCompatibleSessionKeys(): Promise<readonly string[]>;
	/**
	 * Records whether Agent Merge is enabled for `session`. This host-owned index
	 * lets startup find the few monitored sessions without opening every session
	 * database.
	 */
	setSessionAgentMergeEnabled(session: string, enabled: boolean): Promise<void>;
	/** Session URIs currently marked Agent-Merge-enabled. */
	listAgentMergeEnabledSessions(): Promise<readonly string[]>;
	/** Importer-only: records an identity in v2 without writing the legacy registry. */
	registerSessionV2(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean>;
	/** Importer-only: removes an identity and projection from v2 without changing legacy. */
	unregisterSessionV2(session: string): Promise<void>;
	/** Importer-only: updates unresolved provenance in v2 without changing legacy. */
	updateSessionV2External(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void>;
	/** Importer-only: replaces v2 identity with newer legacy compatibility input. */
	reconcileSessionV2RegistrationFromLegacy(session: string, legacy: IAgentHostDatabaseSession): Promise<void>;
	/** Returns a current v2 registry identity, including one whose projection is incomplete. */
	getSessionV2Registration(session: string): Promise<IAgentHostDatabaseSession | undefined>;
	/** Lists current v2 registry identities, including rows whose projections are incomplete. */
	listSessionV2Registrations(): Promise<readonly IAgentHostDatabaseSession[]>;
	/** Importer-only: lists all v2 identities, including durably excluded rows. */
	listSessionV2RegistrationsForImport(): Promise<readonly IAgentHostDatabaseSession[]>;
	/** Whether the current v2 registry contains no identities. */
	isSessionV2RegistryEmpty(): Promise<boolean>;
	getSessionV2(session: string): Promise<IAgentHostDatabaseSessionV2 | undefined>;
	listSessionsV2(): Promise<readonly IAgentHostDatabaseSessionV2[]>;
	upsertSessionV2(projection: IAgentHostDatabaseSessionV2Projection, expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult>;
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
			`CREATE TABLE sessions_v2 (
				session_uri                 TEXT PRIMARY KEY NOT NULL REFERENCES sessions(session_uri) ON DELETE CASCADE,
				provider                    TEXT NOT NULL,
				start_time                  INTEGER NOT NULL,
				external                    INTEGER,
				registration_source         TEXT NOT NULL,
				modified_time               INTEGER,
				title                       TEXT,
				title_source                TEXT CHECK (title_source IN ('user', 'agent', 'auto')),
				is_read                     INTEGER CHECK (is_read IN (0, 1)),
				is_archived                 INTEGER CHECK (is_archived IN (0, 1)),
				project_uri                 TEXT,
				project_display_name        TEXT,
				workspaceless               INTEGER CHECK (workspaceless IN (0, 1)),
				ehcli_adoptable             INTEGER CHECK (ehcli_adoptable IN (0, 1)),
				working_directories_json    TEXT,
				chats_json                  TEXT,
				multi_root_json             TEXT,
				folder_picker_json          TEXT,
				changes_summary_json        TEXT,
				github_summary_json         TEXT,
				git_summary_json            TEXT,
				source_control_summary_json TEXT,
				artifacts_json              TEXT,
				orchestration_json          TEXT,
				session_generation          TEXT,
				source_revision             INTEGER CHECK (source_revision >= 0),
				projection_version          INTEGER CHECK (projection_version >= 0),
				source_hash                 TEXT,
				verified                    INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1))
			)`,
			`INSERT INTO sessions_v2 (session_uri, provider, start_time, external, registration_source)
				SELECT session_uri, provider, start_time, external, registration_source FROM sessions`,
		].join(';\n'),
	},
	{
		version: 5,
		sql: 'ALTER TABLE sessions_v2 ADD COLUMN is_chat_backing INTEGER NOT NULL DEFAULT 0 CHECK (is_chat_backing IN (0, 1))',
	},
	{
		version: 6,
		sql: 'ALTER TABLE sessions_v2 ADD COLUMN ehcli_adopted INTEGER CHECK (ehcli_adopted IN (0, 1))',
	},
	{
		version: 7,
		sql: [
			`CREATE TABLE sessions_v2_v7 (
				session_uri                 TEXT PRIMARY KEY NOT NULL,
				provider                    TEXT NOT NULL,
				start_time                  INTEGER NOT NULL,
				external                    INTEGER,
				registration_source         TEXT NOT NULL,
				modified_time               INTEGER,
				title                       TEXT,
				title_source                TEXT CHECK (title_source IN ('user', 'agent', 'auto')),
				is_read                     INTEGER CHECK (is_read IN (0, 1)),
				is_archived                 INTEGER CHECK (is_archived IN (0, 1)),
				project_uri                 TEXT,
				project_display_name        TEXT,
				workspaceless               INTEGER CHECK (workspaceless IN (0, 1)),
				ehcli_adoptable             INTEGER CHECK (ehcli_adoptable IN (0, 1)),
				working_directories_json    TEXT,
				chats_json                  TEXT,
				multi_root_json             TEXT,
				folder_picker_json          TEXT,
				changes_summary_json        TEXT,
				github_summary_json         TEXT,
				git_summary_json            TEXT,
				source_control_summary_json TEXT,
				artifacts_json              TEXT,
				orchestration_json          TEXT,
				session_generation          TEXT,
				source_revision             INTEGER CHECK (source_revision >= 0),
				projection_version          INTEGER CHECK (projection_version >= 0),
				source_hash                 TEXT,
				verified                    INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
				is_chat_backing             INTEGER NOT NULL DEFAULT 0 CHECK (is_chat_backing IN (0, 1)),
				ehcli_adopted               INTEGER CHECK (ehcli_adopted IN (0, 1))
			)`,
			`INSERT INTO sessions_v2_v7 (
				session_uri, provider, start_time, external, registration_source, modified_time, title, title_source,
				is_read, is_archived, project_uri, project_display_name, workspaceless, ehcli_adoptable,
				working_directories_json, chats_json, multi_root_json, folder_picker_json, changes_summary_json,
				github_summary_json, git_summary_json, source_control_summary_json, artifacts_json, orchestration_json,
				session_generation, source_revision, projection_version, source_hash, verified, is_chat_backing, ehcli_adopted
			)
				SELECT
					session_uri, provider, start_time, external, registration_source, modified_time, title, title_source,
					is_read, is_archived, project_uri, project_display_name, workspaceless, ehcli_adoptable,
					working_directories_json, chats_json, multi_root_json, folder_picker_json, changes_summary_json,
					github_summary_json, git_summary_json, source_control_summary_json, artifacts_json, orchestration_json,
					session_generation, source_revision, projection_version, source_hash, verified, is_chat_backing, ehcli_adopted
				FROM sessions_v2`,
			'DROP TABLE sessions_v2',
			'ALTER TABLE sessions_v2_v7 RENAME TO sessions_v2',
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

/** Metadata key for a provider's completed current-projection backfill. */
function sessionsV2BackfillKey(provider: AgentProvider, projectionVersion: number): string {
	return `sessionsV2Backfilled:${provider}:v${projectionVersion}`;
}

const sessionsV2ExcludedKeyPrefix = 'sessionsV2Excluded:';

function sessionsV2ExcludedProviderPrefix(provider: AgentProvider): string {
	return `${sessionsV2ExcludedKeyPrefix}${provider}:`;
}

function sessionsV2ExcludedKey(provider: AgentProvider, session: string): string {
	return `${sessionsV2ExcludedProviderPrefix(provider)}${session}`;
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

function close(database: Database): Promise<void> {
	return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

export class AgentHostDatabase implements IAgentHostDatabase {

	private _databasePromise: Promise<Database> | undefined;
	private _closed: Promise<void> | true | undefined;
	private readonly _transactionSequencer = new Sequencer();

	constructor(private readonly _path: string) { }

	async registerSession(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean> {
		const { provider, startTime, source } = sessionOptions;
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const changes = await runReturningChanges(
					database,
					`INSERT INTO sessions (session_uri, provider, start_time, external, registration_source)
						SELECT ?, ?, ?, CASE WHEN ? = 'discovery' THEN 1 ELSE 0 END, ?
						WHERE ? = 0 OR NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')
						ON CONFLICT(session_uri) DO UPDATE SET
							provider = CASE WHEN excluded.registration_source = 'explicit' THEN excluded.provider ELSE sessions.provider END,
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
					[session, provider, startTime, source, source, registerOptions.checkTombstone ? 1 : 0, tombstoneKey(session)],
				);
				if (!registerOptions.checkTombstone) {
					await run(database, 'DELETE FROM metadata WHERE key = ?', [tombstoneKey(session)]);
				}
				await exec(database, 'COMMIT');
				return changes > 0;
			} catch (error) {
				return this._rollback(database, error, `Failed to register session ${session}`);
			}
		});
	}

	async unregisterSession(session: string): Promise<void> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				await run(database, 'DELETE FROM sessions WHERE session_uri = ?', [session]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [agentMergeEnabledKey(session)]);
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, `Failed to unregister session ${session}`);
			}
		});
	}

	async tombstoneAndUnregisterSession(session: string): Promise<void> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				await run(database, `INSERT INTO metadata (key, value) VALUES (?, 'true')
					ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [tombstoneKey(session)]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [agentMergeEnabledKey(session)]);
				await run(database, 'DELETE FROM sessions WHERE session_uri = ?', [session]);
				await run(database, 'DELETE FROM sessions_v2 WHERE session_uri = ?', [session]);
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, `Failed to tombstone session ${session}`);
			}
		});
	}

	async updateSessionExternal(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void> {
		if (updates.length === 0) {
			return;
		}
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				for (const { session, external } of updates) {
					const source = external
						? `'discovery'`
						: `CASE WHEN registration_source = 'explicit' THEN 'explicit' ELSE 'restore' END`;
					await run(database, `UPDATE sessions SET external = ?, registration_source = ${source}
						WHERE session_uri = ? AND external IS NULL`, [external ? 1 : 0, session]);
				}
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, 'Failed to update legacy session provenance');
			}
		});
	}

	async listSessions(): Promise<readonly IAgentHostDatabaseSession[]> {
		const rows = await all(await this._ensureDatabase(), 'SELECT session_uri, provider, start_time, external, registration_source FROM sessions', []);
		return rows.map(row => ({
			session: row.session_uri as string,
			provider: row.provider as AgentProvider,
			startTime: row.start_time as number,
			external: row.external === null ? undefined : row.external === 1,
			source: row.registration_source as AgentSessionRegistrationSource,
		}));
	}

	async getSession(session: string): Promise<IAgentHostDatabaseSession | undefined> {
		const row = await get(await this._ensureDatabase(), 'SELECT session_uri, provider, start_time, external, registration_source FROM sessions WHERE session_uri = ?', [session]);
		if (!row) {
			return undefined;
		}
		return {
			session: row.session_uri as string,
			provider: row.provider as AgentProvider,
			startTime: row.start_time as number,
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

	async isSessionsV2Backfilled(provider: AgentProvider, projectionVersion: number): Promise<boolean> {
		this._validateProjectionVersion(projectionVersion);
		const row = await get(await this._ensureDatabase(), 'SELECT value FROM metadata WHERE key = ?', [sessionsV2BackfillKey(provider, projectionVersion)]);
		return row?.value === 'true';
	}

	markSessionsV2Backfilled(provider: AgentProvider, projectionVersion: number): Promise<void> {
		this._validateProjectionVersion(projectionVersion);
		return this._run(
			`INSERT INTO metadata (key, value) VALUES (?, 'true')
				ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[sessionsV2BackfillKey(provider, projectionVersion)],
		);
	}

	markSessionsV2Excluded(exclusion: IAgentHostDatabaseSessionsV2Exclusion): Promise<void> {
		return this.markSessionsV2ExcludedBatch([exclusion]);
	}

	markSessionsV2ExcludedBatch(exclusions: readonly IAgentHostDatabaseSessionsV2Exclusion[]): Promise<void> {
		if (exclusions.length === 0) {
			return Promise.resolve();
		}
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				for (const exclusion of exclusions) {
					await run(database, `INSERT INTO metadata (key, value)
						SELECT ?, ?
						WHERE NOT EXISTS (SELECT 1 FROM sessions_v2 WHERE session_uri = ?)
						ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [
						sessionsV2ExcludedKey(exclusion.provider, exclusion.session),
						JSON.stringify({ reason: exclusion.reason, fingerprint: exclusion.fingerprint }),
						exclusion.session,
					]);
				}
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, 'Failed to mark sessions_v2 exclusions');
			}
		});
	}

	excludeSessionV2(exclusion: IAgentHostDatabaseSessionsV2Exclusion): Promise<void> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				await run(database, `INSERT INTO metadata (key, value) VALUES (?, ?)
					ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [
					sessionsV2ExcludedKey(exclusion.provider, exclusion.session),
					JSON.stringify({ reason: exclusion.reason, fingerprint: exclusion.fingerprint }),
				]);
				await run(database, 'DELETE FROM sessions_v2 WHERE session_uri = ?', [exclusion.session]);
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, `Failed to exclude sessions_v2 identity ${exclusion.session}`);
			}
		});
	}

	async getSessionsV2Exclusion(provider: AgentProvider, session: string): Promise<IAgentHostDatabaseSessionsV2Exclusion | undefined> {
		const row = await get(await this._ensureDatabase(), 'SELECT value FROM metadata WHERE key = ?', [sessionsV2ExcludedKey(provider, session)]);
		return row ? this._toSessionsV2Exclusion(provider, session, row.value as string) : undefined;
	}

	async listSessionsV2Exclusions(provider: AgentProvider): Promise<readonly IAgentHostDatabaseSessionsV2Exclusion[]> {
		const prefix = sessionsV2ExcludedProviderPrefix(provider);
		const upperBound = `${prefix.slice(0, -1)};`;
		const rows = await all(
			await this._ensureDatabase(),
			'SELECT key, value FROM metadata WHERE key >= ? AND key < ? ORDER BY key',
			[prefix, upperBound],
		);
		return rows.map(row => this._toSessionsV2Exclusion(provider, (row.key as string).slice(prefix.length), row.value as string));
	}

	clearSessionsV2Exclusion(provider: AgentProvider, session: string): Promise<void> {
		return this._run('DELETE FROM metadata WHERE key = ?', [sessionsV2ExcludedKey(provider, session)]);
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

	async registerRuntimeSession(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean> {
		const { provider, startTime, source } = sessionOptions;
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const existing = await get(database, `SELECT provider FROM sessions_v2 WHERE session_uri = ?
					UNION ALL SELECT provider FROM sessions WHERE session_uri = ?
					LIMIT 1`, [session, session]);
				await run(database, `INSERT INTO sessions_v2 (session_uri, provider, start_time, external, registration_source)
					SELECT session_uri, provider, start_time, external, registration_source
					FROM sessions
					WHERE session_uri = ?
						AND (? = 0 OR NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true'))
						AND NOT EXISTS (SELECT 1 FROM sessions_v2 WHERE session_uri = ?)`, [
					session,
					registerOptions.checkTombstone ? 1 : 0,
					tombstoneKey(session),
					session,
				]);
				const changes = await this._registerSessionV2(database, session, provider, startTime, source, registerOptions);
				if (changes > 0) {
					const row = await get(database, 'SELECT session_uri, provider, start_time, external, registration_source FROM sessions_v2 WHERE session_uri = ?', [session]);
					if (!row) {
						throw new Error(`Missing sessions_v2 identity after registering ${session}`);
					}
					await run(database, `INSERT INTO sessions (session_uri, provider, start_time, external, registration_source)
						VALUES (?, ?, ?, ?, ?)
						ON CONFLICT(session_uri) DO UPDATE SET
							provider = excluded.provider,
							start_time = excluded.start_time,
							external = excluded.external,
							registration_source = excluded.registration_source`, [
						row.session_uri,
						row.provider,
						row.start_time,
						row.external,
						row.registration_source,
					]);
					for (const excludedProvider of new Set([provider, row.provider as AgentProvider, existing?.provider as AgentProvider | undefined])) {
						if (excludedProvider !== undefined) {
							await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionsV2ExcludedKey(excludedProvider, session)]);
						}
					}
				}
				if (!registerOptions.checkTombstone) {
					await run(database, 'DELETE FROM metadata WHERE key = ?', [tombstoneKey(session)]);
				}
				await exec(database, 'COMMIT');
				return changes > 0;
			} catch (error) {
				return this._rollback(database, error, `Failed to register mirrored runtime session ${session}`);
			}
		});
	}

	async listRuntimeCompatibleSessionKeys(): Promise<readonly string[]> {
		const rows = await all(
			await this._ensureDatabase(),
			`SELECT session_uri FROM sessions
				WHERE NOT EXISTS (
					SELECT 1 FROM metadata
					WHERE key = '${sessionsV2ExcludedKeyPrefix}' || sessions.provider || ':' || sessions.session_uri
				)
				UNION
				SELECT session_uri FROM sessions_v2
				WHERE NOT EXISTS (
					SELECT 1 FROM metadata
					WHERE key = '${sessionsV2ExcludedKeyPrefix}' || sessions_v2.provider || ':' || sessions_v2.session_uri
				)
				ORDER BY session_uri`,
			[],
		);
		return rows.map(row => row.session_uri as string);
	}

	async unregisterRuntimeSession(session: string): Promise<void> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				await run(database, 'DELETE FROM sessions_v2 WHERE session_uri = ?', [session]);
				await run(database, 'DELETE FROM sessions WHERE session_uri = ?', [session]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [agentMergeEnabledKey(session)]);
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, `Failed to unregister mirrored runtime session ${session}`);
			}
		});
	}

	async updateRuntimeSessionExternal(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void> {
		if (updates.length === 0) {
			return;
		}
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				for (const { session, external } of updates) {
					const source = external
						? `'discovery'`
						: `CASE WHEN registration_source = 'explicit' THEN 'explicit' ELSE 'restore' END`;
					await run(database, `UPDATE sessions_v2 SET external = ?, registration_source = ${source}
						WHERE session_uri = ? AND external IS NULL`, [external ? 1 : 0, session]);
					await run(database, `INSERT INTO sessions (session_uri, provider, start_time, external, registration_source)
						SELECT session_uri, provider, start_time, external, registration_source
						FROM sessions_v2 WHERE session_uri = ?
						ON CONFLICT(session_uri) DO UPDATE SET
							provider = excluded.provider,
							start_time = excluded.start_time,
							external = excluded.external,
							registration_source = excluded.registration_source`, [session]);
				}
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, 'Failed to update mirrored runtime session provenance');
			}
		});
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

	async registerSessionV2(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean> {
		const { provider, startTime, source } = sessionOptions;
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const changes = await this._registerSessionV2(database, session, provider, startTime, source, registerOptions);
				if (!registerOptions.checkTombstone) {
					await run(database, 'DELETE FROM metadata WHERE key = ?', [tombstoneKey(session)]);
				}
				if (changes > 0) {
					await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionsV2ExcludedKey(provider, session)]);
				}
				await exec(database, 'COMMIT');
				return changes > 0;
			} catch (error) {
				return this._rollback(database, error, `Failed to register sessions_v2 identity ${session}`);
			}
		});
	}

	async reconcileSessionV2RegistrationFromLegacy(session: string, legacy: IAgentHostDatabaseSession): Promise<void> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				await run(database, `UPDATE sessions_v2 SET
						provider = ?,
						start_time = ?,
						external = ?,
						registration_source = ?
					WHERE session_uri = ?
						AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')
						AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = ?)`, [
					legacy.provider,
					legacy.startTime,
					legacy.external === undefined ? null : legacy.external ? 1 : 0,
					legacy.source,
					session,
					tombstoneKey(session),
					sessionsV2ExcludedKey(legacy.provider, session),
				]);
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, `Failed to reconcile sessions_v2 identity ${session} from legacy`);
			}
		});
	}

	async unregisterSessionV2(session: string): Promise<void> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				await run(database, 'DELETE FROM sessions_v2 WHERE session_uri = ?', [session]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [agentMergeEnabledKey(session)]);
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, `Failed to unregister sessions_v2 identity ${session}`);
			}
		});
	}

	async updateSessionV2External(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void> {
		if (updates.length === 0) {
			return;
		}
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				for (const { session, external } of updates) {
					const source = external
						? `'discovery'`
						: `CASE WHEN registration_source = 'explicit' THEN 'explicit' ELSE 'restore' END`;
					await run(database, `UPDATE sessions_v2 SET external = ?, registration_source = ${source}
						WHERE session_uri = ? AND external IS NULL`, [external ? 1 : 0, session]);
				}
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, 'Failed to update sessions_v2 provenance');
			}
		});
	}

	async getSessionV2Registration(session: string): Promise<IAgentHostDatabaseSession | undefined> {
		const row = await get(
			await this._ensureDatabase(),
			`SELECT session_uri, provider, start_time, external, registration_source
				FROM sessions_v2
				WHERE session_uri = ?
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')
					AND NOT EXISTS (
						SELECT 1 FROM metadata
						WHERE key = '${sessionsV2ExcludedKeyPrefix}' || sessions_v2.provider || ':' || sessions_v2.session_uri
					)`,
			[session, tombstoneKey(session)],
		);
		return row ? this._toSessionRegistration(row) : undefined;
	}

	async listSessionV2Registrations(): Promise<readonly IAgentHostDatabaseSession[]> {
		const rows = await all(
			await this._ensureDatabase(),
			`SELECT session_uri, provider, start_time, external, registration_source
				FROM sessions_v2
				WHERE NOT EXISTS (
					SELECT 1 FROM metadata
					WHERE key = 'sessionTombstone:' || sessions_v2.session_uri AND value = 'true'
				)
					AND NOT EXISTS (
						SELECT 1 FROM metadata
						WHERE key = '${sessionsV2ExcludedKeyPrefix}' || sessions_v2.provider || ':' || sessions_v2.session_uri
					)
				ORDER BY session_uri`,
			[],
		);
		return rows.map(row => this._toSessionRegistration(row));
	}

	async listSessionV2RegistrationsForImport(): Promise<readonly IAgentHostDatabaseSession[]> {
		const rows = await all(
			await this._ensureDatabase(),
			`SELECT session_uri, provider, start_time, external, registration_source
				FROM sessions_v2
				ORDER BY session_uri`,
			[],
		);
		return rows.map(row => this._toSessionRegistration(row));
	}

	async isSessionV2RegistryEmpty(): Promise<boolean> {
		const row = await get(
			await this._ensureDatabase(),
			`SELECT 1 AS present FROM sessions_v2
				WHERE NOT EXISTS (
					SELECT 1 FROM metadata
					WHERE key = 'sessionTombstone:' || sessions_v2.session_uri AND value = 'true'
				)
					AND NOT EXISTS (
						SELECT 1 FROM metadata
						WHERE key = '${sessionsV2ExcludedKeyPrefix}' || sessions_v2.provider || ':' || sessions_v2.session_uri
					)
				LIMIT 1`,
			[],
		);
		return row === undefined;
	}

	async getSessionV2(session: string): Promise<IAgentHostDatabaseSessionV2 | undefined> {
		const row = await get(
			await this._ensureDatabase(),
			`SELECT *
				FROM sessions_v2
				WHERE sessions_v2.session_uri = ? AND sessions_v2.verified = 1
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')
					AND NOT EXISTS (
						SELECT 1 FROM metadata
						WHERE key = '${sessionsV2ExcludedKeyPrefix}' || sessions_v2.provider || ':' || sessions_v2.session_uri
					)`,
			[session, tombstoneKey(session)],
		);
		return row ? this._toSessionV2(row) : undefined;
	}

	async listSessionsV2(): Promise<readonly IAgentHostDatabaseSessionV2[]> {
		const rows = await all(
			await this._ensureDatabase(),
			`SELECT *
				FROM sessions_v2
				WHERE sessions_v2.verified = 1
					AND NOT EXISTS (
						SELECT 1 FROM metadata
						WHERE key = 'sessionTombstone:' || sessions_v2.session_uri AND value = 'true'
					)
					AND NOT EXISTS (
						SELECT 1 FROM metadata
						WHERE key = '${sessionsV2ExcludedKeyPrefix}' || sessions_v2.provider || ':' || sessions_v2.session_uri
					)
				ORDER BY sessions_v2.session_uri`,
			[],
		);
		return rows.map(row => this._toSessionV2(row));
	}

	async upsertSessionV2(projection: IAgentHostDatabaseSessionV2Projection, expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> {
		this._validateSessionV2Projection(projection);
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const tombstone = await get(database, 'SELECT value FROM metadata WHERE key = ?', [tombstoneKey(projection.session)]);
				if (tombstone?.value === 'true') {
					await exec(database, 'COMMIT');
					return 'tombstoned';
				}
				const registry = await get(database, 'SELECT provider, start_time, external, registration_source FROM sessions_v2 WHERE session_uri = ?', [projection.session]);
				if (!registry) {
					await exec(database, 'COMMIT');
					return 'missingSession';
				}
				const exclusion = await get(database, 'SELECT 1 FROM metadata WHERE key = ?', [sessionsV2ExcludedKey(registry.provider as AgentProvider, projection.session)]);
				if (exclusion) {
					await exec(database, 'COMMIT');
					return 'missingSession';
				}
				const current = await get(database, 'SELECT session_generation, source_revision, projection_version, source_hash, verified FROM sessions_v2 WHERE session_uri = ?', [projection.session]);
				const currentGeneration = current?.session_generation === null || current?.verified !== 1 ? undefined : current?.session_generation as string;
				if (currentGeneration !== expectedSessionGeneration) {
					await exec(database, 'COMMIT');
					return 'generationMismatch';
				}
				if (currentGeneration === projection.sessionGeneration) {
					const currentRevision = current?.source_revision as number;
					if (projection.sourceRevision < currentRevision) {
						await exec(database, 'COMMIT');
						return 'stale';
					}
					if (projection.sourceRevision === currentRevision) {
						const replayed = current?.projection_version === projection.projectionVersion && current?.source_hash === projection.sourceHash;
						await exec(database, 'COMMIT');
						return replayed ? 'replayed' : 'conflict';
					}
				}

				await run(database, `INSERT INTO sessions_v2 (
				session_uri, provider, start_time, external, registration_source,
				modified_time, title, title_source, is_read, is_archived, project_uri, project_display_name,
				workspaceless, is_chat_backing, ehcli_adoptable, ehcli_adopted, working_directories_json, chats_json, multi_root_json,
				folder_picker_json, changes_summary_json, github_summary_json, git_summary_json,
				source_control_summary_json, artifacts_json, orchestration_json, session_generation,
				source_revision, projection_version, source_hash, verified
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
			ON CONFLICT(session_uri) DO UPDATE SET
				provider = excluded.provider,
				start_time = excluded.start_time,
				external = excluded.external,
				registration_source = excluded.registration_source,
				modified_time = excluded.modified_time,
				title = excluded.title,
				title_source = excluded.title_source,
				is_read = excluded.is_read,
				is_archived = excluded.is_archived,
				project_uri = excluded.project_uri,
				project_display_name = excluded.project_display_name,
				workspaceless = excluded.workspaceless,
				is_chat_backing = excluded.is_chat_backing,
				ehcli_adoptable = excluded.ehcli_adoptable,
				ehcli_adopted = excluded.ehcli_adopted,
				working_directories_json = excluded.working_directories_json,
				chats_json = excluded.chats_json,
				multi_root_json = excluded.multi_root_json,
				folder_picker_json = excluded.folder_picker_json,
				changes_summary_json = excluded.changes_summary_json,
				github_summary_json = excluded.github_summary_json,
				git_summary_json = excluded.git_summary_json,
				source_control_summary_json = excluded.source_control_summary_json,
				artifacts_json = excluded.artifacts_json,
				orchestration_json = excluded.orchestration_json,
				session_generation = excluded.session_generation,
				source_revision = excluded.source_revision,
				projection_version = excluded.projection_version,
				source_hash = excluded.source_hash,
				verified = excluded.verified`, [
					projection.session,
					registry.provider,
					registry.start_time,
					registry.external,
					registry.registration_source,
					projection.modifiedTime,
					projection.title,
					projection.titleSource,
					projection.isRead ? 1 : 0,
					projection.isArchived ? 1 : 0,
					projection.projectUri,
					projection.projectDisplayName,
					projection.workspaceless ? 1 : 0,
					projection.isChatBacking ? 1 : 0,
					projection.ehcliAdoptable === undefined ? null : projection.ehcliAdoptable ? 1 : 0,
					projection.ehcliAdopted === undefined ? null : projection.ehcliAdopted ? 1 : 0,
					projection.workingDirectoriesJson,
					projection.chatsJson,
					projection.multiRootJson,
					projection.folderPickerJson,
					projection.changesSummaryJson,
					projection.githubSummaryJson,
					projection.gitSummaryJson,
					projection.sourceControlSummaryJson,
					projection.artifactsJson,
					projection.orchestrationJson,
					projection.sessionGeneration,
					projection.sourceRevision,
					projection.projectionVersion,
					projection.sourceHash,
				]);
				await exec(database, 'COMMIT');
				return 'applied';
			} catch (error) {
				return this._rollback(database, error, `Failed to upsert sessions_v2 row for ${projection.session}`);
			}
		});
	}

	private _registerSessionV2(
		database: Database,
		session: string,
		provider: AgentProvider,
		startTime: number,
		source: AgentSessionRegistrationSource,
		registerOptions: IAgentHostDatabaseRegisterOptions,
	): Promise<number> {
		return runReturningChanges(
			database,
			`INSERT INTO sessions_v2 (session_uri, provider, start_time, external, registration_source)
				SELECT ?, ?, ?, CASE WHEN ? = 'discovery' THEN 1 ELSE 0 END, ?
				WHERE ? = 0 OR NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')
				ON CONFLICT(session_uri) DO UPDATE SET
					provider = CASE WHEN excluded.registration_source = 'explicit' THEN excluded.provider ELSE sessions_v2.provider END,
					external = CASE
						WHEN excluded.registration_source IN ('explicit', 'restore') THEN 0
						WHEN sessions_v2.registration_source = 'explicit' THEN sessions_v2.external
						ELSE 1
					END,
					registration_source = CASE
						WHEN excluded.registration_source = 'explicit' THEN 'explicit'
						WHEN sessions_v2.registration_source = 'explicit' THEN 'explicit'
						ELSE excluded.registration_source
					END`,
			[session, provider, startTime, source, source, registerOptions.checkTombstone ? 1 : 0, tombstoneKey(session)],
		);
	}

	private _validateSessionV2Projection(projection: IAgentHostDatabaseSessionV2Projection): void {
		for (const [name, value] of [
			['modifiedTime', projection.modifiedTime],
			['sourceRevision', projection.sourceRevision],
			['projectionVersion', projection.projectionVersion],
		] as const) {
			if (!Number.isSafeInteger(value) || value < 0) {
				throw new Error(`Catalog ${name} must be a non-negative safe integer`);
			}
		}
		for (const [name, value] of [
			['session', projection.session],
			['sessionGeneration', projection.sessionGeneration],
			['sourceHash', projection.sourceHash],
			['workingDirectoriesJson', projection.workingDirectoriesJson],
			['chatsJson', projection.chatsJson],
		] as const) {
			if (!value) {
				throw new Error(`Catalog ${name} must not be empty`);
			}
		}
		if (projection.verified !== true) {
			throw new Error('Catalog projection must be verified before it is stored');
		}
		const workingDirectories = this._validateCanonicalJson('workingDirectoriesJson', projection.workingDirectoriesJson);
		const chats = this._validateCanonicalJson('chatsJson', projection.chatsJson);
		if (!Array.isArray(workingDirectories) || !Array.isArray(chats)) {
			throw new Error('Catalog working directories and chats must be JSON arrays');
		}
		for (const [name, value] of [
			['multiRootJson', projection.multiRootJson],
			['folderPickerJson', projection.folderPickerJson],
			['changesSummaryJson', projection.changesSummaryJson],
			['githubSummaryJson', projection.githubSummaryJson],
			['gitSummaryJson', projection.gitSummaryJson],
			['sourceControlSummaryJson', projection.sourceControlSummaryJson],
			['artifactsJson', projection.artifactsJson],
			['orchestrationJson', projection.orchestrationJson],
		] as const) {
			if (value !== undefined) {
				this._validateCanonicalJson(name, value);
			}
		}
	}

	private _validateProjectionVersion(projectionVersion: number): void {
		if (!Number.isSafeInteger(projectionVersion) || projectionVersion < 0) {
			throw new Error('Catalog projectionVersion must be a non-negative safe integer');
		}
	}

	private _toSessionsV2Exclusion(provider: AgentProvider, session: string, value: string): IAgentHostDatabaseSessionsV2Exclusion {
		const parsed = JSON.parse(value);
		if (!parsed || typeof parsed !== 'object'
			|| !['backing', 'subagent', 'providerAbsent', 'staleExternal'].includes(parsed.reason)
			|| typeof parsed.fingerprint !== 'string') {
			throw new Error(`Invalid sessions_v2 exclusion for ${session}`);
		}
		return { provider, session, reason: parsed.reason, fingerprint: parsed.fingerprint };
	}

	private _validateCanonicalJson(name: string, value: string): unknown {
		const parsed = JSON.parse(value);
		if (stableStringify(parsed) !== value) {
			throw new Error(`Catalog ${name} must be canonical JSON`);
		}
		return parsed;
	}

	private _toSessionV2(row: Record<string, unknown>): IAgentHostDatabaseSessionV2 {
		return {
			session: row.session_uri as string,
			provider: row.provider as AgentProvider,
			startTime: row.start_time as number,
			external: row.external === null ? undefined : row.external === 1,
			source: row.registration_source as AgentSessionRegistrationSource,
			sessionGeneration: row.session_generation as string,
			modifiedTime: row.modified_time as number,
			title: row.title === null ? undefined : row.title as string,
			titleSource: row.title_source === null ? undefined : row.title_source as AgentHostCatalogTitleSource,
			isRead: row.is_read === 1,
			isArchived: row.is_archived === 1,
			projectUri: row.project_uri === null ? undefined : row.project_uri as string,
			projectDisplayName: row.project_display_name === null ? undefined : row.project_display_name as string,
			workspaceless: row.workspaceless === 1,
			isChatBacking: row.is_chat_backing === 1,
			ehcliAdoptable: row.ehcli_adoptable === null ? undefined : row.ehcli_adoptable === 1,
			ehcliAdopted: row.ehcli_adopted === null ? undefined : row.ehcli_adopted === 1,
			workingDirectoriesJson: row.working_directories_json as string,
			chatsJson: row.chats_json as string,
			multiRootJson: row.multi_root_json === null ? undefined : row.multi_root_json as string,
			folderPickerJson: row.folder_picker_json === null ? undefined : row.folder_picker_json as string,
			changesSummaryJson: row.changes_summary_json === null ? undefined : row.changes_summary_json as string,
			githubSummaryJson: row.github_summary_json === null ? undefined : row.github_summary_json as string,
			gitSummaryJson: row.git_summary_json === null ? undefined : row.git_summary_json as string,
			sourceControlSummaryJson: row.source_control_summary_json === null ? undefined : row.source_control_summary_json as string,
			artifactsJson: row.artifacts_json === null ? undefined : row.artifacts_json as string,
			orchestrationJson: row.orchestration_json === null ? undefined : row.orchestration_json as string,
			sourceRevision: row.source_revision as number,
			projectionVersion: row.projection_version as number,
			sourceHash: row.source_hash as string,
			verified: true,
		};
	}

	private _toSessionRegistration(row: Record<string, unknown>): IAgentHostDatabaseSession {
		return {
			session: row.session_uri as string,
			provider: row.provider as AgentProvider,
			startTime: row.start_time as number,
			external: row.external === null ? undefined : row.external === 1,
			source: row.registration_source as AgentSessionRegistrationSource,
		};
	}

	private async _rollback(database: Database, error: unknown, message: string): Promise<never> {
		try {
			await exec(database, 'ROLLBACK');
		} catch (rollbackError) {
			throw new AggregateError([error, rollbackError], message);
		}
		throw error;
	}

	private async _run(sql: string, parameters: readonly unknown[]): Promise<void> {
		await this._transactionSequencer.queue(async () => run(await this._ensureDatabase(), sql, parameters));
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
					await exec(database, 'PRAGMA foreign_keys = ON');
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
