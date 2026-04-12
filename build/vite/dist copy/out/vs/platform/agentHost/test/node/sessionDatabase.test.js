/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { SessionDatabase, runMigrations, sessionDatabaseMigrations } from '../../node/sessionDatabase.js';
suite('SessionDatabase', () => {
    const disposables = new DisposableStore();
    let db;
    let db2;
    teardown(async () => {
        disposables.clear();
        await Promise.all([db?.close(), db2?.close()]);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    /**
     * Extends SessionDatabase to allow ejecting/injecting the raw sqlite3
     * Database instance, enabling reopen tests with :memory: databases.
     */
    class TestableSessionDatabase extends SessionDatabase {
        static async open(path, migrations = sessionDatabaseMigrations) {
            const inst = new TestableSessionDatabase(path, migrations);
            await inst._ensureDb();
            return inst;
        }
        /** Extract the raw db connection; this instance becomes inert. */
        async ejectDb() {
            const rawDb = await this._ensureDb();
            this._dbPromise = undefined;
            this._closed = true;
            return rawDb;
        }
        /** Create a TestableSessionDatabase wrapping an existing raw db. */
        static async fromDb(rawDb, migrations = sessionDatabaseMigrations) {
            await runMigrations(rawDb, migrations);
            const inst = new TestableSessionDatabase(':memory:', migrations);
            inst._dbPromise = Promise.resolve(rawDb);
            return inst;
        }
    }
    // ---- Migration system -----------------------------------------------
    suite('migrations', () => {
        test('applies all migrations on a fresh database', async () => {
            const migrations = [
                { version: 1, sql: 'CREATE TABLE t1 (id INTEGER PRIMARY KEY)' },
                { version: 2, sql: 'CREATE TABLE t2 (id INTEGER PRIMARY KEY)' },
            ];
            db = disposables.add(await SessionDatabase.open(':memory:', migrations));
            const tables = (await db.getAllTables()).sort();
            assert.deepStrictEqual(tables, ['t1', 't2']);
        });
        test('reopening with same migrations is a no-op', async () => {
            const migrations = [
                { version: 1, sql: 'CREATE TABLE t1 (id INTEGER PRIMARY KEY)' },
            ];
            const db1 = await TestableSessionDatabase.open(':memory:', migrations);
            const rawDb = await db1.ejectDb();
            // Reopen — should not throw (table already exists, migration skipped)
            db2 = disposables.add(await TestableSessionDatabase.fromDb(rawDb, migrations));
            assert.deepStrictEqual(await db2.getAllTables(), ['t1']);
        });
        test('only applies new migrations on reopen', async () => {
            const v1 = [
                { version: 1, sql: 'CREATE TABLE t1 (id INTEGER PRIMARY KEY)' },
            ];
            const db1 = await TestableSessionDatabase.open(':memory:', v1);
            const rawDb = await db1.ejectDb();
            const v2 = [
                ...v1,
                { version: 2, sql: 'CREATE TABLE t2 (id INTEGER PRIMARY KEY)' },
            ];
            db2 = disposables.add(await TestableSessionDatabase.fromDb(rawDb, v2));
            const tables = (await db2.getAllTables()).sort();
            assert.deepStrictEqual(tables, ['t1', 't2']);
        });
        test('rolls back on migration failure', async () => {
            const migrations = [
                { version: 1, sql: 'CREATE TABLE t1 (id INTEGER PRIMARY KEY)' },
                { version: 2, sql: 'THIS IS INVALID SQL' },
            ];
            await assert.rejects(() => SessionDatabase.open(':memory:', migrations));
            // A fresh :memory: open with valid migrations succeeds
            db = disposables.add(await SessionDatabase.open(':memory:', [
                { version: 1, sql: 'CREATE TABLE t1 (id INTEGER PRIMARY KEY)' },
            ]));
            assert.deepStrictEqual(await db.getAllTables(), ['t1']);
        });
    });
    // ---- File edits -----------------------------------------------------
    suite('file edits', () => {
        test('store and retrieve a file edit', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.createTurn('turn-1');
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-1',
                kind: "edit" /* FileEditKind.Edit */,
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
                    kind: "edit" /* FileEditKind.Edit */,
                    filePath: '/workspace/file.ts',
                    originalPath: undefined,
                    addedLines: 5,
                    removedLines: 2,
                }]);
        });
        test('retrieve multiple edits for a single tool call', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.createTurn('turn-1');
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-1',
                kind: "edit" /* FileEditKind.Edit */,
                filePath: '/workspace/a.ts',
                beforeContent: new TextEncoder().encode('a-before'),
                afterContent: new TextEncoder().encode('a-after'),
                addedLines: undefined,
                removedLines: undefined,
            });
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-1',
                kind: "edit" /* FileEditKind.Edit */,
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
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.createTurn('turn-1');
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-1',
                kind: "edit" /* FileEditKind.Edit */,
                filePath: '/workspace/a.ts',
                beforeContent: new Uint8Array(0),
                afterContent: new TextEncoder().encode('hello'),
                addedLines: undefined,
                removedLines: undefined,
            });
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-2',
                kind: "edit" /* FileEditKind.Edit */,
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
            db = disposables.add(await SessionDatabase.open(':memory:'));
            const edits = await db.getFileEdits(['nonexistent']);
            assert.deepStrictEqual(edits, []);
        });
        test.skip('returns empty array when given empty array' /* Flaky https://github.com/microsoft/vscode/issues/306057 */, async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            const edits = await db.getFileEdits([]);
            assert.deepStrictEqual(edits, []);
        });
        test('replace on conflict (same toolCallId + filePath)', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.createTurn('turn-1');
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-1',
                kind: "edit" /* FileEditKind.Edit */,
                filePath: '/workspace/file.ts',
                beforeContent: new TextEncoder().encode('v1'),
                afterContent: new TextEncoder().encode('v1-after'),
                addedLines: 1,
                removedLines: 0,
            });
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-1',
                kind: "edit" /* FileEditKind.Edit */,
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
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.createTurn('turn-1');
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-1',
                kind: "edit" /* FileEditKind.Edit */,
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
            db = disposables.add(await SessionDatabase.open(':memory:'));
            const content = await db.readFileEditContent('tc-missing', '/no/such/file');
            assert.strictEqual(content, undefined);
        });
        test('persists binary content correctly', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            const binary = new Uint8Array([0, 1, 2, 255, 128, 64]);
            await db.createTurn('turn-1');
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-bin',
                kind: "edit" /* FileEditKind.Edit */,
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
            db = disposables.add(await SessionDatabase.open(':memory:'));
            // storeFileEdit should succeed even without a prior createTurn call
            await db.storeFileEdit({
                turnId: 'auto-turn',
                toolCallId: 'tc-1',
                kind: "edit" /* FileEditKind.Edit */,
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
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.createTurn('turn-1');
            await db.createTurn('turn-1'); // should not throw
        });
        test('deleteTurn cascades to file edits', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.createTurn('turn-1');
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-1',
                kind: "edit" /* FileEditKind.Edit */,
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
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.createTurn('turn-1');
            await db.createTurn('turn-2');
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-1',
                kind: "edit" /* FileEditKind.Edit */,
                filePath: '/workspace/a.ts',
                beforeContent: new Uint8Array(0),
                afterContent: new TextEncoder().encode('a'),
                addedLines: undefined,
                removedLines: undefined,
            });
            await db.storeFileEdit({
                turnId: 'turn-2',
                toolCallId: 'tc-2',
                kind: "edit" /* FileEditKind.Edit */,
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
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.deleteTurn('nonexistent'); // should not throw
        });
    });
    // ---- Dispose --------------------------------------------------------
    suite('dispose', () => {
        test('methods throw after dispose', async () => {
            db = await SessionDatabase.open(':memory:');
            db.close();
            await assert.rejects(() => db.createTurn('turn-1'), /disposed/);
        });
        test('double dispose is safe', async () => {
            db = await SessionDatabase.open(':memory:');
            await db.close();
            await db.close(); // should not throw
        });
    });
    // ---- Lazy open ------------------------------------------------------
    suite('lazy open', () => {
        test('constructor does not open the database', () => {
            db = new SessionDatabase(':memory:');
            disposables.add(db);
            // No error — the database is not opened until first use
        });
        test('first async call opens and migrates the database', async () => {
            db = disposables.add(new SessionDatabase(':memory:'));
            await db.createTurn('turn-1');
            const edits = await db.getFileEdits(['nonexistent']);
            assert.deepStrictEqual(edits, []);
        });
        test('multiple concurrent calls share the same open promise', async () => {
            db = disposables.add(new SessionDatabase(':memory:'));
            // Fire multiple calls concurrently — all should succeed
            await Promise.all([
                db.createTurn('turn-1'),
                db.createTurn('turn-2'),
                db.getFileEdits([]),
            ]);
        });
        test('dispose during open rejects subsequent calls', async () => {
            db = new SessionDatabase(':memory:');
            await db.close();
            await assert.rejects(() => db.createTurn('turn-1'), /disposed/);
        });
    });
    // ---- Session metadata -----------------------------------------------
    suite('session metadata', () => {
        test('getMetadata returns undefined for missing key', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            assert.strictEqual(await db.getMetadata('nonexistent'), undefined);
        });
        test('setMetadata and getMetadata round-trip', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.setMetadata('customTitle', 'My Session');
            assert.strictEqual(await db.getMetadata('customTitle'), 'My Session');
        });
        test('setMetadata overwrites existing value', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.setMetadata('customTitle', 'First');
            await db.setMetadata('customTitle', 'Second');
            assert.strictEqual(await db.getMetadata('customTitle'), 'Second');
        });
        test('metadata persists across reopen', async () => {
            const db1 = disposables.add(await TestableSessionDatabase.open(':memory:'));
            await db1.setMetadata('customTitle', 'Persistent Title');
            const rawDb = await db1.ejectDb();
            db = disposables.add(await TestableSessionDatabase.fromDb(rawDb));
            assert.strictEqual(await db.getMetadata('customTitle'), 'Persistent Title');
        });
        test('migration v2 creates session_metadata table', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            const tables = await db.getAllTables();
            assert.ok(tables.includes('session_metadata'));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbkRhdGFiYXNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvdGVzdC9ub2RlL3Nlc3Npb25EYXRhYmFzZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGVBQWUsRUFBRSxhQUFhLEVBQUUseUJBQXlCLEVBQWtDLE1BQU0sK0JBQStCLENBQUM7QUFJMUksS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtJQUU3QixNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBQzFDLElBQUksRUFBK0IsQ0FBQztJQUNwQyxJQUFJLEdBQWdDLENBQUM7SUFFckMsUUFBUSxDQUFDLEtBQUssSUFBSSxFQUFFO1FBQ25CLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNwQixNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNoRCxDQUFDLENBQUMsQ0FBQztJQUNILHVDQUF1QyxFQUFFLENBQUM7SUFFMUM7OztPQUdHO0lBQ0gsTUFBTSx1QkFBd0IsU0FBUSxlQUFlO1FBQ3BELE1BQU0sQ0FBVSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQVksRUFBRSxhQUFtRCx5QkFBeUI7WUFDcEgsTUFBTSxJQUFJLEdBQUcsSUFBSSx1QkFBdUIsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDM0QsTUFBTSxJQUFJLENBQUMs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