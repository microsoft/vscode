/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { join } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { FileEditKind } from '../../../common/state/sessionState.js';
import { storeCodexTurnDiffs } from '../../../node/codex/codexTurnDiff.js';
import { CodexTurnDiffTracker } from '../../../node/codex/codexTurnDiffTracker.js';
import { SessionDatabase } from '../../../node/sessionDatabase.js';

suite('Codex turn diff snapshots', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const cwd = URI.file(isWindows ? 'c:\\workspace' : '/workspace');
	const expectedPath = (name: string) => URI.joinPath(cwd, name).path;
	let database: SessionDatabase;
	let fileService: FileService;
	const logService = new NullLogService();

	setup(async () => {
		database = disposables.add(await SessionDatabase.open(':memory:'));
		fileService = disposables.add(new FileService(logService));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		if (isWindows) {
			// FileService assumes drive roots exist; seed this one using provider-native POSIX paths.
			await provider.mkdir(URI.from({ scheme: 'inmemory', path: '/c:' }));
		}
		disposables.add(fileService.registerProvider('file', provider));
	});

	function diff(before: string | undefined, after: string | undefined, hunks: string, beforePath = 'edit.txt', afterPath = beforePath): string {
		const hash = (content: string | undefined) => content === undefined ? '0'.repeat(40)
			: createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
		return `diff --git a/${beforePath} b/${afterPath}\n`
			+ (before === undefined ? 'new file mode 100644\n' : after === undefined ? 'deleted file mode 100644\n' : '')
			+ `index ${hash(before)}..${hash(after)}\n`
			+ (hunks ? `--- ${before === undefined ? '/dev/null' : `a/${beforePath}`}\n+++ ${after === undefined ? '/dev/null' : `b/${afterPath}`}\n${hunks}` : '');
	}

	function fileSequences(names: readonly string[], first: number, last = first): Map<string, { first: number; last: number }> {
		return new Map(names.map(name => [join(cwd.fsPath, name), { first, last }]));
	}

	function fixturePaths(patch: string): string[] {
		return [...new Set([...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].flatMap(match => [match[1], match[2]]))];
	}

	async function capture(patch: string, boundaries = [{ turnId: 'host-turn', diff: patch }]): Promise<void> {
		for (const boundary of boundaries) {
			await database.setTurnEventId(boundary.turnId, 'native-turn');
		}
		await storeCodexTurnDiffs([{
			notification: { threadId: 'thread', turnId: 'native-turn', diff: patch },
			initialDiffs: boundaries.map(boundary => boundary.diff),
			snapshots: boundaries.map((boundary, index) => ({
				...boundary, startSequence: index + 1, sequence: index + 1,
				fileSequences: fileSequences(fixturePaths(boundaries.map(item => item.diff).join('')), 1, index + 1),
			})),
		}], {
			relatedDiffs: [], cwd, nativeCwd: cwd, database, fileService, logService,
		});
	}

	async function write(content: string, path = 'edit.txt'): Promise<void> {
		await fileService.writeFile(URI.file(join(cwd.fsPath, path)), VSBuffer.fromString(content));
	}

	async function snapshots(turnId = 'host-turn') {
		const records = await database.getFileEditsByTurn(turnId);
		return Promise.all(records.map(async record => {
			const content = await database.readFileEditContent(record.toolCallId, record.filePath);
			return {
				path: URI.file(record.filePath).path, kind: record.kind,
				before: content?.beforeContent && VSBuffer.wrap(content.beforeContent).toString(),
				after: content?.afterContent && VSBuffer.wrap(content.afterContent).toString(),
			};
		}));
	}

	test('reconstructs unchanged text outside multiple hunks', async () => {
		const before = 'prefix0\nkeep1\nold2\nkeep3\nkeep4\nkeep5\nkeep6\nkeep7\nkeep8\nold9\nsuffix10\n';
		const after = before.replace('old2', 'new2').replace('old9', 'new9');
		await write(after);
		await capture(diff(before, after, '@@ -2,3 +2,3 @@\n keep1\n-old2\n+new2\n keep3\n@@ -9,3 +9,3 @@\n keep8\n-old9\n+new9\n suffix10\n'));
		assert.deepStrictEqual(await snapshots(), [{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before, after }]);
	});

	test('preserves CRLF, a byte order mark, and a missing final newline', async () => {
		const before = '\uFEFFone\r\nold\r\nend';
		const after = '\uFEFFone\r\nnew\r\nend';
		await write(after, 'space name.txt');
		await capture(diff(before, after, '@@ -1,3 +1,3 @@\n \uFEFFone\r\n-old\r\n+new\r\n end\n\\ No newline at end of file\n', 'space name.txt'));
		assert.deepStrictEqual(await snapshots(), [{ path: expectedPath('space name.txt'), kind: FileEditKind.Edit, before, after }]);
	});

	test('preserves differing missing-newline markers on both sides', async () => {
		await write('new');
		await capture(diff('old', 'new', '@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n'));
		assert.deepStrictEqual(await snapshots(), [{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'old', after: 'new' }]);
	});

	test('retains deleted contents without reading the missing file', async () => {
		await capture(diff('deleted\n', undefined, '@@ -1 +0,0 @@\n-deleted\n'));
		assert.deepStrictEqual(await snapshots(), [{ path: expectedPath('edit.txt'), kind: FileEditKind.Delete, before: 'deleted\n', after: undefined }]);
	});

	test('retains created contents without inventing a before side', async () => {
		await write('created\n');
		await capture(diff(undefined, 'created\n', '@@ -0,0 +1 @@\n+created\n'));
		assert.deepStrictEqual(await snapshots(), [{ path: expectedPath('edit.txt'), kind: FileEditKind.Create, before: undefined, after: 'created\n' }]);
	});

	test('records a move by its two physical paths', async () => {
		await write('pear\n', 'destination.txt');
		await capture(diff('apple\n', 'pear\n', '@@ -1 +1 @@\n-apple\n+pear\n', 'source.txt', 'destination.txt'));
		assert.deepStrictEqual(await snapshots(), [
			{ path: expectedPath('source.txt'), kind: FileEditKind.Delete, before: 'apple\n', after: undefined },
			{ path: expectedPath('destination.txt'), kind: FileEditKind.Create, before: undefined, after: 'pear\n' },
		]);
	});

	test('does not include edits made outside the reported patch', async () => {
		await write('after\nunrelated user edit\n');
		await capture(diff('before\n', 'after\n', '@@ -1 +1 @@\n-before\n+after\n'));
		assert.deepStrictEqual(await snapshots(), []);
	});

	test('does not fabricate before contents from invalid hunks', async () => {
		await write('after\n');
		await capture(diff('actual before\n', 'after\n', '@@ -1 +1 @@\n-invented before\n+after\n'));
		assert.deepStrictEqual(await snapshots(), []);
	});

	test('supports empty-file creates and deletes without hunk headers', async () => {
		await write('', 'created.txt');
		await capture(diff(undefined, '', '', 'created.txt') + diff('', undefined, '', 'deleted.txt'));
		assert.deepStrictEqual(await snapshots(), [
			{ path: expectedPath('created.txt'), kind: FileEditKind.Create, before: undefined, after: '' },
			{ path: expectedPath('deleted.txt'), kind: FileEditKind.Delete, before: '', after: undefined },
		]);
	});

	test('handles a large unchanged suffix without exceeding the argument limit', async () => {
		const suffix = 'unchanged\n'.repeat(150_000);
		await write('after\n' + suffix);
		await capture(diff('before\n' + suffix, 'after\n' + suffix, '@@ -1 +1 @@\n-before\n+after\n'));
		const result = await snapshots();
		assert.deepStrictEqual(result.map(({ before, after }) => ({ before, after })), [{ before: 'before\n' + suffix, after: 'after\n' + suffix }]);
	});

	test('splits cumulative native diffs into consecutive host checkpoints', async () => {
		await write('c\n');
		const first = diff('a\n', 'b\n', '@@ -1 +1 @@\n-a\n+b\n');
		const final = diff('a\n', 'c\n', '@@ -1 +1 @@\n-a\n+c\n');
		await capture(final, [{ turnId: 'host-turn', diff: first }, { turnId: 'steering-turn', diff: final }]);
		assert.deepStrictEqual([await snapshots(), await snapshots('steering-turn')], [
			[{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'a\n', after: 'b\n' }],
			[{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'b\n', after: 'c\n' }],
		]);
	});

	test('retains both checkpoints when a steered edit reverts the native diff to empty', async () => {
		await write('a\n');
		await capture('', [
			{ turnId: 'host-turn', diff: diff('a\n', 'b\n', '@@ -1 +1 @@\n-a\n+b\n') },
			{ turnId: 'steering-turn', diff: '' },
		]);
		assert.deepStrictEqual([await snapshots(), await snapshots('steering-turn')], [
			[{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'a\n', after: 'b\n' }],
			[{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'b\n', after: 'a\n' }],
		]);
	});

	test('retains transient creates and deletes across host checkpoints', async () => {
		await write('restored\n', 'deleted.txt');
		await capture('', [
			{
				turnId: 'host-turn', diff: diff(undefined, 'created\n', '@@ -0,0 +1 @@\n+created\n', 'created.txt')
					+ diff('restored\n', undefined, '@@ -1 +0,0 @@\n-restored\n', 'deleted.txt')
			},
			{ turnId: 'steering-turn', diff: '' },
		]);
		assert.deepStrictEqual([await snapshots(), await snapshots('steering-turn')], [
			[
				{ path: expectedPath('created.txt'), kind: FileEditKind.Create, before: undefined, after: 'created\n' },
				{ path: expectedPath('deleted.txt'), kind: FileEditKind.Delete, before: 'restored\n', after: undefined },
			],
			[
				{ path: expectedPath('created.txt'), kind: FileEditKind.Delete, before: 'created\n', after: undefined },
				{ path: expectedPath('deleted.txt'), kind: FileEditKind.Create, before: undefined, after: 'restored\n' },
			],
		]);
	});

	test('native history reads every host segment while a host id stays scoped', async () => {
		await write('c\n');
		const final = diff('a\n', 'c\n', '@@ -1 +1 @@\n-a\n+c\n');
		await capture(final, [
			{ turnId: 'host-turn', diff: diff('a\n', 'b\n', '@@ -1 +1 @@\n-a\n+b\n') },
			{ turnId: 'steering-turn', diff: final },
		]);
		assert.deepStrictEqual(await snapshots('native-turn'), [...await snapshots(), ...await snapshots('steering-turn')]);
	});

	test('a steering checkpoint starts after the earlier child edit on the shared path', async () => {
		const first = diff('original\n', 'parent\n', '@@ -1 +1 @@\n-original\n+parent\n');
		const child = diff('parent\n', 'child\n', '@@ -1 +1 @@\n-parent\n+child\n');
		const last = diff('original\n', 'last\n', '@@ -1 +1 @@\n-original\n+last\n');
		await write('last\n');
		await storeCodexTurnDiffs([
			{
				notification: { threadId: 'parent', turnId: 'parent-native', diff: last }, initialDiffs: [first], snapshots: [
					{ turnId: 'host-turn', diff: first, startSequence: 1, sequence: 2, fileSequences: fileSequences(['edit.txt'], 2) },
					{ turnId: 'steering-turn', diff: last, startSequence: 4, sequence: 5, fileSequences: fileSequences(['edit.txt'], 2, 5) },
				]
			},
			{ notification: { threadId: 'child', turnId: 'child-native', diff: child }, initialDiffs: [child], snapshots: [{ turnId: 'host-turn', diff: child, startSequence: 3, sequence: 3, fileSequences: fileSequences(['edit.txt'], 3) }] },
		], { relatedDiffs: [], cwd, nativeCwd: cwd, database, fileService, logService });
		assert.deepStrictEqual([await snapshots(), await snapshots('steering-turn')], [
			[{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'original\n', after: 'child\n' }],
			[{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'child\n', after: 'last\n' }],
		]);
	});

	test('a child touching a path before its parent supplies the earliest original', async () => {
		const child = diff('original\n', 'child\n', '@@ -1 +1 @@\n-original\n+child\n');
		const parent = diff('child\n', 'last\n', '@@ -1 +1 @@\n-child\n+last\n');
		await write('last\n');
		await storeCodexTurnDiffs([
			{ notification: { threadId: 'parent', turnId: 'parent-native', diff: parent }, initialDiffs: [parent], snapshots: [{ turnId: 'host-turn', diff: parent, startSequence: 1, sequence: 4, fileSequences: fileSequences(['edit.txt'], 4) }] },
			{ notification: { threadId: 'child', turnId: 'child-native', diff: child }, initialDiffs: [child], snapshots: [{ turnId: 'host-turn', diff: child, startSequence: 2, sequence: 3, fileSequences: fileSequences(['edit.txt'], 3) }] },
		], { relatedDiffs: [], cwd, nativeCwd: cwd, database, fileService, logService });
		assert.deepStrictEqual(await snapshots(), [{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'original\n', after: 'last\n' }]);
	});

	test('an unchanged parent path in a later host segment cannot overwrite its child edit', async () => {
		const first = diff('original\n', 'parent\n', '@@ -1 +1 @@\n-original\n+parent\n');
		const child = diff('parent\n', 'child\n', '@@ -1 +1 @@\n-parent\n+child\n');
		await write('child\n');
		await storeCodexTurnDiffs([
			{
				notification: { threadId: 'parent', turnId: 'parent-native', diff: first }, initialDiffs: [first], snapshots: [
					{ turnId: 'host-turn', diff: first, startSequence: 1, sequence: 2, fileSequences: fileSequences(['edit.txt'], 2) },
					{ turnId: 'steering-turn', diff: first, startSequence: 4, sequence: 7, fileSequences: fileSequences(['edit.txt'], 2) },
				]
			},
			{ notification: { threadId: 'child', turnId: 'child-native', diff: child }, initialDiffs: [child], snapshots: [{ turnId: 'steering-turn', diff: child, startSequence: 5, sequence: 6, fileSequences: fileSequences(['edit.txt'], 6) }] },
		], { relatedDiffs: [], cwd, nativeCwd: cwd, database, fileService, logService });
		assert.deepStrictEqual([await snapshots(), await snapshots('steering-turn')], [
			[{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'original\n', after: 'parent\n' }],
			[{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'parent\n', after: 'child\n' }],
		]);
	});

	for (const [name, parentAfter, parentSequence, expected] of [
		['child writes last', 'parent\n', 2, [{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'original\n', after: 'child\n' }]],
		['parent writes last', 'last\n', 5, [{ path: expectedPath('edit.txt'), kind: FileEditKind.Edit, before: 'original\n', after: 'last\n' }]],
		['parent reverts the shared file', 'original\n', 5, []],
	] as const) {
		test(`shared parent and child paths retain the original when the ${name}`, async () => {
			const first = diff('original\n', 'parent\n', '@@ -1 +1 @@\n-original\n+parent\n');
			const child = diff('parent\n', 'child\n', '@@ -1 +1 @@\n-parent\n+child\n');
			const parent = parentAfter === 'original\n' ? '' : diff('original\n', parentAfter, `@@ -1 +1 @@\n-original\n+${parentAfter}`);
			await write(parentSequence > 4 ? parentAfter : 'child\n');
			await storeCodexTurnDiffs([
				{ notification: { threadId: 'parent', turnId: 'parent-native', diff: parent }, initialDiffs: [first], snapshots: [{ turnId: 'host-turn', diff: parent, startSequence: 1, sequence: parentSequence, fileSequences: fileSequences(['edit.txt'], 2, parentSequence) }] },
				{ notification: { threadId: 'child', turnId: 'child-native', diff: child }, initialDiffs: [child], snapshots: [{ turnId: 'host-turn', diff: child, startSequence: 3, sequence: 4, fileSequences: fileSequences(['edit.txt'], 4) }] },
			], { relatedDiffs: [], cwd, nativeCwd: cwd, database, fileService, logService });
			assert.deepStrictEqual(await snapshots(), expected);
		});
	}
});

