/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Converts internal message types to OTel GenAI JSON schema format.
 * @see https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-input-messages.json
 * @see https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-output-messages.json
 */

/**
 * Truncate a string to fit within OTel attribute size limits.
 * Returns the original string if within bounds, otherwise truncates with a suffix.
 *
 * @param value The string to truncate.
 * @param maxLength The maximum length in characters. A value of `0` (the
 * default) or any non-positive number disables truncation entirely, matching
 * the OTel spec's `AttributeValueLengthLimit` default of `Infinity` for string
 * attributes (see https://opentelemetry.io/docs/specs/otel/common/#attribute-limits).
 * Production call sites should pass `OTelConfig.maxAttributeSizeChars` so
 * users can configure truncation to match their backend's per-attribute limit.
 */
export function truncateForOTel(value: string, maxLength: number = 0): string {
	if (maxLength <= 0 || value.length <= maxLength) {
		return value;
	}
	const suffix = `...[truncated, original ${value.length} chars]`;
	// If maxLength is too small to fit the suffix, fall back to a hard cut so
	// the result is always <= maxLength.
	if (maxLength <= suffix.length) {
		return value.substring(0, maxLength);
	}
	return value.substring(0, maxLength - suffix.length) + suffix;
}

export interface OTelChatMessage {
	role: string | undefined;
	parts: OTelMessagePart[];
}

export interface OTelOutputMessage extends OTelChatMessage {
	finish_reason?: string;
}

export type OTelMessagePart =
	| { type: 'text'; content: string }
	| { type: 'tool_call'; id: string; name: string; arguments: unknown }
	| { type: 'tool_call_response'; id: string; response: unknown }
	| { type: 'tool_search_output'; id: string; tools?: unknown; status?: string }
	| { type: 'reasoning'; content: string };

export type OTelSystemInstruction = Array<{ type: 'text'; content: string }>;

export interface OTelToolDefinition {
	type: 'function';
	name: string;
	description?: string;
	parameters?: unknown;
}

/**
 * Convert an array of internal messages to OTel input message format.
 * Handles OpenAI format (tool_calls, tool_call_id) natively.
 */
export function toInputMessages(messages: ReadonlyArray<{ role?: string; content?: string; tool_calls?: ReadonlyArray<{ id: string; function: { name: string; arguments: string } }>; tool_call_id?: string }>): OTelChatMessage[] {
	return messages.map(msg => {
		const parts: OTelMessagePart[] = [];

		// OpenAI tool-result message (role=tool): map to tool_call_response
		if (msg.role === 'tool' && msg.tool_call_id) {
			parts.push({ type: 'tool_call_response', id: msg.tool_call_id, response: msg.content ?? '' });
			return { role: msg.role, parts };
		}

		if (msg.content) {
			parts.push({ type: 'text', content: msg.content });
		}

		if (msg.tool_calls) {
			for (const tc of msg.tool_calls) {
				let args: unknown;
				try { args = JSON.parse(tc.function.arguments); } catch { args = tc.function.arguments; }
				parts.push({
					type: 'tool_call',
					id: tc.id,
					name: tc.function.name,
					arguments: args,
				});
			}
		}

		return { role: msg.role, parts };
	});
}

/**
 * Convert model response choices to OTel output message format.
 */
export function toOutputMessages(choices: ReadonlyArray<{
	message?: { role?: string; content?: string; tool_calls?: ReadonlyArray<{ id: string; function: { name: string; arguments: string } }> };
	finish_reason?: string;
}>): OTelOutputMessage[] {
	return choices.map(choice => {
		const parts: OTelMessagePart[] = [];
		const msg = choice.message;

		if (msg?.content) {
			parts.push({ type: 'text', content: msg.content });
		}

		if (msg?.tool_calls) {
			for (const tc of msg.tool_calls) {
				let args: unknown;
				try { args = JSON.parse(tc.function.arguments); } catch { args = tc.function.arguments; }
				parts.push({
					type: 'tool_call',
					id: tc.id,
					name: tc.function.name,
					arguments: args,
				});
			}
		}

		return {
			role: msg?.role ?? 'assistant',
			parts,
			finish_reason: choice.finish_reason,
		};
	});
}

/**
 * Convert system message to OTel system instruction format.
 */
export function toSystemInstructions(systemMessage: string | undefined): OTelSystemInstruction | undefined {
	if (!systemMessage) {
		return undefined;
	}
	return [{ type: 'text', content: systemMessage }];
}

