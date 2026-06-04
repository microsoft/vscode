/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { ActionType, type SessionAction } from '../../common/state/sessionActions.js';
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolResultContentType, TurnState } from '../../common/state/sessionState.js';
import type { AgentMessageDeltaNotification } from './protocol/generated/v2/AgentMessageDeltaNotification.js';
import type { CommandExecutionOutputDeltaNotification } from './protocol/generated/v2/CommandExecutionOutputDeltaNotification.js';
import type { FileChangeOutputDeltaNotification } from './protocol/generated/v2/FileChangeOutputDeltaNotification.js';
import type { FileChangePatchUpdatedNotification } from './protocol/generated/v2/FileChangePatchUpdatedNotification.js';
import type { FileUpdateChange } from './protocol/generated/v2/FileUpdateChange.js';
import type { ItemCompletedNotification } from './protocol/generated/v2/ItemCompletedNotification.js';
import type { ItemStartedNotification } from './protocol/generated/v2/ItemStartedNotification.js';
import type { McpToolCallProgressNotification } from './protocol/generated/v2/McpToolCallProgressNotification.js';
import type { McpToolCallResult } from './protocol/generated/v2/McpToolCallResult.js';
import type { ReasoningSummaryPartAddedNotification } from './protocol/generated/v2/ReasoningSummaryPartAddedNotification.js';
import type { ReasoningSummaryTextDeltaNotification } from './protocol/generated/v2/ReasoningSummaryTextDeltaNotification.js';
import type { ReasoningTextDeltaNotification } from './protocol/generated/v2/ReasoningTextDeltaNotification.js';
import type { ThreadTokenUsageUpdatedNotification } from './protocol/generated/v2/ThreadTokenUsageUpdatedNotification.js';
import type { TurnCompletedNotification } from './protocol/generated/v2/TurnCompletedNotification.js';
import type { TurnStartedNotification } from './protocol/generated/v2/TurnStartedNotification.js';
import type { WebSearchAction } from './protocol/generated/v2/WebSearchAction.js';
import type { DynamicToolCallOutputContentItem } from './protocol/generated/v2/DynamicToolCallOutputContentItem.js';
import type { JsonValue } from './protocol/generated/serde_json/JsonValue.js';

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
	/** Stable codex reasoning item/index → our reasoning response part id. */
	readonly itemToReasoningPartId: Map<string, string>;
	/** Current turn id (per `turn/started`). */
	currentTurnId: string | undefined;
}

export interface ICodexToolCallEntry {
	readonly toolCallId: string;
	readonly turnId: string;
	readonly toolName: string;
	output: string;
}

export function createCodexSessionMapState(): ICodexSessionMapState {
	return {
		itemToPartId: new Map(),
		itemToToolCall: new Map(),
		itemToReasoningPartId: new Map(),
		currentTurnId: undefined,
	};
}

function reasoningKey(itemId: string, kind: 'summary' | 'text', index: number): string {
	return `${itemId}:${kind}:${index}`;
}

function ensureReasoningPart(state: ICodexSessionMapState, turnId: string, key: string): { readonly partId: string; readonly actions: SessionAction[] } {
	const existing = state.itemToReasoningPartId.get(key);
	if (existing) {
		return { partId: existing, actions: [] };
	}
	const partId = generateUuid();
	state.itemToReasoningPartId.set(key, partId);
	return {
		partId,
		actions: [{
			type: ActionType.SessionResponsePart,
			turnId,
			part: { kind: ResponsePartKind.Reasoning, id: partId, content: '' },
		}],
	};
}

function describeWebSearch(query: string, action: WebSearchAction | null): string {
	if (action?.type === 'search') {
		return action.queries?.join(', ') ?? action.query ?? query;
	}
	if (action?.type === 'openPage') {
		return action.url ?? query;
	}
	if (action?.type === 'findInPage') {
		return [action.pattern, action.url].filter(Boolean).join(' in ') || query;
	}
	return query;
}

function describeFileChange(changes: readonly FileUpdateChange[]): string {
	return changes.map(change => {
		const kind = change.kind.type === 'update' && change.kind.move_path
			? `rename from ${change.kind.move_path}`
			: change.kind.type;
		return `${kind}: ${change.path}`;
	}).join('\n');
}

function fileChangeOutput(changes: readonly FileUpdateChange[]): string {
	return changes.map(change => `${describeFileChange([change])}\n${change.diff}`.trim()).join('\n\n');
}

