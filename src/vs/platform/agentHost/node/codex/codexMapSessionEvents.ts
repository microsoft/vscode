/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ThreadEvent, ThreadItem } from '@openai/codex-sdk';
import { URI } from '../../../../base/common/uri.js';
import { AgentSignal } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ResponsePartKind, ToolCallConfirmationReason, ToolResultContentType, type ToolResultContent } from '../../common/state/protocol/state.js';

/**
 * Per-turn state carried across {@link mapCodexEvent} calls. The codex
 * SDK emits items as full snapshots on every update, so we keep a copy
 * of the previously-emitted text per item-id to compute the next delta
 * (codex's text fields are append-only within a turn — Claude's
 * `content_block_delta` is replaced here by string-diff against the
 * snapshot we remember).
 *
 * Also tracks which items we've already opened a response/tool part
 * for, so re-emitting `item.started` (or seeing `item.completed` for an
 * item we never saw start) doesn't dispatch duplicate `…Start` actions.
 */
export interface ICodexTurnState {
	/** Items for which we've dispatched a `SessionResponsePart` (text / reasoning). */
	readonly responsePartEmitted: Set<string>;
	/** Last text snapshot per item-id; the next emit becomes a delta. */
	readonly textByItemId: Map<string, string>;
	/** Items for which we've dispatched a `SessionToolCallStart`. */
	readonly toolCallStarted: Set<string>;
	/** Items for which we've dispatched a `SessionToolCallReady` (terminal transition out of streaming). */
	readonly toolCallReady: Set<string>;
	/** Items for which we've dispatched a `SessionToolCallComplete`. */
	readonly toolCallCompleted: Set<string>;
}

export function createCodexTurnState(): ICodexTurnState {
	return {
		responsePartEmitted: new Set(),
		textByItemId: new Map(),
		toolCallStarted: new Set(),
		toolCallReady: new Set(),
		toolCallCompleted: new Set(),
	};
}

/**
 * Map a single SDK {@link ThreadEvent} into zero or more protocol
 * {@link AgentSignal | agent signals}. The caller dispatches each signal
 * through the agent's `_onDidSessionProgress` emitter.
 *
 * Item-shape coverage (mirrors Claude's `claudeMapSessionEvents.ts`):
 * - `agent_message` → markdown response part + streaming `SessionDelta`.
 * - `reasoning` → reasoning response part + streaming `SessionReasoning`.
 * - `command_execution` → shell tool call with terminal-style content.
 * - `file_change` → apply-patch tool call.
 * - `mcp_tool_call` → MCP tool call.
 * - `web_search` → web-search tool call.
 * - `todo_list` → plan/update tool call.
 * - `error` → `SessionError`.
 *
 * Turn lifecycle (`turn.completed` / `turn.failed`) is handled in
 * `codexAgent.ts` because the caller also needs to control turn-id
 * promotion and the abort controller. This module stays event-typed.
 */
export function mapCodexEvent(
	session: URI,
	turnId: string,
	event: ThreadEvent,
	state: ICodexTurnState,
): AgentSignal[] {
	switch (event.type) {
		case 'item.started':
			return mapItemStarted(session, turnId, event.item, state);
		case 'item.updated':
			return mapItemUpdated(session, turnId, event.item, state);
		case 'item.completed':
			return mapItemCompleted(session, turnId, event.item, state);
		case 'turn.completed':
			return [{
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionUsage,
					turnId,
					usage: {
						inputTokens: event.usage.input_tokens,
						outputTokens: event.usage.output_tokens,
						cacheReadTokens: event.usage.cached_input_tokens,
					},
				},
			}];
		case 'turn.failed':
			return [{
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionError,
					turnId,
					error: { errorType: 'CodexError', message: event.error.message },
				},
			}];
		case 'error':
			return [{
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionError,
					turnId,
					error: { errorType: 'CodexError', message: event.message },
				},
			}];
		default:
			return [];
	}
}

function mapItemStarted(session: URI, turnId: string, item: ThreadItem, state: ICodexTurnState): AgentSignal[] {
	switch (item.type) {
		case 'agent_message':
			return openMarkdownPart(session, turnId, item.id, ResponsePartKind.Markdown, state);
		case 'reasoning':
			return openMarkdownPart(session, turnId, item.id, ResponsePartKind.Reasoning, state);
		case 'command_execution':
		case 'file_change':
		case 'mcp_tool_call':
		case 'web_search':
		case 'todo_list':
			return openToolCall(session, turnId, item, state);
		default:
			return [];
	}
}

