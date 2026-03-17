/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-exports all protocol action and notification types, plus type guards.
// The protocol now uses VS Code's URI class directly (the sync script rewrites
// `type URI = string` to `import { URI } from 'vs/base/common/uri'`).

// ---- Re-exports from protocol -----------------------------------------------

export type {
	IActionOrigin,
	IActionEnvelope,
	IRootAgentsChangedAction,
	IRootActiveSessionsChangedAction,
	ISessionReadyAction,
	ISessionCreationFailedAction,
	ISessionTurnStartedAction,
	ISessionDeltaAction,
	ISessionResponsePartAction,
	ISessionToolCallStartAction,
	ISessionToolCallDeltaAction,
	ISessionToolCallReadyAction,
	ISessionToolCallApprovedAction,
	ISessionToolCallDeniedAction,
	ISessionToolCallConfirmedAction,
	ISessionToolCallCompleteAction,
	ISessionToolCallResultConfirmedAction,
	ISessionPermissionRequestAction,
	ISessionPermissionResolvedAction,
	ISessionTurnCompleteAction,
	ISessionTurnCancelledAction,
	ISessionErrorAction,
	ISessionTitleChangedAction,
	ISessionUsageAction,
	ISessionReasoningAction,
	ISessionModelChangedAction,
	ISessionServerToolsChangedAction,
	ISessionActiveClientChangedAction,
	ISessionActiveClientToolsChangedAction,
	IStateAction,
} from './protocol/actions.js';

export { ActionType } from './protocol/actions.js';

export type {
	ISessionAddedNotification,
	ISessionRemovedNotification,
	IProtocolNotification,
} from './protocol/notifications.js';

import type { IStateAction } from './protocol/actions.js';

// Re-export the protocol reviver/replacer and Wire type for boundary consumers
export { type Wire, type AhpIncomingMessage, protocolReviver, protocolReplacer } from './protocol/protocolSerialization.js';

// ---- VS Code name aliases ---------------------------------------------------
// The protocol uses `ISession*` / `IRoot*` prefix. VS Code historically
// uses shorter names. Keep aliases for backward compatibility during migration.

export type { IRootAgentsChangedAction as IAgentsChangedAction } from './protocol/actions.js';
export type { IRootActiveSessionsChangedAction as IActiveSessionsChangedAction } from './protocol/actions.js';
export type { ISessionTurnStartedAction as ITurnStartedAction } from './protocol/actions.js';
export type { ISessionDeltaAction as IDeltaAction } from './protocol/actions.js';
export type { ISessionResponsePartAction as IResponsePartAction } from './protocol/actions.js';
export type { ISessionToolCallStartAction as IToolCallStartAction } from './protocol/actions.js';
export type { ISessionToolCallDeltaAction as IToolCallDeltaAction } from './protocol/actions.js';
export type { ISessionToolCallReadyAction as IToolCallReadyAction } from './protocol/actions.js';
export type { ISessionToolCallApprovedAction as IToolCallApprovedAction } from './protocol/actions.js';
export type { ISessionToolCallDeniedAction as IToolCallDeniedAction } from './protocol/actions.js';
export type { ISessionToolCallConfirmedAction as IToolCallConfirmedAction } from './protocol/actions.js';
export type { ISessionToolCallCompleteAction as IToolCallCompleteAction } from './protocol/actions.js';
export type { ISessionToolCallResultConfirmedAction as IToolCallResultConfirmedAction } from './protocol/actions.js';
export type { ISessionPermissionRequestAction as IPermissionRequestAction } from './protocol/actions.js';
export type { ISessionPermissionResolvedAction as IPermissionResolvedAction } from './protocol/actions.js';
export type { ISessionTurnCompleteAction as ITurnCompleteAction } from './protocol/actions.js';
export type { ISessionTurnCancelledAction as ITurnCancelledAction } from './protocol/actions.js';
export type { ISessionTitleChangedAction as ITitleChangedAction } from './protocol/actions.js';
export type { ISessionUsageAction as IUsageAction } from './protocol/actions.js';
export type { ISessionReasoningAction as IReasoningAction } from './protocol/actions.js';
export type { ISessionModelChangedAction as IModelChangedAction } from './protocol/actions.js';
export type { IProtocolNotification as INotification } from './protocol/notifications.js';

// ---- Derived union types for VS Code consumers ------------------------------

/** Root actions (server-only, mutate RootState). */
export type IRootAction = import('./protocol/actions.js').IRootAgentsChangedAction | import('./protocol/actions.js').IRootActiveSessionsChangedAction;

/** Session actions that VS Code consumers historically use. */
export type ISessionAction = Exclude<IStateAction, IRootAction>;

// ---- Type guards ------------------------------------------------------------

export function isRootAction(action: IStateAction): action is IRootAction {
	return action.type.startsWith('root/');
}

export function isSessionAction(action: IStateAction): action is ISessionAction {
	return action.type.startsWith('session/');
}
