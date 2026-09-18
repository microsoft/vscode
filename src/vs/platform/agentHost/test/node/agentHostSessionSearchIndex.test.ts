/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Database } from '@vscode/sqlite3';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { Emitter } from '../../../../base/common/event.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IWillDeleteSessionDataEvent } from '../../common/sessionDataService.js';
import { AgentHostSessionSearchIndex } from '../../node/agentHostSessionSearchIndex.js';
import type { ISessionSearchChat, ISessionSearchSource } from '../../node/sessionSearchDatabase.js';
import { createNullSessionDataService } from '../common/sessionTestHelpers.js';

async function withDatabase<T>(path: string, operation: (db: Database) => Promise<T>): Promise<T> {
	const sqlite3 = await import('@vscode/sqlite3');
	const db = await new Promise<Database>((resolve, reject) => {
		const database = new sqlite3.default.Database(path, error => error ? reject(error) : resolve(database));
	});
	try {
		return await operation(db);
	} finally {
		await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
	}
}

class SearchLogService extends NullLogService {
	warnings = 0;
	override warn(): void { this.warnings++; }
}

suite('Agent Host shared search index lifecycle', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let directory: string;
	const chat: ISessionSearchChat = {
		harness: 'copilotcli', sessionUri: 'copilotcli:/session', chatUri: 'chat:default',
		storageUri: 'copilotcli:/session', sourceKey: 'sdk-session',
	};

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'agent-host-search-index-'));
	});

	teardown(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	function source(): ISessionSearchSource {
		return {
			revision: 'tail',
			documents: (async function* () {
				yield { turnId: 'turn', role: 'assistant' as const, sourceLocator: 'message:1', text: 'Indexed searchable content' };
			})(),
		};
	}

	function createIndex() {
		const deletion = disposables.add(new Emitter<IWillDeleteSessionDataEvent>());
		const data = {
			...createNullSessionDataService(),
			getSessionDataDir: () => URI.file(join(directory, 'history')),
			onWillDeleteSessionData: deletion.event,
		};
		const log = new SearchLogService();
		const databasePath = join(directory, 'search', 'search.db');
		const index = disposables.add(new AgentHostSessionSearchIndex(databasePath, data, log));
		return { index, deletion, log, databasePath, legacy: join(directory, 'history', 'session-search.db') };
	}

	async function createLegacy(path: string): Promise<void> {
		await mkdir(join(directory, 'history'), { recursive: true });
		await withDatabase(path, db => new Promise<void>((resolve, reject) => db.exec(`
			CREATE TABLE search_metadata (version INTEGER, revision TEXT, source TEXT);
			CREATE VIRTUAL TABLE messages USING fts5(turn_id UNINDEXED, role UNINDEXED, content);
			INSERT INTO search_metadata VALUES (1, 'old-tail', 'previous-backing');
			INSERT INTO messages VALUES ('old-turn', 'user', 'old searchable content');
		`, error => error ? reject(error) : resolve())));
	}

	test('rebuilds into the shared cache and removes only the recognized legacy search sidecar', async () => {
		const { index, legacy, log } = createIndex();
		await createLegacy(legacy);
		const canonical = join(directory, 'history', 'session.db');
		const provider = join(directory, 'provider.db');
		await writeFile(canonical, 'canonical session data');
		await writeFile(provider, 'provider-owned data');
		const result = await index.searchChat(chat, 'searchable', async () => source());
		assert.deepStrictEqual({
			results: result.matches.length,
			legacyExists: await stat(legacy).then(() => true, error => {
				if (error.code === 'ENOENT') { return false; }
				throw error;
			}),
			canonical: await readFile(canonical, 'utf8'),
			provider: await readFile(provider, 'utf8'),
			warnings: log.warnings,
		}, { results: 1, legacyExists: false, canonical: 'canonical session data', provider: 'provider-owned data', warnings: 0 });
	});

	test('keeps the legacy cache if the source read or shared rebuild fails', async () => {
		const { index, legacy } = createIndex();
		await createLegacy(legacy);
		const before = await readFile(legacy);
		await assert.rejects(index.searchChat(chat, 'searchable', async () => { throw new Error('history unavailable'); }), /history unavailable/);
		assert.deepStrictEqual(await readFile(legacy), before);
	});

	test('does not remove an unrecognized database at the old cache path', async () => {
		const { index, legacy, log } = createIndex();
		await mkdir(join(directory, 'history'), { recursive: true });
		await withDatabase(legacy, db => new Promise<void>((resolve, reject) =>
			db.exec('CREATE TABLE foreign_history (body TEXT); INSERT INTO foreign_history VALUES (\'keep me\')', error => error ? reject(error) : resolve())));
		const before = await readFile(legacy);
		await index.searchChat(chat, 'searchable', async () => source());
		assert.deepStrictEqual({ unchanged: (await readFile(legacy)).equals(before), warnings: log.warnings }, { unchanged: true, warnings: 1 });
	});

	test('punctuation-only input neither reads history nor migrates caches', async () => {
		const { index, legacy } = createIndex();
		await createLegacy(legacy);
		const before = await readFile(legacy);
		const result = await index.searchChat(chat, '---', async () => { throw new Error('must not read'); });
		assert.deepStrictEqual({ result, unchanged: (await readFile(legacy)).equals(before) }, { result: { matches: [], hasMore: false }, unchanged: true });
	});

	test('session-data deletion clears shared metadata and FTS rows without touching other histories', async () => {
		const { index, deletion, databasePath } = createIndex();
		await index.searchChat(chat, 'searchable', async () => source());
		const pending: Promise<unknown>[] = [];
		deletion.fire({ session: URI.parse(chat.sessionUri), workingDirectories: undefined, waitUntil: promise => { pending.push(promise); } });
		await Promise.all(pending);
		const rows = await withDatabase(databasePath, db => new Promise<{ chats: number; documents: number; fts: number }>((resolve, reject) =>
			db.get('SELECT (SELECT count(*) FROM search_chats) AS chats, (SELECT count(*) FROM search_documents) AS documents, (SELECT count(*) FROM search_fts) AS fts',
				(error: Error | null, row: { chats: number; documents: number; fts: number }) => error ? reject(error) : resolve(row))));
		assert.deepStrictEqual(rows, { chats: 0, documents: 0, fts: 0 });
	});
});
