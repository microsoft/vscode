/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Immutable state types for the sessions process protocol.
// See protocol.md for the full design rationale.
//
// Most types are imported from the auto-generated protocol layer
// (synced from the agent-host-protocol repo). This file adds VS Code-specific
// helpers and re-exports.

import { hasKey } from '../../../../base/common/types.js';
import {
	SessionLifecycle,
	ToolResultContentType,
	IToolResultFileEditContent,
	type IActiveTurn,
	type IRootState,
	type ISessionState,
	type ISessionSummary,
	type IToolCallCancelledState,
	type IToolCallCompletedState,
	type IToolCallResult,
	type IToolCallState,
	type IToolResultTextContent,
	type IUserMessage,
} from './protocol/state.js';

// Re-export everything from the protocol state module
export {
	type IActiveTurn,
	type IAgentInfo,
	type IContentRef,
	type IErrorInfo,
	type IMarkdownResponsePart,
	type IMessageAttachment,
	type IPermissionRequest,
	type IResponsePart,
	type IRootState,
	type ISessionActiveClient,
	type ISessionModelInfo,
	type ISessionState,
	type ISessionSummary,
	type ISnapshot,
	type IToolAnnotations,
	type IToolCallCancelledState,
	type IToolCallCompletedState,
	type IToolCallPendingConfirmationState,
	type IToolCallPendingResultConfirmationState,
	type IToolCallResult,
	type IToolCallRunningState,
	type IToolCallState,
	type IToolCallStreamingState,
	type IToolDefinition,
	type IToolResultBinaryContent,
	type IToolResultContent,
	type IToolResultFileEditContent,
	type IToolResultTextContent,
	type ITurn,
	type IUsageInfo,
	type IUserMessage,
	type StringOrMarkdown,
	type URI,
	AttachmentType,
	PolicyState,
	PermissionKind,
	ResponsePartKind,
	SessionLifecycle,
	SessionStatus,
	ToolCallConfirmationReason,
	ToolCallCancellationReason,
	ToolCallStatus,
	ToolResultContentType,
	TurnState,
} from './protocol/state.js';

// ---- Well-known URIs --------------------------------------------------------

/** URI for the root state subscription. */
export const ROOT_STATE_URI = 'agenthost:/root';

// ---- VS Code-specific derived types -----------------------------------------

/**
 * A tool call in a terminal state, stored in completed turns.
 */
export type ICompletedToolCall = IToolCallCompletedState | IToolCallCancelledState;

/**
 * Derived status type for the tool call lifecycle.
 */
export type ToolCallStatusString = IToolCallState['status'];

// ---- Tool output helper -----------------------------------------------------

/**
 * Extracts a plain-text tool output string from a tool call result's `content`
 * array. Joins all text-type content parts into a single string.
 *
 * Returns `undefined` if there are no text content parts.
 */
export function getToolOutputText(result: IToolCallResult): string | undefined {
	if (!result.content || result.content.length === 0) {
		return undefined;
	}
	const textParts: IToolResultTextContent[] = [];
	for (const c of result.content) {
		if (hasKey(c, { type: true }) && c.type === ToolResultContentType.Text) {
			textParts.push(c);
		}
	}
	if (textParts.length === 0) {
		return undefined;
	}
	return textParts.map(p => p.text).join('\n');
}

/**
 * Extracts file edit content entries from a tool call result's `content` array.
 * Returns an empty array if there are no file edit content parts.
 */
export function getToolFileEdits(result: IToolCallResult): IToolResultFileEditContent[] {
	if (!result.content || result.content.length === 0) {
		return [];
	}
	const edits: IToolResultFileEditContent[] = [];
	for (const c of result.content) {
		if (hasKey(c, { type: true }) && c.type === ToolResultContentType.FileEdit) {
			edits.push(c);
		}
	}
	return edits;
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
