/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IMockFolder, MockFilesystem } from './testUtils/mockFilesystem.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IPromptReference } from '../../../common/promptSyntax/parsers/types.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { NullPolicyService } from '../../../../../../platform/policy/common/policy.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { TErrorCondition } from '../../../common/promptSyntax/parsers/basePromptParser.js';
import { FileReference } from '../../../common/promptSyntax/codecs/tokens/fileReference.js';
import { FilePromptParser } from '../../../common/promptSyntax/parsers/filePromptParser.js';
import { waitRandom, randomBoolean } from '../../../../../../base/test/common/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ConfigurationService } from '../../../../../../platform/configuration/common/configurationService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NotPromptFile, RecursiveReference, OpenFailed, FolderReference } from '../../../common/promptFileReferenceErrors.js';

/**
 * Represents a file reference with an expected
 * error condition value for testing purposes.
 */
class ExpectedReference {
	/**
	 * URI component of the expected reference.
	 */
	public readonly uri: URI;

	constructor(
		dirname: URI,
		public readonly lineToken: FileReference,
		public readonly errorCondition?: TErrorCondition,
	) {
		this.uri = extUri.resolvePath(dirname, lineToken.path);
	}

	/**
	 * String representation of the expected reference.
	 */
	public toString(): string {
		return `file-prompt:${this.uri.path}`;
	}
}

/**
 * A reusable test utility to test the `PromptFileReference` class.
 */
class TestPromptFileReference extends Disposable {
	constructor(
		private readonly fileStructure: IMockFolder[],
		private readonly rootFileUri: URI,
		private readonly expectedReferences: ExpectedReference[],
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService private readonly initService: IInstantiationService,
	) {
		super();

		// create in-memory file system
		const fileSystemProvider = this._register(new InMemoryFileSystemProvider());
		this._register(this.fileService.registerProvider(Schemas.file, fileSystemProvider));
	}

	/**
	 * Run the test.
	 */
	public async run() {
		// create the files structure on the disk
		await (this.initService.createInstance(MockFilesystem, this.fileStructure)).mock();

		// randomly test with and without delay to ensure that the file
		// reference resolution is not susceptible to race conditions
		if (randomBoolean()) {
			await waitRandom(5);
		}

		// start resolving references for the specified root file
		const rootReference = this._register(
			this.initService.createInstance(
				FilePromptParser,
				this.rootFileUri,
				[],
			),
		).start();

		// wait until entire prompts tree is resolved
		await rootReference.allSettled();

		// resolve the root file reference including all nested references
		const resolvedReferences: readonly (IPromptReference | undefined)[] = rootReference.allReferences;

		for (let i = 0; i < this.expectedReferences.length; i++) {
			const expectedReference = this.expectedReferences[i];
			const resolvedReference = resolvedReferences[i];

			assert(
				(resolvedReference) &&
				(resolvedReference.uri.toString() === expectedReference.uri.toString()),
				[
					`Expected ${i}th resolved reference URI to be '${expectedReference.uri}'`,
					`got '${resolvedReference?.uri}'.`,
				].join(', '),
			);

			if (expectedReference.errorCondition === undefined) {
				assert(
					resolvedReference.errorCondition === undefined,
					[
						`Expected ${i}th error condition to be 'undefined'`,
						`got '${resolvedReference.errorCondition}'.`,
					].join(', '),
				);
				continue;
			}

			assert(
				expectedReference.errorCondition.equal(resolvedReference.errorCondition),
				[
					`Expected ${i}th error condition to be '${expectedReference.errorCondition}'`,
					`got '${resolvedReference.errorCondition}'.`,
				].join(', '),
			);
		}

		assert.strictEqual(
			resolvedReferences.length,
			this.expectedReferences.length,
			[
				`\nExpected(${this.expectedReferences.length}): [\n ${this.expectedReferences.join('\n ')}\n]`,
				`Received(${resolvedReferences.length}): [\n ${resolvedReferences.join('\n ')}\n]`,
			].join('\n')
		);
	}
}

/**
 * Create expected file reference for testing purposes.
 *
 * Note! This utility also use for `markdown links` at the moment.
 *
 * @param filePath The expected path of the file reference (without the `#file:` prefix).
 * @param lineNumber The expected line number of the file reference.
 * @param startColumnNumber The expected start column number of the file reference.
 */
const createTestFileReference = (
	filePath: string,
	lineNumber: number,
	startColumnNumber: number,
): FileReference => {
	const range = new Range(
		lineNumber,
		startColumnNumber,
		lineNumber,
		startColumnNumber + `#file:${filePath}`.length,
	);

	return new FileReference(range, filePath);
};

