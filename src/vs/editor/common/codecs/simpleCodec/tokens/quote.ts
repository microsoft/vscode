/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { SimpleToken } from './simpleToken.js';

/**
 * A token that represent a `'` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class Quote extends SimpleToken {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: '\'' = '\'';

	/**
	 * Return text representation of the token.
	 */
	public override get text() {
		return Quote.symbol;
	}

	/**
	 * Checks if the provided token is of the same type
	 * as the current one.
	 */
	public sameType(other: BaseToken): other is Quote {
		return (other instanceof this.constructor);
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `quote${this.range}`;
	}
}
