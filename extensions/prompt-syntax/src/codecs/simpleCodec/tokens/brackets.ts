/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken';
import { Range } from '../../../utils/vscode';
import { Line } from '../../linesCodec/tokens';

/**
 * A token that represent a `[` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class LeftBracket extends BaseToken {
	/**
	 * The underlying symbol of the `LeftBracket` token.
	 */
	public static readonly symbol: string = '[';

	/**
	 * Return text representation of the token.
	 */
	public get text(): string {
		return LeftBracket.symbol;
	}

	/**
	 * Create new `LeftBracket` token with range inside
	 * the given `Line` at the given `column number`.
	 */
	public static newOnLine(
		line: Line,
		atColumnNumber: number,
	): LeftBracket {
		const { range } = line;

		return new LeftBracket(new Range(
			range.startLineNumber,
			atColumnNumber,
			range.startLineNumber,
			atColumnNumber + this.symbol.length,
		));
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `left-bracket${this.range}`;
	}
}

/**
 * A token that represent a `]` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class RightBracket extends BaseToken {
	/**
	 * The underlying symbol of the `RightBracket` token.
	 */
	public static readonly symbol: string = ']';

	/**
	 * Return text representation of the token.
	 */
	public get text(): string {
		return RightBracket.symbol;
	}

	/**
	 * Create new `RightBracket` token with range inside
	 * the given `Line` at the given `column number`.
	 */
	public static newOnLine(
		line: Line,
		atColumnNumber: number,
	): RightBracket {
		const { range } = line;

		return new RightBracket(new Range(
			range.startLineNumber,
			atColumnNumber,
			range.startLineNumber,
			atColumnNumber + this.symbol.length,
		));
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `right-bracket${this.range}`;
	}
}

/**
 * General bracket token type.
 */
export type TBracket = LeftBracket | RightBracket;
