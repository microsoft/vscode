/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createURI } from '../testUtils/createUri.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { waitRandom } from '../../../../../../../base/test/common/testUtils.js';
import { IPromptsService } from '../../../../common/promptSyntax/service/types.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IPromptFileReference } from '../../../../common/promptSyntax/parsers/types.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { PromptsService } from '../../../../common/promptSyntax/service/promptsService.js';
import { TextModelPromptParser } from '../../../../common/promptSyntax/parsers/textModelPromptParser.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
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
	let instantiationService: TestInstantiationService;

	setup(async () => {
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IFileService, disposables.add(instantiationService.createInstance(FileService)));

		service = disposables.add(instantiationService.createInstance(PromptsService));
	});

	suite('• getParserFor', () => {
		test('• provides cached parser instance', async () => {
			const langId = 'fooLang';

			/**
			 * Create a text model, get a parser for it, and perform basic assertions.
			 */

			const model1 = disposables.add(createTextModel(
				'test1\n\t#file:./file.md\n\n\n   [bin file](/root/tmp.bin)\t\n',
				langId,
				undefined,
				createURI('/Users/vscode/repos/test/file1.txt'),
			));

			const parser1 = service.getSyntaxParserFor(model1);
			assert.strictEqual(
				parser1.uri.toString(),
				model1.uri.toString(),
				'Must create parser1 with the correct URI.',
			);

			assert(
				!parser1.disposed,
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
						createURI('/Users/vscode/repos/test/file.md'),
						new Range(2, 2, 2, 2 + 15),
						new Range(2, 8, 2, 8 + 9),
					),
					new ExpectedLink(
						createURI('/root/tmp.bin'),
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
				langId,
				undefined,
				createURI('/Users/vscode/repos/test/some-folder/file.md'),
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
				!parser2.disposed,
				'Parser2 must not be disposed.',
			);

			assert(
				parser2 instanceof TextModelPromptParser,
				'Parser2 must be an instance of TextModelPromptParser.',
			);

			assert(
				!parser2.disposed,
				'Parser2 must not be disposed.',
			);

			assert(
				!parser1.disposed,
				'Parser1 must not be disposed.',
			);

			assert(
				!parser1_1.disposed,
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
						createURI('/absolute/path.txt'),
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
						createURI('/Users/vscode/repos/test/file.md'),
						new Range(2, 2, 2, 2 + 15),
						new Range(2, 8, 2, 8 + 9),
					),
					new ExpectedLink(
						createURI('/root/tmp.bin'),
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
				parser1.disposed,
				'Parser1 must be disposed.',
			);

			assert(
				parser1_1.disposed,
				'Parser1_1 must be disposed.',
			);

			assert(
				!parser2.disposed,
				'Parser2 must not be disposed.',
			);


			/**
			 * Get parser for the first model again. Confirm that we get
			 * a new non-disposed parser object back with correct properties.
			 */

			const parser1_2 = service.getSyntaxParserFor(model1);

			assert(
				!parser1_2.disposed,
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
						createURI('/Users/vscode/repos/test/file.md'),
						new Range(2, 2, 2, 2 + 15),
						new Range(2, 8, 2, 8 + 9),
					),
					new ExpectedLink(
						createURI('/root/tmp.bin'),
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
				parser2.disposed,
				'Parser2 must be disposed.',
			);

			// sanity check that the other parser is not affected
			assert(
				!parser1_2.disposed,
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
				langId,
				undefined,
				createURI('/Users/vscode/repos/test/some-folder/file.md'),
			));
			const parser2_1 = service.getSyntaxParserFor(model2_1);

			assert(
				!parser2_1.disposed,
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
						createURI('/absolute/path.txt'),
						new Range(1, 11, 1, 11 + 24),
						new Range(1, 17, 1, 17 + 18),
					),
					// the second link is new
					new ExpectedLink(
						createURI('/Users/vscode/repos/test/some-folder/.copilot/prompts/test.prompt.md'),
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
				createURI('/repos/test/file1.txt'),
			));

			const parser = service.getSyntaxParserFor(model);

			// sanity checks
			assert(
				!parser.disposed,
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
						createURI('/repos/file.md'),
						new Range(1, 4, 1, 4 + 16),
						new Range(1, 10, 1, 10 + 10),
					),
					new ExpectedLink(
						createURI('/Users/root/tmp/file2.txt'),
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
						createURI('/repos/file.md'),
						new Range(1, 4, 1, 4 + 16),
						new Range(1, 10, 1, 10 + 10),
					),
					// link2 changed in the file name only
					new ExpectedLink(
						createURI('/Users/root/tmp/file3.txt'),
						new Range(4, 3, 4, 3 + 41),
						new Range(4, 18, 4, 18 + 25),
					),
				],
			);
		});

		test('• throws if disposed model provided', async function () {
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
});
