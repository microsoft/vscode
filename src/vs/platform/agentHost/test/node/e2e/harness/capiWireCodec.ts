/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Wire codecs for the CAPI record/replay proxy. Each dialect the agent host's
 * bundled SDK/CLI speaks can be parsed from its streamed SSE form into a small,
 * human-readable message object (for a clean YAML capture) and regenerated back
 * into an SSE stream on replay.
 *
 * Ported (lean) from the Copilot CLI e2e harness's dialect adapters — we keep
 * the messages in their native dialect shape rather than normalizing to OpenAI
 * chat-completions, which is enough for readable captures + faithful replay.
 *
 * Currently supports the Anthropic Messages dialect (`POST /v1/messages`),
 * which is what the Copilot and Claude providers use.
 */

// #region SSE parsing

export interface ISseEvent {
	readonly type: string;
	readonly [key: string]: unknown;
}

/**
 * Parse an SSE body into typed JSON events. Tolerant of `\r?\n` line endings and
 * multiple `data:` lines per event (joined with `\n` per the SSE spec). Skips
 * `[DONE]` sentinels and events without a string `type`.
 */
export function parseSseEvents(body: string): ISseEvent[] {
	const events: ISseEvent[] = [];
	for (const block of body.split(/\r?\n\r?\n/)) {
		if (!block.trim()) {
			continue;
		}
		let dataPayload: string | undefined;
		for (const line of block.split(/\r?\n/)) {
			if (!line.startsWith('data:')) {
				continue;
			}
			const value = line.slice(5).replace(/^ /, '');
			dataPayload = dataPayload === undefined ? value : `${dataPayload}\n${value}`;
		}
		if (dataPayload === undefined || dataPayload === '[DONE]') {
			continue;
		}
		try {
			const parsed = JSON.parse(dataPayload) as { type?: unknown };
			if (typeof parsed.type === 'string') {
				events.push(parsed as ISseEvent);
			}
		} catch {
			// skip malformed events
		}
	}
	return events;
}

// #endregion

// #region Anthropic Messages dialect

/** A content block in an Anthropic assistant message (the subset we capture). */
export type AnthropicContentBlock =
	| { readonly type: 'text'; text: string }
	| { readonly type: 'tool_use'; readonly id: string; readonly name: string; input: unknown };

/** The captured/replayed shape of an Anthropic `/v1/messages` assistant reply. */
export interface IAnthropicMessage {
	readonly content: AnthropicContentBlock[];
	readonly stopReason: string | null;
	readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number };
}

export const ANTHROPIC_MESSAGES_PATH = '/v1/messages';

interface IMutableTextBlock { type: 'text'; text: string }
interface IMutableToolUseBlock { type: 'tool_use'; id: string; name: string; input: unknown }
type MutableBlock = IMutableTextBlock | IMutableToolUseBlock;

/**
 * Aggregate a streamed Anthropic `/v1/messages` SSE body into a single message
 * (content blocks + stop reason + usage). Returns undefined if the stream had
 * no `message_start`.
 */
export function aggregateAnthropicSse(sseBody: string): IAnthropicMessage | undefined {
	const events = parseSseEvents(sseBody);
	let started = false;
	let stopReason: string | null = null;
	let inputTokens: number | undefined;
	let outputTokens: number | undefined;
	const blocks: MutableBlock[] = [];
	const toolInputBuffers: string[] = [];

	for (const evt of events) {
		switch (evt.type) {
			case 'message_start': {
				started = true;
				const message = evt['message'] as { usage?: { input_tokens?: number } } | undefined;
				inputTokens = message?.usage?.input_tokens;
				break;
			}
			case 'content_block_start': {
				const index = evt['index'] as number;
				const block = evt['content_block'] as { type: string; id?: string; name?: string; text?: string };
				if (block.type === 'text') {
					blocks[index] = { type: 'text', text: block.text ?? '' };
				} else if (block.type === 'tool_use') {
					blocks[index] = { type: 'tool_use', id: block.id ?? '', name: block.name ?? '', input: {} };
					toolInputBuffers[index] = '';
				}
				break;
			}
			case 'content_block_delta': {
				const index = evt['index'] as number;
				const delta = evt['delta'] as { type: string; text?: string; partial_json?: string };
				const block = blocks[index];
				if (!block) {
					break;
				}
				if (delta.type === 'text_delta' && block.type === 'text') {
					block.text += delta.text ?? '';
				} else if (delta.type === 'input_json_delta' && block.type === 'tool_use') {
					toolInputBuffers[index] = (toolInputBuffers[index] ?? '') + (delta.partial_json ?? '');
				}
				break;
			}
			case 'content_block_stop': {
				const index = evt['index'] as number;
				const block = blocks[index];
				if (block?.type === 'tool_use') {
					block.input = safeParseJson(toolInputBuffers[index] ?? '{}');
				}
				break;
			}
			case 'message_delta': {
				const delta = evt['delta'] as { stop_reason?: string | null } | undefined;
				const usage = evt['usage'] as { output_tokens?: number } | undefined;
				if (delta?.stop_reason !== undefined) {
					stopReason = delta.stop_reason;
				}
				if (usage?.output_tokens !== undefined) {
					outputTokens = usage.output_tokens;
				}
				break;
			}
		}
	}

	if (!started) {
		return undefined;
	}
	return {
		content: blocks.filter((b): b is MutableBlock => !!b),
		stopReason,
		usage: (inputTokens !== undefined || outputTokens !== undefined) ? { inputTokens, outputTokens } : undefined,
	};
}

