/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Local mock server that implements the OpenAI Chat Completions streaming API.
 * Used by the chat perf benchmark to replace the real LLM backend with
 * deterministic, zero-latency responses.
 *
 * Supports scenario-based responses: the `messages` array's last user message
 * content is matched against scenario IDs. Unknown scenarios get a default
 * text-only response.
 *
 * Note: this file is loaded as CommonJS (scripts/package.json declares
 * `"type": "commonjs"`), so it uses `require()` / `module.exports` rather
 * than ESM `import` / `export` syntax. TypeScript types are stripped by
 * Node 24's native type-stripping; no compile step is required.
 */

const http: typeof import('http') = require('http');
const path: typeof import('path') = require('path');
const { EventEmitter }: typeof import('events') = require('events');

const ROOT = path.join(__dirname, '..', '..', '..');

let _log: (msg: string) => void = console.log;
let _verbose = false;

/**
 * Pretty-print a payload for verbose logs, truncating long strings.
 */
function _formatVerbose(obj: unknown, maxLen = 8000): string {
	let text: string;
	try {
		text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
	} catch {
		text = String(obj);
	}
	if (text.length > maxLen) {
		text = text.slice(0, maxLen) + `… [truncated, ${text.length - maxLen} more chars]`;
	}
	return text;
}

/**
 * Indent each line with the verbose prefix.
 */
function _indentVerbose(text: string): string {
	return text.split('\n').map(l => `[mock-llm]     ${l}`).join('\n');
}

// -- Scenario fixtures -------------------------------------------------------

interface StreamChunk {
	content: string;
	delayMs: number;
}

/**
 * A single turn in a multi-turn scenario.
 */
type ScenarioTurn =
	| {
		kind: 'tool-calls';
		toolCalls: Array<{ toolNamePattern: RegExp; arguments: Record<string, any> }>;
	}
	| {
		kind: 'content';
		chunks: StreamChunk[];
	}
	| {
		kind: 'thinking';
		thinkingChunks: StreamChunk[];
		chunks: StreamChunk[];
	}
	| {
		kind: 'echo-last-message';
	}
	| {
		kind: 'echo-last-tool-result';
	}
	| {
		kind: 'user';
		message: string;
	};

/**
 * A scenario turn produced by the model.
 */
type ModelScenarioTurn =
	| {
		kind: 'tool-calls';
		toolCalls: Array<{ toolNamePattern: RegExp; arguments: Record<string, any> }>;
	}
	| {
		kind: 'content';
		chunks: StreamChunk[];
	}
	| {
		kind: 'thinking';
		thinkingChunks: StreamChunk[];
		chunks: StreamChunk[];
	}
	| {
		kind: 'echo-last-message';
	}
	| {
		kind: 'echo-last-tool-result';
	};

/**
 * A model turn that emits content chunks.
 */
type ContentScenarioTurn =
	| {
		kind: 'content';
		chunks: StreamChunk[];
	}
	| {
		kind: 'thinking';
		thinkingChunks: StreamChunk[];
		chunks: StreamChunk[];
	};

/**
 * A multi-turn scenario — an ordered sequence of turns.
 * The mock server determines which model turn to serve based on the number
 * of assistant→tool round-trips already present in the conversation.
 * User turns are skipped by the server and instead injected by the test
 * harness, which types them into the chat input and presses Enter.
 */
interface MultiTurnScenario {
	type: 'multi-turn';
	turns: ScenarioTurn[];
}

function isMultiTurnScenario(scenario: any): scenario is MultiTurnScenario {
	return scenario && typeof scenario === 'object' && scenario.type === 'multi-turn';
}

/**
 * Helper for building scenario chunk sequences with timing control.
 */
class ScenarioBuilderImpl {
	chunks: StreamChunk[] = [];

	/**
	 * Emit a content chunk immediately (no delay before it).
	 */
	emit(content: string): this {
		this.chunks.push({ content, delayMs: 0 });
		return this;
	}

	/**
	 * Wait, then emit a content chunk — simulates network/token generation latency.
	 * @param ms - delay in milliseconds before this chunk
	 */
	wait(ms: number, content: string): this {
		this.chunks.push({ content, delayMs: ms });
		return this;
	}

	/**
	 * Emit multiple chunks with uniform inter-chunk delay.
	 * @param delayMs - delay between each chunk (default ~1 frame)
	 */
	stream(contents: string[], delayMs = 15): this {
		for (const content of contents) {
			this.chunks.push({ content, delayMs });
		}
		return this;
	}

	/**
	 * Emit multiple chunks with no delay (burst).
	 */
	burst(contents: string[]): this {
		return this.stream(contents, 0);
	}

	build(): StreamChunk[] {
		return this.chunks;
	}
}

const SCENARIOS: Record<string, StreamChunk[] | MultiTurnScenario> = {};

const DEFAULT_SCENARIO = 'text-only';

function getDefaultScenarioChunks(): StreamChunk[] {
	const scenario = SCENARIOS[DEFAULT_SCENARIO];
	if (isMultiTurnScenario(scenario)) {
		throw new Error(`Default scenario '${DEFAULT_SCENARIO}' must be content-only`);
	}
	return scenario;
}

// -- SSE chunk builder -------------------------------------------------------

const MODEL = 'gpt-4o-2024-08-06';

// -- Model shape -------------------------------------------------------------
// Shared types describing the CAPI `/models` response shape the mock returns.
// Centralized here so all model fixtures stay in sync and can be tweaked in one
// place when the backend billing/capabilities contract changes. Mirrors the
// `CCAModel*` interfaces in `src/typings/copilot-api.d.ts`.

/**
 * Per-tier token pricing (prices are in 1/1,000,000ths of a USD per token, i.e.
 * scaled by `token_prices.batch_size`). A model may expose a `default` tier and
 * an optional `long_context` tier with higher prices for large prompts.
 */
interface ModelTokenPriceTier {
	input_price?: number;
	/** Cache read price (per cached input token). */
	cache_price?: number;
	/** Cache write price (per token written to the prompt cache). */
	cache_write_price?: number;
	output_price?: number;
	context_max?: number;
}

/**
 * The set of pricing tiers advertised for a model.
 */
interface ModelTokenPrices {
	batch_size?: number;
	default?: ModelTokenPriceTier;
	long_context?: ModelTokenPriceTier;
}

/**
 * Billing metadata: entitlement gating plus the token price tiers consumed by
 * the model picker's cost table.
 */
interface ModelBilling {
	restricted_to?: string[];
	is_premium?: boolean;
	multiplier?: number;
	token_prices?: ModelTokenPrices;
}

/**
 * Vision-related prompt limits.
 */
interface ModelVisionLimits {
	max_prompt_image_size: number;
	max_prompt_images: number;
	supported_media_types: string[];
}

/**
 * Token/context window limits for a model.
 */
interface ModelLimits {
	max_prompt_tokens?: number;
	max_output_tokens?: number;
	max_context_window_tokens?: number;
	max_non_streaming_output_tokens?: number;
	vision?: ModelVisionLimits;
}

/**
 * Feature flags advertised by a model.
 */
interface ModelSupports {
	streaming?: boolean;
	tool_calls?: boolean;
	parallel_tool_calls?: boolean;
	vision?: boolean;
	structured_outputs?: boolean;
	reasoning_effort?: string[];
	max_thinking_budget?: number;
	min_thinking_budget?: number;
}

/**
 * Model capabilities (family, tokenizer, limits, supported features).
 */
interface ModelCapabilities {
	type: string;
	family: string;
	tokenizer: string;
	object: string;
	limits: ModelLimits;
	supports: ModelSupports;
}

/**
 * A single entry in the mock's `/models` list. Matches the CAPI `/models`
 * response shape closely enough for the extension and CLI SDK to consume.
 */
interface MockModel {
	id: string;
	name: string;
	object: string;
	version: string;
	vendor: string;
	model_picker_enabled: boolean;
	model_picker_category?: string;
	model_picker_price_category?: string;
	is_chat_default: boolean;
	is_chat_fallback: boolean;
	preview: boolean;
	billing: ModelBilling;
	capabilities: ModelCapabilities;
	supported_endpoints: string[];
}

/**
 * Additional model definitions the mock advertises beyond `MODEL` and
 * `gpt-4o-mini`. `gpt-5.3-codex` is the Copilot CLI SDK's hard-coded default
 * model; smoke tests/automation that exercise the CLI need it in the mock's
 * /models list, otherwise the SDK fails with "No model available".
 */