function jsonValueToText(value: JsonValue): string {
	return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function toolInputText(value: JsonValue): string {
	return JSON.stringify(value, null, 2);
}

function dynamicToolOutput(contentItems: readonly DynamicToolCallOutputContentItem[] | null): string {
	return contentItems?.map(item => item.type === 'inputText' ? item.text : item.imageUrl).join('\n') ?? '';
}

function mcpToolOutput(result: McpToolCallResult | null, errorMessage?: string): string {
	if (errorMessage) {
		return errorMessage;
	}
	if (!result) {
		return '';
	}
	const content = result.content.map(jsonValueToText).join('\n');
	const structuredContent = result.structuredContent !== null ? jsonValueToText(result.structuredContent) : '';
	return [content, structuredContent].filter(Boolean).join('\n');
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
	state.itemToReasoningPartId.clear();
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
			message: { text: userText, origin: { kind: MessageKind.User } },
		},
	];
}

export function mapReasoningSummaryPartAdded(
	state: ICodexSessionMapState,
	params: ReasoningSummaryPartAddedNotification,
): SessionAction[] {
	return ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, 'summary', params.summaryIndex)).actions;
}

export function mapReasoningSummaryTextDelta(
	state: ICodexSessionMapState,
	params: ReasoningSummaryTextDeltaNotification,
): SessionAction[] {
	const ensured = ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, 'summary', params.summaryIndex));
	return [
		...ensured.actions,
		{ type: ActionType.SessionReasoning, turnId: params.turnId, partId: ensured.partId, content: params.delta },
	];
}

export function mapReasoningTextDelta(
	state: ICodexSessionMapState,
	params: ReasoningTextDeltaNotification,
): SessionAction[] {
	const ensured = ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, 'text', params.contentIndex));
	return [
		...ensured.actions,
		{ type: ActionType.SessionReasoning, turnId: params.turnId, partId: ensured.partId, content: params.delta },
	];
}

export function clearReasoningForItem(state: ICodexSessionMapState, itemId: string): void {
	for (const key of [...state.itemToReasoningPartId.keys()]) {
		if (key.startsWith(`${itemId}:`)) {
			state.itemToReasoningPartId.delete(key);
		}
	}
}

export function mapTokenUsageUpdated(params: ThreadTokenUsageUpdatedNotification): SessionAction[] {
	const last = params.tokenUsage.last;
	return [{
		type: ActionType.SessionUsage,
		turnId: params.turnId,
		usage: {
			inputTokens: last.inputTokens,
			outputTokens: last.outputTokens,
			cacheReadTokens: last.cachedInputTokens,
			_meta: {
				reasoningOutputTokens: last.reasoningOutputTokens,
				modelContextWindow: params.tokenUsage.modelContextWindow,
			},
		},
	}];
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
			output: '',
		});
		const command = params.item.command ?? '';
		return [
			{
				type: ActionType.SessionToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName: 'shell',
				displayName: 'Run shell command',
				_meta: { toolKind: 'terminal' },
			},
			{
				type: ActionType.SessionToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: command,
			},
			{
				type: ActionType.SessionToolCallReady,
				turnId: params.turnId,
				toolCallId,
				invocationMessage: command,
				toolInput: command,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				_meta: { toolKind: 'terminal' },
			},
		];
	}
	if (params.item.type === 'webSearch') {
		const toolCallId = generateUuid();
		state.itemToToolCall.set(params.item.id, {
			toolCallId,
			turnId: params.turnId,
			toolName: 'web_search',
			output: '',
		});
		const query = describeWebSearch(params.item.query, params.item.action);
		return [
			{
				type: ActionType.SessionToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName: 'web_search',
				displayName: 'Web search',
				_meta: { toolKind: 'search' },
			},
			{
				type: ActionType.SessionToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: query,
			},
			{
				type: ActionType.SessionToolCallReady,
				turnId: params.turnId,
				toolCallId,
				invocationMessage: query,
				toolInput: query,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				_meta: { toolKind: 'search' },
			},
		];
	}
	if (params.item.type === 'fileChange') {
		const toolCallId = generateUuid();
		const output = fileChangeOutput(params.item.changes);
		state.itemToToolCall.set(params.item.id, {
			toolCallId,
			turnId: params.turnId,
			toolName: 'file_edit',
			output,
		});
		const summary = describeFileChange(params.item.changes) || 'Apply file changes';
		return [
			{
				type: ActionType.SessionToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName: 'file_edit',
				displayName: 'Apply file changes',
			},
			{
				type: ActionType.SessionToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: summary,
			},
			{
				type: ActionType.SessionToolCallReady,
				turnId: params.turnId,
				toolCallId,
				invocationMessage: summary,
				toolInput: summary,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			},
			...(output ? [{
				type: ActionType.SessionToolCallContentChanged,
				turnId: params.turnId,
				toolCallId,
				content: [{ type: ToolResultContentType.Text, text: output }],
			} satisfies SessionAction] : []),
		];
	}
	if (params.item.type === 'mcpToolCall') {
		const toolCallId = generateUuid();
		const toolName = `${params.item.server}.${params.item.tool}`;
		const toolInput = toolInputText(params.item.arguments);
		state.itemToToolCall.set(params.item.id, {
			toolCallId,
			turnId: params.turnId,
			toolName,
			output: '',
		});
		return [
			{
				type: ActionType.SessionToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName,
				displayName: params.item.tool,
			},
			{
				type: ActionType.SessionToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: toolInput,
			},
			{
				type: ActionType.SessionToolCallReady,
				turnId: params.turnId,
				toolCallId,
				invocationMessage: `Calling ${toolName}`,
				toolInput,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			},
		];
	}
	if (params.item.type === 'dynamicToolCall') {
		const toolCallId = generateUuid();
		const toolName = params.item.namespace ? `${params.item.namespace}.${params.item.tool}` : params.item.tool;
		const toolInput = toolInputText(params.item.arguments);
		const output = dynamicToolOutput(params.item.contentItems);
		state.itemToToolCall.set(params.item.id, {
			toolCallId,
			turnId: params.turnId,
			toolName,
			output,
		});
		return [
			{
				type: ActionType.SessionToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName,
				displayName: params.item.tool,
			},
			{
				type: ActionType.SessionToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: toolInput,
			},
			{
				type: ActionType.SessionToolCallReady,
				turnId: params.turnId,
				toolCallId,
				invocationMessage: `Calling ${toolName}`,
				toolInput,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			},
			...(output ? [{
				type: ActionType.SessionToolCallContentChanged,
				turnId: params.turnId,
				toolCallId,
				content: [{ type: ToolResultContentType.Text, text: output }],
			} satisfies SessionAction] : []),
		];
	}
	return [];
}