/**
 * Regenerate an Anthropic `/v1/messages` SSE stream from a captured message.
 * Emits the full event sequence (`message_start` -> per-block
 * start/delta/stop -> `message_delta` -> `message_stop`) the SDK expects. Text
 * and tool inputs are each emitted as a single delta, which the runtime client
 * tolerates.
 */
export function anthropicMessageToSse(message: IAnthropicMessage): string {
	const id = `msg_replay_${randomHex()}`;
	const chunks: string[] = [];

	chunks.push(sseEvent('message_start', {
		type: 'message_start',
		message: {
			id,
			type: 'message',
			role: 'assistant',
			content: [],
			model: 'replay',
			stop_reason: null,
			stop_sequence: null,
			// Real Anthropic emits output_tokens=1 here; corrected by message_delta.
			usage: { input_tokens: message.usage?.inputTokens ?? 1, output_tokens: 1 },
		},
	}));

	message.content.forEach((block, index) => {
		if (block.type === 'text') {
			chunks.push(sseEvent('content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }));
			chunks.push(sseEvent('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } }));
			chunks.push(sseEvent('content_block_stop', { type: 'content_block_stop', index }));
		} else {
			chunks.push(sseEvent('content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } }));
			chunks.push(sseEvent('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input ?? {}) } }));
			chunks.push(sseEvent('content_block_stop', { type: 'content_block_stop', index }));
		}
	});

	chunks.push(sseEvent('message_delta', {
		type: 'message_delta',
		delta: { stop_reason: message.stopReason, stop_sequence: null },
		usage: { output_tokens: message.usage?.outputTokens ?? 1 },
	}));
	chunks.push(sseEvent('message_stop', { type: 'message_stop' }));

	return chunks.join('');
}

/**
 * A compact, human-readable view of an Anthropic `/v1/messages` request, for
 * the YAML capture. The (large, model-catalog-bearing) system prompt is
 * replaced with a placeholder. Message content is collapsed to a bare string
 * when it is a single text block (see {@link collapseSingleText}).
 */
export interface IReadableAnthropicRequest {
	readonly model: string;
	readonly system: string;
	readonly messages: ReadonlyArray<{ readonly role: string; readonly content: unknown }>;
}

const SYSTEM_PLACEHOLDER = '${system}';

export function summarizeAnthropicRequest(requestBody: string): IReadableAnthropicRequest | undefined {
	let parsed: { model?: string; system?: unknown; messages?: Array<{ role?: string; content?: unknown }> };
	try {
		parsed = JSON.parse(requestBody);
	} catch {
		return undefined;
	}
	if (typeof parsed.model !== 'string' || !Array.isArray(parsed.messages)) {
		return undefined;
	}
	// Drop harness-injected `system`-role messages (e.g. Claude Code's available
	// -skills listing) — they are environment-specific boilerplate, not part of
	// the conversation, and the real system prompt is already a placeholder.
	const messages = parsed.messages
		.filter(m => m.role !== 'system')
		.map(m => ({ role: m.role ?? 'user', content: summarizeContent(m.content) }))
		.filter(m => !isEmptyContent(m.content));
	return {
		model: parsed.model,
		system: parsed.system !== undefined ? SYSTEM_PLACEHOLDER : '',
		messages,
	};
}

function isEmptyContent(content: unknown): boolean {
	return content === '' || (Array.isArray(content) && content.length === 0);
}

/** Reduce message content to something readable: plain strings stay, block
 * arrays keep type + the salient field (text / tool name / tool_use_id). A
 * lone text block collapses to a bare string. Volatile per-run values (e.g. the
 * injected wall clock) are normalized so captures stay deterministic. */
function summarizeContent(content: unknown): unknown {
	if (typeof content === 'string') {
		return normalizeVolatileText(content);
	}
	if (!Array.isArray(content)) {
		return content;
	}
	const blocks = content.map(block => {
		const b = block as { type?: string; text?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown };
		switch (b.type) {
			case 'text': return { type: 'text', text: normalizeVolatileText(b.text ?? '') };
			case 'tool_use': return { type: 'tool_use', name: b.name, input: b.input };
			case 'tool_result': return { type: 'tool_result', tool_use_id: b.tool_use_id, content: summarizeContent(b.content) };
			default: return { type: b.type };
		}
	}).filter(b => !(b.type === 'text' && (b as { text?: string }).text === ''));
	return collapseSingleText(blocks);
}

/** Collapse a content array holding exactly one text block to its bare string,
 * so a plain message reads `content: hello` instead of a single-entry list. */
function collapseSingleText(blocks: readonly unknown[]): unknown {
	if (blocks.length === 1) {
		const only = blocks[0] as { type?: string; text?: string };
		if (only.type === 'text' && typeof only.text === 'string') {
			return only.text;
		}
	}
	return blocks;
}

/**
 * Serialize an assistant reply's content for storage: a lone text block becomes
 * a bare string (`content: hello`); anything richer stays an explicit block
 * list. Inverse of {@link deserializeAnthropicContent}.
 */
export function serializeAnthropicContent(content: AnthropicContentBlock[]): string | AnthropicContentBlock[] {
	if (content.length === 1 && content[0].type === 'text') {
		return content[0].text;
	}
	return content;
}

/** Expand a stored assistant reply's content back into an explicit block list. */
export function deserializeAnthropicContent(content: string | AnthropicContentBlock[]): AnthropicContentBlock[] {
	return typeof content === 'string' ? [{ type: 'text', text: content }] : content;
}

const CURRENT_DATETIME_RE = /<current_datetime>.*?<\/current_datetime>/gs;
const SYSTEM_REMINDER_RE = /<system[-_]reminder>.*?<\/system[-_]reminder>/gs;
const ENVIRONMENT_CONTEXT_RE = /<environment_context>.*?<\/environment_context>/gs;

/** Strip volatile / boilerplate wrappers the runtime injects around the real
 * user text (the `<current_datetime>` wall clock, `<system-reminder>` blocks,
 * and Codex's `<environment_context>` cwd/date preamble) so captures show just
 * the meaningful message and stay deterministic across re-records. Mirrors the
 * Copilot CLI harness, which normalizes the same injected blocks. */
function normalizeVolatileText(text: string): string {
	return text
		.replace(CURRENT_DATETIME_RE, '')
		.replace(SYSTEM_REMINDER_RE, '')
		.replace(ENVIRONMENT_CONTEXT_RE, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

// #endregion

// #region OpenAI Responses dialect

/**
 * The OpenAI Responses API (`POST /responses`) used by the Codex provider. We
 * reuse the Anthropic readable shapes ({@link IReadableAnthropicRequest} /
 * {@link IAnthropicMessage}) since both dialects map cleanly to text / tool_use
 * / tool_result blocks — only the wire (SSE) parse and regeneration differ.
 */
export const RESPONSES_PATH = '/responses';

/**
 * Aggregate a streamed `/responses` SSE body into a message. Reads the
 * authoritative `response.output_item.done` items (message + function_call) and
 * the final usage; reasoning items (opaque encrypted content) are dropped.
 */
export function aggregateResponsesSse(sseBody: string): IAnthropicMessage | undefined {
	const events = parseSseEvents(sseBody);
	const blocks: MutableBlock[] = [];
	let usage: { inputTokens?: number; outputTokens?: number } | undefined;
	let seen = false;

	for (const evt of events) {
		if (evt.type === 'response.output_item.done') {
			seen = true;
			const item = evt['item'] as { type?: string; content?: Array<{ type?: string; text?: string }>; name?: string; arguments?: string; call_id?: string; id?: string };
			if (item.type === 'message') {
				const text = (item.content ?? []).filter(c => c.type === 'output_text').map(c => c.text ?? '').join('');
				if (text) {
					blocks.push({ type: 'text', text });
				}
			} else if (item.type === 'function_call') {
				blocks.push({ type: 'tool_use', id: item.call_id ?? item.id ?? '', name: item.name ?? '', input: safeParseJson(item.arguments ?? '{}') });
			}
		} else if (evt.type === 'response.completed') {
			usage = usageFromResponsesEvent(evt);
		}
	}

	if (!seen) {
		return undefined;
	}
	const stopReason = blocks.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
	return { content: blocks, stopReason, usage: (usage && (usage.inputTokens !== undefined || usage.outputTokens !== undefined)) ? usage : undefined };
}

/** Extract token usage from a `response.completed` event (native `usage` field
 * or Copilot's `copilot_usage.token_details`). */
function usageFromResponsesEvent(evt: ISseEvent): { inputTokens?: number; outputTokens?: number } {
	const response = evt['response'] as { usage?: { input_tokens?: number; output_tokens?: number } } | undefined;
	if (response?.usage && (response.usage.input_tokens !== undefined || response.usage.output_tokens !== undefined)) {
		return { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
	}
	const details = (evt['copilot_usage'] as { token_details?: Array<{ token_type?: string; token_count?: number }> } | undefined)?.token_details;
	if (Array.isArray(details)) {
		let inputTokens: number | undefined;
		let outputTokens: number | undefined;
		for (const d of details) {
			if (d.token_type === 'input') { inputTokens = d.token_count; }
			else if (d.token_type === 'output') { outputTokens = d.token_count; }
		}
		return { inputTokens, outputTokens };
	}
	return {};
}

/** Summarize a `/responses` request into the shared readable request shape. */
export function summarizeResponsesRequest(requestBody: string): IReadableAnthropicRequest | undefined {
	let parsed: { model?: string; instructions?: unknown; input?: unknown };
	try {
		parsed = JSON.parse(requestBody);
	} catch {
		return undefined;
	}
	if (typeof parsed.model !== 'string') {
		return undefined;
	}
	return {
		model: parsed.model,
		system: parsed.instructions !== undefined ? SYSTEM_PLACEHOLDER : '',
		messages: responsesInputToMessages(parsed.input),
	};
}

/** Map a `/responses` request `input` (string or item list) to readable messages. */
function responsesInputToMessages(input: unknown): Array<{ role: string; content: unknown }> {
	if (typeof input === 'string') {
		const text = normalizeVolatileText(input);
		return text ? [{ role: 'user', content: text }] : [];
	}
	if (!Array.isArray(input)) {
		return [];
	}
	const messages: Array<{ role: string; content: unknown }> = [];
	for (const raw of input) {
		const item = raw as { type?: string; role?: string; content?: unknown; name?: string; arguments?: string; call_id?: string; output?: unknown };
		switch (item.type) {
			case 'message': {
				// Skip harness-injected instruction messages (Codex uses the
				// `developer` / `system` roles for its permissions + environment
				// preamble); the real system prompt is already a placeholder.
				if (item.role === 'system' || item.role === 'developer') {
					break;
				}
				const content = summarizeContent(responsesTextParts(item.content));
				if (!isEmptyContent(content)) {
					messages.push({ role: item.role ?? 'user', content });
				}
				break;
			}
			case 'function_call':
				messages.push({ role: 'assistant', content: [{ type: 'tool_use', name: item.name, input: safeParseJson(item.arguments ?? '{}') }] });
				break;
			case 'function_call_output':
				messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: item.call_id, content: summarizeResponsesOutput(item.output) }] });
				break;
			// reasoning / other items are dropped from the readable capture
		}
	}
	return messages;
}

/** Flatten Responses `content` parts (`input_text` / `output_text`) to text blocks. */
function responsesTextParts(content: unknown): unknown {
	if (typeof content === 'string') {
		return content;
	}
	if (!Array.isArray(content)) {
		return content;
	}
	return content.map(part => {
		const p = part as { type?: string; text?: string };
		return { type: 'text', text: p.text ?? '' };
	});
}

/** Normalize a `function_call_output` `output` to readable text. */
function summarizeResponsesOutput(output: unknown): unknown {
	if (typeof output === 'string') {
		return normalizeVolatileText(output);
	}
	return summarizeContent(output);
}

/**
 * Regenerate a `/responses` SSE stream from a captured message. Emits the event
 * sequence the Codex app-server expects (`response.created` -> per-item
 * added/delta/done -> `response.completed`) with synthetic, stable item ids.
 * The `response` envelope carries the full set of required OpenAI Responses
 * fields so the client accepts the turn as complete (a partial envelope makes
 * it retry).
 */
export function responsesMessageToSse(message: IAnthropicMessage): string {
	const responseId = `resp_replay_${randomHex()}`;
	let seq = 0;

	const outputItems: ResponsesOutputItem[] = message.content.map((block, index): ResponsesOutputItem => {
		const id = `item_${index}`;
		return block.type === 'text'
			? { id, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: block.text, annotations: [], logprobs: [] }] }
			: { id, type: 'function_call', name: block.name, call_id: block.id, arguments: JSON.stringify(block.input ?? {}), status: 'completed' };
	});
	const outputText = message.content.filter((b): b is Extract<AnthropicContentBlock, { type: 'text' }> => b.type === 'text').map(b => b.text).join('');
	const usage = {
		input_tokens: message.usage?.inputTokens ?? 1,
		output_tokens: message.usage?.outputTokens ?? 1,
		total_tokens: (message.usage?.inputTokens ?? 1) + (message.usage?.outputTokens ?? 1),
	};
	const envelope = (status: string, output: readonly ResponsesOutputItem[], text: string, use: unknown) => ({
		id: responseId, object: 'response', created_at: 0, status, error: null, incomplete_details: null,
		instructions: null, model: 'replay', output, output_text: text, parallel_tool_calls: true,
		temperature: 1, tool_choice: 'auto', tools: [], top_p: 1, usage: use,
	});

	const chunks: string[] = [];
	const skeleton = envelope('in_progress', [], '', undefined);
	chunks.push(sseEvent('response.created', { type: 'response.created', sequence_number: seq++, response: skeleton }));
	chunks.push(sseEvent('response.in_progress', { type: 'response.in_progress', sequence_number: seq++, response: skeleton }));

	outputItems.forEach((item, index) => {
		chunks.push(sseEvent('response.output_item.added', { type: 'response.output_item.added', sequence_number: seq++, output_index: index, item }));
		if (item.type === 'message') {
			const text = item.content[0].text;
			const part = { type: 'output_text', text, annotations: [], logprobs: [] };
			chunks.push(sseEvent('response.content_part.added', { type: 'response.content_part.added', sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, part: { type: 'output_text', text: '', annotations: [], logprobs: [] } }));
			chunks.push(sseEvent('response.output_text.delta', { type: 'response.output_text.delta', sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, delta: text, logprobs: [] }));
			chunks.push(sseEvent('response.output_text.done', { type: 'response.output_text.done', sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, text, logprobs: [] }));
			chunks.push(sseEvent('response.content_part.done', { type: 'response.content_part.done', sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, part }));
		} else {
			chunks.push(sseEvent('response.function_call_arguments.delta', { type: 'response.function_call_arguments.delta', sequence_number: seq++, item_id: item.id, output_index: index, delta: item.arguments }));
			chunks.push(sseEvent('response.function_call_arguments.done', { type: 'response.function_call_arguments.done', sequence_number: seq++, item_id: item.id, output_index: index, arguments: item.arguments }));
		}
		chunks.push(sseEvent('response.output_item.done', { type: 'response.output_item.done', sequence_number: seq++, output_index: index, item }));
	});

	chunks.push(sseEvent('response.completed', { type: 'response.completed', sequence_number: seq++, response: envelope('completed', outputItems, outputText, usage) }));
	return chunks.join('');
}

type ResponsesOutputItem =
	| { readonly id: string; readonly type: 'message'; readonly role: 'assistant'; readonly status: 'completed'; readonly content: Array<{ type: 'output_text'; text: string; annotations: unknown[]; logprobs: unknown[] }> }
	| { readonly id: string; readonly type: 'function_call'; readonly name: string; readonly call_id: string; readonly arguments: string; readonly status: 'completed' };

// #endregion

// #region helpers

function sseEvent(eventName: string, data: unknown): string {
	return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

function safeParseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return {};
	}
}

function randomHex(): string {
	return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

// #endregion
