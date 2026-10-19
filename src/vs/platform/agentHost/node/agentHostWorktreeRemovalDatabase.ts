/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AH_META_IS_ARCHIVED_DB_KEY } from '../common/state/sessionState.js';
import type { ISessionStateSqlConnection, ISessionStateSqlHost } from './agentHostSessionStateDatabase.js';
import { SESSION_WORKING_DIRECTORIES_KEY } from './shared/persistSessionMetadata.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY } from './shared/sessionAdditionalWorktrees.js';

/**
 * agent-host.db table of worktree folders whose removal was requested by an
 * archive or a delete. Archive and delete only record the intent here; the
 * worktree clean-up service removes the folders in the background.
 */

/** Migration version of the pending worktree removal table. */
export const WORKTREE_REMOVAL_MIGRATION_VERSION = 18;

export const WORKTREE_REMOVAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pending_worktree_removals (
	kind            TEXT NOT NULL CHECK (kind IN ('session', 'detached', 'coOwned')),
	owner           TEXT NOT NULL,
	owner_session   TEXT,
	worktree_path   TEXT NOT NULL,
	repository_root TEXT NOT NULL,
	branch          TEXT,
	mode            TEXT NOT NULL CHECK (mode IN ('commit', 'synced', 'delete')),
	owner_deleted   INTEGER NOT NULL DEFAULT 0 CHECK (owner_deleted IN (0, 1)),
	attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
	requested_at    INTEGER NOT NULL,
	next_attempt_at INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (kind, owner)
) WITHOUT ROWID`;

/**
 * Migration version of the worktree co-owner table, which also rebuilds
 * `pending_worktree_removals` to accept the `coOwned` kind. Older builds never
 * read either table. Version 20 is taken by this migration (Move Chats, Block
 * 5): a migration added in parallel must take the next free version, and the
 * open-time repair re-applies this one where another numbering reached 20
 * without it.
 */
export const WORKTREE_CO_OWNER_MIGRATION_VERSION = 20;

/**
 * Sessions sharing a worktree since a chat moved (Move Chats, Block 5): every co-owner of a
 * shared worktree has a row, its original owner included, which keeps its own record
 * (`copilot.worktree.*` or an additional worktree handle) unchanged. Rows are written only in
 * the transactions of a move, promotion or session move and deleted with their session's
 * tombstone; an owner is only ever the session a move recorded, never derived from a URI or path.
 */
export const WORKTREE_CO_OWNER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS worktree_co_owners (
	worktree_path   TEXT NOT NULL,
	session_uri     TEXT NOT NULL,
	repository_root TEXT NOT NULL,
	branch          TEXT NOT NULL,
	PRIMARY KEY (worktree_path, session_uri)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS worktree_co_owners_session ON worktree_co_owners(session_uri)`;

/**
 * Migration {@link WORKTREE_CO_OWNER_MIGRATION_VERSION}: the co-owner table, and the removal table rebuilt for its wider
 * `kind` check. Created first when missing (a profile shared with a pre-release build that skipped it), so the rebuild
 * always has a source. Also repairs a profile at 20 or later whose removal table still has the old check.
 */
export const WORKTREE_CO_OWNER_MIGRATION_SQL = `${WORKTREE_CO_OWNER_SCHEMA_SQL};
${WORKTREE_REMOVAL_SCHEMA_SQL};
DROP TABLE IF EXISTS pending_worktree_removals_rebuilt;
${WORKTREE_REMOVAL_SCHEMA_SQL.replace('pending_worktree_removals', 'pending_worktree_removals_rebuilt')};
INSERT INTO pending_worktree_removals_rebuilt SELECT kind, owner, owner_session, worktree_path, repository_root, branch, mode, owner_deleted, attempts, requested_at, next_attempt_at FROM pending_worktree_removals;
DROP TABLE pending_worktree_removals;
ALTER TABLE pending_worktree_removals_rebuilt RENAME TO pending_worktree_removals`;

