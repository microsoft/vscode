/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from './baseToken.js';

/**
 * Composite token consists of a list of other tokens.
 */
export abstract class CompositeToken<
	TTokens extends readonly BaseToken[],
> extends BaseToken {
	constructor(
		protected readonly childTokens: TTokens,
	) {
		super(BaseToken.fullRange(childTokens));
	}

	public override get text() {
		return BaseToken.render(this.childTokens);
	}

	/**
	 * Tokens that this composite token consists of.
	 */
	public get tokens(): TTokens {
		return this.childTokens;
	}

	/**
	 * Check if this token is equal to another one,
	 * including all of its child tokens.
	 */
	public override equals(other: BaseToken): other is typeof this {
		if (super.equals(other) === false) {
			return false;
		}

		if (this.tokens.length !== other.tokens.length) {
			return false;
		}

		for (let i = 0; i < this.tokens.length; i++) {
			const childToken = this.tokens[i];
			const otherChildToken = other.tokens[i];

			if (childToken.equals(otherChildToken) === false) {
				return false;
			}
		}

		return true;
	}
}
