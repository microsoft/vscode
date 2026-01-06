/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpacingToken } from './simpleToken.js';

/**
 * Token that represent a `vertical tab` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class VerticalTab extends SpacingToken<'\v'> {
	/**
	 * The underlying symbol of the `VerticalTab` token.
	 */
	public static override readonly symbol: '\v' = '\v';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): '\v' {
		return VerticalTab.symbol;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `vtab${this.range}`;
	}
}
