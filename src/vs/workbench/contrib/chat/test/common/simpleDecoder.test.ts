/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { newWriteableStream } from '../../../../../base/common/stream.js';
import { LinesDecoder } from '../../../../common/codecs/linesCodec/linesDecoder.js';
import { SimpleDecoder } from '../../../../common/codecs/simpleCodec/simpleDecoder.js';
import { Word, Space, Tab, NewLine } from '../../../../common/codecs/simpleCodec/tokens/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';


suite('SimpleDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens', async () => {
		const testLine = ' hello world\nhow are you?\n\n   (test)  [!@#$%^&*_+=]  \n\t\t🤗❤ \t\n ';

		// expected tokens for each of the sublines separated by the `\n` character
		const expectedTokens = [
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
			new Space(new Range(2, 8, 2, 9)),
			new Word(new Range(2, 9, 2, 13), 'you?'),
			new NewLine(new Range(2, 13, 2, 14)),
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
		];

		// create the decoder from a binary stream
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = testDisposables.add(
			new SimpleDecoder(
				new LinesDecoder(stream),
			),
		);

		// write the data to the stream after a short delay to ensure
		// that the the data is sent after the reading loop below
		setTimeout(() => {
			stream.write(VSBuffer.fromString(testLine));
			stream.end();
		}, 1);

		// get all tokens in one go
		const tokens = await decoder.consume();

		// validate the tokens that we received
		for (let i = 0; i < expectedTokens.length; i++) {
			const expectedToken = expectedTokens[i];
			const receivedToken = tokens[i];

			if (expectedToken instanceof Word) {
				assert(
					receivedToken instanceof Word,
					`Token '${i}' must be a Word, got '${receivedToken}'.`,
				);

				assert(
					receivedToken.equals(expectedToken),
					`Token '${i}' (Word) must be ${expectedToken}, got ${receivedToken}.`,
				);

				continue;
			}

			if (expectedToken instanceof Space) {
				assert(
					receivedToken instanceof Space,
					`Token '${i}' must be a Space, got '${receivedToken}'.`,
				);

				assert(
					receivedToken.sameRange(expectedToken.range),
					`Token '${i}' (Space) must have the ${expectedToken.range} range, got ${receivedToken.range}.`,
				);

				continue;
			}

			if (expectedToken instanceof Tab) {
				assert(
					receivedToken instanceof Tab,
					`Token '${i}' must be a Tab, got '${receivedToken}'.`,
				);

				assert(
					receivedToken.sameRange(expectedToken.range),
					`Token '${i}' (Tab) must have the ${expectedToken.range} range, got ${receivedToken.range}.`,
				);

				continue;
			}

			if (expectedToken instanceof NewLine) {
				assert(
					receivedToken instanceof NewLine,
					`Token '${i}' must be a NewLine, got '${receivedToken}'.`,
				);

				assert(
					receivedToken.sameRange(expectedToken.range),
					`Token '${i}' (NewLine) must have the ${expectedToken.range} range, got ${receivedToken.range}.`,
				);

				continue;
			}
		}

		stream.destroy();
	});
});
