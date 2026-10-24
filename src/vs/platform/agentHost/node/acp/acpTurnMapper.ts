/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../../base/common/uri.js';
import type { IAgentActionSignal } from '../../common/agent.js';
import { ActionType, type ChatAction } from '../../common/state/sessionActions.js';
import { ResponsePartKind, ToolCallConfirmationReason, ToolResultContentType, createErrorResponsePart, type ToolCallResult, type ToolResultContent } from '../../common/state/sessionState.js';
import type { AcpContentBlock, AcpSessionUpdate, AcpStopReason, AcpToolCallContent, IAcpToolCallFields } from './acpProtocol.js';

interface IToolCallState {
	title: string;
	kind: string;
	rawInput: unknown;
	content: readonly AcpToolCallContent[];
	/** `ChatToolCallReady` was emitted, by us or by the host after a permission prompt. */
	ready: boolean;
	done: boolean;
}

/**
 * Maps the ACP `session/update` stream of one prompt turn onto agent host
 * chat actions.
 *
 * The host dispatches the canonical `ChatTurnStarted` before calling
 * `sendMessage`, so the mapper never emits it; it owns everything from the
 * first response part to the terminal turn action.
 */
export class AcpTurnMapper {

	private _openPart: { readonly id: string; readonly kind: ResponsePartKind.Markdown | ResponsePartKind.Reasoning } | undefined;
	private _partCounter = 0;
	private readonly _tools = new Map<string, IToolCallState>();
	private readonly _startTime = Date.now();
	private _ended = false;

	constructor(
		private readonly _chat: URI,
		readonly turnId: string,
	) { }

	get ended(): boolean {
		return this._ended;
	}

	/** Maps one update; unknown or uninteresting updates map to nothing. */
	map(update: AcpSessionUpdate | { readonly sessionUpdate: string }): IAgentActionSignal[] {
		if (this._ended) {
			return [];
		}
		const u = update as AcpSessionUpdate;
		switch (u.sessionUpdate) {
			case 'agent_message_chunk':
				return this._appendText(ResponsePartKind.Markdown, contentBlockToMarkdown(u.content));
			case 'agent_thought_chunk':
				return this._appendText(ResponsePartKind.Reasoning, contentBlockToMarkdown(u.content));
			case 'tool_call':
			case 'tool_call_update':
				return this._updateToolCall(u);
			default:
				// user_message_chunk (replay only), plan, mode/config/command updates,
				// session info and usage are surfaced through other paths, if at all.
				return [];
		}
	}

	/**
	 * Registers a tool call the agent is asking permission for. Emits the
	 * tool start if the agent never announced the call, and marks it ready
	 * because the host emits `ChatToolCallReady` for the confirmation itself.
	 */
	beginPermission(toolCall: IAcpToolCallFields): IAgentActionSignal[] {
		const signals = this._updateToolCall({ ...toolCall, status: undefined });
		const state = this._tools.get(toolCall.toolCallId);
		if (state) {
			state.ready = true;
		}
		return signals;
	}

	/** Terminal actions for a `session/prompt` that resolved with `stopReason`. */
	finish(stopReason: AcpStopReason | string): IAgentActionSignal[] {
		if (this._ended) {
			return [];
		}
		const signals = this._settleOpenToolCalls(stopReason !== 'cancelled');
		this._ended = true;
		const duration = Date.now() - this._startTime;
		if (stopReason === 'cancelled') {
			signals.push(this._signal({ type: ActionType.ChatTurnCancelled, turnId: this.turnId, duration }));
		} else if (stopReason === 'refusal') {
			signals.push(this._signal({ type: ActionType.ChatError, turnId: this.turnId, duration, part: createErrorResponsePart({ errorType: 'refusal', message: 'The agent declined to continue this turn.' }) }));
		} else {
			signals.push(this._signal({ type: ActionType.ChatTurnComplete, turnId: this.turnId, duration }));
		}
		return signals;
	}

	/** Terminal actions for a turn whose `session/prompt` request failed. */
	fail(errorType: string, message: string): IAgentActionSignal[] {
		if (this._ended) {
			return [];
		}
		const signals = this._settleOpenToolCalls(false);
		this._ended = true;
		signals.push(this._signal({ type: ActionType.ChatError, turnId: this.turnId, duration: Date.now() - this._startTime, part: createErrorResponsePart({ errorType, message }) }));
		return signals;
	}

	private _appendText(kind: ResponsePartKind.Markdown | ResponsePartKind.Reasoning, text: string): IAgentActionSignal[] {
		if (!text) {
			return [];
		}
		if (this._openPart?.kind === kind) {
			return [this._signal(kind === ResponsePartKind.Markdown
				? { type: ActionType.ChatDelta, turnId: this.turnId, partId: this._openPart.id, content: text }
				: { type: ActionType.ChatReasoning, turnId: this.turnId, partId: this._openPart.id, content: text })];
		}
		const id = `acp-${kind === ResponsePartKind.Markdown ? 'md' : 'rs'}-${this.turnId}-${++this._partCounter}`;
		this._openPart = { id, kind };
		return [this._signal({ type: ActionType.ChatResponsePart, turnId: this.turnId, part: { kind, id, content: text } })];
	}

