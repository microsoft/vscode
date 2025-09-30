/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Command IDs for prompt analysis functionality
 * These commands are implemented in the GitHub Copilot Chat extension
 */
export const PROMPT_ANALYSIS_CHECK_COMMAND = 'github.copilot.chat.prompt.analysis.check';
export const PROMPT_ANALYSIS_ANALYZE_COMMAND = 'github.copilot.chat.prompt.analysis.analyze';

/**
 * Represents a single turn in a conversation
 */
export interface IConversationTurn {
	/** Role of the participant (user or assistant) */
	role: 'user' | 'assistant';
	/** Content of the message */
	content: string;
}

/**
 * Arguments for analyzing a conversation
 */
export interface IAnalyzeConversationArgs {
	/** Array of conversation turns to analyze */
	turns: IConversationTurn[];
	/** Optional current query being typed */
	currentQuery?: string;
}

/**
 * Result of conversation analysis
 */
export interface IPromptTaskAnalysis {
	/** Title in kebab-case format (e.g., "create-typescript-config") */
	title: string;
	/** Brief description of what the prompt helps with */
	description: string;
	/** The reusable prompt text extracted from the conversation */
	prompt: string;
}
