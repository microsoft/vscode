/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createURI } from '../testUtils/createUri.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { ExpectedReference } from '../testUtils/expectedReference.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { OpenFailed } from '../../../../common/promptFileReferenceErrors.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { randomBoolean } from '../../../../../../../base/test/common/testUtils.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { ExpectedDiagnosticWarning, TExpectedDiagnostic } from '../testUtils/expectedDiagnostic.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TextModelPromptParser } from '../../../../common/promptSyntax/parsers/textModelPromptParser.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { PromptToolsMetadata } from '../../../../common/promptSyntax/parsers/promptHeader/metadata/tools.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

/**
 * Test helper to run unit tests for the {@link TextModelPromptParser}
 * class using different test input parameters
 */
class TextModelPromptParserTest extends Disposable {
	/**
	 * Underlying text model of the parser.
	 */
	public readonly model: ITextModel;

	/**
	 * The parser instance.
	 */
	public readonly parser: TextModelPromptParser;

	constructor(
		uri: URI,
		initialContents: string[],
		@IFileService fileService: IFileService,
		@IInstantiationService initService: IInstantiationService,
	) {
		super();

		// create in-memory file system for this test instance
		const fileSystemProvider = this._register(new InMemoryFileSystemProvider());
		this._register(fileService.registerProvider(Schemas.file, fileSystemProvider));

		// both line endings should yield the same results
		const lineEnding = (randomBoolean()) ? '\r\n' : '\n';

		// create the underlying model
		this.model = this._register(
			createTextModel(
				initialContents.join(lineEnding),
				'fooLang',
				undefined,
				uri,
			),
		);

		// create the parser instance
		this.parser = this._register(
			initService.createInstance(TextModelPromptParser, this.model, []),
		).start();
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
			const reference = references[i];

			assertDefined(
				reference,
				`Expected reference #${i} be ${expectedReferences[i]}, got 'undefined'.`,
			);

			expectedReferences[i].validateEqual(reference);
		}

		assert.strictEqual(
			expectedReferences.length,
			references.length,
			`[${this.model.uri}] Unexpected number of references.`,
		);
	}

	/**
	 * Validate list of diagnostic objects of the prompt header.
	 */
	public async validateHeaderDiagnostics(
		expectedDiagnostics: readonly TExpectedDiagnostic[],
	) {
		await this.parser.allSettled();

		const { header } = this.parser;
		assertDefined(
			header,
			'Prompt header must be defined.',
		);
		const { diagnostics } = header;

		for (let i = 0; i < expectedDiagnostics.length; i++) {
			const diagnostic = diagnostics[i];

			assertDefined(
				diagnostic,
				`Expected diagnostic #${i} be ${expectedDiagnostics[i]}, got 'undefined'.`,
			);

			expectedDiagnostics[i].validateEqual(diagnostic);
		}

		assert.strictEqual(
			expectedDiagnostics.length,
			diagnostics.length,
			`Expected '${expectedDiagnostics.length}' diagnostic objects, got '${diagnostics.length}'.`,
		);
	}
}

