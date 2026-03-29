/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync } from 'fs';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { SessionDatabase, type ISessionDatabaseMigration } from '../../node/sessionDatabase.js';
import { join } from '../../../../base/common/path.js';

suite('SessionDatabase', () => {

	const disposables = new DisposableStore();
	let testDir: string;
	let db: SessionDatabase | undefined;
	let db2: SessionDatabase | undefined;

	setup(() => {
		testDir = join(tmpdir(), `vscode-session-db-test-${randomUUID()}`);
		mkdirSync(testDir, { recursive: true });
	});

	teardown(async () => {
		disposables.clear();
		await Promise.all([db?.close(), db2?.close()]);
		rmSync(testDir, { recursive: true, force: true });
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	function dbPath(name = 'session.db'): string {
		return join(testDir, name);
	}

	// ---- Migration system -----------------------------------------------

	suite('migrations', () => {

		test('applies all migrations on a fresh database', async () => {
			const migrations: ISessionDatabaseMigration[] = [
				{ version: 1, sql: 'CREATE TABLE t1 (id INTEGER PRIMARY KEY)' },
				{ version: 2, sql: 'CREATE TABLE t2 (id INTEGER PRIMARY KEY)' },
			];

			db = disposables.add(await SessionDatabase.open(dbPath(), migrations));

			const tables = (await db.getAllTables()).sort();
			assert.deepStrictEqual(tables, ['t1', 't2']);
		});

		test('reopening with same migrations is a no-op', async () => {
			const migrations: ISessionDatabaseMigration[] = [
				{ version: 1, sql: 'CREATE TABLE t1 (id INTEGER PRIMARY KEY)' },
			];

			const db1 = await SessionDatabase.open(dbPath(), migrations);
			await db1.close();

			// Reopen — should not throw (table already exists, migration skipped)
			db2 = disposables.add(await SessionDatabase.open(dbPath(), migrations));
			assert.deepStrictEqual(await db2.getAllTables(), ['t1']);
		});

		test('only applies new migrations on reopen', async () => {
			const v1: ISessionDatabaseMigration[] = [
				{ version: 1, sql: 'CREATE TABLE t1 (id INTEGER PRIMARY KEY)' },
			];
			const db1 = await SessionDatabase.open(dbPath(), v1);
			await db1.close();

			const v2: ISessionDatabaseMigration[] = [
				...v1,
				{ version: 2, sql: 'CREATE TABLE t2 (id INTEGER PRIMARY KEY)' },
			];
			db2 = disposables.add(await SessionDatabase.open(dbPath(), v2));

			const tables = (await db2.getAllTables()).sort();
			assert.deepStrictEqual(tables, ['t1', 't2']);
		});

		test('rolls back on migration failure', async () => {
			const migrations: ISessionDatabaseMigration[] = [
				{ version: 1, sql: 'CREATE TABLE t1 (id INTEGER PRIMARY KEY)' },
				{ version: 2, sql: 'THIS IS INVALID SQL' },
			];

			await assert.rejects(() => SessionDatabase.open(dbPath(), migrations));

			// Reopen with only v1 — t1 should not exist because the whole
			// transaction was rolled back
			db = disposables.add(await SessionDatabase.open(dbPath(), [
				{ version: 1, sql: 'CREATE TABLE t1 (id INTEGER PRIMARY KEY)' },
			]));
			assert.deepStrictEqual(await db.getAllTables(), ['t1']);
		});
	});

	// ---- File edits -----------------------------------------------------

	suite('file edits', () => {

		test('store and retrieve a file edit', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));

			await db.createTurn('turn-1');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				filePath: '/workspace/file.ts',
				beforeContent: new TextEncoder().encode('before'),
				afterContent: new TextEncoder().encode('after'),
				addedLines: 5,
				removedLines: 2,
			});

			const edits = await db.getFileEdits(['tc-1']);
			assert.deepStrictEqual(edits, [{
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				filePath: '/workspace/file.ts',
				addedLines: 5,
				removedLines: 2,
			}]);
		});

		test('retrieve multiple edits for a single tool call', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));

			await db.createTurn('turn-1');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				filePath: '/workspace/a.ts',
				beforeContent: new TextEncoder().encode('a-before'),
				afterContent: new TextEncoder().encode('a-after'),
				addedLines: undefined,
				removedLines: undefined,
			});
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				filePath: '/workspace/b.ts',
				beforeContent: new TextEncoder().encode('b-before'),
				afterContent: new TextEncoder().encode('b-after'),
				addedLines: 1,
				removedLines: 0,
			});

			const edits = await db.getFileEdits(['tc-1']);
			assert.strictEqual(edits.length, 2);
			assert.strictEqual(edits[0].filePath, '/workspace/a.ts');
			assert.strictEqual(edits[1].filePath, '/workspace/b.ts');
		});

		test('retrieve edits across multiple tool calls', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));

			await db.createTurn('turn-1');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				filePath: '/workspace/a.ts',
				beforeContent: new Uint8Array(0),
				afterContent: new TextEncoder().encode('hello'),
				addedLines: undefined,
				removedLines: undefined,
			});
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-2',
				filePath: '/workspace/b.ts',
				beforeContent: new Uint8Array(0),
				afterContent: new TextEncoder().encode('world'),
				addedLines: undefined,
				removedLines: undefined,
			});

			const edits = await db.getFileEdits(['tc-1', 'tc-2']);
			assert.strictEqual(edits.length, 2);

			// Only tc-2
			const edits2 = await db.getFileEdits(['tc-2']);
			assert.strictEqual(edits2.length, 1);
			assert.strictEqual(edits2[0].toolCallId, 'tc-2');
		});

		test('returns empty array for unknown tool call IDs', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));
			const edits = await db.getFileEdits(['nonexistent']);
			assert.deepStrictEqual(edits, []);
		});

		test.skip('returns empty array when given empty array' /* Flaky https://github.com/microsoft/vscode/issues/306057 */, async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));
			const edits = await db.getFileEdits([]);
			assert.deepStrictEqual(edits, []);
		});

		test('replace on conflict (same toolCallId + filePath)', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));

			await db.createTurn('turn-1');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				filePath: '/workspace/file.ts',
				beforeContent: new TextEncoder().encode('v1'),
				afterContent: new TextEncoder().encode('v1-after'),
				addedLines: 1,
				removedLines: 0,
			});
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				filePath: '/workspace/file.ts',
				beforeContent: new TextEncoder().encode('v2'),
				afterContent: new TextEncoder().encode('v2-after'),
				addedLines: 3,
				removedLines: 1,
			});

			const edits = await db.getFileEdits(['tc-1']);
			assert.strictEqual(edits.length, 1);
			assert.strictEqual(edits[0].addedLines, 3);

			const content = await db.readFileEditContent('tc-1', '/workspace/file.ts');
			assert.ok(content);
			assert.deepStrictEqual(new TextDecoder().decode(content.beforeContent), 'v2');
		});

		test('readFileEditContent returns content on demand', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));

			await db.createTurn('turn-1');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				filePath: '/workspace/file.ts',
				beforeContent: new TextEncoder().encode('before'),
				afterContent: new TextEncoder().encode('after'),
				addedLines: undefined,
				removedLines: undefined,
			});

			const content = await db.readFileEditContent('tc-1', '/workspace/file.ts');
			assert.ok(content);
			assert.deepStrictEqual(content.beforeContent, new TextEncoder().encode('before'));
			assert.deepStrictEqual(content.afterContent, new TextEncoder().encode('after'));
		});

		test('readFileEditContent returns undefined for missing edit', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));
			const content = await db.readFileEditContent('tc-missing', '/no/such/file');
			assert.strictEqual(content, undefined);
		});

		test('persists binary content correctly', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));
			const binary = new Uint8Array([0, 1, 2, 255, 128, 64]);

			await db.createTurn('turn-1');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-bin',
				filePath: '/workspace/image.png',
				beforeContent: new Uint8Array(0),
				afterContent: binary,
				addedLines: undefined,
				removedLines: undefined,
			});

			const content = await db.readFileEditContent('tc-bin', '/workspace/image.png');
			assert.ok(content);
			assert.deepStrictEqual(content.afterContent, binary);
		});

		test('auto-creates turn if it does not exist', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));

			// storeFileEdit should succeed even without a prior createTurn call
			await db.storeFileEdit({
				turnId: 'auto-turn',
				toolCallId: 'tc-1',
				filePath: '/x',
				beforeContent: new Uint8Array(0),
				afterContent: new Uint8Array(0),
				addedLines: undefined,
				removedLines: undefined,
			});

			const edits = await db.getFileEdits(['tc-1']);
			assert.strictEqual(edits.length, 1);
			assert.strictEqual(edits[0].turnId, 'auto-turn');
		});
	});

	// ---- Turns ----------------------------------------------------------

	suite('turns', () => {

		test('createTurn is idempotent', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));
			await db.createTurn('turn-1');
			await db.createTurn('turn-1'); // should not throw
		});

		test('deleteTurn cascades to file edits', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));

			await db.createTurn('turn-1');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				filePath: '/workspace/a.ts',
				beforeContent: new TextEncoder().encode('before'),
				afterContent: new TextEncoder().encode('after'),
				addedLines: undefined,
				removedLines: undefined,
			});

			// Edits exist
			assert.strictEqual((await db.getFileEdits(['tc-1'])).length, 1);

			// Delete the turn — edits should be gone
			await db.deleteTurn('turn-1');
			assert.deepStrictEqual(await db.getFileEdits(['tc-1']), []);
		});

		test('deleteTurn only removes its own edits', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));

			await db.createTurn('turn-1');
			await db.createTurn('turn-2');
			await db.storeFileEdit({
				turnId: 'turn-1',
				toolCallId: 'tc-1',
				filePath: '/workspace/a.ts',
				beforeContent: new Uint8Array(0),
				afterContent: new TextEncoder().encode('a'),
				addedLines: undefined,
				removedLines: undefined,
			});
			await db.storeFileEdit({
				turnId: 'turn-2',
				toolCallId: 'tc-2',
				filePath: '/workspace/b.ts',
				beforeContent: new Uint8Array(0),
				afterContent: new TextEncoder().encode('b'),
				addedLines: undefined,
				removedLines: undefined,
			});

			await db.deleteTurn('turn-1');

			assert.deepStrictEqual(await db.getFileEdits(['tc-1']), []);
			assert.strictEqual((await db.getFileEdits(['tc-2'])).length, 1);
		});

		test('deleteTurn is a no-op for unknown turn', async () => {
			db = disposables.add(await SessionDatabase.open(dbPath()));
			await db.deleteTurn('nonexistent'); // should not throw
		});
	});

	// ---- Dispose --------------------------------------------------------

	suite('dispose', () => {

		test('methods throw after dispose', async () => {
			db = await SessionDatabase.open(dbPath());
			db.close();

			await assert.rejects(
				() => db!.createTurn('turn-1'),
				/disposed/,
			);
		});

		test('double dispose is safe', async () => {
			db = await SessionDatabase.open(dbPath());
			await db.close();
			await db.close(); // should not throw
		});
	});

	// ---- Lazy open ------------------------------------------------------

	suite('lazy open', () => {

		test('constructor does not open the database', () => {
			// Should not throw even if path does not exist yet
			db = new SessionDatabase(join(testDir, 'lazy', 'session.db'));
			disposables.add(db);
			// No error — the database is not opened until first use
		});

		test('first async call opens and migrates the database', async () => {
			db = disposables.add(new SessionDatabase(dbPath()));
			// Database file may not exist yet — first call triggers open
			await db.createTurn('turn-1');
			const edits = await db.getFileEdits(['nonexistent']);
			assert.deepStrictEqual(edits, []);
		});

		test('multiple concurrent calls share the same open promise', async () => {
			db = disposables.add(new SessionDatabase(dbPath()));
			// Fire multiple calls concurrently — all should succeed
			await Promise.all([
				db.createTurn('turn-1'),
				db.createTurn('turn-2'),
				db.getFileEdits([]),
			]);
		});

		test('dispose during open rejects subsequent calls', async () => {
			db = new SessionDatabase(dbPath());
			await db.close();
			await assert.rejects(() => db!.createTurn('turn-1'), /disposed/);
		});
	});
});