/**
 * Normalize provider-specific messages (Anthropic content blocks, OpenAI
 * Chat Completions, OpenAI Responses API) to OTel GenAI semantic
 * convention format.
 *
 * Handles:
 * - Anthropic content block arrays: tool_use → tool_call, tool_result → tool_call_response, thinking → reasoning
 * - OpenAI Chat Completions: tool_calls, role=tool with tool_call_id
 * - OpenAI Responses API items: `type: 'message'` with `input_text` /
 *   `output_text` content blocks; `type: 'function_call'` →
 *   role=assistant + tool_call; `type: 'function_call_output'` →
 *   role=tool + tool_call_response; `type: 'tool_search_output'` →
 *   role=tool_search + tool_search_output; `type: 'reasoning'` →
 *   role=assistant + reasoning part
 * - Plain string content
 */
export function normalizeProviderMessages(messages: ReadonlyArray<Record<string, unknown>>): OTelChatMessage[] {
	return messages.map(msg => {
		// OpenAI Responses API items use `type` rather than (or in addition
		// to) `role` to distinguish item kinds. Handle them up front so we
		// always emit a populated `role` and `parts` array — otherwise the
		// downstream cache-explorer diff sees `{role: undefined, parts: []}`
		// for every item and reports the prompt as empty/unknown.
		const itemType = msg.type as string | undefined;
		switch (itemType) {
			case 'function_call':
				return normalizeResponsesFunctionCall(msg);
			case 'function_call_output':
				return normalizeResponsesFunctionCallOutput(msg);
			case 'tool_search_output':
				return normalizeResponsesToolSearchOutput(msg);
			case 'reasoning':
				return normalizeResponsesReasoning(msg);
			// `type: 'message'` falls through — its `role` and `content` are
			// handled by the regular branch below, with the addition that
			// content blocks may be `input_text` / `output_text`.
		}

		const role = msg.role as string | undefined;
		const parts: OTelMessagePart[] = [];
		const content = msg.content;

		// OpenAI tool-result message
		if (role === 'tool' && typeof msg.tool_call_id === 'string') {
			parts.push({ type: 'tool_call_response', id: msg.tool_call_id, response: content ?? '' });
			return { role, parts };
		}

		if (typeof content === 'string' && content.length > 0) {
			parts.push({ type: 'text', content });
		} else if (Array.isArray(content)) {
			// Anthropic content block array — and also OpenAI Responses API
			// `message` content arrays, which use `input_text` / `output_text`
			// instead of `text` for the block type.
			for (const block of content) {
				if (!block || typeof block !== 'object') { continue; }
				const b = block as Record<string, unknown>;
				switch (b.type) {
					case 'text':
					case 'input_text':
					case 'output_text':
						if (typeof b.text === 'string') {
							parts.push({ type: 'text', content: b.text });
						}
						break;
					case 'tool_use':
						parts.push({
							type: 'tool_call',
							id: String(b.id ?? ''),
							name: String(b.name ?? ''),
							arguments: b.input,
						});
						break;
					case 'tool_result':
						parts.push({
							type: 'tool_call_response',
							id: String(b.tool_use_id ?? ''),
							response: b.content ?? '',
						});
						break;
					case 'thinking':
						if (typeof b.thinking === 'string') {
							parts.push({ type: 'reasoning', content: b.thinking });
						}
						break;
					default:
						// Unknown block type — include as text fallback
						parts.push({ type: 'text', content: JSON.stringify(b) });
						break;
				}
			}
		}

		// OpenAI tool_calls
		const toolCalls = msg.tool_calls;
		if (Array.isArray(toolCalls)) {
			for (const tc of toolCalls) {
				if (!tc || typeof tc !== 'object') { continue; }
				const call = tc as Record<string, unknown>;
				const fn = call.function as Record<string, unknown> | undefined;
				if (fn) {
					let args: unknown;
					try { args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments; } catch { args = fn.arguments; }
					parts.push({
						type: 'tool_call',
						id: String(call.id ?? ''),
						name: String(fn.name ?? ''),
						arguments: args,
					});
				}
			}
		}

		return { role, parts };
	});
}

/**
 * Normalize an OpenAI Responses API `function_call` item into a synthetic
 * assistant message carrying a single `tool_call` part. The Responses API
 * separates these from the conversation message stream; we re-attach them
 * to a synthetic role so downstream consumers (cache explorer, telemetry
 * viewers) can treat them uniformly with Chat Completions tool calls.
 */
function normalizeResponsesFunctionCall(msg: Record<string, unknown>): OTelChatMessage {
	let args: unknown = msg.arguments;
	if (typeof args === 'string') {
		try { args = JSON.parse(args); } catch { /* keep raw string */ }
	}
	return {
		role: 'assistant',
		parts: [{
			type: 'tool_call',
			id: String(msg.call_id ?? msg.id ?? ''),
			name: String(msg.name ?? ''),
			arguments: args,
		}],
	};
}

