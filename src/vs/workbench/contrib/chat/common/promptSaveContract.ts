/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Commands for prompt save cross-repository communication
 */
export const PROMPT_SAVE_CHECK_COMMAND = 'github.copilot.chat.prompt.save.check';
export const PROMPT_SAVE_ANALYZE_COMMAND = 'github.copilot.chat.prompt.save.analyze';

/**
 * Input arguments for conversation analysis
 */
export interface IAnalyzeConversationArgs {
	/**
	 * Array of conversation turns (user/assistant message pairs)
	 */
	readonly turns: Array<{
		readonly role: 'user' | 'assistant';
		readonly content: string;
	}>;

	/**
	 * Optional: The current user query that triggered the save
	 */
	readonly currentQuery?: string;
}

/**
 * Output from prompt save analysis
 */
export interface IPromptTaskSave {
	/**
	 * Suggested filename in kebab-case (without .prompt.md extension)
	 */
	readonly title: string;

	/**
	 * Brief description of the prompt's purpose (1-2 sentences)
	 */
	readonly description: string;

	/**
	 * Generalized prompt text that can be reused for similar tasks
	 */
	readonly prompt: string;
}
