/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../common/core/range.js';
import { TestDecoder } from '../utils/testDecoder.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { NewLine } from '../../../common/codecs/linesCodec/tokens/newLine.js';
import { CarriageReturn } from '../../../common/codecs/linesCodec/tokens/carriageReturn.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SimpleDecoder, TSimpleDecoderToken } from '../../../common/codecs/simpleCodec/simpleDecoder.js';
import {
	At,
	Tab,
	Word,
	Hash,
	Dash,
	Colon,
	Slash,
	Space,
	Quote,
	FormFeed,
	DollarSign,
	DoubleQuote,
	VerticalTab,
	LeftBracket,
	RightBracket,
	LeftCurlyBrace,
	RightCurlyBrace,
	ExclamationMark,
	LeftParenthesis,
	RightParenthesis,
	LeftAngleBracket,
	RightAngleBracket,
	Comma,
} from '../../../common/codecs/simpleCodec/tokens/index.js';

/**
 * A reusable test utility that asserts that a `SimpleDecoder` instance
 * correctly decodes `inputData` into a stream of `TSimpleToken` tokens.
 *
 * ## Examples
 *
 * ```typescript
 * // create a new test utility instance
 * const test = testDisposables.add(new TestSimpleDecoder());
 *
 * // run the test
 * await test.run(
 *   ' hello world\n',
 *   [
 *     new Space(new Range(1, 1, 1, 2)),
 *     new Word(new Range(1, 2, 1, 7), 'hello'),
 *     new Space(new Range(1, 7, 1, 8)),
 *     new Word(new Range(1, 8, 1, 13), 'world'),
 *     new NewLine(new Range(1, 13, 1, 14)),
 *   ],
 * );
 */
export class TestSimpleDecoder extends TestDecoder<TSimpleDecoderToken, SimpleDecoder> {
	constructor() {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = new SimpleDecoder(stream);

		super(stream, decoder);
	}
}