const EXTRA_MODELS: MockModel[] = [
	// gpt-5.3-codex — the Copilot CLI SDK's default model.
	// Shape matches real CAPI /models response exactly.
	{
		id: 'gpt-5.3-codex',
		name: 'GPT-5.3-Codex (Mock)',
		object: 'model',
		version: 'gpt-5.3-codex',
		vendor: 'OpenAI',
		model_picker_enabled: true,
		model_picker_category: 'powerful',
		model_picker_price_category: 'medium',
		is_chat_default: true,
		is_chat_fallback: false,
		preview: false,
		billing: { restricted_to: ['pro', 'edu', 'pro_plus', 'individual_trial', 'business', 'enterprise', 'max'], token_prices: { batch_size: 1000000, default: { cache_price: 17, cache_write_price: 219, context_max: 272000, input_price: 175, output_price: 1400 } } },
		capabilities: {
			type: 'chat',
			family: 'gpt-5.3-codex',
			tokenizer: 'o200k_base',
			object: 'model_capabilities',
			limits: { max_prompt_tokens: 272000, max_output_tokens: 128000, max_context_window_tokens: 400000, vision: { max_prompt_image_size: 3145728, max_prompt_images: 1, supported_media_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } },
			supports: { streaming: true, tool_calls: true, parallel_tool_calls: true, vision: true, structured_outputs: true, reasoning_effort: ['low', 'medium', 'high', 'xhigh'] },
		},
		supported_endpoints: ['/responses'],
	},
	// Anthropic Claude model — required by the Claude Code session type.
	{
		id: 'claude-sonnet-4.5',
		name: 'Claude Sonnet 4.5 (Mock)',
		object: 'model',
		version: 'claude-sonnet-4.5',
		vendor: 'Anthropic',
		model_picker_enabled: true,
		model_picker_category: 'versatile',
		model_picker_price_category: 'medium',
		is_chat_default: false,
		is_chat_fallback: false,
		preview: false,
		billing: { restricted_to: ['pro', 'pro_plus', 'max', 'business', 'enterprise'], token_prices: { batch_size: 1000000, default: { cache_price: 30, cache_write_price: 375, input_price: 300, output_price: 1500 } } },
		capabilities: {
			type: 'chat',
			family: 'claude-sonnet-4.5',
			tokenizer: 'o200k_base',
			object: 'model_capabilities',
			limits: { max_prompt_tokens: 168000, max_output_tokens: 32000, max_context_window_tokens: 200000, max_non_streaming_output_tokens: 16000, vision: { max_prompt_image_size: 3145728, max_prompt_images: 5, supported_media_types: ['image/jpeg', 'image/png', 'image/webp'] } },
			supports: { streaming: true, tool_calls: true, parallel_tool_calls: true, vision: true, max_thinking_budget: 32000, min_thinking_budget: 1024 },
		},
		supported_endpoints: ['/chat/completions', '/v1/messages'],
	},
	// mock-config-model — a Responses-API model that advertises BOTH a reasoning
	// effort picker (capabilities.supports.reasoning_effort) AND a context size
	// picker (a `long_context` billing tier whose context_max exceeds the default
	// tier). Used by the `Chat Model Configuration` smoke tests to verify that the
	// reasoning effort and context size selected in the model-picker UI are
	// forwarded to the server (as `reasoning.effort` and the context-management
	// `compact_threshold` in the /responses request body) and surfaced in the
	// context-usage gauge. The `mock-config` family is intentionally absent from
	// `modelsWithoutResponsesContextManagement` so context management stays enabled.
	// Numbers mirror a GPT-5.5-class model: the default tier exposes a 272K prompt
	// window (`default.context_max`) and the long tier the full window minus the
	// 128K output reserve — `max_context_window_tokens` (1050000) - 128000 = 922000.
	// Note `formatTokenCount` renders 922000 as "1M" (its `>900K → 1M` branch), so
	// the long option/label reads "1M" even though the value is 922K. Output is
	// 128K, so the context-usage gauge totals (input + output) read 400K and 1M.
	{
		id: 'mock-config-model',
		name: 'Mock Config Model',
		object: 'model',
		version: 'mock-config-model',
		vendor: 'OpenAI',
		model_picker_enabled: true,
		model_picker_category: 'versatile',
		model_picker_price_category: 'medium',
		is_chat_default: false,
		is_chat_fallback: false,
		preview: false,
		billing: {
			restricted_to: ['pro', 'edu', 'pro_plus', 'individual_trial', 'business', 'enterprise', 'max'],
			token_prices: {
				batch_size: 1000000,
				default: { cache_price: 17, cache_write_price: 219, input_price: 175, output_price: 1400, context_max: 272000 },
				long_context: { cache_price: 34, cache_write_price: 438, input_price: 350, output_price: 2800, context_max: 1050000 },
			},
		},
		capabilities: {
			type: 'chat',
			family: 'mock-config',
			tokenizer: 'o200k_base',
			object: 'model_capabilities',
			limits: { max_prompt_tokens: 922000, max_output_tokens: 128000, max_context_window_tokens: 1050000 },
			supports: { streaming: true, tool_calls: true, parallel_tool_calls: true, vision: false, structured_outputs: true, reasoning_effort: ['low', 'medium', 'high'] },
		},
		supported_endpoints: ['/responses'],
	},
];

/**
 * Complete model list used by both GET /models and GET /models/{id}.
 * Kept in a single array so the two handlers always return consistent data.
 */
const ALL_MODELS: MockModel[] = [
	{
		id: MODEL,
		name: 'GPT-4o (Mock)',
		object: 'model',
		version: 'gpt-4o-2024-08-06',
		vendor: 'Azure OpenAI',
		model_picker_enabled: false,
		model_picker_price_category: 'medium',
		is_chat_default: false,
		is_chat_fallback: true,
		preview: false,
		billing: { token_prices: { batch_size: 1000000, default: { cache_price: 125, input_price: 250, output_price: 1000 } } },
		capabilities: {
			type: 'chat',
			family: 'gpt-4o',
			tokenizer: 'o200k_base',
			object: 'model_capabilities',
			limits: {
				// Use a very large token limit so the Responses API compaction
				// threshold (90% of max_prompt_tokens) is never reached during
				// perf benchmarks.
				max_prompt_tokens: 10000000,
				max_output_tokens: 131072,
				max_context_window_tokens: 10000000,
			},
			supports: { streaming: true, tool_calls: true, parallel_tool_calls: true, vision: false },
		},
		supported_endpoints: ['/chat/completions'],
	},
	{
		id: 'gpt-4o-mini',
		name: 'GPT-4o mini (Mock)',
		object: 'model',
		version: 'gpt-4o-mini-2024-07-18',
		vendor: 'Azure OpenAI',
		model_picker_enabled: false,
		model_picker_price_category: 'low',
		is_chat_default: false,
		is_chat_fallback: false,
		preview: false,
		billing: { token_prices: { batch_size: 1000000, default: { cache_price: 15, input_price: 30, output_price: 120 } } },
		capabilities: {
			type: 'chat',
			family: 'gpt-4o-mini',
			tokenizer: 'o200k_base',
			object: 'model_capabilities',
			limits: { max_prompt_tokens: 12288, max_output_tokens: 4096, max_context_window_tokens: 128000 },
			supports: { streaming: true, tool_calls: true, parallel_tool_calls: true },
		},
		supported_endpoints: ['/chat/completions'],
	},
	...EXTRA_MODELS,
];

function makeChunk(content: string, index: number, finish: boolean) {
	return {
		id: 'chatcmpl-perf-benchmark',
		object: 'chat.completion.chunk',
		created: Math.floor(Date.now() / 1000),
		model: MODEL,
		choices: [{
			index: 0,
			delta: finish ? {} : { content },
			finish_reason: finish ? 'stop' : null,
			content_filter_results: {},
		}],
		usage: null,
	};
}

function makeInitialChunk() {
	return {
		id: 'chatcmpl-perf-benchmark',
		object: 'chat.completion.chunk',
		created: Math.floor(Date.now() / 1000),
		model: MODEL,
		choices: [{
			index: 0,
			delta: { role: 'assistant', content: '' },
			finish_reason: null,
			content_filter_results: {},
		}],
		usage: null,
	};
}

/**
 * Build a tool-call initial chunk (role only, no content).
 */
function makeToolCallInitialChunk() {
	return {
		id: 'chatcmpl-perf-benchmark',
		object: 'chat.completion.chunk',
		created: Math.floor(Date.now() / 1000),
		model: MODEL,
		choices: [{
			index: 0,
			delta: { role: 'assistant', content: null },
			finish_reason: null,
			content_filter_results: {},
		}],
		usage: null,
	};
}

/**
 * Build a tool-call function-start chunk.
 * @param index - tool call index
 * @param callId - unique call ID
 * @param functionName - tool function name
 */
function makeToolCallStartChunk(index: number, callId: string, functionName: string) {
	return {
		id: 'chatcmpl-perf-benchmark',
		object: 'chat.completion.chunk',
		created: Math.floor(Date.now() / 1000),
		model: MODEL,
		choices: [{
			index: 0,
			delta: {
				tool_calls: [{
					index,
					id: callId,
					type: 'function',
					function: { name: functionName, arguments: '' },
				}],
			},
			finish_reason: null,
			content_filter_results: {},
		}],
		usage: null,
	};
}

