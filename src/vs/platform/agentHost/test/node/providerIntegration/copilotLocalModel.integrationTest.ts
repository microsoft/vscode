/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { approveAll, CopilotClient, defineTool, type CopilotRequestContext, type SessionConfig } from '@github/copilot-sdk';
import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'http';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { ILocalTurnExecution } from '../../../common/localModel.js';
import { createLocalModelTurnExecutionMeta } from '../../../common/meta/agentUsageMeta.js';
import { setLocalModelRequestHandlerEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { composeByokSessionConfig, getLocalModelSelectionId, resolveCopilotReasoningEffort, ThinkingLevelConfigKey, withLocalModelSessionConfig } from '../../../node/copilot/copilotSessionLauncher.js';
import { KNOWN_AUTO_LOCAL_IDS, SENTINEL_ORIGIN } from '../../../node/copilot/localModelBridge/shim/constants.js';
import { LocalModelCopilotRequestHandler, type ILocalModelRouteTelemetryEvent } from '../../../node/copilot/localModelBridge/shim/copilotRequestHandler.js';
import { createLocalModelRouterEnv } from '../../../node/copilot/localModelBridge/shim/requestRouter.js';
import { RouteTable } from '../../../node/copilot/localModelBridge/shim/routeTable.js';
import { systemLocalModelClock } from '../../../node/copilot/localModelBridge/shim/servingAccess.js';
import { TurnLedger } from '../../../node/copilot/localModelBridge/shim/turnLedger.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import type { ILocalModelDirectRequestWait, ILocalModelModelRow } from '../../../node/copilot/localModelBridge/localModelProvider.js';
import { buildLocalModelSessionConfig } from '../../../node/copilot/localModelBridge/shim/shimLocalModelProvider.js';
import { FakeLocalModelProvider, MAI_ROW } from '../localModelBridge/fakeLocalModelProvider.js';
import { createServingSnapshot, FakeClock, FakeServingAccess, MAI_IDENTITY } from '../localModelBridge/fakeServingAccess.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

/*
 * The on-device model bridge against the bundled runtime:
 *
 *   runtime ──► LocalModelCopilotRequestHandler (real router, route table and turn ledger)
 *                 ├─► fake CAPI (`/auto` picks the `-local` model with a cloud fallback)
 *                 ├─► fake OpenAI-compatible `llama-server` (loopback, per-spawn API key bearer, streams SSE with a tool call)
 *                 └─► fake BYOK provider (an unrelated named provider, passed through)
 *
 * Also asserts, against the pinned runtime, which `ctx` fields reach the
 * handler and whether the `.invalid` sentinel BYOK URL reaches the handler at
 * create, at resume and after `provider.sync`. No real account or network:
 * every endpoint is a loopback fake.
 */

const GITHUB_TOKEN = 'test-only-no-real-credential';
const ROUTE_TOKEN = 'auto-route-token';
const LOCAL_API_KEY = 'local-api-key-for-this-spawn';
const ACME_KEY = 'acme-key';
const LOCAL_CAPI_ID = MAI_IDENTITY.capiId;
const FALLBACK_MODEL = 'gpt-4o';
const DIRECT_MODEL = getLocalModelSelectionId(MAI_ROW.id);

/**
 * Headers `llama-server` may see: no CAPI/GitHub credentials, no `Copilot-*` or integration headers.
 * `sec-*` fetch metadata is added by the Electron test host's fetch, not by the handler.
 */
const ALLOWED_LOCAL_HEADERS = new Set(['host', 'connection', 'content-type', 'content-length', 'accept', 'authorization', 'user-agent', 'accept-encoding', 'accept-language']);

interface IRecordedRequest {
	readonly method: string;
	readonly path: string;
	readonly headers: IncomingHttpHeaders;
	readonly body: string;
}

interface IObservedContext {
	readonly target: 'capi' | 'sentinel' | 'acme' | 'local' | 'other';
	readonly method: string;
	readonly path: string;
	readonly transport: CopilotRequestContext['transport'];
	readonly sessionId: string | undefined;
	readonly agentId: string | undefined;
	readonly parentAgentId: string | undefined;
	readonly interactionType: string | undefined;
	readonly model: string | undefined;
	/** The `reasoning_effort` the runtime sent. */
	readonly reasoningEffort: unknown;
}

async function readBody(request: IncomingMessage): Promise<string> {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
	}
	return body;
}

