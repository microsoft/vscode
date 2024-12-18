/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../baseToken.js';
import { MarkdownLink } from './tokens/markdownLink.js';
import { NewLine } from '../linesCodec/tokens/newLine.js';
import { FormFeed } from '../simpleCodec/tokens/formFeed.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { VerticalTab } from '../simpleCodec/tokens/verticalTab.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { CarriageReturn } from '../linesCodec/tokens/carriageReturn.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { SimpleDecoder, TSimpleToken } from '../simpleCodec/simpleDecoder.js';
import { LeftBracket, RightBracket } from '../simpleCodec/tokens/brackets.js';
import { LeftParenthesis, RightParenthesis } from '../simpleCodec/tokens/parentheses.js';

/**
 * Tokens handled by this decoder.
 */
export type TMarkdownToken = MarkdownLink | TSimpleToken;

interface IParseResult {
	result: 'success' | 'failure';
	wasTokenConsumed: boolean;
}

interface IParseSuccess<T> extends IParseResult {
	result: 'success';
	nextParser: T;
}

interface IParseFailure extends IParseResult {
	result: 'failure';
}

export type TParseResult<T> = IParseSuccess<T> | IParseFailure;

/**
 * An abstract parser class that is able to parse a sequence of
 * tokens into a new single entity.
 * TODO: @legomushroom - move out to a differnet file
 */
export abstract class ParserBase<TToken extends BaseToken, TNextObject> {
	constructor(
		/**
		 * Set of tokens that were accumulated so far.
		 */
		protected readonly currentTokens: TToken[] = [],
	) { }

	/**
	 * Get the tokens that were accumulated so far.
	 */
	public get tokens(): readonly TToken[] {
		return this.currentTokens;
	}

	/**
	 * Accept a new token returning parsing result:
	 *  - successful result must include the next parser object or a fully parsed out token
	 *  - failure result must indicate that the token was not consumed
	 *
	 * @param token The token to accept.
	 */
	public abstract accept(token: TToken): TParseResult<TNextObject>;
}

/**
 * Parser that is responsible for parsing a `markdown link caption`,
 * e.g., the `[caption text]` part of the `[caption text](./some-link)` markdown link.
 */
class PartialMarkdownLinkCaption extends ParserBase<TSimpleToken, PartialMarkdownLinkCaption | MarkdownLinkCaption> {
	constructor(token: LeftBracket) {
		super([token]);
	}

	public accept(token: TSimpleToken): TParseResult<PartialMarkdownLinkCaption | MarkdownLinkCaption> {
		// any of stop characters is are breaking a markdown link caption sequence
		if (token instanceof CarriageReturn || token instanceof NewLine || token instanceof VerticalTab || token instanceof FormFeed) { // TODO: @legomushroom - are the vertical tab/form feed correct here?
			return {
				result: 'failure',
				wasTokenConsumed: false,
			};
		}

		// the `]` character ends the caption of a markdown link
		if (token instanceof RightBracket) {
			return {
				result: 'success',
				nextParser: new MarkdownLinkCaption([...this.tokens, token]),
				wasTokenConsumed: true,
			};
		}

		// otherwise, include the token in the sequence
		// and keep the current parser object instance
		this.currentTokens.push(token);
		return {
			result: 'success',
			nextParser: this,
			wasTokenConsumed: true,
		};
	}
}

/**
 * Parser that is responsible for transitioning from a `markdown link caption` to
 * a partial `markdown link`, e.g., from the `[caption text]` to `[caption text](some-link`.
 */
class MarkdownLinkCaption extends ParserBase<TSimpleToken, MarkdownLinkCaption | PartialMarkdownLink> {
	public accept(token: TSimpleToken): TParseResult<MarkdownLinkCaption | PartialMarkdownLink> {
		// the `(` character starts the link part of a markdown link
		// that is the only character that can follow the caption
		if (token instanceof LeftParenthesis) {
			return {
				result: 'success',
				wasTokenConsumed: true,
				nextParser: new PartialMarkdownLink([...this.tokens], token),
			};
		}

		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}
}

/**
 * Parser that is responsible for finishing to parse a `markdown link`,
 * e.g., from the `[caption text](some-partial-link..` tothe complete `[caption text](some-partial-link-reference)`.
 */
class PartialMarkdownLink extends ParserBase<TSimpleToken, PartialMarkdownLink | MarkdownLink> {
	constructor(
		protected readonly captionTokens: TSimpleToken[],
		token: LeftParenthesis,
	) {
		super([token]);
	}

	public override get tokens(): readonly TSimpleToken[] {
		return [...this.captionTokens, ...this.currentTokens];
	}

	public accept(token: TSimpleToken): TParseResult<PartialMarkdownLink | MarkdownLink> {
		// the `)` character ends the reference part of a markdown link
		if (token instanceof RightParenthesis) {
			const { startLineNumber } = this.captionTokens[0].range;

			const caption = this.captionTokens
				.map((token) => { return token.text; })
				.join('');

			const reference = this.currentTokens
				.map((token) => { return token.text; }).join('');

			return {
				result: 'success',
				wasTokenConsumed: true,
				nextParser: new MarkdownLink(startLineNumber, caption, reference),
			};
		}

		// any of stop characters is are breaking a markdown link reference sequence
		if (token instanceof CarriageReturn || token instanceof NewLine || token instanceof VerticalTab || token instanceof FormFeed) { // TODO: @legomushroom - are the vertical tab/form feed correct here?
			return {
				result: 'failure',
				wasTokenConsumed: false,
			};
		}

		// the rest of the tokens can be included in the sequence
		this.currentTokens.push(token);
		return {
			result: 'success',
			nextParser: this,
			wasTokenConsumed: true,
		};
	}
}

/**
 * Decoder capable of parsing markdown entities (e.g., links) from a sequence of simple tokens.
 */
export class MarkdownDecoder extends BaseDecoder<TMarkdownToken, TSimpleToken> {
	/**
	 * TODO: @legomushroom
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

		// if current parser was not initiated before, - we are in the general
		// "text" mode, therefore re-emit the token immediatelly and continue
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
}
