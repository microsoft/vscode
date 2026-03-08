/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Pure reducer functions for the sessions process protocol.
// See protocol.md -> Reducers for the full design.
//
// Both the server and clients run the same reducers. This is what makes
// write-ahead possible: the client can locally predict the result of its
// own action using the exact same logic the server will run.
//
// IMPORTANT: Reducers must be pure — no side effects, no I/O, no service
// calls. Server-side effects (e.g. forwarding to the Copilot SDK) are
// handled by a separate dispatch layer.

import type { IRootAction, ISessionAction } from './sessionActions.js';
import {
	type ICompletedToolCall,
	type IErrorInfo,
	type IRootState,
	type ISessionState,
	type IToolCallState,
	type ITurn,
	createActiveTurn,
	SessionLifecycle,
	SessionStatus,
	ToolCallStatus,
	TurnState,
} from './sessionState.js';

// ---- Root reducer -----------------------------------------------------------

/**
 * Reduces root-level actions into a new RootState.
 * Root actions are server-only (clients observe but cannot produce them).
 */
export function rootReducer(state: IRootState, action: IRootAction): IRootState {
	switch (action.type) {
		case 'root/agentsChanged': {
			return { ...state, agents: action.agents };
		}
	}
}

// ---- Session reducer --------------------------------------------------------

/**
 * Reduces session-level actions into a new SessionState.
 * Handles lifecycle, turn lifecycle, streaming deltas, tool calls, permissions.
 */
export function sessionReducer(state: ISessionState, action: ISessionAction): ISessionState {
	switch (action.type) {
		case 'session/ready': {
			return { ...state, lifecycle: SessionLifecycle.Ready };
		}
		case 'session/creationFailed': {
			return {
				...state,
				lifecycle: SessionLifecycle.CreationFailed,
				creationError: action.error,
			};
		}
		case 'session/turnStarted': {
			const activeTurn = createActiveTurn(action.turnId, action.userMessage);
			return {
				...state,
				activeTurn,
				summary: { ...state.summary, status: SessionStatus.InProgress },
			};
		}
		case 'session/delta': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			return {
				...state,
				activeTurn: {
					...state.activeTurn,
					streamingText: state.activeTurn.streamingText + action.content,
				},
			};
		}
		case 'session/responsePart': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			return {
				...state,
				activeTurn: {
					...state.activeTurn,
					responseParts: [...state.activeTurn.responseParts, action.part],
				},
			};
		}
		case 'session/toolStart': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			const toolCalls = new Map(state.activeTurn.toolCalls);
			toolCalls.set(action.toolCall.toolCallId, action.toolCall);
			return {
				...state,
				activeTurn: { ...state.activeTurn, toolCalls },
			};
		}
		case 'session/toolComplete': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			const toolCall = state.activeTurn.toolCalls.get(action.toolCallId);
			if (!toolCall) {
				return state;
			}
			const toolCalls = new Map(state.activeTurn.toolCalls);
			toolCalls.set(action.toolCallId, {
				...toolCall,
				status: action.result.success ? ToolCallStatus.Completed : ToolCallStatus.Failed,
				pastTenseMessage: action.result.pastTenseMessage,
				toolOutput: action.result.toolOutput,
				error: action.result.error,
			});
			return {
				...state,
				activeTurn: { ...state.activeTurn, toolCalls },
			};
		}
		case 'session/permissionRequest': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			const pendingPermissions = new Map(state.activeTurn.pendingPermissions);
			pendingPermissions.set(action.request.requestId, action.request);
			let toolCalls: ReadonlyMap<string, IToolCallState> = state.activeTurn.toolCalls;
			if (action.request.toolCallId) {
				const toolCall = toolCalls.get(action.request.toolCallId);
				if (toolCall) {
					const mutable = new Map(toolCalls);
					mutable.set(action.request.toolCallId, {
						...toolCall,
						status: ToolCallStatus.PendingPermission,
					});
					toolCalls = mutable;
				}
			}
			return {
				...state,
				activeTurn: { ...state.activeTurn, pendingPermissions, toolCalls },
			};
		}
		case 'session/permissionResolved': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			const pendingPermissions = new Map(state.activeTurn.pendingPermissions);
			const resolved = pendingPermissions.get(action.requestId);
			pendingPermissions.delete(action.requestId);
			let toolCalls: ReadonlyMap<string, IToolCallState> = state.activeTurn.toolCalls;
			if (resolved?.toolCallId) {
				const toolCall = toolCalls.get(resolved.toolCallId);
				if (toolCall && toolCall.status === ToolCallStatus.PendingPermission) {
					const mutable = new Map(toolCalls);
					mutable.set(resolved.toolCallId, {
						...toolCall,
						status: action.approved ? ToolCallStatus.Running : ToolCallStatus.Cancelled,
						confirmed: action.approved ? 'user-action' : 'denied',
						cancellationReason: action.approved ? undefined : 'denied',
					});
					toolCalls = mutable;
				}
			}
			return {
				...state,
				activeTurn: { ...state.activeTurn, pendingPermissions, toolCalls },
			};
		}
		case 'session/turnComplete': {
			return finalizeTurn(state, action.turnId, TurnState.Complete);
		}
		case 'session/turnCancelled': {
			return finalizeTurn(state, action.turnId, TurnState.Cancelled);
		}
		case 'session/error': {
			return finalizeTurn(state, action.turnId, TurnState.Error, action.error);
		}
		case 'session/titleChanged': {
			return {
				...state,
				summary: { ...state.summary, title: action.title, modifiedAt: Date.now() },
			};
		}
		case 'session/modelChanged': {
			return {
				...state,
				summary: { ...state.summary, model: action.model, modifiedAt: Date.now() },
			};
		}
		case 'session/usage': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			return {
				...state,
				activeTurn: {
					...state.activeTurn,
					usage: action.usage,
				},
			};
		}
		case 'session/reasoning': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			return {
				...state,
				activeTurn: {
					...state.activeTurn,
					reasoning: state.activeTurn.reasoning + action.content,
				},
			};
		}
	}
}

// ---- Helpers ----------------------------------------------------------------

/**
 * Moves the active turn into the completed turns array and clears `activeTurn`.
 */
function finalizeTurn(state: ISessionState, turnId: string, turnState: TurnState, error?: IErrorInfo): ISessionState {
	if (!state.activeTurn || state.activeTurn.id !== turnId) {
		return state;
	}
	const active = state.activeTurn;

	const completedToolCalls: ICompletedToolCall[] = [];
	for (const tc of active.toolCalls.values()) {
		completedToolCalls.push({
			toolCallId: tc.toolCallId,
			toolName: tc.toolName,
			displayName: tc.displayName,
			invocationMessage: tc.invocationMessage,
			success: tc.status === ToolCallStatus.Completed,
			pastTenseMessage: tc.pastTenseMessage ?? tc.invocationMessage,
			toolInput: tc.toolInput,
			toolKind: tc.toolKind,
			language: tc.language,
			toolOutput: tc.toolOutput,
			error: tc.error,
		});
	}

	const finalizedTurn: ITurn = {
		id: active.id,
		userMessage: active.userMessage,
		responseText: active.streamingText,
		responseParts: active.responseParts,
		toolCalls: completedToolCalls,
		usage: active.usage,
		state: turnState,
		error,
	};

	return {
		...state,
		turns: [...state.turns, finalizedTurn],
		activeTurn: undefined,
		summary: { ...state.summary, status: SessionStatus.Idle, modifiedAt: Date.now() },
	};
}
