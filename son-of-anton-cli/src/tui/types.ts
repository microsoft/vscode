/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compact, presentation-only summary of an attachment shipped with a user
 * turn. The actual base64 payload lives in the LLM message history; this
 * shape only carries what the transcript needs to render the placeholder
 * line above the user's typed text.
 */
export interface TuiAttachmentSummary {
	name: string;
	sizeBytes: number;
}

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
	/**
	 * Image attachments shipped alongside this user turn. Rendered as a single
	 * "📎 N attachments: …" line above the typed text. Only ever set on
	 * `role === 'user'` messages; assistant + system rows leave it undefined.
	 */
	attachments?: ReadonlyArray<TuiAttachmentSummary>;
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
