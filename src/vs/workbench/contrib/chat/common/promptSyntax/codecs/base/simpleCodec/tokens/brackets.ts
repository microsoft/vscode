/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleToken } from './simpleToken.js';

/**
 * A token that represent a `[` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class LeftBracket extends SimpleToken<'['> {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: '[' = '[';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): '[' {
		return LeftBracket.symbol;
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
export class RightBracket extends SimpleToken<']'> {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: ']' = ']';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): ']' {
		return RightBracket.symbol;
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
