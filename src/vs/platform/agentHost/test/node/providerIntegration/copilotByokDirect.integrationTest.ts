/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { existsSync } from 'fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { approveAll, CopilotClient, RuntimeConnection } from '@microsoft/copilot-sdk';
import { join, relative } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { resolveCustomEndpointRuntimeEndpoint, type ICustomEndpointModelSettings } from '../../../common/byokCustomEndpoint.js';
import { BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT, type IByokEndpoint } from '../../../common/byokModelSource.js';
import { GEMINI_BYOK_ENDPOINT } from '../../../common/byokVendorEndpoints.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { getCopilotModelSourceModels, omitsReasoningSummary, type ICopilotModelSourceModel } from '../../../node/copilot/copilotModelSources.js';
import { withLocalModelSessionConfig } from '../../../node/copilot/copilotSessionLauncher.js';
import { OPENAI_COMPATIBLE_MAX_TOOLS } from '../../../node/copilot/toolSearchDeferral.js';
import { anthropicMessageToSse, responsesMessageToSse } from '../e2e/harness/capiWireCodec.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

type WireFormat = 'chatCompletions' | 'responses' | 'messages' | 'azure' | 'gemini';

/**
 * The auth a request carried: the header, and whose key it was, as fixed labels
 * so key values never enter assertion data.
 */
type ObservedAuth = `${'bearer' | 'x-api-key' | 'api-key' | 'x-goog-api-key'}:${WireFormat}` | 'none' | 'unexpected';

interface IObservedRequest {
	readonly path: string;
	readonly auth: ObservedAuth;
	readonly model: unknown;
	/** The output token cap fields the request set. */
	readonly outputCap: readonly string[];
	/** For Responses: the reasoning summary the request asked for, else `null`. */
	readonly reasoningSummary?: unknown;
}

/** The fields of a model request these tests read. */
interface IRequestBody {
	readonly model?: unknown;
	readonly messages?: readonly { readonly role?: unknown; readonly content?: unknown }[];
	readonly tools?: readonly { readonly function?: { readonly name?: unknown } }[];
	readonly reasoning?: { readonly summary?: unknown };
	readonly generation_config?: { readonly max_output_tokens?: unknown };
	readonly [field: string]: unknown;
}

/** A key in the runtime's environment, which no request may carry. */
const AMBIENT_KEY = 'ambient-provider-key-93d0';

const API_KEYS: Record<WireFormat, string> = {
	chatCompletions: 'direct-byok-key-chat-completions-6f1d',
	responses: 'direct-byok-key-responses-0a9c',
	messages: 'direct-byok-key-messages-b27e',
	azure: 'direct-byok-key-azure-4c58',
	gemini: 'direct-byok-key-gemini-7e31',
};

function observeAuth(request: IncomingMessage): ObservedAuth {
	const owner = (key: string) => (Object.keys(API_KEYS) as WireFormat[]).find(format => API_KEYS[format] === key);
	const authorization = request.headers.authorization;
	const keyHeaders = (['x-api-key', 'api-key', 'x-goog-api-key'] as const).map(name => [name, request.headers[name]] as const);
	const sent = [authorization, ...keyHeaders.map(([, value]) => value)].filter(value => value !== undefined);
	if (sent.length === 0) {
		return 'none';
	}
	if (sent.length > 1) {
		return 'unexpected';
	}
	const bearer = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? owner(authorization.slice('Bearer '.length)) : undefined;
	if (bearer) {
		return `bearer:${bearer}`;
	}
	for (const [name, value] of keyHeaders) {
		const keyOwner = typeof value === 'string' ? owner(value) : undefined;
		if (keyOwner) {
			return `${name}:${keyOwner}`;
		}
	}
	return 'unexpected';
}

