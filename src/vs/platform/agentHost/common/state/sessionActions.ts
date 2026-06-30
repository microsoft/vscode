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
	type SessionChatAddedAction,
	type SessionChatRemovedAction,
	type SessionChatUpdatedAction,
	type SessionDefaultChatChangedAction,
	type ChatDeltaAction,
	type ChatErrorAction,
	type SessionReadyAction,
	type ChatReasoningAction,
	type ChatResponsePartAction,
	type ChatToolCallCompleteAction,
	type ChatToolCallConfirmedAction,
	type ChatToolCallApprovedAction,
	type ChatToolCallDeniedAction,
	type ChatToolCallDeltaAction,
	type ChatToolCallReadyAction,
	type ChatToolCallResultConfirmedAction,
	type ChatToolCallStartAction,
	type SessionTitleChangedAction,
	type ChatTurnCancelledAction,
	type ChatTurnCompleteAction,
	type ChatTurnStartedAction,
	type ChatUsageAction,
	type SessionServerToolsChangedAction,
	type SessionActiveClientSetAction,
	type SessionActiveClientRemovedAction,
	type SessionCustomizationsChangedAction,
	type SessionCustomizationToggledAction,
	type ChatPendingMessageSetAction,
	type ChatPendingMessageRemovedAction,
	type ChatQueuedMessagesReorderedAction,
	type ChatInputRequestedAction,
	type ChatInputCompletedAction,
	type ChatInputAnswerChangedAction,
	type SessionIsReadChangedAction,
	type SessionIsArchivedChangedAction,
	type ChatToolCallContentChangedAction,
	type ChatTruncatedAction,
	type ChangesetStatusChangedAction,
	type ChangesetFileSetAction,
	type ChangesetFileRemovedAction,
	type ChangesetContentChangedAction,
	type ChangesetOperationsChangedAction,
	type ChangesetClearedAction,
	type AnnotationsSetAction,
	type AnnotationsUpdatedAction,
	type AnnotationsRemovedAction,
	type AnnotationsEntrySetAction,
	type AnnotationsEntryRemovedAction,
	type ResourceWatchChangedAction,
	type StateAction,
} from './protocol/actions.js';

export {
	AuthRequiredReason,
	type SessionAddedParams,
	type SessionRemovedParams,
	type SessionSummaryChangedParams,
	type ProgressParams,
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
	Progress: 'root/progress',
	AuthRequired: 'auth/required',
} as const;
export type NotificationType = typeof NotificationType[keyof typeof NotificationType];

// ---- Local aliases for short names ------------------------------------------
// Consumers use these shorter names; they're type-only aliases.

import type {
	RootAgentsChangedAction,
	RootActiveSessionsChangedAction,
	ChatDeltaAction,
	ChatReasoningAction,
	ChatResponsePartAction,
	ChatToolCallApprovedAction,
	ChatToolCallCompleteAction,
	ChatToolCallConfirmedAction,
	ChatToolCallDeniedAction,
	ChatToolCallDeltaAction,
	ChatToolCallReadyAction,
	ChatToolCallResultConfirmedAction,
	ChatToolCallStartAction,
	SessionTitleChangedAction,
	ChatTurnCancelledAction,
	ChatTurnCompleteAction,
	ChatTurnStartedAction,
	ChatErrorAction,
	ChatUsageAction,
	ChatToolCallContentChangedAction,
	StateAction,
	ChatPendingMessageSetAction,
	ChatPendingMessageRemovedAction,
	ChatQueuedMessagesReorderedAction,
	SessionIsReadChangedAction,
	SessionIsArchivedChangedAction,
	RootConfigChangedAction,
} from './protocol/actions.js';

import type { SessionAddedParams, SessionRemovedParams, SessionSummaryChangedParams, ProgressParams, AuthRequiredParams } from './protocol/notifications.js';
import type { RootAction as IRootAction_, SessionAction as ISessionAction_, ChatAction as IChatAction_, ClientSessionAction as IClientSessionAction_, ServerSessionAction as IServerSessionAction_, ClientChatAction as IClientChatAction_, ServerChatAction as IServerChatAction_, TerminalAction as ITerminalAction_, ClientTerminalAction as IClientTerminalAction_, ChangesetAction as IChangesetAction_, AnnotationsAction as IAnnotationsAction_, ClientAnnotationsAction as IClientAnnotationsAction_ } from './protocol/action-origin.generated.js';

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
	| ({ type: 'root/progress' } & ProgressParams)
	| ({ type: 'auth/required' } & AuthRequiredParams);

export type RootAction = IRootAction_;
export type SessionAction = ISessionAction_;
export type ChatAction = IChatAction_;
export type ClientSessionAction = IClientSessionAction_;
export type ServerSessionAction = IServerSessionAction_;
export type ClientChatAction = IClientChatAction_;
export type ServerChatAction = IServerChatAction_;
export type TerminalAction = ITerminalAction_;
export type ClientTerminalAction = IClientTerminalAction_;
export type ChangesetAction = IChangesetAction_;
export type AnnotationsAction = IAnnotationsAction_;
export type ClientAnnotationsAction = IClientAnnotationsAction_;

// Root actions
export type IAgentsChangedAction = RootAgentsChangedAction;
export type IActiveSessionsChangedAction = RootActiveSessionsChangedAction;
export type IRootConfigChangedAction = RootConfigChangedAction;

// Chat/turn actions — short aliases (turns now live on the chat channel)
export type ITurnStartedAction = ChatTurnStartedAction;
export type IDeltaAction = ChatDeltaAction;
export type IResponsePartAction = ChatResponsePartAction;
export type IToolCallStartAction = ChatToolCallStartAction;
export type IToolCallDeltaAction = ChatToolCallDeltaAction;
export type IToolCallReadyAction = ChatToolCallReadyAction;
export type IToolCallApprovedAction = ChatToolCallApprovedAction;
export type IToolCallDeniedAction = ChatToolCallDeniedAction;
export type IToolCallConfirmedAction = ChatToolCallConfirmedAction;
export type IToolCallCompleteAction = ChatToolCallCompleteAction;
export type IToolCallResultConfirmedAction = ChatToolCallResultConfirmedAction;
export type ITurnCompleteAction = ChatTurnCompleteAction;
export type ITurnCancelledAction = ChatTurnCancelledAction;
export type ITitleChangedAction = SessionTitleChangedAction;
export type IUsageAction = ChatUsageAction;
export type IReasoningAction = ChatReasoningAction;
export type IErrorAction = ChatErrorAction;
export type IToolCallContentChangedAction = ChatToolCallContentChangedAction;
export type ICustomizationsChangedAction = import('./protocol/actions.js').SessionCustomizationsChangedAction;
export type ICustomizationToggledAction = import('./protocol/actions.js').SessionCustomizationToggledAction;

export type IPendingMessageSetAction = ChatPendingMessageSetAction;
export type IPendingMessageRemovedAction = ChatPendingMessageRemovedAction;
export type IQueuedMessagesReorderedAction = ChatQueuedMessagesReorderedAction;
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

export function isChatAction(action: StateAction): action is ChatAction {
	return action.type.startsWith('chat/');
}

export function isTerminalAction(action: StateAction): action is TerminalAction {
	return action.type.startsWith('terminal/');
}

export function isChangesetAction(action: StateAction): action is ChangesetAction {
	return action.type.startsWith('changeset/');
}

export function isAnnotationsAction(action: StateAction): action is AnnotationsAction {
	return action.type.startsWith('annotations/');
}
