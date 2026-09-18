/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Database } from '@vscode/sqlite3';
import { createHash } from 'crypto';
import { chmod, lstat, mkdir, open } from 'fs/promises';
import { SequencerByKey } from '../../../base/common/async.js';
import { dirname, resolve } from '../../../base/common/path.js';
import { isWindows } from '../../../base/common/platform.js';
import { hasKey } from '../../../base/common/types.js';
import { AGENT_CHAT_SEARCH_MAX_RESULTS, getAgentSessionSearchTerms, type IAgentChatSearchResult } from '../common/agentHostSessionSearch.js';
import { MAX_SESSION_EMBEDDING_BATCH, MAX_SESSION_EMBEDDING_DIMENSIONS, validateSessionSemanticRequest, type ISessionEmbeddingModel, type ISessionEmbeddingValue, type ISessionSemanticMatch, type ISessionSemanticRequest, type ISessionSemanticResult } from '../common/sessionSemanticSearch.js';

export interface ISessionSearchChat {
	readonly harness: string;
	readonly sessionUri: string;
	readonly chatUri: string;
	readonly storageUri: string;
	readonly sourceKey: string;
}

export interface ISessionSearchDocument {
	readonly turnId: string;
	readonly role: 'user' | 'assistant';
	readonly sourceLocator: string;
	readonly text: string;
}

export interface ISessionSearchSource {
	readonly revision: string;
	readonly documents: AsyncIterable<ISessionSearchDocument>;
}

const operations = new SequencerByKey<string>();
const applicationId = 0x56535343; // VSSC: VS Code session search cache.
const schemaVersion = 2;
const indexVersion = 1;
const snippetLength = 220;
const chunkLength = 1500;
const chunkOverlap = 200;
const minimumSemanticScore = 0.25;
const matchStart = '\uFDD0';
const matchEnd = '\uFDD1';
const semanticScope = 'c.session_uri = ? AND c.chat_uri IN (SELECT value FROM json_each(?))';

interface IChatRow {
	readonly id: number;
	readonly session_uri: string;
	readonly storage_uri: string;
	readonly source_key: string;
	readonly revision: string;
	readonly index_version: number;
}

interface IMatchRow {
	readonly turnId: string;
	readonly role: number;
	readonly snippet: string;
}

interface IChunkRow {
	readonly id: number;
	readonly document_id: number;
	readonly start_offset: number;
	readonly end_offset: number;
	readonly content_hash: string;
}

interface IVectorRow extends IChunkRow {
	readonly chat: string;
	readonly turnId: string;
	readonly role: number;
	readonly vector: Buffer | null;
}

interface IRankedChunk {
	readonly row: IVectorRow;
	readonly score: number;
}

/** A rebuildable, provider-neutral cache; connections live only for the duration of queued operations. */
export class SessionSearchDatabase {
	private readonly databasePath: string;

	constructor(databasePath: string) {
		this.databasePath = resolve(databasePath);
	}

	async searchChat(chat: ISessionSearchChat, query: string, readSource: () => Promise<ISessionSearchSource>): Promise<IAgentChatSearchResult> {
		const terms = getAgentSessionSearchTerms(query);
		if (!terms.length) {
			return { matches: [], hasMore: false };
		}
		return operations.queue(this.databasePath, async () => {
			const source = await readSource();
			const db = await this.openDatabase(true);
			try {
				const [cached] = await all<IChatRow>(db, 'SELECT * FROM search_chats WHERE harness = ? AND chat_uri = ?', [chat.harness, chat.chatUri]);
				const chatId = cached && cached.source_key === chat.sourceKey && cached.revision === source.revision
					&& cached.index_version === indexVersion && cached.session_uri === chat.sessionUri && cached.storage_uri === chat.storageUri
					? cached.id
					: await rebuild(db, chat, source);
				const expression = terms.map(term => `"${term.replace(/"/g, '""')}"`).join(' AND ');
				const rows = await all<IMatchRow>(db, `
					SELECT t.turn_ref AS turnId, d.role, snippet(search_fts, 0, ?, ?, '…', 32) AS snippet
					FROM search_fts
					JOIN search_documents d ON d.id = search_fts.rowid
					JOIN search_turns t ON t.id = d.turn_id
					WHERE t.chat_id = ? AND search_fts MATCH ?
					ORDER BY bm25(search_fts), search_fts.rowid
					LIMIT ?
				`, [matchStart, matchEnd, chatId, expression, AGENT_CHAT_SEARCH_MAX_RESULTS + 1]);
				return {
					matches: rows.slice(0, AGENT_CHAT_SEARCH_MAX_RESULTS).map(row => ({
						turnId: row.turnId,
						role: row.role === 0 ? 'user' : 'assistant',
						snippet: trimSnippet(row.snippet),
					})),
					hasMore: rows.length > AGENT_CHAT_SEARCH_MAX_RESULTS,
				};
			} finally {
				await close(db);
			}
		});
	}

