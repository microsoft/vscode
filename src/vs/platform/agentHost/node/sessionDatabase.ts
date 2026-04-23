/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { SequencerByKey } from '../../../base/common/async.js';
import type { Database, RunResult } from '@vscode/sqlite3';
import type { IFileEditContent, IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import { dirname } from '../../../base/common/path.js';

/**
 * A single numbered migration. Migrations are applied in order of
 * {@link version} and tracked via `PRAGMA user_version`.
 */
export interface ISessionDatabaseMigration {
	/** Monotonically-increasing version number (1-based). */
	readonly version: number;
	/** SQL to execute for this migration. */
	readonly sql: string;
}

/**
 * The set of migrations that define the current session database schema.
 * New migrations should be **appended** to this array with the next version
 * number. Never reorder or mutate existing entries.
 */
export const sessionDatabaseMigrations: readonly ISessionDatabaseMigration[] = [
	{
		version: 1,
		sql: [
			`CREATE TABLE IF NOT EXISTS turns (
				id TEXT PRIMARY KEY NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS file_edits (
				turn_id        TEXT    NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
				tool_call_id   TEXT    NOT NULL,
				file_path      TEXT    NOT NULL,
				before_content BLOB   NOT NULL,
				after_content  BLOB   NOT NULL,
				added_lines    INTEGER,
				removed_lines  INTEGER,
				PRIMARY KEY (tool_call_id, file_path)
			)`,
		].join(';\n'),
	},
	{
		version: 2,
		sql: `CREATE TABLE IF NOT EXISTS session_metadata (
			key   TEXT PRIMARY KEY NOT NULL,
			value TEXT NOT NULL
		)`,
	},
	{
		version: 3,
		sql: [
			// Recreate file_edits with new columns: edit_type, original_path,
			// and nullable before_content/after_content.
			`CREATE TABLE file_edits_v3 (
				turn_id        TEXT    NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
				tool_call_id   TEXT    NOT NULL,
				file_path      TEXT    NOT NULL,
				edit_type      TEXT    NOT NULL DEFAULT 'edit',
				original_path  TEXT,
				before_content BLOB,
				after_content  BLOB,
				added_lines    INTEGER,
				removed_lines  INTEGER,
				PRIMARY KEY (tool_call_id, file_path)
			)`,
			`INSERT INTO file_edits_v3 (turn_id, tool_call_id, file_path, edit_type, before_content, after_content, added_lines, removed_lines)
				SELECT turn_id, tool_call_id, file_path, 'edit', before_content, after_content, added_lines, removed_lines FROM file_edits`,
			`DROP TABLE file_edits`,
			`ALTER TABLE file_edits_v3 RENAME TO file_edits`,
		].join(';\n'),
	},
	{
		version: 4,
		sql: [
			`ALTER TABLE turns ADD COLUMN event_id TEXT`,
			`CREATE INDEX IF NOT EXISTS idx_turns_event_id ON turns(event_id)`,
		].join(';\n'),
	},
];

// ---- Promise wrappers around callback-based @vscode/sqlite3 API -----------

function dbExec(db: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => {
		db.exec(sql, err => err ? reject(err) : resolve());
	});
}

function dbRun(db: Database, sql: string, params: unknown[]): Promise<{ changes: number; lastID: number }> {
	return new Promise((resolve, reject) => {
		db.run(sql, params, function (this: RunResult, err: Error | null) {
			if (err) {
				return reject(err);
			}
			resolve({ changes: this.changes, lastID: this.lastID });
		});
	});
}

function dbGet(db: Database, sql: string, params: unknown[]): Promise<Record<string, unknown> | undefined> {
	return new Promise((resolve, reject) => {
		db.get(sql, params, (err: Error | null, row: Record<string, unknown> | undefined) => {
			if (err) {
				return reject(err);
			}
			resolve(row);
		});
	});
}

function dbAll(db: Database, sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
	return new Promise((resolve, reject) => {
		db.all(sql, params, (err: Error | null, rows: Record<string, unknown>[]) => {
			if (err) {
				return reject(err);
			}
			resolve(rows);
		});
	});
}

function dbClose(db: Database): Promise<void> {
	return new Promise((resolve, reject) => {
		db.close(err => err ? reject(err) : resolve());
	});
}