/**
 * Normalize an OpenAI Responses API `function_call_output` item into a
 * synthetic tool message carrying a `tool_call_response` part. Mirrors how
 * Chat Completions surfaces tool results via `role: 'tool'` messages.
 */
function normalizeResponsesFunctionCallOutput(msg: Record<string, unknown>): OTelChatMessage {
	const output = msg.output;
	let response: unknown;
	if (typeof output === 'string') {
		response = output;
	} else if (Array.isArray(output)) {
		// Output may be an array of `{ type: 'output_text', text }` blocks.
		response = output
			.map(b => (b && typeof b === 'object' && typeof (b as Record<string, unknown>).text === 'string') ? (b as Record<string, unknown>).text as string : JSON.stringify(b))
			.join('');
	} else {
		response = output ?? '';
	}
	return {
		role: 'tool',
		parts: [{
			type: 'tool_call_response',
			id: String(msg.call_id ?? msg.id ?? ''),
			response,
		}],
	};
}

/**
 * Normalize an OpenAI Responses API `tool_search_output` item. This is a
 * client-executed deferred-tool continuation: the request body only carries
 * the newly resolved tool definitions, while the provider reconstructs the
 * prior conversation from `previous_response_id`. Keep it distinct from a
 * normal tool result so the Cache Explorer can label this request shape.
 */
function normalizeResponsesToolSearchOutput(msg: Record<string, unknown>): OTelChatMessage {
	// Preserve the absent-vs-empty distinction: a request that omits `tools`
	// is byte-different from one that sends `tools: []`, and that distinction
	// can affect cache-key matching downstream. Build the part conditionally
	// so the `tools` key is fully absent when the source request omits it.
	const hasTools = Object.prototype.hasOwnProperty.call(msg, 'tools') && msg.tools !== undefined;
	const part: { type: 'tool_search_output'; id: string; tools?: unknown; status?: string } = {
		type: 'tool_search_output',
		id: String(msg.call_id ?? msg.id ?? ''),
		status: typeof msg.status === 'string' ? msg.status : undefined,
	};
	if (hasTools) {
		part.tools = msg.tools;
	}
	return { role: 'tool_search', parts: [part] };
}

/**
 * Normalize an OpenAI Responses API `reasoning` item. The Responses API
 * doesn't expose plaintext reasoning unless `reasoning.summary` is enabled;
 * when only `encrypted_content` is present, we still emit a non-empty part
 * carrying the encrypted blob so the cache-explorer prefix diff includes
 * its byte length (which IS part of the cache key).
 */
function normalizeResponsesReasoning(msg: Record<string, unknown>): OTelChatMessage {
	const parts: OTelMessagePart[] = [];
	const summary = msg.summary;
	if (Array.isArray(summary)) {
		for (const s of summary) {
			if (s && typeof s === 'object' && typeof (s as Record<string, unknown>).text === 'string') {
				parts.push({ type: 'reasoning', content: (s as Record<string, unknown>).text as string });
			}
		}
	} else if (typeof summary === 'string') {
		parts.push({ type: 'reasoning', content: summary });
	}
	if (typeof msg.encrypted_content === 'string') {
		parts.push({ type: 'reasoning', content: msg.encrypted_content });
	}
	return { role: 'assistant', parts };
}

/**
 * Convert tool definitions to OTel `gen_ai.tool.definitions` format.
 *
 * Accepts the variants emitted by the different request bodies/providers:
 * - OpenAI Chat Completions: `{ type: 'function', function: { name, description, parameters } }`
 * - OpenAI Responses API:    `{ type: 'function', name, description, parameters }`
 * - Anthropic Messages API:  `{ name, description, input_schema }`
 * - VS Code tool info:       `{ name, description, inputSchema }`
 *
 * Tools without a name (e.g. OpenAI client-side `tool_search`) are skipped
 * because OTel `gen_ai.tool.definitions` requires a name per entry.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/#gen-ai-tool-definitions
 */
export function toToolDefinitions(tools: ReadonlyArray<{
	type?: string;
	name?: string;
	description?: string;
	parameters?: unknown;
	input_schema?: unknown;
	inputSchema?: unknown;
	function?: { name?: string; description?: string; parameters?: unknown };
}> | undefined): OTelToolDefinition[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}
	const out: OTelToolDefinition[] = [];
	for (const t of tools) {
		const name = t.function?.name ?? t.name;
		if (!name) {
			continue;
		}
		const description = t.function?.description ?? t.description;
		const parameters = t.function?.parameters ?? t.parameters ?? t.input_schema ?? t.inputSchema;
		out.push({
			type: 'function',
			name,
			description,
			parameters,
		});
	}
	return out.length > 0 ? out : undefined;
}
