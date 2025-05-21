/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from './baseToken.js';

/**
 * Composite token consists of a list of other tokens.
 * Composite token consists of a list of other tokens.
 */
export abstract class CompositeToken<
	TTokens extends readonly BaseToken[],
> extends BaseToken {
	/**
	 * Reference to the list of child tokens.
	 */
	protected readonly childTokens: [...TTokens];

	constructor(
		tokens: TTokens,
	) {
		super(BaseToken.fullRange(tokens));

		this.childTokens = [...tokens];
	}

	public override get text(): string {
		return BaseToken.render(this.childTokens);
	}

	/**
	 * Tokens that this composite token consists of.
	 */
	public get children(): TTokens {
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

		if (this.children.length !== other.children.length) {
			return false;
		}

		for (let i = 0; i < this.children.length; i++) {
			const childToken = this.children[i];
			const otherChildToken = other.children[i];

			if (childToken.equals(otherChildToken) === false) {
				return false;
			}
		}

		return true;
	}
}
