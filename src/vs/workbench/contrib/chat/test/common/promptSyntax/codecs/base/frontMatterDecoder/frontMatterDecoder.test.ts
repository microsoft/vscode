/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Range } from '../../../../../../../../../editor/common/core/range.js';
import { TestDecoder } from '../utils/testDecoder.js';
import { VSBuffer } from '../../../../../../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../../../../../../base/common/stream.js';
import { NewLine } from '../../../../../../common/promptSyntax/codecs/base/linesCodec/tokens/newLine.js';
import { DoubleQuote } from '../../../../../../common/promptSyntax/codecs/base/simpleCodec/tokens/doubleQuote.js';
import { type TSimpleDecoderToken } from '../../../../../../common/promptSyntax/codecs/base/simpleCodec/simpleDecoder.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../../base/test/common/utils.js';
import { LeftBracket, RightBracket } from '../../../../../../common/promptSyntax/codecs/base/simpleCodec/tokens/brackets.js';
import { FrontMatterDecoder } from '../../../../../../common/promptSyntax/codecs/base/frontMatterCodec/frontMatterDecoder.js';
import { FrontMatterSequence } from '../../../../../../common/promptSyntax/codecs/base/frontMatterCodec/tokens/frontMatterSequence.js';
import { ExclamationMark, Quote, Tab, Word, Space, Colon, VerticalTab, Comma, Dash } from '../../../../../../common/promptSyntax/codecs/base/simpleCodec/tokens/tokens.js';
import { FrontMatterBoolean, FrontMatterString, FrontMatterArray, FrontMatterRecord, FrontMatterRecordDelimiter, FrontMatterRecordName } from '../../../../../../common/promptSyntax/codecs/base/frontMatterCodec/tokens/index.js';

/**
 * Front Matter decoder for testing purposes.
 */
export class TestFrontMatterDecoder extends TestDecoder<TSimpleDecoderToken, FrontMatterDecoder> {
	constructor() {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = new FrontMatterDecoder(stream);

		super(stream, decoder);
	}
}

