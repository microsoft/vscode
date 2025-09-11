/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpacingToken } from './simpleToken.js';

/**
 * A token that represent a `tab` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class Tab extends SpacingToken<'\t'> {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: '\t' = '\t';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): '\t' {
		return Tab.symbol;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `tab${this.range}`;
	}
}
