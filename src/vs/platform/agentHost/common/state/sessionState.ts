/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Immutable state types for the sessions process protocol.
// See protocol.md for the full design rationale.
//
// These types represent the server-authoritative state tree. Both the server
// and clients use the same types — clients hold a local copy that they keep
// in sync via actions from the server.

import { URI } from '../../../../base/common/uri.js';
import type { AgentProvider } from '../agentService.js';

// ---- Well-known URIs --------------------------------------------------------

/** URI for the root state subscription. */
export const ROOT_STATE_URI = URI.from({ scheme: 'agenthost', path: '/root' });

// ---- Lightweight session metadata -------------------------------------------

export const enum SessionStatus {
	Idle = 'idle',
	InProgress = 'in-progress',
	Error = 'error',
}

/**
 * Lightweight session summary used in the session list and as embedded
 * metadata within a subscribed session. Identified by a URI.
 */
export interface ISessionSummary {
	readonly resource: URI;
	readonly provider: AgentProvider;
	readonly title: string;
	readonly status: SessionStatus;
	readonly createdAt: number;
	readonly modifiedAt: number;
	readonly model?: string;
}

// ---- Model info -------------------------------------------------------------

export interface ISessionModelInfo {
	readonly id: string;
	readonly provider: AgentProvider;
	readonly name: string;
	readonly maxContextWindow?: number;
	readonly supportsVision?: boolean;
	readonly policyState?: 'enabled' | 'disabled' | 'unconfigured';
}

// ---- Root state (subscribable at ROOT_STATE_URI) ----------------------------

/**
 * Global state shared with every client subscribed to {@link ROOT_STATE_URI}.
 * Does **not** contain the session list — that is fetched imperatively via
 * `listSessions()` RPC. See protocol.md -> Session list.
 */
export interface IRootState {
	readonly agents: readonly IAgentInfo[];
	readonly activeSessions: number;
}

export interface IAgentInfo {
	readonly provider: AgentProvider;
	readonly displayName: string;
	readonly description: string;
	readonly models: readonly ISessionModelInfo[];
}

// ---- Session lifecycle ------------------------------------------------------

export const enum SessionLifecycle {
	/** The server is asynchronously initializing the agent backend. */
	Creating = 'creating',
	/** The session is ready for use. */
	Ready = 'ready',
	/** Backend initialization failed. See {@link ISessionState.creationError}. */
	CreationFailed = 'creationFailed',
}

// ---- Per-session state (subscribable at session URI) ------------------------

/**
 * Full state for a single session, loaded when a client subscribes to
 * the session's URI.
 */
export interface ISessionState {
	readonly summary: ISessionSummary;
	readonly lifecycle: SessionLifecycle;
	readonly creationError?: IErrorInfo;
	readonly turns: readonly ITurn[];
	readonly activeTurn: IActiveTurn | undefined;
}

// ---- Turn types -------------------------------------------------------------

export interface IUserMessage {
	readonly text: string;
	readonly attachments?: readonly IMessageAttachment[];
}

export interface IMessageAttachment {
	readonly type: 'file' | 'directory' | 'selection';
	readonly path: string;
	readonly displayName?: string;
}

/**
 * A completed request/response cycle.
 */
export interface ITurn {
	readonly id: string;
	readonly userMessage: IUserMessage;
	/** The final assistant response text (captured from streamingText on turn completion). */
	readonly responseText: string;
	readonly responseParts: readonly IResponsePart[];
	/** Tool invocations in terminal states (completed or cancelled). */
	readonly toolCalls: readonly (IToolCallCompletedState | IToolCallCancelledState)[];
	readonly usage: IUsageInfo | undefined;
	readonly state: TurnState;
	/** Error info if the turn ended with {@link TurnState.Error}. */
	readonly error?: IErrorInfo;
}

export const enum TurnState {
	Complete = 'complete',
	Cancelled = 'cancelled',
	Error = 'error',
}

/**
 * An in-progress turn — the assistant is actively streaming a response.
 */
export interface IActiveTurn {
	readonly id: string;
	readonly userMessage: IUserMessage;
	readonly streamingText: string;
	readonly responseParts: readonly IResponsePart[];
	readonly toolCalls: Readonly<Record<string, IToolCallState>>;
	readonly pendingPermissions: Readonly<Record<string, IPermissionRequest>>;
	readonly reasoning: string;
	readonly usage: IUsageInfo | undefined;
}

// ---- Response parts ---------------------------------------------------------

export const enum ResponsePartKind {
	Markdown = 'markdown',
	ContentRef = 'contentRef',
}

export interface IMarkdownResponsePart {
	readonly kind: ResponsePartKind.Markdown;
	readonly content: string;
}

/**
 * A reference to large content stored outside the state tree.
 * The client fetches the content separately via fetchContent().
 */
