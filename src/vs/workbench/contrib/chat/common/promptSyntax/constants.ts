/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageFilter } from '../../../../../editor/common/languageSelector.js';

/**
 * Documentation link for the reusable prompts feature.
 */
export const DOCUMENTATION_URL = 'https://aka.ms/vscode-ghcp-prompt-snippets';

/**
 * Language ID for the reusable prompt syntax.
 */
export const PROMPT_LANGUAGE_ID = 'prompt';

/**
 * Prompt files language selector.
 */
export const LANGUAGE_SELECTOR: LanguageFilter = Object.freeze({
	language: PROMPT_LANGUAGE_ID,
});
