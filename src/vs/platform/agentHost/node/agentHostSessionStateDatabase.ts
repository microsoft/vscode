/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * agent-host.db tables that hold session state authoritatively (Block 3a):
 * session-level values, per-folder git state, per-chat
 * summaries and the merge bases of the old-format
 * mirrors written to session.db for older builds.
 *
 * Every row is keyed by the session in storage spelling. Older builds skip
 * the migration and never read these tables, so the schema is additive only.
 */

/** Migration version of the session state tables. Versions 6-11 are pre-release catalog versions older builds rewrite. */
export const SESSION_STATE_MIGRATION_VERSION = 15;

export const SESSION_STATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS session_state (
	session_uri              TEXT PRIMARY KEY NOT NULL,
	revision                 INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
	legacy_mirrored_revision INTEGER NOT NULL DEFAULT 0 CHECK (legacy_mirrored_revision >= 0),
	rows_revision            INTEGER NOT NULL DEFAULT 0 CHECK (rows_revision >= 0),
	rows_mirrored_revision   INTEGER NOT NULL DEFAULT 0 CHECK (rows_mirrored_revision >= 0),
	import_version           INTEGER NOT NULL CHECK (import_version >= 1)
);
CREATE TABLE IF NOT EXISTS session_state_values (
	session_uri TEXT NOT NULL,
	key         TEXT NOT NULL,
	value       TEXT,
	revision    INTEGER NOT NULL CHECK (revision >= 0),
	PRIMARY KEY (session_uri, key)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS session_folder_state (
	session_uri      TEXT NOT NULL,
	folder_key       TEXT NOT NULL,
	kind             TEXT NOT NULL CHECK (kind IN ('git', 'github', 'baseBranch')),
	value            TEXT,
	storage_resource TEXT,
	revision         INTEGER NOT NULL CHECK (revision >= 0),
	PRIMARY KEY (session_uri, folder_key, kind)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS session_chat_state (
	session_uri                TEXT NOT NULL,
	chat_uri                   TEXT NOT NULL,
	is_default                 INTEGER NOT NULL CHECK (is_default IN (0, 1)),
	storage_resource           TEXT,
	title                      TEXT,
	title_source               TEXT CHECK (title_source IS NULL OR title_source IN ('user', 'agent', 'auto')),
	is_read                    INTEGER CHECK (is_read IN (0, 1)),
	working_directories        TEXT,
	launch_working_directories TEXT,
	changes_summary            TEXT,
	revision                   INTEGER NOT NULL CHECK (revision >= 0),
	PRIMARY KEY (session_uri, chat_uri)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS session_chat_state_storage ON session_chat_state(storage_resource) WHERE storage_resource IS NOT NULL;
CREATE TABLE IF NOT EXISTS chat_row_mirror (
	session_uri TEXT NOT NULL,
	chat_uri    TEXT NOT NULL,
	kind        TEXT NOT NULL CHECK (kind IN ('draft', 'localTurns')),
	base        TEXT NOT NULL,
	PRIMARY KEY (session_uri, chat_uri, kind)
) WITHOUT ROWID`;

/** Tables holding a session's state, each keyed by `session_uri`. */
export const SESSION_STATE_TABLES = [
	'session_state',
	'session_state_values',
	'session_folder_state',
	'session_chat_state',
	'chat_row_mirror',
] as const;

const importedMarkerPrefix = 'sessionStateImported:';
const legacyMirrorPrefix = 'sessionStateLegacyMirror:';
const launchDirsBackfilledPrefix = 'sessionStateLaunchDirsBackfilled:';
const rowsMovedPrefix = 'sessionStateRowsMoved:';

/** Prefixes of the per-session `metadata` rows of the session state, each followed by the session. */
export const SESSION_STATE_MARKER_PREFIXES = [importedMarkerPrefix, legacyMirrorPrefix, launchDirsBackfilledPrefix, rowsMovedPrefix] as const;

export type AgentHostSessionFolderStateKind = 'git' | 'github' | 'baseBranch';
export type AgentHostSessionChatRowMirrorKind = 'draft' | 'localTurns';
export type AgentHostSessionTitleSource = 'user' | 'agent' | 'auto';

export interface IAgentHostSessionStateHeader {
	readonly revision: number;
	readonly legacyMirroredRevision: number;
	readonly rowsRevision: number;
	readonly rowsMirroredRevision: number;
	readonly importVersion: number;
}

/** A session-level value. `undefined` means the value was deleted centrally. */
export interface IAgentHostSessionStateValue {
	readonly key: string;
	readonly value: string | undefined;
	readonly revision: number;
}

export interface IAgentHostSessionFolderState {
	/** `''` for the session folder, otherwise an opaque folder key or scope id. */
	readonly folderKey: string;
	readonly kind: AgentHostSessionFolderStateKind;
	readonly value: string | undefined;
	/** For `baseBranch`: the database older builds read it from; `undefined` means the session's. */
	readonly storageResource: string | undefined;
	readonly revision: number;
}

/** Central per-chat values; `undefined` means nothing is recorded. */
export interface IAgentHostSessionChatStateData {
	readonly chat: string;
	readonly isDefault: boolean;
	readonly storageResource: string | undefined;
	readonly title: string | undefined;
	readonly titleSource: AgentHostSessionTitleSource | undefined;
	readonly isRead: boolean | undefined;
	/** Directories shown for the chat; `undefined` shows the session's. */
	readonly workingDirectories: readonly string[] | undefined;
	/** Directories the provider launches the chat in when its own storage has none. */
	readonly launchWorkingDirectories: readonly string[] | undefined;
	readonly changes: string | undefined;
}

export interface IAgentHostSessionChatState extends IAgentHostSessionChatStateData {
	readonly revision: number;
}

/** Everything central about an imported session. */
export interface IAgentHostSessionState {
	readonly header: IAgentHostSessionStateHeader;
	readonly values: readonly IAgentHostSessionStateValue[];
	readonly folders: readonly IAgentHostSessionFolderState[];
	readonly chats: readonly IAgentHostSessionChatState[];
	/** Merge base of the old-format mirrors. Written and read only by the session state store. */
	readonly legacyMirrorBase: string | undefined;
	readonly launchDirsBackfilled: boolean;
	/** Progress of the one-time per-chat row copy, written by the session state store. */
	readonly rowsMoved: string | undefined;
}

export interface IAgentHostSessionStateValues {
	readonly imported: boolean;
	readonly values: ReadonlyMap<string, string>;
}

/** Per-chat fields to change: omitted fields stay, `null` clears. */
export interface IAgentHostSessionChatStateFields {
	readonly storageResource?: string | null;
	readonly title?: string | null;
	readonly titleSource?: AgentHostSessionTitleSource | null;
	readonly isRead?: boolean | null;
	readonly workingDirectories?: readonly string[] | null;
	readonly launchWorkingDirectories?: readonly string[] | null;
	readonly changes?: string | null;
}

export interface IAgentHostSessionChatStatePatch {
	readonly chat: string;
	readonly isDefault: boolean;
	readonly fields: IAgentHostSessionChatStateFields;
}

export interface IAgentHostSessionFolderStatePatch {
	readonly folderKey: string;
	readonly kind: AgentHostSessionFolderStateKind;
	readonly value: string | null;
	readonly storageResource: string | null;
}

export interface IAgentHostSessionStatePatch {
	/** `null` deletes the value centrally (and, once mirrored, in session.db). */
	readonly values: Readonly<Record<string, string | null>>;
	readonly folders: readonly IAgentHostSessionFolderStatePatch[];
	readonly chats: readonly IAgentHostSessionChatStatePatch[];
	/** Whether the patch changes a value the session catalog projects, so its payload must be rebuilt. */
	readonly markPayloadDirty: boolean;
}

export interface IAgentHostSessionStateImport {
	readonly importVersion: number;
	readonly importedAt: number;
	readonly values: Readonly<Record<string, string>>;
	readonly folders: readonly Omit<IAgentHostSessionFolderState, 'revision'>[];
	readonly chats: readonly IAgentHostSessionChatStateData[];
	readonly legacyMirrorBase: string;
	readonly launchDirsBackfilled: boolean;
}

export type AgentHostSessionStateImportResult = 'imported' | 'alreadyImported' | 'tombstoned';

export type AgentHostSessionStateWriteResult =
	| { readonly status: 'applied'; readonly revision: number }
	| { readonly status: 'conflict' | 'notImported' | 'tombstoned' };

export type AgentHostSessionStateUpdateResult = 'applied' | 'notImported' | 'tombstoned';

/** Central session state of {@link IAgentHostDatabase}. All URIs are sessions, chats or storage resources. */
export interface IAgentHostSessionStateDatabase {
	/** Reads an imported session's state in one read transaction; `undefined` until it is imported. */
	readSessionState(session: string): Promise<IAgentHostSessionState | undefined>;
	/** Point-reads `keys` of `sessions` without importing; non-imported sessions return no values. */
	readSessionStateValues(sessions: readonly string[], keys: readonly string[]): Promise<ReadonlyMap<string, IAgentHostSessionStateValues>>;
	/** Inserts a session's imported state and its imported marker in one transaction, unless already imported or tombstoned. */
	importSessionState(session: string, data: IAgentHostSessionStateImport): Promise<AgentHostSessionStateImportResult>;
	/** Applies `patch` when the session's revision still is `expectedRevision`, bumping it. */
	writeSessionState(session: string, expectedRevision: number, patch: IAgentHostSessionStatePatch): Promise<AgentHostSessionStateWriteResult>;
	/** Acknowledges the exact revision written to the old-format mirrors and stores the merge base. */
	markSessionStateLegacyMirrored(session: string, expectedRevision: number, payload: string): Promise<boolean>;
	/** Stores the merge base without acknowledging a revision. */
	recordSessionStateLegacyMirrorPayload(session: string, expectedRevision: number, payload: string): Promise<boolean>;
	/** Records a change of the per-chat rows mirrored into session.db; returns the new rows revision. */
	bumpSessionStateRowsRevision(session: string): Promise<AgentHostSessionStateWriteResult>;
	/** Acknowledges the exact rows revision written to the session.db row mirrors. */
	markSessionStateRowsMirrored(session: string, expectedRowsRevision: number): Promise<boolean>;
	markSessionStateLaunchDirsBackfilled(session: string): Promise<AgentHostSessionStateUpdateResult>;
	markSessionStateRowsMoved(session: string, progress: string): Promise<AgentHostSessionStateUpdateResult>;
	readChatRowMirror(session: string, chat: string, kind: AgentHostSessionChatRowMirrorKind): Promise<string | undefined>;
	/** Stores the merge base of a chat's mirrored rows; `undefined` removes it. */
	writeChatRowMirror(session: string, chat: string, kind: AgentHostSessionChatRowMirrorKind, base: string | undefined): Promise<AgentHostSessionStateUpdateResult>;
	/** Deletes a non-default chat's central rows (its chat state and row mirror bases) when the session's revision still is `expectedRevision`, bumping it. */
	deleteSessionChatState(session: string, chat: string, expectedRevision: number): Promise<AgentHostSessionStateWriteResult>;
	/**
	 * Counts the live references to `storage` other than from `excludingSession`:
	 * recorded chat storage of registered, non-tombstoned sessions and registered
	 * session identities equal to it.
	 */
	countStorageReferences(storage: string, excludingSession: string): Promise<number>;
	/** Sessions with session state that are tombstoned or absent from both registries. */
	listSessionStateGarbage(limit: number): Promise<readonly string[]>;
	/** Deletes the session state of `session` if it still is garbage. */
	deleteSessionStateGarbage(session: string): Promise<boolean>;
}

type SqlRow = Record<string, unknown>;

/** Statements on the agent-host.db connection, inside the current transaction. */
export interface ISessionStateSqlConnection {
	run(sql: string, parameters: readonly unknown[]): Promise<number>;
	get(sql: string, parameters: readonly unknown[]): Promise<SqlRow | undefined>;
	all(sql: string, parameters: readonly unknown[]): Promise<SqlRow[]>;
	/** Whether the session is tombstoned. */
	isTombstoned(session: string): Promise<boolean>;
	/** Whether the session is registered in either registry. */
	isRegistered(session: string): Promise<boolean>;
	/** Marks the session's catalog payload dirty when it has one. */
	markPayloadDirty(session: string): Promise<void>;
}

/** Runs sequenced statements on the agent-host.db connection. */
export interface ISessionStateSqlHost {
	/** Runs `operation` in a `BEGIN IMMEDIATE` transaction and rolls back on failure. */
	write<T>(label: string, operation: (connection: ISessionStateSqlConnection) => Promise<T>): Promise<T>;
	/** Runs `operation` in a read transaction. */
	read<T>(operation: (connection: ISessionStateSqlConnection) => Promise<T>): Promise<T>;
}

/** Deletes every session state row and marker of `session`. Runs inside the caller's transaction. */
export async function deleteSessionStateRows(connection: Pick<ISessionStateSqlConnection, 'run'>, session: string): Promise<void> {
	for (const table of SESSION_STATE_TABLES) {
		await connection.run(`DELETE FROM ${table} WHERE session_uri = ?`, [session]);
	}
	for (const prefix of SESSION_STATE_MARKER_PREFIXES) {
		await connection.run('DELETE FROM metadata WHERE key = ?', [prefix + session]);
	}
}

function nextRevision(value: number): number {
	const next = value + 1;
	if (!Number.isSafeInteger(next)) {
		throw new Error('Session state revision overflow');
	}
	return next;
}

function validateRevision(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${name} must be a non-negative safe integer`);
	}
}

