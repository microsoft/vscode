/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../editor/common/core/range.js';

/**
 * Base class for all tokens with a `range` that
 * reflects token position in the original data.
 */
export abstract class BaseToken {
	constructor(
		public readonly range: Range,
	) { }

	/**
	 * Check if this token has the same range as another one.
	 */
	public sameRange(other: Range): boolean {
		return this.range.equalsRange(other);
	}

	/**
	 * Returns a string representation of the token.
	 */
	public abstract toString(): string;

	/**
	 * Check if this token is equal to another one.
	 */
	public equals<T extends BaseToken>(other: T): boolean {
		if (!(other instanceof this.constructor)) {
			return false;
		}

		return this.sameRange(other.range);
	}
}
