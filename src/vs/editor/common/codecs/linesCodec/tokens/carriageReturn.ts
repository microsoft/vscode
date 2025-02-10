/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Line } from './line.js';
import { BaseToken } from '../../baseToken.js';
import { Range } from '../../../core/range.js';
import { Position } from '../../../core/position.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';

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

		const startPosition = new Position(range.startLineNumber, atColumnNumber);
		const endPosition = new Position(range.startLineNumber, atColumnNumber + this.symbol.length);

		return new CarriageReturn(Range.fromPositions(
			startPosition,
			endPosition,
		));
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `carriage-return${this.range}`;
	}
}
