/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { SimpleFileDialog } from '../../browser/simpleFileDialog.js';

suite('SimpleFileDialog', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let fileService: FileService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
	});

	test('creates nested missing folders from a folder-only open dialog', async () => {
		const root = URI.from({ scheme: Schemas.inMemory, path: '/root' });
		const existingFolder = joinPath(root, 'folderA');
		const nestedFolder = joinPath(existingFolder, 'newFolder1', 'newFolder2');

		await fileService.createFolder(existingFolder);

		let promptedUri: URI | undefined;
		const dialog = Object.assign(Object.create(SimpleFileDialog.prototype), {
			fileService,
			filePickBox: { validationMessage: undefined },
			requiresTrailing: false,
			allowFolderSelection: true,
			allowFileSelection: false,
			isWindows: false,
			yesNoPrompt: async (uri: URI) => {
				promptedUri = uri;
				return true;
			}
		});

		assert.strictEqual(await dialog.validate(nestedFolder), true);
		assert.strictEqual(promptedUri?.toString(), nestedFolder.toString());
		assert.strictEqual(await fileService.exists(nestedFolder), true);
	});
});
