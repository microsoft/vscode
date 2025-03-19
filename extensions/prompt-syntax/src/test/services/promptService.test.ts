/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from 'vscode-uri';
import { TextDocument, Uri, window } from 'vscode';

import { services } from '../../services';
import { assertDefined } from '../../utils/asserts';
import { IRange, Range, VSBuffer } from '../../utils/vscode';
import { randomBoolean } from '../../utils/randomBoolean';
import { IFileSystemService } from '../../services/types';
import { IPromptFileReference } from '../../parsers/types';
import { TextDocumentPromptParser } from '../../parsers/textDocumentPromptParser';
import { createTestFolder } from '../testUtils';
import { waitRandom } from '../../utils/wait';

/**
 * TODO: @legomushroom
 */
const createTextDocument = async (
	uri: URI,
	content: readonly string[],
	filesystemService: IFileSystemService,
): Promise<TextDocument> => {
	// both line endings should yield the same results
	const lineEnding = (randomBoolean()) ? '\r\n' : '\n';
	const contentString = content.join(lineEnding);

	// TODO: @legomushroom - do we need this?
	// create file with provided initial contents
	await filesystemService.writeFile(
		uri,
		VSBuffer.fromString(contentString).buffer,
	);

	const editor = await window.showTextDocument(uri);

	return editor.document;
};

/**
 * Get a string representation of a range.
 */
