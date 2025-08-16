/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChatModeKind } from '../../../../common/constants.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { ExpectedReference } from '../testUtils/expectedReference.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { randomBoolean } from '../../../../../../../base/test/common/testUtils.js';
import { PROMPT_LANGUAGE_ID, INSTRUCTIONS_LANGUAGE_ID, MODE_LANGUAGE_ID, PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { TextModelPromptParser } from '../../../../common/promptSyntax/parsers/textModelPromptParser.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';

import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { ExpectedDiagnosticError, ExpectedDiagnosticWarning, TExpectedDiagnostic } from '../testUtils/expectedDiagnostic.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchEnvironmentService } from '../../../../../../services/environment/common/environmentService.js';


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
		languageId: string = PROMPT_LANGUAGE_ID,
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
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
				languageId,
				undefined,
				uri,
			),
		);

		// create the parser instance
		this.parser = this._register(
			instantiationService.createInstance(TextModelPromptParser, this.model, { allowNonPromptFiles: true, languageId: undefined, updateOnChange: true }),
		).start();
	}

	/**
	 * Wait for the prompt parsing/resolve process to finish.
	 */
	public async allSettled(): Promise<TextModelPromptParser> {
		await this.parser.settled();
		return this.parser;
	}

	/**
	 * Validate the current state of the parser.
	 */
	public async validateReferences(
		expectedReferences: readonly ExpectedReference[],
	) {
		await this.parser.settled();

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
			references.length,
			expectedReferences.length,
			`[${this.model.uri}] Unexpected number of references.`,
		);
	}

	/**
	 * Validate list of diagnostic objects of the prompt header.
	 */
	public async validateHeaderDiagnostics(
		expectedDiagnostics: readonly TExpectedDiagnostic[],
	) {
		await this.parser.settled();

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
			diagnostics.length,
			expectedDiagnostics.length,
			`Expected '${expectedDiagnostics.length}' diagnostic objects, got '${diagnostics.length}: ${diagnostics.map(d => d.message).join(', ')}'.`,
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
		instantiationService.stub(IWorkbenchEnvironmentService, {});
	});

	/**
	 * Create a new test instance with provided input parameters.
	 */
	const createTest = (
		uri: URI,
		initialContents: string[],
		languageId: string = PROMPT_LANGUAGE_ID,
	): TextModelPromptParserTest => {
		return disposables.add(
			instantiationService.createInstance(
				TextModelPromptParserTest,
				uri,
				initialContents,
				languageId,
			),
		);
	};

	test('core logic #1', async () => {
		const test = createTest(
			URI.file('/foo/bar.md'),
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
				uri: URI.file('/abs/path/to/file.md'),
				text: '#file:/abs/path/to/file.md',
				path: '/abs/path/to/file.md',
				startLine: 1,
				startColumn: 27,
				pathStartColumn: 33,
			}),
			new ExpectedReference({
				uri: URI.file('/foo/folder/binary.file'),
				text: '#file:./folder/binary.file',
				path: './folder/binary.file',
				startLine: 7,
				startColumn: 10,
				pathStartColumn: 16,
			}),
			new ExpectedReference({
				uri: URI.file('/etc/hosts/random-file.txt'),
				text: '[md link](/etc/hosts/random-file.txt)',
				path: '/etc/hosts/random-file.txt',
				startLine: 7,
				startColumn: 81,
				pathStartColumn: 91,
			}),
		]);
	});

	test('core logic #2', async () => {
		const test = createTest(
			URI.file('/absolute/folder/and/a/filename.txt'),
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
				uri: URI.file('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
				text: '[link text](./foo-bar-baz/another-file.ts)',
				path: './foo-bar-baz/another-file.ts',
				startLine: 3,
				startColumn: 43,
				pathStartColumn: 55,
			}),
			new ExpectedReference({
				uri: URI.file('/absolute/c/file_name.prompt.md'),
				text: '[caption](../../../c/file_name.prompt.md)',
				path: '../../../c/file_name.prompt.md',
				startLine: 6,
				startColumn: 7,
				pathStartColumn: 17,
			}),
			new ExpectedReference({
				uri: URI.file('/absolute/folder/main.rs'),
				text: '#file:../../main.rs',
				path: '../../main.rs',
				startLine: 11,
				startColumn: 36,
				pathStartColumn: 42,
			}),
			new ExpectedReference({
				uri: URI.file('/absolute/folder/and/a/samefile.jpeg'),
				text: '#file:./somefolder/../samefile.jpeg',
				path: './somefolder/../samefile.jpeg',
				startLine: 11,
				startColumn: 56,
				pathStartColumn: 62,
			}),
		]);
	});

	suite('header', () => {
		suite('metadata', () => {
			suite('instructions', () => {
				test(`empty header`, async () => {
					const test = createTest(
						URI.file('/absolute/folder/and/a/filename.txt'),
						[
					/* 01 */"---",
					/* 02 */"",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
					/* 05 */"Midnight snacks are the secret to eternal [text](./foo-bar-baz/another-file.ts) happiness.",
					/* 06 */"In an alternate universe, pigeons deliver sushi by drone.",
					/* 07 */"Lunar rainbows only appear when you sing in falsetto.",
					/* 08 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
						],
						INSTRUCTIONS_LANGUAGE_ID,
					);

					await test.validateReferences([
						new ExpectedReference({
							uri: URI.file('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
							text: '[text](./foo-bar-baz/another-file.ts)',
							path: './foo-bar-baz/another-file.ts',
							startLine: 5,
							startColumn: 43,
							pathStartColumn: 50,
						}),
					]);

					const { header, metadata } = test.parser;
					assertDefined(
						header,
						'Prompt header must be defined.',
					);

					assert.deepStrictEqual(
						metadata,
						{
							promptType: PromptsType.instructions,
						},
						'Must have empty metadata.',
					);
				});

				test(`has correct 'instructions' metadata`, async () => {
					const test = createTest(
						URI.file('/absolute/folder/and/a/filename.instructions.md'),
						[
					/* 01 */"---",
					/* 02 */"description: 'My prompt.'\t\t",
					/* 03 */"	something: true", /* unknown metadata record */
					/* 04 */"	tools: [ 'tool_name1', \"tool_name2\", 'tool_name1', true, false, '', 'tool_name2' ]\t\t",
					/* 05 */"	tools: [ 'tool_name3', \"tool_name4\" ]", /* duplicate `tools` record is ignored */
					/* 06 */"	tools: 'tool_name5'", /* duplicate `tools` record with invalid value is ignored */
					/* 07 */"	mode: 'agent'",
					/* 07 */"	applyTo: 'frontend/**/*spec.ts'",
					/* 08 */"---",
					/* 09 */"The cactus on my desk has a thriving Instagram account.",
					/* 10 */"Midnight snacks are the secret to eternal [text](./foo-bar-baz/another-file.ts) happiness.",
					/* 11 */"In an alternate universe, pigeons deliver sushi by drone.",
					/* 12 */"Lunar rainbows only appear when you sing in falsetto.",
					/* 13 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
						],
						INSTRUCTIONS_LANGUAGE_ID,
					);

					await test.validateReferences([
						new ExpectedReference({
							uri: URI.file('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
							text: '[text](./foo-bar-baz/another-file.ts)',
							path: './foo-bar-baz/another-file.ts',
							startLine: 11,
							startColumn: 43,
							pathStartColumn: 50,
						}),
					]);

					const { header, metadata } = test.parser;
					assertDefined(
						header,
						'Prompt header must be defined.',
					);

					assert(
						metadata?.promptType === PromptsType.instructions,
						`Must be a 'instructions' metadata, got '${JSON.stringify(metadata)}'.`,
					);

					assert.deepStrictEqual(
						metadata,
						{
							promptType: PromptsType.instructions,
							description: 'My prompt.',
							applyTo: 'frontend/**/*spec.ts',
						},
						'Must have correct metadata.',
					);
				});
			});

			suite('prompts', () => {
				test(`empty header`, async () => {
					const test = createTest(
						URI.file('/absolute/folder/and/a/filename.txt'),
						[
					/* 01 */"---",
					/* 02 */"",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
					/* 05 */"Midnight snacks are the secret to eternal [text](./foo-bar-baz/another-file.ts) happiness.",
					/* 06 */"In an alternate universe, pigeons deliver sushi by drone.",
					/* 07 */"Lunar rainbows only appear when you sing in falsetto.",
					/* 08 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
						],
						PROMPT_LANGUAGE_ID,
					);

					await test.validateReferences([
						new ExpectedReference({
							uri: URI.file('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
							text: '[text](./foo-bar-baz/another-file.ts)',
							path: './foo-bar-baz/another-file.ts',
							startLine: 5,
							startColumn: 43,
							pathStartColumn: 50,
						}),
					]);

					const { header, metadata } = test.parser;
					assertDefined(
						header,
						'Prompt header must be defined.',
					);

					assert.deepStrictEqual(
						metadata,
						{
							promptType: PromptsType.prompt,
						},
						'Must have empty metadata.',
					);
				});

				test(`has correct 'prompt' metadata`, async () => {
					const test = createTest(
						URI.file('/absolute/folder/and/a/filename.txt'),
						[
					/* 01 */"---",
					/* 02 */"description: 'My prompt.'\t\t",
					/* 03 */"	something: true", /* unknown metadata record */
					/* 04 */"	tools: [ 'tool_name1', \"tool_name2\", 'tool_name1', true, false, '', 'tool_name2' ]\t\t",
					/* 05 */"	tools: [ 'tool_name3', \"tool_name4\" ]", /* duplicate `tools` record is ignored */
					/* 06 */"	tools: 'tool_name5'", /* duplicate `tools` record with invalid value is ignored */
					/* 07 */"	mode: 'agent'",
					/* 08 */"	applyTo: 'frontend/**/*spec.ts'",
					/* 09 */"	model: 'Super Finetune Turbo 2.3-o1'",
					/* 10 */"---",
					/* 11 */"The cactus on my desk has a thriving Instagram account.",
					/* 12 */"Midnight snacks are the secret to eternal [text](./foo-bar-baz/another-file.ts) happiness.",
					/* 13 */"In an alternate universe, pigeons deliver sushi by drone.",
					/* 14 */"Lunar rainbows only appear when you sing in falsetto.",
					/* 13 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
						],
						PROMPT_LANGUAGE_ID,
					);

					await test.validateReferences([
						new ExpectedReference({
							uri: URI.file('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
							text: '[text](./foo-bar-baz/another-file.ts)',
							path: './foo-bar-baz/another-file.ts',
							startLine: 12,
							startColumn: 43,
							pathStartColumn: 50,
						}),
					]);

					const { header, metadata } = test.parser;
					assertDefined(
						header,
						'Prompt header must be defined.',
					);

					assert(
						metadata?.promptType === PromptsType.prompt,
						`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
					);

					assert.deepStrictEqual(
						metadata,
						{
							promptType: PromptsType.prompt,
							mode: 'agent',
							description: 'My prompt.',
							tools: ['tool_name1', 'tool_name2'],
							model: 'Super Finetune Turbo 2.3-o1',
						},
						'Must have correct metadata.',
					);
				});
			});

			suite('modes', () => {
				test(`empty header`, async () => {
					const test = createTest(
						URI.file('/absolute/folder/and/a/filename.txt'),
						[
					/* 01 */"---",
					/* 02 */"",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
					/* 05 */"Midnight snacks are the secret to eternal [text](./foo-bar-baz/another-file.ts) happiness.",
					/* 06 */"In an alternate universe, pigeons deliver sushi by drone.",
					/* 07 */"Lunar rainbows only appear when you sing in falsetto.",
					/* 08 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
						],
						MODE_LANGUAGE_ID,
					);

					await test.validateReferences([
						new ExpectedReference({
							uri: URI.file('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
							text: '[text](./foo-bar-baz/another-file.ts)',
							path: './foo-bar-baz/another-file.ts',
							startLine: 5,
							startColumn: 43,
							pathStartColumn: 50,
						}),
					]);

					const { header, metadata } = test.parser;
					assertDefined(
						header,
						'Prompt header must be defined.',
					);

					assert.deepStrictEqual(
						metadata,
						{
							promptType: PromptsType.mode,
						},
						'Must have empty metadata.',
					);
				});

				test(`has correct metadata`, async () => {
					const test = createTest(
						URI.file('/absolute/folder/and/a/filename.txt'),
						[
					/* 01 */"---",
					/* 02 */"description: 'My mode.'\t\t",
					/* 03 */"	something: true", /* unknown metadata record */
					/* 04 */"	tools: [ 'tool_name1', \"tool_name2\", 'tool_name1', true, false, '', 'tool_name2' ]\t\t",
					/* 05 */"	tools: [ 'tool_name3', \"tool_name4\" ]", /* duplicate `tools` record is ignored */
					/* 06 */"	tools: 'tool_name5'", /* duplicate `tools` record with invalid value is ignored */
					/* 07 */"	applyTo: 'frontend/**/*spec.ts'",
					/* 08 */"---",
					/* 09 */"The cactus on my desk has a thriving Instagram account.",
					/* 10 */"Midnight snacks are the secret to eternal [text](./foo-bar-baz/another-file.ts) happiness.",
					/* 11 */"In an alternate universe, pigeons deliver sushi by drone.",
					/* 12 */"Lunar rainbows only appear when you sing in falsetto.",
					/* 13 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
						],
						MODE_LANGUAGE_ID,
					);

					await test.validateReferences([
						new ExpectedReference({
							uri: URI.file('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
							text: '[text](./foo-bar-baz/another-file.ts)',
							path: './foo-bar-baz/another-file.ts',
							startLine: 10,
							startColumn: 43,
							pathStartColumn: 50,
						}),
					]);

					const { header, metadata } = test.parser;
					assertDefined(
						header,
						'Mode header must be defined.',
					);

					assert.deepStrictEqual(
						metadata,
						{
							promptType: PromptsType.mode,
							description: 'My mode.',
							tools: ['tool_name1', 'tool_name2'],
						},
						'Must have correct metadata.',
					);
				});

				test(`has model metadata`, async () => {
					const test = createTest(
						URI.file('/absolute/folder/and/a/filename1.txt'),
						[
					/* 01 */"---",
					/* 02 */"description: 'My mode.'\t\t",
					/* 03 */"model: Martin Finetune Turbo",
					/* 04 */"---",
					/* 05 */"Carrots have secret telepathic abilities, but only on Tuesdays.",
						],
						MODE_LANGUAGE_ID,
					);

					await test.allSettled();

					const { header, metadata } = test.parser;
					assertDefined(
						header,
						'header must be defined.',
					);

					assert.deepStrictEqual(
						metadata,
						{
							promptType: PromptsType.mode,
							description: 'My mode.',
							model: 'Martin Finetune Turbo',
						},
						'Must have correct metadata.',
					);
				});
			});
		});

		suite('diagnostics', () => {
			test('core logic', async () => {
				const test = createTest(
					URI.file('/absolute/folder/and/a/filename.txt'),
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
					PROMPT_LANGUAGE_ID,
				);

				await test.validateReferences([
					new ExpectedReference({
						uri: URI.file('/absolute/folder/and/a/foo-bar-baz/another-file.ts'),
						text: '[text](./foo-bar-baz/another-file.ts)',
						path: './foo-bar-baz/another-file.ts',
						startLine: 10,
						startColumn: 43,
						pathStartColumn: 50,
					}),
				]);

				const { header, metadata } = test.parser;
				assertDefined(
					header,
					'Prompt header must be defined.',
				);

				assert.deepStrictEqual(
					metadata,
					{
						promptType: PromptsType.prompt,
						mode: 'ask',
					},
					'Must have correct metadata.',
				);

				await test.validateHeaderDiagnostics([
					new ExpectedDiagnosticError(
						new Range(2, 15, 2, 15 + 4),
						'The property \'description\' must be of type \'string\', got \'boolean\'.',
					),
					new ExpectedDiagnosticWarning(
						new Range(4, 2, 4, 2 + 15),
						'Unknown property \'something\' will be ignored.',
					),
					new ExpectedDiagnosticWarning(
						new Range(5, 38, 5, 38 + 12),
						'Duplicate tool name \'tool_name1\'.',
					),
					new ExpectedDiagnosticWarning(
						new Range(5, 52, 5, 52 + 4),
						'Unexpected tool name \'true\', expected a string literal.',
					),
					new ExpectedDiagnosticWarning(
						new Range(5, 58, 5, 58 + 5),
						'Unexpected tool name \'false\', expected a string literal.',
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
						new Range(5, 1, 5, 84),
						`Tools can not be used in 'ask' mode and will be ignored.`,
					),
					new ExpectedDiagnosticWarning(
						new Range(6, 3, 6, 3 + 37),
						`Duplicate property 'tools' will be ignored.`,
					),
					new ExpectedDiagnosticWarning(
						new Range(7, 1, 7, 1 + 19),
						`Duplicate property 'tools' will be ignored.`,
					),
				]);
			});

			suite('tools metadata', () => {
				test('tool names can be quoted and non-quoted string', async () => {
					const test = createTest(
						URI.file('/absolute/folder/and/a/my.prompt.md'),
						[
					/* 01 */"---",
					/* 02 */"tools: [tool1, 'tool2', \"tool3\", tool-4]",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
						],
						PROMPT_LANGUAGE_ID,
					);

					await test.allSettled();

					const { header, metadata } = test.parser;
					assertDefined(
						header,
						'Prompt header must be defined.',
					);

					assert(
						metadata?.promptType === PromptsType.prompt,
						`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
					);

					const { tools } = metadata;
					assert.deepStrictEqual(
						tools,
						['tool1', 'tool2', 'tool3', 'tool-4'],
						'Mode metadata must have correct value.',
					);

					await test.validateHeaderDiagnostics([]);
				});
			});

			suite('applyTo metadata', () => {
				suite('language', () => {
					test('prompt', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/my.prompt.md'),
							[
					/* 01 */"---",
					/* 02 */"applyTo: '**/*'",
					/* 03 */"mode: \"ask\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert.deepStrictEqual(
							metadata,
							{
								promptType: PromptsType.prompt,
								mode: ChatModeKind.Ask,
							},
							'Must have correct metadata.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(2, 1, 2, 1 + 15),
								`Unknown property 'applyTo' will be ignored.`,
							),
						]);
					});

					test('instructions', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/my.prompt.md'),
							[
					/* 01 */"---",
					/* 02 */"applyTo: '**/*'",
					/* 03 */"mode: \"edit\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							INSTRUCTIONS_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert.deepStrictEqual(
							metadata,
							{
								promptType: PromptsType.instructions,
								applyTo: '**/*',
							},
							'Must have correct metadata.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(3, 1, 3, 13),
								`Unknown property 'mode' will be ignored.`,
							),
						]);
					});
				});
			});

			test('invalid glob pattern', async () => {
				const test = createTest(
					URI.file('/absolute/folder/and/a/my.prompt.md'),
					[
					/* 01 */"---",
					/* 02 */"mode: \"agent\"",
					/* 03 */"applyTo: ''",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
					],
					INSTRUCTIONS_LANGUAGE_ID,
				);

				await test.allSettled();

				const { header, metadata } = test.parser;
				assertDefined(
					header,
					'Prompt header must be defined.',
				);

				assert.deepStrictEqual(
					metadata,
					{
						promptType: PromptsType.instructions,
					},
					'Must have correct metadata.',
				);

				await test.validateHeaderDiagnostics([
					new ExpectedDiagnosticWarning(
						new Range(2, 1, 2, 14),
						`Unknown property 'mode' will be ignored.`,
					),
					new ExpectedDiagnosticWarning(
						new Range(3, 10, 3, 10 + 2),
						`Invalid glob pattern ''.`,
					),
				]);
			});

			suite('mode', () => {
				suite('invalid', () => {
					test('quoted string value', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/my.prompt.md'),
							[
					/* 01 */"---",
					/* 02 */"mode: \"my-mode\"",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
							INSTRUCTIONS_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(2, 1, 2, 7 + 9),
								`Unknown property 'mode' will be ignored.`,
							),
						]);
					});

					test('single-token unquoted-string value', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/my.prompt.md'),
							[
					/* 01 */"---",
					/* 02 */"mode: myMode ",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
							INSTRUCTIONS_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(2, 1, 2, 7 + 6),
								`Unknown property 'mode' will be ignored.`,
							),
						]);
					});

					test('unquoted string value', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/my.prompt.md'),
							[
					/* 01 */"---",
					/* 02 */"mode: my-mode",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
							INSTRUCTIONS_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(2, 1, 2, 7 + 7),
								`Unknown property 'mode' will be ignored.`,
							),
						]);
					});

					test('multi-token unquoted-string value', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/my.prompt.md'),
							[
					/* 01 */"---",
					/* 02 */"mode: my mode is your mode\t \t",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
							INSTRUCTIONS_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(2, 1, 2, 7 + 20),
								`Unknown property 'mode' will be ignored.`,
							),
						]);
					});

					test('after a description metadata', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/my.prompt.md'),
							[
					/* 01 */"---",
					/* 02 */"description: my clear but concise description",
					/* 03 */"mode: mode24",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							INSTRUCTIONS_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(3, 1, 3, 7 + 6),
								`Unknown property 'mode' will be ignored.`,
							),
						]);
					});

					test('boolean value', async () => {
						const booleanValue = randomBoolean();

						const test = createTest(
							URI.file('/absolute/folder/and/a/my.prompt.md'),
							[
					/* 01 */"---",
					/* 02 */`	mode: \t${booleanValue}\t`,
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
							INSTRUCTIONS_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(2, 2, 2, 9 + `${booleanValue}`.length),
								`Unknown property 'mode' will be ignored.`,
							),
						]);
					});

					test('empty quoted string value', async () => {
						const quotedString = (randomBoolean())
							? `''`
							: '""';

						const test = createTest(
							URI.file('/absolute/folder/and/a/my.prompt.md'),
							[
					/* 01 */"---",
					/* 02 */`		mode: ${quotedString}`,
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
							INSTRUCTIONS_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(2, 3, 2, 9 + `${quotedString}`.length),
								`Unknown property 'mode' will be ignored.`,
							),
						]);
					});

					test('empty value', async () => {
						const value = (randomBoolean())
							? '\t\t  \t\t'
							: ' \t \v \t ';

						const test = createTest(
							URI.file('/absolute/folder/and/a/my.prompt.md'),
							[
					/* 01 */"---",
					/* 02 */`	\vmode: ${value}`,
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
							INSTRUCTIONS_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(2, 3, 2, 9),
								`Unknown property 'mode' will be ignored.`,
							),
						]);
					});

					test('void value', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/my.prompt.md'),
							[
					/* 01 */"---",
					/* 02 */`	mode: `,
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
							INSTRUCTIONS_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(2, 2, 2, 8),
								`Unknown property 'mode' will be ignored.`,
							),
						]);
					});
				});
			});

			suite('tools and mode compatibility', () => {
				suite('tools is set', () => {
					test('ask mode', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ",
					/* 03 */"mode: \"ask\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assert.equal(
							tools,
							undefined,
							'Tools metadata must not be defined.',
						);

						assert.strictEqual(
							mode,
							ChatModeKind.Ask,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(2, 1, 2, 38),
								`Tools can not be used in 'ask' mode and will be ignored.`,
							),
						]);
					});

					test('edit mode', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ",
					/* 03 */"mode: \"edit\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assert.equal(
							tools,
							undefined,
							'Tools metadata must not be defined.',
						);

						assert.strictEqual(
							mode,
							ChatModeKind.Edit,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticWarning(
								new Range(2, 1, 2, 38),
								`Tools can not be used in 'edit' mode and will be ignored.`,
							),
						]);
					});

					test('agent mode', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ",
					/* 03 */"mode: \"agent\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assertDefined(
							tools,
							'Tools metadata must be defined.',
						);

						assert.strictEqual(
							mode,
							ChatModeKind.Agent,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([]);
					});

					test('no mode', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assertDefined(
							tools,
							'Tools metadata must be defined.',
						);

						assert.strictEqual(
							mode,
							ChatModeKind.Agent,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([]);
					});

					test('custom mode with tools', async () => {
						const customModeName = 'myCustomMode';

						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ",
					/* 03 */`mode: ${customModeName}`,
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assertDefined(
							tools,
							'Tools metadata must be defined.',
						);

						assert.strictEqual(
							mode,
							customModeName,
							'Mode metadata must have the custom mode value.',
						);

						// Custom modes are now allowed, so no error expected
						await test.validateHeaderDiagnostics([]);
					});

					test('custom mode with spaces in value', async () => {
						const customModeId = 'my custom mode with spaces';

						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool1', 'tool2' ]",
					/* 03 */`mode: "${customModeId}"`,
					/* 04 */"---",
					/* 05 */"Test prompt with custom mode that has spaces.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assertDefined(
							tools,
							'Tools metadata must be defined.',
						);

						assert.strictEqual(
							mode,
							customModeId,
							'Mode metadata must preserve custom mode with spaces.',
						);

						// Custom modes are now allowed, so no error expected
						await test.validateHeaderDiagnostics([]);
					});

					test('custom mode without tools', async () => {
						const customModeId = 'debugHelperMode';

						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"description: \"Custom debugging mode\"",
					/* 03 */`mode: ${customModeId}`,
					/* 04 */"---",
					/* 05 */"This is a custom mode without tools.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode, description } = metadata;
						assert.strictEqual(
							tools,
							undefined,
							'Tools metadata must not be defined.',
						);

						assert.strictEqual(
							mode,
							customModeId,
							'Mode metadata must have the custom mode value.',
						);

						assert.strictEqual(
							description,
							'Custom debugging mode',
							'Description metadata must be preserved.',
						);

						// Custom modes are now allowed, so no error expected
						await test.validateHeaderDiagnostics([]);
					});

					test('invalid mode - empty string', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ",
					/* 03 */"mode: \"\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assertDefined(
							tools,
							'Tools metadata must be defined.',
						);

						assert.strictEqual(
							mode,
							ChatModeKind.Agent,
							'Mode metadata must default to agent when mode is empty string.',
						);

						// Empty string mode should be handled gracefully (no error expected)
						await test.validateHeaderDiagnostics([]);
					});

					test('invalid mode - boolean value', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ",
					/* 03 */"mode: true",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assertDefined(
							tools,
							'Tools metadata must be defined.',
						);

						assert.strictEqual(
							mode,
							ChatModeKind.Agent,
							'Mode metadata must default to agent when mode is boolean.',
						);

						// Boolean mode value should trigger validation error
						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticError(
								new Range(3, 7, 3, 11),
								"The property 'mode' must be of type 'string', got 'boolean'.",
							),
						]);
					});

					test('invalid mode - array value', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"tools: [ 'tool_name3', \"tool_name4\" ]  \t\t  ",
					/* 03 */"mode: ['array', 'mode']",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assertDefined(
							tools,
							'Tools metadata must be defined.',
						);

						assert.strictEqual(
							mode,
							ChatModeKind.Agent,
							'Mode metadata must default to agent when mode is array.',
						);

						// Array mode value should trigger validation error
						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticError(
								new Range(3, 7, 3, 24),
								"The property 'mode' must be of type 'string', got 'array'.",
							),
						]);
					});

					// Test builtin modes to ensure they still work correctly
					test('builtin ask mode', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"description: \"Ask mode test\"",
					/* 03 */"mode: ask",
					/* 04 */"---",
					/* 05 */"This is a builtin ask mode test.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { mode, description } = metadata;
						assert.strictEqual(
							mode,
							ChatModeKind.Ask,
							'Mode metadata must be ask.',
						);

						assert.strictEqual(
							description,
							'Ask mode test',
							'Description metadata must be preserved.',
						);

						await test.validateHeaderDiagnostics([]);
					});

					test('builtin edit mode', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"description: \"Edit mode test\"",
					/* 03 */"mode: edit",
					/* 04 */"---",
					/* 05 */"This is a builtin edit mode test.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { mode, description } = metadata;
						assert.strictEqual(
							mode,
							ChatModeKind.Edit,
							'Mode metadata must be edit.',
						);

						assert.strictEqual(
							description,
							'Edit mode test',
							'Description metadata must be preserved.',
						);

						await test.validateHeaderDiagnostics([]);
					});

					test('builtin agent mode with tools', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"description: \"Agent mode test\"",
					/* 03 */"mode: agent",
					/* 04 */"tools: ['tool1', 'tool2']",
					/* 05 */"---",
					/* 06 */"This is a builtin agent mode test.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { mode, tools, description } = metadata;
						assert.strictEqual(
							mode,
							ChatModeKind.Agent,
							'Mode metadata must be agent.',
						);

						assertDefined(
							tools,
							'Tools metadata must be defined for agent mode.',
						);

						assert.strictEqual(
							description,
							'Agent mode test',
							'Description metadata must be preserved.',
						);

						await test.validateHeaderDiagnostics([]);
					});
				});

				suite('tools is not set', () => {
					test('ask mode', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"description: ['my prompt', 'description.']",
					/* 03 */"mode: \"ask\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assert(
							tools === undefined,
							'Tools metadata must not be defined.',
						);

						assert.strictEqual(
							mode,
							ChatModeKind.Ask,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([
							new ExpectedDiagnosticError(
								new Range(2, 14, 2, 14 + 29),
								`The property 'description' must be of type 'string', got 'array'.`,
							),
						]);
					});

					test('edit mode', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"description: my prompt description. \t\t  \t\t   ",
					/* 03 */"mode: \"edit\"",
					/* 04 */"---",
					/* 05 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assert(
							tools === undefined,
							'Tools metadata must not be defined.',
						);

						assert.strictEqual(
							mode,
							ChatModeKind.Edit,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([]);
					});

					test('agent mode', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"mode: \"agent\"",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assert(
							metadata?.promptType === PromptsType.prompt,
							`Must be a 'prompt' metadata, got '${JSON.stringify(metadata)}'.`,
						);

						const { tools, mode } = metadata;
						assert(
							tools === undefined,
							'Tools metadata must not be defined.',
						);

						assert.strictEqual(
							mode,
							ChatModeKind.Agent,
							'Mode metadata must have correct value.',
						);

						await test.validateHeaderDiagnostics([]);
					});

					test('no mode', async () => {
						const test = createTest(
							URI.file('/absolute/folder/and/a/filename.txt'),
							[
					/* 01 */"---",
					/* 02 */"description: 'My prompt.'",
					/* 03 */"---",
					/* 04 */"The cactus on my desk has a thriving Instagram account.",
							],
							PROMPT_LANGUAGE_ID,
						);

						await test.allSettled();

						const { header, metadata } = test.parser;
						assertDefined(
							header,
							'Prompt header must be defined.',
						);

						assertDefined(
							metadata,
							'Prompt metadata and metadata must be defined.',
						);

						assert(
							('tools' in metadata) === false,
							'Tools metadata must not be defined.',
						);

						assert(
							('mode' in metadata) === false,
							'Mode metadata must not be defined.',
						);

						await test.validateHeaderDiagnostics([]);
					});
				});
			});
		});
	});

	test('gets disposed with the model', async () => {
		const test = createTest(
			URI.file('/some/path/file.prompt.md'),
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
			test.parser.isDisposed,
			'The parser should be disposed with its model.',
		);
	});

	test('toString()', async () => {
		const modelUri = URI.file('/Users/legomushroom/repos/prompt-snippets/README.md');
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
