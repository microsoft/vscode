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

/**
 * TODO: @legomushroom
 */
interface IBase {
	resource: URI;
	name: string;
	isFile: boolean;
	isDirectory: boolean;
	isSymbolicLink: boolean;
}

/**
 * TODO: @legomushroom
 */
interface IExpectedFile extends IBase {
	contents: string;
}

/**
 * TODO: @legomushroom
 */
interface IExpectedFolder extends IBase {
	children: (IExpectedFolder | IExpectedFile)[];
}

/**
 * Validates that file at {@link filePath} has expected attributes.
 */
const validateFile = async (
	filePath: string,
	expectedFile: IExpectedFile,
	fileService: IFileService,
) => {
	const readFile = await fileService.resolve(URI.file(filePath));

	assert.strictEqual(
		readFile.name,
		expectedFile.name,
		`File '${filePath}' must have correct 'name'.`,
	);

	assert.deepStrictEqual(
		readFile.resource,
		expectedFile.resource,
		'File must have correct `URI`.',
	);

	assert.strictEqual(
		readFile.isFile,
		expectedFile.isFile,
		'File must have correct `isFile` value.',
	);

	assert.strictEqual(
		readFile.isDirectory,
		expectedFile.isDirectory,
		'File must have correct `isDirectory` value.',
	);

	assert.strictEqual(
		readFile.isSymbolicLink,
		expectedFile.isSymbolicLink,
		'File must have correct `isSymbolicLink` value.',
	);

	assert.strictEqual(
		readFile.children,
		undefined,
		'File must not have children.',
	);

	// TODO: @legomushroom - add folder/file path to all asserts
	const fileContents = await fileService.readFile(readFile.resource);
	assert.strictEqual(
		fileContents.value.toString(),
		expectedFile.contents,
		`File '${expectedFile.resource.fsPath}' must have correct contents.`,
	);
};

/**
 * Validates that folder at {@link folderPath} has expected attributes.
 */
const validateFolder = async (
	folderPath: string,
	expectedFolder: IExpectedFolder,
	fileService: IFileService,
) => {
	const readFolder = await fileService.resolve(URI.file(folderPath));

	assert.strictEqual(
		readFolder.name,
		expectedFolder.name,
		'Folder must have correct `name`.',
	);

	assert.deepStrictEqual(
		readFolder.resource,
		expectedFolder.resource,
		'Folder must have correct `URI`.',
	);

	assert.strictEqual(
		readFolder.isFile,
		expectedFolder.isFile,
		'Folder must have correct `isFile` value.',
	);

	assert.strictEqual(
		readFolder.isDirectory,
		expectedFolder.isDirectory,
		'Folder must have correct `isDirectory` value.',
	);

	assert.strictEqual(
		readFolder.isSymbolicLink,
		expectedFolder.isSymbolicLink,
		'Folder must have correct `isSymbolicLink` value.',
	);


	assertDefined(
		readFolder.children,
		'Folder must have children.',
	);

	assert.strictEqual(
		readFolder.children.length,
		expectedFolder.children.length,
		'Folder must have correct number of children.',
	);
};

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

		await validateFolder(
			'/root/folder',
			{
				resource: URI.file('/root/folder'),
				name: 'folder',
				isFile: false,
				isDirectory: true,
				isSymbolicLink: false,
				children: [
					// TODO: @legomushroom - add real children
					{} as any,
					{} as any,
				],
			},
			fileService,
		);

		const rootFolder = await fileService.resolve(URI.file('/root/folder'));

		assertDefined(
			rootFolder.children,
			'Root folder must have children.',
		);

		const file = rootFolder.children[0];

		await validateFile(
			'/root/folder/file.txt',
			{
				resource: URI.file('/root/folder/file.txt'),
				name: 'file.txt',
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				contents: 'contents',
			},
			fileService,
		);

		await validateFile(
			file.resource.fsPath,
			{
				resource: URI.file('/root/folder/file.txt'),
				name: 'file.txt',
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				contents: 'contents',
			},
			fileService,
		);

		const subfolder = await fileService.resolve(URI.file('/root/folder/Subfolder'));

		await validateFolder(
			'/root/folder/Subfolder',
			{
				resource: URI.file('/root/folder/Subfolder'),
				name: 'Subfolder',
				isFile: false,
				isDirectory: true,
				isSymbolicLink: false,
				children: [
					// TODO: @legomushroom - add real children
					{} as any,
					{} as any,
					{} as any,
				],
			},
			fileService,
		);

		assertDefined(
			subfolder.children,
			'Subfolder must have children.',
		);

		await validateFile(
			'/root/folder/Subfolder/test.ts',
			{
				resource: URI.file('/root/folder/Subfolder/test.ts'),
				name: 'test.ts',
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				contents: 'other contents',
			},
			fileService,
		);
		await validateFile(
			subfolder.children[0].resource.fsPath,
			{
				resource: URI.file('/root/folder/Subfolder/test.ts'),
				name: 'test.ts',
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				contents: 'other contents',
			},
			fileService,
		);

		await validateFile(
			'/root/folder/Subfolder/file.test.ts',
			{
				resource: URI.file('/root/folder/Subfolder/file.test.ts'),
				name: 'file.test.ts',
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				contents: 'hello test',
			},
			fileService,
		);
		await validateFile(
			subfolder.children[1].resource.fsPath,
			{
				resource: URI.file('/root/folder/Subfolder/file.test.ts'),
				name: 'file.test.ts',
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				contents: 'hello test',
			},
			fileService,
		);

		await validateFile(
			'/root/folder/Subfolder/.file-2.TEST.ts',
			{
				resource: URI.file('/root/folder/Subfolder/.file-2.TEST.ts'),
				name: '.file-2.TEST.ts',
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				contents: 'test hello',
			},
			fileService,
		);
		await validateFile(
			subfolder.children[2].resource.fsPath,
			{
				resource: URI.file('/root/folder/Subfolder/.file-2.TEST.ts'),
				name: '.file-2.TEST.ts',
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				contents: 'test hello',
			},
			fileService,
		);
	});
});