function writeChatCompletion(response: ServerResponse, model: string, delta: Record<string, unknown>, finishReason: 'stop' | 'tool_calls'): void {
	const chunk = (chunkDelta: Record<string, unknown>, reason: string | null) => `data: ${JSON.stringify({ id: 'chatcmpl-direct', object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0, delta: chunkDelta, finish_reason: reason }] })}\n\n`;
	response.writeHead(200, { 'content-type': 'text/event-stream' });
	response.write(chunk(delta, null));
	response.write(chunk({}, finishReason));
	response.write(`data: ${JSON.stringify({ id: 'chatcmpl-direct', object: 'chat.completion.chunk', created: 0, model, choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
	response.end('data: [DONE]\n\n');
}

/** A finished Gemini interaction with one text step, as the Interactions API streams it. */
function writeInteraction(response: ServerResponse, model: string, text: string): void {
	const usage = { total_input_tokens: 1, total_output_tokens: 1, total_tokens: 2 };
	const events: [string, unknown][] = [
		['interaction.created', { event_type: 'interaction.created', interaction: { id: '', status: 'in_progress', model } }],
		['step.start', { event_type: 'step.start', index: 0, step: { type: 'model_output' } }],
		['step.delta', { event_type: 'step.delta', index: 0, delta: { type: 'text', text } }],
		['step.stop', { event_type: 'step.stop', index: 0 }],
		['interaction.completed', { event_type: 'interaction.completed', interaction: { id: '', status: 'completed', model, usage } }],
	];
	response.writeHead(200, { 'content-type': 'text/event-stream' });
	response.end(events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('') + 'event: done\ndata: [DONE]\n\n');
}

/** A loopback model server that answers each request with `reply`. */
async function startModelServer(reply: (request: IncomingMessage, body: IRequestBody, response: ServerResponse) => void): Promise<{ readonly base: string; close(): Promise<void> }> {
	const { createServer } = await import('http');
	const server = createServer((request, response) => {
		void (async () => {
			let body = '';
			for await (const chunk of request) {
				body += chunk;
			}
			reply(request, JSON.parse(body || '{}'), response);
		})();
	});
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	return {
		base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
		close: () => new Promise<void>(resolve => server.close(() => resolve())),
	};
}

/** A registered model source with one model, as the agent host builds it from a provider group. */
function createSourceModel(name: string, model: { readonly id: string; readonly endpoint: IByokEndpoint; readonly maxOutputTokens?: number }, credential: string | undefined): ICopilotModelSourceModel {
	return getCopilotModelSourceModels({
		id: `vscode.byok/copilotcli/${name}`,
		format: BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT,
		definition: { models: [{ ...model, toolCalling: true }], requiresCredential: credential !== undefined },
		...(credential !== undefined ? { credential } : {}),
	})[0];
}

/** The session config the agent host gives a session on `sources`' models. */
function sessionConfig(sources: readonly ICopilotModelSourceModel[]) {
	return withLocalModelSessionConfig({}, undefined, { providers: sources.map(source => source.runtimeProvider), models: sources.map(source => source.runtimeModel) });
}

/**
 * Runs the bundled runtime in an isolated home, with provider keys in its
 * environment that no request may carry. Once it stops, the home is searched
 * for the test's keys, which the runtime must not write to session state or logs.
 */
async function withRuntime<T>(run: (client: CopilotClient, homeDirectory: string) => Promise<T>): Promise<{ readonly result: T; readonly keyFiles: readonly string[]; readonly sessionStates: readonly string[] }> {
	const homeDirectory = await mkdtemp(`${tmpdir()}/byok-direct-`);
	const client = new CopilotClient({
		// The agent host's main runtime client uses this mode.
		mode: 'coding-agent',
		runtime: RuntimeConnection.forSpawnedStdio({
			env: { ...createCopilotCliEnvironment(createIsolatedProviderEnvironment(homeDirectory)), OPENAI_API_KEY: AMBIENT_KEY, ANTHROPIC_API_KEY: AMBIENT_KEY, GEMINI_API_KEY: AMBIENT_KEY },
		}),
		github: { useLoggedInUser: false },
		observability: { logLevel: 'all' },
	});
	let started = false;
	try {
		await client.start();
		started = true;
		const result = await run(client, homeDirectory);
		await client.stop();
		started = false;

		const keyFiles: string[] = [];
		for (const file of (await readdir(homeDirectory, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())) {
			const path = join(file.parentPath, file.name);
			const content = await readFile(path, 'utf8');
			if ([...Object.values(API_KEYS), AMBIENT_KEY].some(key => content.includes(key))) {
				keyFiles.push(relative(homeDirectory, path));
			}
		}
		const sessionStateDirectory = join(homeDirectory, '.copilot', 'session-state');
		return { result, keyFiles, sessionStates: existsSync(sessionStateDirectory) ? await readdir(sessionStateDirectory) : [] };
	} finally {
		try {
			if (started) {
				await client.stop();
			}
		} finally {
			await rm(homeDirectory, { recursive: true, force: true });
		}
	}
}

type CopilotSession = Awaited<ReturnType<CopilotClient['createSession']>>;

async function withSession<T>(client: CopilotClient, options: Parameters<CopilotClient['createSession']>[0], run: (session: CopilotSession) => Promise<T>): Promise<T> {
	const session = await client.createSession(options);
	try {
		return await run(session);
	} finally {
		await session.disconnect();
	}
}

/**
 * Checks that the bundled runtime calls registered model sources' models itself,
 * the way the agent host registers them: the endpoints from the production
 * mappings, each source's key, and the runtime ids the agent host publishes.
 */
suite('Agent Host Provider Integration - Copilot BYOK direct endpoints', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('the bundled runtime calls each wire format with the group key and keeps the key off disk', async function () {
		this.timeout(180_000);

		const requests: IObservedRequest[] = [];
		const server = await startModelServer((request, body, response) => {
			const path = request.url ?? '';
			const pathname = path.split('?')[0];
			const auth = observeAuth(request);
			requests.push({
				path,
				auth,
				model: body.model,
				outputCap: [
					...['max_tokens', 'max_completion_tokens', 'max_output_tokens'].filter(field => body[field] !== undefined),
					...(body.generation_config?.max_output_tokens !== undefined ? ['generation_config.max_output_tokens'] : []),
				],
				...(pathname.endsWith('/responses') ? { reasoningSummary: body.reasoning?.summary ?? null } : {}),
			});
			// Each endpoint only accepts its own auth header.
			const expectedAuth = pathname.startsWith('/anthropic/') ? 'x-api-key' : pathname.startsWith('/azure/') ? 'api-key' : pathname.startsWith('/google/') ? 'x-goog-api-key' : pathname.startsWith('/keyless/') ? 'none' : 'bearer';
			if (auth.split(':')[0] !== expectedAuth) {
				response.writeHead(401, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ error: { message: 'unauthorized' } }));
			} else if (pathname.endsWith('/chat/completions')) {
				writeChatCompletion(response, String(body.model), { role: 'assistant', content: pathname.startsWith('/azure/') ? 'hello from azure' : pathname.startsWith('/keyless/') ? 'hello from keyless' : 'hello from chat completions' }, 'stop');
			} else if (pathname.endsWith('/responses')) {
				response.writeHead(200, { 'content-type': 'text/event-stream' });
				response.end(responsesMessageToSse({ content: [{ type: 'text', text: 'hello from responses' }], stopReason: 'stop' }));
			} else if (pathname.endsWith('/v1/messages')) {
				response.writeHead(200, { 'content-type': 'text/event-stream' });
				response.end(anthropicMessageToSse({ content: [{ type: 'text', text: 'hello from messages' }], stopReason: 'end_turn' }));
			} else if (pathname.endsWith('/interactions')) {
				writeInteraction(response, String(body.model), 'hello from gemini');
			} else {
				response.writeHead(404);
				response.end();
			}
		});

		try {
			// Endpoints as a user configures them, in the shapes the extension accepts.
			const settings: Record<Exclude<WireFormat, 'gemini'>, ICustomEndpointModelSettings> = {
				chatCompletions: { url: `${server.base}/openai/v1/chat/completions` },
				responses: { url: `${server.base}/openai/v1`, apiType: 'responses', thinking: true },
				messages: { url: `${server.base}/anthropic/v1/messages` },
				azure: { url: `${server.base}/azure/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview`, requestHeaders: { 'api-key': '${apiKey}' } },
			};
			const endpoints = Object.fromEntries(Object.entries(settings).map(([format, setting]) => {
				const { endpoint } = resolveCustomEndpointRuntimeEndpoint(setting);
				assert.ok(endpoint, `${format} is not routed directly`);
				return [format, endpoint];
			})) as Record<WireFormat, IByokEndpoint>;
			// Gemini's endpoint is fixed, so only its host is replaced.
			endpoints.gemini = { ...GEMINI_BYOK_ENDPOINT, baseUrl: `${server.base}/google/v1beta` };
			// One registered model source per format, each with its own key, as the window registers a provider group.
			const sources = (Object.keys(endpoints) as WireFormat[]).map(format => createSourceModel(`customendpoint/${format}`, { id: `model-${format}`, endpoint: endpoints[format], maxOutputTokens: 512 }, API_KEYS[format]));
			// A source that needs no key, such as an Ollama server, must not pick up keys from the environment.
			sources.push(createSourceModel('ollama/Local', { id: 'model-keyless', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: `${server.base}/keyless/v1` } }, undefined));

			const sessionId = 'byok-direct-endpoints';
			const byok = sessionConfig(sources);
			const { result: turns, keyFiles, sessionStates } = await withRuntime(client => withSession(client, {
				sessionId,
				model: sources[0].id,
				inference: byok,
				github: { capi: { enabled: false } },
				events: { streaming: true },
				tools: { availableTools: [] },
			}, async session => {
				// The id the agent host publishes is the runtime's selection id, so it is used as is in both directions.
				const results: { selected: boolean; reply: string | undefined }[] = [];
				for (const source of sources) {
					// As the agent host switches models: Responses models ask for no reasoning summary.
					await session.setModel(source.id, { reasoningSummary: omitsReasoningSummary(source.id, byok) ? 'none' : 'detailed' });
					const selected = (await session.rpc.model.getCurrent()).modelId === source.id;
					const reply = await session.sendAndWait({ prompt: 'Reply with a greeting.' }, 60_000);
					results.push({ selected, reply: reply?.type === 'assistant.message' ? reply.data.content : undefined });
				}
				return results;
			}));

			assert.deepStrictEqual({
				turns,
				requests: requests.filter(request => request.path !== '/models'),
				sessionStateWritten: sessionStates.includes(sessionId),
				keyFiles,
			}, {
				turns: [
					{ selected: true, reply: 'hello from chat completions' },
					{ selected: true, reply: 'hello from responses' },
					{ selected: true, reply: 'hello from messages' },
					{ selected: true, reply: 'hello from azure' },
					{ selected: true, reply: 'hello from gemini' },
					{ selected: true, reply: 'hello from keyless' },
				],
				// Each endpoint gets its own group's key. Chat Completions gets no output cap, which reasoning models would reject as `max_tokens`.
				requests: [
					{ path: '/openai/v1/chat/completions', auth: 'bearer:chatCompletions', model: 'model-chatCompletions', outputCap: [] },
					// No reasoning summary, which OpenAI only returns to verified organizations.
					{ path: '/openai/v1/responses', auth: 'bearer:responses', model: 'model-responses', outputCap: ['max_output_tokens'], reasoningSummary: null },
					{ path: '/anthropic/v1/messages', auth: 'x-api-key:messages', model: 'model-messages', outputCap: ['max_tokens'] },
					{ path: '/azure/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview', auth: 'api-key:azure', model: 'model-azure', outputCap: [] },
					{ path: '/google/v1beta/interactions?alt=sse', auth: 'x-goog-api-key:gemini', model: 'model-gemini', outputCap: ['generation_config.max_output_tokens'] },
					{ path: '/keyless/v1/chat/completions', auth: 'none', model: 'model-keyless', outputCap: [] },
				],
				sessionStateWritten: true,
				keyFiles: [],
			});
		} finally {
			await server.close();
		}
	});

	test('tool search keeps a model source\'s requests within the tool limit of OpenAI-compatible APIs', async function () {
		this.timeout(180_000);

		const requests: { readonly tools: number; readonly toolSearch: boolean }[] = [];
		const server = await startModelServer((_request, body, response) => {
			const names = (body.tools ?? []).map(tool => tool.function?.name);
			requests.push({ tools: names.length, toolSearch: names.includes('tool_search_tool') });
			writeChatCompletion(response, String(body.model), { role: 'assistant', content: 'hello' }, 'stop');
		});

		try {
			const source = createSourceModel('customendpoint/tools', { id: 'model-tools', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: `${server.base}/v1` } }, API_KEYS.chatCompletions);
			// More tools than the API accepts, as a client with several MCP servers publishes.
			const definitions = Array.from({ length: OPENAI_COMPATIBLE_MAX_TOOLS }, (_, index) => ({ name: `client_tool_${index}`, description: `Client tool ${index}`, parameters: { type: 'object', properties: {} } }));
			await withRuntime(async client => {
				// As the agent host launches a session on a model source's model, and without tool search.
				for (const search of [{ enabled: false }, { enabled: true, deferThreshold: OPENAI_COMPATIBLE_MAX_TOOLS }]) {
					await withSession(client, { model: source.id, inference: sessionConfig([source]), github: { capi: { enabled: false } }, events: { streaming: true }, tools: { definitions, search } }, session => session.sendAndWait({ prompt: 'Reply with a greeting.' }, 60_000));
				}
			});

			assert.deepStrictEqual(requests.map(request => ({ withinLimit: request.tools <= OPENAI_COMPATIBLE_MAX_TOOLS, toolSearch: request.toolSearch })), [
				{ withinLimit: false, toolSearch: false },
				{ withinLimit: true, toolSearch: true },
			]);
		} finally {
			await server.close();
		}
	});

	// The bundled runtime only redacts provider keys from the output a shell tool streams, not from its result: the
	// result reaches the model, the tool's events, and the session's events file with the key. Enable this once the
	// runtime redacts tool results.
	test.skip('the runtime redacts a model source\'s key from tool output', async function () {
		this.timeout(180_000);

		const key = API_KEYS.chatCompletions;
		const shell = isWindows ? 'powershell' : 'bash';
		let resultSentToModel: string | undefined;
		const server = await startModelServer((_request, body, response) => {
			const result = body.messages?.find(message => message.role === 'tool');
			if (result) {
				resultSentToModel = JSON.stringify(result.content);
				writeChatCompletion(response, String(body.model), { role: 'assistant', content: 'done' }, 'stop');
			} else {
				// The command prints a file holding the key, so only the tool's output carries it.
				const command = isWindows ? 'Get-Content key.txt' : 'cat key.txt';
				writeChatCompletion(response, String(body.model), { role: 'assistant', tool_calls: [{ index: 0, id: 'call_read_key', type: 'function', function: { name: shell, arguments: JSON.stringify({ command, description: 'Print the file' }) } }] }, 'tool_calls');
			}
		});
		const workingDirectory = await mkdtemp(`${tmpdir()}/byok-direct-workspace-`);

		try {
			await writeFile(join(workingDirectory, 'key.txt'), `KEY=${key}\n`);
			const source = createSourceModel('customendpoint/redaction', { id: 'model-redaction', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: `${server.base}/v1` } }, key);
			const toolResults: string[] = [];
			const { keyFiles } = await withRuntime(client => withSession(client, {
				model: source.id,
				workingDirectory,
				inference: sessionConfig([source]),
				github: { capi: { enabled: false } },
				permissions: { onRequest: approveAll },
				events: {
					streaming: true,
					onEvent: event => {
						if (event.type === 'tool.execution_complete') {
							toolResults.push(JSON.stringify(event.data));
						}
					},
				},
				tools: { availableTools: [shell] },
			}, session => session.sendAndWait({ prompt: 'Print key.txt.' }, 60_000)));

			assert.deepStrictEqual({
				ran: toolResults.some(result => result.includes('KEY=')),
				keyInToolResult: toolResults.some(result => result.includes(key)),
				keyInModelRequest: resultSentToModel?.includes(key),
				keyFiles,
			}, {
				ran: true,
				keyInToolResult: false,
				keyInModelRequest: false,
				keyFiles: [],
			});
		} finally {
			await server.close();
			await rm(workingDirectory, { recursive: true, force: true });
		}
	});
});
