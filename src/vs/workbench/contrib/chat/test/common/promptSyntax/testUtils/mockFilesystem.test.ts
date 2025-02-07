/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MockFilesystem } from './mockFilesystem.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('MockFilesystem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let initService: TestInstantiationService;
	let fileService: IFileService;
	setup(async () => {
		initService = disposables.add(new TestInstantiationService());
		initService.stub(ILogService, new NullLogService());

		fileService = disposables.add(initService.createInstance(FileService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		initService.stub(IFileService, fileService);
	});

	test('mocks file structure', async () => {
		const mockFilesystem = initService.createInstance(MockFilesystem, [
			{
				name: '/root/folder',
				children: [
					{
						name: 'file.txt',
						contents: 'contents',
					},
					{
						name: 'Subfolder',
						children: [
							{
								name: 'test.ts',
								contents: 'other contents',
							},
							{
								name: 'file.test.ts',
								contents: 'hello test',
							},
							{
								name: '.file-2.TEST.ts',
								contents: 'test hello',
							},
						]
					}
				]
			}
		]);

		await mockFilesystem.mock();

		/**
		 * Validate files and folders next.
		 */

		const rootFolder = await fileService.resolve(URI.file('/root/folder'));

		assertDefined(
			rootFolder.children,
			'Root folder must have children.',
		);

		assert.strictEqual(
			rootFolder.name,
			'folder',
			'Root folder must have correct name.',
		);
		assert.strictEqual(
			rootFolder.children.length,
			2,
			'Root folder must have correct number of children.',
		);

		assert.deepStrictEqual(
			rootFolder.resource,
			URI.file('/root/folder'),
			'Root folder must have correct URI.',
		);

		const file = rootFolder.children[0];

		assert.strictEqual(
			file.children,
			undefined,
			'file.txt must not have children.',
		);

		assert.strictEqual(
			file.name,
			'file.txt',
			'File must have the correct name.',
		);

		assert(
			file.isFile,
			'File must be a file.',
		);

		assert(
			!file.isDirectory,
			'File must not be a directory.',
		);

		assert(
			!file.isSymbolicLink,
			'File must not be a symbolic link.',
		);

		assert.deepStrictEqual(
			file.resource,
			URI.file('/root/folder/file.txt'),
			'File must have correct URI.',
		);

		const fileContents = await fileService.readFile(file.resource);

		assert.strictEqual(
			fileContents.value.toString(),
			'contents',
			'File must have correct contents.',
		);

		const subfolder = await fileService.resolve(URI.file('/root/folder/Subfolder'));

		assertDefined(
			subfolder.children,
			'Subfolder must have children.',
		);

		assert.strictEqual(
			subfolder.name,
			'Subfolder',
			'Subfolder must have correct name.',
		);

		assert(
			file.isFile,
			'Subfolder must be a file.',
		);

		assert(
			!file.isDirectory,
			'Subfolder must not be a directory.',
		);

		assert(
			!file.isSymbolicLink,
			'Subfolder must not be a symbolic link.',
		);

		assert.strictEqual(
			subfolder.children.length,
			3,
			'Subfolder folder must have correct number of children.',
		);

		assert.deepStrictEqual(
			subfolder.resource,
			URI.file('/root/folder/Subfolder'),
			'Subfolder folder must have correct URI.',
		);

		assert.strictEqual(
			subfolder.children[0].name,
			'test.ts',
			'Subfolder child1 must have the correct name.',
		);

		assert.strictEqual(
			subfolder.children[1].name,
			'file.test.ts',
			'Subfolder child2 must have the correct name.',
		);

		assert.strictEqual(
			subfolder.children[2].name,
			'.file-2.TEST.ts',
			'Subfolder child3 must have the correct name.',
		);

		const file1 = await fileService.readFile(URI.file('/root/folder/Subfolder/test.ts'));
		assert.strictEqual(
			file1.value.toString(),
			'other contents',
			'File1 must have correct contents.',
		);

		const file2 = await fileService.readFile(URI.file('/root/folder/Subfolder/file.test.ts'));
		assert.strictEqual(
			file2.value.toString(),
			'hello test',
			'File2 must have correct contents.',
		);

		const file3 = await fileService.readFile(URI.file('/root/folder/Subfolder/.file-2.TEST.ts'));
		assert.strictEqual(
			file3.value.toString(),
			'test hello',
			'File3 must have correct contents.',
		);
	});
});