function encodeDirectories(value: readonly string[] | null | undefined): string | null {
	return value === undefined || value === null ? null : JSON.stringify(value);
}

function decodeDirectories(value: unknown): readonly string[] | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}
	const parsed: unknown = JSON.parse(value as string);
	if (!Array.isArray(parsed) || !parsed.every(entry => typeof entry === 'string')) {
		throw new Error('Invalid stored working directories');
	}
	return parsed;
}

function optionalString(value: unknown): string | undefined {
	return value === null || value === undefined ? undefined : value as string;
}

function toTitleSource(value: unknown): AgentHostSessionTitleSource | undefined {
	return value === 'user' || value === 'agent' || value === 'auto' ? value : undefined;
}

function toChatState(row: SqlRow): IAgentHostSessionChatState {
	return {
		chat: row.chat_uri as string,
		isDefault: row.is_default === 1,
		storageResource: optionalString(row.storage_resource),
		title: optionalString(row.title),
		titleSource: toTitleSource(row.title_source),
		isRead: row.is_read === null ? undefined : row.is_read === 1,
		workingDirectories: decodeDirectories(row.working_directories),
		launchWorkingDirectories: decodeDirectories(row.launch_working_directories),
		changes: optionalString(row.changes_summary),
		revision: row.revision as number,
	};
}

