/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import { SequencerByKey } from '../../../base/common/async.js';
import { dirname } from '../../../base/common/path.js';
/**
 * The set of migrations that define the current session database schema.
 * New migrations should be **appended** to this array with the next version
 * number. Never reorder or mutate existing entries.
 */
export const sessionDatabaseMigrations = [
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
];
// ---- Promise wrappers around callback-based @vscode/sqlite3 API -----------
function dbExec(db, sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, err => err ? reject(err) : resolve());
    });
}
function dbRun(db, sql, params) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                return reject(err);
            }
            resolve({ changes: this.changes, lastID: this.lastID });
        });
    });
}
function dbGet(db, sql, params) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                return reject(err);
            }
            resolve(row);
        });
    });
}
function dbAll(db, sql, params) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                return reject(err);
            }
            resolve(rows);
        });
    });
}
function dbClose(db) {
    return new Promise((resolve, reject) => {
        db.close(err => err ? reject(err) : resolve());
    });
}
function dbOpen(path) {
    return new Promise((resolve, reject) => {
        import('@vscode/sqlite3').then(sqlite3 => {
            const db = new sqlite3.default.Database(path, (err) => {
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
export async function runMigrations(db, migrations) {
    // Enable foreign key enforcement — must be set outside a transaction
    // and every time a connection is opened.
    await dbExec(db, 'PRAGMA foreign_keys = ON');
    const row = await dbGet(db, 'PRAGMA user_version', []);
    const currentVersion = row?.user_version ?? 0;
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
    }
    catch (err) {
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
export class SessionDatabase {
    constructor(_path, _migrations = sessionDatabaseMigrations) {
        this._path = _path;
        this._migrations = _migrations;
        this._fileEditSequencer = new SequencerByKey();
    }
    /**
     * Opens (or creates) a SQLite database at {@link path} and applies
     * any pending migrations. Only used in tests where synchronous
     * construction + immediate readiness is desired.
     */
    static async open(path, migrations = sessionDatabaseMigrations) {
        const inst = new SessionDatabase(path, migrations);
        await inst._ensureDb();
        return inst;
    }
    _ensureDb() {
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
                }
                catch (err) {
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
    async getAllTables() {
        const db = await this._ensureDb();
        const rows = await dbAll(db, `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`, []);
        return rows.map(r => r.name);
    }
    // ---- Turns ----------------------------------------------------------
    async createTurn(turnId) {
        const db = await this._ensureDb();
        await dbRun(db, 'INSERT OR IGNORE INTO turns (id) VALUES (?)', [turnId]);
    }
    async deleteTurn(turnId) {
        const db = await this._ensureDb();
        await dbRun(db, 'DELETE FROM turns WHERE id = ?', [turnId]);
    }
    // ---- File edits -----------------------------------------------------
    async storeFileEdit(edit) {
        return this._fileEditSequencer.queue(edit.filePath, async () => {
            const db = await this._ensureDb();
            // Ensure the turn exists — the onTurnStart event that calls
            // createTurn() is fire-and-forget and may not have completed yet.
            await dbRun(db, 'INSERT OR IGNORE INTO turns (id) VALUES (?)', [edit.turnId]);
            await dbRun(db, `INSERT OR REPLACE INTO file_edits
					(turn_id, tool_call_id, file_path, edit_type, original_path, before_content, after_content, added_lines, removed_lines)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                edit.turnId,
                edit.toolCallId,
                edit.filePath,
                edit.kind,
                edit.originalPath ?? null,
                edit.beforeContent ? Buffer.from(edit.beforeContent) : null,
                edit.afterContent ? Buffer.from(edit.afterContent) : null,
                edit.addedLines ?? null,
                edit.removedLines ?? null,
            ]);
        });
    }
    async getFileEdits(toolCallIds) {
        if (toolCallIds.length === 0) {
            return [];
        }
        const db = await this._ensureDb();
        const placeholders = toolCallIds.map(() => '?').join(',');
        const rows = await dbAll(db, `SELECT turn_id, tool_call_id, file_path, edit_type, original_path, added_lines, removed_lines
				FROM file_edits
				WHERE tool_call_id IN (${placeholders})
				ORDER BY rowid`, toolCallIds);
        return rows.map(row => ({
            turnId: row.turn_id,
            toolCallId: row.tool_call_id,
            filePath: row.file_path,
            kind: row.edit_type ?? 'edit',
            originalPath: row.original_path ?? undefined,
            addedLines: row.added_lines ?? undefined,
            removedLines: row.removed_lines ?? undefined,
        }));
    }
    async readFileEditContent(toolCallId, filePath) {
        return this._fileEditSequencer.queue(filePath, async () => {
            const db = await this._ensureDb();
            const row = await dbGet(db, `SELECT before_content, after_content
					FROM file_edits
					WHERE tool_call_id = ? AND file_path = ?`, [toolCallId, filePath]);
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
    async getMetadata(key) {
        const db = await this._ensureDb();
        const row = await dbGet(db, 'SELECT value FROM session_metadata WHERE key = ?', [key]);
        return row?.value;
    }
    async setMetadata(key, value) {
        const db = await this._ensureDb();
        await dbRun(db, 'INSERT OR REPLACE INTO session_metadata (key, value) VALUES (?, ?)', [key, value]);
    }
    async close() {
        await (this._closed ??= this._dbPromise?.then(db => db.close()).catch(() => { }) || true);
    }
    dispose() {
        this.close();
    }
}
function toUint8Array(value) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbkRhdGFiYXNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvc2Vzc2lvbkRhdGFiYXNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUcvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFhdkQ7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUF5QztJQUM5RTtRQUNDLE9BQU8sRUFBRSxDQUFDO1FBQ1YsR0FBRyxFQUFFO1lBQ0o7O0tBRUU7WUFDRjs7Ozs7Ozs7O0tBU0U7U0FDRixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7S0FDYjtJQUNEO1FBQ0MsT0FBTyxFQUFFLENBQUM7UUFDVixHQUFHLEVBQUU7OztJQUdIO0tBQ0Y7SUFDRDtRQUNDLE9BQU8sRUFBRSxDQUFDO1FBQ1YsR0FBRyxFQUFFO1lBQ0osa0VBQWtFO1lBQ2xFLDZDQUE2QztZQUM3Qzs7Ozs7Ozs7Ozs7S0FXRTtZQUNGOytIQUM0SDtZQUM1SCx1QkFBdUI7WUFDdkIsZ0RBQWdEO1NBQ2hELENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztLQUNiO0NBQ0QsQ0FBQztBQUVGLDhFQUE4RTtBQUU5RSxTQUFTLE1BQU0sQ0FBQyxFQUFZLEVBQUUsR0FBVztJQUN4QyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ3RDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxD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