/**
 * Build a tool-call arguments chunk.
 * @param index - tool call index
 * @param argsFragment - partial JSON arguments
 */
function makeToolCallArgsChunk(index: number, argsFragment: string) {
	return {
		id: 'chatcmpl-perf-benchmark',
		object: 'chat.completion.chunk',
		created: Math.floor(Date.now() / 1000),
		model: MODEL,
		choices: [{
			index: 0,
			delta: {
				tool_calls: [{
					index,
					function: { arguments: argsFragment },
				}],
			},
			finish_reason: null,
			content_filter_results: {},
		}],
		usage: null,
	};
}

/**
 * Build a tool-call finish chunk.
 */
function makeToolCallFinishChunk() {
	return {
		id: 'chatcmpl-perf-benchmark',
		object: 'chat.completion.chunk',
		created: Math.floor(Date.now() / 1000),
		model: MODEL,
		choices: [{
			index: 0,
			delta: {},
			finish_reason: 'tool_calls',
			content_filter_results: {},
		}],
		usage: null,
	};
}

/**
 * Build a thinking (chain-of-thought summary) chunk.
 * Uses the `cot_summary` field in the delta, matching the Copilot API wire format.
 * @param text - thinking text fragment
 */
function makeThinkingChunk(text: string) {
	return {
		id: 'chatcmpl-perf-benchmark',
		object: 'chat.completion.chunk',
		created: Math.floor(Date.now() / 1000),
		model: MODEL,
		choices: [{
			index: 0,
			delta: { cot_summary: text },
			finish_reason: null,
			content_filter_results: {},
		}],
		usage: null,
	};
}

/**
 * Build a thinking ID chunk (sent after thinking text to close the block).
 * @param cotId - unique chain-of-thought ID
 */
function makeThinkingIdChunk(cotId: string) {
	return {
		id: 'chatcmpl-perf-benchmark',
		object: 'chat.completion.chunk',
		created: Math.floor(Date.now() / 1000),
		model: MODEL,
		choices: [{
			index: 0,
			delta: { cot_id: cotId },
			finish_reason: null,
			content_filter_results: {},
		}],
		usage: null,
	};
}

// -- Request handler ---------------------------------------------------------

function handleRequest(req: import('http').IncomingMessage, res: import('http').ServerResponse): void {
	const contentLength = req.headers['content-length'] || '0';
	const ts = new Date().toISOString().slice(11, -1); // HH:MM:SS.mmm
	_log(`[mock-llm] ${ts} ${req.method} ${req.url} (${contentLength} bytes)`);

	// CORS
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', '*');
	if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

	const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
	const path = reqUrl.pathname;
	const json = (status: number, data: any) => {
		res.writeHead(status, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(data));
	};
	const readBody = (): Promise<string> => new Promise(resolve => {
		let body = '';
		req.on('data', chunk => { body += chunk; });
		req.on('end', () => resolve(body));
	});

	// -- Health -------------------------------------------------------
	if (path === '/health') { res.writeHead(200); res.end('ok'); return; }

	// -- Token endpoints (DomainService.tokenURL / tokenNoAuthURL) ----
	// /copilot_internal/v2/token, /copilot_internal/v2/nltoken
	if (path.startsWith('/copilot_internal/')) {
		if (path.includes('/token') || path.includes('/nltoken')) {
			json(200, {
				token: 'perf-benchmark-fake-token',
				expires_at: Math.floor(Date.now() / 1000) + 3600,
				refresh_in: 1800,
				sku: 'free_limited_copilot',
				individual: true,
				copilot_plan: 'free',
				endpoints: {
					api: `http://${req.headers.host}`,
					proxy: `http://${req.headers.host}`,
				},
			});
		} else {
			// /copilot_internal/user, /copilot_internal/content_exclusion, etc.
			json(200, {});
		}
		return;
	}

	// -- Telemetry (DomainService.telemetryURL) ----------------------
	if (path === '/telemetry') { json(200, {}); return; }

	// -- Model Router (DomainService.capiModelRouterURL = /models/session/intent) --
	// The automode service POSTs here to get the best model for a request.
	if (path === '/models/session/intent' && req.method === 'POST') {
		readBody().then(() => {
			json(200, { model: MODEL });
		});
		return;
	}

	// -- Auto Models / Model Session (DomainService.capiAutoModelURL = /models/session) --
	// Returns AutoModeAPIResponse: { available_models, session_token, expires_at }
	if (path === '/models/session' && req.method === 'POST') {
		readBody().then(() => {
			json(200, {
				available_models: [MODEL, 'gpt-4o-mini', ...EXTRA_MODELS.map(m => m.id)],
				selected_model: 'gpt-5.3-codex',
				session_token: 'perf-session-token-' + Date.now(),
				expires_at: Math.floor(Date.now() / 1000) + 3600,
				discounted_costs: {},
			});
		});
		return;
	}

	// -- Models (DomainService.capiModelsURL = /models) --------------
	if (path === '/models' && req.method === 'GET') {
		json(200, { data: ALL_MODELS });
		return;
	}

	// -- Model by ID (DomainService.capiModelsURL/{id}) --------------
	if (path.startsWith('/models/') && req.method === 'GET') {
		const modelId = path.split('/models/')[1]?.split('/')[0];
		if (path.endsWith('/policy')) {
			json(200, { state: 'accepted', terms: '' });
			return;
		}
		const knownModel = ALL_MODELS.find(m => m.id === modelId);
		// TODO: give a 404 for unknown models instead of a fallback response. This requires
		const result = knownModel || {
			id: modelId || MODEL,
			name: `${modelId} (Mock)`,
			version: '2024-05-13',
			vendor: 'copilot',
			model_picker_enabled: false,
			is_chat_default: false,
			is_chat_fallback: false,
			billing: { is_premium: false, multiplier: 0 },
			capabilities: {
				type: 'chat',
				family: modelId || 'gpt-4o',
				tokenizer: 'o200k_base',
				object: 'model_capabilities',
				limits: { max_prompt_tokens: 272000, max_output_tokens: 128000, max_context_window_tokens: 400000 },
				supports: { streaming: true, tool_calls: true, parallel_tool_calls: true, vision: false },
			},
			supported_endpoints: ['/chat/completions'],
		};
		const ts = new Date().toISOString().slice(11, -1);
		_log(`[mock-llm]   ${ts} GET /models/${modelId} → ${knownModel ? 'known' : 'fallback'}, family=${result.capabilities?.family}, endpoints=${JSON.stringify(result.supported_endpoints)}`);
		json(200, result);
		return;
	}

	// -- Agents (DomainService.remoteAgentsURL = /agents) -------------
	if (path.startsWith('/agents')) {
		// /agents/sessions — CopilotSessions
		if (path.includes('/sessions')) {
			json(200, { sessions: [], total_count: 0, page_size: 20, page_number: 1 });
		}
		// Keep custom-agent discovery quiet during smoke tests. The extension
		// expects this shape even when there are no custom agents.
		else if (path.includes('/swe/custom-agents')) {
			json(200, { agents: [] });
		}
		// /agents/swe/models — CCAModelsList
		else if (path.includes('/swe/models')) {
			json(200, {
				data: [{
					id: MODEL, name: 'GPT-4o (Mock)', vendor: 'copilot',
					capabilities: { type: 'chat', family: 'gpt-4o', supports: { streaming: true } }
				}]
			});
		}
		// /agents/swe/... — agent jobs, etc.
		else if (path.includes('/swe/')) {
			json(200, {});
		}
		// /agents — list agents
		else {
			json(200, { agents: [] });
		}
		return;
	}

	// -- Chat Completions (DomainService.capiChatURL = /chat/completions) --
	if (path === '/chat/completions' && req.method === 'POST') {
		readBody().then((body: string) => {
			serverEvents.emit('capturedRequest', { path, method: 'POST', body });
			return handleChatCompletions(body, res);
		});
		return;
	}

	// -- Responses API (DomainService.capiResponsesURL = /responses) --
	// The Responses API uses a different SSE event format than Chat Completions.
	// The SDK expects events like response.created, response.output_item.added,
	// response.output_text.delta, response.output_item.done, response.completed.
	if (path === '/responses' && req.method === 'POST') {
		readBody().then((body: string) => {
			serverEvents.emit('capturedRequest', { path, method: 'POST', body });
			return handleResponsesApi(body, res);
		});
		return;
	}

	// -- Messages API (DomainService.capiMessagesURL = /v1/messages) --
	// The Anthropic Messages API (used by the Claude Code session type) speaks
	// a different SSE dialect than OpenAI Chat Completions, so dispatch to a
	// dedicated handler that emits `message_start` / `content_block_*` events.
	if (path === '/v1/messages' && req.method === 'POST') {
		readBody().then((body: string) => handleMessagesApi(body, res));
		return;
	}

	// -- Proxy completions (/v1/engines/*/completions) ----------------
	if (path.includes('/v1/engines/') && req.method === 'POST') {
		readBody().then((body: string) => handleChatCompletions(body, res));
		return;
	}

	// -- Skills, Search, Embeddings -----------------------------------
	if (path === '/skills' || path.startsWith('/search/') || path.startsWith('/embeddings')) {
		json(200, { data: [] });
		return;
	}

	// -- Catch-all: any remaining POST with messages → chat completions
	if (req.method === 'POST') {
		readBody().then((body: string) => {
			try {
				const parsed = JSON.parse(body);
				if (parsed.messages && Array.isArray(parsed.messages)) {
					handleChatCompletions(body, res);
					return;
				}
			} catch { }
			json(200, {});
		});
		return;
	}

	// -- Catch-all GET → empty success --------------------------------
	json(200, {});
}