suite('TextModelPromptParser', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	setup(async () => {
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IFileService, disposables.add(instantiationService.createInstance(FileService)));
	});

	/**
	 * Create a new test instance with provided input parameters.
	 */
	const createTest = (
		uri: URI,
		initialContents: string[],
	): TextModelPromptParserTest => {
		return disposables.add(
			instantiationService.createInstance(
				TextModelPromptParserTest,
				uri,
				initialContents,
			),
		);
	};

	test('• core logic #1', async () => {
		const test = createTest(
			createURI('/foo/bar.md'),
			[
				/* 01 */"The quick brown fox tries #file:/abs/path/to/file.md online yoga for the first time.",
				/* 02 */"Maria discovered a stray turtle roaming in her kitchen.",
				/* 03 */"Why did the robot write a poem about existential dread?",
				/* 04 */"Sundays are made for two things: pancakes and procrastination.",
				/* 05 */"Sometimes, the best code is the one you never have to write.",
				/* 06 */"A lone kangaroo once hopped into the local cafe, seeking free Wi-Fi.",
				/* 07 */"Critical #file:./folder/binary.file thinking is like coffee; best served strong [md link](/etc/hosts/random-file.txt) and without sugar.",
				/* 08 */"Music is the mind's way of doodling in the air.",
				/* 09 */"Stargazing is just turning your eyes into cosmic explorers.",
				/* 10 */"Never trust a balloon salesman who hates birthdays.",
				/* 11 */"Running backward can be surprisingly enlightening.",
				/* 12 */"There's an art to whispering loudly.",
			],
		);

		await test.validateReferences([
			new ExpectedReference({
				uri: createURI('/abs/path/to/file.md'),
				text: '#file:/abs/path/to/file.md',
				path: '/abs/path/to/file.md',
				startLine: 1,
				startColumn: 27,
				pathStartColumn: 33,
				childrenOrError: new OpenFailed(createURI('/abs/path/to/file.md'), 'File not found.'),
			}),
			new ExpectedReference({
				uri: createURI('/foo/folder/binary.file'),
				text: '#file:./folder/binary.file',
				path: './folder/binary.file',
				startLine: 7,
				startColumn: 10,
				pathStartColumn: 16,
				childrenOrError: new OpenFailed(createURI('/foo/folder/binary.file'), 'File not found.'),
			}),
			new ExpectedReference({
				uri: createURI('/etc/hosts/random-file.txt'),
				text: '[md link](/etc/hosts/random-file.txt)',
				path: '/etc/hosts/random-file.txt',
				startLine: 7,
				startColumn: 81,
				pathStartColumn: 91,
				childrenOrError: new OpenFailed(createURI('/etc/hosts/random-file.txt'), 'File not found.'),
			}),
		]);
	});

	test('• core logic #2', async () => {
		const test = createTest(
			createURI('/absolute/folder/and/a/filename.txt'),
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
		);

		await test.validateReferences([
			new ExpectedReference({
				uri: createURI('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
				text: '[link text](./foo-bar-baz/another-file.ts)',
				path: './foo-bar-baz/another-file.ts',
				startLine: 3,
				startColumn: 43,
				pathStartColumn: 55,
				childrenOrError: new OpenFailed(createURI('/absolute/folder/and/a/foo-bar-baz/another-file.ts'), 'File not found.'),
			}),
			new ExpectedReference({
				uri: createURI('/absolute/c/file_name.prompt.md'),
				text: '[caption](../../../c/file_name.prompt.md)',
				path: '../../../c/file_name.prompt.md',
				startLine: 6,
				startColumn: 7,
				pathStartColumn: 17,
				childrenOrError: new OpenFailed(createURI('/absolute/c/file_name.prompt.md'), 'File not found.'),
			}),
			new ExpectedReference({
				uri: createURI('/absolute/folder/main.rs'),
				text: '#file:../../main.rs',
				path: '../../main.rs',
				startLine: 11,
				startColumn: 36,
				pathStartColumn: 42,
				childrenOrError: new OpenFailed(createURI('/absolute/folder/main.rs'), 'File not found.'),
			}),
			new ExpectedReference({
				uri: createURI('/absolute/folder/and/a/samefile.jpeg'),
				text: '#file:./somefolder/../samefile.jpeg',
				path: './somefolder/../samefile.jpeg',
				startLine: 11,
				startColumn: 56,
				pathStartColumn: 62,
				childrenOrError: new OpenFailed(createURI('/absolute/folder/and/a/samefile.jpeg'), 'File not found.'),
			}),
		]);
	});

	suite('• header', () => {
		test('• has correct metadata', async function () {
			const test = createTest(
				createURI('/absolute/folder/and/a/filename.txt'),
				[
					/* 01 */"---",
					/* 02 */"	something: true", /* unknown metadata record */
					/* 03 */"	tools: [ 'tool_name1', \"tool_name2\", 'tool_name1', true, false, '', 'tool_name2' ]\t\t",
					/* 04 */"	tools: [ 'tool_name3', \"tool_name4\" ]", /* duplicate `tools` record is ignored */
					/* 05 */"	tools: 'tool_name5'", /* duplicate `tools` record with invalid value is ignored */
					/* 06 */"---",
					/* 07 */"The cactus on my desk has a thriving Instagram account.",
					/* 08 */"Midnight snacks are the secret to eternal [text](./foo-bar-baz/another-file.ts) happiness.",
					/* 09 */"In an alternate universe, pigeons deliver sushi by drone.",
					/* 10 */"Lunar rainbows only appear when you sing in falsetto.",
					/* 11 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
				],
			);

			await test.validateReferences([
				new ExpectedReference({
					uri: createURI('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
					text: '[text](./foo-bar-baz/another-file.ts)',
					path: './foo-bar-baz/another-file.ts',
					startLine: 8,
					startColumn: 43,
					pathStartColumn: 50,
					childrenOrError: new OpenFailed(createURI('/absolute/folder/and/a/foo-bar-baz/another-file.ts'), 'File not found.'),
				}),
			]);

			const { header } = test.parser;
			assertDefined(
				header,
				'Prompt header must be defined.',
			);

			assert.strictEqual(
				header.metadata.length,
				1,
				'Prompt header must have 1 metadata record.',
			);

			const tools = header.metadata[0];
			assert(
				tools instanceof PromptToolsMetadata,
				`Prompt header must have tools metadata record, got '${tools}'.`,
			);

			assert.strictEqual(
				tools.toolNames.length,
				2,
				`Prompt header tools metadata must have 2 tool names, got '[${tools.toolNames.join(', ')}]'.`,
			);

			assert.deepStrictEqual(
				tools.toolNames,
				['tool_name1', 'tool_name2'],
				`Prompt header must have correct tools metadata.`,
			);
		});

		test('• has correct diagnostics', async function () {
			const test = createTest(
				createURI('/absolute/folder/and/a/filename.txt'),
				[
					/* 01 */"---",
					/* 02 */"	something: true", /* unknown metadata record */
					/* 03 */"tools: [ 'tool_name1', \"tool_name2\", 'tool_name1', true, false, '', ,'tool_name2' ] ",
					/* 04 */"  tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ", /* duplicate `tools` record is ignored */
					/* 05 */"tools: 'tool_name5'", /* duplicate `tools` record with invalid value is ignored */
					/* 06 */"---",
					/* 07 */"The cactus on my desk has a thriving Instagram account.",
					/* 08 */"Midnight snacks are the secret to eternal [text](./foo-bar-baz/another-file.ts) happiness.",
					/* 09 */"In an alternate universe, pigeons deliver sushi by drone.",
					/* 10 */"Lunar rainbows only appear when you sing in falsetto.",
					/* 11 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
				],
			);

			await test.validateReferences([
				new ExpectedReference({
					uri: createURI('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
					text: '[text](./foo-bar-baz/another-file.ts)',
					path: './foo-bar-baz/another-file.ts',
					startLine: 8,
					startColumn: 43,
					pathStartColumn: 50,
					childrenOrError: new OpenFailed(createURI('/absolute/folder/and/a/foo-bar-baz/another-file.ts'), 'File not found.'),
				}),
			]);

			const { header } = test.parser;
			assertDefined(
				header,
				'Prompt header must be defined.',
			);

			assert.strictEqual(
				header.metadata.length,
				1,
				'Prompt header must have 1 metadata record.',
			);

			const tools = header.metadata[0];
			assert(
				tools instanceof PromptToolsMetadata,
				`Prompt header must have tools metadata record, got '${tools}'.`,
			);

			await test.validateHeaderDiagnostics([
				new ExpectedDiagnosticWarning(
					new Range(2, 2, 2, 2 + 15),
					'Unknown metadata record \'something\' will be ignored.',
				),
				new ExpectedDiagnosticWarning(
					new Range(3, 38, 3, 38 + 12),
					'Duplicate tool name \'tool_name1\'.',
				),
				new ExpectedDiagnosticWarning(
					new Range(3, 52, 3, 52 + 4),
					'Expected a tool name (string), got \'true\'.',
				),
				new ExpectedDiagnosticWarning(
					new Range(3, 58, 3, 58 + 5),
					'Expected a tool name (string), got \'false\'.',
				),
				new ExpectedDiagnosticWarning(
					new Range(3, 65, 3, 65 + 2),
					'Tool name cannot be empty.',
				),
				new ExpectedDiagnosticWarning(
					new Range(3, 70, 3, 70 + 12),
					'Duplicate tool name \'tool_name2\'.',
				),
				new ExpectedDiagnosticWarning(
					new Range(4, 3, 4, 3 + 37),
					'Duplicate metadata record \'tools\' will be ignored.',
				),
				new ExpectedDiagnosticWarning(
					new Range(5, 1, 5, 1 + 19),
					'Duplicate metadata record \'tools\' will be ignored.',
				),
			]);
		});
	});

	test('• gets disposed with the model', async () => {
		const test = createTest(
			createURI('/some/path/file.prompt.md'),
			[
				'line1',
				'line2',
				'line3',
			],
		);

		// no references in the model contents
		await test.validateReferences([]);

		test.model.dispose();

		assert(
			test.parser.disposed,
			'The parser should be disposed with its model.',
		);
	});

	test('• toString() implementation', async () => {
		const modelUri = createURI('/Users/legomushroom/repos/prompt-snippets/README.md');
		const test = createTest(
			modelUri,
			[
				'line1',
				'line2',
				'line3',
			],
		);

		assert.strictEqual(
			test.parser.toString(),
			`text-model-prompt:${modelUri.path}`,
			'The parser should provide correct `toString()` implementation.',
		);
	});
});
