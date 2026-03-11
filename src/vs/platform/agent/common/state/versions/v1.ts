/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Protocol version 1 wire types — the current tip.
// See ../AGENTS.md for modification instructions.
//
// While this is the tip (PROTOCOL_VERSION === 1), you may add optional
// fields freely. When PROTOCOL_VERSION is bumped, this file freezes and
// a new tip is created. Delete when MIN_PROTOCOL_VERSION passes 1.

import type { URI } from '../../../../../base/common/uri.js';
import type { AgentProvider } from '../../agentService.js';

// ---- State types (wire format) ----------------------------------------------

export interface IV1_RootState {
	readonly agents: readonly IV1_AgentInfo[];
}

export interface IV1_AgentInfo {
	readonly provider: AgentProvider;
	readonly displayName: string;
	readonly description: string;
	readonly models: readonly IV1_SessionModelInfo[];
}

export interface IV1_SessionModelInfo {
	readonly id: string;
	readonly provider: AgentProvider;
	readonly name: string;
	readonly maxContextWindow?: number;
	readonly supportsVision?: boolean;
	readonly policyState?: 'enabled' | 'disabled' | 'unconfigured';
}

export interface IV1_SessionSummary {
	readonly resource: URI;
	readonly provider: AgentProvider;
	readonly title: string;
	readonly status: 'idle' | 'in-progress' | 'error';
	readonly createdAt: number;
	readonly modifiedAt: number;
	readonly model?: string;
}

export interface IV1_SessionState {
	readonly summary: IV1_SessionSummary;
	readonly lifecycle: 'creating' | 'ready' | 'creationFailed';
	readonly creationError?: IV1_ErrorInfo;
	readonly turns: readonly IV1_Turn[];
	readonly activeTurn: IV1_ActiveTurn | undefined;
}

export interface IV1_UserMessage {
	readonly text: string;
	readonly attachments?: readonly IV1_MessageAttachment[];
}

export interface IV1_MessageAttachment {
	readonly type: 'file' | 'directory' | 'selection';
	readonly path: string;
	readonly displayName?: string;
}

export interface IV1_Turn {
	readonly id: string;
	readonly userMessage: IV1_UserMessage;
	readonly responseText: string;
	readonly responseParts: readonly IV1_ResponsePart[];
	readonly toolCalls: readonly IV1_CompletedToolCall[];
	readonly usage: IV1_UsageInfo | undefined;
	readonly state: 'complete' | 'cancelled' | 'error';
	readonly error?: IV1_ErrorInfo;
}

export interface IV1_ActiveTurn {
	readonly id: string;
	readonly userMessage: IV1_UserMessage;
	readonly streamingText: string;
	readonly responseParts: readonly IV1_ResponsePart[];
	readonly toolCalls: ReadonlyMap<string, IV1_ToolCallState>;
	readonly pendingPermissions: ReadonlyMap<string, IV1_PermissionRequest>;
	readonly reasoning: string;
	readonly usage: IV1_UsageInfo | undefined;
}

export interface IV1_MarkdownResponsePart {
	readonly kind: 'markdown';
	readonly content: string;
}

export interface IV1_ContentRef {
	readonly kind: 'contentRef';
	readonly uri: string;
	readonly sizeHint?: number;
	readonly mimeType?: string;
}

export type IV1_ResponsePart = IV1_MarkdownResponsePart | IV1_ContentRef;

export interface IV1_ToolCallState {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly displayName: string;
	readonly invocationMessage: string;
	readonly toolInput?: string;
	readonly toolKind?: 'terminal';
	readonly language?: string;
	readonly toolArguments?: string;
	readonly status: 'running' | 'pending-permission' | 'completed' | 'failed' | 'cancelled';
	readonly parameters?: unknown;
	readonly confirmed?: 'not-needed' | 'user-action' | 'setting' | 'denied' | 'skipped';
	readonly pastTenseMessage?: string;
	readonly toolOutput?: string;
	readonly error?: { readonly message: string; readonly code?: string };
	readonly cancellationReason?: 'denied' | 'skipped';
}

