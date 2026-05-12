/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { URI } from '../../../../base/common/uri.js';
import { LogLevel, type ILogService } from '../../../log/common/log.js';
import type { AgentSignal } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ResponsePartKind, ToolResultContentType, type ToolResultContent, type ToolResultFileEditContent } from '../../common/state/sessionState.js';
import { getClaudeToolDisplayName } from './claudeToolDisplay.js';

/**
 * Cross-call state for {@link mapSDKMessageToAgentSignals}. One instance
 * lives per {@link ClaudeAgentSession} and is threaded through every
 * mapper invocation for that session's lifetime.
 *
 * Three scopes:
 *
 * - **Per-message** (`activeToolBlocks`, `currentMessageId`): mirror
 *   the SDK's per-message `BetaRawContentBlockStartEvent.index`
 *   namespace. Reset on every `message_start`. `activeToolBlocks` lets
 *   `input_json_delta` look up the tool block that owns the current
 *   index. `currentMessageId` qualifies text/thinking part ids so a
 *   later message in the same turn does not collide with an earlier
 *   message that used the same `index` for a different block kind
 *   (e.g. turn one: `thinking@0`; turn two after `tool_result`:
 *   `text@0`).
 * - **Cross-message** (`toolCallTurnIds`, `toolCallNames`): a `tool_use`
 *   lands in one assistant message, the matching `tool_result` arrives
 *   in a later synthetic `user` message. Keyed by the SDK's globally-
 *   unique `block.id` so re-use of `index` between messages is harmless.
 *   Drained on `tool_result` (happy path) or on the turn's `result`
 *   envelope as a defense-in-depth fallback so an SDK that never
 *   delivers `tool_result` cannot leak entries across turns.
 *
 * Encapsulated as a class (vs. a plain interface) so the maps' mutators
 * are not part of the public surface — Phase 6.1's lesson — and the
 * lifecycle invariants live behind named methods.
 */
export class ClaudeMapperState {
	private readonly _activeToolBlocks = new Map<number, { toolUseId: string; toolName: string }>();
	private readonly _toolCallTurnIds = new Map<string, string>();
	private readonly _toolCallNames = new Map<string, string>();
	private _currentMessageId: string | undefined;

	/**
	 * Phase 8 — file-edit content pre-staged by
	 * `ClaudeAgentSession._observeUserMessage` and consumed by
	 * {@link mapUserMessage} when the matching `tool_result` arrives.
	 * Keyed by SDK `tool_use_id`. The session's `_processMessages` loop
	 * awaits the after-snapshot before invoking the synchronous mapper,
	 * so by the time `takeFileEdit` is called the entry is always
	 * populated for tracked file-edit tools.
	 */
	private readonly _completedFileEdits = new Map<string, ToolResultFileEditContent>();

	/**
	 * Reset per-message state. Called on `message_start`. Cross-message
	 * tool-call tracking is deliberately NOT cleared here — the
	 * `tool_result` for a `tool_use` arrives in a later message.
	 */
	resetMessage(messageId: string): void {
		this._activeToolBlocks.clear();
		this._currentMessageId = messageId;
	}

	getCurrentMessageId(): string | undefined {
		return this._currentMessageId;
	}

	/**
	 * Open a tool block at the given content-block index. Seeds both
	 * scopes; the per-message map gets drained on `content_block_stop`,
	 * the cross-message maps survive until the matching `tool_result`.
	 */
	startToolBlock(index: number, toolUseId: string, toolName: string, turnId: string): void {
		this._activeToolBlocks.set(index, { toolUseId, toolName });
		this._toolCallTurnIds.set(toolUseId, turnId);
		this._toolCallNames.set(toolUseId, toolName);
	}

	getActiveToolBlock(index: number): { toolUseId: string; toolName: string } | undefined {
		return this._activeToolBlocks.get(index);
	}

	endToolBlock(index: number): void {
		this._activeToolBlocks.delete(index);
	}

