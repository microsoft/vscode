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
	MessageKind,
	type ResponsePart,
	type ToolCallCancelledState,
	type ToolCallCompletedState,
	type ToolCallResponsePart,
	type ToolResultContent,
	type Turn,
} from '../../common/state/protocol/state.js';
import { buildSubagentSessionUri } from '../../common/state/sessionState.js';
import { readToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { buildClaudeToolMeta, getClaudeInvocationMessage, getClaudePastTenseMessage, getClaudeToolDisplayName, getClaudeToolInputString } from './claudeToolDisplay.js';
import { stripClientToolNamePrefix } from './clientTools/claudeClientToolMcpServer.js';

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

/**
 * Phase 6.5 — translate a protocol `turnId` (the last KEPT turn N) into the
 * SDK envelope `uuid` that `forkSession({ upToMessageId })` accepts
 * (INCLUSIVE). Returns the `uuid` of turn N's last `'assistant'` envelope,
 * or `turnId` itself when turn N has no assistant reply (still a valid
 * inclusive anchor), or `undefined` when `turnId` is not in the transcript.
 * Reuses {@link parseSessionMessage} so the turn-boundary rule matches
 * {@link ReplayBuilder}; always returns an envelope `uuid`, never a `msg_…` id.
 */
export function resolveForkAnchorUuid(messages: readonly SessionMessage[], turnId: string): string | undefined {
	let seenTarget = false;
	let lastAssistantUuid: string | undefined;
	for (const msg of messages) {
		const parsed = parseSessionMessage(msg);
		if (parsed === undefined) {
			continue;
		}
		if (parsed.kind === 'user-text') {
			if (seenTarget) {
				// First genuine user-text after turn N started → turn N is over.
				break;
			}
			if (parsed.uuid === turnId) {
				seenTarget = true;
			}
		} else if (parsed.kind === 'assistant' && seenTarget) {
			lastAssistantUuid = parsed.uuid;
		}
		// 'user-tool-results' / 'system-notification' never flip the turn.
	}
	if (!seenTarget) {
		return undefined;
	}
	return lastAssistantUuid ?? turnId;
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
	| { readonly kind: 'assistant'; readonly uuid: string; readonly blocks: readonly AssistantBlock[]; readonly isInner: boolean }
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
	// Subagent transcripts (from `getSubagentMessages`) carry a
	// `parent_tool_use_id` on every envelope and have no synthetic spawning
	// user prompt, so they legitimately open with an assistant message —
	// `isInner` lets the builder synthesize a turn instead of dropping it.
	return { kind: 'assistant', uuid: msg.uuid, blocks, isInner: msg.parent_tool_use_id !== null };
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
	/**
	 * Cross-turn tool-use tracking. Keyed by `tool_use_id`:
	 * - `turnId` — the announcing turn (so a late `tool_result` in a
	 *   later `user` envelope can attach back to the right turn per M7).
	 * - `parsedInput` — the original `tool_use.input`, looked up at
	 *   `_attachToolResult` so the past-tense message can include the
	 *   original parameters. Mirrors the live mapper's `_toolCallInfo`
	 *   pattern but simpler (replay has the full input synchronously on
	 *   the `tool_use` block).
	 */
	private readonly _toolUses = new Map<string, { readonly turnId: string; readonly parsedInput: Record<string, unknown> | undefined }>();

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
			if (!msg.isInner) {
				// Top-level assistant envelope without a preceding user message —
				// anomalous; synthesizing an empty user turn would be wrong, so
				// drop with a warn.
				this._logService.warn(`[claudeReplayMapper] assistant envelope ${msg.uuid} arrived before any user message; dropping`);
				return;
			}
			// Subagent transcript: every envelope carries `parent_tool_use_id`
			// and the SDK omits the synthetic spawning prompt, so the transcript
			// legitimately opens with an assistant message. Synthesize an
			// empty-prompt turn to hold the subagent's reply instead of dropping
			// it (which would lose the entire subagent transcript on replay).
			this._active = {
				id: msg.uuid,
				userText: '',
				responseParts: [],
				pendingToolUseIds: new Set(),
				toolCallParts: new Map(),
			};
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
				// Strip the in-process MCP server prefix so the workbench resolves
				// the workbench-registered tool by its unprefixed name (matches the
				// live stream mapper). Without this, replayed client-tool calls
				// fall back to the generic "Run MCP tool" rendering.
				this._openToolUse(block.id, stripClientToolNamePrefix(block.name), block.input);
			}
			// Other block types (server_tool_use, etc.) are dropped silently per M7.
		}
	}

	private _openToolUse(toolUseId: string, toolName: string, input: unknown): void {
		if (this._active === undefined) {
			return;
		}
		const displayName = getClaudeToolDisplayName(toolName);
		const parsedInput = input !== null && typeof input === 'object' ? input as Record<string, unknown> : undefined;
		const meta = buildClaudeToolMeta(toolName);
		// Build a placeholder Cancelled state by default; replaced with Completed when the tool_result lands.
		const placeholder: ToolCallCancelledState = {
			status: ToolCallStatus.Cancelled,
			toolCallId: toolUseId,
			toolName,
			displayName,
			invocationMessage: getClaudeInvocationMessage(toolName, displayName, parsedInput),
			toolInput: parsedInput !== undefined ? getClaudeToolInputString(toolName, parsedInput) : (typeof input === 'string' ? input : input !== undefined ? safeStringify(input) : undefined),
			reason: ToolCallCancellationReason.Skipped,
			...(meta ? { _meta: meta } : {}),
		};
		const part: ToolCallResponsePart = {
			kind: ResponsePartKind.ToolCall,
			toolCall: placeholder,
		};
		this._active.responseParts.push(part);
		this._active.toolCallParts.set(toolUseId, part);
		this._active.pendingToolUseIds.add(toolUseId);
		this._toolUses.set(toolUseId, { turnId: this._active.id, parsedInput });
	}

	private _attachToolResult(block: UserToolResultBlock): void {
		const entry = this._toolUses.get(block.tool_use_id);
		if (entry === undefined) {
			this._logService.warn(`[claudeReplayMapper] tool_result for unknown tool_use_id ${block.tool_use_id}`);
			return;
		}
		const announcingTurnId = entry.turnId;
		// Find the part — it lives on the announcing turn (which may be `_active` or one already pushed to `_turns`).
		const part = this._findToolCallPart(announcingTurnId, block.tool_use_id);
		if (part === undefined) {
			return;
		}
		const isError = block.is_error;
		const previousState = part.toolCall;
		const isSubagent = readToolCallMeta(previousState).toolKind === 'subagent';
		const content: ToolResultContent[] = extractToolResultContent(block.content) ?? [];
		const resultText = content
			.filter((c): c is { type: ToolResultContentType.Text; text: string } => c.type === ToolResultContentType.Text)
			.map(c => c.text)
			.join('\n');
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
			pastTenseMessage: getClaudePastTenseMessage(previousState.toolName, previousState.displayName, entry.parsedInput, !isError, resultText),
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
			message: { text: a.userText, origin: { kind: MessageKind.User } },
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
