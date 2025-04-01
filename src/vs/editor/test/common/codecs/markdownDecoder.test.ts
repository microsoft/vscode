/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestDecoder } from '../utils/testDecoder.js';
import { Range } from '../../../common/core/range.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { Tab } from '../../../common/codecs/simpleCodec/tokens/tab.js';
import { Word } from '../../../common/codecs/simpleCodec/tokens/word.js';
import { Dash } from '../../../common/codecs/simpleCodec/tokens/dash.js';
import { Space } from '../../../common/codecs/simpleCodec/tokens/space.js';
import { NewLine } from '../../../common/codecs/linesCodec/tokens/newLine.js';
import { FormFeed } from '../../../common/codecs/simpleCodec/tokens/formFeed.js';
import { VerticalTab } from '../../../common/codecs/simpleCodec/tokens/verticalTab.js';
import { MarkdownLink } from '../../../common/codecs/markdownCodec/tokens/markdownLink.js';
import { CarriageReturn } from '../../../common/codecs/linesCodec/tokens/carriageReturn.js';
import { MarkdownImage } from '../../../common/codecs/markdownCodec/tokens/markdownImage.js';
import { ExclamationMark } from '../../../common/codecs/simpleCodec/tokens/exclamationMark.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MarkdownComment } from '../../../common/codecs/markdownCodec/tokens/markdownComment.js';
import { LeftBracket, RightBracket } from '../../../common/codecs/simpleCodec/tokens/brackets.js';
import { MarkdownDecoder, TMarkdownToken } from '../../../common/codecs/markdownCodec/markdownDecoder.js';
import { LeftParenthesis, RightParenthesis } from '../../../common/codecs/simpleCodec/tokens/parentheses.js';
import { LeftAngleBracket, RightAngleBracket } from '../../../common/codecs/simpleCodec/tokens/angleBrackets.js';

/**
 * A reusable test utility that asserts that a `TestMarkdownDecoder` instance
 * correctly decodes `inputData` into a stream of `TMarkdownToken` tokens.
 *
 * ## Examples
 *
 * ```typescript
 * // create a new test utility instance
 * const test = testDisposables.add(new TestMarkdownDecoder());
 *
 * // run the test
 * await test.run(
 *   ' hello [world](/etc/hosts)!',
 *   [
 *     new Space(new Range(1, 1, 1, 2)),
 *     new Word(new Range(1, 2, 1, 7), 'hello'),
 *     new Space(new Range(1, 7, 1, 8)),
 *     new MarkdownLink(1, 8, '[world]', '(/etc/hosts)'),
 *     new Word(new Range(1, 27, 1, 28), '!'),
 *     new NewLine(new Range(1, 28, 1, 29)),
 *   ],
 * );
 */
export class TestMarkdownDecoder extends TestDecoder<TMarkdownToken, MarkdownDecoder> {
	constructor() {
		const stream = newWriteableStream<VSBuffer>(null);

		super(stream, new MarkdownDecoder(stream));
	}
}

