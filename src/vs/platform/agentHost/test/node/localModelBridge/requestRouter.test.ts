/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	adaptLocalJsonResponse,
	adaptLocalRequestBody,
	buildFallbackChatRequest,
	buildInjectedAutoRequest,
	classifyLocalModelRequest,
	computeLocalModelLimits,
	createLocalModelRouterEnv,
	decideAutoInjection,
	describeAutoDecision,
	evaluateAutoResponse,
	hasImageParts,
	isAncillaryInteraction,
	isConnectFailure,
	isPromptProgressOnly,
	LocalChatCompletionAssembler,
	LocalSseResponseAdapter,
	mapReasoningEffort,
	readLocalPromptProgress,
	resolveLocalModelCapiBaseUrls,
	SseCommitScanner,
	toStreamingLocalRequestBody,
	type ILocalModelBufferedRequest,
	type LocalModelJsonBody,
} from '../../../node/copilot/localModelBridge/shim/requestRouter.js';
import { createServingSnapshot } from './fakeServingAccess.js';

const encoder = new TextEncoder();

function buffered(url: string, body?: LocalModelJsonBody | string, method = 'POST', headers: Record<string, string> = {}): ILocalModelBufferedRequest {
	return {
		url: new URL(url),
		method,
		headers: new Headers(headers),
		body: body === undefined ? undefined : encoder.encode(typeof body === 'string' ? body : JSON.stringify(body)),
		redirect: 'follow',
	};
}

function decode(bytes: Uint8Array | undefined): string {
	return bytes ? new TextDecoder().decode(bytes) : '';
}

function event(payload: unknown): string {
	return `data: ${JSON.stringify(payload)}\n\n`;
}

/** CAPI's answer with a local pick. */
const A2_RESPONSE: LocalModelJsonBody = {
	session_token: 'jwt-for-fallback',
	selected_model: {
		id: 'mai-code-1.1-flash-local', name: 'MAI Code 1.1 Flash (local)', vendor: 'Microsoft',
		capabilities: { type: 'chat', family: 'mai-code-1.1-flash' },
	},
	cloud_fallback_model: {
		id: 'cloud-model', supported_endpoints: ['/chat/completions', '/responses'],
		capabilities: { limits: { max_context_window_tokens: 200000, max_prompt_tokens: 168000, max_output_tokens: 64000 } },
	},
	expires_at: 1791400000,
};

