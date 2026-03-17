/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-exports all protocol state types from the synced protocol/ directory
// and adds a few VS Code-specific helpers (ROOT_STATE_URI, factory functions,
// ICompletedToolCall alias, toolOutput helper).

import { URI } from '../../../../base/common/uri.js';
import { hasKey } from '../../../../base/common/types.js';
import {
	SessionLifecycle,
	ToolResultContentType,
	type ISessionSummary,
	type ISessionState,
	type IToolCallCompletedState,
	type IToolCallCancelledState,
	type IToolCallResult,
	type IToolResultTextContent,
	type IToolResultContent,
	type IUserMessage,
	type IActiveTurn,
	type IRootState,
} from './protocol/state.js';

// ---- Re-exports from protocol (all public types) ----------------------------

export type {
	StringOrMarkdown,
	IRootState,
	IAgentInfo,
	ISessionModelInfo,
	ISessionState,
	ISessionSummary,
	ISessionActiveClient,
	ITurn,
	IActiveTurn,
	IUserMessage,
	IMessageAttachment,
	IMarkdownResponsePart,
	IContentRef,
	IResponsePart,
	IToolCallResult,
	IToolCallStreamingState,
	IToolCallPendingConfirmationState,
	IToolCallRunningState,
	IToolCallPendingResultConfirmationState,
	IToolCallCompletedState,
	IToolCallCancelledState,
	IToolCallState,
	IToolDefinition,
	IToolAnnotations,
	IToolResultTextContent,
	IToolResultBinaryContent,
	IToolResultContent,
	IPermissionRequest,
	IUsageInfo,
	IErrorInfo,
	ISnapshot,
} from './protocol/state.js';

export {
	SessionLifecycle,
	SessionStatus,
	TurnState,
	ResponsePartKind,
	PolicyState,
	AttachmentType,
	ToolCallStatus,
	ToolCallConfirmationReason,
	ToolCallCancellationReason,
	PermissionKind,
	ToolResultContentType,
} from './protocol/state.js';

// ---- Well-known URIs --------------------------------------------------------

/** URI for the root state subscription. */
export const ROOT_STATE_URI = URI.from({ scheme: 'agenthost', path: '/root' });

// ---- VS Code helper types ---------------------------------------------------

/** A tool call in a terminal state, stored in completed turns. */
export type ICompletedToolCall = IToolCallCompletedState | IToolCallCancelledState;

// ---- Tool output helper -----------------------------------------------------

/**
 * Derives a plain-text tool output string from the protocol's `content` blocks.
 * Used by the chat UI to show a simplified tool result.
 */
export function getToolOutputText(result: IToolCallResult): string | undefined {
	if (!result.content || result.content.length === 0) {
		return undefined;
	}
	const texts: string[] = [];
	for (const block of result.content) {
		if (isToolResultTextContent(block)) {
			texts.push(block.text);
		}
	}
	return texts.length > 0 ? texts.join('\n') : undefined;
}

function isToolResultTextContent(block: IToolResultContent): block is IToolResultTextContent {
	return hasKey(block, { type: true }) && block.type === ToolResultContentType.Text;
}

// ---- _meta helpers for tool call rendering hints ----------------------------

/** Well-known key in `_meta` for terminal tool call display data. */
interface IPtyTerminalMeta {
	language?: string;
}

/**
 * Returns true if the tool call's `_meta` indicates terminal presentation.
 */
export function isTerminalToolCall(tc: { _meta?: Record<string, unknown> }): boolean {
	return tc._meta !== undefined && hasKey(tc._meta, { ptyTerminal: true });
}

/**
 * Reads the language hint from a terminal tool call's `_meta`.
 */
export function getToolCallLanguage(tc: { _meta?: Record<string, unknown> }): string | undefined {
	const pty = tc._meta?.['ptyTerminal'] as IPtyTerminalMeta | undefined;
	return pty?.language;
}

/**
 * Creates a `_meta` object with terminal tool call hints.
 * Used by the agent event mapper when constructing tool call start actions.
 */
export function createTerminalToolMeta(language?: string): Record<string, unknown> {
	return { ptyTerminal: { language: language ?? 'shellscript' } };
}

// ---- Factory helpers --------------------------------------------------------

export function createRootState(): IRootState {
	return {
		agents: [],
		activeSessions: 0,
	};
}

export function createSessionState(summary: ISessionSummary): ISessionState {
	return {
		summary,
		lifecycle: SessionLifecycle.Creating,
		turns: [],
		activeTurn: undefined,
	};
}

export function createActiveTurn(id: string, userMessage: IUserMessage): IActiveTurn {
	return {
		id,
		userMessage,
		streamingText: '',
		responseParts: [],
		toolCalls: {},
		pendingPermissions: {},
		reasoning: '',
		usage: undefined,
	};
}
