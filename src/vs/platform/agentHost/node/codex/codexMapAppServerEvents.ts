/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { ActionType, type SessionAction } from '../../common/state/sessionActions.js';
import { ResponsePartKind, TurnState } from '../../common/state/sessionState.js';
import type { AgentMessageDeltaNotification } from './protocol/generated/v2/AgentMessageDeltaNotification.js';
import type { ItemCompletedNotification } from './protocol/generated/v2/ItemCompletedNotification.js';
import type { ItemStartedNotification } from './protocol/generated/v2/ItemStartedNotification.js';
import type { TurnCompletedNotification } from './protocol/generated/v2/TurnCompletedNotification.js';
import type { TurnStartedNotification } from './protocol/generated/v2/TurnStartedNotification.js';

/**
 * Per-session mutable state held by the mapper. Carries the bookkeeping
 * needed to glue codex's item-stream (each `agentMessage` item has its
 * own id) to the agent host protocol (each markdown part has its own id).
 *
 * Phase 2 tracks only `itemId → partId` for agent messages. Phase 4
 * extends this with tool-call correlation; Phase 6 adds reasoning parts.
 */
export interface ICodexSessionMapState {
	/** Stable codex `itemId` → our markdown response part id. */
	readonly itemToPartId: Map<string, string>;
	/** Current turn id (per `turn/started`). */
	currentTurnId: string | undefined;
}

export function createCodexSessionMapState(): ICodexSessionMapState {
	return {
		itemToPartId: new Map(),
		currentTurnId: undefined,
	};
}

/**
 * Translate `turn/started` into a `SessionTurnStarted` action.
 *
 * Codex's `turn/started.turn.items[0]` SHOULD be the userMessage that
 * kicked off the turn; we reconstruct the user message from it. If
 * codex didn't include items (it may not), we synthesize an empty user
 * message so the agent host can still create the turn shell — the actual
 * prompt text was sent via `turn/start` and is already known by the host
 * via the prior `sendMessage` call.
 */
export function mapTurnStarted(
	state: ICodexSessionMapState,
	params: TurnStartedNotification,
	fallbackUserText: string,
): SessionAction[] {
	state.currentTurnId = params.turn.id;
	state.itemToPartId.clear();
	let userText = fallbackUserText;
	const first = params.turn.items?.[0];
	if (first && first.type === 'userMessage') {
		const collected: string[] = [];
		for (const c of first.content) {
			if (c.type === 'text') {
				collected.push(c.text);
			}
		}
		if (collected.length > 0) {
			userText = collected.join('\n\n');
		}
	}
	return [
		{
			type: ActionType.SessionTurnStarted,
			turnId: params.turn.id,
			userMessage: { text: userText },
		},
	];
}

/**
 * `item/started` for an `agentMessage` becomes a `SessionResponsePart`
 * action with an empty `MarkdownResponsePart` shell. Subsequent
 * `item/agentMessage/delta` notifications append to that part.
 *
 * Other item types are ignored in Phase 2 — they'll be picked up by
 * Phase 6's tool-call mapper.
 */
export function mapItemStarted(
	state: ICodexSessionMapState,
	params: ItemStartedNotification,
): SessionAction[] {
	if (params.item.type !== 'agentMessage') {
		return [];
	}
	const partId = generateUuid();
	state.itemToPartId.set(params.item.id, partId);
	return [
		{
			type: ActionType.SessionResponsePart,
			turnId: params.turnId,
			part: {
				kind: ResponsePartKind.Markdown,
				id: partId,
				content: params.item.text ?? '',
			},
		},
	];
}

export function mapAgentMessageDelta(
	state: ICodexSessionMapState,
	params: AgentMessageDeltaNotification,
): SessionAction[] {
	const partId = state.itemToPartId.get(params.itemId);
	if (!partId) {
		// Got a delta before we saw the corresponding `item/started`.
		// Drop it — Phase 2 is best-effort and the lost text is replaced
		// when `item/completed` arrives with the full `text` field.
		return [];
	}
	return [
		{
			type: ActionType.SessionDelta,
			turnId: params.turnId,
			partId,
			content: params.delta,
		},
	];
}

/**
 * `item/completed` for an `agentMessage` — the part is finalized server
 * side. For Phase 2 we don't need to emit an extra action: the deltas
 * already updated the part's content. We just drop the mapping so the
 * memory pressure stays bounded.
 */
export function mapItemCompleted(
	state: ICodexSessionMapState,
	params: ItemCompletedNotification,
): SessionAction[] {
	if (params.item.type === 'agentMessage') {
		state.itemToPartId.delete(params.item.id);
	}
	return [];
}

/**
 * `turn/completed` translates to either a normal complete signal or, when
 * the turn ended with `status: 'failed'`, an error followed by the
 * complete signal so consumers can react to both.
 */
export function mapTurnCompleted(
	state: ICodexSessionMapState,
	params: TurnCompletedNotification,
): SessionAction[] {
	state.currentTurnId = undefined;
	state.itemToPartId.clear();
	const turnId = params.turn.id;
	const status = params.turn.status;
	if (status === 'failed' && params.turn.error) {
		const errMessage = params.turn.error.message ?? 'Codex turn failed';
		return [
			{
				type: ActionType.SessionError,
				turnId,
				error: {
					errorType: 'CodexError',
					message: errMessage,
				},
			},
			{
				type: ActionType.SessionTurnComplete,
				turnId,
			},
		];
	}
	if (status === 'interrupted') {
		return [{ type: ActionType.SessionTurnCancelled, turnId }];
	}
	return [{ type: ActionType.SessionTurnComplete, turnId }];
}

/**
 * Build a {@link TurnState} from a codex `Turn.status`. Mostly useful
 * for replay (Phase 3).
 */
export function turnStateFromStatus(status: string): TurnState {
	switch (status) {
		case 'completed':
			return TurnState.Complete;
		case 'interrupted':
			return TurnState.Cancelled;
		case 'failed':
			return TurnState.Error;
		default:
			return TurnState.Complete;
	}
}
