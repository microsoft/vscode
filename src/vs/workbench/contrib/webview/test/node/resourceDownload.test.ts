/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises } from 'fs';
import { tmpdir } from 'os';
import sinon from 'sinon';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../../base/test/node/testUtils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../../../platform/files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { saveWebviewResource } from '../../common/resourceDownload.js';

suite('Webview Resource Downloads - Disk', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let testDirectory: URI;
	let fileService: FileService;
	let uriIdentityService: UriIdentityService;
	let realFile: URI;
	let linkedFile: URI;
	let content: VSBuffer;

	setup(async () => {
		testDirectory = URI.file(getRandomTestPath(tmpdir(), 'vsctests', 'webview-download'));
		const realDirectory = joinPath(testDirectory, 'real');
		const linkedDirectory = joinPath(testDirectory, 'link');
		await promises.mkdir(realDirectory.fsPath, { recursive: true });
		await promises.symlink(realDirectory.fsPath, linkedDirectory.fsPath, 'junction');
		realFile = joinPath(realDirectory, 'video.mp4');
		linkedFile = joinPath(linkedDirectory, 'video.mp4');
		content = VSBuffer.alloc(2 * 1024 * 1024);
		content.buffer.fill(0x5a);
		await promises.writeFile(realFile.fsPath, content.buffer);

		const logService = store.add(new NullLogService());
		fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.file, store.add(new DiskFileSystemProvider(logService))));
		uriIdentityService = store.add(new UriIdentityService(fileService));
	});

	teardown(async () => {
		sinon.restore();
		await promises.rm(testDirectory.fsPath, { recursive: true, force: true });
	});

	for (const symlinkSource of [true, false]) {
		test(`preserves the original file when the ${symlinkSource ? 'source' : 'destination'} uses a directory symlink`, async () => {
			const source = (symlinkSource ? linkedFile : realFile).with({ query: 'version=1' });
			const target = symlinkSource ? realFile : linkedFile;
			const read = sinon.spy(fileService, 'readFileStream');
			const write = sinon.spy(fileService, 'writeFile');

			await saveWebviewResource(() => source, target, fileService, uriIdentityService);

			assert.deepStrictEqual({
				reads: read.callCount,
				writes: write.callCount,
				bytesUnchanged: (await promises.readFile(realFile.fsPath)).equals(content.buffer),
			}, { reads: 0, writes: 0, bytesUnchanged: true });
		});
	}

	test('saves to a nonexistent local destination', async () => {
		const target = joinPath(testDirectory, 'saved.mp4');

		await saveWebviewResource(() => linkedFile, target, fileService, uriIdentityService);

		assert.deepStrictEqual({
			sourceUnchanged: (await promises.readFile(realFile.fsPath)).equals(content.buffer),
			downloadMatches: (await promises.readFile(target.fsPath)).equals(content.buffer),
		}, { sourceUnchanged: true, downloadMatches: true });
	});
});
