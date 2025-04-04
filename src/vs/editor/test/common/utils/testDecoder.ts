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
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';

/**
 * Kind of decoder tokens consume methods are different ways
 * consume tokens that a decoder produces out of a byte stream.
 */
export type TTokensConsumeMethod = 'async-generator' | 'consume-all-method' | 'on-data-event';

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
		public readonly decoder: D,
	) {
		super();

		this._register(this.decoder);
	}

	/**
	 * Write provided {@linkcode inputData} data to the input byte stream
	 * asynchronously in the background in small random-length chunks.
	 *
	 * @param inputData Input data to send.
	 */
	public sendData(
		inputData: string | string[],
	): this {
		// if input data was passed as an array of lines,
		// join them into a single string with newlines
		if (Array.isArray(inputData)) {
			inputData = inputData.join('\n');
		}

		// write the input data to the stream in multiple random-length
		// chunks to simulate real input stream data flows
		let inputDataBytes = VSBuffer.fromString(inputData);
		const interval = setInterval(() => {
			if (inputDataBytes.byteLength <= 0) {
				clearInterval(interval);
				this.stream.end();

				return;
			}

			const dataToSend = inputDataBytes.slice(0, randomInt(inputDataBytes.byteLength));
			this.stream.write(dataToSend);
			inputDataBytes = inputDataBytes.slice(dataToSend.byteLength);
		}, randomInt(5));

		return this;
	}

	/**
	 * Run the test sending the `inputData` data to the stream and asserting
	 * that the decoder produces the `expectedTokens` sequence of tokens.
	 *
	 * @param inputData Input data of the input byte stream.
	 * @param expectedTokens List of expected tokens the test token must produce.
	 * @param tokensConsumeMethod *Optional* method of consuming the decoder stream.
	 *       					  Defaults to a random method (see {@linkcode randomTokensConsumeMethod}).
	 */
	public async run(
		inputData: string | string[],
		expectedTokens: readonly T[],
		tokensConsumeMethod: TTokensConsumeMethod = this.randomTokensConsumeMethod(),
	): Promise<void> {
		try {
			// initiate the data sending flow
			this.sendData(inputData);

			// consume the decoder tokens based on specified
			// (or randomly generated) tokens consume method
			const receivedTokens: T[] = [];
			switch (tokensConsumeMethod) {
				// test the `async iterator` code path
				case 'async-generator': {
					for await (const token of this.decoder) {
						if (token === null) {
							break;
						}

						receivedTokens.push(token);
					}

					break;
				}
				// test the `.consumeAll()` method code path
				case 'consume-all-method': {
					receivedTokens.push(...(await this.decoder.consumeAll()));
					break;
				}
				// test the `.onData()` event consume flow
				case 'on-data-event': {
					this.decoder.onData((token) => {
						receivedTokens.push(token);
					});

					this.decoder.start();

					// in this case we also test the `settled` promise of the decoder
					await this.decoder.settled;

					break;
				}
				// ensure that the switch block is exhaustive
				default: {
					throw new Error(`Unknown consume method '${tokensConsumeMethod}'.`);
				}
			}

			// validate the received tokens
			this.validateReceivedTokens(
				receivedTokens,
				expectedTokens,
			);
		} catch (error) {
			assertDefined(
				error,
				`An non-nullable error must be thrown.`,
			);
			assert(
				error instanceof Error,
				`An error error instance must be thrown.`,
			);

			// add the tokens consume method to the error message so we
			// would know which method of consuming the tokens failed exactly
			error.message = `[${tokensConsumeMethod}] ${error.message}`;

			throw error;
		}
	}

	/**
	 * Randomly generate a tokens consume method type for the test.
	 */
	private randomTokensConsumeMethod(): TTokensConsumeMethod {
		const testConsumeMethodIndex = randomInt(2);

		switch (testConsumeMethodIndex) {
			// test the `async iterator` code path
			case 0: {
				return 'async-generator';
			}
			// test the `.consumeAll()` method code path
			case 1: {
				return 'consume-all-method';
			}
			// test the `.onData()` event consume flow
			case 2: {
				return 'on-data-event';
			}
			// ensure that the switch block is exhaustive
			default: {
				throw new Error(`Unknown consume method index '${testConsumeMethodIndex}'.`);
			}
		}
	}

	/**
	 * Validate that received tokens list is equal to the expected one.
	 */
	private validateReceivedTokens(
		receivedTokens: readonly T[],
		expectedTokens: readonly T[],
	) {
		for (let i = 0; i < expectedTokens.length; i++) {
			const expectedToken = expectedTokens[i];
			const receivedToken = receivedTokens[i];

			assertDefined(
				receivedToken,
				`Expected token '${i}' to be '${expectedToken}', got 'undefined'.`,
			);

			assert(
				receivedToken.equals(expectedToken),
				`Expected token '${i}' to be '${expectedToken}', got '${receivedToken}'.`,
			);
		}

		if (receivedTokens.length === expectedTokens.length) {
			return;
		}

		// sanity check - if received/expected list lengths are not equal, the received
		// list must be longer than the expected one, because the other way around case
		// must have been caught by the comparison loop above
		assert(
			receivedTokens.length > expectedTokens.length,
			'Must have received more tokens than expected.',
		);

		const index = expectedTokens.length;
		throw new Error(
			[
				`Expected no '${index}' token present, got '${receivedTokens[index]}'.`,
				`(received ${receivedTokens.length} tokens in total)`,
			].join(' '),
		);
	}
}
