/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestDecoder } from '../utils/testDecoder.js';
import { Range } from '../../../common/core/range.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { Tab } from '../../../common/codecs/simpleCodec/tokens/tab.js';
import { Hash } from '../../../common/codecs/simpleCodec/tokens/hash.js';
import { Word } from '../../../common/codecs/simpleCodec/tokens/word.js';
import { Space } from '../../../common/codecs/simpleCodec/tokens/space.js';
import { NewLine } from '../../../common/codecs/linesCodec/tokens/newLine.js';
import { FormFeed } from '../../../common/codecs/simpleCodec/tokens/formFeed.js';
import { VerticalTab } from '../../../common/codecs/simpleCodec/tokens/verticalTab.js';
import { CarriageReturn } from '../../../common/codecs/linesCodec/tokens/carriageReturn.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SimpleDecoder, TSimpleToken } from '../../../common/codecs/simpleCodec/simpleDecoder.js';
import { LeftBracket, RightBracket } from '../../../common/codecs/simpleCodec/tokens/brackets.js';
import { LeftParenthesis, RightParenthesis } from '../../../common/codecs/simpleCodec/tokens/parentheses.js';

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
export class TestSimpleDecoder extends TestDecoder<TSimpleToken, SimpleDecoder> {
	constructor() {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = new SimpleDecoder(stream);

		super(stream, decoder);
	}
}

suite('SimpleDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens', async () => {
		const test = testDisposables.add(
			new TestSimpleDecoder(),
		);

		await test.run(
			' hello world\nhow are\t you?\v\n\n   (test)  [!@#$%^🦄&*_+=]\f  \n\t\t🤗❤ \t\n hey\vthere\r\n\r\n',
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
				new Word(new Range(2, 10, 2, 14), 'you?'),
				new VerticalTab(new Range(2, 14, 2, 15)),
				new NewLine(new Range(2, 15, 2, 16)),
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
				new Word(new Range(4, 13, 4, 13 + 2), '!@'),
				new Hash(new Range(4, 15, 4, 16)),
				new Word(new Range(4, 16, 4, 16 + 10), '$%^🦄&*_+='),
				new RightBracket(new Range(4, 26, 4, 27)),
				new FormFeed(new Range(4, 27, 4, 28)),
				new Space(new Range(4, 28, 4, 29)),
				new Space(new Range(4, 29, 4, 30)),
				new NewLine(new Range(4, 30, 4, 31)),
				// fifth line
				new Tab(new Range(5, 1, 5, 2)),
				new Tab(new Range(5, 2, 5, 3)),
				new Word(new Range(5, 3, 5, 6), '🤗❤'),
				new Space(new Range(5, 6, 5, 7)),
				new Tab(new Range(5, 7, 5, 8)),
				new NewLine(new Range(5, 8, 5, 9)),
				// sixth line
				new Space(new Range(6, 1, 6, 2)),
				new Word(new Range(6, 2, 6, 5), 'hey'),
				new VerticalTab(new Range(6, 5, 6, 6)),
				new Word(new Range(6, 6, 6, 11), 'there'),
				new CarriageReturn(new Range(6, 11, 6, 12)),
				new NewLine(new Range(6, 12, 6, 13)),
				// seventh line
				new CarriageReturn(new Range(7, 1, 7, 2)),
				new NewLine(new Range(7, 2, 7, 3)),
			],
		);
	});
});
