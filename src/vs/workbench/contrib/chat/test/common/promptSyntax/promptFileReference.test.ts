/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChatMode } from '../../../common/constants.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { assertDefined } from '../../../../../../base/common/types.js';
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
import { waitRandom, randomBoolean, wait } from '../../../../../../base/test/common/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { MarkdownLink } from '../../../../../../editor/common/codecs/markdownCodec/tokens/markdownLink.js';
import { ConfigurationService } from '../../../../../../platform/configuration/common/configurationService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IFileContentsProviderOptions } from '../../../common/promptSyntax/contentProviders/filePromptContentsProvider.js';
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
		public readonly linkToken: FileReference | MarkdownLink,
		public readonly errorCondition?: TErrorCondition,
	) {
		this.uri = extUri.resolvePath(dirname, linkToken.path);
	}

	/**
	 * Range of the underlying file reference token.
	 */
	public get range(): Range {
		return this.linkToken.range;
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
	public async run(
		options: Partial<IFileContentsProviderOptions> = {},
	): Promise<FilePromptParser> {
		// create the files structure on the disk
		await (this.initService.createInstance(MockFilesystem, this.fileStructure)).mock();

		// wait for the filesystem event to settle before proceeding
		// this is temporary workaround and should be fixed once we
		// improve behavior of the `allSettled()` method
		await wait(50);

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
				options,
			),
		).start();

		// wait until entire prompts tree is resolved
		await rootReference.allSettled();

		// resolve the root file reference including all nested references
		const resolvedReferences: readonly (IPromptReference | undefined)[] = rootReference.allReferences;

		for (let i = 0; i < this.expectedReferences.length; i++) {
			const expectedReference = this.expectedReferences[i];
			const resolvedReference = resolvedReferences[i];

			if (expectedReference.linkToken instanceof MarkdownLink) {
				assert(
					resolvedReference?.subtype === 'markdown',
					[
						`Expected ${i}th resolved reference to be a markdown link`,
						`got '${resolvedReference}'.`,
					].join(', '),
				);
			}

			if (expectedReference.linkToken instanceof FileReference) {
				assert(
					resolvedReference?.subtype === 'prompt',
					[
						`Expected ${i}th resolved reference to be a #file: link`,
						`got '${resolvedReference}'.`,
					].join(', '),
				);
			}

			assert(
				(resolvedReference) &&
				(resolvedReference.uri.toString() === expectedReference.uri.toString()),
				[
					`Expected ${i}th resolved reference URI to be '${expectedReference.uri}'`,
					`got '${resolvedReference?.uri}'.`,
				].join(', '),
			);

			assert(
				(resolvedReference) &&
				(resolvedReference.range.equalsRange(expectedReference.range)),
				[
					`Expected ${i}th resolved reference range to be '${expectedReference.range}'`,
					`got '${resolvedReference?.range}'.`,
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
			].join('\n'),
		);

		return rootReference;
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
												contents: `[caption](${rootFolder}/folder1/some-other-folder)\nanother-file.prompt.md contents\t [#file:file.txt](../file.txt)`,
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
					new MarkdownLink(
						2, 1,
						'[]', '(./some-other-folder/non-existing-folder)',
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
					new MarkdownLink(
						1, 1,
						'[caption]', `(/${rootFolderName}/folder1/some-other-folder)`,
					),
					new FolderReference(
						URI.joinPath(rootUri, './folder1/some-other-folder'),
						'This folder is not a prompt file!',
					),
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1/some-other-folder/yetAnotherFolder🤭'),
					new MarkdownLink(
						2, 34,
						'[#file:file.txt]', '(../file.txt)',
					),
					new NotPromptFile(
						URI.joinPath(rootUri, './folder1/some-other-folder/file.txt'),
						'Ughh oh, that is not a prompt file!',
					),
				),
				new ExpectedReference(
					rootUri,
					new MarkdownLink(
						3, 14,
						'[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)',
					),
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1/some-other-folder'),
					createTestFileReference('./some-non-existing/file.prompt.md', 1, 30),
					new OpenFailed(
						URI.joinPath(rootUri, './folder1/some-other-folder/some-non-existing/file.prompt.md'),
						'Failed to open non-existing prompt snippets file',
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
					// createTestFileReference('../../folder1', 5, 48),
					new MarkdownLink(
						5, 48,
						'[]', '(../../folder1/)',
					),
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
					createTestFileReference('folder1/file3.prompt.md', 2, 14),
				),
				new ExpectedReference(
					URI.joinPath(rootUri, './folder1'),
					new MarkdownLink(
						3, 26,
						'[another-file.prompt.md]', `(${rootFolder}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md)`,
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
					new MarkdownLink(
						6, 2,
						'[some (snippet!) #name))]', '(./file1.md)',
					),
					new NotPromptFile(
						URI.joinPath(rootUri, './file1.md'),
						'Uggh oh!',
					),
				),
			]
		));

		await test.run();
	});

	suite('• options', () => {
		test('• allowNonPromptFiles', async function () {
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
							name: 'file2.md',
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
				URI.file(`/${rootFolderName}/file2.md`),
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
						new MarkdownLink(
							2, 1,
							'[]', '(./some-other-folder/non-existing-folder)',
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
						new MarkdownLink(
							1, 1,
							'[]', `(/${rootFolderName}/folder1/some-other-folder)`,
						),
						new FolderReference(
							URI.joinPath(rootUri, './folder1/some-other-folder'),
							'This folder is not a prompt file!',
						),
					),
					new ExpectedReference(
						URI.joinPath(rootUri, './folder1/some-other-folder/yetAnotherFolder🤭'),
						new MarkdownLink(
							2, 34,
							'[#file:file.txt]', '(../file.txt)',
						),
						new NotPromptFile(
							URI.joinPath(rootUri, './folder1/some-other-folder/file.txt'),
							'Ughh oh, that is not a prompt file!',
						),
					),
					new ExpectedReference(
						rootUri,
						new MarkdownLink(
							3, 14,
							'[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)',
						),
					),
					new ExpectedReference(
						URI.joinPath(rootUri, './folder1/some-other-folder'),
						createTestFileReference('./some-non-existing/file.prompt.md', 1, 30),
						new OpenFailed(
							URI.joinPath(rootUri, './folder1/some-other-folder/some-non-existing/file.prompt.md'),
							'Failed to open non-existing prompt snippets file',
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
						new MarkdownLink(
							5, 48,
							'[]', '(../../folder1/)',
						),
						new FolderReference(
							URI.joinPath(rootUri, './folder1'),
							'Uggh ohh!',
						),
					),
				]
			));

			await test.run({ allowNonPromptFiles: true });
		});
	});

	suite('• metadata', () => {
		test('• tools', async function () {
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
							contents: [
								'## Some Header',
								'some contents',
								' ',
							],
						},
						{
							name: 'file2.prompt.md',
							contents: [
								'---',
								'description: \'Root prompt description.\'',
								'tools: [\'my-tool1\']',
								'mode: "agent" ',
								'---',
								'## Files',
								'\t- this file #file:folder1/file3.prompt.md ',
								'\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
								' ',
							],
						},
						{
							name: 'folder1',
							children: [
								{
									name: 'file3.prompt.md',
									contents: [
										'---',
										'tools: [ false, \'my-tool1\' , ]',
										'---',
										'',
										'[](./some-other-folder/non-existing-folder)',
										`\t- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md contents`,
										' some more\t content',
									],
								},
								{
									name: 'some-other-folder',
									children: [
										{
											name: 'file4.prompt.md',
											contents: [
												'---',
												'tools: [\'my-tool1\', "my-tool2", true, , ]',
												'something: true',
												'mode: \'ask\'\t',
												'---',
												'this file has a non-existing #file:./some-non-existing/file.prompt.md\t\treference',
												'',
												'',
												'and some',
												' non-prompt #file:./some-non-prompt-file.md\t\t \t[](../../folder1/)\t',
											],
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
													contents: [
														'---',
														'tools: [\'my-tool3\', false, "my-tool2" ]',
														'---',
														`[](${rootFolder}/folder1/some-other-folder)`,
														'another-file.prompt.md contents\t [#file:file.txt](../file.txt)',
													],
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
						createTestFileReference('folder1/file3.prompt.md', 7, 14),
					),
					new ExpectedReference(
						URI.joinPath(rootUri, './folder1'),
						new MarkdownLink(
							5, 1,
							'[]', '(./some-other-folder/non-existing-folder)',
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
							6, 26,
						),
					),
					new ExpectedReference(
						URI.joinPath(rootUri, './folder1/some-other-folder'),
						new MarkdownLink(
							4, 1,
							'[]', `(/${rootFolderName}/folder1/some-other-folder)`,
						),
						new FolderReference(
							URI.joinPath(rootUri, './folder1/some-other-folder'),
							'This folder is not a prompt file!',
						),
					),
					new ExpectedReference(
						URI.joinPath(rootUri, './folder1/some-other-folder/yetAnotherFolder🤭'),
						new MarkdownLink(
							5, 34,
							'[#file:file.txt]', '(../file.txt)',
						),
						new NotPromptFile(
							URI.joinPath(rootUri, './folder1/some-other-folder/file.txt'),
							'Ughh oh, that is not a prompt file!',
						),
					),
					new ExpectedReference(
						rootUri,
						new MarkdownLink(
							8, 14,
							'[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)',
						),
					),
					new ExpectedReference(
						URI.joinPath(rootUri, './folder1/some-other-folder'),
						createTestFileReference('./some-non-existing/file.prompt.md', 6, 30),
						new OpenFailed(
							URI.joinPath(rootUri, './folder1/some-other-folder/some-non-existing/file.prompt.md'),
							'Failed to open non-existing prompt snippets file',
						),
					),
					new ExpectedReference(
						URI.joinPath(rootUri, './folder1/some-other-folder'),
						createTestFileReference('./some-non-prompt-file.md', 10, 13),
						new OpenFailed(
							URI.joinPath(rootUri, './folder1/some-other-folder/some-non-prompt-file.md'),
							'Oh no!',
						),
					),
					new ExpectedReference(
						URI.joinPath(rootUri, './some-other-folder/folder1'),
						new MarkdownLink(
							10, 48,
							'[]', '(../../folder1/)',
						),
						new FolderReference(
							URI.joinPath(rootUri, './folder1'),
							'Uggh ohh!',
						),
					),
				]
			));

			const rootReference = await test.run();

			const { metadata, allToolsMetadata } = rootReference;
			const { tools, description } = metadata;

			assert.deepStrictEqual(
				tools,
				['my-tool1'],
				'Must have correct tools metadata.',
			);

			assert.deepStrictEqual(
				description,
				'Root prompt description.',
				'Must have correct description metadata.',
			);

			assertDefined(
				allToolsMetadata,
				'All tools metadata must to be defined.',
			);
			assert.deepStrictEqual(
				allToolsMetadata,
				['my-tool1', 'my-tool3', 'my-tool2'],
				'Must have correct all tools metadata.',
			);
		});

		suite('• tools and mode compatibility', () => {
			test('• tools are ignored if root prompt in the ask mode', async function () {
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
								contents: [
									'## Some Header',
									'some contents',
									' ',
								],
							},
							{
								name: 'file2.prompt.md',
								contents: [
									'---',
									'description: \'Description of my prompt.\'',
									'mode: "ask" ',
									'---',
									'## Files',
									'\t- this file #file:folder1/file3.prompt.md ',
									'\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
									' ',
								],
							},
							{
								name: 'folder1',
								children: [
									{
										name: 'file3.prompt.md',
										contents: [
											'---',
											'tools: [ false, \'my-tool1\' , ]',
											'mode: \'agent\'\t',
											'---',
											' some more\t content',
										],
									},
									{
										name: 'some-other-folder',
										children: [
											{
												name: 'file4.prompt.md',
												contents: [
													'---',
													'tools: [\'my-tool1\', "my-tool2", true, , ]',
													'something: true',
													'mode: \'ask\'\t',
													'---',
													'',
													'',
													'and some more content',
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
							createTestFileReference('folder1/file3.prompt.md', 6, 14),
						),
						new ExpectedReference(
							rootUri,
							new MarkdownLink(
								7, 14,
								'[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)',
							),
						),
					]
				));

				const rootReference = await test.run();

				const { metadata, allToolsMetadata } = rootReference;
				const { tools, mode, description } = metadata;

				assert.deepStrictEqual(
					tools,
					undefined,
					'Must have correct tools metadata.',
				);

				assert.deepStrictEqual(
					mode,
					ChatMode.Ask,
					'Must have correct tools metadata.',
				);

				assert.deepStrictEqual(
					description,
					'Description of my prompt.',
					'Must have correct description metadata.',
				);

				assert.deepStrictEqual(
					allToolsMetadata,
					null,
					'Must have correct all tools metadata.',
				);
			});

			test('• tools are ignored if root prompt in the edit mode', async function () {
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
								contents: [
									'## Some Header',
									'some contents',
									' ',
								],
							},
							{
								name: 'file2.prompt.md',
								contents: [
									'---',
									'description: \'Description of my prompt.\'',
									'mode:\t\t"edit"\t\t',
									'---',
									'## Files',
									'\t- this file #file:folder1/file3.prompt.md ',
									'\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
									' ',
								],
							},
							{
								name: 'folder1',
								children: [
									{
										name: 'file3.prompt.md',
										contents: [
											'---',
											'tools: [ false, \'my-tool1\' , ]',
											'---',
											' some more\t content',
										],
									},
									{
										name: 'some-other-folder',
										children: [
											{
												name: 'file4.prompt.md',
												contents: [
													'---',
													'tools: [\'my-tool1\', "my-tool2", true, , ]',
													'something: true',
													'mode: \'agent\'\t',
													'---',
													'',
													'',
													'and some more content',
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
							createTestFileReference('folder1/file3.prompt.md', 6, 14),
						),
						new ExpectedReference(
							rootUri,
							new MarkdownLink(
								7, 14,
								'[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)',
							),
						),
					]
				));

				const rootReference = await test.run();

				const { metadata, allToolsMetadata } = rootReference;
				const { tools, mode, description } = metadata;

				assert.deepStrictEqual(
					tools,
					undefined,
					'Must have correct tools metadata.',
				);

				assert.deepStrictEqual(
					mode,
					ChatMode.Edit,
					'Must have correct tools metadata.',
				);

				assert.deepStrictEqual(
					description,
					'Description of my prompt.',
					'Must have correct description metadata.',
				);

				assert.deepStrictEqual(
					allToolsMetadata,
					null,
					'Must have correct all tools metadata.',
				);
			});

			test('• tools are not ignored if root prompt in the agent mode', async function () {
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
								contents: [
									'## Some Header',
									'some contents',
									' ',
								],
							},
							{
								name: 'file2.prompt.md',
								contents: [
									'---',
									'description: \'Description of my prompt.\'',
									'mode: \t\t "agent" \t\t ',
									'---',
									'## Files',
									'\t- this file #file:folder1/file3.prompt.md ',
									'\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
									' ',
								],
							},
							{
								name: 'folder1',
								children: [
									{
										name: 'file3.prompt.md',
										contents: [
											'---',
											'tools: [ false, \'my-tool1\' , ]',
											'---',
											' some more\t content',
										],
									},
									{
										name: 'some-other-folder',
										children: [
											{
												name: 'file4.prompt.md',
												contents: [
													'---',
													'tools: [\'my-tool1\', "my-tool2", true, , \'my-tool3\' , ]',
													'something: true',
													'mode: \'agent\'\t',
													'---',
													'',
													'',
													'and some more content',
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
							createTestFileReference('folder1/file3.prompt.md', 6, 14),
						),
						new ExpectedReference(
							rootUri,
							new MarkdownLink(
								7, 14,
								'[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)',
							),
						),
					]
				));

				const rootReference = await test.run();

				const { metadata, allToolsMetadata } = rootReference;
				const { tools, mode, description } = metadata;

				assert.deepStrictEqual(
					tools,
					undefined,
					'Must have correct tools metadata.',
				);

				assert.deepStrictEqual(
					mode,
					ChatMode.Agent,
					'Must have correct tools metadata.',
				);

				assert.deepStrictEqual(
					description,
					'Description of my prompt.',
					'Must have correct description metadata.',
				);

				assert.deepStrictEqual(
					allToolsMetadata,
					[
						'my-tool1',
						'my-tool2',
						'my-tool3',
					],
					'Must have correct all tools metadata.',
				);
			});

			test('• tools are not ignored if root prompt implicitly in the agent mode', async function () {
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
								contents: [
									'## Some Header',
									'some contents',
									' ',
								],
							},
							{
								name: 'file2.prompt.md',
								contents: [
									'---',
									'tools: [ false, \'my-tool12\' , ]',
									'description: \'Description of my prompt.\'',
									'---',
									'## Files',
									'\t- this file #file:folder1/file3.prompt.md ',
									'\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
									' ',
								],
							},
							{
								name: 'folder1',
								children: [
									{
										name: 'file3.prompt.md',
										contents: [
											'---',
											'tools: [ false, \'my-tool1\' , ]',
											'---',
											' some more\t content',
										],
									},
									{
										name: 'some-other-folder',
										children: [
											{
												name: 'file4.prompt.md',
												contents: [
													'---',
													'tools: [\'my-tool1\', "my-tool2", true, , \'my-tool3\' , ]',
													'something: true',
													'mode: \'agent\'\t',
													'---',
													'',
													'',
													'and some more content',
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
							createTestFileReference('folder1/file3.prompt.md', 6, 14),
						),
						new ExpectedReference(
							rootUri,
							new MarkdownLink(
								7, 14,
								'[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)',
							),
						),
					]
				));

				const rootReference = await test.run();

				const { metadata, allToolsMetadata } = rootReference;
				const { tools, mode, description } = metadata;

				assert.deepStrictEqual(
					tools,
					['my-tool12'],
					'Must have correct tools metadata.',
				);

				assert.deepStrictEqual(
					mode,
					ChatMode.Agent,
					'Must have correct tools metadata.',
				);

				assert.deepStrictEqual(
					description,
					'Description of my prompt.',
					'Must have correct description metadata.',
				);

				assert.deepStrictEqual(
					allToolsMetadata,
					[
						'my-tool12',
						'my-tool1',
						'my-tool2',
						'my-tool3',
					],
					'Must have correct all tools metadata.',
				);
			});
		});
	});
});
