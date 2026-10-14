/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotRequestContext } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { DOWN_MARK_MS, FIRST_OUTPUT_TIMEOUT_MS, QUEUE_TIMEOUT_MS, SENTINEL_ORIGIN } from '../../../node/copilot/localModelBridge/shim/constants.js';
import { isLoopbackUrl, LocalModelCopilotRequestHandler, type ILocalModelRouteTelemetryEvent, type LocalModelFetch } from '../../../node/copilot/localModelBridge/shim/copilotRequestHandler.js';
import { createLocalModelRouterEnv, type LocalModelJsonBody } from '../../../node/copilot/localModelBridge/shim/requestRouter.js';
import { RouteTable } from '../../../node/copilot/localModelBridge/shim/routeTable.js';
import { TurnLedger } from '../../../node/copilot/localModelBridge/shim/turnLedger.js';
import { createServingSnapshot, FakeClock, FakeServingAccess, MAI_IDENTITY, EXAMPLE_IDENTITY } from './fakeServingAccess.js';

const encoder = new TextEncoder();
const CAPI = 'https://api.githubcopilot.com';
const CHAT_URL = `${CAPI}/chat/completions`;
const AUTO_URL = `${CAPI}/auto`;
const DIRECT_URL = `${SENTINEL_ORIGIN}/v1/chat/completions`;
const TOKEN = 'jwt-for-fallback';
const MAI_LOCAL = 'mai-code-1.1-flash-local';

function context(url: string, options: { readonly signal?: AbortSignal; readonly sessionId?: string; readonly interactionType?: string } = {}): CopilotRequestContext {
	return { requestId: 'request-1', sessionId: options.sessionId ?? 'session-1', interactionType: options.interactionType ?? 'conversation-agent', transport: 'http', url, headers: {}, signal: options.signal ?? new AbortController().signal };
}

/** Yields to pending promise and stream callbacks. */
async function flush(): Promise<void> {
	for (let i = 0; i < 5; i++) {
		await new Promise<void>(resolve => setTimeout(resolve, 0));
	}
}

function tryParse(text: string | undefined): LocalModelJsonBody | undefined {
	try {
		const value: unknown = text ? JSON.parse(text) : undefined;
		return value && typeof value === 'object' && !Array.isArray(value) ? value as LocalModelJsonBody : undefined;
	} catch {
		return undefined;
	}
}

/** A local response body the test drives; aborting the fetch signal errors it, like a real fetch. */
class LocalStream {
	readonly stream: ReadableStream<Uint8Array>;
	state: 'open' | 'closed' | 'cancelled' | 'errored' = 'open';
	private _controller!: ReadableStreamDefaultController<Uint8Array>;

	constructor(signal: AbortSignal) {
		this.stream = new ReadableStream<Uint8Array>({
			start: controller => { this._controller = controller; },
			cancel: () => { this.state = 'cancelled'; },
		});
		signal.addEventListener('abort', () => this.error(signal.reason));
	}

	push(text: string): void {
		this._controller.enqueue(encoder.encode(text));
	}

	close(): void {
		this._controller.close();
		this.state = 'closed';
	}

	error(error: unknown): void {
		if (this.state === 'open') {
			this.state = 'errored';
			this._controller.error(error);
		}
	}
}

interface IRecordedFetch {
	readonly via: 'proxy' | 'loopback';
	readonly path: string;
	readonly headers: Record<string, string>;
	readonly body: LocalModelJsonBody | undefined;
}

