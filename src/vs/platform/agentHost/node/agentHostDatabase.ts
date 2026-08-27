/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import type { Database, RunResult } from '@vscode/sqlite3';
import { Sequencer } from '../../../base/common/async.js';
import { dirname } from '../../../base/common/path.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { AgentProvider } from '../common/agent.js';
import { decodeAgentHostCatalogPayload, hashAgentHostCatalogPayload } from './agentHostCatalogProjection.js';

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

export type AgentHostSessionsV2ExclusionReason = 'backing' | 'subagent' | 'providerAbsent' | 'staleExternal';

export interface IAgentHostDatabaseSessionsV2Exclusion {
	readonly provider: AgentProvider;
	readonly session: string;
	readonly reason: AgentHostSessionsV2ExclusionReason;
	readonly fingerprint: string;
}

/** Durable catalog envelope written alongside the opaque, self-describing payload. */
export interface IAgentHostDatabaseSessionV2Envelope {
	readonly session: string;
	readonly sessionGeneration: string;
	readonly sourceRevision: number;
	readonly payloadVersion: number;
	readonly payloadHash: string;
	readonly verified: true;
	readonly payload: string;
}

/** Envelope identity without the payload, for callers that only compare receipts. */
export interface IAgentHostDatabaseSessionV2Receipt extends Omit<IAgentHostDatabaseSessionV2Envelope, 'payload'>, IAgentHostDatabaseSession {
	/** Derived from the validated payload so the catalog can hide chat-backing rows without decoding. */
	readonly isChatBacking: boolean;
	/** `0` when clean; positive values are monotonic dirty markers used for compare-and-set repair. */
	readonly payloadDirty: number;
}

