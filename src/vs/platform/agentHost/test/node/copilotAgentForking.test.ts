/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	parseEventLog,
	serializeEventLog,
	findTurnBoundaryInEventLog,
	buildForkedEventLog,
	buildTruncatedEventLog,
	buildWorkspaceYaml,
	forkSessionInDb,
	truncateSessionInDb,
	type ICopilotEventLogEntry,
} from '../../node/copilot/copilotAgentForking.js';

// ---- Test helpers -----------------------------------------------------------

function makeEntry(type: string, overrides?: Partial<ICopilotEventLogEntry>): ICopilotEventLogEntry {
	return {
		type,
		data: {},
		id: `id-${Math.random().toString(36).slice(2, 8)}`,
		timestamp: new Date().toISOString(),
		parentId: null,
		...overrides,
	};
}

/**
 * Builds a minimal event log representing a multi-turn session.
 * Each turn = user.message → assistant.turn_start → assistant.message → assistant.turn_end.
 */
function buildTestEventLog(turnCount: number): ICopilotEventLogEntry[] {
	const entries: ICopilotEventLogEntry[] = [];
	let lastId: string | null = null;

	const sessionStart = makeEntry('session.start', {
		id: 'session-start-id',
		data: { sessionId: 'source-session', context: { cwd: '/test' } },
		parentId: null,
	});
	entries.push(sessionStart);
	lastId = sessionStart.id;

	for (let turn = 0; turn < turnCount; turn++) {
		const userMsg = makeEntry('user.message', {
			id: `user-msg-${turn}`,
			data: { content: `Turn ${turn} message` },
			parentId: lastId,
		});
		entries.push(userMsg);
		lastId = userMsg.id;

		const turnStart = makeEntry('assistant.turn_start', {
			id: `turn-start-${turn}`,
			data: { turnId: String(turn) },
			parentId: lastId,
		});
		entries.push(turnStart);
		lastId = turnStart.id;

		const assistantMsg = makeEntry('assistant.message', {
			id: `assistant-msg-${turn}`,
			data: { content: `Response ${turn}` },
			parentId: lastId,
		});
		entries.push(assistantMsg);
		lastId = assistantMsg.id;

		const turnEnd = makeEntry('assistant.turn_end', {
			id: `turn-end-${turn}`,
			parentId: lastId,
		});
		entries.push(turnEnd);
		lastId = turnEnd.id;
	}

	return entries;
}

