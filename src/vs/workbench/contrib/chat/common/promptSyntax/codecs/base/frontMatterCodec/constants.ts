/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NewLine } from '../linesCodec/tokens/newLine.js';
import { CarriageReturn } from '../linesCodec/tokens/carriageReturn.js';
import { FormFeed, SpacingToken } from '../simpleCodec/tokens/tokens.js';

/**
 * List of valid "space" tokens that are valid between different
 * records of a Front Matter header.
 */
export const VALID_INTER_RECORD_SPACING_TOKENS = Object.freeze([
	SpacingToken, CarriageReturn, NewLine, FormFeed,
]);
