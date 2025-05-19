/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleToken } from './simpleToken.js';

/**
 * A token that represent a `<` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class LeftAngleBracket extends SimpleToken<'<'> {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: '<' = '<';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): '<' {
		return LeftAngleBracket.symbol;
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
export class RightAngleBracket extends SimpleToken<'>'> {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: '>' = '>';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): '>' {
		return RightAngleBracket.symbol;
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
