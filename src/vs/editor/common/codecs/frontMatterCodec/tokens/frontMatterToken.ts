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
 * Base class for all tokens that represent a `value` inside a Front Matter header.
 */
export abstract class FrontMatterValueToken extends FrontMatterToken { }
