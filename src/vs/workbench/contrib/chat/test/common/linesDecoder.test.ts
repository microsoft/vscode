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

suite('LinesDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('simple test', async () => {
		const expectedLines = [
			'hello',
			'world',
		];
		const stream = newWriteableStream<VSBuffer>(null);
		await stream.write(VSBuffer.fromString(expectedLines.join('\n')));
		stream.end();

		const decoder = testDisposables.add(new LinesDecoder(stream));

		const receivedLines: Line[] = [];
		while (true) {
			const maybeLine = await decoder.next();
			if (maybeLine === null) {
				break;
			}

			receivedLines.push(maybeLine);
		}

		assert.strictEqual(
			receivedLines.length,
			expectedLines.length,
			'Must receive the correct number of lines.',
		);

		for (let i = 0; i < expectedLines.length; i++) {
			assert.strictEqual(
				receivedLines[i].text,
				expectedLines[i],
				`Line ${i} must be correct`,
			);
		}
	});
});
