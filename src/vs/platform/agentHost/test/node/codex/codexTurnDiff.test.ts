/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { join } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { CodexTurnDiff } from '../../../node/codex/codexTurnDiff.js';

suite('Codex turn diff tracking', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const cwd = URI.file(isWindows ? 'c:\\workspace' : '/workspace');
	const expectedPath = (name: string) => URI.joinPath(cwd, name).path;
	const logService = new NullLogService();
	let fileService: FileService;
	let latest: Map<string, string | undefined>;

	setup(async () => {
		fileService = disposables.add(new FileService(logService));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		if (isWindows) {
			// FileService assumes drive roots exist; seed this one using provider-native POSIX paths.
			await provider.mkdir(URI.from({ scheme: 'inmemory', path: '/c:' }));
		}
		disposables.add(fileService.registerProvider('file', provider));
		latest = new Map();
	});

	function diff(before: string | undefined, after: string | undefined, hunks: string, beforePath = 'edit.txt', afterPath = beforePath): string {
		const hash = (content: string | undefined) => content === undefined ? '0'.repeat(40)
			: createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
		return `diff --git a/${beforePath} b/${afterPath}\n`
			+ (before === undefined ? 'new file mode 100644\n' : after === undefined ? 'deleted file mode 100644\n' : '')
			+ `index ${hash(before)}..${hash(after)}\n`
			+ (hunks ? `--- ${before === undefined ? '/dev/null' : `a/${beforePath}`}\n+++ ${after === undefined ? '/dev/null' : `b/${afterPath}`}\n${hunks}` : '');
	}

	async function write(content: string, path = 'edit.txt'): Promise<void> {
		await fileService.writeFile(URI.file(join(cwd.fsPath, path)), VSBuffer.fromString(content));
	}

	function track(turnId = 'native-turn'): CodexTurnDiff {
		return new CodexTurnDiff(turnId, latest, fileService, logService);
	}

	async function update(turn: CodexTurnDiff, patch: string) {
		return (await turn.update(patch, cwd)).map(({ path, before, after }) => ({ path: URI.file(path).path, before, after }));
	}

	test('reconstructs unchanged text outside multiple hunks', async () => {
		const before = 'prefix0\nkeep1\nold2\nkeep3\nkeep4\nkeep5\nkeep6\nkeep7\nkeep8\nold9\nsuffix10\n';
		const after = before.replace('old2', 'new2').replace('old9', 'new9');
		await write(after);
		assert.deepStrictEqual(await update(track(), diff(before, after, '@@ -2,3 +2,3 @@\n keep1\n-old2\n+new2\n keep3\n@@ -9,3 +9,3 @@\n keep8\n-old9\n+new9\n suffix10\n')),
			[{ path: expectedPath('edit.txt'), before, after }]);
	});

	test('preserves CRLF, a byte order mark, and a missing final newline', async () => {
		const before = '\uFEFFone\r\nold\r\nend';
		const after = '\uFEFFone\r\nnew\r\nend';
		await write(after, 'space name.txt');
		assert.deepStrictEqual(await update(track(), diff(before, after, '@@ -1,3 +1,3 @@\n \uFEFFone\r\n-old\r\n+new\r\n end\n\\ No newline at end of file\n', 'space name.txt')),
			[{ path: expectedPath('space name.txt'), before, after }]);
	});

	test('preserves differing missing-newline markers on both sides', async () => {
		await write('new');
		assert.deepStrictEqual(await update(track(), diff('old', 'new', '@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n')),
			[{ path: expectedPath('edit.txt'), before: 'old', after: 'new' }]);
	});

	test('retains deleted contents without reading the missing file', async () => {
		assert.deepStrictEqual(await update(track(), diff('deleted\n', undefined, '@@ -1 +0,0 @@\n-deleted\n')),
			[{ path: expectedPath('edit.txt'), before: 'deleted\n', after: undefined }]);
	});

	test('retains created contents without inventing a before side', async () => {
		assert.deepStrictEqual(await update(track(), diff(undefined, 'created\n', '@@ -0,0 +1 @@\n+created\n')),
			[{ path: expectedPath('edit.txt'), before: undefined, after: 'created\n' }]);
	});

	test('records a move by its two physical paths', async () => {
		await write('pear\n', 'destination.txt');
		assert.deepStrictEqual(await update(track(), diff('apple\n', 'pear\n', '@@ -1 +1 @@\n-apple\n+pear\n', 'source.txt', 'destination.txt')), [
			{ path: expectedPath('source.txt'), before: 'apple\n', after: undefined },
			{ path: expectedPath('destination.txt'), before: undefined, after: 'pear\n' },
		]);
	});

	test('does not include edits made outside the reported patch', async () => {
		await write('after\nunrelated user edit\n');
		assert.deepStrictEqual(await update(track(), diff('before\n', 'after\n', '@@ -1 +1 @@\n-before\n+after\n')), []);
	});

	test('does not fabricate before contents from invalid hunks', async () => {
		await write('after\n');
		assert.deepStrictEqual(await update(track(), diff('actual before\n', 'after\n', '@@ -1 +1 @@\n-invented before\n+after\n')), []);
	});

	test('supports empty-file creates and deletes without hunk headers', async () => {
		assert.deepStrictEqual(await update(track(), diff(undefined, '', '', 'created.txt') + diff('', undefined, '', 'deleted.txt')), [
			{ path: expectedPath('created.txt'), before: undefined, after: '' },
			{ path: expectedPath('deleted.txt'), before: '', after: undefined },
		]);
	});

	test('handles a large unchanged suffix without exceeding the argument limit', async () => {
		const suffix = 'unchanged\n'.repeat(150_000);
		await write('after\n' + suffix);
		assert.deepStrictEqual((await update(track(), diff('before\n' + suffix, 'after\n' + suffix, '@@ -1 +1 @@\n-before\n+after\n'))).map(({ before, after }) => ({ before, after })),
			[{ before: 'before\n' + suffix, after: 'after\n' + suffix }]);
	});

	test('reports only what changed since the previous cumulative update', async () => {
		const turn = track();
		await write('b\n');
		assert.deepStrictEqual([
			await update(turn, diff('a\n', 'b\n', '@@ -1 +1 @@\n-a\n+b\n')),
			await update(turn, diff('a\n', 'c\n', '@@ -1 +1 @@\n-a\n+c\n')),
		], [
			[{ path: expectedPath('edit.txt'), before: 'a\n', after: 'b\n' }],
			[{ path: expectedPath('edit.txt'), before: 'b\n', after: 'c\n' }],
		]);
	});

	test('a cumulative diff that drops a path reports its revert to the baseline', async () => {
		const turn = track();
		await write('b\n');
		assert.deepStrictEqual([
			await update(turn, diff('a\n', 'b\n', '@@ -1 +1 @@\n-a\n+b\n')),
			await update(turn, ''),
		], [
			[{ path: expectedPath('edit.txt'), before: 'a\n', after: 'b\n' }],
			[{ path: expectedPath('edit.txt'), before: 'b\n', after: 'a\n' }],
		]);
	});

	test('reports transient creates and deletes when a later update reverts them', async () => {
		const turn = track();
		assert.deepStrictEqual([
			await update(turn, diff(undefined, 'created\n', '@@ -0,0 +1 @@\n+created\n', 'created.txt') + diff('restored\n', undefined, '@@ -1 +0,0 @@\n-restored\n', 'deleted.txt')),
			await update(turn, ''),
		], [
			[
				{ path: expectedPath('created.txt'), before: undefined, after: 'created\n' },
				{ path: expectedPath('deleted.txt'), before: 'restored\n', after: undefined },
			],
			[
				{ path: expectedPath('created.txt'), before: 'created\n', after: undefined },
				{ path: expectedPath('deleted.txt'), before: undefined, after: 'restored\n' },
			],
		]);
	});

	test('a section that cannot be verified yet is reported by the next cumulative update', async () => {
		const turn = track();
		await write('changed by someone else\n');
		const first = await update(turn, diff('a\n', 'b\n', '@@ -1 +1 @@\n-a\n+b\n'));
		await write('c\n');
		assert.deepStrictEqual([first, await update(turn, diff('a\n', 'c\n', '@@ -1 +1 @@\n-a\n+c\n'))], [
			[],
			[{ path: expectedPath('edit.txt'), before: 'a\n', after: 'c\n' }],
		]);
	});

	test('a later parent change starts where a child left the shared path', async () => {
		const parent = track('parent-native');
		const child = track('child-native');
		await write('parent\n');
		const first = await update(parent, diff('original\n', 'parent\n', '@@ -1 +1 @@\n-original\n+parent\n'));
		await write('child\n');
		assert.deepStrictEqual([first, await update(child, diff('parent\n', 'child\n', '@@ -1 +1 @@\n-parent\n+child\n')), await update(parent, diff('original\n', 'last\n', '@@ -1 +1 @@\n-original\n+last\n'))], [
			[{ path: expectedPath('edit.txt'), before: 'original\n', after: 'parent\n' }],
			[{ path: expectedPath('edit.txt'), before: 'parent\n', after: 'child\n' }],
			[{ path: expectedPath('edit.txt'), before: 'child\n', after: 'last\n' }],
		]);
	});

	test('a child touching a path before its parent supplies the earliest original', async () => {
		await write('child\n');
		const child = await update(track('child-native'), diff('original\n', 'child\n', '@@ -1 +1 @@\n-original\n+child\n'));
		await write('last\n');
		assert.deepStrictEqual([child, await update(track('parent-native'), diff('child\n', 'last\n', '@@ -1 +1 @@\n-child\n+last\n'))], [
			[{ path: expectedPath('edit.txt'), before: 'original\n', after: 'child\n' }],
			[{ path: expectedPath('edit.txt'), before: 'child\n', after: 'last\n' }],
		]);
	});

	test('a parent that writes a shared path back to its own last contents records that rewrite', async () => {
		const parent = track('parent-native');
		const patch = diff('original\n', 'parent\n', '@@ -1 +1 @@\n-original\n+parent\n');
		await write('parent\n');
		await update(parent, patch);
		await write('child\n');
		await update(track('child-native'), diff('parent\n', 'child\n', '@@ -1 +1 @@\n-parent\n+child\n'));
		await write('parent\n');
		assert.deepStrictEqual(await update(parent, patch), [{ path: expectedPath('edit.txt'), before: 'child\n', after: 'parent\n' }]);
	});

	for (const [name, parentLast, expected] of [
		['re-reports its unchanged diff', diff('original\n', 'parent\n', '@@ -1 +1 @@\n-original\n+parent\n'), []],
		['writes last', diff('original\n', 'last\n', '@@ -1 +1 @@\n-original\n+last\n'), [{ path: expectedPath('edit.txt'), before: 'child\n', after: 'last\n' }]],
		['reverts the shared file', '', [{ path: expectedPath('edit.txt'), before: 'child\n', after: 'original\n' }]],
	] as const) {
		test(`a child edit on a shared path stays intact when the parent ${name}`, async () => {
			const parent = track('parent-native');
			await write('parent\n');
			await update(parent, diff('original\n', 'parent\n', '@@ -1 +1 @@\n-original\n+parent\n'));
			await write('child\n');
			await update(track('child-native'), diff('parent\n', 'child\n', '@@ -1 +1 @@\n-parent\n+child\n'));
			assert.deepStrictEqual(await update(parent, parentLast), expected);
		});
	}
});
