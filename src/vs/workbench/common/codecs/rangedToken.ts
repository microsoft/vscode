/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../editor/common/core/range.js';

// TODO: @legomushroom - refactor the tokens to make them more consistent
// TODO: @legomushroom - add `putOnLine` method
// TODO: @legomushroom - add `hasValidRange` method

/**
 * Base class for all tokens with a `range` that reflects
 * token's position in the original data.
 */
export class RangedToken {
	constructor(
		public readonly range: Range,
	) { }

	/**
	 * Check if this token has the same range as another one.
	 */
	public sameRange(other: Range): boolean {
		return this.range.equalsRange(other);
	}
}
