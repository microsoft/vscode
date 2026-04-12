/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as os from 'os';
import { generateUuid } from '../../../../base/common/uuid.js';
import * as path from '../../../../base/common/path.js';
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
            resolve();
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
function dbOpen(dbPath) {
    return new Promise((resolve, reject) => {
        import('@vscode/sqlite3').then(sqlite3 => {
            const db = new sqlite3.default.Database(dbPath, (err) => {
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
export function parseEventLog(content) {
    const entries = [];
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
export function serializeEventLog(entries) {
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
export function findTurnBoundaryInEventLog(entries, turnIndex) {
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
export function buildForkedEventLog(entries, forkTurnIndex, newSessionId) {
    const boundary = findTurnBoundaryInEventLog(entries, forkTurnIndex);
    if (boundary < 0) {
        throw new Error(`Fork turn index ${forkTurnIndex} not found in event log`);
    }
    // Keep events up to boundary, filtering out lifecycle events
    const kept = entries
        .slice(0, boundary + 1)
        .filter(e => e.type !== 'session.shutdown' && e.type !== 'session.resume');
    // Build UUID remap and re-chain
    const idMap = new Map();
    const result = [];
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
export function buildTruncatedEventLog(entries, keepUpToTurnIndex) {
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
    const newStart = {
        type: 'session.start',
        data: { ...originalStart.data, startTime: new Date().toISOString() },
        id: newStartId,
        timestamp: new Date().toISOString(),
        parentId: null,
    };
    // Re-chain: first remaining event points to the new start
    const idMap = new Map();
    idMap.set(originalStart.id, newStartId);
    const result = [newStart];
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
export function buildWorkspaceYaml(sessionId, cwd, summary) {
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
export async function forkSessionInDb(db, sourceSessionId, newSessionId, forkTurnIndex) {
    await dbExec(db, 'PRAGMA foreign_keys = ON');
    await dbExec(db, 'BEGIN TRANSACTION');
    try {
        const now = new Date().toISOString();
        // Copy session row
        await dbRun(db, `INSERT INTO sessions (id, cwd, repository, branch, summary, created_at, updated_at, host_type)
			SELECT ?, cwd, repository, branch, summary, ?, ?, host_type
			FROM sessions WHERE id = ?`, [newSessionId, now, now, sourceSessionId]);
        // Copy turns up to fork point (turn_index is 0-based)
        await dbRun(db, `INSERT INTO turns (session_id, turn_index, user_message, assistant_response, timestamp)
			SELECT ?, turn_index, user_message, assistant_response, timestamp
			FROM turns
			WHERE session_id = ? AND turn_index <= ?`, [newSessionId, sourceSessionId, forkTurnIndex]);
        // Copy session files that were first seen at or before the fork point
        await dbRun(db, `INSERT INTO session_files (session_id, file_path, tool_name, turn_index, first_seen_at)
			SELECT ?, file_path, tool_name, turn_index, first_seen_at
			FROM session_files
			WHERE session_id = ? AND turn_index <= ?`, [newSessionId, sourceSessionId, forkTurnIndex]);
        // Copy search index entries for kept turns only.
        // source_id format is "<session_id>:turn:<turn_index>"; filter by
        // parsing the turn index so we don't leak content from later turns.
        await dbAll(db, `SELECT content, source_type, source_id
			FROM search_index
			WHERE session_id = ? AND source_type = 'turn'`, [sourceSessionId]).then(async (rows) => {
            const prefix = `${sourceSessionId}:turn:`;
            for (const row of rows) {
                const sourceId = row.source_id;
                if (sourceId.startsWith(prefix)) {
                    const turnIdx = parseInt(sourceId.substring(prefix.length), 10);
                    if (!isNaN(turnIdx) && turnIdx <= forkTurnIndex) {
                        const newSourceId = sourceId.replace(sourceSessionId, newSessionId);
                        await dbRun(db, `INSERT INTO search_index (content, session_id, source_type, source_id)
							VALUES (?, ?, ?, ?)`, [row.content, newSessionId, row.source_type, newSourceId]);
                    }
                }
            }
        });
        // Copy checkpoints at or before the fork point.
        // checkpoint_number is 1-based and correlates to turns, so we keep
        // only those where checkpoint_number <= forkTurnIndex + 1.
        await dbRun(db, `INSERT INTO checkpoints (session_id, checkpoint_number, title, overview, history, work_done, technical_details, important_files, next_steps, created_at)
			SELECT ?, checkpoint_number, title, overview, history, work_done, technical_details, important_files, next_steps, created_at
			FROM checkpoints
			WHERE session_id = ? AND checkpoint_number <= ?`, [newSessionId, sourceSessionId, forkTurnIndex + 1]);
        await dbExec(db, 'COMMIT');
    }
    catch (err) {
        await dbExec(db, 'ROLLBACK');
        throw err;
    }
}
/**
 * Truncates a session in the Copilot CLI's `session-store.db`.
 *
 * Removes all turns after `keepUpToTurnIndex` and updates session metadata.
 */
export async function truncateSessionInDb(db, sessionId, keepUpToTurnIndex) {
    await dbExec(db, 'PRAGMA foreign_keys = ON');
    await dbExec(db, 'BEGIN TRANSACTION');
    try {
        const now = new Date().toISOString();
        // Delete turns after the truncation point
        await dbRun(db, `DELETE FROM turns WHERE session_id = ? AND turn_index > ?`, [sessionId, keepUpToTurnIndex]);
        // Update session timestamp
        await dbRun(db, `UPDATE sessions SET updated_at = ? WHERE id = ?`, [now, sessionId]);
        // Remove search index entries for removed turns
        // source_id format is "<session_id>:turn:<turn_index>"
        await dbAll(db, `SELECT source_id FROM search_index
			WHERE session_id = ? AND source_type = 'turn'`, [sessionId]).then(async (rows) => {
            const prefix = `${sessionId}:turn:`;
            for (const row of rows) {
                const sourceId = row.source_id;
                if (sourceId.startsWith(prefix)) {
                    const turnIdx = parseInt(sourceId.substring(prefix.length), 10);
                    if (!isNaN(turnIdx) && turnIdx > keepUpToTurnIndex) {
                        await dbRun(db, `DELETE FROM search_index WHERE source_id = ? AND session_id = ?`, [sourceId, sessionId]);
                    }
                }
            }
        });
        await dbExec(db, 'COMMIT');
    }
    catch (err) {
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
export function getCopilotDataDir() {
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
export async function forkCopilotSessionOnDisk(copilotDataDir, sourceSessionId, newSessionId, forkTurnIndex) {
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
    }
    catch {
        // Fall back to session.start data
        const startEvent = sourceEntries.find(e => e.type === 'session.start');
        if (startEvent) {
            const ctx = startEvent.data.context;
            cwd = ctx?.cwd ?? '';
        }
    }
    // Create new session folder structure
    const newSessionDir = path.join(sessionStateDir, newSessionId);
    await fs.promises.mkdir(path.join(newSessionDir, 'checkpoints'), { recursive: true });
    await fs.promises.mkdir(path.join(newSessionDir, 'files'), { recursive: true });
    await fs.promises.mkdir(path.join(newSessionDir, 'research'), { recursive: true });
    // Write events.jsonl
    await fs.promises.writeFile(path.join(newSessionDir, 'events.jsonl'), serializeEventLog(forkedEntries), 'utf-8');
    // Write workspace.yaml
    await fs.promises.writeFile(path.join(newSessionDir, 'workspace.yaml'), buildWorkspaceYaml(newSessionId, cwd, summary), 'utf-8');
    // Write empty vscode.metadata.json
    await fs.promises.writeFile(path.join(newSessionDir, 'vscode.metadata.json'), '{}', 'utf-8');
    // Write empty checkpoints index
    await fs.promises.writeFile(path.join(newSessionDir, 'checkpoints', 'index.md'), '', 'utf-8');
    // Update session-store.db
    const dbPath = path.join(copilotDataDir, 'session-store.db');
    const db = await dbOpen(dbPath);
    try {
        await forkSessionInDb(db, sourceSessionId, newSessionId, forkTurnIndex);
    }
    finally {
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
export async function truncateCopilotSessionOnDisk(copilotDataDir, sessionId, keepUpToTurnIndex) {
    const sessionStateDir = path.join(copilotDataDir, 'session-state');
    const sessionDir = path.join(sessionStateDir, sessionId);
    // Read and truncate events
    const eventsPath = path.join(sessionDir, 'events.jsonl');
    const content = await fs.promises.readFile(eventsPath, 'utf-8');
    const entries = parseEventLog(content);
    let truncatedEntries;
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
    }
    else {
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
    }
    catch {
        // workspace.yaml may not exist (old format)
    }
    // Update session-store.db
    const dbPath = path.join(copilotDataDir, 'session-store.db');
    const db = await dbOpen(dbPath);
    try {
        await truncateSessionInDb(db, sessionId, keepUpToTurnIndex);
    }
    finally {
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
export function turnIdToIndex(turnIds, turnId) {
    return turnIds.indexOf(turnId);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdEFnZW50Rm9ya2luZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvY29waWxvdEFnZW50Rm9ya2luZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUV6QixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQWlCeEQsOEVBQThFO0FBRTlFLFNBQVMsTUFBTSxDQUFDLEVBQVksRUFBRSxHQUFXO0lBQ3hDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDdEMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUNwRCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLEtBQUssQ0FBQyxFQUFZLEVBQUUsR0FBVyxFQUFFLE1BQWlCO0lBQzFELE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDdEMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLFVBQVUsR0FBaUI7WUFDOUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDVCxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQixDQUFDO1lBQ0QsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsS0FBSyxDQUFDLEVBQVksRUFBRSxHQUFXLEVBQUUsTUFBaUI7SUFDMUQsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUN0QyxFQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsQ0FBQyxHQUFpQixFQUFFLElBQStCLEVBQUUsRUFBRTtZQUMxRSxJQUFJLEdBQUcsRUFBRSxDQUFDO2dCQUNULE9BQU8sTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BCLENBQUM7WUFDRCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsT0FBTyxDQUFDLEVBQVk7SUFDNUIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUN0QyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDaEQsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxNQUFNLENBQUMsTUFBYztJQUM3QixPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ3RDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUN4QyxNQUFNLEVBQUUsR0FBRyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQWlCLEVBQUUsRUFBRTtnQkFDckUsSUFBSSxHQUFHLEVBQUUsQ0FBQztvQkFDVCxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDcEIsQ0FBQztnQkFDRCxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDYixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNaLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELDhFQUE4RTtBQUU5RTs7R0FFRztBQUNILE1BQU0sVUFBVSxhQUFhLENBQUMsT0FBZTtJQUM1QyxNQUFNLE9BQU8sR0FBNEIsRUFBRSxDQUFDO0lBQzVDLEtBQUssTUFBTSxJQUFJLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUM1QixJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDMUIsU0FBUztRQUNWLENBQUM7UUFDRCxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBQ0QsT0FBTyxPQUFPLENBQUM7QUFDaEIsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLGlCQUFpQixDQUFDLE9BQXlDO0lBQzFFLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO0FBQzlELENBQUM7QUFFRDs7Ozs7Ozs7O0dBU0c7QUFDSCxNQUFNLFVBQVUsMEJBQTBCLENBQUMsT0FBeUMsRUFBRSxTQUFpQjtJQUN0RyxJQUFJLGdCQUFnQixHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzFCLElBQUksZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFFMUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUN6QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFekIsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLGNBQWMsRUFBRSxDQUFDO1lBQ25DLGdCQUFnQixFQUFFLENBQUM7WUFDbkIsSUFBSSxnQkFBZ0IsR0FBRyxTQUFTLEVBQUUsQ0FBQztnQkFDbEMscUNBQXFDO2dCQUNyQyxPQUFPLGdCQUFnQixDQUFDO1lBQ3pCLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxnQkFBZ0IsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNwQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7UUFDdEIsQ0FBQztJQUNGLENBQUM7SUFFRCxnRkFBZ0Y7SUFDaEYsT0FBTyxnQkFBZ0IsQ0FBQztBQUN6QixDQUFDO0FBRUQ7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLFVBQVUsbUJBQW1CLENBQ2xDLE9BQXlDLEVBQ3pDLGFBQXFCLEVBQ3JCLFlBQW9CO0lBRXBCLE1BQU0sUUFBUSxHQUFHLDBCQUEwQixDQUFDLE9BQU8sRUFBRSxhQUFhLENBQUMsQ0FBQztJQUNwRSxJQUFJLFFBQVEsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixhQUFhLHlCQUF5QixDQUFDLENBQUM7SUFDNUUsQ0FBQztJQUVELDZEQUE2RDtJQUM3RCxNQUFNLElBQUksR0FBRyxPQUFPO1NBQ2xCLEtBQUssQ0FBQyxDQUFDLEVBQUUsUUFBUSxHQUFHLENBQUMsQ0FBQztTQUN0QixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLGtCQUFrQixJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssZ0JBQWdCLENBQUMsQ0FBQztJQUU1RSxnQ0FBZ0M7SUFDaEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxHQUFHLEVBQWtCLENBQUM7SUFDeEMsTUFBTSxNQUFNLEdBQTRCLEVBQUUsQ0FBQztJQUUzQyxLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQzFCLE1BQU0sS0FBSyxHQUFHLFlBQVksRUFBRSxDQUFDO1FBQzdCLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUUzQixJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3RCLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztZQUNwQyxJQUFJLEdBQUcsRUFBRSxHQUFHLElBQUksRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLENBQUM7UUFDN0MsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxRQUFRLEtBQUssSUFBSTtZQUMxQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLElBQUksSUFBSSxDQUFDO1lBQ3RFLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFFUixNQUFNLENBQUMsSUFBSSxDQUFDO1lBQ1gsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQ2hCLElBQUk7WUFDSixFQUFFLEVBQUUsS0FBSztZQUNULFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztZQUMxQixRQUFRLEVBQUUsV0FBVztTQUNyQixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQ7Ozs7OztHQU1HO0FBQ0gsTUFBTSxVQUFVLHNCQUFzQixDQUNyQyxPQUF5QyxFQUN6QyxpQkFBeUI7SUFFekIsTUFBTSxRQUFRLEdBQUcsMEJBQTBCLENBQUMsT0FBTyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDeEUsSUFBSSxRQUFRLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxjQUFjLGlCQUFpQix5QkFBeUIsQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFFRCxtREFBbUQ7SUFDbkQsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssZUFBZSxDQUFDLENBQUM7SUFDcEUsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3BCLE1BQU0sSUFBSSxLQUFLLENBQUMsMkNBQTJDLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsa0ZBQWtGO0lBQ2xGLE1BQU0sSUFBSSxHQUFHLE9BQU87U0FDbEIsS0FBSyxDQUFDLENBQUMsRUFBRSxRQUFRLEdBQUcsQ0FBQyxDQUFDO1NBQ3RCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssZUFBZSxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssa0JBQWtCLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxnQkFBZ0IsQ0FBQyxDQUFDO0lBRTFHLHdCQUF3QjtJQUN4QixNQUFNLFVBQVUsR0FBRyxZQUFZLEVBQUUsQ0FBQztJQUNsQyxNQUFNLFFBQVEsR0FBMEI7UUFDdkMsSUFBSSxFQUFFLGVBQWU7UUFDckIsSUFBSSxFQUFFLEVBQUUsR0FBRyxhQUFhLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxFQUFFO1FBQ3BFLEVBQUUsRUFBRSxVQUFVO1FBQ2QsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1FBQ25DLFFBQVEsRUFBRSxJQUFJO0tBQ2QsQ0FBQztJQUVGLDBEQUEwRDtJQUMxRCxNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztJQUN4QyxLQUFLLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFFeEMsTUFBTSxNQUFNLEdBQTRCLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDbkQsSUFBSSxNQUFNLEdBQUcsVUFBVSxDQUFDO0lBRXhCLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxFQUFFLENBQUM7UUFDMUIsTUFBTSxLQUFLLEdBQUcsWUFBWSxFQUFFLENBQUM7UUFDN0IsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRTNCLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxRQUFRLEtBQUssSUFBSTtZQUMxQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxNQUFNLENBQUM7WUFDdkMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUVWLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDWCxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7WUFDaEIsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQ2hCLEVBQUUsRUFBRSxLQUFLO1lBQ1QsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTO1lBQzFCLFFBQVEsRUFBRSxXQUFXO1NBQ3JCLENBQUMsQ0FBQztRQUNILE1BQU0sR0FBRyxLQUFLLENBQUM7SUFDaEIsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLGtCQUFrQixDQUFDLFNBQWlCLEVBQUUsR0FBVyxFQUFFLE9BQWU7SUFDakYsTUFBTSxHQUFHLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNyQyxPQUFPO1FBQ04sT0FBTyxTQUFTLEVBQUU7UUFDbEIsUUFBUSxHQUFHLEVBQUU7UUFDYixrQkFBa0I7UUFDbEIsZUFBZSxHQUFHLEVBQUU7UUFDcEIsZUFBZSxHQUFHLEVBQUU7UUFDcEIsWUFBWSxPQUFPLEVBQUU7UUFDckIsRUFBRTtLQUNGLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2QsQ0FBQztBQUVELDhFQUE4RTtBQUU5RTs7Ozs7R0FLRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsZUFBZSxDQUNwQyxFQUFZLEVBQ1osZUFBdUIsRUFDdkIsWUFBb0IsRUFDcEIsYUFBcUI7SUFFckIsTUFBTSxNQUFNLENBQUMsRUFBRSxFQUFFLDBCQUEwQixDQUFDLENBQUM7SUFDN0MsTUFBTSxNQUFNLENBQUMsRUFBRSxFQUFFLG1CQUFtQixDQUFDLENBQUM7SUFDdEMsSUFBSSxDQUFDO1FBQ0osTUFBTSxHQUFHLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUVyQyxtQkFBbUI7UUFDbkIsTUFBTSxLQUFLLENBQUMsRUFBRSxFQUNiOzs4QkFFMkIsRUFDM0IsQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FDekMsQ0FBQztRQUVGLHNEQUFzRDtRQUN0RCxNQUFNLEtBQUssQ0FBQyxFQUFFLEVBQ2I7Ozs0Q0FHeUMsRUFDekMsQ0FBQyxZQUFZLEVBQUUsZUFBZSxFQUFFLGFBQWEsQ0FBQyxDQUM5QyxDQUFDO1FBRUYsc0VBQXNFO1FBQ3RFLE1BQU0sS0FBSyxDQUFDLEVBQUUsRUFDYjs7OzRDQUd5QyxFQUN6QyxDQUFDLFlBQVksRUFBRSxlQUFlLEVBQUUsYUFBYSxDQUFDLENBQzlDLENBQUM7UUFFRixpREFBaUQ7UUFDakQsa0VBQWtFO1FBQ2xFLG9FQUFvRTtRQUNwRSxNQUFNLEtBQUssQ0FBQyxFQUFFLEVBQ2I7O2lEQUU4QyxFQUM5QyxDQUFDLGVBQWUsQ0FBQyxDQUNqQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUMsSUFBSSxFQUFDLEVBQUU7WUFDbkIsTUFBTSxNQUFNLEdBQUcsR0FBRyxlQUFlLFFBQVEsQ0FBQztZQUMxQyxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUN4QixNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsU0FBbUIsQ0FBQztnQkFDekMsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7b0JBQ2pDLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDaEUsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxPQUFPLElBQUksYUFBYSxFQUFFLENBQUM7d0JBQ2pELE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLFlBQVksQ0FBQyxDQUFDO3dCQUNwRSxNQUFNLEtBQUssQ0FBQyxFQUFFLEVBQ2I7MkJBQ29CLEVBQ3BCLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxZQUFZLEVBQUUsR0FBRyxDQUFDLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FDekQsQ0FBQztvQkFDSCxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxnREFBZ0Q7UUFDaEQsbUVBQW1FO1FBQ25FLDJEQUEyRDtRQUMzRCxNQUFNLEtBQUssQ0FBQyxFQUFFLEVBQ2I7OzttREFHZ0QsRUFDaEQsQ0FBQyxZQUFZLEVBQUUsZUFBZSxFQUFFLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FDbEQsQ0FBQztRQUVGLE1BQU0sTUFBTSxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNkLE1BQU0sTUFBTSxDQUFDLEVBQUUsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM3QixNQUFNLEdBQUcsQ0FBQztJQUNYLENBQUM7QUFDRixDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsbUJBQW1CLENBQ3hDLEVBQVksRUFDWixTQUFpQixFQUNqQixpQkFBeUI7SUFFekIsTUFBTSxNQUFNLENBQUMsRUFBRSxFQUFFLDBCQUEwQixDQUFDLENBQUM7SUFDN0MsTUFBTSxNQUFNLENBQUMsRUFBRSxFQUFFLG1CQUFtQixDQUFDLENBQUM7SUFDdEMsSUFBSSxDQUFDO1FBQ0osTUFBTSxHQUFHLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUVyQywwQ0FBMEM7UUFDMUMsTUFBTSxLQUFLLENBQUMsRUFBRSxFQUNiLDJEQUEyRCxFQUMzRCxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxDQUM5QixDQUFDO1FBRUYsMkJBQTJCO1FBQzNCLE1BQU0sS0FBSyxDQUFDLEVBQUUsRUFDYixpREFBaUQsRUFDakQsQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQ2hCLENBQUM7UUFFRixnREFBZ0Q7UUFDaEQsdURBQXVEO1FBQ3ZELE1BQU0sS0FBSyxDQUFDLEVBQUUsRUFDYjtpREFDOEMsRUFDOUMsQ0FBQyxTQUFTLENBQUMsQ0FDWCxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUMsSUFBSSxFQUFDLEVBQUU7WUFDbkIsTUFBTSxNQUFNLEdBQUcsR0FBRyxTQUFTLFFBQVEsQ0FBQztZQUNwQyxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUN4QixNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsU0FBbUIsQ0FBQztnQkFDekMsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7b0JBQ2pDLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDaEUsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxPQUFPLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQzt3QkFDcEQsTUFBTSxLQUFLLENBQUMsRUFBRSxFQUNiLGlFQUFpRSxFQUNqRSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FDckIsQ0FBQztvQkFDSCxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sQ0FBQyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDZCxNQUFNLE1BQU0sQ0FBQyxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDN0IsTUFBTSxHQUFHLENBQUM7SUFDWCxDQUFDO0FBQ0YsQ0FBQztBQUVELDhFQUE4RTtBQUU5RTs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLGlCQUFpQjtJQUNoQyxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUNqRixDQUFDO0FBRUQ7Ozs7Ozs7Ozs7OztHQVlHO0FBQ0gsTUFBTSxDQUFDLEtBQUssVUFBVSx3QkFBd0IsQ0FDN0MsY0FBc0IsRUFDdEIsZUFBdUIsRUFDdkIsWUFBb0IsRUFDcEIsYUFBcUI7SUFFckIsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFFbkUscUJBQXFCO0lBQ3JCLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsZUFBZSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQ3JGLE1BQU0sYUFBYSxHQUFHLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDNUUsTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBRW5ELHlCQUF5QjtJQUN6QixNQUFNLGFBQWEsR0FBRyxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBRXRGLDZDQUE2QztJQUM3QyxJQUFJLEdBQUcsR0FBRyxFQUFFLENBQUM7SUFDYixJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7SUFDakIsSUFBSSxDQUFDO1FBQ0osTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUN4RixNQUFNLFdBQVcsR0FBRyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzNFLE1BQU0sUUFBUSxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNyRCxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDN0QsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNkLEdBQUcsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDMUIsQ0FBQztRQUNELElBQUksWUFBWSxFQUFFLENBQUM7WUFDbEIsT0FBTyxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsQyxDQUFDO0lBQ0YsQ0FBQztJQUFDLE1BQU0sQ0FBQztRQUNSLGtDQUFrQztRQUNsQyxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxlQUFlLENBQUMsQ0FBQztRQUN2RSxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2hCLE1BQU0sR0FBRyxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsT0FBNkMsQ0FBQztZQUMxRSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxFQUFFLENBQUM7UUFDdEIsQ0FBQztJQUNGLENBQUM7SUFFRCxzQ0FBc0M7SUFDdEMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDL0QsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3RGLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNoRixNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFVBQVUsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFFbkYscUJBQXFCO0lBQ3JCLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQzFCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLGNBQWMsQ0FBQyxFQUN4QyxpQkFBaUIsQ0FBQyxhQUFhLENBQUMsRUFDaEMsT0FBTyxDQUNQLENBQUM7SUFFRix1QkFBdUI7SUFDdkIsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsZ0JBQWdCLENBQUMsRUFDMUMsa0JBQWtCLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRSxPQUFPLENBQUMsRUFDOUMsT0FBTyxDQUNQLENBQUM7SUFFRixtQ0FBbUM7SUFDbkMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsc0JBQXNCLENBQUMsRUFDaEQsSUFBSSxFQUNKLE9BQU8sQ0FDUCxDQUFDO0lBRUYsZ0NBQWdDO0lBQ2hDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQzFCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLGFBQWEsRUFBRSxVQUFVLENBQUMsRUFDbkQsRUFBRSxFQUNGLE9BQU8sQ0FDUCxDQUFDO0lBRUYsMEJBQTBCO0lBQzFCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFDN0QsTUFBTSxFQUFFLEdBQUcsTUFBTSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDaEMsSUFBSSxDQUFDO1FBQ0osTUFBTSxlQUFlLENBQUMsRUFBRSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDekUsQ0FBQztZQUFTLENBQUM7UUFDVixNQUFNLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNuQixDQUFDO0FBQ0YsQ0FBQztBQUVEOzs7Ozs7Ozs7OztHQVdHO0FBQ0gsTUFBTSxDQUFDLEtBQUssVUFBVSw0QkFBNEIsQ0FDakQsY0FBc0IsRUFDdEIsU0FBaUIsRUFDakIsaUJBQXlCO0lBRXpCLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0lBQ25FLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBRXpELDJCQUEyQjtJQUMzQixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUN6RCxNQUFNLE9BQU8sR0FBRyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNoRSxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7SUFFdkMsSUFBSSxnQkFBeUMsQ0FBQztJQUM5QyxJQUFJLGlCQUFpQixHQUFHLENBQUMsRUFBRSxDQUFDO1FBQzNCLDREQUE0RDtRQUM1RCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxlQUFlLENBQUMsQ0FBQztRQUNwRSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDcEIsTUFBTSxJQUFJLEtBQUssQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO1FBQzlELENBQUM7UUFDRCxnQkFBZ0IsR0FBRyxDQUFDO2dCQUNuQixJQUFJLEVBQUUsZUFBZTtnQkFDckIsSUFBSSxFQUFFLEVBQUUsR0FBRyxhQUFhLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxFQUFFO2dCQUNwRSxFQUFFLEVBQUUsWUFBWSxFQUFFO2dCQUNsQixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7Z0JBQ25DLFFBQVEsRUFBRSxJQUFJO2FBQ2QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztTQUFNLENBQUM7UUFDUCxnQkFBZ0IsR0FBRyxzQkFBc0IsQ0FBQyxPQUFPLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBRUQseUJBQXlCO0lBQ3pCLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLGlCQUFpQixDQUFDLGdCQUFnQixDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFFdEYsa0NBQWtDO0lBQ2xDLElBQUksQ0FBQztRQUNKLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDekQsSUFBSSxJQUFJLEdBQUcsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDekQsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMscUJBQXFCLEVBQUUsZUFBZSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RixNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUFDLE1BQU0sQ0FBQztRQUNSLDRDQUE0QztJQUM3QyxDQUFDO0lBRUQsMEJBQTBCO0lBQzFCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFDN0QsTUFBTSxFQUFFLEdBQUcsTUFBTSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDaEMsSUFBSSxDQUFDO1FBQ0osTUFBTSxtQkFBbUIsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDN0QsQ0FBQztZQUFTLENBQUM7UUFDVixNQUFNLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNuQixDQUFDO0FBQ0YsQ0FBQztBQUVEOzs7Ozs7Ozs7O0dBVUc7QUFDSCxNQUFNLFVBQVUsYUFBYSxDQUFDLE9BQTBCLEVBQUUsTUFBYztJQUN2RSxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDaEMsQ0FBQyJ9