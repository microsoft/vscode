/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken';
import { Range } from '../../../utils/vscode';
import { Line } from '../../linesCodec/tokens';
/**
 * A token that represent a `tab` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class Tab extends BaseToken {
	/**
	 * The underlying symbol of the token.
	 */
	public static readonly symbol: string = '\t';

	/**
	 * Return text representation of the token.
	 */
	public get text(): string {
		return Tab.symbol;
	}

	/**
	 * Create new token with range inside
	 * the given `Line` at the given `column number`.
	 */
	public static newOnLine(
		line: Line,
		atColumnNumber: number,
	): Tab {
		const { range } = line;

		return new Tab(new Range(
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
		return `tab${this.range}`;
	}
}
