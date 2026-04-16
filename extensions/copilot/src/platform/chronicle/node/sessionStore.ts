/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdirSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'path';
import type { CheckpointRow, FileRow, ISessionStore, RefRow, SearchResult, SessionRow, TurnRow } from '../common/sessionStore';

/**
 * SQLite authorizer action codes that are safe for read-only access.
 * Values from https://www.sqlite.org/c3ref/c_alter_table.html
 * (node:sqlite constants do not expose authorizer codes)
 */
const SQLITE_OK = 0;
const SQLITE_DENY = 1;
const SQLITE_READ = 20;
const SQLITE_SELECT = 21;
const SQLITE_FUNCTION = 31;
const SQLITE_PRAGMA = 19;
const SQLITE_RECURSIVE = 33;

const READ_ONLY_ACTION_CODES = new Set([
	SQLITE_READ, // read a column
	SQLITE_SELECT, // top-level SELECT
	SQLITE_FUNCTION, // call a function (needed for bm25(), etc.)
	SQLITE_RECURSIVE, // recursive CTE
]);

/** Schema version — bump when altering tables so existing DBs get migrated. */
const SCHEMA_VERSION = 2;

/**
 * Session store backed by SQLite + FTS5.
 *
 * Schema is identical to the copilot-agent-runtime SessionStore so that
 * tooling and queries are portable across CLI and VS Code surfaces.
 * The store is populated incrementally by live hooks — no background indexing.
 */
export class SessionStore implements ISessionStore {
	declare readonly _serviceBrand: undefined;
	private db: DatabaseSync | null = null;
	private readonly dbPath: string;

	constructor(dbPath: string) {
		this.dbPath = dbPath;
	}

	/**
	 * Get the path to the database file.
	 */
	getPath(): string {
		return this.dbPath;
	}

	/**
	 * Lazily open (or create) the database and ensure the schema exists.
	 */
	private ensureDb(): DatabaseSync {
		if (this.db) {
			return this.db;
		}

		if (this.dbPath !== ':memory:') {
			mkdirSync(dirname(this.dbPath), { recursive: true });
		}

		const db = new DatabaseSync(this.dbPath);
		try {
			db.exec('PRAGMA journal_mode = WAL');
			db.exec('PRAGMA busy_timeout = 3000');
			db.exec('PRAGMA foreign_keys = ON');
			this.db = db;
			this.ensureSchema();
		} catch (err) {
			db.close();
			this.db = null;
			throw err;
		}
		return this.db;
	}

	/**
	 * Create or migrate tables to the current schema version.
	 *
	 * IMPORTANT: When bumping SCHEMA_VERSION, add explicit migration logic
	 * for each version step (e.g., v1→v2). CREATE TABLE IF NOT EXISTS does
	 * NOT alter existing tables — use ALTER TABLE for schema changes.
	 */
	private ensureSchema(): void {
		const db = this.db!;

		const versionRow = (() => {
			try {
				const stmt = db.prepare('SELECT version FROM schema_version LIMIT 1');
				return stmt.get() as unknown as { version: number } | undefined;
			} catch {
				return undefined;
			}
		})();

		const currentVersion = versionRow?.version ?? 0;

		if (currentVersion >= SCHEMA_VERSION) {
			return;
		}

		db.exec(`
			CREATE TABLE IF NOT EXISTS schema_version (
				version INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY,
				cwd TEXT,
				repository TEXT,
				host_type TEXT,
				branch TEXT,
				summary TEXT,
				created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
				updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
			);

			CREATE TABLE IF NOT EXISTS turns (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id TEXT NOT NULL REFERENCES sessions(id),
				turn_index INTEGER NOT NULL,
				user_message TEXT,
				assistant_response TEXT,
				timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
				UNIQUE(session_id, turn_index)
			);

			CREATE TABLE IF NOT EXISTS checkpoints (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id TEXT NOT NULL REFERENCES sessions(id),
				checkpoint_number INTEGER NOT NULL,
				title TEXT,
				overview TEXT,
				history TEXT,
				work_done TEXT,
				technical_details TEXT,
				important_files TEXT,
				next_steps TEXT,
				created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
				UNIQUE(session_id, checkpoint_number)
			);

			CREATE TABLE IF NOT EXISTS session_files (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id TEXT NOT NULL REFERENCES sessions(id),
				file_path TEXT NOT NULL,
				tool_name TEXT,
				turn_index INTEGER,
				first_seen_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
				UNIQUE(session_id, file_path)
			);

			CREATE TABLE IF NOT EXISTS session_refs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id TEXT NOT NULL REFERENCES sessions(id),
				ref_type TEXT NOT NULL,
				ref_value TEXT NOT NULL,
				turn_index INTEGER,
				created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
				UNIQUE(session_id, ref_type, ref_value)
			);

			CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(repository);
			CREATE INDEX IF NOT EXISTS idx_sessions_cwd ON sessions(cwd);
			CREATE INDEX IF NOT EXISTS idx_session_files_path ON session_files(file_path);
			CREATE INDEX IF NOT EXISTS idx_session_refs_type_value ON session_refs(ref_type, ref_value);
			CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
			CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id);
		`);

		// FTS5 virtual table — CREATE VIRTUAL TABLE doesn't support IF NOT EXISTS
		// in all SQLite builds, so we guard with a check.
		const ftsExists = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'search_index\'').get();
		if (!ftsExists) {
			db.exec(`
				CREATE VIRTUAL TABLE search_index USING fts5(
					content,
					session_id UNINDEXED,
					source_type UNINDEXED,
					source_id UNINDEXED
				);
			`);
		}

