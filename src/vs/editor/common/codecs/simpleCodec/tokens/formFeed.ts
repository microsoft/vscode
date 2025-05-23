/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleToken } from './simpleToken.js';

/**
 * Token that represent a `form feed` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class FormFeed extends SimpleToken<'\f'> {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: '\f' = '\f';

	/**
	 * Return text representation of the token.
	 */
	public override get text(): '\f' {
		return FormFeed.symbol;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `formfeed${this.range}`;
	}
}