suite('Codex turn diff readiness', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('all steering segments wait for persistence after native completion', async () => {
		const stored = new DeferredPromise<void>();
		const tracker = disposables.add(new CodexTurnDiffTracker(() => stored.p));
		tracker.start('thread', 'native', 'first');
		tracker.split('native', 'second');
		const observed: string[] = [];
		const waits = ['first', 'second'].map(async id => { await tracker.waitForTurnEdits(id); observed.push(id); });
		const completion = tracker.complete('native');
		await Promise.resolve();
		assert.deepStrictEqual(observed, []);
		stored.complete();
		await Promise.all([...waits, completion]);
		assert.deepStrictEqual(observed, ['first', 'second']);
	});

	test('persistence failure rejects existing and future checkpoint reads', async () => {
		const tracker = disposables.add(new CodexTurnDiffTracker(async () => { throw new Error('store failed'); }));
		tracker.start('thread', 'native', 'host');
		const waiting = assert.rejects(tracker.waitForTurnEdits('host'), /store failed/);
		await assert.rejects(tracker.complete('native'), /store failed/);
		await waiting;
		await assert.rejects(tracker.waitForTurnEdits('host'), /store failed/);
	});

	test('a parent checkpoint waits for children that start after its read begins', async () => {
		const stored: Array<{ turnId: string; host: string[] }> = [];
		const tracker = disposables.add(new CodexTurnDiffTracker(async captures => {
			stored.push(...captures.map(capture => ({ turnId: capture.notification.turnId, host: capture.snapshots.map(snapshot => snapshot.turnId) })));
		}));
		tracker.start('parent-thread', 'parent-native', 'original-host');
		let ready = false;
		const waiting = tracker.waitForTurnEdits('original-host').then(() => { ready = true; });
		tracker.start('child-thread', 'child-native', 'original-host');
		const parentComplete = tracker.complete('parent-native');
		tracker.start('parent-thread', 'replacement-native', 'replacement-host');
		await Promise.resolve();
		assert.strictEqual(ready, false);
		await tracker.complete('child-native');
		await parentComplete;
		await waiting;
		assert.deepStrictEqual(stored.sort((a, b) => b.turnId.localeCompare(a.turnId)), [
			{ turnId: 'parent-native', host: ['original-host'] },
			{ turnId: 'child-native', host: ['original-host'] },
		]);
	});

	test('disposing a runtime cancels pending checkpoint reads', async () => {
		const tracker = disposables.add(new CodexTurnDiffTracker(async () => { }));
		tracker.start('thread', 'native', 'host');
		const waiting = assert.rejects(tracker.waitForTurnEdits('host'), /Canceled/);
		tracker.dispose();
		await waiting;
	});

	for (const receivesDiff of [false, true]) {
		test(`disconnect completes a child without runtime turn identity (${receivesDiff ? 'with diff' : 'before start'})`, async () => {
			const stored: string[] = [];
			const tracker = disposables.add(new CodexTurnDiffTracker(async captures => { stored.push(...captures.map(capture => capture.notification.turnId)); }));
			tracker.start('parent-thread', 'parent-native', 'host');
			tracker.trackChild('child-thread', 'host');
			if (receivesDiff) {
				tracker.update({ threadId: 'child-thread', turnId: 'child-native', diff: '' });
			}
			const parent = tracker.complete('parent-native');
			await tracker.completeThread('child-thread');
			await parent;
			tracker.start('parent-thread', 'replacement-native', 'replacement-host');
			await tracker.complete('replacement-native');
			assert.deepStrictEqual(stored.sort(), receivesDiff ? ['child-native', 'parent-native', 'replacement-native'] : ['parent-native', 'replacement-native']);
		});
	}

	test('a timed-out child fails its checkpoint and releases later persistence', async () => {
		const stored: string[] = [];
		const tracker = disposables.add(new CodexTurnDiffTracker(async captures => { stored.push(...captures.map(capture => capture.notification.turnId)); }));
		tracker.start('parent', 'cancelled-native', 'cancelled-host');
		tracker.trackChild('child', 'cancelled-host');
		const cancelled = assert.rejects(tracker.complete('cancelled-native'), /timed out/);
		const waiting = assert.rejects(tracker.waitForTurnEdits('cancelled-host'), /timed out/);
		tracker.start('parent', 'replacement-native', 'replacement-host');
		const replacement = tracker.complete('replacement-native');
		tracker.failWaitingTurn('cancelled-host', new Error('timed out'));
		await Promise.all([cancelled, waiting, replacement]);
		await assert.rejects(tracker.waitForTurnEdits('cancelled-host'), /timed out/);
		assert.deepStrictEqual(stored, ['replacement-native']);
	});
});
