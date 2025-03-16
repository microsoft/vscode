/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Range } from '../../../core/range.js';
import { Position } from '../../../core/position.js';
import { Line } from '../../linesCodec/tokens/line.js';

/**
 * A token that represent a `<` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class LeftAngleBracket extends BaseToken {
	/**
	 * The underlying symbol of the token.
	 */
	public static readonly symbol: string = '<';

	/**
	 * Return text representation of the token.
	 */
	public get text(): string {
		return LeftAngleBracket.symbol;
	}

	/**
	 * Create new `LeftBracket` token with range inside
	 * the given `Line` at the given `column number`.
	 */
	public static newOnLine(
		line: Line,
		atColumnNumber: number,
	): LeftAngleBracket {
		const { range } = line;

		const startPosition = new Position(range.startLineNumber, atColumnNumber);
		const endPosition = new Position(range.startLineNumber, atColumnNumber + this.symbol.length);

		return new LeftAngleBracket(Range.fromPositions(
			startPosition,
			endPosition,
		));
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `left-angle-bracket${this.range}`;
	}
}

/**
 * A token that represent a `>` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class RightAngleBracket extends BaseToken {
	/**
	 * The underlying symbol of the token.
	 */
	public static readonly symbol: string = '>';

	/**
	 * Return text representation of the token.
	 */
	public get text(): string {
		return RightAngleBracket.symbol;
	}

	/**
	 * Create new `RightAngleBracket` token with range inside
	 * the given `Line` at the given `column number`.
	 */
	public static newOnLine(
		line: Line,
		atColumnNumber: number,
	): RightAngleBracket {
		const { range } = line;

		const startPosition = new Position(range.startLineNumber, atColumnNumber);
		const endPosition = new Position(range.startLineNumber, atColumnNumber + this.symbol.length);

		return new RightAngleBracket(Range.fromPositions(
			startPosition,
			endPosition,
		));
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `right-angle-bracket${this.range}`;
	}
}

/**
 * General angle bracket token type.
 */
export type TAngleBracket = LeftAngleBracket | RightAngleBracket;