	async deleteScope(resource: string): Promise<void> {
		return operations.queue(this.databasePath, async () => {
			const db = await this.openDatabase(false);
			if (!db) {
				return;
			}
			try {
				await run(db, 'DELETE FROM search_chats WHERE storage_uri = ? OR session_uri = ?', [resource, resource]);
			} finally {
				await close(db);
			}
		});
	}

	/** Embeddings are supplied by the caller; this cache never invokes a model or reads provider storage. */
	async semanticSearch(sessionUri: string, chatUris: readonly string[], request: ISessionSemanticRequest): Promise<ISessionSemanticResult> {
		validateSessionSemanticRequest(request);
		const model = { ...request.model };
		const snapshot: ISessionSemanticRequest = request.kind === 'store'
			? { kind: 'store', model, values: request.values.map(value => ({ ...value, vector: [...value.vector] })) }
			: request.kind === 'search' ? { kind: 'search', model, vector: [...request.vector] } : { kind: 'pending', model };
		const scope = [sessionUri, JSON.stringify(chatUris)];
		const hasAllowedChats = chatUris.length > 0;
		return operations.queue(this.databasePath, async () => {
			const db = hasAllowedChats ? await this.openDatabase(false) : undefined;
			if (!db) {
				switch (snapshot.kind) {
					case 'pending': return { kind: 'pending', chunks: [], hasMore: false };
					case 'search': return { kind: 'search', matches: [], hasMore: false, incomplete: hasAllowedChats };
					case 'store':
						if (snapshot.values.length) {
							throw new Error('Session embedding chunk is stale or outside the allowed chats');
						}
						return { kind: 'store' };
				}
			}
			try {
				switch (snapshot.kind) {
					case 'pending': return await getPendingChunks(db, scope, snapshot.model);
					case 'store':
						await storeEmbeddings(db, scope, snapshot.model, snapshot.values);
						return { kind: 'store' };
					case 'search': return await searchEmbeddings(db, scope, snapshot.model, snapshot.vector);
				}
			} finally {
				await close(db);
			}
		});
	}

	async whenIdle(): Promise<void> {
		await operations.queue(this.databasePath, async () => { });
	}

	private async openDatabase(create: true): Promise<Database>;
	private async openDatabase(create: false): Promise<Database | undefined>;
	private async openDatabase(create: boolean): Promise<Database | undefined> {
		try {
			await lstat(this.databasePath);
		} catch (error) {
			if (!isMissing(error)) {
				throw error;
			}
			if (!create) {
				return undefined;
			}
			await mkdir(dirname(this.databasePath), { recursive: true, mode: 0o700 });
			try {
				const file = await open(this.databasePath, 'wx', 0o600);
				await file.close();
			} catch (error) {
				if (!(hasKey(error, { code: true }) && error.code === 'EEXIST')) {
					throw error;
				}
			}
		}
		if (!(await lstat(this.databasePath)).isFile()) {
			throw new Error('Session search cache must be a regular file');
		}

		// Inspect read-only first, so even recovery of a foreign database's journal cannot write to it.
		const inspection = await connect(this.databasePath, true);
		try {
			await checkOwnership(inspection);
		} finally {
			await close(inspection);
		}
		const db = await connect(this.databasePath, false);
		try {
			db.configure('busyTimeout', 5000);
			await initialize(db);
			if (!isWindows) {
				await chmod(this.databasePath, 0o600);
			}
			return db;
		} catch (error) {
			await close(db);
			throw error;
		}
	}
}

