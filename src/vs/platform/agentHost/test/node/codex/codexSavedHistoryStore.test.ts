/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Database } from '@vscode/sqlite3';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { zstdCompressSync } from 'zlib';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { join, resolve } from '../../../../../base/common/path.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CodexSavedHistoryStore, readCodexSqliteHome } from '../../../node/codex/codexSavedHistoryStore.js';
import type { Thread } from '../../../node/codex/protocol/generated/v2/Thread.js';

suite('Codex saved native history storage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const threadId = '00000000-0000-4000-8000-000000000001';
	const ancestorId = '00000000-0000-4000-8000-000000000002';
	const replacementId = '00000000-0000-4000-8000-000000000003';
	let root: string;
	let codexHome: string;
	let sqliteHome: string;
	let scratch: string;
	let state: Database;
	let history: Database;

	setup(async () => {
		root = await fs.mkdtemp(join(tmpdir(), 'codex-history-store-test-'));
		codexHome = join(root, 'native-home');
		sqliteHome = join(root, 'native-indexes');
		scratch = join(root, 'reader');
		await Promise.all([fs.mkdir(join(codexHome, 'sessions'), { recursive: true }), fs.mkdir(sqliteHome), fs.mkdir(scratch)]);
		const sqlite = await import('@vscode/sqlite3');
		const open = (path: string) => new Promise<Database>((done, reject) => {
			const db = new sqlite.default.Database(path, error => error ? reject(error) : done(db));
		});
		state = await open(join(sqliteHome, 'state_5.sqlite'));
		history = await open(join(sqliteHome, 'thread_history_1.sqlite'));
		await exec(state, 'PRAGMA journal_mode=WAL; CREATE TABLE threads(id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL)');
		await exec(history, 'PRAGMA journal_mode=WAL; CREATE TABLE thread_history_projection_state(thread_id TEXT PRIMARY KEY, next_rollout_byte_offset INTEGER NOT NULL, next_rollout_ordinal INTEGER NOT NULL)');
	});

	teardown(async () => {
		await Promise.all([close(state), close(history)]);
		await fs.rm(root, { recursive: true, force: true });
	});

	async function rollout(id = threadId, options: { replacement?: string; base?: { thread_id: string; end_byte_offset: number; end_ordinal_exclusive: number }; compressed?: boolean } = {}) {
		const path = join(codexHome, 'sessions', `rollout-2026-10-12T00-00-00-${id}${options.replacement ? '_' + options.replacement : ''}.jsonl${options.compressed ? '.zst' : ''}`);
		const data = Buffer.from(JSON.stringify({ ordinal: 0, type: 'session_meta', payload: { id, history_mode: 'paginated', history_base: options.base } }) + '\n');
		await fs.writeFile(path, options.compressed ? zstdCompressSync(data) : data);
		await run(state, 'INSERT INTO threads VALUES (?, ?)', [id, path]);
		await run(history, 'INSERT INTO thread_history_projection_state VALUES (?, ?, ?)', [options.replacement ?? id, data.length, options.base ? options.base.end_ordinal_exclusive + 1 : 1]);
		const thread = upcastPartial<Thread>({ id, path, historyMode: 'paginated', preview: '', turns: [] });
		return { thread, path, data };
	}

	const snapshot = () => CodexSavedHistoryStore.snapshot(scratch, { codexHome, sqliteHome }, CancellationToken.None);

	test('resolves home-relative native storage paths against the user home', () => {
		const userHome = resolve('reader-user');
		assert.deepStrictEqual([
			readCodexSqliteHome('sqlite_home = "~/indexes"', codexHome, userHome),
			readCodexSqliteHome('sqlite_home = \'~\'', codexHome, userHome),
			readCodexSqliteHome('sqlite_home = "~//indexes"', codexHome, userHome),
		], [join(userHome, 'indexes'), userHome, join(userHome, 'indexes')]);
	});

	test('snapshots committed WAL data without copying credentials or changing the source', async () => {
		const fixture = await rollout();
		await fs.writeFile(join(codexHome, 'auth.json'), '{"notForTheReader":true}');
		const before = await fs.readFile(fixture.path);
		const store = await snapshot();
		await store.validate(fixture.thread, CancellationToken.None);
		await store.validateUnchanged(fixture.thread, CancellationToken.None);
		assert.deepStrictEqual((await fs.readdir(scratch)).sort(), ['sessions', 'state_5.sqlite', 'thread_history_1.sqlite']);
		await fs.rm(scratch, { recursive: true });
		assert.deepStrictEqual(await fs.readFile(fixture.path), before);
	});

	test('rejects a missing projection rather than returning an empty conversation', async () => {
		const fixture = await rollout();
		await run(history, 'DELETE FROM thread_history_projection_state', []);
		await assert.rejects((await snapshot()).validate(fixture.thread, CancellationToken.None), /incomplete/);
	});

	test('rejects an index that only covers a prefix of the saved rollout', async () => {
		const fixture = await rollout();
		await run(history, 'UPDATE thread_history_projection_state SET next_rollout_byte_offset = next_rollout_byte_offset - 1', []);
		await assert.rejects((await snapshot()).validate(fixture.thread, CancellationToken.None), /incomplete/);
	});

	test('uses the selected replacement rollout identity after a revert', async () => {
		const fixture = await rollout(threadId, { replacement: replacementId });
		const store = await snapshot();
		await store.validate(fixture.thread, CancellationToken.None);
		await store.validateUnchanged(fixture.thread, CancellationToken.None);
	});

	test('validates an inherited segment from a compressed ancestor', async () => {
		const ancestor = await rollout(ancestorId, { compressed: true });
		const fixture = await rollout(threadId, { base: { thread_id: ancestorId, end_byte_offset: ancestor.data.length, end_ordinal_exclusive: 1 } });
		const store = await snapshot();
		await store.validate(fixture.thread, CancellationToken.None);
		await store.validateUnchanged(fixture.thread, CancellationToken.None);
	});

	test('rejects a fork when its ancestor index is missing', async () => {
		const ancestor = await rollout(ancestorId, { compressed: true });
		const fixture = await rollout(threadId, { base: { thread_id: ancestorId, end_byte_offset: ancestor.data.length, end_ordinal_exclusive: 1 } });
		await run(history, 'DELETE FROM thread_history_projection_state WHERE thread_id = ?', [ancestorId]);
		await assert.rejects((await snapshot()).validate(fixture.thread, CancellationToken.None), /incomplete/);
	});

	test('rejects concurrent source changes after reading the snapshot', async () => {
		const fixture = await rollout();
		const store = await snapshot();
		await store.validate(fixture.thread, CancellationToken.None);
		await fs.appendFile(fixture.path, '\n');
		await assert.rejects(store.validateUnchanged(fixture.thread, CancellationToken.None), /incomplete/);
	});

	test('rejects a native state pointer that changes after a revert', async () => {
		const fixture = await rollout();
		const store = await snapshot();
		await store.validate(fixture.thread, CancellationToken.None);
		const replacement = join(codexHome, 'sessions', 'replacement.jsonl');
		await fs.writeFile(replacement, fixture.data);
		await run(state, 'UPDATE threads SET rollout_path = ? WHERE id = ?', [replacement, threadId]);
		await assert.rejects(store.validateUnchanged(fixture.thread, CancellationToken.None), /incomplete/);
	});

	test('distinguishes an indexed empty thread from lost transcript rows', async () => {
		const fixture = await rollout();
		const store = await snapshot();
		await store.validate(fixture.thread, CancellationToken.None);
		await store.validateUnchanged(fixture.thread, CancellationToken.None);
		await assert.rejects(store.validateUnchanged({ ...fixture.thread, preview: 'There used to be a question' }, CancellationToken.None), /incomplete/);
	});
});

