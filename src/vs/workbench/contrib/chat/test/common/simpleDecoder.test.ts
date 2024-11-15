/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestDecoder } from './utils/testDecoder.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { newWriteableStream } from '../../../../../base/common/stream.js';
import { NewLine } from '../../../../common/codecs/linesCodec/tokens/newLine.js';
import { LinesDecoder } from '../../../../common/codecs/linesCodec/linesDecoder.js';
import { Word, Space, Tab } from '../../../../common/codecs/simpleCodec/tokens/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SimpleDecoder, TSimpleToken } from '../../../../common/codecs/simpleCodec/simpleDecoder.js';

/**
 * A reusable test utility that asserts that a `SimpleDecoder` isntance
 * correctly decodes `inputData` into a stream of `TSimpleToken` tokens.
 *
 * ## Examples
 *
 * ```typescript
 * // create a new test utility instance
 * const test = testDisposables.add(
 * new TestSimpleDecoder(
 *   ' hello world\n',
 * 	 [
 * 	   new Space(new Range(1, 1, 1, 2)),
 * 	   new Word(new Range(1, 2, 1, 7), 'hello'),
 * 	   new Space(new Range(1, 7, 1, 8)),
 * 	   new Word(new Range(1, 8, 1, 13), 'world'),
 * 	   new NewLine(new Range(1, 13, 1, 14)),
 *   ]),
 * );
 *
 * // run the test
 * await test.run();
 */
export class TestSimpleDecoder extends TestDecoder<TSimpleToken, SimpleDecoder> {
	constructor(
		inputData: string,
		expectedTokens: readonly TSimpleToken[],
	) {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = new SimpleDecoder(
			new LinesDecoder(stream),
		);

		super(
			decoder,
			() => {
				stream.write(VSBuffer.fromString(inputData));
				stream.end();
			},
			expectedTokens,
		);
	}
}

suite('SimpleDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens', async () => {
		const test = testDisposables.add(
			new TestSimpleDecoder(
				' hello world\nhow are\t you?\n\n   (test)  [!@#$%^&*_+=]  \n\t\t🤗❤ \t\n ',
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
					new NewLine(new Range(2, 14, 2, 15)),
					// third line
					new NewLine(new Range(3, 1, 3, 2)),
					// fourth line
					new Space(new Range(4, 1, 4, 2)),
					new Space(new Range(4, 2, 4, 3)),
					new Space(new Range(4, 3, 4, 4)),
					new Word(new Range(4, 4, 4, 10), '(test)'),
					new Space(new Range(4, 10, 4, 11)),
					new Space(new Range(4, 11, 4, 12)),
					new Word(new Range(4, 12, 4, 25), '[!@#$%^&*_+=]'),
					new Space(new Range(4, 25, 4, 26)),
					new Space(new Range(4, 26, 4, 27)),
					new NewLine(new Range(4, 27, 4, 28)),
					// fifth line
					new Tab(new Range(5, 1, 5, 2)),
					new Tab(new Range(5, 2, 5, 3)),
					new Word(new Range(5, 3, 5, 6), '🤗❤'),
					new Space(new Range(5, 6, 5, 7)),
					new Tab(new Range(5, 7, 5, 8)),
					new NewLine(new Range(5, 8, 5, 9)),
					// sixth line
					new Space(new Range(6, 1, 6, 2)),
				],
			),
		);

		await test.run();
	});
});