/**
 * How a pending worktree is removed:
 * - `commit`: a manual archive. Commits uncommitted changes, then removes the folder.
 * - `synced`: an automatic archive or lifecycle deletion. Removes the folder only when its branch is synced with its upstream.
 * - `delete`: a manual deletion. Force-removes the folder.
 *
 * The branch is always kept.
 */
export type WorktreeRemovalMode = 'commit' | 'synced' | 'delete';

/**
 * `session`: the worktree recorded for a session; the owner is the session URI.
 * `detached`: a detached (Dev Container) worktree; the owner is its handle, and its record is deleted with a `delete` removal.
 * `coOwned`: a worktree a session co-owns ({@link IWorktreeCoOwner}); the owner is opaque (see {@link coOwnedWorktreeRemovalOwner}),
 * the owner session is the co-owner, and its lock is the worktree folder's.
 */
export type WorktreeRemovalKind = 'session' | 'detached' | 'coOwned';

/** The opaque owner of a co-owner's removal of a worktree folder. */
export function coOwnedWorktreeRemovalOwner(session: string, worktreePath: string): string {
	return `${session}|${worktreePath}`;
}

/** A worktree folder a move shares, as its original owner records it (URI strings). */
export interface IWorktreeCoOwnedFolder {
	readonly worktreePath: string;
	readonly repositoryRoot: string;
	/**
	 * The worktree's branch when the move shared it. A snapshot is enough: the host never renames a branch it created,
	 * and the original owner's record holds the same creation-time name. A branch removed outside the host keeps the
	 * folder intact (its removal is skipped and retried), as for a worktree that was never shared.
	 */
	readonly branch: string;
}

/** A session sharing a worktree folder since a chat moved; see {@link WORKTREE_CO_OWNER_SCHEMA_SQL}. */
export interface IWorktreeCoOwner extends IWorktreeCoOwnedFolder {
	readonly session: string;
}

/** A co-owner row and whether it is live: its session is registered, not deleted, and still has a folder at or inside the worktree. */
export interface IWorktreeCoOwnerState extends IWorktreeCoOwner {
	readonly live: boolean;
}

export interface IWorktreeRemovalRequest {
	readonly kind: WorktreeRemovalKind;
	readonly owner: string;
	/** The session that uses the worktree, which never keeps it in use. */
	readonly ownerSession: string | undefined;
	/** The worktree folder, as a URI string. */
	readonly worktreePath: string;
	/** The repository the worktree belongs to, as a URI string. */
	readonly repositoryRoot: string;
	readonly branch: string | undefined;
	readonly mode: WorktreeRemovalMode;
	/**
	 * The owner was deleted: no unarchive can cancel the removal, and a
	 * detached worktree's record is deleted once its folder is removed.
	 * Otherwise the request is an archive, which holds only while its owner
	 * stays archived.
	 */
	readonly ownerDeleted: boolean;
	readonly requestedAt: number;
}

export interface IPendingWorktreeRemoval extends IWorktreeRemovalRequest {
	readonly attempts: number;
	/** Earliest time of the next attempt after a failure; `0` when due. */
	readonly nextAttemptAt: number;
}

