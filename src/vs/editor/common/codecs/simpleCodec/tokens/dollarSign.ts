/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Range } from '../../../core/range.js';
import { Line } from '../../linesCodec/tokens/line.js';

/**
 * A token that represent a `$` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class DollarSign extends BaseToken {
	/**
	 * The underlying symbol of the token.
	 */
	public static readonly symbol: '$' = '$';

	/**
	 * Return text representation of the token.
	 */
	public get text(): '$' {
		return DollarSign.symbol;
	}

	/**
	 * Create new token with range inside
	 * the given `Line` at the given `column number`.
	 */
	public static newOnLine(
		line: Line,
		atColumnNumber: number,
	): DollarSign {
		const { range } = line;

		return new DollarSign(new Range(
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
		return `dollarSign${this.range}`;
	}
}