const chatColumns: Readonly<Record<keyof IAgentHostSessionChatStateFields, string>> = {
	storageResource: 'storage_resource',
	title: 'title',
	titleSource: 'title_source',
	isRead: 'is_read',
	workingDirectories: 'working_directories',
	launchWorkingDirectories: 'launch_working_directories',
	changes: 'changes_summary',
};

function chatColumnValue(field: keyof IAgentHostSessionChatStateFields, fields: IAgentHostSessionChatStateFields): unknown {
	switch (field) {
		case 'isRead': return fields.isRead === undefined || fields.isRead === null ? null : fields.isRead ? 1 : 0;
		case 'workingDirectories': return encodeDirectories(fields.workingDirectories);
		case 'launchWorkingDirectories': return encodeDirectories(fields.launchWorkingDirectories);
		default: return fields[field] ?? null;
	}
}

const chatInsertSql = `INSERT INTO session_chat_state (
	session_uri, chat_uri, is_default, storage_resource, title, title_source, is_read, working_directories, launch_working_directories, changes_summary, revision
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** {@link IAgentHostSessionStateDatabase} over the agent-host.db connection. */
export class AgentHostSessionStateTables implements IAgentHostSessionStateDatabase {

	constructor(private readonly _host: ISessionStateSqlHost) { }

	readSessionState(session: string): Promise<IAgentHostSessionState | undefined> {
		return this._host.read(async connection => {
			const marker = await connection.get('SELECT 1 AS present FROM metadata WHERE key = ?', [importedMarkerPrefix + session]);
			const header = await connection.get('SELECT * FROM session_state WHERE session_uri = ?', [session]);
			if (!marker || !header) {
				return undefined;
			}
			const [values, folders, chats, markers] = await Promise.all([
				connection.all('SELECT key, value, revision FROM session_state_values WHERE session_uri = ? ORDER BY key', [session]),
				connection.all('SELECT folder_key, kind, value, storage_resource, revision FROM session_folder_state WHERE session_uri = ? ORDER BY folder_key, kind', [session]),
				connection.all('SELECT * FROM session_chat_state WHERE session_uri = ? ORDER BY chat_uri', [session]),
				connection.all('SELECT key, value FROM metadata WHERE key IN (?, ?, ?)', [legacyMirrorPrefix + session, launchDirsBackfilledPrefix + session, rowsMovedPrefix + session]),
			]);
			const marked = new Map(markers.map(row => [row.key as string, row.value as string]));
			return {
				header: {
					revision: header.revision as number,
					legacyMirroredRevision: header.legacy_mirrored_revision as number,
					rowsRevision: header.rows_revision as number,
					rowsMirroredRevision: header.rows_mirrored_revision as number,
					importVersion: header.import_version as number,
				},
				values: values.map(row => ({ key: row.key as string, value: optionalString(row.value), revision: row.revision as number })),
				folders: folders.map(row => ({
					folderKey: row.folder_key as string,
					kind: row.kind as AgentHostSessionFolderStateKind,
					value: optionalString(row.value),
					storageResource: optionalString(row.storage_resource),
					revision: row.revision as number,
				})),
				chats: chats.map(toChatState),
				legacyMirrorBase: marked.get(legacyMirrorPrefix + session),
				launchDirsBackfilled: marked.has(launchDirsBackfilledPrefix + session),
				rowsMoved: marked.get(rowsMovedPrefix + session),
			};
		});
	}

	readSessionStateValues(sessions: readonly string[], keys: readonly string[]): Promise<ReadonlyMap<string, IAgentHostSessionStateValues>> {
		return this._host.read(async connection => {
			const unique = [...new Set(sessions)];
			// Two statements for any number of sessions: lifecycle sweeps read many unimported sessions.
			const imported = new Set((await connection.all(`SELECT substr(key, ${importedMarkerPrefix.length + 1}) AS session_uri FROM metadata
				WHERE key IN (SELECT ? || value FROM json_each(?))`, [importedMarkerPrefix, JSON.stringify(unique)])).map(row => row.session_uri as string));
			const values = new Map<string, Map<string, string>>();
			if (keys.length > 0 && imported.size > 0) {
				for (const row of await connection.all(`SELECT session_uri, key, value FROM session_state_values
					WHERE session_uri IN (SELECT value FROM json_each(?1)) AND key IN (SELECT value FROM json_each(?2)) AND value IS NOT NULL`, [JSON.stringify([...imported]), JSON.stringify(keys)])) {
					const session = row.session_uri as string;
					let sessionValues = values.get(session);
					if (!sessionValues) {
						sessionValues = new Map();
						values.set(session, sessionValues);
					}
					sessionValues.set(row.key as string, row.value as string);
				}
			}
			return new Map(unique.map(session => [session, { imported: imported.has(session), values: values.get(session) ?? new Map<string, string>() }]));
		});
	}

	importSessionState(session: string, data: IAgentHostSessionStateImport): Promise<AgentHostSessionStateImportResult> {
		if (!Number.isSafeInteger(data.importVersion) || data.importVersion < 1) {
			throw new Error('Session state import version must be a positive safe integer');
		}
		return this._host.write(`Failed to import the session state of ${session}`, async connection => {
			if (await connection.isTombstoned(session)) {
				return 'tombstoned';
			}
			if (await connection.get('SELECT 1 AS present FROM metadata WHERE key = ?', [importedMarkerPrefix + session])) {
				return 'alreadyImported';
			}
			// A crashed or deleted import may have left rows without its marker.
			await deleteSessionStateRows(connection, session);
			const revision = 1;
			await connection.run(`INSERT INTO session_state (session_uri, revision, legacy_mirrored_revision, import_version)
				VALUES (?, ?, ?, ?)`, [session, revision, revision, data.importVersion]);
			for (const [key, value] of Object.entries(data.values)) {
				await connection.run('INSERT INTO session_state_values (session_uri, key, value, revision) VALUES (?, ?, ?, ?)', [session, key, value, revision]);
			}
			for (const folder of data.folders) {
				await connection.run(`INSERT INTO session_folder_state (session_uri, folder_key, kind, value, storage_resource, revision)
					VALUES (?, ?, ?, ?, ?, ?)`, [session, folder.folderKey, folder.kind, folder.value ?? null, folder.storageResource ?? null, revision]);
			}
			for (const chat of data.chats) {
				await connection.run(chatInsertSql, [
					session, chat.chat, chat.isDefault ? 1 : 0, chat.storageResource ?? null, chat.title ?? null, chat.titleSource ?? null,
					chat.isRead === undefined ? null : chat.isRead ? 1 : 0, encodeDirectories(chat.workingDirectories), encodeDirectories(chat.launchWorkingDirectories),
					chat.changes ?? null, revision,
				]);
			}
			await this._setMarker(connection, legacyMirrorPrefix + session, data.legacyMirrorBase);
			if (data.launchDirsBackfilled) {
				await this._setMarker(connection, launchDirsBackfilledPrefix + session, '1');
			}
			await this._setMarker(connection, importedMarkerPrefix + session, JSON.stringify({ v: data.importVersion, at: data.importedAt }));
			return 'imported';
		});
	}

	writeSessionState(session: string, expectedRevision: number, patch: IAgentHostSessionStatePatch): Promise<AgentHostSessionStateWriteResult> {
		validateRevision(expectedRevision, 'Expected session state revision');
		return this._host.write(`Failed to write the session state of ${session}`, async connection => {
			const header = await this._header(connection, session);
			if (header.status !== 'imported') {
				return { status: header.status };
			}
			if (header.row.revision !== expectedRevision) {
				return { status: 'conflict' };
			}
			const revision = nextRevision(expectedRevision);
			await connection.run('UPDATE session_state SET revision = ? WHERE session_uri = ?', [revision, session]);
			for (const [key, value] of Object.entries(patch.values)) {
				await connection.run(`INSERT INTO session_state_values (session_uri, key, value, revision) VALUES (?, ?, ?, ?)
					ON CONFLICT(session_uri, key) DO UPDATE SET value = excluded.value, revision = excluded.revision`, [session, key, value, revision]);
			}
			for (const folder of patch.folders) {
				await connection.run(`INSERT INTO session_folder_state (session_uri, folder_key, kind, value, storage_resource, revision) VALUES (?, ?, ?, ?, ?, ?)
					ON CONFLICT(session_uri, folder_key, kind) DO UPDATE SET value = excluded.value, storage_resource = excluded.storage_resource, revision = excluded.revision`,
					[session, folder.folderKey, folder.kind, folder.value, folder.storageResource, revision]);
			}
			for (const chat of patch.chats) {
				await connection.run(`${chatInsertSql}
					ON CONFLICT(session_uri, chat_uri) DO UPDATE SET is_default = excluded.is_default, revision = excluded.revision`, [
					session, chat.chat, chat.isDefault ? 1 : 0, null, null, null, null, null, null, null, revision,
				]);
				const fields = (Object.keys(chatColumns) as (keyof IAgentHostSessionChatStateFields)[]).filter(field => chat.fields[field] !== undefined);
				if (fields.length > 0) {
					await connection.run(`UPDATE session_chat_state SET ${fields.map(field => `${chatColumns[field]} = ?`).join(', ')}
						WHERE session_uri = ? AND chat_uri = ?`, [...fields.map(field => chatColumnValue(field, chat.fields)), session, chat.chat]);
				}
			}
			if (patch.markPayloadDirty) {
				await connection.markPayloadDirty(session);
			}
			return { status: 'applied', revision };
		});
	}

	markSessionStateLegacyMirrored(session: string, expectedRevision: number, payload: string): Promise<boolean> {
		validateRevision(expectedRevision, 'Session state revision');
		return this._host.write(`Failed to mark the session state mirrored for ${session}`, async connection => {
			await connection.run(`UPDATE session_state SET legacy_mirrored_revision = ?
				WHERE session_uri = ? AND revision = ? AND legacy_mirrored_revision < ?`, [expectedRevision, session, expectedRevision, expectedRevision]);
			const row = await connection.get('SELECT revision, legacy_mirrored_revision FROM session_state WHERE session_uri = ?', [session]);
			if (!row) {
				return false;
			}
			// The payload is what the mirrors now hold, even when a newer revision is still unflushed;
			// keeping an older base would make the next reconciliation mistake this write for an old-build edit.
			await this._setMarker(connection, legacyMirrorPrefix + session, payload);
			return row.revision === expectedRevision && row.legacy_mirrored_revision === expectedRevision;
		});
	}

	recordSessionStateLegacyMirrorPayload(session: string, expectedRevision: number, payload: string): Promise<boolean> {
		validateRevision(expectedRevision, 'Session state revision');
		return this._host.write(`Failed to record the session state mirror base for ${session}`, async connection => {
			const row = await connection.get('SELECT revision FROM session_state WHERE session_uri = ?', [session]);
			if (row?.revision !== expectedRevision) {
				return false;
			}
			await this._setMarker(connection, legacyMirrorPrefix + session, payload);
			return true;
		});
	}

	bumpSessionStateRowsRevision(session: string): Promise<AgentHostSessionStateWriteResult> {
		return this._host.write(`Failed to bump the row revision of ${session}`, async connection => {
			const header = await this._header(connection, session);
			if (header.status !== 'imported') {
				return { status: header.status };
			}
			const revision = nextRevision(header.row.rowsRevision);
			await connection.run('UPDATE session_state SET rows_revision = ? WHERE session_uri = ?', [revision, session]);
			return { status: 'applied', revision };
		});
	}

	markSessionStateRowsMirrored(session: string, expectedRowsRevision: number): Promise<boolean> {
		validateRevision(expectedRowsRevision, 'Session state rows revision');
		return this._host.write(`Failed to mark the rows mirrored for ${session}`, async connection => {
			await connection.run(`UPDATE session_state SET rows_mirrored_revision = ?
				WHERE session_uri = ? AND rows_revision = ? AND rows_mirrored_revision < ?`, [expectedRowsRevision, session, expectedRowsRevision, expectedRowsRevision]);
			const row = await connection.get('SELECT rows_revision, rows_mirrored_revision FROM session_state WHERE session_uri = ?', [session]);
			return row?.rows_revision === expectedRowsRevision && row.rows_mirrored_revision === expectedRowsRevision;
		});
	}

	markSessionStateLaunchDirsBackfilled(session: string): Promise<AgentHostSessionStateUpdateResult> {
		return this._updateImported(session, 'mark launch directories backfilled', connection => this._setMarker(connection, launchDirsBackfilledPrefix + session, '1'));
	}

	markSessionStateRowsMoved(session: string, progress: string): Promise<AgentHostSessionStateUpdateResult> {
		return this._updateImported(session, 'mark rows moved', connection => this._setMarker(connection, rowsMovedPrefix + session, progress));
	}

	deleteSessionChatState(session: string, chat: string, expectedRevision: number): Promise<AgentHostSessionStateWriteResult> {
		validateRevision(expectedRevision, 'Expected session state revision');
		return this._host.write(`Failed to delete the chat state of ${chat}`, async connection => {
			const header = await this._header(connection, session);
			if (header.status !== 'imported') {
				return { status: header.status };
			}
			if (header.row.revision !== expectedRevision) {
				return { status: 'conflict' };
			}
			if (await connection.get('SELECT 1 AS present FROM session_chat_state WHERE session_uri = ? AND chat_uri = ? AND is_default = 1', [session, chat])) {
				throw new Error(`Cannot delete the default chat state of ${session}`);
			}
			const revision = nextRevision(expectedRevision);
			await connection.run('UPDATE session_state SET revision = ? WHERE session_uri = ?', [revision, session]);
			await connection.run('DELETE FROM session_chat_state WHERE session_uri = ? AND chat_uri = ?', [session, chat]);
			await connection.run('DELETE FROM chat_row_mirror WHERE session_uri = ? AND chat_uri = ?', [session, chat]);
			return { status: 'applied', revision };
		});
	}

	readChatRowMirror(session: string, chat: string, kind: AgentHostSessionChatRowMirrorKind): Promise<string | undefined> {
		return this._host.read(async connection => optionalString((await connection.get(`SELECT base FROM chat_row_mirror
			WHERE session_uri = ? AND chat_uri = ? AND kind = ?`, [session, chat, kind]))?.base));
	}

	writeChatRowMirror(session: string, chat: string, kind: AgentHostSessionChatRowMirrorKind, base: string | undefined): Promise<AgentHostSessionStateUpdateResult> {
		return this._updateImported(session, 'record the row mirror base', async connection => {
			if (base === undefined) {
				await connection.run('DELETE FROM chat_row_mirror WHERE session_uri = ? AND chat_uri = ? AND kind = ?', [session, chat, kind]);
			} else {
				await connection.run(`INSERT INTO chat_row_mirror (session_uri, chat_uri, kind, base) VALUES (?, ?, ?, ?)
					ON CONFLICT(session_uri, chat_uri, kind) DO UPDATE SET base = excluded.base`, [session, chat, kind, base]);
			}
		});
	}

	countStorageReferences(storage: string, excludingSession: string): Promise<number> {
		// `column` must be qualified: inside the registry subqueries an unqualified `session_uri` binds to the registry itself.
		const live = (column: string) => `NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'sessionTombstone:' || ${column} AND value = 'true')
			AND (EXISTS (SELECT 1 FROM sessions WHERE session_uri = ${column}) OR EXISTS (SELECT 1 FROM sessions_v2 WHERE session_uri = ${column}))`;
		return this._host.read(async connection => {
			const row = await connection.get(`SELECT
				(SELECT COUNT(*) FROM chats_v2 AS chat WHERE chat.storage_resource = ?1 AND chat.tombstoned = 0 AND chat.owner_session_uri <> ?2 AND ${live('chat.owner_session_uri')})
				+ (SELECT COUNT(*) FROM session_chat_state AS chat_state WHERE chat_state.storage_resource = ?1 AND chat_state.session_uri <> ?2 AND ${live('chat_state.session_uri')})
				+ (SELECT COUNT(*) FROM (SELECT session_uri FROM sessions WHERE session_uri = ?1 UNION SELECT session_uri FROM sessions_v2 WHERE session_uri = ?1) AS registered
					WHERE registered.session_uri <> ?2 AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'sessionTombstone:' || registered.session_uri AND value = 'true'))
				AS count`, [storage, excludingSession]);
			return row?.count as number;
		});
	}

	listSessionStateGarbage(limit: number): Promise<readonly string[]> {
		if (!Number.isSafeInteger(limit) || limit <= 0) {
			throw new Error('Session state garbage limit must be a positive safe integer');
		}
		return this._host.read(async connection => (await connection.all(`SELECT session_uri FROM session_state AS state
			WHERE EXISTS (SELECT 1 FROM metadata WHERE key = 'sessionTombstone:' || state.session_uri AND value = 'true')
				OR (NOT EXISTS (SELECT 1 FROM sessions WHERE session_uri = state.session_uri)
					AND NOT EXISTS (SELECT 1 FROM sessions_v2 WHERE session_uri = state.session_uri))
			ORDER BY session_uri LIMIT ?`, [limit])).map(row => row.session_uri as string));
	}

	deleteSessionStateGarbage(session: string): Promise<boolean> {
		return this._host.write(`Failed to delete the session state of ${session}`, async connection => {
			if (!await connection.isTombstoned(session) && await connection.isRegistered(session)) {
				return false;
			}
			await deleteSessionStateRows(connection, session);
			return true;
		});
	}

	private async _header(connection: ISessionStateSqlConnection, session: string): Promise<{ readonly status: 'imported'; readonly row: { readonly revision: number; readonly rowsRevision: number } } | { readonly status: 'notImported' | 'tombstoned' }> {
		if (await connection.isTombstoned(session)) {
			return { status: 'tombstoned' };
		}
		const row = await connection.get('SELECT revision, rows_revision FROM session_state WHERE session_uri = ?', [session]);
		return row ? { status: 'imported', row: { revision: row.revision as number, rowsRevision: row.rows_revision as number } } : { status: 'notImported' };
	}

	private _updateImported(session: string, action: string, operation: (connection: ISessionStateSqlConnection) => Promise<void>): Promise<AgentHostSessionStateUpdateResult> {
		return this._host.write(`Failed to ${action} for ${session}`, async connection => {
			const header = await this._header(connection, session);
			if (header.status !== 'imported') {
				return header.status;
			}
			await operation(connection);
			return 'applied';
		});
	}

	private async _setMarker(connection: ISessionStateSqlConnection, key: string, value: string): Promise<void> {
		await connection.run('INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
	}
}