export interface IAgentHostWorktreeRemovalDatabase {
	/**
	 * Records a removal, replacing the owner's previous one and resetting its
	 * attempts. An archive never replaces a request of a deleted owner.
	 */
	upsertPendingWorktreeRemoval(request: IWorktreeRemovalRequest): Promise<void>;
	/** Drops the owner's pending removal; with `expected`, only when it is still that request. */
	deletePendingWorktreeRemoval(kind: WorktreeRemovalKind, owner: string, expected?: Pick<IWorktreeRemovalRequest, 'mode' | 'requestedAt'>): Promise<void>;
	readPendingWorktreeRemoval(kind: WorktreeRemovalKind, owner: string): Promise<IPendingWorktreeRemoval | undefined>;
	listPendingWorktreeRemovals(): Promise<readonly IPendingWorktreeRemoval[]>;
	/** Counts a failed attempt of the request, when it is still pending. Returns the attempts recorded. */
	recordPendingWorktreeRemovalFailure(request: Pick<IWorktreeRemovalRequest, 'kind' | 'owner' | 'mode' | 'requestedAt'>, nextAttemptAt: number): Promise<number | undefined>;
	/**
	 * Whether a non-archived, non-deleted session or chat other than those of
	 * `excludedSession` has a working directory at or inside `worktreePath`,
	 * from the central working directories alone. Opens no session database.
	 */
	isWorktreeInUse(worktreePath: string, excludedSession: string | undefined): Promise<boolean>;
	/**
	 * Whether the session is archived, from its central session state when it
	 * records the flag, else from its session list entry; `undefined` when
	 * neither knows the session. Opens no session database.
	 */
	readSessionArchived(session: string): Promise<boolean | undefined>;
	/** The worktrees `session` co-owns. Read on moves, archive, unarchive and deletion only. */
	listWorktreeCoOwnersOfSession(session: string): Promise<readonly IWorktreeCoOwner[]>;
	/** The co-owners of a worktree folder, and whether each is live; read without changing them. */
	readWorktreeCoOwners(worktreePath: string): Promise<readonly IWorktreeCoOwnerState[]>;
	/**
	 * Deletes the stale co-owner rows of a worktree folder (a session deleted or no longer working there), except
	 * that one row always stays while any exists: the marker that the folder was ever shared, which forces commit
	 * mode until the folder is removed. Returns the rows left. The caller holds the worktree folder's lock.
	 */
	pruneWorktreeCoOwners(worktreePath: string): Promise<readonly IWorktreeCoOwnerState[]>;
	/**
	 * The live sessions whose central `agentHost.additionalWorktrees` lists `handle`: the owner a crash between a
	 * committed handle transfer and its record's owner update left unrecorded. Startup repair only.
	 */
	findAdditionalWorktreeOwners(handle: string): Promise<readonly string[]>;
	/** Whether `session` is registered and not deleted (tombstoned), by its recorded state. */
	isSessionLive(session: string): Promise<boolean>;
	/**
	 * Deletes the co-owner rows of sessions that are deleted (not registered, or tombstoned; also by an older build),
	 * keeping one row of a folder no other row is left for: the marker that it was ever shared. Clean-up passes only.
	 */
	pruneDeletedWorktreeCoOwners(): Promise<void>;
	/**
	 * Deletes every co-owner row of a removed worktree folder that isn't live (its session deleted, or no longer
	 * working there), the marker included: a co-owner that still works there, archived, keeps its row to recreate it
	 * from. The caller holds the folder's lock.
	 */
	clearStaleWorktreeCoOwners(worktreePath: string): Promise<void>;
}

const columns = 'kind, owner, owner_session, worktree_path, repository_root, branch, mode, owner_deleted, attempts, requested_at, next_attempt_at';

/** Writes removal requests inside the caller's transaction. */
export async function insertPendingWorktreeRemovals(connection: Pick<ISessionStateSqlConnection, 'run'>, requests: readonly IWorktreeRemovalRequest[]): Promise<void> {
	for (const request of requests) {
		await connection.run(`INSERT INTO pending_worktree_removals (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0)
			ON CONFLICT(kind, owner) DO UPDATE SET
				owner_session = excluded.owner_session, worktree_path = excluded.worktree_path, repository_root = excluded.repository_root,
				branch = excluded.branch, mode = excluded.mode, owner_deleted = excluded.owner_deleted, attempts = 0,
				requested_at = excluded.requested_at, next_attempt_at = 0
			WHERE excluded.owner_deleted = 1 OR pending_worktree_removals.owner_deleted = 0`,
			[request.kind, request.owner, request.ownerSession ?? null, request.worktreePath, request.repositoryRoot, request.branch ?? null, request.mode, request.ownerDeleted ? 1 : 0, request.requestedAt]);
	}
}

