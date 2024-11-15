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
		await createFolder(fileService, child, folderUri);
	}
};

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
					contents: '## Files\n\t- this file #file:folder1/file3.txt \n\t- also this #file:./folder1/some-other-folder/file4.txt please!\n ',
				},
				{
					name: 'folder1',
					children: [
						{
							name: 'file3.txt',
							contents: '\n\n\t- some seemingly random #file:/resolves-nested-file-references/folder1/some-other-folder/yetAnotherFolder🤭/another-file.md contents\n some more\t content',
						},
						{
							name: 'some-other-folder',
							children: [
								{
									name: 'file4.txt',
									contents: 'file4.txt contents',
								},
								{
									name: 'yetAnotherFolder🤭',
									children: [
										{
											name: 'another-file.md',
											contents: 'another-file.md contents',
										},
										{
											name: 'one_more_file_just_in_case.md',
											contents: 'one_more_file_just_in_case.md contents',
										},
									],
								},
							],
						},
					],
				},
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
			testDisposables.add(new PromptFileReference(
				URI.joinPath(rootFolder, './folder1/some-other-folder/yetAnotherFolder🤭/another-file.md'),
				fileService,
			)),
			testDisposables.add(new PromptFileReference(
				URI.joinPath(rootFolder, './folder1/some-other-folder/file4.txt'),
				fileService,
			)),
		];

		// start for the root file reference
		const rootReference = testDisposables.add(new PromptFileReference(
			URI.file(`/${filesStructure.name}/file2.txt`),
			fileService,
		));

		// resolve the root file reference including all nested references
		const resolvedReferences = (await rootReference.resolve(true))
			.flatten();

		assert.strictEqual(
			resolvedReferences.length,
			expectedReferences.length,
			[
				`Expected to resolve ${expectedReferences.length} references`,
				`got ${resolvedReferences.length}.`,
			].join(', ')
		);

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
	});
});
