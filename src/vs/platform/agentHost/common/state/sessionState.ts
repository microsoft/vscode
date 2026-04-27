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
	ToolResultFileEditContent,
	type ActiveTurn,
	type RootState,
	type SessionState,
	type SessionSummary,
	type ToolCallCancelledState,
	type ToolCallCompletedState,
	type ToolCallResult,
	type ToolCallState,
	type ToolResultContent,
	type ToolResultSubagentContent,
	type ToolResultTextContent,
	type UserMessage,
	TerminalState,
} from './protocol/state.js';

// Re-export everything from the protocol state module
export {
	type ActiveTurn,
	type AgentInfo,
	type ConfigPropertySchema,
	type ConfigSchema,
	type ContentRef,
	type ErrorInfo,
	type ProjectInfo,
	type MarkdownResponsePart,
	type MessageAttachment,
	type ReasoningResponsePart,
	type ResponsePart,
	type RootState,
	type SessionActiveClient,
	type SessionConfigState,
	type FileEdit as ISessionFileDiff,
	type ModelSelection,
	type SessionModelInfo,
	type SessionState,
	type SessionSummary,
	type Snapshot,
	type TerminalState,
	type ToolAnnotations,
	type ToolCallCancelledState,
	type ToolCallCompletedState,
	type ToolCallPendingConfirmationState,
	type ToolCallPendingResultConfirmationState,
	type ToolCallResponsePart,
	type ToolCallResult,
	type ToolCallRunningState,
	type ToolCallState,
	type ToolCallStreamingState,
	type ToolDefinition,
	type CustomizationRef,
	type SessionCustomization,
	type ToolResultEmbeddedResourceContent as IToolResultBinaryContent,
	type ToolResultContent,
	type ToolResultFileEditContent,
	type ToolResultSubagentContent,
	type ToolResultTextContent,
	type Turn,
	type UsageInfo,
	type UserMessage,
	type PendingMessage,
	type StringOrMarkdown,
	type URI,
	type SessionInputRequest,
	type SessionInputQuestion,
	type SessionInputAnswer,
	type SessionInputOption,
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
 * `before`/`after` in {@link ToolResultFileEditContent}.
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
export type ICompletedToolCall = ToolCallCompletedState | ToolCallCancelledState;

/**
 * Derived status type for the tool call lifecycle.
 */
export type ToolCallStatusString = ToolCallState['status'];

// ---- Tool output helper -----------------------------------------------------

/**
 * Extracts a plain-text tool output string from a tool call result's `content`
 * array. Joins all text-type content parts into a single string.
 *
 * Returns `undefined` if there are no text content parts.
 */
export function getToolOutputText(result: ToolCallResult): string | undefined {
	if (!result.content || result.content.length === 0) {
		return undefined;
	}
	const textParts: ToolResultTextContent[] = [];
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
export function getToolFileEdits(result: ToolCallResult): ToolResultFileEditContent[] {
	if (!result.content || result.content.length === 0) {
		return [];
	}
	const edits: ToolResultFileEditContent[] = [];
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
export function getToolSubagentContent(result: { content?: readonly ToolResultContent[] }): ToolResultSubagentContent | undefined {
	if (!result.content || result.content.length === 0) {
		return undefined;
	}
	for (const c of result.content) {
		if (hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent) {
			return c as ToolResultSubagentContent;
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

export function createRootState(): RootState {
	return {
		agents: [],
		activeSessions: 0,
	};
}

export function createSessionState(summary: SessionSummary): SessionState {
	return {
		summary,
		lifecycle: SessionLifecycle.Creating,
		turns: [],
		activeTurn: undefined,
	};
}

export function createActiveTurn(id: string, userMessage: UserMessage): ActiveTurn {
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
	[StateComponents.Root]: RootState;
	[StateComponents.Session]: SessionState;
	[StateComponents.Terminal]: TerminalState;
};

// ---- SessionMeta accessors -------------------------------------------------

/**
 * VS Code-side alias for the protocol's open `_meta` property bag on
 * {@link SessionState}. Keys SHOULD be namespaced (e.g. `git`, `vscode.foo`)
 * to avoid collisions; values MUST be JSON-serializable.
 */
export type SessionMeta = Record<string, unknown>;

/**
 * Reserved key under {@link SessionMeta} for the well-known git-state
 * payload. Value at this key, when present, MUST be shaped like
 * {@link ISessionGitState}. This is a VS Code-specific convention layered
 * on top of the protocol's generic `_meta` bag — the protocol itself does
 * not know about git state.
 */
export const SESSION_META_GIT_KEY = 'git';

/**
 * Git state of a session's working directory, carried under
 * {@link SessionMeta} at {@link SESSION_META_GIT_KEY}. Used by clients to
 * drive source-control affordances (e.g. PR/merge buttons in the Agents
 * app).
 *
 * All fields are optional — agents that do not track a particular field
 * should omit it rather than send a placeholder, so clients can distinguish
 * "unknown" from "known to be zero".
 */
export interface ISessionGitState {
	/** Whether the working directory has a `github.com` git remote. */
	readonly hasGitHubRemote?: boolean;
	/** Current branch name. */
	readonly branchName?: string;
	/** Base branch the work targets (e.g. `main`). */
	readonly baseBranchName?: string;
	/** Upstream tracking branch (e.g. `origin/feature`). */
	readonly upstreamBranchName?: string;
	/** Number of commits the upstream branch has ahead of the local branch. */
	readonly incomingChanges?: number;
	/** Number of commits the local branch has ahead of the upstream branch. */
	readonly outgoingChanges?: number;
	/** Number of files with uncommitted changes. */
	readonly uncommittedChanges?: number;
}

/**
 * Reads the well-known git-state payload from {@link SessionMeta}, if
 * present. Returns `undefined` when the meta bag is absent or the value at
 * the git key is not a plain object (e.g. an array or a primitive).
 * Individual fields with wrong types are silently dropped so partial state
 * still propagates.
 */
export function readSessionGitState(meta: SessionMeta | undefined): ISessionGitState | undefined {
	const value = meta?.[SESSION_META_GIT_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const result: {
		hasGitHubRemote?: boolean;
		branchName?: string;
		baseBranchName?: string;
		upstreamBranchName?: string;
		incomingChanges?: number;
		outgoingChanges?: number;
		uncommittedChanges?: number;
	} = {};
	if (typeof raw['hasGitHubRemote'] === 'boolean') { result.hasGitHubRemote = raw['hasGitHubRemote']; }
	if (typeof raw['branchName'] === 'string') { result.branchName = raw['branchName']; }
	if (typeof raw['baseBranchName'] === 'string') { result.baseBranchName = raw['baseBranchName']; }
	if (typeof raw['upstreamBranchName'] === 'string') { result.upstreamBranchName = raw['upstreamBranchName']; }
	if (typeof raw['incomingChanges'] === 'number') { result.incomingChanges = raw['incomingChanges']; }
	if (typeof raw['outgoingChanges'] === 'number') { result.outgoingChanges = raw['outgoingChanges']; }
	if (typeof raw['uncommittedChanges'] === 'number') { result.uncommittedChanges = raw['uncommittedChanges']; }
	return result;
}

/**
 * Returns a new {@link SessionMeta} with the git-state payload set to
 * `gitState`, or with the git slot removed if `gitState` is `undefined`.
 * Returns `undefined` if the result would be empty.
 */
export function withSessionGitState(meta: SessionMeta | undefined, gitState: ISessionGitState | undefined): SessionMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (gitState !== undefined) {
		next[SESSION_META_GIT_KEY] = gitState;
	} else {
		delete next[SESSION_META_GIT_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}