suite('LocalModel requestRouter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const env = createLocalModelRouterEnv(['https://copilot-proxy.contoso.com/api/']);

	test('classifies every request class', () => {
		const local = { model: 'mai-code-1.1-flash-local', messages: [] };
		const cases: [string, ILocalModelBufferedRequest, 'http' | 'websocket'][] = [
			['capi /auto', buffered('https://api.githubcopilot.com/auto', { prompt: 'p', has_image: false }), 'http'],
			['enterprise /auto', buffered('https://api.enterprise.githubcopilot.com/auto', { prompt: 'p' }), 'http'],
			['resolved proxy base /auto', buffered('https://copilot-proxy.contoso.com/api/auto', { prompt: 'p' }), 'http'],
			['resolved proxy, wrong base path', buffered('https://copilot-proxy.contoso.com/auto', { prompt: 'p' }), 'http'],
			['/auto without prompt', buffered('https://api.githubcopilot.com/auto', { tier: 'balance' }), 'http'],
			['/auto over websocket', buffered('https://api.githubcopilot.com/auto', { prompt: 'p' }), 'websocket'],
			['/auto GET', buffered('https://api.githubcopilot.com/auto', undefined, 'GET'), 'http'],
			['/auto on another host', buffered('https://example.com/auto', { prompt: 'p' }), 'http'],
			['capi local chat', buffered('https://api.githubcopilot.com/chat/completions', local), 'http'],
			['capi cloud chat', buffered('https://api.githubcopilot.com/chat/completions', { model: 'gpt-5' }), 'http'],
			['capi unknown -local chat', buffered('https://api.githubcopilot.com/chat/completions', { model: 'other-local' }), 'http'],
			['capi -local on /responses', buffered('https://api.githubcopilot.com/responses', local), 'http'],
			['sentinel chat', buffered('http://on-device.vscode.invalid/v1/chat/completions', { model: 'mai-code-1.1-flash' }), 'http'],
			['sentinel models', buffered('http://on-device.vscode.invalid/v1/models', undefined, 'GET'), 'http'],
			['loopback BYOK bridge', buffered('http://127.0.0.1:4100/v1/chat/completions', { model: 'mai-code-1.1-flash-local' }), 'http'],
			['unrelated BYOK', buffered('https://api.openai.com/v1/chat/completions', { model: 'my-model-local' }), 'http'],
		];
		assert.deepStrictEqual(cases.map(([name, request, transport]) => {
			const result = classifyLocalModelRequest(request, { transport }, env);
			return `${name}: ${result.kind}${result.kind === 'rejected' ? `(${result.reason})` : ''}`;
		}), [
			'capi /auto: capiAuto',
			'enterprise /auto: capiAuto',
			'resolved proxy base /auto: capiAuto',
			'resolved proxy, wrong base path: passThrough',
			'/auto without prompt: passThrough',
			'/auto over websocket: passThrough',
			'/auto GET: passThrough',
			'/auto on another host: passThrough',
			'capi local chat: localAuto',
			'capi cloud chat: passThrough',
			'capi unknown -local chat: rejected(capiLocalModel)',
			'capi -local on /responses: rejected(capiLocalModel)',
			'sentinel chat: localDirect',
			'sentinel models: rejected(sentinelEndpoint)',
			'loopback BYOK bridge: passThrough',
			'unrelated BYOK: passThrough',
		]);
	});

	test('resolves CAPI base URLs for the signed-in accounts plus the default family', async () => {
		const service = {
			resolveApiEndpoint: async (token: string) => {
				if (token === 'broken') {
					throw new Error('offline');
				}
				return token === 'enterprise' ? 'https://api.acme.ghe.com/' : undefined;
			},
		};
		const resolved = await resolveLocalModelCapiBaseUrls(service, ['enterprise', 'broken', 'none'], 'http://on-device.vscode.invalid');
		assert.deepStrictEqual({ resolved, env: createLocalModelRouterEnv(resolved).capiBaseUrls }, {
			resolved: ['https://api.acme.ghe.com'],
			env: [
				'https://api.githubcopilot.com',
				'https://api.individual.githubcopilot.com',
				'https://api.business.githubcopilot.com',
				'https://api.enterprise.githubcopilot.com',
				'https://api.acme.ghe.com',
			],
		});
	});

	test('decides /auto injection, re-reading every gate', () => {
		const ready = createServingSnapshot();
		const gates = { enabled: true, accountGate: true, useInAuto: true };
		const base = { gates, serving: ready, endpointDown: false, knownAutoLocalIds: env.knownAutoLocalIds };
		const decide = (body: LocalModelJsonBody, state: Partial<typeof base> = {}) => {
			const decision = decideAutoInjection(body, { ...base, ...state });
			return decision.inject ? `inject ${decision.serving.identity.capiId}` : decision.reason;
		};
		assert.deepStrictEqual([
			decide({ prompt: 'p' }),
			decide({ prompt: 'p', local_models: [] }),
			decide({ prompt: 'p', has_image: true }),
			decide({ prompt: 'p' }, { gates: { ...gates, useInAuto: false } }),
			decide({ prompt: 'p' }, { gates: { ...gates, accountGate: false } }),
			decide({ prompt: 'p' }, { serving: undefined }),
			decide({ prompt: 'p' }, { serving: createServingSnapshot({ swapInProgress: true }) }),
			decide({ prompt: 'p' }, { serving: createServingSnapshot({ server: 'starting', endpoint: undefined, props: undefined }) }),
			decide({ prompt: 'p' }, { serving: createServingSnapshot({ autoEligible: false }) }),
			decide({ prompt: 'p' }, { serving: createServingSnapshot({ identity: { ...ready.identity, capiId: 'direct-only-local' } }) }),
			decide({ prompt: 'p' }, { endpointDown: true }),
		], [
			'inject mai-code-1.1-flash-local',
			'alreadyDeclared',
			'image',
			'disabled',
			'disabled',
			'noActiveModel',
			'swapInProgress',
			'notReady',
			'notAutoEligible',
			'notAutoCapable',
			'endpointDown',
		]);
	});

	test('injects local_models and drops content-length (A.1)', () => {
		const request = buffered('https://api.githubcopilot.com/auto', '{}', 'POST', { 'content-length': '2', 'authorization': 'Bearer capi', 'copilot-integration-id': 'vscode-chat' });
		const injected = buildInjectedAutoRequest(request, { prompt: '<router prompt>', has_image: false, tier: 'balance' }, 'mai-code-1.1-flash-local');
		assert.deepStrictEqual({ headers: Object.fromEntries(injected.headers.entries()), body: JSON.parse(decode(injected.body)) }, {
			headers: { 'authorization': 'Bearer capi', 'copilot-integration-id': 'vscode-chat' },
			body: { prompt: '<router prompt>', has_image: false, tier: 'balance', local_models: ['mai-code-1.1-flash-local'] },
		});
	});

	test('patches selected_model with the worked example of A.3', () => {
		const outcome = evaluateAutoResponse(A2_RESPONSE, createServingSnapshot());
		assert.deepStrictEqual(outcome.kind === 'patch' ? { selected: outcome.body.selected_model, token: outcome.sessionToken, fallback: outcome.fallback, limits: outcome.limits, expiresAtMs: outcome.expiresAtMs } : outcome, {
			selected: {
				id: 'mai-code-1.1-flash-local', name: 'Example Flash 1.0', vendor: 'Microsoft',
				supported_endpoints: ['/chat/completions'],
				capabilities: {
					type: 'chat', family: 'mai-code-1.1-flash',
					limits: { max_context_window_tokens: 200000, max_prompt_tokens: 148976, max_output_tokens: 50000 },
					supports: { tool_calls: true, streaming: true, parallel_tool_calls: false, vision: false },
				},
			},
			token: 'jwt-for-fallback',
			fallback: { id: 'cloud-model', maxContextWindowTokens: 200000, maxPromptTokens: 168000, maxOutputTokens: 64000, reasoningEfforts: undefined },
			limits: { maxContextWindowTokens: 200000, maxPromptTokens: 148976, maxOutputTokens: 50000 },
			expiresAtMs: 1791400000000,
		});
	});

	test('describes CAPI\'s /auto decision for the log with identifiers, counts and flags only, never prompts or tokens', () => {
		const request: LocalModelJsonBody = {
			prompt: 'secret prompt text',
			previous_user_messages: ['earlier secret', 'later secret'],
			tier: 'balance',
			hydra_rl_multi_turn: { state_token: 'state-token-secret', advance: true },
		};
		const cloudPick: LocalModelJsonBody = {
			session_token: 'session-token-secret',
			selected_model: { id: 'gpt-6-luna' },
			multi_turn_mode: 'hydra_rl',
			hydra_rl_multi_turn: { state_token: 'next-state-secret', decision: 'hold', skip_turns: 2 },
		};
		const headers = new Headers({ 'x-github-request-id': 'C0F2:3B5A:1E8F4D:2A3B4C:670A1B2C' });
		const described = {
			cloudHold: describeAutoDecision(request, cloudPick, headers),
			localPick: describeAutoDecision({ prompt: 'p', multi_turn: { turns_since_anchor: 1 } }, { ...A2_RESPONSE, multi_turn_mode: 'model_cards', multi_turn: { enabled: false } }, new Headers()),
			rejected: describeAutoDecision({ prompt: 'p', tier: 'not an identifier!' }, undefined, headers),
		};
		assert.deepStrictEqual({ described, leaks: /secret/.test(Object.values(described).join('\n')) }, {
			described: {
				cloudHold: 'selected=gpt-6-luna, cloudFallback=none, multiTurnMode=hydra_rl, decision=hold, skipTurns=2, tier=balance, requestMultiTurn=hydra_rl, stateToken=true, advance=true, previousUserMessages=2, requestId=C0F2:3B5A:1E8F4D:2A3B4C:670A1B2C',
				localPick: 'selected=mai-code-1.1-flash-local, cloudFallback=cloud-model, multiTurnMode=model_cards, multiTurnEnabled=false, tier=default, requestMultiTurn=model_cards, requestId=none',
				rejected: 'tier=other, requestMultiTurn=none, requestId=C0F2:3B5A:1E8F4D:2A3B4C:670A1B2C',
			},
			leaks: false,
		});
	});

	test('handles every /auto answer row', () => {
		const serving = createServingSnapshot();
		const evaluate = (response: LocalModelJsonBody) => {
			const outcome = evaluateAutoResponse(response, serving);
			return outcome.kind === 'reissue' ? `reissue:${outcome.reason}` : outcome.kind;
		};
		const { cloud_fallback_model: fallback, ...withoutFallback } = A2_RESPONSE;
		assert.deepStrictEqual([
			evaluate({ ...A2_RESPONSE, selected_model: { id: 'gpt-5' } }),
			evaluate({ ...A2_RESPONSE, selected_model: { id: 'example-coder-local' } }),
			evaluate(A2_RESPONSE),
			evaluate({ ...withoutFallback, fallback_model: fallback }),
			evaluate(withoutFallback),
			evaluate({ ...A2_RESPONSE, cloud_fallback_model: { id: 'cloud-model', supported_endpoints: ['/responses'] } }),
			evaluate({ ...A2_RESPONSE, cloud_fallback_model: { id: 'other-local', supported_endpoints: ['/chat/completions'] } }),
			evaluate({ ...A2_RESPONSE, session_token: undefined }),
			evaluate({ prompt: 'no selection' }),
		], [
			'notOurs',
			'reissue:otherLocalModel',
			'patch',
			'patch',
			'reissue:noFallback',
			'reissue:fallbackNotChat',
			'reissue:fallbackNotChat',
			'reissue:noSessionToken',
			'notOurs',
		]);
	});

	test('computes limits without a fallback and rejects unusable budgets', () => {
		const tags = { maxContextWindowTokens: 262144, maxPromptTokens: 180224, maxOutputTokens: 81920 };
		assert.deepStrictEqual([
			computeLocalModelLimits({ nCtx: 262144, totalSlots: 1 }, tags),
			computeLocalModelLimits({ nCtx: 262144, totalSlots: 4 }, tags),
			computeLocalModelLimits({ nCtx: 2048, totalSlots: 2 }, tags),
			computeLocalModelLimits({ nCtx: 0, totalSlots: 1 }, tags),
		], [
			{ maxContextWindowTokens: 262144, maxPromptTokens: 180224, maxOutputTokens: 65536 },
			{ maxContextWindowTokens: 65536, maxPromptTokens: 48128, maxOutputTokens: 16384 },
			undefined,
			undefined,
		]);
	});

	test('adapts Auto and direct request bodies for llama-server', () => {
		const body: LocalModelJsonBody = {
			model: 'mai-code-1.1-flash-local',
			stream: true,
			max_tokens: 90000,
			reasoning_effort: 'medium',
			copilot_thread_id: 't',
			prompt_cache_key: 'k',
			intent: true,
			n: 1,
			return_progress: false,
			tools: [{ type: 'function', function: { name: 'read' } }, { type: 'web_search' }],
			messages: [
				{ role: 'user', content: 'hi' },
				{ role: 'assistant', content: 'ok', reasoning_text: 'thought', reasoning_opaque: 'x', encrypted_content: 'y' },
			],
		};
		assert.deepStrictEqual({
			auto: adaptLocalRequestBody(body, { mode: 'auto', alias: 'mai-code-1.1-flash', maxOutputTokens: 50000 }),
			direct: adaptLocalRequestBody({ ...body, model: 'mai-code-1.1-flash', stream: false, tools: [{ type: 'web_search' }], tool_choice: 'auto' }, { mode: 'direct', alias: 'mai-code-1.1-flash' }),
		}, {
			auto: {
				model: 'mai-code-1.1-flash',
				stream: true,
				max_tokens: 50000,
				tools: [{ type: 'function', function: { name: 'read' } }],
				messages: [
					{ role: 'user', content: 'hi' },
					{ role: 'assistant', content: 'ok', reasoning_content: 'thought' },
				],
				stream_options: { include_usage: true },
				return_progress: true,
			},
			direct: {
				model: 'mai-code-1.1-flash',
				stream: false,
				max_tokens: 90000,
				messages: [
					{ role: 'user', content: 'hi' },
					{ role: 'assistant', content: 'ok', reasoning_text: 'thought', reasoning_opaque: 'x', encrypted_content: 'y' },
				],
			},
		});
	});

	test('passes the requested thinking level to the chat template as chat_template_kwargs, for Auto and direct', () => {
		const effort = { kind: 'effort', levels: ['low', 'medium', 'high'], defaultLevel: 'medium' } as const;
		const toggle = { kind: 'toggle' } as const;
		const adapt = (body: LocalModelJsonBody, thinking: typeof effort | typeof toggle | undefined, mode: 'auto' | 'direct' = 'direct') => {
			const result = adaptLocalRequestBody({ model: 'x', messages: [], ...body }, { mode, alias: 'alias', thinking });
			return { reasoningEffort: result.reasoning_effort, kwargs: result.chat_template_kwargs };
		};
		assert.deepStrictEqual({
			effortHigh: adapt({ reasoning_effort: 'high' }, effort),
			effortAuto: adapt({ reasoning_effort: 'low' }, effort, 'auto'),
			effortNearestBelow: adapt({ reasoning_effort: 'none' }, effort),
			effortNearestAbove: adapt({ reasoning_effort: 'max' }, effort),
			effortMergesExisting: adapt({ reasoning_effort: 'medium', chat_template_kwargs: { builtin_tools: ['python'], reasoning_effort: 'low' } }, effort),
			toggleOff: adapt({ reasoning_effort: 'none' }, toggle),
			toggleOn: adapt({ reasoning_effort: 'medium' }, toggle, 'auto'),
			noRequest: adapt({}, effort),
			unknownLevel: adapt({ reasoning_effort: 'turbo' }, toggle),
			noThinkingControl: adapt({ reasoning_effort: 'high', chat_template_kwargs: { a: 1 } }, undefined),
		}, {
			effortHigh: { reasoningEffort: undefined, kwargs: { reasoning_effort: 'high' } },
			effortAuto: { reasoningEffort: undefined, kwargs: { reasoning_effort: 'low' } },
			effortNearestBelow: { reasoningEffort: undefined, kwargs: { reasoning_effort: 'low' } },
			effortNearestAbove: { reasoningEffort: undefined, kwargs: { reasoning_effort: 'high' } },
			effortMergesExisting: { reasoningEffort: undefined, kwargs: { builtin_tools: ['python'], reasoning_effort: 'medium' } },
			toggleOff: { reasoningEffort: undefined, kwargs: { enable_thinking: false } },
			toggleOn: { reasoningEffort: undefined, kwargs: { enable_thinking: true } },
			noRequest: { reasoningEffort: undefined, kwargs: undefined },
			unknownLevel: { reasoningEffort: undefined, kwargs: undefined },
			noThinkingControl: { reasoningEffort: undefined, kwargs: { a: 1 } },
		});
	});

	test('a local pick of a model with a thinking control declares the fallback\'s reasoning efforts, so the runtime sends one', () => {
		const response = { ...A2_RESPONSE, cloud_fallback_model: { ...(A2_RESPONSE.cloud_fallback_model as LocalModelJsonBody), capabilities: { supports: { reasoning_effort: ['low', 'medium', 'high'] } } } };
		const supportsOf = (outcome: ReturnType<typeof evaluateAutoResponse>) => {
			const selected = outcome.kind === 'patch' ? outcome.body.selected_model as { capabilities: { supports: unknown } } : undefined;
			return selected?.capabilities.supports;
		};
		assert.deepStrictEqual({
			thinking: supportsOf(evaluateAutoResponse(response, createServingSnapshot({ thinking: { kind: 'toggle' } }))),
			noThinking: supportsOf(evaluateAutoResponse(response, createServingSnapshot())),
			fallbackWithoutEfforts: supportsOf(evaluateAutoResponse(A2_RESPONSE, createServingSnapshot({ thinking: { kind: 'toggle' } }))),
		}, {
			thinking: { tool_calls: true, streaming: true, parallel_tool_calls: false, vision: false, reasoning_effort: ['low', 'medium', 'high'] },
			noThinking: { tool_calls: true, streaming: true, parallel_tool_calls: false, vision: false },
			fallbackWithoutEfforts: { tool_calls: true, streaming: true, parallel_tool_calls: false, vision: false },
		});
	});

	test('builds the cloud fallback request from the original CAPI request', () => {
		const original = buffered('https://api.githubcopilot.com/chat/completions', '{}', 'POST', {
			'authorization': 'Bearer capi',
			'copilot-integration-id': 'vscode-chat',
			'x-github-api-version': '2025-05-01',
			'content-length': '2',
			'copilot-session-token': 'stale',
		});
		const fallback = { id: 'cloud-model', maxOutputTokens: 64000, reasoningEfforts: ['low', 'high'] };
		const request = buildFallbackChatRequest(original, { model: 'mai-code-1.1-flash-local', max_tokens: 100000, reasoning_effort: 'medium', stream: true }, fallback, 'jwt-for-fallback');
		const withoutEffort = buildFallbackChatRequest(original, { model: 'mai-code-1.1-flash-local', reasoning_effort: 'medium' }, { id: 'cloud-model' }, 'jwt-for-fallback');
		assert.deepStrictEqual({
			url: request.url.href,
			headers: Object.fromEntries(request.headers.entries()),
			body: JSON.parse(decode(request.body)),
			withoutEffort: JSON.parse(decode(withoutEffort.body)),
		}, {
			url: 'https://api.githubcopilot.com/chat/completions',
			headers: { 'authorization': 'Bearer capi', 'copilot-integration-id': 'vscode-chat', 'x-github-api-version': '2025-05-01', 'copilot-session-token': 'jwt-for-fallback' },
			body: { model: 'cloud-model', max_tokens: 64000, reasoning_effort: 'low', stream: true },
			withoutEffort: { model: 'cloud-model' },
		});
	});

	test('maps reasoning effort to the nearest allowed value', () => {
		assert.deepStrictEqual([
			mapReasoningEffort('medium', ['low', 'medium', 'high']),
			mapReasoningEffort('medium', ['low', 'high']),
			mapReasoningEffort('xhigh', ['low', 'high']),
			mapReasoningEffort('minimal', ['medium', 'high']),
			mapReasoningEffort('medium', undefined),
			mapReasoningEffort('turbo', ['low']),
		], ['medium', 'low', 'high', 'medium', undefined, undefined]);
	});

	test('adapts fragmented Auto SSE: split frames, tool-call deltas, usage-only chunks and [DONE]', () => {
		const stream = [
			'data: {"model":"mai-code-1.1-flash","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"Let me"}}]}\n\n',
			': keep-alive\n\n',
			'data: {"model":"mai-code-1.1-flash","choices":[{"index":0,"delta":{"content":"Héllo"}}]}\r\n\r\n',
			'data: {"model":"mai-code-1.1-flash","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read","arguments":"{\\"p\\":1}"}}]}}]}\n\n',
			'data: {"model":"mai-code-1.1-flash","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":7}}\n\n',
			'data: [DONE]\n\n',
		].join('');
		const bytes = encoder.encode(stream);
		// Split every 7 bytes, which cuts lines and the two-byte "é".
		const adapter = new LocalSseResponseAdapter('auto', 'mai-code-1.1-flash-local');
		let output = '';
		const decoder = new TextDecoder();
		for (let offset = 0; offset < bytes.length; offset += 7) {
			output += decoder.decode(adapter.push(bytes.slice(offset, offset + 7)), { stream: true });
		}
		output += decoder.decode(adapter.flush());

		assert.deepStrictEqual({ output, outputTokens: adapter.outputTokens }, {
			output: [
				'data: {"model":"mai-code-1.1-flash-local","choices":[{"index":0,"delta":{"role":"assistant","reasoning_text":"Let me"}}]}\n\n',
				': keep-alive\n\n',
				'data: {"model":"mai-code-1.1-flash-local","choices":[{"index":0,"delta":{"content":"Héllo"}}]}\r\n\r\n',
				'data: {"model":"mai-code-1.1-flash-local","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read","arguments":"{\\"p\\":1}"}}]}}]}\n\n',
				'data: {"model":"mai-code-1.1-flash-local","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":7}}\n\n',
				'data: [DONE]\n\n',
			].join(''),
			outputTokens: 7,
		});
	});

	test('direct SSE passes lines through unchanged and keeps reasoning_content', () => {
		const adapter = new LocalSseResponseAdapter('direct', 'mai-code-1.1-flash-local');
		const text = 'data: {"model":"mai-code-1.1-flash","choices":[{"delta":{"reasoning_content":"r"}}],"usage":{"completion_tokens":3}}\n\n';
		const output = decode(adapter.push(encoder.encode(text)));
		assert.deepStrictEqual({ output, flushed: adapter.flush().byteLength, outputTokens: adapter.outputTokens }, { output: text, flushed: 0, outputTokens: 3 });
	});

	test('reports prompt progress before the commit point and removes it from Auto, direct and assembled responses', () => {
		const progress = (processed: number, extra: LocalModelJsonBody = {}) => event({
			choices: [{ finish_reason: null, index: 0, delta: { role: 'assistant', content: null } }],
			created: 1, id: 'chatcmpl-x', model: 'mai-code-1.1-flash', object: 'chat.completion.chunk',
			prompt_progress: { total: 3000, cache: 1000, processed, time_ms: 71 },
			...extra,
		});
		const output = [
			event({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Hi' } }] }),
			event({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { completion_tokens: 1 } }),
			'data: [DONE]\n\n',
		];
		const sse = [progress(1000), ': ping\n\n', progress(2024), progress(3000).replaceAll('\n', '\r\n'), ...output].join('');
		const bytes = encoder.encode(sse);
		const pieces = (size: number) => Array.from({ length: Math.ceil(bytes.length / size) }, (_, index) => bytes.slice(index * size, (index + 1) * size));

		const reported: string[] = [];
		const scanner = new SseCommitScanner(value => reported.push(`${value.processed}/${value.total} (${value.cache} cached)`));
		const states = [progress(1000) + ': ping\n\n' + progress(2024).slice(0, 20), progress(2024).slice(20) + progress(3000), output[0]].map(chunk => scanner.push(encoder.encode(chunk)));

		const adapt = (mode: 'auto' | 'direct') => {
			const adapter = new LocalSseResponseAdapter(mode, 'mai-code-1.1-flash-local');
			const decoder = new TextDecoder();
			let text = '';
			for (const piece of pieces(7)) {
				text += decoder.decode(adapter.push(piece), { stream: true });
			}
			text += decoder.decode(adapter.flush());
			return { text, terminated: adapter.terminated, outputTokens: adapter.outputTokens };
		};
		const withOutput = new LocalSseResponseAdapter('direct', 'mai-code-1.1-flash-local');
		const assembler = new LocalChatCompletionAssembler('auto', 'mai-code-1.1-flash-local');
		pieces(5).forEach(piece => assembler.push(piece));

		assert.deepStrictEqual({
			states,
			reported,
			auto: adapt('auto'),
			direct: adapt('direct'),
			progressWithOutput: decode(withOutput.push(encoder.encode(progress(3000, { choices: [{ index: 0, delta: { content: 'x' } }] })))),
			assembled: { completion: assembler.finish(), terminated: assembler.terminated },
			invalidProgress: readLocalPromptProgress({ prompt_progress: { total: 3000, cache: -1, processed: 1 } }),
			progressOnly: [isPromptProgressOnly(JSON.parse(progress(1).slice(6))), isPromptProgressOnly({ prompt_progress: {}, usage: { completion_tokens: 1 } })],
		}, {
			states: ['pending', 'pending', 'committed'],
			reported: ['1000/3000 (1000 cached)', '2024/3000 (1000 cached)', '3000/3000 (1000 cached)'],
			auto: {
				text: [
					': ping\n\n',
					'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"Hi"}}],"model":"mai-code-1.1-flash-local"}\n\n',
					'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"completion_tokens":1},"model":"mai-code-1.1-flash-local"}\n\n',
					'data: [DONE]\n\n',
				].join(''),
				terminated: true,
				outputTokens: 1,
			},
			direct: { text: [': ping\n\n', ...output].join(''), terminated: true, outputTokens: 1 },
			progressWithOutput: 'data: {"choices":[{"index":0,"delta":{"content":"x"}}],"created":1,"id":"chatcmpl-x","model":"mai-code-1.1-flash","object":"chat.completion.chunk"}\n\n',
			assembled: {
				completion: { id: 'chatcmpl-local', object: 'chat.completion', created: 0, model: 'mai-code-1.1-flash-local', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Hi' } }], usage: { completion_tokens: 1 } },
				terminated: true,
			},
			invalidProgress: undefined,
			progressOnly: [true, false],
		});
	});

	test('adapts non-streaming JSON responses', () => {
		const payload = { model: 'mai-code-1.1-flash', choices: [{ message: { role: 'assistant', content: 'hi', reasoning_content: 'r' } }], usage: { completion_tokens: 4 } };
		assert.deepStrictEqual({ auto: adaptLocalJsonResponse(payload, 'auto', 'mai-code-1.1-flash-local'), direct: adaptLocalJsonResponse(payload, 'direct', 'mai-code-1.1-flash-local') }, {
			auto: { body: { model: 'mai-code-1.1-flash-local', choices: [{ message: { role: 'assistant', content: 'hi', reasoning_text: 'r' } }], usage: { completion_tokens: 4 } }, outputTokens: 4 },
			direct: { body: payload, outputTokens: 4 },
		});
	});

	test('finds the SSE commit point', () => {
		const scan = (...chunks: string[]) => {
			const scanner = new SseCommitScanner();
			const states = chunks.map(chunk => scanner.push(encoder.encode(chunk)));
			return [...states, `end:${scanner.end()}`].join(' ');
		};
		assert.deepStrictEqual([
			scan(': comment\n\n', 'data:', ' {"choices":[]', '}\n'),
			scan('data: \n\n', 'data: [DONE]\n\n'),
			scan('data: {"error":{"message":"boom"}}\n\n'),
			scan('error: {"message":"boom"}\n\n'),
			scan('data: not json\n'),
			scan(''),
			scan('data: {"choices":[]}'),
		], [
			'pending pending pending committed end:empty',
			'pending empty end:empty',
			'error end:empty',
			'error end:empty',
			'error end:empty',
			'pending end:empty',
			'pending end:committed',
		]);
	});

	test('assembles a chat.completion from fragmented SSE, merging tool calls by index', () => {
		const sse = [
			'data: {"id":"c1","created":7,"model":"mai-code-1.1-flash","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"Thi"}}]}\n\n',
			'data: {"choices":[{"index":0,"delta":{"reasoning_content":"nk","content":"Héllo"}}]}\r\n\r\n',
			'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"id":"call_b","type":"function","function":{"name":"list","arguments":"{\\"d\\""}}]}}]}\n\n',
			'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"read","arguments":""}}]}}]}\n\n',
			'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}},{"index":1,"function":{"arguments":":1}"}}]}}]}\n\n',
			'data: {"choices":[{"index":0,"delta":{},"finish_reason":"length"}]}\n\n',
			'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
			'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":9}}\n\n',
			'data: [DONE]',
		].join('');
		const assemble = (mode: 'auto' | 'direct') => {
			const assembler = new LocalChatCompletionAssembler(mode, 'mai-code-1.1-flash-local');
			const bytes = encoder.encode(sse);
			for (let offset = 0; offset < bytes.length; offset += 5) {
				assembler.push(bytes.slice(offset, offset + 5));
			}
			return { completion: assembler.finish(), done: assembler.done, failed: assembler.failed, outputTokens: assembler.outputTokens };
		};
		const failing = new LocalChatCompletionAssembler('auto', 'mai-code-1.1-flash-local');
		failing.push(encoder.encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\nerror: {"message":"oom"}\n\n'));
		const toolCalls = [
			{ id: 'call_a', type: 'function', function: { name: 'read', arguments: '{}' } },
			{ id: 'call_b', type: 'function', function: { name: 'list', arguments: '{"d":1}' } },
		];
		assert.deepStrictEqual({ auto: assemble('auto'), direct: assemble('direct').completion, failed: failing.failed, streamingBody: toStreamingLocalRequestBody({ model: 'm', stream_options: { foo: 1 } }) }, {
			auto: {
				completion: {
					id: 'c1', object: 'chat.completion', created: 7, model: 'mai-code-1.1-flash-local',
					choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: 'Héllo', reasoning_text: 'Think', tool_calls: toolCalls } }],
					usage: { prompt_tokens: 3, completion_tokens: 9 },
				},
				done: true,
				failed: false,
				outputTokens: 9,
			},
			direct: {
				id: 'c1', object: 'chat.completion', created: 7, model: 'mai-code-1.1-flash',
				choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: 'Héllo', reasoning_content: 'Think', tool_calls: toolCalls } }],
				usage: { prompt_tokens: 3, completion_tokens: 9 },
			},
			failed: true,
			streamingBody: { model: 'm', stream: true, stream_options: { foo: 1, include_usage: true } },
		});
	});

	test('detects whether a local stream terminated properly, without inventing finish reasons', () => {
		const streams: [string, string][] = [
			['finish_reason then EOF', event({ choices: [{ index: 0, delta: { content: 'a' }, finish_reason: 'stop' }] })],
			['finish_reason, usage and [DONE]', event({ choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }) + event({ choices: [], usage: { completion_tokens: 1 } }) + 'data: [DONE]\n\n'],
			['content delta then EOF', event({ choices: [{ index: 0, delta: { content: 'a' } }] })],
			['tool-call delta then EOF', event({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'n', arguments: '{' } }] } }] })],
			['[DONE] without a finish_reason', event({ choices: [{ index: 0, delta: { content: 'a' } }] }) + 'data: [DONE]\n\n'],
			['usage only', event({ choices: [], usage: { completion_tokens: 1 } })],
			['one of two choices finished, then EOF', event({ choices: [{ index: 0, delta: { content: 'a' }, finish_reason: 'stop' }, { index: 1, delta: { content: 'b' } }] })],
			['one of two choices finished, then [DONE]', event({ choices: [{ index: 0, delta: { content: 'a' }, finish_reason: 'stop' }, { index: 1, delta: { content: 'b' } }] }) + 'data: [DONE]'],
		];
		assert.deepStrictEqual(streams.map(([name, sse]) => {
			const adapter = new LocalSseResponseAdapter('auto', 'mai-code-1.1-flash-local');
			const assembler = new LocalChatCompletionAssembler('auto', 'mai-code-1.1-flash-local');
			adapter.push(encoder.encode(sse));
			adapter.flush();
			assembler.push(encoder.encode(sse));
			const completion = assembler.finish();
			const finishReasons = Array.isArray(completion.choices) ? completion.choices.map(choice => (choice as LocalModelJsonBody).finish_reason) : [];
			return `${name}: adapter=${adapter.terminated} assembler=${assembler.terminated} finish=${JSON.stringify(finishReasons)}`;
		}), [
			'finish_reason then EOF: adapter=true assembler=true finish=["stop"]',
			'finish_reason, usage and [DONE]: adapter=true assembler=true finish=["length"]',
			'content delta then EOF: adapter=false assembler=false finish=[null]',
			'tool-call delta then EOF: adapter=false assembler=false finish=[null]',
			'[DONE] without a finish_reason: adapter=false assembler=false finish=[null]',
			'usage only: adapter=false assembler=false finish=[]',
			'one of two choices finished, then EOF: adapter=false assembler=false finish=["stop",null]',
			'one of two choices finished, then [DONE]: adapter=true assembler=true finish=["stop",null]',
		]);
	});

	test('recognizes ancillary interactions, images and connect failures', () => {
		const refused = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) });
		const connectTimeout = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
		assert.deepStrictEqual({
			ancillary: [undefined, '', 'conversation-agent', 'conversation-user', 'conversation-subagent', 'conversation-compaction', 'conversation-sampling', 'conversation-background'].map(isAncillaryInteraction),
			images: [
				hasImageParts({ messages: [{ role: 'user', content: 'text' }] }),
				hasImageParts({ messages: [{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'image_url', image_url: { url: 'data:' } }] }] }),
			],
			connect: [isConnectFailure(refused), isConnectFailure(connectTimeout), isConnectFailure(new Error('reset')), isConnectFailure(undefined)],
		}, {
			ancillary: [false, false, false, false, false, true, true, true],
			images: [false, true],
			connect: [true, true, false, false],
		});
	});
});