function mapItemUpdated(session: URI, turnId: string, item: ThreadItem, state: ICodexTurnState): AgentSignal[] {
	switch (item.type) {
		case 'agent_message':
			return [
				...openMarkdownPart(session, turnId, item.id, ResponsePartKind.Markdown, state),
				...emitTextDelta(session, turnId, item.id, item.text ?? '', ActionType.SessionDelta, state),
			];
		case 'reasoning':
			return [
				...openMarkdownPart(session, turnId, item.id, ResponsePartKind.Reasoning, state),
				...emitTextDelta(session, turnId, item.id, item.text ?? '', ActionType.SessionReasoning, state),
			];
		case 'command_execution': {
			const start = openToolCall(session, turnId, item, state);
			if (!item.aggregated_output) {
				return start;
			}
			// Stream the running command's stdout/stderr as a Text content
			// block so clients can render a live terminal-style preview.
			return [
				...start,
				{
					kind: 'action',
					session,
					action: {
						type: ActionType.SessionToolCallContentChanged,
						turnId,
						toolCallId: item.id,
						content: [{ type: ToolResultContentType.Text, text: item.aggregated_output }],
					},
				},
			];
		}
		case 'mcp_tool_call':
		case 'web_search':
		case 'todo_list':
		case 'file_change':
			// These items don't carry intermediate state in the SDK
			// stream — they emit `started` (with arguments / metadata)
			// and then `completed`. No mid-call update to forward.
			return openToolCall(session, turnId, item, state);
		default:
			return [];
	}
}

function mapItemCompleted(session: URI, turnId: string, item: ThreadItem, state: ICodexTurnState): AgentSignal[] {
	switch (item.type) {
		case 'agent_message':
			return [
				...openMarkdownPart(session, turnId, item.id, ResponsePartKind.Markdown, state),
				...emitTextDelta(session, turnId, item.id, item.text ?? '', ActionType.SessionDelta, state),
			];
		case 'reasoning':
			return [
				...openMarkdownPart(session, turnId, item.id, ResponsePartKind.Reasoning, state),
				...emitTextDelta(session, turnId, item.id, item.text ?? '', ActionType.SessionReasoning, state),
			];
		case 'command_execution':
			return completeCommandExecution(session, turnId, item, state);
		case 'file_change':
			return completeFileChange(session, turnId, item, state);
		case 'mcp_tool_call':
			return completeMcpToolCall(session, turnId, item, state);
		case 'web_search':
			return completeWebSearch(session, turnId, item, state);
		case 'todo_list':
			return completeTodoList(session, turnId, item, state);
		case 'error':
			return [{
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionError,
					turnId,
					error: { errorType: 'CodexError', message: item.message },
				},
			}];
		default:
			return [];
	}
}

// --- Text / reasoning parts -------------------------------------------------

function openMarkdownPart(
	session: URI,
	turnId: string,
	itemId: string,
	kind: ResponsePartKind.Markdown | ResponsePartKind.Reasoning,
	state: ICodexTurnState,
): AgentSignal[] {
	if (state.responsePartEmitted.has(itemId)) {
		return [];
	}
	state.responsePartEmitted.add(itemId);
	state.textByItemId.set(itemId, '');
	return [{
		kind: 'action',
		session,
		action: {
			type: ActionType.SessionResponsePart,
			turnId,
			part: { kind, id: itemId, content: '' },
		},
	}];
}

function emitTextDelta(
	session: URI,
	turnId: string,
	itemId: string,
	currentText: string,
	deltaAction: ActionType.SessionDelta | ActionType.SessionReasoning,
	state: ICodexTurnState,
): AgentSignal[] {
	const previous = state.textByItemId.get(itemId) ?? '';
	if (currentText.length <= previous.length || !currentText.startsWith(previous)) {
		// Either nothing new, or codex rewrote the snapshot (extremely
		// rare — would happen if the model emits a correction). Skip the
		// delta rather than risk duplicate content; the next snapshot
		// will reset the baseline.
		state.textByItemId.set(itemId, currentText);
		return [];
	}
	const delta = currentText.slice(previous.length);
	state.textByItemId.set(itemId, currentText);
	return [{
		kind: 'action',
		session,
		action: {
			type: deltaAction,
			turnId,
			partId: itemId,
			content: delta,
		},
	}];
}

