/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Range } from '../../../core/range.js';
import { Position } from '../../../core/position.js';
import { Line } from '../../linesCodec/tokens/line.js';

/**
 * A token that represent a `{` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class LeftCurlyBrace extends BaseToken {
	/**
	 * The underlying symbol of the token.
	 */
	public static readonly symbol: string = '{';

	/**
	 * Return text representation of the token.
	 */
	public get text(): string {
		return LeftCurlyBrace.symbol;
	}

	/**
	 * Create new `LeftCurlyBrace` token with range inside
	 * the given `Line` at the given `column number`.
	 */
	public static newOnLine(
		line: Line,
		atColumnNumber: number,
	): LeftCurlyBrace {
		const { range } = line;

		const startPosition = new Position(range.startLineNumber, atColumnNumber);
		const endPosition = new Position(range.startLineNumber, atColumnNumber + this.symbol.length);

		return new LeftCurlyBrace(Range.fromPositions(
			startPosition,
			endPosition,
		));
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `left-curly-brace${this.range}`;
	}
}

/**
 * A token that represent a `}` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class RightCurlyBrace extends BaseToken {
	/**
	 * The underlying symbol of the token.
	 */
	public static readonly symbol: string = '}';

	/**
	 * Return text representation of the token.
	 */
	public get text(): string {
		return RightCurlyBrace.symbol;
	}

	/**
	 * Create new `RightCurlyBrace` token with range inside
	 * the given `Line` at the given `column number`.
	 */
	public static newOnLine(
		line: Line,
		atColumnNumber: number,
	): RightCurlyBrace {
		const { range } = line;

		const startPosition = new Position(range.startLineNumber, atColumnNumber);
		const endPosition = new Position(range.startLineNumber, atColumnNumber + this.symbol.length);

		return new RightCurlyBrace(Range.fromPositions(
			startPosition,
			endPosition,
		));
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `right-curly-brace${this.range}`;
	}
}

/**
 * General curly brace token type.
 */
export type TCurlyBrace = LeftCurlyBrace | RightCurlyBrace;