// -- Server lifecycle --------------------------------------------------------

/** Emitted when a scenario chat completion is fully served. */
const serverEvents = new EventEmitter();

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Count the number of model turns already completed for the CURRENT scenario.
 * Only counts assistant messages that appear after the last user message
 * containing a [scenario:X] tag. This prevents assistant messages from
 * previous scenarios (in the same chat session) from inflating the count.
 */
function countCompletedModelTurns(messages: any[]): number {
	// Find the index of the last user message with a scenario tag
	let scenarioMsgIdx = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== 'user') { continue; }
		const content = typeof msg.content === 'string'
			? msg.content
			: Array.isArray(msg.content)
				? msg.content.map((c: any) => c.text || '').join('')
				: '';
		if (/\[scenario:[^\]]+\]/.test(content)) {
			scenarioMsgIdx = i;
			break;
		}
	}

	// Count assistant messages after the scenario tag message
	let turns = 0;
	const startIdx = scenarioMsgIdx >= 0 ? scenarioMsgIdx + 1 : 0;
	for (let i = startIdx; i < messages.length; i++) {
		if (messages[i].role === 'assistant') {
			turns++;
		}
	}
	return turns;
}

/**
 * Compute the model-turn index for the current request given the scenario's
 * turn list. User turns are skipped (they're handled by the test harness)
 * and do not consume a model turn index.
 *
 * The algorithm counts completed assistant messages in the conversation
 * history (each one = one served model turn), then maps that to the
 * n-th model turn in the scenario (skipping user turns).
 */
function resolveCurrentTurn(turns: ScenarioTurn[], messages: any[]): { turn: ModelScenarioTurn; turnIndex: number } {
	const completedModelTurns = countCompletedModelTurns(messages);
	// Build the model-only turn list (skip user turns)
	const modelTurns = turns.filter(t => t.kind !== 'user') as ModelScenarioTurn[];
	const idx = Math.min(completedModelTurns, modelTurns.length - 1);
	return { turn: modelTurns[idx], turnIndex: idx };
}

function findLastToolResult(items: any[]): any {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item?.role === 'tool' || item?.type === 'function_call_output') {
			return item;
		}
		if (Array.isArray(item?.content)) {
			const toolResult = item.content.findLast((part: any) => part?.type === 'tool_result');
			if (toolResult) {
				return toolResult;
			}
		}
	}
	return undefined;
}

async function handleChatCompletions(body: string, res: import('http').ServerResponse): Promise<void> {
	if (_verbose) {
		_log(`[mock-llm]   chat/completions request body:`);
		try {
			_log(_indentVerbose(_formatVerbose(JSON.parse(body))));
		} catch {
			_log(_indentVerbose(_formatVerbose(body)));
		}
	}
	let scenarioId = DEFAULT_SCENARIO;
	let isScenarioRequest = false;
	let requestToolNames: string[] = [];
	let messages: any[] = [];
	try {
		const parsed = JSON.parse(body);
		messages = parsed.messages || [];
		// Log user messages for debugging
		const userMsgs = messages.filter((m: any) => m.role === 'user');
		if (userMsgs.length > 0) {
			const lastContent = typeof userMsgs[userMsgs.length - 1].content === 'string'
				? userMsgs[userMsgs.length - 1].content.substring(0, 100)
				: '(structured)';
			const ts = new Date().toISOString().slice(11, -1);
			_log(`[mock-llm]   ${ts} → ${messages.length} msgs, last user: "${lastContent}"`);
		}
		// Extract available tool names from the request's tools array
		const tools = parsed.tools || [];
		requestToolNames = tools.map((t: any) => t.function?.name).filter(Boolean);
		if (requestToolNames.length > 0) {
			const ts = new Date().toISOString().slice(11, -1);
			_log(`[mock-llm]   ${ts} → ${requestToolNames.length} tools available: ${requestToolNames.join(', ')}`);
		}

		// Search user messages in reverse order (newest first) for the scenario
		// tag. This ensures the most recent message's tag takes precedence when
		// multiple messages with different tags exist in the same conversation
		// (e.g. in the leak checker which sends many scenarios in one session).
		// Follow-up user messages in multi-turn scenarios won't have a tag, so
		// searching backwards still finds the correct tag from the initial message.
		for (let mi = messages.length - 1; mi >= 0; mi--) {
			const msg = messages[mi];
			if (msg.role !== 'user') { continue; }
			const content = typeof msg.content === 'string'
				? msg.content
				: Array.isArray(msg.content)
					? msg.content.map((c: any) => c.text || '').join('')
					: '';
			const match = content.match(/\[scenario:([^\]]+)\]/);
			if (match && SCENARIOS[match[1]]) {
				scenarioId = match[1];
				isScenarioRequest = true;
				break;
			}
		}
	} catch { }

	const scenario = SCENARIOS[scenarioId] || SCENARIOS[DEFAULT_SCENARIO];

	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
		'X-Request-Id': 'perf-benchmark-' + Date.now(),
	});

	// Handle multi-turn scenarios — only when the request actually has tools.
	// Ancillary requests (title generation, progress messages) also contain the
	// [scenario:...] tag but don't send tools, so they fall through to content.
	if (isMultiTurnScenario(scenario) && requestToolNames.length > 0) {
		const { turn, turnIndex } = resolveCurrentTurn(scenario.turns, messages);
		const modelTurnCount = scenario.turns.filter(t => t.kind !== 'user').length;

		const ts = new Date().toISOString().slice(11, -1);
		_log(`[mock-llm]   ${ts} → multi-turn scenario ${scenarioId}, model turn ${turnIndex + 1}/${modelTurnCount} (${turn.kind}), ${countCompletedModelTurns(messages)} completed turns in history`);

		if (turn.kind === 'tool-calls') {
			await streamToolCalls(res, turn.toolCalls, requestToolNames, scenarioId);
			return;
		}

		if (turn.kind === 'thinking') {
			await streamThinkingThenContent(res, turn.thinkingChunks, turn.chunks, isScenarioRequest);
			return;
		}

		if (turn.kind === 'echo-last-message') {
			const lastMsg = messages[messages.length - 1];
			const payload = '```json\n' + JSON.stringify(lastMsg ?? null, null, 2) + '\n```';
			await streamContent(res, [{ content: payload, delayMs: 0 }], isScenarioRequest);
			return;
		}

		if (turn.kind === 'echo-last-tool-result') {
			const payload = '```json\n' + JSON.stringify(findLastToolResult(messages) ?? null, null, 2) + '\n```';
			await streamContent(res, [{ content: payload, delayMs: 0 }], isScenarioRequest);
			return;
		}

		// kind === 'content' — stream the final text response
		await streamContent(res, turn.chunks, isScenarioRequest);
		return;
	}

	// Standard content-only scenario (or multi-turn scenario falling back for
	// ancillary requests like title generation that don't include tools)
	const chunks = isMultiTurnScenario(scenario)
		? getFirstContentTurn(scenario)
		: scenario as StreamChunk[];

	await streamContent(res, chunks, isScenarioRequest);
}

/**
 * Get the chunks from the first content turn of a multi-turn scenario,
 * used as fallback text for ancillary requests (title generation etc).
 */
function getFirstContentTurn(scenario: MultiTurnScenario): StreamChunk[] {
	let contentTurn: ContentScenarioTurn | undefined;
	for (const turn of scenario.turns) {
		if (turn.kind === 'content') {
			contentTurn = turn;
			break;
		}
		if (turn.kind === 'thinking') {
			contentTurn = turn;
			break;
		}
	}
	return contentTurn?.chunks ?? getDefaultScenarioChunks();
}

/**
 * Stream content chunks as a standard SSE response.
 */
