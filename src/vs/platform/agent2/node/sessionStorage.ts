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
 * strictly append-only -- no line is ever modified or deleted.
 *
 * Write path: each session creates a {@link SessionWriter} that owns a
 * single debounce scheduler and buffer for that session.
 *
 * Read path: {@link SessionStorage} provides read-only operations for
 * listing and restoring persisted sessions from disk.
 */

import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import { join } from '../../../base/common/path.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { vLiteral, vNumber, vObj, vString } from '../../../base/common/validation.js';
import { ILogService } from '../../log/common/log.js';
import {
	AgentSession,
	IAgentSessionMetadata,
} from '../../agent/common/agentService.js';
import { vSessionEntry, type SessionEntry } from '../common/sessionTypes.js';

export type { ISessionUserMessage, ISessionAssistantMessage, ISessionToolStart, ISessionToolComplete, SessionEntry } from '../common/sessionTypes.js';

/** Current JSONL schema version, stamped on every persisted record. */
const SESSION_ENTRY_VERSION = 2;

/** A persisted session entry -- extends the in-memory type with a version. */
type VersionedEntry = SessionEntry & { readonly v: number };

// -- Internal JSONL record validators ----------------------------------------

const vSessionCreatedRecord = vObj({
	v: vNumber(),
	type: vLiteral('session-created'),
	sessionId: vString(),
	model: vString(),
	workingDirectory: vString(),
	startTime: vNumber(),
});

// -- Restored session data ----------------------------------------------------

export interface IRestoredSession {
	readonly sessionId: string;
	readonly model: string;
	readonly workingDirectory: string;
	readonly startTime: number;
	readonly entries: readonly SessionEntry[];
}

// -- Legacy field normalization -----------------------------------------------

/**
 * Pre-normalize a raw parsed object so that v1 field names (`messageId`,
 * `contentParts`) are mapped to their v2 equivalents (`id`, `parts`)
 * before running through the validator.
 */
function normalizeLegacyFields(raw: Record<string, unknown>): Record<string, unknown> {
	if (raw['type'] === 'user-message' && raw['id'] === undefined && raw['messageId'] !== undefined) {
		raw['id'] = raw['messageId'];
	}
	if (raw['type'] === 'assistant-message') {
		if (raw['id'] === undefined && raw['messageId'] !== undefined) {
			raw['id'] = raw['messageId'];
		}
		if (raw['parts'] === undefined && raw['contentParts'] !== undefined) {
			raw['parts'] = raw['contentParts'];
		}
	}
	return raw;
}

// -- Per-session writer -------------------------------------------------------

const FLUSH_DELAY_MS = 500;

/**
 * Per-session append-only JSONL writer. Owns a single debounce scheduler
 * and buffer. Created by the session and disposed when the session is
 * disposed.
 */
export class SessionWriter extends Disposable {
	private readonly _filePath: string;
	private readonly _dirPath: string;
	private readonly _buffer: string[] = [];
	private readonly _scheduler: RunOnceScheduler;
	private _flushPromise: Promise<void> | undefined;
	private _dirCreated = false;

	constructor(
		baseDir: string,
		sessionId: string,
		workingDirectory: string,
		private readonly _logService: ILogService,
	) {
		super();
		const key = workingDirectory
			? createHash('sha256').update(workingDirectory).digest('hex').substring(0, 16)
			: 'no-workspace';
		this._dirPath = join(baseDir, key);
		this._filePath = join(this._dirPath, `${sessionId}.jsonl`);
		this._scheduler = this._register(new RunOnceScheduler(() => this._doFlush(), FLUSH_DELAY_MS));
	}

	/**
	 * Write the initial session-created record and flush immediately.
	 */
	async writeHeader(model: string, workingDirectory: string, startTime: number, sessionId: string): Promise<void> {
		const record = {
			v: SESSION_ENTRY_VERSION,
			type: 'session-created' as const,
			sessionId,
			model,
			workingDirectory,
			startTime,
		};
		this._buffer.push(JSON.stringify(record) + '\n');
		await this.flush();
	}

	/**
	 * Buffer an entry for debounced writing. Stamps the current schema
	 * version onto the serialized record.
	 */
	append(entry: SessionEntry): void {
		const versioned: VersionedEntry = { ...entry, v: SESSION_ENTRY_VERSION };
		this._buffer.push(JSON.stringify(versioned) + '\n');
		this._scheduler.schedule();
	}

	/**
	 * Immediately flush all buffered records to disk.
	 */
	async flush(): Promise<void> {
		this._scheduler.cancel();
		if (this._flushPromise) {
			await this._flushPromise;
		}
		await this._doFlush();
	}

