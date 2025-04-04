/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownLink } from '../tokens/markdownLink.js';
import { NewLine } from '../../linesCodec/tokens/newLine.js';
import { assert } from '../../../../../base/common/assert.js';
import { FormFeed } from '../../simpleCodec/tokens/formFeed.js';
import { TSimpleToken } from '../../simpleCodec/simpleDecoder.js';
import { VerticalTab } from '../../simpleCodec/tokens/verticalTab.js';
import { CarriageReturn } from '../../linesCodec/tokens/carriageReturn.js';
import { LeftBracket, RightBracket } from '../../simpleCodec/tokens/brackets.js';
import { ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';
import { LeftParenthesis, RightParenthesis } from '../../simpleCodec/tokens/parentheses.js';

/**
 * List of characters that are not allowed in links so stop a markdown link sequence abruptly.
 */
const MARKDOWN_LINK_STOP_CHARACTERS: readonly string[] = [CarriageReturn, NewLine, VerticalTab, FormFeed]
	.map((token) => { return token.symbol; });

/**
 * The parser responsible for parsing a `markdown link caption` part of a markdown
 * link (e.g., the `[caption text]` part of the `[caption text](./some/path)` link).
 *
 * The parsing process starts with single `[` token and collects all tokens until
 * the first `]` token is encountered. In this successful case, the parser transitions
 * into the {@linkcode MarkdownLinkCaption} parser type which continues the general
 * parsing process of the markdown link.
 *
 * Otherwise, if one of the stop characters defined in the {@linkcode MARKDOWN_LINK_STOP_CHARACTERS}
 * is encountered before the `]` token, the parsing process is aborted which is communicated to
 * the caller by returning a `failure` result. In this case, the caller is assumed to be responsible
 * for re-emitting the {@link tokens} accumulated so far as standalone entities since they are no
 * longer represent a coherent token entity of a larger size.
 */
export class PartialMarkdownLinkCaption extends ParserBase<TSimpleToken, PartialMarkdownLinkCaption | MarkdownLinkCaption> {
	constructor(token: LeftBracket) {
		super([token]);
	}

	public accept(token: TSimpleToken): TAcceptTokenResult<PartialMarkdownLinkCaption | MarkdownLinkCaption> {
		// any of stop characters is are breaking a markdown link caption sequence
		if (MARKDOWN_LINK_STOP_CHARACTERS.includes(token.text)) {
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
 * The parser responsible for transitioning from a {@linkcode PartialMarkdownLinkCaption}
 * parser to the {@link PartialMarkdownLink} one, therefore serves a parser glue between
 * the `[caption]` and the `(./some/path)` parts of the `[caption](./some/path)` link.
 *
 * The only successful case of this parser is the `(` token that initiated the process
 * of parsing the `reference` part of a markdown link and in this case the parser
 * transitions into the `PartialMarkdownLink` parser type.
 *
 * Any other character is considered a failure result. In this case, the caller is assumed
 * to be responsible for re-emitting the {@link tokens} accumulated so far as standalone
 * entities since they are no longer represent a coherent token entity of a larger size.
 */
export class MarkdownLinkCaption extends ParserBase<TSimpleToken, MarkdownLinkCaption | PartialMarkdownLink> {
	public accept(token: TSimpleToken): TAcceptTokenResult<MarkdownLinkCaption | PartialMarkdownLink> {
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
 * The parser responsible for parsing a `link reference` part of a markdown link
 * (e.g., the `(./some/path)` part of the `[caption text](./some/path)` link).
 *
 * The parsing process starts with tokens that represent the `[caption]` part of a markdown
 * link, followed by the `(` token. The parser collects all subsequent tokens until final closing
 * parenthesis (`)`) is encountered (*\*see [1] below*). In this successful case, the parser object
 * transitions into the {@linkcode MarkdownLink} token type which signifies the end of the entire
 * parsing process of the link text.
 *
 * Otherwise, if one of the stop characters defined in the {@linkcode MARKDOWN_LINK_STOP_CHARACTERS}
 * is encountered before the final `)` token, the parsing process is aborted which is communicated to
 * the caller by returning a `failure` result. In this case, the caller is assumed to be responsible
 * for re-emitting the {@link tokens} accumulated so far as standalone entities since they are no
 * longer represent a coherent token entity of a larger size.
 *
 * `[1]` The `reference` part of the markdown link can contain any number of nested parenthesis, e.g.,
 * 	  `[caption](/some/p(th/file.md)` is a valid markdown link and a valid folder name, hence number
 *     of open parenthesis must match the number of closing ones and the path sequence is considered
 *     to be complete as soon as this requirement is met. Therefore the `final` word is used in
 *     the description comments above to highlight this important detail.
 */
export class PartialMarkdownLink extends ParserBase<TSimpleToken, PartialMarkdownLink | MarkdownLink> {
	/**
	 * Number of open parenthesis in the sequence.
	 * See comment in the {@linkcode accept} method for more details.
	 */
	private openParensCount: number = 1;

	constructor(
		protected readonly captionTokens: TSimpleToken[],
		token: LeftParenthesis,
	) {
		super([token]);
	}

	public override get tokens(): readonly TSimpleToken[] {
		return [...this.captionTokens, ...this.currentTokens];
	}

	public accept(token: TSimpleToken): TAcceptTokenResult<PartialMarkdownLink | MarkdownLink> {
		// markdown links allow for nested parenthesis inside the link reference part, but
		// the number of open parenthesis must match the number of closing parenthesis, e.g.:
		// 	- `[caption](/some/p()th/file.md)` is a valid markdown link
		// 	- `[caption](/some/p(th/file.md)` is an invalid markdown link
		// hence we use the `openParensCount` variable to keep track of the number of open
		// parenthesis encountered so far; then upon encountering a closing parenthesis we
		// decrement the `openParensCount` and if it reaches 0 - we consider the link reference
		// to be complete

		if (token instanceof LeftParenthesis) {
			this.openParensCount += 1;
		}

		if (token instanceof RightParenthesis) {
			this.openParensCount -= 1;

			// sanity check! this must alway hold true because we return a complete markdown
			// link as soon as we encounter matching number of closing parenthesis, hence
			// we must never have `openParensCount` that is less than 0
			assert(
				this.openParensCount >= 0,
				`Unexpected right parenthesis token encountered: '${token}'.`,
			);

			// the markdown link is complete as soon as we get the same number of closing parenthesis
			if (this.openParensCount === 0) {
				const { startLineNumber, startColumn } = this.captionTokens[0].range;

				// create link caption string
				const caption = this.captionTokens
					.map((token) => { return token.text; })
					.join('');

				// create link reference string
				this.currentTokens.push(token);
				const reference = this.currentTokens
					.map((token) => { return token.text; }).join('');

				// return complete markdown link object
				return {
					result: 'success',
					wasTokenConsumed: true,
					nextParser: new MarkdownLink(
						startLineNumber,
						startColumn,
						caption,
						reference,
					),
				};
			}
		}

		// any of stop characters is are breaking a markdown link reference sequence
		if (MARKDOWN_LINK_STOP_CHARACTERS.includes(token.text)) {
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
