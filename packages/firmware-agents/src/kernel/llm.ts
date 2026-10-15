/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonSchema } from './jsonSchema';

/** A tool call requested by the model. `rawArguments` keeps the model's text when it was not valid JSON. */
export interface LlmToolCall {
	readonly id: string;
	readonly name: string;
	readonly input: unknown;
	readonly rawArguments?: string;
	/** Set when the arguments could not be parsed; the agent reports it back instead of running the tool. */
	readonly inputError?: string;
}

export type LlmMessage =
	| { readonly role: 'user'; readonly content: string }
	| { readonly role: 'assistant'; readonly content: string; readonly toolCalls?: readonly LlmToolCall[] }
	| { readonly role: 'tool'; readonly toolCallId: string; readonly content: string };

/** What the model is told about a tool. */
export interface ToolSpec {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: JsonSchema;
}

export interface LlmRequest {
	readonly system: string;
	readonly messages: readonly LlmMessage[];
	readonly tools: readonly ToolSpec[];
}

export type FinishReason = 'stop' | 'tool-calls' | 'length' | 'content-filter' | 'error';

export type LlmEvent =
	| { readonly kind: 'text-delta'; readonly text: string }
	| { readonly kind: 'tool-call'; readonly call: LlmToolCall }
	| { readonly kind: 'finish'; readonly reason: FinishReason };

/**
 * Port to a chat model with tool calling. Implementations: OpenAI-compatible endpoints
 * (OpenRouter), the RoboAgent gateway (later), and a scripted fake for tests.
 */
export interface ILlmClient {
	chat(request: LlmRequest, signal: AbortSignal): AsyncIterable<LlmEvent>;
}

/** A provider failure. `status` is the HTTP status when there was one. Never carries credentials. */
export class LlmError extends Error {
	constructor(message: string, readonly status?: number, readonly retryable = false) {
		super(message);
		this.name = 'LlmError';
	}
}
