/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createURI } from '../testUtils/createUri.js';
import { ChatMode } from '../../../../common/constants.js';
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
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TextModelPromptParser } from '../../../../common/promptSyntax/parsers/textModelPromptParser.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { ExpectedDiagnosticError, ExpectedDiagnosticWarning, TExpectedDiagnostic } from '../testUtils/expectedDiagnostic.js';
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
	 * Wait for the prompt parsing/resolve process to finish.
	 */
	public allSettled(): Promise<TextModelPromptParser> {
		return this.parser.allSettled();
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

			try {
				expectedDiagnostics[i].validateEqual(diagnostic);
			} catch (_error) {
				throw new Error(
					`Expected diagnostic #${i} to be ${expectedDiagnostics[i]}, got '${diagnostic}'.`,
				);
			}
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
		test('• has correct metadata', async () => {
			const test = createTest(
				createURI('/absolute/folder/and/a/filename.txt'),
				[
					/* 01 */"---",
					/* 02 */"description: 'My prompt.'\t\t",
					/* 03 */"	something: true", /* unknown metadata record */
					/* 04 */"	tools: [ 'tool_name1', \"tool_name2\", 'tool_name1', true, false, '', 'tool_name2' ]\t\t",
					/* 05 */"	tools: [ 'tool_name3', \"tool_name4\" ]", /* duplicate `tools` record is ignored */
					/* 06 */"	tools: 'tool_name5'", /* duplicate `tools` record with invalid value is ignored */
					/* 07 */"	mode: 'agent'",
					/* 08 */"---",
					/* 09 */"The cactus on my desk has a thriving Instagram account.",
					/* 10 */"Midnight snacks are the secret to eternal [text](./foo-bar-baz/another-file.ts) happiness.",
					/* 11 */"In an alternate universe, pigeons deliver sushi by drone.",
					/* 12 */"Lunar rainbows only appear when you sing in falsetto.",
					/* 13 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
				],
			);

			await test.validateReferences([
				new ExpectedReference({
					uri: createURI('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
					text: '[text](./foo-bar-baz/another-file.ts)',
					path: './foo-bar-baz/another-file.ts',
					startLine: 10,
					startColumn: 43,
					pathStartColumn: 50,
					childrenOrError: new OpenFailed(createURI('/absolute/folder/and/a/foo-bar-baz/another-file.ts'), 'File not found.'),
				}),
			]);

			const { header, metadata } = test.parser;
			assertDefined(
				header,
				'Prompt header must be defined.',
			);

			const { tools, mode, description } = metadata;
			assert.deepStrictEqual(
				tools,
				['tool_name1', 'tool_name2'],
				`Prompt header must have correct tools metadata.`,
			);

			assert.strictEqual(
				mode,
				'agent',
				`Prompt header must have correct mode metadata.`,
			);

			assert.strictEqual(
				description,
				'My prompt.',
				`Prompt header must have correct description metadata.`,
			);
		});

		suite('• diagnostics', () => {
			test('• core logic', async () => {
				const test = createTest(
					createURI('/absolute/folder/and/a/filename.txt'),
					[
					/* 01 */"---",
					/* 02 */"	description: true \t ",
					/* 03 */"	mode: \"ask\"",
					/* 04 */"	something: true", /* unknown metadata record */
					/* 05 */"tools: [ 'tool_name1', \"tool_name2\", 'tool_name1', true, false, '', ,'tool_name2' ] ",
					/* 06 */"  tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ", /* duplicate `tools` record is ignored */
					/* 07 */"tools: 'tool_name5'", /* duplicate `tools` record with invalid value is ignored */
					/* 08 */"---",
					/* 09 */"The cactus on my desk has a thriving Instagram account.",
					/* 10 */"Midnight snacks are the secret to eternal [text](./foo-bar-baz/another-file.ts) happiness.",
					/* 11 */"In an alternate universe, pigeons deliver sushi by drone.",
					/* 12 */"Lunar rainbows only appear when you sing in falsetto.",
					/* 13 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
					],
				);

				await test.validateReferences([
					new ExpectedReference({
						uri: createURI('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
						text: '[text](./foo-bar-baz/another-file.ts)',
						path: './foo-bar-baz/another-file.ts',
						startLine: 10,
						startColumn: 43,
						pathStartColumn: 50,
						childrenOrError: new OpenFailed(createURI('/absolute/folder/and/a/foo-bar-baz/another-file.ts'), 'File not found.'),
					}),
				]);

				const { header, metadata } = test.parser;
				assertDefined(
					header,
					'Prompt header must be defined.',
				);

				const { tools } = metadata;
				assertDefined(
					tools,
					'Tools metadata must be defined.',
				);

				await test.validateHeaderDiagnostics([
					new ExpectedDiagnosticError(
						new Range(2, 15, 2, 15 + 4),
						'Value of the \'description\' metadata must be \'string\', got \'boolean\'.',
					),
					new ExpectedDiagnosticWarning(
						new Range(4, 2, 4, 2 + 15),
						'Unknown metadata record \'something\' will be ignored.',
					),
					new ExpectedDiagnosticWarning(
						new Range(5, 38, 5, 38 + 12),
						'Duplicate tool name \'tool_name1\'.',
					),
					new ExpectedDiagnosticWarning(
						new Range(5, 52, 5, 52 + 4),
						'Expected a tool name (string), got \'true\'.',
					),
					new ExpectedDiagnosticWarning(
						new Range(5, 58, 5, 58 + 5),
						'Expected a tool name (string), got \'false\'.',
					),
					new ExpectedDiagnosticWarning(
						new Range(5, 65, 5, 65 + 2),
						'Tool name cannot be empty.',
					),
					new ExpectedDiagnosticWarning(
						new Range(5, 70, 5, 70 + 12),
						'Duplicate tool name \'tool_name2\'.',
					),
					new ExpectedDiagnosticWarning(
						new Range(3, 2, 3, 2 + 11),
						'Record \'mode\' is implied to have the \'agent\' value if \'tools\' record is present so the specified value will be ignored.',
					),
					new ExpectedDiagnosticWarning(
						new Range(6, 3, 6, 3 + 37),
						'Duplicate metadata record \'tools\' will be ignored.',
					),
					new ExpectedDiagnosticWarning(
						new Range(7, 1, 7, 1 + 19),
						'Duplicate metadata record \'tools\' will be ignored.',
					),
				]);
			});

			suite('• tools and mode compatibility', () => {
				suite('• tools is set', () => {
					test('• ask mode', async () => {
						const test = createTest(
							createURI('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ", /* duplicate `tools` record is ignored */
					/* 03 */"mode: \"ask\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						const { tools, mode } = metadata;
						assertDefined(
							tools,
							'Tools metadata must be defined.',
						);

						assert.strictEqual(
							mode,
							ChatMode.Agent,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(3, 1, 3, 1 + 11),
								'Record \'mode\' is implied to have the \'agent\' value if \'tools\' record is present so the specified value will be ignored.',
							),
						]);
					});

					test('• edit mode', async () => {
						const test = createTest(
							createURI('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ", /* duplicate `tools` record is ignored */
					/* 03 */"mode: \"edit\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						const { tools, mode } = metadata;
						assertDefined(
							tools,
							'Tools metadata must be defined.',
						);

						assert.strictEqual(
							mode,
							ChatMode.Agent,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(3, 1, 3, 1 + 12),
								'Record \'mode\' is implied to have the \'agent\' value if \'tools\' record is present so the specified value will be ignored.',
							),
						]);
					});

					test('• agent mode', async () => {
						const test = createTest(
							createURI('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ", /* duplicate `tools` record is ignored */
					/* 03 */"mode: \"agent\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						const { tools, mode } = metadata;
						assertDefined(
							tools,
							'Tools metadata must be defined.',
						);

						assert.strictEqual(
							mode,
							ChatMode.Agent,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([]);
					});

					test('• no mode', async () => {
						const test = createTest(
							createURI('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ", /* duplicate `tools` record is ignored */
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						const { tools, mode } = metadata;
						assertDefined(
							tools,
							'Tools metadata must be defined.',
						);

						assert.strictEqual(
							mode,
							ChatMode.Agent,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([]);
					});
				});

				suite('• tools is not set', () => {
					test('• ask mode', async () => {
						const test = createTest(
							createURI('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"description: ['my prompt', 'description.']",
					/* 03 */"mode: \"ask\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						const { tools, mode } = metadata;
						assert(
							tools === undefined,
							'Tools metadata must not be defined.',
						);

						assert.strictEqual(
							mode,
							ChatMode.Ask,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticError(
								new Range(2, 14, 2, 14 + 29),
								'Value of the \'description\' metadata must be \'string\', got \'array\'.',
							),
						]);
					});

					test('• edit mode', async () => {
						const test = createTest(
							createURI('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"description: my prompt description. \t\t  \t\t   ",
					/* 03 */"mode: \"edit\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						const { tools, mode } = metadata;
						assert(
							tools === undefined,
							'Tools metadata must not be defined.',
						);

						assert.strictEqual(
							mode,
							ChatMode.Edit,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticError(
								new Range(2, 1, 2, 1 + 11),
								'Unexpected token \'description\'.',
							),
							new ExpectedDiagnosticError(
								new Range(2, 12, 2, 12 + 2),
								'Unexpected token \': \'.',
							),
							new ExpectedDiagnosticError(
								new Range(2, 14, 2, 14 + 2),
								'Unexpected token \'my\'.',
							),
							new ExpectedDiagnosticError(
								new Range(2, 17, 2, 17 + 6),
								'Unexpected token \'prompt\'.',
							),
							new ExpectedDiagnosticError(
								new Range(2, 24, 2, 24 + 12),
								'Unexpected token \'description.\'.',
							),
						]);
					});

					test('• agent mode', async () => {
						const test = createTest(
							createURI('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"mode: \"agent\"",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						const { tools, mode } = metadata;
						assert(
							tools === undefined,
							'Tools metadata must not be defined.',
						);

						assert.strictEqual(
							mode,
							ChatMode.Agent,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([]);
					});

					test('• no mode', async () => {
						const test = createTest(
							createURI('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"description: 'My prompt.'",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						const { tools, mode } = metadata;
						assert(
							tools === undefined,
							'Tools metadata must not be defined.',
						);

						assert.strictEqual(
							mode,
							ChatMode.Ask,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([]);
					});
				});
			});
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