export interface IAgentHostDatabaseSessionV2 extends IAgentHostDatabaseSessionV2Receipt {
	readonly payload: string;
}

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
	/** Whether a provider has completed backfill for a specific v2 payload version. */
	isSessionsV2Backfilled(provider: AgentProvider, payloadVersion: number): Promise<boolean>;
	/** Records that a provider completed backfill for a specific v2 payload version. */
	markSessionsV2Backfilled(provider: AgentProvider, payloadVersion: number): Promise<void>;
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
	/** Importer-only: removes an identity and its payload from v2 without changing legacy. */
	unregisterSessionV2(session: string): Promise<void>;
	/** Importer-only: updates unresolved provenance in v2 without changing legacy. */
	updateSessionV2External(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void>;
	/** Importer-only: replaces v2 identity with newer legacy compatibility input. */
	reconcileSessionV2RegistrationFromLegacy(session: string, legacy: IAgentHostDatabaseSession): Promise<void>;
	/** Returns a current v2 registry identity, including one whose payload is incomplete. */
	getSessionV2Registration(session: string): Promise<IAgentHostDatabaseSession | undefined>;
	/** Lists current v2 registry identities, including rows whose payloads are incomplete. */
	listSessionV2Registrations(): Promise<readonly IAgentHostDatabaseSession[]>;
	/** Importer-only: lists all v2 identities, including durably excluded rows. */
	listSessionV2RegistrationsForImport(): Promise<readonly IAgentHostDatabaseSession[]>;
	/** Whether the current v2 registry contains no identities. */
	isSessionV2RegistryEmpty(): Promise<boolean>;
	getSessionV2(session: string): Promise<IAgentHostDatabaseSessionV2 | undefined>;
	listSessionsV2(): Promise<readonly IAgentHostDatabaseSessionV2[]>;
	/** Lists catalog receipts without materializing payloads, for startup scans. */
	listSessionsV2Receipts(): Promise<readonly IAgentHostDatabaseSessionV2Receipt[]>;
	/** Marks one cached payload dirty and returns the marker repair must compare-and-set. */
	markSessionV2PayloadDirty(session: string): Promise<number | undefined>;
	/** Marks every cached payload dirty once so mutations made by older builds are rechecked. */
	markAllSessionsV2PayloadsDirty(): Promise<void>;
	/** Clears a dirty marker only when no newer mutation superseded it. */
	markSessionV2PayloadClean(session: string, expectedDirty: number): Promise<boolean>;
	upsertSessionV2(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult>;
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
	{
		version: 8,
		sql: [
			`CREATE TABLE sessions_v2_v8 (
				session_uri         TEXT PRIMARY KEY NOT NULL,
				provider            TEXT NOT NULL,
				start_time          INTEGER NOT NULL,
				external            INTEGER,
				registration_source TEXT NOT NULL,
				session_generation  TEXT,
				source_revision     INTEGER CHECK (source_revision >= 0),
				payload_version     INTEGER CHECK (payload_version >= 0),
				payload_hash        TEXT,
				verified            INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
				payload             TEXT,
				is_chat_backing     INTEGER NOT NULL DEFAULT 0 CHECK (is_chat_backing IN (0, 1))
			)`,
			`INSERT INTO sessions_v2_v8 (
				session_uri, provider, start_time, external, registration_source,
				session_generation, source_revision, payload_version, payload_hash, verified, payload, is_chat_backing
			)
				SELECT
					session_uri, provider, start_time, external, registration_source,
					session_generation, source_revision, projection_version, source_hash, 0, NULL, is_chat_backing
				FROM sessions_v2`,
			'DROP TABLE sessions_v2',
			'ALTER TABLE sessions_v2_v8 RENAME TO sessions_v2',
		].join(';\n'),
	},
	{
		version: 9,
		sql: [
			'ALTER TABLE sessions ADD COLUMN modified_time INTEGER NOT NULL DEFAULT 0',
			'UPDATE sessions SET modified_time = start_time',
		].join(';\n'),
	},
	{
		version: 10,
		sql: [
			'ALTER TABLE sessions_v2 ADD COLUMN modified_time INTEGER NOT NULL DEFAULT 0',
			'UPDATE sessions_v2 SET modified_time = start_time',
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

/** Metadata key for a provider's completed current-payload backfill. */
function sessionsV2BackfillKey(provider: AgentProvider, payloadVersion: number): string {
	return `sessionsV2PayloadBackfilled:${provider}:v${payloadVersion}`;
}

const sessionsV2ExcludedKeyPrefix = 'sessionsV2Excluded:';
const sessionsV2PayloadDirtyKeyPrefix = 'sessionsV2PayloadDirty:';

function sessionsV2ExcludedProviderPrefix(provider: AgentProvider): string {
	return `${sessionsV2ExcludedKeyPrefix}${provider}:`;
}

function sessionsV2ExcludedKey(provider: AgentProvider, session: string): string {
	return `${sessionsV2ExcludedProviderPrefix(provider)}${session}`;
}

function sessionsV2PayloadDirtyKey(session: string): string {
	return `${sessionsV2PayloadDirtyKeyPrefix}${session}`;
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
		const { provider, startTime, modifiedTime = startTime, source } = sessionOptions;
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const changes = await runReturningChanges(
					database,
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
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionsV2PayloadDirtyKey(session)]);
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

	async updateSessionModifiedTime(session: string, modifiedTime: number): Promise<boolean> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const changes = await runReturningChanges(
					database,
					'UPDATE sessions_v2 SET modified_time = ? WHERE session_uri = ? AND modified_time < ?',
					[modifiedTime, session, modifiedTime],
				);
				await run(
					database,
					'UPDATE sessions SET modified_time = ? WHERE session_uri = ? AND modified_time < ?',
					[modifiedTime, session, modifiedTime],
				);
				await exec(database, 'COMMIT');
				return changes > 0;
			} catch (error) {
				return this._rollback(database, error, `Failed to update the modified time for ${session}`);
			}
		});
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

	async isSessionsV2Backfilled(provider: AgentProvider, payloadVersion: number): Promise<boolean> {
		this._validatePayloadVersion(payloadVersion);
		const row = await get(await this._ensureDatabase(), 'SELECT value FROM metadata WHERE key = ?', [sessionsV2BackfillKey(provider, payloadVersion)]);
		return row?.value === 'true';
	}

	markSessionsV2Backfilled(provider: AgentProvider, payloadVersion: number): Promise<void> {
		this._validatePayloadVersion(payloadVersion);
		return this._run(
			`INSERT INTO metadata (key, value) VALUES (?, 'true')
				ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[sessionsV2BackfillKey(provider, payloadVersion)],
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
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionsV2PayloadDirtyKey(exclusion.session)]);
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
		const { provider, startTime, modifiedTime = startTime, source } = sessionOptions;
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const existing = await get(database, `SELECT provider FROM sessions_v2 WHERE session_uri = ?
					UNION ALL SELECT provider FROM sessions WHERE session_uri = ?
					LIMIT 1`, [session, session]);
				await run(database, `INSERT INTO sessions_v2 (session_uri, provider, start_time, modified_time, external, registration_source)
					SELECT session_uri, provider, start_time, modified_time, external, registration_source
					FROM sessions
					WHERE session_uri = ?
						AND (? = 0 OR NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true'))
						AND NOT EXISTS (SELECT 1 FROM sessions_v2 WHERE session_uri = ?)`, [
					session,
					registerOptions.checkTombstone ? 1 : 0,
					tombstoneKey(session),
					session,
				]);
				const changes = await this._registerSessionV2(database, session, provider, startTime, modifiedTime, source, registerOptions);
				if (changes > 0) {
					const row = await get(database, 'SELECT session_uri, provider, start_time, modified_time, external, registration_source FROM sessions_v2 WHERE session_uri = ?', [session]);
					if (!row) {
						throw new Error(`Missing sessions_v2 identity after registering ${session}`);
					}
					await run(database, `INSERT INTO sessions (session_uri, provider, start_time, modified_time, external, registration_source)
						VALUES (?, ?, ?, ?, ?, ?)
						ON CONFLICT(session_uri) DO UPDATE SET
							provider = excluded.provider,
							start_time = excluded.start_time,
							modified_time = MAX(sessions.modified_time, excluded.modified_time),
							external = excluded.external,
							registration_source = excluded.registration_source`, [
						row.session_uri,
						row.provider,
						row.start_time,
						row.modified_time,
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
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionsV2PayloadDirtyKey(session)]);
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
					await run(database, `INSERT INTO sessions (session_uri, provider, start_time, modified_time, external, registration_source)
						SELECT session_uri, provider, start_time, modified_time, external, registration_source
						FROM sessions_v2 WHERE session_uri = ?
						ON CONFLICT(session_uri) DO UPDATE SET
							provider = excluded.provider,
							start_time = excluded.start_time,
							modified_time = MAX(sessions.modified_time, excluded.modified_time),
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
		const { provider, startTime, modifiedTime = startTime, source } = sessionOptions;
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const changes = await this._registerSessionV2(database, session, provider, startTime, modifiedTime, source, registerOptions);
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
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionsV2PayloadDirtyKey(session)]);
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
			`SELECT session_uri, provider, start_time, modified_time, external, registration_source
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
			`SELECT session_uri, provider, start_time, modified_time, external, registration_source
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
			`SELECT session_uri, provider, start_time, modified_time, external, registration_source
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
			`SELECT sessions_v2.*, COALESCE(CAST((
					SELECT value FROM metadata WHERE key = '${sessionsV2PayloadDirtyKeyPrefix}' || sessions_v2.session_uri
				) AS INTEGER), 0) AS payload_dirty
				FROM sessions_v2
				WHERE sessions_v2.session_uri = ? AND sessions_v2.verified = 1
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')
					AND NOT EXISTS (
						SELECT 1 FROM metadata
						WHERE key = '${sessionsV2ExcludedKeyPrefix}' || sessions_v2.provider || ':' || sessions_v2.session_uri
					)`,
			[session, tombstoneKey(session)],
		);
		return row ? { ...this._toSessionV2Receipt(row), payload: row.payload as string } : undefined;
	}

	async listSessionsV2(): Promise<readonly IAgentHostDatabaseSessionV2[]> {
		const rows = await all(await this._ensureDatabase(), this._selectVerifiedSessionsV2(
			`sessions_v2.*, COALESCE(CAST((
				SELECT value FROM metadata WHERE key = '${sessionsV2PayloadDirtyKeyPrefix}' || sessions_v2.session_uri
			) AS INTEGER), 0) AS payload_dirty`,
		), []);
		return rows.map(row => ({ ...this._toSessionV2Receipt(row), payload: row.payload as string }));
	}

	async listSessionsV2Receipts(): Promise<readonly IAgentHostDatabaseSessionV2Receipt[]> {
		const rows = await all(await this._ensureDatabase(), this._selectVerifiedSessionsV2(
			`session_uri, provider, start_time, modified_time, external, registration_source,
				session_generation, source_revision, payload_version, payload_hash, is_chat_backing,
				COALESCE(CAST((
					SELECT value FROM metadata WHERE key = '${sessionsV2PayloadDirtyKeyPrefix}' || sessions_v2.session_uri
				) AS INTEGER), 0) AS payload_dirty`,
		), []);
		return rows.map(row => this._toSessionV2Receipt(row));
	}

	async markSessionV2PayloadDirty(session: string): Promise<number | undefined> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const exists = await get(database, 'SELECT 1 AS present FROM sessions_v2 WHERE session_uri = ?', [session]);
				if (exists) {
					await run(database, `INSERT INTO metadata (key, value) VALUES (?, '1')
						ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`, [sessionsV2PayloadDirtyKey(session)]);
				}
				const row = exists
					? await get(database, 'SELECT CAST(value AS INTEGER) AS payload_dirty FROM metadata WHERE key = ?', [sessionsV2PayloadDirtyKey(session)])
					: undefined;
				await exec(database, 'COMMIT');
				return row?.payload_dirty as number | undefined;
			} catch (error) {
				return this._rollback(database, error, `Failed to mark sessions_v2 payload dirty for ${session}`);
			}
		});
	}

	async markAllSessionsV2PayloadsDirty(): Promise<void> {
		return this._transactionSequencer.queue(async () => {
			await run(await this._ensureDatabase(), `INSERT INTO metadata (key, value)
				SELECT '${sessionsV2PayloadDirtyKeyPrefix}' || session_uri, '1' FROM sessions_v2
				WHERE verified = 1
					AND NOT EXISTS (
						SELECT 1 FROM metadata
						WHERE key = 'sessionTombstone:' || sessions_v2.session_uri AND value = 'true'
					)
					AND NOT EXISTS (
						SELECT 1 FROM metadata
						WHERE key = '${sessionsV2ExcludedKeyPrefix}' || sessions_v2.provider || ':' || sessions_v2.session_uri
					)
				ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`, []);
		});
	}

	async markSessionV2PayloadClean(session: string, expectedDirty: number): Promise<boolean> {
		this._validatePayloadDirty(expectedDirty);
		return this._transactionSequencer.queue(async () => {
			const changes = await runReturningChanges(await this._ensureDatabase(), `DELETE FROM metadata
				WHERE key = ? AND CAST(value AS INTEGER) = ?`, [sessionsV2PayloadDirtyKey(session), expectedDirty]);
			return changes > 0;
		});
	}

	async upsertSessionV2(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> {
		const isChatBacking = this._validateSessionV2Envelope(envelope);
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const tombstone = await get(database, 'SELECT value FROM metadata WHERE key = ?', [tombstoneKey(envelope.session)]);
				if (tombstone?.value === 'true') {
					await exec(database, 'COMMIT');
					return 'tombstoned';
				}
				const registry = await get(database, 'SELECT provider, start_time, modified_time, external, registration_source FROM sessions_v2 WHERE session_uri = ?', [envelope.session]);
				if (!registry) {
					await exec(database, 'COMMIT');
					return 'missingSession';
				}
				const exclusion = await get(database, 'SELECT 1 FROM metadata WHERE key = ?', [sessionsV2ExcludedKey(registry.provider as AgentProvider, envelope.session)]);
				if (exclusion) {
					await exec(database, 'COMMIT');
					return 'missingSession';
				}
				const current = await get(database, 'SELECT session_generation, source_revision, payload_version, payload_hash, verified FROM sessions_v2 WHERE session_uri = ?', [envelope.session]);
				const currentGeneration = current?.session_generation === null || current?.verified !== 1 ? undefined : current?.session_generation as string;
				if (currentGeneration !== expectedSessionGeneration) {
					await exec(database, 'COMMIT');
					return 'generationMismatch';
				}
				if (currentGeneration === envelope.sessionGeneration) {
					const currentRevision = current?.source_revision as number;
					if (envelope.sourceRevision < currentRevision) {
						await exec(database, 'COMMIT');
						return 'stale';
					}
					if (envelope.sourceRevision === currentRevision) {
						const replayed = current?.payload_version === envelope.payloadVersion && current?.payload_hash === envelope.payloadHash;
						await exec(database, 'COMMIT');
						return replayed ? 'replayed' : 'conflict';
					}
				}

				await run(database, `INSERT INTO sessions_v2 (
				session_uri, provider, start_time, modified_time, external, registration_source,
				session_generation, source_revision, payload_version, payload_hash, verified, payload, is_chat_backing
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
			ON CONFLICT(session_uri) DO UPDATE SET
				provider = excluded.provider,
				start_time = excluded.start_time,
				modified_time = excluded.modified_time,
				external = excluded.external,
				registration_source = excluded.registration_source,
				session_generation = excluded.session_generation,
				source_revision = excluded.source_revision,
				payload_version = excluded.payload_version,
				payload_hash = excluded.payload_hash,
				verified = excluded.verified,
				payload = excluded.payload,
				is_chat_backing = excluded.is_chat_backing`, [
					envelope.session,
					registry.provider,
					registry.start_time,
					registry.modified_time,
					registry.external,
					registry.registration_source,
					envelope.sessionGeneration,
					envelope.sourceRevision,
					envelope.payloadVersion,
					envelope.payloadHash,
					envelope.payload,
					isChatBacking ? 1 : 0,
				]);
				await exec(database, 'COMMIT');
				return 'applied';
			} catch (error) {
				return this._rollback(database, error, `Failed to upsert sessions_v2 row for ${envelope.session}`);
			}
		});
	}

	private _registerSessionV2(
		database: Database,
		session: string,
		provider: AgentProvider,
		startTime: number,
		modifiedTime: number,
		source: AgentSessionRegistrationSource,
		registerOptions: IAgentHostDatabaseRegisterOptions,
	): Promise<number> {
		return runReturningChanges(
			database,
			`INSERT INTO sessions_v2 (session_uri, provider, start_time, modified_time, external, registration_source)
				SELECT ?, ?, ?, ?, CASE WHEN ? = 'discovery' THEN 1 ELSE 0 END, ?
				WHERE ? = 0 OR NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')
				ON CONFLICT(session_uri) DO UPDATE SET
					provider = CASE WHEN excluded.registration_source = 'explicit' THEN excluded.provider ELSE sessions_v2.provider END,
					modified_time = MAX(sessions_v2.modified_time, excluded.modified_time),
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
			[session, provider, startTime, modifiedTime, source, source, registerOptions.checkTombstone ? 1 : 0, tombstoneKey(session)],
		);
	}

	/**
	 * Validates the envelope against its opaque payload and returns the derived
	 * chat-backing flag, so the payload stays the only authority for content.
	 */
	private _validateSessionV2Envelope(envelope: IAgentHostDatabaseSessionV2Envelope): boolean {
		for (const [name, value] of [
			['sourceRevision', envelope.sourceRevision],
			['payloadVersion', envelope.payloadVersion],
		] as const) {
			if (!Number.isSafeInteger(value) || value < 0) {
				throw new Error(`Catalog ${name} must be a non-negative safe integer`);
			}
		}
		for (const [name, value] of [
			['session', envelope.session],
			['sessionGeneration', envelope.sessionGeneration],
			['payloadHash', envelope.payloadHash],
			['payload', envelope.payload],
		] as const) {
			if (!value) {
				throw new Error(`Catalog ${name} must not be empty`);
			}
		}
		if (envelope.verified !== true) {
			throw new Error('Catalog envelope must be verified before it is stored');
		}
		const decoded = decodeAgentHostCatalogPayload(envelope.payload);
		if (!decoded.ok) {
			throw new Error(`Catalog payload is ${decoded.reason}: ${decoded.error}`);
		}
		if (decoded.value.payload !== envelope.payload) {
			throw new Error('Catalog payload must be canonical JSON');
		}
		if (hashAgentHostCatalogPayload(envelope.payload) !== envelope.payloadHash) {
			throw new Error('Catalog payloadHash must match payload');
		}
		return decoded.value.data.isChatBacking === true;
	}

	private _validatePayloadVersion(payloadVersion: number): void {
		if (!Number.isSafeInteger(payloadVersion) || payloadVersion < 0) {
			throw new Error('Catalog payloadVersion must be a non-negative safe integer');
		}
	}

	private _selectVerifiedSessionsV2(columns: string): string {
		return `SELECT ${columns}
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
			ORDER BY sessions_v2.session_uri`;
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

	private _toSessionV2Receipt(row: Record<string, unknown>): IAgentHostDatabaseSessionV2Receipt {
		return {
			...this._toSessionRegistration(row),
			sessionGeneration: row.session_generation as string,
			sourceRevision: row.source_revision as number,
			payloadVersion: row.payload_version as number,
			payloadHash: row.payload_hash as string,
			verified: true,
			isChatBacking: row.is_chat_backing === 1,
			payloadDirty: row.payload_dirty as number,
		};
	}

	private _validatePayloadDirty(payloadDirty: number): void {
		if (!Number.isSafeInteger(payloadDirty) || payloadDirty <= 0) {
			throw new Error('Catalog payload dirty marker must be a positive safe integer');
		}
	}

	private _toSessionRegistration(row: Record<string, unknown>): IAgentHostDatabaseSession {
		return {
			session: row.session_uri as string,
			provider: row.provider as AgentProvider,
			startTime: row.start_time as number,
			modifiedTime: row.modified_time as number,
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
