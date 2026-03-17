/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Version registry: compile-time compatibility checks + runtime action filtering.
// See ../AGENTS.md for modification instructions.

import type {
	IAgentsChangedAction,
	IDeltaAction,
	IModelChangedAction,
	INotification,
	IPermissionRequestAction,
	IPermissionResolvedAction,
	IReasoningAction,
	IResponsePartAction,
	IRootAction,
	ISessionAction,
	ISessionCreationFailedAction,
	ISessionErrorAction,
	ISessionReadyAction,
	IStateAction,
	ITitleChangedAction,
	IToolCompleteAction,
	IToolStartAction,
	ITurnCancelledAction,
	ITurnCompleteAction,
	ITurnStartedAction,
	IUsageAction,
} from '../sessionActions.js';
import type {
	IActiveTurn,
	IAgentInfo,
	ICompletedToolCall,
	IContentRef,
	IErrorInfo,
	IMarkdownResponsePart,
	IMessageAttachment,
	IPermissionRequest,
	IRootState,
	ISessionModelInfo,
	ISessionState,
	ISessionSummary,
	IToolCallState,
	ITurn,
	IUsageInfo,
	IUserMessage,
} from '../sessionState.js';

import type {
	IV1_ActiveTurn,
	IV1_AgentInfo,
	IV1_AgentsChangedAction,
	IV1_CompletedToolCall,
	IV1_ContentRef,
	IV1_DeltaAction,
	IV1_ErrorInfo,
	IV1_MarkdownResponsePart,
	IV1_MessageAttachment,
	IV1_ModelChangedAction,
	IV1_PermissionRequest,
	IV1_PermissionRequestAction,
	IV1_PermissionResolvedAction,
	IV1_ReasoningAction,
	IV1_ResponsePartAction,
	IV1_RootState,
	IV1_SessionCreationFailedAction,
	IV1_SessionErrorAction,
	IV1_SessionModelInfo,
	IV1_SessionReadyAction,
	IV1_SessionState,
	IV1_SessionSummary,
	IV1_TitleChangedAction,
	IV1_ToolCallState,
	IV1_ToolCompleteAction,
	IV1_ToolStartAction,
	IV1_Turn,
	IV1_TurnCancelledAction,
	IV1_TurnCompleteAction,
	IV1_TurnStartedAction,
	IV1_UsageAction,
	IV1_UsageInfo,
	IV1_UserMessage,
} from './v1.js';

// ---- Protocol version constants ---------------------------------------------

/**
 * Current protocol version. This is the version that NEW code speaks.
 * Increment when adding new action types or changing behavior.
 *
 * Version history:
 *   1 — Initial: root state, session lifecycle, streaming, tools, permissions
 */
export const PROTOCOL_VERSION = 1;

/**
 * Minimum protocol version we maintain backward compatibility with.
 * Raise this to drop old compat code: delete the version file,
 * remove its checks below, and the compiler shows what's now dead.
 */
export const MIN_PROTOCOL_VERSION = 1;

// ---- Compile-time compatibility checks --------------------------------------
//
// AssertCompatible<Frozen, Current> requires BIDIRECTIONAL assignability:
//   - Current extends Frozen: can't remove fields or change field types
//   - Frozen extends Current: can't add required fields
//
// The only allowed change is adding optional fields to the living type.
// If either direction fails, you get a compile error at the check site.

type AssertCompatible<Frozen, Current extends Frozen> = Frozen extends Current ? true : never;

// -- v1 state compatibility --

