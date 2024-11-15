/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { PromptFileReference } from '../../browser/promptFileReference.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';

/**
 * Represents a file system node.
 */
interface IFilesystemNode {
	name: string;
}

/**
 * Represents a file node.
 */
interface IFile extends IFilesystemNode {
	contents: string;
}

/**
 * Represents a folder node.
 */
interface IFolder extends IFilesystemNode {
	children: (IFolder | IFile)[];
}

/**
 * Create the provided filesystem folder structure.
 */
const createFolder = async (
	fileService: IFileService,
	folder: IFolder,
	parentFolder?: URI,
): Promise<void> => {
	const folderUri = parentFolder
		? URI.joinPath(parentFolder, folder.name)
		: URI.file(folder.name);

	if (await fileService.exists(folderUri)) {
		await fileService.del(folderUri);
	}
	await fileService.createFolder(folderUri);

	for (const child of folder.children) {
		const childUri = URI.joinPath(folderUri, child.name);
		// create child file
		if ('contents' in child) {
			await fileService.writeFile(childUri, VSBuffer.fromString(child.contents));
			continue;
		}

		// recursively create child filesystem structure
		await createFolder(fileService, child, childUri);
	}
};

// TODO: @legomushroom - unit test the absolute paths

suite('ChatbotPromptReference', function () {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves nested file references', async function () {
		// set up mocked filesystem
		const fileService = testDisposables.add(new FileService(new NullLogService()));
		const fileSystemProvider = testDisposables.add(new InMemoryFileSystemProvider());
		testDisposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		const filesStructure: IFolder = {
			name: 'resolves-nested-file-references',
			children: [
				{
					name: 'file1.txt',
					contents: '## Some Header\nsome contents\n ',
				},
				{
					name: 'file2.txt',
					contents: '## Files\n\t- this file #file:folder1/file3.txt',
					// contents: '## Files\n\t- this file #file:folder1/file3.txt \n\t- also this #file:./folder1/folder2/file3.txt please!\n ',
				},
				// {
				// 	name: 'folder1',
				// 	children: [
				// 		{
				// 			name: 'file3.txt',
				// 			contents: 'file3.txt contents',
				// 		},
				// 		{
				// 			name: 'folder2',
				// 			children: [
				// 				{
				// 					name: 'file4.txt',
				// 					contents: 'file4.txt contents',
				// 				},
				// 			],
				// 		},
				// 	],
				// },
			],
		};

		const rootFolder = URI.file(`/${filesStructure.name}`);

		// create the files structure on the disk
		await createFolder(
			fileService,
			filesStructure,
		);

		const expectedReferences = [
			testDisposables.add(new PromptFileReference(
				URI.joinPath(rootFolder, './file2.txt'),
				fileService,
			)),
			testDisposables.add(new PromptFileReference(
				URI.joinPath(rootFolder, './folder1/file3.txt'),
				fileService,
			)),
		];

		const rootReference = testDisposables.add(new PromptFileReference(
			URI.file(`/${filesStructure.name}/file2.txt`),
			fileService,
		));

		const resolvedReferences = (await rootReference.resolve(true))
			.flatten();

		for (let i = 0; i < expectedReferences.length; i++) {
			const expectedReference = expectedReferences[i];
			const resolvedReference = resolvedReferences[i];

			assert(
				resolvedReference.equals(expectedReference),
				[
					`Expected ${i}th resolved reference to be ${expectedReference}`,
					`got ${resolvedReference}.`,
				].join(', ')
			);
		}

		assert.strictEqual(
			resolvedReferences.length,
			expectedReferences.length,
			[
				`Expected to resolve ${expectedReferences.length} references`,
				`got ${resolvedReferences.length}.`,
			].join(', ')
		);
	});
});