// --- Tool call openers ------------------------------------------------------

function openToolCall(session: URI, turnId: string, item: ThreadItem, state: ICodexTurnState): AgentSignal[] {
	if (state.toolCallStarted.has(item.id)) {
		return [];
	}
	state.toolCallStarted.add(item.id);
	const display = describeToolCall(item);
	const out: AgentSignal[] = [{
		kind: 'action',
		session,
		action: {
			type: ActionType.SessionToolCallStart,
			turnId,
			toolCallId: item.id,
			toolName: display.toolName,
			displayName: display.displayName,
		},
	}];
	// Immediately follow with `Ready { confirmed: NotNeeded }` so the
	// tool transitions out of `Streaming` even when codex auto-approves
	// (which it always does in our setup — `approval_policy` is global,
	// there is no per-call gate). Without this, the reducer would drop
	// the subsequent `Complete` because the state machine is still in
	// `Streaming`.
	if (!state.toolCallReady.has(item.id)) {
		state.toolCallReady.add(item.id);
		out.push({
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallReady,
				turnId,
				toolCallId: item.id,
				invocationMessage: display.invocationMessage,
				...(display.toolInput !== undefined ? { toolInput: display.toolInput } : {}),
				confirmed: ToolCallConfirmationReason.NotNeeded,
			},
		});
	}
	return out;
}

interface IToolCallDisplay {
	readonly toolName: string;
	readonly displayName: string;
	readonly invocationMessage: string;
	readonly toolInput?: string;
}

function describeToolCall(item: ThreadItem): IToolCallDisplay {
	switch (item.type) {
		case 'command_execution':
			return {
				toolName: 'shell',
				displayName: 'Run command',
				invocationMessage: `\`${truncate(item.command, 200)}\``,
				toolInput: JSON.stringify({ command: item.command }),
			};
		case 'file_change': {
			const count = item.changes?.length ?? 0;
			const kinds = new Set((item.changes ?? []).map(c => c.kind));
			return {
				toolName: 'apply_patch',
				displayName: 'Edit files',
				invocationMessage: `${count} file change(s)${kinds.size ? ` (${[...kinds].join(', ')})` : ''}`,
				toolInput: JSON.stringify({ changes: item.changes }),
			};
		}
		case 'mcp_tool_call':
			return {
				toolName: `mcp:${item.server}/${item.tool}`,
				displayName: `${item.server} · ${item.tool}`,
				invocationMessage: `${item.server}.${item.tool}`,
				toolInput: safeStringify(item.arguments),
			};
		case 'web_search':
			return {
				toolName: 'web_search',
				displayName: 'Web search',
				invocationMessage: `Searching for "${truncate(item.query ?? '', 200)}"`,
				toolInput: JSON.stringify({ query: item.query }),
			};
		case 'todo_list': {
			const count = item.items?.length ?? 0;
			return {
				toolName: 'todo_list',
				displayName: 'Update plan',
				invocationMessage: `${count} item(s)`,
				toolInput: safeStringify(item.items),
			};
		}
		default:
			return { toolName: item.type, displayName: item.type, invocationMessage: item.type };
	}
}

// --- Tool call completers ---------------------------------------------------

function completeCommandExecution(
	session: URI,
	turnId: string,
	item: Extract<ThreadItem, { type: 'command_execution' }>,
	state: ICodexTurnState,
): AgentSignal[] {
	const opened = openToolCall(session, turnId, item, state);
	if (state.toolCallCompleted.has(item.id)) {
		return opened;
	}
	state.toolCallCompleted.add(item.id);
	const success = item.status === 'completed' && (item.exit_code === undefined || item.exit_code === 0);
	const text = item.aggregated_output || (item.exit_code !== undefined ? `exit code ${item.exit_code}` : 'no output');
	return [
		...opened,
		{
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallComplete,
				turnId,
				toolCallId: item.id,
				result: {
					success,
					pastTenseMessage: success ? `Ran \`${truncate(item.command, 80)}\`` : `Command failed: \`${truncate(item.command, 80)}\``,
					content: [{ type: ToolResultContentType.Text, text }],
					...(success ? {} : { error: { message: item.exit_code !== undefined ? `Exit code ${item.exit_code}` : 'Command failed' } }),
				},
			},
		},
	];
}

