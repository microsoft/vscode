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
	TurnState,
} from './sessionState.js';

// ---- Helper: extract common base fields from a tool call state --------------

function tcBase(tc: IToolCallState) {
	return {
		toolCallId: tc.toolCallId,
		toolName: tc.toolName,
		displayName: tc.displayName,
		_meta: tc._meta,
	};
}

// ---- Root reducer -----------------------------------------------------------

/**
 * Reduces root-level actions into a new RootState.
 * Root actions are server-only (clients observe but cannot produce them).
 */
export function rootReducer(state: IRootState, action: IRootAction): IRootState {
	switch (action.type) {
		case 'root/agentsChanged': {
			return { ...state, agents: [...action.agents] };
		}
		case 'root/activeSessionsChanged': {
			return { ...state, activeSessions: action.activeSessions };
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
		case 'session/toolCallStart': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			return {
				...state,
				activeTurn: {
					...state.activeTurn,
					toolCalls: {
						...state.activeTurn.toolCalls,
						[action.toolCallId]: {
							status: 'streaming',
							toolCallId: action.toolCallId,
							toolName: action.toolName,
							displayName: action.displayName,
							_meta: action._meta,
						},
					},
				},
			};
		}
		case 'session/toolCallDelta': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			const tc = state.activeTurn.toolCalls[action.toolCallId];
			if (!tc || tc.status !== 'streaming') {
				return state;
			}
			return {
				...state,
				activeTurn: {
					...state.activeTurn,
					toolCalls: {
						...state.activeTurn.toolCalls,
						[action.toolCallId]: {
							...tc,
							partialInput: (tc.partialInput ?? '') + action.content,
							invocationMessage: action.invocationMessage ?? tc.invocationMessage,
						},
					},
				},
			};
		}
		case 'session/toolCallReady': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			const tc = state.activeTurn.toolCalls[action.toolCallId];
			if (!tc) {
				return state;
			}
			const base = tcBase(tc);
			const updated: IToolCallState = action.confirmed
				? {
					status: 'running',
					...base,
					invocationMessage: action.invocationMessage,
					toolInput: action.toolInput,
					confirmed: action.confirmed,
				}
				: {
					status: 'pending-confirmation',
					...base,
					invocationMessage: action.invocationMessage,
					toolInput: action.toolInput,
				};
			return {
				...state,
				activeTurn: {
					...state.activeTurn,
					toolCalls: { ...state.activeTurn.toolCalls, [action.toolCallId]: updated },
				},
			};
		}
		case 'session/toolCallConfirmed': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			const tc = state.activeTurn.toolCalls[action.toolCallId];
			if (!tc || tc.status !== 'pending-confirmation') {
				return state;
			}
			const base = tcBase(tc);
			const updated: IToolCallState = action.approved
				? {
					status: 'running',
					...base,
					invocationMessage: tc.invocationMessage,
					toolInput: tc.toolInput,
					confirmed: action.confirmed,
				}
				: {
					status: 'cancelled',
					...base,
					invocationMessage: tc.invocationMessage,
					toolInput: tc.toolInput,
					reason: action.reason,
					reasonMessage: action.reasonMessage,
					userSuggestion: action.userSuggestion,
				};
			return {
				...state,
				activeTurn: {
					...state.activeTurn,
					toolCalls: { ...state.activeTurn.toolCalls, [action.toolCallId]: updated },
				},
			};
		}
		case 'session/toolCallComplete': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			const tc = state.activeTurn.toolCalls[action.toolCallId];
			if (!tc || (tc.status !== 'running' && tc.status !== 'pending-confirmation')) {
				return state;
			}
			const base = tcBase(tc);
			const confirmed = tc.status === 'running' ? tc.confirmed : 'not-needed';
			const updated: IToolCallState = action.requiresResultConfirmation
				? {
					status: 'pending-result-confirmation',
					...base,
					invocationMessage: tc.invocationMessage,
					toolInput: tc.toolInput,
					confirmed,
					...action.result,
				}
				: {
					status: 'completed',
					...base,
					invocationMessage: tc.invocationMessage,
					toolInput: tc.toolInput,
					confirmed,
					...action.result,
				};
			return {
				...state,
				activeTurn: {
					...state.activeTurn,
					toolCalls: { ...state.activeTurn.toolCalls, [action.toolCallId]: updated },
				},
			};
		}
		case 'session/toolCallResultConfirmed': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			const tc = state.activeTurn.toolCalls[action.toolCallId];
			if (!tc || tc.status !== 'pending-result-confirmation') {
				return state;
			}
			const base = tcBase(tc);
			const updated: IToolCallState = action.approved
				? {
					status: 'completed',
					...base,
					invocationMessage: tc.invocationMessage,
					toolInput: tc.toolInput,
					confirmed: tc.confirmed,
					success: tc.success,
					pastTenseMessage: tc.pastTenseMessage,
					content: tc.content,
					structuredContent: tc.structuredContent,
					error: tc.error,
				}
				: {
					status: 'cancelled',
					...base,
					invocationMessage: tc.invocationMessage,
					toolInput: tc.toolInput,
					reason: 'result-denied',
				};
			return {
				...state,
				activeTurn: {
					...state.activeTurn,
					toolCalls: { ...state.activeTurn.toolCalls, [action.toolCallId]: updated },
				},
			};
		}
		case 'session/permissionRequest': {
			if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
				return state;
			}
			const pendingPermissions = { ...state.activeTurn.pendingPermissions, [action.request.requestId]: action.request };
			let toolCalls = state.activeTurn.toolCalls;
			if (action.request.toolCallId) {
				const toolCall = toolCalls[action.request.toolCallId];
				if (toolCall && (toolCall.status === 'running' || toolCall.status === 'streaming')) {
					toolCalls = {
						...toolCalls,
						[action.request.toolCallId]: {
							...toolCall,
							status: 'pending-confirmation',
							invocationMessage: toolCall.invocationMessage ?? '',
						},
					};
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
			const resolved = state.activeTurn.pendingPermissions[action.requestId];
			const { [action.requestId]: _, ...pendingPermissions } = state.activeTurn.pendingPermissions;
			let toolCalls = state.activeTurn.toolCalls;
			if (resolved?.toolCallId) {
				const toolCall = toolCalls[resolved.toolCallId];
				if (toolCall && toolCall.status === 'pending-confirmation') {
					const base = tcBase(toolCall);
					const updated: IToolCallState = action.approved
						? {
							status: 'running',
							...base,
							invocationMessage: toolCall.invocationMessage,
							toolInput: toolCall.toolInput,
							confirmed: 'user-action',
						}
						: {
							status: 'cancelled',
							...base,
							invocationMessage: toolCall.invocationMessage,
							toolInput: toolCall.toolInput,
							reason: 'denied',
						};
					toolCalls = { ...toolCalls, [resolved.toolCallId]: updated };
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
		case 'session/serverToolsChanged': {
			return { ...state, serverTools: action.tools };
		}
		case 'session/activeClientChanged': {
			return { ...state, activeClient: action.activeClient ?? undefined };
		}
		case 'session/activeClientToolsChanged': {
			if (!state.activeClient) {
				return state;
			}
			return { ...state, activeClient: { ...state.activeClient, tools: action.tools } };
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
	for (const tc of Object.values(active.toolCalls)) {
		if (tc.status === 'completed') {
			completedToolCalls.push(tc);
		} else if (tc.status === 'cancelled') {
			completedToolCalls.push(tc);
		} else {
			// For tool calls that are not in a terminal state when the turn
			// finishes (e.g. still streaming or running), force them into
			// a cancelled state so they are persisted properly.
			completedToolCalls.push({
				status: 'cancelled',
				...tcBase(tc),
				invocationMessage: tc.status === 'streaming' ? (tc.invocationMessage ?? '') : tc.invocationMessage,
				toolInput: tc.status === 'streaming' ? undefined : tc.toolInput,
				reason: 'skipped',
			});
		}
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

// ---- Tool call metadata helpers (VS Code extensions via _meta) --------------

/**
 * Extracts the VS Code-specific `toolKind` rendering hint from a tool call's `_meta`.
 */
export function getToolKind(tc: IToolCallState | ICompletedToolCall): 'terminal' | undefined {
	return tc._meta?.toolKind as 'terminal' | undefined;
}

/**
 * Extracts the VS Code-specific `language` hint from a tool call's `_meta`.
 */
export function getToolLanguage(tc: IToolCallState | ICompletedToolCall): string | undefined {
	return tc._meta?.language as string | undefined;
}
