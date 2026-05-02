// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { ChatGPTSseParser, ChatGPTStreamTranslator } from './chatgpt-stream.js';
import type {
	AgentEvent,
	MessageContent,
	ModelDescriptor,
	ProviderAdapter,
	UniformMessage,
	UniformRequest,
} from './types.js';

/** Provider identifier used in routing config and broker RPC. */
export const CHATGPT_OAUTH_PROVIDER_ID = 'chatgpt-oauth';

/**
 * The ChatGPT subscription endpoint speaks the OpenAI Responses API. The
 * Codex CLI talks to `https://chatgpt.com/backend-api/codex/responses`; the
 * default below points there. Real deployments will likely override
 * `baseUrl` and possibly the path via the broker-supplied headers.
 */
const DEFAULT_BASE_URL = 'https://chatgpt.com/backend-api/codex';

/** Curated list of ChatGPT-side models exposed to subscription users. */
const DEFAULT_MODELS: readonly ModelDescriptor[] = [
	{
		id: 'gpt-5-codex',
		displayName: 'GPT-5 Codex',
		contextWindow: 256_000,
		supportsTools: true,
		supportsThinking: true,
		supportsCaching: false,
	},
	{
		id: 'gpt-5',
		displayName: 'GPT-5',
		contextWindow: 256_000,
		supportsTools: true,
		supportsThinking: true,
		supportsCaching: false,
	},
	{
		id: 'o4-mini',
		displayName: 'o4-mini',
		contextWindow: 200_000,
		supportsTools: true,
		supportsThinking: true,
		supportsCaching: false,
	},
];

/**
 * Minimal broker interface the adapter depends on. Same shape as the
 * Anthropic adapter so a single broker process can serve both. Tests inject
 * an in-memory fake.
 */
export interface BrokerLike {
	getToken(providerId: string): Promise<{ token: string; headers?: Record<string, string> }>;
	invalidate(providerId: string): Promise<void>;
}

export type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface ChatGPTOAuthAdapterOptions {
	readonly broker: BrokerLike;
	readonly baseUrl?: string;
	readonly userAgent?: string;
	readonly fetchFn?: FetchFn;
	readonly models?: readonly ModelDescriptor[];
}

interface ResponsesInputContent {
	type: 'input_text' | 'output_text' | 'input_image';
	text?: string;
	image_url?: string;
}

interface ResponsesInputMessage {
	type: 'message';
	role: 'user' | 'assistant' | 'system';
	content: ResponsesInputContent[];
}

interface ResponsesFunctionCallOutput {
	type: 'function_call_output';
	call_id: string;
	output: string;
}

type ResponsesInputItem = ResponsesInputMessage | ResponsesFunctionCallOutput;

interface ResponsesTool {
	type: 'function';
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

interface ChatGPTRequestBody {
	model: string;
	input: ResponsesInputItem[];
	stream: true;
	instructions?: string;
	tools?: ResponsesTool[];
	max_output_tokens?: number;
	temperature?: number;
}

/**
 * ChatGPT OAuth adapter (§5.2). Translates the uniform request shape into the
 * OpenAI Responses API body, opens a streaming SSE connection to the ChatGPT
 * backend, and emits uniform AgentEvents.
 *
 * The token is fetched from the IDE's CredentialBroker on every send; on 401
 * the cached token is invalidated and the request is retried once. The
 * adapter never touches the OS keychain — the broker process boundary is the
 * security boundary for credentials.
 */
export class ChatGPTOAuthAdapter implements ProviderAdapter {
	readonly id = CHATGPT_OAUTH_PROVIDER_ID;
	readonly displayName = 'ChatGPT (OAuth)';

	private readonly broker: BrokerLike;
	private readonly baseUrl: string;
	private readonly userAgent: string;
	private readonly fetchFn: FetchFn;
	private readonly models: readonly ModelDescriptor[];

	constructor(opts: ChatGPTOAuthAdapterOptions) {
		this.broker = opts.broker;
		this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
		this.userAgent = opts.userAgent ?? 'SonOfAnton/0.1.0';
		this.fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
		this.models = opts.models ?? DEFAULT_MODELS;
	}

	async isAvailable(): Promise<boolean> {
		try {
			await this.broker.getToken(this.id);
			return true;
		} catch {
			return false;
		}
	}

	async listModels(): Promise<ModelDescriptor[]> {
		return [...this.models];
	}

