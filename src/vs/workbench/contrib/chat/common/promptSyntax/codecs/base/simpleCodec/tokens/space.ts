/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpacingToken } from './simpleToken.js';

/**
 * A token that represent a `space` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class Space extends SpacingToken<' '> {
	/**
	 * The underlying symbol of the `Space` token.
	 */
	public static override readonly symbol: ' ' = ' ';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): ' ' {
		return Space.symbol;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `space${this.range}`;
	}
}