async function checkOwnership(db: Database): Promise<number> {
	const [{ application_id }] = await all<{ application_id: number }>(db, 'PRAGMA application_id');
	const [{ user_version }] = await all<{ user_version: number }>(db, 'PRAGMA user_version');
	if (application_id === applicationId && (user_version === 1 || user_version === schemaVersion)) {
		return user_version;
	}
	const [{ count }] = await all<{ count: number }>(db, 'SELECT count(*) AS count FROM sqlite_master');
	if ((application_id === 0 || application_id === applicationId) && user_version === 0 && count === 0) {
		return 0;
	}
	throw new Error('Refusing to modify an unrecognized or unsupported session search database');
}

async function initialize(db: Database): Promise<void> {
	await exec(db, 'PRAGMA foreign_keys = ON');
	if (await checkOwnership(db) === schemaVersion) {
		return;
	}
	await exec(db, 'BEGIN IMMEDIATE');
	try {
		const version = await checkOwnership(db);
		if (version === 0) {
			await exec(db, `
				CREATE TABLE search_chats (
					id INTEGER PRIMARY KEY,
					harness TEXT NOT NULL,
					session_uri TEXT NOT NULL,
					chat_uri TEXT NOT NULL,
					storage_uri TEXT NOT NULL,
					source_key TEXT NOT NULL,
					revision TEXT NOT NULL,
					index_version INTEGER NOT NULL,
					UNIQUE(harness, chat_uri)
				);
				CREATE INDEX search_chats_session ON search_chats(session_uri);
				CREATE INDEX search_chats_storage ON search_chats(storage_uri);
				CREATE TABLE search_turns (
					id INTEGER PRIMARY KEY,
					chat_id INTEGER NOT NULL REFERENCES search_chats(id) ON DELETE CASCADE,
					turn_ref TEXT NOT NULL,
					UNIQUE(chat_id, turn_ref)
				);
				CREATE TABLE search_documents (
					id INTEGER PRIMARY KEY,
					turn_id INTEGER NOT NULL REFERENCES search_turns(id) ON DELETE CASCADE,
					role INTEGER NOT NULL CHECK(role IN (0, 1)),
					source_locator TEXT NOT NULL
				);
				CREATE INDEX search_documents_turn ON search_documents(turn_id);
				CREATE VIRTUAL TABLE search_fts USING fts5(text);
				CREATE TRIGGER search_documents_delete AFTER DELETE ON search_documents BEGIN
					DELETE FROM search_fts WHERE rowid = old.id;
				END;
				PRAGMA application_id = ${applicationId};
			`);
		}
		if (version < 2) {
			await exec(db, `
				CREATE TABLE search_chunks (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					document_id INTEGER NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
					start_offset INTEGER NOT NULL CHECK(start_offset >= 0),
					end_offset INTEGER NOT NULL CHECK(end_offset > start_offset),
					content_hash TEXT NOT NULL,
					UNIQUE(document_id, start_offset)
				);
				CREATE TABLE search_embeddings (
					model_id TEXT NOT NULL,
					dimensions INTEGER NOT NULL CHECK(dimensions BETWEEN 1 AND ${MAX_SESSION_EMBEDDING_DIMENSIONS}),
					chunk_id INTEGER NOT NULL REFERENCES search_chunks(id) ON DELETE CASCADE,
					vector BLOB NOT NULL CHECK(length(vector) = dimensions * 4),
					PRIMARY KEY(model_id, dimensions, chunk_id)
				);
				CREATE INDEX search_embeddings_chunk ON search_embeddings(chunk_id);
				PRAGMA user_version = ${schemaVersion};
			`);
		}
		await exec(db, 'COMMIT');
	} catch (error) {
		await exec(db, 'ROLLBACK');
		throw error;
	}
}

