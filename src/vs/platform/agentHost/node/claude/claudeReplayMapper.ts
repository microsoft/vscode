/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import type { URI } from '../../../../base/common/uri.js';
import type { ILogService } from '../../../log/common/log.js';
import {
	ResponsePartKind,
	ToolCallCancellationReason,
	ToolCallConfirmationReason,
	ToolCallStatus,
	ToolResultContentType,
	TurnState,
	type ResponsePart,
	type ToolCallCancelledState,
	type ToolCallCompletedState,
	type ToolCallResponsePart,
	type ToolResultContent,
	type Turn,
} from '../../common/state/protocol/state.js';
import { buildSubagentSessionUri } from '../../common/state/sessionState.js';
import { getClaudeToolDisplayName } from './claudeToolDisplay.js';

/**
 * Phase 13 — replay mapper. Reduces a flat `SessionMessage[]` (the SDK's
 * on-disk JSONL transcript) into the protocol's `Turn[]` shape per
 * [CONTEXT.md M7](./CONTEXT.md). Pure function; no I/O, no DI.
 *
 * Distinct from the live mapper (`mapSDKMessageToAgentSignals`) because:
 * - input shape differs (`SessionMessage` envelope vs `SDKMessage` union),
 * - output shape differs (`Turn[]` vs `AgentSignal[]`),
 * - replay has no `'result'` envelope (SDK doesn't persist it) and no
 *   `'stream_event'` lifecycle (terminal states only).
 *
 * Shared invariant with the live mapper: the `Map<tool_use_id, turnId>`
 * attribution rule from M7 — `tool_result` legitimately lands in a later
 * `'user'` envelope and must resolve back to the announcing `tool_use`'s
 * turn. This mapper builds an equivalent local map during its single pass.
 */
export function mapSessionMessagesToTurns(
	messages: readonly SessionMessage[],
	session: URI,
	logService: ILogService,
): readonly Turn[] {
	const builder = new ReplayBuilder(session, logService);
	for (const msg of messages) {
		const parsed = parseSessionMessage(msg);
		if (parsed === undefined) {
			continue;
		}
		builder.consume(parsed);
	}
	return builder.finish();
}

// #region Parsed message union — narrow-at-the-seam adapter

interface UserTextBlock { readonly type: 'text'; readonly text: string }
interface UserToolResultBlock { readonly type: 'tool_result'; readonly tool_use_id: string; readonly content: unknown; readonly is_error: boolean }
interface AssistantBlock { readonly type: string; readonly text?: string; readonly thinking?: string; readonly id?: string; readonly name?: string; readonly input?: unknown }

/**
 * Discriminated union of replay-relevant message shapes. Everything that
 * the mapper actually cares about is one of these; everything else (hooks,
 * CLI-echo entries, unallowed system subtypes, malformed envelopes) returns
 * `undefined` from {@link parseSessionMessage}.
 *
 * The split keeps SDK shape detection (this seam) separate from the
 * stateful reduction (the {@link ReplayBuilder}) — see CONTEXT M7.
 */
type ParsedSessionMessage =
	| { readonly kind: 'user-text'; readonly uuid: string; readonly text: string }
	| { readonly kind: 'user-tool-results'; readonly uuid: string; readonly results: readonly UserToolResultBlock[] }
	| { readonly kind: 'assistant'; readonly uuid: string; readonly blocks: readonly AssistantBlock[] }
	| { readonly kind: 'system-notification'; readonly uuid: string; readonly subtype: string; readonly text: string };

function parseSessionMessage(msg: SessionMessage): ParsedSessionMessage | undefined {
	switch (msg.type) {
		case 'user': return parseUserMessage(msg);
		case 'assistant': return parseAssistantMessage(msg);
		case 'system': return parseSystemMessage(msg);
		default: return undefined;
	}
}

