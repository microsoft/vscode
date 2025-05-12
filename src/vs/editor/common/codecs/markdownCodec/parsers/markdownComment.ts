/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../core/range.js';
import { BaseToken } from '../../baseToken.js';
import { Dash } from '../../simpleCodec/tokens/dash.js';
import { assert } from '../../../../../base/common/assert.js';
import { MarkdownComment } from '../tokens/markdownComment.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { ExclamationMark } from '../../simpleCodec/tokens/exclamationMark.js';
import { LeftAngleBracket, RightAngleBracket } from '../../simpleCodec/tokens/angleBrackets.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';

/**
 * The parser responsible for parsing the `<!--` sequence - the start of a `markdown comment`.
 */
export class PartialMarkdownCommentStart extends ParserBase<TSimpleDecoderToken, PartialMarkdownCommentStart | MarkdownCommentStart> {
	constructor(token: LeftAngleBracket) {
		super([token]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialMarkdownCommentStart | MarkdownCommentStart> {
		const lastToken = this.currentTokens[this.currentTokens.length - 1];

		// if received `!` after `<`, continue the parsing process
		if (token instanceof ExclamationMark && lastToken instanceof LeftAngleBracket) {
			this.currentTokens.push(token);
			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed: true,
			};
		}

		// if received `-` after, check that previous token either `!` or `-`,
		// which allows to continue the parsing process, otherwise fail
		if (token instanceof Dash) {
			this.currentTokens.push(token);

			if (lastToken instanceof ExclamationMark) {
				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: true,
				};
			}

			if (lastToken instanceof Dash) {
				const token1: TSimpleDecoderToken | undefined = this.currentTokens[0];
				const token2: TSimpleDecoderToken | undefined = this.currentTokens[1];
				const token3: TSimpleDecoderToken | undefined = this.currentTokens[2];
				const token4: TSimpleDecoderToken | undefined = this.currentTokens[3];

				// sanity checks
				assert(
					token1 instanceof LeftAngleBracket,
					`The first token must be a '<', got '${token1}'.`,
				);
				assert(
					token2 instanceof ExclamationMark,
					`The second token must be a '!', got '${token2}'.`,
				);
				assert(
					token3 instanceof Dash,
					`The third token must be a '-', got '${token3}'.`,
				);
				assert(
					token4 instanceof Dash,
					`The fourth token must be a '-', got '${token4}'.`,
				);

				this.isConsumed = true;
				return {
					result: 'success',
					nextParser: new MarkdownCommentStart([token1, token2, token3, token4]),
					wasTokenConsumed: true,
				};
			}
		}

		this.isConsumed = true;
		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}
}

/**
 * The parser responsible for a `markdown comment` sequence of tokens.
 * E.g. `<!-- some comment` which may or may not end with `-->`. If it does,
 * then the parser transitions to the {@link MarkdownComment} token.
 */
export class MarkdownCommentStart extends ParserBase<TSimpleDecoderToken, MarkdownCommentStart | MarkdownComment> {
	constructor(tokens: [LeftAngleBracket, ExclamationMark, Dash, Dash]) {
		super(tokens);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<MarkdownCommentStart | MarkdownComment> {
		// if received `>` while current token sequence ends with `--`,
		// then this is the end of the comment sequence
		if (token instanceof RightAngleBracket && this.endsWithDashes) {
			this.currentTokens.push(token);

			return {
				result: 'success',
				nextParser: this.asMarkdownComment(),
				wasTokenConsumed: true,
			};
		}

		this.currentTokens.push(token);

		return {
			result: 'success',
			nextParser: this,
			wasTokenConsumed: true,
		};
	}

	/**
	 * Convert the current token sequence into a {@link MarkdownComment} token.
	 *
	 * Note! that this method marks the current parser object as "consumed"
	 *       hence it should not be used after this method is called.
	 */
	public asMarkdownComment(): MarkdownComment {
		this.isConsumed = true;

		return new MarkdownComment(
			this.range,
			BaseToken.render(this.currentTokens),
		);
	}

	/**
	 * Get range of current token sequence.
	 */
	private get range(): Range {
		const firstToken = this.currentTokens[0];
		const lastToken = this.currentTokens[this.currentTokens.length - 1];

		const range = new Range(
			firstToken.range.startLineNumber,
			firstToken.range.startColumn,
			lastToken.range.endLineNumber,
			lastToken.range.endColumn,
		);

		return range;
	}

	/**
	 * Whether the current token sequence ends with two dashes.
	 */
	private get endsWithDashes(): boolean {
		const lastToken = this.currentTokens[this.currentTokens.length - 1];
		if (!(lastToken instanceof Dash)) {
			return false;
		}

		const secondLastToken = this.currentTokens[this.currentTokens.length - 2];
		if (!(secondLastToken instanceof Dash)) {
			return false;
		}

		return true;
	}
}