async function streamContent(res: import('http').ServerResponse, chunks: StreamChunk[], isScenarioRequest: boolean): Promise<void> {
	res.write(`data: ${JSON.stringify(makeInitialChunk())}\n\n`);

	for (const chunk of chunks) {
		if (chunk.delayMs > 0) { await sleep(chunk.delayMs); }
		res.write(`data: ${JSON.stringify(makeChunk(chunk.content, 0, false))}\n\n`);
	}

	res.write(`data: ${JSON.stringify(makeChunk('', 0, true))}\n\n`);
	res.write('data: [DONE]\n\n');
	res.end();

	if (isScenarioRequest) {
		serverEvents.emit('scenarioCompletion');
	}
}

// ----- Responses API (OpenAI) ---------------------------------------------------

/**
 * Handle a Responses API request. The Responses API uses a different SSE event
 * format than Chat Completions — the SDK expects `response.created`,
 * `response.output_item.added`, `response.output_text.delta`,
 * `response.output_item.done`, and `response.completed` events.
 *
 * The request body uses `input` (array of items) instead of `messages`.
 */
async function handleResponsesApi(body: string, res: import('http').ServerResponse): Promise<void> {
	if (_verbose) {
		_log(`[mock-llm]   /responses request body:`);
		try {
			_log(_indentVerbose(_formatVerbose(JSON.parse(body))));
		} catch {
			_log(_indentVerbose(_formatVerbose(body)));
		}
	}

	let scenarioId = DEFAULT_SCENARIO;
	let isScenarioRequest = false;
	let requestToolNames: string[] = [];
	let input: any[] = [];
	try {
		const parsed = JSON.parse(body);
		// Responses API uses `input` array and `tools` array
		input = parsed.input || [];
		const tools = parsed.tools || [];
		requestToolNames = tools.map((t: any) => t.name).filter(Boolean);

		// Search input items for scenario tags (input items have role + content)
		for (let i = input.length - 1; i >= 0; i--) {
			const item = input[i];
			if (item.role !== 'user') { continue; }
			const content = typeof item.content === 'string'
				? item.content
				: Array.isArray(item.content)
					? item.content.map((c: any) => c.text || '').join('')
					: '';
			const match = content.match(/\[scenario:([^\]]+)\]/);
			if (match && SCENARIOS[match[1]]) {
				scenarioId = match[1];
				isScenarioRequest = true;
				break;
			}
		}

		const ts = new Date().toISOString().slice(11, -1);
		_log(`[mock-llm]   ${ts} → responses-api: ${input.length} input items, ${requestToolNames.length} tools, scenario=${scenarioId}`);
	} catch { }

	const scenario = SCENARIOS[scenarioId] || SCENARIOS[DEFAULT_SCENARIO];

	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
		'X-Request-Id': 'perf-benchmark-' + Date.now(),
	});

	// Multi-turn scenarios — mirror the chat-completions / Anthropic handlers.
	// Only triggers when the request actually has tools so ancillary requests
	// (title generation etc.) fall through to a plain content turn.
	if (isMultiTurnScenario(scenario) && requestToolNames.length > 0) {
		const { turn, turnIndex } = resolveCurrentResponsesApiTurn(scenario.turns, input);
		const modelTurnCount = scenario.turns.filter(t => t.kind !== 'user').length;
		const ts = new Date().toISOString().slice(11, -1);
		_log(`[mock-llm]   ${ts} → responses-api multi-turn ${scenarioId}, model turn ${turnIndex + 1}/${modelTurnCount} (${turn.kind})`);

		if (turn.kind === 'tool-calls') {
			await streamResponsesApiToolCalls(res, turn.toolCalls, requestToolNames, scenarioId, isScenarioRequest);
			return;
		}

		if (turn.kind === 'echo-last-message') {
			const lastItem = input[input.length - 1];
			const payload = '```json\n' + JSON.stringify(lastItem ?? null, null, 2) + '\n```';
			await streamResponsesContent(res, [{ content: payload, delayMs: 0 }], isScenarioRequest);
			return;
		}

		if (turn.kind === 'echo-last-tool-result') {
			const payload = '```json\n' + JSON.stringify(findLastToolResult(input) ?? null, null, 2) + '\n```';
			await streamResponsesContent(res, [{ content: payload, delayMs: 0 }], isScenarioRequest);
			return;
		}

		// content / thinking — stream the chunks as text
		await streamResponsesContent(res, turn.chunks, isScenarioRequest);
		return;
	}

	// Resolve content chunks
	const chunks = isMultiTurnScenario(scenario)
		? getFirstContentTurn(scenario)
		: scenario as StreamChunk[];

	await streamResponsesContent(res, chunks, isScenarioRequest);
}

/**
 * Count completed assistant turns in a Responses API `input` array, after the
 * last user message carrying a `[scenario:X]` tag. Consecutive assistant
 * output items (`role === 'assistant'` messages or `type === 'function_call'`
 * items) are grouped into a single turn so multi-tool-call turns count once.
 */
function countCompletedResponsesApiModelTurns(input: any[]): number {
	let scenarioIdx = -1;
	for (let i = input.length - 1; i >= 0; i--) {
		const item = input[i];
		if (item.role !== 'user') { continue; }
		const content = typeof item.content === 'string'
			? item.content
			: Array.isArray(item.content)
				? item.content.map((c: any) => c.text || '').join('')
				: '';
		if (/\[scenario:[^\]]+\]/.test(content)) {
			scenarioIdx = i;
			break;
		}
	}

	let turns = 0;
	let inAssistantBlock = false;
	const startIdx = scenarioIdx >= 0 ? scenarioIdx + 1 : 0;
	for (let i = startIdx; i < input.length; i++) {
		const item = input[i];
		const isAssistantOutput = item.role === 'assistant' || item.type === 'function_call';
		if (isAssistantOutput) {
			if (!inAssistantBlock) {
				turns++;
				inAssistantBlock = true;
			}
		} else {
			inAssistantBlock = false;
		}
	}
	return turns;
}

/**
 * Responses API equivalent of `resolveCurrentTurn`.
 */
function resolveCurrentResponsesApiTurn(turns: ScenarioTurn[], input: any[]): { turn: ModelScenarioTurn; turnIndex: number } {
	const completedModelTurns = countCompletedResponsesApiModelTurns(input);
	const modelTurns = turns.filter(t => t.kind !== 'user') as ModelScenarioTurn[];
	const idx = Math.min(completedModelTurns, modelTurns.length - 1);
	return { turn: modelTurns[idx], turnIndex: idx };
}

/**
 * Stream tool calls as Responses API SSE events. Emits one
 * `function_call` output item per requested tool call.
 */
async function streamResponsesApiToolCalls(
	res: import('http').ServerResponse,
	toolCalls: Array<{ toolNamePattern: RegExp; arguments: Record<string, any> }>,
	requestToolNames: string[],
	scenarioId: string,
	isScenarioRequest: boolean
): Promise<void> {
	const responseId = `resp_mock_${Date.now()}`;
	const model = 'gpt-5.3-codex';
	let sequenceNumber = 0;
	const nextSeq = () => sequenceNumber++;

	const skeleton = {
		id: responseId,
		object: 'response',
		created_at: Math.floor(Date.now() / 1000),
		model,
		status: 'in_progress',
		output: [],
		usage: null,
	};

	res.write(`event: response.created\ndata: ${JSON.stringify({
		type: 'response.created',
		sequence_number: nextSeq(),
		response: skeleton,
	})}\n\n`);

	res.write(`event: response.in_progress\ndata: ${JSON.stringify({
		type: 'response.in_progress',
		sequence_number: nextSeq(),
		response: skeleton,
	})}\n\n`);

	const finalOutput: any[] = [];

	for (let i = 0; i < toolCalls.length; i++) {
		const call = toolCalls[i];
		let toolName = requestToolNames.find(name => call.toolNamePattern.test(name));
		if (!toolName) {
			toolName = call.toolNamePattern.source.replace(/[\\.|?*+^${}()\[\]]/g, '');
			_log(`[mock-llm]   No matching tool for pattern ${call.toolNamePattern}, using fallback: ${toolName}`);
		}

		const callId = `call_${scenarioId}_${i}_${Date.now()}`;
		const itemId = `fc_${callId}`;
		const argsJson = JSON.stringify(call.arguments);

		const item = {
			id: itemId,
			type: 'function_call',
			status: 'in_progress',
			call_id: callId,
			name: toolName,
			arguments: '',
		};

		res.write(`event: response.output_item.added\ndata: ${JSON.stringify({
			type: 'response.output_item.added',
			sequence_number: nextSeq(),
			output_index: i,
			item,
		})}\n\n`);

		res.write(`event: response.function_call_arguments.delta\ndata: ${JSON.stringify({
			type: 'response.function_call_arguments.delta',
			sequence_number: nextSeq(),
			item_id: itemId,
			output_index: i,
			delta: argsJson,
		})}\n\n`);

		res.write(`event: response.function_call_arguments.done\ndata: ${JSON.stringify({
			type: 'response.function_call_arguments.done',
			sequence_number: nextSeq(),
			item_id: itemId,
			output_index: i,
			arguments: argsJson,
		})}\n\n`);

		const doneItem = { ...item, status: 'completed', arguments: argsJson };
		finalOutput.push(doneItem);

		res.write(`event: response.output_item.done\ndata: ${JSON.stringify({
			type: 'response.output_item.done',
			sequence_number: nextSeq(),
			output_index: i,
			item: doneItem,
		})}\n\n`);
	}

	res.write(`event: response.completed\ndata: ${JSON.stringify({
		type: 'response.completed',
		sequence_number: nextSeq(),
		response: {
			id: responseId,
			object: 'response',
			created_at: Math.floor(Date.now() / 1000),
			model,
			status: 'completed',
			output: finalOutput,
			usage: {
				input_tokens: 100,
				output_tokens: 1,
				total_tokens: 101,
				input_tokens_details: { cached_tokens: 0 },
				output_tokens_details: { reasoning_tokens: 0 },
			},
		},
	})}\n\n`);

	res.end();

	if (isScenarioRequest) {
		serverEvents.emit('scenarioCompletion');
	}
}

