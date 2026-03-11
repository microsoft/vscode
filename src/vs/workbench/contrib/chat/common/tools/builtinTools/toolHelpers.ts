/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IToolResult } from '../languageModelToolsService.js';

/**
 * Creates a tool result with a single text content part.
 */
export function createToolSimpleTextResult(value: string): IToolResult {
	return {
		content: [{
			kind: 'text',
			value
		}]
	};
}
