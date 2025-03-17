/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Line } from './line';
import { BaseToken } from '../../baseToken';
import { Range, VSBuffer } from '../../../utils/vscode';

/**
 * Token that represent a `carriage return` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class CarriageReturn extends BaseToken {
	/**
	 * The underlying symbol of the token.
	 */
	public static readonly symbol: string = '\r';

	/**
	 * The byte representation of the {@link symbol}.
	 */
	public static readonly byte = VSBuffer.fromString(CarriageReturn.symbol);

	/**
	 * The byte representation of the token.
	 */
	public get byte() {
		return CarriageReturn.byte;
	}

	/**
	 * Return text representation of the token.
	 */
	public get text(): string {
		return CarriageReturn.symbol;
	}

	/**
	 * Create new `CarriageReturn` token with range inside
	 * the given `Line` at the given `column number`.
	 */
	public static newOnLine(
		line: Line,
		atColumnNumber: number,
	): CarriageReturn {
		const { range } = line;

		return new CarriageReturn(new Range(
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
		return `carriage-return${this.range}`;
	}
}