async function getPendingChunks(db: Database, scope: string[], model: ISessionEmbeddingModel): Promise<ISessionSemanticResult> {
	await exec(db, 'BEGIN IMMEDIATE');
	try {
		const documents = await all<{ id: number; text: string }>(db, `
			SELECT d.id, f.text FROM search_documents d
			JOIN search_turns t ON t.id = d.turn_id JOIN search_chats c ON c.id = t.chat_id
			JOIN search_fts f ON f.rowid = d.id
			WHERE ${semanticScope} AND NOT EXISTS (SELECT 1 FROM search_chunks k WHERE k.document_id = d.id)
			ORDER BY d.id
		`, scope);
		for (const document of documents) {
			for (const [start, end] of chunkOffsets(document.text)) {
				const hash = createHash('sha256').update(document.text.slice(start, end)).digest('hex');
				await run(db, 'INSERT INTO search_chunks (document_id, start_offset, end_offset, content_hash) VALUES (?, ?, ?, ?)', [document.id, start, end, hash]);
			}
		}
		const rows = await all<IChunkRow>(db, `
			SELECT k.* FROM search_chunks k
			JOIN search_documents d ON d.id = k.document_id
			JOIN search_turns t ON t.id = d.turn_id JOIN search_chats c ON c.id = t.chat_id
			WHERE ${semanticScope} AND NOT EXISTS (
				SELECT 1 FROM search_embeddings e WHERE e.chunk_id = k.id AND e.model_id = ? AND e.dimensions = ?
			)
			ORDER BY k.id LIMIT ?
		`, [...scope, model.id, model.dimensions, MAX_SESSION_EMBEDDING_BATCH + 1]);
		const selected = rows.slice(0, MAX_SESSION_EMBEDDING_BATCH);
		const texts = await readChunkDocuments(db, selected);
		await exec(db, 'COMMIT');
		return {
			kind: 'pending',
			chunks: selected.map(row => ({
				id: row.id, contentHash: row.content_hash,
				text: texts.get(row.document_id)!.slice(row.start_offset, row.end_offset),
			})),
			hasMore: rows.length > MAX_SESSION_EMBEDDING_BATCH,
		};
	} catch (error) {
		await exec(db, 'ROLLBACK');
		throw error;
	}
}

/** Offsets use JavaScript UTF-16 indexing; bounded windows keep splitting linear even for huge tokens. */
function* chunkOffsets(text: string): Iterable<readonly [number, number]> {
	let start = 0;
	while (start < text.length) {
		let end = Math.min(start + chunkLength, text.length);
		if (end < text.length) {
			const boundaryStart = start + Math.floor(chunkLength / 2);
			const window = text.slice(boundaryStart, end);
			const paragraph = window.lastIndexOf('\n\n');
			if (paragraph >= 0) {
				end = boundaryStart + paragraph + 2;
			} else {
				for (let index = window.length - 1; index >= 0; index--) {
					if (/\s/.test(window[index])) {
						end = boundaryStart + index + 1;
						break;
					}
				}
			}
			if (isLowSurrogate(text.charCodeAt(end))) {
				end--;
			}
		}
		yield [start, end];
		if (end === text.length) {
			return;
		}
		start = end - chunkOverlap;
		if (isLowSurrogate(text.charCodeAt(start))) {
			start--;
		}
	}
}

function isLowSurrogate(code: number): boolean {
	return code >= 0xDC00 && code <= 0xDFFF;
}

async function storeEmbeddings(db: Database, scope: string[], model: ISessionEmbeddingModel, values: readonly ISessionEmbeddingValue[]): Promise<void> {
	await exec(db, 'BEGIN IMMEDIATE');
	try {
		for (const value of values) {
			const rows = await all<{ id: number }>(db, `
				SELECT k.id FROM search_chunks k JOIN search_documents d ON d.id = k.document_id
				JOIN search_turns t ON t.id = d.turn_id JOIN search_chats c ON c.id = t.chat_id
				WHERE ${semanticScope} AND k.id = ? AND k.content_hash = ?
			`, [...scope, value.id, value.contentHash]);
			if (!rows.length) {
				throw new Error('Session embedding chunk is stale or outside the allowed chats');
			}
			await run(db, `
				INSERT INTO search_embeddings (model_id, dimensions, chunk_id, vector) VALUES (?, ?, ?, ?)
				ON CONFLICT(model_id, dimensions, chunk_id) DO UPDATE SET vector = excluded.vector
			`, [model.id, model.dimensions, value.id, normalizeVector(value.vector)]);
		}
		await exec(db, 'COMMIT');
	} catch (error) {
		await exec(db, 'ROLLBACK');
		throw error;
	}
}

