/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dash } from '../../simpleCodec/tokens/dash.js';
import { NewLine } from '../../linesCodec/tokens/newLine.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { assert, assertNever } from '../../../../../base/common/assert.js';
import { CarriageReturn } from '../../linesCodec/tokens/carriageReturn.js';
import { FrontMatterHeaderToken } from '../tokens/frontMatterHeaderToken.js';
import { assertNotConsumed, IAcceptTokenSuccess, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';
import { FrontMatterHeaderMarkerToken, TMarkerToken } from '../tokens/frontMatterHeaderMarkerToken.js';

/**
 * Parses the start marker of a Front Matter header.
 */
export class PartialFrontMatterStartMarker extends ParserBase<TMarkerToken, PartialFrontMatterStartMarker | PartialFrontMatterHeader> {
	constructor(token: Dash) {
		const { range } = token;

		assert(
			range.startLineNumber === 1,
			`Front Matter header must start at the first line, but it starts at line #${range.startLineNumber}.`,
		);

		assert(
			range.startColumn === 1,
			`Front Matter header must start at the beginning of the line, but it starts at ${range.startColumn}.`,
		);

		super([token]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterStartMarker | PartialFrontMatterHeader> {
		const previousToken = this.currentTokens[this.currentTokens.length - 1];

		// collect a sequence of dash tokens that may end with a CR token
		if ((token instanceof Dash) || (token instanceof CarriageReturn)) {
			// a dash or CR tokens can go only after another dash token
			if ((previousToken instanceof Dash) === false) {
				this.isConsumed = true;

				return {
					result: 'failure',
					wasTokenConsumed: false,
				};
			}

			this.currentTokens.push(token);

			return {
				result: 'success',
				wasTokenConsumed: true,
				nextParser: this,
			};
		}

		// stop collecting dash tokens when a new line token is encountered
		if (token instanceof NewLine) {
			this.isConsumed = true;

			return {
				result: 'success',
				wasTokenConsumed: true,
				nextParser: new PartialFrontMatterHeader(
					new FrontMatterHeaderMarkerToken([
						...this.currentTokens,
						token,
					]),
				),
			};
		}

		// any other token is invalid for the `start marker`
		this.isConsumed = true;
		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}

	/**
	 * Check if provided dash token can be a start of a Front Matter header.
	 */
	public static mayStartHeader(token: TSimpleDecoderToken): token is Dash {
		return (token instanceof Dash)
			&& (token.range.startLineNumber === 1)
			&& (token.range.startColumn === 1);
	}
}

/**
 * Parses a Front Matter header that already has a start marker
 * and possibly some content that follows.
 */
export class PartialFrontMatterHeader extends ParserBase<TSimpleDecoderToken, PartialFrontMatterHeader | FrontMatterHeaderToken> {
	/**
	 * Parser instance for the end marker of the Front Matter header.
	 */
	private maybeEndMarker?: PartialFrontMatterEndMarker;

	constructor(
		public readonly startMarker: FrontMatterHeaderMarkerToken,
	) {
		super([]);
	}

	public override get tokens(): readonly TSimpleDecoderToken[] {
		const endMarkerTokens = (this.maybeEndMarker !== undefined)
			? this.maybeEndMarker.tokens
			: [];

		return [
			...this.startMarker.tokens,
			...this.currentTokens,
			...endMarkerTokens,
		];
	}

	/**
	 * Convert the current token sequence into a {@link FrontMatterHeaderToken} token.
	 *
	 * Note! that this method marks the current parser object as "consumed"
	 *       hence it should not be used after this method is called.
	 */
	public asFrontMatterHeader(): FrontMatterHeaderToken | null {
		assertDefined(
			this.maybeEndMarker,
			'Cannot convert to Front Matter header token without an end marker.',
		);

		assert(
			this.maybeEndMarker.dashCount === this.startMarker.dashCount,
			`Start and end markers must have the same number of dashes, got ${this.startMarker.dashCount} / ${this.maybeEndMarker.dashCount}.`,
		);

		this.isConsumed = true;

		return FrontMatterHeaderToken.fromTokens(
			this.startMarker.tokens,
			this.currentTokens,
			this.maybeEndMarker.tokens,
		);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterHeader | FrontMatterHeaderToken> {
		// if in the mode of parsing the end marker sequence, forward
		// the token to the current end marker parser instance
		if (this.maybeEndMarker !== undefined) {
			return this.acceptEndMarkerToken(token);
		}

		// collect all tokens until a `dash token at the beginning of a line` is found
		if (((token instanceof Dash) === false) || (token.range.startColumn !== 1)) {
			this.currentTokens.push(token);

			return {
				result: 'success',
				wasTokenConsumed: true,
				nextParser: this,
			};
		}

		// a dash token at the beginning of the line might be a start of the `end marker`
		// sequence of the front matter header, hence initialize appropriate parser object
		assert(
			this.maybeEndMarker === undefined,
			`End marker parser must not be present.`,
		);
		this.maybeEndMarker = new PartialFrontMatterEndMarker(token);

		return {
			result: 'success',
			wasTokenConsumed: true,
			nextParser: this,
		};
	}

	/**
	 * When a end marker parser is present, we pass all tokens to it
	 * until it is completes the parsing process(either success or failure).
	 */
	private acceptEndMarkerToken(
		token: TSimpleDecoderToken,
	): TAcceptTokenResult<PartialFrontMatterHeader | FrontMatterHeaderToken> {
		assertDefined(
			this.maybeEndMarker,
			`Partial end marker parser must be initialized.`,
		);

		// if we have a partial end marker, we are in the process of parsing
		// the end marker, so just pass the token to it and return
		const acceptResult = this.maybeEndMarker.accept(token);
		const { result, wasTokenConsumed } = acceptResult;

		if (result === 'success') {
			const { nextParser } = acceptResult;
			const endMarkerParsingComplete = (nextParser instanceof FrontMatterHeaderMarkerToken);

			if (endMarkerParsingComplete === false) {
				return {
					result: 'success',
					wasTokenConsumed,
					nextParser: this,
				};
			}

			const endMarker = nextParser;

			// start and end markers must have the same number of dashes, hence
			// if they don't match, we would like to continue parsing the header
			// until we find an end marker with the same number of dashes
			if (endMarker.dashCount !== this.startMarker.dashCount) {
				return this.handleEndMarkerParsingFailure(
					endMarker.tokens,
					wasTokenConsumed,
				);
			}

			this.isConsumed = true;
			return {
				result: 'success',
				wasTokenConsumed: true,
				nextParser: FrontMatterHeaderToken.fromTokens(
					this.startMarker.tokens,
					this.currentTokens,
					this.maybeEndMarker.tokens,
				),
			};
		}

		// if failed to parse the end marker, we would like to continue parsing
		// the header until we find a valid end marker
		if (result === 'failure') {
			return this.handleEndMarkerParsingFailure(
				this.maybeEndMarker.tokens,
				wasTokenConsumed,
			);
		}

		assertNever(
			result,
			`Unexpected result '${result}' while parsing the end marker.`,
		);
	}

	/**
	 * On failure to parse the end marker, we need to continue parsing
	 * the header because there might be another valid end marker in
	 * the stream of tokens. Therefore we copy over the end marker tokens
	 * into the list of "content" tokens and reset the end marker parser.
	 */
	private handleEndMarkerParsingFailure(
		tokens: readonly TSimpleDecoderToken[],
		wasTokenConsumed: boolean,
	): IAcceptTokenSuccess<PartialFrontMatterHeader> {
		this.currentTokens.push(...tokens);
		delete this.maybeEndMarker;

		return {
			result: 'success',
			wasTokenConsumed,
			nextParser: this,
		};
	}
}

/**
 * Parser the end marker sequence of a Front Matter header.
 */
class PartialFrontMatterEndMarker extends ParserBase<TMarkerToken, PartialFrontMatterEndMarker | FrontMatterHeaderMarkerToken> {
	constructor(token: Dash) {
		const { range } = token;

		assert(
			range.startColumn === 1,
			`Front Matter header must start at the beginning of the line, but it starts at ${range.startColumn}.`,
		);

		super([token]);
	}

	/**
	 * Number of dashes in the marker.
	 */
	public get dashCount(): number {
		return this.tokens
			.filter((token) => { return token instanceof Dash; })
			.length;
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterEndMarker | FrontMatterHeaderMarkerToken> {
		const previousToken = this.currentTokens[this.currentTokens.length - 1];

		// collect a sequence of dash tokens that may end with a CR token
		if ((token instanceof Dash) || (token instanceof CarriageReturn)) {
			// a dash or CR tokens can go only after another dash token
			if ((previousToken instanceof Dash) === false) {
				this.isConsumed = true;

				return {
					result: 'failure',
					wasTokenConsumed: false,
				};
			}

			this.currentTokens.push(token);

			return {
				result: 'success',
				wasTokenConsumed: true,
				nextParser: this,
			};
		}

		// stop collecting dash tokens when a new line token is encountered
		if (token instanceof NewLine) {
			this.isConsumed = true;
			this.currentTokens.push(token);

			return {
				result: 'success',
				wasTokenConsumed: true,
				nextParser: new FrontMatterHeaderMarkerToken([
					...this.currentTokens,
				]),
			};
		}

		// any other token is invalid for the `start marker`
		this.isConsumed = true;
		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}
}