/**
 * Stream content as Responses API SSE events.
 */
async function streamResponsesContent(res: import('http').ServerResponse, chunks: StreamChunk[], isScenarioRequest: boolean): Promise<void> {
	const responseId = `resp_mock_${Date.now()}`;
	const outputItemId = `msg_mock_${Date.now()}`;
	const model = 'gpt-5.3-codex';

	// 1. response.created
	res.write(`data: ${JSON.stringify({
		type: 'response.created',
		response: {
			id: responseId,
			object: 'response',
			created_at: Math.floor(Date.now() / 1000),
			model,
			status: 'in_progress',
			output: [],
			usage: null,
		},
	})}\n\n`);

	// 2. response.output_item.added — add a message output item
	res.write(`data: ${JSON.stringify({
		type: 'response.output_item.added',
		output_index: 0,
		item: {
			id: outputItemId,
			type: 'message',
			role: 'assistant',
			status: 'in_progress',
			content: [],
		},
	})}\n\n`);

	// 3. response.content_part.added — add a text content part
	res.write(`data: ${JSON.stringify({
		type: 'response.content_part.added',
		output_index: 0,
		content_index: 0,
		part: { type: 'output_text', text: '' },
	})}\n\n`);

	// 4. Stream text deltas
	let fullText = '';
	for (const chunk of chunks) {
		if (chunk.delayMs > 0) { await sleep(chunk.delayMs); }
		fullText += chunk.content;
		res.write(`data: ${JSON.stringify({
			type: 'response.output_text.delta',
			output_index: 0,
			content_index: 0,
			delta: chunk.content,
		})}\n\n`);
	}

	// 5. response.output_text.done
	res.write(`data: ${JSON.stringify({
		type: 'response.output_text.done',
		output_index: 0,
		content_index: 0,
		text: fullText,
	})}\n\n`);

	// 6. response.content_part.done
	res.write(`data: ${JSON.stringify({
		type: 'response.content_part.done',
		output_index: 0,
		content_index: 0,
		part: { type: 'output_text', text: fullText },
	})}\n\n`);

	// 7. response.output_item.done
	res.write(`data: ${JSON.stringify({
		type: 'response.output_item.done',
		output_index: 0,
		item: {
			id: outputItemId,
			type: 'message',
			role: 'assistant',
			status: 'completed',
			content: [{ type: 'output_text', text: fullText }],
		},
	})}\n\n`);

	// 8. response.completed — the terminal event the SDK waits for
	res.write(`data: ${JSON.stringify({
		type: 'response.completed',
		response: {
			id: responseId,
			object: 'response',
			created_at: Math.floor(Date.now() / 1000),
			model,
			status: 'completed',
			output: [
				{
					id: outputItemId,
					type: 'message',
					role: 'assistant',
					status: 'completed',
					content: [{ type: 'output_text', text: fullText }],
				},
			],
			usage: {
				input_tokens: 100,
				output_tokens: Math.max(1, Math.ceil(fullText.length / 4)),
				total_tokens: 100 + Math.max(1, Math.ceil(fullText.length / 4)),
				input_tokens_details: { cached_tokens: 0 },
				output_tokens_details: { reasoning_tokens: 0 },
			},
		},
	})}\n\n`);

	res.end();

	if (isScenarioRequest) {
		serverEvents.emit('scenarioCompletion');
	}
}

// ----- Anthropic Messages API -------------------------------------------------

/**
 * Anthropic SSE writer that emits a complete message response per the
 * `processResponseFromMessagesEndpoint` parser in `messagesApi.ts`. The
 * sequence is:
 *   `event: message_start` → opening message envelope with model + usage
 *   `event: content_block_start` → opens a `text` content block at index 0
 *   `event: content_block_delta` → one or more `text_delta` chunks
 *   `event: content_block_stop`
 *   `event: message_delta` → stop_reason + final usage
 *   `event: message_stop`
 *
 * Each event must be written as both an `event:` line and a `data:` line per
 * the SSE spec; the Anthropic SDK's stream parser keys off the `event:` line.
 */
function writeAnthropicEvent(res: import('http').ServerResponse, eventType: string, payload: Record<string, any>): void {
	res.write(`event: ${eventType}\n`);
	res.write(`data: ${JSON.stringify({ type: eventType, ...payload })}\n\n`);
}

/**
 * Stream a content scenario as an Anthropic Messages API SSE response.
 */
async function streamAnthropicContent(res: import('http').ServerResponse, chunks: StreamChunk[], isScenarioRequest: boolean): Promise<void> {
	const messageId = `msg_mock_${Date.now()}`;
	const model = 'claude-sonnet-4.5';

	writeAnthropicEvent(res, 'message_start', {
		message: {
			id: messageId,
			type: 'message',
			role: 'assistant',
			model,
			content: [],
			stop_reason: null,
			stop_sequence: null,
			usage: {
				input_tokens: 1,
				output_tokens: 0,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			},
		},
	});

	writeAnthropicEvent(res, 'content_block_start', {
		index: 0,
		content_block: { type: 'text', text: '' },
	});

	let totalOutputTokens = 0;
	for (const chunk of chunks) {
		if (chunk.delayMs > 0) { await sleep(chunk.delayMs); }
		writeAnthropicEvent(res, 'content_block_delta', {
			index: 0,
			delta: { type: 'text_delta', text: chunk.content },
		});
		// Rough token estimate — only used by usage accounting in the receiver.
		totalOutputTokens += Math.max(1, Math.ceil(chunk.content.length / 4));
	}

	writeAnthropicEvent(res, 'content_block_stop', { index: 0 });

	writeAnthropicEvent(res, 'message_delta', {
		delta: { stop_reason: 'end_turn', stop_sequence: null },
		usage: { output_tokens: totalOutputTokens },
	});

	writeAnthropicEvent(res, 'message_stop', {});

	res.end();

	if (isScenarioRequest) {
		serverEvents.emit('scenarioCompletion');
	}
}

/**
 * Anthropic-format request handler. Resolves the scenario from the request's
 * `[scenario:...]` tag the same way as `handleChatCompletions` (searching the
 * `messages[].content` array for either a string or an array of `{ type:
 * 'text', text }` blocks), then streams the matching content turn as
 * Anthropic SSE events. Multi-turn / thinking / tool-call scenarios fall
 * back to their first content turn for now — Claude Code smoke tests only
 * need a single text response.
 */
