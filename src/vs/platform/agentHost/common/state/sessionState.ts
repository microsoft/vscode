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
	readonly toolCalls: readonly ICompletedToolCall[];
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
	readonly toolCalls: ReadonlyMap<string, IToolCallState>;
	readonly pendingPermissions: ReadonlyMap<string, IPermissionRequest>;
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

// ---- Tool calls -------------------------------------------------------------

export const enum ToolCallStatus {
	/** Tool is actively executing. */
	Running = 'running',
	/** Waiting for user to approve before execution. */
	PendingPermission = 'pending-permission',
	/** Tool finished successfully. */
	Completed = 'completed',
	/** Tool failed with an error. */
	Failed = 'failed',
	/** Tool was denied or skipped by the user. */
	Cancelled = 'cancelled',
}

/**
 * Represents the full lifecycle state of a tool invocation within an active turn.
 * Modeled after {@link IChatToolInvocation.State} to enable direct mapping to the chat UI.
 */
export interface IToolCallState {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly displayName: string;
	readonly invocationMessage: string;
	readonly toolInput?: string;
	readonly toolKind?: 'terminal';
	readonly language?: string;
	readonly toolArguments?: string;
	readonly status: ToolCallStatus;
	/** Parsed tool parameters (from toolArguments). */
	readonly parameters?: unknown;
	/** How the tool was confirmed before execution (set after PendingPermission → Running). */
	readonly confirmed?: 'not-needed' | 'user-action' | 'setting' | 'denied' | 'skipped';
	/** Set when status transitions to Completed or Failed. */
	readonly pastTenseMessage?: string;
	/** Set when status transitions to Completed or Failed. */
	readonly toolOutput?: string;
	/** Set when status transitions to Failed. */
	readonly error?: { readonly message: string; readonly code?: string };
	/** Why the tool was cancelled (set when status is Cancelled). */
	readonly cancellationReason?: 'denied' | 'skipped';
}

export interface ICompletedToolCall {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly displayName: string;
	readonly invocationMessage: string;
	readonly success: boolean;
	readonly pastTenseMessage: string;
	readonly toolInput?: string;
	readonly toolKind?: 'terminal';
	readonly language?: string;
	readonly toolOutput?: string;
	readonly error?: { readonly message: string; readonly code?: string };
}

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
		toolCalls: new Map(),
		pendingPermissions: new Map(),
		reasoning: '',
		usage: undefined,
	};
}