suite('Codex saved storage configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads a root path without mistaking nested or multiline content for it', () => {
		const base = resolve('codex-home');
		assert.deepStrictEqual([
			readCodexSqliteHome('model = "gpt-5"\nsqlite_home = "indexes" # local storage\n[mcp_servers.foo]\nsqlite_home="ignored"', base),
			readCodexSqliteHome('instructions = """\nsqlite_home="inside instructions"\n"""\nsqlite_home = \'indexes\'', base),
			readCodexSqliteHome('[profiles.review]\nsqlite_home = "ignored"', base),
		], [resolve(base, 'indexes'), resolve(base, 'indexes'), undefined]);
	});

	test('rejects ambiguous or unsupported root path values', () => {
		for (const config of ['sqlite_home = """\npath\n"""', 'sqlite_home = 7', 'sqlite_home="one"\nsqlite_home="two"', 'profile="alternate"\n[profiles.alternate]\nsqlite_home="elsewhere"']) {
			assert.throws(() => readCodexSqliteHome(config, resolve('codex-home')), /storage location/);
		}
	});

	test('unrelated multiline arrays and inline tables do not hide the root storage setting', () => {
		const unrelated = 'notify = [\n"program", # sqlite_home is only comment text\n"arguments",\n]\nother = { value = "sqlite_home", nested = ["x"] }\n';
		const base = resolve('codex-home');
		assert.deepStrictEqual([
			readCodexSqliteHome(unrelated, base),
			readCodexSqliteHome(unrelated + 'sqlite_home = "indexes"', base),
		], [undefined, resolve(base, 'indexes')]);
	});
});

function exec(db: Database, sql: string): Promise<void> {
	return new Promise((done, reject) => db.exec(sql, error => error ? reject(error) : done()));
}

function run(db: Database, sql: string, values: (string | number)[]): Promise<void> {
	return new Promise((done, reject) => db.run(sql, values, error => error ? reject(error) : done()));
}

function close(db: Database): Promise<void> {
	return new Promise((done, reject) => db.close(error => error ? reject(error) : done()));
}
