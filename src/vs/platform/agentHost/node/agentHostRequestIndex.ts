/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Database } from '@vscode/sqlite3';
import * as fs from 'fs';
import { Sequencer } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AGENT_HOST_REQUEST_SEARCH_DEFAULT_LIMIT, AGENT_HOST_REQUEST_SEARCH_MAX_LIMIT, AGENT_HOST_REQUEST_SEARCH_SNIPPET_LENGTH, parseAgentHostRequestSearchTerms, type IAgentHostRequestSearchHit, type IAgentHostRequestSearchResult } from '../common/agentHostRequestSearch.js';
import { AgentHostRequestSearchEnabledConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostDatabase } from './agentHostDatabase.js';
import { configureSqliteJournal } from './agentHostSqliteJournal.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

/** Longest request text the index keeps; later text is not searchable. */
const MAX_INDEXED_TEXT_LENGTH = 10_000;
/** Most requests the index keeps; the oldest are dropped first. */
const MAX_INDEXED_REQUESTS = 20_000;
/** Inserts between two checks of {@link MAX_INDEXED_REQUESTS}. */
const PRUNE_INTERVAL = 100;
/** Context kept before the first match in a snippet. */
const SNIPPET_LEADING_CONTEXT = 60;
const SCHEMA_VERSION = 1;

export const IAgentHostRequestIndex = createDecorator<IAgentHostRequestIndex>('agentHostRequestIndex');

/** A turn that started in one of this host's chats. */
export interface IAgentHostIndexedTurn {
	readonly session: string;
	readonly chat: string;
	readonly isDefaultChat: boolean;
	/** The resource the chat's session database is keyed by, which maps restored turn IDs. */
	readonly storage: string | undefined;
	readonly turnId: string;
	readonly startedAt: number;
	/** The request text, or `undefined` for a turn the user did not send, which is kept only to order truncations. */
	readonly text: string | undefined;
	readonly sessionTitle: string | undefined;
	readonly chatTitle: string | undefined;
}

/**
 * The host's index of requests sent to its chats. It records turns as they
 * start, so it holds only requests sent since it was enabled; it does not read
 * provider transcripts. Writes never throw: failures are logged.
 */
export interface IAgentHostRequestIndex {
	readonly _serviceBrand: undefined;
	recordTurn(turn: IAgentHostIndexedTurn): void;
	/** Drops the chat's turns after `keptTurnId`, or all of them when it is `undefined`. */
	truncateChat(chat: string, keptTurnId: string | undefined): void;
	removeChat(chat: string): void;
	moveChat(chat: string, session: string, isDefaultChat: boolean): void;
	setTitle(resource: string, title: string): void;
	search(query: string, limit: number | undefined): Promise<IAgentHostRequestSearchResult>;
}

interface IIndexedRow {
	readonly seq: number;
	readonly chat: string;
	readonly turnId: string;
	readonly session: string;
	readonly storage: string | undefined;
	readonly isDefault: boolean;
	readonly startedAt: number;
	readonly text: string;
}

export class AgentHostRequestIndex extends Disposable implements IAgentHostRequestIndex {
	declare readonly _serviceBrand: undefined;

	private readonly _sequencer = new Sequencer();
	private _database: Promise<Database | undefined> | undefined;
	private _insertsSincePrune = 0;
	private _disposed = false;

