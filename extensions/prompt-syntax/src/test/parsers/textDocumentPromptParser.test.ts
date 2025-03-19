/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from 'vscode-uri';
import { TextDocument, Uri, window } from 'vscode';

import { services } from '../../services';
import { OpenFailed } from '../../parsers/errors';
import { randomInt } from '../../utils/randomInt';
import { assertDefined } from '../../utils/asserts';
import { randomBoolean } from '../../utils/randomBoolean';
import { createTestFolder, ExpectedReference } from '../testUtils';
import { ObservableDisposable, VSBuffer } from '../../utils/vscode';
import { IFileSystemService, ILogService } from '../../services/types';
import { TextDocumentPromptParser } from '../../parsers/textDocumentPromptParser';

/**
 * Test helper to run unit tests for the {@link TextDocumentPromptParser}
 * class using different test input parameters
 */
class TextDocumentPromptParserTest extends ObservableDisposable {
	/**
	 * Underlying text model of the parser.
	 */
	private _document?: TextDocument;

	/**
	 * The parser instance.
	 */
	private _parser?: TextDocumentPromptParser;

	/**
	 * Underlying parser object.
	 *
	 * @throws if the parser object is not yet initialized.
	 */
	public get parser(): TextDocumentPromptParser {
		assertDefined(
			this._parser,
			'Parser reference is not initialized. Please call `initialize()` first.',
		);

		return this._parser;
	}

	/**
	 * Underlying text document object.
	 *
	 * @throws if the text document object is not yet initialized.
	 */
	private get document(): TextDocument {
		assertDefined(
			this._document,
			'Document reference is not initialized. Please call `initialize()` first.',
		);

		return this._document;
	}

	constructor(
		private readonly uri: URI,
		private readonly initialContents: string[],
		private readonly filesystemService: IFileSystemService,
		private readonly logService: ILogService,
	) {
		super();
	}

	/**
	 * Validate the current state of the parser.
	 */
	public async validateReferences(
		expectedReferences: readonly ExpectedReference[],
	) {
		await this.parser.allSettled();

		const { references } = this.parser;
		for (let i = 0; i < expectedReferences.length; i++) {
			expectedReferences[i].validateEqual(references[i]);
		}

		assert.strictEqual(
			expectedReferences.length,
			references.length,
			`[${this.document.uri}] Unexpected number of references.`,
		);
	}

	/**
	 * Initialize the test instance.
	 */
	public async initialize(): Promise<this> {
		// both line endings should yield the same results
		const lineEnding = (randomBoolean()) ? '\r\n' : '\n';
		const contents = this.initialContents.join(lineEnding);

		// create file with provided initial contents
		await this.filesystemService.writeFile(
			this.uri,
			VSBuffer.fromString(contents).buffer,
		);

		const editor = await window.showTextDocument(this.uri);
		this._document = editor.document;

		// create the parser instance
		this._parser = this._register(
			new TextDocumentPromptParser(this.document, [], this.filesystemService, this.logService)
		).start();

		return this;
	}

	// /**
	//  * TODO: @lego
	//  */
	// public async closeTextDocument() {
	// 	for (const editor of window.visibleTextEditors) {
	// 		if (editor.document === this.document) {
	// 			editor.hide();
	// 			// await commands.executeCommand('workbench.action.closeActiveEditor');
	// 			// await commands.executeCommand('workbench.action.closeAllEditors');
	// 			// await this.filesystemService.delete(this.uri, { recursive: true, useTrash: true });
	// 			return;
	// 		}
	// 	}

	// 	throw new Error(`Failed to find the editor for '${this.document.uri.path}'.`);
	// }

}

/**
 * Create a new test instance with provided input parameters.
 */
const createTest = (
	uri: URI,
	initialContents: string[],
): TextDocumentPromptParserTest => {
	return new TextDocumentPromptParserTest(
		uri,
		initialContents,
		services.filesystemService,
		services.logService,
	);
};

