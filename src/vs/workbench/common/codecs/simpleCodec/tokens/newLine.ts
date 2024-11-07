/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RangedToken } from '../../rangedToken.js';

/**
 * A token that represent a `new line` with a `range`.
 * The `range` reflects the position of the token in the original data.
 */
export class NewLine extends RangedToken { }
