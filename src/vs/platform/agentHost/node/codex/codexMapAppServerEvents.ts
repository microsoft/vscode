/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { toToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { ActionType, type SessionAction, type ChatAction } from '../../common/state/sessionActions.js';
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, TurnState } from '../../common/state/sessionState.js';
import { extractForwardedErrorInfo } from '../shared/forwardedChatError.js';
import { getServerToolDisplay } from '../shared/serverToolGroups.js';
import { ActiveClientToolSet } from '../activeClientState.js';
import { unwrapShellInvocation } from './codexShellCommand.js';
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
import type { UserInput } from './protocol/generated/v2/UserInput.js';
import type { WebSearchAction } from './protocol/generated/v2/WebSearchAction.js';
import type { DynamicToolCallOutputContentItem } from './protocol/generated/v2/DynamicToolCallOutputContentItem.js';
import type { JsonValue } from './protocol/generated/serde_json/JsonValue.js';
import type { CollabAgentTool } from './protocol/generated/v2/CollabAgentTool.js';
import type { CollabAgentState } from './protocol/generated/v2/CollabAgentState.js';

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
	/**
	 * Live registry of the session's client-provided (`dynamicTools`) tools,
	 * keyed by contributing workbench client. A `dynamicToolCall` tool-call
	 * start is stamped with the owning client (so the workbench routes
	 * execution back to it) resolved via {@link ActiveClientToolSet.ownerOf}.
	 */
	clientToolSet: ActiveClientToolSet;
	/**
	 * Names of the agent host's server tools (executed in-process). A
	 * `dynamicToolCall` for one of these omits the `Client` contributor so the
	 * workbench does not try to route execution to a client — the agent host
	 * answers the `item/tool/call` directly.
	 */
	serverToolNames: ReadonlySet<string>;
	/**
	 * Server name → customization id for the session's MCP servers, used to
	 * stamp the {@link ToolCallContributorKind.MCP} contributor on `mcpToolCall`
	 * starts so clients can correlate the call with its originating server
	 * customization. Owned and populated by the agent (mirrors
	 * {@link clientToolSet}); empty until the agent first applies the inventory.
	 */
	readonly mcpCustomizationIds: Map<string, string>;
	/**
	 * Tool call ids the host declined at the approval prompt. Codex reports the
	 * resulting `item/completed` as a generic failure, so the completion handler
	 * consults this set to emit a `userCancelled` (`error.code = 'denied'`)
	 * result instead. Drained on completion and cleared per turn.
	 */
	readonly declinedToolCalls: Set<string>;
	/**
	 * A `commandExecution` that completed successfully with NO output is
	 * potentially a sandbox pre-flight. When Codex runs a network (or otherwise
	 * escalated) command under `on-request` + `workspace-write` it first attempts
	 * it inside the sandbox — which completes instantly with no output because
	 * the sandbox blocked it — then re-runs the SAME command as a separate
	 * `commandExecution` item guarded by an approval request. Rendering both
	 * items draws the command box twice. To coalesce them we defer the
	 * pre-flight's completion here: if the next `commandExecution` in the turn
	 * re-runs the same command it reuses this (still-open) tool call for a single
	 * box; otherwise the deferred completion is flushed (on the next item or at
	 * turn end) so a genuinely output-less command still finalizes.
	 */
	pendingPreflight: ICodexPendingPreflight | undefined;
}

/**
 * A deferred `commandExecution` completion held back to coalesce a sandbox
 * pre-flight with its approval-guarded re-run. See
 * {@link ICodexSessionMapState.pendingPreflight}.
 */
interface ICodexPendingPreflight {
	readonly toolCallId: string;
	readonly turnId: string;
	/** Unwrapped command text, used to match the re-run. */
	readonly command: string;
	/** The `ChatToolCallComplete` action to emit if the pre-flight is not reused. */
	readonly completion: (SessionAction | ChatAction)[];
}