	constructor(
		private readonly _path: string,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostDatabase private readonly _hostDatabase: IAgentHostDatabase,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._configurationService.onDidRootConfigChange(() => {
			if (!this._isEnabled()) {
				this._deleteIndex();
			}
		}));
	}

	override dispose(): void {
		this._disposed = true;
		void this._sequencer.queue(() => this._close());
		super.dispose();
	}

	private _isEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostRequestSearchEnabledConfigKey) !== false;
	}

	recordTurn(turn: IAgentHostIndexedTurn): void {
		const text = turn.text?.slice(0, MAX_INDEXED_TEXT_LENGTH);
		this._write('record', async database => {
			await run(database, `INSERT OR IGNORE INTO requests (chat, turn_id, session, storage, is_default, is_user, started_at, text, folded)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [turn.chat, turn.turnId, turn.session, turn.storage ?? null, turn.isDefaultChat ? 1 : 0, text === undefined ? 0 : 1, turn.startedAt, text ?? '', text?.toLowerCase() ?? '']);
			await this._upsertTitle(database, turn.session, turn.sessionTitle);
			await this._upsertTitle(database, turn.chat, turn.chatTitle);
			if (++this._insertsSincePrune >= PRUNE_INTERVAL) {
				this._insertsSincePrune = 0;
				await run(database, `DELETE FROM requests WHERE seq <= (SELECT seq FROM requests ORDER BY seq DESC LIMIT 1 OFFSET ?)`, [MAX_INDEXED_REQUESTS]);
			}
		});
	}

	truncateChat(chat: string, keptTurnId: string | undefined): void {
		this._write('truncate', async database => {
			if (keptTurnId === undefined) {
				await run(database, 'DELETE FROM requests WHERE chat = ?', [chat]);
				return;
			}
			const rows = await all(database, 'SELECT seq, turn_id, storage FROM requests WHERE chat = ? ORDER BY seq DESC', [chat]);
			for (const row of rows) {
				const turnId = row.turn_id as string;
				if (turnId === keptTurnId || await this._eventId(row.storage as string | null, turnId) === keptTurnId) {
					await run(database, 'DELETE FROM requests WHERE chat = ? AND seq > ?', [chat, row.seq]);
					return;
				}
			}
			// The kept turn predates the index, so every indexed turn of the chat came after it.
			await run(database, 'DELETE FROM requests WHERE chat = ?', [chat]);
		});
	}

	removeChat(chat: string): void {
		this._write('remove', async database => {
			await run(database, 'DELETE FROM requests WHERE chat = ?', [chat]);
			await run(database, 'DELETE FROM titles WHERE resource = ?', [chat]);
		});
	}

	moveChat(chat: string, session: string, isDefaultChat: boolean): void {
		this._write('move', database => run(database, 'UPDATE requests SET session = ?, is_default = ? WHERE chat = ?', [session, isDefaultChat ? 1 : 0, chat]));
	}

	setTitle(resource: string, title: string): void {
		this._write('title', database => this._upsertTitle(database, resource, title));
	}

	async search(query: string, limit: number | undefined): Promise<IAgentHostRequestSearchResult> {
		const terms = parseAgentHostRequestSearchTerms(query);
		if (!terms) {
			throw new Error('The query must contain between one and eight terms and at most 200 characters.');
		}
		if (!this._isEnabled()) {
			return { indexEnabled: false, hits: [], truncated: false };
		}
		const maxHits = Math.min(Math.max(Math.floor(limit ?? AGENT_HOST_REQUEST_SEARCH_DEFAULT_LIMIT), 1), AGENT_HOST_REQUEST_SEARCH_MAX_LIMIT);
		return this._sequencer.queue(async () => {
			const database = await this._open();
			if (!database) {
				return { indexEnabled: true, hits: [], truncated: false };
			}
			const where = `is_user = 1${terms.map(() => ' AND instr(folded, ?) > 0').join('')}`;
			const pageSize = maxHits + 1;
			const suppressed = new Map<string, boolean>();
			const hits: IAgentHostRequestSearchHit[] = [];
			let truncated = false;
			// Requests of deleted or hidden sessions are skipped, so a page can yield fewer hits than it reads.
			for (let offset = 0; !truncated;) {
				const rows = (await all(database, `SELECT seq, chat, turn_id, session, storage, is_default, started_at, text FROM requests
					WHERE ${where} ORDER BY started_at DESC, seq DESC LIMIT ? OFFSET ?`, [...terms, pageSize, offset])).map(toIndexedRow);
				offset += rows.length;
				for (const row of rows) {
					const session = this._stateManager.getChatOwner(row.chat) ?? row.session;
					let isSuppressed = suppressed.get(session);
					if (isSuppressed === undefined) {
						isSuppressed = await this._hostDatabase.isSessionSuppressed(session);
						suppressed.set(session, isSuppressed);
					}
					if (isSuppressed) {
						continue;
					}
					if (hits.length === maxHits) {
						truncated = true;
						break;
					}
					hits.push(await this._toHit(database, row, session, terms));
				}
				if (rows.length < pageSize) {
					break;
				}
			}
			const oldest = await get(database, 'SELECT MIN(started_at) AS startedAt FROM requests WHERE is_user = 1', []);
			const indexedSince = typeof oldest?.startedAt === 'number' ? new Date(oldest.startedAt).toISOString() : undefined;
			return { indexEnabled: true, hits, truncated, ...(indexedSince ? { indexedSince } : {}) };
		});
	}

	private async _toHit(database: Database, row: IIndexedRow, session: string, terms: readonly string[]): Promise<IAgentHostRequestSearchHit> {
		// A chat recorded as its session's default stays so unless the host now records another default for its owner.
		const isDefault = this._isDefaultChat(session, row.chat) ?? (session === row.session && row.isDefault);
		const summary = this._stateManager.getSessionSummary(session) ?? this._stateManager.getSurfacedSessionSummary(session);
		const sessionTitle = summary?.title ?? await this._readTitle(database, session);
		const chatTitle = isDefault ? undefined : summary?.chats?.find(chat => chat.resource === row.chat)?.title ?? await this._readTitle(database, row.chat);
		return {
			session,
			...(isDefault ? {} : { chat: row.chat }),
			turnId: await this._exposedTurnId(row),
			startedAt: new Date(row.startedAt).toISOString(),
			snippet: buildRequestSnippet(row.text, terms),
			...(sessionTitle ? { sessionTitle } : {}),
			...(chatTitle ? { chatTitle } : {}),
		};
	}

	private _isDefaultChat(session: string, chat: string): boolean | undefined {
		const defaultChat = this._stateManager.getDefaultChat(session);
		return defaultChat === undefined ? (chat === session ? true : undefined) : defaultChat === chat;
	}

	/**
	 * A turn keeps the ID it started with while its chat stays loaded. A restored
	 * turn takes the ID the provider recorded for it, which the chat's session
	 * database maps; providers that record none reuse the original ID.
	 */
	private async _exposedTurnId(row: IIndexedRow): Promise<string> {
		const chatState = this._stateManager.getChatState(row.chat);
		if (chatState && (chatState.activeTurn?.id === row.turnId || chatState.turns.some(turn => turn.id === row.turnId))) {
			return row.turnId;
		}
		return await this._eventId(row.storage ?? null, row.turnId) ?? row.turnId;
	}

	private async _eventId(storage: string | null, turnId: string): Promise<string | undefined> {
		if (!storage) {
			return undefined;
		}
		try {
			const reference = await this._sessionDataService.tryOpenDatabase(URI.parse(storage));
			if (!reference) {
				return undefined;
			}
			try {
				return await reference.object.getTurnEventId(turnId);
			} finally {
				reference.dispose();
			}
		} catch (error) {
			this._logService.warn(`[AgentHostRequestIndex] Failed to map turn ${turnId}`, error);
			return undefined;
		}
	}

	private async _readTitle(database: Database, resource: string): Promise<string | undefined> {
		const row = await get(database, 'SELECT title FROM titles WHERE resource = ?', [resource]);
		return typeof row?.title === 'string' && row.title ? row.title : undefined;
	}

	private async _upsertTitle(database: Database, resource: string, title: string | undefined): Promise<void> {
		if (title) {
			await run(database, `INSERT INTO titles (resource, title) VALUES (?, ?) ON CONFLICT(resource) DO UPDATE SET title = excluded.title`, [resource, title]);
		}
	}

	private _write(operation: string, task: (database: Database) => Promise<unknown>): void {
		// While request search is off the index is deleted, and nothing may write to it, which would create it again.
		if (!this._isEnabled()) {
			return;
		}
		void this._sequencer.queue(async () => {
			const database = await this._open();
			if (database) {
				await task(database);
			}
		}).catch(error => this._logService.error(`[AgentHostRequestIndex] Failed to ${operation}`, error));
	}

	/** Closes the index and deletes its files; the next write after request search is turned on starts a new one. */
	private _deleteIndex(): void {
		void this._sequencer.queue(async () => {
			await this._close();
			if (isDatabaseFile(this._path)) {
				await Promise.all(['', '-wal', '-shm', '-journal'].map(suffix => fs.promises.rm(`${this._path}${suffix}`, { force: true })));
			}
		}).catch(error => this._logService.error('[AgentHostRequestIndex] Failed to delete the request index', error));
	}

	private async _close(): Promise<void> {
		const database = await this._database;
		this._database = undefined;
		if (database) {
			await new Promise<void>(resolve => database.close(() => resolve()));
		}
	}

	private _open(): Promise<Database | undefined> {
		if (this._disposed) {
			return Promise.resolve(undefined);
		}
		this._database ??= this._doOpen().catch(error => {
			this._logService.error('[AgentHostRequestIndex] Failed to open the request index', error);
			return undefined;
		});
		return this._database;
	}

	private async _doOpen(): Promise<Database | undefined> {
		const sqlite3 = await import('@vscode/sqlite3');
		const database = await new Promise<Database>((resolve, reject) => {
			const opened: Database = new sqlite3.default.Database(this._path, error => error ? reject(error) : resolve(opened));
		});
		await configureSqliteJournal(database, this._path);
		const version = (await get(database, 'PRAGMA user_version', []))?.user_version as number | undefined ?? 0;
		if (version > SCHEMA_VERSION) {
			// A newer build owns this index; leave it intact rather than rewriting its schema.
			this._logService.warn(`[AgentHostRequestIndex] Index schema ${version} is newer than ${SCHEMA_VERSION}; request search is unavailable`);
			await new Promise<void>(resolve => database.close(() => resolve()));
			return undefined;
		}
		if (version < SCHEMA_VERSION) {
			await exec(database, `
				CREATE TABLE IF NOT EXISTS requests (
					seq INTEGER PRIMARY KEY AUTOINCREMENT,
					chat TEXT NOT NULL,
					turn_id TEXT NOT NULL,
					session TEXT NOT NULL,
					storage TEXT,
					is_default INTEGER NOT NULL,
					is_user INTEGER NOT NULL,
					started_at INTEGER NOT NULL,
					text TEXT NOT NULL,
					folded TEXT NOT NULL,
					UNIQUE (chat, turn_id)
				);
				CREATE INDEX IF NOT EXISTS requests_by_chat ON requests (chat, seq);
				CREATE INDEX IF NOT EXISTS requests_by_time ON requests (started_at);
				CREATE TABLE IF NOT EXISTS titles (
					resource TEXT PRIMARY KEY NOT NULL,
					title TEXT NOT NULL
				);
				PRAGMA user_version = ${SCHEMA_VERSION};
			`);
		}
		return database;
	}
}

/**
 * The part of `text` around the earliest match of any term, with whitespace
 * collapsed, at most {@link AGENT_HOST_REQUEST_SEARCH_SNIPPET_LENGTH}
 * characters plus an ellipsis at each end where text was cut.
 */
export function buildRequestSnippet(text: string, terms: readonly string[]): string {
	const display = text.replace(/\s+/g, ' ').trim();
	if (display.length <= AGENT_HOST_REQUEST_SEARCH_SNIPPET_LENGTH) {
		return display;
	}
	const folded = display.toLowerCase();
	const matches = terms.map(term => folded.indexOf(term)).filter(index => index >= 0);
	const match = matches.length ? Math.min(...matches) : 0;
	const end = Math.min(display.length, Math.max(match - SNIPPET_LEADING_CONTEXT, 0) + AGENT_HOST_REQUEST_SEARCH_SNIPPET_LENGTH);
	const start = Math.max(0, end - AGENT_HOST_REQUEST_SEARCH_SNIPPET_LENGTH);
	return `${start > 0 ? '…' : ''}${display.slice(start, end).trim()}${end < display.length ? '…' : ''}`;
}

function toIndexedRow(row: Record<string, unknown>): IIndexedRow {
	return {
		seq: row.seq as number,
		chat: row.chat as string,
		turnId: row.turn_id as string,
		session: row.session as string,
		storage: (row.storage as string | null) ?? undefined,
		isDefault: row.is_default === 1,
		startedAt: row.started_at as number,
		text: row.text as string,
	};
}

/** Whether `path` names a database file, as opposed to an in-memory database. */
function isDatabaseFile(path: string): boolean {
	return path !== '' && path !== ':memory:' && !path.startsWith('file:');
}

function exec(database: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve()));
}

function run(database: Database, sql: string, parameters: readonly unknown[]): Promise<void> {
	return new Promise((resolve, reject) => database.run(sql, parameters, error => error ? reject(error) : resolve()));
}

function get(database: Database, sql: string, parameters: readonly unknown[]): Promise<Record<string, unknown> | undefined> {
	return new Promise((resolve, reject) => database.get(sql, parameters, (error: Error | null, row: Record<string, unknown> | undefined) => error ? reject(error) : resolve(row)));
}

function all(database: Database, sql: string, parameters: readonly unknown[]): Promise<Record<string, unknown>[]> {
	return new Promise((resolve, reject) => database.all(sql, parameters, (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows)));
}
