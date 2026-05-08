/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { URI } from '../../../../base/common/uri.js';
import type { ILogService } from '../../../log/common/log.js';
import type { AgentSignal } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ResponsePartKind } from '../../common/state/sessionState.js';

/**
 * Map one SDK message to zero or more agent signals.
 *
 * Pure function — no state. Phase 6 sets `canUseTool: deny`, so a turn
 * is exactly one assistant message; `BetaRawContentBlockStartEvent.index`
 * is therefore monotonic within a turn and can be used directly as a
 * partId disambiguator: `${turnId}#${index}`. Phase 7 introduces
 * multi-message turns (text → tool_use → tool_result → text) where the
 * SDK resets `index` per message; the mapper will then need to mix in
 * `message.id` (or an equivalent per-message counter) to keep partIds
 * collision-free.
 *
 * Phase 6 emits:
 * - {@link ActionType.SessionResponsePart} (Markdown) on
 *   `content_block_start` with a `text` block.
 * - {@link ActionType.SessionResponsePart} (Reasoning) on
 *   `content_block_start` with a `thinking` block.
 * - {@link ActionType.SessionDelta} on `content_block_delta` with a
 *   `text_delta`.
 * - {@link ActionType.SessionReasoning} on `content_block_delta` with a
 *   `thinking_delta`.
 * - {@link ActionType.SessionTurnComplete} on `result`.
 *
 * Reducer ordering invariant: `SessionResponsePart` MUST precede the
 * first `SessionDelta` / `SessionReasoning` for that part id (see
 * `actions.ts:233, 540`). The SDK protocol orders `content_block_start`
 * before any delta at the same index, so the invariant holds by
 * construction. An out-of-protocol delta with no preceding start is a
 * reducer no-op (`reducers.ts:240`), so no defensive guard is needed.
 */
export function mapSDKMessageToAgentSignals(
	message: SDKMessage,
	session: URI,
	turnId: string,
	logService: ILogService,
): AgentSignal[] {
	switch (message.type) {
		case 'stream_event':
			return mapStreamEvent(message.event, session, turnId, logService);
		case 'result':
			return mapResult(message, session, turnId);
		case 'assistant':
			return mapAssistantCanonical(message, logService);
		default:
			return [];
	}
}

/**
 * Handle the canonical {@link SDKAssistantMessage} (`type: 'assistant'`)
 * the SDK delivers as the final, authoritative message for a turn,
 * alongside its `'stream_event'` partials. CONTEXT.md M8:875 names this
 * envelope canonical: in principle the host could replace whatever the
 * partial accumulator built. In practice the protocol reducer is
 * append-only — there is no `SessionResponsePart` replacement action —
 * so re-emitting `SessionResponsePart` / `SessionDelta` /
 * `SessionReasoning` here would duplicate, not reconcile, the activeTurn
 * content. With `Options.includePartialMessages: true` (Phase 6 sec. 3.4),
 * partials produce the same content the canonical message carries, so
 * dropping is the correct behavior.
 *
 * The remaining job is defense-in-depth: Phase 6 sets `canUseTool:
 * deny`, so the canonical message should never carry `tool_use` blocks.
 * If one arrives anyway (SDK race, future change, transport bug), warn
 * and drop — mirrors the {@link mapStreamEvent} `content_block_start`
 * `tool_use` warn-and-drop. Phase 7 lifts both warn-and-drop guards
 * once tool calls are wired through.
 */
function mapAssistantCanonical(
	message: Extract<SDKMessage, { type: 'assistant' }>,
	logService: ILogService,
): AgentSignal[] {
	for (const block of message.message.content) {
		if (block.type === 'tool_use') {
			logService.warn(`[claudeMapSessionEvents] dropped tool_use block on canonical SDKAssistantMessage (id=${block.id}, name=${block.name})`);
		}
	}
	return [];
}

function mapResult(
	message: Extract<SDKMessage, { type: 'result' }>,
	session: URI,
	turnId: string,
): AgentSignal[] {
	const sessionStr = session.toString();
	const signals: AgentSignal[] = [];
	if (message.subtype === 'success') {
		// `modelUsage` is keyed by model name; pick the first key as the
		// reported model. Phase 6 turns are single-model; multi-model
		// attribution is a Phase 7+ concern.
		const modelKey = Object.keys(message.modelUsage)[0];
		signals.push({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionUsage,
				session: sessionStr,
				turnId,
				usage: {
					inputTokens: message.usage.input_tokens,
					outputTokens: message.usage.output_tokens,
					cacheReadTokens: message.usage.cache_read_input_tokens,
					...(modelKey ? { model: modelKey } : {}),
				},
			},
		});
	}
	signals.push({
		kind: 'action',
		session,
		action: {
			type: ActionType.SessionTurnComplete,
			session: sessionStr,
			turnId,
		},
	});
	return signals;
}

function mapStreamEvent(
	event: Extract<SDKMessage, { type: 'stream_event' }>['event'],
	session: URI,
	turnId: string,
	logService: ILogService,
): AgentSignal[] {
	const sessionStr = session.toString();
	switch (event.type) {
		case 'content_block_start': {
			const block = event.content_block;
			if (block.type === 'text') {
				return [{
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionResponsePart,
						session: sessionStr,
						turnId,
						part: {
							kind: ResponsePartKind.Markdown,
							id: `${turnId}#${event.index}`,
							content: '',
						},
					},
				}];
			}
			if (block.type === 'thinking') {
				return [{
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionResponsePart,
						session: sessionStr,
						turnId,
						part: {
							kind: ResponsePartKind.Reasoning,
							id: `${turnId}#${event.index}`,
							content: '',
						},
					},
				}];
			}
			// Defense in depth: `canUseTool: deny` should prevent tool_use
			// from ever streaming, but if it does, skip + warn rather than
			// allocating a part the reducer doesn't have a handler for.
			if (block.type === 'tool_use') {
				logService.warn(`[claudeMapSessionEvents] dropped streamed tool_use block at index ${event.index}`);
				return [];
			}
			return [];
		}

		case 'content_block_delta': {
			const partId = `${turnId}#${event.index}`;
			if (event.delta.type === 'text_delta') {
				return [{
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionDelta,
						session: sessionStr,
						turnId,
						partId,
						content: event.delta.text,
					},
				}];
			}
			if (event.delta.type === 'thinking_delta') {
				return [{
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionReasoning,
						session: sessionStr,
						turnId,
						partId,
						content: event.delta.thinking,
					},
				}];
			}
			return [];
		}

		case 'message_start':
		case 'content_block_stop':
		case 'message_delta':
		case 'message_stop':
			return [];

		default:
			return [];
	}
}
