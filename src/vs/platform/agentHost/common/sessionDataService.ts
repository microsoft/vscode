/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, IReference } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ISessionDataService = createDecorator<ISessionDataService>('sessionDataService');

// ---- File-edit types ----------------------------------------------------

/**
 * Lightweight metadata for a file edit. Returned by {@link ISessionDatabase.getFileEdits}
 * without the (potentially large) file content blobs.
 */
export interface IFileEditRecord {
	/** The turn that owns this file edit. */
	turnId: string;
	/** The tool call that produced this edit. */
	toolCallId: string;
	/** Absolute file path that was edited. */
	filePath: string;
	/** Number of lines added (informational, for diff metadata). */
	addedLines: number | undefined;
	/** Number of lines removed (informational, for diff metadata). */
	removedLines: number | undefined;
}

/**
 * The before/after content blobs for a single file edit.
 * Retrieved on demand via {@link ISessionDatabase.readFileEditContent}.
 */
export interface IFileEditContent {
	/** File content before the edit (may be empty for newly created files). */
	beforeContent: Uint8Array;
	/** File content after the edit. */
	afterContent: Uint8Array;
}

// ---- Session database ---------------------------------------------------

/**
 * A disposable handle to a per-session SQLite database backed by
 * `@vscode/sqlite3`.
 *
 * Callers obtain an instance via {@link ISessionDataService.openDatabase} and
 * **must** dispose it when finished to close the underlying database connection.
 */
export interface ISessionDatabase extends IDisposable {
	/**
	 * Create a turn record. Must be called before storing file edits that
	 * reference this turn.
	 */
	createTurn(turnId: string): Promise<void>;

	/**
	 * Delete a turn and all of its associated file edits (cascade).
	 */
	deleteTurn(turnId: string): Promise<void>;

	/**
	 * Store a file-edit snapshot (metadata + content) for a tool invocation
	 * within a turn.
	 *
	 * If a record for the same `toolCallId` and `filePath` already exists
	 * it is replaced.
	 */
	storeFileEdit(edit: IFileEditRecord & IFileEditContent): Promise<void>;

	/**
	 * Retrieve file-edit metadata for the given tool call IDs.
	 * Content blobs are **not** included — use {@link readFileEditContent}
	 * to fetch them on demand. Results are returned in insertion order.
	 */
	getFileEdits(toolCallIds: string[]): Promise<IFileEditRecord[]>;

	/**
	 * Read the before/after content blobs for a single file edit.
	 * Returns `undefined` if no edit exists for the given key.
	 */
	readFileEditContent(toolCallId: string, filePath: string): Promise<IFileEditContent | undefined>;

	/**
	 * Close the database connection. After calling this method, the object is
	 * considered disposed and all other methods will reject with an error.
	 */
	close(): Promise<void>;
}

/**
 * Provides persistent, per-session data directories on disk.
 *
 * Each session gets a directory under `{userDataPath}/agentSessionData/{sessionId}/`
 * where internal agent-host code can store arbitrary files (e.g. file snapshots).
 *
 * Directories are created lazily — callers should use {@link IFileService.createFolder}
 * before writing files. Cleanup happens eagerly on session removal and via startup
 * garbage collection for orphaned directories.
 */
export interface ISessionDataService {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the root data directory URI for a session.
	 * Does **not** create the directory on disk; callers use
	 * `IFileService.createFolder()` as needed.
	 */
	getSessionDataDir(session: URI): URI;

	/**
	 * Returns the root data directory URI for a session given its raw ID.
	 * Equivalent to {@link getSessionDataDir} but without requiring a full URI.
	 */
	getSessionDataDirById(sessionId: string): URI;

	/**
	 * Opens (or creates) a per-session SQLite database. The database file is
	 * stored at `{sessionDataDir}/session.db`. Migrations are applied
	 * automatically on first use.
	 *
	 * Returns a ref-counted reference. Multiple callers for the same session
	 * share the same underlying connection. The connection is closed when
	 * the last reference is disposed.
	 */
	openDatabase(session: URI): IReference<ISessionDatabase>;

	/**
	 * Recursively deletes the data directory for a session, if it exists.
	 */
	deleteSessionData(session: URI): Promise<void>;

	/**
	 * Deletes data directories that do not correspond to any known session.
	 * Called at startup; safe to call multiple times.
	 */
	cleanupOrphanedData(knownSessionIds: Set<string>): Promise<void>;
}
