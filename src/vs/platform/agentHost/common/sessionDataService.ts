/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, IReference } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { FileEditKind } from './state/sessionState.js';

export const ISessionDataService = createDecorator<ISessionDataService>('sessionDataService');

/** Filename of the per-session SQLite database. */
export const SESSION_DB_FILENAME = 'session.db';

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
	/** Primary file path (after-path for edits/creates/renames, before-path for deletes). */
	filePath: string;
	/** The kind of file operation. */
	kind: FileEditKind;
	/** For renames, the original file path before the move. */
	originalPath?: string;
	/** Number of lines added (informational, for diff metadata). */
	addedLines: number | undefined;
	/** Number of lines removed (informational, for diff metadata). */
	removedLines: number | undefined;
}

/**
 * The before/after content blobs for a single file edit.
 * Retrieved on demand via {@link ISessionDatabase.readFileEditContent}.
 *
 * For creates, `beforeContent` is absent.
 * For deletes, `afterContent` is absent.
 */
export interface IFileEditContent {
	/** File content before the edit. Absent for file creations. */
	beforeContent?: Uint8Array;
	/** File content after the edit. Absent for file deletions. */
	afterContent?: Uint8Array;
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
	 * Associates a Copilot SDK event ID with a turn. The event ID corresponds
	 * to the `user.message` event in the SDK event stream and is used by
	 * the SDK's `history.truncate` and `sessions.fork` RPCs.
	 */
	setTurnEventId(turnId: string, eventId: string): Promise<void>;

	/**
	 * Retrieves the SDK event ID previously stored for a turn.
	 * Returns `undefined` if no event ID has been set.
	 */
	getTurnEventId(turnId: string): Promise<string | undefined>;

	/**
	 * Returns the SDK event ID of the turn inserted immediately after the
	 * given turn, or `undefined` if the given turn is the last one.
	 */
	getNextTurnEventId(turnId: string): Promise<string | undefined>;

	/**
	 * Returns the SDK event ID of the earliest turn in insertion order,
	 * or `undefined` if there are no turns.
	 */
	getFirstTurnEventId(): Promise<string | undefined>;

	/**
	 * Deletes the given turn and all turns inserted after it, along
	 * with their associated file edits (cascade).
	 */
	truncateFromTurn(turnId: string): Promise<void>;

	/**
	 * Deletes all turns inserted after the given turn (but keeps the
	 * given turn itself). Associated file edits cascade-delete.
	 */
	deleteTurnsAfter(turnId: string): Promise<void>;

	/**
	 * Deletes all turns and their associated file edits.
	 */
	deleteAllTurns(): Promise<void>;

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
	 * Retrieve file-edit metadata for all edits in this session.
	 * Content blobs are **not** included — use {@link readFileEditContent}
	 * to fetch them on demand. Results are returned in insertion order.
	 */
	getAllFileEdits(): Promise<IFileEditRecord[]>;

	/**
	 * Retrieve file-edit metadata for all edits belonging to a specific turn.
	 * Content blobs are **not** included — use {@link readFileEditContent}
	 * to fetch them on demand. Results are returned in insertion order.
	 */
	getFileEditsByTurn(turnId: string): Promise<IFileEditRecord[]>;

	/**
	 * Read the before/after content blobs for a single file edit.
	 * Returns `undefined` if no edit exists for the given key.
	 */
	readFileEditContent(toolCallId: string, filePath: string): Promise<IFileEditContent | undefined>;

	// ---- Session metadata ------------------------------------------------

	/**
	 * Read a metadata value by key.
	 * Returns `undefined` if no value has been stored for the key.
	 */
	getMetadata(key: string): Promise<string | undefined>;

	/**
	 * Gets a bulk of metadata. For example `getMetadataObject({ foo: true }) ->  { foo: 'data' }`
	 */
	getMetadataObject<T extends Record<string, unknown>>(obj: T): Promise<{ [K in keyof T]: string | undefined }>;

	/**
	 * Store a metadata key-value pair. Overwrites any existing value for the key.
	 */
	setMetadata(key: string, value: string): Promise<void>;

	/**
	 * Bulk-remaps turn IDs using the provided old→new mapping.
	 * Used after copying a database file for a forked session.
	 */
	remapTurnIds(mapping: ReadonlyMap<string, string>): Promise<void>;

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
	 * Opens an existing per-session database **only if the database file
	 * already exists on disk**. Returns `undefined` when no database has
	 * been created yet, avoiding the side effect of materializing empty
	 * database files during read-only operations like listing sessions.
	 */
	tryOpenDatabase(session: URI): Promise<IReference<ISessionDatabase> | undefined>;

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
