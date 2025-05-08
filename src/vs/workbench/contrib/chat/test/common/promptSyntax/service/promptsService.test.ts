/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { ChatMode } from '../../../../common/constants.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { MockFilesystem } from '../testUtils/mockFilesystem.js';
import { pick } from '../../../../../../../base/common/arrays.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { IPromptsService } from '../../../../common/promptSyntax/service/types.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { IPromptFileReference } from '../../../../common/promptSyntax/parsers/types.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { PromptsService } from '../../../../common/promptSyntax/service/promptsService.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { randomBoolean, waitRandom } from '../../../../../../../base/test/common/testUtils.js';
import { TextModelPromptParser } from '../../../../common/promptSyntax/parsers/textModelPromptParser.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID } from '../../../../common/promptSyntax/constants.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { INSTRUCTION_FILE_EXTENSION, PROMPT_FILE_EXTENSION } from '../../../../../../../platform/prompts/common/constants.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';

/**
 * Helper class to assert the properties of a link.
 */
class ExpectedLink {
	constructor(
		public readonly uri: URI,
		public readonly fullRange: Range,
		public readonly linkRange: Range,
	) { }

	/**
	 * Assert a provided link has the same properties as this object.
	 */
	public assertEqual(link: IPromptFileReference) {
		assert.strictEqual(
			link.type,
			'file',
			'Link must have correct type.',
		);

		assert.strictEqual(
			link.uri.toString(),
			this.uri.toString(),
			'Link must have correct URI.',
		);

		assert(
			this.fullRange.equalsRange(link.range),
			`Full range must be '${this.fullRange}', got '${link.range}'.`,
		);

		assertDefined(
			link.linkRange,
			'Link must have a link range.',
		);

		assert(
			this.linkRange.equalsRange(link.linkRange),
			`Link range must be '${this.linkRange}', got '${link.linkRange}'.`,
		);
	}
}

/**
 * Asserts that provided links are equal to the expected links.
 * @param links Links to assert.
 * @param expectedLinks Expected links to compare against.
 */
const assertLinks = (
	links: readonly IPromptFileReference[],
	expectedLinks: readonly ExpectedLink[],
) => {
	for (let i = 0; i < links.length; i++) {
		try {
			expectedLinks[i].assertEqual(links[i]);
		} catch (error) {
			throw new Error(`link#${i}: ${error}`);
		}
	}

	assert.strictEqual(
		links.length,
		expectedLinks.length,
		`Links count must be correct.`,
	);
};

