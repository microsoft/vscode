/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseEventLog, serializeEventLog, findTurnBoundaryInEventLog, buildForkedEventLog, buildTruncatedEventLog, buildWorkspaceYaml, forkSessionInDb, truncateSessionInDb, } from '../../node/copilot/copilotAgentForking.js';
// ---- Test helpers -----------------------------------------------------------
function makeEntry(type, overrides) {
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
function buildTestEventLog(turnCount) {
    const entries = [];
    let lastId = null;
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
            assert.strictEqual(forked[0].data.sessionId, 'new-session-id');
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
                assert.ok(forked[i].parentId !== null && idSet.has(forked[i].parentId), `Event ${i} (${forked[i].type}) should have a valid parentId`);
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
                assert.ok(forked[i].parentId !== null && idSet.has(forked[i].parentId), `Event ${i} (${forked[i].type}) should have a valid parentId, got ${forked[i].parentId}`);
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
                assert.ok(truncated[i].parentId !== null && idSet.has(truncated[i].parentId), `Event ${i} (${truncated[i].type}) should have a valid parentId`);
            }
        });
        test('strips lifecycle events', () => {
            const entries = buildTestEventLog(3);
            // Add lifecycle events between turns
            entries.splice(5, 0, makeEntry('session.shutdown'));
            entries.splice(6, 0, makeEntry('session.resume'));
            const truncated = buildTruncatedEventLog(entries, 2);
            const lifecycleEvents = truncated.filter(e => e.type === 'session.shutdown' || e.type === 'session.resume');
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
        async function openTestDb() {
            const sqlite3 = await import('@vscode/sqlite3');
            return new Promise((resolve, reject) => {
                const db = new sqlite3.default.Database(':memory:', (err) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(db);
                });
            });
        }
        function exec(db, sql) {
            return new Promise((resolve, reject) => {
                db.exec(sql, err => err ? reject(err) : resolve());
            });
        }
        function all(db, sql, params = []) {
            return new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(rows);
                });
            });
        }
        function close(db) {
            return new Promise((resolve, reject) => {
                db.close(err => err ? reject(err) : resolve());
            });
        }
        async function setupSchema(db) {
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
        async function seedTestData(db, sessionId, turnCount) {
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
            }
            finally {
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
            }
            finally {
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
            }
            finally {
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
            }
            finally {
                await close(db);
            }
        });
    });
    suite('truncateSessionInDb', () => {
        async function openTestDb() {
            const sqlite3 = await import('@vscode/sqlite3');
            return new Promise((resolve, reject) => {
                const db = new sqlite3.default.Database(':memory:', (err) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(db);
                });
            });
        }
        function exec(db, sql) {
            return new Promise((resolve, reject) => {
                db.exec(sql, err => err ? reject(err) : resolve());
            });
        }
        function all(db, sql, params = []) {
            return new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(rows);
                });
            });
        }
        function close(db) {
            return new Promise((resolve, reject) => {
                db.close(err => err ? reject(err) : resolve());
            });
        }
        async function setupSchema(db) {
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
            }
            finally {
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
            }
            finally {
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
            }
            finally {
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
            }
            finally {
                await close(db);
            }
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdEFnZW50Rm9ya2luZy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9jb3BpbG90QWdlbnRGb3JraW5nLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFDTixhQUFhLEVBQ2IsaUJBQWlCLEVBQ2pCLDBCQUEwQixFQUMxQixtQkFBbUIsRUFDbkIsc0JBQXNCLEVBQ3RCLGtCQUFrQixFQUNsQixlQUFlLEVBQ2YsbUJBQW1CLEdBRW5CLE1BQU0sMkNBQTJDLENBQUM7QUFFbkQsZ0ZBQWdGO0FBRWhGLFNBQVMsU0FBUyxDQUFDLElBQVksRUFBRSxTQUEwQztJQUMxRSxPQUFPO1FBQ04sSUFBSTtRQUNKLElBQUksRUFBRSxFQUFFO1FBQ1IsRUFBRSxFQUFFLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFO1FBQ2xELFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtRQUNuQyxRQUFRLEVBQUUsSUFBSTtRQUNkLEdBQUcsU0FBUztLQUNaLENBQUM7QUFDSCxDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsU0FBUyxpQkFBaUIsQ0FBQyxTQUFpQjtJQUMzQyxNQUFNLE9BQU8sR0FBNEIsRUFBRSxDQUFDO0lBQzVDLElBQUksTUFBTSxHQUFrQixJQUFJLENBQUM7SUFFakMsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLGVBQWUsRUFBRTtRQUMvQyxFQUFFLEVBQUUsa0JBQWtCO1FBQ3RCLElBQUks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