function completeFileChange(
	session: URI,
	turnId: string,
	item: Extract<ThreadItem, { type: 'file_change' }>,
	state: ICodexTurnState,
): AgentSignal[] {
	const opened = openToolCall(session, turnId, item, state);
	if (state.toolCallCompleted.has(item.id)) {
		return opened;
	}
	state.toolCallCompleted.add(item.id);
	const success = item.status === 'completed';
	const summary = (item.changes ?? []).map(c => `${c.kind}: ${c.path}`).join('\n') || 'no changes';
	return [
		...opened,
		{
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallComplete,
				turnId,
				toolCallId: item.id,
				result: {
					success,
					pastTenseMessage: success ? `Applied ${item.changes?.length ?? 0} file change(s)` : 'Failed to apply file changes',
					content: [{ type: ToolResultContentType.Text, text: summary }],
					...(success ? {} : { error: { message: 'Patch failed' } }),
				},
			},
		},
	];
}

function completeMcpToolCall(
	session: URI,
	turnId: string,
	item: Extract<ThreadItem, { type: 'mcp_tool_call' }>,
	state: ICodexTurnState,
): AgentSignal[] {
	const opened = openToolCall(session, turnId, item, state);
	if (state.toolCallCompleted.has(item.id)) {
		return opened;
	}
	state.toolCallCompleted.add(item.id);
	const success = item.status === 'completed';
	const text = success
		? mcpResultToText(item.result)
		: (item.error?.message ?? 'MCP tool call failed');
	return [
		...opened,
		{
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallComplete,
				turnId,
				toolCallId: item.id,
				result: {
					success,
					pastTenseMessage: success ? `Called ${item.server}.${item.tool}` : `${item.server}.${item.tool} failed`,
					content: [{ type: ToolResultContentType.Text, text }],
					...(success ? {} : { error: { message: item.error?.message ?? 'MCP tool call failed' } }),
				},
			},
		},
	];
}

function completeWebSearch(
	session: URI,
	turnId: string,
	item: Extract<ThreadItem, { type: 'web_search' }>,
	state: ICodexTurnState,
): AgentSignal[] {
	const opened = openToolCall(session, turnId, item, state);
	if (state.toolCallCompleted.has(item.id)) {
		return opened;
	}
	state.toolCallCompleted.add(item.id);
	return [
		...opened,
		{
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallComplete,
				turnId,
				toolCallId: item.id,
				result: {
					success: true,
					pastTenseMessage: `Searched the web for "${truncate(item.query ?? '', 80)}"`,
				},
			},
		},
	];
}

function completeTodoList(
	session: URI,
	turnId: string,
	item: Extract<ThreadItem, { type: 'todo_list' }>,
	state: ICodexTurnState,
): AgentSignal[] {
	const opened = openToolCall(session, turnId, item, state);
	if (state.toolCallCompleted.has(item.id)) {
		return opened;
	}
	state.toolCallCompleted.add(item.id);
	const lines = (item.items ?? []).map(t => `- [${t.completed ? 'x' : ' '}] ${t.text}`).join('\n');
	const content: ToolResultContent[] = lines ? [{ type: ToolResultContentType.Text, text: lines }] : [];
	return [
		...opened,
		{
			kind: 'action',
			session,
			action: {
				type: ActionType.SessionToolCallComplete,
				turnId,
				toolCallId: item.id,
				result: {
					success: true,
					pastTenseMessage: `Updated plan (${item.items?.length ?? 0} item(s))`,
					content,
				},
			},
		},
	];
}

// --- Helpers ----------------------------------------------------------------

function truncate(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	return text.slice(0, max - 1) + '…';
}

function safeStringify(value: unknown): string | undefined {
	try {
		return value === undefined ? undefined : JSON.stringify(value);
	} catch {
		return undefined;
	}
}

function mcpResultToText(result: Extract<ThreadItem, { type: 'mcp_tool_call' }>['result']): string {
	if (!result) {
		return '';
	}
	const blocks = (result.content ?? []) as Array<{ type?: string; text?: string }>;
	const parts: string[] = [];
	for (const block of blocks) {
		if (block?.type === 'text' && typeof block.text === 'string') {
			parts.push(block.text);
		}
	}
	if (parts.length === 0 && result.structured_content !== undefined) {
		parts.push(safeStringify(result.structured_content) ?? '');
	}
	return parts.join('\n');
}
