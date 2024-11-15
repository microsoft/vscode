/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { RangedToken } from '../../../../../common/codecs/rangedToken.js';
import { BaseDecoder } from '../../../../../common/codecs/baseDecoder.js';
import { Line, NewLine } from '../../../../../common/codecs/linesCodec/tokens/index.js';
import { Space, Tab, Word } from '../../../../../common/codecs/simpleCodec/tokens/index.js';
import { FileReference } from '../../../../../common/codecs/chatbotPromptCodec/tokens/fileReference.js';

/**
 * (pseudo)Random boolean generator.
 *
 * ## Examples
 *
 * ```typsecript
 * randomBoolean(); // generates either `true` or `false`
 * ```
 */
const randomBoolean = (): boolean => {
	return Math.random() > 0.5;
};

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
 * const test = testDisposables.add(
 * new TestDecoder(
 *   decoder,
 *   () => {
 * 	   stream.write(VSBuffer.fromString(' hello world\n'));
 *     stream.end();
 *   },
 * 	 [
 * 	   new Line(1, ' hello world'),
 * 	   new NewLine(new Range(1, 13, 1, 14)),
 *   ]),
 * );
 *
 * // run the test
 * await test.run();
 */
export class TestDecoder<T extends RangedToken, D extends BaseDecoder<T>> extends Disposable {
	constructor(
		private readonly decoder: D,
		private readonly writeInputData: () => void,
		private readonly expectedTokens: readonly T[],
	) {
		super();

		this._register(this.decoder);
	}

	public async run() {
		// write the data to the stream after a short delay to ensure
		// that the the data is sent after the reading loop below
		setTimeout(() => {
			this.writeInputData();
		}, 1);

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
			receivedTokens.push(...(await this.decoder.consume()));
		}

		for (let i = 0; i < this.expectedTokens.length; i++) {
			const expectedToken = this.expectedTokens[i];
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

			if (expectedToken instanceof Space) {
				assert(
					receivedtoken instanceof Space,
					`Token '${i}' must be a 'Space', got '${receivedtoken}'.`,
				);

				assert(
					receivedtoken.equals(expectedToken),
					`Expected token '${i}' be '${expectedToken}', got '${receivedtoken}'.`,
				);

				continue;
			}

			if (expectedToken instanceof Word) {
				assert(
					receivedtoken instanceof Word,
					`Token '${i}' must be a 'Word', got '${receivedtoken}'.`,
				);

				assert(
					receivedtoken.equals(expectedToken),
					`Expected token '${i}' be '${expectedToken}', got '${receivedtoken}'.`,
				);

				continue;
			}

			if (expectedToken instanceof Tab) {
				assert(
					receivedtoken instanceof Tab,
					`Token '${i}' must be a 'Tab ', got '${receivedtoken}'.`,
				);

				assert(
					receivedtoken.equals(expectedToken),
					`Expected token '${i}' be '${expectedToken}', got '${receivedtoken}'.`,
				);

				continue;
			}

			if (expectedToken instanceof FileReference) {
				assert(
					receivedtoken instanceof FileReference,
					`Token '${i}' must be a 'FileReference ', got '${receivedtoken}'.`,
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
			this.expectedTokens.length,
			'Must produce correct number of tokens.',
		);
	}
}