suite('CopilotAgentForking', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- parseEventLog / serializeEventLog ------------------------------

	suite('parseEventLog', () => {

		test('parses a single-line JSONL', () => {
			const entry = makeEntry('session.start');
			const jsonl = JSON.stringify(entry);
			const result = parseEventLog(jsonl);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].type, 'session.start');
		});

		test('parses multi-line JSONL', () => {
			const entries = [makeEntry('session.start'), makeEntry('user.message')];
			const jsonl = entries.map(e => JSON.stringify(e)).join('\n');
			const result = parseEventLog(jsonl);
			assert.strictEqual(result.length, 2);
		});

		test('ignores empty lines', () => {
			const entry = makeEntry('session.start');
			const jsonl = '\n' + JSON.stringify(entry) + '\n\n';
			const result = parseEventLog(jsonl);
			assert.strictEqual(result.length, 1);
		});

		test('empty input returns empty array', () => {
			assert.deepStrictEqual(parseEventLog(''), []);
			assert.deepStrictEqual(parseEventLog('\n\n'), []);
		});
	});

	suite('serializeEventLog', () => {

		test('round-trips correctly', () => {
			const entries = buildTestEventLog(2);
			const serialized = serializeEventLog(entries);
			const parsed = parseEventLog(serialized);
			assert.strictEqual(parsed.length, entries.length);
			for (let i = 0; i < entries.length; i++) {
				assert.strictEqual(parsed[i].id, entries[i].id);
				assert.strictEqual(parsed[i].type, entries[i].type);
			}
		});

		test('ends with a newline', () => {
			const entries = [makeEntry('session.start')];
			const serialized = serializeEventLog(entries);
			assert.ok(serialized.endsWith('\n'));
		});
	});

	// ---- findTurnBoundaryInEventLog -------------------------------------

	suite('findTurnBoundaryInEventLog', () => {

		test('finds first turn boundary', () => {
			const entries = buildTestEventLog(3);
			const boundary = findTurnBoundaryInEventLog(entries, 0);
			// Turn 0: user.message(1) + turn_start(2) + assistant.message(3) + turn_end(4)
			// Index 4 = turn_end of turn 0
			assert.strictEqual(boundary, 4);
			assert.strictEqual(entries[boundary].type, 'assistant.turn_end');
			assert.strictEqual(entries[boundary].id, 'turn-end-0');
		});

		test('finds middle turn boundary', () => {
			const entries = buildTestEventLog(3);
			const boundary = findTurnBoundaryInEventLog(entries, 1);
			// Turn 1 ends at index 8
			assert.strictEqual(boundary, 8);
			assert.strictEqual(entries[boundary].type, 'assistant.turn_end');
			assert.strictEqual(entries[boundary].id, 'turn-end-1');
		});

		test('finds last turn boundary', () => {
			const entries = buildTestEventLog(3);
			const boundary = findTurnBoundaryInEventLog(entries, 2);
			assert.strictEqual(boundary, entries.length - 1);
			assert.strictEqual(entries[boundary].type, 'assistant.turn_end');
			assert.strictEqual(entries[boundary].id, 'turn-end-2');
		});

		test('returns -1 for non-existent turn', () => {
			const entries = buildTestEventLog(2);
			assert.strictEqual(findTurnBoundaryInEventLog(entries, 5), -1);
		});

		test('returns -1 for empty log', () => {
			assert.strictEqual(findTurnBoundaryInEventLog([], 0), -1);
		});
	});

	// ---- buildForkedEventLog --------------------------------------------

	suite('buildForkedEventLog', () => {

		test('forks at turn 0', () => {
			const entries = buildTestEventLog(3);
			const forked = buildForkedEventLog(entries, 0, 'new-session-id');

			// Should have session.start + turn 0 events (user.message, turn_start, assistant.message, turn_end)
			assert.strictEqual(forked.length, 5);
			assert.strictEqual(forked[0].type, 'session.start');
			assert.strictEqual((forked[0].data as Record<string, unknown>).sessionId, 'new-session-id');
		});

		test('forks at turn 1', () => {
			const entries = buildTestEventLog(3);
			const forked = buildForkedEventLog(entries, 1, 'new-session-id');

			// session.start + 2 turns × 4 events = 9 events
			assert.strictEqual(forked.length, 9);
		});

		test('generates unique UUIDs', () => {
			const entries = buildTestEventLog(2);
			const forked = buildForkedEventLog(entries, 0, 'new-session-id');

			const ids = new Set(forked.map(e => e.id));
			assert.strictEqual(ids.size, forked.length, 'All IDs should be unique');

			// None should match the original
			for (const entry of forked) {
				assert.ok(!entries.some(e => e.id === entry.id), 'Should not reuse original IDs');
			}
		});

		test('re-chains parentId links', () => {
			const entries = buildTestEventLog(2);
			const forked = buildForkedEventLog(entries, 0, 'new-session-id');

			// First event has no parent
			assert.strictEqual(forked[0].parentId, null);

			// Each subsequent event's parentId should be a valid ID in the forked log
			const idSet = new Set(forked.map(e => e.id));
			for (let i = 1; i < forked.length; i++) {
				assert.ok(
					forked[i].parentId !== null && idSet.has(forked[i].parentId!),
					`Event ${i} (${forked[i].type}) should have a valid parentId`,
				);
			}
		});

		test('strips session.shutdown and session.resume events', () => {
			const entries = buildTestEventLog(2);
			// Insert lifecycle events
			entries.splice(5, 0, makeEntry('session.shutdown', { parentId: entries[4].id }));
			entries.splice(6, 0, makeEntry('session.resume', { parentId: entries[5].id }));

			const forked = buildForkedEventLog(entries, 1, 'new-session-id');
			assert.ok(!forked.some(e => e.type === 'session.shutdown'));
			assert.ok(!forked.some(e => e.type === 'session.resume'));
		});

		test('throws for invalid turn index', () => {
			const entries = buildTestEventLog(1);
			assert.throws(() => buildForkedEventLog(entries, 5, 'new-session-id'));
		});

		test('falls back to last kept event when lifecycle event parent is stripped', () => {
			const entries = buildTestEventLog(2);
			// Insert shutdown event between turns, then make the next turn's
			// user.message point to the shutdown event (which will be stripped)
			const shutdownEntry = makeEntry('session.shutdown', {
				id: 'shutdown-1',
				parentId: entries[4].id, // turn-end-0
			});
			entries.splice(5, 0, shutdownEntry);
			// Next entry (user-msg-1) now points to the shutdown event
			entries[6] = { ...entries[6], parentId: 'shutdown-1' };

			const forked = buildForkedEventLog(entries, 1, 'new-session-id');

			// All parentIds should be valid
			const idSet = new Set(forked.map(e => e.id));
			for (let i = 1; i < forked.length; i++) {
				assert.ok(
					forked[i].parentId !== null && idSet.has(forked[i].parentId!),
					`Event ${i} (${forked[i].type}) should have a valid parentId, got ${forked[i].parentId}`,
				);
			}
		});
	});

	// ---- buildTruncatedEventLog -----------------------------------------

	suite('buildTruncatedEventLog', () => {

		test('truncates to turn 0', () => {
			const entries = buildTestEventLog(3);
			const truncated = buildTruncatedEventLog(entries, 0);

			// New session.start + turn 0 events (user.message, turn_start, assistant.message, turn_end)
			assert.strictEqual(truncated.length, 5);
			assert.strictEqual(truncated[0].type, 'session.start');
		});

		test('truncates to turn 1', () => {
			const entries = buildTestEventLog(3);
			const truncated = buildTruncatedEventLog(entries, 1);

			// New session.start + 2 turns × 4 events = 9 events
			assert.strictEqual(truncated.length, 9);
		});

		test('prepends fresh session.start', () => {
			const entries = buildTestEventLog(2);
			const truncated = buildTruncatedEventLog(entries, 0);

			assert.strictEqual(truncated[0].type, 'session.start');
			assert.strictEqual(truncated[0].parentId, null);
			// Should not reuse original session.start ID
			assert.notStrictEqual(truncated[0].id, entries[0].id);
		});

		test('re-chains parentId links', () => {
			const entries = buildTestEventLog(2);
			const truncated = buildTruncatedEventLog(entries, 0);

			const idSet = new Set(truncated.map(e => e.id));
			for (let i = 1; i < truncated.length; i++) {
				assert.ok(
					truncated[i].parentId !== null && idSet.has(truncated[i].parentId!),
					`Event ${i} (${truncated[i].type}) should have a valid parentId`,
				);
			}
		});

		test('strips lifecycle events', () => {
			const entries = buildTestEventLog(3);
			// Add lifecycle events between turns
			entries.splice(5, 0, makeEntry('session.shutdown'));
			entries.splice(6, 0, makeEntry('session.resume'));

			const truncated = buildTruncatedEventLog(entries, 2);
			const lifecycleEvents = truncated.filter(
				e => e.type === 'session.shutdown' || e.type === 'session.resume',
			);
			assert.strictEqual(lifecycleEvents.length, 0);
		});

		test('throws for invalid turn index', () => {
			const entries = buildTestEventLog(1);
			assert.throws(() => buildTruncatedEventLog(entries, 5));
		});

		test('throws when no session.start exists', () => {
			const entries = [makeEntry('user.message')];
			assert.throws(() => buildTruncatedEventLog(entries, 0));
		});
	});

	// ---- buildWorkspaceYaml ---------------------------------------------

	suite('buildWorkspaceYaml', () => {

		test('contains required fields', () => {
			const yaml = buildWorkspaceYaml('test-id', '/home/user/project', 'Test summary');
			assert.ok(yaml.includes('id: test-id'));
			assert.ok(yaml.includes('cwd: /home/user/project'));
			assert.ok(yaml.includes('summary: Test summary'));
			assert.ok(yaml.includes('summary_count: 0'));
			assert.ok(yaml.includes('created_at:'));
			assert.ok(yaml.includes('updated_at:'));
		});
	});

	// ---- SQLite operations (in-memory) ----------------------------------

	suite('forkSessionInDb', () => {

		async function openTestDb(): Promise<import('@vscode/sqlite3').Database> {
			const sqlite3 = await import('@vscode/sqlite3');
			return new Promise((resolve, reject) => {
				const db = new sqlite3.default.Database(':memory:', (err: Error | null) => {
					if (err) {
						return reject(err);
					}
					resolve(db);
				});
			});
		}

		function exec(db: import('@vscode/sqlite3').Database, sql: string): Promise<void> {
			return new Promise((resolve, reject) => {
				db.exec(sql, err => err ? reject(err) : resolve());
			});
		}

		function all(db: import('@vscode/sqlite3').Database, sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
			return new Promise((resolve, reject) => {
				db.all(sql, params, (err: Error | null, rows: Record<string, unknown>[]) => {
					if (err) {
						return reject(err);
					}
					resolve(rows);
				});
			});
		}

		function close(db: import('@vscode/sqlite3').Database): Promise<void> {
			return new Promise((resolve, reject) => {
				db.close(err => err ? reject(err) : resolve());
			});
		}

		async function setupSchema(db: import('@vscode/sqlite3').Database): Promise<void> {
			await exec(db, `
				CREATE TABLE sessions (
					id TEXT PRIMARY KEY,
					cwd TEXT,
					repository TEXT,
					branch TEXT,
					summary TEXT,
					created_at TEXT,
					updated_at TEXT,
					host_type TEXT
				);
				CREATE TABLE turns (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					session_id TEXT NOT NULL,
					turn_index INTEGER NOT NULL,
					user_message TEXT,
					assistant_response TEXT,
					timestamp TEXT,
					UNIQUE(session_id, turn_index)
				);
				CREATE TABLE session_files (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					session_id TEXT NOT NULL,
					file_path TEXT,
					tool_name TEXT,
					turn_index INTEGER,
					first_seen_at TEXT
				);
				CREATE VIRTUAL TABLE search_index USING fts5(
					content,
					session_id,
					source_type,
					source_id
				);
				CREATE TABLE checkpoints (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					session_id TEXT NOT NULL,
					checkpoint_number INTEGER,
					title TEXT,
					overview TEXT,
					history TEXT,
					work_done TEXT,
					technical_details TEXT,
					important_files TEXT,
					next_steps TEXT,
					created_at TEXT
				);
			`);
		}

		async function seedTestData(db: import('@vscode/sqlite3').Database, sessionId: string, turnCount: number): Promise<void> {
			await exec(db, `
				INSERT INTO sessions (id, cwd, repository, branch, summary, created_at, updated_at, host_type)
				VALUES ('${sessionId}', '/test', 'test-repo', 'main', 'Test session', '2026-01-01', '2026-01-01', 'github');
			`);
			for (let i = 0; i < turnCount; i++) {
				await exec(db, `
					INSERT INTO turns (session_id, turn_index, user_message, assistant_response, timestamp)
					VALUES ('${sessionId}', ${i}, 'msg ${i}', 'resp ${i}', '2026-01-01');
				`);
				await exec(db, `
					INSERT INTO session_files (session_id, file_path, tool_name, turn_index, first_seen_at)
					VALUES ('${sessionId}', 'file${i}.ts', 'edit', ${i}, '2026-01-01');
				`);
			}
		}

		test('copies session metadata', async () => {
			const db = await openTestDb();
			try {
				await setupSchema(db);
				await seedTestData(db, 'source', 3);

				await forkSessionInDb(db, 'source', 'forked', 1);

				const sessions = await all(db, 'SELECT * FROM sessions WHERE id = ?', ['forked']);
				assert.strictEqual(sessions.length, 1);
				assert.strictEqual(sessions[0].cwd, '/test');
				assert.strictEqual(sessions[0].repository, 'test-repo');
			} finally {
				await close(db);
			}
		});

		test('copies turns up to fork point', async () => {
			const db = await openTestDb();
			try {
				await setupSchema(db);
				await seedTestData(db, 'source', 3);

				await forkSessionInDb(db, 'source', 'forked', 1);

				const turns = await all(db, 'SELECT * FROM turns WHERE session_id = ? ORDER BY turn_index', ['forked']);
				assert.strictEqual(turns.length, 2); // turns 0 and 1
				assert.strictEqual(turns[0].turn_index, 0);
				assert.strictEqual(turns[1].turn_index, 1);
			} finally {
				await close(db);
			}
		});

		test('copies session files up to fork point', async () => {
			const db = await openTestDb();
			try {
				await setupSchema(db);
				await seedTestData(db, 'source', 3);

				await forkSessionInDb(db, 'source', 'forked', 1);

				const files = await all(db, 'SELECT * FROM session_files WHERE session_id = ?', ['forked']);
				assert.strictEqual(files.length, 2); // files from turns 0 and 1
			} finally {
				await close(db);
			}
		});

		test('does not affect source session', async () => {
			const db = await openTestDb();
			try {
				await setupSchema(db);
				await seedTestData(db, 'source', 3);

				await forkSessionInDb(db, 'source', 'forked', 1);

				const sourceTurns = await all(db, 'SELECT * FROM turns WHERE session_id = ?', ['source']);
				assert.strictEqual(sourceTurns.length, 3);
			} finally {
				await close(db);
			}
		});
	});

	suite('truncateSessionInDb', () => {

		async function openTestDb(): Promise<import('@vscode/sqlite3').Database> {
			const sqlite3 = await import('@vscode/sqlite3');
			return new Promise((resolve, reject) => {
				const db = new sqlite3.default.Database(':memory:', (err: Error | null) => {
					if (err) {
						return reject(err);
					}
					resolve(db);
				});
			});
		}

		function exec(db: import('@vscode/sqlite3').Database, sql: string): Promise<void> {
			return new Promise((resolve, reject) => {
				db.exec(sql, err => err ? reject(err) : resolve());
			});
		}

		function all(db: import('@vscode/sqlite3').Database, sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
			return new Promise((resolve, reject) => {
				db.all(sql, params, (err: Error | null, rows: Record<string, unknown>[]) => {
					if (err) {
						return reject(err);
					}
					resolve(rows);
				});
			});
		}

		function close(db: import('@vscode/sqlite3').Database): Promise<void> {
			return new Promise((resolve, reject) => {
				db.close(err => err ? reject(err) : resolve());
			});
		}

		async function setupSchema(db: import('@vscode/sqlite3').Database): Promise<void> {
			await exec(db, `
				CREATE TABLE sessions (
					id TEXT PRIMARY KEY,
					cwd TEXT,
					repository TEXT,
					branch TEXT,
					summary TEXT,
					created_at TEXT,
					updated_at TEXT,
					host_type TEXT
				);
				CREATE TABLE turns (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					session_id TEXT NOT NULL,
					turn_index INTEGER NOT NULL,
					user_message TEXT,
					assistant_response TEXT,
					timestamp TEXT,
					UNIQUE(session_id, turn_index)
				);
				CREATE VIRTUAL TABLE search_index USING fts5(
					content,
					session_id,
					source_type,
					source_id
				);
			`);
		}

		test('removes turns after truncation point', async () => {
			const db = await openTestDb();
			try {
				await setupSchema(db);
				await exec(db, `
					INSERT INTO sessions (id, cwd, summary, created_at, updated_at)
					VALUES ('sess', '/test', 'Test', '2026-01-01', '2026-01-01');
				`);
				for (let i = 0; i < 5; i++) {
					await exec(db, `
						INSERT INTO turns (session_id, turn_index, user_message, timestamp)
						VALUES ('sess', ${i}, 'msg ${i}', '2026-01-01');
					`);
				}

				await truncateSessionInDb(db, 'sess', 2);

				const turns = await all(db, 'SELECT * FROM turns WHERE session_id = ? ORDER BY turn_index', ['sess']);
				assert.strictEqual(turns.length, 3); // turns 0, 1, 2
				assert.strictEqual(turns[0].turn_index, 0);
				assert.strictEqual(turns[2].turn_index, 2);
			} finally {
				await close(db);
			}
		});

		test('updates session timestamp', async () => {
			const db = await openTestDb();
			try {
				await setupSchema(db);
				await exec(db, `
					INSERT INTO sessions (id, cwd, summary, created_at, updated_at)
					VALUES ('sess', '/test', 'Test', '2026-01-01', '2026-01-01');
				`);
				await exec(db, `
					INSERT INTO turns (session_id, turn_index, user_message, timestamp)
					VALUES ('sess', 0, 'msg 0', '2026-01-01');
				`);

				await truncateSessionInDb(db, 'sess', 0);

				const sessions = await all(db, 'SELECT updated_at FROM sessions WHERE id = ?', ['sess']);
				assert.notStrictEqual(sessions[0].updated_at, '2026-01-01');
			} finally {
				await close(db);
			}
		});

		test('removes search index entries for truncated turns', async () => {
			const db = await openTestDb();
			try {
				await setupSchema(db);
				await exec(db, `
					INSERT INTO sessions (id, cwd, summary, created_at, updated_at)
					VALUES ('sess', '/test', 'Test', '2026-01-01', '2026-01-01');
				`);
				for (let i = 0; i < 3; i++) {
					await exec(db, `
						INSERT INTO turns (session_id, turn_index, user_message, timestamp)
						VALUES ('sess', ${i}, 'msg ${i}', '2026-01-01');
					`);
					await exec(db, `
						INSERT INTO search_index (content, session_id, source_type, source_id)
						VALUES ('content ${i}', 'sess', 'turn', 'sess:turn:${i}');
					`);
				}

				await truncateSessionInDb(db, 'sess', 0);

				const searchEntries = await all(db, 'SELECT * FROM search_index WHERE session_id = ?', ['sess']);
				assert.strictEqual(searchEntries.length, 1);
				assert.strictEqual(searchEntries[0].source_id, 'sess:turn:0');
			} finally {
				await close(db);
			}
		});

		test('removes all turns when keepUpToTurnIndex is -1', async () => {
			const db = await openTestDb();
			try {
				await setupSchema(db);
				await exec(db, `
					INSERT INTO sessions (id, cwd, summary, created_at, updated_at)
					VALUES ('sess', '/test', 'Test', '2026-01-01', '2026-01-01');
				`);
				for (let i = 0; i < 3; i++) {
					await exec(db, `
						INSERT INTO turns (session_id, turn_index, user_message, timestamp)
						VALUES ('sess', ${i}, 'msg ${i}', '2026-01-01');
					`);
					await exec(db, `
						INSERT INTO search_index (content, session_id, source_type, source_id)
						VALUES ('content ${i}', 'sess', 'turn', 'sess:turn:${i}');
					`);
				}

				await truncateSessionInDb(db, 'sess', -1);

				const turns = await all(db, 'SELECT * FROM turns WHERE session_id = ?', ['sess']);
				assert.strictEqual(turns.length, 0, 'all turns should be removed');

				const searchEntries = await all(db, 'SELECT * FROM search_index WHERE session_id = ?', ['sess']);
				assert.strictEqual(searchEntries.length, 0, 'all search entries should be removed');
			} finally {
				await close(db);
			}
		});
	});
});
