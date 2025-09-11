/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { randomBoolean } from '../../../../../../base/test/common/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ConfigurationService } from '../../../../../../platform/configuration/common/configurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullPolicyService } from '../../../../../../platform/policy/common/policy.js';
import { ChatModeKind } from '../../../common/constants.js';
import { MarkdownLink } from '../../../common/promptSyntax/codecs/base/markdownCodec/tokens/markdownLink.js';
import { FileReference } from '../../../common/promptSyntax/codecs/tokens/fileReference.js';
import { getPromptFileType } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { type TErrorCondition } from '../../../common/promptSyntax/parsers/basePromptParser.js';
import { FilePromptParser } from '../../../common/promptSyntax/parsers/filePromptParser.js';
import { type TPromptReference } from '../../../common/promptSyntax/parsers/types.js';
import { IMockFolder, MockFilesystem } from './testUtils/mockFilesystem.js';

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
		this.uri = (linkToken.path.startsWith('/'))
			? URI.file(linkToken.path)
			: URI.joinPath(dirname, linkToken.path);
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
		@IInstantiationService private readonly instantiationService: IInstantiationService,
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
	): Promise<FilePromptParser> {
		// create the files structure on the disk
		await (this.instantiationService.createInstance(MockFilesystem, this.fileStructure)).mock();

		// randomly test with and without delay to ensure that the file
		// reference resolution is not susceptible to race conditions
		if (randomBoolean()) {
			await timeout(5);
		}

		// start resolving references for the specified root file
		const rootReference = this._register(
			this.instantiationService.createInstance(
				FilePromptParser,
				this.rootFileUri,
				{ allowNonPromptFiles: true, languageId: undefined, updateOnChange: true },
			),
		).start();

		// wait until entire prompts tree is resolved
		await rootReference.settled();

		// resolve the root file reference including all nested references
		const resolvedReferences: readonly (TPromptReference | undefined)[] = rootReference.references;

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
function createTestFileReference(
	filePath: string,
	lineNumber: number,
	startColumnNumber: number,
): FileReference {
	const range = new Range(
		lineNumber,
		startColumnNumber,
		lineNumber,
		startColumnNumber + `#file:${filePath}`.length,
	);

	return new FileReference(range, filePath);
}

suite('PromptFileReference', function () {
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
		instantiationService.stub(IModelService, { getModel() { return null; } });
		instantiationService.stub(ILanguageService, {
			guessLanguageIdByFilepathOrFirstLine(uri: URI) {
				return getPromptFileType(uri) ?? null;
			}
		});
	});

	test('resolves nested file references', async function () {
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
					rootUri,
					new MarkdownLink(
						3, 14,
						'[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)',
					),
				),
			]
		));

		await test.run();
	});


	suite('metadata', () => {
		test('tools', async function () {
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
						rootUri,
						new MarkdownLink(
							8, 14,
							'[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)',
						),
					),
				]
			));

			const rootReference = await test.run();

			const { metadata } = rootReference;

			assert.deepStrictEqual(
				metadata,
				{
					promptType: PromptsType.prompt,
					mode: 'agent',
					description: 'Root prompt description.',
					tools: ['my-tool1'],
				},
				'Must have correct metadata.',
			);

		});

		suite('applyTo', () => {
			test('prompt language', async function () {
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
									'applyTo: \'**/*\'',
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
							createTestFileReference('folder1/file3.prompt.md', 7, 14),
						),
						new ExpectedReference(
							rootUri,
							new MarkdownLink(
								8, 14,
								'[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)',
							),
						),
					]
				));

				const rootReference = await test.run();

				const { metadata } = rootReference;

				assert.deepStrictEqual(
					metadata,
					{
						promptType: PromptsType.prompt,
						mode: ChatModeKind.Agent,
						description: 'Description of my prompt.',
						tools: ['my-tool12'],
					},
					'Must have correct metadata.',
				);

			});


			test('instructions language', async function () {
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
								name: 'file2.instructions.md',
								contents: [
									'---',
									'applyTo: \'**/*\'',
									'tools: [ false, \'my-tool12\' , ]',
									'description: \'Description of my instructions file.\'',
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
					URI.file(`/${rootFolderName}/file2.instructions.md`),
					/**
					 * The expected references to be resolved.
					 */
					[
						new ExpectedReference(
							rootUri,
							createTestFileReference('folder1/file3.prompt.md', 7, 14),
						),
						new ExpectedReference(
							rootUri,
							new MarkdownLink(
								8, 14,
								'[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)',
							),
						),
					]
				));

				const rootReference = await test.run();

				const { metadata } = rootReference;

				assert.deepStrictEqual(
					metadata,
					{
						promptType: PromptsType.instructions,
						applyTo: '**/*',
						description: 'Description of my instructions file.',
					},
					'Must have correct metadata.',
				);
			});
		});

		suite('tools and mode compatibility', () => {
			test('tools are ignored if root prompt is in the ask mode', async function () {
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

				const { metadata } = rootReference;

				assert.deepStrictEqual(
					metadata,
					{
						promptType: PromptsType.prompt,
						mode: ChatModeKind.Ask,
						description: 'Description of my prompt.',
					},
					'Must have correct metadata.',
				);
			});

			test('tools are ignored if root prompt is in the edit mode', async function () {
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

				const { metadata } = rootReference;

				assert.deepStrictEqual(
					metadata,
					{
						promptType: PromptsType.prompt,
						mode: ChatModeKind.Edit,
						description: 'Description of my prompt.',
					},
					'Must have correct metadata.',
				);

			});

			test('tools are not ignored if root prompt is in the agent mode', async function () {
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

				const { metadata } = rootReference;

				assert.deepStrictEqual(
					metadata,
					{
						promptType: PromptsType.prompt,
						mode: ChatModeKind.Agent,
						description: 'Description of my prompt.',
					},
					'Must have correct metadata.',
				);

			});

			test('tools are not ignored if root prompt implicitly in the agent mode', async function () {
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
									'description: \'Description of the prompt file.\'',
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

				const { metadata, } = rootReference;

				assert.deepStrictEqual(
					metadata,
					{
						promptType: PromptsType.prompt,
						mode: ChatModeKind.Agent,
						tools: ['my-tool12'],
						description: 'Description of the prompt file.',
					},
					'Must have correct metadata.',
				);

			});
		});
	});
});