suite('PromptFileReference (Unix)', function () {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	setup(async () => {
		const nullPolicyService = new NullPolicyService();
		const nullLogService = testDisposables.add(new NullLogService());
		const nullFileService = testDisposables.add(new FileService(nullLogService));
		const nullConfigService = testDisposables.add(new ConfigurationService(
			URI.file('/config.json'),
			nullFileService,
			nullPolicyService,
			nullLogService,
		));
		instantiationService = testDisposables.add(new TestInstantiationService());

		instantiationService.stub(IFileService, nullFileService);
		instantiationService.stub(ILogService, nullLogService);
		instantiationService.stub(IConfigurationService, nullConfigService);
	});

	test('• resolves nested file references', async function () {
		if (isWindows) {
			this.skip();
		}

		const rootFolderName = 'resolves-nested-file-references';
		const rootFolder = `/${rootFolderName}`;
		const rootUri = URI.file(rootFolder);

		const test = testDisposables.add(instantiationService.createInstance(TestPromptFileReference,
			/**
			 * The file structure to be created on the disk for the test.
			 */
			[{
				name: rootFolderName,
				children: [
					{
						name: 'file1.prompt.md',
						contents: '## Some Header\nsome contents\n ',
					},
					{
						name: 'file2.prompt.md',
						contents: '## Files\n\t- this file #file:folder1/file3.prompt.md \n\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!\n ',
					},
					{
						name: 'folder1',
						children: [
							{
								name: 'file3.prompt.md',
								contents: `\n[](./some-other-folder/non-existing-folder)\n\t- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md contents\n some more\t content`,
							},
							{
								name: 'some-other-folder',
								children: [
									{
										name: 'file4.prompt.md',
										contents: 'this file has a non-existing #file:./some-non-existing/file.prompt.md\t\treference\n\n\nand some\n non-prompt #file:./some-non-prompt-file.md\t\t \t[](../../folder1/)\t',
									},
									{
										name: 'file.txt',
										contents: 'contents of a non-prompt-snippet file',
									},
									{
										name: 'yetAnotherFolder🤭',
										children: [
											{
												name: 'another-file.prompt.md',
												contents: `[](${rootFolder}/folder1/some-other-folder)\nanother-file.prompt.md contents\t [#file:file.txt](../file.txt)`,
											},
											{
												name: 'one_more_file_just_in_case.prompt.md',
												contents: 'one_more_file_just_in_case.prompt.md contents',
											},
										],
									},
								],
							},
						],
					},
				],
			}],
			/**
			 * The root file path to start the resolve process from.
			 */
			URI.file(`/${rootFolderName}/file2.prompt.md`),
			/**
			 * The expected references to be resolved.
			 */
			[
				new ExpectedReference(
					rootUri,
					createTestFileReference('folder1/file3.prompt.md', 2, 14),
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1'),
					createTestFileReference(
						`./some-other-folder/non-existing-folder`,
						2,
						1,
					),
					new OpenFailed(
						URI.joinPath(rootUri, './folder1/some-other-folder/non-existing-folder'),
						'Reference to non-existing file cannot be opened.',
					),
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1'),
					createTestFileReference(
						`/${rootFolderName}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md`,
						3,
						26,
					),
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1/some-other-folder'),
					createTestFileReference('.', 1, 1),
					new FolderReference(
						URI.joinPath(rootUri, './folder1/some-other-folder'),
						'This folder is not a prompt file!',
					),
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1/some-other-folder/yetAnotherFolder🤭'),
					createTestFileReference('../file.txt', 2, 35),
					new NotPromptFile(
						URI.joinPath(rootUri, './folder1/some-other-folder/file.txt'),
						'Ughh oh, that is not a prompt file!',
					),
				),
				new ExpectedReference(
					rootUri,
					createTestFileReference('./folder1/some-other-folder/file4.prompt.md', 3, 14),
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1/some-other-folder'),
					createTestFileReference('./some-non-existing/file.prompt.md', 1, 30),
					new OpenFailed(
						URI.joinPath(rootUri, './folder1/some-other-folder/some-non-existing/file.prompt.md'),
						'Failed to open non-existring prompt snippets file',
					),
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1/some-other-folder'),
					createTestFileReference('./some-non-prompt-file.md', 5, 13),
					new OpenFailed(
						URI.joinPath(rootUri, './folder1/some-other-folder/some-non-prompt-file.md'),
						'Oh no!',
					),
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './some-other-folder/folder1'),
					createTestFileReference('../../folder1', 5, 48),
					new FolderReference(
						URI.joinPath(rootUri, './folder1'),
						'Uggh ohh!',
					),
				),
			]
		));

		await test.run();
	});

	test('• does not fall into infinite reference recursion', async function () {
		if (isWindows) {
			this.skip();
		}

		const rootFolderName = 'infinite-recursion';
		const rootFolder = `/${rootFolderName}`;
		const rootUri = URI.file(rootFolder);

		const test = testDisposables.add(instantiationService.createInstance(TestPromptFileReference,
			/**
			 * The file structure to be created on the disk for the test.
			 */
			[{
				name: rootFolderName,
				children: [
					{
						name: 'file1.md',
						contents: '## Some Header\nsome contents\n ',
					},
					{
						name: 'file2.prompt.md',
						contents: `## Files\n\t- this file #file:folder1/file3.prompt.md \n\t- also this #file:./folder1/some-other-folder/file4.prompt.md\n\n#file:${rootFolder}/folder1/some-other-folder/file5.prompt.md\t please!\n\t[some (snippet!) #name))](./file1.md)`,
					},
					{
						name: 'folder1',
						children: [
							{
								name: 'file3.prompt.md',
								contents: `\n\n\t- some seemingly random [another-file.prompt.md](${rootFolder}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md) contents\n some more\t content`,
							},
							{
								name: 'some-other-folder',
								children: [
									{
										name: 'file4.prompt.md',
										contents: 'this file has a non-existing #file:../some-non-existing/file.prompt.md\t\treference',
									},
									{
										name: 'file5.prompt.md',
										contents: 'this file has a relative recursive #file:../../file2.prompt.md\nreference\n ',
									},
									{
										name: 'yetAnotherFolder🤭',
										children: [
											{
												name: 'another-file.prompt.md',
												// absolute path with recursion
												contents: `some test goes\t\nhere #file:${rootFolder}/file2.prompt.md`,
											},
											{
												name: 'one_more_file_just_in_case.prompt.md',
												contents: 'one_more_file_just_in_case.prompt.md contents',
											},
										],
									},
								],
							},
						],
					},
				],
			}],
			/**
			 * The root file path to start the resolve process from.
			 */
			URI.file(`/${rootFolderName}/file2.prompt.md`),
			/**
			 * The expected references to be resolved.
			 */
			[
				new ExpectedReference(
					rootUri,
					createTestFileReference('folder1/file3.prompt.md', 2, 9),
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1'),
					createTestFileReference(
						`${rootFolder}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md`,
						3,
						23,
					),
				),
				/**
				 * This reference should be resolved with a recursive
				 * reference error condition. (the absolute reference case)
				 */
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1/some-other-folder/yetAnotherFolder🤭'),
					createTestFileReference(`${rootFolder}/file2.prompt.md`, 2, 6),
					new RecursiveReference(
						URI.joinPath(rootUri, './file2.prompt.md'),
						[
							'/infinite-recursion/file2.prompt.md',
							'/infinite-recursion/folder1/file3.prompt.md',
							'/infinite-recursion/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md',
							'/infinite-recursion/file2.prompt.md',
						],
					),
				),
				new ExpectedReference(
					rootUri,
					createTestFileReference('./folder1/some-other-folder/file4.prompt.md', 3, 14),
					undefined,
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1/some-other-folder'),
					createTestFileReference('../some-non-existing/file.prompt.md', 1, 30),
					new OpenFailed(
						URI.joinPath(rootUri, './folder1/some-non-existing/file.prompt.md'),
						'Uggh ohh!',
					),
				),
				new ExpectedReference(
					rootUri,
					createTestFileReference(
						`${rootFolder}/folder1/some-other-folder/file5.prompt.md`,
						5,
						1,
					),
					undefined,
				),
				/**
				 * This reference should be resolved with a recursive
				 * reference error condition. (the relative reference case)
				 */
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1/some-other-folder'),
					createTestFileReference('../../file2.prompt.md', 1, 36),
					new RecursiveReference(
						URI.joinPath(rootUri, './file2.prompt.md'),
						[
							'/infinite-recursion/file2.prompt.md',
							'/infinite-recursion/folder1/some-other-folder/file5.prompt.md',
							'/infinite-recursion/file2.prompt.md',
						],
					),
				),
				new ExpectedReference(
					rootUri,
					createTestFileReference('./file1.md', 6, 2),
					new NotPromptFile(
						URI.joinPath(rootUri, './file1.md'),
						'Uggh oh!',
					),
				),
			]
		));

		await test.run();
	});
});
