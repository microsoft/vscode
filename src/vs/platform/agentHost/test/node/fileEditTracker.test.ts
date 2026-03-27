/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync } from 'fs';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { ToolResultContentType } from '../../common/state/sessionState.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { FileEditTracker, buildSessionDbUri, parseSessionDbUri } from '../../node/copilot/fileEditTracker.js';
import { join } from '../../../../base/common/path.js';

suite('FileEditTracker', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let db: SessionDatabase;
	let tracker: FileEditTracker;
	let testDir: string;

	setup(async () => {
		testDir = join(tmpdir(), `vscode-edit-tracker-test-${randomUUID()}`);
		mkdirSync(testDir, { recursive: true });

		fileService = disposables.add(new FileService(new NullLogService()));
		const sourceFs = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider('file', sourceFs));

		db = disposables.add(await SessionDatabase.open(join(testDir, 'session.db')));
		await db.createTurn('turn-1');

		tracker = new FileEditTracker('copilot:/test-session', db, fileService, new NullLogService());
	});

	teardown(async () => {
		disposables.clear();
		await db.close();
		rmSync(testDir, { recursive: true, force: true });
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks edit start and complete for existing file', async () => {
		await fileService.writeFile(URI.file('/workspace/test.txt'), VSBuffer.fromString('original content\nline 2'));

		await tracker.trackEditStart('/workspace/test.txt');
		await fileService.writeFile(URI.file('/workspace/test.txt'), VSBuffer.fromString('modified content\nline 2\nline 3'));
		await tracker.completeEdit('/workspace/test.txt');

		const fileEdit = await tracker.takeCompletedEdit('turn-1', 'tc-1', '/workspace/test.txt');
		assert.ok(fileEdit);
		assert.strictEqual(fileEdit.type, ToolResultContentType.FileEdit);

		// URIs are parseable session-db: URIs
		const beforeFields = parseSessionDbUri(fileEdit.beforeURI);
		assert.ok(beforeFields);
		assert.strictEqual(beforeFields.sessionUri, 'copilot:/test-session');
		assert.strictEqual(beforeFields.toolCallId, 'tc-1');
		assert.strictEqual(beforeFields.filePath, '/workspace/test.txt');
		assert.strictEqual(beforeFields.part, 'before');

		const afterFields = parseSessionDbUri(fileEdit.afterURI);
		assert.ok(afterFields);
		assert.strictEqual(afterFields.part, 'after');

		// Content is persisted in the database (wait for fire-and-forget write)
		await new Promise(r => setTimeout(r, 50));

		const content = await db.readFileEditContent('tc-1', '/workspace/test.txt');
		assert.ok(content);
		assert.strictEqual(new TextDecoder().decode(content.beforeContent), 'original content\nline 2');
		assert.strictEqual(new TextDecoder().decode(content.afterContent), 'modified content\nline 2\nline 3');
	});

	test('tracks edit for newly created file (no before content)', async () => {
		await tracker.trackEditStart('/workspace/new-file.txt');
		await fileService.writeFile(URI.file('/workspace/new-file.txt'), VSBuffer.fromString('new file\ncontent'));
		await tracker.completeEdit('/workspace/new-file.txt');

		const fileEdit = await tracker.takeCompletedEdit('turn-1', 'tc-2', '/workspace/new-file.txt');
		assert.ok(fileEdit);

		// Wait for the fire-and-forget DB write to complete
		await new Promise(r => setTimeout(r, 50));

		const content = await db.readFileEditContent('tc-2', '/workspace/new-file.txt');
		assert.ok(content);
		assert.strictEqual(new TextDecoder().decode(content.beforeContent), '');
		assert.strictEqual(new TextDecoder().decode(content.afterContent), 'new file\ncontent');
	});

	test('takeCompletedEdit returns undefined for unknown file path', async () => {
		const result = await tracker.takeCompletedEdit('turn-1', 'tc-x', '/nonexistent');
		assert.strictEqual(result, undefined);
	});

	test('before and after content can be read from database', async () => {
		await fileService.writeFile(URI.file('/workspace/file.ts'), VSBuffer.fromString('original'));

		await tracker.trackEditStart('/workspace/file.ts');
		await fileService.writeFile(URI.file('/workspace/file.ts'), VSBuffer.fromString('modified'));
		await tracker.completeEdit('/workspace/file.ts');

		await tracker.takeCompletedEdit('turn-1', 'tc-3', '/workspace/file.ts');

		// Wait for the fire-and-forget DB write to complete
		await new Promise(r => setTimeout(r, 50));

		const content = await db.readFileEditContent('tc-3', '/workspace/file.ts');
		assert.ok(content);
		assert.strictEqual(new TextDecoder().decode(content.beforeContent), 'original');
		assert.strictEqual(new TextDecoder().decode(content.afterContent), 'modified');
	});
});

suite('buildSessionDbUri / parseSessionDbUri', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips a simple URI', () => {
		const uri = buildSessionDbUri('copilot:/abc-123', 'tc-1', '/workspace/file.ts', 'before');
		const parsed = parseSessionDbUri(uri);
		assert.ok(parsed);
		assert.deepStrictEqual(parsed, {
			sessionUri: 'copilot:/abc-123',
			toolCallId: 'tc-1',
			filePath: '/workspace/file.ts',
			part: 'before',
		});
	});

	test('round-trips with special characters in filePath', () => {
		const uri = buildSessionDbUri('copilot:/s1', 'tc-2', '/work space/file (1).ts', 'after');
		const parsed = parseSessionDbUri(uri);
		assert.ok(parsed);
		assert.strictEqual(parsed.filePath, '/work space/file (1).ts');
		assert.strictEqual(parsed.part, 'after');
	});

	test('round-trips with special characters in toolCallId', () => {
		const uri = buildSessionDbUri('copilot:/s1', 'call_abc=123&x', '/file.ts', 'before');
		const parsed = parseSessionDbUri(uri);
		assert.ok(parsed);
		assert.strictEqual(parsed.toolCallId, 'call_abc=123&x');
	});

	test('parseSessionDbUri returns undefined for non-session-db URIs', () => {
		assert.strictEqual(parseSessionDbUri('file:///foo/bar'), undefined);
		assert.strictEqual(parseSessionDbUri('https://example.com'), undefined);
	});

	test('parseSessionDbUri returns undefined for malformed session-db URIs', () => {
		assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1'), undefined);
		assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1?toolCallId=tc-1'), undefined);
		assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1?toolCallId=tc-1&filePath=/f&part=middle'), undefined);
	});
});