function toRemoval(row: Record<string, unknown>): IPendingWorktreeRemoval {
	return {
		kind: row.kind as WorktreeRemovalKind,
		owner: row.owner as string,
		ownerSession: row.owner_session === null ? undefined : row.owner_session as string,
		worktreePath: row.worktree_path as string,
		repositoryRoot: row.repository_root as string,
		branch: row.branch === null ? undefined : row.branch as string,
		mode: row.mode as WorktreeRemovalMode,
		ownerDeleted: row.owner_deleted === 1,
		attempts: row.attempts as number,
		requestedAt: row.requested_at as number,
		nextAttemptAt: row.next_attempt_at as number,
	};
}

/**
 * Every central working directory of a session or chat that keeps a worktree
 * in use: the session's folders from its session list entry and from its
 * session state, a normalized chat's folders and a legacy-catalog chat's
 * folders, skipping archived and deleted chats. A chat without folders of its
 * own uses its session's. A peer chat's backing provider session is not a
 * session (its chat counts instead). Archived sessions are filtered by the caller.
 */
const centralWorkingDirectoriesSql = `
	SELECT p.session_uri AS session_uri, j.value AS directory
		FROM sessions_v2 p, json_each(p.payload, '$.data.workingDirectories') j
		WHERE p.is_chat_backing = 0 AND instr(lower(p.payload), lower(?1)) > 0 AND json_valid(p.payload)
	UNION ALL
	SELECT v.session_uri, j.value
		FROM session_state_values v, json_each(v.value) j
		WHERE v.key = '${SESSION_WORKING_DIRECTORIES_KEY}' AND instr(lower(v.value), lower(?1)) > 0 AND json_valid(v.value)
	UNION ALL
	SELECT c.owner_session_uri, j.value
		FROM chats_v2 c, json_each(c.working_directories) j
		WHERE c.tombstoned = 0 AND c.archived = 0 AND instr(lower(c.working_directories), lower(?1)) > 0 AND json_valid(c.working_directories)
	UNION ALL
	SELECT s.session_uri, j.value
		FROM session_chat_state s, json_each(s.working_directories) j
		WHERE instr(lower(s.working_directories), lower(?1)) > 0 AND json_valid(s.working_directories)
			AND NOT EXISTS (SELECT 1 FROM session_chats l WHERE l.session_uri = s.session_uri AND l.chat_uri = s.chat_uri AND l.archived = 1)
			AND NOT EXISTS (SELECT 1 FROM chats_v2 n WHERE n.chat_uri = s.chat_uri AND (n.archived = 1 OR n.tombstoned = 1))
	UNION ALL
	SELECT s.session_uri, j.value
		FROM session_chat_state s, json_each(s.launch_working_directories) j
		WHERE instr(lower(s.launch_working_directories), lower(?1)) > 0 AND json_valid(s.launch_working_directories)
			AND NOT EXISTS (SELECT 1 FROM session_chats l WHERE l.session_uri = s.session_uri AND l.chat_uri = s.chat_uri AND l.archived = 1)
			AND NOT EXISTS (SELECT 1 FROM chats_v2 n WHERE n.chat_uri = s.chat_uri AND (n.archived = 1 OR n.tombstoned = 1))`;

/**
 * Whether the session `uri` is archived: its central session state wins when
 * it records the flag, since a session list entry is rebuilt asynchronously
 * after it changes; NULL when neither knows the session.
 */
function sessionArchivedSql(uri: string): string {
	return `COALESCE(
		(SELECT COALESCE(a.value, '') = 'true' FROM session_state_values a WHERE a.session_uri = ${uri} AND a.key = '${AH_META_IS_ARCHIVED_DB_KEY}'),
		(SELECT json_extract(l.payload, '$.data.isArchived') = 1 FROM sessions_v2 l WHERE l.session_uri = ${uri} AND json_valid(l.payload)))`;
}

/**
 * `?1` is the worktree folder, `?2` the excluded session. Paths compare
 * case-insensitively, both sides folded by SQLite: a false match only keeps
 * a folder longer. A column is parsed only when it contains the folder.
 */
