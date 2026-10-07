/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import type { Database, RunResult } from '@vscode/sqlite3';
import { Sequencer } from '../../../base/common/async.js';
import { dirname } from '../../../base/common/path.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { stableStringify } from '../../../base/common/objects.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AgentProvider, AgentSession, CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID, COPILOT_CLI_AGENT_PROVIDER_ID } from '../common/agent.js';
import { AGENT_HOST_CATALOG_CHILD_LIMIT, AgentHostCatalogChat, decodeAgentHostCatalogPayload, hashAgentHostCatalogPayload, projectAgentHostCatalogChatOrigin } from './agentHostCatalogProjection.js';
import { ChatInteractivity } from '../common/state/protocol/channels-chat/state.js';
import { IAgentHostChatV2MetadataData, decodeChatV2Metadata, encodeChatV2Metadata, hashChatV2Metadata, validateChatV2Origin, validateChatV2String, validateChatV2WorkingDirectories } from './agentHostChatCatalogV2.js';

/**
 * Durable origin used to resolve competing registrations for the same session.
 * In particular, discovery may upgrade a restored session to external, but must
 * never override an explicitly created or adopted Agent Host session. Removing legacy
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
	/**
	 * Exact provider backing URI for a discovery admission. When present,
	 * backing tombstones and cross-provider identity exclusions are checked in
	 * the same transaction that claims `session`.
	 */
	readonly discoveryBackingSession?: string;
	/**
	 * Marks the session registered-but-not-yet-materialized in the same
	 * transaction as the registration, so a crash cannot leave a durable row
	 * without its marker — the very state this marker exists to recognise.
	 */
	readonly provisional?: boolean;
}

export interface IAgentHostDatabaseExternalUpdate {
	readonly session: string;
	readonly external: boolean;
}

export interface IAgentHostDatabaseModifiedTimeUpdate {
	readonly session: string;
	readonly modifiedTime: number;
}

export type AgentHostSessionsV2ExclusionReason = 'backing' | 'subagent' | 'providerAbsent' | 'staleExternal';

export interface IAgentHostDatabaseSessionsV2Exclusion {
	readonly provider: AgentProvider;
	readonly session: string;
	readonly reason: AgentHostSessionsV2ExclusionReason;
	readonly fingerprint: string;
}

export interface IAgentHostDatabaseSessionsV2ExclusionExpectation {
	readonly identity: IAgentHostDatabaseSession | undefined;
	readonly catalog: Pick<IAgentHostDatabaseSessionV2Receipt, 'sessionGeneration' | 'sourceRevision' | 'payloadHash'> | undefined;
}

export type AgentHostDatabaseSessionV2ExclusionResult = 'excluded' | 'stale';

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

/** Read-only list projection, not a durable session envelope. */
export interface IAgentHostDatabaseSessionListCatalog {
	readonly session: string;
	readonly provider: AgentProvider;
	readonly sessionGeneration: string;
	readonly payloadVersion: number;
	readonly isChatBacking: boolean;
	readonly payload: string;
	readonly chatCatalog?: {
		readonly header: Pick<IAgentHostDatabaseChatCatalogHeaderV2, 'defaultChatUri' | 'sessionGeneration'>;
		readonly chats: readonly AgentHostCatalogChat[];
	};
}

export interface IAgentHostDatabaseSessionChat {
	readonly chat: string;
	readonly order: number;
	readonly isRead?: boolean;
	readonly archived?: boolean;
	readonly providerData?: string;
	readonly origin?: string;
	readonly inheritedTurnId?: string;
	readonly workingDirectories?: readonly string[];
	readonly metadata?: IAgentHostChatV2MetadataData;
}

export interface IAgentHostDatabaseSessionChatCatalog {
	readonly revision: number;
	readonly legacyMirroredRevision: number;
	readonly legacyMirroredPayload?: string;
	readonly chats: readonly IAgentHostDatabaseSessionChat[];
}

export type AgentHostDatabaseSessionChatCatalogReplaceResult =
	| { readonly status: 'applied'; readonly revision: number }
	| { readonly status: 'conflict' | 'missingSession' | 'tombstoned' };

export type AgentHostDatabaseSessionV2UpsertResult = 'applied' | 'replayed' | 'stale' | 'conflict' | 'generationMismatch' | 'missingSession' | 'tombstoned';

export interface IAgentHostDatabaseChatV2NormalizationChat {
	readonly chat: string;
	readonly order?: number;
	readonly storageResource?: string;
	readonly parentChat?: string;
	readonly providerData?: string;
	readonly origin?: string;
	readonly isRead?: boolean;
	readonly archived?: boolean;
	readonly inheritedTurnId?: string;
	readonly workingDirectories?: readonly string[];
	readonly metadata?: IAgentHostChatV2MetadataData;
}

export interface IAgentHostDatabaseChatV2 extends Omit<IAgentHostDatabaseChatV2NormalizationChat, 'providerData'> {
	readonly ownerSession: string;
	readonly ownershipRevision: number;
	readonly metadataRevision: number;
}

export interface IAgentHostDatabaseChatV2ProviderDetail {
	readonly providerData?: string;
}

export interface IAgentHostDatabaseChatCatalogHeaderV2 {
	readonly session: string;
	readonly revision: number;
	readonly authorityVersion: 1 | 2;
	readonly defaultChatUri?: string;
	readonly sessionGeneration?: string;
	readonly normalizationSourceRevision?: number;
	readonly normalizationPayloadHash?: string;
}

export interface IAgentHostDatabaseCatalogSnapshotEntry {
	readonly session: string;
	readonly authorityVersion: 1 | 2;
	readonly identity: IAgentHostDatabaseSession;
	readonly isChatBacking: boolean;
	readonly provisional: boolean;
	readonly header?: IAgentHostDatabaseChatCatalogHeaderV2;
	readonly chats: readonly IAgentHostDatabaseChatV2[];
}

export interface IAgentHostDatabaseChatV2NormalizationCandidate {
	readonly defaultChat: IAgentHostDatabaseChatV2NormalizationChat;
	readonly peers: readonly IAgentHostDatabaseChatV2NormalizationChat[];
	readonly privateDescendants: readonly IAgentHostDatabaseChatV2NormalizationChat[];
	readonly deletedChats?: readonly IAgentHostDatabaseChatV2DeletedChat[];
}

export interface IAgentHostDatabaseChatV2DeletedChat {
	readonly chat: string;
	readonly summary: '';
	readonly titleSource: '';
}

export interface IAgentHostDatabaseChatV2NormalizationExpectation {
	readonly sessionGeneration: string;
	readonly sourceRevision: number;
	readonly payloadHash: string;
	readonly catalogRevision: number;
}

export interface IAgentHostDatabaseChatV2Revision {
	readonly ownershipRevision: number;
	readonly metadataRevision: number;
}

export interface IAgentHostDatabaseChatV2Patch {
	readonly metadata?: IAgentHostChatV2MetadataData;
	readonly providerData?: string | null;
	readonly origin?: string | null;
	readonly workingDirectories?: readonly string[] | null;
	readonly parentChat?: string;
	readonly isRead?: boolean;
	readonly archived?: boolean;
	readonly inheritedTurnId?: string | null;
}

export type IAgentHostDatabaseChatV2Mutation =
	| { readonly kind?: 'metadata'; readonly chat: string; readonly expected: IAgentHostDatabaseChatV2Revision; readonly patch: IAgentHostDatabaseChatV2Patch }
	| { readonly kind: 'replacePeers'; readonly expectedRevision: number; readonly chats: readonly IAgentHostDatabaseSessionChat[] };

export type AgentHostDatabaseChatV2WriteResult =
	| { readonly status: 'applied' | 'replayed'; readonly catalogRevision: number }
	| { readonly status: 'conflict' | 'notReady' | 'missingSession' | 'tombstoned' | 'alreadyNormalized' };

export const IAgentHostDatabase = createDecorator<IAgentHostDatabase>('agentHostDatabase');
export const AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT = 400;