suite('MarkdownDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('• general', () => {
		test('• base cases', async () => {
			const test = testDisposables.add(
				new TestMarkdownDecoder(),
			);

			await test.run(
				[
					// basic text
					' hello world',
					// text with markdown link and special characters in the filename
					'how are\t you [caption text](./some/file/path/refer🎨nce.md)?\v',
					// empty line
					'',
					// markdown link with special characters in the link caption and path
					'[(example!)](another/path/with[-and-]-chars/folder)\t ',
					// markdown link `#file` variable in the caption and with absolute path
					'\t[#file:something.txt](/absolute/path/to/something.txt)',
					// text with a commented out markdown link
					'\v\f machines must <!-- [computer rights](/do/not/exist) --> suffer',
				],
				[
					// first line
					new Space(new Range(1, 1, 1, 2)),
					new Word(new Range(1, 2, 1, 7), 'hello'),
					new Space(new Range(1, 7, 1, 8)),
					new Word(new Range(1, 8, 1, 13), 'world'),
					new NewLine(new Range(1, 13, 1, 14)),
					// second line
					new Word(new Range(2, 1, 2, 4), 'how'),
					new Space(new Range(2, 4, 2, 5)),
					new Word(new Range(2, 5, 2, 8), 'are'),
					new Tab(new Range(2, 8, 2, 9)),
					new Space(new Range(2, 9, 2, 10)),
					new Word(new Range(2, 10, 2, 13), 'you'),
					new Space(new Range(2, 13, 2, 14)),
					new MarkdownLink(2, 14, '[caption text]', '(./some/file/path/refer🎨nce.md)'),
					new Word(new Range(2, 60, 2, 61), '?'),
					new VerticalTab(new Range(2, 61, 2, 62)),
					new NewLine(new Range(2, 62, 2, 63)),
					// third line
					new NewLine(new Range(3, 1, 3, 2)),
					// fourth line
					new MarkdownLink(4, 1, '[(example!)]', '(another/path/with[-and-]-chars/folder)'),
					new Tab(new Range(4, 52, 4, 53)),
					new Space(new Range(4, 53, 4, 54)),
					new NewLine(new Range(4, 54, 4, 55)),
					// fifth line
					new Tab(new Range(5, 1, 5, 2)),
					new MarkdownLink(5, 2, '[#file:something.txt]', '(/absolute/path/to/something.txt)'),
					new NewLine(new Range(5, 56, 5, 57)),
					// sixth line
					new VerticalTab(new Range(6, 1, 6, 2)),
					new FormFeed(new Range(6, 2, 6, 3)),
					new Space(new Range(6, 3, 6, 4)),
					new Word(new Range(6, 4, 6, 12), 'machines'),
					new Space(new Range(6, 12, 6, 13)),
					new Word(new Range(6, 13, 6, 17), 'must'),
					new Space(new Range(6, 17, 6, 18)),
					new MarkdownComment(new Range(6, 18, 6, 18 + 41), '<!-- [computer rights](/do/not/exist) -->'),
					new Space(new Range(6, 59, 6, 60)),
					new Word(new Range(6, 60, 6, 66), 'suffer'),
				],
			);
		});

		test('• nuanced', async () => {
			const test = testDisposables.add(
				new TestMarkdownDecoder(),
			);

			const inputLines = [
				// tests that the link caption contain a chat prompt `#file:` reference, while
				// the file path can contain other `graphical characters`
				'\v\t[#file:./another/path/to/file.txt](./real/file!path/file◆name.md)',
				// tests that the link file path contain a chat prompt `#file:` reference,
				// `spaces`, `emojies`, and other `graphical characters`
				' [reference ∘ label](/absolute/pa th/to-#file:file.txt/f🥸⚡️le.md)',
				// tests that link caption and file path can contain `parentheses`, `spaces`, and
				// `emojies`
				'\f[!(hello)!](./w(())rld/nice-🦚-filen(a)<me>.git))\n\t',
				// tests that the link caption can be empty, while the file path can contain `square brackets`
				'[<test>](./s[]me/pa[h!) ',
			];

			await test.run(
				inputLines,
				[
					// `1st` line
					new VerticalTab(new Range(1, 1, 1, 2)),
					new Tab(new Range(1, 2, 1, 3)),
					new MarkdownLink(1, 3, '[#file:./another/path/to/file.txt]', '(./real/file!path/file◆name.md)'),
					new NewLine(new Range(1, 68, 1, 69)),
					// `2nd` line
					new Space(new Range(2, 1, 2, 2)),
					new MarkdownLink(2, 2, '[reference ∘ label]', '(/absolute/pa th/to-#file:file.txt/f🥸⚡️le.md)'),
					new NewLine(new Range(2, 67, 2, 68)),
					// `3rd` line
					new FormFeed(new Range(3, 1, 3, 2)),
					new MarkdownLink(3, 2, '[!(hello)!]', '(./w(())rld/nice-🦚-filen(a)<me>.git)'),
					new RightParenthesis(new Range(3, 50, 3, 51)),
					new NewLine(new Range(3, 51, 3, 52)),
					// `4th` line
					new Tab(new Range(4, 1, 4, 2)),
					new NewLine(new Range(4, 2, 4, 3)),
					// `5th` line
					new MarkdownLink(5, 1, '[<test>]', '(./s[]me/pa[h!)'),
					new Space(new Range(5, 24, 5, 25)),
				],
			);
		});
	});

	suite('• links', () => {
		suite('• broken', () => {
			test('• invalid', async () => {
				const test = testDisposables.add(
					new TestMarkdownDecoder(),
				);

				const inputLines = [
					// incomplete link reference with empty caption
					'[ ](./real/file path/file⇧name.md',
					// space between caption and reference is disallowed
					'[link text] (./file path/name.txt)',
				];

				await test.run(
					inputLines,
					[
						// `1st` line
						new LeftBracket(new Range(1, 1, 1, 2)),
						new Space(new Range(1, 2, 1, 3)),
						new RightBracket(new Range(1, 3, 1, 4)),
						new LeftParenthesis(new Range(1, 4, 1, 5)),
						new Word(new Range(1, 5, 1, 5 + 11), './real/file'),
						new Space(new Range(1, 16, 1, 17)),
						new Word(new Range(1, 17, 1, 17 + 17), 'path/file⇧name.md'),
						new NewLine(new Range(1, 34, 1, 35)),
						// `2nd` line
						new LeftBracket(new Range(2, 1, 2, 2)),
						new Word(new Range(2, 2, 2, 2 + 4), 'link'),
						new Space(new Range(2, 6, 2, 7)),
						new Word(new Range(2, 7, 2, 7 + 4), 'text'),
						new RightBracket(new Range(2, 11, 2, 12)),
						new Space(new Range(2, 12, 2, 13)),
						new LeftParenthesis(new Range(2, 13, 2, 14)),
						new Word(new Range(2, 14, 2, 14 + 6), './file'),
						new Space(new Range(2, 20, 2, 21)),
						new Word(new Range(2, 21, 2, 21 + 13), 'path/name.txt'),
						new RightParenthesis(new Range(2, 34, 2, 35)),
					],
				);
			});

			suite('• stop characters inside caption/reference (new lines)', () => {
				for (const stopCharacter of [CarriageReturn, NewLine]) {
					let characterName = '';

					if (stopCharacter === CarriageReturn) {
						characterName = '\\r';
					}
					if (stopCharacter === NewLine) {
						characterName = '\\n';
					}

					assert(
						characterName !== '',
						'The "characterName" must be set, got "empty line".',
					);

					test(`• stop character - "${characterName}"`, async () => {
						const test = testDisposables.add(
							new TestMarkdownDecoder(),
						);

						const inputLines = [
							// stop character inside link caption
							`[haa${stopCharacter.symbol}loů](./real/💁/name.txt)`,
							// stop character inside link reference
							`[ref text](/etc/pat${stopCharacter.symbol}h/to/file.md)`,
							// stop character between line caption and link reference is disallowed
							`[text]${stopCharacter.symbol}(/etc/ path/file.md)`,
						];


						await test.run(
							inputLines,
							[
								// `1st` input line
								new LeftBracket(new Range(1, 1, 1, 2)),
								new Word(new Range(1, 2, 1, 2 + 3), 'haa'),
								new stopCharacter(new Range(1, 5, 1, 6)), // <- stop character
								new Word(new Range(2, 1, 2, 1 + 3), 'loů'),
								new RightBracket(new Range(2, 4, 2, 5)),
								new LeftParenthesis(new Range(2, 5, 2, 6)),
								new Word(new Range(2, 6, 2, 6 + 18), './real/💁/name.txt'),
								new RightParenthesis(new Range(2, 24, 2, 25)),
								new NewLine(new Range(2, 25, 2, 26)),
								// `2nd` input line
								new LeftBracket(new Range(3, 1, 3, 2)),
								new Word(new Range(3, 2, 3, 2 + 3), 'ref'),
								new Space(new Range(3, 5, 3, 6)),
								new Word(new Range(3, 6, 3, 6 + 4), 'text'),
								new RightBracket(new Range(3, 10, 3, 11)),
								new LeftParenthesis(new Range(3, 11, 3, 12)),
								new Word(new Range(3, 12, 3, 12 + 8), '/etc/pat'),
								new stopCharacter(new Range(3, 20, 3, 21)), // <- stop character
								new Word(new Range(4, 1, 4, 1 + 12), 'h/to/file.md'),
								new RightParenthesis(new Range(4, 13, 4, 14)),
								new NewLine(new Range(4, 14, 4, 15)),
								// `3nd` input line
								new LeftBracket(new Range(5, 1, 5, 2)),
								new Word(new Range(5, 2, 5, 2 + 4), 'text'),
								new RightBracket(new Range(5, 6, 5, 7)),
								new stopCharacter(new Range(5, 7, 5, 8)), // <- stop character
								new LeftParenthesis(new Range(6, 1, 6, 2)),
								new Word(new Range(6, 2, 6, 2 + 5), '/etc/'),
								new Space(new Range(6, 7, 6, 8)),
								new Word(new Range(6, 8, 6, 8 + 12), 'path/file.md'),
								new RightParenthesis(new Range(6, 20, 6, 21)),
							],
						);
					});
				}
			});

			/**
			 * Same as above but these stop characters do not move the caret to the next line.
			 */
			suite('• stop characters inside caption/reference (same line)', () => {
				for (const stopCharacter of [VerticalTab, FormFeed]) {
					let characterName = '';

					if (stopCharacter === VerticalTab) {
						characterName = '\\v';
					}
					if (stopCharacter === FormFeed) {
						characterName = '\\f';
					}

					assert(
						characterName !== '',
						'The "characterName" must be set, got "empty line".',
					);

					test(`• stop character - "${characterName}"`, async () => {
						const test = testDisposables.add(
							new TestMarkdownDecoder(),
						);

						const inputLines = [
							// stop character inside link caption
							`[haa${stopCharacter.symbol}loů](./real/💁/name.txt)`,
							// stop character inside link reference
							`[ref text](/etc/pat${stopCharacter.symbol}h/to/file.md)`,
							// stop character between line caption and link reference is disallowed
							`[text]${stopCharacter.symbol}(/etc/ path/file.md)`,
						];


						await test.run(
							inputLines,
							[
								// `1st` input line
								new LeftBracket(new Range(1, 1, 1, 2)),
								new Word(new Range(1, 2, 1, 2 + 3), 'haa'),
								new stopCharacter(new Range(1, 5, 1, 6)), // <- stop character
								new Word(new Range(1, 6, 1, 6 + 3), 'loů'),
								new RightBracket(new Range(1, 9, 1, 10)),
								new LeftParenthesis(new Range(1, 10, 1, 11)),
								new Word(new Range(1, 11, 1, 11 + 18), './real/💁/name.txt'),
								new RightParenthesis(new Range(1, 29, 1, 30)),
								new NewLine(new Range(1, 30, 1, 31)),
								// `2nd` input line
								new LeftBracket(new Range(2, 1, 2, 2)),
								new Word(new Range(2, 2, 2, 2 + 3), 'ref'),
								new Space(new Range(2, 5, 2, 6)),
								new Word(new Range(2, 6, 2, 6 + 4), 'text'),
								new RightBracket(new Range(2, 10, 2, 11)),
								new LeftParenthesis(new Range(2, 11, 2, 12)),
								new Word(new Range(2, 12, 2, 12 + 8), '/etc/pat'),
								new stopCharacter(new Range(2, 20, 2, 21)), // <- stop character
								new Word(new Range(2, 21, 2, 21 + 12), 'h/to/file.md'),
								new RightParenthesis(new Range(2, 33, 2, 34)),
								new NewLine(new Range(2, 34, 2, 35)),
								// `3nd` input line
								new LeftBracket(new Range(3, 1, 3, 2)),
								new Word(new Range(3, 2, 3, 2 + 4), 'text'),
								new RightBracket(new Range(3, 6, 3, 7)),
								new stopCharacter(new Range(3, 7, 3, 8)), // <- stop character
								new LeftParenthesis(new Range(3, 8, 3, 9)),
								new Word(new Range(3, 9, 3, 9 + 5), '/etc/'),
								new Space(new Range(3, 14, 3, 15)),
								new Word(new Range(3, 15, 3, 15 + 12), 'path/file.md'),
								new RightParenthesis(new Range(3, 27, 3, 28)),
							],
						);
					});
				}
			});
		});
	});


	suite('• images', () => {
		suite('• general', () => {
			test('• base cases', async () => {
				const test = testDisposables.add(
					new TestMarkdownDecoder(),
				);

				const inputData = [
					'\t![alt text](./some/path/to/file.jpg) ',
					'plain text \f![label](./image.png)\v and more text',
					'![](/var/images/default) following text',
				];

				await test.run(
					inputData,
					[
						// `1st`
						new Tab(new Range(1, 1, 1, 2)),
						new MarkdownImage(1, 2, '![alt text]', '(./some/path/to/file.jpg)'),
						new Space(new Range(1, 38, 1, 39)),
						new NewLine(new Range(1, 39, 1, 40)),
						// `2nd`
						new Word(new Range(2, 1, 2, 6), 'plain'),
						new Space(new Range(2, 6, 2, 7)),
						new Word(new Range(2, 7, 2, 11), 'text'),
						new Space(new Range(2, 11, 2, 12)),
						new FormFeed(new Range(2, 12, 2, 13)),
						new MarkdownImage(2, 13, '![label]', '(./image.png)'),
						new VerticalTab(new Range(2, 34, 2, 35)),
						new Space(new Range(2, 35, 2, 36)),
						new Word(new Range(2, 36, 2, 39), 'and'),
						new Space(new Range(2, 39, 2, 40)),
						new Word(new Range(2, 40, 2, 44), 'more'),
						new Space(new Range(2, 44, 2, 45)),
						new Word(new Range(2, 45, 2, 49), 'text'),
						new NewLine(new Range(2, 49, 2, 50)),
						// `3rd`
						new MarkdownImage(3, 1, '![]', '(/var/images/default)'),
						new Space(new Range(3, 25, 3, 26)),
						new Word(new Range(3, 26, 3, 35), 'following'),
						new Space(new Range(3, 35, 3, 36)),
						new Word(new Range(3, 36, 3, 40), 'text'),
					],
				);
			});

			test('• nuanced', async () => {
				const test = testDisposables.add(
					new TestMarkdownDecoder(),
				);

				const inputData = [
					'\t![<!-- comment -->](./s☻me/path/to/file.jpeg) ',
					'raw text \f![(/1.png)](./image-🥸.png)\v and more text',
					// '![](/var/images/default) following text',
				];

				await test.run(
					inputData,
					[
						// `1st`
						new Tab(new Range(1, 1, 1, 2)),
						new MarkdownImage(1, 2, '![<!-- comment -->]', '(./s☻me/path/to/file.jpeg)'),
						new Space(new Range(1, 47, 1, 48)),
						new NewLine(new Range(1, 48, 1, 49)),
						// `2nd`
						new Word(new Range(2, 1, 2, 4), 'raw'),
						new Space(new Range(2, 4, 2, 5)),
						new Word(new Range(2, 5, 2, 9), 'text'),
						new Space(new Range(2, 9, 2, 10)),
						new FormFeed(new Range(2, 10, 2, 11)),
						new MarkdownImage(2, 11, '![(/1.png)]', '(./image-🥸.png)'),
						new VerticalTab(new Range(2, 38, 2, 39)),
						new Space(new Range(2, 39, 2, 40)),
						new Word(new Range(2, 40, 2, 43), 'and'),
						new Space(new Range(2, 43, 2, 44)),
						new Word(new Range(2, 44, 2, 48), 'more'),
						new Space(new Range(2, 48, 2, 49)),
						new Word(new Range(2, 49, 2, 53), 'text'),
					],
				);
			});
		});

		suite('• broken', () => {
			test('• invalid', async () => {
				const test = testDisposables.add(
					new TestMarkdownDecoder(),
				);

				const inputLines = [
					// incomplete link reference with empty caption
					'![ ](./real/file path/file★name.webp',
					// space between caption and reference is disallowed
					'\f![link text] (./file path/name.jpg)',
					// new line inside the link reference
					'\v![ ](./file\npath/name.jpg )',
				];

				await test.run(
					inputLines,
					[
						// `1st` line
						new ExclamationMark(new Range(1, 1, 1, 2)),
						new LeftBracket(new Range(1, 2, 1, 3)),
						new Space(new Range(1, 3, 1, 4)),
						new RightBracket(new Range(1, 4, 1, 5)),
						new LeftParenthesis(new Range(1, 5, 1, 6)),
						new Word(new Range(1, 6, 1, 6 + 11), './real/file'),
						new Space(new Range(1, 17, 1, 18)),
						new Word(new Range(1, 18, 1, 18 + 19), 'path/file★name.webp'),
						new NewLine(new Range(1, 37, 1, 38)),
						// `2nd` line
						new FormFeed(new Range(2, 1, 2, 2)),
						new ExclamationMark(new Range(2, 2, 2, 3)),
						new LeftBracket(new Range(2, 3, 2, 4)),
						new Word(new Range(2, 4, 2, 4 + 4), 'link'),
						new Space(new Range(2, 8, 2, 9)),
						new Word(new Range(2, 9, 2, 9 + 4), 'text'),
						new RightBracket(new Range(2, 13, 2, 14)),
						new Space(new Range(2, 14, 2, 15)),
						new LeftParenthesis(new Range(2, 15, 2, 16)),
						new Word(new Range(2, 16, 2, 16 + 6), './file'),
						new Space(new Range(2, 22, 2, 23)),
						new Word(new Range(2, 23, 2, 23 + 13), 'path/name.jpg'),
						new RightParenthesis(new Range(2, 36, 2, 37)),
						new NewLine(new Range(2, 37, 2, 38)),
						// `3rd` line
						new VerticalTab(new Range(3, 1, 3, 2)),
						new ExclamationMark(new Range(3, 2, 3, 3)),
						new LeftBracket(new Range(3, 3, 3, 4)),
						new Space(new Range(3, 4, 3, 5)),
						new RightBracket(new Range(3, 5, 3, 6)),
						new LeftParenthesis(new Range(3, 6, 3, 7)),
						new Word(new Range(3, 7, 3, 7 + 6), './file'),
						new NewLine(new Range(3, 13, 3, 14)),
						new Word(new Range(4, 1, 4, 1 + 13), 'path/name.jpg'),
						new Space(new Range(4, 14, 4, 15)),
						new RightParenthesis(new Range(4, 15, 4, 16)),
					],
				);
			});

			suite('• stop characters inside caption/reference (new lines)', () => {
				for (const stopCharacter of [CarriageReturn, NewLine]) {
					let characterName = '';

					if (stopCharacter === CarriageReturn) {
						characterName = '\\r';
					}
					if (stopCharacter === NewLine) {
						characterName = '\\n';
					}

					assert(
						characterName !== '',
						'The "characterName" must be set, got "empty line".',
					);

					test(`• stop character - "${characterName}"`, async () => {
						const test = testDisposables.add(
							new TestMarkdownDecoder(),
						);

						const inputLines = [
							// stop character inside link caption
							`![haa${stopCharacter.symbol}loů](./real/💁/name.png)`,
							// stop character inside link reference
							`![ref text](/etc/pat${stopCharacter.symbol}h/to/file.webp)`,
							// stop character between line caption and link reference is disallowed
							`![text]${stopCharacter.symbol}(/etc/ path/file.jpeg)`,
						];


						await test.run(
							inputLines,
							[
								// `1st` input line
								new ExclamationMark(new Range(1, 1, 1, 2)),
								new LeftBracket(new Range(1, 2, 1, 3)),
								new Word(new Range(1, 3, 1, 3 + 3), 'haa'),
								new stopCharacter(new Range(1, 6, 1, 7)), // <- stop character
								new Word(new Range(2, 1, 2, 1 + 3), 'loů'),
								new RightBracket(new Range(2, 4, 2, 5)),
								new LeftParenthesis(new Range(2, 5, 2, 6)),
								new Word(new Range(2, 6, 2, 6 + 18), './real/💁/name.png'),
								new RightParenthesis(new Range(2, 24, 2, 25)),
								new NewLine(new Range(2, 25, 2, 26)),
								// `2nd` input line
								new ExclamationMark(new Range(3, 1, 3, 2)),
								new LeftBracket(new Range(3, 2, 3, 3)),
								new Word(new Range(3, 3, 3, 3 + 3), 'ref'),
								new Space(new Range(3, 6, 3, 7)),
								new Word(new Range(3, 7, 3, 7 + 4), 'text'),
								new RightBracket(new Range(3, 11, 3, 12)),
								new LeftParenthesis(new Range(3, 12, 3, 13)),
								new Word(new Range(3, 13, 3, 13 + 8), '/etc/pat'),
								new stopCharacter(new Range(3, 21, 3, 22)), // <- stop character
								new Word(new Range(4, 1, 4, 1 + 14), 'h/to/file.webp'),
								new RightParenthesis(new Range(4, 15, 4, 16)),
								new NewLine(new Range(4, 16, 4, 17)),
								// `3nd` input line
								new ExclamationMark(new Range(5, 1, 5, 2)),
								new LeftBracket(new Range(5, 2, 5, 3)),
								new Word(new Range(5, 3, 5, 3 + 4), 'text'),
								new RightBracket(new Range(5, 7, 5, 8)),
								new stopCharacter(new Range(5, 8, 5, 9)), // <- stop character
								new LeftParenthesis(new Range(6, 1, 6, 2)),
								new Word(new Range(6, 2, 6, 2 + 5), '/etc/'),
								new Space(new Range(6, 7, 6, 8)),
								new Word(new Range(6, 8, 6, 8 + 14), 'path/file.jpeg'),
								new RightParenthesis(new Range(6, 22, 6, 23)),
							],
						);
					});
				}
			});

			/**
			 * Same as above but these stop characters do not move the caret to the next line.
			 */
			suite('• stop characters inside caption/reference (same line)', () => {
				for (const stopCharacter of [VerticalTab, FormFeed]) {
					let characterName = '';

					if (stopCharacter === VerticalTab) {
						characterName = '\\v';
					}
					if (stopCharacter === FormFeed) {
						characterName = '\\f';
					}

					assert(
						characterName !== '',
						'The "characterName" must be set, got "empty line".',
					);

					test(`• stop character - "${characterName}"`, async () => {
						const test = testDisposables.add(
							new TestMarkdownDecoder(),
						);

						const inputLines = [
							// stop character inside link caption
							`![haa${stopCharacter.symbol}loů](./real/💁/name)`,
							// stop character inside link reference
							`![ref text](/etc/pat${stopCharacter.symbol}h/to/file.webp)`,
							// stop character between line caption and link reference is disallowed
							`![text]${stopCharacter.symbol}(/etc/ path/image.gif)`,
						];


						await test.run(
							inputLines,
							[
								// `1st` input line
								new ExclamationMark(new Range(1, 1, 1, 2)),
								new LeftBracket(new Range(1, 2, 1, 3)),
								new Word(new Range(1, 3, 1, 3 + 3), 'haa'),
								new stopCharacter(new Range(1, 6, 1, 7)), // <- stop character
								new Word(new Range(1, 7, 1, 7 + 3), 'loů'),
								new RightBracket(new Range(1, 10, 1, 11)),
								new LeftParenthesis(new Range(1, 11, 1, 12)),
								new Word(new Range(1, 12, 1, 12 + 14), './real/💁/name'),
								new RightParenthesis(new Range(1, 26, 1, 27)),
								new NewLine(new Range(1, 27, 1, 28)),
								// `2nd` input line
								new ExclamationMark(new Range(2, 1, 2, 2)),
								new LeftBracket(new Range(2, 2, 2, 3)),
								new Word(new Range(2, 3, 2, 3 + 3), 'ref'),
								new Space(new Range(2, 6, 2, 7)),
								new Word(new Range(2, 7, 2, 7 + 4), 'text'),
								new RightBracket(new Range(2, 11, 2, 12)),
								new LeftParenthesis(new Range(2, 12, 2, 13)),
								new Word(new Range(2, 13, 2, 13 + 8), '/etc/pat'),
								new stopCharacter(new Range(2, 21, 2, 22)), // <- stop character
								new Word(new Range(2, 22, 2, 22 + 14), 'h/to/file.webp'),
								new RightParenthesis(new Range(2, 36, 2, 37)),
								new NewLine(new Range(2, 37, 2, 38)),
								// `3nd` input line
								new ExclamationMark(new Range(3, 1, 3, 2)),
								new LeftBracket(new Range(3, 2, 3, 3)),
								new Word(new Range(3, 3, 3, 3 + 4), 'text'),
								new RightBracket(new Range(3, 7, 3, 8)),
								new stopCharacter(new Range(3, 8, 3, 9)), // <- stop character
								new LeftParenthesis(new Range(3, 9, 3, 10)),
								new Word(new Range(3, 10, 3, 10 + 5), '/etc/'),
								new Space(new Range(3, 15, 3, 16)),
								new Word(new Range(3, 16, 3, 16 + 14), 'path/image.gif'),
								new RightParenthesis(new Range(3, 30, 3, 31)),
							],
						);
					});
				}
			});
		});
	});

	suite('• comments', () => {
		suite('• general', () => {
			test('• base cases', async () => {
				const test = testDisposables.add(
					new TestMarkdownDecoder(),
				);

				const inputData = [
					// comment with text inside it
					'\t<!-- hello world -->',
					// comment with a link inside
					'some text<!-- \v[link label](/some/path/to/file.md)\f --> and more text ',
					// comment new lines inside it
					'<!-- comment\r\ntext\n\ngoes here --> usual text follows',
					// an empty comment
					'\t<!---->\t',
					// comment that was not closed properly
					'haalo\t<!-- [link label](/some/path/to/file.md)',
				];

				await test.run(
					inputData,
					[
						// `1st`
						new Tab(new Range(1, 1, 1, 2)),
						new MarkdownComment(new Range(1, 2, 1, 2 + 20), '<!-- hello world -->'),
						new NewLine(new Range(1, 22, 1, 23)),
						// `2nd`
						new Word(new Range(2, 1, 2, 5), 'some'),
						new Space(new Range(2, 5, 2, 6)),
						new Word(new Range(2, 6, 2, 10), 'text'),
						new MarkdownComment(new Range(2, 10, 2, 10 + 46), '<!-- \v[link label](/some/path/to/file.md)\f -->'),
						new Space(new Range(2, 56, 2, 57)),
						new Word(new Range(2, 57, 2, 60), 'and'),
						new Space(new Range(2, 60, 2, 61)),
						new Word(new Range(2, 61, 2, 65), 'more'),
						new Space(new Range(2, 65, 2, 66)),
						new Word(new Range(2, 66, 2, 70), 'text'),
						new Space(new Range(2, 70, 2, 71)),
						new NewLine(new Range(2, 71, 2, 72)),
						// `3rd`
						new MarkdownComment(new Range(3, 1, 3 + 3, 1 + 13), '<!-- comment\r\ntext\n\ngoes here -->'),
						new Space(new Range(6, 14, 6, 15)),
						new Word(new Range(6, 15, 6, 15 + 5), 'usual'),
						new Space(new Range(6, 20, 6, 21)),
						new Word(new Range(6, 21, 6, 21 + 4), 'text'),
						new Space(new Range(6, 25, 6, 26)),
						new Word(new Range(6, 26, 6, 26 + 7), 'follows'),
						new NewLine(new Range(6, 33, 6, 34)),
						// `4rd`
						new Tab(new Range(7, 1, 7, 2)),
						new MarkdownComment(new Range(7, 2, 7, 2 + 7), '<!---->'),
						new Tab(new Range(7, 9, 7, 10)),
						new NewLine(new Range(7, 10, 7, 11)),
						// `5th`
						new Word(new Range(8, 1, 8, 6), 'haalo'),
						new Tab(new Range(8, 6, 8, 7)),
						new MarkdownComment(new Range(8, 7, 8, 7 + 40), '<!-- [link label](/some/path/to/file.md)'),
					],
				);
			});

			test('• nuanced', async () => {
				const test = testDisposables.add(
					new TestMarkdownDecoder(),
				);

				const inputData = [
					// comment inside `<>` brackets
					' \f <<!--commen\t-->>',
					// comment contains `<[]>` brackets and `!`
					'<!--<[!c⚽︎mment!]>-->\t\t',
					// comment contains `<!--` and new lines
					'\v<!--some\r\ntext\n\t<!--inner\r\ntext-->\t\t',
					// comment contains `<!--` and never closed properly
					' <!--<!--inner\r\ntext-- >\t\v\f ',
				];

				await test.run(
					inputData,
					[
						// `1st`
						new Space(new Range(1, 1, 1, 2)),
						new FormFeed(new Range(1, 2, 1, 3)),
						new Space(new Range(1, 3, 1, 4)),
						new LeftAngleBracket(new Range(1, 4, 1, 5)),
						new MarkdownComment(new Range(1, 5, 1, 5 + 14), '<!--commen\t-->'),
						new RightAngleBracket(new Range(1, 19, 1, 20)),
						new NewLine(new Range(1, 20, 1, 21)),
						// `2nd`
						new MarkdownComment(new Range(2, 1, 2, 1 + 21), '<!--<[!c⚽︎mment!]>-->'),
						new Tab(new Range(2, 22, 2, 23)),
						new Tab(new Range(2, 23, 2, 24)),
						new NewLine(new Range(2, 24, 2, 25)),
						// `3rd`
						new VerticalTab(new Range(3, 1, 3, 2)),
						new MarkdownComment(new Range(3, 2, 3 + 3, 1 + 7), '<!--some\r\ntext\n\t<!--inner\r\ntext-->'),
						new Tab(new Range(6, 8, 6, 9)),
						new Tab(new Range(6, 9, 6, 10)),
						new NewLine(new Range(6, 10, 6, 11)),
						// `4rd`
						new Space(new Range(7, 1, 7, 2)),
						// note! comment does not have correct closing `-->`, hence the comment extends
						//       to the end of the text, and therefore includes the \t\v\f and space at the end
						new MarkdownComment(new Range(7, 2, 8, 1 + 12), '<!--<!--inner\r\ntext-- >\t\v\f '),
					],
				);
			});
		});

		test('• invalid', async () => {
			const test = testDisposables.add(
				new TestMarkdownDecoder(),
			);

			const inputData = [
				'\t<! -- mondo --> ',
				' < !-- світ -->\t',
				'\v<!- - terra -->\f',
				'<!--mundo - -> ',
			];

			await test.run(
				inputData,
				[
					// `1st`
					new Tab(new Range(1, 1, 1, 2)),
					new LeftAngleBracket(new Range(1, 2, 1, 3)),
					new ExclamationMark(new Range(1, 3, 1, 4)),
					new Space(new Range(1, 4, 1, 5)),
					new Dash(new Range(1, 5, 1, 6)),
					new Dash(new Range(1, 6, 1, 7)),
					new Space(new Range(1, 7, 1, 8)),
					new Word(new Range(1, 8, 1, 8 + 5), 'mondo'),
					new Space(new Range(1, 13, 1, 14)),
					new Dash(new Range(1, 14, 1, 15)),
					new Dash(new Range(1, 15, 1, 16)),
					new RightAngleBracket(new Range(1, 16, 1, 17)),
					new Space(new Range(1, 17, 1, 18)),
					new NewLine(new Range(1, 18, 1, 19)),
					// `2nd`
					new Space(new Range(2, 1, 2, 2)),
					new LeftAngleBracket(new Range(2, 2, 2, 3)),
					new Space(new Range(2, 3, 2, 4)),
					new ExclamationMark(new Range(2, 4, 2, 5)),
					new Dash(new Range(2, 5, 2, 6)),
					new Dash(new Range(2, 6, 2, 7)),
					new Space(new Range(2, 7, 2, 8)),
					new Word(new Range(2, 8, 2, 8 + 4), 'світ'),
					new Space(new Range(2, 12, 2, 13)),
					new Dash(new Range(2, 13, 2, 14)),
					new Dash(new Range(2, 14, 2, 15)),
					new RightAngleBracket(new Range(2, 15, 2, 16)),
					new Tab(new Range(2, 16, 2, 17)),
					new NewLine(new Range(2, 17, 2, 18)),
					// `3rd`
					new VerticalTab(new Range(3, 1, 3, 2)),
					new LeftAngleBracket(new Range(3, 2, 3, 3)),
					new ExclamationMark(new Range(3, 3, 3, 4)),
					new Dash(new Range(3, 4, 3, 5)),
					new Space(new Range(3, 5, 3, 6)),
					new Dash(new Range(3, 6, 3, 7)),
					new Space(new Range(3, 7, 3, 8)),
					new Word(new Range(3, 8, 3, 8 + 5), 'terra'),
					new Space(new Range(3, 13, 3, 14)),
					new Dash(new Range(3, 14, 3, 15)),
					new Dash(new Range(3, 15, 3, 16)),
					new RightAngleBracket(new Range(3, 16, 3, 17)),
					new FormFeed(new Range(3, 17, 3, 18)),
					new NewLine(new Range(3, 18, 3, 19)),
					// `4rd`
					// note! comment does not have correct closing `-->`, hence the comment extends
					//       to the end of the text, and therefore includes the `space` at the end
					new MarkdownComment(new Range(4, 1, 4, 1 + 15), '<!--mundo - -> '),
				],
			);
		});
	});
});