const worktreeInUseSql = `
	WITH directories(session_uri, directory) AS (${centralWorkingDirectoriesSql})
	SELECT 1 AS present FROM directories d
	WHERE d.session_uri <> ?2
		AND (lower(d.directory) = lower(?1) OR substr(lower(d.directory), 1, length(?1) + 1) = lower(?1) || '/')
		AND NOT COALESCE(${sessionArchivedSql('d.session_uri')}, 0)
	UNION ALL
	SELECT 1 FROM worktree_co_owners o
	WHERE o.session_uri <> ?2 AND rtrim(lower(o.worktree_path), '/') = lower(?1)
		AND ${sessionLiveSql('o.session_uri')}
		AND ${sessionUsesFolderSql('o.session_uri')}
		AND NOT COALESCE(${sessionArchivedSql('o.session_uri')}, 0)
	LIMIT 1`;

const sessionArchivedQuery = `SELECT ${sessionArchivedSql('?1')} AS archived`;

/** Whether the session `uri` is registered and not deleted (by this build or an older one). */
function sessionLiveSql(uri: string): string {
	return `(NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'sessionTombstone:' || ${uri} AND value = 'true')
		AND (EXISTS (SELECT 1 FROM sessions_v2 WHERE session_uri = ${uri}) OR EXISTS (SELECT 1 FROM sessions WHERE session_uri = ${uri})))`;
}

/** Whether `directory` is the folder `?1` (no trailing slash) or inside it, case-insensitively. */
function withinFolderSql(directory: string): string {
	return `(lower(${directory}) = lower(?1) OR substr(lower(${directory}), 1, length(?1) + 1) = lower(?1) || '/')`;
}

/**
 * Whether the session `uri` has a central folder at or inside `?1`: its session folders, or the folders of a chat
 * it owns, archived chats included (they may be unarchived). A chat's session-state folders count only while it has
 * no normalized row: a normalized chat's later folder changes are recorded in `chats_v2` alone.
 */
function sessionUsesFolderSql(uri: string): string {
	return `(EXISTS (SELECT 1 FROM sessions_v2 p, json_each(p.payload, '$.data.workingDirectories') j
			WHERE p.session_uri = ${uri} AND json_valid(p.payload) AND ${withinFolderSql('j.value')})
		OR EXISTS (SELECT 1 FROM session_state_values v, json_each(v.value) j
			WHERE v.session_uri = ${uri} AND v.key = '${SESSION_WORKING_DIRECTORIES_KEY}' AND json_valid(v.value) AND ${withinFolderSql('j.value')})
		OR EXISTS (SELECT 1 FROM chats_v2 c, json_each(c.working_directories) j
			WHERE c.owner_session_uri = ${uri} AND c.tombstoned = 0 AND json_valid(c.working_directories) AND ${withinFolderSql('j.value')})
		OR EXISTS (SELECT 1 FROM session_chat_state s, json_each(s.working_directories) j
			WHERE s.session_uri = ${uri} AND json_valid(s.working_directories) AND ${withinFolderSql('j.value')}
				AND NOT EXISTS (SELECT 1 FROM chats_v2 n WHERE n.chat_uri = s.chat_uri)))`;
}

/** `?1` is the worktree folder without a trailing slash. */
const worktreeCoOwnersSql = `SELECT worktree_path, session_uri, repository_root, branch,
	${sessionLiveSql('o.session_uri')} AND ${sessionUsesFolderSql('o.session_uri')} AS live
	FROM worktree_co_owners o WHERE rtrim(lower(o.worktree_path), '/') = lower(?1)
	ORDER BY o.session_uri`;

function toCoOwner(row: Record<string, unknown>): IWorktreeCoOwner {
	return {
		worktreePath: row.worktree_path as string,
		session: row.session_uri as string,
		repositoryRoot: row.repository_root as string,
		branch: row.branch as string,
	};
}