export function mapCommandExecutionOutputDelta(
	state: ICodexSessionMapState,
	params: CommandExecutionOutputDeltaNotification,
): SessionAction[] {
	const entry = state.itemToToolCall.get(params.itemId);
	if (!entry) {
		return [];
	}
	entry.output += params.delta;
	return [{
		type: ActionType.SessionToolCallContentChanged,
		turnId: entry.turnId,
		toolCallId: entry.toolCallId,
		content: [{ type: ToolResultContentType.Text, text: entry.output }],
	}];
}

export function mapFileChangePatchUpdated(
	state: ICodexSessionMapState,
	params: FileChangePatchUpdatedNotification,
): SessionAction[] {
	const entry = state.itemToToolCall.get(params.itemId);
	if (!entry) {
		return [];
	}
	entry.output = fileChangeOutput(params.changes);
	return [{
		type: ActionType.SessionToolCallContentChanged,
		turnId: entry.turnId,
		toolCallId: entry.toolCallId,
		content: entry.output ? [{ type: ToolResultContentType.Text, text: entry.output }] : [],
	}];
}

export function mapFileChangeOutputDelta(
	state: ICodexSessionMapState,
	params: FileChangeOutputDeltaNotification,
): SessionAction[] {
	const entry = state.itemToToolCall.get(params.itemId);
	if (!entry) {
		return [];
	}
	entry.output += params.delta;
	return [{
		type: ActionType.SessionToolCallContentChanged,
		turnId: entry.turnId,
		toolCallId: entry.toolCallId,
		content: [{ type: ToolResultContentType.Text, text: entry.output }],
	}];
}

