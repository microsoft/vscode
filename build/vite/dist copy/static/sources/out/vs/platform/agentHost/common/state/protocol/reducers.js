/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IS_CLIENT_DISPATCHABLE } from './action-origin.generated.js';
// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Soft assertion for exhaustiveness checking. Place in the `default` branch of
 * a switch on a discriminated union so the compiler errors when a new variant
 * is added but not handled.
 *
 * At runtime, logs a warning instead of throwing so that forward-compatible
 * clients receiving unknown actions from a newer server degrade gracefully.
 */
export function softAssertNever(value, log) {
    const msg = `Unhandled action type: ${JSON.stringify(value)}`;
    (log ?? console.warn)(msg);
}
/** Extracts the common base fields shared by all tool call lifecycle states. */
function tcBase(tc) {
    return {
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        displayName: tc.displayName,
        toolClientId: tc.toolClientId,
        _meta: tc._meta,
    };
}
/**
 * Ends the active turn, finalizing it into a completed turn record.
 *
 * Tool call parts with non-terminal states are forced to cancelled.
 * Pending permissions are stripped from tool call parts.
 */
function endTurn(state, turnId, turnState, summaryStatus, error) {
    if (!state.activeTurn || state.activeTurn.id !== turnId) {
        return state;
    }
    const active = state.activeTurn;
    const responseParts = active.responseParts.map(part => {
        if (part.kind !== "toolCall" /* ResponsePartKind.ToolCall */) {
            return part;
        }
        const tc = part.toolCall;
        if (tc.status === "completed" /* ToolCallStatus.Completed */ || tc.status === "cancelled" /* ToolCallStatus.Cancelled */) {
            return part;
        }
        // Force non-terminal tool calls into cancelled state
        return {
            kind: "toolCall" /* ResponsePartKind.ToolCall */,
            toolCall: {
                status: "cancelled" /* ToolCallStatus.Cancelled */,
                ...tcBase(tc),
                invocationMessage: tc.status === "streaming" /* ToolCallStatus.Streaming */ ? (tc.invocationMessage ?? '') : tc.invocationMessage,
                toolInput: tc.status === "streaming" /* ToolCallStatus.Streaming */ ? undefined : tc.toolInput,
                reason: "skipped" /* ToolCallCancellationReason.Skipped */,
            },
        };
    });
    const turn = {
        id: active.id,
        userMessage: active.userMessage,
        responseParts,
        usage: active.usage,
        state: turnState,
        error,
    };
    return {
        ...state,
        turns: [...state.turns, turn],
        activeTurn: undefined,
        summary: { ...state.summary, status: summaryStatus, modifiedAt: Date.now() },
    };
}
/**
 * Immutably updates the tool call inside a `ToolCall` response part in the
 * active turn's `responseParts` array. Returns `state` unchanged if the
 * active turn or tool call doesn't match.
 */
function updateToolCallInParts(state, turnId, toolCallId, updater) {
    const activeTurn = state.activeTurn;
    if (!activeTurn || activeTurn.id !== turnId) {
        return state;
    }
    let found = false;
    const responseParts = activeTurn.responseParts.map(part => {
        if (part.kind === "toolCall" /* ResponsePartKind.ToolCall */ && part.toolCall.toolCallId === toolCallId) {
            const updated = updater(part.toolCall);
            if (updated === part.toolCall) {
                return part;
            }
            found = true;
            return { ...part, toolCall: updated };
        }
        return part;
    });
    if (!found) {
        return state;
    }
    return {
        ...state,
        activeTurn: { ...activeTurn, responseParts },
    };
}
/**
 * Immutably updates a response part by `partId` in the active turn.
 * For markdown/reasoning parts, matches on `id`. For tool call parts,
 * matches on `toolCall.toolCallId`.
 */
