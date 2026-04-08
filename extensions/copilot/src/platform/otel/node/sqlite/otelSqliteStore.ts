/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdirSync } from 'fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { dirname } from 'path';
import { createServiceIdentifier } from '../../../../util/common/services';
import { CopilotChatAttr, GenAiAttr } from '../../common/genAiAttributes';
import type { ICompletedSpanData } from '../../common/otelService';

/** Schema version — bump when altering tables so existing DBs get migrated. */
const SCHEMA_VERSION = 1;

// ── Retention constants ─────────────────────────────────────────────────────────

/** Max age for span data before cleanup. */
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Max number of sessions (by conversation_id) to retain. */
const DEFAULT_MAX_SESSIONS = 100;

/**
 * Keys extracted from ICompletedSpanData.attributes and denormalized into the spans table
 * for indexed query access. The key is the SQL column name, the value is the OTel attribute key.
 */
const DENORMALIZED_ATTRS: Record<string, string> = {
	operation_name: GenAiAttr.OPERATION_NAME,
	provider_name: GenAiAttr.PROVIDER_NAME,
	agent_name: GenAiAttr.AGENT_NAME,
	conversation_id: GenAiAttr.CONVERSATION_ID,
	request_model: GenAiAttr.REQUEST_MODEL,
	response_model: GenAiAttr.RESPONSE_MODEL,
	input_tokens: GenAiAttr.USAGE_INPUT_TOKENS,
	output_tokens: GenAiAttr.USAGE_OUTPUT_TOKENS,
	cached_tokens: GenAiAttr.USAGE_CACHE_READ_INPUT_TOKENS,
	reasoning_tokens: GenAiAttr.USAGE_REASONING_TOKENS,
	tool_name: GenAiAttr.TOOL_NAME,
	tool_call_id: GenAiAttr.TOOL_CALL_ID,
	tool_type: GenAiAttr.TOOL_TYPE,
	chat_session_id: CopilotChatAttr.CHAT_SESSION_ID,
	turn_index: CopilotChatAttr.TURN_INDEX,
	ttft_ms: CopilotChatAttr.TIME_TO_FIRST_TOKEN,
};

// ── Service identifier ──────────────────────────────────────────────────────────

export const IOTelSqliteStore = createServiceIdentifier<OTelSqliteStore>('IOTelSqliteStore');

// ── Row types ───────────────────────────────────────────────────────────────────

export interface SpanRow {
	span_id: string;
	trace_id: string;
	parent_span_id: string | null;
	name: string;
	start_time_ms: number;
	end_time_ms: number;
	status_code: number;
	status_message: string | null;
	operation_name: string | null;
	provider_name: string | null;
	agent_name: string | null;
	conversation_id: string | null;
	request_model: string | null;
	response_model: string | null;
	input_tokens: number | null;
	output_tokens: number | null;
	cached_tokens: number | null;
	reasoning_tokens: number | null;
	tool_name: string | null;
	tool_call_id: string | null;
	tool_type: string | null;
	chat_session_id: string | null;
	turn_index: number | null;
	ttft_ms: number | null;
}

export interface SpanEventRow {
	id: number;
	span_id: string;
	name: string;
	timestamp_ms: number;
	attributes: string | null;
}

export interface SessionRow {
	session_id: string;
	agent_name: string | null;
	model: string | null;
	started_at: number;
	ended_at: number;
	duration_ms: number;
	span_count: number;
	llm_calls: number;
	tool_calls: number;
	total_input_tokens: number;
	total_output_tokens: number;
	total_cached_tokens: number;
}

// ── Store implementation ────────────────────────────────────────────────────────

/**
 * Always-on SQLite store for OTel span data using node:sqlite DatabaseSync.
 *
 * Subscribes to IOTelService.onDidCompleteSpan, INSERTs completed spans
 * synchronously. Write-through design — no in-memory buffering.
 *
 * Patterns from copilot-agent-runtime SessionStore:
 * - WAL mode + busy_timeout for concurrent read/write safety
 * - Schema versioning with migration table
 * - Lazy initialization (DB created on first write)
 * - Synchronous DatabaseSync API
 */
export class OTelSqliteStore {
	declare readonly _serviceBrand: undefined;
	private _db: DatabaseSync | null = null;
	private readonly _dbPath: string;

	// Cached prepared statements (created once per DB connection in _ensureDb)
	private _insertSpanStmt: StatementSync | null = null;
	private _insertAttrStmt: StatementSync | null = null;
	private _insertEventStmt: StatementSync | null = null;
	private _beginTx: StatementSync | null = null;
	private _commitTx: StatementSync | null = null;
	private _rollbackTx: StatementSync | null = null;