function toCoOwnerState(row: Record<string, unknown>): IWorktreeCoOwnerState {
	return { ...toCoOwner(row), live: row.live === 1 };
}

/** Writes co-owner rows inside the caller's transaction; a row a session already has stays. */
export async function insertWorktreeCoOwners(connection: Pick<ISessionStateSqlConnection, 'run'>, coOwners: readonly IWorktreeCoOwner[]): Promise<void> {
	for (const coOwner of coOwners) {
		await connection.run(`INSERT INTO worktree_co_owners (worktree_path, session_uri, repository_root, branch) VALUES (?, ?, ?, ?)
			ON CONFLICT(worktree_path, session_uri) DO NOTHING`, [coOwner.worktreePath, coOwner.session, coOwner.repositoryRoot, coOwner.branch]);
	}
}

/** Gives every co-owner row of `source` to `target`, inside the caller's transaction (a session that ends by a move). */
export async function rekeyWorktreeCoOwners(connection: Pick<ISessionStateSqlConnection, 'run'>, source: string, target: string): Promise<void> {
	await connection.run(`INSERT INTO worktree_co_owners (worktree_path, session_uri, repository_root, branch)
		SELECT worktree_path, ?, repository_root, branch FROM worktree_co_owners WHERE session_uri = ?
		ON CONFLICT(worktree_path, session_uri) DO NOTHING`, [target, source]);
	await connection.run('DELETE FROM worktree_co_owners WHERE session_uri = ?', [source]);
}

export class AgentHostWorktreeRemovalTables implements IAgentHostWorktreeRemovalDatabase {

	constructor(private readonly _host: ISessionStateSqlHost) { }

	upsertPendingWorktreeRemoval(request: IWorktreeRemovalRequest): Promise<void> {
		return this._host.write('Failed to record a pending worktree removal', connection => insertPendingWorktreeRemovals(connection, [request]));
	}

	async deletePendingWorktreeRemoval(kind: WorktreeRemovalKind, owner: string, expected?: Pick<IWorktreeRemovalRequest, 'mode' | 'requestedAt'>): Promise<void> {
		await this._host.write('Failed to drop a pending worktree removal', connection => expected
			? connection.run('DELETE FROM pending_worktree_removals WHERE kind = ? AND owner = ? AND mode = ? AND requested_at = ?', [kind, owner, expected.mode, expected.requestedAt])
			: connection.run('DELETE FROM pending_worktree_removals WHERE kind = ? AND owner = ?', [kind, owner]));
	}

	readPendingWorktreeRemoval(kind: WorktreeRemovalKind, owner: string): Promise<IPendingWorktreeRemoval | undefined> {
		return this._host.read(async connection => {
			const row = await connection.get(`SELECT ${columns} FROM pending_worktree_removals WHERE kind = ? AND owner = ?`, [kind, owner]);
			return row ? toRemoval(row) : undefined;
		});
	}

	listPendingWorktreeRemovals(): Promise<readonly IPendingWorktreeRemoval[]> {
		return this._host.read(async connection => (await connection.all(`SELECT ${columns} FROM pending_worktree_removals ORDER BY requested_at, kind, owner`, [])).map(toRemoval));
	}

	recordPendingWorktreeRemovalFailure(request: Pick<IWorktreeRemovalRequest, 'kind' | 'owner' | 'mode' | 'requestedAt'>, nextAttemptAt: number): Promise<number | undefined> {
		return this._host.write('Failed to record a worktree removal attempt', async connection => {
			const changed = await connection.run(`UPDATE pending_worktree_removals SET attempts = attempts + 1, next_attempt_at = ?
				WHERE kind = ? AND owner = ? AND mode = ? AND requested_at = ?`, [nextAttemptAt, request.kind, request.owner, request.mode, request.requestedAt]);
			if (!changed) {
				return undefined;
			}
			return (await connection.get('SELECT attempts FROM pending_worktree_removals WHERE kind = ? AND owner = ?', [request.kind, request.owner]))?.attempts as number | undefined;
		});
	}