	/**
	 * Cross-message lookup for `tool_result` handling. Returns
	 * `undefined` if the `tool_use_id` is unknown (defense-in-depth
	 * against transport drift / replay).
	 */
	lookupToolCall(toolUseId: string): { turnId: string; toolName: string } | undefined {
		const turnId = this._toolCallTurnIds.get(toolUseId);
		const toolName = this._toolCallNames.get(toolUseId);
		if (turnId === undefined || toolName === undefined) {
			return undefined;
		}
		return { turnId, toolName };
	}

	/** Drain cross-message tracking once a `tool_result` is delivered. */
	completeToolCall(toolUseId: string): void {
		this._toolCallTurnIds.delete(toolUseId);
		this._toolCallNames.delete(toolUseId);
	}

	/**
	 * Phase 8 — stash a {@link ToolResultFileEditContent} produced by
	 * `ClaudeAgentSession._observeUserMessage` so the synchronous mapper
	 * can append it to the matching `SessionToolCallComplete` action.
	 */
	cacheFileEdit(toolUseId: string, content: ToolResultFileEditContent): void {
		this._completedFileEdits.set(toolUseId, content);
	}

	/**
	 * Phase 8 — consume and remove the cached file edit for this
	 * `tool_use_id`. Returns `undefined` for non-file-edit tools or for
	 * file-edit tools where snapshotting was skipped (e.g. denied before
	 * the SDK ran the tool, or no actual file change occurred).
	 */
	takeFileEdit(toolUseId: string): ToolResultFileEditContent | undefined {
		const content = this._completedFileEdits.get(toolUseId);
		if (content) {
			this._completedFileEdits.delete(toolUseId);
		}
		return content;
	}

	/**
	 * Drop any cross-message tracking that is still pending at the end
	 * of a turn. A `tool_use` whose `tool_result` never arrives — model
	 * misbehavior, transport drop, future cancellation — would otherwise
	 * survive in the maps for the lifetime of the session and accumulate
	 * across turns. Called from {@link mapResult} on every `result`
	 * envelope; warns once per orphan to surface the protocol break.
	 */
	clearPendingToolCalls(logService: ILogService): void {
		if (this._toolCallTurnIds.size === 0) {
			return;
		}
		for (const [toolUseId, turnId] of this._toolCallTurnIds) {
			const toolName = this._toolCallNames.get(toolUseId) ?? '<unknown>';
			logService.warn(`[claudeMapSessionEvents] turn ${turnId} ended with pending tool_use ${toolUseId} (${toolName}); dropping cross-message state`);
		}
		this._toolCallTurnIds.clear();
		this._toolCallNames.clear();
	}
}

/**
 * Map one SDK message to zero or more agent signals.
 *
 * Stateful via {@link ClaudeMapperState} as of Phase 7: per-block tool
 * tracking is per-message, cross-block `tool_use` → `tool_result`
 * linkage is cross-message. Callers MUST thread one shared state
 * instance through every invocation for a given session.
 *
 * Phase 6 emissions (text / thinking / usage / turn complete) are
 * unchanged and stateless. Phase 7 adds:
 *
 * - {@link ActionType.SessionToolCallStart} on
 *   `content_block_start` with a `tool_use` block.
 * - {@link ActionType.SessionToolCallDelta} on `content_block_delta`
 *   with an `input_json_delta`.
 * - {@link ActionType.SessionToolCallComplete} on a synthetic `user`
 *   message whose `message.content` includes a `tool_result` block —
 *   the originating `turnId` is recovered from {@link ClaudeMapperState}
 *   so the action lands on the correct turn even when the result
 *   arrives in a later message.
 *
 * Reducer ordering invariant: `SessionResponsePart` MUST precede the
 * first `SessionDelta` / `SessionReasoning` for that part id (see
 * `actions.ts:233, 540`). The same holds for tool calls
 * (`SessionToolCallStart` precedes `SessionToolCallDelta` and
 * `SessionToolCallComplete`). The SDK protocol orders
 * `content_block_start` before any delta at the same index, and
 * `tool_result` cannot arrive before its matching `tool_use`, so the
 * invariant holds by construction.
 */
