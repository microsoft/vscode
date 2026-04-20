/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * Local mock server that implements the OpenAI Chat Completions streaming API.
 * Used by the chat perf benchmark to replace the real LLM backend with
 * deterministic, zero-latency responses.
 *
 * Supports scenario-based responses: the `messages` array's last user message
 * content is matched against scenario IDs. Unknown scenarios get a default
 * text-only response.
 */

const http = require('http');
const path = require('path');
const { EventEmitter } = require('events');

const ROOT = path.join(__dirname, '..', '..', '..');

// -- Scenario fixtures -------------------------------------------------------

/**
 * @typedef {{ content: string, delayMs: number }} StreamChunk
 */

/**
 * A single turn in a multi-turn scenario.
 *
 * @typedef {{
 *   kind: 'tool-calls',
 *   toolCalls: Array<{ toolNamePattern: RegExp, arguments: Record<string, any> }>,
 * } | {
 *   kind: 'content',
 *   chunks: StreamChunk[],
 * } | {
 *   kind: 'thinking',
 *   thinkingChunks: StreamChunk[],
 *   chunks: StreamChunk[],
 * } | {
 *   kind: 'user',
 *   message: string,
 * }} ScenarioTurn
 */

/**
 * A scenario turn produced by the model.
 *
 * @typedef {{
 *   kind: 'tool-calls',
 *   toolCalls: Array<{ toolNamePattern: RegExp, arguments: Record<string, any> }>,
 * } | {
 *   kind: 'content',
 *   chunks: StreamChunk[],
 * } | {
 *   kind: 'thinking',
 *   thinkingChunks: StreamChunk[],
 *   chunks: StreamChunk[],
 * }} ModelScenarioTurn
 */

/**
 * A model turn that emits content chunks.
 *
 * @typedef {{
 *   kind: 'content',
 *   chunks: StreamChunk[],
 * } | {
 *   kind: 'thinking',
 *   thinkingChunks: StreamChunk[],
 *   chunks: StreamChunk[],
 * }} ContentScenarioTurn
 */

/**
 * A multi-turn scenario — an ordered sequence of turns.
 * The mock server determines which model turn to serve based on the number
 * of assistant→tool round-trips already present in the conversation.
 * User turns are skipped by the server and instead injected by the test
 * harness, which types them into the chat input and presses Enter.
 *
 * @typedef {{
 *   type: 'multi-turn',
 *   turns: ScenarioTurn[],
 * }} MultiTurnScenario
 */

/**
 * @param {any} scenario
 * @returns {scenario is MultiTurnScenario}
 */
function isMultiTurnScenario(scenario) {
	return scenario && typeof scenario === 'object' && scenario.type === 'multi-turn';
}

/**
 * Helper for building scenario chunk sequences with timing control.
 */
class ScenarioBuilder {
	constructor() {
		/** @type {StreamChunk[]} */
		this.chunks = [];
	}

	/**
	 * Emit a content chunk immediately (no delay before it).
	 * @param {string} content
	 * @returns {this}
	 */
	emit(content) {
		this.chunks.push({ content, delayMs: 0 });
		return this;
	}

	/**
	 * Wait, then emit a content chunk — simulates network/token generation latency.
	 * @param {number} ms - delay in milliseconds before this chunk
	 * @param {string} content
	 * @returns {this}
	 */
	wait(ms, content) {
		this.chunks.push({ content, delayMs: ms });
		return this;
	}

	/**
	 * Emit multiple chunks with uniform inter-chunk delay.
	 * @param {string[]} contents
	 * @param {number} [delayMs=15] - delay between each chunk (default ~1 frame)
	 * @returns {this}
	 */
	stream(contents, delayMs = 15) {
		for (const content of contents) {
			this.chunks.push({ content, delayMs });
		}
		return this;
	}

	/**
	 * Emit multiple chunks with no delay (burst).
	 * @param {string[]} contents
	 * @returns {this}
	 */
	burst(contents) {
		return this.stream(contents, 0);
	}