function normalizeVector(vector: readonly number[]): Buffer {
	let maximum = 0;
	for (const value of vector) {
		maximum = Math.max(maximum, Math.abs(value));
	}
	let squares = 0;
	for (const value of vector) {
		squares += (value / maximum) ** 2;
	}
	const norm = Math.sqrt(squares);
	const result = Buffer.alloc(vector.length * 4);
	for (let index = 0; index < vector.length; index++) {
		result.writeFloatLE((vector[index] / maximum) / norm, index * 4);
	}
	return result;
}

async function searchEmbeddings(db: Database, scope: string[], model: ISessionEmbeddingModel, vector: readonly number[]): Promise<ISessionSemanticResult> {
	const queryVector = normalizeVector(vector);
	const [{ missing }] = await all<{ missing: number }>(db, `
		SELECT EXISTS (
			SELECT 1 FROM json_each(?) allowed
			WHERE NOT EXISTS (SELECT 1 FROM search_chats c WHERE c.chat_uri = allowed.value AND c.session_uri = ?)
		) OR EXISTS (
			SELECT 1 FROM search_documents d
			JOIN search_turns t ON t.id = d.turn_id JOIN search_chats c ON c.id = t.chat_id
			WHERE ${semanticScope} AND NOT EXISTS (SELECT 1 FROM search_chunks k WHERE k.document_id = d.id)
		) AS missing
	`, [scope[1], scope[0], ...scope]);
	let incomplete = !!missing;
	const rows = await all<IVectorRow>(db, `
		SELECT k.*, c.chat_uri AS chat, t.turn_ref AS turnId, d.role, e.vector
		FROM search_chunks k JOIN search_documents d ON d.id = k.document_id
		JOIN search_turns t ON t.id = d.turn_id JOIN search_chats c ON c.id = t.chat_id
		LEFT JOIN search_embeddings e ON e.chunk_id = k.id AND e.model_id = ? AND e.dimensions = ?
		WHERE ${semanticScope}
		ORDER BY k.id
	`, [model.id, model.dimensions, ...scope]);
	const ranked: IRankedChunk[] = [];
	for (const row of rows) {
		if (!row.vector || row.vector.length !== queryVector.length) {
			incomplete = true;
			continue;
		}
		let score = 0;
		for (let index = 0; index < queryVector.length; index += 4) {
			score += row.vector.readFloatLE(index) * queryVector.readFloatLE(index);
		}
		if (!Number.isFinite(score)) {
			incomplete = true;
			continue;
		}
		if (score < minimumSemanticScore) {
			continue;
		}
		score = Math.min(1, score);
		const duplicate = ranked.findIndex(candidate => candidate.row.chat === row.chat && candidate.row.turnId === row.turnId && candidate.row.role === row.role);
		if (duplicate >= 0) {
			if (ranked[duplicate].score >= score) {
				continue;
			}
			ranked.splice(duplicate, 1);
		}
		const position = ranked.findIndex(candidate => candidate.score < score);
		ranked.splice(position < 0 ? ranked.length : position, 0, { row, score });
		if (ranked.length > AGENT_CHAT_SEARCH_MAX_RESULTS + 1) {
			ranked.pop();
		}
	}
	const selected = ranked.slice(0, AGENT_CHAT_SEARCH_MAX_RESULTS);
	const texts = await readChunkDocuments(db, selected.map(candidate => candidate.row));
	const matches: ISessionSemanticMatch[] = selected.map(({ row, score }) => ({
		chat: row.chat,
		turnId: row.turnId,
		role: row.role === 0 ? 'user' : 'assistant',
		snippet: trimSnippet(texts.get(row.document_id)!.slice(row.start_offset, row.end_offset)),
		score,
	}));
	return { kind: 'search', matches, hasMore: ranked.length > AGENT_CHAT_SEARCH_MAX_RESULTS, incomplete };
}

