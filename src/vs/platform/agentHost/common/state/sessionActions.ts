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
//   - INotification alias for ProtocolNotification

// ---- Re-exports from protocol -----------------------------------------------

export {
	ActionType,
	type ActionEnvelope,
	type ActionOrigin,
	type RootAgentsChangedAction,
	type RootActiveSessionsChangedAction,
	type SessionCreationFailedAction,
	type SessionDeltaAction,
	type SessionDiffsChangedAction,
	type SessionErrorAction,
	type SessionModelChangedAction,
	type SessionReadyAction,
	type SessionReasoningAction,
	type SessionResponsePartAction,
	type SessionToolCallCompleteAction,
	type SessionToolCallConfirmedAction,
	type SessionToolCallApprovedAction,
	type SessionToolCallDeniedAction,
	type SessionToolCallDeltaAction,
	type SessionToolCallReadyAction,
	type SessionToolCallResultConfirmedAction,
	type SessionToolCallStartAction,
	type SessionTitleChangedAction,
	type SessionTurnCancelledAction,
	type SessionTurnCompleteAction,
	type SessionTurnStartedAction,
	type SessionUsageAction,
	type SessionServerToolsChangedAction,
	type SessionActiveClientChangedAction,
	type SessionActiveClientToolsChangedAction,
	type SessionCustomizationsChangedAction,
	type SessionCustomizationToggledAction,
	type SessionPendingMessageSetAction,
	type SessionPendingMessageRemovedAction,
	type SessionQueuedMessagesReorderedAction,
	type SessionInputRequestedAction,
	type SessionInputCompletedAction,
	type SessionIsReadChangedAction,
	type SessionIsArchivedChangedAction,
	type SessionToolCallContentChangedAction,
	type StateAction,
} from './protocol/actions.js';

export {
	NotificationType,
	AuthRequiredReason,
	type SessionAddedNotification,
	type SessionRemovedNotification,
	type AuthRequiredNotification,
} from './protocol/notifications.js';

// ---- Local aliases for short names ------------------------------------------
// Consumers use these shorter names; they're type-only aliases.

import type {
	RootAgentsChangedAction,
	RootActiveSessionsChangedAction,
	SessionDeltaAction,
	SessionModelChangedAction,
	SessionReasoningAction,
	SessionResponsePartAction,
	SessionToolCallApprovedAction,
	SessionToolCallCompleteAction,
	SessionToolCallConfirmedAction,
	SessionToolCallDeniedAction,
	SessionToolCallDeltaAction,
	SessionToolCallReadyAction,
	SessionToolCallResultConfirmedAction,
	SessionToolCallStartAction,
	SessionTitleChangedAction,
	SessionTurnCancelledAction,
	SessionTurnCompleteAction,
	SessionTurnStartedAction,
	SessionUsageAction,
	StateAction,
	SessionPendingMessageSetAction,
	SessionPendingMessageRemovedAction,
	SessionQueuedMessagesReorderedAction,
	SessionIsReadChangedAction,
	SessionIsArchivedChangedAction,
} from './protocol/actions.js';

import type { ProtocolNotification } from './protocol/notifications.js';
import type { RootAction as IRootAction_, SessionAction as ISessionAction_, ClientSessionAction as IClientSessionAction_, ServerSessionAction as IServerSessionAction_, TerminalAction as ITerminalAction_, ClientTerminalAction as IClientTerminalAction_ } from './protocol/action-origin.generated.js';

export type RootAction = IRootAction_;
export type SessionAction = ISessionAction_;
export type ClientSessionAction = IClientSessionAction_;
export type ServerSessionAction = IServerSessionAction_;
export type TerminalAction = ITerminalAction_;
export type ClientTerminalAction = IClientTerminalAction_;

// Root actions
export type IAgentsChangedAction = RootAgentsChangedAction;
export type IActiveSessionsChangedAction = RootActiveSessionsChangedAction;

// Session actions — short aliases
export type ITurnStartedAction = SessionTurnStartedAction;
export type IDeltaAction = SessionDeltaAction;
export type IResponsePartAction = SessionResponsePartAction;
export type IToolCallStartAction = SessionToolCallStartAction;
export type IToolCallDeltaAction = SessionToolCallDeltaAction;
export type IToolCallReadyAction = SessionToolCallReadyAction;
export type IToolCallApprovedAction = SessionToolCallApprovedAction;
export type IToolCallDeniedAction = SessionToolCallDeniedAction;
export type IToolCallConfirmedAction = SessionToolCallConfirmedAction;
export type IToolCallCompleteAction = SessionToolCallCompleteAction;
export type IToolCallResultConfirmedAction = SessionToolCallResultConfirmedAction;
export type ITurnCompleteAction = SessionTurnCompleteAction;
export type ITurnCancelledAction = SessionTurnCancelledAction;
export type ITitleChangedAction = SessionTitleChangedAction;
export type IUsageAction = SessionUsageAction;
export type IReasoningAction = SessionReasoningAction;
export type IModelChangedAction = SessionModelChangedAction;
export type ICustomizationsChangedAction = import('./protocol/actions.js').SessionCustomizationsChangedAction;
export type ICustomizationToggledAction = import('./protocol/actions.js').SessionCustomizationToggledAction;

export type IPendingMessageSetAction = SessionPendingMessageSetAction;
export type IPendingMessageRemovedAction = SessionPendingMessageRemovedAction;
export type IQueuedMessagesReorderedAction = SessionQueuedMessagesReorderedAction;
export type IIsReadChangedAction = SessionIsReadChangedAction;
export type IIsArchivedChangedAction = SessionIsArchivedChangedAction;

// Notifications
export type INotification = ProtocolNotification;

// ---- Type guards ------------------------------------------------------------

export function isRootAction(action: StateAction): action is RootAction {
	return action.type.startsWith('root/');
}

export function isSessionAction(action: StateAction): action is SessionAction {
	return action.type.startsWith('session/');
}

export function isTerminalAction(action: StateAction): action is TerminalAction {
	return action.type.startsWith('terminal/');
}