	constructor(dbPath: string) {
		this._dbPath = dbPath;
	}

	get dbPath(): string {
		return this._dbPath;
	}

	/**
	 * Insert a completed span and its attributes/events into the database.
	 */
	insertSpan(span: ICompletedSpanData): void {
		this._ensureDb();

		try {
			this._beginTx!.run();

			this._insertSpanStmt!.run(
				span.spanId, span.traceId, span.parentSpanId ?? null, span.name,
				span.startTime, span.endTime, span.status.code, span.status.message ?? null,
				this._attr(span, DENORMALIZED_ATTRS.operation_name),
				this._attr(span, DENORMALIZED_ATTRS.provider_name),
				this._attr(span, DENORMALIZED_ATTRS.agent_name),
				this._attr(span, DENORMALIZED_ATTRS.conversation_id),
				this._attr(span, DENORMALIZED_ATTRS.request_model),
				this._attr(span, DENORMALIZED_ATTRS.response_model),
				this._attr(span, DENORMALIZED_ATTRS.input_tokens),
				this._attr(span, DENORMALIZED_ATTRS.output_tokens),
				this._attr(span, DENORMALIZED_ATTRS.cached_tokens),
				this._attr(span, DENORMALIZED_ATTRS.reasoning_tokens),
				this._attr(span, DENORMALIZED_ATTRS.tool_name),
				this._attr(span, DENORMALIZED_ATTRS.tool_call_id),
				this._attr(span, DENORMALIZED_ATTRS.tool_type),
				this._attr(span, DENORMALIZED_ATTRS.chat_session_id),
				this._attr(span, DENORMALIZED_ATTRS.turn_index),
				this._attr(span, DENORMALIZED_ATTRS.ttft_ms),
			);

			for (const [key, value] of Object.entries(span.attributes)) {
				const serialized = Array.isArray(value) ? JSON.stringify(value) : String(value);
				this._insertAttrStmt!.run(span.spanId, key, serialized);
			}

			for (const event of span.events) {
				const eventAttrs = event.attributes ? JSON.stringify(event.attributes) : null;
				this._insertEventStmt!.run(span.spanId, event.name, event.timestamp, eventAttrs);
			}

			this._commitTx!.run();
		} catch (err) {
			try { this._rollbackTx!.run(); } catch { /* ignore */ }
			throw err;
		}
	}

	getSpansByTraceId(traceId: string): SpanRow[] {
		return this._ensureDb()
			.prepare('SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time_ms')
			.all(traceId) as unknown as SpanRow[];
	}

	getSpansByConversationId(conversationId: string): SpanRow[] {
		return this._ensureDb()
			.prepare('SELECT * FROM spans WHERE conversation_id = ? OR chat_session_id = ? ORDER BY start_time_ms')
			.all(conversationId, conversationId) as unknown as SpanRow[];
	}

	getSpanAttributes(spanId: string): Array<{ key: string; value: string | null }> {
		return this._ensureDb()
			.prepare('SELECT key, value FROM span_attributes WHERE span_id = ?')
			.all(spanId) as unknown as Array<{ key: string; value: string | null }>;
	}

	getSpanAttribute(spanId: string, key: string): string | null {
		const row = this._ensureDb()
			.prepare('SELECT value FROM span_attributes WHERE span_id = ? AND key = ?')
			.get(spanId, key) as unknown as { value: string | null } | undefined;
		return row?.value ?? null;
	}

	getSpanEvents(spanId: string): SpanEventRow[] {
		return this._ensureDb()
			.prepare('SELECT * FROM span_events WHERE span_id = ? ORDER BY timestamp_ms')
			.all(spanId) as unknown as SpanEventRow[];
	}

	getTraceIds(conversationId?: string): string[] {
		const db = this._ensureDb();
		if (conversationId) {
			const rows = db.prepare(
				'SELECT DISTINCT trace_id FROM spans WHERE conversation_id = ? OR chat_session_id = ?'
			).all(conversationId, conversationId) as unknown as Array<{ trace_id: string }>;
			return rows.map(r => r.trace_id);
		}
		return (db.prepare('SELECT DISTINCT trace_id FROM spans').all() as unknown as Array<{ trace_id: string }>)
			.map(r => r.trace_id);
	}