function parseUserMessage(msg: SessionMessage): ParsedSessionMessage | undefined {
	const content = readUserContent(msg.message);
	if (content === undefined) {
		return undefined;
	}
	if (isCliEchoContent(content)) {
		return undefined;
	}
	if (typeof content === 'string') {
		return { kind: 'user-text', uuid: msg.uuid, text: content };
	}
	const textBlocks = content.filter((b): b is UserTextBlock => b.type === 'text');
	if (textBlocks.length === 0) {
		const results = content.filter((b): b is UserToolResultBlock => b.type === 'tool_result');
		return results.length > 0 ? { kind: 'user-tool-results', uuid: msg.uuid, results } : undefined;
	}
	// Mixed or text-only: text wins — matches prior behavior where tool_results
	// in a text-bearing envelope are dropped (they should already have been delivered).
	return { kind: 'user-text', uuid: msg.uuid, text: textBlocks.map(b => b.text).join('\n') };
}

function parseAssistantMessage(msg: SessionMessage): ParsedSessionMessage | undefined {
	const blocks = readAssistantBlocks(msg.message);
	if (blocks === undefined || blocks.length === 0) {
		return undefined;
	}
	return { kind: 'assistant', uuid: msg.uuid, blocks };
}

function parseSystemMessage(msg: SessionMessage): ParsedSessionMessage | undefined {
	const subtype = readSystemSubtype(msg.message);
	if (subtype === undefined || !ALLOWED_SYSTEM_SUBTYPES.has(subtype)) {
		return undefined;
	}
	const text = readSystemText(msg.message) ?? `[${subtype}]`;
	return { kind: 'system-notification', uuid: msg.uuid, subtype, text };
}

// #endregion

// #region Builder

/**
 * Subagent-spawning tool names recognised by both `Task` (built-in,
 * see [`sdk.d.ts:95`](node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts))
 * and `Agent` (custom subagents,
 * see [`sdk.d.ts:36`](node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts)).
 * The production extension matches both at `claudeMessageDispatch.ts:194`.
 */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set(['Task', 'Agent']);

/**
 * Allowlist of `system` subtypes that survive replay as
 * {@link ResponsePartKind.SystemNotification} parts on the active turn.
 * Mirrors CONTEXT M7's table — anything not in this set is dropped.
 */
const ALLOWED_SYSTEM_SUBTYPES: ReadonlySet<string> = new Set([
	'compact_boundary',
	'notification',
]);

/**
 * CLI-echo markers the Claude Code CLI writes into the transcript for
 * replay fidelity. They are `type: 'user'` envelopes whose `message.content`
 * is a raw string starting with one of these tags — `<command-name>` /
 * `<command-args>` (slash-command echoes like `/model claude-opus-4.7`),
 * `<local-command-stdout>` / `<local-command-stderr>` (echo of the local
 * handler's output, e.g. "Set model to claude-opus-4.7"), and
 * `<local-command-caveat>` (the "messages below were generated while…"
 * preamble). The entries don't carry `isSynthetic` / `isMeta` reliably
 * (the `/model` echo lacks both, verified empirically), so the only reliable
 * discriminator is the content shape itself. Drop on replay so the workbench
 * doesn't render them as user turns.
 */
const CLI_ECHO_MARKER_PATTERN = /^<(command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat)>/;

interface InProgressTurn {
	readonly id: string;
	readonly userText: string;
	readonly responseParts: ResponsePart[];
	/**
	 * `tool_use_id`s announced by THIS turn. Drained when the matching
	 * `tool_result` lands (which may arrive in this turn's user-side
	 * `tool_result` block or a later turn's). At turn close, non-empty →
	 * tail Turn marked `Cancelled`.
	 */
	readonly pendingToolUseIds: Set<string>;
	/**
	 * Stash of completed `ToolCallResponsePart`s waiting on their result
	 * content. `tool_use` opens with a placeholder; the matching
	 * `tool_result` fills it in. Keyed by `tool_use_id`.
	 */
	readonly toolCallParts: Map<string, ToolCallResponsePart>;
}

