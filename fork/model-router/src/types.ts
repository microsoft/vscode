/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/** Request format an endpoint speaks. Most providers accept the OpenAI-compatible format. */
export type ApiFormat = 'openai' | 'anthropic' | 'gemini';

export const API_FORMATS: readonly ApiFormat[] = ['openai', 'anthropic', 'gemini'];

/** One model the user added: endpoint URL, API key and model name, plus the format it speaks. */
export interface ModelConfig {
	/** Stable id used by role assignments. */
	readonly id: string;
	/** Shown in the model picker. */
	readonly displayName: string;
	readonly apiFormat: ApiFormat;
	/** HTTPS endpoint, e.g. https://openrouter.ai/api/v1. Plain HTTP is allowed only for localhost. */
	readonly baseUrl: string;
	/** Optional: local models and some gateways need no key. */
	readonly apiKey?: string;
	/** The provider's model id, e.g. claude-sonnet-4-5 or llama3.1:8b. */
	readonly model: string;
	/** Extra headers for Azure, corporate proxies or gateways. */
	readonly headers?: Readonly<Record<string, string>>;
	readonly contextWindow?: number;
	readonly maxOutputTokens?: number;
}

export interface TextPart {
	readonly type: 'text';
	readonly text: string;
}

export interface ToolCallPart {
	readonly type: 'tool_call';
	readonly id: string;
	readonly name: string;
	readonly arguments: Record<string, unknown>;
	/** Opaque provider data that must be sent back on the next turn (e.g. Gemini thought signatures). */
	readonly providerData?: Readonly<Record<string, unknown>>;
}

export interface ToolResultPart {
	readonly type: 'tool_result';
	readonly toolCallId: string;
	/** Gemini matches results to calls by name, so the name travels with the result. */
	readonly toolName: string;
	readonly content: string;
	readonly isError?: boolean;
}

export type ContentPart = TextPart | ToolCallPart | ToolResultPart;

/** Tool results travel in user messages; tool calls in assistant messages. */
export interface ChatMessage {
	readonly role: 'user' | 'assistant';
	readonly content: string | readonly ContentPart[];
}

export type JsonSchema = Readonly<Record<string, unknown>>;

export interface ToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: JsonSchema;
}

export interface ChatRequest {
	readonly system?: string;
	readonly messages: readonly ChatMessage[];
	readonly tools?: readonly ToolDefinition[];
	readonly maxTokens?: number;
	readonly temperature?: number;
	readonly signal?: AbortSignal;
}

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'other';

export interface Usage {
	readonly inputTokens?: number;
	readonly outputTokens?: number;
}

export interface TextEvent {
	readonly type: 'text';
	readonly text: string;
}

export interface ToolCallEvent {
	readonly type: 'tool_call';
	readonly id: string;
	readonly name: string;
	readonly arguments: Record<string, unknown>;
	/** Set when the model sent arguments that are not valid JSON; `arguments` is then empty. */
	readonly argumentsError?: string;
	readonly providerData?: Readonly<Record<string, unknown>>;
}

export interface DoneEvent {
	readonly type: 'done';
	readonly stopReason: StopReason;
	readonly usage?: Usage;
}

export type StreamEvent = TextEvent | ToolCallEvent | DoneEvent;

export interface CompletionResult {
	readonly text: string;
	readonly toolCalls: readonly ToolCallPart[];
	readonly stopReason: StopReason;
	readonly usage?: Usage;
}

export interface ModelInfo {
	readonly id: string;
	readonly displayName?: string;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
	/** Injected for tests; defaults to the global fetch. */
	readonly fetch?: FetchLike;
}

export interface ModelClient {
	readonly config: ModelConfig;
	stream(request: ChatRequest): AsyncIterable<StreamEvent>;
	complete(request: ChatRequest): Promise<CompletionResult>;
	listModels(): Promise<ModelInfo[]>;
}

export interface Adapter {
	stream(config: ModelConfig, request: ChatRequest, fetchFn: FetchLike): AsyncGenerator<StreamEvent>;
	listModels(config: ModelConfig, fetchFn: FetchLike): Promise<ModelInfo[]>;
}

export function partsOf(message: ChatMessage): readonly ContentPart[] {
	return typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;
}

export function textOf(parts: readonly ContentPart[]): string {
	let text = '';
	for (const part of parts) {
		if (part.type === 'text') {
			text += part.text;
		}
	}
	return text;
}