type _v1_RootState = AssertCompatible<IV1_RootState, IRootState>;
type _v1_AgentInfo = AssertCompatible<IV1_AgentInfo, IAgentInfo>;
type _v1_SessionModelInfo = AssertCompatible<IV1_SessionModelInfo, ISessionModelInfo>;
type _v1_SessionSummary = AssertCompatible<IV1_SessionSummary, ISessionSummary>;
type _v1_SessionState = AssertCompatible<IV1_SessionState, ISessionState>;
type _v1_UserMessage = AssertCompatible<IV1_UserMessage, IUserMessage>;
type _v1_MessageAttachment = AssertCompatible<IV1_MessageAttachment, IMessageAttachment>;
type _v1_Turn = AssertCompatible<IV1_Turn, ITurn>;
type _v1_ActiveTurn = AssertCompatible<IV1_ActiveTurn, IActiveTurn>;
type _v1_MarkdownResponsePart = AssertCompatible<IV1_MarkdownResponsePart, IMarkdownResponsePart>;
type _v1_ContentRef = AssertCompatible<IV1_ContentRef, IContentRef>;
type _v1_ToolCallState = AssertCompatible<IV1_ToolCallState, IToolCallState>;
type _v1_CompletedToolCall = AssertCompatible<IV1_CompletedToolCall, ICompletedToolCall>;
type _v1_PermissionRequest = AssertCompatible<IV1_PermissionRequest, IPermissionRequest>;
type _v1_UsageInfo = AssertCompatible<IV1_UsageInfo, IUsageInfo>;
type _v1_ErrorInfo = AssertCompatible<IV1_ErrorInfo, IErrorInfo>;

// -- v1 action compatibility --

type _v1_AgentsChanged = AssertCompatible<IV1_AgentsChangedAction, IAgentsChangedAction>;
type _v1_SessionReady = AssertCompatible<IV1_SessionReadyAction, ISessionReadyAction>;
type _v1_CreationFailed = AssertCompatible<IV1_SessionCreationFailedAction, ISessionCreationFailedAction>;
type _v1_TurnStarted = AssertCompatible<IV1_TurnStartedAction, ITurnStartedAction>;
type _v1_Delta = AssertCompatible<IV1_DeltaAction, IDeltaAction>;
type _v1_ResponsePart = AssertCompatible<IV1_ResponsePartAction, IResponsePartAction>;
type _v1_ToolStart = AssertCompatible<IV1_ToolStartAction, IToolStartAction>;
type _v1_ToolComplete = AssertCompatible<IV1_ToolCompleteAction, IToolCompleteAction>;
type _v1_PermissionRequestAction = AssertCompatible<IV1_PermissionRequestAction, IPermissionRequestAction>;
type _v1_PermissionResolved = AssertCompatible<IV1_PermissionResolvedAction, IPermissionResolvedAction>;
type _v1_TurnComplete = AssertCompatible<IV1_TurnCompleteAction, ITurnCompleteAction>;
type _v1_TurnCancelled = AssertCompatible<IV1_TurnCancelledAction, ITurnCancelledAction>;
type _v1_SessionError = AssertCompatible<IV1_SessionErrorAction, ISessionErrorAction>;
type _v1_TitleChanged = AssertCompatible<IV1_TitleChangedAction, ITitleChangedAction>;
type _v1_Usage = AssertCompatible<IV1_UsageAction, IUsageAction>;
type _v1_Reasoning = AssertCompatible<IV1_ReasoningAction, IReasoningAction>;
type _v1_ModelChanged = AssertCompatible<IV1_ModelChangedAction, IModelChangedAction>;

// Suppress unused-variable warnings for compile-time-only checks.
void (0 as unknown as
	_v1_RootState & _v1_AgentInfo & _v1_SessionModelInfo & _v1_SessionSummary &
	_v1_SessionState & _v1_UserMessage & _v1_MessageAttachment & _v1_Turn &
	_v1_ActiveTurn & _v1_MarkdownResponsePart & _v1_ContentRef &
	_v1_ToolCallState & _v1_CompletedToolCall & _v1_PermissionRequest &
	_v1_UsageInfo & _v1_ErrorInfo &
	_v1_AgentsChanged & _v1_SessionReady & _v1_CreationFailed &
	_v1_TurnStarted & _v1_Delta & _v1_ResponsePart & _v1_ToolStart &
	_v1_ToolComplete & _v1_PermissionRequestAction & _v1_PermissionResolved &
	_v1_TurnComplete & _v1_TurnCancelled & _v1_SessionError & _v1_TitleChanged &
	_v1_Usage & _v1_Reasoning & _v1_ModelChanged
);