/** Read each full FTS document once rather than repeating it for every overlapping chunk. */
async function readChunkDocuments(db: Database, chunks: readonly IChunkRow[]): Promise<Map<number, string>> {
	if (!chunks.length) {
		return new Map();
	}
	const rows = await all<{ id: number; text: string }>(db, `
		SELECT rowid AS id, text FROM search_fts WHERE rowid IN (SELECT value FROM json_each(?))
	`, [JSON.stringify([...new Set(chunks.map(chunk => chunk.document_id))])]);
	return new Map(rows.map(row => [row.id, row.text]));
}

async function rebuild(db: Database, chat: ISessionSearchChat, source: ISessionSearchSource): Promise<number> {
	await exec(db, 'BEGIN IMMEDIATE');
	try {
		const [{ id: chatId }] = await all<{ id: number }>(db, `
			INSERT INTO search_chats (harness, session_uri, chat_uri, storage_uri, source_key, revision, index_version)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(harness, chat_uri) DO UPDATE SET
				session_uri = excluded.session_uri, storage_uri = excluded.storage_uri, source_key = excluded.source_key,
				revision = excluded.revision, index_version = excluded.index_version
			RETURNING id
		`, [chat.harness, chat.sessionUri, chat.chatUri, chat.storageUri, chat.sourceKey, source.revision, indexVersion]);
		await run(db, 'DELETE FROM search_turns WHERE chat_id = ?', [chatId]);
		if (source.revision) {
			for await (const document of source.documents) {
				if (!document.text.trim()) {
					continue;
				}
				const [{ id: turnId }] = await all<{ id: number }>(db, `
					INSERT INTO search_turns (chat_id, turn_ref) VALUES (?, ?)
					ON CONFLICT(chat_id, turn_ref) DO UPDATE SET turn_ref = excluded.turn_ref RETURNING id
				`, [chatId, document.turnId]);
				const [{ id: documentId }] = await all<{ id: number }>(db, `
					INSERT INTO search_documents (turn_id, role, source_locator) VALUES (?, ?, ?) RETURNING id
				`, [turnId, document.role === 'user' ? 0 : 1, document.sourceLocator]);
				await run(db, 'INSERT INTO search_fts (rowid, text) VALUES (?, ?)', [documentId, document.text]);
			}
		}
		await exec(db, 'COMMIT');
		return chatId;
	} catch (error) {
		await exec(db, 'ROLLBACK');
		throw error;
	}
}

function trimSnippet(marked: string): string {
	const normalized = marked.replace(/\s+/g, ' ').trim();
	const firstMatch = normalized.indexOf(matchStart);
	const text = normalized.split(matchStart).join('').split(matchEnd).join('');
	if (text.length <= snippetLength) {
		return text;
	}
	const start = Math.max(0, firstMatch - 60);
	const content = text.slice(start, start + snippetLength - 2);
	return `${start ? '…' : ''}${content}${start + content.length < text.length ? '…' : ''}`;
}

function isMissing(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	const filesystemError: NodeJS.ErrnoException = error;
	return filesystemError.code === 'ENOENT';
}

async function connect(path: string, readonly: boolean): Promise<Database> {
	const sqlite3 = await import('@vscode/sqlite3');
	return new Promise((resolve, reject) => {
		const db = new sqlite3.default.Database(path, readonly ? sqlite3.default.OPEN_READONLY : sqlite3.default.OPEN_READWRITE, error => error ? reject(error) : resolve(db));
	});
}

function close(db: Database): Promise<void> {
	return new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
}

function exec(db: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
}

function run(db: Database, sql: string, parameters: (string | number | Buffer)[]): Promise<void> {
	return new Promise((resolve, reject) => db.run(sql, parameters, error => error ? reject(error) : resolve()));
}

function all<T>(db: Database, sql: string, parameters: (string | number)[] = []): Promise<T[]> {
	return new Promise((resolve, reject) => db.all(sql, parameters, (error: Error | null, rows: T[]) => error ? reject(error) : resolve(rows)));
}