	private _updateToolCall(fields: IAcpToolCallFields): IAgentActionSignal[] {
		// A tool call interrupts the running text part; later text starts a new one.
		this._openPart = undefined;
		const signals: IAgentActionSignal[] = [];
		let state = this._tools.get(fields.toolCallId);
		if (!state) {
			state = {
				title: fields.title || fields.kind || 'Tool',
				kind: fields.kind || 'other',
				rawInput: fields.rawInput,
				content: fields.content ?? [],
				ready: false,
				done: false,
			};
			this._tools.set(fields.toolCallId, state);
			signals.push(this._signal({ type: ActionType.ChatToolCallStart, turnId: this.turnId, toolCallId: fields.toolCallId, toolName: state.kind, displayName: state.title }));
		} else {
			if (fields.title) {
				state.title = fields.title;
			}
			if (fields.kind) {
				state.kind = fields.kind;
			}
			if (fields.rawInput !== undefined) {
				state.rawInput = fields.rawInput;
			}
			if (fields.content) {
				state.content = fields.content;
			}
		}
		if (state.done) {
			return signals;
		}
		switch (fields.status) {
			case 'in_progress':
				signals.push(...this._ensureReady(fields.toolCallId, state));
				break;
			case 'completed':
			case 'failed':
				signals.push(...this._ensureReady(fields.toolCallId, state));
				signals.push(this._complete(fields.toolCallId, state, fields.status === 'completed'));
				break;
		}
		return signals;
	}

	private _ensureReady(toolCallId: string, state: IToolCallState): IAgentActionSignal[] {
		if (state.ready) {
			return [];
		}
		state.ready = true;
		return [this._signal({
			type: ActionType.ChatToolCallReady,
			turnId: this.turnId,
			toolCallId,
			invocationMessage: state.title,
			toolInput: stringifyToolInput(state.rawInput),
			confirmed: ToolCallConfirmationReason.NotNeeded,
		})];
	}

	private _complete(toolCallId: string, state: IToolCallState, success: boolean): IAgentActionSignal {
		state.done = true;
		const content = toolContentToResult(state.content);
		const result: ToolCallResult = {
			success,
			pastTenseMessage: state.title,
			...(content.length ? { content } : {}),
			...(success ? {} : { error: { message: `${state.title} failed` } }),
		};
		return this._signal({ type: ActionType.ChatToolCallComplete, turnId: this.turnId, toolCallId, result });
	}

	/** Agents may end a turn without reporting every tool call's final status. */
	private _settleOpenToolCalls(success: boolean): IAgentActionSignal[] {
		const signals: IAgentActionSignal[] = [];
		for (const [toolCallId, state] of this._tools) {
			if (!state.done) {
				signals.push(...this._ensureReady(toolCallId, state));
				signals.push(this._complete(toolCallId, state, success));
			}
		}
		return signals;
	}

	private _signal(action: ChatAction): IAgentActionSignal {
		return { kind: 'action', resource: this._chat, action };
	}
}

/** Renders a content block as markdown; non-text blocks degrade to a reference. */
export function contentBlockToMarkdown(block: AcpContentBlock): string {
	switch (block.type) {
		case 'text':
			return (block as { text: string }).text;
		case 'resource_link': {
			const link = block as { uri: string; name: string; title?: string | null };
			return `[${link.title || link.name}](${link.uri})`;
		}
		case 'resource': {
			const resource = (block as { resource: { uri: string; text?: string } }).resource;
			return resource.text ?? resource.uri;
		}
		default:
			return '';
	}
}

function stringifyToolInput(rawInput: unknown): string | undefined {
	if (rawInput === undefined || rawInput === null) {
		return undefined;
	}
	if (typeof rawInput === 'string') {
		return rawInput;
	}
	try {
		return JSON.stringify(rawInput, undefined, 2);
	} catch {
		return undefined;
	}
}

function toolContentToResult(content: readonly AcpToolCallContent[]): ToolResultContent[] {
	const result: ToolResultContent[] = [];
	for (const item of content) {
		if (item.type === 'content') {
			const text = contentBlockToMarkdown(item.content);
			if (text) {
				result.push({ type: ToolResultContentType.Text, text });
			}
		} else if (item.type === 'diff') {
			result.push({ type: ToolResultContentType.Text, text: describeDiff(item.path, item.oldText ?? undefined, item.newText) });
		}
		// `terminal` content refers to client-managed terminals, which this provider does not advertise.
	}
	return result;
}

function describeDiff(path: string, oldText: string | undefined, newText: string): string {
	if (oldText === undefined) {
		return `Created ${path}`;
	}
	const before = oldText.split('\n').length;
	const after = newText.split('\n').length;
	return `Edited ${path} (${before} → ${after} lines)`;
}
