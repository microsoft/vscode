/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Append-only JSONL session storage.
 *
 * Each agent session is persisted as a `.jsonl` file under
 * `<userDataPath>/agentSessions/<workspaceKey>/<sessionId>.jsonl`.
 * Each line is a JSON record representing a session event. Files are
 * strictly append-only - no line is ever modified or deleted.
 *
 * The workspace key is derived from the `workingDirectory` path (hashed)
 * so that sessions naturally follow workspace identity. Sessions created
 * without a workspace go under a `no-workspace` subfolder.
 */

import { createHash } from 'crypto';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { join } from '../../../base/common/path.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import {
	AgentSession,
	IAgentSessionMetadata,
} from '../../agent/common/agentService.js';
import { SESSION_ENTRY_VERSION, type SessionEntry } from '../common/sessionTypes.js';

export type { ISessionUserMessage, ISessionAssistantMessage, ISessionToolStart, ISessionToolComplete, SessionEntry } from '../common/sessionTypes.js';

// -- Internal JSONL record types (metadata only) ------------------------------

interface ISessionCreatedRecord {
	readonly v: number;
	readonly type: 'session-created';
	readonly sessionId: string;
	readonly model: string;
	readonly workingDirectory: string;
	readonly startTime: number;
}

interface ISessionModifiedRecord {
	readonly v: number;
	readonly type: 'session-modified';
	readonly modifiedTime: number;
}

/** A JSONL line is either a metadata record or a session entry. */
type SessionRecord = ISessionCreatedRecord | ISessionModifiedRecord | SessionEntry;

// -- Restored session data ----------------------------------------------------

export interface IRestoredSession {
	readonly sessionId: string;
	readonly model: string;
	readonly workingDirectory: string;
	readonly startTime: number;
	readonly modifiedTime: number;
	readonly entries: readonly SessionEntry[];
}

// -- Write buffer (per session) -----------------------------------------------

const FLUSH_DELAY_MS = 500;

interface ISessionWriteBuffer {
	readonly workingDirectory: string;
	readonly lines: string[];
	readonly scheduler: RunOnceScheduler;
	flushPromise: Promise<void> | undefined;
}

// -- Storage implementation ---------------------------------------------------

export class SessionStorage {
	private readonly _baseDir: string;
	private readonly _buffers = new Map<string, ISessionWriteBuffer>();

	constructor(
		userDataPath: string,
		private readonly _logService: ILogService,
	) {
		this._baseDir = join(userDataPath, 'agentSessions');
	}

	// -- Public API -----------------------------------------------------------

	/**
	 * Create the JSONL file for a new session and write the initial record.
	 */
	async createSession(
		sessionUri: URI,
		model: string,
		workingDirectory: string,
		startTime: number,
	): Promise<void> {
		const sessionId = AgentSession.id(sessionUri);

		const record: ISessionCreatedRecord = {
			v: SESSION_ENTRY_VERSION,
			type: 'session-created',
			sessionId,
			model,
			workingDirectory,
			startTime,
		};
		this._appendRecord(workingDirectory, sessionId, record);
		await this.flush(sessionId);
	}

	/**
	 * Buffer a session entry for writing to the JSONL file.
	 */
	append(sessionUri: URI, workingDirectory: string, entry: SessionEntry): void {
		this._appendRecord(workingDirectory, AgentSession.id(sessionUri), entry);
	}

	/**
	 * Mark the session as modified (appends a timestamp record).
	 */
	markModified(sessionUri: URI, workingDirectory: string): void {
		const record: ISessionModifiedRecord = {
			v: SESSION_ENTRY_VERSION,
			type: 'session-modified',
			modifiedTime: Date.now(),
		};
		this._appendRecord(workingDirectory, AgentSession.id(sessionUri), record);
	}

