/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Database } from '@vscode/sqlite3';
import { createHash } from 'crypto';
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { DeferredPromise } from '../../../../base/common/async.js';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_CHAT_SEARCH_MAX_RESULTS, MAX_SESSION_SEARCH_QUERY_LENGTH } from '../../common/agentHostSessionSearch.js';
import { MAX_SESSION_EMBEDDING_BATCH, MAX_SESSION_EMBEDDING_DIMENSIONS, validateSessionSemanticRequest, type ISessionEmbeddingChunk, type ISessionEmbeddingModel, type ISessionSemanticRequest } from '../../common/sessionSemanticSearch.js';
import { SessionSearchDatabase, type ISessionSearchChat, type ISessionSearchDocument, type ISessionSearchSource } from '../../node/sessionSearchDatabase.js';

function chat(harness = 'copilot', sessionUri = 'session:/parent', chatUri = `${sessionUri}/default`, storageUri = sessionUri): ISessionSearchChat {
	return { harness, sessionUri, chatUri, storageUri, sourceKey: 'backing-session' };
}

function document(text: string, turnId = 'turn', role: ISessionSearchDocument['role'] = 'user', sourceLocator = 'message'): ISessionSearchDocument {
	return { turnId, role, sourceLocator, text };
}

class TestSource {
	reads = 0;
	iterations = 0;

	constructor(public documents: ISessionSearchDocument[], public revision = 'revision-1') { }

	readonly read = async (): Promise<ISessionSearchSource> => {
		this.reads++;
		return { revision: this.revision, documents: this.iterate() };
	};

	private async *iterate(): AsyncIterable<ISessionSearchDocument> {
		this.iterations++;
		yield* this.documents;
	}
}

async function withDatabase<T>(path: string, writable: boolean, task: (db: Database) => Promise<T>): Promise<T> {
	const sqlite3 = await import('@vscode/sqlite3');
	const db = await new Promise<Database>((resolve, reject) => {
		const database = new sqlite3.default.Database(path, writable ? sqlite3.default.OPEN_READWRITE | sqlite3.default.OPEN_CREATE : sqlite3.default.OPEN_READONLY, error => error ? reject(error) : resolve(database));
	});
	try {
		return await task(db);
	} finally {
		await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
	}
}

function query<T>(db: Database, sql: string): Promise<T[]> {
	return new Promise((resolve, reject) => db.all(sql, (error: Error | null, rows: T[]) => error ? reject(error) : resolve(rows)));
}

function exec(db: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
}

function counts(db: Database) {
	return query<{ chats: number; turns: number; documents: number; fts: number }>(db, `
		SELECT
			(SELECT count(*) FROM search_chats) AS chats,
			(SELECT count(*) FROM search_turns) AS turns,
			(SELECT count(*) FROM search_documents) AS documents,
			(SELECT count(*) FROM search_fts) AS fts
	`);
}

function semanticCounts(db: Database) {
	return query<{ chunks: number; embeddings: number }>(db, `
		SELECT (SELECT count(*) FROM search_chunks) AS chunks, (SELECT count(*) FROM search_embeddings) AS embeddings
	`);
}

