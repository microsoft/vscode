/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Action and notification types for the sessions process protocol.
// See protocol.md -> Actions for the full design.
//
// Actions mutate subscribable state via reducers. Notifications are ephemeral
// broadcasts not stored in state. Both flow through ActionEnvelopes.
//
// Asymmetry: not all actions can be triggered by clients. Root actions are
// server-only. Session actions are mixed — see the "Client-sendable?" column
// in protocol.md for the authoritative list.

import { URI } from '../../../../base/common/uri.js';
import type {
	IAgentInfo,
	IErrorInfo,
	IPermissionRequest,
	IResponsePart,
	ISessionSummary,
	IToolCallState,
	IUsageInfo,
	IUserMessage,
} from './sessionState.js';

// ---- Action envelope --------------------------------------------------------

/**
 * Wraps every action with server-assigned sequencing and origin tracking.
 * This enables write-ahead reconciliation: the client can tell whether an
 * incoming action was its own (echo) or from another source (rebase needed).
 */
export interface IActionEnvelope<A extends IStateAction = IStateAction> {
	/** The action payload. */
	readonly action: A;
	/** Monotonically increasing sequence number assigned by the server. */
	readonly serverSeq: number;
	/**
	 * Origin tracking. `undefined` means the action was produced by the server
	 * itself (e.g. from an agent backend). Otherwise identifies the client that
	 * sent the command which triggered this action.
	 */
	readonly origin: IActionOrigin | undefined;
	/**
	 * Set to `true` when the server rejected the command that produced this
	 * action. The client should revert its optimistic prediction.
	 */
	readonly rejected?: true;
}

export interface IActionOrigin {
	readonly clientId: string;
	readonly clientSeq: number;
}

// ---- Root actions (server-only, mutate RootState) ---------------------------

export interface IAgentsChangedAction {
	readonly type: 'root/agentsChanged';
	readonly agents: readonly IAgentInfo[];
}

export type IRootAction =
	| IAgentsChangedAction;

// ---- Session actions (mutate SessionState, scoped to a session URI) ---------

interface ISessionActionBase {
	/** URI identifying the session this action applies to. */
	readonly session: URI;
}

// -- Lifecycle (server-only) --

export interface ISessionReadyAction extends ISessionActionBase {
	readonly type: 'session/ready';
}

export interface ISessionCreationFailedAction extends ISessionActionBase {
	readonly type: 'session/creationFailed';
	readonly error: IErrorInfo;
}

// -- Turn lifecycle --

/** Client-dispatchable. Server starts agent processing on receipt. */
export interface ITurnStartedAction extends ISessionActionBase {
	readonly type: 'session/turnStarted';
	readonly turnId: string;
	readonly userMessage: IUserMessage;
}

/** Server-only. */
export interface IDeltaAction extends ISessionActionBase {
	readonly type: 'session/delta';
	readonly turnId: string;
	readonly content: string;
}

/** Server-only. */
export interface IResponsePartAction extends ISessionActionBase {
	readonly type: 'session/responsePart';
	readonly turnId: string;
	readonly part: IResponsePart;
}

// -- Tool calls (server-only) --

export interface IToolStartAction extends ISessionActionBase {
	readonly type: 'session/toolStart';
	readonly turnId: string;
	readonly toolCall: IToolCallState;
}

export interface IToolCompleteAction extends ISessionActionBase {
	readonly type: 'session/toolComplete';
	readonly turnId: string;
	readonly toolCallId: string;
	readonly result: IToolCompleteResult;
}

/** The data delivered with a tool completion event. */
export interface IToolCompleteResult {
	readonly success: boolean;
	readonly pastTenseMessage: string;
	readonly toolOutput?: string;
	readonly error?: { readonly message: string; readonly code?: string };
}

// -- Permissions --

/** Server-only. */
export interface IPermissionRequestAction extends ISessionActionBase {
	readonly type: 'session/permissionRequest';
	readonly turnId: string;
	readonly request: IPermissionRequest;
}

/** Client-dispatchable. Server unblocks pending tool execution. */
export interface IPermissionResolvedAction extends ISessionActionBase {
	readonly type: 'session/permissionResolved';
	readonly turnId: string;
	readonly requestId: string;
	readonly approved: boolean;
}

// -- Turn completion --

/** Server-only. */
export interface ITurnCompleteAction extends ISessionActionBase {
	readonly type: 'session/turnComplete';
	readonly turnId: string;
}

/** Client-dispatchable. Server aborts in-progress processing. */
export interface ITurnCancelledAction extends ISessionActionBase {
	readonly type: 'session/turnCancelled';
	readonly turnId: string;
}

/** Server-only. */
export interface ISessionErrorAction extends ISessionActionBase {
	readonly type: 'session/error';
	readonly turnId: string;
	readonly error: IErrorInfo;
}

// -- Metadata & informational --

/** Server-only. */
export interface ITitleChangedAction extends ISessionActionBase {
	readonly type: 'session/titleChanged';
	readonly title: string;
}

/** Server-only. */
export interface IUsageAction extends ISessionActionBase {
	readonly type: 'session/usage';
	readonly turnId: string;
	readonly usage: IUsageInfo;
}

/** Server-only. */
export interface IReasoningAction extends ISessionActionBase {
	readonly type: 'session/reasoning';
	readonly turnId: string;
	readonly content: string;
}

/** Server-only. Dispatched when the session's model is changed. */
export interface IModelChangedAction extends ISessionActionBase {
	readonly type: 'session/modelChanged';
	readonly model: string;
}

export type ISessionAction =
	| ISessionReadyAction
	| ISessionCreationFailedAction
	| ITurnStartedAction
	| IDeltaAction
	| IResponsePartAction
	| IToolStartAction
	| IToolCompleteAction
	| IPermissionRequestAction
	| IPermissionResolvedAction
	| ITurnCompleteAction
	| ITurnCancelledAction
	| ISessionErrorAction
	| ITitleChangedAction
	| IUsageAction
	| IReasoningAction
	| IModelChangedAction;

// ---- Combined state action type ---------------------------------------------

/** Any action that mutates subscribable state (processed by a reducer). */
export type IStateAction = IRootAction | ISessionAction;

// ---- Notifications (ephemeral, not stored in state) -------------------------

/**
 * Broadcast to all connected clients when a session is created.
 * Not processed by reducers — used by clients to maintain a local session list.
 */
export interface ISessionAddedNotification {
	readonly type: 'notify/sessionAdded';
	readonly summary: ISessionSummary;
}

/**
 * Broadcast to all connected clients when a session is disposed.
 * Not processed by reducers — used by clients to maintain a local session list.
 */
export interface ISessionRemovedNotification {
	readonly type: 'notify/sessionRemoved';
	readonly session: URI;
}

export type INotification =
	| ISessionAddedNotification
	| ISessionRemovedNotification;

// ---- Type guards ------------------------------------------------------------

export function isRootAction(action: IStateAction): action is IRootAction {
	return action.type.startsWith('root/');
}

export function isSessionAction(action: IStateAction): action is ISessionAction {
	return action.type.startsWith('session/');
}
