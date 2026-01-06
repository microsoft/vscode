/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type BaseToken } from './baseToken.js';
import { CompositeToken } from './compositeToken.js';

/**
 * Tokens that represent a sequence of tokens that does not
 * hold an additional meaning in the text.
 */
export class Text<
	TTokens extends readonly BaseToken[] = readonly BaseToken[],
> extends CompositeToken<TTokens> {
	public override toString(): string {
		return `text(${this.shortText()})${this.range}`;
	}
}