suite('SessionSearchDatabase', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let directory: string;
	let databasePath: string;
	let database: SessionSearchDatabase;

	setup(async () => {
		directory = join(process.cwd(), `.session-search-test-${generateUuid()}`);
		await mkdir(directory, { mode: 0o700 });
		databasePath = join(directory, 'index', 'search.db');
		database = new SessionSearchDatabase(databasePath);
	});

	teardown(async () => {
		await database.whenIdle();
		await rm(directory, { recursive: true, force: true });
	});

	test('shares a persistent cache across harnesses without colliding identical chat, turn, or source identifiers', async () => {
		const harnesses = ['copilot', 'claude', 'codex'];
		const sources = harnesses.map(harness => new TestSource([
			document(`shared ${harness} request`),
			document(`shared ${harness} response`, 'turn', 'assistant'),
		]));
		await Promise.all(harnesses.map((harness, index) => database.searchChat(chat(harness), 'shared', sources[index].read)));
		const reopened = new SessionSearchDatabase(databasePath);
		const results = await Promise.all(harnesses.map((harness, index) => reopened.searchChat(chat(harness), 'shared', sources[index].read)));
		assert.deepStrictEqual({
			results,
			reads: sources.map(source => source.reads),
			iterations: sources.map(source => source.iterations),
			counts: await withDatabase(databasePath, false, counts),
		}, {
			results: harnesses.map(harness => ({
				matches: [
					{ turnId: 'turn', role: 'user', snippet: `shared ${harness} request` },
					{ turnId: 'turn', role: 'assistant', snippet: `shared ${harness} response` },
				],
				hasMore: false,
			})),
			reads: [2, 2, 2],
			iterations: [1, 1, 1],
			counts: [{ chats: 3, turns: 3, documents: 6, fts: 6 }],
		});
	});

	test('invalidates only the target chat on source revision, backing identity, or index version changes', async () => {
		const target = new TestSource([document('original')]);
		const other = new TestSource([document('unrelated')]);
		await database.searchChat(chat(), 'original', target.read);
		await database.searchChat(chat('claude'), 'unrelated', other.read);
		const originalOther = await withDatabase(databasePath, false, db => query(db, `
			SELECT c.*, t.id AS turn_id, d.id AS document_id, f.text
			FROM search_chats c JOIN search_turns t ON t.chat_id = c.id
			JOIN search_documents d ON d.turn_id = t.id JOIN search_fts f ON f.rowid = d.id
			WHERE c.harness = 'claude'
		`));

		target.revision = 'revision-2';
		target.documents = [document('revised')];
		const revised = await database.searchChat(chat(), 'revised', target.read);
		const oldRevision = await database.searchChat(chat(), 'original', target.read);
		target.documents = [document('replacement')];
		const changedBacking = { ...chat(), sourceKey: 'new-backing' };
		const backing = await database.searchChat(changedBacking, 'replacement', target.read);
		const oldBacking = await database.searchChat(changedBacking, 'revised', target.read);
		await withDatabase(databasePath, true, db => exec(db, `UPDATE search_chats SET index_version = 0 WHERE harness = 'copilot'`));
		target.documents = [document('reindexed')];
		const reindexed = await database.searchChat(changedBacking, 'reindexed', target.read);
		await database.searchChat(chat('claude'), 'unrelated', other.read);
		const currentOther = await withDatabase(databasePath, false, db => query(db, `
			SELECT c.*, t.id AS turn_id, d.id AS document_id, f.text
			FROM search_chats c JOIN search_turns t ON t.chat_id = c.id
			JOIN search_documents d ON d.turn_id = t.id JOIN search_fts f ON f.rowid = d.id
			WHERE c.harness = 'claude'
		`));
		assert.deepStrictEqual({
			matches: [revised, backing, reindexed].map(result => result.matches.map(match => match.snippet)),
			oldMatches: [oldRevision.matches, oldBacking.matches],
			iterations: [target.iterations, other.iterations],
			otherUnchanged: currentOther,
			metadata: await withDatabase(databasePath, false, db => query(db, `SELECT source_key, revision, index_version FROM search_chats WHERE harness = 'copilot'`)),
		}, {
			matches: [['revised'], ['replacement'], ['reindexed']],
			oldMatches: [[], []],
			iterations: [4, 1],
			otherUnchanged: originalOther,
			metadata: [{ source_key: 'new-backing', revision: 'revision-2', index_version: 1 }],
		});
	});

	test('empty revision and empty history clear only the target documents', async () => {
		const target = new TestSource([document('target')]);
		const other = new TestSource([document('unrelated')]);
		await database.searchChat(chat('claude'), 'unrelated', other.read);
		await database.searchChat(chat(), 'target', target.read);
		target.revision = '';
		const emptyRevision = await database.searchChat(chat(), 'target', target.read);
		const afterEmptyRevision = await withDatabase(databasePath, false, counts);
		const iterationsAfterEmptyRevision = target.iterations;
		target.revision = 'restored';
		await database.searchChat(chat(), 'target', target.read);
		target.revision = 'empty-history';
		target.documents = [];
		const emptyHistory = await database.searchChat(chat(), 'target', target.read);
		assert.deepStrictEqual({
			results: [emptyRevision, emptyHistory],
			iterationsAfterEmptyRevision,
			counts: [afterEmptyRevision, await withDatabase(databasePath, false, counts)],
			other: (await database.searchChat(chat('claude'), 'unrelated', other.read)).matches,
		}, {
			results: [{ matches: [], hasMore: false }, { matches: [], hasMore: false }],
			iterationsAfterEmptyRevision: 1,
			counts: [
				[{ chats: 2, turns: 1, documents: 1, fts: 1 }],
				[{ chats: 2, turns: 1, documents: 1, fts: 1 }],
			],
			other: [{ turnId: 'turn', role: 'user', snippet: 'unrelated' }],
		});
	});

	test('keeps integer relationships and full original text exclusively in contentful FTS', async () => {
		const text = '  original\n\tUnicode café 🐈 text  ';
		await database.searchChat(chat(), 'original', new TestSource([
			document(text),
			document('answer original', 'turn', 'assistant', 'answer'),
			document('   ', 'empty'),
		]).read);
		const snapshot = await withDatabase(databasePath, false, async db => ({
			ftsColumns: (await query<{ name: string }>(db, 'PRAGMA table_info(search_fts)')).map(column => column.name),
			documentColumns: (await query<{ name: string }>(db, 'PRAGMA table_info(search_documents)')).map(column => column.name),
			turnColumns: (await query<{ name: string }>(db, 'PRAGMA table_info(search_turns)')).map(column => column.name),
			rows: await query(db, `
				SELECT typeof(c.id) AS chat_type, typeof(t.id) AS turn_type, typeof(d.id) AS document_type,
					typeof(t.chat_id) AS chat_fk_type, typeof(d.turn_id) AS turn_fk_type, typeof(f.rowid) AS fts_type,
					d.id = f.rowid AS matching_id, d.role, d.source_locator, f.text
				FROM search_chats c JOIN search_turns t ON t.chat_id = c.id
				JOIN search_documents d ON d.turn_id = t.id JOIN search_fts f ON f.rowid = d.id ORDER BY d.id
			`),
			storedContent: await query(db, 'SELECT c0 FROM search_fts_content ORDER BY id'),
			counts: await counts(db),
			foreignKeys: await query(db, 'PRAGMA foreign_key_check'),
			indexedForeignKeys: await query(db, `
				SELECT 'chat_id' AS name FROM pragma_index_list('search_turns') l, pragma_index_info(l.name) i
					WHERE i.name = 'chat_id' AND i.seqno = 0
				UNION ALL
				SELECT 'turn_id' AS name FROM pragma_index_list('search_documents') l, pragma_index_info(l.name) i
					WHERE i.name = 'turn_id' AND i.seqno = 0
			`),
		}));
		assert.deepStrictEqual(snapshot, {
			ftsColumns: ['text'],
			documentColumns: ['id', 'turn_id', 'role', 'source_locator'],
			turnColumns: ['id', 'chat_id', 'turn_ref'],
			rows: [text, 'answer original'].map((text, index) => ({
				chat_type: 'integer', turn_type: 'integer', document_type: 'integer',
				chat_fk_type: 'integer', turn_fk_type: 'integer', fts_type: 'integer', matching_id: 1,
				role: index, source_locator: index ? 'answer' : 'message', text,
			})),
			storedContent: [{ c0: text }, { c0: 'answer original' }],
			counts: [{ chats: 1, turns: 1, documents: 2, fts: 2 }],
			foreignKeys: [],
			indexedForeignKeys: [{ name: 'chat_id' }, { name: 'turn_id' }],
		});
	});

	test('deletes peer storage independently and parent scopes with all their metadata and FTS', async () => {
		const parent = chat();
		const peer = chat('copilot', parent.sessionUri, 'chat:/peer', 'storage:/peer');
		const outside = chat('copilot', 'session:/outside');
		const claude = chat('claude', 'session:/claude');
		const source = new TestSource([document('shared')]);
		for (const identity of [parent, peer, outside, claude]) {
			await database.searchChat(identity, 'shared', source.read);
		}
		await database.deleteScope(peer.storageUri);
		const afterPeer = await withDatabase(databasePath, false, async db => ({
			counts: await counts(db),
			chats: await query(db, 'SELECT chat_uri FROM search_chats ORDER BY chat_uri'),
		}));
		await database.searchChat(peer, 'shared', source.read);
		await database.deleteScope(parent.sessionUri);
		const afterParent = await withDatabase(databasePath, false, async db => ({
			counts: await counts(db),
			chats: await query(db, 'SELECT chat_uri FROM search_chats ORDER BY chat_uri'),
			ftsMatches: await query(db, `SELECT count(*) AS matches FROM search_fts WHERE search_fts MATCH 'shared'`),
		}));
		await database.deleteScope(outside.storageUri);
		await database.deleteScope(claude.storageUri);
		assert.deepStrictEqual({ afterPeer, afterParent, afterAll: await withDatabase(databasePath, false, counts) }, {
			afterPeer: {
				counts: [{ chats: 3, turns: 3, documents: 3, fts: 3 }],
				chats: [{ chat_uri: claude.chatUri }, { chat_uri: outside.chatUri }, { chat_uri: parent.chatUri }],
			},
			afterParent: {
				counts: [{ chats: 2, turns: 2, documents: 2, fts: 2 }],
				chats: [{ chat_uri: claude.chatUri }, { chat_uri: outside.chatUri }],
				ftsMatches: [{ matches: 2 }],
			},
			afterAll: [{ chats: 0, turns: 0, documents: 0, fts: 0 }],
		});
	});

	test('turn and document deletions also clean FTS through cascades and triggers', async () => {
		await database.searchChat(chat(), 'shared', new TestSource([
			document('shared', 'first'),
			document('shared', 'first', 'assistant'),
			document('shared', 'second'),
		]).read);
		const snapshot = await withDatabase(databasePath, true, async db => {
			await exec(db, `PRAGMA foreign_keys = ON; DELETE FROM search_turns WHERE turn_ref = 'first'`);
			const afterTurn = await counts(db);
			await exec(db, 'DELETE FROM search_documents');
			return { afterTurn, afterDocument: await counts(db), matches: await query(db, `SELECT rowid FROM search_fts WHERE search_fts MATCH 'shared'`) };
		});
		assert.deepStrictEqual(snapshot, {
			afterTurn: [{ chats: 1, turns: 1, documents: 1, fts: 1 }],
			afterDocument: [{ chats: 1, turns: 1, documents: 0, fts: 0 }],
			matches: [],
		});
	});

	test('deleting an absent cache or waiting for idle creates no directories or files', async () => {
		await database.deleteScope('session:/missing');
		await database.whenIdle();
		assert.deepStrictEqual(await readdir(directory), []);
	});

	test('rolls back failed rebuilds without serving stale success or modifying unrelated snapshots', async () => {
		const target = new TestSource([document('original')]);
		const other = new TestSource([document('unrelated')]);
		await database.searchChat(chat(), 'original', target.read);
		await database.searchChat(chat('codex'), 'unrelated', other.read);
		const before = await withDatabase(databasePath, false, async db => ({
			chats: await query(db, 'SELECT * FROM search_chats ORDER BY id'),
			turns: await query(db, 'SELECT * FROM search_turns ORDER BY id'),
			documents: await query(db, 'SELECT * FROM search_documents ORDER BY id'),
			fts: await query(db, 'SELECT rowid, text FROM search_fts ORDER BY rowid'),
		}));
		const failure = new Error('source interrupted');
		await assert.rejects(database.searchChat({ ...chat(), sourceKey: 'new-source' }, 'original', async () => ({
			revision: 'broken-revision',
			documents: (async function* () {
				yield document('partial replacement', 'different-turn');
				throw failure;
			})(),
		})), error => error === failure);
		const after = await withDatabase(databasePath, false, async db => ({
			chats: await query(db, 'SELECT * FROM search_chats ORDER BY id'),
			turns: await query(db, 'SELECT * FROM search_turns ORDER BY id'),
			documents: await query(db, 'SELECT * FROM search_documents ORDER BY id'),
			fts: await query(db, 'SELECT rowid, text FROM search_fts ORDER BY rowid'),
		}));
		assert.deepStrictEqual({
			snapshot: after,
			target: await database.searchChat(chat(), 'original', target.read),
			other: await database.searchChat(chat('codex'), 'unrelated', other.read),
			iterations: [target.iterations, other.iterations],
		}, {
			snapshot: before,
			target: { matches: [{ turnId: 'turn', role: 'user', snippet: 'original' }], hasMore: false },
			other: { matches: [{ turnId: 'turn', role: 'user', snippet: 'unrelated' }], hasMore: false },
			iterations: [1, 1],
		});
	});

	test('source failures do not create a cache and do not poison the operation queue', async () => {
		const failure = new Error('cannot read source');
		const failed = database.searchChat(chat(), 'word', async () => { throw failure; });
		const rejected = assert.rejects(failed, error => error === failure);
		await rejected;
		const filesAfterFailure = await readdir(directory);
		const result = await database.searchChat(chat(), 'word', new TestSource([document('word')]).read);
		assert.deepStrictEqual({ filesAfterFailure, result }, {
			filesAfterFailure: [],
			result: { matches: [{ turnId: 'turn', role: 'user', snippet: 'word' }], hasMore: false },
		});
	});

	test('a failing initial rebuild leaves no partial chat and queued work still succeeds', async () => {
		const source = new TestSource([document('unrelated')]);
		await database.searchChat(chat('claude'), 'unrelated', source.read);
		const failure = new Error('initial snapshot failed');
		const failed = database.searchChat(chat(), 'partial', async () => ({
			revision: 'new',
			documents: (async function* () {
				yield document('partial');
				throw failure;
			})(),
		}));
		const rejected = assert.rejects(failed, error => error === failure);
		const queued = new SessionSearchDatabase(databasePath).searchChat(chat('claude'), 'unrelated', source.read);
		await rejected;
		assert.deepStrictEqual({
			result: await queued,
			counts: await withDatabase(databasePath, false, counts),
			chats: await withDatabase(databasePath, false, db => query(db, 'SELECT harness FROM search_chats')),
		}, {
			result: { matches: [{ turnId: 'turn', role: 'user', snippet: 'unrelated' }], hasMore: false },
			counts: [{ chats: 1, turns: 1, documents: 1, fts: 1 }],
			chats: [{ harness: 'claude' }],
		});
	});

	test('serializes source reads, rebuilds, deletion, and idle barriers across instances of the same path', async () => {
		const readingDocuments = new DeferredPromise<void>();
		const releaseDocuments = new DeferredPromise<void>();
		const order: string[] = [];
		const secondInstance = new SessionSearchDatabase(join(directory, 'index', '..', 'index', 'search.db'));
		const source = new TestSource([document('next')], 'before-queue');
		const first = database.searchChat(chat(), 'first', async () => ({
			revision: 'first',
			documents: (async function* () {
				order.push('first documents');
				await readingDocuments.complete();
				await releaseDocuments.p;
				yield document('first');
				order.push('first complete');
			})(),
		}));
		await readingDocuments.p;
		const second = secondInstance.searchChat(chat(), 'next', async () => {
			order.push(`second source ${source.revision}`);
			return source.read();
		});
		const deletion = database.deleteScope(chat().sessionUri);
		const idle = secondInstance.whenIdle();
		const orderWhileBlocked = [...order];
		source.revision = 'after-queue';
		await releaseDocuments.complete();
		const [firstResult, secondResult] = await Promise.all([first, second, deletion, idle]);
		assert.deepStrictEqual({
			orderWhileBlocked,
			order,
			results: [firstResult.matches.map(match => match.snippet), secondResult.matches.map(match => match.snippet)],
			counts: await withDatabase(databasePath, false, counts),
		}, {
			orderWhileBlocked: ['first documents'],
			order: ['first documents', 'first complete', 'second source after-queue'],
			results: [['first'], ['next']],
			counts: [{ chats: 0, turns: 0, documents: 0, fts: 0 }],
		});
	});

	test('independent cache paths make progress while another path is rebuilding', async () => {
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const blocked = database.searchChat(chat(), 'first', async () => {
			await started.complete();
			await release.p;
			return new TestSource([document('first')]).read();
		});
		await started.p;
		try {
			const other = new SessionSearchDatabase(join(directory, 'other.db'));
			const result = await other.searchChat(chat(), 'other', new TestSource([document('other')]).read);
			assert.deepStrictEqual(result, { matches: [{ turnId: 'turn', role: 'user', snippet: 'other' }], hasMore: false });
		} finally {
			await release.complete();
			await blocked;
		}
	});

	test('filters to the target chat before the 20/21 limit and orders equal ranks by integer document id', async () => {
		const foreign = new TestSource(Array.from({ length: 100 }, (_, index) => document('needle', `foreign-${index}`)));
		await database.searchChat(chat('claude'), 'needle', foreign.read);
		const target = new TestSource(Array.from({ length: 21 }, (_, index) => document(`needle ${'padding '.repeat(40)}`, `target-${index}`)));
		const overflow = await database.searchChat(chat(), 'needle', target.read);
		const reopened = await new SessionSearchDatabase(databasePath).searchChat(chat(), 'needle', target.read);
		target.revision = 'twenty';
		target.documents.pop();
		const exact = await database.searchChat(chat(), 'needle', target.read);
		assert.deepStrictEqual({
			results: [overflow, reopened, exact].map(result => ({
				turns: result.matches.map(match => match.turnId),
				hasMore: result.hasMore,
			})),
			foreignCount: await withDatabase(databasePath, false, db => query(db, `SELECT count(*) AS count FROM search_turns WHERE turn_ref LIKE 'foreign-%'`)),
		}, {
			results: [true, true, false].map(hasMore => ({
				turns: Array.from({ length: AGENT_CHAT_SEARCH_MAX_RESULTS }, (_, index) => `target-${index}`),
				hasMore,
			})),
			foreignCount: [{ count: 100 }],
		});
	});

	test('ranks lexical relevance ahead of insertion order', async () => {
		const result = await database.searchChat(chat(), 'needle', new TestSource([
			document(`needle ${'padding '.repeat(100)}`, 'long'),
			document('needle', 'short'),
		]).read);
		assert.deepStrictEqual(result.matches.map(match => match.turnId), ['short', 'long']);
	});

	test('bounds snippets around full-message matches, including huge nearby tokens', async () => {
		const texts = [
			`${'prefix '.repeat(900)}nearby needle context ${'after '.repeat(900)}`,
			`${'x'.repeat(7000)} needle ${'y'.repeat(7000)}`,
			'  short\n\tneedle text  ',
		];
		const result = await database.searchChat(chat(), 'needle', new TestSource(texts.map((text, index) => document(text, `turn-${index}`))).read);
		assert.deepStrictEqual({
			matches: result.matches.length,
			bounded: result.matches.every(match => match.snippet.length <= 220),
			found: result.matches.every(match => match.snippet.includes('needle')),
			markers: result.matches.some(match => /[\uFDD0\uFDD1]/u.test(match.snippet)),
			context: result.matches.find(match => match.turnId === 'turn-0')?.snippet.includes('nearby needle context'),
			short: result.matches.find(match => match.turnId === 'turn-2')?.snippet,
			texts: await withDatabase(databasePath, false, db => query(db, 'SELECT text FROM search_fts ORDER BY rowid')),
		}, {
			matches: 3, bounded: true, found: true, markers: false, context: true, short: 'short needle text',
			texts: texts.map(text => ({ text })),
		});
	});

	test('uses Unicode lexical AND terms and treats FTS or SQL syntax as literal words', async () => {
		const source = new TestSource([
			document('café 東京 naïve Ελληνικά e\u0301lan \uE000private'),
			document('alpha beta', 'both'),
			document('alpha', 'only-alpha'),
			document('beta', 'only-beta'),
			document('alpha OR beta', 'literal-operator'),
		]);
		const queries = ['café 東京', 'naïve Ελληνικά', 'e\u0301lan \uE000private', '"alpha" (beta)*', 'alpha OR beta', `alpha'; DROP TABLE search_chats; --`];
		const results = [];
		for (const query of queries) {
			results.push((await database.searchChat(chat(), query, source.read)).matches.map(match => match.turnId));
		}
		assert.deepStrictEqual({
			results,
			counts: await withDatabase(databasePath, false, counts),
		}, {
			results: [['turn'], ['turn'], ['turn'], ['both', 'literal-operator'], ['literal-operator'], []],
			counts: [{ chats: 1, turns: 5, documents: 5, fts: 5 }],
		});
	});

	test('validates queries without reading history or creating a database', async () => {
		const source = new TestSource([document('unused')]);
		await assert.rejects(database.searchChat(chat(), ' ', source.read), /must not be empty/);
		await assert.rejects(database.searchChat(chat(), 'x'.repeat(MAX_SESSION_SEARCH_QUERY_LENGTH + 1), source.read), /maximum length/);
		const punctuation = await database.searchChat(chat(), '*"() -', source.read);
		assert.deepStrictEqual({ punctuation, reads: source.reads, files: await readdir(directory) }, {
			punctuation: { matches: [], hasMore: false }, reads: 0, files: [],
		});
	});

	test('treats opaque chat, source, turn, and cleanup identities as parameters', async () => {
		const identity = `'; DELETE FROM search_chats; --`;
		const target: ISessionSearchChat = {
			harness: identity, sessionUri: identity, chatUri: identity, storageUri: identity, sourceKey: identity,
		};
		const source = new TestSource([document('needle', identity, 'assistant', identity)], identity);
		const unrelated = new TestSource([document('unrelated')]);
		const result = await database.searchChat(target, 'needle', source.read);
		await database.searchChat(chat(), 'unrelated', unrelated.read);
		await database.deleteScope(identity);
		assert.deepStrictEqual({
			result,
			counts: await withDatabase(databasePath, false, counts),
			remaining: await database.searchChat(chat(), 'unrelated', unrelated.read),
		}, {
			result: { matches: [{ turnId: identity, role: 'assistant', snippet: 'needle' }], hasMore: false },
			counts: [{ chats: 1, turns: 1, documents: 1, fts: 1 }],
			remaining: { matches: [{ turnId: 'turn', role: 'user', snippet: 'unrelated' }], hasMore: false },
		});
	});

	for (const kind of ['unmarked', 'foreign-application', 'future-schema', 'not-sqlite'] as const) {
		test(`refuses ${kind} databases without changing bytes or permissions`, async () => {
			await mkdir(join(directory, 'index'), { mode: 0o755 });
			if (kind === 'not-sqlite') {
				await writeFile(databasePath, 'not a sqlite database', { mode: 0o644 });
			} else if (kind === 'future-schema') {
				await database.searchChat(chat(), 'word', new TestSource([document('word')]).read);
				await withDatabase(databasePath, true, db => exec(db, 'PRAGMA user_version = 2147483647'));
			} else {
				await withDatabase(databasePath, true, db => exec(db, `
					CREATE TABLE foreign_history (text TEXT);
					INSERT INTO foreign_history VALUES ('provider history must not change');
					${kind === 'foreign-application' ? 'PRAGMA application_id = 12345; PRAGMA user_version = 1;' : ''}
				`));
			}
			if (!isWindows) {
				await chmod(databasePath, 0o644);
			}
			const before = { contents: await readFile(databasePath), file: await stat(databasePath), folder: await stat(join(directory, 'index')) };
			await assert.rejects(database.searchChat(chat(), 'word', new TestSource([document('word')]).read));
			await assert.rejects(database.deleteScope(chat().sessionUri));
			for (const request of [
				{ kind: 'pending', model: { id: 'model', dimensions: 1 } },
				{ kind: 'store', model: { id: 'model', dimensions: 1 }, values: [] },
				{ kind: 'search', model: { id: 'model', dimensions: 1 }, vector: [1] },
			] satisfies ISessionSemanticRequest[]) {
				await assert.rejects(database.semanticSearch(chat().sessionUri, [chat().chatUri], request));
			}
			const after = { contents: await readFile(databasePath), file: await stat(databasePath), folder: await stat(join(directory, 'index')) };
			assert.deepStrictEqual({
				contents: after.contents, mode: after.file.mode, modified: after.file.mtimeMs,
				folderMode: after.folder.mode, files: await readdir(join(directory, 'index')),
			}, {
				contents: before.contents, mode: before.file.mode, modified: before.file.mtimeMs,
				folderMode: before.folder.mode, files: ['search.db'],
			});
		});
	}

	if (!isWindows) {
		test('creates private cache files and directories and closes every SQLite connection', async () => {
			await database.searchChat(chat(), 'private', new TestSource([document('private')]).read);
			const [file, folder] = await Promise.all([stat(databasePath), stat(join(directory, 'index'))]);
			const metadata = await withDatabase(databasePath, false, async db => ({
				application: await query(db, 'PRAGMA application_id'),
				version: await query(db, 'PRAGMA user_version'),
			}));
			await rm(databasePath);
			const result = await database.searchChat(chat(), 'rebuilt', new TestSource([document('rebuilt')]).read);
			assert.deepStrictEqual({
				file: file.mode & 0o777, folder: folder.mode & 0o777,
				metadata, result, files: await readdir(join(directory, 'index')),
			}, {
				file: 0o600, folder: 0o700,
				metadata: { application: [{ application_id: 0x56535343 }], version: [{ user_version: 2 }] },
				result: { matches: [{ turnId: 'turn', role: 'user', snippet: 'rebuilt' }], hasMore: false },
				files: ['search.db'],
			});
		});
	}

	suite('semantic search', () => {
		const model: ISessionEmbeddingModel = { id: 'test-model-v1', dimensions: 2 };
		const target = chat();

		async function pending(identity = target, selectedModel = model, allowed = [identity.chatUri]) {
			const result = await database.semanticSearch(identity.sessionUri, allowed, { kind: 'pending', model: selectedModel });
			assert.strictEqual(result.kind, 'pending');
			return result;
		}

		async function store(chunks: readonly ISessionEmbeddingChunk[], vector: readonly number[] = [1, 0], identity = target, selectedModel = model) {
			return database.semanticSearch(identity.sessionUri, [identity.chatUri], {
				kind: 'store', model: selectedModel,
				values: chunks.map(chunk => ({ id: chunk.id, contentHash: chunk.contentHash, vector })),
			});
		}

		async function search(vector: readonly number[] = [1, 0], identity = target, selectedModel = model, allowed = [identity.chatUri]) {
			const result = await database.semanticSearch(identity.sessionUri, allowed, { kind: 'search', model: selectedModel, vector });
			assert.strictEqual(result.kind, 'search');
			return result;
		}

		async function embedAll(identity = target, vector: readonly number[] = [1, 0]) {
			let count = 0;
			for (; ;) {
				const batch = await pending(identity);
				if (!batch.chunks.length) {
					return count;
				}
				count += batch.chunks.length;
				await store(batch.chunks, vector, identity);
			}
		}

		test('retrieves a paraphrase missed by lexical search and persists normalized little-endian vectors', async () => {
			const text = 'The automobile will not start because its battery is flat.';
			const recipes = 'Measure flour and yeast before kneading bread dough.';
			const knitting = 'Choose wool and needles for knitting a warm scarf.';
			const source = new TestSource([document(text), document(recipes, 'recipes'), document(knitting, 'knitting')]);
			const lexical = await database.searchChat(target, 'car engine problem', source.read);
			const lexicalOnly = await withDatabase(databasePath, false, semanticCounts);
			const before = await search();
			const batch = await pending();
			await database.semanticSearch(target.sessionUri, [target.chatUri], {
				kind: 'store', model,
				values: batch.chunks.map((chunk, index) => ({
					id: chunk.id, contentHash: chunk.contentHash,
					vector: [[30, 40], [-40, 30], [-30, -40]][index],
				})),
			});
			const result = await search([3, 4]);
			const recipeResult = await search([-4, 3]);
			const reused = await new SessionSearchDatabase(databasePath).semanticSearch(target.sessionUri, [target.chatUri], { kind: 'pending', model });
			const metadata = await withDatabase(databasePath, false, async db => ({
				chunks: await query(db, 'SELECT document_id, start_offset, end_offset, content_hash FROM search_chunks WHERE id = 1'),
				columns: (await query<{ name: string }>(db, 'PRAGMA table_info(search_chunks)')).map(column => column.name),
				vectors: (await query<{ vector: Buffer; kind: string; dimensions: number }>(db, 'SELECT vector, typeof(vector) AS kind, dimensions FROM search_embeddings WHERE chunk_id = 1')).map(row => ({
					kind: row.kind, dimensions: row.dimensions, bytes: row.vector.length,
					values: [row.vector.readFloatLE(0), row.vector.readFloatLE(4)],
				})),
			}));
			assert.deepStrictEqual({
				lexical, lexicalOnly, before, batch, reused, metadata,
				matches: result.matches.map(match => ({ ...match, score: Math.round(match.score * 1000) / 1000 })),
				recipeMatches: recipeResult.matches.map(match => match.turnId),
				incomplete: result.incomplete,
			}, {
				lexical: { matches: [], hasMore: false },
				lexicalOnly: [{ chunks: 0, embeddings: 0 }],
				before: { kind: 'search', matches: [], hasMore: false, incomplete: true },
				batch: {
					kind: 'pending',
					chunks: [text, recipes, knitting].map((text, index) => ({ id: index + 1, contentHash: createHash('sha256').update(text).digest('hex'), text })),
					hasMore: false,
				},
				reused: { kind: 'pending', chunks: [], hasMore: false },
				metadata: {
					chunks: [{ document_id: 1, start_offset: 0, end_offset: text.length, content_hash: batch.chunks[0].contentHash }],
					columns: ['id', 'document_id', 'start_offset', 'end_offset', 'content_hash'],
					vectors: [{ kind: 'blob', dimensions: 2, bytes: 8, values: [Math.fround(0.6), Math.fround(0.8)] }],
				},
				matches: [{ chat: target.chatUri, turnId: 'turn', role: 'user', snippet: text, score: 1 }],
				recipeMatches: ['recipes'],
				incomplete: false,
			});
		});

		test('filters pending, store and ranking by both session and allowed chats before all limits', async () => {
			const foreign = chat('copilot', 'session:/foreign');
			const peer = chat('copilot', target.sessionUri, 'chat:/peer');
			const source = new TestSource(Array.from({ length: 40 }, (_, index) => document(`irrelevant ${index}`, `other-${index}`)));
			for (const identity of [foreign, peer]) {
				await database.searchChat(identity, 'irrelevant', source.read);
				await embedAll(identity);
			}
			await database.searchChat(target, 'selected', new TestSource([document('selected result')]).read);
			const batch = await pending();
			const wrongSession = await pending(foreign, model, [target.chatUri]);
			const wrongChat = await pending(target, model, [foreign.chatUri]);
			await assert.rejects(store(batch.chunks, [1, 0], foreign), /outside the allowed chats/);
			await assert.rejects(store(batch.chunks, [1, 0], peer), /outside the allowed chats/);
			await store(batch.chunks);
			assert.deepStrictEqual({
				pending: batch.chunks.map(chunk => chunk.text), hasMore: batch.hasMore,
				wrongSession, wrongChat,
				result: await search(),
				emptyAllowed: await search([1, 0], target, model, []),
				unlisted: await search([1, 0], target, model, [foreign.chatUri]),
			}, {
				pending: ['selected result'], hasMore: false,
				wrongSession: { kind: 'pending', chunks: [], hasMore: false },
				wrongChat: { kind: 'pending', chunks: [], hasMore: false },
				result: { kind: 'search', matches: [{ chat: target.chatUri, turnId: 'turn', role: 'user', snippet: 'selected result', score: 1 }], hasMore: false, incomplete: false },
				emptyAllowed: { kind: 'search', matches: [], hasMore: false, incomplete: false },
				unlisted: { kind: 'search', matches: [], hasMore: false, incomplete: true },
			});
		});

		test('reports incomplete coverage for authorized chats absent from the cache', async () => {
			const peer = chat('copilot', target.sessionUri, 'chat:/peer');
			const allowed = [target.chatUri, peer.chatUri];
			const beforeCache = await search([1, 0], target, model, allowed);
			await database.searchChat(target, 'automobile', new TestSource([
				document('An automobile requires a charged battery.', 'vehicle'),
				document('Fresh bread needs time to rise.', 'baking'),
			]).read);
			const batch = await pending();
			await database.semanticSearch(target.sessionUri, [target.chatUri], {
				kind: 'store', model,
				values: batch.chunks.map(chunk => ({
					id: chunk.id, contentHash: chunk.contentHash,
					vector: chunk.text.includes('automobile') ? [1, 0] : [0, 1],
				})),
			});
			const missingPeer = await search([1, 0], target, model, allowed);
			await database.searchChat(peer, 'word', new TestSource([]).read);
			const emptyPeer = await search([1, 0], target, model, allowed);
			assert.deepStrictEqual({
				beforeCache,
				missingPeer: { incomplete: missingPeer.incomplete, turns: missingPeer.matches.map(match => match.turnId), hasMore: missingPeer.hasMore },
				emptyPeer: { incomplete: emptyPeer.incomplete, turns: emptyPeer.matches.map(match => match.turnId), hasMore: emptyPeer.hasMore },
			}, {
				beforeCache: { kind: 'search', matches: [], hasMore: false, incomplete: true },
				missingPeer: { incomplete: true, turns: ['vehicle'], hasMore: false },
				emptyPeer: { incomplete: false, turns: ['vehicle'], hasMore: false },
			});
		});

		test('bounds pending batches, advances past stored chunks, and caps deterministic ranking at twenty', async () => {
			await database.searchChat(target, 'text', new TestSource(Array.from({ length: 35 }, (_, index) => document(`text ${index}`, `turn-${index}`))).read);
			const batches: { length: number; hasMore: boolean }[] = [];
			for (; ;) {
				const batch = await pending();
				batches.push({ length: batch.chunks.length, hasMore: batch.hasMore });
				if (!batch.chunks.length) {
					break;
				}
				await store(batch.chunks);
			}
			const result = await search();
			assert.deepStrictEqual({
				batches,
				turns: result.matches.map(match => match.turnId),
				hasMore: result.hasMore, incomplete: result.incomplete,
			}, {
				batches: [{ length: MAX_SESSION_EMBEDDING_BATCH, hasMore: true }, { length: 16, hasMore: true }, { length: 3, hasMore: false }, { length: 0, hasMore: false }],
				turns: Array.from({ length: 20 }, (_, index) => `turn-${index}`),
				hasMore: true, incomplete: false,
			});
		});

		test('isolates model versions and dimensions and reports only eligible missing embeddings', async () => {
			const models = [model, { ...model, id: 'test-model-v2' }, { ...model, dimensions: 3 }];
			await database.searchChat(target, 'text', new TestSource([document('text')]).read);
			const batch = await pending();
			await store(batch.chunks);
			const isolated = [];
			for (const other of models.slice(1)) {
				const missing = await pending(target, other);
				isolated.push({ chunks: missing.chunks.length, search: await search(Array(other.dimensions).fill(1), target, other) });
				await store(missing.chunks, Array(other.dimensions).fill(-1), target, other);
			}
			const results = [];
			for (const selectedModel of models) {
				results.push(await search(Array(selectedModel.dimensions).fill(1), target, selectedModel));
			}
			assert.deepStrictEqual({
				isolated,
				matches: results.map(result => result.matches.length),
				incomplete: results.map(result => result.incomplete),
				cache: await withDatabase(databasePath, false, semanticCounts),
			}, {
				isolated: models.slice(1).map(() => ({ chunks: 1, search: { kind: 'search', matches: [], hasMore: false, incomplete: true } })),
				matches: [1, 0, 0], incomplete: [false, false, false],
				cache: [{ chunks: 1, embeddings: 3 }],
			});
		});

		test('preserves all long content with overlapping UTF-16 offsets without storing duplicate text', async () => {
			const text = `First paragraph ${'words '.repeat(180)}\n\n${'🐈'.repeat(8500)}\n\nLast paragraph ${'ending '.repeat(500)}`;
			await database.searchChat(target, 'paragraph', new TestSource([document(text)]).read);
			const embedded = await embedAll();
			const rows = await withDatabase(databasePath, false, db => query<{ start_offset: number; end_offset: number; content_hash: string }>(db, 'SELECT start_offset, end_offset, content_hash FROM search_chunks ORDER BY id'));
			let reconstructed = '';
			let end = 0;
			for (const row of rows) {
				assert.ok(row.start_offset <= end && row.end_offset > end && row.end_offset - row.start_offset <= 1500);
				const chunk = text.slice(row.start_offset, row.end_offset);
				assert.strictEqual(row.content_hash, createHash('sha256').update(chunk).digest('hex'));
				assert.ok(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(chunk));
				reconstructed += text.slice(end, row.end_offset);
				end = row.end_offset;
			}
			assert.deepStrictEqual({
				reconstructed, count: embedded, rows: rows.length,
				boundedCount: rows.length < text.length / 500,
				overlap: rows.slice(1).every((row, index) => rows[index].end_offset - row.start_offset >= 200),
				paragraphBoundary: text.slice(0, rows[0].end_offset).endsWith('\n\n'),
			}, { reconstructed: text, count: rows.length, rows: rows.length, boundedCount: true, overlap: true, paragraphBoundary: true });
		});

		test('deduplicates by chat, turn and role using the best chunk and takes its snippet', async () => {
			const peer = chat('copilot', target.sessionUri, 'chat:/peer');
			const texts = [
				document(`${'unrelated '.repeat(190)}\n\n${'The late matching passage explains battery maintenance. '.repeat(50)}`),
				document('A weaker matching passage.', 'turn', 'user', 'other-document'),
				document('The assistant also explains repairs.', 'turn', 'assistant'),
				document('Opposite meaning.', 'opposite'),
				document('Below threshold.', 'threshold'),
			];
			await database.searchChat(target, 'text', new TestSource(texts).read);
			const batch = await pending();
			await database.semanticSearch(target.sessionUri, [target.chatUri], {
				kind: 'store', model,
				values: batch.chunks.map(chunk => ({
					id: chunk.id, contentHash: chunk.contentHash,
					vector: chunk.text.includes('late matching passage') && !chunk.text.includes('unrelated') ? [1, 0]
						: chunk.text.startsWith('A weaker') ? [3, 4] : chunk.text.startsWith('The assistant') ? [4, 3]
							: chunk.text.startsWith('Below threshold') ? [1, 10] : [-1, 0],
				})),
			});
			await database.searchChat(peer, 'text', new TestSource([document('Peer meaning.')]).read);
			await embedAll(peer, [3, 4]);
			const result = await search([1, 0], target, model, [target.chatUri, peer.chatUri]);
			assert.deepStrictEqual({
				matches: result.matches.map(match => ({ chat: match.chat, turnId: match.turnId, role: match.role, score: Math.round(match.score * 10) / 10 })),
				snippet: result.matches[0].snippet.includes('late matching passage'),
				bounded: result.matches.every(match => match.snippet.length <= 220),
				hasMore: result.hasMore, incomplete: result.incomplete,
			}, {
				matches: [
					{ chat: target.chatUri, turnId: 'turn', role: 'user', score: 1 },
					{ chat: target.chatUri, turnId: 'turn', role: 'assistant', score: 0.8 },
					{ chat: peer.chatUri, turnId: 'turn', role: 'user', score: 0.6 },
				],
				snippet: true, bounded: true, hasMore: false, incomplete: false,
			});
		});

		test('rejects stale generations after rebuild even when replacement text and hashes are identical', async () => {
			const source = new TestSource([document('same content')]);
			await database.searchChat(target, 'same', source.read);
			const previous = await pending();
			await store(previous.chunks);
			source.revision = 'replacement';
			await database.searchChat(target, 'same', source.read);
			const afterRebuild = await withDatabase(databasePath, false, semanticCounts);
			const replacement = await pending();
			const beforeFailure = await readFile(databasePath);
			await assert.rejects(store(previous.chunks), /stale/);
			assert.deepStrictEqual({
				afterRebuild,
				sameHash: replacement.chunks[0].contentHash === previous.chunks[0].contentHash,
				newId: replacement.chunks[0].id > previous.chunks[0].id,
				unchanged: await readFile(databasePath),
				counts: await withDatabase(databasePath, false, semanticCounts),
			}, { afterRebuild: [{ chunks: 0, embeddings: 0 }], sameHash: true, newId: true, unchanged: beforeFailure, counts: [{ chunks: 1, embeddings: 0 }] });
		});

		test('rolls back the whole store batch on stale hashes or out-of-scope chunks', async () => {
			const foreign = chat('copilot', 'session:/other');
			await database.searchChat(target, 'text', new TestSource([document('text')]).read);
			await database.searchChat(foreign, 'other', new TestSource([document('other')]).read);
			const batch = await pending();
			const other = await pending(foreign);
			await store(batch.chunks, [0, 1]);
			for (const invalid of [
				{ ...other.chunks[0], contentHash: '0'.repeat(64) },
				other.chunks[0],
			]) {
				const before = await readFile(databasePath);
				await assert.rejects(store([...batch.chunks, invalid]), /stale|outside/);
				assert.deepStrictEqual(await readFile(databasePath), before);
			}
			await assert.rejects(store([{ ...batch.chunks[0], contentHash: '0'.repeat(64) }]), /stale/);
			assert.deepStrictEqual(await search(), { kind: 'search', matches: [], hasMore: false, incomplete: false });
		});

		test('cascades chunk and embedding cleanup on documents, turns, peer storage and sessions', async () => {
			const peer = chat('copilot', target.sessionUri, 'chat:/peer', 'storage:/peer');
			for (const identity of [target, peer]) {
				await database.searchChat(identity, 'text', new TestSource([
					document('text', 'first'), document('text', 'second'), document('text', 'third'),
				]).read);
				await embedAll(identity);
			}
			const snapshots = [];
			await withDatabase(databasePath, true, async db => {
				await exec(db, 'PRAGMA foreign_keys = ON; DELETE FROM search_documents WHERE id = (SELECT min(id) FROM search_documents)');
				snapshots.push(await semanticCounts(db));
				await exec(db, `DELETE FROM search_turns WHERE turn_ref = 'second'`);
				snapshots.push(await semanticCounts(db));
			});
			await database.deleteScope(peer.storageUri);
			snapshots.push(await withDatabase(databasePath, false, semanticCounts));
			await database.deleteScope(target.sessionUri);
			snapshots.push(await withDatabase(databasePath, false, semanticCounts));
			assert.deepStrictEqual(snapshots, [
				[{ chunks: 5, embeddings: 5 }], [{ chunks: 3, embeddings: 3 }],
				[{ chunks: 1, embeddings: 1 }], [{ chunks: 0, embeddings: 0 }],
			]);
		});

		test('migrates version one without rebuilding FTS and generates old document chunks only on pending', async () => {
			await mkdir(join(directory, 'index'));
			await withDatabase(databasePath, true, db => exec(db, `
				CREATE TABLE search_chats (
					id INTEGER PRIMARY KEY, harness TEXT NOT NULL, session_uri TEXT NOT NULL, chat_uri TEXT NOT NULL,
					storage_uri TEXT NOT NULL, source_key TEXT NOT NULL, revision TEXT NOT NULL, index_version INTEGER NOT NULL,
					UNIQUE(harness, chat_uri)
				);
				CREATE INDEX search_chats_session ON search_chats(session_uri);
				CREATE INDEX search_chats_storage ON search_chats(storage_uri);
				CREATE TABLE search_turns (
					id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL REFERENCES search_chats(id) ON DELETE CASCADE,
					turn_ref TEXT NOT NULL, UNIQUE(chat_id, turn_ref)
				);
				CREATE TABLE search_documents (
					id INTEGER PRIMARY KEY, turn_id INTEGER NOT NULL REFERENCES search_turns(id) ON DELETE CASCADE,
					role INTEGER NOT NULL CHECK(role IN (0, 1)), source_locator TEXT NOT NULL
				);
				CREATE INDEX search_documents_turn ON search_documents(turn_id);
				CREATE VIRTUAL TABLE search_fts USING fts5(text);
				CREATE TRIGGER search_documents_delete AFTER DELETE ON search_documents BEGIN
					DELETE FROM search_fts WHERE rowid = old.id;
				END;
				INSERT INTO search_chats VALUES (7, 'copilot', 'session:/parent', 'session:/parent/default', 'session:/parent', 'backing-session', 'revision-1', 1);
				INSERT INTO search_turns VALUES (9, 7, 'turn');
				INSERT INTO search_documents VALUES (11, 9, 0, 'message');
				INSERT INTO search_fts (rowid, text) VALUES (11, 'original cached text');
				PRAGMA application_id = 1448301379;
				PRAGMA user_version = 1;
			`));
			const source = new TestSource([document('source must not be enumerated')]);
			const lexical = await database.searchChat(target, 'original', source.read);
			const before = await withDatabase(databasePath, false, async db => ({
				version: await query(db, 'PRAGMA user_version'),
				documents: await query(db, 'SELECT * FROM search_documents'),
				fts: await query(db, 'SELECT rowid, text FROM search_fts'),
				semantic: await semanticCounts(db),
			}));
			const batch = await pending();
			assert.deepStrictEqual({ lexical, before, iterations: source.iterations, text: batch.chunks.map(chunk => chunk.text) }, {
				lexical: { matches: [{ turnId: 'turn', role: 'user', snippet: 'original cached text' }], hasMore: false },
				before: {
					version: [{ user_version: 2 }],
					documents: [{ id: 11, turn_id: 9, role: 0, source_locator: 'message' }],
					fts: [{ rowid: 11, text: 'original cached text' }],
					semantic: [{ chunks: 0, embeddings: 0 }],
				},
				iterations: 0, text: ['original cached text'],
			});
		});

		test('validates all untrusted requests before opening or changing the cache', async () => {
			const validValue = { id: 1, contentHash: 'a'.repeat(64), vector: [1, 0] };
			const invalid: unknown[] = [
				null, {}, { kind: 'unknown', model },
				...[undefined, null, '', ' '.repeat(2), 'x'.repeat(129)].map(id => ({ kind: 'pending', model: { ...model, id } })),
				...[0, -1, 1.5, NaN, Infinity, '2', MAX_SESSION_EMBEDDING_DIMENSIONS + 1].map(dimensions => ({ kind: 'pending', model: { ...model, dimensions } })),
				...[undefined, null, [], [1], [1, 2, 3], [NaN, 1], [Infinity, 1], [1, -Infinity], [0, 0], [1, '2'], new Float32Array([1, 0])].map(vector => ({ kind: 'search', model, vector })),
				...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'].map(id => ({ kind: 'store', model, values: [{ ...validValue, id }] })),
				...['', 'a'.repeat(63), 'a'.repeat(65), 'x'.repeat(64)].map(contentHash => ({ kind: 'store', model, values: [{ ...validValue, contentHash }] })),
				...[undefined, null, {}, [undefined], [validValue, validValue], Array.from({ length: 33 }, (_, index) => ({ ...validValue, id: index + 1 }))].map(values => ({ kind: 'store', model, values })),
				{ kind: 'store', model, values: [{ ...validValue, vector: [NaN, 1] }] },
				{ kind: 'store', model, values: [{ ...validValue, vector: [0, 0] }] },
				{ kind: 'store', model, values: [{ ...validValue, vector: [1] }] },
			];
			for (const request of invalid) {
				assert.throws(() => validateSessionSemanticRequest(request));
				await assert.rejects(database.semanticSearch(target.sessionUri, [target.chatUri], request as ISessionSemanticRequest));
			}
			assert.deepStrictEqual(await readdir(directory), []);
			await database.searchChat(target, 'text', new TestSource([document('text')]).read);
			const before = await readFile(databasePath);
			for (const request of invalid) {
				await assert.rejects(database.semanticSearch(target.sessionUri, [target.chatUri], request as ISessionSemanticRequest));
			}
			assert.deepStrictEqual(await readFile(databasePath), before);
			assert.doesNotThrow(() => validateSessionSemanticRequest({
				kind: 'store', model,
				values: Array.from({ length: 32 }, (_, index) => ({ ...validValue, id: index + 1 })),
			}));
		});

		test('normalizes finite extreme vectors without overflow or underflow', async () => {
			await database.searchChat(target, 'text', new TestSource([document('text')]).read);
			const batch = await pending();
			const scores = [];
			for (const component of [Number.MAX_VALUE, Number.MIN_VALUE]) {
				await store(batch.chunks, [component, component]);
				scores.push((await search([component, component])).matches[0].score);
			}
			assert.ok(scores.every(score => Math.abs(score - 1) < 0.000001));
		});

		test('absent caches and empty allowlists create no files', async () => {
			assert.deepStrictEqual({
				pending: await pending(),
				search: await search(),
				store: await store([]),
				emptyAllowed: await pending(target, model, []),
				files: await readdir(directory),
			}, {
				pending: { kind: 'pending', chunks: [], hasMore: false },
				search: { kind: 'search', matches: [], hasMore: false, incomplete: true },
				store: { kind: 'store' },
				emptyAllowed: { kind: 'pending', chunks: [], hasMore: false },
				files: [],
			});
		});
	});
});
