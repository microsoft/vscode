// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { AnthropicStreamTranslator, SseParser } from './anthropic-stream.js';
import type {
	AgentEvent,
	ModelDescriptor,
	ProviderAdapter,
	UniformMessage,
	UniformRequest,
	UniformTool,
} from './types.js';

/** Anthropic API version pinned to a known-good release. */
const ANTHROPIC_VERSION = '2023-06-01';

/** Provider identifier used in routing config and broker RPC. */
export const ANTHROPIC_OAUTH_PROVIDER_ID = 'anthropic-oauth';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';

/** Curated list of Claude subscription models. */
const DEFAULT_MODELS: readonly ModelDescriptor[] = [
	{
		id: 'claude-opus-4-7',
		displayName: 'Claude Opus 4.7',
		contextWindow: 200_000,
		supportsTools: true,
		supportsThinking: true,
		supportsCaching: true,
	},
	{
		id: 'claude-sonnet-4-6',
		displayName: 'Claude Sonnet 4.6',
		contextWindow: 200_000,
		supportsTools: true,
		supportsThinking: true,
		supportsCaching: true,
	},
	{
		id: 'claude-haiku-4-5-20251001',
		displayName: 'Claude Haiku 4.5',
		contextWindow: 200_000,
		supportsTools: true,
		supportsThinking: false,
		supportsCaching: true,
	},
];

/**
 * Minimal broker interface the adapter depends on. The real implementation
 * (BrokerClient) talks to the IDE's CredentialBroker over a Unix socket /
 * named pipe; tests inject an in-memory fake.
 */
export interface BrokerLike {
	getToken(providerId: string): Promise<{ token: string; headers?: Record<string, string> }>;
	invalidate(providerId: string): Promise<void>;
}

/** A `fetch`-compatible function. Default is the global fetch. */
export type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface AnthropicOAuthAdapterOptions {
	readonly broker: BrokerLike;
	readonly baseUrl?: string;
	readonly userAgent?: string;
	readonly fetchFn?: FetchFn;
	readonly models?: readonly ModelDescriptor[];
}

interface AnthropicContentBlock {
	type: 'text' | 'tool_use' | 'tool_result';
	text?: string;
	id?: string;
	name?: string;
	input?: unknown;
	tool_use_id?: string;
	content?: string;
	is_error?: boolean;
	cache_control?: { type: 'ephemeral' };
}

interface AnthropicMessage {
	role: 'user' | 'assistant';
	content: string | AnthropicContentBlock[];
}

interface AnthropicRequestBody {
	model: string;
	max_tokens: number;
	messages: AnthropicMessage[];
	system?: string | AnthropicContentBlock[];
	tools?: Array<{
		name: string;
		description: string;
		input_schema: Record<string, unknown>;
		cache_control?: { type: 'ephemeral' };
	}>;
	temperature?: number;
	stream: true;
}

/**
 * Anthropic adapter that fetches OAuth tokens from the IDE's broker and
 * translates the Anthropic SSE protocol into the uniform AgentEvent stream.
 *
 * The wire format is identical to Anthropic's API key endpoint apart from
 * `Authorization: Bearer <token>` replacing `x-api-key`. cache_control,
 * tool use, thinking blocks, and streaming all behave identically.
 */
export class AnthropicOAuthAdapter implements ProviderAdapter {
	readonly id = ANTHROPIC_OAUTH_PROVIDER_ID;
	readonly displayName = 'Claude (OAuth)';

	private readonly broker: BrokerLike;
	private readonly baseUrl: string;
	private readonly userAgent: string;
	private readonly fetchFn: FetchFn;
	private readonly models: readonly ModelDescriptor[];

	constructor(opts: AnthropicOAuthAdapterOptions) {
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
		const body = buildAnthropicRequest(req);
		const url = `${this.baseUrl}/v1/messages`;

		// One automatic retry on 401 — invalidate cached token and try again.
		let attempt = 0;
		let response: Response;
		while (true) {
			const tokenRecord = await this.broker.getToken(this.id);
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${tokenRecord.token}`,
				'anthropic-version': ANTHROPIC_VERSION,
				'anthropic-beta': 'prompt-caching-2024-07-31',
				'User-Agent': this.userAgent,
				'Accept': 'text/event-stream',
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
				message: `Anthropic ${response.status}: ${text}`,
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
				message: 'Anthropic returned no response body',
				retryable: true,
			};
			yield { type: 'message_stop', stopReason: 'error' };
			return;
		}

		const reader = body$.getReader();
		const decoder = new TextDecoder();
		const parser = new SseParser();
		const translator = new AnthropicStreamTranslator(req.requestId, this.id);

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

export function buildAnthropicRequest(req: UniformRequest): AnthropicRequestBody {
	const messages = toAnthropicMessages(req.messages, req.cacheBreakpoints ?? []);
	const body: AnthropicRequestBody = {
		model: req.model,
		max_tokens: req.maxTokens ?? 4096,
		messages,
		stream: true,
	};

	if (req.system !== undefined) {
		// Always send system as a content-block array so we can attach cache_control
		// to the static system prompt deterministically.
		body.system = [
			{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } },
		];
	}

	if (req.tools && req.tools.length > 0) {
		body.tools = req.tools.map((t: UniformTool) => ({
			name: t.name,
			description: t.description,
			input_schema: t.inputSchema,
		}));
	}

	if (req.temperature !== undefined) {
		body.temperature = req.temperature;
	}

	return body;
}

function toAnthropicMessages(
	messages: readonly UniformMessage[],
	cacheBreakpoints: readonly { atMessageIndex: number; type: 'ephemeral' }[],
): AnthropicMessage[] {
	const cacheAt = new Set(cacheBreakpoints.map(b => b.atMessageIndex));

	const out: AnthropicMessage[] = [];
	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		// system messages are extracted into the top-level `system` field by the
		// caller; if any sneak into messages, drop them rather than sending an
		// invalid request.
		if (m.role === 'system') {
			continue;
		}
		const blocks = toAnthropicBlocks(m.content);
		if (cacheAt.has(i) && blocks.length > 0) {
			const last = blocks[blocks.length - 1];
			blocks[blocks.length - 1] = { ...last, cache_control: { type: 'ephemeral' } };
		}
		out.push({ role: m.role, content: blocks });
	}
	return out;
}

function toAnthropicBlocks(
	content: string | readonly { type: string; text?: string; toolUseId?: string; content?: string; isError?: boolean }[],
): AnthropicContentBlock[] {
	if (typeof content === 'string') {
		return [{ type: 'text', text: content }];
	}
	const out: AnthropicContentBlock[] = [];
	for (const block of content) {
		if (block.type === 'text') {
			out.push({ type: 'text', text: block.text ?? '' });
		} else if (block.type === 'tool_result') {
			out.push({
				type: 'tool_result',
				tool_use_id: block.toolUseId,
				content: block.content,
				is_error: block.isError,
			});
		}
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
	if (status === 429) { return 'rate_limited'; }
	if (status >= 500) { return 'server_error'; }
	if (status >= 400) { return 'client_error'; }
	return 'http_error';
}