function updateResponsePart(state, turnId, partId, updater) {
    const activeTurn = state.activeTurn;
    if (!activeTurn || activeTurn.id !== turnId) {
        return state;
    }
    let found = false;
    const responseParts = activeTurn.responseParts.map(part => {
        if (!found) {
            const id = part.kind === "toolCall" /* ResponsePartKind.ToolCall */
                ? part.toolCall.toolCallId
                : 'id' in part ? part.id : undefined;
            if (id === partId) {
                found = true;
                return updater(part);
            }
        }
        return part;
    });
    if (!found) {
        return state;
    }
    return {
        ...state,
        activeTurn: { ...activeTurn, responseParts },
    };
}
// ─── Root Reducer ────────────────────────────────────────────────────────────
/**
 * Pure reducer for root state. Handles all {@link IRootAction} variants.
 */
export function rootReducer(state, action, log) {
    switch (action.type) {
        case "root/agentsChanged" /* ActionType.RootAgentsChanged */:
            return { ...state, agents: action.agents };
        case "root/activeSessionsChanged" /* ActionType.RootActiveSessionsChanged */:
            return { ...state, activeSessions: action.activeSessions };
        default:
            softAssertNever(action, log);
            return state;
    }
}
// ─── Session Reducer ─────────────────────────────────────────────────────────
/**
 * Pure reducer for session state. Handles all {@link ISessionAction} variants.
 */