class ReplayBuilder {
	private readonly _turns: Turn[] = [];
	private _active: InProgressTurn | undefined;
	/** Cross-turn: tool_use_id → turnId of the announcing turn. */
	private readonly _toolUseToTurnId = new Map<string, string>();

	constructor(private readonly _session: URI, private readonly _logService: ILogService) { }

	consume(msg: ParsedSessionMessage): void {
		switch (msg.kind) {
			case 'user-text':
				this._closeActive();
				this._active = {
					id: msg.uuid,
					userText: msg.text,
					responseParts: [],
					pendingToolUseIds: new Set(),
					toolCallParts: new Map(),
				};
				return;
			case 'user-tool-results':
				for (const block of msg.results) {
					this._attachToolResult(block);
				}
				return;
			case 'assistant':
				this._consumeAssistant(msg);
				return;
			case 'system-notification':
				if (this._active === undefined) {
					// System notification before any user message — drop. Without an active turn there's nowhere to attach.
					return;
				}
				this._active.responseParts.push({
					kind: ResponsePartKind.SystemNotification,
					content: msg.text,
				});
				return;
		}
	}

	finish(): readonly Turn[] {
		this._closeActive();
		return this._turns;
	}

	private _consumeAssistant(msg: ParsedSessionMessage & { kind: 'assistant' }): void {
		if (this._active === undefined) {
			// Assistant message without a preceding user message — defensive: synthesize an empty user turn keyed on the assistant's parent uuid would be wrong; just drop with a warn.
			this._logService.warn(`[claudeReplayMapper] assistant envelope ${msg.uuid} arrived before any user message; dropping`);
			return;
		}
		let textPartCounter = 0;
		let reasoningPartCounter = 0;
		for (const block of msg.blocks) {
			if (block.type === 'text' && typeof block.text === 'string') {
				this._active.responseParts.push({
					kind: ResponsePartKind.Markdown,
					id: `${this._active.id}#${msg.uuid}#text-${textPartCounter++}`,
					content: block.text,
				});
			} else if (block.type === 'thinking' && typeof block.thinking === 'string') {
				this._active.responseParts.push({
					kind: ResponsePartKind.Reasoning,
					id: `${this._active.id}#${msg.uuid}#thinking-${reasoningPartCounter++}`,
					content: block.thinking,
				});
			} else if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
				this._openToolUse(block.id, block.name, block.input);
			}
			// Other block types (server_tool_use, etc.) are dropped silently per M7.
		}
	}

	private _openToolUse(toolUseId: string, toolName: string, input: unknown): void {
		if (this._active === undefined) {
			return;
		}
		const isSubagent = SUBAGENT_TOOL_NAMES.has(toolName);
		const displayName = getClaudeToolDisplayName(toolName);
		// Build a placeholder Cancelled state by default; replaced with Completed when the tool_result lands.
		const placeholder: ToolCallCancelledState = {
			status: ToolCallStatus.Cancelled,
			toolCallId: toolUseId,
			toolName,
			displayName,
			invocationMessage: displayName,
			toolInput: typeof input === 'string' ? input : input !== undefined ? safeStringify(input) : undefined,
			reason: ToolCallCancellationReason.Skipped,
			...(isSubagent ? { _meta: { toolKind: 'subagent' as const } } : {}),
		};
		const part: ToolCallResponsePart = {
			kind: ResponsePartKind.ToolCall,
			toolCall: placeholder,
		};
		this._active.responseParts.push(part);
		this._active.toolCallParts.set(toolUseId, part);
		this._active.pendingToolUseIds.add(toolUseId);
		this._toolUseToTurnId.set(toolUseId, this._active.id);
	}

	private _attachToolResult(block: UserToolResultBlock): void {
		const announcingTurnId = this._toolUseToTurnId.get(block.tool_use_id);
		if (announcingTurnId === undefined) {
			this._logService.warn(`[claudeReplayMapper] tool_result for unknown tool_use_id ${block.tool_use_id}`);
			return;
		}
		// Find the part — it lives on the announcing turn (which may be `_active` or one already pushed to `_turns`).
		const part = this._findToolCallPart(announcingTurnId, block.tool_use_id);
		if (part === undefined) {
			return;
		}
		const isError = block.is_error;
		const previousState = part.toolCall;
		const isSubagent = previousState._meta?.toolKind === 'subagent';
		const content: ToolResultContent[] = extractToolResultContent(block.content) ?? [];
		if (isSubagent) {
			content.push({
				type: ToolResultContentType.Subagent,
				resource: buildSubagentSessionUri(this._session.toString(), previousState.toolCallId),
				title: previousState.displayName,
			});
		}
		const completed: ToolCallCompletedState = {
			status: ToolCallStatus.Completed,
			toolCallId: previousState.toolCallId,
			toolName: previousState.toolName,
			displayName: previousState.displayName,
			invocationMessage: previousState.invocationMessage ?? previousState.displayName,
			toolInput: previousState.status === ToolCallStatus.Streaming ? undefined : previousState.toolInput,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			success: !isError,
			pastTenseMessage: `${previousState.displayName} finished`,
			content: content.length > 0 ? content : undefined,
			...(previousState._meta ? { _meta: previousState._meta } : {}),
		};
		part.toolCall = completed;
		// Drain pending tracker on the announcing turn — but only if that
		// turn is still in progress. Committed turns have their state
		// locked at close time per Fixture 6b ("orphan in turn N does
		// NOT cancel turn N+1"); a late-arriving tool_result for a
		// committed turn doesn't re-promote it.
		if (this._active?.id === announcingTurnId) {
			this._active.pendingToolUseIds.delete(block.tool_use_id);
		}
	}

	private _findToolCallPart(turnId: string, toolUseId: string): ToolCallResponsePart | undefined {
		if (this._active && this._active.id === turnId) {
			return this._active.toolCallParts.get(toolUseId);
		}
		// Already-closed turn: search committed Turns. Linear scan is fine — replay is one-shot per session and turns are O(tens-hundreds).
		for (let i = this._turns.length - 1; i >= 0; i--) {
			if (this._turns[i].id !== turnId) {
				continue;
			}
			for (const part of this._turns[i].responseParts) {
				if (part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === toolUseId) {
					return part;
				}
			}
			return undefined;
		}
		return undefined;
	}

	private _closeActive(): void {
		if (this._active === undefined) {
			return;
		}
		const a = this._active;
		const state = a.pendingToolUseIds.size === 0 ? TurnState.Complete : TurnState.Cancelled;
		const turn: Turn = {
			id: a.id,
			userMessage: { text: a.userText },
			responseParts: a.responseParts,
			usage: undefined,
			state,
		};
		this._turns.push(turn);
		this._active = undefined;
	}
}

