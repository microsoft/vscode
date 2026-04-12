/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { generateUuid } from '../../../base/common/uuid.js';
/**
 * Stateful mapper that tracks the "current" markdown and reasoning response
 * parts per session/turn so that streaming deltas can be routed to the correct
 * part via `partId`.
 *
 * Call {@link reset} when a new turn starts to clear tracked part IDs.
 */
export class AgentEventMapper {
    constructor() {
        /** Current markdown part ID per session. Reset on each new turn. */
        this._currentMarkdownPartId = new Map();
        /** Current reasoning part ID per session. Reset on each new turn. */
        this._currentReasoningPartId = new Map();
    }
    /**
     * Resets tracked part IDs for a session (call when a new turn starts).
     */
    reset(session) {
        this._currentMarkdownPartId.delete(session);
        this._currentReasoningPartId.delete(session);
    }
    /**
     * Maps a flat {@link IAgentProgressEvent} from the agent host into
     * protocol {@link ISessionAction}(s) suitable for dispatch to the reducer.
     *
     * Returns `undefined` for events that have no corresponding action.
     * May return an array when a single SDK event maps to multiple protocol actions.
     */
    mapProgressEventToActions(event, session, turnId) {
        switch (event.type) {
            case 'delta': {
                const e = event;
                const existingPartId = this._currentMarkdownPartId.get(session);
                if (!existingPartId) {
                    // Create a new markdown part with the content directly
                    const partId = generateUuid();
                    this._currentMarkdownPartId.set(session, partId);
                    return {
                        type: "session/responsePart" /* ActionType.SessionResponsePart */,
                        session,
                        turnId,
                        part: { kind: "markdown" /* ResponsePartKind.Markdown */, id: partId, content: e.content },
                    };
                }
                return {
                    type: "session/delta" /* ActionType.SessionDelta */,
                    session,
                    turnId,
                    partId: existingPartId,
                    content: e.content,
                };
            }
            case 'tool_start': {
                // A new tool call invalidates the current markdown part so the
                // next text delta creates a fresh part after the tool call.
                this._currentMarkdownPartId.delete(session);
                // The Copilot SDK provides full parameters at tool_start time.
                // We emit both toolCallStart (streaming → created) and toolCallReady
                // (params complete → running with auto-confirm) as a pair.
                const e = event;
                const startAction = {
                    type: "session/toolCallStart" /* ActionType.SessionToolCallStart */,
                    session,
                    turnId,
                    toolCallId: e.toolCallId,
                    toolName: e.toolName,
                    displayName: e.displayName,
                    _meta: { toolKind: e.toolKind, language: e.language },
                };
                const readyAction = {
                    type: "session/toolCallReady" /* ActionType.SessionToolCallReady */,
                    session,
                    turnId,
                    toolCallId: e.toolCallId,
                    invocationMessage: e.invocationMessage,
                    toolInput: e.toolInput,
                    confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
                };
                return [startAction, readyAction];
            }
            case 'tool_ready': {
                // A running tool requires re-confirmation (e.g. mid-execution permission).
                // Emit toolCallReady WITHOUT confirmed, which transitions
                // Running → PendingConfirmation in the reducer.
                const e = event;
                return {
                    type: "session/toolCallReady" /* ActionType.SessionToolCallReady */,
                    session,
                    turnId,
                    toolCallId: e.toolCallId,
                    invocationMessage: e.invocationMessage,
                    toolInput: e.toolInput,
                    confirmationTitle: e.confirmationTitle,
                };
            }
            case 'tool_complete': {
                const e = event;
                return {
                    type: "session/toolCallComplete" /* ActionType.SessionToolCallComplete */,
                    session,
                    turnId,
                    toolCallId: e.toolCallId,
                    result: e.result,
                };
            }
            case 'idle':
                return {
                    type: "session/turnComplete" /* ActionType.SessionTurnComplete */,
                    session,
                    turnId,
                };
            case 'error': {
                const e = event;
                return {
                    type: "session/error" /* ActionType.SessionError */,
                    session,
                    turnId,
                    error: {
                        errorType: e.errorType,
                        message: e.message,
                        stack: e.stack,
                    },
                };
            }
            case 'usage': {
                const e = event;
                return {
                    type: "session/usage" /* ActionType.SessionUsage */,
                    session,
                    turnId,
                    usage: {
                        inputTokens: e.inputTokens,
                        outputTokens: e.outputTokens,
                        model: e.model,
                        cacheReadTokens: e.cacheReadTokens,
                    },
                };
            }
            case 'title_changed':
                return {
                    type: "session/titleChanged" /* ActionType.SessionTitleChanged */,
                    session,
                    title: event.title,
                };
            case 'reasoning': {
                const e = event;
                const existingPartId = this._currentReasoningPartId.get(session);
                if (!existingPartId) {
                    // Create a new reasoning part with the content directly
                    const partId = generateUuid();
                    this._currentReasoningPartId.set(session, partId);
                    return {
                        type: "session/responsePart" /* ActionType.SessionResponsePart */,
                        session,
                        turnId,
                        part: { kind: "reasoning" /* ResponsePartKind.Reasoning */, id: partId, content: e.content },
                    };
                }
                return {
                    type: "session/reasoning" /* ActionType.SessionReasoning */,
                    session,
                    turnId,
                    partId: existingPartId,
                    content: e.content,
                };
            }
            case 'message': {
                // The SDK fires a `message` event with the complete assembled
                // content after all streaming deltas. If delta events already
                // captured the text (tracked via _currentMarkdownPartId), skip.
                // Otherwise the text arrived without preceding deltas (e.g.
                // after tool calls), so emit a new response part.
                const e = event;
                if (e.role !== 'assistant' || !e.content) {
                    return undefined;
                }
                const existingPartId = this._currentMarkdownPartId.get(session);
                if (existingPartId) {
                    // Deltas already streamed the content for this part
                    return undefined;
                }
                const partId = generateUuid();
                this._currentMarkdownPartId.set(session, partId);
                return {
                    type: "session/responsePart" /* ActionType.SessionResponsePart */,
                    session,
                    turnId,
                    part: { kind: "markdown" /* ResponsePartKind.Markdown */, id: partId, content: e.content },
                };
            }
            default:
                return undefined;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRFdmVudE1hcHBlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50RXZlbnRNYXBwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBeUI1RDs7Ozs7O0dBTUc7QUFDSCxNQUFNLE9BQU8sZ0JBQWdCO0lBQTdCO1FBQ0Msb0VBQW9FO1FBQ25ELDJCQUFzQixHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO1FBQ3BFLHFFQUFxRTtRQUNwRCw0QkFBdUIsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztJQWtNdEUsQ0FBQztJQWhNQTs7T0FFRztJQUNILEtBQUssQ0FBQyxPQUFlO1FBQ3BCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0gseUJBQXlCLENBQUMsS0FBMEIsRUFBRSxPQUFZLEVBQUUsTUFBYztRQUNqRixRQUFRLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNwQixLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ2QsTUFBTSxDQUFDLEdBQUcsS0FBeUIsQ0FBQztnQkFDcEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDaEUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO29CQUNyQix1REFBdUQ7b0JBQ3ZELE1BQU0sTUFBTSxHQUFHLFlBQVksRUFBRSxDQUFDO29CQUM5QixJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLE9BQU8s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