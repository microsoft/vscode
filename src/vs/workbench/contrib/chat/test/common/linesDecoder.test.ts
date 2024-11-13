/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { newWriteableStream } from '../../../../../base/common/stream.js';
import { Line } from '../../../../common/codecs/linesCodec/tokens/line.js';
import { NewLine } from '../../../../common/codecs/linesCodec/tokens/newLine.js';
import { LinesDecoder } from '../../../../common/codecs/linesCodec/linesDecoder.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

/**
 * (pseudo)Random boolean generator.
 *
 * ## Examples
 *
 * ```typsecript
 * randomBoolean(); // generates either `true` or `false`
 * ```
 */
// TODO: @legomushroom - move out to a separate file
const randomBoolean = (): boolean => {
	return Math.random() > 0.5;
};

suite('LinesDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * A reusable test helper that asserts that the given `input`
	 * produces the expected `expectedTokens` when decoded.
	 */
	const tokensTest = async (
		input: string,
		expectedTokens: readonly (Line | NewLine)[],
	) => {
		const stream = newWriteableStream<VSBuffer>(null);
		try {
			const decoder = testDisposables.add(new LinesDecoder(stream));

			// write the data to the stream after a short delay to ensure
			// that the the data is sent after the reading loop below
			setTimeout(() => {
				stream.write(VSBuffer.fromString(input));
				stream.end();
			}, 1);

			// randomly use either the `async iterator` or the `.consume()`
			// variants of getting tokens, they both must yield equal results
			const receivedTokens: Line | NewLine[] = [];
			if (randomBoolean()) {
				// test the `async iterator` code path
				for await (const maybeLine of decoder) {
					if (maybeLine === null) {
						break;
					}

					receivedTokens.push(maybeLine);
				}
			} else {
				// test the `.consume()` code path
				receivedTokens.push(...(await decoder.consume()));
			}

			for (let i = 0; i < expectedTokens.length; i++) {
				const expectedToken = expectedTokens[i];
				const receivedtoken = receivedTokens[i];

				if (expectedToken instanceof Line) {
					assert(
						receivedtoken instanceof Line,
						`Token '${i}' must be a 'Line', got '${receivedtoken}'.`,
					);

					assert(
						receivedtoken.equals(expectedToken),
						`Expected token '${i}' to be '${expectedToken}', got '${receivedtoken}'.`,
					);

					continue;
				}

				if (expectedToken instanceof NewLine) {
					assert(
						receivedtoken instanceof NewLine,
						`Token '${i}' must be a 'NewLine', got '${receivedtoken}'.`,
					);

					assert(
						receivedtoken.equals(expectedToken),
						`Expected token '${i}' be '${expectedToken}', got '${receivedtoken}'.`,
					);

					continue;
				}

				throw new Error(`Unexpected token type for '${expectedToken}'.`);
			}

			assert.strictEqual(
				receivedTokens.length,
				expectedTokens.length,
				'Must produce correct number of tokens.',
			);
		} catch (error) {
			throw error;
		} finally {
			stream.destroy();
		}
	};

	suite('produces expected tokens', () => {
		test('input starts with line data', async () => {
			await tokensTest(
				' hello world\nhow are you doing?\n\n 😊 \n ',
				[
					new Line(1, ' hello world'),
					new NewLine(new Range(1, 13, 1, 14)),
					new Line(2, 'how are you doing?'),
					new NewLine(new Range(2, 19, 2, 20)),
					new Line(3, ''),
					new NewLine(new Range(3, 1, 3, 2)),
					new Line(4, ' 😊 '),
					// TODO: @legomushroom - is this correct? the previous line is `3` or `4` characters long? also check the other emoji cases
					new NewLine(new Range(4, 5, 4, 6)),
					new Line(5, ' '),
				]
			);
		});

		test('input starts with a new line', async () => {
			await tokensTest(
				'\nsome text on this line\n\n\nanother 💬 on this line\n🤫\n',
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
					new NewLine(new Range(5, 24, 5, 25)),
					new Line(6, '🤫'),
					new NewLine(new Range(6, 3, 6, 4)),
				]
			);
		});

		test('input starts and ends with multiple new lines', async () => {
			await tokensTest(
				'\n\n\nciao! 🗯️\t💭 💥 come\tva?\n\n\n\n\n',
				[
					new Line(1, ''),
					new NewLine(new Range(1, 1, 1, 2)),
					new Line(2, ''),
					new NewLine(new Range(2, 1, 2, 2)),
					new Line(3, ''),
					new NewLine(new Range(3, 1, 3, 2)),
					new Line(4, 'ciao! 🗯️\t💭 💥 come\tva?'),
					new NewLine(new Range(4, 24, 4, 25)),
					new Line(5, ''),
					new NewLine(new Range(5, 1, 5, 2)),
					new Line(6, ''),
					new NewLine(new Range(6, 1, 6, 2)),
					new Line(7, ''),
					new NewLine(new Range(7, 1, 7, 2)),
					new Line(8, ''),
					new NewLine(new Range(8, 1, 8, 2)),
				]
			);
		});
	});
});