// #endregion

// #region Helpers — narrow-at-the-seam shape readers

/**
 * Returns string content (legacy form) or an array of recognised user
 * blocks (text + tool_result). Anything else returns `undefined` and the
 * caller drops the message — matches the production extension's parser
 * semantics per CONTEXT M7 glossary.
 */
function readUserContent(raw: unknown): string | ReadonlyArray<UserTextBlock | UserToolResultBlock> | undefined {
	if (raw === null || typeof raw !== 'object') {
		return undefined;
	}
	const content = (raw as { content?: unknown }).content;
	if (typeof content === 'string') {
		return content.length > 0 ? content : undefined;
	}
	if (!Array.isArray(content) || content.length === 0) {
		return undefined;
	}
	const out: (UserTextBlock | UserToolResultBlock)[] = [];
	for (const block of content) {
		if (block === null || typeof block !== 'object') {
			continue;
		}
		const b = block as { type?: unknown; text?: unknown; tool_use_id?: unknown; content?: unknown; is_error?: unknown };
		if (b.type === 'text' && typeof b.text === 'string') {
			out.push({ type: 'text', text: b.text });
		} else if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
			out.push({ type: 'tool_result', tool_use_id: b.tool_use_id, content: b.content, is_error: b.is_error === true });
		}
	}
	return out.length > 0 ? out : undefined;
}