function sseChunk(model: string, delta: Record<string, unknown>, finishReason: string | null = null): string {
	return `data: ${JSON.stringify({ id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
}

type ChatReply = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'toolCall'; readonly toolCall: Record<string, unknown> };

const TOOL_CALL_ID = 'call_report';
const USAGE = { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 };

/**
 * Answers with `text`, or a `report_value` tool call, as an OpenAI chat completion: SSE when `stream` was
 * requested, JSON otherwise. The SSE splits the text and the tool-call arguments across two deltas each,
 * after `llama-server`'s prompt progress chunks when `promptProgress` is given.
 */
function writeChatResponse(response: ServerResponse, model: string, stream: boolean, reply: ChatReply, promptProgress?: { readonly total: number; readonly cache: number }): void {
	if (!stream) {
		const message = reply.kind === 'text'
			? { role: 'assistant', content: reply.text }
			: { role: 'assistant', content: null, tool_calls: [{ id: TOOL_CALL_ID, type: 'function', function: { name: 'report_value', arguments: JSON.stringify(reply.toolCall) } }] };
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ id: 'chatcmpl-test', object: 'chat.completion', created: 0, model, choices: [{ index: 0, message, finish_reason: reply.kind === 'text' ? 'stop' : 'tool_calls' }], usage: USAGE }));
		return;
	}
	response.writeHead(200, { 'content-type': 'text/event-stream' });
	if (promptProgress) {
		const { total, cache } = promptProgress;
		for (const processed of [cache, Math.round((cache + total) / 2), total]) {
			response.write(`data: ${JSON.stringify({ id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0, delta: { role: 'assistant', content: null }, finish_reason: null }], prompt_progress: { total, cache, processed, time_ms: 71 } })}\n\n`);
		}
	}
	if (reply.kind === 'text') {
		const half = Math.ceil(reply.text.length / 2);
		response.write(sseChunk(model, { role: 'assistant', content: reply.text.slice(0, half) }));
		response.write(sseChunk(model, { content: reply.text.slice(half) }));
		response.write(sseChunk(model, {}, 'stop'));
	} else {
		response.write(sseChunk(model, { role: 'assistant', content: null, tool_calls: [{ index: 0, id: TOOL_CALL_ID, type: 'function', function: { name: 'report_value', arguments: '' } }] }));
		const toolArguments = JSON.stringify(reply.toolCall);
		const half = Math.ceil(toolArguments.length / 2);
		response.write(sseChunk(model, { tool_calls: [{ index: 0, function: { arguments: toolArguments.slice(0, half) } }] }));
		response.write(sseChunk(model, { tool_calls: [{ index: 0, function: { arguments: toolArguments.slice(half) } }] }));
		response.write(sseChunk(model, {}, 'tool_calls'));
	}
	response.write(`data: ${JSON.stringify({ id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 0, model, choices: [], usage: USAGE })}\n\n`);
	response.end('data: [DONE]\n\n');
}

function isStreaming(body: string): boolean {
	try {
		return (JSON.parse(body) as { stream?: unknown }).stream === true;
	} catch {
		return false;
	}
}

async function listen(server: Server): Promise<string> {
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server | undefined): Promise<void> {
	if (!server?.listening) {
		return;
	}
	server.closeAllConnections();
	await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function parseModel(body: string): string | undefined {
	try {
		const model = (JSON.parse(body) as { model?: unknown }).model;
		return typeof model === 'string' ? model : undefined;
	} catch {
		return undefined;
	}
}

function parseJson(body: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(body);
		return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
	} catch {
		return undefined;
	}
}

/** A copy of `model` with `capabilities.supports.reasoning_effort` set to `efforts` (`model` itself without them). */
function withReasoningEfforts(model: object | undefined, efforts: string[] | undefined): object | undefined {
	const copy = model && efforts ? parseJson(JSON.stringify(model)) : undefined;
	if (!copy || !efforts) {
		return model;
	}
	const capabilities = parseJson(JSON.stringify(copy.capabilities ?? {})) ?? {};
	const supports = parseJson(JSON.stringify(capabilities.supports ?? {})) ?? {};
	return { ...copy, capabilities: { ...capabilities, supports: { ...supports, reasoning_effort: efforts } } };
}

/** {@link MAI_ROW} with the harmony template's thinking control. */
const THINKING_ROW: ILocalModelModelRow = { ...MAI_ROW, thinking: { kind: 'effort', levels: ['low', 'medium', 'high'], defaultLevel: 'medium' } };

/** A shim-like provider: the real handler, the real ledger, the sentinel rows of {@link MAI_ROW}. */
class TestLocalModelProvider extends FakeLocalModelProvider {
	constructor(requestHandler: LocalModelCopilotRequestHandler, private readonly _ledger: TurnLedger) {
		super([MAI_ROW], requestHandler);
	}

	override beginTurn(sessionId: string): number {
		return this._ledger.beginTurn(sessionId);
	}

	override endTurn(sessionId: string, generation: number): ILocalTurnExecution | undefined {
		return this._ledger.endTurn(sessionId, generation);
	}
}

suite('Agent Host Provider Integration - Copilot on-device model bridge', function () {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	this.timeout(120_000);

	let home: string;
	let client: CopilotClient;
	let capi: Server;
	let llama: Server;
	let acme: Server;
	let capiUrl: string;
	let acmeUrl: string;
	let provider: TestLocalModelProvider;
	let capiRequests: IRecordedRequest[];
	let llamaRequests: IRecordedRequest[];
	let acmeRequests: IRecordedRequest[];
	let autoRequests: Record<string, unknown>[];
	let observed: IObservedContext[];
	let routes: ILocalModelRouteTelemetryEvent[];
	let reported: number[];
	let unexpectedRequests: string[];
	/** The fake `llama-server` dies on the next request, before any output. */
	let llamaDiesBeforeOutput: boolean;
	/** The fake `llama-server` answers this many requests with its context-overflow error. */
	let llamaContextOverflows: number;
	/** The fake `llama-server` reports reading this prompt on the next request that asks for `return_progress`. */
	let llamaPromptProgress: { readonly total: number; readonly cache: number } | undefined;
	let localResponses: { readonly status: number; readonly contentType: string | null; readonly body: unknown }[];
	/** The SSE text the runtime received for on-device requests, once each stream ended. */
	let localStreams: Promise<string>[];
	let directWaits: ILocalModelDirectRequestWait[];
	let serving: FakeServingAccess;
	/** `capabilities.supports.reasoning_effort` of the cloud fallback `/auto` returns. */
	let fallbackReasoningEfforts: string[] | undefined;

	const reportTool = defineTool('report_value', {
		description: 'Reports a numeric value to the test.',
		parameters: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] },
		skipPermission: true,
		handler: async (args: { value: number }) => {
			reported.push(args.value);
			return 'reported';
		},
	});

	const sessionOptions = {
		workingDirectory: '',
		enableConfigDiscovery: false,
		availableTools: ['report_value'],
		tools: [reportTool],
		onPermissionRequest: approveAll,
	} satisfies Partial<SessionConfig>;

	setup(async () => {
		home = await mkdtemp(join(tmpdir(), 'copilot-local-model-'));
		sessionOptions.workingDirectory = home;
		capiRequests = [];
		llamaRequests = [];
		acmeRequests = [];
		autoRequests = [];
		observed = [];
		routes = [];
		reported = [];
		unexpectedRequests = [];
		llamaDiesBeforeOutput = false;
		llamaContextOverflows = 0;
		llamaPromptProgress = undefined;
		fallbackReasoningEfforts = undefined;
		localResponses = [];
		localStreams = [];
		directWaits = [];
		const { createServer } = await import('http');

		// Fake CAPI: `/auto` picks the declared on-device model with a cloud fallback.
		capi = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://localhost').pathname;
			const body = await readBody(request);
			capiRequests.push({ method: request.method ?? 'GET', path, headers: request.headers, body });
			const json = (value: object) => {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify(value));
			};
			const catalog: { data: { id: string }[] } = JSON.parse(getAncillaryStub('GET', '/models')!.body);
			if (path === '/copilot_internal/managed_settings') {
				json({});
			} else if (path === '/user') {
				json({ login: 'replay-user', id: 1 });
			} else if (path === '/auto' && request.method === 'POST') {
				const routing = JSON.parse(body) as { local_models?: unknown };
				autoRequests.push(routing);
				const declared = Array.isArray(routing.local_models) && routing.local_models.includes(LOCAL_CAPI_ID);
				json({
					session_token: ROUTE_TOKEN,
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					selected_model: declared ? {
						id: LOCAL_CAPI_ID,
						name: LOCAL_CAPI_ID,
						object: 'model',
						vendor: 'Microsoft',
						version: LOCAL_CAPI_ID,
						supported_endpoints: ['/chat/completions'],
						capabilities: { type: 'chat', family: LOCAL_CAPI_ID, object: 'model_capabilities', limits: {}, supports: {} },
					} : catalog.data.find(model => model.id === FALLBACK_MODEL),
					...(declared ? { cloud_fallback_model: withReasoningEfforts(catalog.data.find(model => model.id === FALLBACK_MODEL), fallbackReasoningEfforts) } : {}),
				});
			} else if (path === '/chat/completions' && request.method === 'POST' && parseModel(body) === FALLBACK_MODEL) {
				writeChatResponse(response, FALLBACK_MODEL, isStreaming(body), { kind: 'text', text: 'CLOUD FALLBACK OK' });
			} else {
				const stub = getAncillaryStub(request.method ?? 'GET', path, body);
				if (stub) {
					response.writeHead(stub.status, stub.headers);
					response.end(stub.body.replaceAll('${capi}', capiUrl));
				} else {
					unexpectedRequests.push(`${request.method} ${path}`);
					response.writeHead(500, { 'x-should-retry': 'false' });
					response.end('Unexpected test endpoint');
				}
			}
		});
		capiUrl = await listen(capi);

		// Fake `llama-server`: requires its per-spawn API key; calls the tool once, then answers. Always SSE:
		// the handler asks for a stream even when the runtime did not, and assembles one completion.
		llama = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://localhost').pathname;
			const body = await readBody(request);
			llamaRequests.push({ method: request.method ?? 'GET', path, headers: request.headers, body });
			if (llamaDiesBeforeOutput) {
				llama.close();
				request.socket.destroy();
				return;
			}
			if (llamaContextOverflows > 0) {
				llamaContextOverflows--;
				response.writeHead(400, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ error: { code: 400, message: 'request (100000 tokens) exceeds the available context size (65536 tokens), try increasing it', type: 'exceed_context_size_error', n_prompt_tokens: 100000, n_ctx: 65536 } }));
				return;
			}
			if (request.headers.authorization !== `Bearer ${LOCAL_API_KEY}`) {
				response.writeHead(401, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ error: { message: 'Invalid API Key', type: 'authentication_error' } }));
				return;
			}
			const chat = JSON.parse(body) as { model: string; return_progress?: unknown; messages: { role: string; content?: unknown }[]; tools?: { function?: { name?: string } }[] };
			const toolResult = chat.messages.some(message => message.role === 'tool');
			const wantsTool = !toolResult && JSON.stringify(chat.messages.at(-1)?.content ?? '').includes('report') && !!chat.tools?.some(tool => tool.function?.name === 'report_value');
			const promptProgress = chat.return_progress === true ? llamaPromptProgress : undefined;
			if (promptProgress) {
				llamaPromptProgress = undefined;
			}
			writeChatResponse(response, chat.model, true, wantsTool ? { kind: 'toolCall', toolCall: { value: 42 } } : { kind: 'text', text: toolResult ? 'LOCAL DONE' : 'LOCAL OK' }, promptProgress);
		});
		const llamaUrl = await listen(llama);

		// An unrelated named BYOK provider.
		acme = createServer(async (request, response) => {
			const body = await readBody(request);
			acmeRequests.push({ method: request.method ?? 'GET', path: new URL(request.url ?? '/', 'http://localhost').pathname, headers: request.headers, body });
			writeChatResponse(response, parseModel(body) ?? 'test-model', isStreaming(body), { kind: 'text', text: 'ACME OK' });
		});
		acmeUrl = await listen(acme);

		serving = new FakeServingAccess(new FakeClock());
		serving.active = createServingSnapshot({ endpoint: { baseUrl: llamaUrl, apiKey: LOCAL_API_KEY } });
		serving.families.set(MAI_ROW.id, { familyId: MAI_ROW.familyId, displayName: MAI_ROW.name, state: 'active' });
		const ledger = new TurnLedger();
		const fetchFn = (input: Request, init?: RequestInit) => fetch(input, init);
		const targetOf = (url: URL): IObservedContext['target'] => url.origin === capiUrl ? 'capi' : url.origin === SENTINEL_ORIGIN ? 'sentinel' : url.origin === acmeUrl ? 'acme' : url.origin === llamaUrl ? 'local' : 'other';
		const handler = new class extends LocalModelCopilotRequestHandler {
			override async handleRequest(request: Request, ctx: CopilotRequestContext): Promise<Response> {
				const url = new URL(request.url);
				const body = request.method === 'POST' ? await request.clone().text() : '';
				const entry: IObservedContext = { target: targetOf(url), method: request.method, path: url.pathname, transport: ctx.transport, sessionId: ctx.sessionId, agentId: ctx.agentId, parentAgentId: ctx.parentAgentId, interactionType: ctx.interactionType, model: parseModel(body), reasoningEffort: parseJson(body)?.reasoning_effort };
				observed.push(entry);
				const response = await super.handleRequest(request, ctx);
				if (entry.target === 'sentinel' || (entry.target === 'capi' && entry.model === LOCAL_CAPI_ID)) {
					// What the runtime receives for an on-device request.
					const contentType = response.headers.get('content-type');
					localResponses.push({ status: response.status, contentType, body: contentType?.includes('json') ? await response.clone().json() : undefined });
					if (contentType?.includes('text/event-stream')) {
						localStreams.push(response.clone().text());
					}
				}
				return response;
			}
		}({ proxyFetch: fetchFn, loopbackFetch: fetchFn }, new NullLogService(), {
			serving,
			routeTable: new RouteTable(systemLocalModelClock),
			ledger,
			getRouterEnv: () => createLocalModelRouterEnv([capiUrl]),
			telemetry: { reportRoute: event => routes.push(event) },
			clock: systemLocalModelClock,
			onDirectRequestWaiting: event => {
				directWaits.push(event);
				provider.fireDirectRequestWait(event);
			},
		});
		provider = disposables.add(new TestLocalModelProvider(handler, ledger));

		const env = createIsolatedProviderEnvironment(home, {
			PATH: process.env.PATH,
			SystemRoot: process.env.SystemRoot,
			COPILOT_API_URL: capiUrl,
			COPILOT_DEBUG_GITHUB_API_URL: capiUrl,
			COPILOT_MANAGED_SETTINGS_CACHE: '0',
			COPILOT_TELEMETRY_ENABLED: 'false',
		});
		setLocalModelRequestHandlerEnvironment(env, true);
		client = new CopilotClient({
			workingDirectory: home,
			baseDirectory: join(home, 'copilot'),
			useLoggedInUser: false,
			gitHubToken: GITHUB_TOKEN,
			requestHandler: handler,
			env,
		});
	});

	teardown(async () => {
		try {
			// Unlike forceStop, stop waits for the runtime process to exit.
			assert.deepStrictEqual(await client?.stop() ?? [], []);
		} finally {
			await close(capi);
			await close(llama);
			await close(acme);
			if (home) {
				await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		}
	});

	/** `llama-server` never sees CAPI/GitHub credentials, and CAPI never sees a `-local` id outside the `/auto` declaration. */
	function assertSecurityInvariants(): void {
		const leaks = llamaRequests.flatMap(request => Object.entries(request.headers).flatMap(([name, value]) => {
			const text = String(value);
			return (!ALLOWED_LOCAL_HEADERS.has(name) && !name.startsWith('sec-')) || text.includes(GITHUB_TOKEN) || text.includes(ROUTE_TOKEN) || (name === 'authorization' && text !== `Bearer ${LOCAL_API_KEY}`) ? [`${name}: ${text}`] : [];
		}));
		const localIdsToCapi = capiRequests.filter(request => request.path !== '/auto' && /-local\b/i.test(parseModel(request.body) ?? '')).map(request => `${request.method} ${request.path}`);
		assert.deepStrictEqual({ leaks, localIdsToCapi, unexpectedRequests }, { leaks: [], localIdsToCapi: [], unexpectedRequests: [] });
	}

	async function runTurn(session: Awaited<ReturnType<CopilotClient['createSession']>>, prompt: string): Promise<{ readonly reply: string | undefined; readonly usageMeta: Record<string, unknown> | undefined }> {
		const generation = provider.beginTurn(session.sessionId);
		const response = await session.sendAndWait({ prompt }, 60_000);
		const execution = provider.endTurn(session.sessionId, generation);
		return { reply: response?.data.content, usageMeta: execution ? createLocalModelTurnExecutionMeta(execution) : undefined };
	}

	test('serves an Auto turn on the device, including a tool call, and attributes it as local', async () => {
		const session = await client.createSession({ ...sessionOptions, model: 'auto', ...withLocalModelSessionConfig({}, provider.contributeSessionConfig()) });
		const turn = await runTurn(session, 'Please report the value 42.');
		await session.disconnect();

		assert.deepStrictEqual({
			turn,
			reported,
			declared: autoRequests.map(request => request.local_models),
			localRequests: llamaRequests.map(request => ({ path: request.path, model: parseModel(request.body), stream: isStreaming(request.body), includeUsage: (JSON.parse(request.body) as { stream_options?: { include_usage?: unknown } }).stream_options?.include_usage, returnProgress: parseJson(request.body)?.return_progress })),
			// The runtime asked for JSON; the handler streamed from the device and assembled one completion.
			runtimeResponses: localResponses,
			autoContexts: observed.filter(entry => entry.path === '/auto').map(entry => ({ transport: entry.transport, sessionId: entry.sessionId, agentId: entry.agentId, interactionType: entry.interactionType })),
			chatContexts: observed.filter(entry => entry.target === 'capi' && entry.model === LOCAL_CAPI_ID).map(entry => ({ transport: entry.transport, sessionId: entry.sessionId === session.sessionId, agentId: entry.agentId === session.sessionId, interactionType: entry.interactionType })),
			routes: routes.map(route => route.selection),
			knownLocalId: KNOWN_AUTO_LOCAL_IDS.includes(LOCAL_CAPI_ID),
		}, {
			turn: { reply: 'LOCAL DONE', usageMeta: { 'vscode.localModel': { execution: 'local', familyId: MAI_ROW.familyId } } },
			reported: [42],
			declared: [[LOCAL_CAPI_ID]],
			localRequests: [
				// A non-streaming request never asks for prompt progress.
				{ path: '/v1/chat/completions', model: MAI_IDENTITY.alias, stream: true, includeUsage: true, returnProgress: undefined },
				{ path: '/v1/chat/completions', model: MAI_IDENTITY.alias, stream: true, includeUsage: true, returnProgress: undefined },
			],
			runtimeResponses: [
				{ status: 200, contentType: 'application/json', body: { id: 'chatcmpl-test', object: 'chat.completion', created: 0, model: LOCAL_CAPI_ID, usage: USAGE, choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: TOOL_CALL_ID, type: 'function', function: { name: 'report_value', arguments: '{"value":42}' } }] } }] } },
				{ status: 200, contentType: 'application/json', body: { id: 'chatcmpl-test', object: 'chat.completion', created: 0, model: LOCAL_CAPI_ID, usage: USAGE, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'LOCAL DONE' } }] } },
			],
			// /auto carries no session, agent or interaction type; chat requests carry all three.
			autoContexts: [{ transport: 'http', sessionId: undefined, agentId: undefined, interactionType: undefined }],
			chatContexts: [
				{ transport: 'http', sessionId: true, agentId: true, interactionType: 'conversation-agent' },
				{ transport: 'http', sessionId: true, agentId: true, interactionType: 'conversation-agent' },
			],
			routes: ['local', 'local'],
			knownLocalId: true,
		});
		assertSecurityInvariants();
	});

	test('falls back to the cloud with the route token when the local server dies before the first output', async () => {
		llamaDiesBeforeOutput = true;
		const session = await client.createSession({ ...sessionOptions, model: 'auto', ...withLocalModelSessionConfig({}, provider.contributeSessionConfig()) });
		const turn = await runTurn(session, 'Say hello.');
		await session.disconnect();

		const fallbackRequests = capiRequests.filter(request => request.path === '/chat/completions' && parseModel(request.body) === FALLBACK_MODEL);
		assert.deepStrictEqual({
			turn,
			localRequests: llamaRequests.length,
			fallback: fallbackRequests.map(request => ({ token: request.headers['copilot-session-token'], stream: isStreaming(request.body) })),
			routes: routes.map(route => `${route.selection}:${route.reason}`),
		}, {
			turn: { reply: 'CLOUD FALLBACK OK', usageMeta: { 'vscode.localModel': { execution: 'fallback', fallbackReason: 'localError', fallbackModel: FALLBACK_MODEL, familyId: MAI_ROW.familyId } } },
			localRequests: 1,
			fallback: [{ token: ROUTE_TOKEN, stream: false }],
			routes: ['fallback:localError'],
		});
		assertSecurityInvariants();
	});

	test('serves the direct sentinel row at create, at resume and after provider.sync', async () => {
		const contribution = provider.contributeSessionConfig();
		/** A turn of one phase (create, resume, after `provider.sync`): what answered, and which endpoints the runtime used for it. */
		const phase = async (session: Awaited<ReturnType<CopilotClient['createSession']>>, prompt: string) => {
			const before = observed.length;
			const responsesBefore = localResponses.length;
			let turn: Awaited<ReturnType<typeof runTurn>> | 'failed';
			try {
				turn = await runTurn(session, prompt);
			} catch {
				turn = 'failed';
			}
			const requests = observed.slice(before).filter(entry => entry.method === 'POST' && entry.path !== '/auto' && !entry.path.startsWith('/mcp'));
			// The direct completion the runtime received: the server's model, the assembled content and usage.
			const completions = localResponses.slice(responsesBefore).map(({ body }) => {
				const completion = body as { object?: string; model?: string; usage?: unknown; choices?: { message?: { content?: unknown } }[] } | undefined;
				return { object: completion?.object, model: completion?.model, content: completion?.choices?.[0]?.message?.content, usage: completion?.usage };
			});
			return { turn, requests: [...new Set(requests.map(entry => `${entry.target} ${entry.path} ${entry.model}`))], completions };
		};

		// The server is stopped (for example after an idle unload): the first direct request waits for the load.
		const ready = serving.active;
		assert.ok(ready);
		serving.active = { ...ready, server: 'stopped' };
		serving.ensureStartedImpl = async () => serving.active = ready;
		const created = await client.createSession({ ...sessionOptions, model: DIRECT_MODEL, ...withLocalModelSessionConfig({}, contribution) });
		const create = await phase(created, 'Say hello.');
		const sessionId = created.sessionId;
		await created.disconnect();

		const resumed = await client.resumeSession(sessionId, { ...sessionOptions, ...withLocalModelSessionConfig({}, contribution) });
		const resume = await phase(resumed, 'Say hello again.');
		await resumed.disconnect();

		const synced = await client.createSession({ ...sessionOptions, model: 'auto' });
		const config = composeByokSessionConfig({}, {}, contribution);
		assert.ok(config);
		await synced.rpc.provider.sync(config);
		await synced.setModel(DIRECT_MODEL);
		const sync = await phase(synced, 'Say hello once more.');
		await synced.disconnect();

		const sentinel = `sentinel /v1/chat/completions ${MAI_ROW.id}`;
		const directCompletion = { object: 'chat.completion', model: MAI_ROW.id, content: 'LOCAL OK', usage: USAGE };
		// A direct turn ran on the device: it is attributed to the on-device model, like an Auto turn served locally.
		const directTurn = { reply: 'LOCAL OK', usageMeta: { 'vscode.localModel': { execution: 'local', familyId: MAI_ROW.familyId } } };
		assert.deepStrictEqual({
			create,
			resume,
			sync,
			directRoutes: [...new Set(routes.filter(route => route.direct).map(route => route.selection))],
			// Reported against the runtime session, so the matching Agent Host session can show it.
			directWaits: directWaits.map(event => ({ kind: event.kind, familyId: event.familyId, ownSession: event.sessionId === sessionId })),
		}, {
			create: { turn: directTurn, requests: [sentinel], completions: [directCompletion] },
			resume: { turn: directTurn, requests: [sentinel], completions: [directCompletion] },
			sync: { turn: directTurn, requests: [sentinel], completions: [directCompletion] },
			directRoutes: ['local'],
			directWaits: [{ kind: 'loading', familyId: MAI_ROW.familyId, ownSession: true }, { kind: 'done', familyId: MAI_ROW.familyId, ownSession: true }],
		});
		assertSecurityInvariants();
	});

	test('a streaming direct request reports reading a long prompt after the load; the runtime never sees llama-server\'s prompt progress', async () => {
		const ready = serving.active;
		assert.ok(ready);
		serving.active = { ...ready, server: 'stopped' };
		serving.ensureStartedImpl = async () => serving.active = ready;
		llamaPromptProgress = { total: 12000, cache: 0 };
		const session = await client.createSession({ ...sessionOptions, streaming: true, model: DIRECT_MODEL, ...withLocalModelSessionConfig({}, provider.contributeSessionConfig()) });
		const turn = await runTurn(session, 'Say hello.');
		await session.disconnect();
		const streams = await Promise.all(localStreams);

		const ownWaits = directWaits.filter(event => event.sessionId === session.sessionId);
		const percents = ownWaits.flatMap(event => event.percent === undefined ? [] : [event.percent]);
		assert.deepStrictEqual({
			reply: turn.reply,
			// Every request streamed from the device asked for its prompt progress.
			askedForProgress: [...new Set(llamaRequests.map(request => `${isStreaming(request.body)}:${parseJson(request.body)?.return_progress}`))],
			progressServed: llamaPromptProgress === undefined,
			runtimeStreams: streams.length > 0,
			runtimeSawProgress: streams.some(text => text.includes('prompt_progress')),
			// Loading until the request is sent, reading the prompt (with its progress) until the first output, then done.
			waits: ownWaits.map(event => event.kind).filter((kind, index, kinds) => kind !== kinds[index - 1]),
			readingBeforeProgress: ownWaits.find(event => event.kind === 'processing')?.percent,
			percentsFromZero: percents[0] === 0 && percents.every((percent, index) => index === 0 || percent > percents[index - 1]),
		}, {
			reply: 'LOCAL OK',
			askedForProgress: ['true:true'],
			progressServed: true,
			runtimeStreams: true,
			runtimeSawProgress: false,
			waits: ['loading', 'processing', 'done'],
			readingBeforeProgress: undefined,
			percentsFromZero: true,
		});
		assertSecurityInvariants();
	});

	test('passes direct-row thinking levels while Auto leaves effort to its routed model', async () => {
		const ready = serving.active;
		assert.ok(ready);
		const sessionConfig = withLocalModelSessionConfig({}, buildLocalModelSessionConfig([THINKING_ROW]));
		const llamaThinking = () => llamaRequests.splice(0).map(request => {
			const body = parseJson(request.body);
			return { reasoningEffort: body?.reasoning_effort, kwargs: body?.chat_template_kwargs };
		});
		// What the launcher passes the runtime for the row's per-chat thinking level.
		const effortFor = (thinkingLevel: string) => resolveCopilotReasoningEffort({ id: DIRECT_MODEL, config: { [ThinkingLevelConfigKey]: thinkingLevel } }, { getRootValue: () => undefined }, new NullLogService(), 'test');
		const sentToSentinel = () => observed.splice(0).filter(entry => entry.target === 'sentinel' || (entry.target === 'capi' && entry.model === LOCAL_CAPI_ID)).map(entry => entry.reasoningEffort);

		// Harmony (`reasoning_effort`): the chat's level reaches the template.
		serving.active = { ...ready, thinking: THINKING_ROW.thinking };
		const effortSession = await client.createSession({ ...sessionOptions, model: DIRECT_MODEL, reasoningEffort: effortFor('high'), ...sessionConfig });
		const effortTurn = await runTurn(effortSession, 'Say hello.');
		await effortSession.disconnect();
		const effort = { turn: effortTurn.reply, runtime: sentToSentinel(), llama: llamaThinking() };

		// `enable_thinking` (Off / On): Off is `none`, which the runtime would drop, so the launcher sends `minimal`.
		serving.active = { ...ready, thinking: { kind: 'toggle' } };
		const toggleSession = await client.createSession({ ...sessionOptions, model: DIRECT_MODEL, reasoningEffort: effortFor('none'), ...sessionConfig });
		const toggleTurn = await runTurn(toggleSession, 'Say hello.');
		await toggleSession.disconnect();
		const toggle = { turn: toggleTurn.reply, runtime: sentToSentinel(), llama: llamaThinking() };

		// Auto cannot carry a fixed effort because its concrete model is selected per request.
		serving.active = { ...ready, thinking: THINKING_ROW.thinking };
		fallbackReasoningEfforts = ['low', 'medium', 'high'];
		const autoSession = await client.createSession({ ...sessionOptions, model: 'auto', ...sessionConfig });
		const autoTurn = await runTurn(autoSession, 'Say hello.');
		await autoSession.disconnect();
		const auto = { turn: autoTurn.reply, runtime: sentToSentinel(), llama: llamaThinking() };

		assert.deepStrictEqual({ effort, toggle, auto }, {
			effort: { turn: 'LOCAL OK', runtime: ['high'], llama: [{ reasoningEffort: undefined, kwargs: { reasoning_effort: 'high' } }] },
			toggle: { turn: 'LOCAL OK', runtime: ['minimal'], llama: [{ reasoningEffort: undefined, kwargs: { enable_thinking: false } }] },
			auto: { turn: 'LOCAL OK', runtime: ['medium'], llama: [{ reasoningEffort: undefined, kwargs: { reasoning_effort: 'medium' } }] },
		});
		assertSecurityInvariants();
	});

	test('a prompt that does not fit the on-device model\'s context reaches the runtime as its context-limit error: it compacts and retries instead of failing as an unavailable model', async () => {
		const session = await client.createSession({ ...sessionOptions, model: DIRECT_MODEL, ...withLocalModelSessionConfig({}, provider.contributeSessionConfig()) });
		const events: string[] = [];
		const unsubscribe = session.on(event => {
			if (event.type === 'session.error') {
				events.push(`error:${event.data.errorType}`);
			} else if (event.type === 'session.compaction_start') {
				events.push(`compactionStart:${event.data.trigger}`);
			} else if (event.type === 'session.compaction_complete') {
				events.push(`compactionComplete:${event.data.success}`);
			}
		});
		const first = await runTurn(session, 'Say hello.');
		// For example a request built before the context size was reduced.
		llamaContextOverflows = 1;
		const second = await runTurn(session, 'Say hello again.');
		unsubscribe();
		await session.disconnect();
		assert.deepStrictEqual({
			replies: [first.reply, second.reply],
			events,
			runtimeSaw: localResponses.map(response => ({ status: response.status, code: (response.body as { error?: { code?: unknown } } | undefined)?.error?.code })),
			routes: routes.map(route => `${route.selection}:${route.reason}`),
		}, {
			replies: ['LOCAL OK', 'LOCAL OK'],
			events: ['compactionStart:context_limit_retry', 'compactionComplete:true'],
			// The turn, the overflow, the compaction summary, the retried turn.
			runtimeSaw: [{ status: 200, code: undefined }, { status: 413, code: 'context_length_exceeded' }, { status: 200, code: undefined }, { status: 200, code: undefined }],
			routes: ['local:', 'modelNotActive:contextExceeded', 'local:', 'local:'],
		});
		assertSecurityInvariants();
	});

	test('passes an unrelated BYOK row through untouched', async () => {
		const acmeConfig = {
			providers: [{ name: 'acme', type: 'openai' as const, wireApi: 'completions' as const, baseUrl: `${acmeUrl}/v1`, bearerToken: ACME_KEY }],
			models: [{ id: 'test-model', provider: 'acme' }],
		};
		const session = await client.createSession({ ...sessionOptions, model: 'acme/test-model', ...withLocalModelSessionConfig(acmeConfig, provider.contributeSessionConfig()) });
		const turn = await runTurn(session, 'Say hello.');
		await session.disconnect();

		const relayed = observed.filter(entry => entry.target === 'acme');
		assert.deepStrictEqual({
			turn,
			acme: acmeRequests.map(request => ({ path: request.path, authorization: request.headers.authorization, model: parseModel(request.body) })),
			relayed: relayed.map(entry => `${entry.method} ${entry.path} ${entry.model}`),
			routes,
			localRequests: llamaRequests.length,
		}, {
			turn: { reply: 'ACME OK', usageMeta: undefined },
			acme: [{ path: '/v1/chat/completions', authorization: `Bearer ${ACME_KEY}`, model: 'test-model' }],
			relayed: ['POST /v1/chat/completions test-model'],
			routes: [],
			localRequests: 0,
		});
		assertSecurityInvariants();
	});
});
