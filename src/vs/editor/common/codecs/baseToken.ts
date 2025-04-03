/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pick } from '../../../base/common/arrays.js';
import { assert } from '../../../base/common/assert.js';
import { IRange, Range } from '../../../editor/common/core/range.js';

/**
 * Base class for all tokens with a `range` that
 * reflects token position in the original data.
 */
export abstract class BaseToken {
	constructor(
		private _range: Range,
	) { }

	public get range(): Range {
		return this._range;
	}

	/**
	 * Return text representation of the token.
	 */
	public abstract get text(): string;

	/**
	 * Check if this token has the same range as another one.
	 */
	public sameRange(other: Range): boolean {
		return this.range.equalsRange(other);
	}

	/**
	 * Returns a string representation of the token.
	 */
	public abstract toString(): string;

	/**
	 * Check if this token is equal to another one.
	 */
	public equals<T extends BaseToken>(other: T): boolean {
		if (!(other instanceof this.constructor)) {
			return false;
		}

		return this.sameRange(other.range);
	}

	/**
	 * Change `range` of the token with provided range components.
	 */
	public withRange(components: Partial<IRange>): this {
		this._range = new Range(
			components.startLineNumber ?? this.range.startLineNumber,
			components.startColumn ?? this.range.startColumn,
			components.endLineNumber ?? this.range.endLineNumber,
			components.endColumn ?? this.range.endColumn,
		);

		return this;
	}

	/**
	 * Render a list of tokens into a string.
	 */
	public static render(tokens: readonly BaseToken[]): string {
		return tokens.map(pick('text')).join('');
	}

	/**
	 * Returns the full range of a list of tokens in which the first token is
	 * used as the start of a tokens sequence and the last token reflects the end.
	 *
	 * @throws if:
	 * 	- provided {@link tokens} list is empty
	 *  - the first token start number is greater than the start line of the last token
	 *  - if the first and last token are on the same line, the first token start column must
	 * 	  be smaller than the start column of the last token
	 */
	public static fullRange(tokens: readonly BaseToken[]): Range {
		assert(
			tokens.length > 0,
			'Cannot get full range for an empty list of tokens.',
		);

		const firstToken = tokens[0];
		const lastToken = tokens[tokens.length - 1];

		// sanity checks for the full range we would construct
		assert(
			firstToken.range.startLineNumber <= lastToken.range.startLineNumber,
			'First token must start on previous or the same line as the last token.',
		);
		if ((firstToken !== lastToken) && (firstToken.range.startLineNumber === lastToken.range.startLineNumber)) {
			assert(
				firstToken.range.endColumn <= lastToken.range.startColumn,
				[
					'First token must end at least on previous or the same column as the last token.',
					`First token: ${firstToken}; Last token: ${lastToken}.`,
				].join('\n'),
			);
		}

		return new Range(
			firstToken.range.startLineNumber,
			firstToken.range.startColumn,
			lastToken.range.endLineNumber,
			lastToken.range.endColumn,
		);
	}

	/**
	 * Shorten version of the {@link text} property.
	 */
	public shortText(
		maxLength: number = 32,
	): string {
		if (this.text.length <= maxLength) {
			return this.text;
		}

		return `${this.text.slice(0, maxLength - 1)}...`;
	}
}

/**
 * Tokens that represent a sequence of tokens that does not
 * hold an additional meaning in the text.
 */
export class Text<TToken extends BaseToken = BaseToken> extends BaseToken {
	public get text(): string {
		return BaseToken.render(this.tokens);
	}

	constructor(
		range: Range,
		public readonly tokens: readonly TToken[],
	) {
		super(range);
	}

	/**
	 * Create new instance of the token from a provided list of tokens.
	 *
	 * @throws if the provided tokens list is empty because this function
	 *         automatically infers the range of the resulting token based
	 *         on the first and last token in the list.
	 */
	public static fromTokens<TToken extends BaseToken = BaseToken>(
		tokens: readonly TToken[],
	): Text<TToken> {
		assert(
			tokens.length > 0,
			'Cannot infer range from an empty list of tokens.',
		);

		const range = BaseToken.fullRange(tokens);

		return new Text(range, tokens);
	}

	public override toString(): string {
		return `text(${this.shortText()})${this.range}`;
	}
}