	async *send(req: UniformRequest, signal: AbortSignal): AsyncIterable<AgentEvent> {
		const body = buildChatGPTRequest(req);
		const url = `${this.baseUrl}/responses`;

		let attempt = 0;
		let response: Response;
		while (true) {
			const tokenRecord = await this.broker.getToken(this.id);
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${tokenRecord.token}`,
				'User-Agent': this.userAgent,
				'Accept': 'text/event-stream',
				'OpenAI-Beta': 'responses=v1',
				...(tokenRecord.headers ?? {}),
			};

			response = await this.fetchFn(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal,
			});

			if (response.status !== 401 || attempt > 0) {
				break;
			}
			attempt += 1;
			await this.broker.invalidate(this.id);
		}

		if (!response.ok) {
			const text = await safeReadText(response);
			yield {
				type: 'error',
				code: errorCodeForStatus(response.status),
				message: `ChatGPT ${response.status}: ${text}`,
				retryable: response.status >= 500 || response.status === 429,
			};
			yield { type: 'message_stop', stopReason: 'error' };
			return;
		}

		const body$ = response.body;
		if (!body$) {
			yield {
				type: 'error',
				code: 'no_body',
				message: 'ChatGPT returned no response body',
				retryable: true,
			};
			yield { type: 'message_stop', stopReason: 'error' };
			return;
		}

		const reader = body$.getReader();
		const decoder = new TextDecoder();
		const parser = new ChatGPTSseParser();
		const translator = new ChatGPTStreamTranslator(req.requestId, this.id);

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				const events = parser.feed(decoder.decode(value, { stream: true }));
				for (const ev of events) {
					for (const out of translator.translate(ev as { type: string })) {
						yield out;
					}
				}
			}
			if (!translator.hasStop) {
				// Stream ended without a terminal event — synthesise one so consumers
				// always see message_stop.
				yield { type: 'message_stop', stopReason: 'end_turn' };
			}
		} catch (err) {
			if (signal.aborted) {
				yield {
					type: 'error',
					code: 'cancelled',
					message: 'Request cancelled',
					retryable: false,
				};
				yield { type: 'message_stop', stopReason: 'error' };
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			yield {
				type: 'error',
				code: 'stream_error',
				message,
				retryable: true,
			};
			yield { type: 'message_stop', stopReason: 'error' };
		}
	}
}

// ── Pure helpers (exported for tests) ────────────────────────────────────────

export function buildChatGPTRequest(req: UniformRequest): ChatGPTRequestBody {
	const input = toResponsesInput(req.messages);
	const body: ChatGPTRequestBody = {
		model: req.model,
		input,
		stream: true,
	};

	if (req.system !== undefined) {
		body.instructions = req.system;
	}

	if (req.tools && req.tools.length > 0) {
		body.tools = req.tools.map(t => ({
			type: 'function',
			name: t.name,
			description: t.description,
			parameters: t.inputSchema,
		}));
	}

	if (req.maxTokens !== undefined) {
		body.max_output_tokens = req.maxTokens;
	}
	if (req.temperature !== undefined) {
		body.temperature = req.temperature;
	}

	// `cacheBreakpoints` from the uniform request are intentionally dropped:
	// the ChatGPT backend has no analogue of Anthropic's cache_control and
	// silently rejecting unknown fields would be confusing.

	return body;
}

function toResponsesInput(messages: readonly UniformMessage[]): ResponsesInputItem[] {
	const out: ResponsesInputItem[] = [];

	for (const m of messages) {
		if (typeof m.content === 'string') {
			out.push({
				type: 'message',
				role: m.role,
				content: [{ type: textPartType(m.role), text: m.content }],
			});
			continue;
		}

		const textParts: ResponsesInputContent[] = [];
		for (const block of m.content) {
			if (block.type === 'text') {
				textParts.push({ type: textPartType(m.role), text: block.text });
			} else if (block.type === 'tool_result') {
				// Flush any text buffered before this tool result so ordering is preserved.
				if (textParts.length > 0) {
					out.push({ type: 'message', role: m.role, content: textParts.splice(0) });
				}
				out.push({
					type: 'function_call_output',
					call_id: block.toolUseId,
					output: serializeToolResult(block),
				});
			}
		}
		if (textParts.length > 0) {
			out.push({ type: 'message', role: m.role, content: textParts });
		}
	}

	return out;
}

function textPartType(role: 'user' | 'assistant' | 'system'): 'input_text' | 'output_text' {
	return role === 'assistant' ? 'output_text' : 'input_text';
}

function serializeToolResult(block: Extract<MessageContent, { type: 'tool_result' }>): string {
	if (block.isError) {
		return `[error] ${block.content}`;
	}
	return block.content;
}

async function safeReadText(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return '<unreadable body>';
	}
}

function errorCodeForStatus(status: number): string {
	if (status === 401) { return 'unauthorized'; }
	if (status === 429) { return 'rate_limited'; }
	if (status >= 500) { return 'server_error'; }
	if (status >= 400) { return 'client_error'; }
	return 'http_error';
}
