/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FrontMatterValueToken } from './frontMatterToken.js';

/**
 * Token represents a generic sequence of tokens in a Front Matter header.
 */
export class FrontMatterSequence extends FrontMatterValueToken<FrontMatterSequence> {
	/**
	 * @override Because this token represent a generic sequence of tokens,
	 *           the type name is represented by the sequence of tokens itself
	 */
	public override get valueTypeName(): this {
		return this;
	}

	public override toString(): string {
		return this.text;
	}
}