export interface IV1_CompletedToolCall {
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

export interface IV1_PermissionRequest {
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

export interface IV1_UsageInfo {
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly model?: string;
	readonly cacheReadTokens?: number;
}

export interface IV1_ErrorInfo {
	readonly errorType: string;
	readonly message: string;
	readonly stack?: string;
}

// ---- Action types (wire format) ---------------------------------------------

interface IV1_SessionActionBase {
	readonly session: URI;
}

export interface IV1_AgentsChangedAction {
	readonly type: 'root/agentsChanged';
	readonly agents: readonly IV1_AgentInfo[];
}

export interface IV1_SessionReadyAction extends IV1_SessionActionBase {
	readonly type: 'session/ready';
}

export interface IV1_SessionCreationFailedAction extends IV1_SessionActionBase {
	readonly type: 'session/creationFailed';
	readonly error: IV1_ErrorInfo;
}

export interface IV1_TurnStartedAction extends IV1_SessionActionBase {
	readonly type: 'session/turnStarted';
	readonly turnId: string;
	readonly userMessage: IV1_UserMessage;
}

export interface IV1_DeltaAction extends IV1_SessionActionBase {
	readonly type: 'session/delta';
	readonly turnId: string;
	readonly content: string;
}

export interface IV1_ResponsePartAction extends IV1_SessionActionBase {
	readonly type: 'session/responsePart';
	readonly turnId: string;
	readonly part: IV1_ResponsePart;
}

export interface IV1_ToolStartAction extends IV1_SessionActionBase {
	readonly type: 'session/toolStart';
	readonly turnId: string;
	readonly toolCall: IV1_ToolCallState;
}

export interface IV1_ToolCompleteAction extends IV1_SessionActionBase {
	readonly type: 'session/toolComplete';
	readonly turnId: string;
	readonly toolCallId: string;
	readonly result: IV1_ToolCompleteResult;
}

export interface IV1_ToolCompleteResult {
	readonly success: boolean;
	readonly pastTenseMessage: string;
	readonly toolOutput?: string;
	readonly error?: { readonly message: string; readonly code?: string };
}

export interface IV1_PermissionRequestAction extends IV1_SessionActionBase {
	readonly type: 'session/permissionRequest';
	readonly turnId: string;
	readonly request: IV1_PermissionRequest;
}

export interface IV1_PermissionResolvedAction extends IV1_SessionActionBase {
	readonly type: 'session/permissionResolved';
	readonly turnId: string;
	readonly requestId: string;
	readonly approved: boolean;
}

export interface IV1_TurnCompleteAction extends IV1_SessionActionBase {
	readonly type: 'session/turnComplete';
	readonly turnId: string;
}

export interface IV1_TurnCancelledAction extends IV1_SessionActionBase {
	readonly type: 'session/turnCancelled';
	readonly turnId: string;
}

export interface IV1_SessionErrorAction extends IV1_SessionActionBase {
	readonly type: 'session/error';
	readonly turnId: string;
	readonly error: IV1_ErrorInfo;
}

export interface IV1_TitleChangedAction extends IV1_SessionActionBase {
	readonly type: 'session/titleChanged';
	readonly title: string;
}

export interface IV1_UsageAction extends IV1_SessionActionBase {
	readonly type: 'session/usage';
	readonly turnId: string;
	readonly usage: IV1_UsageInfo;
}

export interface IV1_ReasoningAction extends IV1_SessionActionBase {
	readonly type: 'session/reasoning';
	readonly turnId: string;
	readonly content: string;
}

export interface IV1_ModelChangedAction extends IV1_SessionActionBase {
	readonly type: 'session/modelChanged';
	readonly model: string;
}

export type IV1_RootAction =
	| IV1_AgentsChangedAction;

export type IV1_SessionAction =
	| IV1_SessionReadyAction
	| IV1_SessionCreationFailedAction
	| IV1_TurnStartedAction
	| IV1_DeltaAction
	| IV1_ResponsePartAction
	| IV1_ToolStartAction
	| IV1_ToolCompleteAction
	| IV1_PermissionRequestAction
	| IV1_PermissionResolvedAction
	| IV1_TurnCompleteAction
	| IV1_TurnCancelledAction
	| IV1_SessionErrorAction
	| IV1_TitleChangedAction
	| IV1_UsageAction
	| IV1_ReasoningAction
	| IV1_ModelChangedAction;

export type IV1_StateAction = IV1_RootAction | IV1_SessionAction;

// ---- Notification types (wire format) ---------------------------------------

export interface IV1_SessionAddedNotification {
	readonly type: 'notify/sessionAdded';
	readonly summary: IV1_SessionSummary;
}

export interface IV1_SessionRemovedNotification {
	readonly type: 'notify/sessionRemoved';
	readonly session: URI;
}

export type IV1_Notification =
	| IV1_SessionAddedNotification
	| IV1_SessionRemovedNotification;

/** All action type strings known to v1. */
export type IV1_ActionType = IV1_StateAction['type'];
