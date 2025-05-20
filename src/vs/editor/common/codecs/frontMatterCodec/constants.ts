/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NewLine } from '../linesCodec/tokens/newLine.js';
import { CarriageReturn } from '../linesCodec/tokens/carriageReturn.js';
import { FormFeed, Space, Tab, VerticalTab } from '../simpleCodec/tokens/index.js';

/**
 * List of valid "space" tokens that are valid between
 * different entities of the Front Matter header.
 */
export const VALID_SPACE_TOKENS = Object.freeze([
	Space, Tab, CarriageReturn, NewLine, FormFeed, VerticalTab,
]);