suite('TextDocumentPromptParser', () => {
	const testsRootFolder = createTestFolder('text-document-prompt-parser-test');

	test('core logic #1', async () => {
		const testFolder = Uri.joinPath(testsRootFolder, 'core-logic-1');

		assert(
			(await services.filesystemService.exists(testFolder) === false),
			`Test folder '${testFolder.path}' should not exist before test starts.`,
		);

		const test = await createTest(
			Uri.joinPath(testFolder, `foo/bar-${randomInt(Number.MAX_SAFE_INTEGER)}.md`),
			[
				/* 01 */"The quick brown fox tries #file:/abs/path/to/file.md online yoga for the first time.",
				/* 02 */"Maria discovered a stray turtle roaming in her kitchen.",
				/* 03 */"Why did the robot write a poem about existential dread?",
				/* 04 */"Sundays are made for two things: pancakes and procrastination.",
				/* 05 */"Sometimes, the best code is the one you never have to write.",
				/* 06 */"A lone kangaroo once hopped into the local cafe, seeking free Wi-Fi.",
				/* 07 */"Critical #file:./folder/binary.file thinking is like coffee; best served strong [md link](/etc/hosts/random-file.txt) and without sugar.",
				/* 08 */"Music is the mind’s way of doodling in the air.",
				/* 09 */"Stargazing is just turning your eyes into cosmic explorers.",
				/* 10 */"Never trust a balloon salesman who hates birthdays.",
				/* 11 */"Running backward can be surprisingly enlightening.",
				/* 12 */"There’s an art to whispering loudly.",
			],
		).initialize();

		await test.validateReferences([
			new ExpectedReference({
				uri: Uri.file('/abs/path/to/file.md'),
				text: '#file:/abs/path/to/file.md',
				path: '/abs/path/to/file.md',
				startLine: 1,
				startColumn: 27,
				pathStartColumn: 33,
				childrenOrError: new OpenFailed(Uri.file('/abs/path/to/file.md'), 'File not found.'),
			}),
			new ExpectedReference({
				uri: Uri.joinPath(testFolder, 'foo/folder/binary.file'),
				text: '#file:./folder/binary.file',
				path: './folder/binary.file',
				startLine: 7,
				startColumn: 10,
				pathStartColumn: 16,
				childrenOrError: new OpenFailed(Uri.file('/foo/folder/binary.file'), 'File not found.'),
			}),
			new ExpectedReference({
				uri: Uri.file('/etc/hosts/random-file.txt'),
				text: '[md link](/etc/hosts/random-file.txt)',
				path: '/etc/hosts/random-file.txt',
				startLine: 7,
				startColumn: 81,
				pathStartColumn: 91,
				childrenOrError: new OpenFailed(Uri.file('/etc/hosts/random-file.txt'), 'File not found.'),
			}),
		]);
	});

	test('core logic #2', async () => {
		const testFolder = Uri.joinPath(testsRootFolder, 'core-logic-2');

		assert(
			(await services.filesystemService.exists(testFolder) === false),
			`Test folder '${testFolder.path}' should not exist before test starts.`,
		);

		const test = await createTest(
			Uri.joinPath(testFolder, `absolute/folder/and/a/filename-${randomInt(Number.MAX_SAFE_INTEGER)}.txt`),
			[
				/* 01 */"The penguin wore sunglasses but never left the iceberg.",
				/* 02 */"I once saw a cloud that looked like an antique teapot.",
				/* 03 */"Midnight snacks are the secret to eternal [link text](./foo-bar-baz/another-file.ts) happiness.",
				/* 04 */"A stray sock in the hallway is a sign of chaotic creativity.",
				/* 05 */"Dogs dream in colorful squeaks and belly rubs.",
				/* 06 */"Never [caption](../../../c/file_name.prompt.md)\t underestimate the power of a well-timed nap.",
				/* 07 */"The cactus on my desk has a thriving Instagram account.",
				/* 08 */"In an alternate universe, pigeons deliver sushi by drone.",
				/* 09 */"Lunar rainbows only appear when you sing in falsetto.",
				/* 10 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
				/* 11 */"Sometimes, the best advice comes \t\t#file:../../main.rs\t#file:./somefolder/../samefile.jpeg\tfrom a talking dishwasher.",
				/* 12 */"Paper airplanes believe they can fly until proven otherwise.",
				/* 13 */"A library without stories is just a room full of silent trees.",
				/* 14 */"The invisible cat meows only when it sees a postman.",
				/* 15 */"Code reviews are like detective novels without the plot twists."
			],
		).initialize();

		await test.validateReferences([
			new ExpectedReference({
				uri: Uri.joinPath(testFolder, 'absolute/folder/and/a/foo-bar-baz/another-file.ts'),
				text: '[link text](./foo-bar-baz/another-file.ts)',
				path: './foo-bar-baz/another-file.ts',
				startLine: 3,
				startColumn: 43,
				pathStartColumn: 55,
				childrenOrError: new OpenFailed(Uri.joinPath(testFolder, 'absolute/folder/and/a/foo-bar-baz/another-file.ts'), 'File not found.'),
			}),
			new ExpectedReference({
				uri: Uri.joinPath(testFolder, 'absolute/c/file_name.prompt.md'),
				text: '[caption](../../../c/file_name.prompt.md)',
				path: '../../../c/file_name.prompt.md',
				startLine: 6,
				startColumn: 7,
				pathStartColumn: 17,
				childrenOrError: new OpenFailed(Uri.joinPath(testFolder, 'absolute/c/file_name.prompt.md'), 'File not found.'),
			}),
			new ExpectedReference({
				uri: Uri.joinPath(testFolder, 'absolute/folder/main.rs'),
				text: '#file:../../main.rs',
				path: '../../main.rs',
				startLine: 11,
				startColumn: 36,
				pathStartColumn: 42,
				childrenOrError: new OpenFailed(Uri.joinPath(testFolder, 'absolute/folder/main.rs'), 'File not found.'),
			}),
			new ExpectedReference({
				uri: Uri.joinPath(testFolder, 'absolute/folder/and/a/samefile.jpeg'),
				text: '#file:./somefolder/../samefile.jpeg',
				path: './somefolder/../samefile.jpeg',
				startLine: 11,
				startColumn: 56,
				pathStartColumn: 62,
				childrenOrError: new OpenFailed(Uri.joinPath(testFolder, 'absolute/folder/and/a/samefile.jpeg'), 'File not found.'),
			}),
		]);
	});

	// TODO: @legomushroom - fix the test
	// test('gets disposed with the text document', async () => {
	// 	const testFolder = Uri.joinPath(TESTS_ROOT_FOLDER, 'dispose-test');

	// 	try {
	// 		await services.filesystemService.stat(testFolder);
	// 		await services.filesystemService.delete(testFolder);
	// 	} catch (error) {
	// 		// noop
	// 	}
	// 	const test = await createTest(
	// 		Uri.joinPath(testFolder, `some/path/file-${randomInt(Number.MAX_SAFE_INTEGER)}.prompt.md`),
	// 		[
	// 			'line1',
	// 			'line2',
	// 			'line3',
	// 		],
	// 	).initialize();

	// 	await wait(2000);

	// 	// no references in the text document contents
	// 	await test.validateReferences([]);
	// 	await test.closeTextDocument();

	// 	await wait(1000);

	// 	await services.filesystemService.delete(TESTS_ROOT_FOLDER, { recursive: false, useTrash: false });

	// 	await wait(1000);

	// await wait(50_000);
	// 	await wait(250);

	// 	assert(
	// 		test.parser.disposed,
	// 		'The parser should be disposed with its text document.',
	// 	);
	// });

	test('toString() implementation', async () => {
		const documentUri = Uri.file('/Users/legomushroom/repos/prompt-snippets/README.md');
		const test = await createTest(
			documentUri,
			[
				'line1',
				'line2',
				'line3',
			],
		).initialize();

		assert.strictEqual(
			test.parser.toString(),
			`text-document-prompt:${documentUri.path}`,
			'The parser should provide correct `toString()` implementation.',
		);
	});
});
