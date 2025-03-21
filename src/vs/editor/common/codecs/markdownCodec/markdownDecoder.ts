/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownToken } from './tokens/markdownToken.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { LeftBracket } from '../simpleCodec/tokens/brackets.js';
import { PartialMarkdownImage } from './parsers/markdownImage.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { LeftAngleBracket } from '../simpleCodec/tokens/angleBrackets.js';
import { ExclamationMark } from '../simpleCodec/tokens/exclamationMark.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { SimpleDecoder, TSimpleToken } from '../simpleCodec/simpleDecoder.js';
import { MarkdownCommentStart, PartialMarkdownCommentStart } from './parsers/markdownComment.js';
import { MarkdownLinkCaption, PartialMarkdownLink, PartialMarkdownLinkCaption } from './parsers/markdownLink.js';

/**
 * Tokens handled by this decoder.
 */
export type TMarkdownToken = MarkdownToken | TSimpleToken;

/**
 * Decoder capable of parsing markdown entities (e.g., links) from a sequence of simple tokens.
 */
export class MarkdownDecoder extends BaseDecoder<TMarkdownToken, TSimpleToken> {
	/**
	 * Current parser object that is responsible for parsing a sequence of tokens into
	 * some markdown entity. Set to `undefined` when no parsing is in progress at the moment.
	 */
	private current?:
		PartialMarkdownLinkCaption | MarkdownLinkCaption | PartialMarkdownLink |
		PartialMarkdownCommentStart | MarkdownCommentStart |
		PartialMarkdownImage;

	constructor(
		stream: ReadableStream<VSBuffer>,
	) {
		super(new SimpleDecoder(stream));
	}

	protected override onStreamData(token: TSimpleToken): void {
		// `markdown links` start with `[` character, so here we can
		// initiate the process of parsing a markdown link
		if (token instanceof LeftBracket && !this.current) {
			this.current = new PartialMarkdownLinkCaption(token);

			return;
		}

		// `markdown comments` start with `<` character, so here we can
		// initiate the process of parsing a markdown comment
		if (token instanceof LeftAngleBracket && !this.current) {
			this.current = new PartialMarkdownCommentStart(token);

			return;
		}

		// `markdown image links` start with `!` character, so here we can
		// initiate the process of parsing a markdown image
		if (token instanceof ExclamationMark && !this.current) {
			this.current = new PartialMarkdownImage(token);

			return;
		}

		// if current parser was not initiated before, - we are not inside a sequence
		// of tokens we care about, therefore re-emit the token immediately and continue
		if (!this.current) {
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
			if (nextParser instanceof MarkdownToken) {
				this._onData.fire(nextParser);
				delete this.current;
			} else {
				// otherwise, update the current parser object
				this.current = nextParser;
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
		// object present, handle the remaining parser object
		if (this.current) {
			// if a `markdown comment` does not have an end marker `-->`
			// it is still a comment that extends to the end of the file
			// so re-emit the current parser as a comment token
			if (this.current instanceof MarkdownCommentStart) {
				this._onData.fire(this.current.asMarkdownComment());
				delete this.current;
				return this.onStreamEnd();
			}

			// in all other cases, re-emit existing parser tokens
			const { tokens } = this.current;
			delete this.current;

			for (const token of [...tokens]) {
				this._onData.fire(token);
			}
		}

		super.onStreamEnd();
	}
}