export interface IContentRef {
	readonly kind: ResponsePartKind.ContentRef;
	readonly uri: string;
	readonly sizeHint?: number;
	readonly mimeType?: string;
}

export type IResponsePart = IMarkdownResponsePart | IContentRef;

// ---- String/Markdown helper -------------------------------------------------

/**
 * A string that may optionally be rendered as Markdown.
 * Mirrors the protocol's `StringOrMarkdown` type.
 */
export type StringOrMarkdown = string | { readonly markdown: string };

// ---- Tool calls -------------------------------------------------------------

/**
 * How a tool call was confirmed for execution.
 */
export type ToolCallConfirmationReason = 'not-needed' | 'user-action' | 'setting';

/**
 * Metadata common to all tool call states.
 */
interface IToolCallBase {
	readonly toolCallId: string;
	/** Internal tool name (for debugging/logging). */
	readonly toolName: string;
	/** Human-readable tool name. */
	readonly displayName: string;
	/** Hint for the renderer about how to display this tool (e.g., 'terminal' for shell commands). */
	readonly toolKind?: 'terminal';
	/** Language identifier for syntax highlighting. Used with toolKind 'terminal'. */
	readonly language?: string;
}

/**
 * Properties available once tool call parameters are fully received.
 */
interface IToolCallParameterFields {
	/** Message describing what the tool will do. */
	readonly invocationMessage: StringOrMarkdown;
	/** A representative input string for display (e.g., the shell command). */
	readonly toolInput?: string;
}

/**
 * Tool execution result details, available after execution completes.
 */
export interface IToolCallResult {
	readonly success: boolean;
	readonly pastTenseMessage: StringOrMarkdown;
	readonly toolOutput?: string;
	readonly error?: { readonly message: string; readonly code?: string };
}

/** LM is streaming the tool call parameters. */
export interface IToolCallStreamingState extends IToolCallBase {
	readonly status: 'streaming';
	/** Partial parameters accumulated so far. */
	readonly partialInput?: string;
	/** Progress message shown while parameters are streaming. */
	readonly invocationMessage?: StringOrMarkdown;
}

/** Parameters are complete, waiting for client to confirm execution. */
export interface IToolCallPendingConfirmationState extends IToolCallBase, IToolCallParameterFields {
	readonly status: 'pending-confirmation';
}

/** Tool is actively executing. */
export interface IToolCallRunningState extends IToolCallBase, IToolCallParameterFields {
	readonly status: 'running';
	readonly confirmed: ToolCallConfirmationReason;
}

/** Tool finished executing, waiting for client to approve the result. */
export interface IToolCallPendingResultConfirmationState extends IToolCallBase, IToolCallParameterFields, IToolCallResult {
	readonly status: 'pending-result-confirmation';
	readonly confirmed: ToolCallConfirmationReason;
}

/** Tool completed successfully or with an error. */
export interface IToolCallCompletedState extends IToolCallBase, IToolCallParameterFields, IToolCallResult {
	readonly status: 'completed';
	readonly confirmed: ToolCallConfirmationReason;
}

/** Tool call was cancelled (denied, skipped, or result-denied). */
export interface IToolCallCancelledState extends IToolCallBase, IToolCallParameterFields {
	readonly status: 'cancelled';
	readonly reason: 'denied' | 'skipped' | 'result-denied';
	readonly reasonMessage?: StringOrMarkdown;
	readonly userSuggestion?: IUserMessage;
}

/**
 * Discriminated union of all tool call lifecycle states.
 * Modeled after {@link IChatToolInvocation.State} to enable direct mapping to the chat UI.
 */
export type IToolCallState =
	| IToolCallStreamingState
	| IToolCallPendingConfirmationState
	| IToolCallRunningState
	| IToolCallPendingResultConfirmationState
	| IToolCallCompletedState
	| IToolCallCancelledState;

/**
 * Derived status type for the tool call lifecycle.
 */
export type ToolCallStatus = IToolCallState['status'];

/**
 * A tool call in a terminal state, stored in completed turns.
 */
export type ICompletedToolCall = IToolCallCompletedState | IToolCallCancelledState;

// ---- Permission requests ----------------------------------------------------

export interface IPermissionRequest {
	readonly requestId: string;
	readonly permissionKind: 'shell' | 'write' | 'mcp' | 'read' | 'url';
	readonly toolCallId?: string;
	readonly path?: string;
	readonly fullCommandText?: string;
	readonly intention?: string;
	readonly serverName?: string;
	readonly toolName?: string;
	readonly rawRequest?: string;
}

// ---- Usage info -------------------------------------------------------------

export interface IUsageInfo {
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly model?: string;
	readonly cacheReadTokens?: number;
}

// ---- Error info -------------------------------------------------------------

export interface IErrorInfo {
	readonly errorType: string;
	readonly message: string;
	readonly stack?: string;
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
