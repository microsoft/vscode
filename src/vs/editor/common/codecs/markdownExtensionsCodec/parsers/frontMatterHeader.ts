/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Dash } from '../../simpleCodec/tokens/dash.js';
import { NewLine } from '../../linesCodec/tokens/newLine.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { assert, assertNever } from '../../../../../base/common/assert.js';
import { CarriageReturn } from '../../linesCodec/tokens/carriageReturn.js';
import { FrontMatterHeaderToken } from '../tokens/frontMatterHeaderToken.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';

/**
 * TODO: @legomushroom
 */
class FrontMatterMarker {
	/**
	 * TODO: @legomushroom
	 */
	public readonly dashCount: number;

	/**
	 * Full range of the token.
	 */
	public get range() {
		return BaseToken.fullRange(this.tokens);
	}

	constructor(
		public readonly tokens: readonly (Dash | CarriageReturn | NewLine)[],
	) {
		const lastToken = tokens[tokens.length - 1];

		assert(
			lastToken instanceof NewLine,
			`Front Matter header must end with a new line token, got '${lastToken}'.`,
		);

		this.dashCount = this.tokens
			.filter((token) => { return token instanceof Dash; })
			.length;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public toString(): string {
		return `frontmatter-marker(${this.dashCount}:${this.range})`;
	}
}

/**
 * TODO: @legomushroom
 */
type TMarkerToken = Dash | CarriageReturn | NewLine;

/**
 * TODO: @legomushroom
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
		// TODO: @legomushroom - include `Space` token?
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
					new FrontMatterMarker([
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
}

/**
 * TODO: @legomushroom
 */
export class PartialFrontMatterHeader extends ParserBase<TSimpleDecoderToken, PartialFrontMatterHeader | FrontMatterHeaderToken> {
	/**
	 * TODO: @legomushroom
	 */
	private partialEndMarker?: PartialFrontMatterEndMarker;

	/**
	 * TODO: @legomushroom
	 */
	private maybeEndMarker?: FrontMatterMarker;

	constructor(
		public readonly startMarker: FrontMatterMarker,
	) {
		super([]);
	}

	public override get tokens(): readonly TSimpleDecoderToken[] {
		return [
			...this.startMarker.tokens,
			...this.currentTokens,
			...(this.maybeEndMarker?.tokens ?? []), // TODO: @legomushroom
		];
	}

	/**
	 * TODO: @legomushroom
	 */
	/**
	 * Convert the current token sequence into a {@link MarkdownComment} token.
	 *
	 * Note! that this method marks the current parser object as "consumed"
	 *       hence it should not be used after this method is called.
	 */
	public asFrontMatterHeader(): FrontMatterHeaderToken | null {
		if (this.partialEndMarker === undefined) {
			return null;
		}

		if (this.partialEndMarker.dashCount !== this.startMarker.dashCount) {
			return null;
		}

		this.isConsumed = true;

		return FrontMatterHeaderToken.fromTokens(
			this.startMarker.tokens,
			this.currentTokens,
			this.partialEndMarker.tokens,
		);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterHeader | FrontMatterHeaderToken> {

		// if in the mode of parsing the end marker sequence, forward
		// the token to the current end marker parser instance
		if (this.partialEndMarker !== undefined) {
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
			this.partialEndMarker === undefined,
			`End marker parser must not be present.`,
		);
		this.partialEndMarker = new PartialFrontMatterEndMarker(token);

		return {
			result: 'success',
			wasTokenConsumed: true,
			nextParser: this,
		};
	}

	/**
	 * TODO: @legomushroom
	 * @throws
	 */
	private acceptEndMarkerToken(
		token: TSimpleDecoderToken,
	): TAcceptTokenResult<PartialFrontMatterHeader | FrontMatterHeaderToken> {
		assertDefined(
			this.partialEndMarker,
			`Partial end marker parser must be initialized.`,
		);

		// if we have a partial end marker, we are in the process of parsing
		// the end marker, so just pass the token to it and return
		const acceptResult = this.partialEndMarker.accept(token);
		const { result, wasTokenConsumed } = acceptResult;

		// TODO: @legomushroom
		if (result === 'success') {
			const { nextParser } = acceptResult;
			const endMarkerParsingComplete = (nextParser instanceof FrontMatterMarker);

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
					token,
				);
			}

			// found a valid end marker, so the parsing process is complete
			this.maybeEndMarker = endMarker;
			delete this.partialEndMarker;

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
				this.partialEndMarker.tokens,
				wasTokenConsumed,
				token,
			);
		}

		assertNever(
			result,
			`Unexpected result '${result}' while parsing the end marker.`,
		);
	}

	/**
	 * TODO: @legomushroom
	 */
	private handleEndMarkerParsingFailure(
		accumulatedTokens: readonly TSimpleDecoderToken[],
		wasTokenConsumed: boolean,
		token: TSimpleDecoderToken,
	): TAcceptTokenResult<PartialFrontMatterHeader> {
		this.currentTokens.push(...accumulatedTokens);

		if (wasTokenConsumed === false) {
			this.currentTokens.push(token);
		}

		delete this.partialEndMarker;
		delete this.maybeEndMarker;

		return {
			result: 'success',
			wasTokenConsumed: true,
			nextParser: this,
		};
	}
}

/**
 * TODO: @legomushroom
 */
class PartialFrontMatterEndMarker extends ParserBase<TMarkerToken, PartialFrontMatterEndMarker | FrontMatterMarker> {
	constructor(token: Dash) {
		const { range } = token;

		assert(
			range.startColumn === 1,
			`Front Matter header must start at the beginning of the line, but it starts at ${range.startColumn}.`,
		);

		super([token]);
	}

	/**
	 * TODO: @legomushroom
	 */
	public get dashCount(): number {
		return this.tokens
			.filter((token) => { return token instanceof Dash; })
			.length;
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialFrontMatterEndMarker | FrontMatterMarker> {
		const previousToken = this.currentTokens[this.currentTokens.length - 1];

		// collect a sequence of dash tokens that may end with a CR token
		// TODO: @legomushroom - include `Space` token?
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
				nextParser: new FrontMatterMarker([
					...this.currentTokens,
					token,
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
