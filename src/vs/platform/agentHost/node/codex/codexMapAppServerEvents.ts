/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { ActionType, type SessionAction } from '../../common/state/sessionActions.js';
import { ResponsePartKind, ToolCallConfirmationReason, ToolResultContentType, TurnState } from '../../common/state/sessionState.js';
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
	/**
	 * Stable codex `itemId` → tool-call bookkeeping. Phase 4 tracks
	 * `commandExecution` here so completion/approval handlers can find
	 * the right toolCallId/turnId for each item.
	 */
	readonly itemToToolCall: Map<string, ICodexToolCallEntry>;
	/** Current turn id (per `turn/started`). */
	currentTurnId: string | undefined;
}

export interface ICodexToolCallEntry {
	readonly toolCallId: string;
	readonly turnId: string;
	readonly toolName: string;
}

export function createCodexSessionMapState(): ICodexSessionMapState {
	return {
		itemToPartId: new Map(),
		itemToToolCall: new Map(),
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
	state.itemToToolCall.clear();
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
	if (params.item.type === 'agentMessage') {
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
	if (params.item.type === 'commandExecution') {
		// Phase 4: surface shell commands as tool calls. We allocate a
		// fresh toolCallId; the `commandExecution` item id only
		// disambiguates the codex side.
		const toolCallId = generateUuid();
		state.itemToToolCall.set(params.item.id, {
			toolCallId,
			turnId: params.turnId,
			toolName: 'shell',
		});
		const command = params.item.command ?? '';
		return [
			{
				type: ActionType.SessionToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName: 'shell',
				displayName: 'Run shell command',
			},
			{
				type: ActionType.SessionToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: command,
			},
		];
	}
	return [];
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
 *
 * For `commandExecution`, emit a synthetic `SessionToolCallReady`
 * (auto-confirmed; the codex server already decided to run the command
 * — any host-side approval was settled via the `requestApproval`
 * server-request handler before we got here) followed by a
 * `SessionToolCallComplete` carrying the aggregated output.
 */
export function mapItemCompleted(
	state: ICodexSessionMapState,
	params: ItemCompletedNotification,
): SessionAction[] {
	if (params.item.type === 'agentMessage') {
		state.itemToPartId.delete(params.item.id);
		return [];
	}
	if (params.item.type === 'commandExecution') {
		const entry = state.itemToToolCall.get(params.item.id);
		if (!entry) {
			return [];
		}
		state.itemToToolCall.delete(params.item.id);
		const success = params.item.status === 'completed' && (params.item.exitCode === 0 || params.item.exitCode === null);
		const output = params.item.aggregatedOutput ?? '';
		const command = params.item.command ?? '';
		const exit = params.item.exitCode;
		const pastTense = success
			? `Ran \`${command}\``
			: exit !== null
				? `Ran \`${command}\` (exit ${exit})`
				: `Ran \`${command}\` (failed)`;
		return [
			{
				type: ActionType.SessionToolCallReady,
				turnId: entry.turnId,
				toolCallId: entry.toolCallId,
				invocationMessage: command,
				toolInput: command,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			},
			{
				type: ActionType.SessionToolCallComplete,
				turnId: entry.turnId,
				toolCallId: entry.toolCallId,
				result: {
					success,
					pastTenseMessage: pastTense,
					content: output
						? [{ type: ToolResultContentType.Text, text: output }]
						: undefined,
					error: success ? undefined : {
						message: exit !== null ? `Exit code ${exit}` : 'Command failed',
					},
				},
			},
		];
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