	private async _doFlush(): Promise<void> {
		if (this._buffer.length === 0) {
			return;
		}

		const lines = this._buffer.splice(0);
		const data = lines.join('');

		const op = (async () => {
			try {
				if (!this._dirCreated) {
					await fs.mkdir(this._dirPath, { recursive: true });
					this._dirCreated = true;
				}
				await fs.appendFile(this._filePath, data, 'utf-8');
			} catch (err) {
				this._logService.warn(`[SessionWriter] Failed to flush to ${this._filePath}`, err);
			}
		})();

		this._flushPromise = op;
		await op;
		this._flushPromise = undefined;
	}
}

// -- Read-only storage --------------------------------------------------------

/**
 * Read-only operations for listing and restoring persisted sessions.
 * Does not own any write state -- writing is handled per-session by
 * {@link SessionWriter}.
 */
export class SessionStorage {
	private readonly _baseDir: string;

	constructor(
		userDataPath: string,
		private readonly _logService: ILogService,
	) {
		this._baseDir = join(userDataPath, 'agentSessions');
	}

	/** The base directory for all session JSONL files. */
	get baseDir(): string { return this._baseDir; }

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
				let files: string[];
				try {
					files = await fs.readdir(dir);
				} catch {
					continue; // Directory doesn't exist
				}
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

		try {
			const content = await fs.readFile(filePath, 'utf-8');
			return this._parseSessionFile(content);
		} catch {
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
				try {
					const content = await fs.readFile(join(dir, fileName), 'utf-8');
					return this._parseSessionFile(content);
				} catch {
					continue;
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
		try {
			await fs.unlink(filePath);
		} catch {
			// File may not exist
		}
	}

	// -- Private helpers ------------------------------------------------------

	private _sessionDir(workingDirectory: string): string {
		const key = workingDirectory
			? createHash('sha256').update(workingDirectory).digest('hex').substring(0, 16)
			: 'no-workspace';
		return join(this._baseDir, key);
	}

	private _sessionPath(workingDirectory: string, sessionId: string): string {
		return join(this._sessionDir(workingDirectory), `${sessionId}.jsonl`);
	}

	private async _allWorkspaceDirs(): Promise<string[]> {
		try {
			const entries = await fs.readdir(this._baseDir, { withFileTypes: true });
			return entries
				.filter(e => e.isDirectory())
				.map(e => join(this._baseDir, e.name));
		} catch {
			return [];
		}
	}

	private async _readSessionMetadata(filePath: string): Promise<IAgentSessionMetadata | undefined> {
		const [content, stat] = await Promise.all([
			fs.readFile(filePath, 'utf-8'),
			fs.stat(filePath),
		]);
		const lines = content.split('\n').filter(l => l.trim());
		if (lines.length === 0) {
			return undefined;
		}

		const headerResult = vSessionCreatedRecord.validate(JSON.parse(lines[0]));
		if (headerResult.error) {
			return undefined;
		}
		const header = headerResult.content;

		let summary: string | undefined;
		for (const line of lines) {
			try {
				const raw = JSON.parse(line) as Record<string, unknown>;
				if (raw['type'] === 'user-message' && typeof raw['content'] === 'string') {
					const text = raw['content'];
					summary = text.length > 80 ? text.substring(0, 77) + '...' : text;
					break;
				}
			} catch {
				continue;
			}
		}

		return {
			session: AgentSession.uri('local', header.sessionId),
			startTime: header.startTime,
			modifiedTime: stat.mtimeMs,
			summary,
		};
	}

	private _parseSessionFile(content: string): IRestoredSession | undefined {
		const lines = content.split('\n').filter(l => l.trim());
		if (lines.length === 0) {
			return undefined;
		}

		const headerResult = vSessionCreatedRecord.validate(JSON.parse(lines[0]));
		if (headerResult.error) {
			return undefined;
		}
		const header = headerResult.content;

		const entries: SessionEntry[] = [];
		for (const line of lines) {
			try {
				const raw = normalizeLegacyFields(JSON.parse(line) as Record<string, unknown>);
				if (raw['type'] === 'session-created') {
					continue;
				}
				const result = vSessionEntry.validate(raw);
				if (!result.error) {
					entries.push(result.content);
				}
			} catch {
				continue;
			}
		}

		return {
			sessionId: header.sessionId,
			model: header.model,
			workingDirectory: header.workingDirectory,
			startTime: header.startTime,
			entries,
		};
	}
}
