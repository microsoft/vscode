/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { FileEditKind } from '../../../common/state/sessionState.js';
import { storeCodexTurnDiff } from '../../../node/codex/codexTurnDiff.js';
import { SessionDatabase } from '../../../node/sessionDatabase.js';

suite('Codex turn diff snapshots', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const cwd = URI.file('/workspace');
	let database: SessionDatabase;
	let fileService: FileService;
	const logService = new NullLogService();

	setup(async () => {
		database = disposables.add(await SessionDatabase.open(':memory:'));
		fileService = disposables.add(new FileService(logService));
		const provider = disposables.add(new InMemoryFileSystemProvider());
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

	async function capture(patch: string): Promise<void> {
		await storeCodexTurnDiff({ threadId: 'thread', turnId: 'native-turn', diff: patch }, {
			turnId: 'host-turn', cwd, database, fileService, logService,
		});
	}

	async function write(content: string, path = 'edit.txt'): Promise<void> {
		await fileService.writeFile(URI.file(join(cwd.fsPath, path)), VSBuffer.fromString(content));
	}

	async function snapshots() {
		const records = await database.getFileEditsByTurn('host-turn');
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
		assert.deepStrictEqual(await snapshots(), [{ path: '/workspace/edit.txt', kind: FileEditKind.Edit, before, after }]);
	});

	test('preserves CRLF, a byte order mark, and a missing final newline', async () => {
		const before = '\uFEFFone\r\nold\r\nend';
		const after = '\uFEFFone\r\nnew\r\nend';
		await write(after, 'space name.txt');
		await capture(diff(before, after, '@@ -1,3 +1,3 @@\n \uFEFFone\r\n-old\r\n+new\r\n end\n\\ No newline at end of file\n', 'space name.txt'));
		assert.deepStrictEqual(await snapshots(), [{ path: '/workspace/space name.txt', kind: FileEditKind.Edit, before, after }]);
	});

	test('preserves differing missing-newline markers on both sides', async () => {
		await write('new');
		await capture(diff('old', 'new', '@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n'));
		assert.deepStrictEqual(await snapshots(), [{ path: '/workspace/edit.txt', kind: FileEditKind.Edit, before: 'old', after: 'new' }]);
	});

	test('retains deleted contents without reading the missing file', async () => {
		await capture(diff('deleted\n', undefined, '@@ -1 +0,0 @@\n-deleted\n'));
		assert.deepStrictEqual(await snapshots(), [{ path: '/workspace/edit.txt', kind: FileEditKind.Delete, before: 'deleted\n', after: undefined }]);
	});

	test('retains created contents without inventing a before side', async () => {
		await write('created\n');
		await capture(diff(undefined, 'created\n', '@@ -0,0 +1 @@\n+created\n'));
		assert.deepStrictEqual(await snapshots(), [{ path: '/workspace/edit.txt', kind: FileEditKind.Create, before: undefined, after: 'created\n' }]);
	});

	test('records a move by its two physical paths', async () => {
		await write('pear\n', 'destination.txt');
		await capture(diff('apple\n', 'pear\n', '@@ -1 +1 @@\n-apple\n+pear\n', 'source.txt', 'destination.txt'));
		assert.deepStrictEqual(await snapshots(), [
			{ path: '/workspace/source.txt', kind: FileEditKind.Delete, before: 'apple\n', after: undefined },
			{ path: '/workspace/destination.txt', kind: FileEditKind.Create, before: undefined, after: 'pear\n' },
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
			{ path: '/workspace/created.txt', kind: FileEditKind.Create, before: undefined, after: '' },
			{ path: '/workspace/deleted.txt', kind: FileEditKind.Delete, before: '', after: undefined },
		]);
	});

	test('handles a large unchanged suffix without exceeding the argument limit', async () => {
		const suffix = 'unchanged\n'.repeat(150_000);
		await write('after\n' + suffix);
		await capture(diff('before\n' + suffix, 'after\n' + suffix, '@@ -1 +1 @@\n-before\n+after\n'));
		const result = await snapshots();
		assert.deepStrictEqual(result.map(({ before, after }) => ({ before, after })), [{ before: 'before\n' + suffix, after: 'after\n' + suffix }]);
	});
});