suite('SimpleDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens #1', async () => {
		const test = testDisposables.add(
			new TestSimpleDecoder(),
		);

		await test.run(
			[
				' hello world!',
				'how are\t "you?"\v',
				'',
				'   (test)  [!@#$:%^🦄&*_+=,-,]\f  ',
				'\t<hi 👋>\t🤗❤ \t',
				' hey\v-\tthere\r',
				' @workspace@legomushroom',
				'\'my\' ${text} /run',
			],
			[
				// first line
				new Space(new Range(1, 1, 1, 2)),
				new Word(new Range(1, 2, 1, 7), 'hello'),
				new Space(new Range(1, 7, 1, 8)),
				new Word(new Range(1, 8, 1, 13), 'world'),
				new ExclamationMark(new Range(1, 13, 1, 14)),
				new NewLine(new Range(1, 14, 1, 15)),
				// second line
				new Word(new Range(2, 1, 2, 4), 'how'),
				new Space(new Range(2, 4, 2, 5)),
				new Word(new Range(2, 5, 2, 8), 'are'),
				new Tab(new Range(2, 8, 2, 9)),
				new Space(new Range(2, 9, 2, 10)),
				new DoubleQuote(new Range(2, 10, 2, 11)),
				new Word(new Range(2, 11, 2, 11 + 4), 'you?'),
				new DoubleQuote(new Range(2, 15, 2, 16)),
				new VerticalTab(new Range(2, 16, 2, 17)),
				new NewLine(new Range(2, 17, 2, 18)),
				// third line
				new NewLine(new Range(3, 1, 3, 2)),
				// fourth line
				new Space(new Range(4, 1, 4, 2)),
				new Space(new Range(4, 2, 4, 3)),
				new Space(new Range(4, 3, 4, 4)),
				new LeftParenthesis(new Range(4, 4, 4, 5)),
				new Word(new Range(4, 5, 4, 5 + 4), 'test'),
				new RightParenthesis(new Range(4, 9, 4, 10)),
				new Space(new Range(4, 10, 4, 11)),
				new Space(new Range(4, 11, 4, 12)),
				new LeftBracket(new Range(4, 12, 4, 13)),
				new ExclamationMark(new Range(4, 13, 4, 14)),
				new At(new Range(4, 14, 4, 15)),
				new Hash(new Range(4, 15, 4, 16)),
				new DollarSign(new Range(4, 16, 4, 17)),
				new Colon(new Range(4, 17, 4, 18)),
				new Word(new Range(4, 18, 4, 18 + 9), '%^🦄&*_+='),
				new Comma(new Range(4, 27, 4, 28)),
				new Dash(new Range(4, 28, 4, 29)),
				new Comma(new Range(4, 29, 4, 30)),
				new RightBracket(new Range(4, 30, 4, 31)),
				new FormFeed(new Range(4, 31, 4, 32)),
				new Space(new Range(4, 32, 4, 33)),
				new Space(new Range(4, 33, 4, 34)),
				new NewLine(new Range(4, 34, 4, 35)),
				// fifth line
				new Tab(new Range(5, 1, 5, 2)),
				new LeftAngleBracket(new Range(5, 2, 5, 3)),
				new Word(new Range(5, 3, 5, 5), 'hi'),
				new Space(new Range(5, 5, 5, 6)),
				new Word(new Range(5, 6, 5, 8), '👋'),
				new RightAngleBracket(new Range(5, 8, 5, 9)),
				new Tab(new Range(5, 9, 5, 10)),
				new Word(new Range(5, 10, 5, 13), '🤗❤'),
				new Space(new Range(5, 13, 5, 14)),
				new Tab(new Range(5, 14, 5, 15)),
				new NewLine(new Range(5, 15, 5, 16)),
				// sixth line
				new Space(new Range(6, 1, 6, 2)),
				new Word(new Range(6, 2, 6, 5), 'hey'),
				new VerticalTab(new Range(6, 5, 6, 6)),
				new Dash(new Range(6, 6, 6, 7)),
				new Tab(new Range(6, 7, 6, 8)),
				new Word(new Range(6, 8, 6, 13), 'there'),
				new CarriageReturn(new Range(6, 13, 6, 14)),
				new NewLine(new Range(6, 14, 6, 15)),
				// seventh line
				new Space(new Range(7, 1, 7, 2)),
				new At(new Range(7, 2, 7, 3)),
				new Word(new Range(7, 3, 7, 12), 'workspace'),
				new At(new Range(7, 12, 7, 13)),
				new Word(new Range(7, 13, 7, 25), 'legomushroom'),
				new NewLine(new Range(7, 25, 7, 26)),
				// eighth line
				new Quote(new Range(8, 1, 8, 2)),
				new Word(new Range(8, 2, 8, 2 + 2), 'my'),
				new Quote(new Range(8, 4, 8, 5)),
				new Space(new Range(8, 5, 8, 6)),
				new DollarSign(new Range(8, 6, 8, 7)),
				new LeftCurlyBrace(new Range(8, 7, 8, 8)),
				new Word(new Range(8, 8, 8, 8 + 4), 'text'),
				new RightCurlyBrace(new Range(8, 12, 8, 13)),
				new Space(new Range(8, 13, 8, 14)),
				new Slash(new Range(8, 14, 8, 15)),
				new Word(new Range(8, 15, 8, 15 + 3), 'run'),
			],
		);
	});

	test('produces expected tokens #2', async () => {
		const test = testDisposables.add(
			new TestSimpleDecoder(),
		);

		await test.run(
			[
				'your command is /catch',
				'\t\t/command1/command2 ',
				'  /cmd#var ',
				'/test@github\t\t',
				'/update\r',
				'',
			],
			[
				// first line
				new Word(new Range(1, 1, 1, 5), 'your'),
				new Space(new Range(1, 5, 1, 6)),
				new Word(new Range(1, 6, 1, 6 + 7), 'command'),
				new Space(new Range(1, 13, 1, 14)),
				new Word(new Range(1, 14, 1, 14 + 2), 'is'),
				new Space(new Range(1, 16, 1, 17)),
				new Slash(new Range(1, 17, 1, 18)),
				new Word(new Range(1, 18, 1, 18 + 5), 'catch'),
				new NewLine(new Range(1, 23, 1, 24)),
				// second line
				new Tab(new Range(2, 1, 2, 2)),
				new Tab(new Range(2, 2, 2, 3)),
				new Slash(new Range(2, 3, 2, 4)),
				new Word(new Range(2, 4, 2, 4 + 8), 'command1'),
				new Slash(new Range(2, 12, 2, 13)),
				new Word(new Range(2, 13, 2, 13 + 8), 'command2'),
				new Space(new Range(2, 21, 2, 22)),
				new NewLine(new Range(2, 22, 2, 23)),
				// third line
				new Space(new Range(3, 1, 3, 2)),
				new Space(new Range(3, 2, 3, 3)),
				new Slash(new Range(3, 3, 3, 4)),
				new Word(new Range(3, 4, 3, 4 + 3), 'cmd'),
				new Hash(new Range(3, 7, 3, 8)),
				new Word(new Range(3, 8, 3, 8 + 3), 'var'),
				new Space(new Range(3, 11, 3, 12)),
				new NewLine(new Range(3, 12, 3, 13)),
				// fourth line
				new Slash(new Range(4, 1, 4, 2)),
				new Word(new Range(4, 2, 4, 2 + 4), 'test'),
				new At(new Range(4, 6, 4, 7)),
				new Word(new Range(4, 7, 4, 7 + 6), 'github'),
				new Tab(new Range(4, 13, 4, 14)),
				new Tab(new Range(4, 14, 4, 15)),
				new NewLine(new Range(4, 15, 4, 16)),
				// fifth line
				new Slash(new Range(5, 1, 5, 2)),
				new Word(new Range(5, 2, 5, 2 + 6), 'update'),
				new CarriageReturn(new Range(5, 8, 5, 9)),
				new NewLine(new Range(5, 9, 5, 10)),
			],
		);
	});
});