function readAssistantBlocks(raw: unknown): readonly AssistantBlock[] | undefined {
	if (raw === null || typeof raw !== 'object') {
		return undefined;
	}
	const content = (raw as { content?: unknown }).content;
	if (!Array.isArray(content)) {
		return undefined;
	}
	const out: AssistantBlock[] = [];
	for (const block of content) {
		if (block === null || typeof block !== 'object') {
			continue;
		}
		const b = block as { type?: unknown; text?: unknown; thinking?: unknown; id?: unknown; name?: unknown; input?: unknown };
		if (typeof b.type !== 'string') {
			continue;
		}
		out.push({
			type: b.type,
			text: typeof b.text === 'string' ? b.text : undefined,
			thinking: typeof b.thinking === 'string' ? b.thinking : undefined,
			id: typeof b.id === 'string' ? b.id : undefined,
			name: typeof b.name === 'string' ? b.name : undefined,
			input: b.input,
		});
	}
	return out;
}

function readSystemSubtype(raw: unknown): string | undefined {
	if (raw === null || typeof raw !== 'object') {
		return undefined;
	}
	const subtype = (raw as { subtype?: unknown }).subtype;
	return typeof subtype === 'string' ? subtype : undefined;
}

function readSystemText(raw: unknown): string | undefined {
	if (raw === null || typeof raw !== 'object') {
		return undefined;
	}
	const r = raw as { text?: unknown; message?: unknown };
	if (typeof r.text === 'string') {
		return r.text;
	}
	if (typeof r.message === 'string') {
		return r.message;
	}
	return undefined;
}

/**
 * Mirror of the live mapper's helper — kept inline so the two mappers
 * don't yet need a shared module. If a third consumer appears, factor
 * to `claudeToolResultContent.ts`.
 */
function extractToolResultContent(content: unknown): { type: ToolResultContentType.Text; text: string }[] | undefined {
	if (typeof content === 'string') {
		return content.length > 0 ? [{ type: ToolResultContentType.Text, text: content }] : undefined;
	}
	if (!Array.isArray(content)) {
		return undefined;
	}
	const out: { type: ToolResultContentType.Text; text: string }[] = [];
	for (const block of content) {
		if (block === null || typeof block !== 'object') {
			continue;
		}
		const b = block as { type?: unknown; text?: unknown };
		if (b.type === 'text' && typeof b.text === 'string') {
			out.push({ type: ToolResultContentType.Text, text: b.text });
		}
	}
	return out.length > 0 ? out : undefined;
}

function safeStringify(v: unknown): string | undefined {
	try {
		return JSON.stringify(v);
	} catch {
		return undefined;
	}
}

/**
 * True when the message content is a CLI slash-command echo (e.g.
 * `<command-name>/model</command-name>...`) that the subprocess writes
 * to the transcript for restore fidelity but is not a user-authored prompt.
 * Checks the first text fragment only; mixed messages where the first
 * content block is a real prompt are NOT filtered.
 */
function isCliEchoContent(content: string | ReadonlyArray<UserTextBlock | UserToolResultBlock>): boolean {
	if (typeof content === 'string') {
		return CLI_ECHO_MARKER_PATTERN.test(content);
	}
	const firstText = content.find((b): b is UserTextBlock => b.type === 'text');
	return firstText !== undefined && CLI_ECHO_MARKER_PATTERN.test(firstText.text);
}

// #endregion
