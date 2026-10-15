/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AH_META_IS_ARCHIVED_DB_KEY } from '../common/state/sessionState.js';
import type { ISessionStateSqlConnection, ISessionStateSqlHost } from './agentHostSessionStateDatabase.js';
import { SESSION_WORKING_DIRECTORIES_KEY } from './shared/persistSessionMetadata.js';

/**
 * agent-host.db table of worktree folders whose removal was requested by an
 * archive or a delete. Archive and delete only record the intent here; the
 * worktree clean-up service removes the folders in the background.
 */

/** Migration version of the pending worktree removal table. */
export const WORKTREE_REMOVAL_MIGRATION_VERSION = 18;

export const WORKTREE_REMOVAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pending_worktree_removals (
	kind            TEXT NOT NULL CHECK (kind IN ('session', 'detached')),
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
 */
export type WorktreeRemovalKind = 'session' | 'detached';

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
	LIMIT 1`;

const sessionArchivedQuery = `SELECT ${sessionArchivedSql('?1')} AS archived`;

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
}
