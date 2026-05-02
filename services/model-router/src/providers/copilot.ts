// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { CopilotSseParser, CopilotStreamTranslator } from './copilot-stream.js';
import type {
	AgentEvent,
	MessageContent,
	ModelDescriptor,
	ProviderAdapter,
	UniformMessage,
	UniformRequest,
} from './types.js';

/** Provider identifier used in routing config and broker RPC. */
export const COPILOT_PROVIDER_ID = 'copilot';

/** Inference endpoint for GitHub Copilot chat (§5.3). */
const DEFAULT_BASE_URL = 'https://api.githubcopilot.com';

/** Editor-identification headers Copilot expects on every call. */
const DEFAULT_EDITOR_VERSION = 'SonOfAnton/0.1.0';
const DEFAULT_EDITOR_PLUGIN_VERSION = 'son-of-anton/0.1.0';
const DEFAULT_INTEGRATION_ID = 'son-of-anton';

/**
 * Curated fallback model list. Used until the live `/models` lookup populates
 * the per-session cache. Copilot hosts multiple model families; we expose a
 * representative subset so routing decisions can be made before the first
 * live call. The live list takes precedence as soon as it loads.
 */
const DEFAULT_MODELS: readonly ModelDescriptor[] = [
	{
		id: 'gpt-4o',
		displayName: 'GPT-4o (Copilot)',
		contextWindow: 128_000,
		supportsTools: true,
		supportsThinking: false,
		supportsCaching: false,
	},
	{
		id: 'claude-sonnet-4',
		displayName: 'Claude Sonnet 4 (Copilot)',
		contextWindow: 200_000,
		supportsTools: true,
		supportsThinking: false,
		supportsCaching: false,
	},
	{
		id: 'gemini-2.0-flash',
		displayName: 'Gemini 2.0 Flash (Copilot)',
		contextWindow: 1_000_000,
		supportsTools: true,
		supportsThinking: false,
		supportsCaching: false,
	},
];

/**
 * Minimal broker interface the adapter depends on. Same shape as the
 * Anthropic and ChatGPT adapters so a single broker process can serve all
 * three. The broker is responsible for the GH OAuth dance and for exchanging
 * the GH token for a Copilot session token; the adapter only sees the
 * already-exchanged session token.
 */
export interface BrokerLike {
	getToken(providerId: string): Promise<{ token: string; headers?: Record<string, string> }>;
	invalidate(providerId: string): Promise<void>;
}

export type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface CopilotAdapterOptions {
	readonly broker: BrokerLike;
	readonly baseUrl?: string;
	readonly editorVersion?: string;
	readonly editorPluginVersion?: string;
	readonly integrationId?: string;
	readonly userAgent?: string;
	readonly fetchFn?: FetchFn;
	readonly models?: readonly ModelDescriptor[];
}

interface ChatCompletionsToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

interface ChatCompletionsMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	name?: string;
	tool_call_id?: string;
	tool_calls?: ChatCompletionsToolCall[];
}

interface ChatCompletionsTool {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

interface ChatCompletionsRequestBody {
	model: string;
	messages: ChatCompletionsMessage[];
	stream: true;
	stream_options?: { include_usage: true };
	tools?: ChatCompletionsTool[];
	max_tokens?: number;
	temperature?: number;
}

interface CopilotModelsResponse {
	data?: Array<{
		id?: string;
		name?: string;
		object?: string;
		capabilities?: {
			type?: string;
			tokenizer?: string;
			limits?: { max_context_window_tokens?: number; max_prompt_tokens?: number };
			supports?: { tool_calls?: boolean; streaming?: boolean; vision?: boolean };
		};
	}>;
}

/**
 * GitHub Copilot adapter (§5.3). Translates the uniform request shape into
 * an OpenAI-style chat.completions body, opens a streaming SSE connection to
 * the Copilot inference endpoint, and emits uniform AgentEvents.
 *
 * Token handling is intentionally different from the Anthropic and ChatGPT
 * OAuth adapters: per the plan the Copilot session token is refreshed
 * **proactively** by the broker at T-5min and **never on 401**. The adapter
 * therefore does not invalidate-and-retry on 401 — a 401 here usually means
 * the GH OAuth token underneath has been revoked, and the right fix is a
 * surfaced error so the user can re-authenticate, not a silent retry that
 * would hide the problem.
 */
export class CopilotAdapter implements ProviderAdapter {
	readonly id = COPILOT_PROVIDER_ID;
	readonly displayName = 'GitHub Copilot';