function dbOpen(path: string): Promise<Database> {
	return new Promise((resolve, reject) => {
		import('@vscode/sqlite3').then(sqlite3 => {
			const db = new sqlite3.default.Database(path, (err: Error | null) => {
				if (err) {
					return reject(err);
				}
				resolve(db);
			});
		}, reject);
	});
}

/**
 * Applies any pending {@link ISessionDatabaseMigration migrations} to a
 * database. Migrations whose version is greater than the current
 * `PRAGMA user_version` are run inside a serialized transaction. After all
 * migrations complete the pragma is updated to the highest applied version.
 */
export async function runMigrations(db: Database, migrations: readonly ISessionDatabaseMigration[]): Promise<void> {
	// Enable foreign key enforcement — must be set outside a transaction
	// and every time a connection is opened.
	await dbExec(db, 'PRAGMA foreign_keys = ON');

	const row = await dbGet(db, 'PRAGMA user_version', []);
	const currentVersion = (row?.user_version as number | undefined) ?? 0;

	const pending = migrations
		.filter(m => m.version > currentVersion)
		.sort((a, b) => a.version - b.version);

	if (pending.length === 0) {
		return;
	}

	await dbExec(db, 'BEGIN TRANSACTION');
	try {
		for (const migration of pending) {
			await dbExec(db, migration.sql);
			// PRAGMA cannot be parameterized; the version is a trusted literal.
			await dbExec(db, `PRAGMA user_version = ${migration.version}`);
		}
		await dbExec(db, 'COMMIT');
	} catch (err) {
		await dbExec(db, 'ROLLBACK');
		throw err;
	}
}

/**
 * A wrapper around a `@vscode/sqlite3` {@link Database} instance with
 * lazy initialisation.
 *
 * The underlying connection is opened on the first async method call
 * (not at construction time), allowing the object to be created
 * synchronously and shared via a {@link ReferenceCollection}.
 *
 * Calling {@link dispose} closes the connection.
 */
export class SessionDatabase implements ISessionDatabase {

	protected _dbPromise: Promise<Database> | undefined;
	protected _closed: Promise<void> | true | undefined;
	private readonly _fileEditSequencer = new SequencerByKey<string>();

	/**
	 * Serializes `setMetadata` writes per key. `@vscode/sqlite3` runs in
	 * parallelized mode, so two `db.run()` calls on the same connection
	 * can be dispatched to the libuv thread pool and complete out of
	 * submission order. For "last writer wins" keys (notably `configValues`
	 * via {@link setMetadata}), that meant a fast-following second write
	 * could be overtaken by the first and silently lose its value — see
	 * the "Session Config persistence across restarts" integration test.
	 * Sequencing by key preserves intra-key order while still allowing
	 * writes for different keys to run concurrently.
	 */
	private readonly _metadataSequencer = new SequencerByKey<string>();

	/**
	 * In-flight write operations. Tracked so {@link whenIdle} can await them
	 * before the process exits — without this, a `SIGTERM` arriving between
	 * a fire-and-forget mutating call (e.g. `setMetadata`) being invoked and
	 * its underlying SQLite query completing would silently drop the write.
	 * Every public mutating method routes its returned promise through
	 * {@link _track}; reads (`getMetadata`, `getFileEdits`, ...) skip
	 * tracking since shutdown does not need to wait for them.
	 */
	private readonly _pendingWrites = new Set<Promise<unknown>>();

	constructor(
		private readonly _path: string,
		private readonly _migrations: readonly ISessionDatabaseMigration[] = sessionDatabaseMigrations,
	) { }

	/**
	 * Opens (or creates) a SQLite database at {@link path} and applies
	 * any pending migrations. Only used in tests where synchronous
	 * construction + immediate readiness is desired.
	 */
	static async open(path: string, migrations: readonly ISessionDatabaseMigration[] = sessionDatabaseMigrations): Promise<SessionDatabase> {
		const inst = new SessionDatabase(path, migrations);
		await inst._ensureDb();
		return inst;
	}

