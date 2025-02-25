/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownLink } from './tokens/markdownLink.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { LeftBracket } from '../simpleCodec/tokens/brackets.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { SimpleDecoder, TSimpleToken } from '../simpleCodec/simpleDecoder.js';
import { MarkdownLinkCaption, PartialMarkdownLink, PartialMarkdownLinkCaption } from './parsers/markdownLink.js';

/**
 * Tokens handled by this decoder.
 */
export type TMarkdownToken = MarkdownLink | TSimpleToken;

/**
 * Decoder capable of parsing markdown entities (e.g., links) from a sequence of simple tokens.
 */
export class MarkdownDecoder extends BaseDecoder<TMarkdownToken, TSimpleToken> {
	/**
	 * Current parser object that is responsible for parsing a sequence of tokens
	 * into some markdown entity.
	 */
	private current?: PartialMarkdownLinkCaption | MarkdownLinkCaption | PartialMarkdownLink;

	constructor(
		stream: ReadableStream<VSBuffer>,
	) {
		super(new SimpleDecoder(stream));
	}

	protected override onStreamData(token: TSimpleToken): void {
		// markdown links start with `[` character, so here we can
		// initiate the process of parsing a markdown link
		if (token instanceof LeftBracket && !this.current) {
			this.current = new PartialMarkdownLinkCaption(token);

			return;
		}

		// if current parser was not initiated before, - we are not inside a
		// sequence of tokens we care about, therefore re-emit the token
		// immediately and continue to the next one
		if (!this.current) {
			this._onData.fire(token);
			return;
		}

		// if there is a current parser object, submit the token to it
		// so it can progress with parsing the tokens sequence
		const parseResult = this.current.accept(token);
		if (parseResult.result === 'success') {
			// if got a parsed out `MarkdownLink` back, emit it
			// then reset the current parser object
			if (parseResult.nextParser instanceof MarkdownLink) {
				this._onData.fire(parseResult.nextParser);
				delete this.current;
			} else {
				// otherwise, update the current parser object
				this.current = parseResult.nextParser;
			}
		} else {
			// if failed to parse a sequence of a tokens as a single markdown
			// entity (e.g., a link), re-emit the tokens accumulated so far
			// then reset the current parser object
			for (const token of this.current.tokens) {
				this._onData.fire(token);
				delete this.current;
			}
		}

		// if token was not consumed by the parser, call `onStreamData` again
		// so the token is properly handled by the decoder in the case when a
		// new sequence starts with this token
		if (!parseResult.wasTokenConsumed) {
			this.onStreamData(token);
		}
	}

	protected override onStreamEnd(): void {
		// if the stream has ended and there is a current incomplete parser
		// object present, then re-emit its tokens as standalone entities
		if (this.current) {
			const { tokens } = this.current;
			delete this.current;

			for (const token of [...tokens]) {
				this._onData.fire(token);
			}
		}

		super.onStreamEnd();
	}
}