suite('FrontMatterDecoder', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens', async () => {
		const test = disposables.add(new TestFrontMatterDecoder());

		await test.run(
			[
				'just: "write some yaml "',
				'write-some :\t[ \' just\t \',  "yaml!", true, , ,]',
				'anotherField \t\t\t  :  FALSE ',
			],
			[
				// first record
				new FrontMatterRecord([
					new FrontMatterRecordName([
						new Word(new Range(1, 1, 1, 1 + 4), 'just'),
					]),
					new FrontMatterRecordDelimiter([
						new Colon(new Range(1, 5, 1, 6)),
						new Space(new Range(1, 6, 1, 7)),
					]),
					new FrontMatterString([
						new DoubleQuote(new Range(1, 7, 1, 8)),
						new Word(new Range(1, 8, 1, 8 + 5), 'write'),
						new Space(new Range(1, 13, 1, 14)),
						new Word(new Range(1, 14, 1, 14 + 4), 'some'),
						new Space(new Range(1, 18, 1, 19)),
						new Word(new Range(1, 19, 1, 19 + 4), 'yaml'),
						new Space(new Range(1, 23, 1, 24)),
						new DoubleQuote(new Range(1, 24, 1, 25)),
					]),
				]),
				new NewLine(new Range(1, 25, 1, 26)),
				// second record
				new FrontMatterRecord([
					new FrontMatterRecordName([
						new Word(new Range(2, 1, 2, 1 + 5), 'write'),
						new Dash(new Range(2, 6, 2, 7)),
						new Word(new Range(2, 7, 2, 7 + 4), 'some'),
					]),
					new FrontMatterRecordDelimiter([
						new Colon(new Range(2, 12, 2, 13)),
						new Tab(new Range(2, 13, 2, 14)),
					]),
					new FrontMatterArray([
						new LeftBracket(new Range(2, 14, 2, 15)),
						new FrontMatterString([
							new Quote(new Range(2, 16, 2, 17)),
							new Space(new Range(2, 17, 2, 18)),
							new Word(new Range(2, 18, 2, 18 + 4), 'just'),
							new Tab(new Range(2, 22, 2, 23)),
							new Space(new Range(2, 23, 2, 24)),
							new Quote(new Range(2, 24, 2, 25)),
						]),
						new FrontMatterString([
							new DoubleQuote(new Range(2, 28, 2, 29)),
							new Word(new Range(2, 29, 2, 29 + 4), 'yaml'),
							new ExclamationMark(new Range(2, 33, 2, 34)),
							new DoubleQuote(new Range(2, 34, 2, 35)),
						]),
						new FrontMatterBoolean(
							new Word(new Range(2, 37, 2, 37 + 4), 'true'),
						),
						new RightBracket(new Range(2, 46, 2, 47)),
					]),
				]),
				new NewLine(new Range(2, 47, 2, 48)),
				// third record
				new FrontMatterRecord([
					new FrontMatterRecordName([
						new Word(new Range(3, 1, 3, 1 + 12), 'anotherField'),
					]),
					new FrontMatterRecordDelimiter([
						new Colon(new Range(3, 19, 3, 20)),
						new Space(new Range(3, 20, 3, 21)),
					]),
					new FrontMatterBoolean(
						new Word(new Range(3, 22, 3, 22 + 5), 'FALSE'),
					),
				]),
				new Space(new Range(3, 27, 3, 28)),
			]);
	});

	suite('record', () => {
		suite('values', () => {
			test('unquoted string', async () => {
				const test = disposables.add(new TestFrontMatterDecoder());

				await test.run(
					[
						'just: write some yaml ',
						'anotherField \t\t :  fal\v \t',
					],
					[
						// first record
						new FrontMatterRecord([
							new FrontMatterRecordName([
								new Word(new Range(1, 1, 1, 1 + 4), 'just'),
							]),
							new FrontMatterRecordDelimiter([
								new Colon(new Range(1, 5, 1, 6)),
								new Space(new Range(1, 6, 1, 7)),
							]),
							new FrontMatterSequence([
								new Word(new Range(1, 7, 1, 7 + 5), 'write'),
								new Space(new Range(1, 12, 1, 13)),
								new Word(new Range(1, 13, 1, 13 + 4), 'some'),
								new Space(new Range(1, 17, 1, 18)),
								new Word(new Range(1, 18, 1, 18 + 4), 'yaml'),
							]),
						]),
						new Space(new Range(1, 22, 1, 23)),
						new NewLine(new Range(1, 23, 1, 24)),
						// second record
						new FrontMatterRecord([
							new FrontMatterRecordName([
								new Word(new Range(2, 1, 2, 1 + 12), 'anotherField'),
							]),
							new FrontMatterRecordDelimiter([
								new Colon(new Range(2, 17, 2, 18)),
								new Space(new Range(2, 18, 2, 19)),
							]),
							new FrontMatterSequence([
								new Word(new Range(2, 20, 2, 20 + 3), 'fal'),
							]),
						]),
						new VerticalTab(new Range(2, 23, 2, 24)),
						new Space(new Range(2, 24, 2, 25)),
						new Tab(new Range(2, 25, 2, 26)),
					]);
			});

			test('quoted string', async () => {
				const test = disposables.add(new TestFrontMatterDecoder());

				await test.run(
					[
						`just\t:\t'\vdo\tsome\ntesting, please\v' `,
						'anotherField \t\t :\v\v"fal\nse"',
					],
					[
						// first record
						new FrontMatterRecord([
							new FrontMatterRecordName([
								new Word(new Range(1, 1, 1, 1 + 4), 'just'),
							]),
							new FrontMatterRecordDelimiter([
								new Colon(new Range(1, 6, 1, 7)),
								new Tab(new Range(1, 7, 1, 8)),
							]),
							new FrontMatterString([
								new Quote(new Range(1, 8, 1, 9)),
								new VerticalTab(new Range(1, 9, 1, 10)),
								new Word(new Range(1, 10, 1, 10 + 2), 'do'),
								new Tab(new Range(1, 12, 1, 13)),
								new Word(new Range(1, 13, 1, 13 + 4), 'some'),
								new NewLine(new Range(1, 17, 1, 18)),
								new Word(new Range(2, 1, 2, 1 + 7), 'testing'),
								new Comma(new Range(2, 8, 2, 9)),
								new Space(new Range(2, 9, 2, 10)),
								new Word(new Range(2, 10, 2, 10 + 6), 'please'),
								new VerticalTab(new Range(2, 16, 2, 17)),
								new Quote(new Range(2, 17, 2, 18)),
							]),
						]),
						new Space(new Range(2, 18, 2, 19)),
						new NewLine(new Range(2, 19, 2, 20)),
						// second record
						new FrontMatterRecord([
							new FrontMatterRecordName([
								new Word(new Range(3, 1, 3, 1 + 12), 'anotherField'),
							]),
							new FrontMatterRecordDelimiter([
								new Colon(new Range(3, 17, 3, 18)),
								new VerticalTab(new Range(3, 18, 3, 19)),
							]),
							new FrontMatterString([
								new DoubleQuote(new Range(3, 20, 3, 21)),
								new Word(new Range(3, 21, 3, 21 + 3), 'fal'),
								new NewLine(new Range(3, 24, 3, 25)),
								new Word(new Range(4, 1, 4, 1 + 2), 'se'),
								new DoubleQuote(new Range(4, 3, 4, 4)),
							]),
						]),
					]);
			});

			test('boolean', async () => {
				const test = disposables.add(new TestFrontMatterDecoder());

				await test.run(
					[
						'anotherField \t\t :  FALSE ',
						'my-field: true\t ',
					],
					[
						// first record
						new FrontMatterRecord([
							new FrontMatterRecordName([
								new Word(new Range(1, 1, 1, 1 + 12), 'anotherField'),
							]),
							new FrontMatterRecordDelimiter([
								new Colon(new Range(1, 17, 1, 18)),
								new Space(new Range(1, 18, 1, 19)),
							]),
							new FrontMatterBoolean(
								new Word(
									new Range(1, 20, 1, 20 + 5),
									'FALSE',
								),
							),
						]),
						new Space(new Range(1, 25, 1, 26)),
						new NewLine(new Range(1, 26, 1, 27)),
						// second record
						new FrontMatterRecord([
							new FrontMatterRecordName([
								new Word(new Range(2, 1, 2, 1 + 2), 'my'),
								new Dash(new Range(2, 3, 2, 4)),
								new Word(new Range(2, 4, 2, 4 + 5), 'field'),
							]),
							new FrontMatterRecordDelimiter([
								new Colon(new Range(2, 9, 2, 10)),
								new Space(new Range(2, 10, 2, 11)),
							]),
							new FrontMatterBoolean(
								new Word(
									new Range(2, 11, 2, 11 + 4),
									'true',
								),
							),
						]),
						new Tab(new Range(2, 15, 2, 16)),
						new Space(new Range(2, 16, 2, 17)),
					]);
			});

			suite('array', () => {
				test('empty', async () => {
					const test = disposables.add(new TestFrontMatterDecoder());

					await test.run(
						[
							`tools\v:\t []`,
							'anotherField \t\t :\v\v"fal\nse"',
						],
						[
							// first record
							new FrontMatterRecord([
								new FrontMatterRecordName([
									new Word(new Range(1, 1, 1, 1 + 5), 'tools'),
								]),
								new FrontMatterRecordDelimiter([
									new Colon(new Range(1, 7, 1, 8)),
									new Tab(new Range(1, 8, 1, 9)),
								]),
								new FrontMatterArray([
									new LeftBracket(new Range(1, 10, 1, 11)),
									new RightBracket(new Range(1, 11, 1, 12)),
								]),
							]),
							new NewLine(new Range(1, 12, 1, 13)),
							// second record
							new FrontMatterRecord([
								new FrontMatterRecordName([
									new Word(new Range(2, 1, 2, 1 + 12), 'anotherField'),
								]),
								new FrontMatterRecordDelimiter([
									new Colon(new Range(2, 17, 2, 18)),
									new VerticalTab(new Range(2, 18, 2, 19)),
								]),
								new FrontMatterString([
									new DoubleQuote(new Range(2, 20, 2, 21)),
									new Word(new Range(2, 21, 2, 21 + 3), 'fal'),
									new NewLine(new Range(2, 24, 2, 25)),
									new Word(new Range(3, 1, 3, 1 + 2), 'se'),
									new DoubleQuote(new Range(3, 3, 3, 4)),
								]),
							]),
						]);
				});

				test('mixed values', async () => {
					const test = disposables.add(new TestFrontMatterDecoder());

					await test.run(
						[
							`tools\v:\t [true , 'toolName', some-tool]`,
						],
						[
							// first record
							new FrontMatterRecord([
								new FrontMatterRecordName([
									new Word(new Range(1, 1, 1, 1 + 5), 'tools'),
								]),
								new FrontMatterRecordDelimiter([
									new Colon(new Range(1, 7, 1, 8)),
									new Tab(new Range(1, 8, 1, 9)),
								]),
								new FrontMatterArray([
									new LeftBracket(new Range(1, 10, 1, 11)),
									// first array value
									new FrontMatterBoolean(
										new Word(
											new Range(1, 11, 1, 11 + 4),
											'true',
										),
									),
									// second array value
									new FrontMatterString([
										new Quote(new Range(1, 18, 1, 19)),
										new Word(new Range(1, 19, 1, 19 + 8), 'toolName'),
										new Quote(new Range(1, 27, 1, 28)),
									]),
									// third array value
									new FrontMatterSequence([
										new Word(new Range(1, 30, 1, 30 + 4), 'some'),
										new Dash(new Range(1, 34, 1, 35)),
										new Word(new Range(1, 35, 1, 35 + 4), 'tool'),
									]),
									new RightBracket(new Range(1, 39, 1, 40)),
								]),
							]),
						]);
				});

				test('redundant commas', async () => {
					const test = disposables.add(new TestFrontMatterDecoder());

					await test.run(
						[
							`tools\v:\t [true ,, 'toolName', , , some-tool  ,]`,
						],
						[
							// first record
							new FrontMatterRecord([
								new FrontMatterRecordName([
									new Word(new Range(1, 1, 1, 1 + 5), 'tools'),
								]),
								new FrontMatterRecordDelimiter([
									new Colon(new Range(1, 7, 1, 8)),
									new Tab(new Range(1, 8, 1, 9)),
								]),
								new FrontMatterArray([
									new LeftBracket(new Range(1, 10, 1, 11)),
									// first array value
									new FrontMatterBoolean(
										new Word(
											new Range(1, 11, 1, 11 + 4),
											'true',
										),
									),
									// second array value
									new FrontMatterString([
										new Quote(new Range(1, 19, 1, 20)),
										new Word(new Range(1, 20, 1, 20 + 8), 'toolName'),
										new Quote(new Range(1, 28, 1, 29)),
									]),
									// third array value
									new FrontMatterSequence([
										new Word(new Range(1, 35, 1, 35 + 4), 'some'),
										new Dash(new Range(1, 39, 1, 40)),
										new Word(new Range(1, 40, 1, 40 + 4), 'tool'),
									]),
									new RightBracket(new Range(1, 47, 1, 48)),
								]),
							]),
						]);
				});
			});
		});
	});

	test('empty', async () => {
		const test = disposables.add(
			new TestFrontMatterDecoder(),
		);

		await test.run('', []);
	});
});
