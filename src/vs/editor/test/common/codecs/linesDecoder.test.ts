/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestDecoder } from '../utils/testDecoder.js';
import { Range } from '../../../common/core/range.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { Line } from '../../../common/codecs/linesCodec/tokens/line.js';
import { NewLine } from '../../../common/codecs/linesCodec/tokens/newLine.js';
import { CarriageReturn } from '../../../common/codecs/linesCodec/tokens/carriageReturn.js';
import { LinesDecoder, TLineToken } from '../../../common/codecs/linesCodec/linesDecoder.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

/**
 * A reusable test utility that asserts that a `LinesDecoder` instance
 * correctly decodes `inputData` into a stream of `TLineToken` tokens.
 *
 * ## Examples
 *
 * ```typescript
 * // create a new test utility instance
 * const test = testDisposables.add(new TestLinesDecoder());
 *
 * // run the test
 * await test.run(
 *   ' hello world\n',
 *   [
 *     new Line(1, ' hello world'),
 *     new NewLine(new Range(1, 13, 1, 14)),
 *   ],
 * );
 */
export class TestLinesDecoder extends TestDecoder<TLineToken, LinesDecoder> {
	constructor() {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = new LinesDecoder(stream);

		super(stream, decoder);
	}
}

suite('LinesDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('produces expected tokens', () => {
		test('input starts with line data', async () => {
			const test = testDisposables.add(new TestLinesDecoder());

			await test.run(
				' hello world\nhow are you doing?\n\n 😊 \r ',
				[
					new Line(1, ' hello world'),
					new NewLine(new Range(1, 13, 1, 14)),
					new Line(2, 'how are you doing?'),
					new NewLine(new Range(2, 19, 2, 20)),
					new Line(3, ''),
					new NewLine(new Range(3, 1, 3, 2)),
					new Line(4, ' 😊 '),
					new CarriageReturn(new Range(4, 5, 4, 6)),
					new Line(5, ' '),
				],
			);
		});

		test('input starts with a new line', async () => {
			const test = testDisposables.add(new TestLinesDecoder());

			await test.run(
				'\nsome text on this line\n\n\nanother 💬 on this line\r\n🤫\n',
				[
					new Line(1, ''),
					new NewLine(new Range(1, 1, 1, 2)),
					new Line(2, 'some text on this line'),
					new NewLine(new Range(2, 23, 2, 24)),
					new Line(3, ''),
					new NewLine(new Range(3, 1, 3, 2)),
					new Line(4, ''),
					new NewLine(new Range(4, 1, 4, 2)),
					new Line(5, 'another 💬 on this line'),
					new CarriageReturn(new Range(5, 24, 5, 25)),
					new NewLine(new Range(5, 25, 5, 26)),
					new Line(6, '🤫'),
					new NewLine(new Range(6, 3, 6, 4)),
				],
			);
		});

		test('input starts and ends with multiple new lines', async () => {
			const test = testDisposables.add(new TestLinesDecoder());

			await test.run(
				'\n\n\r\nciao! 🗯️\t💭 💥 come\tva?\n\n\n\n\n',
				[
					new Line(1, ''),
					new NewLine(new Range(1, 1, 1, 2)),
					new Line(2, ''),
					new NewLine(new Range(2, 1, 2, 2)),
					new Line(3, ''),
					new CarriageReturn(new Range(3, 1, 3, 2)),
					new NewLine(new Range(3, 2, 3, 3)),
					new Line(4, 'ciao! 🗯️\t💭 💥 come\tva?'),
					new NewLine(new Range(4, 25, 4, 26)),
					new Line(5, ''),
					new NewLine(new Range(5, 1, 5, 2)),
					new Line(6, ''),
					new NewLine(new Range(6, 1, 6, 2)),
					new Line(7, ''),
					new NewLine(new Range(7, 1, 7, 2)),
					new Line(8, ''),
					new NewLine(new Range(8, 1, 8, 2)),
				],
			);
		});

		test('single carriage return is treated as new line', async () => {
			const test = testDisposables.add(new TestLinesDecoder());

			await test.run(
				'\r\rhaalo! 💥💥 how\'re you?\r ?!\r\n\r\n ',
				[
					new Line(1, ''),
					new CarriageReturn(new Range(1, 1, 1, 2)),
					new Line(2, ''),
					new CarriageReturn(new Range(2, 1, 2, 2)),
					new Line(3, 'haalo! 💥💥 how\'re you?'),
					new CarriageReturn(new Range(3, 24, 3, 25)),
					new Line(4, ' ?!'),
					new CarriageReturn(new Range(4, 4, 4, 5)),
					new NewLine(new Range(4, 5, 4, 6)),
					new Line(5, ''),
					new CarriageReturn(new Range(5, 1, 5, 2)),
					new NewLine(new Range(5, 2, 5, 3)),
					new Line(6, ' '),
				],
			);
		});
	});
});