	protected _ensureDb(): Promise<Database> {
		if (this._closed) {
			return Promise.reject(new Error('SessionDatabase has been disposed'));
		}
		if (!this._dbPromise) {
			this._dbPromise = (async () => {
				// Ensure the parent directory exists before SQLite tries to
				// create the database file.
				await fs.promises.mkdir(dirname(this._path), { recursive: true });
				const db = await dbOpen(this._path);
				try {
					await runMigrations(db, this._migrations);
				} catch (err) {
					await dbClose(db);
					this._dbPromise = undefined;
					throw err;
				}
				// If dispose() was called while we were opening, close immediately.
				if (this._closed) {
					await dbClose(db);
					throw new Error('SessionDatabase has been disposed');
				}
				return db;
			})();
		}
		return this._dbPromise;
	}

	/**
	 * Returns the names of all user-created tables in the database.
	 * Useful for testing migration behavior.
	 */
	async getAllTables(): Promise<string[]> {
		const db = await this._ensureDb();
		const rows = await dbAll(db, `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`, []);
		return rows.map(r => r.name as string);
	}

	// ---- Turns ----------------------------------------------------------

	createTurn(turnId: string): Promise<void> {
		return this._track(async () => {
			const db = await this._ensureDb();
			await dbRun(db, 'INSERT OR IGNORE INTO turns (id) VALUES (?)', [turnId]);
		});
	}

	deleteTurn(turnId: string): Promise<void> {
		return this._track(async () => {
			const db = await this._ensureDb();
			await dbRun(db, 'DELETE FROM turns WHERE id = ?', [turnId]);
		});
	}

	setTurnEventId(turnId: string, eventId: string): Promise<void> {
		return this._track(async () => {
			const db = await this._ensureDb();
			await dbRun(db, 'INSERT OR IGNORE INTO turns (id) VALUES (?)', [turnId]);
			// Only set the event ID if not already set — steering messages
			// trigger additional user.message events within the same turn,
			// and we must preserve the first (boundary) event ID.
			await dbRun(db, 'UPDATE turns SET event_id = ? WHERE id = ? AND event_id IS NULL', [eventId, turnId]);
		});
	}

	async getTurnEventId(turnId: string): Promise<string | undefined> {
		const db = await this._ensureDb();
		const row = await dbGet(db, 'SELECT event_id FROM turns WHERE id = ?', [turnId]);
		return row?.event_id as string | undefined ?? undefined;
	}

	async getNextTurnEventId(turnId: string): Promise<string | undefined> {
		const db = await this._ensureDb();
		const row = await dbGet(
			db,
			`SELECT event_id FROM turns WHERE rowid > (SELECT rowid FROM turns WHERE id = ?) ORDER BY rowid LIMIT 1`,
			[turnId],
		);
		return row?.event_id as string | undefined ?? undefined;
	}

	async getFirstTurnEventId(): Promise<string | undefined> {
		const db = await this._ensureDb();
		const row = await dbGet(db, 'SELECT event_id FROM turns ORDER BY rowid LIMIT 1', []);
		return row?.event_id as string | undefined ?? undefined;
	}

	truncateFromTurn(turnId: string): Promise<void> {
		return this._track(async () => {
			const db = await this._ensureDb();
			// Delete the target turn and all turns inserted after it (by rowid order).
			// File edits cascade-delete via the foreign key constraint.
			await dbRun(db,
				`DELETE FROM turns WHERE rowid >= (SELECT rowid FROM turns WHERE id = ?)`,
				[turnId],
			);
		});
	}

	deleteTurnsAfter(turnId: string): Promise<void> {
		return this._track(async () => {
			const db = await this._ensureDb();
			// Delete all turns inserted after the given turn (by rowid order),
			// keeping the given turn itself.
			// File edits cascade-delete via the foreign key constraint.
			await dbRun(db,
				`DELETE FROM turns WHERE rowid > (SELECT rowid FROM turns WHERE id = ?)`,
				[turnId],
			);
		});
	}

	deleteAllTurns(): Promise<void> {
		return this._track(async () => {
			const db = await this._ensureDb();
			await dbExec(db, 'DELETE FROM turns');
		});
	}

	// ---- File edits -----------------------------------------------------