	/**
	 * List all sessions with aggregated metrics, ordered by most recent first.
	 * Uses the `sessions` SQL view over the spans table.
	 */
	getSessions(limit?: number): SessionRow[] {
		const sql = limit
			? 'SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?'
			: 'SELECT * FROM sessions ORDER BY started_at DESC';
		return limit
			? this._ensureDb().prepare(sql).all(limit) as unknown as SessionRow[]
			: this._ensureDb().prepare(sql).all() as unknown as SessionRow[];
	}

	/**
	 * List sessions within a time window (chronicle-style).
	 * @param sinceMs Epoch ms — only return sessions that started after this time
	 */
	getSessionsSince(sinceMs: number): SessionRow[] {
		return this._ensureDb().prepare(
			'SELECT * FROM sessions WHERE started_at >= ? ORDER BY started_at DESC'
		).all(sinceMs) as unknown as SessionRow[];
	}

	cleanup(maxAgeMs: number = DEFAULT_MAX_AGE_MS): number {
		const cutoffMs = Date.now() - maxAgeMs;
		const result = this._ensureDb().prepare('DELETE FROM spans WHERE start_time_ms < ?').run(cutoffMs);
		return Number(result.changes);
	}

	/**
	 * Checkpoint WAL to flush all pending writes into the main .db file.
	 * This must be called before copying the .db file, otherwise the copy
	 * will be missing data that lives only in the -wal file.
	 */
	checkpoint(): void {
		this._ensureDb().exec('PRAGMA wal_checkpoint(TRUNCATE)');
	}

	close(): void {
		if (this._db) {
			this._db.close();
			this._db = null;
			this._insertSpanStmt = null;
			this._insertAttrStmt = null;
			this._insertEventStmt = null;
			this._beginTx = null;
			this._commitTx = null;
			this._rollbackTx = null;
		}
	}

	// ── Private ────────────────────────────────────────────────────────────

	private _attr(span: ICompletedSpanData, attrKey: string): string | number | null {
		const val = span.attributes[attrKey];
		if (val === undefined) { return null; }
		if (Array.isArray(val)) { return JSON.stringify(val); }
		if (typeof val === 'boolean') { return val ? 1 : 0; }
		return val as string | number;
	}

	private _ensureDb(): DatabaseSync {
		if (this._db) { return this._db; }

		mkdirSync(dirname(this._dbPath), { recursive: true });

		const db = new DatabaseSync(this._dbPath);
		try {
			db.exec('PRAGMA journal_mode = WAL');
			db.exec('PRAGMA busy_timeout = 3000');
			db.exec('PRAGMA foreign_keys = ON');
			this._db = db;
			this._ensureSchema();
			this._prepareStatements(db);

			// Auto-cleanup on startup: remove spans older than 7 days,
			// then cap to the most recent DEFAULT_MAX_SESSIONS sessions by conversation_id.
			this._cleanupOnStartup(db);
		} catch (err) {
			db.close();
			this._db = null;
			throw err;
		}
		return this._db;
	}

	private _prepareStatements(db: DatabaseSync): void {
		this._insertSpanStmt = db.prepare(`
			INSERT OR REPLACE INTO spans (
				span_id, trace_id, parent_span_id, name,
				start_time_ms, end_time_ms, status_code, status_message,
				operation_name, provider_name, agent_name, conversation_id,
				request_model, response_model,
				input_tokens, output_tokens, cached_tokens, reasoning_tokens,
				tool_name, tool_call_id, tool_type,
				chat_session_id, turn_index, ttft_ms
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		this._insertAttrStmt = db.prepare(
			'INSERT OR REPLACE INTO span_attributes (span_id, key, value) VALUES (?, ?, ?)'
		);
		this._insertEventStmt = db.prepare(
			'INSERT INTO span_events (span_id, name, timestamp_ms, attributes) VALUES (?, ?, ?, ?)'
		);
		this._beginTx = db.prepare('BEGIN');
		this._commitTx = db.prepare('COMMIT');
		this._rollbackTx = db.prepare('ROLLBACK');
	}

	private _ensureSchema(): void {
		const db = this._db!;
		const versionRow = (() => {
			try {
				return db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
			} catch { return undefined; }
		})();

		if ((versionRow?.version ?? 0) >= SCHEMA_VERSION) { return; }

		db.exec(`
			CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
			INSERT OR REPLACE INTO schema_version (version) VALUES (${SCHEMA_VERSION});

			CREATE TABLE IF NOT EXISTS spans (
				span_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, parent_span_id TEXT,
				name TEXT NOT NULL, start_time_ms INTEGER NOT NULL, end_time_ms INTEGER NOT NULL,
				status_code INTEGER NOT NULL DEFAULT 0, status_message TEXT,
				operation_name TEXT, provider_name TEXT, agent_name TEXT, conversation_id TEXT,
				request_model TEXT, response_model TEXT,
				input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER, reasoning_tokens INTEGER,
				tool_name TEXT, tool_call_id TEXT, tool_type TEXT,
				chat_session_id TEXT, turn_index INTEGER, ttft_ms REAL
			);

			CREATE TABLE IF NOT EXISTS span_attributes (
				span_id TEXT NOT NULL REFERENCES spans(span_id) ON DELETE CASCADE,
				key TEXT NOT NULL, value TEXT,
				PRIMARY KEY (span_id, key)
			);

			CREATE TABLE IF NOT EXISTS span_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				span_id TEXT NOT NULL REFERENCES spans(span_id) ON DELETE CASCADE,
				name TEXT NOT NULL, timestamp_ms INTEGER NOT NULL, attributes TEXT
			);

			CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id);
			CREATE INDEX IF NOT EXISTS idx_spans_conversation ON spans(conversation_id);
			CREATE INDEX IF NOT EXISTS idx_spans_chat_session ON spans(chat_session_id);
			CREATE INDEX IF NOT EXISTS idx_spans_operation ON spans(operation_name);
			CREATE INDEX IF NOT EXISTS idx_spans_start_time ON spans(start_time_ms);
			CREATE INDEX IF NOT EXISTS idx_span_events_span ON span_events(span_id);