const rangeToString = (range: IRange) => {
	return '[' + range.startLineNumber + ',' + range.startColumn + ' -> ' + range.endLineNumber + ',' + range.endColumn + ']';
};

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
			`Full range must be '${rangeToString(this.fullRange)}', got '${rangeToString(link.range)}'.`,
		);

		assertDefined(
			link.linkRange,
			'Link must have a link range.',
		);

		assert(
			this.linkRange.equalsRange(link.linkRange),
			`Link range must be '${rangeToString(this.linkRange)}', got '${rangeToString(link.linkRange)}'.`,
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
	const { promptService, filesystemService } = services;

	suite('• getTokensStreamFor', () => {
		const testsRootFolder = createTestFolder('prompt-service-test');

		test('• provides cached stream instance', async () => {
			const testFolder = Uri.joinPath(testsRootFolder, 'getTokensStreamFor/cached-stream-instance');

			assert(
				((await services.filesystemService.exists(testFolder)) === false),
				`Test folder '${testFolder.path}' should not exist before test starts.`,
			);

			await filesystemService.createDirectory(testFolder);

			/**
			 * Create a text model, get a parser for it, and perform basic assertions.
			 */

			const document1 = await createTextDocument(
				Uri.joinPath(testFolder, 'file1.txt'),
				[
					'test1',
					'\t#file:./file.md',
					'',
					'',
					'   [bin file](/root/tmp.bin)\t',
				],
				filesystemService,
			);

			const stream1 = promptService.getTokensStreamFor(document1);
			assert.strictEqual(
				stream1.uri.toString(),
				document1.uri.toString(),
				'Must create stream1 with the correct URI.',
			);

			assert(
				(stream1.disposed === false),
				'Stream1 must not be disposed.',
			);

			assert(
				stream1 instanceof TextDocumentPromptParser,
				'Stream1 must be an instance of `TextDocumentPromptParser`.',
			);

			/**
			 * Validate that all links of the model are correctly parsed.
			 */

			await stream1.settled();
			assertLinks(
				stream1.allReferences,
				[
					new ExpectedLink(
						Uri.joinPath(testFolder, 'file.md'),
						new Range(2, 2, 2, 2 + 15),
						new Range(2, 8, 2, 8 + 9),
					),
					new ExpectedLink(
						Uri.file('/root/tmp.bin'),
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
			const stream1_1 = promptService.getTokensStreamFor(document1);
			assert.strictEqual(
				stream1,
				stream1_1,
				'Must return the same stream object.',
			);

			assert.strictEqual(
				stream1_1.uri.toString(),
				document1.uri.toString(),
				'Must create stream1_1 with the correct URI.',
			);

			// TODO: @legomushroom - finish the test

			// /**
			//  * Get parser for a different model and perform basic assertions.
			//  */

			// const model2 = createTextModel(
			// 	'some text #file:/absolute/path.txt  \t\ntest-text2',
			// 	langId,
			// 	undefined,
			// 	Uri.file('/Users/vscode/repos/test/some-folder/file.md'),
			// );

			// // wait for some random amount of time
			// await waitRandom(5);

			// const parser2 = service.getTokensStreamFor(model2);

			// assert.strictEqual(
			// 	parser2.uri.toString(),
			// 	model2.uri.toString(),
			// 	'Must create parser2 with the correct URI.',
			// );

			// assert(
			// 	!parser2.disposed,
			// 	'Parser2 must not be disposed.',
			// );

			// assert(
			// 	parser2 instanceof TextDocumentPromptParser,
			// 	'Parser2 must be an instance of TextDocumentPromptParser.',
			// );

			// assert(
			// 	!parser2.disposed,
			// 	'Parser2 must not be disposed.',
			// );

			// assert(
			// 	!stream1.disposed,
			// 	'stream1 must not be disposed.',
			// );

			// assert(
			// 	!stream1_1.disposed,
			// 	'stream1_1 must not be disposed.',
			// );

			// /**
			//  * Validate that all links of the model 2 are correctly parsed.
			//  */

			// await parser2.settled();

			// assert.notStrictEqual(
			// 	stream1.uri.toString(),
			// 	parser2.uri.toString(),
			// 	'Parser2 must have its own URI.',
			// );

			// assertLinks(
			// 	parser2.allReferences,
			// 	[
			// 		new ExpectedLink(
			// 			Uri.file('/absolute/path.txt'),
			// 			new Range(1, 11, 1, 11 + 24),
			// 			new Range(1, 17, 1, 17 + 18),
			// 		),
			// 	],
			// );

			// /**
			//  * Validate the first parser was not affected by the presence
			//  * of the second parser.
			//  */

			// await stream1_1.settled();

			// // stream1_1 has the same exact links as before
			// assertLinks(
			// 	stream1_1.allReferences,
			// 	[
			// 		new ExpectedLink(
			// 			Uri.file('/Users/vscode/repos/test/file.md'),
			// 			new Range(2, 2, 2, 2 + 15),
			// 			new Range(2, 8, 2, 8 + 9),
			// 		),
			// 		new ExpectedLink(
			// 			Uri.file('/root/tmp.bin'),
			// 			new Range(5, 4, 5, 4 + 25),
			// 			new Range(5, 15, 5, 15 + 13),
			// 		),
			// 	],
			// );

			// // wait for some random amount of time
			// await waitRandom(5);

			// /**
			//  * Dispose the first parser, perform basic validations, and confirm
			//  * that the second parser is not affected by the disposal of the first one.
			//  */
			// stream1.dispose();

			// assert(
			// 	stream1.disposed,
			// 	'stream1 must be disposed.',
			// );

			// assert(
			// 	stream1_1.disposed,
			// 	'stream1_1 must be disposed.',
			// );

			// assert(
			// 	!parser2.disposed,
			// 	'Parser2 must not be disposed.',
			// );


			// /**
			//  * Get parser for the first model again. Confirm that we get
			//  * a new non-disposed parser object back with correct properties.
			//  */

			// const stream1_2 = service.getTokensStreamFor(model1);

			// assert(
			// 	!stream1_2.disposed,
			// 	'stream1_2 must not be disposed.',
			// );

			// assert.notStrictEqual(
			// 	stream1_2,
			// 	stream1,
			// 	'Must create a new parser object for the model1.',
			// );

			// assert.strictEqual(
			// 	stream1_2.uri.toString(),
			// 	model1.uri.toString(),
			// 	'Must create stream1_2 with the correct URI.',
			// );

			// /**
			//  * Validate that the contents of the second parser did not change.
			//  */

			// await stream1_2.settled();

			// // stream1_2 must have the same exact links as before
			// assertLinks(
			// 	stream1_2.allReferences,
			// 	[
			// 		new ExpectedLink(
			// 			Uri.file('/Users/vscode/repos/test/file.md'),
			// 			new Range(2, 2, 2, 2 + 15),
			// 			new Range(2, 8, 2, 8 + 9),
			// 		),
			// 		new ExpectedLink(
			// 			Uri.file('/root/tmp.bin'),
			// 			new Range(5, 4, 5, 4 + 25),
			// 			new Range(5, 15, 5, 15 + 13),
			// 		),
			// 	],
			// );

			// // wait for some random amount of time
			// await waitRandom(5);

			// /**
			//  * This time dispose model of the second parser instead of
			//  * the parser itself. Validate that the parser is disposed too, but
			//  * the newly created first parser is not affected.
			//  */

			// // dispose the `model` of the second parser now
			// model2.dispose();

			// // assert that the parser is also disposed
			// assert(
			// 	parser2.disposed,
			// 	'Parser2 must be disposed.',
			// );

			// // sanity check that the other parser is not affected
			// assert(
			// 	!stream1_2.disposed,
			// 	'stream1_2 must not be disposed.',
			// );

			// /**
			//  * Create a new second parser with new model - we cannot use
			//  * the old one because it was disposed. This new model also has
			//  * a different second link.
			//  */

			// // we cannot use the same model since it was already disposed
			// const model2_1 = createTextModel(
			// 	'some text #file:/absolute/path.txt  \n [caption](.copilot/prompts/test.prompt.md)\t\n\t\n more text',
			// 	langId,
			// 	undefined,
			// 	Uri.file('/Users/vscode/repos/test/some-folder/file.md'),
			// );
			// const parser2_1 = service.getTokensStreamFor(model2_1);

			// assert(
			// 	!parser2_1.disposed,
			// 	'Parser2_1 must not be disposed.',
			// );

			// assert.notStrictEqual(
			// 	parser2_1,
			// 	parser2,
			// 	'Parser2_1 must be a new object.',
			// );

			// assert.strictEqual(
			// 	parser2_1.uri.toString(),
			// 	model2.uri.toString(),
			// 	'Must create parser2_1 with the correct URI.',
			// );

			// /**
			//  * Validate that new model2 contents are parsed correctly.
			//  */

			// await parser2_1.settled();

			// // parser2_1 must have 2 links now
			// assertLinks(
			// 	parser2_1.allReferences,
			// 	[
			// 		// the first link didn't change
			// 		new ExpectedLink(
			// 			Uri.file('/absolute/path.txt'),
			// 			new Range(1, 11, 1, 11 + 24),
			// 			new Range(1, 17, 1, 17 + 18),
			// 		),
			// 		// the second link is new
			// 		new ExpectedLink(
			// 			Uri.file('/Users/vscode/repos/test/some-folder/.copilot/prompts/test.prompt.md'),
			// 			new Range(2, 2, 2, 2 + 42),
			// 			new Range(2, 12, 2, 12 + 31),
			// 		),
			// 	],
			// );
		});

		// test('• auto-updated on model changes', async () => {
		// 	const langId = 'bazLang';

		// 	const model = createTextModel(
		// 		' \t #file:../file.md\ntest1\n\t\n  [another file](/Users/root/tmp/file2.txt)\t\n',
		// 		langId,
		// 		undefined,
		// 		Uri.file('/repos/test/file1.txt'),
		// 	);

		// 	const parser = service.getTokensStreamFor(model);

		// 	// sanity checks
		// 	assert(
		// 		!parser.disposed,
		// 		'Parser must not be disposed.',
		// 	);
		// 	assert(
		// 		parser instanceof TextDocumentPromptParser,
		// 		'Parser must be an instance of TextDocumentPromptParser.',
		// 	);

		// 	await parser.settled();

		// 	assertLinks(
		// 		parser.allReferences,
		// 		[
		// 			new ExpectedLink(
		// 				Uri.file('/repos/file.md'),
		// 				new Range(1, 4, 1, 4 + 16),
		// 				new Range(1, 10, 1, 10 + 10),
		// 			),
		// 			new ExpectedLink(
		// 				Uri.file('/Users/root/tmp/file2.txt'),
		// 				new Range(4, 3, 4, 3 + 41),
		// 				new Range(4, 18, 4, 18 + 25),
		// 			),
		// 		],
		// 	);

		// 	model.applyEdits([
		// 		{
		// 			range: new Range(4, 18, 4, 18 + 25),
		// 			text: '/Users/root/tmp/file3.txt',
		// 		},
		// 	]);

		// 	await parser.settled();

		// 	assertLinks(
		// 		parser.allReferences,
		// 		[
		// 			// link1 didn't change
		// 			new ExpectedLink(
		// 				Uri.file('/repos/file.md'),
		// 				new Range(1, 4, 1, 4 + 16),
		// 				new Range(1, 10, 1, 10 + 10),
		// 			),
		// 			// link2 changed in the file name only
		// 			new ExpectedLink(
		// 				Uri.file('/Users/root/tmp/file3.txt'),
		// 				new Range(4, 3, 4, 3 + 41),
		// 				new Range(4, 18, 4, 18 + 25),
		// 			),
		// 		],
		// 	);
		// });

		// test('• throws if disposed model provided', async function () {
		// 	const model = createTextModel(
		// 		'test1\ntest2\n\ntest3\t\n',
		// 		'barLang',
		// 		undefined,
		// 		URI.parse('./github/prompts/file.prompt.md'),
		// 	);

		// 	// dispose the model before using it
		// 	model.dispose();

		// 	assert.throws(() => {
		// 		service.getTokensStreamFor(model);
		// 	}, 'Cannot create a prompt parser for a disposed model.');
		// });
	});
});
