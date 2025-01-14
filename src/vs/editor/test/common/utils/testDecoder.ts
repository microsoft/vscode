/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { randomInt } from '../../../../base/common/numbers.js';
import { BaseToken } from '../../../common/codecs/baseToken.js';
import { assertDefined } from '../../../../base/common/types.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { WriteableStream } from '../../../../base/common/stream.js';
import { randomBoolean } from '../../../../base/common/randomBoolean.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';

/**
 * A reusable test utility that asserts that the given decoder
 * produces the expected `expectedTokens` sequence of tokens.
 *
 * ## Examples
 *
 * ```typescript
 * const stream = newWriteableStream<VSBuffer>(null);
 * const decoder = testDisposables.add(new LinesDecoder(stream));
 *
 * // create a new test utility instance
 * const test = testDisposables.add(new TestDecoder(stream, decoder));
 *
 * // run the test
 * await test.run(
 *   ' hello world\n',
 *   [
 * 	   new Line(1, ' hello world'),
 * 	   new NewLine(new Range(1, 13, 1, 14)),
 *   ],
 * );
 */
export class TestDecoder<T extends BaseToken, D extends BaseDecoder<T>> extends Disposable {
	constructor(
		private readonly stream: WriteableStream<VSBuffer>,
		private readonly decoder: D,
	) {
		super();

		this._register(this.decoder);
	}

	/**
	 * Run the test sending the `inputData` data to the stream and asserting
	 * that the decoder produces the `expectedTokens` sequence of tokens.
	 */
	public async run(
		inputData: string | string[],
		expectedTokens: readonly T[],
	): Promise<void> {
		// if input data was passed as an array of lines,
		// join them into a single string with newlines
		if (Array.isArray(inputData)) {
			inputData = inputData.join('\n');
		}

		// write the data to the stream after a short delay to ensure
		// that the the data is sent after the reading loop below
		setTimeout(() => {
			let inputDataBytes = VSBuffer.fromString(inputData);

			// write the input data to the stream in multiple random-length chunks
			while (inputDataBytes.byteLength > 0) {
				const dataToSend = inputDataBytes.slice(0, randomInt(inputDataBytes.byteLength));
				this.stream.write(dataToSend);
				inputDataBytes = inputDataBytes.slice(dataToSend.byteLength);
			}

			this.stream.end();
		}, 25);

		// randomly use either the `async iterator` or the `.consume()`
		// variants of getting tokens, they both must yield equal results
		const receivedTokens: T[] = [];
		if (randomBoolean()) {
			// test the `async iterator` code path
			for await (const token of this.decoder) {
				if (token === null) {
					break;
				}

				receivedTokens.push(token);
			}
		} else {
			// test the `.consume()` code path
			receivedTokens.push(...(await this.decoder.consumeAll()));
		}

		for (let i = 0; i < expectedTokens.length; i++) {
			const expectedToken = expectedTokens[i];
			const receivedtoken = receivedTokens[i];

			assertDefined(
				receivedtoken,
				`Expected token '${i}' to be '${expectedToken}', got 'undefined'.`,
			);

			assert(
				receivedtoken.equals(expectedToken),
				`Expected token '${i}' to be '${expectedToken}', got '${receivedtoken}'.`,
			);
		}

		assert.strictEqual(
			receivedTokens.length,
			expectedTokens.length,
			'Must produce correct number of tokens.',
		);
	}
}
