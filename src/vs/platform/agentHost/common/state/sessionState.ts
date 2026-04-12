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
	type IToolResultContent,
	type IToolResultSubagentContent,
	type IToolResultTextContent,
	type IUserMessage,
	ITerminalState,
} from './protocol/state.js';

// Re-export everything from the protocol state module
export {
	type IActiveTurn,
	type IAgentInfo,
	type IContentRef,
	type IErrorInfo,
	type IProjectInfo,
	type IMarkdownResponsePart,
	type IMessageAttachment,
	type IReasoningResponsePart,
	type IResponsePart,
	type IRootState,
	type ISessionActiveClient,
	type ISessionFileDiff,
	type ISessionModelInfo,
	type ISessionState,
	type ISessionSummary,
	type ISnapshot,
	type ITerminalState,
	type IToolAnnotations,
	type IToolCallCancelledState,
	type IToolCallCompletedState,
	type IToolCallPendingConfirmationState,
	type IToolCallPendingResultConfirmationState,
	type IToolCallResponsePart,
	type IToolCallResult,
	type IToolCallRunningState,
	type IToolCallState,
	type IToolCallStreamingState,
	type IToolDefinition,
	type ICustomizationRef,
	type ISessionCustomization,
	type IToolResultEmbeddedResourceContent as IToolResultBinaryContent,
	type IToolResultContent,
	type IToolResultFileEditContent,
	type IToolResultSubagentContent,
	type IToolResultTextContent,
	type ITurn,
	type IUsageInfo,
	type IUserMessage,
	type IPendingMessage,
	type StringOrMarkdown,
	type URI,
	type ISessionInputRequest,
	type ISessionInputQuestion,
	type ISessionInputAnswer,
	type ISessionInputOption,
	AttachmentType,
	CustomizationStatus,
	PendingMessageKind,
	PolicyState,
	ResponsePartKind,
	SessionInputAnswerState,
	SessionInputAnswerValueKind,
	SessionInputQuestionKind,
	SessionInputResponseKind,
	SessionLifecycle,
	SessionStatus,
	ToolCallConfirmationReason,
	ToolCallCancellationReason,
	ToolCallStatus,
	ToolResultContentType,
	TurnState,
} from './protocol/state.js';

// ---- File edit kind ---------------------------------------------------------

/**
 * The kind of file edit operation. Derived from the presence/absence of
 * `before`/`after` in {@link IToolResultFileEditContent}.
 */
export const enum FileEditKind {
	/** Content edit (same file URI, different content). */
	Edit = 'edit',
	/** File creation (no before state). */
	Create = 'create',
	/** File deletion (no after state). */
	Delete = 'delete',
	/** File rename/move (different before and after URIs). */
	Rename = 'rename',
}

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

/**
 * Extracts the first subagent content entry from a tool call's `content` array.
 * Works with both completed tool call results and running tool call states.
 * Returns `undefined` if there are no subagent content parts.
 */
export function getToolSubagentContent(result: { content?: readonly IToolResultContent[] }): IToolResultSubagentContent | undefined {
	if (!result.content || result.content.length === 0) {
		return undefined;
	}
	for (const c of result.content) {
		if (hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent) {
			return c as IToolResultSubagentContent;
		}
	}
	return undefined;
}

// ---- Subagent URI helpers ---------------------------------------------------

/**
 * Builds a subagent session URI from a parent session URI and tool call ID.
 * Convention: `{parentSessionUri}/subagent/{toolCallId}`
 */
export function buildSubagentSessionUri(parentSession: string, toolCallId: string): string {
	// Normalize: strip trailing slash from parent to avoid double-slash in URI
	const parent = parentSession.endsWith('/') ? parentSession.slice(0, -1) : parentSession;
	return `${parent}/subagent/${toolCallId}`;
}

/**
 * Parses a subagent session URI into its parent session URI and tool call ID.
 * Returns `undefined` if the URI does not follow the subagent convention.
 */
export function parseSubagentSessionUri(uri: string): { parentSession: string; toolCallId: string } | undefined {
	const idx = uri.lastIndexOf('/subagent/');
	if (idx < 0) {
		return undefined;
	}
	const toolCallId = uri.substring(idx + '/subagent/'.length);
	if (!toolCallId) {
		return undefined;
	}
	return {
		parentSession: uri.substring(0, idx),
		toolCallId,
	};
}

/**
 * Returns whether a session URI represents a subagent session.
 */
export function isSubagentSession(uri: string): boolean {
	return uri.includes('/subagent/');
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
		responseParts: [],
		usage: undefined,
	};
}

export const enum StateComponents {
	Root,
	Session,
	Terminal,
}

export type ComponentToState = {
	[StateComponents.Root]: IRootState;
	[StateComponents.Session]: ISessionState;
	[StateComponents.Terminal]: ITerminalState;
};