export interface ICodexToolCallEntry {
	readonly toolCallId: string;
	readonly turnId: string;
	readonly toolName: string;
	output: string;
}

export function createCodexSessionMapState(serverToolNames: ReadonlySet<string> = new Set(), clientToolSet: ActiveClientToolSet = new ActiveClientToolSet()): ICodexSessionMapState {
	return {
		itemToPartId: new Map(),
		itemToToolCall: new Map(),
		itemToReasoningPartId: new Map(),
		currentTurnId: undefined,
		clientToolSet,
		serverToolNames,
		mcpCustomizationIds: new Map(),
		declinedToolCalls: new Set(),
		pendingPreflight: undefined,
	};
}

/**
 * Clear the per-turn bookkeeping maps so streamed parts, tool-calls, and
 * reasoning parts from a finished (or preempted) turn don't bleed into the
 * next one. Does NOT touch {@link ICodexSessionMapState.currentTurnId},
 * which tracks the codex app-server turn id and is owned by the
 * turn/started + turn/completed handlers.
 */
export function resetCodexTurnMapState(state: ICodexSessionMapState): void {
	state.itemToPartId.clear();
	state.itemToToolCall.clear();
	state.itemToReasoningPartId.clear();
	state.declinedToolCalls.clear();
	state.pendingPreflight = undefined;
}

/**
 * Emit and clear any deferred sandbox pre-flight completion (see
 * {@link ICodexSessionMapState.pendingPreflight}). Returns `[]` when nothing is
 * pending, so callers can unconditionally prepend the result.
 */
function flushPendingPreflight(state: ICodexSessionMapState): (SessionAction | ChatAction)[] {
	const pending = state.pendingPreflight;
	if (!pending) {
		return [];
	}
	state.pendingPreflight = undefined;
	return pending.completion;
}

/**
 * Collect the plain-text portions of a codex `userMessage` item's
 * `content` (an array of {@link UserInput}). Non-text inputs (images,
 * skills, mentions) are ignored. Multiple text parts are joined with a
 * blank line, mirroring {@link mapTurnStarted}'s reconstruction.
 */
export function extractUserInputText(content: readonly UserInput[]): string {
	const collected: string[] = [];
	for (const c of content) {
		if (c.type === 'text') {
			collected.push(c.text);
		}
	}
	return collected.join('\n\n');
}

function reasoningKey(itemId: string, kind: 'summary' | 'text', index: number): string {
	return `${itemId}:${kind}:${index}`;
}

function ensureReasoningPart(state: ICodexSessionMapState, turnId: string, key: string): { readonly partId: string; readonly actions: (SessionAction | ChatAction)[] } {
	const existing = state.itemToReasoningPartId.get(key);
	if (existing) {
		return { partId: existing, actions: [] };
	}
	const partId = generateUuid();
	state.itemToReasoningPartId.set(key, partId);
	return {
		partId,
		actions: [{
			type: ActionType.ChatResponsePart,
			turnId,
			part: { kind: ResponsePartKind.Reasoning, id: partId, content: '' },
		}],
	};
}