export function mapMcpToolCallProgress(
	state: ICodexSessionMapState,
	params: McpToolCallProgressNotification,
): SessionAction[] {
	const entry = state.itemToToolCall.get(params.itemId);
	if (!entry) {
		return [];
	}
	entry.output = [entry.output, params.message].filter(Boolean).join('\n');
	return [{
		type: ActionType.SessionToolCallContentChanged,
		turnId: entry.turnId,
		toolCallId: entry.toolCallId,
		content: [{ type: ToolResultContentType.Text, text: entry.output }],
	}];
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
	if (params.item.type === 'reasoning') {
		clearReasoningForItem(state, params.item.id);
		return [];
	}
	if (params.item.type === 'commandExecution') {
		const entry = state.itemToToolCall.get(params.item.id);
		if (!entry) {
			return [];
		}
		state.itemToToolCall.delete(params.item.id);
		const success = params.item.status === 'completed' && (params.item.exitCode === 0 || params.item.exitCode === null);
		const output = params.item.aggregatedOutput ?? entry.output;
		const command = params.item.command ?? '';
		const exit = params.item.exitCode;
		const pastTense = success
			? `Ran \`${command}\``
			: exit !== null
				? `Ran \`${command}\` (exit ${exit})`
				: `Ran \`${command}\` (failed)`;
		return [
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
	if (params.item.type === 'webSearch') {
		const entry = state.itemToToolCall.get(params.item.id);
		if (!entry) {
			return [];
		}
		state.itemToToolCall.delete(params.item.id);
		const query = describeWebSearch(params.item.query, params.item.action);
		return [{
			type: ActionType.SessionToolCallComplete,
			turnId: entry.turnId,
			toolCallId: entry.toolCallId,
			result: {
				success: true,
				pastTenseMessage: `Searched ${query}`,
			},
		}];
	}
	if (params.item.type === 'fileChange') {
		const entry = state.itemToToolCall.get(params.item.id);
		if (!entry) {
			return [];
		}
		state.itemToToolCall.delete(params.item.id);
		const output = fileChangeOutput(params.item.changes) || entry.output;
		const success = params.item.status === 'completed';
		const content = output ? [{ type: ToolResultContentType.Text as const, text: output }] : undefined;
		const result = {
			success,
			pastTenseMessage: success ? 'Applied file changes' : 'Failed to apply file changes',
			content,
			...(success ? {} : { error: { message: `Patch ${params.item.status}` } }),
		};
		return [{
			type: ActionType.SessionToolCallComplete,
			turnId: entry.turnId,
			toolCallId: entry.toolCallId,
			result,
		}];
	}
	if (params.item.type === 'mcpToolCall') {
		const entry = state.itemToToolCall.get(params.item.id);
		if (!entry) {
			return [];
		}
		state.itemToToolCall.delete(params.item.id);
		const success = params.item.status === 'completed' && !params.item.error;
		const output = mcpToolOutput(params.item.result, params.item.error?.message) || entry.output;
		const content = output ? [{ type: ToolResultContentType.Text as const, text: output }] : undefined;
		return [{
			type: ActionType.SessionToolCallComplete,
			turnId: entry.turnId,
			toolCallId: entry.toolCallId,
			result: {
				success,
				pastTenseMessage: success ? `Called ${entry.toolName}` : `Failed to call ${entry.toolName}`,
				content,
				...(success ? {} : { error: { message: params.item.error?.message ?? `MCP tool ${params.item.status}` } }),
			},
		}];
	}
	if (params.item.type === 'dynamicToolCall') {
		const entry = state.itemToToolCall.get(params.item.id);
		if (!entry) {
			return [];
		}
		state.itemToToolCall.delete(params.item.id);
		const success = params.item.success === true || params.item.status === 'completed';
		const output = dynamicToolOutput(params.item.contentItems) || entry.output;
		const content = output ? [{ type: ToolResultContentType.Text as const, text: output }] : undefined;
		return [{
			type: ActionType.SessionToolCallComplete,
			turnId: entry.turnId,
			toolCallId: entry.toolCallId,
			result: {
				success,
				pastTenseMessage: success ? `Called ${entry.toolName}` : `Failed to call ${entry.toolName}`,
				content,
				...(success ? {} : { error: { message: `Dynamic tool ${params.item.status}` } }),
			},
		}];
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
	state.itemToReasoningPartId.clear();
	const orphanedToolCalls = [...state.itemToToolCall.values()];
	state.itemToToolCall.clear();
	const turnId = params.turn.id;
	const status = params.turn.status;
	const orphanedToolCallActions: SessionAction[] = orphanedToolCalls.map(entry => ({
		type: ActionType.SessionToolCallComplete,
		turnId: entry.turnId,
		toolCallId: entry.toolCallId,
		result: {
			success: false,
			pastTenseMessage: `Stopped ${entry.toolName}`,
			content: entry.output ? [{ type: ToolResultContentType.Text as const, text: entry.output }] : undefined,
			error: { message: status === 'interrupted' ? 'Turn interrupted before the tool completed' : 'Turn completed before the tool reported completion' },
		},
	}));
	if (status === 'failed' && params.turn.error) {
		const errMessage = params.turn.error.message ?? 'Codex turn failed';
		return [
			...orphanedToolCallActions,
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
		return [...orphanedToolCallActions, { type: ActionType.SessionTurnCancelled, turnId }];
	}
	return [...orphanedToolCallActions, { type: ActionType.SessionTurnComplete, turnId }];
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