			-- Session view: derives session boundaries from span data.
			-- No separate sessions table needed — invoke_agent spans define session lifecycle.
			CREATE VIEW IF NOT EXISTS sessions AS
			SELECT
				COALESCE(conversation_id, chat_session_id) AS session_id,
				agent_name,
				response_model AS model,
				MIN(start_time_ms) AS started_at,
				MAX(end_time_ms) AS ended_at,
				MAX(end_time_ms) - MIN(start_time_ms) AS duration_ms,
				COUNT(*) AS span_count,
				SUM(CASE WHEN operation_name = 'chat' THEN 1 ELSE 0 END) AS llm_calls,
				SUM(CASE WHEN operation_name = 'execute_tool' THEN 1 ELSE 0 END) AS tool_calls,
				SUM(CASE WHEN operation_name = 'chat' THEN input_tokens ELSE 0 END) AS total_input_tokens,
				SUM(CASE WHEN operation_name = 'chat' THEN output_tokens ELSE 0 END) AS total_output_tokens,
				SUM(CASE WHEN operation_name = 'chat' THEN cached_tokens ELSE 0 END) AS total_cached_tokens
			FROM spans
			WHERE COALESCE(conversation_id, chat_session_id) IS NOT NULL
			GROUP BY COALESCE(conversation_id, chat_session_id);
		`);
	}

	private _cleanupOnStartup(db: DatabaseSync): void {
		// 1. Time-based: delete spans older than DEFAULT_MAX_AGE_MS
		const cutoffMs = Date.now() - DEFAULT_MAX_AGE_MS;
		db.prepare('DELETE FROM spans WHERE start_time_ms < ?').run(cutoffMs);

		// 2. Session-count cap: keep only the most recent DEFAULT_MAX_SESSIONS sessions.
		// A "session" is identified by conversation_id (or chat_session_id as fallback).
		// We find the Nth-newest session's max start_time_ms and delete everything older.
		const sessionCutoff = db.prepare(`
			SELECT MIN(max_start) AS cutoff_ms FROM (
				SELECT MAX(start_time_ms) AS max_start
				FROM spans
				WHERE COALESCE(conversation_id, chat_session_id) IS NOT NULL
				GROUP BY COALESCE(conversation_id, chat_session_id)
				ORDER BY max_start DESC
				LIMIT ?
			)
		`).get(DEFAULT_MAX_SESSIONS) as unknown as { cutoff_ms: number | null } | undefined;

		if (sessionCutoff?.cutoff_ms) {
			db.prepare(`
				DELETE FROM spans
				WHERE start_time_ms < ?
				AND COALESCE(conversation_id, chat_session_id) NOT IN (
					SELECT COALESCE(conversation_id, chat_session_id)
					FROM spans
					WHERE COALESCE(conversation_id, chat_session_id) IS NOT NULL
					GROUP BY COALESCE(conversation_id, chat_session_id)
					ORDER BY MAX(start_time_ms) DESC
					LIMIT ?
				)
			`).run(sessionCutoff.cutoff_ms, DEFAULT_MAX_SESSIONS);
		}
	}
}