	/** @returns {StreamChunk[]} */
	build() {
		return this.chunks;
	}
}

/** @type {Record<string, StreamChunk[] | MultiTurnScenario>} */
const SCENARIOS = /** @type {Record<string, StreamChunk[] | MultiTurnScenario>} */ ({});

const DEFAULT_SCENARIO = 'text-only';

/**
 * @returns {StreamChunk[]}
 */
function getDefaultScenarioChunks() {
	const scenario = SCENARIOS[DEFAULT_SCENARIO];
	if (isMultiTurnScenario(scenario)) {
		throw new Error(`Default scenario '${DEFAULT_SCENARIO}' must be content-only`);
	}
	return scenario;
}

// -- SSE chunk builder -------------------------------------------------------

const MODEL = 'gpt-4o-2024-08-06';

/**
 * @param {string} content
 * @param {number} index
 * @param {boolean} finish
 */
function makeChunk(content, index, finish) {
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
 * @param {number} index - tool call index
 * @param {string} callId - unique call ID
 * @param {string} functionName - tool function name
 */
function makeToolCallStartChunk(index, callId, functionName) {
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
 * @param {number} index - tool call index
 * @param {string} argsFragment - partial JSON arguments
 */
function makeToolCallArgsChunk(index, argsFragment) {
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
 * @param {string} text - thinking text fragment
 */
function makeThinkingChunk(text) {
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
 * @param {string} cotId - unique chain-of-thought ID
 */
function makeThinkingIdChunk(cotId) {
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

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function handleRequest(req, res) {
	const contentLength = req.headers['content-length'] || '0';
	const ts = new Date().toISOString().slice(11, -1); // HH:MM:SS.mmm
	console.log(`[mock-llm] ${ts} ${req.method} ${req.url} (${contentLength} bytes)`);

	// CORS
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', '*');
	if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const path = url.pathname;
	const json = (/** @type {number} */ status, /** @type {any} */ data) => {
		res.writeHead(status, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(data));
	};
	const readBody = () => new Promise(resolve => {
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
				available_models: [MODEL, 'gpt-4o-mini'],
				session_token: 'perf-session-token-' + Date.now(),
				expires_at: Math.floor(Date.now() / 1000) + 3600,
				discounted_costs: {},
			});
		});
		return;
	}

	// -- Models (DomainService.capiModelsURL = /models) --------------
	if (path === '/models' && req.method === 'GET') {
		json(200, {
			data: [
				{
					id: MODEL,
					name: 'GPT-4o (Mock)',
					version: '2024-05-13',
					vendor: 'copilot',
					model_picker_enabled: true,
					is_chat_default: true,
					is_chat_fallback: true,
					billing: { is_premium: false, multiplier: 0 },
					capabilities: {
						type: 'chat',
						family: 'gpt-4o',
						tokenizer: 'o200k_base',
						limits: {
							max_prompt_tokens: 128000,
							max_output_tokens: 131072,
							max_context_window_tokens: 128000,
						},
						supports: {
							streaming: true,
							tool_calls: true,
							parallel_tool_calls: true,
							vision: false,
						},
					},
					supported_endpoints: ['/chat/completions'],
				},
				{
					id: 'gpt-4o-mini',
					name: 'GPT-4o mini (Mock)',
					version: '2024-07-18',
					vendor: 'copilot',
					model_picker_enabled: false,
					is_chat_default: false,
					is_chat_fallback: false,
					billing: { is_premium: false, multiplier: 0 },
					capabilities: {
						type: 'chat',
						family: 'gpt-4o-mini',
						tokenizer: 'o200k_base',
						limits: {
							max_prompt_tokens: 128000,
							max_output_tokens: 131072,
							max_context_window_tokens: 128000,
						},
						supports: {
							streaming: true,
							tool_calls: true,
							parallel_tool_calls: true,
							vision: false,
						},
					},
					supported_endpoints: ['/chat/completions'],
				},
			],
		});
		return;
	}

	// -- Model by ID (DomainService.capiModelsURL/{id}) --------------
	if (path.startsWith('/models/') && req.method === 'GET') {
		const modelId = path.split('/models/')[1]?.split('/')[0];
		if (path.endsWith('/policy')) {
			json(200, { state: 'accepted', terms: '' });
			return;
		}
		json(200, {
			id: modelId || MODEL,
			name: 'GPT-4o (Mock)',
			version: '2024-05-13',
			vendor: 'copilot',
			model_picker_enabled: true,
			is_chat_default: true,
			is_chat_fallback: true,
			capabilities: {
				type: 'chat',
				family: 'gpt-4o',
				tokenizer: 'o200k_base',
				limits: { max_prompt_tokens: 128000, max_output_tokens: 131072, max_context_window_tokens: 128000 },
				supports: { streaming: true, tool_calls: true, parallel_tool_calls: true, vision: false },
			},
		});
		return;
	}

	// -- Agents (DomainService.remoteAgentsURL = /agents) -------------
	if (path.startsWith('/agents')) {
		// /agents/sessions — CopilotSessions
		if (path.includes('/sessions')) {
			json(200, { sessions: [], total_count: 0, page_size: 20, page_number: 1 });
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
		readBody().then((/** @type {string} */ body) => handleChatCompletions(body, res));
		return;
	}

	// -- Responses API (DomainService.capiResponsesURL = /responses) --
	if (path === '/responses' && req.method === 'POST') {
		readBody().then((/** @type {string} */ body) => handleChatCompletions(body, res));
		return;
	}

	// -- Messages API (DomainService.capiMessagesURL = /v1/messages) --
	if (path === '/v1/messages' && req.method === 'POST') {
		readBody().then((/** @type {string} */ body) => handleChatCompletions(body, res));
		return;
	}

	// -- Proxy completions (/v1/engines/*/completions) ----------------
	if (path.includes('/v1/engines/') && req.method === 'POST') {
		readBody().then((/** @type {string} */ body) => handleChatCompletions(body, res));
		return;
	}

	// -- Skills, Search, Embeddings -----------------------------------
	if (path === '/skills' || path.startsWith('/search/') || path.startsWith('/embeddings')) {
		json(200, { data: [] });
		return;
	}

	// -- Catch-all: any remaining POST with messages → chat completions
	if (req.method === 'POST') {
		readBody().then((/** @type {string} */ body) => {
			try {
				const parsed = JSON.parse(/** @type {string} */(body));
				if (parsed.messages && Array.isArray(parsed.messages)) {
					handleChatCompletions(/** @type {string} */(body), res);
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

/** @param {number} ms */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Count the number of model turns already completed for the CURRENT scenario.
 * Only counts assistant messages that appear after the last user message
 * containing a [scenario:X] tag. This prevents assistant messages from
 * previous scenarios (in the same chat session) from inflating the count.
 *
 * @param {any[]} messages
 * @returns {number}
 */
function countCompletedModelTurns(messages) {
	// Find the index of the last user message with a scenario tag
	let scenarioMsgIdx = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== 'user') { continue; }
		const content = typeof msg.content === 'string'
			? msg.content
			: Array.isArray(msg.content)
				? msg.content.map((/** @type {any} */ c) => c.text || '').join('')
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
 *
 * @param {ScenarioTurn[]} turns
 * @param {any[]} messages
 * @returns {{ turn: ModelScenarioTurn, turnIndex: number }}
 */
function resolveCurrentTurn(turns, messages) {
	const completedModelTurns = countCompletedModelTurns(messages);
	// Build the model-only turn list (skip user turns)
	const modelTurns = /** @type {ModelScenarioTurn[]} */ (turns.filter(t => t.kind !== 'user'));
	const idx = Math.min(completedModelTurns, modelTurns.length - 1);
	return { turn: modelTurns[idx], turnIndex: idx };
}

/**
 * @param {string} body
 * @param {http.ServerResponse} res
 */
async function handleChatCompletions(body, res) {
	let scenarioId = DEFAULT_SCENARIO;
	let isScenarioRequest = false;
	/** @type {string[]} */
	let requestToolNames = [];
	/** @type {any[]} */
	let messages = [];
	try {
		const parsed = JSON.parse(body);
		messages = parsed.messages || [];
		// Log user messages for debugging
		const userMsgs = messages.filter((/** @type {any} */ m) => m.role === 'user');
		if (userMsgs.length > 0) {
			const lastContent = typeof userMsgs[userMsgs.length - 1].content === 'string'
				? userMsgs[userMsgs.length - 1].content.substring(0, 100)
				: '(structured)';
			const ts = new Date().toISOString().slice(11, -1);
			console.log(`[mock-llm]   ${ts} → ${messages.length} msgs, last user: "${lastContent}"`);
		}
		// Extract available tool names from the request's tools array
		const tools = parsed.tools || [];
		requestToolNames = tools.map((/** @type {any} */ t) => t.function?.name).filter(Boolean);
		if (requestToolNames.length > 0) {
			const ts = new Date().toISOString().slice(11, -1);
			console.log(`[mock-llm]   ${ts} → ${requestToolNames.length} tools available: ${requestToolNames.join(', ')}`);
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
					? msg.content.map((/** @type {any} */ c) => c.text || '').join('')
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
		console.log(`[mock-llm]   ${ts} → multi-turn scenario ${scenarioId}, model turn ${turnIndex + 1}/${modelTurnCount} (${turn.kind}), ${countCompletedModelTurns(messages)} completed turns in history`);

		if (turn.kind === 'tool-calls') {
			await streamToolCalls(res, turn.toolCalls, requestToolNames, scenarioId);
			return;
		}

		if (turn.kind === 'thinking') {
			await streamThinkingThenContent(res, turn.thinkingChunks, turn.chunks, isScenarioRequest);
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
		: /** @type {StreamChunk[]} */ (scenario);

	await streamContent(res, chunks, isScenarioRequest);
}

/**
 * Get the chunks from the first content turn of a multi-turn scenario,
 * used as fallback text for ancillary requests (title generation etc).
 * @param {MultiTurnScenario} scenario
 * @returns {StreamChunk[]}
 */
function getFirstContentTurn(scenario) {
	/** @type {ContentScenarioTurn | undefined} */
	let contentTurn;
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
 * @param {http.ServerResponse} res
 * @param {StreamChunk[]} chunks
 * @param {boolean} isScenarioRequest
 */
async function streamContent(res, chunks, isScenarioRequest) {
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

/**
 * Stream thinking chunks followed by content chunks as an SSE response.
 * Thinking is emitted as `cot_summary` deltas, then a `cot_id` to close the
 * thinking block, followed by standard content deltas.
 * @param {http.ServerResponse} res
 * @param {StreamChunk[]} thinkingChunks
 * @param {StreamChunk[]} contentChunks
 * @param {boolean} isScenarioRequest
 */
async function streamThinkingThenContent(res, thinkingChunks, contentChunks, isScenarioRequest) {
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
 * @param {http.ServerResponse} res
 * @param {Array<{ toolNamePattern: RegExp, arguments: Record<string, any> }>} toolCalls
 * @param {string[]} requestToolNames
 * @param {string} scenarioId
 */
async function streamToolCalls(res, toolCalls, requestToolNames, scenarioId) {
	res.write(`data: ${JSON.stringify(makeToolCallInitialChunk())}\n\n`);

	for (let i = 0; i < toolCalls.length; i++) {
		const call = toolCalls[i];
		const callId = `call_perf_${scenarioId}_${i}_${Date.now()}`;

		// Find the matching tool name from the request's tools array
		let toolName = requestToolNames.find(name => call.toolNamePattern.test(name));
		if (!toolName) {
			toolName = call.toolNamePattern.source.replace(/[\\.|?*+^${}()\[\]]/g, '');
			console.warn(`[mock-llm]   No matching tool for pattern ${call.toolNamePattern}, using fallback: ${toolName}`);
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

/**
 * Start the mock server and return a handle.
 * @param {number} port
 */
function startServer(port = 0) {
	return new Promise((resolve, reject) => {
		let reqCount = 0;
		let completions = 0;
		/** @type {Array<() => boolean>} */
		let requestWaiters = [];
		/** @type {Array<() => boolean>} */
		let completionWaiters = [];

		const onCompletion = () => {
			completions++;
			completionWaiters = completionWaiters.filter(fn => !fn());
		};
		serverEvents.on('scenarioCompletion', onCompletion);

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
				close: () => /** @type {Promise<void>} */(new Promise((resolve, reject) => {
					serverEvents.removeListener('scenarioCompletion', onCompletion);
					server.close(err => err ? reject(err) : resolve(undefined));
				})),
				/** Return total request count. */
				requestCount: () => reqCount,
				/**
				 * Wait until at least `n` requests have been received.
				 * @param {number} n
				 * @param {number} timeoutMs
				 * @returns {Promise<void>}
				 */
				waitForRequests: (n, timeoutMs) => new Promise((resolve, reject) => {
					if (reqCount >= n) { resolve(); return; }
					const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${n} requests (got ${reqCount})`)), timeoutMs);
					requestWaiters.push(() => {
						if (reqCount >= n) { clearTimeout(timer); resolve(); return true; }
						return false;
					});
				}),
				/** Return total scenario-completion count. */
				completionCount: () => completions,
				/**
				 * Wait until at least `n` scenario chat completions have been served.
				 * @param {number} n
				 * @param {number} timeoutMs
				 * @returns {Promise<void>}
				 */
				waitForCompletion: (n, timeoutMs) => new Promise((resolve, reject) => {
					if (completions >= n) { resolve(); return; }
					const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${n} completions (got ${completions})`)), timeoutMs);
					completionWaiters.push(() => {
						if (completions >= n) { clearTimeout(timer); resolve(); return true; }
						return false;
					});
				}),
			});
		});
		server.on('error', reject);
	});
}

// Allow running standalone for testing: node scripts/mock-llm-server.js
if (require.main === module) {
	const { registerPerfScenarios } = require('./perf-scenarios');
	registerPerfScenarios();
	const port = parseInt(process.argv[2] || '0', 10);
	startServer(port).then((/** @type {any} */ handle) => {
		console.log(`Mock LLM server listening at ${handle.url}`);
		console.log('Scenarios:', Object.keys(SCENARIOS).join(', '));
	});
}

/**
 * Get the user follow-up messages for a scenario, in order.
 * Returns an array of { message, afterModelTurn } objects where afterModelTurn
 * is the 0-based index of the model turn after which this user message should
 * be injected.
 * @param {string} scenarioId
 * @returns {Array<{ message: string, afterModelTurn: number }>}
 */
function getUserTurns(scenarioId) {
	const scenario = SCENARIOS[scenarioId];
	if (!isMultiTurnScenario(scenario)) { return []; }
	const result = [];
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
 * @param {string} scenarioId
 * @returns {number}
 */
function getModelTurnCount(scenarioId) {
	const scenario = SCENARIOS[scenarioId];
	if (!isMultiTurnScenario(scenario)) { return 1; }
	return scenario.turns.filter(t => t.kind !== 'user').length;
}

/**
 * Register a scenario dynamically. Test files call this to add
 * scenarios that are only relevant to them.
 * @param {string} id - unique scenario identifier
 * @param {StreamChunk[] | MultiTurnScenario} definition - scenario data
 */
function registerScenario(id, definition) {
	SCENARIOS[id] = definition;
}

/**
 * Return the IDs of all currently registered scenarios.
 * @returns {string[]}
 */
function getScenarioIds() {
	return Object.keys(SCENARIOS);
}

module.exports = { startServer, SCENARIOS, ScenarioBuilder, registerScenario, getScenarioIds, getUserTurns, getModelTurnCount };