export function sessionReducer(state, action, log) {
    switch (action.type) {
        // ── Lifecycle ──────────────────────────────────────────────────────────
        case "session/ready" /* ActionType.SessionReady */:
            return {
                ...state,
                lifecycle: "ready" /* SessionLifecycle.Ready */,
                summary: { ...state.summary, status: "idle" /* SessionStatus.Idle */ },
            };
        case "session/creationFailed" /* ActionType.SessionCreationFailed */:
            return {
                ...state,
                lifecycle: "creationFailed" /* SessionLifecycle.CreationFailed */,
                creationError: action.error,
            };
        // ── Turn Lifecycle ────────────────────────────────────────────────────
        case "session/turnStarted" /* ActionType.SessionTurnStarted */: {
            let next = {
                ...state,
                summary: { ...state.summary, status: "in-progress" /* SessionStatus.InProgress */, modifiedAt: Date.now() },
                activeTurn: {
                    id: action.turnId,
                    userMessage: action.userMessage,
                    responseParts: [],
                    usage: undefined,
                },
            };
            // If this turn was auto-started from a pending message, remove it
            if (action.queuedMessageId) {
                if (next.steeringMessage?.id === action.queuedMessageId) {
                    next = { ...next, steeringMessage: undefined };
                }
                if (next.queuedMessages) {
                    const filtered = next.queuedMessages.filter(m => m.id !== action.queuedMessageId);
                    next = { ...next, queuedMessages: filtered.length > 0 ? filtered : undefined };
                }
            }
            return next;
        }
        case "session/delta" /* ActionType.SessionDelta */:
            return updateResponsePart(state, action.turnId, action.partId, part => {
                if (part.kind === "markdown" /* ResponsePartKind.Markdown */) {
                    return { ...part, content: part.content + action.content };
                }
                return part;
            });
        case "session/responsePart" /* ActionType.SessionResponsePart */:
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
        case "session/turnComplete" /* ActionType.SessionTurnComplete */:
            return endTurn(state, action.turnId, "complete" /* TurnState.Complete */, "idle" /* SessionStatus.Idle */);
        case "session/turnCancelled" /* ActionType.SessionTurnCancelled */:
            return endTurn(state, action.turnId, "cancelled" /* TurnState.Cancelled */, "idle" /* SessionStatus.Idle */);
        case "session/error" /* ActionType.SessionError */:
            return endTurn(state, action.turnId, "error" /* TurnState.Error */, "error" /* SessionStatus.Error */, action.error);
        // ── Tool Call State Machine ───────────────────────────────────────────
        case "session/toolCallStart" /* ActionType.SessionToolCallStart */:
            if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
                return state;
            }
            return {
                ...state,
                activeTurn: {
                    ...state.activeTurn,
                    responseParts: [
                        ...state.activeTurn.responseParts,
                        {
                            kind: "toolCall" /* ResponsePartKind.ToolCall */,
                            toolCall: {
                                toolCallId: action.toolCallId,
                                toolName: action.toolName,
                                displayName: action.displayName,
                                toolClientId: action.toolClientId,
                                _meta: action._meta,
                                status: "streaming" /* ToolCallStatus.Streaming */,
                            },
                        },
                    ],
                },
            };
        case "session/toolCallDelta" /* ActionType.SessionToolCallDelta */:
            return updateToolCallInParts(state, action.turnId, action.toolCallId, tc => {
                if (tc.status !== "streaming" /* ToolCallStatus.Streaming */) {
                    return tc;
                }
                return {
                    ...tc,
                    partialInput: (tc.partialInput ?? '') + action.content,
                    invocationMessage: action.invocationMessage ?? tc.invocationMessage,
                };
            });
        case "session/toolCallReady" /* ActionType.SessionToolCallReady */:
            return updateToolCallInParts(state, action.turnId, action.toolCallId, tc => {
                if (tc.status !== "streaming" /* ToolCallStatus.Streaming */ && tc.status !== "running" /* ToolCallStatus.Running */) {
                    return tc;
                }
                const base = tcBase(tc);
                if (action.confirmed) {
                    return {
                        status: "running" /* ToolCallStatus.Running */,
                        ...base,
                        invocationMessage: action.invocationMessage,
                        toolInput: action.toolInput,
                        confirmed: action.confirmed,
                    };
                }
                return {
                    status: "pending-confirmation" /* ToolCallStatus.PendingConfirmation */,
                    ...base,
                    invocationMessage: action.invocationMessage,
                    toolInput: action.toolInput,
                    confirmationTitle: action.confirmationTitle,
                };
            });
        case "session/toolCallConfirmed" /* ActionType.SessionToolCallConfirmed */:
            return updateToolCallInParts(state, action.turnId, action.toolCallId, tc => {
                if (tc.status !== "pending-confirmation" /* ToolCallStatus.PendingConfirmation */) {
                    return tc;
                }
                const base = tcBase(tc);
                if (action.approved) {
                    return {
                        status: "running" /* ToolCallStatus.Running */,
                        ...base,
                        invocationMessage: tc.invocationMessage,
                        toolInput: tc.toolInput,
                        confirmed: action.confirmed,
                    };
                }
                return {
                    status: "cancelled" /* ToolCallStatus.Cancelled */,
                    ...base,
                    invocationMessage: tc.invocationMessage,
                    toolInput: tc.toolInput,
                    reason: action.reason,
                    reasonMessage: action.reasonMessage,
                    userSuggestion: action.userSuggestion,
                };
            });
        case "session/toolCallComplete" /* ActionType.SessionToolCallComplete */:
            return updateToolCallInParts(state, action.turnId, action.toolCallId, tc => {
                if (tc.status !== "running" /* ToolCallStatus.Running */ && tc.status !== "pending-confirmation" /* ToolCallStatus.PendingConfirmation */) {
                    return tc;
                }
                const base = tcBase(tc);
                const confirmed = tc.status === "running" /* ToolCallStatus.Running */
                    ? tc.confirmed
                    : "not-needed" /* ToolCallConfirmationReason.NotNeeded */;
                if (action.requiresResultConfirmation) {
                    return {
                        status: "pending-result-confirmation" /* ToolCallStatus.PendingResultConfirmation */,
                        ...base,
                        invocationMessage: tc.invocationMessage,
                        toolInput: tc.toolInput,
                        confirmed,
                        ...action.result,
                    };
                }
                return {
                    status: "completed" /* ToolCallStatus.Completed */,
                    ...base,
                    invocationMessage: tc.invocationMessage,
                    toolInput: tc.toolInput,
                    confirmed,
                    ...action.result,
                };
            });
        case "session/toolCallResultConfirmed" /* ActionType.SessionToolCallResultConfirmed */:
            return updateToolCallInParts(state, action.turnId, action.toolCallId, tc => {
                if (tc.status !== "pending-result-confirmation" /* ToolCallStatus.PendingResultConfirmation */) {
                    return tc;
                }
                const base = tcBase(tc);
                if (action.approved) {
                    return {
                        status: "completed" /* ToolCallStatus.Completed */,
                        ...base,
                        invocationMessage: tc.invocationMessage,
                        toolInput: tc.toolInput,
                        confirmed: tc.confirmed,
                        success: tc.success,
                        pastTenseMessage: tc.pastTenseMessage,
                        content: tc.content,
                        structuredContent: tc.structuredContent,
                        error: tc.error,
                    };
                }
                return {
                    status: "cancelled" /* ToolCallStatus.Cancelled */,
                    ...base,
                    invocationMessage: tc.invocationMessage,
                    toolInput: tc.toolInput,
                    reason: "result-denied" /* ToolCallCancellationReason.ResultDenied */,
                };
            });
        // ── Metadata ──────────────────────────────────────────────────────────
        case "session/titleChanged" /* ActionType.SessionTitleChanged */:
            return {
                ...state,
                summary: { ...state.summary, title: action.title, modifiedAt: Date.now() },
            };
        case "session/usage" /* ActionType.SessionUsage */:
            if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
                return state;
            }
            return {
                ...state,
                activeTurn: { ...state.activeTurn, usage: action.usage },
            };
        case "session/reasoning" /* ActionType.SessionReasoning */:
            return updateResponsePart(state, action.turnId, action.partId, part => {
                if (part.kind === "reasoning" /* ResponsePartKind.Reasoning */) {
                    return { ...part, content: part.content + action.content };
                }
                return part;
            });
        case "session/modelChanged" /* ActionType.SessionModelChanged */:
            return {
                ...state,
                summary: { ...state.summary, model: action.model, modifiedAt: Date.now() },
            };
        case "session/serverToolsChanged" /* ActionType.SessionServerToolsChanged */:
            return { ...state, serverTools: action.tools };
        case "session/activeClientChanged" /* ActionType.SessionActiveClientChanged */:
            return {
                ...state,
                activeClient: action.activeClient ?? undefined,
            };
        case "session/activeClientToolsChanged" /* ActionType.SessionActiveClientToolsChanged */:
            if (!state.activeClient) {
                return state;
            }
            return {
                ...state,
                activeClient: { ...state.activeClient, tools: action.tools },
            };
        // ── Customizations ──────────────────────────────────────────────────
        case "session/customizationsChanged" /* ActionType.SessionCustomizationsChanged */:
            return { ...state, customizations: action.customizations };
        case "session/customizationToggled" /* ActionType.SessionCustomizationToggled */: {
            const list = state.customizations;
            if (!list) {
                return state;
            }
            const idx = list.findIndex(c => c.customization.uri === action.uri);
            if (idx < 0) {
                return state;
            }
            const updated = [...list];
            updated[idx] = { ...list[idx], enabled: action.enabled };
            return { ...state, customizations: updated };
        }
        // ── Truncation ────────────────────────────────────────────────────────
        case "session/truncated" /* ActionType.SessionTruncated */: {
            let turns;
            if (action.turnId === undefined) {
                turns = [];
            }
            else {
                const idx = state.turns.findIndex(t => t.id === action.turnId);
                if (idx < 0) {
                    return state;
                }
                turns = state.turns.slice(0, idx + 1);
            }
            return {
                ...state,
                turns,
                activeTurn: undefined,
                summary: { ...state.summary, status: "idle" /* SessionStatus.Idle */, modifiedAt: Date.now() },
            };
        }
        // ── Pending Messages ──────────────────────────────────────────────────
        case "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */: {
            const entry = { id: action.id, userMessage: action.userMessage };
            if (action.kind === "steering" /* PendingMessageKind.Steering */) {
                return { ...state, steeringMessage: entry };
            }
            const existing = state.queuedMessages ?? [];
            const idx = existing.findIndex(m => m.id === action.id);
            if (idx >= 0) {
                const updated = [...existing];
                updated[idx] = entry;
                return { ...state, queuedMessages: updated };
            }
            return { ...state, queuedMessages: [...existing, entry] };
        }
        case "session/pendingMessageRemoved" /* ActionType.SessionPendingMessageRemoved */: {
            if (action.kind === "steering" /* PendingMessageKind.Steering */) {
                if (!state.steeringMessage || state.steeringMessage.id !== action.id) {
                    return state;
                }
                return { ...state, steeringMessage: undefined };
            }
            const existing = state.queuedMessages;
            if (!existing) {
                return state;
            }
            const filtered = existing.filter(m => m.id !== action.id);
            return filtered.length === existing.length
                ? state
                : { ...state, queuedMessages: filtered.length > 0 ? filtered : undefined };
        }
        case "session/queuedMessagesReordered" /* ActionType.SessionQueuedMessagesReordered */: {
            const existing = state.queuedMessages;
            if (!existing) {
                return state;
            }
            const byId = new Map(existing.map(m => [m.id, m]));
            const ordered = new Set();
            const reordered = action.order
                .filter(id => {
                if (byId.has(id) && !ordered.has(id)) {
                    ordered.add(id);
                    return true;
                }
                return false;
            })
                .map(id => byId.get(id));
            // Append any messages not mentioned in order, preserving original order
            for (const m of existing) {
                if (!ordered.has(m.id)) {
                    reordered.push(m);
                }
            }
            return { ...state, queuedMessages: reordered };
        }
        default:
            softAssertNever(action, log);
            return state;
    }
}
// ─── Dispatch Validation ─────────────────────────────────────────────────────
/**
 * Type guard that checks whether an action may be dispatched by a client.
 *
 * Servers SHOULD call this to validate incoming `dispatchAction` requests
 * and reject any action the client is not allowed to originate.
 */