	/**
	 * List all persisted sessions for a given workspace.
	 * If no workspace is specified, lists from all workspaces.
	 */
	async listSessions(workingDirectory?: string): Promise<IAgentSessionMetadata[]> {
		const results: IAgentSessionMetadata[] = [];

		try {
			const workspaceDirs = workingDirectory
				? [this._sessionDir(workingDirectory)]
				: await this._allWorkspaceDirs();

			for (const dir of workspaceDirs) {
				if (!existsSync(dir)) {
					continue;
				}
				const files = await fs.readdir(dir);
				for (const file of files) {
					if (!file.endsWith('.jsonl')) {
						continue;
					}
					try {
						const meta = await this._readSessionMetadata(join(dir, file));
						if (meta) {
							results.push(meta);
						}
					} catch (err) {
						this._logService.warn(`[SessionStorage] Failed to read session file ${file}`, err);
					}
				}
			}
		} catch (err) {
			this._logService.warn('[SessionStorage] Failed to list sessions', err);
		}

		return results;
	}

	/**
	 * Restore a full session from its JSONL file.
	 */
	async restoreSession(sessionUri: URI, workingDirectory: string): Promise<IRestoredSession | undefined> {
		const sessionId = AgentSession.id(sessionUri);
		const filePath = this._sessionPath(workingDirectory, sessionId);

		if (!existsSync(filePath)) {
			return undefined;
		}

		try {
			const content = await fs.readFile(filePath, 'utf-8');
			return this._parseSessionFile(sessionUri, content);
		} catch (err) {
			this._logService.warn(`[SessionStorage] Failed to restore session ${sessionId}`, err);
			return undefined;
		}
	}

	/**
	 * Find a session across all workspace dirs and restore it.
	 */
	async findAndRestoreSession(sessionUri: URI): Promise<IRestoredSession | undefined> {
		const sessionId = AgentSession.id(sessionUri);
		const fileName = `${sessionId}.jsonl`;

		try {
			const dirs = await this._allWorkspaceDirs();
			for (const dir of dirs) {
				const filePath = join(dir, fileName);
				if (existsSync(filePath)) {
					const content = await fs.readFile(filePath, 'utf-8');
					return this._parseSessionFile(sessionUri, content);
				}
			}
		} catch (err) {
			this._logService.warn(`[SessionStorage] Failed to find session ${sessionId}`, err);
		}
		return undefined;
	}

	/**
	 * Delete a session's JSONL file.
	 */
	async deleteSession(sessionUri: URI, workingDirectory: string): Promise<void> {
		const sessionId = AgentSession.id(sessionUri);
		const filePath = this._sessionPath(workingDirectory, sessionId);

		// Dispose the write buffer for this session
		const buffer = this._buffers.get(sessionId);
		if (buffer) {
			buffer.scheduler.dispose();
			this._buffers.delete(sessionId);
		}

		try {
			await fs.unlink(filePath);
		} catch {
			// File may not exist
		}
	}

	/**
	 * Flush all pending session buffers. Call before shutdown.
	 */
	async flushAll(): Promise<void> {
		const promises: Promise<void>[] = [];
		for (const sessionId of this._buffers.keys()) {
			promises.push(this.flush(sessionId));
		}
		await Promise.all(promises);
	}

	// -- Private helpers ------------------------------------------------------

	private _sessionDir(workingDirectory: string): string {
		const key = workingDirectory
			? this._hashPath(workingDirectory)
			: 'no-workspace';
		return join(this._baseDir, key);
	}

	private _sessionPath(workingDirectory: string, sessionId: string): string {
		return join(this._sessionDir(workingDirectory), `${sessionId}.jsonl`);
	}

	private _hashPath(fsPath: string): string {
		return createHash('sha256').update(fsPath).digest('hex').substring(0, 16);
	}

	/**
	 * Buffer a record for writing. The actual write is debounced --
	 * multiple records are batched into a single `appendFile` call.
	 */
	private _appendRecord(workingDirectory: string, sessionId: string, record: SessionRecord): void {
		const line = JSON.stringify(record) + '\n';

		let buffer = this._buffers.get(sessionId);
		if (!buffer) {
			buffer = {
				workingDirectory,
				lines: [],
				scheduler: new RunOnceScheduler(() => this._flush(sessionId), FLUSH_DELAY_MS),
				flushPromise: undefined,
			};
			this._buffers.set(sessionId, buffer);
		}

		buffer.lines.push(line);
		buffer.scheduler.schedule();
	}

