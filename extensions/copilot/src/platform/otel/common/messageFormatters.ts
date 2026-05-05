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
 * Normalize provider-specific messages (Anthropic content blocks, OpenAI tool messages)
 * to OTel GenAI semantic convention format.
 *
 * Handles:
 * - Anthropic content block arrays: tool_use → tool_call, tool_result → tool_call_response
 * - OpenAI format: tool_calls, role=tool with tool_call_id
 * - Plain string content
 */
export function normalizeProviderMessages(messages: ReadonlyArray<Record<string, unknown>>): OTelChatMessage[] {
	return messages.map(msg => {
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
			// Anthropic content block array
			for (const block of content) {
				if (!block || typeof block !== 'object') { continue; }
				const b = block as Record<string, unknown>;
				switch (b.type) {
					case 'text':
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
