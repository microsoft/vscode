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
import { Space } from '../../../common/codecs/simpleCodec/tokens/space.js';
import { NewLine } from '../../../common/codecs/linesCodec/tokens/newLine.js';
import { FormFeed } from '../../../common/codecs/simpleCodec/tokens/formFeed.js';
import { VerticalTab } from '../../../common/codecs/simpleCodec/tokens/verticalTab.js';
import { MarkdownLink } from '../../../common/codecs/markdownCodec/tokens/markdownLink.js';
import { CarriageReturn } from '../../../common/codecs/linesCodec/tokens/carriageReturn.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LeftBracket, RightBracket } from '../../../common/codecs/simpleCodec/tokens/brackets.js';
import { MarkdownDecoder, TMarkdownToken } from '../../../common/codecs/markdownCodec/markdownDecoder.js';
import { LeftParenthesis, RightParenthesis } from '../../../common/codecs/simpleCodec/tokens/parentheses.js';
import { MarkdownComment } from '../../../common/codecs/markdownCodec/tokens/markdownComment.js';

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

	suite('general', () => {
		test('produces expected tokens', async () => {
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

		test('handles complex cases', async () => {
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

	suite('links', () => {
		suite('broken links', () => {
			test('incomplete/invalid links', async () => {
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

			suite('stop characters inside caption/reference (new lines)', () => {
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

					test(`stop character - "${characterName}"`, async () => {
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
			suite('stop characters inside caption/reference (same line)', () => {
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

					test(`stop character - "${characterName}"`, async () => {
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

	suite('comments', () => {
		test('base cases', async () => {
			const test = testDisposables.add(
				new TestMarkdownDecoder(),
			);

			const inputData = [
				// markdown comment with text inside it
				'\t<!-- hello world -->',
				// markdown comment with a link inside
				'some text<!-- \v[link label](/some/path/to/file.md)\f --> and more text ',
				// markdown comment new lines inside it
				'<!-- comment\r\ntext\n\ngoes here --> usual text follows',
				// markdown comment that was not closed properly
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
					new Word(new Range(7, 1, 7, 6), 'haalo'),
					new Tab(new Range(7, 6, 7, 7)),
					new MarkdownComment(new Range(7, 7, 7, 7 + 40), '<!-- [link label](/some/path/to/file.md)'),
				],
			);
		});
	});
});