	/**
	 * Immediately flush all buffered records for a session to disk.
	 * Returns a promise that resolves when the write completes.
	 */
	async flush(sessionId: string): Promise<void> {
		const buffer = this._buffers.get(sessionId);
		if (!buffer) {
			return;
		}

		// Cancel pending scheduled flush since we're flushing now
		buffer.scheduler.cancel();

		// Wait for any in-flight flush, then flush remaining
		if (buffer.flushPromise) {
			await buffer.flushPromise;
		}
		await this._flush(sessionId);
	}

	private async _flush(sessionId: string): Promise<void> {
		const buffer = this._buffers.get(sessionId);
		if (!buffer || buffer.lines.length === 0) {
			return;
		}

		// Drain the buffer
		const lines = buffer.lines.splice(0);
		const data = lines.join('');

		const op = (async () => {
			try {
				const dir = this._sessionDir(buffer.workingDirectory);
				const filePath = this._sessionPath(buffer.workingDirectory, sessionId);
				await fs.mkdir(dir, { recursive: true });
				await fs.appendFile(filePath, data, 'utf-8');
			} catch (err) {
				this._logService.warn(`[SessionStorage] Failed to flush ${sessionId}.jsonl`, err);
			}
		})();

		buffer.flushPromise = op;
		await op;
		buffer.flushPromise = undefined;
	}

	private async _allWorkspaceDirs(): Promise<string[]> {
		try {
			if (!existsSync(this._baseDir)) {
				return [];
			}
			const entries = await fs.readdir(this._baseDir, { withFileTypes: true });
			return entries
				.filter(e => e.isDirectory())
				.map(e => join(this._baseDir, e.name));
		} catch {
			return [];
		}
	}

	/**
	 * Read just the metadata from a JSONL file (first line + scan for latest modified time).
	 */
	private async _readSessionMetadata(filePath: string): Promise<IAgentSessionMetadata | undefined> {
		const content = await fs.readFile(filePath, 'utf-8');
		const lines = content.split('\n').filter(l => l.trim());
		if (lines.length === 0) {
			return undefined;
		}

		const firstRecord = JSON.parse(lines[0]) as SessionRecord;
		if (firstRecord.type !== 'session-created') {
			return undefined;
		}

		// Find the latest modifiedTime by scanning session-modified records
		let modifiedTime = firstRecord.startTime;
		for (let i = lines.length - 1; i >= 1; i--) {
			try {
				const record = JSON.parse(lines[i]) as SessionRecord;
				if (record.type === 'session-modified') {
					modifiedTime = record.modifiedTime;
					break;
				}
			} catch {
				continue;
			}
		}

		// Extract a summary from the first user message if present
		let summary: string | undefined;
		for (const line of lines) {
			try {
				const record = JSON.parse(line) as SessionRecord;
				if (record.type === 'user-message') {
					summary = record.content.length > 80
						? record.content.substring(0, 77) + '...'
						: record.content;
					break;
				}
			} catch {
				continue;
			}
		}

		const sessionUri = AgentSession.uri('local', firstRecord.sessionId);
		return {
			session: sessionUri,
			startTime: firstRecord.startTime,
			modifiedTime,
			summary,
		};
	}

	/**
	 * Parse a full JSONL file into a restored session.
	 */
	private _parseSessionFile(_sessionUri: URI, content: string): IRestoredSession | undefined {
		const lines = content.split('\n').filter(l => l.trim());
		if (lines.length === 0) {
			return undefined;
		}

		const firstRecord = JSON.parse(lines[0]) as SessionRecord;
		if (firstRecord.type !== 'session-created') {
			return undefined;
		}

		const entries: SessionEntry[] = [];
		let modifiedTime = firstRecord.startTime;

		for (const line of lines) {
			let record: SessionRecord;
			try {
				record = JSON.parse(line) as SessionRecord;
			} catch {
				continue;
			}

			switch (record.type) {
				case 'session-created':
					break;
				case 'session-modified':
					modifiedTime = record.modifiedTime;
					break;
				default:
					entries.push(record);
					break;
			}
		}

		return {
			sessionId: firstRecord.sessionId,
			model: firstRecord.model,
			workingDirectory: firstRecord.workingDirectory,
			startTime: firstRecord.startTime,
			modifiedTime,
			entries,
		};
	}
}
