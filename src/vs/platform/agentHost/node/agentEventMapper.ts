/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
	IAgentProgressEvent,
	IAgentToolStartEvent,
	IAgentToolCompleteEvent,
	IAgentPermissionRequestEvent,
	IAgentErrorEvent,
	IAgentReasoningEvent,
	IAgentUsageEvent,
	IAgentDeltaEvent,
	IAgentTitleChangedEvent,
} from '../common/agentService.js';
import {
	ActionType,
	type ISessionAction,
	type IDeltaAction,
	type IToolCallStartAction,
	type IToolCallReadyAction,
	type IToolCallCompleteAction,
	type ITurnCompleteAction,
	type ISessionErrorAction,
	type IUsageAction,
	type ITitleChangedAction,
	type IPermissionRequestAction,
	type IReasoningAction,
} from '../common/state/sessionActions.js';
import { ToolCallConfirmationReason, ToolResultContentType, type URI } from '../common/state/sessionState.js';

/**
 * Maps a flat {@link IAgentProgressEvent} from the agent host into
 * protocol {@link ISessionAction}(s) suitable for dispatch to the reducer.
 *
 * Returns `undefined` for events that have no corresponding action.
 * May return an array when a single SDK event maps to multiple protocol actions
 * (e.g. `tool_start` → `toolCallStart` + `toolCallReady`).
 */
export function mapProgressEventToActions(event: IAgentProgressEvent, session: URI, turnId: string): ISessionAction | ISessionAction[] | undefined {
	switch (event.type) {
		case 'delta':
			return {
				type: ActionType.SessionDelta,
				session,
				turnId,
				content: (event as IAgentDeltaEvent).content,
			} satisfies IDeltaAction;

		case 'tool_start': {
			// The Copilot SDK provides full parameters at tool_start time.
			// We emit both toolCallStart (streaming → created) and toolCallReady
			// (params complete → running with auto-confirm) as a pair.
			const e = event as IAgentToolStartEvent;
			const startAction: IToolCallStartAction = {
				type: ActionType.SessionToolCallStart,
				session,
				turnId,
				toolCallId: e.toolCallId,
				toolName: e.toolName,
				displayName: e.displayName,
				_meta: { toolKind: e.toolKind, language: e.language },
			};
			const readyAction: IToolCallReadyAction = {
				type: ActionType.SessionToolCallReady,
				session,
				turnId,
				toolCallId: e.toolCallId,
				invocationMessage: e.invocationMessage,
				toolInput: e.toolInput,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			};
			return [startAction, readyAction];
		}

		case 'tool_complete': {
			const e = event as IAgentToolCompleteEvent;
			return {
				type: ActionType.SessionToolCallComplete,
				session,
				turnId,
				toolCallId: e.toolCallId,
				result: {
					success: e.success,
					pastTenseMessage: e.pastTenseMessage,
					content: e.toolOutput !== undefined ? [{ type: ToolResultContentType.Text, text: e.toolOutput }] : undefined,
					error: e.error,
				},
			} satisfies IToolCallCompleteAction;
		}

		case 'idle':
			return {
				type: ActionType.SessionTurnComplete,
				session,
				turnId,
			} satisfies ITurnCompleteAction;

		case 'error': {
			const e = event as IAgentErrorEvent;
			return {
				type: ActionType.SessionError,
				session,
				turnId,
				error: {
					errorType: e.errorType,
					message: e.message,
					stack: e.stack,
				},
			} satisfies ISessionErrorAction;
		}

		case 'usage': {
			const e = event as IAgentUsageEvent;
			return {
				type: ActionType.SessionUsage,
				session,
				turnId,
				usage: {
					inputTokens: e.inputTokens,
					outputTokens: e.outputTokens,
					model: e.model,
					cacheReadTokens: e.cacheReadTokens,
				},
			} satisfies IUsageAction;
		}

		case 'title_changed':
			return {
				type: ActionType.SessionTitleChanged,
				session,
				title: (event as IAgentTitleChangedEvent).title,
			} satisfies ITitleChangedAction;

		case 'permission_request': {
			const e = event as IAgentPermissionRequestEvent;
			return {
				type: ActionType.SessionPermissionRequest,
				session,
				turnId,
				request: {
					requestId: e.requestId,
					permissionKind: e.permissionKind,
					toolCallId: e.toolCallId,
					path: e.path,
					fullCommandText: e.fullCommandText,
					intention: e.intention,
					serverName: e.serverName,
					toolName: e.toolName,
					rawRequest: e.rawRequest,
				},
			} satisfies IPermissionRequestAction;
		}

		case 'reasoning':
			return {
				type: ActionType.SessionReasoning,
				session,
				turnId,
				content: (event as IAgentReasoningEvent).content,
			} satisfies IReasoningAction;

		case 'message':
			return undefined;

		default:
			return undefined;
	}
}
