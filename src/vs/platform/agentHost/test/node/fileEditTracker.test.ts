/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ToolResultContentType } from '../../common/state/sessionState.js';
import { SessionDataService } from '../../node/sessionDataService.js';
import { FileEditTracker } from '../../node/copilot/fileEditTracker.js';

suite('FileEditTracker', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let sessionDataService: ISessionDataService;
	let tracker: FileEditTracker;

	const basePath = URI.from({ scheme: Schemas.inMemory, path: '/userData' });

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		sessionDataService = new SessionDataService(basePath, fileService, new NullLogService());
		tracker = new FileEditTracker('test-session', sessionDataService, fileService, new NullLogService());
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks edit start and complete for existing file', async () => {
		const sourceFs = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, sourceFs));
		await fileService.writeFile(URI.file('/workspace/test.txt'), VSBuffer.fromString('original content\nline 2'));

		await tracker.trackEditStart('/workspace/test.txt');
		await fileService.writeFile(URI.file('/workspace/test.txt'), VSBuffer.fromString('modified content\nline 2\nline 3'));
		await tracker.completeEdit('/workspace/test.txt');

		const fileEdit = tracker.takeCompletedEdit('/workspace/test.txt');
		assert.ok(fileEdit);
		assert.strictEqual(fileEdit.type, ToolResultContentType.FileEdit);
		// Both URIs point to snapshots in the session data directory
		const sessionDir = sessionDataService.getSessionDataDirById('test-session');
		assert.ok(fileEdit.beforeURI.startsWith(sessionDir.toString()));
		assert.ok(fileEdit.afterURI.startsWith(sessionDir.toString()));
	});

	test('tracks edit for newly created file (no before content)', async () => {
		const sourceFs = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, sourceFs));

		await tracker.trackEditStart('/workspace/new-file.txt');
		await fileService.writeFile(URI.file('/workspace/new-file.txt'), VSBuffer.fromString('new file\ncontent'));
		await tracker.completeEdit('/workspace/new-file.txt');

		const fileEdit = tracker.takeCompletedEdit('/workspace/new-file.txt');
		assert.ok(fileEdit);
		const sessionDir = sessionDataService.getSessionDataDirById('test-session');
		assert.ok(fileEdit.afterURI.startsWith(sessionDir.toString()));
	});

	test('takeCompletedEdit returns undefined for unknown file path', () => {
		const result = tracker.takeCompletedEdit('/nonexistent');
		assert.strictEqual(result, undefined);
	});

	test('before and after snapshot content can be read back', async () => {
		const sourceFs = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, sourceFs));
		await fileService.writeFile(URI.file('/workspace/file.ts'), VSBuffer.fromString('original'));

		await tracker.trackEditStart('/workspace/file.ts');
		await fileService.writeFile(URI.file('/workspace/file.ts'), VSBuffer.fromString('modified'));
		await tracker.completeEdit('/workspace/file.ts');

		const fileEdit = tracker.takeCompletedEdit('/workspace/file.ts');
		assert.ok(fileEdit);
		const beforeContent = await fileService.readFile(URI.parse(fileEdit.beforeURI));
		assert.strictEqual(beforeContent.value.toString(), 'original');
		const afterContent = await fileService.readFile(URI.parse(fileEdit.afterURI));
		assert.strictEqual(afterContent.value.toString(), 'modified');
	});
});
