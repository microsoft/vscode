/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shape of a single message rendered in the TUI transcript. Mirrors the
 * `LlmMessage` shape from the core package but adds presentation-only fields
 * (id, in-progress flag) so React can key + animate streaming responses
 * without mutating the canonical history list.
 */
export interface TuiMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	text: string;
	streaming?: boolean;
	error?: string;
	toolCalls?: ReadonlyArray<{ name: string; input?: unknown }>;
}

/**
 * Static facts about the running session displayed in the status bar.
 */
export interface TuiSessionInfo {
	specialist: string;
	model: string;
	cwd: string;
	branch?: string;
}