export function mapSDKMessageToAgentSignals(
	message: SDKMessage,
	session: URI,
	turnId: string,
	state: ClaudeMapperState,
	logService: ILogService,
): AgentSignal[] {
	if (logService.getLevel() <= LogLevel.Trace) {
		try {
			const snippet = JSON.stringify(message, (k, v) => typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v);
			logService.trace(`[claudeMapSessionEvents] SDK message type=${message.type}: ${snippet?.slice(0, 2000) ?? '<unserializable>'}`);
		} catch {
			logService.trace(`[claudeMapSessionEvents] SDK message type=${message.type} (unserializable)`);
		}
	}
	switch (message.type) {
		case 'stream_event':
			return mapStreamEvent(message.event, session, turnId, state, logService);
		case 'result':
			return mapResult(message, session, turnId, state, logService);
		case 'assistant':
			return mapAssistantCanonical();
		case 'user':
			return mapUserMessage(message, session, state, logService);
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
 * so re-emitting any of the per-block actions here would duplicate, not
 * reconcile, the activeTurn content. With
 * `Options.includePartialMessages: true` (Phase 6 S3.4), partials
 * produce the same content the canonical message carries, so dropping
 * is the correct behavior for every block kind, including `tool_use`
 * (Phase 7's partial-stream handler at `mapStreamEvent` already emitted
 * the `SessionToolCallStart`).
 */
function mapAssistantCanonical(): AgentSignal[] {
	return [];
}

/**
 * Handle synthetic `user` messages whose `message.content` carries
 * `tool_result` blocks. The SDK delivers these as the response to a
 * prior `tool_use`. Per Phase 7 S3.3.4, each such block emits a
 * {@link ActionType.SessionToolCallComplete} action targeting the turn
 * that owned the original `tool_use`.
 *
 * Cross-message linkage is via {@link ClaudeMapperState.lookupToolCall};
 * unknown `tool_use_id`s warn and drop (defense-in-depth, mirrors the
 * Phase 7 plan S3.3.5 directive).
 */
function mapUserMessage(
	message: Extract<SDKMessage, { type: 'user' }>,
	session: URI,
	state: ClaudeMapperState,
	logService: ILogService,
): AgentSignal[] {
	const content = message.message.content;
	if (!Array.isArray(content)) {
		return [];
	}

	const sessionStr = session.toString();
	const signals: AgentSignal[] = [];
	for (const block of content) {
		if (block.type !== 'tool_result') {
			continue;
		}
		const tracked = state.lookupToolCall(block.tool_use_id);
		if (!tracked) {
			logService.warn(`[claudeMapSessionEvents] tool_result for unknown tool_use_id ${block.tool_use_id}`);
			continue;
		}
		const isError = block.is_error === true;
		const content: ToolResultContent[] = extractToolResultContent(block.content) ?? [];
		const fileEdit = state.takeFileEdit(block.tool_use_id);
		if (fileEdit) {
			content.push(fileEdit);
		}
		signals.push({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallComplete,
				session: sessionStr,
				turnId: tracked.turnId,
				toolCallId: block.tool_use_id,
				result: {
					success: !isError,
					pastTenseMessage: `${getClaudeToolDisplayName(tracked.toolName)} finished`,
					content: content.length > 0 ? content : undefined,
				},
			},
		});
		state.completeToolCall(block.tool_use_id);
	}
	return signals;
}

/**
 * Project the SDK's `ToolResultBlockParam.content` into the protocol's
 * text content shape. The SDK accepts either a bare string (legacy
 * shape) or an array of typed blocks; non-text blocks are dropped
 * here. Phase 8 file-edit content is appended separately by
 * {@link mapUserMessage} from {@link ClaudeMapperState.takeFileEdit}.
 */
function extractToolResultContent(content: unknown): { type: ToolResultContentType.Text; text: string }[] | undefined {
	if (typeof content === 'string') {
		return [{ type: ToolResultContentType.Text, text: content }];
	}
	if (!Array.isArray(content)) {
		return undefined;
	}
	const out: { type: ToolResultContentType.Text; text: string }[] = [];
	for (const block of content) {
		if (isToolResultTextBlock(block)) {
			out.push({ type: ToolResultContentType.Text, text: block.text });
		}
	}
	return out.length > 0 ? out : undefined;
}

function isToolResultTextBlock(block: unknown): block is { type: 'text'; text: string } {
	if (block === null || typeof block !== 'object') {
		return false;
	}
	const candidate = block as { type?: unknown; text?: unknown };
	return candidate.type === 'text' && typeof candidate.text === 'string';
}

function mapResult(
	message: Extract<SDKMessage, { type: 'result' }>,
	session: URI,
	turnId: string,
	state: ClaudeMapperState,
	logService: ILogService,
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
	state.clearPendingToolCalls(logService);
	return signals;
}

function mapStreamEvent(
	event: Extract<SDKMessage, { type: 'stream_event' }>['event'],
	session: URI,
	turnId: string,
	state: ClaudeMapperState,
	logService: ILogService,
): AgentSignal[] {
	const sessionStr = session.toString();
	switch (event.type) {
		case 'message_start':
			state.resetMessage(event.message.id);
			return [];

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
							id: makeContentBlockPartId(turnId, state, event.index, logService),
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
							id: makeContentBlockPartId(turnId, state, event.index, logService),
							content: '',
						},
					},
				}];
			}
			if (block.type === 'tool_use') {
				state.startToolBlock(event.index, block.id, block.name, turnId);
				return [{
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionToolCallStart,
						session: sessionStr,
						turnId,
						toolCallId: block.id,
						toolName: block.name,
						displayName: getClaudeToolDisplayName(block.name),
					},
				}];
			}
			return [];
		}

		case 'content_block_delta': {
			if (event.delta.type === 'text_delta') {
				return [{
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionDelta,
						session: sessionStr,
						turnId,
						partId: makeContentBlockPartId(turnId, state, event.index, logService),
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
						partId: makeContentBlockPartId(turnId, state, event.index, logService),
						content: event.delta.thinking,
					},
				}];
			}
			if (event.delta.type === 'input_json_delta') {
				const tracked = state.getActiveToolBlock(event.index);
				if (!tracked) {
					logService.warn(`[claudeMapSessionEvents] input_json_delta for unknown content-block index ${event.index}`);
					return [];
				}
				return [{
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionToolCallDelta,
						session: sessionStr,
						turnId,
						toolCallId: tracked.toolUseId,
						content: event.delta.partial_json,
					},
				}];
			}
			return [];
		}

		case 'content_block_stop':
			state.endToolBlock(event.index);
			return [];

		case 'message_delta':
		case 'message_stop':
			return [];

		default:
			return [];
	}
}

/**
 * Build the {@link ResponsePartKind.Markdown}/{@link ResponsePartKind.Reasoning}
 * id for a text or thinking content block. Qualifying with the SDK's
 * per-message id is required: a single turn can span multiple SDK
 * messages (e.g. assistant message → tool_use → tool_result → assistant
 * message) and `event.index` resets to 0 on each new `message_start`.
 * Without the message-id qualifier, a `text@0` block in the second
 * message collides with a `thinking@0` block in the first and the
 * reducer treats it as a duplicate, dropping the follow-up text.
 *
 * If `currentMessageId` is missing we fall back to the legacy
 * `${turnId}#${index}` form and warn — the SDK protocol guarantees
 * `message_start` precedes any content block, so the absence is a real
 * bug, not a transport reorder.
 */
function makeContentBlockPartId(
	turnId: string,
	state: ClaudeMapperState,
	index: number,
	logService: ILogService,
): string {
	const messageId = state.getCurrentMessageId();
	if (messageId === undefined) {
		logService.warn(`[claudeMapSessionEvents] content block at index ${index} arrived before message_start; using turn-scoped id`);
		return `${turnId}#${index}`;
	}
	return `${turnId}#${messageId}#${index}`;
}