suite('PromptsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let service: IPromptsService;
	let instaService: TestInstantiationService;

	setup(async () => {
		instaService = disposables.add(new TestInstantiationService());
		instaService.stub(ILogService, new NullLogService());
		instaService.stub(IConfigurationService, new TestConfigurationService());

		const fileService = disposables.add(instaService.createInstance(FileService));
		instaService.stub(IFileService, fileService);
		instaService.stub(IModelService, { getModel() { return null; } });
		instaService.stub(ILanguageService, {
			guessLanguageIdByFilepathOrFirstLine(uri: URI) {
				if (uri.path.endsWith(PROMPT_FILE_EXTENSION)) {
					return PROMPT_LANGUAGE_ID;
				}

				if (uri.path.endsWith(INSTRUCTION_FILE_EXTENSION)) {
					return INSTRUCTIONS_LANGUAGE_ID;
				}

				return 'plaintext';
			}
		});

		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		service = disposables.add(instaService.createInstance(PromptsService));
	});

	suite('• getParserFor', () => {
		test('• provides cached parser instance', async () => {
			// both languages must yield the same result
			const languageId = (randomBoolean())
				? PROMPT_LANGUAGE_ID
				: INSTRUCTIONS_LANGUAGE_ID;

			/**
			 * Create a text model, get a parser for it, and perform basic assertions.
			 */

			const model1 = disposables.add(createTextModel(
				'test1\n\t#file:./file.md\n\n\n   [bin file](/root/tmp.bin)\t\n',
				languageId,
				undefined,
				URI.file('/Users/vscode/repos/test/file1.txt'),
			));

			const parser1 = service.getSyntaxParserFor(model1);
			assert.strictEqual(
				parser1.uri.toString(),
				model1.uri.toString(),
				'Must create parser1 with the correct URI.',
			);

			assert(
				!parser1.isDisposed,
				'Parser1 must not be disposed.',
			);

			assert(
				parser1 instanceof TextModelPromptParser,
				'Parser1 must be an instance of TextModelPromptParser.',
			);

			/**
			 * Validate that all links of the model are correctly parsed.
			 */

			await parser1.settled();
			assertLinks(
				parser1.allReferences,
				[
					new ExpectedLink(
						URI.file('/Users/vscode/repos/test/file.md'),
						new Range(2, 2, 2, 2 + 15),
						new Range(2, 8, 2, 8 + 9),
					),
					new ExpectedLink(
						URI.file('/root/tmp.bin'),
						new Range(5, 4, 5, 4 + 25),
						new Range(5, 15, 5, 15 + 13),
					),
				],
			);

			// wait for some random amount of time
			await waitRandom(5);

			/**
			 * Next, get parser for the same exact model and
			 * validate that the same cached object is returned.
			 */

			// get the same parser again, the call must return the same object
			const parser1_1 = service.getSyntaxParserFor(model1);
			assert.strictEqual(
				parser1,
				parser1_1,
				'Must return the same parser object.',
			);

			assert.strictEqual(
				parser1_1.uri.toString(),
				model1.uri.toString(),
				'Must create parser1_1 with the correct URI.',
			);

			/**
			 * Get parser for a different model and perform basic assertions.
			 */

			const model2 = disposables.add(createTextModel(
				'some text #file:/absolute/path.txt  \t\ntest-text2',
				languageId,
				undefined,
				URI.file('/Users/vscode/repos/test/some-folder/file.md'),
			));

			// wait for some random amount of time
			await waitRandom(5);

			const parser2 = service.getSyntaxParserFor(model2);

			assert.strictEqual(
				parser2.uri.toString(),
				model2.uri.toString(),
				'Must create parser2 with the correct URI.',
			);

			assert(
				!parser2.isDisposed,
				'Parser2 must not be disposed.',
			);

			assert(
				parser2 instanceof TextModelPromptParser,
				'Parser2 must be an instance of TextModelPromptParser.',
			);

			assert(
				!parser2.isDisposed,
				'Parser2 must not be disposed.',
			);

			assert(
				!parser1.isDisposed,
				'Parser1 must not be disposed.',
			);

			assert(
				!parser1_1.isDisposed,
				'Parser1_1 must not be disposed.',
			);

			/**
			 * Validate that all links of the model 2 are correctly parsed.
			 */

			await parser2.settled();

			assert.notStrictEqual(
				parser1.uri.toString(),
				parser2.uri.toString(),
				'Parser2 must have its own URI.',
			);

			assertLinks(
				parser2.allReferences,
				[
					new ExpectedLink(
						URI.file('/absolute/path.txt'),
						new Range(1, 11, 1, 11 + 24),
						new Range(1, 17, 1, 17 + 18),
					),
				],
			);

			/**
			 * Validate the first parser was not affected by the presence
			 * of the second parser.
			 */

			await parser1_1.settled();

			// parser1_1 has the same exact links as before
			assertLinks(
				parser1_1.allReferences,
				[
					new ExpectedLink(
						URI.file('/Users/vscode/repos/test/file.md'),
						new Range(2, 2, 2, 2 + 15),
						new Range(2, 8, 2, 8 + 9),
					),
					new ExpectedLink(
						URI.file('/root/tmp.bin'),
						new Range(5, 4, 5, 4 + 25),
						new Range(5, 15, 5, 15 + 13),
					),
				],
			);

			// wait for some random amount of time
			await waitRandom(5);

			/**
			 * Dispose the first parser, perform basic validations, and confirm
			 * that the second parser is not affected by the disposal of the first one.
			 */
			parser1.dispose();

			assert(
				parser1.isDisposed,
				'Parser1 must be disposed.',
			);

			assert(
				parser1_1.isDisposed,
				'Parser1_1 must be disposed.',
			);

			assert(
				!parser2.isDisposed,
				'Parser2 must not be disposed.',
			);


			/**
			 * Get parser for the first model again. Confirm that we get
			 * a new non-disposed parser object back with correct properties.
			 */

			const parser1_2 = service.getSyntaxParserFor(model1);

			assert(
				!parser1_2.isDisposed,
				'Parser1_2 must not be disposed.',
			);

			assert.notStrictEqual(
				parser1_2,
				parser1,
				'Must create a new parser object for the model1.',
			);

			assert.strictEqual(
				parser1_2.uri.toString(),
				model1.uri.toString(),
				'Must create parser1_2 with the correct URI.',
			);

			/**
			 * Validate that the contents of the second parser did not change.
			 */

			await parser1_2.settled();

			// parser1_2 must have the same exact links as before
			assertLinks(
				parser1_2.allReferences,
				[
					new ExpectedLink(
						URI.file('/Users/vscode/repos/test/file.md'),
						new Range(2, 2, 2, 2 + 15),
						new Range(2, 8, 2, 8 + 9),
					),
					new ExpectedLink(
						URI.file('/root/tmp.bin'),
						new Range(5, 4, 5, 4 + 25),
						new Range(5, 15, 5, 15 + 13),
					),
				],
			);

			// wait for some random amount of time
			await waitRandom(5);

			/**
			 * This time dispose model of the second parser instead of
			 * the parser itself. Validate that the parser is disposed too, but
			 * the newly created first parser is not affected.
			 */

			// dispose the `model` of the second parser now
			model2.dispose();

			// assert that the parser is also disposed
			assert(
				parser2.isDisposed,
				'Parser2 must be disposed.',
			);

			// sanity check that the other parser is not affected
			assert(
				!parser1_2.isDisposed,
				'Parser1_2 must not be disposed.',
			);

			/**
			 * Create a new second parser with new model - we cannot use
			 * the old one because it was disposed. This new model also has
			 * a different second link.
			 */

			// we cannot use the same model since it was already disposed
			const model2_1 = disposables.add(createTextModel(
				'some text #file:/absolute/path.txt  \n [caption](.copilot/prompts/test.prompt.md)\t\n\t\n more text',
				languageId,
				undefined,
				URI.file('/Users/vscode/repos/test/some-folder/file.md'),
			));
			const parser2_1 = service.getSyntaxParserFor(model2_1);

			assert(
				!parser2_1.isDisposed,
				'Parser2_1 must not be disposed.',
			);

			assert.notStrictEqual(
				parser2_1,
				parser2,
				'Parser2_1 must be a new object.',
			);

			assert.strictEqual(
				parser2_1.uri.toString(),
				model2.uri.toString(),
				'Must create parser2_1 with the correct URI.',
			);

			/**
			 * Validate that new model2 contents are parsed correctly.
			 */

			await parser2_1.settled();

			// parser2_1 must have 2 links now
			assertLinks(
				parser2_1.allReferences,
				[
					// the first link didn't change
					new ExpectedLink(
						URI.file('/absolute/path.txt'),
						new Range(1, 11, 1, 11 + 24),
						new Range(1, 17, 1, 17 + 18),
					),
					// the second link is new
					new ExpectedLink(
						URI.file('/Users/vscode/repos/test/some-folder/.copilot/prompts/test.prompt.md'),
						new Range(2, 2, 2, 2 + 42),
						new Range(2, 12, 2, 12 + 31),
					),
				],
			);
		});

		test('• auto-updated on model changes', async () => {
			const langId = 'bazLang';

			const model = disposables.add(createTextModel(
				' \t #file:../file.md\ntest1\n\t\n  [another file](/Users/root/tmp/file2.txt)\t\n',
				langId,
				undefined,
				URI.file('/repos/test/file1.txt'),
			));

			const parser = service.getSyntaxParserFor(model);

			// sanity checks
			assert(
				!parser.isDisposed,
				'Parser must not be disposed.',
			);
			assert(
				parser instanceof TextModelPromptParser,
				'Parser must be an instance of TextModelPromptParser.',
			);

			await parser.settled();

			assertLinks(
				parser.allReferences,
				[
					new ExpectedLink(
						URI.file('/repos/file.md'),
						new Range(1, 4, 1, 4 + 16),
						new Range(1, 10, 1, 10 + 10),
					),
					new ExpectedLink(
						URI.file('/Users/root/tmp/file2.txt'),
						new Range(4, 3, 4, 3 + 41),
						new Range(4, 18, 4, 18 + 25),
					),
				],
			);

			model.applyEdits([
				{
					range: new Range(4, 18, 4, 18 + 25),
					text: '/Users/root/tmp/file3.txt',
				},
			]);

			await parser.settled();

			assertLinks(
				parser.allReferences,
				[
					// link1 didn't change
					new ExpectedLink(
						URI.file('/repos/file.md'),
						new Range(1, 4, 1, 4 + 16),
						new Range(1, 10, 1, 10 + 10),
					),
					// link2 changed in the file name only
					new ExpectedLink(
						URI.file('/Users/root/tmp/file3.txt'),
						new Range(4, 3, 4, 3 + 41),
						new Range(4, 18, 4, 18 + 25),
					),
				],
			);
		});

		test('• throws if a disposed model provided', async function () {
			const model = disposables.add(createTextModel(
				'test1\ntest2\n\ntest3\t\n',
				'barLang',
				undefined,
				URI.parse('./github/prompts/file.prompt.md'),
			));

			// dispose the model before using it
			model.dispose();

			assert.throws(() => {
				service.getSyntaxParserFor(model);
			}, 'Cannot create a prompt parser for a disposed model.');
		});
	});

	suite('• getCombinedToolsMetadata', () => {
		suite('• agent mode', () => {
			test('• explicit', async function () {
				const rootFolderName = 'gets-combined-tools-metadata';
				const rootFolder = `/${rootFolderName}`;

				const rootFileName = 'file2.prompt.md';
				const rootFileUri = URI.file(`${rootFolder}/${rootFileName}`);

				await (instaService.createInstance(MockFilesystem,
					// the file structure to be created on the disk for the test
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
								name: rootFileName,
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
												contents: [
													'---',
													'description: "Non-prompt file description".',
													'tools: ["my-tool-24"]',
													'---',
												],
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
					}])).mock();

				const metadata = await service
					.getCombinedToolsMetadata([rootFileUri]);

				assertDefined(
					metadata,
					'Combined metadata must be defined.',
				);

				const { tools, mode } = metadata;

				assert.strictEqual(
					mode,
					ChatMode.Agent,
					'Combined metadata \'mode\' must have correct value.',
				);

				assert.deepStrictEqual(
					tools,
					[
						'my-tool1',
						'my-tool3',
						'my-tool2',
					],
					'Combined metadata \'tools\' must have correct value.',
				);
			});

			test('• implicit', async function () {
				const rootFolderName = 'gets-combined-tools-metadata';
				const rootFolder = `/${rootFolderName}`;

				const rootFileName = 'file2.prompt.md';
				const rootFileUri = URI.file(`${rootFolder}/${rootFileName}`);

				await (instaService.createInstance(MockFilesystem,
					// the file structure to be created on the disk for the test
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
								name: rootFileName,
								contents: [
									'---',
									'description: \'Root prompt description.\'',
									'tools: [\'my-tool1\']',
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
												contents: [
													'---',
													'description: "Non-prompt file description".',
													'tools: ["my-tool-24"]',
													'---',
												],
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
					}])).mock();

				const metadata = await service
					.getCombinedToolsMetadata([rootFileUri]);

				assertDefined(
					metadata,
					'Combined metadata must be defined.',
				);

				const { tools, mode } = metadata;

				assert.strictEqual(
					mode,
					ChatMode.Agent,
					'Combined metadata \'mode\' must have correct value.',
				);

				assert.deepStrictEqual(
					tools,
					[
						'my-tool1',
						'my-tool3',
						'my-tool2',
					],
					'Combined metadata \'tools\' must have correct value.',
				);
			});

			test('• implicit (incorrect value)', async function () {
				const rootFolderName = 'gets-combined-tools-metadata';
				const rootFolder = `/${rootFolderName}`;

				const rootFileName = 'file2.prompt.md';
				const rootFileUri = URI.file(`${rootFolder}/${rootFileName}`);

				// both modes must yield the same result
				const incorrectMode = (randomBoolean())
					? ChatMode.Ask
					: ChatMode.Edit;

				await (instaService.createInstance(MockFilesystem,
					// the file structure to be created on the disk for the test
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
								name: rootFileName,
								contents: [
									'---',
									'description: \'Root prompt description.\'',
									'tools: [\'my-tool1\']',
									`mode: '${incorrectMode}'`,
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
												contents: [
													'---',
													'description: "Non-prompt file description".',
													'tools: ["my-tool-24"]',
													'---',
												],
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
					}])).mock();

				const metadata = await service
					.getCombinedToolsMetadata([rootFileUri]);

				assertDefined(
					metadata,
					'Combined metadata must be defined.',
				);

				const { tools, mode } = metadata;

				assert.strictEqual(
					mode,
					ChatMode.Agent,
					'Combined metadata \'mode\' must have correct value.',
				);

				assert.deepStrictEqual(
					tools,
					[
						'my-tool1',
						'my-tool3',
						'my-tool2',
					],
					'Combined metadata \'tools\' must have correct value.',
				);
			});
		});

		suite('• edit mode', () => {
			test('• explicit', async () => {
				const rootFolderName = 'gets-combined-tools-metadata';
				const rootFolder = `/${rootFolderName}`;

				const rootFileName = 'file2.prompt.md';
				const rootFileUri = URI.file(`${rootFolder}/${rootFileName}`);

				await (instaService.createInstance(MockFilesystem,
					// the file structure to be created on the disk for the test
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
								name: rootFileName,
								contents: [
									'---',
									'description: \'Root prompt description.\'',
									'mode: "edit"',
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
												contents: [
													'---',
													'description: "Non-prompt file description".',
													'tools: ["my-tool-24"]',
													'---',
												],
											},
											{
												name: 'yetAnotherFolder🤭',
												children: [
													{
														name: 'another-file.prompt.md',
														contents: [
															'---',
															'mode: \'ask\'\t',
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
					}])).mock();

				const metadata = await service
					.getCombinedToolsMetadata([rootFileUri]);

				assertDefined(
					metadata,
					'Combined metadata must be defined.',
				);

				const { tools, mode } = metadata;

				assert.strictEqual(
					mode,
					ChatMode.Edit,
					'Combined metadata \'mode\' must have correct value.',
				);

				assert.strictEqual(
					tools,
					undefined,
					'Combined metadata \'tools\' must have correct value.',
				);
			});

			test('• implicit', async function () {
				const rootFolderName = 'gets-combined-tools-metadata';
				const rootFolder = `/${rootFolderName}`;

				const rootFileName = 'file2.prompt.md';
				const rootFileUri = URI.file(`${rootFolder}/${rootFileName}`);

				await (instaService.createInstance(MockFilesystem,
					// the file structure to be created on the disk for the test
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
								name: rootFileName,
								contents: [
									'---',
									'description: \'Root prompt description.\'',
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
											'mode: \'ask\'',
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
												contents: [
													'---',
													'description: "Non-prompt file description".',
													'tools: ["my-tool-24"]',
													'---',
												],
											},
											{
												name: 'yetAnotherFolder🤭',
												children: [
													{
														name: 'another-file.prompt.md',
														contents: [
															'---',
															'description: "My prompt."',
															'mode: "edit"\t\t',
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
					}])).mock();

				const metadata = await service
					.getCombinedToolsMetadata([rootFileUri]);

				assertDefined(
					metadata,
					'Combined metadata must be defined.',
				);

				const { tools, mode } = metadata;

				assert.strictEqual(
					mode,
					ChatMode.Edit,
					'Combined metadata \'mode\' must have correct value.',
				);

				assert.strictEqual(
					tools,
					undefined,
					'Combined metadata \'tools\' must have correct value.',
				);
			});

			test('• implicit (incorrect value)', async function () {
				const rootFolderName = 'gets-combined-tools-metadata';
				const rootFolder = `/${rootFolderName}`;

				const rootFileName = 'file2.prompt.md';
				const rootFileUri = URI.file(`${rootFolder}/${rootFileName}`);

				// both modes must yield the same result
				const incorrectMode = (randomBoolean())
					? 'unknown-mode-1'
					: 'unknown-mode-2';

				await (instaService.createInstance(MockFilesystem,
					// the file structure to be created on the disk for the test
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
								name: rootFileName,
								contents: [
									'---',
									'description: \'Root prompt description.\'',
									`mode: '${incorrectMode}'`,
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
											'mode: \'ask\'',
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
													'something: true',
													'mode: \'edit\'\t',
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
												contents: [
													'---',
													'description: "Non-prompt file description".',
													'tools: ["my-tool-24"]',
													'---',
												],
											},
											{
												name: 'yetAnotherFolder🤭',
												children: [
													{
														name: 'another-file.prompt.md',
														contents: [
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
					}])).mock();

				const metadata = await service
					.getCombinedToolsMetadata([rootFileUri]);

				assertDefined(
					metadata,
					'Combined metadata must be defined.',
				);

				const { tools, mode } = metadata;

				assert.strictEqual(
					mode,
					ChatMode.Edit,
					'Combined metadata \'mode\' must have correct value.',
				);

				assert.strictEqual(
					tools,
					undefined,
					'Combined metadata \'tools\' must have correct value.',
				);
			});
		});

		suite('• ask mode', () => {
			test('• explicit', async () => {
				const rootFolderName = 'gets-combined-tools-metadata';
				const rootFolder = `/${rootFolderName}`;

				const rootFileName = 'file2.prompt.md';
				const rootFileUri = URI.file(`${rootFolder}/${rootFileName}`);

				await (instaService.createInstance(MockFilesystem,
					// the file structure to be created on the disk for the test
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
								name: rootFileName,
								contents: [
									'---',
									'description: \'Root prompt description.\'',
									'mode:\t\t"ask"\t',
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
													'something: true',
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
												contents: [
													'---',
													'description: "Non-prompt file description".',
													'tools: ["my-tool-24"]',
													'---',
												],
											},
											{
												name: 'yetAnotherFolder🤭',
												children: [
													{
														name: 'another-file.prompt.md',
														contents: [
															'---',
															'description: "some text"',
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
					}])).mock();

				const metadata = await service
					.getCombinedToolsMetadata([rootFileUri]);

				assertDefined(
					metadata,
					'Combined metadata must be defined.',
				);

				const { tools, mode } = metadata;

				assert.strictEqual(
					mode,
					ChatMode.Ask,
					'Combined metadata \'mode\' must have correct value.',
				);

				assert.strictEqual(
					tools,
					undefined,
					'Combined metadata \'tools\' must have correct value.',
				);
			});

			test('• implicit', async function () {
				const rootFolderName = 'gets-combined-tools-metadata';
				const rootFolder = `/${rootFolderName}`;

				const rootFileName = 'file2.prompt.md';
				const rootFileUri = URI.file(`${rootFolder}/${rootFileName}`);

				await (instaService.createInstance(MockFilesystem,
					// the file structure to be created on the disk for the test
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
								name: rootFileName,
								contents: [
									'---',
									'description: \'Root prompt description.\'',
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
											'description: "Another prompt description."',
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
													'something: true',
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
												contents: [
													'---',
													'description: "Non-prompt file description".',
													'tools: ["my-tool-24"]',
													'---',
												],
											},
											{
												name: 'yetAnotherFolder🤭',
												children: [
													{
														name: 'another-file.prompt.md',
														contents: [
															'---',
															'description: "My prompt."',
															'mode: "ask"\t\t',
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
					}])).mock();

				const metadata = await service
					.getCombinedToolsMetadata([rootFileUri]);

				assertDefined(
					metadata,
					'Combined metadata must be defined.',
				);

				const { tools, mode } = metadata;

				assert.strictEqual(
					mode,
					ChatMode.Ask,
					'Combined metadata \'mode\' must have correct value.',
				);

				assert.strictEqual(
					tools,
					undefined,
					'Combined metadata \'tools\' must have correct value.',
				);
			});

			test('• implicit (incorrect value)', async function () {
				const rootFolderName = 'gets-combined-tools-metadata';
				const rootFolder = `/${rootFolderName}`;

				const rootFileName = 'file2.prompt.md';
				const rootFileUri = URI.file(`${rootFolder}/${rootFileName}`);

				// both modes must yield the same result
				const incorrectMode = (randomBoolean())
					? 'unknown-mode-1'
					: 'unknown-mode-2';

				await (instaService.createInstance(MockFilesystem,
					// the file structure to be created on the disk for the test
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
								name: rootFileName,
								contents: [
									'---',
									'description: \'Root prompt description.\'',
									`mode: '${incorrectMode}'`,
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
												contents: [
													'---',
													'description: "Non-prompt file description".',
													'tools: ["my-tool-24"]',
													'---',
												],
											},
											{
												name: 'yetAnotherFolder🤭',
												children: [
													{
														name: 'another-file.prompt.md',
														contents: [
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
					}])).mock();

				const metadata = await service
					.getCombinedToolsMetadata([rootFileUri]);

				assertDefined(
					metadata,
					'Combined metadata must be defined.',
				);

				const { tools, mode } = metadata;

				assert.strictEqual(
					mode,
					ChatMode.Ask,
					'Combined metadata \'mode\' must have correct value.',
				);

				assert.strictEqual(
					tools,
					undefined,
					'Combined metadata \'tools\' must have correct value.',
				);
			});
		});
	});

	suite('• getAllMetadata', () => {
		test('• explicit', async function () {
			const rootFolderName = 'resolves-nested-file-references';
			const rootFolder = `/${rootFolderName}`;

			const rootFileName = 'file2.prompt.md';

			const rootFolderUri = URI.file(rootFolder);
			const rootFileUri = URI.joinPath(rootFolderUri, rootFileName);

			await (instaService.createInstance(MockFilesystem,
				// the file structure to be created on the disk for the test
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
							name: rootFileName,
							contents: [
								'---',
								'description: \'Root prompt description.\'',
								'tools: [\'my-tool1\', , true]',
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
										'mode: \'edit\'',
										'---',
										'',
										'[](./some-other-folder/non-existing-folder)',
										`\t- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.instructions.md contents`,
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
												'description: "File 4 splendid description."',
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
											contents: [
												'---',
												'description: "Non-prompt file description".',
												'tools: ["my-tool-24"]',
												'---',
											],
										},
										{
											name: 'yetAnotherFolder🤭',
											children: [
												{
													name: 'another-file.instructions.md',
													contents: [
														'---',
														'description: "Another file description."',
														'tools: [\'my-tool3\', false, "my-tool2" ]',
														'applyTo: "**/*.tsx"',
														'---',
														`[](${rootFolder}/folder1/some-other-folder)`,
														'another-file.instructions.md contents\t [#file:file.txt](../file.txt)',
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
				}])).mock();

			const metadata = await service
				.getAllMetadata([rootFileUri]);

			assert.deepStrictEqual(
				metadata,
				[{
					uri: rootFileUri,
					metadata: {
						description: 'Root prompt description.',
						tools: ['my-tool1'],
						mode: 'agent',
						applyTo: undefined,
					},
					children: [
						{
							uri: URI.joinPath(rootFolderUri, 'folder1/file3.prompt.md'),
							metadata: {
								description: undefined,
								applyTo: undefined,
								tools: ['my-tool1'],
								mode: 'agent',
							},
							children: [
								{
									uri: URI.joinPath(rootFolderUri, 'folder1/some-other-folder/yetAnotherFolder🤭/another-file.instructions.md'),
									metadata: {
										description: 'Another file description.',
										tools: ['my-tool3', 'my-tool2'],
										mode: 'agent',
										applyTo: '**/*.tsx',
									},
									children: undefined,
								},
							],
						},
						{
							uri: URI.joinPath(rootFolderUri, 'folder1/some-other-folder/file4.prompt.md'),
							metadata: {
								tools: ['my-tool1', 'my-tool2'],
								description: 'File 4 splendid description.',
								applyTo: undefined,
								mode: 'agent',
							},
							children: undefined,
						}
					],
				}],
			);
		});
	});

	suite('• findInstructionFilesFor', () => {
		teardown(() => {
			sinon.restore();
		});

		test('• finds correct instruction files', async () => {
			const rootFolderName = 'finds-instruction-files';
			const rootFolder = `/${rootFolderName}`;
			const rootFolderUri = URI.file(rootFolder);

			const userPromptsFolderName = '/tmp/user-data/prompts';
			const userPromptsFolderUri = URI.file(userPromptsFolderName);

			sinon.stub(service, 'listPromptFiles')
				.returns(Promise.resolve([
					// local instructions
					{
						uri: URI.joinPath(rootFolderUri, '.github/prompts/file1.instructions.md'),
						storage: 'local',
						type: 'instructions',
					},
					{
						uri: URI.joinPath(rootFolderUri, '.github/prompts/file2.instructions.md'),
						storage: 'local',
						type: 'instructions',
					},
					{
						uri: URI.joinPath(rootFolderUri, '.github/prompts/file3.instructions.md'),
						storage: 'local',
						type: 'instructions',
					},
					{
						uri: URI.joinPath(rootFolderUri, '.github/prompts/file4.instructions.md'),
						storage: 'local',
						type: 'instructions',
					},
					// user instructions
					{
						uri: URI.joinPath(userPromptsFolderUri, 'file10.instructions.md'),
						storage: 'user',
						type: 'instructions',
					},
					{
						uri: URI.joinPath(userPromptsFolderUri, 'file11.instructions.md'),
						storage: 'user',
						type: 'instructions',
					},
				]));

			// mock current workspace file structure
			await (instaService.createInstance(MockFilesystem,
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
							name: '.github/prompts',
							children: [
								{
									name: 'file1.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 1.\'',
										'applyTo: "**/*.tsx"',
										'---',
										'Some instructions 1 contents.',
									],
								},
								{
									name: 'file2.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 2.\'',
										'applyTo: "**/folder1/*.tsx"',
										'---',
										'Some instructions 2 contents.',
									],
								},
								{
									name: 'file3.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 3.\'',
										'applyTo: "**/folder2/*.tsx"',
										'---',
										'Some instructions 3 contents.',
									],
								},
								{
									name: 'file4.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 4.\'',
										'applyTo: "src/build/*.tsx"',
										'---',
										'Some instructions 4 contents.',
									],
								},
								{
									name: 'file5.prompt.md',
									contents: [
										'---',
										'description: \'Prompt file 5.\'',
										'---',
										'Some prompt 5 contents.',
									],
								},
							],
						},
						{
							name: 'folder1',
							children: [
								{
									name: 'main.tsx',
									contents: 'console.log("Haalou!")',
								},
							],
						},
					],
				}])).mock();

			// mock user data instructions
			await (instaService.createInstance(MockFilesystem, [
				{
					name: userPromptsFolderName,
					children: [
						{
							name: 'file10.instructions.md',
							contents: [
								'---',
								'description: \'Instructions file 10.\'',
								'applyTo: "**/folder1/*.tsx"',
								'---',
								'Some instructions 10 contents.',
							],
						},
						{
							name: 'file11.instructions.md',
							contents: [
								'---',
								'description: \'Instructions file 11.\'',
								'applyTo: "**/folder1/*.py"',
								'---',
								'Some instructions 11 contents.',
							],
						},
						{
							name: 'file12.prompt.md',
							contents: [
								'---',
								'description: \'Prompt file 12.\'',
								'---',
								'Some prompt 12 contents.',
							],
						},
					],
				}
			])).mock();

			const instructions = await service
				.findInstructionFilesFor([
					URI.joinPath(rootFolderUri, 'folder1/main.tsx'),
				]);

			assert.deepStrictEqual(
				instructions.map(pick('path')),
				[
					// local instructions
					URI.joinPath(rootFolderUri, '.github/prompts/file1.instructions.md').path,
					URI.joinPath(rootFolderUri, '.github/prompts/file2.instructions.md').path,
					// user instructions
					URI.joinPath(userPromptsFolderUri, 'file10.instructions.md').path,
				],
				'Must find correct instruction files.',
			);
		});

		test('• does not have duplicates', async () => {
			const rootFolderName = 'finds-instruction-files-without-duplicates';
			const rootFolder = `/${rootFolderName}`;
			const rootFolderUri = URI.file(rootFolder);

			const userPromptsFolderName = '/tmp/user-data/prompts';
			const userPromptsFolderUri = URI.file(userPromptsFolderName);

			sinon.stub(service, 'listPromptFiles')
				.returns(Promise.resolve([
					// local instructions
					{
						uri: URI.joinPath(rootFolderUri, '.github/prompts/file1.instructions.md'),
						storage: 'local',
						type: 'instructions',
					},
					{
						uri: URI.joinPath(rootFolderUri, '.github/prompts/file2.instructions.md'),
						storage: 'local',
						type: 'instructions',
					},
					{
						uri: URI.joinPath(rootFolderUri, '.github/prompts/file3.instructions.md'),
						storage: 'local',
						type: 'instructions',
					},
					{
						uri: URI.joinPath(rootFolderUri, '.github/prompts/file4.instructions.md'),
						storage: 'local',
						type: 'instructions',
					},
					// user instructions
					{
						uri: URI.joinPath(userPromptsFolderUri, 'file10.instructions.md'),
						storage: 'user',
						type: 'instructions',
					},
					{
						uri: URI.joinPath(userPromptsFolderUri, 'file11.instructions.md'),
						storage: 'user',
						type: 'instructions',
					},
				]));

			// mock current workspace file structure
			await (instaService.createInstance(MockFilesystem,
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
							name: '.github/prompts',
							children: [
								{
									name: 'file1.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 1.\'',
										'applyTo: "**/*.tsx"',
										'---',
										'Some instructions 1 contents.',
									],
								},
								{
									name: 'file2.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 2.\'',
										'applyTo: "**/folder1/*.tsx"',
										'---',
										'Some instructions 2 contents. [](./file1.instructions.md)',
									],
								},
								{
									name: 'file3.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 3.\'',
										'applyTo: "**/folder2/*.tsx"',
										'---',
										'Some instructions 3 contents.',
									],
								},
								{
									name: 'file4.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 4.\'',
										'applyTo: "src/build/*.tsx"',
										'---',
										'[](./file3.instructions.md) Some instructions 4 contents.',
									],
								},
								{
									name: 'file5.prompt.md',
									contents: [
										'---',
										'description: \'Prompt file 5.\'',
										'---',
										'Some prompt 5 contents.',
									],
								},
							],
						},
						{
							name: 'folder1',
							children: [
								{
									name: 'main.tsx',
									contents: 'console.log("Haalou!")',
								},
							],
						},
					],
				}])).mock();

			// mock user data instructions
			await (instaService.createInstance(MockFilesystem, [
				{
					name: userPromptsFolderName,
					children: [
						{
							name: 'file10.instructions.md',
							contents: [
								'---',
								'description: \'Instructions file 10.\'',
								'applyTo: "**/folder1/*.tsx"',
								'---',
								'Some instructions 10 contents.',
							],
						},
						{
							name: 'file11.instructions.md',
							contents: [
								'---',
								'description: \'Instructions file 11.\'',
								'applyTo: "**/folder1/*.py"',
								'---',
								'Some instructions 11 contents.',
							],
						},
						{
							name: 'file12.prompt.md',
							contents: [
								'---',
								'description: \'Prompt file 12.\'',
								'---',
								'Some prompt 12 contents.',
							],
						},
					],
				}
			])).mock();

			const instructions = await service
				.findInstructionFilesFor([
					URI.joinPath(rootFolderUri, 'folder1/main.tsx'),
					URI.joinPath(rootFolderUri, 'folder1/index.tsx'),
					URI.joinPath(rootFolderUri, 'folder1/constants.tsx'),
				]);

			assert.deepStrictEqual(
				instructions.map(pick('path')),
				[
					// local instructions
					URI.joinPath(rootFolderUri, '.github/prompts/file1.instructions.md').path,
					URI.joinPath(rootFolderUri, '.github/prompts/file2.instructions.md').path,
					// user instructions
					URI.joinPath(userPromptsFolderUri, 'file10.instructions.md').path,
				],
				'Must find correct instruction files.',
			);
		});
	});
});
