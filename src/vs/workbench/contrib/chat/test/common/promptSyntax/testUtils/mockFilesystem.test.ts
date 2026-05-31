/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mockFiles, MockFilesystem } from './mockFilesystem.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IFileService, IFileStat } from '../../../../../../../platform/files/common/files.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

/**
 * Base attribute for an expected filesystem node (a file or a folder).
 */
interface IExpectedFilesystemNode extends Pick<
	IFileStat,
	'resource' | 'name' | 'isFile' | 'isDirectory' | 'isSymbolicLink'
> { }

/**
 * Represents an expected `file` info.
 */
interface IExpectedFile extends IExpectedFilesystemNode {
	/**
	 * Expected file contents.
	 */
	contents: string;
}

/**
 * Represents an expected `folder` info.
 */
interface IExpectedFolder extends IExpectedFilesystemNode {
	/**
	 * Expected folder children.
	 */
	children: (IExpectedFolder | IExpectedFile)[];
}

/**
 * Validates that file at {@link filePath} has expected attributes.
 */
async function validateFile(
	filePath: string,
	expectedFile: IExpectedFile,
	fileService: IFileService,
) {
	let readFile: IFileStat | undefined;
	try {
		readFile = await fileService.resolve(URI.file(filePath));
	} catch (error) {
		throw new Error(`Failed to read file '${filePath}': ${error}.`);
	}

	assert.strictEqual(
		readFile.name,
		expectedFile.name,
		`File '${filePath}' must have correct 'name'.`,
	);

	assert.deepStrictEqual(
		readFile.resource,
		expectedFile.resource,
		`File '${filePath}' must have correct 'URI'.`,
	);

	assert.strictEqual(
		readFile.isFile,
		expectedFile.isFile,
		`File '${filePath}' must have correct 'isFile' value.`,
	);

	assert.strictEqual(
		readFile.isDirectory,
		expectedFile.isDirectory,
		`File '${filePath}' must have correct 'isDirectory' value.`,
	);

	assert.strictEqual(
		readFile.isSymbolicLink,
		expectedFile.isSymbolicLink,
		`File '${filePath}' must have correct 'isSymbolicLink' value.`,
	);

	assert.strictEqual(
		readFile.children,
		undefined,
		`File '${filePath}' must not have children.`,
	);

	const fileContents = await fileService.readFile(readFile.resource);
	assert.strictEqual(
		fileContents.value.toString(),
		expectedFile.contents,
		`File '${expectedFile.resource.fsPath}' must have correct contents.`,
	);
}

/**
 * Validates that folder at {@link folderPath} has expected attributes.
 */
async function validateFolder(
	folderPath: string,
	expectedFolder: IExpectedFolder,
	fileService: IFileService,
): Promise<void> {
	let readFolder: IFileStat | undefined;
	try {
		readFolder = await fileService.resolve(URI.file(folderPath));
	} catch (error) {
		throw new Error(`Failed to read folder '${folderPath}': ${error}.`);
	}

	assert.strictEqual(
		readFolder.name,
		expectedFolder.name,
		`Folder '${folderPath}' must have correct 'name'.`,
	);

	assert.deepStrictEqual(
		readFolder.resource,
		expectedFolder.resource,
		`Folder '${folderPath}' must have correct 'URI'.`,
	);

	assert.strictEqual(
		readFolder.isFile,
		expectedFolder.isFile,
		`Folder '${folderPath}' must have correct 'isFile' value.`,
	);

	assert.strictEqual(
		readFolder.isDirectory,
		expectedFolder.isDirectory,
		`Folder '${folderPath}' must have correct 'isDirectory' value.`,
	);

	assert.strictEqual(
		readFolder.isSymbolicLink,
		expectedFolder.isSymbolicLink,
		`Folder '${folderPath}' must have correct 'isSymbolicLink' value.`,
	);

	assertDefined(
		readFolder.children,
		`Folder '${folderPath}' must have children.`,
	);

	assert.strictEqual(
		readFolder.children.length,
		expectedFolder.children.length,
		`Folder '${folderPath}' must have correct number of children.`,
	);

	for (const expectedChild of expectedFolder.children) {
		const childPath = URI.joinPath(expectedFolder.resource, expectedChild.name).fsPath;

		if ('children' in expectedChild) {
			await validateFolder(
				childPath,
				expectedChild,
				fileService,
			);

			continue;
		}

		await validateFile(
			childPath,
			expectedChild,
			fileService,
		);
	}
}

suite('MockFilesystem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let fileService: IFileService;
	setup(async () => {
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());

		fileService = disposables.add(instantiationService.createInstance(FileService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		instantiationService.stub(IFileService, fileService);
	});

	test('mocks file structure using new simplified format', async () => {
		const mockFilesystem = instantiationService.createInstance(MockFilesystem, [
			{
				path: '/root/folder/file.txt',
				contents: ['contents']
			},
			{
				path: '/root/folder/Subfolder/test.ts',
				contents: ['other contents']
			},
			{
				path: '/root/folder/Subfolder/file.test.ts',
				contents: ['hello test']
			},
			{
				path: '/root/folder/Subfolder/.file-2.TEST.ts',
				contents: ['test hello']
			}
		]);

		await mockFilesystem.mock();

		/**
		 * Validate files and folders next.
		 */

		await validateFolder(
			'/root/folder',
			{
				resource: URI.file('/root/folder'),
				name: 'folder',
				isFile: false,
				isDirectory: true,
				isSymbolicLink: false,
				children: [
					{
						resource: URI.file('/root/folder/file.txt'),
						name: 'file.txt',
						isFile: true,
						isDirectory: false,
						isSymbolicLink: false,
						contents: 'contents',
					},
					{
						resource: URI.file('/root/folder/Subfolder'),
						name: 'Subfolder',
						isFile: false,
						isDirectory: true,
						isSymbolicLink: false,
						children: [
							{
								resource: URI.file('/root/folder/Subfolder/test.ts'),
								name: 'test.ts',
								isFile: true,
								isDirectory: false,
								isSymbolicLink: false,
								contents: 'other contents',
							},
							{
								resource: URI.file('/root/folder/Subfolder/file.test.ts'),
								name: 'file.test.ts',
								isFile: true,
								isDirectory: false,
								isSymbolicLink: false,
								contents: 'hello test',
							},
							{
								resource: URI.file('/root/folder/Subfolder/.file-2.TEST.ts'),
								name: '.file-2.TEST.ts',
								isFile: true,
								isDirectory: false,
								isSymbolicLink: false,
								contents: 'test hello',
							},
						],
					}
				],
			},
			fileService,
		);
	});

	test('can be created using static factory method', async () => {
		await mockFiles(fileService, [
			{
				path: '/simple/test.txt',
				contents: ['line 1', 'line 2', 'line 3']
			}
		]);

		await validateFile(
			'/simple/test.txt',
			{
				resource: URI.file('/simple/test.txt'),
				name: 'test.txt',
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				contents: 'line 1\nline 2\nline 3',
			},
			fileService,
		);
	});
});
