/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises } from 'fs';
import { tmpdir } from 'os';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { newWriteableBufferStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../../base/test/node/testUtils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { FileSystemProviderCapabilities } from '../../../../../platform/files/common/files.js';
import { DiskFileSystemProvider } from '../../../../../platform/files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { saveWebviewResource } from '../../common/resourceDownload.js';

suite('Webview Resource Downloads - Disk', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let testDirectory: URI;
	let fileService: FileService;
	let logService: NullLogService;
	let onWrite: (() => void) | undefined;
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

		onWrite = undefined;
		logService = store.add(new NullLogService());
		fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.file, store.add(new class extends DiskFileSystemProvider {
			override get capabilities(): FileSystemProviderCapabilities {
				return super.capabilities & ~FileSystemProviderCapabilities.FileReadWrite;
			}

			override async write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
				const written = await super.write(fd, pos, data, offset, length);
				onWrite?.();
				return written;
			}
		}(logService))));
	});

	teardown(async () => {
		sinon.restore();
		await promises.rm(testDirectory.fsPath, { recursive: true, force: true });
	});

	async function save(source: URI, target: URI, token = CancellationToken.None): Promise<void> {
		await saveWebviewResource(async readToken => (await fileService.readFileStream(source, undefined, readToken)).value, target, fileService, logService, token);
	}

	for (const symlinkSource of [true, false]) {
		test(`preserves the original file when the ${symlinkSource ? 'source' : 'destination'} uses a directory symlink`, async () => {
			const source = (symlinkSource ? linkedFile : realFile).with({ query: 'version=1' });
			const target = symlinkSource ? realFile : linkedFile;
			await save(source, target);

			assert.deepStrictEqual({
				bytesUnchanged: (await promises.readFile(realFile.fsPath)).equals(content.buffer),
				files: (await promises.readdir(testDirectory.fsPath)).sort(),
			}, { bytesUnchanged: true, files: ['link', 'real'] });
		});
	}

	test('saves to a nonexistent local destination', async () => {
		const target = joinPath(testDirectory, 'saved.mp4');

		await save(linkedFile, target);

		assert.deepStrictEqual({
			sourceUnchanged: (await promises.readFile(realFile.fsPath)).equals(content.buffer),
			downloadMatches: (await promises.readFile(target.fsPath)).equals(content.buffer),
		}, { sourceUnchanged: true, downloadMatches: true });
	});

	for (const existing of [false, true]) {
		test(`cleans up an interrupted stream without changing ${existing ? 'an existing' : 'a new'} destination`, async () => {
			const target = joinPath(testDirectory, 'saved.mp4');
			if (existing) {
				await promises.writeFile(target.fsPath, 'previous contents');
			}
			const firstWrite = new DeferredPromise<void>();
			onWrite = () => { void firstWrite.complete(); };
			const stream = newWriteableBufferStream();
			store.add(toDisposable(() => stream.destroy()));
			const saving = saveWebviewResource(async () => stream, target, fileService, logService, CancellationToken.None);
			const rejected = assert.rejects(saving, /read interrupted/);
			for (let i = 0; i < 5; i++) {
				stream.write(content.slice(i * 65536, (i + 1) * 65536));
			}
			await firstWrite.p;
			stream.error(new Error('read interrupted'));
			stream.end();
			await rejected;

			assert.deepStrictEqual({
				files: (await promises.readdir(testDirectory.fsPath)).sort(),
				destination: existing ? await promises.readFile(target.fsPath, 'utf8') : undefined,
				sourceUnchanged: (await promises.readFile(realFile.fsPath)).equals(content.buffer),
			}, {
				files: existing ? ['link', 'real', 'saved.mp4'] : ['link', 'real'],
				destination: existing ? 'previous contents' : undefined,
				sourceUnchanged: true,
			});
		});
	}

	test('cancelling while streaming leaves the destination unchanged and removes the temporary file', async () => {
		const target = joinPath(testDirectory, 'saved.mp4');
		await promises.writeFile(target.fsPath, 'previous contents');
		const cts = store.add(new CancellationTokenSource());
		onWrite = () => cts.cancel();

		await assert.rejects(save(realFile, target, cts.token), CancellationError);

		assert.deepStrictEqual({
			files: (await promises.readdir(testDirectory.fsPath)).sort(),
			destination: await promises.readFile(target.fsPath, 'utf8'),
			sourceUnchanged: (await promises.readFile(realFile.fsPath)).equals(content.buffer),
		}, { files: ['link', 'real', 'saved.mp4'], destination: 'previous contents', sourceUnchanged: true });
	});

	test('a failed replacement preserves the previous destination and removes the temporary file', async () => {
		const target = joinPath(testDirectory, 'saved.mp4');
		await promises.writeFile(target.fsPath, 'previous contents');
		sinon.stub(fileService, 'move').rejects(new Error('rename failed'));

		await assert.rejects(save(realFile, target), /rename failed/);

		assert.deepStrictEqual({
			files: (await promises.readdir(testDirectory.fsPath)).sort(),
			destination: await promises.readFile(target.fsPath, 'utf8'),
		}, { files: ['link', 'real', 'saved.mp4'], destination: 'previous contents' });
	});
});
