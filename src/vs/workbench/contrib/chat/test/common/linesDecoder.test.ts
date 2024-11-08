/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../../base/common/stream.js';
import { Line } from '../../../../common/codecs/linesCodec/tokens/line.js';
import { LinesDecoder } from '../../../../common/codecs/linesCodec/linesDecoder.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

// TODO: @legomushroom - refactor the tests?
suite('LinesDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('implements async iterator', async () => {
		const testLine = ' hello world\nhow are you?\n\n 😊 \n ';

		const expectedLines = [
			' hello world',
			'how are you?',
			'',
			' 😊 ',
			' ',
		];
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = testDisposables.add(new LinesDecoder(stream));

		// write the data to the stream after a short delay to ensure
		// that the the data is sent after the reading loop below
		setTimeout(() => {
			stream.write(VSBuffer.fromString(testLine));
			stream.end();
		}, 1);

		const receivedLines: Line[] = [];
		for await (const maybeLine of decoder) {
			if (maybeLine === null) {
				break;
			}

			receivedLines.push(maybeLine);
		}

		assert.strictEqual(
			receivedLines.length,
			expectedLines.length,
			'Must receive correct number of lines.',
		);

		for (let i = 0; i < expectedLines.length; i++) {
			const receivedLine = receivedLines[i];
			const expectedLine = new Line(i + 1, expectedLines[i]);

			assert(
				receivedLine.equals(expectedLine),
				`Line '${i}' must be '${expectedLine}', got '${receivedLine}'.`,
			);
		}

		stream.destroy();
	});

	test('produces expected lines', async () => {
		const testLine = ' hello world\nhow are you?\n\n \n ';

		const expectedLines = [
			' hello world',
			'how are you?',
			'',
			' ',
			' ',
		];
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = testDisposables.add(new LinesDecoder(stream));

		// write the data to the stream after a short delay to ensure
		// that the the data is sent after the reading loop below
		setTimeout(() => {
			stream.write(VSBuffer.fromString(testLine));
			stream.end();
		}, 1);

		// get all lines
		const receivedLines: Line[] = await decoder.consume();

		assert.strictEqual(
			receivedLines.length,
			expectedLines.length,
			'Must receive correct number of lines.',
		);

		for (let i = 0; i < expectedLines.length; i++) {
			const receivedLine = receivedLines[i];
			const expectedLine = new Line(i + 1, expectedLines[i]);

			assert(
				receivedLine.equals(expectedLine),
				`Line '${i}' must be '${expectedLine}', got '${receivedLine}'.`,
			);
		}

		stream.destroy();
	});
});