export function isClientDispatchable(action) {
    return IS_CLIENT_DISPATCHABLE[action.type];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVkdWNlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3JlZHVjZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBT2hHLE9BQU8sRUFBRSxzQkFBc0IsRUFBb0UsTUFBTSw4QkFBOEIsQ0FBQztBQUV4SSxnRkFBZ0Y7QUFFaEY7Ozs7Ozs7R0FPRztBQUNILE1BQU0sVUFBVSxlQUFlLENBQUMsS0FBWSxFQUFFLEdBQTJCO0lBQ3hFLE1BQU0sR0FBRyxHQUFHLDBCQUEwQixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7SUFDOUQsQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzVCLENBQUM7QUFFRCxnRkFBZ0Y7QUFDaEYsU0FBUyxNQUFNLENBQUMsRUFBa0I7SUFDakMsT0FBTztRQUNOLFVBQVUsRUFBRSxFQUFFLENBQUMsVUFBVTtRQUN6QixRQUFRLEVBQUUsRUFBRSxDQUFDLFFBQVE7UUFDckIsV0FBVyxFQUFFLEVBQUUsQ0FBQyxXQUFXO1FBQzNCLFlBQVksRUFBRSxFQUFFLENBQUMsWUFBWTtRQUM3QixLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUs7S0FDZixDQUFDO0FBQ0gsQ0FBQztBQUVEOzs7OztHQUtHO0FBQ0gsU0FBUyxPQUFPLENBQ2YsS0FBb0IsRUFDcEIsTUFBYyxFQUNkLFNBQW9CLEVBQ3BCLGFBQTRCLEVBQzVCLEtBQThEO0lBRTlELElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxJQUFJLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLE1BQU0sRUFBRSxDQUFDO1FBQ3pELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELE1BQU0sTUFBTSxHQUFHLEtBQUss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