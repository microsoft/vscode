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
async function runMigrations(db: Database, migrations: readonly ISessionDatabaseMigration[]): Promise<void> {
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

	private _dbPromise: Promise<Database> | undefined;
	private _closed: Promise<void> | true | undefined;
	private readonly _fileEditSequencer = new SequencerByKey<string>();

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

	private _ensureDb(): Promise<Database> {
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

	async createTurn(turnId: string): Promise<void> {
		const db = await this._ensureDb();
		await dbRun(db, 'INSERT OR IGNORE INTO turns (id) VALUES (?)', [turnId]);
	}

	async deleteTurn(turnId: string): Promise<void> {
		const db = await this._ensureDb();
		await dbRun(db, 'DELETE FROM turns WHERE id = ?', [turnId]);
	}

	// ---- File edits -----------------------------------------------------

	async storeFileEdit(edit: IFileEditRecord & IFileEditContent): Promise<void> {
		return this._fileEditSequencer.queue(edit.filePath, async () => {
			const db = await this._ensureDb();
			// Ensure the turn exists — the onTurnStart event that calls
			// createTurn() is fire-and-forget and may not have completed yet.
			await dbRun(db, 'INSERT OR IGNORE INTO turns (id) VALUES (?)', [edit.turnId]);
			await dbRun(
				db,
				`INSERT OR REPLACE INTO file_edits
					(turn_id, tool_call_id, file_path, before_content, after_content, added_lines, removed_lines)
				VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[
					edit.turnId,
					edit.toolCallId,
					edit.filePath,
					Buffer.from(edit.beforeContent),
					Buffer.from(edit.afterContent),
					edit.addedLines ?? null,
					edit.removedLines ?? null,
				],
			);
		});
	}

	async getFileEdits(toolCallIds: string[]): Promise<IFileEditRecord[]> {
		if (toolCallIds.length === 0) {
			return [];
		}
		const db = await this._ensureDb();
		const placeholders = toolCallIds.map(() => '?').join(',');
		const rows = await dbAll(
			db,
			`SELECT turn_id, tool_call_id, file_path, added_lines, removed_lines
				FROM file_edits
				WHERE tool_call_id IN (${placeholders})
				ORDER BY rowid`,
			toolCallIds,
		);
		return rows.map(row => ({
			turnId: row.turn_id as string,
			toolCallId: row.tool_call_id as string,
			filePath: row.file_path as string,
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
				beforeContent: toUint8Array(row.before_content),
				afterContent: toUint8Array(row.after_content),
			};
		});
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
