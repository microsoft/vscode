/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownLink, MarkdownImage } from '../tokens';
import { TSimpleToken } from '../../simpleCodec/simpleDecoder';
import { LeftBracket, ExclamationMark } from '../../simpleCodec/tokens';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../parserBase';
import { MarkdownLinkCaption, PartialMarkdownLink, PartialMarkdownLinkCaption } from './markdownLink';

/**
 * The parser responsible for parsing the `markdown image` sequence of characters.
 * E.g., `![alt text](./path/to/image.jpeg)` syntax.
 */
export class PartialMarkdownImage extends ParserBase<TSimpleToken, PartialMarkdownImage | MarkdownImage> {
	/**
	 * Current active parser instance, if in the mode of actively parsing the markdown link sequence.
	 */
	private markdownLinkParser: PartialMarkdownLinkCaption | MarkdownLinkCaption | PartialMarkdownLink | undefined;

	constructor(token: ExclamationMark) {
		super([token]);
	}

	/**
	 * Get all currently available tokens of the `markdown link` sequence.
	 */
	public override get tokens(): readonly TSimpleToken[] {
		const linkTokens = this.markdownLinkParser?.tokens ?? [];

		return [
			...this.currentTokens,
			...linkTokens,
		];
	}

	@assertNotConsumed
	public accept(token: TSimpleToken): TAcceptTokenResult<PartialMarkdownImage | MarkdownImage> {
		// on the first call we expect a character that begins `markdown link` sequence
		// hence we initiate the markdown link parsing process, otherwise we fail
		if (!this.markdownLinkParser) {
			if (token instanceof LeftBracket) {
				this.markdownLinkParser = new PartialMarkdownLinkCaption(token);

				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: true,
				};
			}

			return {
				result: 'failure',
				wasTokenConsumed: false,
			};
		}

		// handle subsequent tokens next

		const acceptResult = this.markdownLinkParser.accept(token);
		const { result, wasTokenConsumed } = acceptResult;

		if (result === 'success') {
			const { nextParser } = acceptResult;

			// if full markdown link was parsed out, the process completes
			if (nextParser instanceof MarkdownLink) {
				this.isConsumed = true;

				const firstToken = this.currentTokens[0];
				return {
					result,
					wasTokenConsumed,
					nextParser: new MarkdownImage(
						firstToken.range.startLineNumber,
						firstToken.range.startColumn,
						`${firstToken.text}${nextParser.caption}`,
						nextParser.reference,
					),
				};
			}

			// otherwise save new link parser reference and continue
			this.markdownLinkParser = nextParser;
			return {
				result,
				wasTokenConsumed,
				nextParser: this,
			};
		}

		// return the failure result
		this.isConsumed = true;
		return acceptResult;
	}
}
