/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { MarkdownExtensionsToken } from './tokens/markdownExtensionsToken.js';
import { SimpleDecoder, TSimpleDecoderToken } from '../simpleCodec/simpleDecoder.js';
import { PartialFrontMatterHeader, PartialFrontMatterStartMarker } from './parsers/frontMatterHeader.js';

/**
 * Tokens produced by this decoder.
 */
export type TMarkdownExtensionsToken = MarkdownExtensionsToken | TSimpleDecoderToken;

/**
 * Decoder responsible for decoding extensions of markdown syntax,
 * e.g., a `Front Matter` header, etc.
 */
export class MarkdownExtensionsDecoder extends BaseDecoder<TMarkdownExtensionsToken, TSimpleDecoderToken> {
	/**
	 * Current parser object that is responsible for parsing a sequence of tokens into
	 * some markdown entity. Set to `undefined` when no parsing is in progress at the moment.
	 */
	private current?: PartialFrontMatterStartMarker | PartialFrontMatterHeader;

	constructor(
		stream: ReadableStream<VSBuffer>,
	) {
		super(new SimpleDecoder(stream));
	}

	protected override onStreamData(token: TSimpleDecoderToken): void {
		// front matter headers start with a `-` at the first column of the first line
		if ((this.current === undefined) && PartialFrontMatterStartMarker.mayStartHeader(token)) {
			this.current = new PartialFrontMatterStartMarker(token);

			return;
		}

		// if current parser is not initiated, - we are not inside a sequence of tokens
		// we care about, therefore re-emit the token immediately and continue
		if (this.current === undefined) {
			this._onData.fire(token);
			return;
		}

		// if there is a current parser object, submit the token to it
		// so it can progress with parsing the tokens sequence
		const parseResult = this.current.accept(token);
		if (parseResult.result === 'success') {
			const { nextParser } = parseResult;

			// if got a fully parsed out token back, emit it and reset
			// the current parser object so a new parsing process can start
			if (nextParser instanceof MarkdownExtensionsToken) {
				this._onData.fire(nextParser);
				delete this.current;
			} else {
				// otherwise, update the current parser object
				this.current = nextParser;
			}
		} else {
			// if failed to parse a sequence of a tokens as a single markdown
			// entity (e.g., a link), re-emit the tokens accumulated so far
			// then reset the currently initialized parser object
			this.reEmitCurrentTokens();
		}

		// if token was not consumed by the parser, call `onStreamData` again
		// so the token is properly handled by the decoder in the case when a
		// new sequence starts with this token
		if (!parseResult.wasTokenConsumed) {
			this.onStreamData(token);
		}
	}

	protected override onStreamEnd(): void {
		try {
			if (this.current === undefined) {
				return;
			}

			// if current parser can be converted into a valid Front Matter
			// header, then emit it and reset the current parser object
			if (this.current instanceof PartialFrontMatterHeader) {
				this._onData.fire(
					this.current.asFrontMatterHeader(),
				);
				delete this.current;
				return;
			}

		} catch (_error) {
			// if failed to convert current parser object to a token,
			// re-emit the tokens accumulated so far
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
