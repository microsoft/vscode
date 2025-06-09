/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Word } from '../simpleCodec/tokens/tokens.js';
import { assert } from '../../../../../../../../base/common/assert.js';
import { VSBuffer } from '../../../../../../../../base/common/buffer.js';
import { VALID_INTER_RECORD_SPACING_TOKENS } from './constants.js';
import { ReadableStream } from '../../../../../../../../base/common/stream.js';
import { FrontMatterToken, FrontMatterRecord } from './tokens/index.js';
import { BaseDecoder } from '../baseDecoder.js';
import { SimpleDecoder, type TSimpleDecoderToken } from '../simpleCodec/simpleDecoder.js';
import { ObjectStream } from '../utils/objectStream.js';
import { PartialFrontMatterRecordNameWithDelimiter } from './parsers/frontMatterRecord/frontMatterRecordNameWithDelimiter.js';
import { PartialFrontMatterRecord } from './parsers/frontMatterRecord/frontMatterRecord.js';
import { PartialFrontMatterRecordName } from './parsers/frontMatterRecord/frontMatterRecordName.js';
import { FrontMatterParserFactory } from './parsers/frontMatterParserFactory.js';

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

	private readonly parserFactory: FrontMatterParserFactory;

	constructor(
		stream: ReadableStream<VSBuffer> | ObjectStream<TSimpleDecoderToken>,
	) {
		if (stream instanceof ObjectStream) {
			super(stream);
		} else {
			super(new SimpleDecoder(stream));
		}
		this.parserFactory = new FrontMatterParserFactory();
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
				// front matter record token is the spacial case - because it can
				// contain trailing space tokens, we want to emit "trimmed" record
				// token and the trailing spaces tokens separately
				const trimmedTokens = (nextParser instanceof FrontMatterRecord)
					? nextParser.trimValueEnd()
					: [];

				this._onData.fire(nextParser);

				// re-emit all trailing space tokens if present
				for (const trimmedToken of trimmedTokens) {
					this._onData.fire(trimmedToken);
				}

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
			this.current = this.parserFactory.createRecordName(token);
			return;
		}

		// re-emit all "space" tokens immediately as all of them
		// are valid while we are not in the "record parsing" mode
		for (const ValidToken of VALID_INTER_RECORD_SPACING_TOKENS) {
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

			assert(
				this.current instanceof PartialFrontMatterRecord,
				'Only partial front matter records can be processed on stream end.',
			);

			const record = this.current.asRecordToken();
			const trimmedTokens = record.trimValueEnd();

			this._onData.fire(record);

			for (const trimmedToken of trimmedTokens) {
				this._onData.fire(trimmedToken);
			}
		} catch (_error) {
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