export function describeWebSearch(query: string, action: WebSearchAction | null): string {
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

export function describeFileChange(changes: readonly FileUpdateChange[]): string {
	return changes.map(change => {
		const kind = change.kind.type === 'update' && change.kind.move_path
			? `rename from ${change.kind.move_path}`
			: change.kind.type;
		return `${kind}: ${change.path}`;
	}).join('\n');
}

export function fileChangeOutput(changes: readonly FileUpdateChange[]): string {
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
 * Human labels for a Codex collab-agent (subagent) tool call, mirroring the
 * reference client's phrasing. Codex surfaces subagent orchestration as
 * `collabAgentToolCall` items on the parent thread, but each spawned agent
 * ALSO runs as its own child thread that emits a full `turn/*` + `item/*`
 * event stream. The host ({@link CodexAgent}) renders that child stream in a
 * read-only peer chat and attaches a discovery block to the parent
 * `spawnAgent` tool call; the lifecycle collab tools (`wait`, `closeAgent`,
 * `sendInput`, …) render as plain tool calls in the parent chat.
 */
function collabAgentToolLabels(tool: CollabAgentTool): { readonly displayName: string; readonly present: string; readonly past: string } {
	switch (tool) {
		case 'spawnAgent': return { displayName: 'Spawn agent', present: 'Spawning agent', past: 'Spawned agent' };
		case 'sendInput': return { displayName: 'Send input to agent', present: 'Sending input to agent', past: 'Sent input to agent' };
		case 'resumeAgent': return { displayName: 'Resume agent', present: 'Resuming agent', past: 'Resumed agent' };
		case 'wait': return { displayName: 'Wait for agents', present: 'Waiting for agents', past: 'Finished waiting' };
		case 'closeAgent': return { displayName: 'Close agent', present: 'Closing agent', past: 'Closed agent' };
		default: return { displayName: tool, present: tool, past: tool };
	}
}

/** One-line summary of a spawned agent's state — the subagent's result. */
function collabAgentStateSummary(state: CollabAgentState): string {
	switch (state.status) {
		case 'completed': return state.message ? `Completed — ${state.message}` : 'Completed';
		case 'errored': return state.message ? `Errored — ${state.message}` : 'Errored';
		case 'running': return state.message ? `Running — ${state.message}` : 'Running';
		case 'interrupted': return state.message ? `Interrupted — ${state.message}` : 'Interrupted';
		case 'pendingInit': return 'Pending init';
		case 'shutdown': return 'Shutdown';
		case 'notFound': return 'Not found';
		default: return state.status;
	}
}

/**
 * Render the per-agent result block for a completed collab tool call. Prefers
 * the receiver order, then appends any other agents present in `agentsStates`.
 * The completed message carries the subagent's actual output.
 */
function collabAgentResultOutput(receiverThreadIds: readonly string[], agentsStates: { readonly [key: string]: CollabAgentState | undefined }): string {
	const seen = new Set<string>();
	const states: CollabAgentState[] = [];
	for (const id of receiverThreadIds) {
		const state = agentsStates[id];
		if (state) {
			states.push(state);
			seen.add(id);
		}
	}
	for (const id of Object.keys(agentsStates).sort()) {
		if (seen.has(id)) {
			continue;
		}
		const state = agentsStates[id];
		if (state) {
			states.push(state);
		}
	}
	if (states.length === 0) {
		return '';
	}
	if (states.length === 1) {
		return collabAgentStateSummary(states[0]);
	}
	return states.map((state, index) => `Agent ${index + 1}: ${collabAgentStateSummary(state)}`).join('\n');
}

/**
 * Translate `turn/started` into a `ChatTurnStarted` action.
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
): (SessionAction | ChatAction)[] {
	state.currentTurnId = params.turn.id;
	resetCodexTurnMapState(state);
	let userText = fallbackUserText;
	const first = params.turn.items?.[0];
	if (first && first.type === 'userMessage') {
		const collected = extractUserInputText(first.content);
		if (collected.length > 0) {
			userText = collected;
		}
	}
	return [
		{
			type: ActionType.ChatTurnStarted,
			turnId: params.turn.id,
			startedAt: typeof params.turn.startedAt === 'number' ? new Date(params.turn.startedAt * 1000).toISOString() : new Date().toISOString(),
			message: { text: userText, origin: { kind: MessageKind.User } },
		},
	];
}

export function mapReasoningSummaryPartAdded(
	state: ICodexSessionMapState,
	params: ReasoningSummaryPartAddedNotification,
): (SessionAction | ChatAction)[] {
	return ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, 'summary', params.summaryIndex)).actions;
}

export function mapReasoningSummaryTextDelta(
	state: ICodexSessionMapState,
	params: ReasoningSummaryTextDeltaNotification,
): (SessionAction | ChatAction)[] {
	const ensured = ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, 'summary', params.summaryIndex));
	return [
		...ensured.actions,
		{ type: ActionType.ChatReasoning, turnId: params.turnId, partId: ensured.partId, content: params.delta },
	];
}

export function mapReasoningTextDelta(
	state: ICodexSessionMapState,
	params: ReasoningTextDeltaNotification,
): (SessionAction | ChatAction)[] {
	const ensured = ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, 'text', params.contentIndex));
	return [
		...ensured.actions,
		{ type: ActionType.ChatReasoning, turnId: params.turnId, partId: ensured.partId, content: params.delta },
	];
}

export function clearReasoningForItem(state: ICodexSessionMapState, itemId: string): void {
	for (const key of [...state.itemToReasoningPartId.keys()]) {
		if (key.startsWith(`${itemId}:`)) {
			state.itemToReasoningPartId.delete(key);
		}
	}
}

export function mapTokenUsageUpdated(params: ThreadTokenUsageUpdatedNotification): (SessionAction | ChatAction)[] {
	const last = params.tokenUsage.last;
	return [{
		type: ActionType.ChatUsage,
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
 * `item/started` for an `agentMessage` becomes a `ChatResponsePart`
 * action with an empty `MarkdownResponsePart` shell. Subsequent
 * `item/agentMessage/delta` notifications append to that part.
 *
 * Other item types are ignored in Phase 2 — they'll be picked up by
 * Phase 6's tool-call mapper.
 */
export function mapItemStarted(
	state: ICodexSessionMapState,
	params: ItemStartedNotification,
): (SessionAction | ChatAction)[] {
	// Coalesce a sandbox pre-flight with its approval-guarded re-run: if the
	// immediately-preceding commandExecution in this turn ran the same command
	// and completed with no output (deferred as a pending pre-flight), reuse its
	// still-open tool call instead of opening a second box. The escalation's
	// `requestApproval` / `item/completed` then drive that box to its final
	// state, so nothing new is emitted here.
	if (params.item.type === 'commandExecution') {
		const pending = state.pendingPreflight;
		if (pending && pending.turnId === params.turnId && pending.command === unwrapShellInvocation(params.item.command ?? '')) {
			state.pendingPreflight = undefined;
			state.itemToToolCall.set(params.item.id, {
				toolCallId: pending.toolCallId,
				turnId: params.turnId,
				toolName: 'shell',
				output: '',
			});
			return [];
		}
	}
	// Any other item supersedes a deferred pre-flight: finalize it first so a
	// genuinely output-less command still renders promptly as a single box.
	const flushed = flushPendingPreflight(state);
	const body = mapItemStartedBody(state, params);
	return flushed.length === 0 ? body : [...flushed, ...body];
}

function mapItemStartedBody(
	state: ICodexSessionMapState,
	params: ItemStartedNotification,
): (SessionAction | ChatAction)[] {
	if (params.item.type === 'agentMessage') {
		const partId = generateUuid();
		state.itemToPartId.set(params.item.id, partId);
		return [
			{
				type: ActionType.ChatResponsePart,
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
		const command = unwrapShellInvocation(params.item.command ?? '');
		return [
			{
				type: ActionType.ChatToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName: 'shell',
				displayName: 'Run shell command',
				_meta: toToolCallMeta({ toolKind: 'terminal' }),
			},
			{
				type: ActionType.ChatToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: command,
			},
			{
				type: ActionType.ChatToolCallReady,
				turnId: params.turnId,
				toolCallId,
				invocationMessage: command,
				toolInput: command,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				_meta: toToolCallMeta({ toolKind: 'terminal' }),
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
				type: ActionType.ChatToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName: 'web_search',
				displayName: 'Web search',
				_meta: toToolCallMeta({ toolKind: 'search' }),
			},
			{
				type: ActionType.ChatToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: query,
			},
			{
				type: ActionType.ChatToolCallReady,
				turnId: params.turnId,
				toolCallId,
				invocationMessage: query,
				toolInput: query,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				_meta: toToolCallMeta({ toolKind: 'search' }),
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
				type: ActionType.ChatToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName: 'file_edit',
				displayName: 'Apply file changes',
			},
			{
				type: ActionType.ChatToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: summary,
			},
			{
				type: ActionType.ChatToolCallReady,
				turnId: params.turnId,
				toolCallId,
				invocationMessage: summary,
				toolInput: summary,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			},
			...(output ? [{
				type: ActionType.ChatToolCallContentChanged,
				turnId: params.turnId,
				toolCallId,
				content: [{ type: ToolResultContentType.Text, text: output }],
			} satisfies SessionAction | ChatAction] : []),
		];
	}
	if (params.item.type === 'mcpToolCall') {
		const toolCallId = generateUuid();
		const toolName = `${params.item.server}.${params.item.tool}`;
		const toolInput = toolInputText(params.item.arguments);
		const customizationId = state.mcpCustomizationIds.get(params.item.server);
		state.itemToToolCall.set(params.item.id, {
			toolCallId,
			turnId: params.turnId,
			toolName,
			output: '',
		});
		return [
			{
				type: ActionType.ChatToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName,
				displayName: params.item.tool,
				...(customizationId ? { contributor: { kind: ToolCallContributorKind.MCP, customizationId } } : {}),
			},
			{
				type: ActionType.ChatToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: toolInput,
			},
			{
				type: ActionType.ChatToolCallReady,
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
		// Server tools (registered under their bare name) execute in-process, so
		// they carry no `Client` contributor; only client-provided tools route
		// execution back to the owning workbench client.
		const isServerTool = params.item.namespace === null && state.serverToolNames.has(params.item.tool);
		const ownerClientId = isServerTool ? undefined : state.clientToolSet.ownerOf(params.item.tool);
		const serverDisplay = getServerToolDisplay(params.item.tool, params.item.arguments);
		state.itemToToolCall.set(params.item.id, {
			toolCallId,
			turnId: params.turnId,
			toolName,
			output,
		});
		return [
			{
				type: ActionType.ChatToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName,
				displayName: serverDisplay?.displayName ?? params.item.tool,
				...(ownerClientId ? { contributor: { kind: ToolCallContributorKind.Client, clientId: ownerClientId } } : {}),
			},
			{
				type: ActionType.ChatToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: toolInput,
			},
			{
				type: ActionType.ChatToolCallReady,
				turnId: params.turnId,
				toolCallId,
				invocationMessage: serverDisplay?.invocationMessage ?? `Calling ${toolName}`,
				toolInput,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			},
			...(output ? [{
				type: ActionType.ChatToolCallContentChanged,
				turnId: params.turnId,
				toolCallId,
				content: [{ type: ToolResultContentType.Text, text: output }],
			} satisfies SessionAction | ChatAction] : []),
		];
	}
	if (params.item.type === 'collabAgentToolCall') {
		const toolCallId = generateUuid();
		const labels = collabAgentToolLabels(params.item.tool);
		const toolName = `codex.${params.item.tool}`;
		state.itemToToolCall.set(params.item.id, {
			toolCallId,
			turnId: params.turnId,
			toolName,
			output: '',
		});
		// `spawnAgent` opens a read-only peer chat for the child thread (the
		// host attaches the subagent-discovery block to THIS tool call on
		// `subagent_started`), so we deliberately do NOT dump the raw prompt
		// into the tool box — it would duplicate the child chat's first user
		// message and blow out the tool-call width. The other collab tools
		// (`sendInput`, `wait`, `closeAgent`, …) are lifecycle ops with no peer
		// chat, so they keep a compact prompt/model summary.
		if (params.item.tool === 'spawnAgent') {
			return [
				{
					type: ActionType.ChatToolCallStart,
					turnId: params.turnId,
					toolCallId,
					toolName,
					displayName: labels.displayName,
				},
				{
					type: ActionType.ChatToolCallReady,
					turnId: params.turnId,
					toolCallId,
					invocationMessage: labels.present,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			];
		}
		const inputParts: string[] = [];
		if (params.item.prompt) {
			inputParts.push(params.item.prompt);
		}
		if (params.item.model) {
			inputParts.push(`Model: ${params.item.model}`);
		}
		const toolInput = inputParts.join('\n\n');
		return [
			{
				type: ActionType.ChatToolCallStart,
				turnId: params.turnId,
				toolCallId,
				toolName,
				displayName: labels.displayName,
			},
			...(toolInput ? [{
				type: ActionType.ChatToolCallDelta,
				turnId: params.turnId,
				toolCallId,
				content: toolInput,
			} satisfies SessionAction | ChatAction] : []),
			{
				type: ActionType.ChatToolCallReady,
				turnId: params.turnId,
				toolCallId,
				invocationMessage: labels.present,
				toolInput,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			},
		];
	}
	return [];
}

export function mapCommandExecutionOutputDelta(
	state: ICodexSessionMapState,
	params: CommandExecutionOutputDeltaNotification,
): (SessionAction | ChatAction)[] {
	const entry = state.itemToToolCall.get(params.itemId);
	if (!entry) {
		return [];
	}
	entry.output += params.delta;
	return [{
		type: ActionType.ChatToolCallContentChanged,
		turnId: entry.turnId,
		toolCallId: entry.toolCallId,
		content: [{ type: ToolResultContentType.Text, text: entry.output }],
	}];
}

export function mapFileChangePatchUpdated(
	state: ICodexSessionMapState,
	params: FileChangePatchUpdatedNotification,
): (SessionAction | ChatAction)[] {
	const entry = state.itemToToolCall.get(params.itemId);
	if (!entry) {
		return [];
	}
	entry.output = fileChangeOutput(params.changes);
	return [{
		type: ActionType.ChatToolCallContentChanged,
		turnId: entry.turnId,
		toolCallId: entry.toolCallId,
		content: entry.output ? [{ type: ToolResultContentType.Text, text: entry.output }] : [],
	}];
}

export function mapFileChangeOutputDelta(
	state: ICodexSessionMapState,
	params: FileChangeOutputDeltaNotification,
): (SessionAction | ChatAction)[] {
	const entry = state.itemToToolCall.get(params.itemId);
	if (!entry) {
		return [];
	}
	entry.output += params.delta;
	return [{
		type: ActionType.ChatToolCallContentChanged,
		turnId: entry.turnId,
		toolCallId: entry.toolCallId,
		content: [{ type: ToolResultContentType.Text, text: entry.output }],
	}];
}

export function mapMcpToolCallProgress(
	state: ICodexSessionMapState,
	params: McpToolCallProgressNotification,
): (SessionAction | ChatAction)[] {
	const entry = state.itemToToolCall.get(params.itemId);
	if (!entry) {
		return [];
	}
	entry.output = [entry.output, params.message].filter(Boolean).join('\n');
	return [{
		type: ActionType.ChatToolCallContentChanged,
		turnId: entry.turnId,
		toolCallId: entry.toolCallId,
		content: [{ type: ToolResultContentType.Text, text: entry.output }],
	}];
}

export function mapAgentMessageDelta(
	state: ICodexSessionMapState,
	params: AgentMessageDeltaNotification,
): (SessionAction | ChatAction)[] {
	const partId = state.itemToPartId.get(params.itemId);
	if (!partId) {
		// Got a delta before we saw the corresponding `item/started`.
		// Drop it — Phase 2 is best-effort and the lost text is replaced
		// when `item/completed` arrives with the full `text` field.
		return [];
	}
	return [
		{
			type: ActionType.ChatDelta,
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
 * For `commandExecution`, emit a synthetic `ChatToolCallReady`
 * (auto-confirmed; the codex server already decided to run the command
 * — any host-side approval was settled via the `requestApproval`
 * server-request handler before we got here) followed by a
 * `ChatToolCallComplete` carrying the aggregated output.
 */
export function mapItemCompleted(
	state: ICodexSessionMapState,
	params: ItemCompletedNotification,
): (SessionAction | ChatAction)[] {
	if (params.item.type === 'agentMessage') {
		state.itemToPartId.delete(params.item.id);
		return [];
	}
	if (params.item.type === 'reasoning') {
		clearReasoningForItem(state, params.item.id);
		return [];
	}
	// Every remaining item type is a tool call. Resolve the tracked entry and
	// drain the host-decline flag here, once, so all completion paths treat a
	// declined tool uniformly (reported as `userCancelled` via
	// `error.code = 'denied'`) instead of depending on which tool type completed.
	const entry = state.itemToToolCall.get(params.item.id);
	if (!entry) {
		return [];
	}
	state.itemToToolCall.delete(params.item.id);
	const declined = state.declinedToolCalls.delete(entry.toolCallId);
	if (params.item.type === 'commandExecution') {
		const success = params.item.status === 'completed' && (params.item.exitCode === 0 || params.item.exitCode === null);
		const output = params.item.aggregatedOutput ?? entry.output;
		const command = unwrapShellInvocation(params.item.command ?? '');
		const exit = params.item.exitCode;
		const pastTense = success
			? `Ran \`${command}\``
			: exit !== null
				? `Ran \`${command}\` (exit ${exit})`
				: `Ran \`${command}\` (failed)`;
		const completion: (SessionAction | ChatAction)[] = [
			{
				type: ActionType.ChatToolCallComplete,
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
						...(declined ? { code: 'denied' } : {}),
					},
				},
			},
		];
		// A successful command that produced NO output may be a sandbox
		// pre-flight that Codex will immediately re-run under an approval prompt
		// (same command, new item). Defer its completion so the re-run can reuse
		// this box; if no re-run arrives, it is flushed on the next item or at
		// turn end (see mapItemStarted / mapTurnCompleted).
		if (success && !output && !declined) {
			const flushed = flushPendingPreflight(state);
			state.pendingPreflight = { toolCallId: entry.toolCallId, turnId: entry.turnId, command, completion };
			return flushed;
		}
		return [...flushPendingPreflight(state), ...completion];
	}
	if (params.item.type === 'webSearch') {
		const query = describeWebSearch(params.item.query, params.item.action);
		return [{
			type: ActionType.ChatToolCallComplete,
			turnId: entry.turnId,
			toolCallId: entry.toolCallId,
			result: {
				success: true,
				pastTenseMessage: `Searched ${query}`,
			},
		}];
	}
	if (params.item.type === 'fileChange') {
		const output = fileChangeOutput(params.item.changes) || entry.output;
		const success = params.item.status === 'completed';
		const content = output ? [{ type: ToolResultContentType.Text as const, text: output }] : undefined;
		const result = {
			success,
			pastTenseMessage: success ? 'Applied file changes' : 'Failed to apply file changes',
			content,
			...(success ? {} : { error: { message: `Patch ${params.item.status}`, ...(declined ? { code: 'denied' } : {}) } }),
		};
		return [{
			type: ActionType.ChatToolCallComplete,
			turnId: entry.turnId,
			toolCallId: entry.toolCallId,
			result,
		}];
	}
	if (params.item.type === 'mcpToolCall') {
		const success = params.item.status === 'completed' && !params.item.error;
		const output = mcpToolOutput(params.item.result, params.item.error?.message) || entry.output;
		const content = output ? [{ type: ToolResultContentType.Text as const, text: output }] : undefined;
		return [{
			type: ActionType.ChatToolCallComplete,
			turnId: entry.turnId,
			toolCallId: entry.toolCallId,
			result: {
				success,
				pastTenseMessage: success ? `Called ${entry.toolName}` : `Failed to call ${entry.toolName}`,
				content,
				...(success ? {} : { error: { message: params.item.error?.message ?? `MCP tool ${params.item.status}`, ...(declined ? { code: 'denied' } : {}) } }),
			},
		}];
	}
	if (params.item.type === 'dynamicToolCall') {
		const success = params.item.success === true || params.item.status === 'completed';
		const output = dynamicToolOutput(params.item.contentItems) || entry.output;
		const content = output ? [{ type: ToolResultContentType.Text as const, text: output }] : undefined;
		const serverPastTense = success ? getServerToolDisplay(entry.toolName, params.item.arguments, { text: output, success })?.pastTenseMessage : undefined;
		return [{
			type: ActionType.ChatToolCallComplete,
			turnId: entry.turnId,
			toolCallId: entry.toolCallId,
			result: {
				success,
				pastTenseMessage: serverPastTense ?? (success ? `Called ${entry.toolName}` : `Failed to call ${entry.toolName}`),
				content,
				...(success ? {} : { error: { message: `Dynamic tool ${params.item.status}`, ...(declined ? { code: 'denied' } : {}) } }),
			},
		}];
	}
	if (params.item.type === 'collabAgentToolCall') {
		const labels = collabAgentToolLabels(params.item.tool);
		const success = params.item.status === 'completed';
		const output = collabAgentResultOutput(params.item.receiverThreadIds, params.item.agentsStates) || entry.output;
		const content = output ? [{ type: ToolResultContentType.Text as const, text: output }] : undefined;
		return [{
			type: ActionType.ChatToolCallComplete,
			turnId: entry.turnId,
			toolCallId: entry.toolCallId,
			result: {
				success,
				pastTenseMessage: success ? labels.past : `${labels.displayName} failed`,
				content,
				...(success ? {} : { error: { message: `Collab agent ${params.item.status}`, ...(declined ? { code: 'denied' } : {}) } }),
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
	fallbackDuration?: number,
): (SessionAction | ChatAction)[] {
	state.currentTurnId = undefined;
	state.itemToPartId.clear();
	state.itemToReasoningPartId.clear();
	// Finalize any command whose completion was deferred to coalesce a possible
	// sandbox pre-flight (see ICodexSessionMapState.pendingPreflight) — it was
	// never reused, so it is a genuine output-less command and must complete.
	const preflightFlush = flushPendingPreflight(state);
	const orphanedToolCalls = [...state.itemToToolCall.values()];
	state.itemToToolCall.clear();
	const turnId = params.turn.id;
	const status = params.turn.status;
	const duration = typeof params.turn.durationMs === 'number' && Number.isFinite(params.turn.durationMs) && params.turn.durationMs >= 0
		? params.turn.durationMs
		: typeof params.turn.startedAt === 'number' && typeof params.turn.completedAt === 'number'
			? Math.max(0, (params.turn.completedAt - params.turn.startedAt) * 1000)
			: typeof fallbackDuration === 'number' && Number.isFinite(fallbackDuration)
				? Math.max(0, fallbackDuration)
				: 0;
	const orphanedToolCallActions: (SessionAction | ChatAction)[] = orphanedToolCalls.map(entry => ({
		type: ActionType.ChatToolCallComplete,
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
			...preflightFlush,
			...orphanedToolCallActions,
			{
				type: ActionType.ChatError,
				turnId,
				duration,
				error: {
					errorType: 'CodexError',
					...extractForwardedErrorInfo(errMessage),
				},
			},
			{
				type: ActionType.ChatTurnComplete,
				turnId,
				duration,
			},
		];
	}
	if (status === 'interrupted') {
		return [...preflightFlush, ...orphanedToolCallActions, { type: ActionType.ChatTurnCancelled, turnId, duration }];
	}
	return [...preflightFlush, ...orphanedToolCallActions, { type: ActionType.ChatTurnComplete, turnId, duration }];
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
