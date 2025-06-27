/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleToken } from './simpleToken.js';

/**
 * A token that represent a `{` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class LeftCurlyBrace extends SimpleToken<'{'> {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: '{' = '{';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): '{' {
		return LeftCurlyBrace.symbol;
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
export class RightCurlyBrace extends SimpleToken<'}'> {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: '}' = '}';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): '}' {
		return RightCurlyBrace.symbol;
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