async function handleMessagesApi(body: string, res: import('http').ServerResponse): Promise<void> {
	if (_verbose) {
		_log(`[mock-llm]   /v1/messages request body:`);
		try {
			_log(_indentVerbose(_formatVerbose(JSON.parse(body))));
		} catch {
			_log(_indentVerbose(_formatVerbose(body)));
		}
	}
	let scenarioId = DEFAULT_SCENARIO;
	let isScenarioRequest = false;
	let messages: any[] = [];
	let requestToolNames: string[] = [];
	try {
		const parsed = JSON.parse(body);
		messages = parsed.messages || [];
		const tools = parsed.tools || [];
		requestToolNames = tools.map((t: any) => t.name).filter(Boolean);
		const userMsgs = messages.filter((m: any) => m.role === 'user');
		if (userMsgs.length > 0) {
			const last = userMsgs[userMsgs.length - 1];
			const lastContent = typeof last.content === 'string'
				? last.content.substring(0, 100)
				: Array.isArray(last.content)
					? last.content.map((c: any) => c.text || '').join('').substring(0, 100)
					: '(structured)';
			const ts = new Date().toISOString().slice(11, -1);
			_log(`[mock-llm]   ${ts} → messages-api: ${messages.length} msgs, ${requestToolNames.length} tools, last user: "${lastContent}"`);
		}

		for (let mi = messages.length - 1; mi >= 0; mi--) {
			const msg = messages[mi];
			if (msg.role !== 'user') { continue; }
			const content = typeof msg.content === 'string'
				? msg.content
				: Array.isArray(msg.content)
					? msg.content.map((c: any) => c.text || '').join('')
					: '';
			const match = content.match(/\[scenario:([^\]]+)\]/);
			if (match && SCENARIOS[match[1]]) {
				scenarioId = match[1];
				isScenarioRequest = true;
				break;
			}
		}

		// Anthropic's Messages API also accepts a top-level `system` parameter
		// (string or array of `{ type: 'text', text }` blocks). Some session
		// types (e.g. Claude Code) embed the user prompt there alongside the
		// system instructions, so scan it as a fallback when no tag was found
		// in the messages array.
		if (!isScenarioRequest && parsed.system !== undefined) {
			const systemContent = typeof parsed.system === 'string'
				? parsed.system
				: Array.isArray(parsed.system)
					? parsed.system.map((c: any) => c.text || '').join('')
					: '';
			const match = systemContent.match(/\[scenario:([^\]]+)\]/);
			if (match && SCENARIOS[match[1]]) {
				scenarioId = match[1];
				isScenarioRequest = true;
			}
		}
	} catch { }

	const scenario = SCENARIOS[scenarioId] || SCENARIOS[DEFAULT_SCENARIO];

	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
		'X-Request-Id': 'perf-benchmark-' + Date.now(),
	});

	// Multi-turn scenarios — only when the request actually has tools (matches
	// handleChatCompletions behavior; ancillary requests like title generation
	// have no tools and fall through to a content turn).
	if (isMultiTurnScenario(scenario) && requestToolNames.length > 0) {
		const { turn, turnIndex } = resolveCurrentTurn(scenario.turns, messages);
		const modelTurnCount = scenario.turns.filter(t => t.kind !== 'user').length;
		const ts = new Date().toISOString().slice(11, -1);
		_log(`[mock-llm]   ${ts} → messages-api multi-turn ${scenarioId}, model turn ${turnIndex + 1}/${modelTurnCount} (${turn.kind})`);

		if (turn.kind === 'tool-calls') {
			await streamAnthropicToolCalls(res, turn.toolCalls, requestToolNames, scenarioId, isScenarioRequest);
			return;
		}

		if (turn.kind === 'echo-last-message') {
			const lastMsg = messages[messages.length - 1];
			const payload = '```json\n' + JSON.stringify(lastMsg ?? null, null, 2) + '\n```';
			await streamAnthropicContent(res, [{ content: payload, delayMs: 0 }], isScenarioRequest);
			return;
		}

		if (turn.kind === 'echo-last-tool-result') {
			const payload = '```json\n' + JSON.stringify(findLastToolResult(messages) ?? null, null, 2) + '\n```';
			await streamAnthropicContent(res, [{ content: payload, delayMs: 0 }], isScenarioRequest);
			return;
		}

		// content / thinking — stream the chunks as text
		await streamAnthropicContent(res, turn.chunks, isScenarioRequest);
		return;
	}

	const chunks = isMultiTurnScenario(scenario)
		? getFirstContentTurn(scenario)
		: scenario as StreamChunk[];

	await streamAnthropicContent(res, chunks, isScenarioRequest);
}

/**
 * Stream tool_use blocks as an Anthropic Messages API SSE response.
 * Emits one `tool_use` content block per requested tool call, with the
 * arguments delivered as `input_json_delta` chunks, then finishes with
 * `stop_reason: 'tool_use'`.
 */
