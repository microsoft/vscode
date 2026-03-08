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
import type {
	ISessionAction,
	IDeltaAction,
	IToolStartAction,
	IToolCompleteAction,
	ITurnCompleteAction,
	ISessionErrorAction,
	IUsageAction,
	ITitleChangedAction,
	IPermissionRequestAction,
	IReasoningAction,
} from '../common/state/sessionActions.js';
import { ToolCallStatus } from '../common/state/sessionState.js';
import { URI } from '../../../base/common/uri.js';

/**
 * Maps a flat {@link IAgentProgressEvent} from the agent host into
 * a protocol {@link ISessionAction} suitable for dispatch to the reducer.
 * Returns `undefined` for events that have no corresponding action.
 */
export function mapProgressEventToAction(event: IAgentProgressEvent, session: URI, turnId: string): ISessionAction | undefined {
	switch (event.type) {
		case 'delta':
			return {
				type: 'session/delta',
				session,
				turnId,
				content: (event as IAgentDeltaEvent).content,
			} satisfies IDeltaAction;

		case 'tool_start': {
			const e = event as IAgentToolStartEvent;
			return {
				type: 'session/toolStart',
				session,
				turnId,
				toolCall: {
					toolCallId: e.toolCallId,
					toolName: e.toolName,
					displayName: e.displayName,
					invocationMessage: e.invocationMessage,
					toolInput: e.toolInput,
					toolKind: e.toolKind,
					language: e.language,
					toolArguments: e.toolArguments,
					status: ToolCallStatus.Running,
				},
			} satisfies IToolStartAction;
		}

		case 'tool_complete': {
			const e = event as IAgentToolCompleteEvent;
			return {
				type: 'session/toolComplete',
				session,
				turnId,
				toolCallId: e.toolCallId,
				result: {
					success: e.success,
					pastTenseMessage: e.pastTenseMessage,
					toolOutput: e.toolOutput,
					error: e.error,
				},
			} satisfies IToolCompleteAction;
		}

		case 'idle':
			return {
				type: 'session/turnComplete',
				session,
				turnId,
			} satisfies ITurnCompleteAction;

		case 'error': {
			const e = event as IAgentErrorEvent;
			return {
				type: 'session/error',
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
				type: 'session/usage',
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
				type: 'session/titleChanged',
				session,
				title: (event as IAgentTitleChangedEvent).title,
			} satisfies ITitleChangedAction;

		case 'permission_request': {
			const e = event as IAgentPermissionRequestEvent;
			return {
				type: 'session/permissionRequest',
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
				type: 'session/reasoning',
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
