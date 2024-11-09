/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ChatbotPromptReference } from '../../browser/chatVariables.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileReference } from '../../../../common/codecs/chatbotPromptCodec/tokens/fileReference.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Word } from '../../../../common/codecs/simpleCodec/tokens/word.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';

interface IFsNode {
	name: string;
}

interface IFile extends IFsNode {
	contents: string;
}

interface IFolder extends IFsNode {
	children: (IFolder | IFile)[];
}

// create provided folder structure with all its nested children
const createFolder = async (
	fileService: IFileService,
	folder: IFolder,
	rootFolder?: URI,
): Promise<void> => {
	const folderUri = rootFolder
		? URI.joinPath(rootFolder, folder.name)
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

		// create child folder
		await createFolder(fileService, child, childUri);
	}
};

suite('ChatbotPromptReference', function () {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	// let instantiationService: TestInstantiationService;

	// setup(function () {
	// 	instantiationService = testDisposables.add(new TestInstantiationService());
	// });

	// testDisposables.add(new RunOnDispose(() => {
	// 	const fileService = new FileService(new NullLogService());

	// 	fileService.del(rootFolder);
	// }));

	test('resolves nested file references', async function () {
		// const fileService = testDisposables.add(new TestFileService());
		// Set up filesystem
		const fileService = testDisposables.add(new FileService(new NullLogService()));
		const fileSystemProvider = testDisposables.add(new InMemoryFileSystemProvider());
		fileService.registerProvider(Schemas.file, fileSystemProvider);

		const filesStructure: IFolder = {
			name: 'test-name', // TODO: @legomushroom - generate a random name?
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

		// create the files structure on the disk
		await createFolder(
			fileService,
			filesStructure,
		);

		// const expectedTree = [
		// 	new ChatbotPromptReference(
		// 		new FileReference(
		// 			new Range(2, 15, 2, 15 + 23),
		// 			'#file:folder1/file3.txt',
		// 			URI.joinPath(rootFolder, 'test-name/folder1/file3.txt'),
		// 		),
		// 		fileService,
		// 	)),
		// ];

		const reference = new ChatbotPromptReference(
			FileReference.fromWord(new Word(
				new Range(2, 15, 2, 15 + 23),
				`#file:${filesStructure.name}/file2.txt`,
			)),
			fileService,
		);

		const resolved = await reference.resolve();
		console.log('resolved', resolved);
	});
});
