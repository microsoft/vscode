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
 * Maximum size (in characters) for a single OTel span/log attribute value.
 * Aligned with common backend limits (Jaeger 64KB, Tempo 100KB).
 * Matches gemini-cli's approach of capping content to prevent OTLP batch failures.
 */
const MAX_OTEL_ATTRIBUTE_LENGTH = 64_000;

/**
 * Truncate a string to fit within OTel attribute size limits.
 * Returns the original string if within bounds, otherwise truncates with a suffix.
 */
export function truncateForOTel(value: string, maxLength: number = MAX_OTEL_ATTRIBUTE_LENGTH): string {
	if (value.length <= maxLength) {
		return value;
	}
	const suffix = `...[truncated, original ${value.length} chars]`;
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
	| { type: 'tool_call_response'; id: string; content: unknown }
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
 */
export function toInputMessages(messages: ReadonlyArray<{ role?: string; content?: string; tool_calls?: ReadonlyArray<{ id: string; function: { name: string; arguments: string } }> }>): OTelChatMessage[] {
	return messages.map(msg => {
		const parts: OTelMessagePart[] = [];

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
 * Convert tool definitions to OTel tool definition format.
 */
export function toToolDefinitions(tools: ReadonlyArray<{
	type?: string;
	function?: { name: string; description?: string; parameters?: unknown };
}> | undefined): OTelToolDefinition[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}
	return tools
		.filter((t): t is typeof t & { function: NonNullable<typeof t['function']> } => !!t.function)
		.map(t => ({
			type: 'function' as const,
			name: t.function.name,
			description: t.function.description,
			parameters: t.function.parameters,
		}));
}
