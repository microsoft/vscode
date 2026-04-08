/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import type { Database } from '@vscode/sqlite3';
import { generateUuid } from '../../../../base/common/uuid.js';
import * as path from '../../../../base/common/path.js';

// ---- Types ------------------------------------------------------------------

/**
 * A single event entry from a Copilot CLI `events.jsonl` file.
 * The Copilot CLI stores session history as a newline-delimited JSON log
 * where events form a linked list via `parentId`.
 */
export interface ICopilotEventLogEntry {
	readonly type: string;
	readonly data: Record<string, unknown>;
	readonly id: string;
	readonly timestamp: string;
	readonly parentId: string | null;
}

// ---- Promise wrappers around callback-based @vscode/sqlite3 API -----------

function dbExec(db: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => {
		db.exec(sql, err => err ? reject(err) : resolve());
	});
}

function dbRun(db: Database, sql: string, params: unknown[]): Promise<void> {
	return new Promise((resolve, reject) => {
		db.run(sql, params, function (err: Error | null) {
			if (err) {
				return reject(err);
			}
			resolve();
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

function dbOpen(dbPath: string): Promise<Database> {
	return new Promise((resolve, reject) => {
		import('@vscode/sqlite3').then(sqlite3 => {
			const db = new sqlite3.default.Database(dbPath, (err: Error | null) => {
				if (err) {
					return reject(err);
				}
				resolve(db);
			});
		}, reject);
	});
}

// ---- Pure functions (testable, no I/O) ------------------------------------

/**
 * Parses a JSONL string into an array of event log entries.
 */
export function parseEventLog(content: string): ICopilotEventLogEntry[] {
	const entries: ICopilotEventLogEntry[] = [];
	for (const line of content.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length === 0) {
			continue;
		}
		entries.push(JSON.parse(trimmed));
	}
	return entries;
}

/**
 * Serializes an array of event log entries back into a JSONL string.
 */
export function serializeEventLog(entries: readonly ICopilotEventLogEntry[]): string {
	return entries.map(e => JSON.stringify(e)).join('\n') + '\n';
}

/**
 * Finds the index of the last event that belongs to the given turn (0-based).
 *
 * A "turn" corresponds to one `user.message` event and all subsequent events
 * up to (and including) the `assistant.turn_end` that closes that interaction,
 * or the `session.shutdown` that ends the session.
 *
 * @returns The inclusive index of the last event in the specified turn,
 *          or `-1` if the turn is not found.
 */
export function findTurnBoundaryInEventLog(entries: readonly ICopilotEventLogEntry[], turnIndex: number): number {
	let userMessageCount = -1;
	let lastEventForTurn = -1;

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];

		if (entry.type === 'user.message') {
			userMessageCount++;
			if (userMessageCount > turnIndex) {
				// We've entered the next turn — stop
				return lastEventForTurn;
			}
		}

		if (userMessageCount === turnIndex) {
			lastEventForTurn = i;
		}
	}

	// If we scanned everything and the target turn was found, return its last event
	return lastEventForTurn;
}

/**
 * Builds a forked event log from the source session's events.
 *
 * - Keeps events up to and including the specified fork turn (0-based).
 * - Rewrites `session.start` with the new session ID.
 * - Generates fresh UUIDs for all events.
 * - Re-chains `parentId` links via an old→new ID map.
 * - Strips `session.shutdown` and `session.resume` lifecycle events.
 */
export function buildForkedEventLog(
	entries: readonly ICopilotEventLogEntry[],
	forkTurnIndex: number,
	newSessionId: string,
): ICopilotEventLogEntry[] {
	const boundary = findTurnBoundaryInEventLog(entries, forkTurnIndex);
	if (boundary < 0) {
		throw new Error(`Fork turn index ${forkTurnIndex} not found in event log`);
	}

	// Keep events up to boundary, filtering out lifecycle events
	const kept = entries
		.slice(0, boundary + 1)
		.filter(e => e.type !== 'session.shutdown' && e.type !== 'session.resume');

	// Build UUID remap and re-chain
	const idMap = new Map<string, string>();
	const result: ICopilotEventLogEntry[] = [];

	for (const entry of kept) {
		const newId = generateUuid();
		idMap.set(entry.id, newId);

		let data = entry.data;
		if (entry.type === 'session.start') {
			data = { ...data, sessionId: newSessionId };
		}

		const newParentId = entry.parentId !== null
			? (idMap.get(entry.parentId) ?? result[result.length - 1]?.id ?? null)
			: null;

		result.push({
			type: entry.type,
			data,
			id: newId,
			timestamp: entry.timestamp,
			parentId: newParentId,
		});
	}

	return result;
}

/**
 * Builds a truncated event log from the source session's events.
 *
 * - Keeps events up to and including the specified turn (0-based).
 * - Prepends a new `session.start` event using the original start data.
 * - Re-chains `parentId` links for remaining events.
 */
export function buildTruncatedEventLog(
	entries: readonly ICopilotEventLogEntry[],
	keepUpToTurnIndex: number,
): ICopilotEventLogEntry[] {
	const boundary = findTurnBoundaryInEventLog(entries, keepUpToTurnIndex);
	if (boundary < 0) {
		throw new Error(`Turn index ${keepUpToTurnIndex} not found in event log`);
	}

	// Find the original session.start for its metadata
	const originalStart = entries.find(e => e.type === 'session.start');
	if (!originalStart) {
		throw new Error('No session.start event found in event log');
	}

	// Keep events from after session start up to boundary, stripping lifecycle events
	const kept = entries
		.slice(0, boundary + 1)
		.filter(e => e.type !== 'session.start' && e.type !== 'session.shutdown' && e.type !== 'session.resume');

	// Build new start event
	const newStartId = generateUuid();
	const newStart: ICopilotEventLogEntry = {
		type: 'session.start',
		data: { ...originalStart.data, startTime: new Date().toISOString() },
		id: newStartId,
		timestamp: new Date().toISOString(),
		parentId: null,
	};

	// Re-chain: first remaining event points to the new start
	const idMap = new Map<string, string>();
	idMap.set(originalStart.id, newStartId);

	const result: ICopilotEventLogEntry[] = [newStart];
	let lastId = newStartId;

	for (const entry of kept) {
		const newId = generateUuid();
		idMap.set(entry.id, newId);

		const newParentId = entry.parentId !== null
			? (idMap.get(entry.parentId) ?? lastId)
			: lastId;

		result.push({
			type: entry.type,
			data: entry.data,
			id: newId,
			timestamp: entry.timestamp,
			parentId: newParentId,
		});
		lastId = newId;
	}

	return result;
}

/**
 * Generates a `workspace.yaml` file content for a Copilot CLI session.
 */
export function buildWorkspaceYaml(sessionId: string, cwd: string, summary: string): string {
	const now = new Date().toISOString();
	return [
		`id: ${sessionId}`,
		`cwd: ${cwd}`,
		`summary_count: 0`,
		`created_at: ${now}`,
		`updated_at: ${now}`,
		`summary: ${summary}`,
		'',
	].join('\n');
}

// ---- SQLite operations (Copilot CLI session-store.db) ---------------------

/**
 * Forks a session record in the Copilot CLI's `session-store.db`.
 *
 * Copies the source session's metadata, turns (up to `forkTurnIndex`),
 * session files, search index entries, and checkpoints into a new session.
 */
export async function forkSessionInDb(
	db: Database,
	sourceSessionId: string,
	newSessionId: string,
	forkTurnIndex: number,
): Promise<void> {
	await dbExec(db, 'PRAGMA foreign_keys = ON');
	await dbExec(db, 'BEGIN TRANSACTION');
	try {
		const now = new Date().toISOString();

		// Copy session row
		await dbRun(db,
			`INSERT INTO sessions (id, cwd, repository, branch, summary, created_at, updated_at, host_type)
			SELECT ?, cwd, repository, branch, summary, ?, ?, host_type
			FROM sessions WHERE id = ?`,
			[newSessionId, now, now, sourceSessionId],
		);

		// Copy turns up to fork point (turn_index is 0-based)
		await dbRun(db,
			`INSERT INTO turns (session_id, turn_index, user_message, assistant_response, timestamp)
			SELECT ?, turn_index, user_message, assistant_response, timestamp
			FROM turns
			WHERE session_id = ? AND turn_index <= ?`,
			[newSessionId, sourceSessionId, forkTurnIndex],
		);

		// Copy session files that were first seen at or before the fork point
		await dbRun(db,
			`INSERT INTO session_files (session_id, file_path, tool_name, turn_index, first_seen_at)
			SELECT ?, file_path, tool_name, turn_index, first_seen_at
			FROM session_files
			WHERE session_id = ? AND turn_index <= ?`,
			[newSessionId, sourceSessionId, forkTurnIndex],
		);

		// Copy search index entries for kept turns only.
		// source_id format is "<session_id>:turn:<turn_index>"; filter by
		// parsing the turn index so we don't leak content from later turns.
		await dbAll(db,
			`SELECT content, source_type, source_id
			FROM search_index
			WHERE session_id = ? AND source_type = 'turn'`,
			[sourceSessionId],
		).then(async rows => {
			const prefix = `${sourceSessionId}:turn:`;
			for (const row of rows) {
				const sourceId = row.source_id as string;
				if (sourceId.startsWith(prefix)) {
					const turnIdx = parseInt(sourceId.substring(prefix.length), 10);
					if (!isNaN(turnIdx) && turnIdx <= forkTurnIndex) {
						const newSourceId = sourceId.replace(sourceSessionId, newSessionId);
						await dbRun(db,
							`INSERT INTO search_index (content, session_id, source_type, source_id)
							VALUES (?, ?, ?, ?)`,
							[row.content, newSessionId, row.source_type, newSourceId],
						);
					}
				}
			}
		});

		// Copy checkpoints at or before the fork point.
		// checkpoint_number is 1-based and correlates to turns, so we keep
		// only those where checkpoint_number <= forkTurnIndex + 1.
		await dbRun(db,
			`INSERT INTO checkpoints (session_id, checkpoint_number, title, overview, history, work_done, technical_details, important_files, next_steps, created_at)
			SELECT ?, checkpoint_number, title, overview, history, work_done, technical_details, important_files, next_steps, created_at
			FROM checkpoints
			WHERE session_id = ? AND checkpoint_number <= ?`,
			[newSessionId, sourceSessionId, forkTurnIndex + 1],
		);

		await dbExec(db, 'COMMIT');
	} catch (err) {
		await dbExec(db, 'ROLLBACK');
		throw err;
	}
}

/**
 * Truncates a session in the Copilot CLI's `session-store.db`.
 *
 * Removes all turns after `keepUpToTurnIndex` and updates session metadata.
 */
export async function truncateSessionInDb(
	db: Database,
	sessionId: string,
	keepUpToTurnIndex: number,
): Promise<void> {
	await dbExec(db, 'PRAGMA foreign_keys = ON');
	await dbExec(db, 'BEGIN TRANSACTION');
	try {
		const now = new Date().toISOString();

		// Delete turns after the truncation point
		await dbRun(db,
			`DELETE FROM turns WHERE session_id = ? AND turn_index > ?`,
			[sessionId, keepUpToTurnIndex],
		);

		// Update session timestamp
		await dbRun(db,
			`UPDATE sessions SET updated_at = ? WHERE id = ?`,
			[now, sessionId],
		);

		// Remove search index entries for removed turns
		// source_id format is "<session_id>:turn:<turn_index>"
		await dbAll(db,
			`SELECT source_id FROM search_index
			WHERE session_id = ? AND source_type = 'turn'`,
			[sessionId],
		).then(async rows => {
			const prefix = `${sessionId}:turn:`;
			for (const row of rows) {
				const sourceId = row.source_id as string;
				if (sourceId.startsWith(prefix)) {
					const turnIdx = parseInt(sourceId.substring(prefix.length), 10);
					if (!isNaN(turnIdx) && turnIdx > keepUpToTurnIndex) {
						await dbRun(db,
							`DELETE FROM search_index WHERE source_id = ? AND session_id = ?`,
							[sourceId, sessionId],
						);
					}
				}
			}
		});

		await dbExec(db, 'COMMIT');
	} catch (err) {
		await dbExec(db, 'ROLLBACK');
		throw err;
	}
}

// ---- File system operations -----------------------------------------------

/**
 * Resolves the Copilot CLI data directory.
 * The Copilot CLI stores its data in `~/.copilot/` by default, or in the
 * directory specified by `COPILOT_CONFIG_DIR`.
 */
export function getCopilotDataDir(): string {
	return process.env['COPILOT_CONFIG_DIR'] ?? path.join(os.homedir(), '.copilot');
}

/**
 * Forks a Copilot CLI session on disk.
 *
 * 1. Reads the source session's `events.jsonl`
 * 2. Builds a forked event log
 * 3. Creates the new session folder with all required files/directories
 * 4. Updates the `session-store.db`
 *
 * @param copilotDataDir Path to the `.copilot` directory
 * @param sourceSessionId UUID of the source session to fork from
 * @param newSessionId UUID for the new forked session
 * @param forkTurnIndex 0-based turn index to fork at (inclusive)
 */
export async function forkCopilotSessionOnDisk(
	copilotDataDir: string,
	sourceSessionId: string,
	newSessionId: string,
	forkTurnIndex: number,
): Promise<void> {
	const sessionStateDir = path.join(copilotDataDir, 'session-state');

	// Read source events
	const sourceEventsPath = path.join(sessionStateDir, sourceSessionId, 'events.jsonl');
	const sourceContent = await fs.promises.readFile(sourceEventsPath, 'utf-8');
	const sourceEntries = parseEventLog(sourceContent);

	// Build forked event log
	const forkedEntries = buildForkedEventLog(sourceEntries, forkTurnIndex, newSessionId);

	// Read source workspace.yaml for cwd/summary
	let cwd = '';
	let summary = '';
	try {
		const workspaceYamlPath = path.join(sessionStateDir, sourceSessionId, 'workspace.yaml');
		const yamlContent = await fs.promises.readFile(workspaceYamlPath, 'utf-8');
		const cwdMatch = yamlContent.match(/^cwd:\s*(.+)$/m);
		const summaryMatch = yamlContent.match(/^summary:\s*(.+)$/m);
		if (cwdMatch) {
			cwd = cwdMatch[1].trim();
		}
		if (summaryMatch) {
			summary = summaryMatch[1].trim();
		}
	} catch {
		// Fall back to session.start data
		const startEvent = sourceEntries.find(e => e.type === 'session.start');
		if (startEvent) {
			const ctx = startEvent.data.context as Record<string, string> | undefined;
			cwd = ctx?.cwd ?? '';
		}
	}

	// Create new session folder structure
	const newSessionDir = path.join(sessionStateDir, newSessionId);
	await fs.promises.mkdir(path.join(newSessionDir, 'checkpoints'), { recursive: true });
	await fs.promises.mkdir(path.join(newSessionDir, 'files'), { recursive: true });
	await fs.promises.mkdir(path.join(newSessionDir, 'research'), { recursive: true });

	// Write events.jsonl
	await fs.promises.writeFile(
		path.join(newSessionDir, 'events.jsonl'),
		serializeEventLog(forkedEntries),
		'utf-8',
	);

	// Write workspace.yaml
	await fs.promises.writeFile(
		path.join(newSessionDir, 'workspace.yaml'),
		buildWorkspaceYaml(newSessionId, cwd, summary),
		'utf-8',
	);

	// Write empty vscode.metadata.json
	await fs.promises.writeFile(
		path.join(newSessionDir, 'vscode.metadata.json'),
		'{}',
		'utf-8',
	);

	// Write empty checkpoints index
	await fs.promises.writeFile(
		path.join(newSessionDir, 'checkpoints', 'index.md'),
		'',
		'utf-8',
	);

	// Update session-store.db
	const dbPath = path.join(copilotDataDir, 'session-store.db');
	const db = await dbOpen(dbPath);
	try {
		await forkSessionInDb(db, sourceSessionId, newSessionId, forkTurnIndex);
	} finally {
		await dbClose(db);
	}
}

/**
 * Truncates a Copilot CLI session on disk.
 *
 * 1. Reads the session's `events.jsonl`
 * 2. Builds a truncated event log
 * 3. Overwrites `events.jsonl` and updates `workspace.yaml`
 * 4. Updates the `session-store.db`
 *
 * @param copilotDataDir Path to the `.copilot` directory
 * @param sessionId UUID of the session to truncate
 * @param keepUpToTurnIndex 0-based turn index to keep up to (inclusive)
 */
export async function truncateCopilotSessionOnDisk(
	copilotDataDir: string,
	sessionId: string,
	keepUpToTurnIndex: number,
): Promise<void> {
	const sessionStateDir = path.join(copilotDataDir, 'session-state');
	const sessionDir = path.join(sessionStateDir, sessionId);

	// Read and truncate events
	const eventsPath = path.join(sessionDir, 'events.jsonl');
	const content = await fs.promises.readFile(eventsPath, 'utf-8');
	const entries = parseEventLog(content);

	let truncatedEntries: ICopilotEventLogEntry[];
	if (keepUpToTurnIndex < 0) {
		// Truncate all turns: keep only a fresh session.start event
		const originalStart = entries.find(e => e.type === 'session.start');
		if (!originalStart) {
			throw new Error('No session.start event found in event log');
		}
		truncatedEntries = [{
			type: 'session.start',
			data: { ...originalStart.data, startTime: new Date().toISOString() },
			id: generateUuid(),
			timestamp: new Date().toISOString(),
			parentId: null,
		}];
	} else {
		truncatedEntries = buildTruncatedEventLog(entries, keepUpToTurnIndex);
	}

	// Overwrite events.jsonl
	await fs.promises.writeFile(eventsPath, serializeEventLog(truncatedEntries), 'utf-8');

	// Update workspace.yaml timestamp
	try {
		const yamlPath = path.join(sessionDir, 'workspace.yaml');
		let yaml = await fs.promises.readFile(yamlPath, 'utf-8');
		yaml = yaml.replace(/^updated_at:\s*.+$/m, `updated_at: ${new Date().toISOString()}`);
		await fs.promises.writeFile(yamlPath, yaml, 'utf-8');
	} catch {
		// workspace.yaml may not exist (old format)
	}

	// Update session-store.db
	const dbPath = path.join(copilotDataDir, 'session-store.db');
	const db = await dbOpen(dbPath);
	try {
		await truncateSessionInDb(db, sessionId, keepUpToTurnIndex);
	} finally {
		await dbClose(db);
	}
}

/**
 * Maps a protocol turn ID to a 0-based turn index by finding the turn's
 * position within the session's event log.
 *
 * The protocol state assigns arbitrary string IDs to turns, but the Copilot
 * CLI's `events.jsonl` uses sequential `user.message` events. To bridge the
 * two, we match turns by their position in the sequence.
 *
 * @returns The 0-based turn index, or `-1` if the turn ID is not found in the
 *          `turnIds` array.
 */
export function turnIdToIndex(turnIds: readonly string[], turnId: string): number {
	return turnIds.indexOf(turnId);
}
