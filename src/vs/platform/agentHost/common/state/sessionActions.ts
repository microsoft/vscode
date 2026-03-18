/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Action and notification types for the sessions process protocol.
// Re-exports from the auto-generated protocol layer with local aliases.
//
// VS Code-specific additions:
//   - IToolCallStartAction extends protocol with `toolKind` and `language`
//   - isRootAction / isSessionAction type guards
//   - INotification alias for IProtocolNotification

// ---- Re-exports from protocol -----------------------------------------------

export {
	ActionType,
	type IActionEnvelope,
	type IActionOrigin,
	type IRootAgentsChangedAction,
	type IRootActiveSessionsChangedAction,
	type ISessionCreationFailedAction,
	type ISessionDeltaAction,
	type ISessionErrorAction,
	type ISessionModelChangedAction,
	type ISessionReadyAction,
	type ISessionReasoningAction,
	type ISessionResponsePartAction,
	type ISessionPermissionRequestAction,
	type ISessionPermissionResolvedAction,
	type ISessionToolCallCompleteAction,
	type ISessionToolCallConfirmedAction,
	type ISessionToolCallApprovedAction,
	type ISessionToolCallDeniedAction,
	type ISessionToolCallDeltaAction,
	type ISessionToolCallReadyAction,
	type ISessionToolCallResultConfirmedAction,
	type ISessionToolCallStartAction,
	type ISessionTitleChangedAction,
	type ISessionTurnCancelledAction,
	type ISessionTurnCompleteAction,
	type ISessionTurnStartedAction,
	type ISessionUsageAction,
	type ISessionServerToolsChangedAction,
	type ISessionActiveClientChangedAction,
	type ISessionActiveClientToolsChangedAction,
	type IStateAction,
} from './protocol/actions.js';

export {
	NotificationType,
	type ISessionAddedNotification,
	type ISessionRemovedNotification,
} from './protocol/notifications.js';

// ---- Local aliases for short names ------------------------------------------
// Consumers use these shorter names; they're type-only aliases.

import type {
	IActionEnvelope as _IActionEnvelope,
	IRootAgentsChangedAction,
	IRootActiveSessionsChangedAction,
	ISessionCreationFailedAction,
	ISessionDeltaAction,
	ISessionErrorAction,
	ISessionModelChangedAction,
	ISessionReadyAction,
	ISessionReasoningAction,
	ISessionResponsePartAction,
	ISessionPermissionRequestAction,
	ISessionPermissionResolvedAction,
	ISessionToolCallCompleteAction,
	ISessionToolCallConfirmedAction,
	ISessionToolCallDeltaAction,
	ISessionToolCallReadyAction,
	ISessionToolCallResultConfirmedAction,
	ISessionToolCallStartAction,
	ISessionTitleChangedAction,
	ISessionTurnCancelledAction,
	ISessionTurnCompleteAction,
	ISessionTurnStartedAction,
	ISessionUsageAction,
	ISessionServerToolsChangedAction,
	ISessionActiveClientChangedAction,
	ISessionActiveClientToolsChangedAction,
	IStateAction,
} from './protocol/actions.js';

import type { IProtocolNotification } from './protocol/notifications.js';

// Root actions
export type IAgentsChangedAction = IRootAgentsChangedAction;
export type IActiveSessionsChangedAction = IRootActiveSessionsChangedAction;
export type IRootAction = IAgentsChangedAction | IActiveSessionsChangedAction;

// Session actions — short aliases
export type ITurnStartedAction = ISessionTurnStartedAction;
export type IDeltaAction = ISessionDeltaAction;
export type IResponsePartAction = ISessionResponsePartAction;
export type IToolCallStartAction = ISessionToolCallStartAction;
export type IToolCallDeltaAction = ISessionToolCallDeltaAction;
export type IToolCallReadyAction = ISessionToolCallReadyAction;
export type IToolCallApprovedAction = import('./protocol/actions.js').ISessionToolCallApprovedAction;
export type IToolCallDeniedAction = import('./protocol/actions.js').ISessionToolCallDeniedAction;
export type IToolCallConfirmedAction = ISessionToolCallConfirmedAction;
export type IToolCallCompleteAction = ISessionToolCallCompleteAction;
export type IToolCallResultConfirmedAction = ISessionToolCallResultConfirmedAction;
export type IPermissionRequestAction = ISessionPermissionRequestAction;
export type IPermissionResolvedAction = ISessionPermissionResolvedAction;
export type ITurnCompleteAction = ISessionTurnCompleteAction;
export type ITurnCancelledAction = ISessionTurnCancelledAction;
export type ITitleChangedAction = ISessionTitleChangedAction;
export type IUsageAction = ISessionUsageAction;
export type IReasoningAction = ISessionReasoningAction;
export type IModelChangedAction = ISessionModelChangedAction;

/** Union of all session-scoped actions. */
export type ISessionAction =
	| ISessionReadyAction
	| ISessionCreationFailedAction
	| ISessionTurnStartedAction
	| ISessionDeltaAction
	| ISessionResponsePartAction
	| ISessionToolCallStartAction
	| ISessionToolCallDeltaAction
	| ISessionToolCallReadyAction
	| ISessionToolCallConfirmedAction
	| ISessionToolCallCompleteAction
	| ISessionToolCallResultConfirmedAction
	| ISessionPermissionRequestAction
	| ISessionPermissionResolvedAction
	| ISessionTurnCompleteAction
	| ISessionTurnCancelledAction
	| ISessionErrorAction
	| ISessionTitleChangedAction
	| ISessionUsageAction
	| ISessionReasoningAction
	| ISessionModelChangedAction
	| ISessionServerToolsChangedAction
	| ISessionActiveClientChangedAction
	| ISessionActiveClientToolsChangedAction;

// Notifications
export type INotification = IProtocolNotification;

// ---- Type guards ------------------------------------------------------------

export function isRootAction(action: IStateAction): action is IRootAction {
	return action.type.startsWith('root/');
}

export function isSessionAction(action: IStateAction): action is ISessionAction {
	return action.type.startsWith('session/');
}
