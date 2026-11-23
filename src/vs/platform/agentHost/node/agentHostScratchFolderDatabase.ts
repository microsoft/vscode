/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ISessionStateSqlConnection, ISessionStateSqlHost } from './agentHostSessionStateDatabase.js';
import { centralWorkingDirectoriesSql, withinFolderSql } from './agentHostWorktreeRemovalDatabase.js';

/**
 * agent-host.db table of scratch folders the host allocated for a workspace-less chat (Block 9a).
 * A row is written before the folder is created, so a crash never leaves an unrecorded folder, and
 * deleted once the folder is removed. Older builds never read the table.
 */

/** Migration version of the scratch folder table. */
export const SCRATCH_FOLDER_MIGRATION_VERSION = 21;

export const SCRATCH_FOLDER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS scratch_folders (
	folder          TEXT NOT NULL PRIMARY KEY,
	chat_uri        TEXT NOT NULL,
	provider        TEXT NOT NULL,
	state           TEXT NOT NULL CHECK (state IN ('allocating', 'owned', 'removing')),
	requested_at    INTEGER NOT NULL,
	attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
	next_attempt_at INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS scratch_folders_chat ON scratch_folders(chat_uri)`;

/**
 * `allocating`: recorded, the folder may not exist yet. `owned`: attached to its chat.
 * `removing`: its chat was deleted, the folder awaits removal.
 */
export type ScratchFolderState = 'allocating' | 'owned' | 'removing';

export interface IScratchFolderRequest {
	/** The folder, as a URI string. */
	readonly folder: string;
	/** The chat the folder was allocated for, as recorded (never parsed). */
	readonly chatUri: string;
	readonly provider: string;
	readonly requestedAt: number;
}

export interface IScratchFolder extends IScratchFolderRequest {
	readonly state: ScratchFolderState;
	readonly attempts: number;
	/** Earliest time of the next removal attempt after a failure; `0` when due. */
	readonly nextAttemptAt: number;
}

export interface IAgentHostScratchFolderDatabase {
	/** Records a folder about to be created, in state `allocating`; a folder already recorded stays. */
	insertScratchFolder(request: IScratchFolderRequest): Promise<void>;
	/** Marks an `allocating` folder `owned`. */
	markScratchFolderOwned(folder: string): Promise<void>;
	/** Marks a folder whose chat no longer works in it `removing`, for the clean-up pass. */
	markScratchFolderRemoving(folder: string): Promise<void>;
	listScratchFolders(): Promise<readonly IScratchFolder[]>;
	/** Whether the folder is recorded in any state. */
	hasScratchFolder(folder: string): Promise<boolean>;
	/** Counts a failed removal attempt. */
	recordScratchFolderRemovalFailure(folder: string, nextAttemptAt: number): Promise<void>;
	deleteScratchFolder(folder: string): Promise<void>;
	/**
	 * Whether a live (not deleted) chat or session, archived ones included, lists `folder` or a directory inside it as a
	 * working directory, other than its own `removing` owner. Compared case-insensitively.
	 */
	isScratchFolderInUse(folder: string): Promise<boolean>;
	/**
	 * Marks an `owned` folder `removing` when no live chat is recorded under any of `chatUris` (the spellings of the
	 * row's chat) and nothing live lists the folder: its chat was deleted, but the row named the chat in a spelling the
	 * tombstone did not match. Whether it was marked.
	 */
	markOrphanedScratchFolderRemoving(folder: string, chatUris: readonly string[]): Promise<boolean>;
}

const columns = 'folder, chat_uri, provider, state, requested_at, attempts, next_attempt_at';

/** Marks the scratch folders of the deleted chats `removing`, inside the caller's tombstone transaction. */
export async function markScratchFoldersRemoving(connection: Pick<ISessionStateSqlConnection, 'run'>, chatUris: readonly string[]): Promise<void> {
	for (const chatUri of chatUris) {
		await connection.run(`UPDATE scratch_folders SET state = 'removing' WHERE chat_uri = ? AND state <> 'removing'`, [chatUri]);
	}
}

/**
 * Marks `removing`, inside the caller's tombstone transaction (after the tombstone), the scratch folders among a
 * deleted chat's recorded `folders` that no other live chat lists, whichever chat their row names: a row written
 * before its chat had a storage identity names it in another spelling. Its session may still list the folder until
 * its folders are republished; the clean-up pass keeps a folder anything still lists.
 */
export async function markUnusedScratchFoldersRemoving(connection: Pick<ISessionStateSqlConnection, 'run' | 'get'>, folders: readonly string[]): Promise<void> {
	for (const folder of new Set(folders.map(folder => folder.replace(/\/+$/, '')))) {
		if (!await connection.get(scratchFolderChatUseSql, [folder])) {
			await connection.run(`UPDATE scratch_folders SET state = 'removing' WHERE rtrim(lower(folder), '/') = lower(?) AND state <> 'removing'`, [folder]);
		}
	}
}

/**
 * `?1` is the folder without a trailing slash. A directory at or inside the folder uses it: removing the folder removes
 * the directory. Archived chats and sessions count; deleted chats and the folder's removing owner do not.
 */
const scratchFolderInUseSql = `
	WITH directories(session_uri, directory, chat_uri) AS (${centralWorkingDirectoriesSql(true)})
	SELECT 1 AS present FROM directories d
	WHERE ${withinFolderSql('d.directory')}
		AND NOT (d.chat_uri IS NOT NULL AND EXISTS (SELECT 1 FROM scratch_folders r
			WHERE r.state = 'removing' AND r.chat_uri = d.chat_uri AND rtrim(lower(r.folder), '/') = lower(?1)))
	LIMIT 1`;

/** `?1` is the folder without a trailing slash. Whether a live chat, archived ones included, lists the folder or a directory inside it. */
const scratchFolderChatUseSql = `
	WITH directories(session_uri, directory, chat_uri) AS (${centralWorkingDirectoriesSql(true)})
	SELECT 1 AS present FROM directories d
	WHERE d.chat_uri IS NOT NULL AND ${withinFolderSql('d.directory')}
	LIMIT 1`;

function toScratchFolder(row: Record<string, unknown>): IScratchFolder {
	return {
		folder: row.folder as string,
		chatUri: row.chat_uri as string,
		provider: row.provider as string,
		state: row.state as ScratchFolderState,
		requestedAt: row.requested_at as number,
		attempts: row.attempts as number,
		nextAttemptAt: row.next_attempt_at as number,
	};
}

export class AgentHostScratchFolderTables implements IAgentHostScratchFolderDatabase {

	constructor(private readonly _host: ISessionStateSqlHost) { }

	async insertScratchFolder(request: IScratchFolderRequest): Promise<void> {
		await this._host.write('Failed to record a scratch folder', connection => connection.run(
			`INSERT INTO scratch_folders (folder, chat_uri, provider, state, requested_at) VALUES (?, ?, ?, 'allocating', ?)
				ON CONFLICT(folder) DO NOTHING`, [request.folder, request.chatUri, request.provider, request.requestedAt]));
	}

	async markScratchFolderOwned(folder: string): Promise<void> {
		await this._host.write('Failed to mark a scratch folder owned', connection => connection.run(
			`UPDATE scratch_folders SET state = 'owned' WHERE folder = ? AND state = 'allocating'`, [folder]));
	}

	async markScratchFolderRemoving(folder: string): Promise<void> {
		await this._host.write('Failed to mark a scratch folder removing', connection => connection.run(
			`UPDATE scratch_folders SET state = 'removing' WHERE folder = ? AND state <> 'removing'`, [folder]));
	}

	listScratchFolders(): Promise<readonly IScratchFolder[]> {
		return this._host.read(async connection => (await connection.all(`SELECT ${columns} FROM scratch_folders ORDER BY requested_at, folder`, [])).map(toScratchFolder));
	}

	hasScratchFolder(folder: string): Promise<boolean> {
		return this._host.read(async connection => !!await connection.get('SELECT 1 AS present FROM scratch_folders WHERE folder = ?', [folder]));
	}

	async recordScratchFolderRemovalFailure(folder: string, nextAttemptAt: number): Promise<void> {
		await this._host.write('Failed to record a scratch folder removal attempt', connection => connection.run(
			'UPDATE scratch_folders SET attempts = attempts + 1, next_attempt_at = ? WHERE folder = ?', [nextAttemptAt, folder]));
	}

	async deleteScratchFolder(folder: string): Promise<void> {
		await this._host.write('Failed to delete a scratch folder record', connection => connection.run('DELETE FROM scratch_folders WHERE folder = ?', [folder]));
	}

	isScratchFolderInUse(folder: string): Promise<boolean> {
		return this._host.read(async connection => !!await connection.get(scratchFolderInUseSql, [folder.replace(/\/+$/, '')]));
	}

	markOrphanedScratchFolderRemoving(folder: string, chatUris: readonly string[]): Promise<boolean> {
		return this._host.write('Failed to release an orphaned scratch folder', async connection => {
			const row = await connection.get(`SELECT chat_uri FROM scratch_folders WHERE folder = ? AND state = 'owned'`, [folder]);
			if (!row) {
				return false;
			}
			for (const chatUri of new Set([row.chat_uri as string, ...chatUris])) {
				if (await connection.get('SELECT 1 AS present FROM chats_v2 WHERE chat_uri = ? AND tombstoned = 0', [chatUri])) {
					return false;
				}
			}
			if (await connection.get(scratchFolderInUseSql, [folder.replace(/\/+$/, '')])) {
				return false;
			}
			return await connection.run(`UPDATE scratch_folders SET state = 'removing' WHERE folder = ? AND state = 'owned'`, [folder]) > 0;
		});
	}
}
