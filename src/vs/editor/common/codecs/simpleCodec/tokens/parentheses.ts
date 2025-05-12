/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleToken } from './simpleToken.js';

/**
 * A token that represent a `(` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class LeftParenthesis extends SimpleToken<'('> {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: '(' = '(';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): '(' {
		return LeftParenthesis.symbol;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `left-parenthesis${this.range}`;
	}
}

/**
 * A token that represent a `)` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class RightParenthesis extends SimpleToken<')'> {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: ')' = ')';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): ')' {
		return RightParenthesis.symbol;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `right-parenthesis${this.range}`;
	}
}

/**
 * General parenthesis token type.
 */
export type TParenthesis = LeftParenthesis | RightParenthesis;