export interface IAgentHostDatabase extends IDisposable {
	readonly _serviceBrand: undefined;

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
	/** Advances modification times and marks changed catalog payloads dirty in one transaction. */
	updateSessionModifiedTimes(updates: readonly IAgentHostDatabaseModifiedTimeUpdate[]): Promise<void>;
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
	/** Atomically excludes and removes the observed current v2 identity. */
	excludeSessionV2(exclusion: IAgentHostDatabaseSessionsV2Exclusion, expected: IAgentHostDatabaseSessionsV2ExclusionExpectation): Promise<AgentHostDatabaseSessionV2ExclusionResult>;
	/** Reads a session's current-v2 exclusion, when present. */
	getSessionsV2Exclusion(provider: AgentProvider, session: string): Promise<IAgentHostDatabaseSessionsV2Exclusion | undefined>;
	/** Lists one provider's current-v2 exclusions without opening session databases. */
	listSessionsV2Exclusions(provider: AgentProvider): Promise<readonly IAgentHostDatabaseSessionsV2Exclusion[]>;
	/** Lists every provider's current-v2 exclusions without opening session databases. */
	listAllSessionsV2Exclusions(): Promise<readonly IAgentHostDatabaseSessionsV2Exclusion[]>;
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
	/**
	 * Records whether `session` is registered but not yet materialized. Stored as
	 * host-owned metadata rather than a `registration_source` value so an older
	 * build, which casts that column straight to its union, keeps reading the
	 * session unchanged.
	 */
	setSessionProvisional(session: string, provisional: boolean): Promise<void>;
	/** Session URIs still marked provisional, read in bulk so listing opens no session database. */
	listProvisionalSessions(): Promise<readonly string[]>;
	/** Importer-only: records an identity in v2 without writing the legacy registry. */
	registerSessionV2(session: string, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean>;
	/** Importer-only: removes an identity and its payload from v2 without changing legacy. */
	unregisterSessionV2(session: string): Promise<void>;
	/** Importer-only: updates unresolved provenance in v2 without changing legacy. */
	updateSessionV2External(updates: readonly IAgentHostDatabaseExternalUpdate[]): Promise<void>;
	/** Importer-only: replaces v2 identity with newer legacy compatibility input and returns the resulting identity. */
	reconcileSessionV2RegistrationFromLegacy(session: string, legacy: IAgentHostDatabaseSession): Promise<IAgentHostDatabaseSession | undefined>;
	/** Returns a current v2 registry identity, including one whose payload is incomplete. */
	getSessionV2Registration(session: string): Promise<IAgentHostDatabaseSession | undefined>;
	/** Lists current v2 registry identities, including rows whose payloads are incomplete. */
	listSessionV2Registrations(): Promise<readonly IAgentHostDatabaseSession[]>;
	/** Importer-only: lists all v2 identities, including durably excluded rows. */
	listSessionV2RegistrationsForImport(): Promise<readonly IAgentHostDatabaseSession[]>;
	/** Whether the current v2 registry contains no identities. */
	isSessionV2RegistryEmpty(): Promise<boolean>;
	getSessionV2(session: string): Promise<IAgentHostDatabaseSessionV2 | undefined>;
	listSessionsV2(sessions?: readonly string[]): Promise<readonly IAgentHostDatabaseSessionV2[]>;
	readSessionListCatalogs(sessions: readonly string[]): Promise<readonly IAgentHostDatabaseSessionListCatalog[]>;
	/** Lists catalog receipts without materializing payloads, for startup scans. */
	listSessionsV2Receipts(): Promise<readonly IAgentHostDatabaseSessionV2Receipt[]>;
	/** Marks one cached payload dirty and returns the marker repair must compare-and-set. */
	markSessionV2PayloadDirty(session: string): Promise<number | undefined>;
	/** Reads the dirty marker even when the registered session has no verified payload yet. */
	getSessionV2PayloadDirty(session: string): Promise<number | undefined>;
	/** Marks every cached payload dirty once so mutations made by older builds are rechecked. */
	markAllSessionsV2PayloadsDirty(): Promise<void>;
	/** Marks selected cached payloads dirty in one transaction. */
	markSessionsV2PayloadsDirty(sessions: readonly string[]): Promise<void>;
	/** Clears a dirty marker only when no newer mutation superseded it. */
	markSessionV2PayloadClean(session: string, expectedDirty: number): Promise<boolean>;
	upsertSessionV2(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult>;
	/** Writes session aggregates only after comparing their public chat projection with normalized authority. */
	upsertSessionV2FromChatCatalog(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined, expectedCatalogRevision: number): Promise<AgentHostDatabaseSessionV2UpsertResult>;
	readCatalogSnapshot(sessions?: readonly string[]): Promise<readonly IAgentHostDatabaseCatalogSnapshotEntry[]>;
	/** Selects live legacy owners eligible for migration without reading chat metadata. */
	listLegacyChatCatalogSessions(sessions: readonly string[]): Promise<readonly string[]>;
	/** Reads one owner's chat and authority without materializing its other chats. */
	readChatV2(session: string, chat: string): Promise<{ readonly normalized: boolean; readonly chat?: IAgentHostDatabaseChatV2 }>;
	getChatV2ProviderDetail(chat: string): Promise<IAgentHostDatabaseChatV2ProviderDetail | undefined>;
	/** Activates verified legacy input and optionally mutates it in the same central transaction. */
	ensureChatCatalogV2(session: string, expected: IAgentHostDatabaseChatV2NormalizationExpectation, candidate: IAgentHostDatabaseChatV2NormalizationCandidate, mutation?: IAgentHostDatabaseChatV2Mutation): Promise<AgentHostDatabaseChatV2WriteResult>;
	/** Writes a new unverified session's complete catalog directly to normalized authority. */
	registerChatCatalogV2(session: string, candidate: IAgentHostDatabaseChatV2NormalizationCandidate): Promise<AgentHostDatabaseChatV2WriteResult>;
	updateChatV2Metadata(chat: string, expected: IAgentHostDatabaseChatV2Revision, patch: IAgentHostDatabaseChatV2Patch): Promise<AgentHostDatabaseChatV2WriteResult>;
	insertPrivateChatV2(session: string, chat: IAgentHostDatabaseChatV2NormalizationChat, expectedCatalogRevision: number): Promise<AgentHostDatabaseChatV2WriteResult>;
	removePrivateChatV2(session: string, chat: string, expectedCatalogRevision: number): Promise<AgentHostDatabaseChatV2WriteResult>;
	/** Reads authoritative peer-chat membership. `undefined` means legacy import has not completed. */
	getSessionChatCatalog(session: string): Promise<IAgentHostDatabaseSessionChatCatalog | undefined>;
	/** Replaces authoritative peer-chat membership when the session exists and its revision still matches. */
	replaceSessionChatCatalog(session: string, chats: readonly IAgentHostDatabaseSessionChat[], expectedRevision: number | undefined): Promise<AgentHostDatabaseSessionChatCatalogReplaceResult>;
	/** Recovers membership without adding a chat already owned by another authoritative catalogue. */
	recoverSessionChatCatalog(session: string, chats: readonly IAgentHostDatabaseSessionChat[], expectedRevision: number): Promise<AgentHostDatabaseSessionChatCatalogReplaceResult>;
	/** Acknowledges the exact central revision written to the downgrade-compatibility mirror. */
	markSessionChatCatalogLegacyMirrored(session: string, expectedRevision: number, payload?: string): Promise<boolean>;
	/** Records the legacy payload used as the next three-way merge base without acknowledging a central revision. */
	recordSessionChatCatalogLegacyMirrorPayload(session: string, expectedRevision: number, payload: string): Promise<boolean>;
	close(): Promise<void>;
}

const sessionsV2SchemaSql = `CREATE TABLE sessions_v2 (
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
	is_chat_backing     INTEGER NOT NULL DEFAULT 0 CHECK (is_chat_backing IN (0, 1)),
	modified_time       INTEGER NOT NULL DEFAULT 0
)`;

const sessionChatCatalogSchemaSql = [
	`CREATE TABLE session_chat_catalogs (
		session_uri              TEXT PRIMARY KEY NOT NULL,
		revision                 INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
		legacy_mirrored_revision INTEGER NOT NULL DEFAULT 0 CHECK (legacy_mirrored_revision >= 0)
	)`,
	`CREATE TABLE session_chats (
		session_uri       TEXT NOT NULL REFERENCES session_chat_catalogs(session_uri) ON DELETE CASCADE,
		chat_uri          TEXT NOT NULL,
		chat_order        INTEGER NOT NULL CHECK (chat_order >= 0),
		provider_data     TEXT,
		origin            TEXT,
		inherited_turn_id TEXT,
		PRIMARY KEY (session_uri, chat_uri),
		UNIQUE (session_uri, chat_order)
	)`,
].join(';\n');

const CHAT_ARCHIVE_MIGRATION_VERSION = 12;
const CHAT_READ_MIGRATION_VERSION = 13;
const chatArchiveMigrationSql = 'ALTER TABLE session_chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))';
const chatReadMigrationSql = 'ALTER TABLE session_chats ADD COLUMN is_read INTEGER CHECK (is_read IN (0, 1))';

const chatV2HeaderColumns = [
	['authority_version', 'INTEGER NOT NULL DEFAULT 1 CHECK (authority_version IN (1, 2))'],
	['default_chat_uri', 'TEXT'],
	['session_generation', 'TEXT'],
	['normalization_source_revision', 'INTEGER'],
	['normalization_payload_hash', 'TEXT'],
] as const;

const chatsV2SchemaSql = `CREATE TABLE IF NOT EXISTS chats_v2 (
	chat_uri TEXT PRIMARY KEY NOT NULL,
	owner_session_uri TEXT NOT NULL,
	chat_order INTEGER CHECK (chat_order >= 0),
	storage_resource TEXT,
	parent_chat TEXT,
	provider_data TEXT,
	origin TEXT,
	is_read INTEGER CHECK (is_read IN (0, 1)),
	archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
	inherited_turn_id TEXT,
	working_directories TEXT,
	metadata TEXT NOT NULL,
	metadata_hash TEXT NOT NULL,
	ownership_revision INTEGER NOT NULL DEFAULT 0 CHECK (ownership_revision >= 0),
	metadata_revision INTEGER NOT NULL DEFAULT 0 CHECK (metadata_revision >= 0),
	tombstoned INTEGER NOT NULL DEFAULT 0 CHECK (tombstoned IN (0, 1))
)`;

async function migrateChatV2Schema(database: Database): Promise<void> {
	const columns = await all(database, 'PRAGMA table_info(session_chat_catalogs)', []);
	for (const [name, definition] of chatV2HeaderColumns) {
		if (!columns.some(column => column.name === name)) {
			await exec(database, `ALTER TABLE session_chat_catalogs ADD COLUMN ${name} ${definition}`);
		}
	}
	await exec(database, chatsV2SchemaSql);
	await exec(database, `CREATE UNIQUE INDEX IF NOT EXISTS chats_v2_owner_order ON chats_v2(owner_session_uri, chat_order) WHERE tombstoned = 0;
		CREATE INDEX IF NOT EXISTS chats_v2_parent ON chats_v2(parent_chat) WHERE tombstoned = 0`);
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
	{
		version: 5,
		sql: [
			sessionsV2SchemaSql,
			`INSERT INTO sessions_v2 (session_uri, provider, start_time, external, registration_source, modified_time)
				SELECT session_uri, provider, start_time, external, registration_source, modified_time FROM sessions`,
			sessionChatCatalogSchemaSql,
		].join(';\n'),
	},
	{
		// Versions 6 through 11 were used by pre-release catalog schemas and are
		// normalized above, so new migrations resume at 12.
		version: CHAT_ARCHIVE_MIGRATION_VERSION,
		sql: chatArchiveMigrationSql,
	},
	{
		version: CHAT_READ_MIGRATION_VERSION,
		sql: chatReadMigrationSql,
	},
	{
		version: 14,
		sql: '',
	},
] as const;

async function normalizePreReleaseCatalogSchema(database: Database, currentVersion: number): Promise<number> {
	if (currentVersion < 4 || !await get(database, `SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'sessions_v2'`, [])) {
		return currentVersion;
	}
	const hasFinalCatalog = await get(database, `SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'session_chat_catalogs'`, [])
		&& await get(database, `SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'session_chats'`, []);
	if (hasFinalCatalog && currentVersion >= 5) {
		const chatColumns = await all(database, 'PRAGMA table_info(session_chats)', []);
		const hasArchived = chatColumns.some(column => column.name === 'archived');
		const hasRead = chatColumns.some(column => column.name === 'is_read');
		if (currentVersion >= CHAT_READ_MIGRATION_VERSION) {
			// Temporary compatibility for development profiles shared by worktrees
			// whose pre-release schema versions can advance independently.
			if (!hasArchived) {
				await exec(database, chatArchiveMigrationSql);
			}
			if (!hasRead) {
				await exec(database, chatReadMigrationSql);
			}
			return currentVersion;
		}
		if (hasArchived && hasRead) {
			await exec(database, `PRAGMA user_version = ${CHAT_READ_MIGRATION_VERSION}`);
			return CHAT_READ_MIGRATION_VERSION;
		}
		if (hasRead) {
			await exec(database, chatArchiveMigrationSql);
			await exec(database, `PRAGMA user_version = ${CHAT_READ_MIGRATION_VERSION}`);
			return CHAT_READ_MIGRATION_VERSION;
		}
		if (hasArchived) {
			await exec(database, `PRAGMA user_version = ${CHAT_ARCHIVE_MIGRATION_VERSION}`);
			return CHAT_ARCHIVE_MIGRATION_VERSION;
		}
	}
	if (currentVersion >= CHAT_READ_MIGRATION_VERSION) {
		return currentVersion;
	}
	const isPreReleaseVersion11 = currentVersion === 11;
	if (hasFinalCatalog && currentVersion >= 5 && !isPreReleaseVersion11) {
		return currentVersion;
	}
	await exec(database, 'BEGIN TRANSACTION');
	try {
		if (!hasFinalCatalog) {
			const sessionColumns = await all(database, 'PRAGMA table_info(sessions)', []);
			if (!sessionColumns.some(column => column.name === 'modified_time')) {
				await exec(database, 'ALTER TABLE sessions ADD COLUMN modified_time INTEGER NOT NULL DEFAULT 0');
				await exec(database, 'UPDATE sessions SET modified_time = start_time');
			}
			await exec(database, 'DROP TABLE sessions_v2');
			await exec(database, sessionsV2SchemaSql);
			await exec(database, `INSERT INTO sessions_v2 (session_uri, provider, start_time, external, registration_source, modified_time)
				SELECT session_uri, provider, start_time, external, registration_source, modified_time FROM sessions`);
			await exec(database, 'DROP TABLE IF EXISTS session_chats');
			await exec(database, 'DROP TABLE IF EXISTS session_chat_catalogs');
			await exec(database, sessionChatCatalogSchemaSql);
		}
		await exec(database, 'PRAGMA user_version = 5');
		await exec(database, 'COMMIT');
		return 5;
	} catch (error) {
		await exec(database, 'ROLLBACK');
		throw error;
	}
}

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
const MODIFIED_TIME_UPDATE_BATCH_SIZE = 400;
// Six parameters per row keep each statement below SQLite's legacy 999-variable limit.
const SESSION_CHAT_INSERT_BATCH_SIZE = 150;
const sessionChatCatalogLegacyMirrorKeyPrefix = 'sessionChatCatalogLegacyMirror:';

function sessionsV2ExcludedProviderPrefix(provider: AgentProvider): string {
	return `${sessionsV2ExcludedKeyPrefix}${provider}:`;
}

function sessionsV2ExcludedKey(provider: AgentProvider, session: string): string {
	return `${sessionsV2ExcludedProviderPrefix(provider)}${session}`;
}

function sessionsV2PayloadDirtyKey(session: string): string {
	return `${sessionsV2PayloadDirtyKeyPrefix}${session}`;
}

function sessionChatCatalogLegacyMirrorKey(session: string): string {
	return `${sessionChatCatalogLegacyMirrorKeyPrefix}${session}`;
}

/** Metadata key for a session's durable "explicitly deleted" tombstone. */
function tombstoneKey(session: string): string {
	return `sessionTombstone:${session}`;
}

function sessionIdentityCounterpart(provider: AgentProvider, session: string): string | undefined {
	if (provider !== COPILOT_CLI_AGENT_PROVIDER_ID && provider !== CODEX_AGENT_PROVIDER_ID && provider !== CLAUDE_AGENT_PROVIDER_ID) {
		return undefined;
	}
	const resource = URI.parse(session);
	const backingId = AgentSession.id(resource);
	if (isEqual(resource, AgentSession.uri(provider, backingId))) {
		return AgentSession.uri('ahp-session', backingId).toString();
	}
	if (isEqual(resource, AgentSession.uri('ahp-session', backingId))) {
		return AgentSession.uri(provider, backingId).toString();
	}
	return undefined;
}

const agentMergeEnabledKeyPrefix = 'agentMergeEnabled:';

/** Metadata key marking a session as Agent-Merge-enabled. */
function agentMergeEnabledKey(session: string): string {
	return `${agentMergeEnabledKeyPrefix}${session}`;
}

const provisionalSessionKeyPrefix = 'sessionProvisional:';

/** Metadata key marking a session registered but not yet materialized. */
function provisionalSessionKey(session: string): string {
	return `${provisionalSessionKeyPrefix}${session}`;
}

function close(database: Database): Promise<void> {
	return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

export class AgentHostDatabase implements IAgentHostDatabase {
	declare readonly _serviceBrand: undefined;

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
				await run(database, 'DELETE FROM metadata WHERE key = ?', [provisionalSessionKey(session)]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionsV2PayloadDirtyKey(session)]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionChatCatalogLegacyMirrorKey(session)]);
				await run(database, 'DELETE FROM sessions WHERE session_uri = ?', [session]);
				await this._tombstoneOwnedChats(database, session);
				await run(database, 'DELETE FROM session_chat_catalogs WHERE session_uri = ?', [session]);
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
					await run(database, `UPDATE sessions_v2 SET external = ?, registration_source = ${source}
						WHERE session_uri = ? AND external IS NULL`, [external ? 1 : 0, session]);
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

	async updateSessionModifiedTimes(updates: readonly IAgentHostDatabaseModifiedTimeUpdate[]): Promise<void> {
		if (updates.length === 0) {
			return;
		}
		await this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				await exec(database, `CREATE TEMP TABLE IF NOT EXISTS session_modified_time_updates (
					session_uri TEXT PRIMARY KEY NOT NULL,
					modified_time INTEGER NOT NULL
				);
				DELETE FROM session_modified_time_updates`);
				for (let offset = 0; offset < updates.length; offset += MODIFIED_TIME_UPDATE_BATCH_SIZE) {
					const batch = updates.slice(offset, offset + MODIFIED_TIME_UPDATE_BATCH_SIZE);
					await run(database, `INSERT OR REPLACE INTO session_modified_time_updates (session_uri, modified_time) VALUES ${batch.map(() => '(?, ?)').join(', ')}`,
						batch.flatMap(({ session, modifiedTime }) => [session, modifiedTime]));
				}
				await run(database, `INSERT INTO metadata (key, value)
					SELECT '${sessionsV2PayloadDirtyKeyPrefix}' || sessions_v2.session_uri, '1'
					FROM sessions_v2
					INNER JOIN session_modified_time_updates AS updates ON updates.session_uri = sessions_v2.session_uri
					WHERE sessions_v2.modified_time < updates.modified_time
					ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`, []);
				await run(database, `UPDATE sessions_v2 SET modified_time = (
					SELECT updates.modified_time FROM session_modified_time_updates AS updates
					WHERE updates.session_uri = sessions_v2.session_uri
				) WHERE EXISTS (
					SELECT 1 FROM session_modified_time_updates AS updates
					WHERE updates.session_uri = sessions_v2.session_uri AND sessions_v2.modified_time < updates.modified_time
				)`, []);
				await run(database, `UPDATE sessions SET modified_time = (
					SELECT updates.modified_time FROM session_modified_time_updates AS updates
					WHERE updates.session_uri = sessions.session_uri
				) WHERE EXISTS (
					SELECT 1 FROM session_modified_time_updates AS updates
					WHERE updates.session_uri = sessions.session_uri AND sessions.modified_time < updates.modified_time
				)`, []);
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, 'Failed to update session modified times');
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
					const counterpart = sessionIdentityCounterpart(exclusion.provider, exclusion.session);
					await run(database, `INSERT INTO metadata (key, value)
						SELECT ?, ?
						WHERE NOT EXISTS (SELECT 1 FROM sessions_v2 WHERE session_uri IN (?, ?))
						ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [
						sessionsV2ExcludedKey(exclusion.provider, exclusion.session),
						JSON.stringify({ reason: exclusion.reason, fingerprint: exclusion.fingerprint }),
						exclusion.session,
						counterpart ?? exclusion.session,
					]);
				}
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, 'Failed to mark sessions_v2 exclusions');
			}
		});
	}

	excludeSessionV2(exclusion: IAgentHostDatabaseSessionsV2Exclusion, expected: IAgentHostDatabaseSessionsV2ExclusionExpectation): Promise<AgentHostDatabaseSessionV2ExclusionResult> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const observed = await get(database, `SELECT
					session_uri, provider, start_time, modified_time, external, registration_source,
					session_generation, source_revision, payload_hash, verified
				FROM sessions_v2 WHERE session_uri = ?`, [exclusion.session]);
				if (!this._matchesSessionsV2ExclusionExpectation(observed, expected)) {
					await exec(database, 'COMMIT');
					return 'stale';
				}
				await run(database, `INSERT INTO metadata (key, value) VALUES (?, ?)
					ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [
					sessionsV2ExcludedKey(exclusion.provider, exclusion.session),
					JSON.stringify({ reason: exclusion.reason, fingerprint: exclusion.fingerprint }),
				]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionsV2PayloadDirtyKey(exclusion.session)]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionChatCatalogLegacyMirrorKey(exclusion.session)]);
				await this._tombstoneOwnedChats(database, exclusion.session);
				await run(database, 'DELETE FROM session_chat_catalogs WHERE session_uri = ?', [exclusion.session]);
				await run(database, 'DELETE FROM sessions_v2 WHERE session_uri = ?', [exclusion.session]);
				await exec(database, 'COMMIT');
				return 'excluded';
			} catch (error) {
				return this._rollback(database, error, `Failed to exclude sessions_v2 identity ${exclusion.session}`);
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

	async listAllSessionsV2Exclusions(): Promise<readonly IAgentHostDatabaseSessionsV2Exclusion[]> {
		const prefix = sessionsV2ExcludedKeyPrefix;
		const upperBound = `${prefix.slice(0, -1)};`;
		const rows = await all(
			await this._ensureDatabase(),
			'SELECT key, value FROM metadata WHERE key >= ? AND key < ? ORDER BY key',
			[prefix, upperBound],
		);
		return rows.map(row => {
			const suffix = (row.key as string).slice(prefix.length);
			const separator = suffix.indexOf(':');
			if (separator <= 0) {
				throw new Error(`Invalid sessions_v2 exclusion key ${row.key as string}`);
			}
			return this._toSessionsV2Exclusion(suffix.slice(0, separator), suffix.slice(separator + 1), row.value as string);
		});
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
				if (registerOptions.discoveryBackingSession !== undefined) {
					const backingTombstone = await get(database, 'SELECT 1 AS present FROM metadata WHERE key = ? AND value = ?', [tombstoneKey(registerOptions.discoveryBackingSession), 'true']);
					const claimedIdentities = await all(database, `SELECT session_uri, provider FROM sessions_v2 WHERE session_uri IN (?, ?)
						UNION ALL
						SELECT session_uri, provider FROM sessions WHERE session_uri IN (?, ?)`, [
						session, registerOptions.discoveryBackingSession,
						session, registerOptions.discoveryBackingSession,
					]);
					const backingClaimed = registerOptions.discoveryBackingSession !== session
						&& claimedIdentities.some(row => row.session_uri === registerOptions.discoveryBackingSession);
					const claimedByAnotherProvider = claimedIdentities.some(row => row.provider !== provider);
					const identityExclusions = [
						...await this._listSessionsV2ExclusionsForSession(database, session),
						...(registerOptions.discoveryBackingSession === session
							? []
							: await this._listSessionsV2ExclusionsForSession(database, registerOptions.discoveryBackingSession)),
					].filter(exclusion => exclusion.reason === 'providerAbsent' || exclusion.reason === 'staleExternal');
					const backingExcluded = registerOptions.discoveryBackingSession !== session
						&& identityExclusions.some(exclusion => exclusion.session === registerOptions.discoveryBackingSession);
					const excludedByAnotherProvider = identityExclusions.some(exclusion => exclusion.provider !== provider);
					if (backingTombstone || backingClaimed || claimedByAnotherProvider || backingExcluded || excludedByAnotherProvider) {
						await exec(database, 'COMMIT');
						return false;
					}
				}
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
				if (registerOptions.provisional) {
					await run(database, `INSERT INTO metadata (key, value) VALUES (?, 'true')
						ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [provisionalSessionKey(session)]);
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
				await this._tombstoneOwnedChats(database, session);
				await run(database, 'DELETE FROM session_chat_catalogs WHERE session_uri = ?', [session]);
				await run(database, 'DELETE FROM sessions_v2 WHERE session_uri = ?', [session]);
				await run(database, 'DELETE FROM sessions WHERE session_uri = ?', [session]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [agentMergeEnabledKey(session)]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [provisionalSessionKey(session)]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionsV2PayloadDirtyKey(session)]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionChatCatalogLegacyMirrorKey(session)]);
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

	setSessionProvisional(session: string, provisional: boolean): Promise<void> {
		return provisional
			? this._run(
				`INSERT INTO metadata (key, value) VALUES (?, 'true')
					ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
				[provisionalSessionKey(session)],
			)
			: this._run('DELETE FROM metadata WHERE key = ?', [provisionalSessionKey(session)]);
	}

	async listProvisionalSessions(): Promise<readonly string[]> {
		const rows = await all(
			await this._ensureDatabase(),
			`SELECT key FROM metadata WHERE key LIKE ? || '%' AND value = 'true'`,
			[provisionalSessionKeyPrefix],
		);
		return rows.map(row => (row.key as string).slice(provisionalSessionKeyPrefix.length));
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

	async reconcileSessionV2RegistrationFromLegacy(session: string, legacy: IAgentHostDatabaseSession): Promise<IAgentHostDatabaseSession | undefined> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				await run(database, `UPDATE sessions_v2 SET
						provider = ?,
						start_time = ?,
					modified_time = MAX(modified_time, ?),
					external = ?,
					registration_source = ?
					WHERE session_uri = ?
						AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')
						AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = ?)`, [
					legacy.provider,
					legacy.startTime,
					legacy.modifiedTime,
					legacy.external === undefined ? null : legacy.external ? 1 : 0,
					legacy.source,
					session,
					tombstoneKey(session),
					sessionsV2ExcludedKey(legacy.provider, session),
				]);
				const row = await get(database, `SELECT session_uri, provider, start_time, modified_time, external, registration_source
					FROM sessions_v2 WHERE session_uri = ?`, [session]);
				await exec(database, 'COMMIT');
				return row ? this._toSessionRegistration(row) : undefined;
			} catch (error) {
				return this._rollback(database, error, `Failed to reconcile sessions_v2 identity ${session} from legacy`);
			}
		});
	}

	private _matchesSessionsV2ExclusionExpectation(row: Record<string, unknown> | undefined, expected: IAgentHostDatabaseSessionsV2ExclusionExpectation): boolean {
		if (!row) {
			return expected.identity === undefined && expected.catalog === undefined;
		}
		const identity = expected.identity;
		if (!identity
			|| row.provider !== identity.provider
			|| row.start_time !== identity.startTime
			|| row.modified_time !== identity.modifiedTime
			|| (row.external === null ? undefined : row.external === 1) !== identity.external
			|| row.registration_source !== identity.source) {
			return false;
		}
		const catalog = row.verified === 1 ? expected.catalog : undefined;
		return expected.catalog === undefined
			? row.verified !== 1
			: catalog !== undefined
			&& row.session_generation === catalog.sessionGeneration
			&& row.source_revision === catalog.sourceRevision
			&& row.payload_hash === catalog.payloadHash;
	}

	async unregisterSessionV2(session: string): Promise<void> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				await this._tombstoneOwnedChats(database, session);
				await run(database, 'DELETE FROM session_chat_catalogs WHERE session_uri = ?', [session]);
				await run(database, 'DELETE FROM sessions_v2 WHERE session_uri = ?', [session]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [agentMergeEnabledKey(session)]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionsV2PayloadDirtyKey(session)]);
				await run(database, 'DELETE FROM metadata WHERE key = ?', [sessionChatCatalogLegacyMirrorKey(session)]);
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

	async listSessionsV2(sessions?: readonly string[]): Promise<readonly IAgentHostDatabaseSessionV2[]> {
		if (sessions?.length === 0) {
			return [];
		}
		const rows = await all(await this._ensureDatabase(), this._selectVerifiedSessionsV2(
			`sessions_v2.*, COALESCE(CAST((
				SELECT value FROM metadata WHERE key = '${sessionsV2PayloadDirtyKeyPrefix}' || sessions_v2.session_uri
			) AS INTEGER), 0) AS payload_dirty`,
			sessions?.length,
		), sessions ?? []);
		return rows.map(row => ({ ...this._toSessionV2Receipt(row), payload: row.payload as string }));
	}

	async readSessionListCatalogs(sessions: readonly string[]): Promise<readonly IAgentHostDatabaseSessionListCatalog[]> {
		if (sessions.length === 0) {
			return [];
		}
		if (sessions.length > AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT) {
			throw new Error(`Session list selector exceeds ${AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT} sessions`);
		}
		return this._transactionSequencer.queue(async () => {
			const rows = await all(await this._ensureDatabase(), `SELECT s.session_uri, s.provider,
			s.session_generation, s.payload_version, s.is_chat_backing,
			CASE WHEN h.authority_version = 2 THEN json_set(s.payload, '$.data.chats', json('[]')) ELSE s.payload END AS list_payload,
			h.authority_version, h.default_chat_uri, h.session_generation AS catalog_generation,
			CASE WHEN h.authority_version = 2 THEN (
				SELECT json_group_array(json_array(
					c.chat_uri, c.chat_order, c.origin, c.working_directories, c.is_read, c.archived,
					c.inherited_turn_id, c.metadata, c.metadata_hash
				))
				FROM chats_v2 c WHERE c.owner_session_uri = s.session_uri AND c.tombstoned = 0 AND c.chat_order IS NOT NULL
			) END AS list_chats
			FROM sessions_v2 s LEFT JOIN session_chat_catalogs h ON h.session_uri = s.session_uri
			WHERE s.verified = 1 AND s.session_uri IN (${sessions.map(() => '?').join(',')})
				AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'sessionTombstone:' || s.session_uri AND value = 'true')
				AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = '${sessionsV2ExcludedKeyPrefix}' || s.provider || ':' || s.session_uri)
			ORDER BY s.session_uri`, sessions);
			const directoriesByPayload = new Map<string, readonly string[]>();
			return rows.map(row => {
				const catalog: IAgentHostDatabaseSessionListCatalog = {
					session: row.session_uri as string,
					provider: row.provider as AgentProvider,
					sessionGeneration: row.session_generation as string,
					payloadVersion: row.payload_version as number,
					isChatBacking: row.is_chat_backing === 1,
					payload: row.list_payload as string,
				};
				if (row.authority_version !== 2) {
					return catalog;
				}
				if (row.catalog_generation !== null && row.catalog_generation !== row.session_generation) {
					throw new Error(`Normalized chat catalog identity does not match session ${catalog.session}`);
				}
				const publicRows: [string, number, string | null, string | null, number | null, number, string | null, string, string][] = JSON.parse(row.list_chats as string);
				if (publicRows.length > AGENT_HOST_CATALOG_CHILD_LIMIT || !publicRows.some(chat => chat[0] === row.default_chat_uri)) {
					throw new Error(`Normalized catalog is missing its visible default or exceeds the chat limit: ${catalog.session}`);
				}
				const chats = publicRows.sort((first, second) => first[1] - second[1]).map(([chat, order, origin, directories, isRead, archived, inheritedTurnId, metadata, metadataHash]) => {
					let workingDirectories: readonly string[] | undefined;
					if (directories !== null) {
						workingDirectories = directoriesByPayload.get(directories);
						if (!workingDirectories) {
							workingDirectories = this._decodeChatV2Directories(directories);
							directoriesByPayload.set(directories, workingDirectories);
						}
					}
					return {
						uri: chat,
						order,
						kind: chat === row.default_chat_uri ? 'default' as const : 'peer' as const,
						...this._decodeChatV2Metadata(chat, metadata, metadataHash),
						origin: origin === null ? undefined : projectAgentHostCatalogChatOrigin(JSON.parse(origin)),
						isRead: isRead === null ? undefined : isRead === 1,
						archived: archived === 1,
						inheritedTurnId: inheritedTurnId === null ? undefined : inheritedTurnId,
						workingDirectories,
					};
				});
				return {
					...catalog,
					chatCatalog: {
						header: {
							defaultChatUri: row.default_chat_uri as string,
							...(row.catalog_generation === null ? {} : { sessionGeneration: row.catalog_generation as string }),
						},
						chats,
					},
				};
			});
		});
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
					await this._markSessionV2PayloadDirty(database, session);
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

	async getSessionV2PayloadDirty(session: string): Promise<number | undefined> {
		const row = await get(await this._ensureDatabase(), 'SELECT CAST(value AS INTEGER) AS payload_dirty FROM metadata WHERE key = ?', [sessionsV2PayloadDirtyKey(session)]);
		return row?.payload_dirty as number | undefined;
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

	async markSessionsV2PayloadsDirty(sessions: readonly string[]): Promise<void> {
		if (sessions.length === 0) {
			return;
		}
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				for (const session of sessions) {
					const exists = await get(database, 'SELECT 1 AS present FROM sessions_v2 WHERE session_uri = ?', [session]);
					if (exists) {
						await this._markSessionV2PayloadDirty(database, session);
					}
				}
				await exec(database, 'COMMIT');
			} catch (error) {
				await this._rollback(database, error, 'Failed to mark selected sessions_v2 payloads dirty');
			}
		});
	}

	private _markSessionV2PayloadDirty(database: Database, session: string): Promise<void> {
		return run(database, `INSERT INTO metadata (key, value) VALUES (?, '1')
			ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`, [sessionsV2PayloadDirtyKey(session)]);
	}

	async markSessionV2PayloadClean(session: string, expectedDirty: number): Promise<boolean> {
		this._validatePayloadDirty(expectedDirty);
		return this._transactionSequencer.queue(async () => {
			const changes = await runReturningChanges(await this._ensureDatabase(), `DELETE FROM metadata
				WHERE key = ? AND CAST(value AS INTEGER) = ?`, [sessionsV2PayloadDirtyKey(session), expectedDirty]);
			return changes > 0;
		});
	}

	async getSessionChatCatalog(session: string): Promise<IAgentHostDatabaseSessionChatCatalog | undefined> {
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			const header = await get(database, 'SELECT * FROM session_chat_catalogs WHERE session_uri = ?', [session]);
			if (header?.authority_version === 2) {
				const rows = await all(database, `SELECT *
					FROM chats_v2 WHERE owner_session_uri = ? AND tombstoned = 0
						AND chat_order IS NOT NULL AND chat_uri <> ? ORDER BY chat_order`, [session, header.default_chat_uri]);
				return {
					revision: header.revision as number,
					legacyMirroredRevision: header.legacy_mirrored_revision as number,
					chats: rows.map((row, order) => ({ ...this._toLegacyChat(row), order })),
				};
			}
			const rows = await all(database, `SELECT
				catalog.revision,
				catalog.legacy_mirrored_revision,
				(SELECT value FROM metadata WHERE key = ?) AS legacy_mirrored_payload,
				chat.chat_uri,
				chat.chat_order,
				chat.is_read,
				chat.archived,
				chat.provider_data,
				chat.origin,
				chat.inherited_turn_id
			FROM session_chat_catalogs AS catalog
			LEFT JOIN session_chats AS chat ON chat.session_uri = catalog.session_uri
			WHERE catalog.session_uri = ?
			ORDER BY chat.chat_order`, [sessionChatCatalogLegacyMirrorKey(session), session]);
			const catalog = rows[0];
			if (!catalog) {
				return undefined;
			}
			return {
				revision: catalog.revision as number,
				legacyMirroredRevision: catalog.legacy_mirrored_revision as number,
				...(catalog.legacy_mirrored_payload === null ? {} : { legacyMirroredPayload: catalog.legacy_mirrored_payload as string }),
				chats: rows.filter(row => row.chat_uri !== null).map(row => ({
					chat: row.chat_uri as string,
					order: row.chat_order as number,
					...(row.is_read === null ? {} : { isRead: row.is_read === 1 }),
					...(row.archived === 1 ? { archived: true } : {}),
					...(row.provider_data === null ? {} : { providerData: row.provider_data as string }),
					...(row.origin === null ? {} : { origin: row.origin as string }),
					...(row.inherited_turn_id === null ? {} : { inheritedTurnId: row.inherited_turn_id as string }),
				})),
			};
		});
	}

	async replaceSessionChatCatalog(session: string, chats: readonly IAgentHostDatabaseSessionChat[], expectedRevision: number | undefined): Promise<AgentHostDatabaseSessionChatCatalogReplaceResult> {
		return this._replaceSessionChatCatalog(session, chats, expectedRevision, false);
	}

	async recoverSessionChatCatalog(session: string, chats: readonly IAgentHostDatabaseSessionChat[], expectedRevision: number): Promise<AgentHostDatabaseSessionChatCatalogReplaceResult> {
		return this._replaceSessionChatCatalog(session, chats, expectedRevision, true);
	}

	private async _replaceSessionChatCatalog(session: string, chats: readonly IAgentHostDatabaseSessionChat[], expectedRevision: number | undefined, recovering: boolean): Promise<AgentHostDatabaseSessionChatCatalogReplaceResult> {
		this._validateSessionChats(chats);
		if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0)) {
			throw new Error('Expected session chat catalog revision must be a positive safe integer');
		}
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const tombstone = await get(database, `SELECT 1 AS present FROM metadata
					WHERE key = ? AND value = 'true'`, [tombstoneKey(session)]);
				if (tombstone) {
					await exec(database, 'COMMIT');
					return { status: 'tombstoned' };
				}
				const registered = await get(database, `SELECT 1 AS present FROM sessions WHERE session_uri = ?
					UNION SELECT 1 AS present FROM sessions_v2 WHERE session_uri = ?
					LIMIT 1`, [session, session]);
				if (!registered) {
					await exec(database, 'COMMIT');
					return { status: 'missingSession' };
				}
				const current = await get(database, 'SELECT * FROM session_chat_catalogs WHERE session_uri = ?', [session]);
				const currentRevision = current?.revision as number | undefined;
				if (currentRevision !== expectedRevision) {
					await exec(database, 'COMMIT');
					return { status: 'conflict' };
				}
				if (current?.authority_version === 2) {
					const result = await this._replaceNormalizedPeers(database, session, chats, current, recovering);
					await exec(database, 'COMMIT');
					return result;
				}
				if (recovering) {
					const foreign = await all(database, `SELECT DISTINCT chat_uri FROM session_chats
						WHERE session_uri <> ? AND chat_uri NOT IN
						(SELECT chat_uri FROM session_chats WHERE session_uri = ?)`, [session, session]);
					const foreignUris = new Set(foreign.map(row => row.chat_uri as string));
					chats = chats.filter(chat => !foreignUris.has(chat.chat)).map((chat, order) => ({ ...chat, order }));
					if (chats.length > AGENT_HOST_CATALOG_CHILD_LIMIT - 1) {
						throw new Error(`Peer-chat recovery exceeds the catalog limit for ${session}`);
					}
				}
				const revision = (currentRevision ?? 0) + 1;
				if (!Number.isSafeInteger(revision)) {
					throw new Error(`Session chat catalog revision overflow for ${session}`);
				}
				await run(database, `INSERT INTO session_chat_catalogs (session_uri, revision)
					VALUES (?, ?)
					ON CONFLICT(session_uri) DO UPDATE SET revision = excluded.revision`, [session, revision]);
				await run(database, 'DELETE FROM session_chats WHERE session_uri = ?', [session]);
				for (let offset = 0; offset < chats.length; offset += SESSION_CHAT_INSERT_BATCH_SIZE) {
					const batch = chats.slice(offset, offset + SESSION_CHAT_INSERT_BATCH_SIZE);
					await run(database, `INSERT INTO session_chats (
						session_uri, chat_uri, chat_order, is_read, archived, provider_data, origin, inherited_turn_id
					) VALUES ${batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`, batch.flatMap(chat => [
						session,
						chat.chat,
						chat.order,
						chat.isRead === undefined ? null : chat.isRead ? 1 : 0,
						chat.archived === true ? 1 : 0,
						chat.providerData ?? null,
						chat.origin ?? null,
						chat.inheritedTurnId ?? null,
					]));
				}
				await exec(database, 'COMMIT');
				return { status: 'applied', revision };
			} catch (error) {
				return this._rollback(database, error, `Failed to replace the chat catalog for ${session}`);
			}
		});
	}

	async markSessionChatCatalogLegacyMirrored(session: string, expectedRevision: number, payload?: string): Promise<boolean> {
		if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
			throw new Error('Session chat catalog revision must be a positive safe integer');
		}
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				await run(database, `UPDATE session_chat_catalogs SET legacy_mirrored_revision = ?
					WHERE session_uri = ? AND revision = ? AND legacy_mirrored_revision < ?`, [
					expectedRevision,
					session,
					expectedRevision,
					expectedRevision,
				]);
				const row = await get(database, `SELECT revision, legacy_mirrored_revision
					FROM session_chat_catalogs WHERE session_uri = ?`, [session]);
				const mirrored = row?.revision === expectedRevision && row.legacy_mirrored_revision === expectedRevision;
				if (row && payload !== undefined) {
					await run(database, `INSERT INTO metadata (key, value) VALUES (?, ?)
						ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [sessionChatCatalogLegacyMirrorKey(session), payload]);
				}
				await exec(database, 'COMMIT');
				return mirrored;
			} catch (error) {
				return this._rollback(database, error, `Failed to mark the chat catalog mirrored for ${session}`);
			}
		});
	}

	async recordSessionChatCatalogLegacyMirrorPayload(session: string, expectedRevision: number, payload: string): Promise<boolean> {
		if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
			throw new Error('Session chat catalog revision must be a positive safe integer');
		}
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const row = await get(database, 'SELECT revision FROM session_chat_catalogs WHERE session_uri = ?', [session]);
				if (row?.revision !== expectedRevision) {
					await exec(database, 'COMMIT');
					return false;
				}
				await run(database, `INSERT INTO metadata (key, value) VALUES (?, ?)
					ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [sessionChatCatalogLegacyMirrorKey(session), payload]);
				await exec(database, 'COMMIT');
				return true;
			} catch (error) {
				return this._rollback(database, error, `Failed to record the chat catalog mirror base for ${session}`);
			}
		});
	}

	async upsertSessionV2(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined): Promise<AgentHostDatabaseSessionV2UpsertResult> {
		return this._upsertSessionV2(envelope, expectedSessionGeneration);
	}

	async upsertSessionV2FromChatCatalog(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined, expectedCatalogRevision: number): Promise<AgentHostDatabaseSessionV2UpsertResult> {
		this._validateRevision(expectedCatalogRevision);
		return this._upsertSessionV2(envelope, expectedSessionGeneration, expectedCatalogRevision);
	}

	private async _upsertSessionV2(envelope: IAgentHostDatabaseSessionV2Envelope, expectedSessionGeneration: string | undefined, expectedCatalogRevision?: number): Promise<AgentHostDatabaseSessionV2UpsertResult> {
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
				const normalized = await get(database, 'SELECT * FROM session_chat_catalogs WHERE session_uri = ?', [envelope.session]);
				if (expectedCatalogRevision === undefined ? normalized?.authority_version === 2
					: normalized?.authority_version !== 2 || normalized.revision !== expectedCatalogRevision) {
					await exec(database, 'COMMIT');
					return 'conflict';
				}
				const current = await get(database, 'SELECT session_generation, source_revision, payload_version, payload_hash, verified FROM sessions_v2 WHERE session_uri = ?', [envelope.session]);
				const currentGeneration = current?.session_generation === null || current?.verified !== 1 ? undefined : current?.session_generation as string;
				if (currentGeneration !== expectedSessionGeneration) {
					await exec(database, 'COMMIT');
					return 'generationMismatch';
				}
				if (expectedCatalogRevision !== undefined) {
					if (currentGeneration !== undefined && envelope.sessionGeneration !== currentGeneration) {
						await exec(database, 'COMMIT');
						return 'generationMismatch';
					}
					if (!normalized || normalized.session_generation !== null && normalized.session_generation !== currentGeneration
						|| !await this._matchesChatV2PublicProjection(database, envelope, normalized.default_chat_uri as string)) {
						await exec(database, 'COMMIT');
						return 'conflict';
					}
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

	private async _matchesChatV2PublicProjection(database: Database, envelope: IAgentHostDatabaseSessionV2Envelope, defaultChat: string): Promise<boolean> {
		const decoded = decodeAgentHostCatalogPayload(envelope.payload);
		if (!decoded.ok) {
			throw new Error(`Invalid aggregate chat projection: ${decoded.error}`);
		}
		const rows = await all(database, `SELECT * FROM chats_v2
			WHERE owner_session_uri = ? AND tombstoned = 0 AND chat_order IS NOT NULL ORDER BY chat_order`, [envelope.session]);
		if (rows.length === 0 || !rows.some(row => row.chat_uri === defaultChat)) {
			throw new Error(`Normalized catalog lacks its visible default: ${envelope.session}`);
		}
		const publicChats = decoded.value.data.chats;
		if (rows.length !== publicChats.length) {
			return false;
		}
		return rows.every((row, index) => {
			const chat = this._toChatV2(row);
			const actual = publicChats[index];
			const origin = actual.origin === undefined ? undefined : typeof actual.origin === 'string' ? actual.origin : stableStringify(actual.origin);
			const expectedOrigin = chat.origin === undefined ? undefined : stableStringify(projectAgentHostCatalogChatOrigin(JSON.parse(chat.origin)));
			return actual.uri === chat.chat && actual.order === chat.order
				&& actual.kind === (chat.chat === defaultChat ? 'default' : 'peer')
				&& actual.summary === chat.metadata?.summary && actual.titleSource === chat.metadata?.titleSource
				&& (actual.interactivity ?? ChatInteractivity.Full) === (chat.metadata?.interactivity ?? ChatInteractivity.Full)
				&& origin === expectedOrigin && stableStringify(actual.workingDirectories) === stableStringify(chat.workingDirectories)
				&& actual.isRead === chat.isRead && (actual.archived ?? false) === chat.archived
				&& actual.inheritedTurnId === chat.inheritedTurnId && stableStringify(actual.changes) === stableStringify(chat.metadata?.changes);
		});
	}

	async readCatalogSnapshot(sessions?: readonly string[]): Promise<readonly IAgentHostDatabaseCatalogSnapshotEntry[]> {
		if (sessions?.length === 0) {
			return [];
		}
		if (sessions && sessions.length > AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT) {
			throw new Error(`Catalog snapshot selector exceeds ${AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT} sessions`);
		}
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN');
			try {
				const selector = sessions ? `AND s.session_uri IN (${sessions.map(() => '?').join(',')})` : '';
				const live = `NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'sessionTombstone:' || s.session_uri AND value = 'true')
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = '${sessionsV2ExcludedKeyPrefix}' || s.provider || ':' || s.session_uri)`;
				const headers = await all(database, `SELECT s.session_uri, s.provider, s.start_time, s.modified_time, s.external,
					s.registration_source, s.is_chat_backing, h.revision, h.authority_version, h.default_chat_uri,
					h.session_generation, h.normalization_source_revision, h.normalization_payload_hash,
					EXISTS (SELECT 1 FROM metadata WHERE key = '${provisionalSessionKeyPrefix}' || s.session_uri AND value = 'true') AS provisional
					FROM sessions_v2 s LEFT JOIN session_chat_catalogs h ON h.session_uri = s.session_uri
					WHERE ${live} ${selector} ORDER BY s.session_uri`, sessions ?? []);
				const rows = await all(database, `SELECT c.chat_uri, c.owner_session_uri, c.chat_order, c.storage_resource,
					c.parent_chat, c.origin, c.working_directories, c.is_read, c.archived, c.inherited_turn_id, c.metadata, c.metadata_hash,
					c.ownership_revision, c.metadata_revision
					FROM chats_v2 c JOIN sessions_v2 s ON s.session_uri = c.owner_session_uri
					JOIN session_chat_catalogs h ON h.session_uri = s.session_uri AND h.authority_version = 2
					WHERE c.tombstoned = 0 AND ${live} ${selector}
					ORDER BY c.owner_session_uri, c.chat_order, c.chat_uri`, sessions ?? []);
				const grouped = new Map<string, IAgentHostDatabaseChatV2[]>();
				for (const row of rows) {
					const owner = row.owner_session_uri as string;
					let chats = grouped.get(owner);
					if (!chats) {
						chats = [];
						grouped.set(owner, chats);
					}
					chats.push(this._toChatV2(row));
				}
				for (const header of headers) {
					if (header.authority_version === 2) {
						const chats = grouped.get(header.session_uri as string) ?? [];
						if (chats.length > AGENT_HOST_CATALOG_CHILD_LIMIT || !chats.some(chat => chat.chat === header.default_chat_uri && chat.order !== undefined)) {
							throw new Error(`Normalized catalog is missing its visible default or exceeds the chat limit: ${header.session_uri}`);
						}
					}
				}
				const result = headers.map(row => ({
					session: row.session_uri as string,
					authorityVersion: row.authority_version === 2 ? 2 as const : 1 as const,
					identity: this._toSessionRegistration(row),
					isChatBacking: row.is_chat_backing === 1,
					provisional: row.provisional === 1,
					header: row.revision === null ? undefined : this._toChatCatalogHeader(row),
					chats: grouped.get(row.session_uri as string) ?? [],
				}));
				await exec(database, 'COMMIT');
				return result;
			} catch (error) {
				return this._rollback(database, error, 'Failed to read normalized chat catalog');
			}
		});
	}

	async listLegacyChatCatalogSessions(sessions: readonly string[]): Promise<readonly string[]> {
		if (sessions.length === 0) {
			return [];
		}
		if (sessions.length > AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT) {
			throw new Error(`Catalog migration selector exceeds ${AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT} sessions`);
		}
		return this._transactionSequencer.queue(async () => {
			const rows = await all(await this._ensureDatabase(), `SELECT s.session_uri
				FROM sessions_v2 s LEFT JOIN session_chat_catalogs h ON h.session_uri = s.session_uri
				WHERE s.session_uri IN (${sessions.map(() => '?').join(',')})
					AND COALESCE(h.authority_version, 1) = 1 AND s.is_chat_backing = 0
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'sessionTombstone:' || s.session_uri AND value = 'true')
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = '${sessionsV2ExcludedKeyPrefix}' || s.provider || ':' || s.session_uri)
				ORDER BY s.session_uri`, sessions);
			return rows.map(row => row.session_uri as string);
		});
	}

	async readChatV2(session: string, chat: string): Promise<{ readonly normalized: boolean; readonly chat?: IAgentHostDatabaseChatV2 }> {
		return this._transactionSequencer.queue(async () => {
			const row = await get(await this._ensureDatabase(), `SELECT h.authority_version,
				EXISTS (SELECT 1 FROM chats_v2 d WHERE d.chat_uri = h.default_chat_uri
					AND d.owner_session_uri = s.session_uri AND d.tombstoned = 0 AND d.chat_order IS NOT NULL) AS has_default,
				c.chat_uri, c.owner_session_uri, c.chat_order, c.storage_resource,
				c.parent_chat, c.origin, c.working_directories, c.is_read, c.archived, c.inherited_turn_id,
				c.metadata, c.metadata_hash, c.ownership_revision, c.metadata_revision
				FROM sessions_v2 s LEFT JOIN session_chat_catalogs h ON h.session_uri = s.session_uri
				LEFT JOIN chats_v2 c ON c.owner_session_uri = s.session_uri AND c.chat_uri = ?
					AND c.tombstoned = 0 AND h.authority_version = 2
				WHERE s.session_uri = ?
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'sessionTombstone:' || s.session_uri AND value = 'true')
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = '${sessionsV2ExcludedKeyPrefix}' || s.provider || ':' || s.session_uri)`, [chat, session]);
			if (row?.authority_version !== 2) {
				return { normalized: false };
			}
			if (row.has_default !== 1) {
				throw new Error(`Normalized catalog is missing its visible default: ${session}`);
			}
			return { normalized: true, ...(row.chat_uri === null ? {} : { chat: this._toChatV2(row) }) };
		});
	}

	async getChatV2ProviderDetail(chat: string): Promise<IAgentHostDatabaseChatV2ProviderDetail | undefined> {
		return this._transactionSequencer.queue(async () => {
			const row = await get(await this._ensureDatabase(), `SELECT c.provider_data
				FROM chats_v2 c JOIN session_chat_catalogs h ON h.session_uri = c.owner_session_uri AND h.authority_version = 2
				JOIN sessions_v2 s ON s.session_uri = c.owner_session_uri
				WHERE c.chat_uri = ? AND c.tombstoned = 0
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'sessionTombstone:' || s.session_uri AND value = 'true')
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = '${sessionsV2ExcludedKeyPrefix}' || s.provider || ':' || s.session_uri)`, [chat]);
			if (!row) {
				return undefined;
			}
			return {
				...(row.provider_data === null ? {} : { providerData: row.provider_data as string }),
			};
		});
	}

	async ensureChatCatalogV2(session: string, expected: IAgentHostDatabaseChatV2NormalizationExpectation, candidate: IAgentHostDatabaseChatV2NormalizationCandidate, mutation?: IAgentHostDatabaseChatV2Mutation): Promise<AgentHostDatabaseChatV2WriteResult> {
		this._validateChatV2Candidate(candidate);
		this._validateRevision(expected.catalogRevision);
		this._validateRevision(expected.sourceRevision);
		if (mutation?.kind === 'replacePeers') {
			this._validateRevision(mutation.expectedRevision);
			this._validateSessionChats(mutation.chats);
		} else if (mutation) {
			this._validateChatV2Patch(mutation.expected, mutation.patch);
		}
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const result = await this._normalizeChatCatalog(database, session, expected, candidate);
				if (result.status !== 'applied' && result.status !== 'replayed') {
					await exec(database, 'ROLLBACK');
					return result;
				}
				if (mutation?.kind === 'replacePeers') {
					const expectedRevision = result.status === 'applied' ? expected.catalogRevision : result.catalogRevision;
					if (mutation.expectedRevision !== expectedRevision) {
						await exec(database, 'ROLLBACK');
						return { status: 'conflict' };
					}
					const header = await get(database, 'SELECT * FROM session_chat_catalogs WHERE session_uri = ?', [session]);
					if (!header) {
						throw new Error(`Missing normalized catalog header for ${session}`);
					}
					const updated = await this._replaceNormalizedPeers(database, session, mutation.chats, header, false);
					if (updated.status !== 'applied') {
						await exec(database, 'ROLLBACK');
						return updated;
					}
					await exec(database, 'COMMIT');
					return { status: 'applied', catalogRevision: updated.revision };
				} else if (mutation) {
					const updated = await this._updateChatV2(database, mutation.chat, mutation.expected, mutation.patch, session);
					if (updated.status !== 'applied') {
						await exec(database, 'ROLLBACK');
						return updated;
					}
					await exec(database, 'COMMIT');
					return updated;
				}
				await exec(database, 'COMMIT');
				return result;
			} catch (error) {
				return this._rollback(database, error, `Failed to activate chat catalog for ${session}`);
			}
		});
	}

	async registerChatCatalogV2(session: string, candidate: IAgentHostDatabaseChatV2NormalizationCandidate): Promise<AgentHostDatabaseChatV2WriteResult> {
		this._validateChatV2Candidate(candidate);
		if (candidate.deletedChats?.length) {
			throw new Error('New sessions cannot import legacy deleted chat identities');
		}
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const unavailable = await this._chatCatalogUnavailable(database, session);
				if (unavailable) {
					await exec(database, 'COMMIT');
					return { status: unavailable };
				}
				const source = await get(database, 'SELECT verified FROM sessions_v2 WHERE session_uri = ?', [session]);
				const header = await get(database, 'SELECT 1 FROM session_chat_catalogs WHERE session_uri = ?', [session]);
				if (source?.verified === 1 || header) {
					await exec(database, 'COMMIT');
					return { status: 'conflict' };
				}
				await this._insertChatV2Catalog(database, session, candidate, 1);
				await exec(database, 'COMMIT');
				return { status: 'applied', catalogRevision: 1 };
			} catch (error) {
				return this._rollback(database, error, `Failed to create chat catalog for ${session}`);
			}
		});
	}

	async updateChatV2Metadata(chat: string, expected: IAgentHostDatabaseChatV2Revision, patch: IAgentHostDatabaseChatV2Patch): Promise<AgentHostDatabaseChatV2WriteResult> {
		this._validateChatV2Patch(expected, patch);
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const result = await this._updateChatV2(database, chat, expected, patch);
				await exec(database, 'COMMIT');
				return result;
			} catch (error) {
				return this._rollback(database, error, `Failed to update chat ${chat}`);
			}
		});
	}

	async insertPrivateChatV2(session: string, chat: IAgentHostDatabaseChatV2NormalizationChat, expectedCatalogRevision: number): Promise<AgentHostDatabaseChatV2WriteResult> {
		if (chat.order !== undefined || chat.metadata?.interactivity !== ChatInteractivity.Hidden) {
			throw new Error('Private insertion requires no ordering slot and explicit Hidden interactivity');
		}
		return this._mutatePrivateChatV2(session, chat.chat, expectedCatalogRevision, chat);
	}

	async removePrivateChatV2(session: string, chat: string, expectedCatalogRevision: number): Promise<AgentHostDatabaseChatV2WriteResult> {
		return this._mutatePrivateChatV2(session, chat, expectedCatalogRevision);
	}

	private async _mutatePrivateChatV2(session: string, chat: string, expectedCatalogRevision: number, insertion?: IAgentHostDatabaseChatV2NormalizationChat): Promise<AgentHostDatabaseChatV2WriteResult> {
		this._validateRevision(expectedCatalogRevision);
		validateChatV2String(chat, true);
		return this._transactionSequencer.queue(async () => {
			const database = await this._ensureDatabase();
			await exec(database, 'BEGIN IMMEDIATE');
			try {
				const unavailable = await this._chatCatalogUnavailable(database, session);
				if (unavailable) {
					await exec(database, 'COMMIT');
					return { status: unavailable };
				}
				const header = await get(database, 'SELECT * FROM session_chat_catalogs WHERE session_uri = ?', [session]);
				if (header?.authority_version !== 2 || header.revision !== expectedCatalogRevision) {
					await exec(database, 'COMMIT');
					return { status: 'conflict' };
				}
				const existing = await get(database, 'SELECT * FROM chats_v2 WHERE chat_uri = ?', [chat]);
				const rows = await all(database, 'SELECT * FROM chats_v2 WHERE owner_session_uri = ? AND tombstoned = 0', [session]);
				if (rows.length > AGENT_HOST_CATALOG_CHILD_LIMIT || !rows.some(row => row.chat_uri === header.default_chat_uri && row.chat_order !== null)) {
					throw new Error(`Invalid live normalized catalog for ${session}`);
				}
				if (existing && (existing.tombstoned === 1 || existing.owner_session_uri !== session || existing.chat_order !== null)) {
					await exec(database, 'COMMIT');
					return { status: 'conflict' };
				}
				if (insertion) {
					this._validateChatV2Input(insertion);
					await this._validatePrivateChatV2Parent(database, session, chat, insertion.parentChat);
					if (existing) {
						const actual = this._toChatV2(existing);
						const matches = existing.storage_resource === (insertion.storageResource ?? null)
							&& existing.parent_chat === (insertion.parentChat ?? null)
							&& existing.provider_data === (insertion.providerData ?? null)
							&& existing.origin === (insertion.origin ?? null)
							&& actual.isRead === insertion.isRead && actual.archived === (insertion.archived ?? false)
							&& actual.inheritedTurnId === insertion.inheritedTurnId
							&& stableStringify(actual.workingDirectories) === stableStringify(insertion.workingDirectories)
							&& encodeChatV2Metadata(actual.metadata ?? {}) === encodeChatV2Metadata(insertion.metadata ?? {});
						await exec(database, 'COMMIT');
						return matches ? { status: 'replayed', catalogRevision: expectedCatalogRevision } : { status: 'conflict' };
					}
					if (await get(database, `SELECT 1 FROM session_chats c JOIN session_chat_catalogs h ON h.session_uri = c.session_uri
						WHERE c.chat_uri = ? AND h.authority_version = 1 LIMIT 1`, [chat])) {
						await exec(database, 'COMMIT');
						return { status: 'conflict' };
					}
					if (rows.length === AGENT_HOST_CATALOG_CHILD_LIMIT) {
						throw new Error('Chat catalog exceeds the limit');
					}
					await this._insertChatV2(database, session, insertion);
				} else {
					if (!existing) {
						await exec(database, 'COMMIT');
						return { status: 'conflict' };
					}
					const removed = new Set([chat]);
					let expanded = true;
					while (expanded) {
						expanded = false;
						for (const row of rows) {
							if (row.chat_order === null && removed.has(row.parent_chat as string) && !removed.has(row.chat_uri as string)) {
								removed.add(row.chat_uri as string);
								expanded = true;
							}
						}
					}
					for (const row of rows) {
						if (removed.has(row.chat_uri as string)) {
							await run(database, 'UPDATE chats_v2 SET tombstoned = 1, ownership_revision = ? WHERE chat_uri = ?',
								[this._nextRevision(row.ownership_revision as number), row.chat_uri]);
						}
					}
				}
				const revision = this._nextRevision(expectedCatalogRevision);
				await run(database, 'UPDATE session_chat_catalogs SET revision = ? WHERE session_uri = ?', [revision, session]);
				await exec(database, 'COMMIT');
				return { status: 'applied', catalogRevision: revision };
			} catch (error) {
				return this._rollback(database, error, `Failed to mutate private chat ${chat}`);
			}
		});
	}

	private async _chatCatalogUnavailable(database: Database, session: string): Promise<'missingSession' | 'tombstoned' | undefined> {
		if (await get(database, `SELECT 1 FROM metadata WHERE key = ? AND value = 'true'`, [tombstoneKey(session)])) {
			return 'tombstoned';
		}
		const row = await get(database, `SELECT 1 FROM sessions_v2 s WHERE s.session_uri = ?
			AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = '${sessionsV2ExcludedKeyPrefix}' || s.provider || ':' || s.session_uri)`, [session]);
		return row ? undefined : 'missingSession';
	}

	private async _normalizeChatCatalog(database: Database, session: string, expected: IAgentHostDatabaseChatV2NormalizationExpectation, candidate: IAgentHostDatabaseChatV2NormalizationCandidate): Promise<AgentHostDatabaseChatV2WriteResult> {
		const unavailable = await this._chatCatalogUnavailable(database, session);
		if (unavailable) {
			return { status: unavailable };
		}
		const header = await get(database, 'SELECT * FROM session_chat_catalogs WHERE session_uri = ?', [session]);
		if (header?.authority_version === 2) {
			const replayed = header.session_generation === expected.sessionGeneration
				&& header.normalization_source_revision === expected.sourceRevision
				&& header.normalization_payload_hash === expected.payloadHash;
			return replayed ? { status: 'replayed', catalogRevision: header.revision as number } : { status: 'alreadyNormalized' };
		}
		if ((header?.revision ?? 0) !== expected.catalogRevision) {
			return { status: 'conflict' };
		}
		const row = await get(database, `SELECT s.*, COALESCE(CAST((SELECT value FROM metadata WHERE key = ?) AS INTEGER), 0) AS dirty
			FROM sessions_v2 s WHERE session_uri = ?`, [sessionsV2PayloadDirtyKey(session), session]);
		if (!row || row.verified !== 1 || row.dirty !== 0) {
			return { status: 'notReady' };
		}
		if (row.session_generation !== expected.sessionGeneration || row.source_revision !== expected.sourceRevision || row.payload_hash !== expected.payloadHash) {
			return { status: 'conflict' };
		}
		const decoded = decodeAgentHostCatalogPayload(row.payload as string);
		if (!decoded.ok) {
			throw new Error(`Invalid normalization source: ${decoded.error}`);
		}
		if (hashAgentHostCatalogPayload(row.payload as string) !== row.payload_hash || decoded.value.payload !== row.payload) {
			throw new Error('Normalization source hash or canonical payload mismatch');
		}
		const source = decoded.value.data.chats;
		const visible = source.filter(chat => chat.interactivity !== ChatInteractivity.Hidden);
		const defaults = visible.filter(chat => chat.kind === 'default');
		const peers = visible.filter(chat => chat.kind === 'peer');
		const privateChats = source.filter(chat => chat.interactivity === ChatInteractivity.Hidden);
		if (defaults.length !== 1 || defaults[0].uri !== candidate.defaultChat.chat
			|| !this._sameChatUris(peers, candidate.peers) || !this._sameChatUris(privateChats, candidate.privateDescendants)) {
			throw new Error('Normalization must retain the exact default, visible peers and explicit private roles');
		}
		const deletedUris = new Set(candidate.deletedChats?.map(chat => chat.chat));
		const legacy = (await all(database, 'SELECT * FROM session_chats WHERE session_uri = ? ORDER BY chat_order', [session]))
			.filter(chat => !deletedUris.has(chat.chat_uri as string));
		if (header && (legacy.length !== peers.length || legacy.some((chat, index) => chat.chat_uri !== peers[index].uri))) {
			return { status: 'notReady' };
		}
		const legacyByUri = new Map(legacy.map(chat => [chat.chat_uri as string, chat]));
		const normalize = (chat: IAgentHostDatabaseChatV2NormalizationChat): IAgentHostDatabaseChatV2NormalizationChat => {
			const actual = source.find(entry => entry.uri === chat.chat)!;
			const legacyChat = legacyByUri.get(chat.chat);
			const metadata: IAgentHostChatV2MetadataData = {
				...(actual.summary === undefined ? {} : { summary: actual.summary }),
				...(actual.titleSource === undefined ? {} : { titleSource: actual.titleSource }),
				interactivity: actual.interactivity ?? ChatInteractivity.Full,
				...(actual.changes === undefined ? {} : { changes: actual.changes }),
			};
			const origin = actual.origin === undefined ? undefined : typeof actual.origin === 'string' ? actual.origin : stableStringify(actual.origin);
			const equalOrigin = (value: string | undefined): boolean => {
				if (value === origin) {
					return true;
				}
				if (value === undefined || actual.origin === undefined) {
					return false;
				}
				try {
					return stableStringify(projectAgentHostCatalogChatOrigin(JSON.parse(value))) === stableStringify(actual.origin);
				} catch {
					return false;
				}
			};
			if (chat.metadata !== undefined && encodeChatV2Metadata({ ...chat.metadata, interactivity: chat.metadata.interactivity ?? metadata.interactivity }) !== encodeChatV2Metadata(metadata)
				|| chat.origin !== undefined && !equalOrigin(chat.origin)
				|| chat.isRead !== undefined && chat.isRead !== actual.isRead
				|| chat.archived !== undefined && chat.archived !== (actual.archived ?? false)
				|| chat.inheritedTurnId !== undefined && chat.inheritedTurnId !== actual.inheritedTurnId
				|| chat.workingDirectories !== undefined && actual.workingDirectories !== undefined && stableStringify(chat.workingDirectories) !== stableStringify(actual.workingDirectories)
				|| chat.workingDirectories !== undefined && actual.workingDirectories === undefined && actual.kind !== 'default'
				|| chat.order !== undefined && chat.order !== visible.findIndex(entry => entry.uri === chat.chat)) {
				throw new Error(`Normalization conflicts with verified per-chat source for ${chat.chat}`);
			}
			if (legacyChat && (legacyChat.is_read !== (actual.isRead === undefined ? null : actual.isRead ? 1 : 0)
				|| (legacyChat.archived === 1) !== (actual.archived ?? false)
				|| legacyChat.inherited_turn_id !== (actual.inheritedTurnId ?? null)
				|| !equalOrigin(legacyChat.origin === null ? undefined : legacyChat.origin as string))) {
				throw new Error(`Legacy peer state differs from verified per-chat source for ${chat.chat}`);
			}
			if (legacyChat && chat.providerData !== undefined && chat.providerData !== legacyChat.provider_data) {
				throw new Error(`Normalization conflicts with central provider detail for ${chat.chat}`);
			}
			if (legacyChat?.origin && chat.origin !== undefined
				&& stableStringify(JSON.parse(chat.origin)) !== stableStringify(JSON.parse(legacyChat.origin as string))) {
				throw new Error(`Normalization conflicts with central origin detail for ${chat.chat}`);
			}
			return {
				...chat,
				order: actual.interactivity === ChatInteractivity.Hidden ? undefined : visible.findIndex(entry => entry.uri === chat.chat),
				origin: chat.origin !== undefined ? stableStringify(JSON.parse(chat.origin))
					: legacyChat?.origin ? stableStringify(JSON.parse(legacyChat.origin as string)) : origin,
				metadata,
				isRead: actual.isRead,
				archived: actual.archived ?? false,
				inheritedTurnId: actual.inheritedTurnId,
				workingDirectories: actual.workingDirectories ?? (actual.kind === 'default' ? chat.workingDirectories : undefined),
				providerData: legacyChat ? (legacyChat.provider_data as string | null) ?? undefined : chat.providerData,
			};
		};
		const normalized = {
			defaultChat: normalize(candidate.defaultChat),
			peers: candidate.peers.map(normalize),
			privateDescendants: candidate.privateDescendants.map(normalize),
			deletedChats: candidate.deletedChats,
		};
		this._validateChatV2Candidate(normalized);
		const revision = this._nextRevision(expected.catalogRevision);
		await this._insertChatV2Catalog(database, session, normalized, revision, expected);
		return { status: 'applied', catalogRevision: revision };
	}

	private _sameChatUris(source: readonly AgentHostCatalogChat[], candidate: readonly IAgentHostDatabaseChatV2NormalizationChat[]): boolean {
		const candidates = new Set(candidate.map(chat => chat.chat));
		return source.length === candidates.size && source.every(chat => candidates.has(chat.uri));
	}

	private _validateRevision(value: number): void {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new Error('Chat revision must be a non-negative safe integer');
		}
	}

	private _nextRevision(value: number): number {
		this._validateRevision(value);
		this._validateRevision(value + 1);
		return value + 1;
	}

	private _validateChatV2Candidate(candidate: IAgentHostDatabaseChatV2NormalizationCandidate): void {
		const visible = [candidate.defaultChat, ...candidate.peers];
		const chats = [...visible, ...candidate.privateDescendants];
		if (chats.length > AGENT_HOST_CATALOG_CHILD_LIMIT || new Set(chats.map(chat => chat.chat)).size !== chats.length) {
			throw new Error('Chat catalog exceeds the limit or contains duplicate identities');
		}
		const orders = new Set(visible.map(chat => chat.order));
		if (visible.some(chat => chat.order === undefined || !Number.isSafeInteger(chat.order) || chat.order < 0 || chat.order >= visible.length)
			|| orders.size !== visible.length || candidate.privateDescendants.some(chat => chat.order !== undefined)) {
			throw new Error('Visible orders must be contiguous and private chats must not occupy an ordering slot');
		}
		const byUri = new Map(chats.map(chat => [chat.chat, chat]));
		const deletedUris = new Set<string>();
		if ((candidate.deletedChats?.length ?? 0) > AGENT_HOST_CATALOG_CHILD_LIMIT) {
			throw new Error('Deleted chat identities exceed the catalog limit');
		}
		for (const deleted of candidate.deletedChats ?? []) {
			validateChatV2String(deleted.chat, true);
			if (deleted.summary !== '' || deleted.titleSource !== '' || byUri.has(deleted.chat) || deletedUris.has(deleted.chat)) {
				throw new Error('Deleted chat identities require both explicit legacy empty fields and cannot overlap live roles');
			}
			deletedUris.add(deleted.chat);
		}
		for (const chat of chats) {
			this._validateChatV2Input(chat);
			const seen = new Set([chat.chat]);
			let parent = chat.parentChat;
			while (parent !== undefined) {
				if (seen.has(parent) || !byUri.has(parent)) {
					throw new Error(`Chat lineage is cyclic or leaves its owner catalog: ${chat.chat}`);
				}
				seen.add(parent);
				parent = byUri.get(parent)!.parentChat;
			}
		}
	}

	private _validateChatV2Input(chat: IAgentHostDatabaseChatV2NormalizationChat): void {
		validateChatV2String(chat.chat, true);
		if (chat.storageResource !== undefined) {
			validateChatV2String(chat.storageResource, true);
		}
		if (chat.inheritedTurnId !== undefined) {
			validateChatV2String(chat.inheritedTurnId);
		}
		if (chat.workingDirectories !== undefined) {
			validateChatV2WorkingDirectories(chat.workingDirectories);
		}
		if (chat.origin !== undefined) {
			validateChatV2Origin(chat.origin);
		}
		encodeChatV2Metadata(chat.metadata ?? {});
		this._validateChatV2Role(chat.order, chat.metadata);
	}

	private _validateChatV2Role(order: number | undefined, metadata: IAgentHostChatV2MetadataData | undefined): void {
		if (metadata?.interactivity !== undefined && (metadata.interactivity === ChatInteractivity.Hidden) !== (order === undefined)) {
			throw new Error('Chat interactivity contradicts its visible/private role');
		}
	}

	private async _insertChatV2Catalog(database: Database, session: string, candidate: IAgentHostDatabaseChatV2NormalizationCandidate, revision: number, expected?: IAgentHostDatabaseChatV2NormalizationExpectation): Promise<void> {
		for (const chat of [candidate.defaultChat, ...candidate.peers, ...candidate.privateDescendants]) {
			if (await get(database, 'SELECT 1 FROM chats_v2 WHERE chat_uri = ?', [chat.chat])) {
				throw new Error(`Chat identity is already registered: ${chat.chat}`);
			}
		}
		await run(database, `INSERT INTO session_chat_catalogs (session_uri, revision, authority_version, default_chat_uri,
			session_generation, normalization_source_revision, normalization_payload_hash) VALUES (?, ?, 2, ?, ?, ?, ?)
			ON CONFLICT(session_uri) DO UPDATE SET revision = excluded.revision, authority_version = 2,
				default_chat_uri = excluded.default_chat_uri, session_generation = excluded.session_generation,
				normalization_source_revision = excluded.normalization_source_revision, normalization_payload_hash = excluded.normalization_payload_hash`,
			[session, revision, candidate.defaultChat.chat, expected?.sessionGeneration ?? null, expected?.sourceRevision ?? null, expected?.payloadHash ?? null]);
		for (const chat of [candidate.defaultChat, ...candidate.peers, ...candidate.privateDescendants]) {
			await this._insertChatV2(database, session, chat);
		}
		for (const deleted of candidate.deletedChats ?? []) {
			const current = await get(database, 'SELECT tombstoned FROM chats_v2 WHERE chat_uri = ?', [deleted.chat]);
			if (current?.tombstoned === 0) {
				throw new Error(`Deleted legacy identity conflicts with a live normalized chat: ${deleted.chat}`);
			}
			if (!current) {
				const metadata = encodeChatV2Metadata({});
				await run(database, `INSERT INTO chats_v2 (chat_uri, owner_session_uri, metadata, metadata_hash, tombstoned, ownership_revision)
					VALUES (?, ?, ?, ?, 1, 1)`, [deleted.chat, session, metadata, hashChatV2Metadata(metadata)]);
			}
		}
	}

	private async _insertChatV2(database: Database, session: string, chat: IAgentHostDatabaseChatV2NormalizationChat): Promise<void> {
		const metadata = encodeChatV2Metadata(chat.metadata ?? {});
		await run(database, `INSERT INTO chats_v2 (chat_uri, owner_session_uri, chat_order, storage_resource,
			parent_chat, provider_data, origin, is_read, archived, inherited_turn_id, working_directories, metadata, metadata_hash)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
			chat.chat, session, chat.order ?? null, chat.storageResource ?? null, chat.parentChat ?? null,
			chat.providerData ?? null, chat.origin ?? null, chat.isRead === undefined ? null : chat.isRead ? 1 : 0,
			chat.archived ? 1 : 0, chat.inheritedTurnId ?? null,
			chat.workingDirectories === undefined ? null : JSON.stringify(chat.workingDirectories),
			metadata, hashChatV2Metadata(metadata),
		]);
	}

	private _validateChatV2Patch(expected: IAgentHostDatabaseChatV2Revision, patch: IAgentHostDatabaseChatV2Patch): void {
		this._validateRevision(expected.ownershipRevision);
		this._validateRevision(expected.metadataRevision);
		if (patch.metadata !== undefined) {
			encodeChatV2Metadata(patch.metadata);
		}
		if (patch.workingDirectories !== undefined && patch.workingDirectories !== null) {
			validateChatV2WorkingDirectories(patch.workingDirectories);
		}
		if (patch.inheritedTurnId !== undefined && patch.inheritedTurnId !== null) {
			validateChatV2String(patch.inheritedTurnId);
		}
		if (patch.parentChat !== undefined) {
			validateChatV2String(patch.parentChat, true);
		}
		if (patch.origin !== undefined && patch.origin !== null) {
			validateChatV2Origin(patch.origin);
		}
	}

	private async _updateChatV2(database: Database, chat: string, expected: IAgentHostDatabaseChatV2Revision, patch: IAgentHostDatabaseChatV2Patch, expectedOwner?: string): Promise<AgentHostDatabaseChatV2WriteResult> {
		const row = await get(database, 'SELECT * FROM chats_v2 WHERE chat_uri = ? AND tombstoned = 0', [chat]);
		if (!row || expectedOwner !== undefined && row.owner_session_uri !== expectedOwner) {
			return { status: 'conflict' };
		}
		const session = row.owner_session_uri as string;
		const unavailable = await this._chatCatalogUnavailable(database, session);
		if (unavailable) {
			return { status: unavailable };
		}
		const header = await get(database, 'SELECT revision, authority_version FROM session_chat_catalogs WHERE session_uri = ?', [session]);
		if (header?.authority_version !== 2 || row.ownership_revision !== expected.ownershipRevision || row.metadata_revision !== expected.metadataRevision) {
			return { status: 'conflict' };
		}
		const metadata = patch.metadata === undefined ? this._decodeChatV2RowMetadata(row) : patch.metadata;
		this._validateChatV2Role(row.chat_order === null ? undefined : row.chat_order as number, metadata);
		if (patch.parentChat !== undefined) {
			if (row.chat_order !== null) {
				throw new Error('Only private chats may be reparented');
			}
			await this._validatePrivateChatV2Parent(database, session, chat, patch.parentChat);
		}
		const payload = encodeChatV2Metadata(metadata);
		await run(database, `UPDATE chats_v2 SET metadata = ?, metadata_hash = ?, metadata_revision = ?,
			provider_data = ?, origin = ?, working_directories = ?, parent_chat = ?, is_read = ?, archived = ?, inherited_turn_id = ?
			WHERE chat_uri = ?`, [
			payload, hashChatV2Metadata(payload), this._nextRevision(expected.metadataRevision),
			patch.providerData === undefined ? row.provider_data : patch.providerData,
			patch.origin === undefined ? row.origin : patch.origin,
			patch.workingDirectories === undefined ? row.working_directories : patch.workingDirectories === null ? null : JSON.stringify(patch.workingDirectories),
			patch.parentChat ?? row.parent_chat,
			patch.isRead === undefined ? row.is_read : patch.isRead ? 1 : 0,
			patch.archived === undefined ? row.archived : patch.archived ? 1 : 0,
			patch.inheritedTurnId === undefined ? row.inherited_turn_id : patch.inheritedTurnId,
			chat,
		]);
		const revision = this._nextRevision(header.revision as number);
		await run(database, 'UPDATE session_chat_catalogs SET revision = ? WHERE session_uri = ?', [revision, session]);
		return { status: 'applied', catalogRevision: revision };
	}

	private async _validatePrivateChatV2Parent(database: Database, session: string, chat: string, parent: string | undefined): Promise<void> {
		const seen = new Set([chat]);
		while (parent !== undefined) {
			if (seen.has(parent)) {
				throw new Error('Private lineage would be cyclic');
			}
			seen.add(parent);
			if (seen.size > AGENT_HOST_CATALOG_CHILD_LIMIT) {
				throw new Error('Private lineage exceeds the catalog limit');
			}
			const ancestor = await get(database, 'SELECT parent_chat FROM chats_v2 WHERE chat_uri = ? AND owner_session_uri = ? AND tombstoned = 0', [parent, session]);
			if (!ancestor) {
				throw new Error('Private lineage must remain in the live owner catalog');
			}
			parent = ancestor.parent_chat === null ? undefined : ancestor.parent_chat as string;
		}
	}

	private _decodeChatV2RowMetadata(row: Record<string, unknown>): IAgentHostChatV2MetadataData {
		return this._decodeChatV2Metadata(row.chat_uri as string, row.metadata as string, row.metadata_hash as string);
	}

	private _decodeChatV2Metadata(chat: string, payload: string, hash: string): IAgentHostChatV2MetadataData {
		if (hashChatV2Metadata(payload) !== hash) {
			throw new Error(`Stored chat metadata hash mismatch for ${chat}`);
		}
		return decodeChatV2Metadata(payload);
	}

	private _toChatV2(row: Record<string, unknown>): IAgentHostDatabaseChatV2 {
		return {
			chat: row.chat_uri as string,
			ownerSession: row.owner_session_uri as string,
			...(row.chat_order === null ? {} : { order: row.chat_order as number }),
			...(row.storage_resource === null ? {} : { storageResource: row.storage_resource as string }),
			...(row.parent_chat === null ? {} : { parentChat: row.parent_chat as string }),
			...(row.origin === null ? {} : { origin: row.origin as string }),
			...(row.working_directories === null ? {} : { workingDirectories: this._decodeChatV2Directories(row.working_directories as string) }),
			...(row.is_read === null ? {} : { isRead: row.is_read === 1 }),
			archived: row.archived === 1,
			...(row.inherited_turn_id === null ? {} : { inheritedTurnId: row.inherited_turn_id as string }),
			ownershipRevision: row.ownership_revision as number,
			metadataRevision: row.metadata_revision as number,
			metadata: this._decodeChatV2RowMetadata(row),
		};
	}

	private _toChatCatalogHeader(row: Record<string, unknown>): IAgentHostDatabaseChatCatalogHeaderV2 {
		return {
			session: row.session_uri as string,
			revision: row.revision as number,
			authorityVersion: row.authority_version as 1 | 2,
			...(row.default_chat_uri === null ? {} : { defaultChatUri: row.default_chat_uri as string }),
			...(row.session_generation === null ? {} : { sessionGeneration: row.session_generation as string }),
			...(row.normalization_source_revision === null ? {} : { normalizationSourceRevision: row.normalization_source_revision as number }),
			...(row.normalization_payload_hash === null ? {} : { normalizationPayloadHash: row.normalization_payload_hash as string }),
		};
	}

	private _toLegacyChat(row: Record<string, unknown>): IAgentHostDatabaseSessionChat {
		return {
			chat: row.chat_uri as string,
			order: row.chat_order as number,
			...(row.is_read === null ? {} : { isRead: row.is_read === 1 }),
			...(row.archived === 1 ? { archived: true } : {}),
			...(row.provider_data === null ? {} : { providerData: row.provider_data as string }),
			...(row.origin === null ? {} : { origin: row.origin as string }),
			...(row.inherited_turn_id === null ? {} : { inheritedTurnId: row.inherited_turn_id as string }),
			...(row.working_directories === null ? {} : { workingDirectories: this._decodeChatV2Directories(row.working_directories as string) }),
			metadata: this._decodeChatV2RowMetadata(row),
		};
	}

	private async _replaceNormalizedPeers(database: Database, session: string, chats: readonly IAgentHostDatabaseSessionChat[], header: Record<string, unknown>, recovering: boolean): Promise<AgentHostDatabaseSessionChatCatalogReplaceResult> {
		const rows = await all(database, 'SELECT * FROM chats_v2 WHERE owner_session_uri = ? AND tombstoned = 0', [session]);
		const defaultChat = rows.find(row => row.chat_uri === header.default_chat_uri);
		if (!defaultChat || defaultChat.chat_order === null) {
			throw new Error(`Normalized catalog has no visible default chat: ${session}`);
		}
		const existing = new Map(rows.filter(row => row.chat_order !== null && row.chat_uri !== defaultChat.chat_uri).map(row => [row.chat_uri as string, row]));
		if (recovering) {
			const actual = [...existing.values()].sort((a, b) => (a.chat_order as number) - (b.chat_order as number))
				.map((row, order) => ({ ...this._toLegacyChat(row), order }));
			return stableStringify(chats) === stableStringify(actual)
				? { status: 'applied', revision: header.revision as number }
				: { status: 'conflict' };
		}
		const retained: IAgentHostDatabaseSessionChat[] = [];
		for (const chat of chats) {
			if (chat.origin !== undefined) {
				validateChatV2Origin(chat.origin);
			}
			if (chat.chat === defaultChat.chat_uri) {
				throw new Error('The default chat cannot also be a peer');
			}
			if (!existing.has(chat.chat)) {
				const registered = await get(database, `SELECT 1 FROM chats_v2 WHERE chat_uri = ?
					UNION ALL SELECT 1 FROM session_chats c JOIN session_chat_catalogs h ON h.session_uri = c.session_uri
						WHERE c.chat_uri = ? AND c.session_uri <> ? AND h.authority_version = 1 LIMIT 1`, [chat.chat, chat.chat, session]);
				if (registered) {
					return { status: 'conflict' };
				}
			}
			retained.push({ ...chat, order: retained.length });
		}
		const revision = this._nextRevision(header.revision as number);
		const removed = rows.filter(row => existing.has(row.chat_uri as string) && !retained.some(chat => chat.chat === row.chat_uri));
		const removedUris = new Set(removed.map(row => row.chat_uri as string));
		let expanded = true;
		while (expanded) {
			expanded = false;
			for (const row of rows) {
				if (row.chat_order === null && removedUris.has(row.parent_chat as string) && !removedUris.has(row.chat_uri as string)) {
					removedUris.add(row.chat_uri as string);
					expanded = true;
				}
			}
			const totalChats = rows.length - removedUris.size + retained.filter(chat => !existing.has(chat.chat)).length;
			if (totalChats > AGENT_HOST_CATALOG_CHILD_LIMIT) {
				throw new Error(`Normalized chat catalog exceeds ${AGENT_HOST_CATALOG_CHILD_LIMIT} chats`);
			}
		}
		for (const row of rows) {
			if (removedUris.has(row.chat_uri as string)) {
				await run(database, 'UPDATE chats_v2 SET tombstoned = 1, ownership_revision = ? WHERE chat_uri = ?', [this._nextRevision(row.ownership_revision as number), row.chat_uri]);
			}
		}
		await run(database, 'UPDATE chats_v2 SET chat_order = NULL WHERE owner_session_uri = ? AND chat_order IS NOT NULL AND tombstoned = 0', [session]);
		const defaultOrder = Math.min(defaultChat.chat_order as number, retained.length);
		await run(database, 'UPDATE chats_v2 SET chat_order = ? WHERE chat_uri = ?', [defaultOrder, defaultChat.chat_uri]);
		for (const [index, chat] of retained.entries()) {
			const order = index < defaultOrder ? index : index + 1;
			const row = existing.get(chat.chat);
			if (!row) {
				validateChatV2String(chat.chat, true);
				if (chat.inheritedTurnId !== undefined) {
					validateChatV2String(chat.inheritedTurnId);
				}
				if (chat.workingDirectories !== undefined) {
					validateChatV2WorkingDirectories(chat.workingDirectories);
				}
				this._validateChatV2Role(order, chat.metadata);
				await this._insertChatV2(database, session, { ...chat, order, metadata: chat.metadata ?? { interactivity: ChatInteractivity.Full } });
			} else {
				if (chat.inheritedTurnId !== undefined) {
					validateChatV2String(chat.inheritedTurnId);
				}
				const isRead = chat.isRead === undefined ? null : chat.isRead ? 1 : 0;
				const archived = chat.archived ? 1 : 0;
				const workingDirectories = chat.workingDirectories === undefined ? row.working_directories : JSON.stringify(chat.workingDirectories);
				if (chat.workingDirectories !== undefined) {
					validateChatV2WorkingDirectories(chat.workingDirectories);
				}
				const metadata = chat.metadata === undefined ? this._decodeChatV2RowMetadata(row) : chat.metadata;
				this._validateChatV2Role(order, metadata);
				const payload = encodeChatV2Metadata(metadata);
				const changed = row.is_read !== isRead || row.archived !== archived || row.provider_data !== (chat.providerData ?? null)
					|| row.working_directories !== workingDirectories || row.metadata !== payload
					|| row.origin !== (chat.origin ?? null) || row.inherited_turn_id !== (chat.inheritedTurnId ?? null);
				await run(database, `UPDATE chats_v2 SET chat_order = ?, is_read = ?, archived = ?, provider_data = ?,
					origin = ?, inherited_turn_id = ?, working_directories = ?, metadata = ?, metadata_hash = ?, metadata_revision = ? WHERE chat_uri = ?`, [
					order, isRead, archived, chat.providerData ?? null, chat.origin ?? null, chat.inheritedTurnId ?? null,
					workingDirectories, payload, hashChatV2Metadata(payload),
					changed ? this._nextRevision(row.metadata_revision as number) : row.metadata_revision, chat.chat,
				]);
			}
		}
		await run(database, 'UPDATE session_chat_catalogs SET revision = ? WHERE session_uri = ?', [revision, session]);
		return { status: 'applied', revision };
	}

	private async _tombstoneOwnedChats(database: Database, session: string): Promise<void> {
		const rows = await all(database, 'SELECT chat_uri, ownership_revision FROM chats_v2 WHERE owner_session_uri = ? AND tombstoned = 0', [session]);
		for (const row of rows) {
			await run(database, 'UPDATE chats_v2 SET tombstoned = 1, ownership_revision = ? WHERE chat_uri = ?', [this._nextRevision(row.ownership_revision as number), row.chat_uri]);
		}
	}

	private _decodeChatV2Directories(payload: string): readonly string[] {
		const directories: unknown = JSON.parse(payload);
		if (!Array.isArray(directories) || !directories.every((entry: unknown): entry is string => typeof entry === 'string')) {
			throw new Error('Invalid stored chat working directories');
		}
		validateChatV2WorkingDirectories(directories);
		return directories;
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
					END
				WHERE ? = 0 OR sessions_v2.provider = excluded.provider`,
			[
				session, provider, startTime, modifiedTime, source, source,
				registerOptions.checkTombstone ? 1 : 0, tombstoneKey(session),
				registerOptions.discoveryBackingSession === undefined ? 0 : 1,
			],
		);
	}

	private async _listSessionsV2ExclusionsForSession(database: Database, session: string): Promise<readonly IAgentHostDatabaseSessionsV2Exclusion[]> {
		const prefix = sessionsV2ExcludedKeyPrefix;
		const upperBound = `${prefix.slice(0, -1)};`;
		const rows = await all(
			database,
			`SELECT key, value FROM metadata
				WHERE key >= ? AND key < ?
					AND substr(key, length(key) - length(?) + 1) = ?`,
			[prefix, upperBound, session, session],
		);
		return rows.map(row => {
			const suffix = (row.key as string).slice(prefix.length);
			const separator = suffix.indexOf(':');
			if (separator <= 0) {
				throw new Error(`Invalid sessions_v2 exclusion key ${row.key as string}`);
			}
			return this._toSessionsV2Exclusion(suffix.slice(0, separator), suffix.slice(separator + 1), row.value as string);
		}).filter(exclusion => exclusion.session === session);
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

	private _validateSessionChats(chats: readonly IAgentHostDatabaseSessionChat[]): void {
		const uris = new Set<string>();
		for (let index = 0; index < chats.length; index++) {
			const chat = chats[index];
			if (!chat.chat) {
				throw new Error('Session chat URI must not be empty');
			}
			if (chat.order !== index) {
				throw new Error('Session chat order must be contiguous and zero-based');
			}
			if (uris.has(chat.chat)) {
				throw new Error(`Session chat URI must be unique: ${chat.chat}`);
			}
			uris.add(chat.chat);
		}
	}

	private _selectVerifiedSessionsV2(columns: string, sessionCount?: number): string {
		return `SELECT ${columns}
			FROM sessions_v2
			WHERE sessions_v2.verified = 1
				${sessionCount === undefined ? '' : `AND sessions_v2.session_uri IN (${new Array(sessionCount).fill('?').join(',')})`}
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
					const currentVersion = await normalizePreReleaseCatalogSchema(database, (versionRow?.user_version as number | undefined) ?? 0);
					for (const migration of migrations) {
						if (migration.version > currentVersion) {
							await exec(database, 'BEGIN TRANSACTION');
							try {
								if (migration.version === 14) {
									await migrateChatV2Schema(database);
								} else {
									await exec(database, migration.sql);
								}
								await exec(database, `PRAGMA user_version = ${migration.version}`);
								await exec(database, 'COMMIT');
							} catch (error) {
								await exec(database, 'ROLLBACK');
								throw error;
							}
						}
					}
					if (currentVersion >= 14) {
						await exec(database, 'BEGIN IMMEDIATE');
						try {
							await migrateChatV2Schema(database);
							await exec(database, 'COMMIT');
						} catch (error) {
							return this._rollback(database, error, 'Failed to complete normalized catalog schema');
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
