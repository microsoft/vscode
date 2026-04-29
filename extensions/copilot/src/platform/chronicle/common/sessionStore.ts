/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';

// ── Service identifier ──────────────────────────────────────────────────────────

export const ISessionStore = createServiceIdentifier<ISessionStore>('ISessionStore');

// ── Row types (same as copilot-agent-runtime SessionStore) ──────────────────────

/**
 * Metadata for a session row.
 */
export interface SessionRow {
	id: string;
	cwd?: string;
	repository?: string;
	host_type?: string;
	branch?: string;
	summary?: string;
	agent_name?: string;
	agent_description?: string;
	created_at?: string;
	updated_at?: string;
}

/**
 * A conversation turn (user→assistant pair).
 */
export interface TurnRow {
	session_id: string;
	turn_index: number;
	user_message?: string;
	assistant_response?: string;
	timestamp?: string;
}

/**
 * A compaction checkpoint broken into sections.
 */
export interface CheckpointRow {
	session_id: string;
	checkpoint_number: number;
	title?: string;
	overview?: string;
	history?: string;
	work_done?: string;
	technical_details?: string;
	important_files?: string;
	next_steps?: string;
	created_at?: string;
}

/**
 * A file touched during a session.
 */
export interface FileRow {
	session_id: string;
	file_path: string;
	tool_name?: string;
	turn_index?: number;
	first_seen_at?: string;
}

/**
 * A reference linking a session to an external entity.
 */
export interface RefRow {
	session_id: string;
	ref_type: 'commit' | 'pr' | 'issue';
	ref_value: string;
	turn_index?: number;
	created_at?: string;
}

/**
 * A single FTS5 search result.
 */
export interface SearchResult {
	session_id: string;
	source_type: string;
	content: string;
	rank: number;
}

// ── Service interface ───────────────────────────────────────────────────────────

export interface ISessionStore {
	readonly _serviceBrand: undefined;

	/** Get the path to the database file. */
	getPath(): string;

	// ── CRUD ────────────────────────────────────────────────────────────

	/** Insert or update a session's metadata. */
	upsertSession(session: SessionRow): void;

	/** Insert a conversation turn and index it for full-text search. */
	insertTurn(turn: TurnRow): void;

	/** Insert a compaction checkpoint and index its sections for full-text search. */
	insertCheckpoint(checkpoint: CheckpointRow): void;

	/** Record a file touched during a session. First occurrence wins. */
	insertFile(file: FileRow): void;

	/** Record a reference (commit, PR, issue) for a session. */
	insertRef(ref: RefRow): void;

	/** Index a workspace artifact for full-text search. Upserts by file path. */
	indexWorkspaceArtifact(sessionId: string, filePath: string, content: string): void;

	// ── Queries ─────────────────────────────────────────────────────────

	/** Full-text search across all indexed content. */
	search(query: string, limit?: number): SearchResult[];

	/** Get a session by ID. */
	getSession(sessionId: string): SessionRow | undefined;

	/** Get all turns for a session, ordered by turn index. */
	getTurns(sessionId: string): TurnRow[];

	/** Get all files touched in a session. */
	getFiles(sessionId: string): FileRow[];

	/** Get all refs for a session. */
	getRefs(sessionId: string): RefRow[];

	/** Get the highest turn_index for a session, or -1 if none. */
	getMaxTurnIndex(sessionId: string): number;

	/** Get basic stats about the store. */
	getStats(): { sessions: number; turns: number; checkpoints: number; files: number; refs: number };

	/** Execute a raw read-only SQL query (enforced via SQLite authorizer). */
	executeReadOnly(sql: string): Record<string, unknown>[];

	/**
	 * Execute a read-only SQL query without authorizer enforcement.
	 * Used as a fallback when the authorizer API is unavailable (Node.js < 24.2).
	 * Callers MUST validate SQL safety before calling this method.
	 */
	executeReadOnlyFallback(sql: string): Record<string, unknown>[];

	/** Run a function inside a SQLite transaction. */
	runInTransaction(fn: () => void): void;

	/** Close the database connection. */
	close(): void;
}