// ---- Runtime action → version map -------------------------------------------
//
// The index signature [K in IStateAction['type']] forces TypeScript to require
// an entry for every action type in the union. If you add a new action type
// to ISessionAction or IRootAction but forget to register it here, you get
// a compile error.
//
// The value is the protocol version that introduced that action type.

/** Maps every action type string to the protocol version that introduced it. */
export const ACTION_INTRODUCED_IN: { readonly [K in IStateAction['type']]: number } = {
	// Root actions (v1)
	'root/agentsChanged': 1,
	// Session lifecycle (v1)
	'session/ready': 1,
	'session/creationFailed': 1,
	// Turn lifecycle (v1)
	'session/turnStarted': 1,
	'session/delta': 1,
	'session/responsePart': 1,
	// Tool calls (v1)
	'session/toolStart': 1,
	'session/toolComplete': 1,
	// Permissions (v1)
	'session/permissionRequest': 1,
	'session/permissionResolved': 1,
	// Turn completion (v1)
	'session/turnComplete': 1,
	'session/turnCancelled': 1,
	'session/error': 1,
	// Metadata & informational (v1)
	'session/titleChanged': 1,
	'session/usage': 1,
	'session/reasoning': 1,
	'session/modelChanged': 1,
};

/** Maps every notification type string to the protocol version that introduced it. */
export const NOTIFICATION_INTRODUCED_IN: { readonly [K in INotification['type']]: number } = {
	'notify/sessionAdded': 1,
	'notify/sessionRemoved': 1,
};

// ---- Runtime filtering helpers ----------------------------------------------

/**
 * Returns `true` if the given action type is known to a client at `clientVersion`.
 * The server uses this to avoid sending actions that the client can't process.
 */
export function isActionKnownToVersion(action: IStateAction, clientVersion: number): boolean {
	return ACTION_INTRODUCED_IN[action.type] <= clientVersion;
}

/**
 * Returns `true` if the given notification type is known to a client at `clientVersion`.
 */
export function isNotificationKnownToVersion(notification: INotification, clientVersion: number): boolean {
	return NOTIFICATION_INTRODUCED_IN[notification.type] <= clientVersion;
}

// ---- Version-grouped action types -------------------------------------------
//
// Each version defines the set of action types it introduced. The cumulative
// union for a version is built by combining all versions up to that point.
// When you add a new protocol version, define its additions and extend the map.

/** Action types introduced in v1. */
type IRootAction_v1 = IV1_AgentsChangedAction;
type ISessionAction_v1 = IV1_SessionReadyAction | IV1_SessionCreationFailedAction
	| IV1_TurnStartedAction | IV1_DeltaAction | IV1_ResponsePartAction
	| IV1_ToolStartAction | IV1_ToolCompleteAction
	| IV1_PermissionRequestAction | IV1_PermissionResolvedAction
	| IV1_TurnCompleteAction | IV1_TurnCancelledAction | IV1_SessionErrorAction
	| IV1_TitleChangedAction | IV1_UsageAction | IV1_ReasoningAction
	| IV1_ModelChangedAction;

/**
 * Maps protocol versions to their cumulative action type unions.
 * Used to type-check that existing version unions remain stable.
 */
export interface IVersionedActionMap {
	1: { root: IRootAction_v1; session: ISessionAction_v1 };
}

// Ensure the living union is a superset of every versioned union.
// If you remove an action type from the living union that a version
// still references, this fails to compile.
type _rootSuperset = IRootAction_v1 extends IRootAction ? true : never;
type _sessionSuperset = ISessionAction_v1 extends ISessionAction ? true : never;

void (0 as unknown as _rootSuperset & _sessionSuperset);
