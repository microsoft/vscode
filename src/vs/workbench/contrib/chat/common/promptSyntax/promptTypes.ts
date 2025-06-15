/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageSelector } from '../../../../../editor/common/languageSelector.js';

/**
 * Documentation link for the reusable prompts feature.
 */
export const PROMPT_DOCUMENTATION_URL = 'https://aka.ms/vscode-ghcp-prompt-snippets';
export const INSTRUCTIONS_DOCUMENTATION_URL = 'https://aka.ms/vscode-ghcp-custom-instructions';
export const MODE_DOCUMENTATION_URL = 'https://aka.ms/vscode-ghcp-custom-chat-modes'; // todo

/**
 * Language ID for the reusable prompt syntax.
 */
export const PROMPT_LANGUAGE_ID = 'prompt';

/**
 * Language ID for instructions syntax.
 */
export const INSTRUCTIONS_LANGUAGE_ID = 'instructions';

/**
 * Language ID for modes syntax.
 */
export const MODE_LANGUAGE_ID = 'chatmode';

/**
 * Prompt and instructions files language selector.
 */
export const ALL_PROMPTS_LANGUAGE_SELECTOR: LanguageSelector = [PROMPT_LANGUAGE_ID, INSTRUCTIONS_LANGUAGE_ID, MODE_LANGUAGE_ID];

/**
 * The language id for for a prompts type.
 */
export function getLanguageIdForPromptsType(type: PromptsType): string {
	switch (type) {
		case PromptsType.prompt:
			return PROMPT_LANGUAGE_ID;
		case PromptsType.instructions:
			return INSTRUCTIONS_LANGUAGE_ID;
		case PromptsType.mode:
			return MODE_LANGUAGE_ID;
		default:
			throw new Error(`Unknown prompt type: ${type}`);
	}
}

export function getPromptsTypeForLanguageId(languageId: string): PromptsType | undefined {
	switch (languageId) {
		case PROMPT_LANGUAGE_ID:
			return PromptsType.prompt;
		case INSTRUCTIONS_LANGUAGE_ID:
			return PromptsType.instructions;
		case MODE_LANGUAGE_ID:
			return PromptsType.mode;
		default:
			return undefined;
	}
}


/**
 * What the prompt is used for.
 */
export enum PromptsType {
	instructions = 'instructions',
	prompt = 'prompt',
	mode = 'mode'
}
export function isValidPromptType(type: string): type is PromptsType {
	return Object.values(PromptsType).includes(type as PromptsType);
}

