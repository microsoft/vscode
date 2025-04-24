/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';

/**
 * Base class for all tokens inside a Front Matter header.
 */
export abstract class FrontMatterToken extends BaseToken { }

/**
 * List of all currently supported value types.
 */
export type TValueTypeName = 'string' | 'boolean' | 'array';

/**
 * Base class for all tokens that represent a `value` inside a Front Matter header.
 */
export abstract class FrontMatterValueToken<TTypeName extends TValueTypeName = TValueTypeName> extends FrontMatterToken {
	/**
	 * Type name of the `value` represented by this token.
	 */
	public abstract readonly valueTypeName: TTypeName;
}