		// ── Schema migrations ────────────────────────────────────────────
		if (currentVersion >= 1 && currentVersion < 2) {
			db.exec('ALTER TABLE sessions ADD COLUMN host_type TEXT');
		}

		// Update or insert schema version
		if (currentVersion === 0) {
			db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
		} else {
			db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
		}
	}

	// ── CRUD Methods ────────────────────────────────────────────────────

	/**
	 * Insert or update a session's metadata.
	 */
	upsertSession(session: SessionRow): void {
		const db = this.ensureDb();
		db.prepare(
			`INSERT INTO sessions (id, cwd, repository, host_type, branch, summary, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET
				cwd = COALESCE(excluded.cwd, cwd),
				repository = COALESCE(excluded.repository, repository),
				host_type = COALESCE(excluded.host_type, host_type),
				branch = COALESCE(excluded.branch, branch),
				summary = COALESCE(excluded.summary, summary),
				created_at = MIN(created_at, excluded.created_at),
				updated_at = MAX(updated_at, excluded.updated_at)`,
		).run(
			session.id,
			session.cwd ?? null,
			session.repository ?? null,
			session.host_type ?? null,
			session.branch ?? null,
			session.summary ?? null,
			session.created_at ?? new Date().toISOString(),
			session.updated_at ?? new Date().toISOString(),
		);
	}

	/**
	 * Insert a conversation turn and index it for full-text search.
	 */
	insertTurn(turn: TurnRow): void {
		const db = this.ensureDb();

		// Ensure session exists (lightweight upsert)
		db.prepare('INSERT OR IGNORE INTO sessions (id) VALUES (?)').run(turn.session_id);

		db.prepare(
			`INSERT INTO turns (session_id, turn_index, user_message, assistant_response, timestamp)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(session_id, turn_index) DO UPDATE SET
				user_message = COALESCE(excluded.user_message, user_message),
				assistant_response = COALESCE(excluded.assistant_response, assistant_response)`,
		).run(
			turn.session_id,
			turn.turn_index,
			turn.user_message ?? null,
			turn.assistant_response ?? null,
			turn.timestamp ?? new Date().toISOString(),
		);

		// Index searchable content
		const content = [turn.user_message, turn.assistant_response].filter(Boolean).join('\n');
		if (content) {
			const turnId = `${turn.session_id}:turn:${turn.turn_index}`;
			// Remove old FTS entry if exists, then insert new one
			db.prepare('DELETE FROM search_index WHERE source_id = ?').run(turnId);
			db.prepare(
				'INSERT INTO search_index (content, session_id, source_type, source_id) VALUES (?, ?, ?, ?)',
			).run(content, turn.session_id, 'turn', turnId);
		}
	}

	/**
	 * Insert a compaction checkpoint and index its sections for full-text search.
	 */
	insertCheckpoint(checkpoint: CheckpointRow): void {
		const db = this.ensureDb();

		// Ensure session exists
		db.prepare('INSERT OR IGNORE INTO sessions (id) VALUES (?)').run(checkpoint.session_id);

		db.prepare(
			`INSERT INTO checkpoints (session_id, checkpoint_number, title, overview, history, work_done, technical_details, important_files, next_steps, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(session_id, checkpoint_number) DO UPDATE SET
				title = COALESCE(excluded.title, title),
				overview = COALESCE(excluded.overview, overview),
				history = COALESCE(excluded.history, history),
				work_done = COALESCE(excluded.work_done, work_done),
				technical_details = COALESCE(excluded.technical_details, technical_details),
				important_files = COALESCE(excluded.important_files, important_files),
				next_steps = COALESCE(excluded.next_steps, next_steps)`,
		).run(
			checkpoint.session_id,
			checkpoint.checkpoint_number,
			checkpoint.title ?? null,
			checkpoint.overview ?? null,
			checkpoint.history ?? null,
			checkpoint.work_done ?? null,
			checkpoint.technical_details ?? null,
			checkpoint.important_files ?? null,
			checkpoint.next_steps ?? null,
			checkpoint.created_at ?? new Date().toISOString(),
		);

		// Index each non-empty section
		const sections: [string, string | undefined][] = [
			['checkpoint_overview', checkpoint.overview],
			['checkpoint_history', checkpoint.history],
			['checkpoint_work_done', checkpoint.work_done],
			['checkpoint_technical', checkpoint.technical_details],
			['checkpoint_files', checkpoint.important_files],
			['checkpoint_next_steps', checkpoint.next_steps],
		];

		for (const [sourceType, content] of sections) {
			if (!content) { continue; }
			const sourceId = `${checkpoint.session_id}:ckpt:${checkpoint.checkpoint_number}:${sourceType}`;
			db.prepare('DELETE FROM search_index WHERE source_id = ?').run(sourceId);
			db.prepare(
				'INSERT INTO search_index (content, session_id, source_type, source_id) VALUES (?, ?, ?, ?)',
			).run(content, checkpoint.session_id, sourceType, sourceId);
		}
	}

	/**
	 * Record a file touched during a session.
	 * Uses INSERT OR IGNORE so the first occurrence wins.
	 */
	insertFile(file: FileRow): void {
		const db = this.ensureDb();
		db.prepare('INSERT OR IGNORE INTO sessions (id) VALUES (?)').run(file.session_id);
		db.prepare(
			`INSERT OR IGNORE INTO session_files (session_id, file_path, tool_name, turn_index, first_seen_at)
			 VALUES (?, ?, ?, ?, ?)`,
		).run(
			file.session_id,
			file.file_path,
			file.tool_name ?? null,
			file.turn_index ?? null,
			file.first_seen_at ?? new Date().toISOString(),
		);
	}

	/**
	 * Record a reference (commit, PR, issue) for a session.
	 */
	insertRef(ref: RefRow): void {
		const db = this.ensureDb();
		db.prepare('INSERT OR IGNORE INTO sessions (id) VALUES (?)').run(ref.session_id);
		db.prepare(
			`INSERT OR IGNORE INTO session_refs (session_id, ref_type, ref_value, turn_index, created_at)
			 VALUES (?, ?, ?, ?, ?)`,
		).run(
			ref.session_id,
			ref.ref_type,
			ref.ref_value,
			ref.turn_index ?? null,
			ref.created_at ?? new Date().toISOString(),
		);
	}

	// ── Query Methods ───────────────────────────────────────────────────

	/**
	 * Index a workspace artifact (e.g. plan.md, context files) for full-text search.
	 * Content is upserted: subsequent writes to the same file replace the previous index entry.
	 */
	indexWorkspaceArtifact(sessionId: string, filePath: string, content: string): void {
		if (!content.trim()) { return; }
		const db = this.ensureDb();
		const sourceId = `${sessionId}:workspace:${filePath}`;
		db.prepare('DELETE FROM search_index WHERE source_id = ?').run(sourceId);
		db.prepare('INSERT INTO search_index (content, session_id, source_type, source_id) VALUES (?, ?, ?, ?)').run(
			content,
			sessionId,
			'workspace_artifact',
			sourceId,
		);
	}

	/**
	 * Full-text search across all indexed content (turns, checkpoint sections, and workspace artifacts).
	 * Uses FTS5 MATCH with BM25 ranking.
	 *
	 * @param query FTS5 query string (supports AND, OR, NOT, phrase "..." etc.)
	 * @param limit Maximum results to return (default 20)
	 */
	search(query: string, limit: number = 20): SearchResult[] {
		const db = this.ensureDb();
		const stmt = db.prepare(`
			SELECT content, session_id, source_type, bm25(search_index) AS rank
			FROM search_index
			WHERE search_index MATCH ?
			ORDER BY rank
			LIMIT ?
		`);
		return stmt.all(query, limit) as unknown as SearchResult[];
	}

	/**
	 * Get a session by ID.
	 */
	getSession(sessionId: string): SessionRow | undefined {
		const db = this.ensureDb();
		return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as unknown as SessionRow | undefined;
	}

	/**
	 * Get all turns for a session, ordered by turn index.
	 */
	getTurns(sessionId: string): TurnRow[] {
		const db = this.ensureDb();
		return db
			.prepare('SELECT * FROM turns WHERE session_id = ? ORDER BY turn_index')
			.all(sessionId) as unknown as TurnRow[];
	}

	/**
	 * Get all files touched in a session.
	 */
	getFiles(sessionId: string): FileRow[] {
		const db = this.ensureDb();
		return db.prepare('SELECT * FROM session_files WHERE session_id = ?').all(sessionId) as unknown as FileRow[];
	}

	/**
	 * Get all refs for a session.
	 */
	getRefs(sessionId: string): RefRow[] {
		const db = this.ensureDb();
		return db.prepare('SELECT * FROM session_refs WHERE session_id = ?').all(sessionId) as unknown as RefRow[];
	}

	/**
	 * Execute a raw read-only SQL query against the store.
	 * Uses SQLite's authorizer API to enforce read-only access at the engine level,
	 * blocking INSERT, UPDATE, DELETE, DROP, CREATE, ATTACH, PRAGMA, etc.
	 */
	executeReadOnly(sql: string): Record<string, unknown>[] {
		const db = this.ensureDb();

		// Use setAuthorizer to enforce read-only when available (Node.js 24.2+)
		const hasAuthorizer = typeof (db as DatabaseSync & { setAuthorizer?: unknown }).setAuthorizer === 'function';

		if (!hasAuthorizer) {
			// Fail closed: refuse to execute arbitrary SQL without engine-level enforcement
			throw new Error('executeReadOnly requires SQLite authorizer support (Node.js 24.2+)');
		}

		(db as DatabaseSync & { setAuthorizer: (cb: ((actionCode: number, p1: string | null) => number) | null) => void }).setAuthorizer((actionCode: number, p1: string | null) => {
			if (READ_ONLY_ACTION_CODES.has(actionCode)) {
				return SQLITE_OK;
			}
			// FTS5 internally uses PRAGMA data_version to detect DB changes
			if (actionCode === SQLITE_PRAGMA && p1 === 'data_version') {
				return SQLITE_OK;
			}
			return SQLITE_DENY;
		});

		try {
			return db.prepare(sql).all() as Record<string, unknown>[];
		} finally {
			(db as DatabaseSync & { setAuthorizer: (cb: null) => void }).setAuthorizer(null);
		}
	}

	/**
	 * Execute a read-only SQL query without authorizer enforcement.
	 * Used as a fallback when the authorizer API is unavailable (Node.js < 24.2).
	 * Callers MUST validate SQL safety before calling this method.
	 */
	executeReadOnlyFallback(sql: string): Record<string, unknown>[] {
		const db = this.ensureDb();
		return db.prepare(sql).all() as Record<string, unknown>[];
	}

	/**
	 * Get the highest turn_index for a session, or -1 if no turns exist.
	 */
	getMaxTurnIndex(sessionId: string): number {
		const db = this.ensureDb();
		const row = db
			.prepare('SELECT MAX(turn_index) as max_idx FROM turns WHERE session_id = ?')
			.get(sessionId) as unknown as { max_idx: number | null } | undefined;
		return row?.max_idx ?? -1;
	}

	/**
	 * Get basic stats about the store.
	 */
	getStats(): { sessions: number; turns: number; checkpoints: number; files: number; refs: number } {
		const db = this.ensureDb();
		const count = (table: string) =>
			(db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as unknown as { c: number }).c;
		return {
			sessions: count('sessions'),
			turns: count('turns'),
			checkpoints: count('checkpoints'),
			files: count('session_files'),
			refs: count('session_refs'),
		};
	}

	/**
	 * Run a function inside a SQLite transaction (BEGIN/COMMIT/ROLLBACK).
	 * All writes are batched into a single atomic commit, which is significantly
	 * faster than auto-committing each individual INSERT.
	 */
	runInTransaction(fn: () => void): void {
		const db = this.ensureDb();
		db.exec('BEGIN');
		try {
			fn();
			db.exec('COMMIT');
		} catch (err) {
			db.exec('ROLLBACK');
			throw err;
		}
	}

	/**
	 * Close the database connection.
	 */
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}
}
