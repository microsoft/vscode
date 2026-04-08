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
	type ISessionCustomizationsChangedAction,
	type ISessionCustomizationToggledAction,
	type ISessionPendingMessageSetAction,
	type ISessionPendingMessageRemovedAction,
	type ISessionQueuedMessagesReorderedAction,
	type ISessionIsReadChangedAction,
	type ISessionIsDoneChangedAction,
	type IStateAction,
} from './protocol/actions.js';

export {
	NotificationType,
	AuthRequiredReason,
	type ISessionAddedNotification,
	type ISessionRemovedNotification,
	type IAuthRequiredNotification,
} from './protocol/notifications.js';

// ---- Local aliases for short names ------------------------------------------
// Consumers use these shorter names; they're type-only aliases.

import type {
	IRootAgentsChangedAction,
	IRootActiveSessionsChangedAction,
	ISessionDeltaAction,
	ISessionModelChangedAction,
	ISessionReasoningAction,
	ISessionResponsePartAction,
	ISessionToolCallApprovedAction,
	ISessionToolCallCompleteAction,
	ISessionToolCallConfirmedAction,
	ISessionToolCallDeniedAction,
	ISessionToolCallDeltaAction,
	ISessionToolCallReadyAction,
	ISessionToolCallResultConfirmedAction,
	ISessionToolCallStartAction,
	ISessionTitleChangedAction,
	ISessionTurnCancelledAction,
	ISessionTurnCompleteAction,
	ISessionTurnStartedAction,
	ISessionUsageAction,
	IStateAction,
	ISessionPendingMessageSetAction,
	ISessionPendingMessageRemovedAction,
	ISessionQueuedMessagesReorderedAction,
	ISessionIsReadChangedAction,
	ISessionIsDoneChangedAction,
} from './protocol/actions.js';

import type { IProtocolNotification } from './protocol/notifications.js';
import type { IRootAction as IRootAction_, ISessionAction as ISessionAction_, IClientSessionAction as IClientSessionAction_, IServerSessionAction as IServerSessionAction_, ITerminalAction as ITerminalAction_, IClientTerminalAction as IClientTerminalAction_ } from './protocol/action-origin.generated.js';

export type IRootAction = IRootAction_;
export type ISessionAction = ISessionAction_;
export type IClientSessionAction = IClientSessionAction_;
export type IServerSessionAction = IServerSessionAction_;
export type ITerminalAction = ITerminalAction_;
export type IClientTerminalAction = IClientTerminalAction_;

// Root actions
export type IAgentsChangedAction = IRootAgentsChangedAction;
export type IActiveSessionsChangedAction = IRootActiveSessionsChangedAction;

// Session actions — short aliases
export type ITurnStartedAction = ISessionTurnStartedAction;
export type IDeltaAction = ISessionDeltaAction;
export type IResponsePartAction = ISessionResponsePartAction;
export type IToolCallStartAction = ISessionToolCallStartAction;
export type IToolCallDeltaAction = ISessionToolCallDeltaAction;
export type IToolCallReadyAction = ISessionToolCallReadyAction;
export type IToolCallApprovedAction = ISessionToolCallApprovedAction;
export type IToolCallDeniedAction = ISessionToolCallDeniedAction;
export type IToolCallConfirmedAction = ISessionToolCallConfirmedAction;
export type IToolCallCompleteAction = ISessionToolCallCompleteAction;
export type IToolCallResultConfirmedAction = ISessionToolCallResultConfirmedAction;
export type ITurnCompleteAction = ISessionTurnCompleteAction;
export type ITurnCancelledAction = ISessionTurnCancelledAction;
export type ITitleChangedAction = ISessionTitleChangedAction;
export type IUsageAction = ISessionUsageAction;
export type IReasoningAction = ISessionReasoningAction;
export type IModelChangedAction = ISessionModelChangedAction;
export type ICustomizationsChangedAction = import('./protocol/actions.js').ISessionCustomizationsChangedAction;
export type ICustomizationToggledAction = import('./protocol/actions.js').ISessionCustomizationToggledAction;

export type IPendingMessageSetAction = ISessionPendingMessageSetAction;
export type IPendingMessageRemovedAction = ISessionPendingMessageRemovedAction;
export type IQueuedMessagesReorderedAction = ISessionQueuedMessagesReorderedAction;
export type IIsReadChangedAction = ISessionIsReadChangedAction;
export type IIsDoneChangedAction = ISessionIsDoneChangedAction;

// Notifications
export type INotification = IProtocolNotification;

// ---- Type guards ------------------------------------------------------------

export function isRootAction(action: IStateAction): action is IRootAction {
	return action.type.startsWith('root/');
}

export function isSessionAction(action: IStateAction): action is ISessionAction {
	return action.type.startsWith('session/');
}

export function isTerminalAction(action: IStateAction): action is ITerminalAction {
	return action.type.startsWith('terminal/');
}