	readSessionArchived(session: string): Promise<boolean | undefined> {
		return this._host.read(async connection => {
			const archived = (await connection.get(sessionArchivedQuery, [session]))?.archived;
			return archived === null || archived === undefined ? undefined : archived === 1;
		});
	}

	isWorktreeInUse(worktreePath: string, excludedSession: string | undefined): Promise<boolean> {
		return this._host.read(async connection => !!await connection.get(worktreeInUseSql, [worktreePath.replace(/\/+$/, ''), excludedSession ?? '']));
	}

	listWorktreeCoOwnersOfSession(session: string): Promise<readonly IWorktreeCoOwner[]> {
		return this._host.read(async connection => (await connection.all(`SELECT worktree_path, session_uri, repository_root, branch FROM worktree_co_owners
			WHERE session_uri = ? ORDER BY worktree_path`, [session])).map(toCoOwner));
	}

	readWorktreeCoOwners(worktreePath: string): Promise<readonly IWorktreeCoOwnerState[]> {
		return this._host.read(async connection => (await connection.all(worktreeCoOwnersSql, [worktreePath.replace(/\/+$/, '')])).map(toCoOwnerState));
	}

	pruneWorktreeCoOwners(worktreePath: string): Promise<readonly IWorktreeCoOwnerState[]> {
		return this._host.write('Failed to prune the co-owners of a worktree', async connection => {
			const rows = (await connection.all(worktreeCoOwnersSql, [worktreePath.replace(/\/+$/, '')])).map(toCoOwnerState);
			const stale = rows.filter(row => !row.live);
			// One row always stays: the folder was shared, which forces commit mode until it is removed.
			const pruned = stale.length === rows.length ? stale.slice(1) : stale;
			for (const row of pruned) {
				await connection.run('DELETE FROM worktree_co_owners WHERE worktree_path = ? AND session_uri = ?', [row.worktreePath, row.session]);
			}
			return rows.filter(row => !pruned.includes(row));
		});
	}

	pruneDeletedWorktreeCoOwners(): Promise<void> {
		return this._host.write('Failed to prune the co-owner rows of deleted sessions', async connection => {
			await connection.run(`DELETE FROM worktree_co_owners WHERE NOT ${sessionLiveSql('worktree_co_owners.session_uri')}
				AND EXISTS (SELECT 1 FROM worktree_co_owners o
					WHERE rtrim(lower(o.worktree_path), '/') = rtrim(lower(worktree_co_owners.worktree_path), '/') AND o.session_uri <> worktree_co_owners.session_uri
						AND (${sessionLiveSql('o.session_uri')} OR o.session_uri < worktree_co_owners.session_uri))`, []);
		});
	}

	clearStaleWorktreeCoOwners(worktreePath: string): Promise<void> {
		return this._host.write('Failed to clear the co-owners of a removed worktree', async connection => {
			for (const row of (await connection.all(worktreeCoOwnersSql, [worktreePath.replace(/\/+$/, '')])).map(toCoOwnerState)) {
				if (!row.live) {
					await connection.run('DELETE FROM worktree_co_owners WHERE worktree_path = ? AND session_uri = ?', [row.worktreePath, row.session]);
				}
			}
		});
	}

	isSessionLive(session: string): Promise<boolean> {
		return this._host.read(async connection => !!(await connection.get(`SELECT ${sessionLiveSql('?1')} AS live`, [session]))?.live);
	}

	findAdditionalWorktreeOwners(handle: string): Promise<readonly string[]> {
		return this._host.read(async connection => (await connection.all(`SELECT DISTINCT v.session_uri FROM session_state_values v, json_each(v.value) j
			WHERE v.key = '${ADDITIONAL_WORKTREES_METADATA_KEY}' AND instr(v.value, ?1) > 0 AND json_valid(v.value)
				AND json_extract(j.value, '$.handle') = ?1 AND ${sessionLiveSql('v.session_uri')}
			ORDER BY v.session_uri`, [handle])).map(row => row.session_uri as string));
	}
}
