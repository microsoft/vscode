/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-exports all protocol state types from the synced protocol/ directory
// and adds a few VS Code-specific helpers (ROOT_STATE_URI, factory functions,
// ICompletedToolCall alias, toolOutput helper).

import { URI } from '../../../../base/common/uri.js';
import type {
	ISessionSummary,
	ISessionState,
	IToolCallCompletedState,
	IToolCallCancelledState,
	IToolCallResult,
	IToolResultTextContent,
	IUserMessage,
	IActiveTurn,
	IRootState,
} from './protocol/state.js';
import { SessionLifecycle, ToolResultContentType } from './protocol/state.js';

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
		if ('type' in block && block.type === ToolResultContentType.Text) {
			texts.push((block as IToolResultTextContent).text);
		}
	}
	return texts.length > 0 ? texts.join('\n') : undefined;
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