async function streamAnthropicToolCalls(
	res: import('http').ServerResponse,
	toolCalls: Array<{ toolNamePattern: RegExp; arguments: Record<string, any> }>,
	requestToolNames: string[],
	scenarioId: string,
	isScenarioRequest: boolean
): Promise<void> {
	const messageId = `msg_mock_${Date.now()}`;
	const model = 'claude-sonnet-4.5';

	writeAnthropicEvent(res, 'message_start', {
		message: {
			id: messageId,
			type: 'message',
			role: 'assistant',
			model,
			content: [],
			stop_reason: null,
			stop_sequence: null,
			usage: { input_tokens: 1, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
		},
	});

	for (let i = 0; i < toolCalls.length; i++) {
		const call = toolCalls[i];
		let toolName = requestToolNames.find(name => call.toolNamePattern.test(name));
		if (!toolName) {
			toolName = call.toolNamePattern.source.replace(/[\\.|?*+^${}()\[\]]/g, '');
			_log(`[mock-llm]   No matching tool for pattern ${call.toolNamePattern}, using fallback: ${toolName}`);
		}

		const callId = `toolu_${scenarioId}_${i}_${Date.now()}`;
		writeAnthropicEvent(res, 'content_block_start', {
			index: i,
			content_block: { type: 'tool_use', id: callId, name: toolName, input: {} },
		});

		const argsJson = JSON.stringify(call.arguments);
		const fragmentSize = Math.max(20, Math.ceil(argsJson.length / 4));
		for (let pos = 0; pos < argsJson.length; pos += fragmentSize) {
			const fragment = argsJson.slice(pos, pos + fragmentSize);
			writeAnthropicEvent(res, 'content_block_delta', {
				index: i,
				delta: { type: 'input_json_delta', partial_json: fragment },
			});
			await sleep(5);
		}

		writeAnthropicEvent(res, 'content_block_stop', { index: i });
	}

	writeAnthropicEvent(res, 'message_delta', {
		delta: { stop_reason: 'tool_use', stop_sequence: null },
		usage: { output_tokens: 1 },
	});
	writeAnthropicEvent(res, 'message_stop', {});
	res.end();

	if (isScenarioRequest) {
		serverEvents.emit('scenarioCompletion');
	}
}

/**
 * Stream thinking chunks followed by content chunks as an SSE response.
 * Thinking is emitted as `cot_summary` deltas, then a `cot_id` to close the
 * thinking block, followed by standard content deltas.
 */
async function streamThinkingThenContent(
	res: import('http').ServerResponse,
	thinkingChunks: StreamChunk[],
	contentChunks: StreamChunk[],
	isScenarioRequest: boolean
): Promise<void> {
	res.write(`data: ${JSON.stringify(makeInitialChunk())}\n\n`);

	// Stream thinking text
	for (const chunk of thinkingChunks) {
		if (chunk.delayMs > 0) { await sleep(chunk.delayMs); }
		res.write(`data: ${JSON.stringify(makeThinkingChunk(chunk.content))}\n\n`);
	}

	// Close thinking block with ID
	const cotId = `cot_perf_${Date.now()}`;
	res.write(`data: ${JSON.stringify(makeThinkingIdChunk(cotId))}\n\n`);
	await sleep(10);

	// Stream content
	for (const chunk of contentChunks) {
		if (chunk.delayMs > 0) { await sleep(chunk.delayMs); }
		res.write(`data: ${JSON.stringify(makeChunk(chunk.content, 0, false))}\n\n`);
	}

	res.write(`data: ${JSON.stringify(makeChunk('', 0, true))}\n\n`);
	res.write('data: [DONE]\n\n');
	res.end();

	if (isScenarioRequest) {
		serverEvents.emit('scenarioCompletion');
	}
}

/**
 * Stream tool call chunks as an SSE response.
 */
async function streamToolCalls(
	res: import('http').ServerResponse,
	toolCalls: Array<{ toolNamePattern: RegExp; arguments: Record<string, any> }>,
	requestToolNames: string[],
	scenarioId: string
): Promise<void> {
	res.write(`data: ${JSON.stringify(makeToolCallInitialChunk())}\n\n`);

	for (let i = 0; i < toolCalls.length; i++) {
		const call = toolCalls[i];
		const callId = `call_perf_${scenarioId}_${i}_${Date.now()}`;

		// Find the matching tool name from the request's tools array
		let toolName = requestToolNames.find(name => call.toolNamePattern.test(name));
		if (!toolName) {
			toolName = call.toolNamePattern.source.replace(/[\\.|?*+^${}()\[\]]/g, '');
			_log(`[mock-llm]   No matching tool for pattern ${call.toolNamePattern}, using fallback: ${toolName}`);
		}

		// Stream tool call: start chunk, then arguments in fragments
		res.write(`data: ${JSON.stringify(makeToolCallStartChunk(i, callId, toolName))}\n\n`);
		await sleep(10);

		const argsJson = JSON.stringify(call.arguments);
		const fragmentSize = Math.max(20, Math.ceil(argsJson.length / 4));
		for (let pos = 0; pos < argsJson.length; pos += fragmentSize) {
			const fragment = argsJson.slice(pos, pos + fragmentSize);
			res.write(`data: ${JSON.stringify(makeToolCallArgsChunk(i, fragment))}\n\n`);
			await sleep(5);
		}
	}

	res.write(`data: ${JSON.stringify(makeToolCallFinishChunk())}\n\n`);
	res.write('data: [DONE]\n\n');
	res.end();
}

interface MockLlmServerHandle {
	port: number;
	url: string;
	close(): Promise<void>;
	/** Return total request count. */
	requestCount(): number;
	/** Wait until at least `n` requests have been received. */
	waitForRequests(n: number, timeoutMs: number): Promise<void>;
	/** Return total scenario-completion count. */
	completionCount(): number;
	/** Wait until at least `n` scenario chat completions have been served. */
	waitForCompletion(n: number, timeoutMs: number): Promise<void>;
	/**
	 * Return the parsed bodies of the chat requests received so far (one entry
	 * per POST to `/chat/completions` or `/responses`, in arrival order). The
	 * `body` is the JSON-parsed request payload (or the raw string when parsing
	 * fails). Used by tests to assert what the client forwarded to the server
	 * (e.g. `reasoning.effort` or the context-management `compact_threshold`).
	 *
	 * Returns an empty array unless the server was started with
	 * {@link StartServerOptions.captureRequests} set — request capture is off by
	 * default so perf/mem-leak harnesses don't retain request bodies.
	 */
	getRequests(): CapturedRequest[];
}

/**
 * A captured chat request, exposed via {@link MockLlmServerHandle.getRequests}.
 */
interface CapturedRequest {
	path: string;
	method: string;
	body: any;
}

interface StartServerOptions {
	logger?: (msg: string) => void;
	verbose?: boolean;
	/**
	 * When `true`, the server retains the parsed body of every `/chat/completions`
	 * and `/responses` POST so tests can assert what the client forwarded (see
	 * {@link MockLlmServerHandle.getRequests}). Defaults to `false`: perf/mem-leak
	 * harnesses generate large volumes of traffic, so capture stays off to avoid
	 * unbounded in-memory retention of request bodies. Only the smoke suites that
	 * call `getRequests()` enable it.
	 */
	captureRequests?: boolean;
}

/**
 * Start the mock server and return a handle.
 */
function _startServer(port = 0, options?: StartServerOptions): Promise<MockLlmServerHandle> {
	if (options?.logger) {
		_log = options.logger;
	}
	if (options?.verbose) {
		_verbose = true;
	}
	return new Promise((resolve, reject) => {
		let reqCount = 0;
		let completions = 0;
		let requestWaiters: Array<() => boolean> = [];
		let completionWaiters: Array<() => boolean> = [];

		const onCompletion = () => {
			completions++;
			completionWaiters = completionWaiters.filter(fn => !fn());
		};
		serverEvents.on('scenarioCompletion', onCompletion);

		// Accumulate the parsed bodies of chat requests so tests can assert what
		// the client forwarded (see MockLlmServerHandle.getRequests). Off by default
		// so the listener (and its JSON.parse + unbounded retention) is never wired
		// up for perf/mem-leak harnesses that don't assert on request bodies.
		const capturedRequests: CapturedRequest[] = [];
		const captureRequests = options?.captureRequests ?? false;
		const onCapturedRequest = (info: { path: string; method: string; body: string }) => {
			let parsed: any = info.body;
			try {
				parsed = JSON.parse(info.body);
			} catch {
				// Keep the raw string when the body is not valid JSON.
			}
			capturedRequests.push({ path: info.path, method: info.method, body: parsed });
		};
		if (captureRequests) {
			serverEvents.on('capturedRequest', onCapturedRequest);
		}

		const server = http.createServer((req, res) => {
			reqCount++;
			requestWaiters = requestWaiters.filter(fn => !fn());
			handleRequest(req, res);
		});
		server.listen(port, '127.0.0.1', () => {
			const addr = server.address();
			const actualPort = typeof addr === 'object' && addr ? addr.port : port;
			const url = `http://127.0.0.1:${actualPort}`;
			resolve({
				port: actualPort,
				url,
				close: () => new Promise<void>((resolve, reject) => {
					serverEvents.removeListener('scenarioCompletion', onCompletion);
					if (captureRequests) {
						serverEvents.removeListener('capturedRequest', onCapturedRequest);
					}
					server.close(err => err ? reject(err) : resolve(undefined));
				}),
				requestCount: () => reqCount,
				waitForRequests: (n: number, timeoutMs: number) => new Promise<void>((resolve, reject) => {
					if (reqCount >= n) { resolve(); return; }
					const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${n} requests (got ${reqCount})`)), timeoutMs);
					requestWaiters.push(() => {
						if (reqCount >= n) { clearTimeout(timer); resolve(); return true; }
						return false;
					});
				}),
				completionCount: () => completions,
				waitForCompletion: (n: number, timeoutMs: number) => new Promise<void>((resolve, reject) => {
					if (completions >= n) { resolve(); return; }
					const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${n} completions (got ${completions})`)), timeoutMs);
					completionWaiters.push(() => {
						if (completions >= n) { clearTimeout(timer); resolve(); return true; }
						return false;
					});
				}),
				getRequests: () => capturedRequests.slice(),
			});
		});
		server.on('error', reject);
	});
}

/**
 * Get the user follow-up messages for a scenario, in order.
 * Returns an array of { message, afterModelTurn } objects where afterModelTurn
 * is the 0-based index of the model turn after which this user message should
 * be injected.
 */
function _getUserTurns(scenarioId: string): Array<{ message: string; afterModelTurn: number }> {
	const scenario = SCENARIOS[scenarioId];
	if (!isMultiTurnScenario(scenario)) { return []; }
	const result: Array<{ message: string; afterModelTurn: number }> = [];
	let modelTurnsSeen = 0;
	for (const turn of scenario.turns) {
		if (turn.kind === 'user') {
			result.push({ message: turn.message, afterModelTurn: modelTurnsSeen });
		} else {
			modelTurnsSeen++;
		}
	}
	return result;
}

/**
 * Get the total number of model turns (non-user turns) in a scenario.
 */
function _getModelTurnCount(scenarioId: string): number {
	const scenario = SCENARIOS[scenarioId];
	if (!isMultiTurnScenario(scenario)) { return 1; }
	return scenario.turns.filter(t => t.kind !== 'user').length;
}

/**
 * Register a scenario dynamically. Test files call this to add
 * scenarios that are only relevant to them.
 */
function _registerScenario(id: string, definition: StreamChunk[] | MultiTurnScenario): void {
	SCENARIOS[id] = definition;
}

/**
 * Return the IDs of all currently registered scenarios.
 */
function _getScenarioIds(): string[] {
	return Object.keys(SCENARIOS);
}

module.exports = {
	startServer: _startServer,
	ScenarioBuilder: ScenarioBuilderImpl,
	registerScenario: _registerScenario,
	getScenarioIds: _getScenarioIds,
	getUserTurns: _getUserTurns,
	getModelTurnCount: _getModelTurnCount,
};

// -----------------------------------------------------------------------------
// Type-level re-exports for TypeScript consumers (CJS-compatible).
//
// TypeScript doesn't infer module shape from `module.exports = {...}` in `.ts`
// files (only in `.js`), so consumers using `import('./mock-llm-server').X` in
// JSDoc or destructuring `require(...)` under `@ts-check` would fail to find
// the exports. The `export type` re-exports and `export declare` redeclarations
// below let TS see the module shape; both are pure type syntax that Node 24's
// TS type-stripping removes entirely at runtime, preserving CJS compatibility.
// -----------------------------------------------------------------------------

export type {
	StreamChunk,
	ScenarioTurn,
	ModelScenarioTurn,
	ContentScenarioTurn,
	MultiTurnScenario,
	MockLlmServerHandle,
	StartServerOptions,
	CapturedRequest,
};

export declare const startServer: typeof _startServer;
export declare const ScenarioBuilder: typeof ScenarioBuilderImpl;
export declare const registerScenario: typeof _registerScenario;
export declare const getScenarioIds: typeof _getScenarioIds;
export declare const getUserTurns: typeof _getUserTurns;
export declare const getModelTurnCount: typeof _getModelTurnCount;

// Allow running standalone for testing: node scripts/chat-simulation/common/mock-llm-server.ts
if (require.main === module) {
	const { registerPerfScenarios } = require('./perf-scenarios') as { registerPerfScenarios: () => void };
	registerPerfScenarios();
	const port = parseInt(process.argv[2] || '0', 10);
	_startServer(port).then((handle: MockLlmServerHandle) => {
		_log(`Mock LLM server listening at ${handle.url}`);
		_log(`Scenarios: ${Object.keys(SCENARIOS).join(', ')}`);
	});
}