	storeFileEdit(edit: IFileEditRecord & IFileEditContent): Promise<void> {
		return this._track(() => this._fileEditSequencer.queue(edit.filePath, async () => {
			const db = await this._ensureDb();
			// Ensure the turn exists — lazily insert since the turn record
			// may not have been created by an explicit createTurn() call.
			await dbRun(db, 'INSERT OR IGNORE INTO turns (id) VALUES (?)', [edit.turnId]);
			await dbRun(
				db,
				`INSERT OR REPLACE INTO file_edits
					(turn_id, tool_call_id, file_path, edit_type, original_path, before_content, after_content, added_lines, removed_lines)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					edit.turnId,
					edit.toolCallId,
					edit.filePath,
					edit.kind,
					edit.originalPath ?? null,
					edit.beforeContent ? Buffer.from(edit.beforeContent) : null,
					edit.afterContent ? Buffer.from(edit.afterContent) : null,
					edit.addedLines ?? null,
					edit.removedLines ?? null,
				],
			);
		}));
	}

	async getFileEdits(toolCallIds: string[]): Promise<IFileEditRecord[]> {
		if (toolCallIds.length === 0) {
			return [];
		}
		const db = await this._ensureDb();
		const placeholders = toolCallIds.map(() => '?').join(',');
		const rows = await dbAll(
			db,
			`SELECT turn_id, tool_call_id, file_path, edit_type, original_path, added_lines, removed_lines
				FROM file_edits
				WHERE tool_call_id IN (${placeholders})
				ORDER BY rowid`,
			toolCallIds,
		);
		return rows.map(row => ({
			turnId: row.turn_id as string,
			toolCallId: row.tool_call_id as string,
			filePath: row.file_path as string,
			kind: (row.edit_type as IFileEditRecord['kind']) ?? 'edit',
			originalPath: row.original_path as string | undefined ?? undefined,
			addedLines: row.added_lines as number | undefined ?? undefined,
			removedLines: row.removed_lines as number | undefined ?? undefined,
		}));
	}

	async getAllFileEdits(): Promise<IFileEditRecord[]> {
		const db = await this._ensureDb();
		const rows = await dbAll(
			db,
			`SELECT turn_id, tool_call_id, file_path, edit_type, original_path, added_lines, removed_lines
				FROM file_edits
				ORDER BY rowid`,
			[],
		);
		return rows.map(row => ({
			turnId: row.turn_id as string,
			toolCallId: row.tool_call_id as string,
			filePath: row.file_path as string,
			kind: (row.edit_type as IFileEditRecord['kind']) ?? 'edit',
			originalPath: row.original_path as string | undefined ?? undefined,
			addedLines: row.added_lines as number | undefined ?? undefined,
			removedLines: row.removed_lines as number | undefined ?? undefined,
		}));
	}

	async getFileEditsByTurn(turnId: string): Promise<IFileEditRecord[]> {
		const db = await this._ensureDb();
		const rows = await dbAll(
			db,
			`SELECT turn_id, tool_call_id, file_path, edit_type, original_path, added_lines, removed_lines
				FROM file_edits
				WHERE turn_id = ?
				ORDER BY rowid`,
			[turnId],
		);
		return rows.map(row => ({
			turnId: row.turn_id as string,
			toolCallId: row.tool_call_id as string,
			filePath: row.file_path as string,
			kind: (row.edit_type as IFileEditRecord['kind']) ?? 'edit',
			originalPath: row.original_path as string | undefined ?? undefined,
			addedLines: row.added_lines as number | undefined ?? undefined,
			removedLines: row.removed_lines as number | undefined ?? undefined,
		}));
	}

	async readFileEditContent(toolCallId: string, filePath: string): Promise<IFileEditContent | undefined> {
		return this._fileEditSequencer.queue(filePath, async () => {
			const db = await this._ensureDb();
			const row = await dbGet(
				db,
				`SELECT before_content, after_content
					FROM file_edits
					WHERE tool_call_id = ? AND file_path = ?`,
				[toolCallId, filePath],
			);
			if (!row) {
				return undefined;
			}
			return {
				beforeContent: row.before_content ? toUint8Array(row.before_content) : undefined,
				afterContent: row.after_content ? toUint8Array(row.after_content) : undefined,
			};
		});
	}

	// ---- Session metadata -----------------------------------------------

	async getMetadata(key: string): Promise<string | undefined> {
		const db = await this._ensureDb();
		const row = await dbGet(db, 'SELECT value FROM session_metadata WHERE key = ?', [key]);
		return row?.value as string | undefined;
	}

	async getMetadataObject<T extends Record<string, unknown>>(obj: T): Promise<{ [K in keyof T]: string | undefined }> {
		const keys = Object.keys(obj) as (keyof T & string)[];
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		const result = {} as { [K in keyof T]: string | undefined };
		if (keys.length === 0) {
			return result;
		}
		const db = await this._ensureDb();
		const placeholders = keys.map(() => '?').join(',');
		const rows = await dbAll(db, `SELECT key, value FROM session_metadata WHERE key IN (${placeholders})`, keys);
		for (const key of keys) {
			result[key] = undefined;
		}
		for (const row of rows) {
			result[row.key as keyof T] = row.value as string;
		}
		return result;
	}

	setMetadata(key: string, value: string): Promise<void> {
		return this._track(() => this._metadataSequencer.queue(key, async () => {
			const db = await this._ensureDb();
			await dbRun(db, 'INSERT OR REPLACE INTO session_metadata (key, value) VALUES (?, ?)', [key, value]);
		}));
	}

	remapTurnIds(mapping: ReadonlyMap<string, string>): Promise<void> {
		return this._track(async () => {
			const db = await this._ensureDb();
			// Defer FK checks to commit time so we can update turns.id and
			// file_edits.turn_id in any order without mid-statement violations.
			// This pragma auto-resets after the transaction ends.
			await dbExec(db, 'PRAGMA defer_foreign_keys = ON');
			await dbExec(db, 'BEGIN TRANSACTION');
			try {
				// Delete turns not present in the mapping (e.g. turns beyond
				// the fork point). File edits cascade-delete via FK.
				const oldIds = [...mapping.keys()];
				if (oldIds.length > 0) {
					const placeholders = oldIds.map(() => '?').join(',');
					await dbRun(db,
						`DELETE FROM turns WHERE id NOT IN (${placeholders})`,
						oldIds,
					);
				}

				// Remap the remaining turn IDs to their new values
				for (const [oldId, newId] of mapping) {
					await dbRun(db, 'UPDATE turns SET id = ? WHERE id = ?', [newId, oldId]);
					await dbRun(db, 'UPDATE file_edits SET turn_id = ? WHERE turn_id = ?', [newId, oldId]);
				}
				await dbExec(db, 'COMMIT');
			} catch (err) {
				await dbExec(db, 'ROLLBACK');
				throw err;
			}
		});
	}

	/**
	 * Resolves once all currently in-flight write operations have settled.
	 * Used by graceful shutdown to flush pending fire-and-forget writes
	 * before the process exits. Should be called from a path where no
	 * further writes are expected; loops until idle to also drain any
	 * writes that get queued while we're awaiting.
	 */
	async whenIdle(): Promise<void> {
		while (this._pendingWrites.size > 0) {
			await Promise.allSettled([...this._pendingWrites]);
		}
	}

	async vacuumInto(targetPath: string) {
		const db = await this._ensureDb();
		await dbRun(db, 'VACUUM INTO ?', [targetPath]);
	}

	/**
	 * Wrap a mutating operation's promise so {@link whenIdle} can await it.
	 * Invoke at the **outermost** layer of every public mutating method so
	 * that any internal awaits (notably `_ensureDb()`) are covered too —
	 * tracking only the leaf `dbRun`/`dbExec` would miss the window
	 * between the method being called and the query actually being queued.
	 */
	private _track<T>(fn: () => Promise<T>): Promise<T> {
		const p = fn();
		this._pendingWrites.add(p);
		const untrack = () => { this._pendingWrites.delete(p); };
		p.then(untrack, untrack);
		return p;
	}

	async close() {
		await (this._closed ??= this._dbPromise?.then(db => db.close()).catch(() => { }) || true);
	}

	dispose(): void {
		this.close();
	}
}

function toUint8Array(value: unknown): Uint8Array {
	if (value instanceof Buffer) {
		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	}
	if (value instanceof Uint8Array) {
		return value;
	}
	if (typeof value === 'string') {
		return new TextEncoder().encode(value);
	}
	return new Uint8Array(0);
}
