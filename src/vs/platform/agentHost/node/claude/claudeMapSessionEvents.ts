/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { generateUuid } from '../../../../base/common/uuid.js';
import type { URI } from '../../../../base/common/uri.js';
import type { ILogService } from '../../../log/common/log.js';
import type { AgentSignal } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ResponsePartKind } from '../../common/state/sessionState.js';

/**
 * Mutable mapping state owned by `ClaudeAgentSession` and threaded into
 * {@link mapSDKMessageToAgentSignals}. Kept on the session — not in this
 * module — so multiple sessions don't share state and the mapper itself
 * stays a pure function.
 */
export interface IClaudeMapperState {
	/**
	 * Maps content_block index → response part id. Populated on
	 * `content_block_start`, drained on `content_block_stop`, cleared on
	 * `message_start`. Used to route `content_block_delta` events to
	 * the right `SessionDelta` / `SessionReasoning` partId.
	 */
	readonly currentBlockParts: Map<number, string>;
}

/**
 * Map one SDK message to zero or more agent signals.
 *
 * Pure function. All state is in {@link IClaudeMapperState}, which the
 * caller owns. Tests can therefore exercise the mapper directly with a
 * fake state object.
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
 * `actions.ts:233, 540`). This mapper allocates the part on
 * `content_block_start` BEFORE any delta can arrive — deltas are
 * SDK-ordered after the start — so the invariant holds by construction.
 */
export function mapSDKMessageToAgentSignals(
	message: SDKMessage,
	session: URI,
	turnId: string,
	state: IClaudeMapperState,
	logService: ILogService,
): AgentSignal[] {
	switch (message.type) {
		case 'stream_event':
			return mapStreamEvent(message.event, session, turnId, state, logService);
		case 'result':
			return mapResult(message, session, turnId);
		default:
			return [];
	}
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
	state: IClaudeMapperState,
	logService: ILogService,
): AgentSignal[] {
	const sessionStr = session.toString();
	switch (event.type) {
		case 'message_start':
			state.currentBlockParts.clear();
			return [];

		case 'content_block_start': {
			const block = event.content_block;
			if (block.type === 'text') {
				const partId = generateUuid();
				state.currentBlockParts.set(event.index, partId);
				return [{
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionResponsePart,
						session: sessionStr,
						turnId,
						part: {
							kind: ResponsePartKind.Markdown,
							id: partId,
							content: '',
						},
					},
				}];
			}
			if (block.type === 'thinking') {
				const partId = generateUuid();
				state.currentBlockParts.set(event.index, partId);
				return [{
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionResponsePart,
						session: sessionStr,
						turnId,
						part: {
							kind: ResponsePartKind.Reasoning,
							id: partId,
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
			const partId = state.currentBlockParts.get(event.index);
			if (partId === undefined) {
				return [];
			}
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

		case 'content_block_stop':
			state.currentBlockParts.delete(event.index);
			return [];

		case 'message_delta':
		case 'message_stop':
			return [];

		default:
			return [];
	}
}
