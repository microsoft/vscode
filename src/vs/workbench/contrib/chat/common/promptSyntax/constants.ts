/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PROMPT_FILE_EXTENSION } from '../../../../../platform/prompts/common/constants.js';

/**
 * Documentation link for the reusable prompts feature.
 */
export const DOCUMENTATION_URL = 'https://aka.ms/vscode-ghcp-prompt-snippets';

/**
 * Prompt files language selector.
 */
export const LANGUAGE_SELECTOR = Object.freeze({
	pattern: `**/*${PROMPT_FILE_EXTENSION}`,
});
