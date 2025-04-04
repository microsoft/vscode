/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageFilter } from '../../../../../editor/common/languageSelector.js';
import { COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, PROMPT_FILE_EXTENSION } from '../../../../../platform/prompts/common/constants.js';

/**
 * Documentation link for the reusable prompts feature.
 */
export const DOCUMENTATION_URL = 'https://aka.ms/vscode-ghcp-prompt-snippets';

/**
 * Supported reusable prompt file patterns.
 */
const REUSABLE_PROMPT_FILE_PATTERNS = Object.freeze([
	/**
	 * Any file that has the prompt file extension.
	 * See {@link PROMPT_FILE_EXTENSION}.
	 */
	`**/*${PROMPT_FILE_EXTENSION}`,

	/**
	 * Copilot custom instructions file inside a `.github` folder.
	 */
	`**/.github/${COPILOT_CUSTOM_INSTRUCTIONS_FILENAME}`,
]);

/**
 * Prompt files language selector.
 */
export const LANGUAGE_SELECTOR: LanguageFilter = Object.freeze({
	pattern: `{${REUSABLE_PROMPT_FILE_PATTERNS.join(',')}}`,
});
