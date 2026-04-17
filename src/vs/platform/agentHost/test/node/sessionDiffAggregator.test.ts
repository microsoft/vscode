/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileEditKind, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { encodeString, TestDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { computeSessionDiffs } from '../../node/sessionDiffAggregator.js';

const createTestDiffService = () => new TestDiffComputeService();

function fileDiff(path: string, added: number, removed: number): ISessionFileDiff {
	const uri = URI.file(path).toString();
	return { after: { uri, content: { uri } }, diff: { added, removed } };
}

function getDiffUri(diff: ISessionFileDiff): string | undefined {
	return diff.after?.uri ?? diff.before?.uri;
}

suite('computeSessionDiffs', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Full-mode tests (no incremental options) ---------------------------

	test('returns empty array for no edits', async () => {
		const db = new TestSessionDatabase();
		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(db, diffService);
		assert.deepStrictEqual(result, []);
	});

	test('computes diffs for a single edited file', async () => {
		const db = new TestSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('line1\nline2'), afterContent: encodeString('line1\nline2\nline3'),
		});

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(db, diffService);

		assert.deepStrictEqual(result, [fileDiff('/a.txt', 1, 0)]);
		assert.strictEqual(diffService.callCount, 1);
	});

	test('skips files with no net change', async () => {
		const db = new TestSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('same'), afterContent: encodeString('different'),
		});
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('different'), afterContent: encodeString('same'),
		});

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(db, diffService);

		// Before = tc1.before = 'same', After = tc2.after = 'same' → zero net change
		assert.deepStrictEqual(result, []);
		assert.strictEqual(diffService.callCount, 0, 'no diff computation needed for zero net change');
	});

	test('tracks rename chains correctly', async () => {
		const db = new TestSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			afterContent: encodeString('hello'),
		});
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/b.txt', kind: FileEditKind.Rename, originalPath: '/a.txt',
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('hello'), afterContent: encodeString('hello world'),
		});

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(db, diffService);

		assert.strictEqual(result.length, 1);
		assert.strictEqual(getDiffUri(result[0]), URI.file('/b.txt').toString(), 'uses terminal path after rename');
	});

	// ---- Incremental-mode tests ---------------------------------------------

	test('incremental: reuses previousDiffs for untouched files', async () => {
		const db = new TestSessionDatabase();
		// File A edited in turn 1 only
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('a-before'), afterContent: encodeString('a-after'),
		});
		// File B edited in turn 2
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/b.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('b-before'), afterContent: encodeString('b-after\nnew'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			fileDiff('/a.txt', 42, 7),
		];

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(
			db,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Sort to ensure stable comparison
		result.sort((a, b) => (getDiffUri(a) ?? '').localeCompare(getDiffUri(b) ?? ''));

		assert.deepStrictEqual(result, [
			fileDiff('/a.txt', 42, 7), // carried over
			fileDiff('/b.txt', 1, 0),  // recomputed
		]);
		// Only file B should have triggered a diff computation
		assert.strictEqual(diffService.callCount, 1, 'only touched file should be diffed');
	});

	test('incremental: recomputes file edited in current turn', async () => {
		const db = new TestSessionDatabase();
		// File A edited in turn 1 and turn 2
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('original'), afterContent: encodeString('after-turn1'),
		});
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('after-turn1'), afterContent: encodeString('after-turn2\nextra'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			fileDiff('/a.txt', 100, 100), // stale
		];

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(
			db,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Should compare tc1.before='original' vs tc2.after='after-turn2\nextra'
		assert.deepStrictEqual(result, [fileDiff('/a.txt', 1, 0)]);
		assert.strictEqual(diffService.callCount, 1);
	});

	test('incremental: rename in current turn drops old URI from previousDiffs', async () => {
		const db = new TestSessionDatabase();
		// File created in turn 1
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/old.txt', kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			afterContent: encodeString('content'),
		});
		// Renamed in turn 2
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/new.txt', kind: FileEditKind.Rename,
			originalPath: '/old.txt',
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('content'), afterContent: encodeString('content'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			fileDiff('/old.txt', 5, 0),
		];

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(
			db,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Create → Rename with same content: before='' (create), after='content' (rename)
		assert.strictEqual(result.length, 1);
		assert.strictEqual(getDiffUri(result[0]), URI.file('/new.txt').toString(), 'uses new URI after rename');
	});

	test('incremental: file with zero net change in current turn is excluded even if in previousDiffs', async () => {
		const db = new TestSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('original'), afterContent: encodeString('modified'),
		});
		// Turn 2 reverts the change
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('modified'), afterContent: encodeString('original'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			fileDiff('/a.txt', 10, 5),
		];

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(
			db,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Net change is zero (reverted), so file should be excluded
		assert.deepStrictEqual(result, []);
	});

	test('incremental: previousDiffs entry for file not in current identities is dropped (slow path)', async () => {
		const db = new TestSessionDatabase();
		// File A was edited in turn 1 and is in previousDiffs
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('before'), afterContent: encodeString('after'),
		});
		// File A is edited again in turn 2 → triggers slow path (re-edit of existing file)
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('after'), afterContent: encodeString('latest\nline'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			fileDiff('/a.txt', 1, 0),
			fileDiff('/orphan.txt', 99, 99), // no longer in DB
		];

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(
			db,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Slow path: orphan is dropped because it has no identity in the full graph
		assert.strictEqual(result.length, 1);
		assert.strictEqual(getDiffUri(result[0]), URI.file('/a.txt').toString());
	});

	test('full mode recomputes all files (no incremental options)', async () => {
		const db = new TestSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('a'), afterContent: encodeString('a\nb'),
		});
		db.addEdit({
			turnId: 't1', toolCallId: 'tc2', filePath: '/b.txt', kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			afterContent: encodeString('new'),
		});

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(db, diffService);

		assert.strictEqual(result.length, 2);
		assert.strictEqual(diffService.callCount, 2, 'both files should be diffed in full mode');
	});

	// ---- Fast-path tests (turn-scoped query optimization) -------------------

	test('incremental fast path: new files only uses getFileEditsByTurn, not getAllFileEdits', async () => {
		const db = new TestSessionDatabase();
		// Turn 1: existing file untouched in turn 2
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/old.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('old-before'), afterContent: encodeString('old-after'),
		});
		// Turn 2: creates a new file
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/new.txt', kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			afterContent: encodeString('brand new'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			fileDiff('/old.txt', 3, 1),
		];

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(
			db,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Fast path: only getFileEditsByTurn called, not getAllFileEdits
		assert.strictEqual(db.getFileEditsByTurnCalls, 1);
		assert.strictEqual(db.getAllFileEditsCalls, 0, 'fast path should not call getAllFileEdits');

		result.sort((a, b) => (getDiffUri(a) ?? '').localeCompare(getDiffUri(b) ?? ''));
		assert.deepStrictEqual(result, [
			fileDiff('/new.txt', 1, 0),
			fileDiff('/old.txt', 3, 1), // carried over
		]);
	});

	test('incremental slow path: re-edit of existing file falls back to getAllFileEdits', async () => {
		const db = new TestSessionDatabase();
		// Turn 1: edit file A
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('original'), afterContent: encodeString('turn1'),
		});
		// Turn 2: edit file A again
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('turn1'), afterContent: encodeString('turn2\nextra'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			fileDiff('/a.txt', 5, 0),
		];

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(
			db,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Slow path: falls back to getAllFileEdits because /a.txt is in previousDiffs
		assert.strictEqual(db.getFileEditsByTurnCalls, 1, 'should try turn-scoped query first');
		assert.strictEqual(db.getAllFileEditsCalls, 1, 'should fall back to getAllFileEdits');

		// Cumulative diff: original → turn2\nextra
		assert.deepStrictEqual(result, [fileDiff('/a.txt', 1, 0)]);
	});

	test('incremental slow path: rename in current turn falls back to getAllFileEdits', async () => {
		const db = new TestSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			afterContent: encodeString('content'),
		});
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/b.txt', kind: FileEditKind.Rename,
			originalPath: '/a.txt',
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('content'), afterContent: encodeString('content'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			fileDiff('/a.txt', 1, 0),
		];

		const diffService = createTestDiffService();
		await computeSessionDiffs(
			db,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		assert.strictEqual(db.getAllFileEditsCalls, 1, 'should fall back for renames');
	});

	test('incremental: no edits in turn returns previousDiffs unchanged', async () => {
		const db = new TestSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('before'), afterContent: encodeString('after'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			fileDiff('/a.txt', 5, 2),
		];

		const diffService = createTestDiffService();
		const result = await computeSessionDiffs(
			db,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		assert.strictEqual(db.getAllFileEditsCalls, 0, 'no computation needed');
		assert.deepStrictEqual(result, previousDiffs);
	});
});
