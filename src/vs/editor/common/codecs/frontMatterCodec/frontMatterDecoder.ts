/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VALID_SPACE_TOKENS } from './constants.js';
import { Word } from '../simpleCodec/tokens/index.js';
import { TokenStream } from '../utils/tokenStream.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { FrontMatterToken, FrontMatterRecord } from './tokens/index.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { SimpleDecoder, type TSimpleDecoderToken } from '../simpleCodec/simpleDecoder.js';
import { PartialFrontMatterRecord, PartialFrontMatterRecordName, PartialFrontMatterRecordNameWithDelimiter } from './parsers/frontMatterRecord.js';

/**
 * Tokens produced by this decoder.
 */
export type TFrontMatterToken = FrontMatterRecord | TSimpleDecoderToken;

/**
 * Decoder capable of parsing Front Matter contents from a sequence of simple tokens.
 */
export class FrontMatterDecoder extends BaseDecoder<TFrontMatterToken, TSimpleDecoderToken> {
	/**
	 * Current parser reference responsible for parsing a specific sequence
	 * of tokens into a standalone token.
	 */
	private current?: PartialFrontMatterRecordName | PartialFrontMatterRecordNameWithDelimiter | PartialFrontMatterRecord;

	constructor(
		stream: ReadableStream<VSBuffer> | TokenStream<TSimpleDecoderToken>,
	) {
		if (stream instanceof TokenStream) {
			super(stream);

			return;
		}

		super(new SimpleDecoder(stream));
	}

	protected override onStreamData(token: TSimpleDecoderToken): void {
		if (this.current !== undefined) {
			const acceptResult = this.current.accept(token);
			const { result, wasTokenConsumed } = acceptResult;

			if (result === 'failure') {
				this.reEmitCurrentTokens();

				if (wasTokenConsumed === false) {
					this._onData.fire(token);
				}

				delete this.current;
				return;
			}

			const { nextParser } = acceptResult;

			if (nextParser instanceof FrontMatterToken) {
				this._onData.fire(nextParser);

				if (wasTokenConsumed === false) {
					this._onData.fire(token);
				}

				delete this.current;
				return;
			}

			this.current = nextParser;
			if (wasTokenConsumed === false) {
				this._onData.fire(token);
			}

			return;
		}

		// a word token starts a new record
		if (token instanceof Word) {
			this.current = new PartialFrontMatterRecordName(token);
			return;
		}

		// re-emit all "space" tokens immediately as all of them
		// are valid while we are not in the "record parsing" mode
		for (const ValidToken of VALID_SPACE_TOKENS) {
			if (token instanceof ValidToken) {
				this._onData.fire(token);
				return;
			}
		}

		// unexpected token type, re-emit existing tokens and continue
		this.reEmitCurrentTokens();
	}

	protected override onStreamEnd(): void {
		try {
			if (this.current === undefined) {
				return;
			}

			this.reEmitCurrentTokens();
		} finally {
			delete this.current;
			super.onStreamEnd();
		}
	}

	/**
	 * Re-emit tokens accumulated so far in the current parser object.
	 */
	protected reEmitCurrentTokens(): void {
		if (this.current === undefined) {
			return;
		}

		for (const token of this.current.tokens) {
			this._onData.fire(token);
		}
		delete this.current;
	}
}