const A2_RESPONSE = {
	session_token: TOKEN,
	selected_model: { id: MAI_LOCAL, name: 'MAI Code 1.1 Flash (local)', vendor: 'Microsoft', capabilities: { type: 'chat', family: 'mai-code-1.1-flash' } },
	cloud_fallback_model: {
		id: 'cloud-model', supported_endpoints: ['/chat/completions'],
		capabilities: { limits: { max_context_window_tokens: 200000, max_prompt_tokens: 168000, max_output_tokens: 64000 } },
	},
	expires_at: 1791400000,
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function event(payload: unknown): string {
	return `data: ${JSON.stringify(payload)}\n\n`;
}

/** A `llama-server` prompt progress chunk (`return_progress`): an empty assistant delta with `prompt_progress`. */
function progressEvent(processed: number, total = 12000, cache = 0): string {
	return event({ choices: [{ finish_reason: null, index: 0, delta: { role: 'assistant', content: null } }], created: 1, id: 'chatcmpl-local', model: 'mai-code-1.1-flash', object: 'chat.completion.chunk', prompt_progress: { total, cache, processed, time_ms: 71 } });
}

function autoRequest(body: LocalModelJsonBody = { prompt: '<router prompt>', has_image: false, tier: 'balance' }): Request {
	return new Request(AUTO_URL, { method: 'POST', headers: { 'authorization': 'Bearer capi', 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

function chatRequest(body: LocalModelJsonBody = {}, headers: Record<string, string> = { 'copilot-session-token': TOKEN }): Request {
	return new Request(CHAT_URL, {
		method: 'POST',
		headers: { 'authorization': 'Bearer capi', 'copilot-integration-id': 'vscode-chat', 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ model: MAI_LOCAL, stream: true, max_tokens: 100000, messages: [{ role: 'user', content: 'hi' }], ...body }),
	});
}

function directRequest(body: LocalModelJsonBody = {}): Request {
	return new Request(DIRECT_URL, {
		method: 'POST',
		headers: { 'authorization': 'Bearer byok-placeholder', 'x-github-api-version': '2025-05-01', 'content-type': 'application/json' },
		body: JSON.stringify({ model: 'mai-code-1.1-flash', stream: true, messages: [{ role: 'user', content: 'hi' }], ...body }),
	});
}

suite('LocalModelCopilotRequestHandler', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('pass-through', () => {

		function createHandler() {
			const recorded: { via: string; url: string; method: string; headers: Record<string, string>; body: string | undefined; signal: boolean }[] = [];
			const record = (via: string): LocalModelFetch => async (input, init) => {
				recorded.push({ via, url: input.url, method: input.method, headers: Object.fromEntries(input.headers.entries()), body: input.body ? await input.text() : undefined, signal: !!init?.signal });
				return new Response(`answer from ${via}`, { status: 201, headers: { 'x-upstream': via } });
			};
			const clock = new FakeClock();
			const handler = new LocalModelCopilotRequestHandler({ proxyFetch: record('proxy'), loopbackFetch: record('loopback') }, new NullLogService(), {
				serving: new FakeServingAccess(clock),
				routeTable: new RouteTable(clock),
				ledger: new TurnLedger(),
				getRouterEnv: () => createLocalModelRouterEnv([]),
				telemetry: { reportRoute: () => { } },
				clock,
			});
			return { handler, recorded };
		}

		test('forwards other CAPI traffic byte-for-byte through the proxy-aware fetch', async () => {
			const { handler, recorded } = createHandler();
			const body = JSON.stringify({ model: 'gpt-5', stream: true, messages: [{ role: 'user', content: 'hello' }] });
			const response = await handler.handleRequest(new Request(CHAT_URL, {
				method: 'POST',
				headers: { 'authorization': '******', 'content-type': 'application/json', 'copilot-integration-id': 'vscode-chat' },
				body,
			}), context(CHAT_URL));

			assert.deepStrictEqual({ recorded, status: response.status, upstream: response.headers.get('x-upstream'), text: await response.text() }, {
				recorded: [{
					via: 'proxy',
					url: CHAT_URL,
					method: 'POST',
					headers: { 'authorization': '******', 'content-type': 'application/json', 'copilot-integration-id': 'vscode-chat' },
					body,
					signal: true,
				}],
				status: 201,
				upstream: 'proxy',
				text: 'answer from proxy',
			});
		});

		test('sends loopback traffic directly, keeping the BYOK bridge bearer', async () => {
			const { handler, recorded } = createHandler();
			for (const url of ['http://127.0.0.1:4100/v1/openai/responses', 'http://localhost:4100/v1/models', 'http://[::1]:4100/v1/models']) {
				await handler.handleRequest(new Request(url, { method: 'GET', headers: { authorization: '******' } }), context(url));
			}

			assert.deepStrictEqual(recorded.map(({ via, url, headers, body }) => ({ via, url, authorization: headers.authorization, body })), [
				{ via: 'loopback', url: 'http://127.0.0.1:4100/v1/openai/responses', authorization: '******', body: undefined },
				{ via: 'loopback', url: 'http://localhost:4100/v1/models', authorization: '******', body: undefined },
				{ via: 'loopback', url: 'http://[::1]:4100/v1/models', authorization: '******', body: undefined },
			]);
		});
	});

	suite('routing', () => {

		/** Invariant violations seen by the fake fetches; checked after every test. */
		let violations: string[] = [];

		setup(() => {
			violations = [];
		});

		teardown(() => {
			assert.deepStrictEqual(violations, []);
		});

		function createHarness() {
			const clock = new FakeClock();
			const serving = new FakeServingAccess(clock);
			const routeTable = new RouteTable(clock);
			const ledger = new TurnLedger();
			const telemetry: ILocalModelRouteTelemetryEvent[] = [];
			const fetches: IRecordedFetch[] = [];
			const locals: LocalStream[] = [];
			const waits: string[] = [];

			const proxyFetch: LocalModelFetch = async input => {
				const url = new URL(input.url);
				const text = input.body ? await input.text() : undefined;
				const body = tryParse(text);
				// No -local id and never the sentinel host outside the loopback server.
				if (url.origin === SENTINEL_ORIGIN || isLoopbackUrl(url) || (typeof body?.model === 'string' && body.model.endsWith('-local'))) {
					violations.push(`proxy: ${url.href} model=${body?.model}`);
				}
				fetches.push({ via: 'proxy', path: url.pathname, headers: Object.fromEntries(input.headers.entries()), body });
				return harness.onProxy(url.pathname, body);
			};
			const loopbackFetch: LocalModelFetch = async (input, init) => {
				const url = new URL(input.url);
				const body = tryParse(input.body ? await input.text() : undefined);
				const headers = Object.fromEntries(input.headers.entries());
				// Only content-type, accept and the server's own api key; never a -local id.
				if (!isLoopbackUrl(url) || Object.keys(headers).sort().join(',') !== 'accept,authorization,content-type' || headers.authorization !== 'Bearer local-api-key' || (typeof body?.model === 'string' && body.model.endsWith('-local'))) {
					violations.push(`loopback: ${url.href} headers=${Object.keys(headers).join(',')} model=${body?.model}`);
				}
				fetches.push({ via: 'loopback', path: url.pathname, headers, body });
				const signal = init?.signal ?? new AbortController().signal;
				signal.throwIfAborted();
				return harness.onLoopback(signal);
			};

			const harness = {
				clock, serving, routeTable, ledger, telemetry, fetches, locals, waits,
				onProxy: (path: string, body: LocalModelJsonBody | undefined): Response | Promise<Response> => {
					if (path === '/auto') {
						return json(body?.local_models ? A2_RESPONSE : { session_token: 'cloud-token', selected_model: { id: 'gpt-5' } });
					}
					return new Response(`cloud answer from ${body?.model}`, { status: 200, headers: { 'content-type': 'text/plain' } });
				},
				/** Default local server: an SSE stream the test drives through `locals`. */
				onLoopback: (signal: AbortSignal): Response | Promise<Response> => {
					const local = new LocalStream(signal);
					locals.push(local);
					return new Response(local.stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
				},
				handler: new LocalModelCopilotRequestHandler({ proxyFetch, loopbackFetch }, new NullLogService(), {
					serving,
					routeTable,
					ledger,
					getRouterEnv: () => createLocalModelRouterEnv([]),
					telemetry: { reportRoute: e => telemetry.push(e) },
					clock,
					onDirectRequestWaiting: e => waits.push(`${e.sessionId}:${e.kind}${e.position ? `:${e.position}` : ''}${e.percent !== undefined ? `:${e.percent}%` : ''}`),
				}),
			};
			return harness;
		}

		type Harness = ReturnType<typeof createHarness>;

		/** Runs `/auto` through the handler so the route table holds {@link TOKEN}. */
		async function declare(h: Harness): Promise<void> {
			await (await h.handler.handleRequest(autoRequest(), context(AUTO_URL))).text();
			h.fetches.length = 0;
			h.telemetry.length = 0;
		}

		function proxiedChats(h: Harness) {
			return h.fetches.filter(f => f.via === 'proxy' && f.path === '/chat/completions').map(f => f.body?.model);
		}

		function loopbackCalls(h: Harness): number {
			return h.fetches.filter(f => f.via === 'loopback').length;
		}

		test('declares the active model to /auto and patches the local pick (A.1-A.3)', async () => {
			const h = createHarness();
			const response = await h.handler.handleRequest(autoRequest(), context(AUTO_URL));
			const body = await response.json() as LocalModelJsonBody;
			assert.deepStrictEqual({
				sent: h.fetches.map(f => ({ via: f.via, path: f.path, body: f.body, authorization: f.headers.authorization })),
				selected: body.selected_model,
				token: body.session_token,
				routes: h.routeTable.size,
				telemetry: h.telemetry,
			}, {
				sent: [{ via: 'proxy', path: '/auto', body: { prompt: '<router prompt>', has_image: false, tier: 'balance', local_models: [MAI_LOCAL] }, authorization: 'Bearer capi' }],
				selected: {
					id: MAI_LOCAL, name: 'Example Flash 1.0', vendor: 'Microsoft',
					supported_endpoints: ['/chat/completions'],
					capabilities: {
						type: 'chat', family: 'mai-code-1.1-flash',
						limits: { max_context_window_tokens: 200000, max_prompt_tokens: 148976, max_output_tokens: 50000 },
						supports: { tool_calls: true, streaming: true, parallel_tool_calls: false, vision: false },
					},
				},
				token: TOKEN,
				routes: 1,
				telemetry: [],
			});
		});

		test('fails open for /auto: a failed or rejected declaration sends the original request', async () => {
			const h = createHarness();
			let attempt = 0;
			h.onProxy = (_path, body) => {
				attempt++;
				if (body?.local_models) {
					if (attempt === 1) {
						throw new TypeError('fetch failed');
					}
					return json({ error: 'unknown field local_models' }, 400);
				}
				return json({ selected_model: { id: 'gpt-5' }, attempt });
			};
			const afterThrow = await (await h.handler.handleRequest(autoRequest(), context(AUTO_URL))).json();
			const afterReject = await (await h.handler.handleRequest(autoRequest(), context(AUTO_URL))).json();
			assert.deepStrictEqual({
				afterThrow,
				afterReject,
				declared: h.fetches.map(f => !!f.body?.local_models),
				routes: h.routeTable.size,
			}, {
				afterThrow: { selected_model: { id: 'gpt-5' }, attempt: 2 },
				afterReject: { selected_model: { id: 'gpt-5' }, attempt: 4 },
				declared: [true, false, true, false],
				routes: 0,
			});
		});

		test('re-issues /auto cloud-only when the local pick has no usable fallback', async () => {
			const h = createHarness();
			h.onProxy = (_path, body) => body?.local_models
				? json({ ...A2_RESPONSE, cloud_fallback_model: { id: 'responses-only', supported_endpoints: ['/responses'] } })
				: json({ session_token: 'cloud-token', selected_model: { id: 'gpt-5' } });
			const answer = await (await h.handler.handleRequest(autoRequest(), context(AUTO_URL))).json();
			assert.deepStrictEqual({ answer, declared: h.fetches.map(f => !!f.body?.local_models), routes: h.routeTable.size, telemetry: h.telemetry.map(e => `${e.selection}:${e.reason}:${e.tier}`) }, {
				answer: { session_token: 'cloud-token', selected_model: { id: 'gpt-5' } },
				declared: [true, false],
				routes: 0,
				telemetry: ['cloudOnlyReissue:fallbackNotChat:balance'],
			});
		});

		test('a delayed /auto answer that arrives after an account change records no route', async () => {
			const h = createHarness();
			const cloudOnly = h.onProxy;
			let deliver!: () => void;
			const delayed = new Promise<void>(resolve => deliver = resolve);
			h.onProxy = async (path, body) => {
				if (body?.local_models) {
					await delayed;
					return json(A2_RESPONSE);
				}
				return cloudOnly(path, body);
			};
			const pending = h.handler.handleRequest(autoRequest(), context(AUTO_URL));
			await flush();
			h.serving.accountGeneration++;
			deliver();
			const answer = await (await pending).json();
			assert.deepStrictEqual({
				answer,
				declared: h.fetches.map(f => !!f.body?.local_models),
				routes: h.routeTable.size,
				oldTokenUnderNewAccount: h.routeTable.acquire(TOKEN, h.serving.accountGeneration),
				telemetry: h.telemetry.map(e => `${e.selection}:${e.reason}`),
			}, {
				answer: { session_token: 'cloud-token', selected_model: { id: 'gpt-5' } },
				declared: [true, false],
				routes: 0,
				oldTokenUnderNewAccount: undefined,
				telemetry: ['cloudOnlyReissue:accountChanged'],
			});
		});

		test('serves a routed Auto request from fragmented SSE and holds the slot until EOF', async () => {
			const h = createHarness();
			await declare(h);
			const generation = h.ledger.beginTurn('session-1');
			let settled = false;
			const pending = h.handler.handleRequest(chatRequest({ reasoning_effort: 'medium', copilot_thread_id: 'x' }), context(CHAT_URL)).finally(() => settled = true);
			await flush();
			const local = h.locals[0];
			local.push('data: {"model":"mai-code-1.1-flash","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"thi');
			await flush();
			const settledBeforeFirstEvent = settled;
			local.push('nk"}}]}\n\n');
			const response = await pending;
			const slotsAfterCommit = h.serving.slotsInUse;
			local.push('data: {"model":"mai-code-1.1-flash","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":"stop"}]}\n\n');
			local.push('data: {"model":"mai-code-1.1-flash","choices":[],"usage":{"completion_tokens":2}}\n\ndata: [DONE]\n\n');
			local.close();
			const text = await response.text();

			assert.deepStrictEqual({
				settledBeforeFirstEvent,
				slotsAfterCommit,
				text,
				released: { slots: h.serving.slotsInUse, leases: h.serving.leasesHeld },
				loopback: h.fetches.map(f => ({ via: f.via, path: f.path, body: f.body })),
				turn: h.ledger.endTurn('session-1', generation),
				telemetry: h.telemetry.map(e => ({ selection: e.selection, reason: e.reason, outputTokens: e.outputTokens, firstOutputMs: e.firstOutputMs, direct: e.direct })),
			}, {
				settledBeforeFirstEvent: false,
				slotsAfterCommit: 1,
				text: [
					'data: {"model":"mai-code-1.1-flash-local","choices":[{"index":0,"delta":{"role":"assistant","reasoning_text":"think"}}]}\n\n',
					'data: {"model":"mai-code-1.1-flash-local","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":"stop"}]}\n\n',
					'data: {"model":"mai-code-1.1-flash-local","choices":[],"usage":{"completion_tokens":2}}\n\ndata: [DONE]\n\n',
				].join(''),
				released: { slots: 0, leases: 0 },
				loopback: [{
					via: 'loopback',
					path: '/v1/chat/completions',
					body: { model: 'mai-code-1.1-flash', stream: true, max_tokens: 50000, messages: [{ role: 'user', content: 'hi' }], stream_options: { include_usage: true }, return_progress: true },
				}],
				turn: { execution: 'local', familyId: MAI_IDENTITY.familyId },
				telemetry: [{ selection: 'local', reason: '', outputTokens: 2, firstOutputMs: 0, direct: false }],
			});
		});

		test('a non-streaming request is still served when llama-server answers with JSON anyway', async () => {
			const h = createHarness();
			await declare(h);
			h.onLoopback = () => json({ model: 'mai-code-1.1-flash', choices: [{ message: { role: 'assistant', content: 'hi', reasoning_content: 'r' } }], usage: { completion_tokens: 3 } });
			const response = await h.handler.handleRequest(chatRequest({ stream: false }), context(CHAT_URL));
			assert.deepStrictEqual({ body: await response.json(), askedToStream: h.fetches[0].body?.stream, slots: h.serving.slotsInUse, leases: h.serving.leasesHeld }, {
				body: { model: MAI_LOCAL, choices: [{ message: { role: 'assistant', content: 'hi', reasoning_text: 'r' } }], usage: { completion_tokens: 3 } },
				askedToStream: true,
				slots: 0,
				leases: 0,
			});
		});

		suite('non-streaming requests (assembled from a local stream)', () => {

			// `/auto` carries no sessionId or interactionType; the `-local` chat request is non-streaming.
			const withoutIds = (url: string, sessionId?: string): CopilotRequestContext => ({ ...context(url), sessionId, interactionType: undefined });
			const nonStreaming = (signal?: AbortSignal) => ({
				request: chatRequest({ stream: undefined }, { 'copilot-session-token': TOKEN, 'accept': 'application/json' }),
				ctx: { ...withoutIds(CHAT_URL, 'session-1'), signal: signal ?? new AbortController().signal },
			});

			async function declareWithoutIds(h: Harness): Promise<void> {
				await (await h.handler.handleRequest(autoRequest(), withoutIds(AUTO_URL))).text();
				h.fetches.length = 0;
				h.telemetry.length = 0;
			}

			const FIRST_EVENT = 'data: {"id":"chatcmpl-7","object":"chat.completion.chunk","created":1791400000,"model":"mai-code-1.1-flash","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"Look"}}]}\n\n';

			test('assembles one chat.completion for the runtime\'s non-streaming request and keeps a generation longer than the first-output timeout', async () => {
				const h = createHarness();
				await declareWithoutIds(h);
				const routes = h.routeTable.size;
				const generation = h.ledger.beginTurn('session-1');
				let settled = false;
				const { request, ctx } = nonStreaming();
				const pending = h.handler.handleRequest(request, ctx).finally(() => settled = true);
				await flush();
				const local = h.locals[0];
				local.push(FIRST_EVENT);
				await flush();
				h.clock.advance(FIRST_OUTPUT_TIMEOUT_MS * 3);
				await flush();
				const midway = { settled, slots: h.serving.slotsInUse, timers: h.clock.activeTimers, local: local.state };

				local.push('data: {"id":"chatcmpl-7","choices":[{"index":0,"delta":{"reasoning_content":"ing."}}]}\n\ndata: {"id":"chatcmpl-7","choices":[{"index":0,"delta":{"content":"Rea');
				local.push('ding."}}]}\n\n');
				local.push(event({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'read', arguments: '{"pa' } }] } }] }));
				local.push(event({ choices: [{ index: 0, delta: { tool_calls: [{ index: 1, id: 'call_b', type: 'function', function: { name: 'list', arguments: '' } }] } }] }));
				local.push(event({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a.ts"}' } }] } }] }));
				const split = event({ choices: [{ index: 0, delta: { tool_calls: [{ index: 1, function: { arguments: '{"dir":"src"}' } }] } }] });
				local.push(split.slice(0, 25));
				local.push(split.slice(25));
				local.push(event({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }));
				local.push(event({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 42 } }));
				local.push('data: [DONE]\n\n');
				local.close();
				const response = await pending;

				assert.deepStrictEqual({
					routes,
					midway,
					status: response.status,
					contentType: response.headers.get('content-type'),
					body: await response.json(),
					sent: h.fetches.map(f => ({ via: f.via, accept: f.headers.accept, body: f.body })),
					released: { slots: h.serving.slotsInUse, leases: h.serving.leasesHeld },
					cloud: proxiedChats(h),
					turn: h.ledger.endTurn('session-1', generation),
					telemetry: h.telemetry.map(e => `${e.selection}:${e.reason}:${e.outputTokens}:${e.firstOutputMs}:${e.interactionType}`),
				}, {
					routes: 1,
					midway: { settled: false, slots: 1, timers: 0, local: 'open' },
					status: 200,
					contentType: 'application/json',
					body: {
						id: 'chatcmpl-7',
						object: 'chat.completion',
						created: 1791400000,
						model: MAI_LOCAL,
						choices: [{
							index: 0,
							finish_reason: 'tool_calls',
							message: {
								role: 'assistant',
								content: 'Reading.',
								reasoning_text: 'Looking.',
								tool_calls: [
									{ id: 'call_a', type: 'function', function: { name: 'read', arguments: '{"path":"a.ts"}' } },
									{ id: 'call_b', type: 'function', function: { name: 'list', arguments: '{"dir":"src"}' } },
								],
							},
						}],
						usage: { prompt_tokens: 120, completion_tokens: 42 },
					},
					sent: [{
						via: 'loopback',
						accept: 'text/event-stream',
						body: { model: 'mai-code-1.1-flash', max_tokens: 50000, messages: [{ role: 'user', content: 'hi' }], stream: true, stream_options: { include_usage: true } },
					}],
					released: { slots: 0, leases: 0 },
					cloud: [],
					turn: { execution: 'local', familyId: MAI_IDENTITY.familyId },
					telemetry: ['local::42:0:'],
				});
			});

			test('falls back before the first token, as for streaming requests', async () => {
				const cases: { readonly name: string; readonly setup?: (h: Harness) => void; readonly afterStart?: (h: Harness) => void }[] = [
					{ name: 'no token within the first-output timeout', afterStart: h => h.clock.advance(FIRST_OUTPUT_TIMEOUT_MS) },
					{ name: 'empty stream', afterStart: h => h.locals[0].close() },
					{ name: '2xx JSON error body', setup: h => h.onLoopback = () => json({ error: { code: 500, message: 'failed to process' } }) },
				];
				const results = [];
				for (const testCase of cases) {
					const h = createHarness();
					await declareWithoutIds(h);
					testCase.setup?.(h);
					const { request, ctx } = nonStreaming();
					const pending = h.handler.handleRequest(request, ctx);
					await flush();
					testCase.afterStart?.(h);
					const response = await pending;
					results.push({ name: testCase.name, text: await response.text(), reasons: h.telemetry.map(e => e.reason), slots: h.serving.slotsInUse, leases: h.serving.leasesHeld });
				}
				assert.deepStrictEqual(results, [
					{ name: 'no token within the first-output timeout', text: 'cloud answer from cloud-model', reasons: ['firstOutputTimeout'], slots: 0, leases: 0 },
					{ name: 'empty stream', text: 'cloud answer from cloud-model', reasons: ['emptyStream'], slots: 0, leases: 0 },
					{ name: '2xx JSON error body', text: 'cloud answer from cloud-model', reasons: ['streamError'], slots: 0, leases: 0 },
				]);
			});

			test('a failure after the first token, or an EOF before any choice finished, returns 502 and never calls the cloud; never a truncated answer', async () => {
				const ends = (...chunks: string[]) => (local: LocalStream) => {
					chunks.forEach(chunk => local.push(chunk));
					local.close();
				};
				const endings: [string, (local: LocalStream) => void][] = [
					['connection lost', local => local.error(new Error('server crashed'))],
					['error event', local => local.push('error: {"message":"out of memory"}\n\n')],
					['content delta then EOF', ends(event({ choices: [{ index: 0, delta: { content: 'Partial' } }] }))],
					['tool-call delta then EOF', ends(event({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'read', arguments: '{"pa' } }] } }] }))],
					['[DONE] without a finish_reason', ends(event({ choices: [{ index: 0, delta: { content: 'Partial' } }] }), event({ choices: [], usage: { completion_tokens: 1 } }), 'data: [DONE]\n\n')],
					['finish_reason and [DONE]', ends(event({ choices: [{ index: 0, delta: { content: 'Done.' }, finish_reason: 'stop' }] }), event({ choices: [], usage: { completion_tokens: 2 } }), 'data: [DONE]\n\n')],
				];
				const results = [];
				for (const [name, end] of endings) {
					const h = createHarness();
					await declareWithoutIds(h);
					const generation = h.ledger.beginTurn('session-1');
					const { request, ctx } = nonStreaming();
					const pending = h.handler.handleRequest(request, ctx);
					await flush();
					h.locals[0].push(FIRST_EVENT);
					await flush();
					end(h.locals[0]);
					const response = await pending;
					results.push({
						name,
						status: response.status,
						body: await response.json(),
						cloud: proxiedChats(h),
						released: { slots: h.serving.slotsInUse, leases: h.serving.leasesHeld },
						turn: h.ledger.endTurn('session-1', generation)?.execution,
						telemetry: h.telemetry.map(e => `${e.selection}:${e.reason}`),
					});
				}
				const failed = (name: string) => ({
					name,
					status: 502,
					body: { error: { code: 'localModelFailed', type: 'localModelFailed', message: 'Example Flash 1.0 is unavailable. Start a new chat or pick another model.' } },
					cloud: [],
					released: { slots: 0, leases: 0 },
					turn: 'local',
					telemetry: ['local:streamError'],
				});
				assert.deepStrictEqual(results, [
					failed('connection lost'),
					failed('error event'),
					failed('content delta then EOF'),
					failed('tool-call delta then EOF'),
					failed('[DONE] without a finish_reason'),
					{
						name: 'finish_reason and [DONE]',
						status: 200,
						body: {
							id: 'chatcmpl-7', object: 'chat.completion', created: 1791400000, model: MAI_LOCAL,
							choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Done.', reasoning_text: 'Look' } }],
							usage: { completion_tokens: 2 },
						},
						cloud: [],
						released: { slots: 0, leases: 0 },
						turn: 'local',
						telemetry: ['local:'],
					},
				]);
			});

			test('user cancellation while assembling releases the slot and never falls back', async () => {
				const h = createHarness();
				await declareWithoutIds(h);
				const cancellation = new AbortController();
				const { request, ctx } = nonStreaming(cancellation.signal);
				const pending = h.handler.handleRequest(request, ctx);
				await flush();
				h.locals[0].push(FIRST_EVENT);
				await flush();
				const held = h.serving.slotsInUse;
				cancellation.abort();
				const error = await pending.then(() => undefined, (e: Error) => e.name);
				assert.deepStrictEqual({ error, held, slots: h.serving.slotsInUse, leases: h.serving.leasesHeld, local: h.locals[0].state === 'open', cloud: proxiedChats(h), telemetry: h.telemetry.map(e => `${e.selection}:${e.reason}`) }, {
					error: 'AbortError',
					held: 1,
					slots: 0,
					leases: 0,
					local: false,
					cloud: [],
					telemetry: ['local:cancelled'],
				});
			});

			test('assembles direct requests too, keeping reasoning_content and the server model', async () => {
				const h = createHarness();
				h.serving.families.set('mai-code-1.1-flash', { familyId: MAI_IDENTITY.familyId, displayName: 'Example Flash 1.0', state: 'active' });
				const pending = h.handler.handleRequest(directRequest({ stream: undefined }), context(DIRECT_URL));
				await flush();
				h.locals[0].push(FIRST_EVENT);
				h.locals[0].push(event({ choices: [{ index: 0, delta: { content: 'Done.' }, finish_reason: 'stop' }] }));
				h.clock.advance(FIRST_OUTPUT_TIMEOUT_MS * 2);
				h.locals[0].push(event({ choices: [], usage: { completion_tokens: 5 } }));
				h.locals[0].push('data: [DONE]\n\n');
				h.locals[0].close();
				const response = await pending;
				assert.deepStrictEqual({ body: await response.json(), sent: h.fetches.map(f => ({ accept: f.headers.accept, body: f.body })), slots: h.serving.slotsInUse, telemetry: h.telemetry.map(e => `${e.selection}:${e.outputTokens}:${e.direct}`) }, {
					body: {
						id: 'chatcmpl-7',
						object: 'chat.completion',
						created: 1791400000,
						model: 'mai-code-1.1-flash',
						choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Done.', reasoning_content: 'Look' } }],
						usage: { completion_tokens: 5 },
					},
					sent: [{ accept: 'text/event-stream', body: { model: 'mai-code-1.1-flash', messages: [{ role: 'user', content: 'hi' }], stream: true, stream_options: { include_usage: true } } }],
					slots: 0,
					telemetry: ['local:5:true'],
				});
			});
		});

		test('a stream that lasts longer than the first-output timeout is not cut off', async () => {
			const h = createHarness();
			await declare(h);
			const pending = h.handler.handleRequest(chatRequest(), context(CHAT_URL));
			await flush();
			const local = h.locals[0];
			local.push(event({ choices: [{ delta: { content: 'a' } }] }));
			const response = await pending;
			h.clock.advance(FIRST_OUTPUT_TIMEOUT_MS * 3);
			await flush();
			local.push(event({ choices: [{ delta: { content: 'b' }, finish_reason: 'stop' }] }));
			local.close();
			const text = await response.text();
			assert.deepStrictEqual({ text, timers: h.clock.activeTimers, local: local.state, cloud: proxiedChats(h), slots: h.serving.slotsInUse }, {
				text: `${event({ choices: [{ delta: { content: 'a' } }], model: MAI_LOCAL })}${event({ choices: [{ delta: { content: 'b' }, finish_reason: 'stop' }], model: MAI_LOCAL })}`,
				timers: 0,
				local: 'closed',
				cloud: [],
				slots: 0,
			});
		});

		test('falls back to the cloud before the first output for every reason', async () => {
			interface IFallbackCase {
				readonly name: string;
				readonly setup?: (h: Harness) => void;
				readonly body?: LocalModelJsonBody;
				readonly interactionType?: string;
				readonly afterStart?: (h: Harness) => void;
			}
			const cases: IFallbackCase[] = [
				{ name: 'another model is active', setup: h => h.serving.active = createServingSnapshot({ identity: EXAMPLE_IDENTITY, displayName: 'Example Coder' }) },
				{ name: 'the model was reloaded', setup: h => h.serving.active = createServingSnapshot({ identity: { ...MAI_IDENTITY, servingGeneration: 3 } }) },
				{ name: 'a swap is in progress', setup: h => h.serving.active = createServingSnapshot({ swapInProgress: true }) },
				{ name: 'useInAuto was turned off', setup: h => h.serving.gates = { ...h.serving.gates, useInAuto: false } },
				{ name: 'the setting was turned off', setup: h => h.serving.gates = { ...h.serving.gates, enabled: false } },
				{ name: 'ancillary work', interactionType: 'conversation-compaction' },
				{ name: 'image parts', body: { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,' } }] }] } },
				{ name: 'server crashed', setup: h => h.serving.active = createServingSnapshot({ server: 'error', endpoint: undefined }) },
				{ name: 'endpoint down-marked', setup: h => h.serving.markEndpointDown(MAI_IDENTITY.servingGeneration) },
				{ name: 'slots full', setup: h => h.serving.tryAcquireSlot(h.serving.acquireServingLease(MAI_IDENTITY)!) },
				{ name: 'connection refused', setup: h => h.onLoopback = () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); } },
				{ name: 'first output timeout', afterStart: h => h.clock.advance(FIRST_OUTPUT_TIMEOUT_MS) },
				{ name: 'non-2xx', setup: h => h.onLoopback = () => json({ error: { message: 'busy' } }, 503) },
				{ name: '2xx with an empty stream', afterStart: h => h.locals[0].close() },
				{ name: '[DONE] before any output', afterStart: h => { h.locals[0].push('data: [DONE]\n\n'); h.locals[0].close(); } },
				{ name: 'error event first', afterStart: h => h.locals[0].push('error: {"message":"boom"}\n\n') },
			];
			const results = [];
			for (const testCase of cases) {
				const h = createHarness();
				await declare(h);
				testCase.setup?.(h);
				const generation = h.ledger.beginTurn('session-1');
				const pending = h.handler.handleRequest(chatRequest(testCase.body), context(CHAT_URL, { interactionType: testCase.interactionType }));
				await flush();
				testCase.afterStart?.(h);
				const response = await pending;
				const fallback = h.fetches.find(f => f.via === 'proxy' && f.path === '/chat/completions');
				results.push({
					name: testCase.name,
					text: await response.text(),
					reason: h.telemetry.find(e => e.selection === 'fallback')?.reason,
					turn: h.ledger.endTurn('session-1', generation)?.execution,
					local: loopbackCalls(h),
					fallback: { model: fallback?.body?.model, maxTokens: fallback?.body?.max_tokens, token: fallback?.headers['copilot-session-token'], authorization: fallback?.headers.authorization },
					localStreamsOpen: h.locals.filter(local => local.state === 'open').length,
					downMarked: h.serving.calls.includes('markEndpointDown:1'),
					leases: h.serving.leasesHeld - (testCase.name === 'slots full' ? 1 : 0),
				});
			}
			const expected = (name: string, reason: string, local: number, downMarked = false) => ({
				name,
				text: 'cloud answer from cloud-model',
				reason,
				turn: 'fallback',
				local,
				fallback: { model: 'cloud-model', maxTokens: 64000, token: TOKEN, authorization: 'Bearer capi' },
				localStreamsOpen: 0,
				downMarked,
				leases: 0,
			});
			assert.deepStrictEqual(results, [
				expected('another model is active', 'staleModel', 0),
				expected('the model was reloaded', 'staleModel', 0),
				expected('a swap is in progress', 'staleModel', 0),
				expected('useInAuto was turned off', 'disabled', 0),
				expected('the setting was turned off', 'disabled', 0),
				expected('ancillary work', 'ancillary', 0),
				expected('image parts', 'image', 0),
				expected('server crashed', 'endpointDown', 0),
				expected('endpoint down-marked', 'endpointDown', 0, true),
				expected('slots full', 'slotsFull', 0),
				expected('connection refused', 'connectFailed', 1, true),
				expected('first output timeout', 'firstOutputTimeout', 1),
				expected('non-2xx', 'httpError', 1),
				expected('2xx with an empty stream', 'emptyStream', 1),
				expected('[DONE] before any output', 'emptyStream', 1),
				expected('error event first', 'streamError', 1),
			]);
		});

		test('a turn that holds the model continues on it while it drains: its direct and Auto requests are served locally; other sessions are refused or fall back', async () => {
			const h = createHarness();
			h.serving.families.set('mai-code-1.1-flash', { familyId: MAI_IDENTITY.familyId, displayName: 'Example Flash 1.0', state: 'active' });
			await declare(h);
			// A swap drains MAI; session-1's turn holds it.
			h.serving.active = createServingSnapshot({ server: 'stopping', swapInProgress: true, endpoint: undefined });
			h.serving.held.set('session-1', createServingSnapshot());
			const run = async (kind: 'direct' | 'auto', sessionId: string) => {
				const url = kind === 'direct' ? DIRECT_URL : CHAT_URL;
				const opened = h.locals.length;
				const pending = h.handler.handleRequest(kind === 'direct' ? directRequest() : chatRequest(), context(url, { sessionId }));
				await flush();
				const local = h.locals[opened];
				local?.push(event({ choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' }] }));
				local?.close();
				const response = await pending;
				const text = await response.text();
				return local ? `${response.status} on the device` : `${response.status} ${text}`;
			};
			assert.deepStrictEqual({
				holderDirect: await run('direct', 'session-1'),
				holderAuto: await run('auto', 'session-1'),
				otherDirect: await run('direct', 'session-2'),
				otherAuto: await run('auto', 'session-2'),
				slots: h.serving.slotsInUse,
				leases: h.serving.leasesHeld,
				routes: h.telemetry.map(e => `${e.selection}:${e.reason}`),
			}, {
				holderDirect: '200 on the device',
				holderAuto: '200 on the device',
				otherDirect: '503 {"error":{"code":"modelNotActive","message":"Example Flash 1.0 is unavailable. Start a new chat or pick another model.","type":"modelNotActive"}}',
				otherAuto: '200 cloud answer from cloud-model',
				slots: 0,
				leases: 0,
				routes: ['local:', 'local:', 'modelNotActive:staleModel', 'fallback:staleModel'],
			});
		});

		test('a cached route bound to MAI never runs on Example Coder after Example Coder becomes active', async () => {
			const h = createHarness();
			await declare(h);
			h.serving.active = createServingSnapshot({ identity: EXAMPLE_IDENTITY, displayName: 'Example Coder', endpoint: { baseUrl: 'http://127.0.0.1:42000', apiKey: 'local-api-key' } });
			const routed = await h.handler.handleRequest(chatRequest(), context(CHAT_URL));
			const routedText = await routed.text();
			const unrouted = await h.handler.handleRequest(chatRequest({}, {}), context(CHAT_URL));
			assert.deepStrictEqual({ routedText, unrouted: unrouted.status, local: loopbackCalls(h), cloud: proxiedChats(h), reasons: h.telemetry.map(e => `${e.selection}:${e.reason}`) }, {
				routedText: 'cloud answer from cloud-model',
				unrouted: 503,
				local: 0,
				cloud: ['cloud-model'],
				reasons: ['fallback:staleModel', 'modelNotActive:noRoute'],
			});
		});

		test('user cancellation before output never falls back and releases the slot', async () => {
			const h = createHarness();
			await declare(h);
			const generation = h.ledger.beginTurn('session-1');
			const cancellation = new AbortController();
			const pending = h.handler.handleRequest(chatRequest(), context(CHAT_URL, { signal: cancellation.signal }));
			await flush();
			cancellation.abort();
			const error = await pending.then(() => undefined, (e: Error) => e.name);
			assert.deepStrictEqual({ error, cloud: proxiedChats(h), slots: h.serving.slotsInUse, leases: h.serving.leasesHeld, timers: h.clock.activeTimers, turn: h.ledger.endTurn('session-1', generation) }, {
				error: 'AbortError',
				cloud: [],
				slots: 0,
				leases: 0,
				timers: 0,
				turn: undefined,
			});
		});

		test('after output, cancellation by the user or the consumer releases the slot and never falls back', async () => {
			const results = [];
			for (const how of ['user', 'consumer'] as const) {
				const h = createHarness();
				await declare(h);
				const cancellation = new AbortController();
				const pending = h.handler.handleRequest(chatRequest(), context(CHAT_URL, { signal: cancellation.signal }));
				await flush();
				h.locals[0].push(event({ choices: [{ delta: { content: 'a' } }] }));
				const response = await pending;
				const reader = response.body!.getReader();
				await reader.read();
				const held = h.serving.slotsInUse;
				if (how === 'user') {
					cancellation.abort();
					await reader.read().catch(() => undefined);
				} else {
					await reader.cancel();
				}
				results.push({ how, held, slots: h.serving.slotsInUse, leases: h.serving.leasesHeld, localOpen: h.locals[0].state === 'open', cloud: proxiedChats(h), telemetry: h.telemetry.map(e => `${e.selection}:${e.reason}`) });
			}
			assert.deepStrictEqual(results, [
				{ how: 'user', held: 1, slots: 0, leases: 0, localOpen: false, cloud: [], telemetry: ['local:cancelled'] },
				{ how: 'consumer', held: 1, slots: 0, leases: 0, localOpen: false, cloud: [], telemetry: ['local:cancelled'] },
			]);
		});

		test('never replays output: a mid-stream failure, or a stream that ends before any choice finished, errors instead of ending cleanly', async () => {
			const endings: [string, (local: LocalStream) => void][] = [
				['connection lost', local => local.error(new Error('server crashed'))],
				['EOF after a content delta', local => local.close()],
				['[DONE] without a finish_reason', local => {
					local.push('data: [DONE]\n\n');
					local.close();
				}],
			];
			const results = [];
			for (const [name, end] of endings) {
				const h = createHarness();
				await declare(h);
				const pending = h.handler.handleRequest(chatRequest(), context(CHAT_URL));
				await flush();
				h.locals[0].push(event({ choices: [{ delta: { content: 'a' } }] }));
				const response = await pending;
				end(h.locals[0]);
				const reader = response.body!.getReader();
				const outcome = await (async () => {
					try {
						while (!(await reader.read()).done) { /* drain */ }
						return 'completed';
					} catch (e) {
						return `errored: ${(e as Error).message}`;
					}
				})();
				results.push({ name, outcome, cloud: proxiedChats(h), slots: h.serving.slotsInUse, leases: h.serving.leasesHeld, telemetry: h.telemetry.map(e => `${e.selection}:${e.reason}`) });
			}
			const expected = (name: string, message = 'Example Flash 1.0 is unavailable. Start a new chat or pick another model.') => ({
				name,
				outcome: `errored: ${message}`,
				cloud: [],
				slots: 0,
				leases: 0,
				telemetry: ['local:streamError'],
			});
			assert.deepStrictEqual(results, [expected('connection lost', 'server crashed'), expected('EOF after a content delta'), expected('[DONE] without a finish_reason')]);
		});

		test('without a route, serves only the current model locally and never falls back', async () => {
			const results: Record<string, unknown> = {};
			{
				const h = createHarness();
				const pending = h.handler.handleRequest(chatRequest({}, {}), context(CHAT_URL));
				await flush();
				h.locals[0].push(event({ choices: [{ delta: { content: 'a' }, finish_reason: 'stop' }] }));
				h.locals[0].close();
				const response = await pending;
				results.served = { status: response.status, text: await response.text(), maxTokens: h.fetches[0].body?.max_tokens, cloud: proxiedChats(h) };
			}
			{
				const h = createHarness();
				h.onLoopback = () => json({ error: {} }, 500);
				const response = await h.handler.handleRequest(chatRequest({}, {}), context(CHAT_URL));
				results.localFailure = { status: response.status, body: await response.json(), cloud: proxiedChats(h) };
			}
			{
				const h = createHarness();
				const response = await h.handler.handleRequest(chatRequest({ model: 'example-coder-local' }, {}), context(CHAT_URL));
				results.otherModel = { status: response.status, local: loopbackCalls(h), cloud: proxiedChats(h) };
			}
			{
				const h = createHarness();
				h.serving.gates = { ...h.serving.gates, accountGate: false };
				const response = await h.handler.handleRequest(chatRequest({}, {}), context(CHAT_URL));
				results.gateOff = { status: response.status, local: loopbackCalls(h), cloud: proxiedChats(h) };
			}
			assert.deepStrictEqual(results, {
				served: { status: 200, text: event({ choices: [{ delta: { content: 'a' }, finish_reason: 'stop' }], model: MAI_LOCAL }), maxTokens: 65536, cloud: [] },
				localFailure: { status: 503, body: { error: { code: 'modelNotActive', type: 'modelNotActive', message: 'Example Flash 1.0 is unavailable. Start a new chat or pick another model.' } }, cloud: [] },
				otherModel: { status: 503, local: 0, cloud: [] },
				gateOff: { status: 503, local: 0, cloud: [] },
			});
		});

		test('an account change treats existing routes as missing', async () => {
			const h = createHarness();
			await declare(h);
			h.serving.accountGeneration++;
			h.onLoopback = () => json({ error: {} }, 500);
			const response = await h.handler.handleRequest(chatRequest(), context(CHAT_URL));
			assert.deepStrictEqual({ status: response.status, cloud: proxiedChats(h), routes: h.routeTable.size }, { status: 503, cloud: [], routes: 0 });
		});

		test('a live useInAuto change stops declaring and sends cached routes to the cloud', async () => {
			const h = createHarness();
			await declare(h);
			h.serving.gates = { ...h.serving.gates, useInAuto: false };
			await (await h.handler.handleRequest(autoRequest(), context(AUTO_URL))).text();
			const cached = await (await h.handler.handleRequest(chatRequest(), context(CHAT_URL))).text();
			assert.deepStrictEqual({ declared: h.fetches.filter(f => f.path === '/auto').map(f => !!f.body?.local_models), cached, local: loopbackCalls(h), telemetry: h.telemetry.map(e => `${e.selection}:${e.reason}`) }, {
				declared: [false],
				cached: 'cloud answer from cloud-model',
				local: 0,
				telemetry: ['notDeclared:disabled', 'fallback:disabled'],
			});
		});

		test('a refused connection down-marks the endpoint and /auto stops declaring until it expires', async () => {
			const h = createHarness();
			await declare(h);
			h.onLoopback = () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
			await (await h.handler.handleRequest(chatRequest(), context(CHAT_URL))).text();
			await (await h.handler.handleRequest(autoRequest(), context(AUTO_URL))).text();
			h.clock.advance(DOWN_MARK_MS);
			await (await h.handler.handleRequest(autoRequest(), context(AUTO_URL))).text();
			assert.deepStrictEqual({ declared: h.fetches.filter(f => f.path === '/auto').map(f => !!f.body?.local_models), telemetry: h.telemetry.map(e => `${e.selection}:${e.reason}`) }, {
				declared: [false, true],
				telemetry: ['fallback:connectFailed', 'notDeclared:endpointDown'],
			});
		});

		test('passes a 401 from the cloud fallback back to the runtime', async () => {
			const h = createHarness();
			await declare(h);
			h.onLoopback = () => json({ error: {} }, 500);
			h.onProxy = () => json({ error: 'token expired' }, 401);
			const response = await h.handler.handleRequest(chatRequest(), context(CHAT_URL));
			assert.deepStrictEqual({ status: response.status, body: await response.json() }, { status: 401, body: { error: 'token expired' } });
		});

		test('rejects other sentinel endpoints and -local ids on other CAPI paths without forwarding', async () => {
			const h = createHarness();
			const models = await h.handler.handleRequest(new Request(`${SENTINEL_ORIGIN}/v1/models`), context(`${SENTINEL_ORIGIN}/v1/models`));
			const responses = await h.handler.handleRequest(new Request(`${CAPI}/responses`, { method: 'POST', body: JSON.stringify({ model: MAI_LOCAL, input: 'hi' }) }), context(`${CAPI}/responses`));
			assert.deepStrictEqual({ statuses: [models.status, responses.status], fetches: h.fetches.length }, { statuses: [404, 503], fetches: 0 });
		});

		suite('direct selection', () => {

			test('a non-active model gets 409 and never triggers a swap', async () => {
				const h = createHarness();
				h.serving.families.set('example-coder', { familyId: EXAMPLE_IDENTITY.familyId, displayName: 'Example Coder', state: 'inactive' });
				const response = await h.handler.handleRequest(directRequest({ model: 'example-coder' }), context(DIRECT_URL));
				assert.deepStrictEqual({ status: response.status, body: await response.json(), calls: h.serving.calls, fetches: h.fetches.length }, {
					status: 409,
					body: { error: { code: 'modelNotActive', type: 'modelNotActive', message: 'Example Coder isn\'t loaded.' } },
					calls: [],
					fetches: 0,
				});
			});

			test('a prompt that no longer fits the served context (for example after a smaller context size) becomes the runtime\'s context-limit error, not an unavailable model', async () => {
				const results: Record<string, unknown> = {};
				for (const [name, local] of [
					['llamaOverflow', json({ error: { code: 400, message: 'request (100000 tokens) exceeds the available context size (65536 tokens), try increasing it', type: 'exceed_context_size_error', n_prompt_tokens: 100000, n_ctx: 65536 } }, 400)],
					['messageOnly', json({ error: { code: 400, message: 'request (9 tokens) exceeds the available context size (8 tokens), try increasing it' } }, 400)],
					['otherBadRequest', json({ error: { code: 400, message: 'invalid grammar', type: 'invalid_request_error' } }, 400)],
				] as const) {
					const h = createHarness();
					h.serving.families.set('mai-code-1.1-flash', { familyId: MAI_IDENTITY.familyId, displayName: 'Example Flash 1.0', state: 'active' });
					h.onLoopback = () => local;
					const response = await h.handler.handleRequest(directRequest(), context(DIRECT_URL));
					results[name] = { status: response.status, body: await response.json(), slots: h.serving.slotsInUse, leases: h.serving.leasesHeld, telemetry: h.telemetry.map(event => `${event.selection}:${event.reason}`) };
				}
				const contextError = (message: string) => ({ error: { message, type: 'invalid_request_error', param: 'messages', code: 'context_length_exceeded' } });
				assert.deepStrictEqual(results, {
					llamaOverflow: { status: 413, body: contextError('This model\'s maximum context length is 65536 tokens. However, your messages resulted in 100000 tokens. Please reduce the length of the messages.'), slots: 0, leases: 0, telemetry: ['modelNotActive:contextExceeded'] },
					messageOnly: { status: 413, body: contextError('This model\'s maximum context length was exceeded. Please reduce the length of the messages.'), slots: 0, leases: 0, telemetry: ['modelNotActive:contextExceeded'] },
					otherBadRequest: { status: 503, body: { error: { code: 'modelNotActive', type: 'modelNotActive', message: 'Example Flash 1.0 is unavailable. Start a new chat or pick another model.' } }, slots: 0, leases: 0, telemetry: ['modelNotActive:httpError'] },
				});
			});

			test('starts the active model and serves through the direct adapter, attributing the turn to the on-device model', async () => {
				const h = createHarness();
				h.serving.families.set('mai-code-1.1-flash', { familyId: MAI_IDENTITY.familyId, displayName: 'Example Flash 1.0', state: 'active' });
				h.serving.active = createServingSnapshot({ server: 'stopped', endpoint: undefined, props: undefined });
				h.serving.ensureStartedImpl = async () => {
					h.serving.active = createServingSnapshot({ identity: { ...MAI_IDENTITY, servingGeneration: 2 } });
					return h.serving.active;
				};
				const generation = h.ledger.beginTurn('session-1');
				const pending = h.handler.handleRequest(directRequest({
					reasoning_effort: 'high',
					messages: [{ role: 'assistant', content: 'a', reasoning_content: 'prior' }, { role: 'user', content: 'q' }],
				}), context(DIRECT_URL));
				await flush();
				h.locals[0].push('data: {"model":"mai-code-1.1-flash","choices":[{"delta":{"reasoning_content":"r"},"finish_reason":"stop"}]}\n\n');
				h.locals[0].close();
				const response = await pending;
				assert.deepStrictEqual({
					text: await response.text(),
					sent: h.fetches.map(f => ({ via: f.via, body: f.body })),
					calls: h.serving.calls,
					waits: h.waits,
					slots: h.serving.slotsInUse,
					leases: h.serving.leasesHeld,
					turn: h.ledger.endTurn('session-1', generation),
				}, {
					text: 'data: {"model":"mai-code-1.1-flash","choices":[{"delta":{"reasoning_content":"r"},"finish_reason":"stop"}]}\n\n',
					sent: [{ via: 'loopback', body: { model: 'mai-code-1.1-flash', stream: true, return_progress: true, messages: [{ role: 'assistant', content: 'a', reasoning_content: 'prior' }, { role: 'user', content: 'q' }] } }],
					calls: ['ensureStarted:mai-code-1.1-flash-local'],
					// Loading ends when the request is sent: reading the prompt until the first output.
					waits: ['session-1:loading', 'session-1:processing', 'session-1:done'],
					slots: 0,
					leases: 0,
					turn: { execution: 'local', familyId: MAI_IDENTITY.familyId },
				});
			});

			test('direct requests wait in a FIFO queue and time out when the model stays busy', async () => {
				const h = createHarness();
				h.serving.families.set('mai-code-1.1-flash', { familyId: MAI_IDENTITY.familyId, displayName: 'Example Flash 1.0', state: 'active' });
				const blockerLease = h.serving.acquireServingLease(MAI_IDENTITY)!;
				const blocker = h.serving.tryAcquireSlot(blockerLease)!;
				const pendingA = h.handler.handleRequest(directRequest(), context(DIRECT_URL, { sessionId: 'a' }));
				const pendingB = h.handler.handleRequest(directRequest(), context(DIRECT_URL, { sessionId: 'b' }));
				await flush();
				blocker.dispose();
				blockerLease.dispose();
				await flush();
				h.locals[0].push(event({ choices: [{ delta: { content: 'a' }, finish_reason: 'stop' }] }));
				const responseA = await pendingA;
				h.clock.advance(QUEUE_TIMEOUT_MS);
				const responseB = await pendingB;
				h.locals[0].close();
				assert.deepStrictEqual({
					a: { status: responseA.status, text: await responseA.text() },
					b: { status: responseB.status, body: await responseB.json() },
					waits: h.waits,
					local: loopbackCalls(h),
					slots: h.serving.slotsInUse,
					leases: h.serving.leasesHeld,
					telemetry: h.telemetry.map(e => `${e.selection}:${e.reason}:${e.direct}`),
				}, {
					a: { status: 200, text: event({ choices: [{ delta: { content: 'a' }, finish_reason: 'stop' }] }) },
					b: { status: 503, body: { error: { code: 'busyTimeout', type: 'busyTimeout', message: 'The local model is busy. Try again, or use Auto.' } } },
					waits: ['a:queued:1', 'a:queued:1', 'b:queued:2', 'b:queued:1', 'a:processing', 'a:done', 'b:done'],
					local: 1,
					slots: 0,
					leases: 0,
					telemetry: ['modelNotActive:busyTimeout:true', 'local::true'],
				});
			});

			test('reports reading the conversation from prompt progress until the first output and strips it from the stream; a cached prompt shows nothing', async () => {
				const run = async (cache: number, steps: readonly (readonly [advanceMs: number, processed: number])[]) => {
					const h = createHarness();
					h.serving.families.set('mai-code-1.1-flash', { familyId: MAI_IDENTITY.familyId, displayName: 'Example Flash 1.0', state: 'active' });
					let settled = false;
					const pending = h.handler.handleRequest(directRequest(), context(DIRECT_URL)).finally(() => settled = true);
					await flush();
					const local = h.locals[0];
					for (const [advanceMs, processed] of steps) {
						h.clock.advance(advanceMs);
						local.push(progressEvent(processed, 12000, cache));
						await flush();
					}
					const settledBeforeOutput = settled;
					local.push(event({ choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' }] }));
					local.close();
					const response = await pending;
					return { settledBeforeOutput, text: await response.text(), waits: h.waits };
				};
				const answer = event({ choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' }] });
				assert.deepStrictEqual({
					// 8 % arrives within the interval after 0 %.
					cold: await run(0, [[0, 0], [200, 1024], [400, 2048], [600, 12000]]),
					cached: await run(11990, [[0, 11990], [100, 12000]]),
				}, {
					cold: { settledBeforeOutput: false, text: answer, waits: ['session-1:processing:0%', 'session-1:processing:17%', 'session-1:processing:100%', 'session-1:done'] },
					cached: { settledBeforeOutput: false, text: answer, waits: [] },
				});
			});
		});

		test('reading the conversation ends on errors and cancellation; Auto requests report it too, under the same first-output timeout', async () => {
			const run = async (name: 'directError' | 'directCancelled' | 'autoTimeout') => {
				const h = createHarness();
				h.serving.families.set('mai-code-1.1-flash', { familyId: MAI_IDENTITY.familyId, displayName: 'Example Flash 1.0', state: 'active' });
				const cancellation = new AbortController();
				if (name === 'autoTimeout') {
					await declare(h);
				}
				const pending = name === 'autoTimeout'
					? h.handler.handleRequest(chatRequest(), context(CHAT_URL))
					: h.handler.handleRequest(directRequest(), context(DIRECT_URL, { signal: cancellation.signal }));
				await flush();
				h.locals[0].push(progressEvent(0));
				await flush();
				switch (name) {
					case 'directError': h.locals[0].push('error: {"message":"boom"}\n\n'); break;
					case 'directCancelled': cancellation.abort(); break;
					case 'autoTimeout': h.clock.advance(FIRST_OUTPUT_TIMEOUT_MS); break;
				}
				const outcome = await pending.then(async response => `${response.status} ${await response.text()}`, (error: Error) => error.name);
				return { outcome: outcome.startsWith('503') ? '503' : outcome, waits: h.waits, routes: h.telemetry.map(e => `${e.selection}:${e.reason}`) };
			};
			assert.deepStrictEqual({ directError: await run('directError'), directCancelled: await run('directCancelled'), autoTimeout: await run('autoTimeout') }, {
				directError: { outcome: '503', waits: ['session-1:processing:0%', 'session-1:done'], routes: ['modelNotActive:streamError'] },
				directCancelled: { outcome: 'AbortError', waits: ['session-1:processing:0%', 'session-1:done'], routes: [] },
				autoTimeout: { outcome: '200 cloud answer from cloud-model', waits: ['session-1:processing:0%', 'session-1:done'], routes: ['fallback:firstOutputTimeout'] },
			});
		});
	});
});