	private readonly broker: BrokerLike;
	private readonly baseUrl: string;
	private readonly editorVersion: string;
	private readonly editorPluginVersion: string;
	private readonly integrationId: string;
	private readonly userAgent: string;
	private readonly fetchFn: FetchFn;
	private readonly defaultModels: readonly ModelDescriptor[];

	private cachedModels: readonly ModelDescriptor[] | undefined;
	private cachedModelsToken: string | undefined;

	constructor(opts: CopilotAdapterOptions) {
		this.broker = opts.broker;
		this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
		this.editorVersion = opts.editorVersion ?? DEFAULT_EDITOR_VERSION;
		this.editorPluginVersion = opts.editorPluginVersion ?? DEFAULT_EDITOR_PLUGIN_VERSION;
		this.integrationId = opts.integrationId ?? DEFAULT_INTEGRATION_ID;
		this.userAgent = opts.userAgent ?? 'SonOfAnton/0.1.0';
		this.fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
		this.defaultModels = opts.models ?? DEFAULT_MODELS;
	}

	async isAvailable(): Promise<boolean> {
		try {
			await this.broker.getToken(this.id);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Returns the Copilot-hosted models for the current session. Caches the
	 * result keyed by the broker-issued session token so a token rotation
	 * triggers a fresh lookup. Falls back to the curated default list on any
	 * lookup failure — model listing must never block routing.
	 */
	async listModels(): Promise<ModelDescriptor[]> {
		let token: { token: string; headers?: Record<string, string> };
		try {
			token = await this.broker.getToken(this.id);
		} catch {
			return [...this.defaultModels];
		}

		if (this.cachedModels && this.cachedModelsToken === token.token) {
			return [...this.cachedModels];
		}

		try {
			const response = await this.fetchFn(`${this.baseUrl}/models`, {
				method: 'GET',
				headers: this.copilotHeaders(token, { json: true }),
			});
			if (!response.ok) {
				return [...this.defaultModels];
			}
			const body = await response.json() as CopilotModelsResponse;
			const parsed = parseCopilotModels(body);
			if (parsed.length === 0) {
				return [...this.defaultModels];
			}
			this.cachedModels = parsed;
			this.cachedModelsToken = token.token;
			return [...parsed];
		} catch {
			return [...this.defaultModels];
		}
	}

	async *send(req: UniformRequest, signal: AbortSignal): AsyncIterable<AgentEvent> {
		const body = buildCopilotRequest(req);
		const url = `${this.baseUrl}/chat/completions`;

		const tokenRecord = await this.broker.getToken(this.id);
		const headers = this.copilotHeaders(tokenRecord, { sse: true });

		const response = await this.fetchFn(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			signal,
		});

		if (!response.ok) {
			const text = await safeReadText(response);
			yield {
				type: 'error',
				code: errorCodeForStatus(response.status),
				message: `Copilot ${response.status}: ${text}`,
				retryable: response.status >= 500 || response.status === 429,
			};
			yield { type: 'message_stop', stopReason: 'error' };
			return;
		}

		const responseBody = response.body;
		if (!responseBody) {
			yield {
				type: 'error',
				code: 'no_body',
				message: 'Copilot returned no response body',
				retryable: true,
			};
			yield { type: 'message_stop', stopReason: 'error' };
			return;
		}

		const reader = responseBody.getReader();
		const decoder = new TextDecoder();
		const parser = new CopilotSseParser();
		const translator = new CopilotStreamTranslator(req.requestId, this.id);

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				const events = parser.feed(decoder.decode(value, { stream: true }));
				for (const ev of events) {
					for (const out of translator.translate(ev)) {
						yield out;
					}
				}
			}
			for (const ev of translator.finalize()) {
				yield ev;
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

	private copilotHeaders(
		token: { token: string; headers?: Record<string, string> },
		opts: { sse?: boolean; json?: boolean },
	): Record<string, string> {
		const headers: Record<string, string> = {
			'Authorization': `Bearer ${token.token}`,
			'User-Agent': this.userAgent,
			'Editor-Version': this.editorVersion,
			'Editor-Plugin-Version': this.editorPluginVersion,
			'Copilot-Integration-Id': this.integrationId,
		};
		if (opts.sse) {
			headers['Content-Type'] = 'application/json';
			headers['Accept'] = 'text/event-stream';
		}
		if (opts.json) {
			headers['Accept'] = 'application/json';
		}
		if (token.headers) {
			Object.assign(headers, token.headers);
		}
		return headers;
	}
}

// ── Pure helpers (exported for tests) ────────────────────────────────────────

export function buildCopilotRequest(req: UniformRequest): ChatCompletionsRequestBody {
	const messages = toChatCompletionsMessages(req.messages, req.system);
	const body: ChatCompletionsRequestBody = {
		model: req.model,
		messages,
		stream: true,
		stream_options: { include_usage: true },
	};

	if (req.tools && req.tools.length > 0) {
		body.tools = req.tools.map(t => ({
			type: 'function',
			function: {
				name: t.name,
				description: t.description,
				parameters: t.inputSchema,
			},
		}));
	}

	if (req.maxTokens !== undefined) {
		body.max_tokens = req.maxTokens;
	}
	if (req.temperature !== undefined) {
		body.temperature = req.temperature;
	}

	// `cacheBreakpoints` from the uniform request are intentionally dropped:
	// the Copilot endpoint does not surface a cache_control analogue.

	return body;
}

function toChatCompletionsMessages(
	messages: readonly UniformMessage[],
	system: string | undefined,
): ChatCompletionsMessage[] {
	const out: ChatCompletionsMessage[] = [];
	if (system !== undefined) {
		out.push({ role: 'system', content: system });
	}

	for (const m of messages) {
		if (m.role === 'system') {
			out.push({
				role: 'system',
				content: typeof m.content === 'string' ? m.content : flattenText(m.content),
			});
			continue;
		}
		if (typeof m.content === 'string') {
			out.push({ role: m.role, content: m.content });
			continue;
		}

		const textParts: string[] = [];
		for (const block of m.content) {
			if (block.type === 'text') {
				textParts.push(block.text);
			} else if (block.type === 'tool_result') {
				if (textParts.length > 0) {
					out.push({ role: m.role, content: textParts.splice(0).join('') });
				}
				out.push({
					role: 'tool',
					tool_call_id: block.toolUseId,
					content: serializeToolResult(block),
				});
			}
		}
		if (textParts.length > 0) {
			out.push({ role: m.role, content: textParts.join('') });
		}
	}

	return out;
}

function flattenText(content: readonly MessageContent[]): string {
	return content
		.filter((b): b is Extract<MessageContent, { type: 'text' }> => b.type === 'text')
		.map(b => b.text)
		.join('');
}

function serializeToolResult(block: Extract<MessageContent, { type: 'tool_result' }>): string {
	if (block.isError) {
		return `[error] ${block.content}`;
	}
	return block.content;
}

export function parseCopilotModels(body: CopilotModelsResponse): ModelDescriptor[] {
	const data = body?.data;
	if (!Array.isArray(data)) {
		return [];
	}
	const out: ModelDescriptor[] = [];
	for (const entry of data) {
		if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) {
			continue;
		}
		const caps = entry.capabilities;
		out.push({
			id: entry.id,
			displayName: entry.name ?? entry.id,
			contextWindow: caps?.limits?.max_context_window_tokens,
			supportsTools: caps?.supports?.tool_calls === true,
			supportsThinking: false,
			supportsCaching: false,
		});
	}
	return out;
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
	if (status === 403) { return 'forbidden'; }
	if (status === 429) { return 'rate_limited'; }
	if (status >= 500) { return 'server_error'; }
	if (status >= 400) { return 'client_error'; }
	return 'http_error';
}
