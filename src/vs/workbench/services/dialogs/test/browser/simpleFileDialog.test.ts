/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { SimpleFileDialog } from '../../browser/simpleFileDialog.js';

suite('SimpleFileDialog', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;
	let provider: InMemoryFileSystemProvider;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, provider));
	});

	function createFolderOnlyDialog(fileService: IFileService, options: { isWindows?: boolean } = {}) {
		let promptedUri: URI | undefined;
		const dialog = Object.assign(Object.create(SimpleFileDialog.prototype), {
			fileService,
			filePickBox: { validationMessage: undefined },
			requiresTrailing: false,
			allowFolderSelection: true,
			allowFileSelection: false,
			isWindows: options.isWindows ?? false,
			yesNoPrompt: async (uri: URI) => {
				promptedUri = uri;
				return true;
			}
		});

		return { dialog, get promptedUri() { return promptedUri; } };
	}

	test('creates nested missing folders from a folder-only open dialog', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const existingFolder = joinPath(root, 'folderA');
		const nestedFolder = joinPath(existingFolder, 'newFolder1', 'newFolder2');

		await fileService.createFolder(existingFolder);

		const result = createFolderOnlyDialog(fileService);

		assert.strictEqual(await result.dialog.validate(nestedFolder), true);
		assert.strictEqual(result.promptedUri?.toString(), nestedFolder.toString());
		assert.strictEqual(await fileService.exists(nestedFolder), true);
	});

	test('does not create a missing folder below a readonly parent', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const existingFolder = joinPath(root, 'folderA');
		const nestedFolder = joinPath(existingFolder, 'newFolder');

		await fileService.createFolder(existingFolder);
		provider.setReadOnly(true);

		const result = createFolderOnlyDialog(fileService);

		assert.strictEqual(await result.dialog.validate(nestedFolder), false);
		assert.strictEqual(result.promptedUri, undefined);
		assert.strictEqual(await fileService.exists(nestedFolder), false);
	});

	test('does not create a missing folder below a file', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const existingFile = joinPath(root, 'file.txt');
		const nestedFolder = joinPath(existingFile, 'newFolder');

		await fileService.createFile(existingFile, VSBuffer.fromString('contents'));

		const result = createFolderOnlyDialog(fileService);

		assert.strictEqual(await result.dialog.validate(nestedFolder), false);
		assert.strictEqual(result.promptedUri, undefined);
		assert.strictEqual(await fileService.exists(nestedFolder), false);
	});

	test('does not create a missing folder with an invalid path segment', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const existingFolder = joinPath(root, 'folderA');
		const nestedFolder = joinPath(existingFolder, 'bad:name', 'newFolder');

		await fileService.createFolder(existingFolder);

		const result = createFolderOnlyDialog(fileService, { isWindows: true });

		assert.strictEqual(await result.dialog.validate(nestedFolder), false);
		assert.strictEqual(result.promptedUri, undefined);
		assert.strictEqual(await fileService.exists(nestedFolder), false);
	});

	test('does not create a missing folder when parent lookup fails for reasons other than missing files', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const existingFolder = joinPath(root, 'folderA');
		const protectedFolder = joinPath(existingFolder, 'protected');
		const nestedFolder = joinPath(protectedFolder, 'newFolder');

		await fileService.createFolder(existingFolder);

		const guardedFileService = {
			...fileService,
			stat: async (resource: URI) => {
				if (resource.toString() === protectedFolder.toString()) {
					throw createFileSystemProviderError('No permissions', FileSystemProviderErrorCode.NoPermissions);
				}
				return fileService.stat(resource);
			},
			createFolder: (resource: URI) => fileService.createFolder(resource)
		} as IFileService;

		const result = createFolderOnlyDialog(guardedFileService);

		assert.strictEqual(await result.dialog.validate(nestedFolder), false);
		assert.strictEqual(result.promptedUri, undefined);
		assert.strictEqual(await fileService.exists(nestedFolder), false);
	});
});
