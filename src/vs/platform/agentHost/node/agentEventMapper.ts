/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import type {
	IAgentDeltaEvent,
	IAgentErrorEvent,
	IAgentMessageEvent,
	IAgentProgressEvent,
	IAgentReasoningEvent,
	IAgentTitleChangedEvent,
	IAgentToolCompleteEvent,
	IAgentToolContentChangedEvent,
	IAgentToolStartEvent,
	IAgentUsageEvent,
	IAgentUserInputRequestEvent
} from '../common/agentService.js';
import {
	ActionType,
	type ISessionAction,
	type ISessionErrorAction,
	type ISessionInputRequestedAction,
	type ITitleChangedAction,
	type IToolCallCompleteAction,
	type IToolCallReadyAction,
	type IToolCallStartAction,
	type ISessionToolCallContentChangedAction,
	type ITurnCompleteAction,
	type IUsageAction
} from '../common/state/sessionActions.js';
import { ResponsePartKind, ToolCallConfirmationReason, type URI } from '../common/state/sessionState.js';

/**
 * Stateful mapper that tracks the "current" markdown and reasoning response
 * parts per session/turn so that streaming deltas can be routed to the correct
 * part via `partId`.
 *
 * Call {@link reset} when a new turn starts to clear tracked part IDs.
 */
export class AgentEventMapper {
	/** Current markdown part ID per session. Reset on each new turn. */
	private readonly _currentMarkdownPartId = new Map<string, string>();
	/** Current reasoning part ID per session. Reset on each new turn. */
	private readonly _currentReasoningPartId = new Map<string, string>();

	/**
	 * Resets tracked part IDs for a session (call when a new turn starts).
	 */
	reset(session: string): void {
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
	mapProgressEventToActions(event: IAgentProgressEvent, session: URI, turnId: string): ISessionAction | ISessionAction[] | undefined {
		switch (event.type) {
			case 'delta': {
				const e = event as IAgentDeltaEvent;
				const existingPartId = this._currentMarkdownPartId.get(session);
				if (!existingPartId) {
					// Create a new markdown part with the content directly
					const partId = generateUuid();
					this._currentMarkdownPartId.set(session, partId);
					return {
						type: ActionType.SessionResponsePart,
						session,
						turnId,
						part: { kind: ResponsePartKind.Markdown, id: partId, content: e.content },
					};
				}
				return {
					type: ActionType.SessionDelta,
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
				const e = event as IAgentToolStartEvent;
				const meta: Record<string, unknown> = { toolKind: e.toolKind, language: e.language };

				// For subagent tools, extract agent metadata from tool arguments
				// so the renderer can display the name/description immediately.
				if (e.toolKind === 'subagent' && e.toolArguments) {
					try {
						const args = JSON.parse(e.toolArguments) as Record<string, unknown>;
						if (typeof args.description === 'string') {
							meta.subagentDescription = args.description;
						}
						if (typeof args.agentName === 'string') {
							meta.subagentAgentName = args.agentName;
						}
					} catch { /* ignore parse errors */ }
				}

				const startAction: IToolCallStartAction = {
					type: ActionType.SessionToolCallStart,
					session,
					turnId,
					toolCallId: e.toolCallId,
					toolName: e.toolName,
					displayName: e.displayName,
					toolClientId: e.toolClientId,
					_meta: meta,
				};

				// For client tools, do NOT auto-ready — the tool handler
				// will fire a separate tool_ready event once the deferred
				// is in place (or the permission flow fires it first).
				if (e.toolClientId) {
					return startAction;
				}

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

			case 'tool_ready': {
				// Two scenarios:
				// 1. Permission request: confirmationTitle is set →
				//    transition to PendingConfirmation (no `confirmed`).
				// 2. Client tool auto-ready: confirmationTitle is absent →
				//    transition to Running (`confirmed: NotNeeded`).
				const e = event;
				return {
					type: ActionType.SessionToolCallReady,
					session,
					turnId,
					toolCallId: e.toolCallId,
					invocationMessage: e.invocationMessage,
					toolInput: e.toolInput,
					confirmationTitle: e.confirmationTitle,
					...(!e.confirmationTitle ? { confirmed: ToolCallConfirmationReason.NotNeeded } : {}),
				} satisfies IToolCallReadyAction;
			}

			case 'tool_complete': {
				const e = event as IAgentToolCompleteEvent;
				return {
					type: ActionType.SessionToolCallComplete,
					session,
					turnId,
					toolCallId: e.toolCallId,
					result: e.result,
				} satisfies IToolCallCompleteAction;
			}

			case 'tool_content_changed': {
				const e = event as IAgentToolContentChangedEvent;
				return {
					type: ActionType.SessionToolCallContentChanged,
					session,
					turnId,
					toolCallId: e.toolCallId,
					content: e.content,
				} satisfies ISessionToolCallContentChangedAction;
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

			case 'reasoning': {
				const e = event as IAgentReasoningEvent;
				const existingPartId = this._currentReasoningPartId.get(session);
				if (!existingPartId) {
					// Create a new reasoning part with the content directly
					const partId = generateUuid();
					this._currentReasoningPartId.set(session, partId);
					return {
						type: ActionType.SessionResponsePart,
						session,
						turnId,
						part: { kind: ResponsePartKind.Reasoning, id: partId, content: e.content },
					};
				}
				return {
					type: ActionType.SessionReasoning,
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
				const e = event as IAgentMessageEvent;
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
					type: ActionType.SessionResponsePart,
					session,
					turnId,
					part: { kind: ResponsePartKind.Markdown, id: partId, content: e.content },
				};
			}

			case 'user_input_request': {
				const e = event as IAgentUserInputRequestEvent;
				return {
					type: ActionType.SessionInputRequested,
					session,
					request: e.request,
				} satisfies ISessionInputRequestedAction;
			}

			default:
				return undefined;
		}
	}
}
