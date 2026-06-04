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
	type SessionAgentChangedAction,
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
	type ChangesetStatusChangedAction,
	type ChangesetFileSetAction,
	type ChangesetFileRemovedAction,
	type ChangesetOperationsChangedAction,
	type ChangesetClearedAction,
	type ResourceWatchChangedAction,
	type StateAction,
} from './protocol/actions.js';

export {
	AuthRequiredReason,
	type SessionAddedParams,
	type SessionRemovedParams,
	type SessionSummaryChangedParams,
	type AuthRequiredParams,
} from './protocol/notifications.js';

/**
 * String discriminants for the protocol notification methods that previously
 * lived inside a `notification` wrapper. These values are the JSON-RPC method
 * names sent over the wire by a channels-era server; they are also the `type`
 * discriminant on {@link ProtocolNotification} variants.
 */
export const NotificationType = {
	SessionAdded: 'root/sessionAdded',
	SessionRemoved: 'root/sessionRemoved',
	SessionSummaryChanged: 'root/sessionSummaryChanged',
	AuthRequired: 'auth/required',
} as const;
export type NotificationType = typeof NotificationType[keyof typeof NotificationType];

// ---- Local aliases for short names ------------------------------------------
// Consumers use these shorter names; they're type-only aliases.

import type {
	RootAgentsChangedAction,
	RootActiveSessionsChangedAction,
	SessionDeltaAction,
	SessionModelChangedAction,
	SessionAgentChangedAction,
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
	RootConfigChangedAction,
} from './protocol/actions.js';

import type { SessionAddedParams, SessionRemovedParams, SessionSummaryChangedParams, AuthRequiredParams } from './protocol/notifications.js';
import type { RootAction as IRootAction_, SessionAction as ISessionAction_, ClientSessionAction as IClientSessionAction_, ServerSessionAction as IServerSessionAction_, TerminalAction as ITerminalAction_, ClientTerminalAction as IClientTerminalAction_, ChangesetAction as IChangesetAction_ } from './protocol/action-origin.generated.js';

/**
 * Discriminated union of all server→client protocol notifications other than
 * the action envelope. Each variant carries its protocol `method` so callers
 * can switch on `type` the same way they did against the old `NotificationType`
 * enum.
 */
export type ProtocolNotification =
	| ({ type: 'root/sessionAdded' } & SessionAddedParams)
	| ({ type: 'root/sessionRemoved' } & SessionRemovedParams)
	| ({ type: 'root/sessionSummaryChanged' } & SessionSummaryChangedParams)
	| ({ type: 'auth/required' } & AuthRequiredParams);

export type RootAction = IRootAction_;
export type SessionAction = ISessionAction_;
export type ClientSessionAction = IClientSessionAction_;
export type ServerSessionAction = IServerSessionAction_;
export type TerminalAction = ITerminalAction_;
export type ClientTerminalAction = IClientTerminalAction_;
export type ChangesetAction = IChangesetAction_;

// Root actions
export type IAgentsChangedAction = RootAgentsChangedAction;
export type IActiveSessionsChangedAction = RootActiveSessionsChangedAction;
export type IRootConfigChangedAction = RootConfigChangedAction;

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
export type IAgentChangedAction = SessionAgentChangedAction;
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

export function isChangesetAction(action: StateAction): action is ChangesetAction {
	return action.type.startsWith('changeset/');
}
