/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { existsSync } from 'fs';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient, RuntimeConnection } from '@microsoft/copilot-sdk';
import { join, relative } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { resolveCustomEndpointRuntimeEndpoint, type ICustomEndpointModelSettings } from '../../../common/byokCustomEndpoint.js';
import { BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT } from '../../../common/byokModelSource.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { getCopilotModelSourceModels } from '../../../node/copilot/copilotModelSources.js';
import { withLocalModelSessionConfig } from '../../../node/copilot/copilotSessionLauncher.js';
import { anthropicMessageToSse, responsesMessageToSse } from '../e2e/harness/capiWireCodec.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

type WireFormat = 'chatCompletions' | 'responses' | 'messages' | 'azure';

/**
 * The auth a request carried: the header, and whose key it was, as fixed labels
 * so key values never enter assertion data.
 */
type ObservedAuth = `${'bearer' | 'x-api-key' | 'api-key'}:${WireFormat}` | 'none' | 'unexpected';

interface IObservedRequest {
	readonly path: string;
	readonly auth: ObservedAuth;
	readonly model: unknown;
	/** The output token cap fields the request set. */
	readonly outputCap: readonly string[];
}

/** A key in the runtime's environment, which no request may carry. */
const AMBIENT_KEY = 'ambient-provider-key-93d0';

const API_KEYS: Record<WireFormat, string> = {
	chatCompletions: 'direct-byok-key-chat-completions-6f1d',
	responses: 'direct-byok-key-responses-0a9c',
	messages: 'direct-byok-key-messages-b27e',
	azure: 'direct-byok-key-azure-4c58',
};

function observeAuth(request: IncomingMessage): ObservedAuth {
	const owner = (key: string) => (Object.keys(API_KEYS) as WireFormat[]).find(format => API_KEYS[format] === key);
	const authorization = request.headers.authorization;
	const xApiKey = request.headers['x-api-key'];
	const apiKey = request.headers['api-key'];
	const sent = [authorization, xApiKey, apiKey].filter(value => value !== undefined);
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
	const xApiKeyOwner = typeof xApiKey === 'string' ? owner(xApiKey) : undefined;
	if (xApiKeyOwner) {
		return `x-api-key:${xApiKeyOwner}`;
	}
	const apiKeyOwner = typeof apiKey === 'string' ? owner(apiKey) : undefined;
	if (apiKeyOwner) {
		return `api-key:${apiKeyOwner}`;
	}
	return 'unexpected';
}

async function readBody(request: IncomingMessage): Promise<string> {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
	}
	return body;
}

function writeChatCompletion(response: ServerResponse, model: string, text: string): void {
	const chunk = (delta: Record<string, unknown>, finishReason: string | null) => `data: ${JSON.stringify({ id: 'chatcmpl-direct', object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
	response.writeHead(200, { 'content-type': 'text/event-stream' });
	response.write(chunk({ role: 'assistant', content: text }, null));
	response.write(chunk({}, 'stop'));
	response.write(`data: ${JSON.stringify({ id: 'chatcmpl-direct', object: 'chat.completion.chunk', created: 0, model, choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
	response.end('data: [DONE]\n\n');
}

/**
 * Checks that the bundled runtime calls a Custom Endpoint BYOK model itself,
 * the way the agent host registers it when the window routes it directly: the
 * endpoint from the production Custom Endpoint mapping, the group key fetched
 * over the bridge, and the runtime ids the agent host translates to and from.
 * Each wire format gets one turn against a loopback server that only accepts
 * the matching auth header. The isolated home is then searched for the keys,
 * which the runtime must not write to session state or logs.
 */
suite('Agent Host Provider Integration - Copilot BYOK direct endpoints', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('the bundled runtime calls each wire format with the group key and keeps the key off disk', async function () {
		this.timeout(180_000);

		const requests: IObservedRequest[] = [];
		const { createServer } = await import('http');
		const server = createServer((request, response) => {
			void (async () => {
				const body = JSON.parse(await readBody(request) || '{}');
				const path = request.url ?? '';
				const auth = observeAuth(request);
				requests.push({ path, auth, model: body.model, outputCap: ['max_tokens', 'max_completion_tokens', 'max_output_tokens'].filter(field => body[field] !== undefined) });
				const pathname = path.split('?')[0];
				const expectedAuth = pathname.startsWith('/anthropic/') ? 'x-api-key' : pathname.startsWith('/azure/') ? 'api-key' : pathname.startsWith('/keyless/') ? 'none' : 'bearer';
				if (auth.split(':')[0] !== expectedAuth) {
					response.writeHead(401, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: { message: 'unauthorized' } }));
					return;
				}
				if (pathname.endsWith('/chat/completions')) {
					writeChatCompletion(response, String(body.model), pathname.startsWith('/azure/') ? 'hello from azure' : pathname.startsWith('/keyless/') ? 'hello from keyless' : 'hello from chat completions');
				} else if (pathname.endsWith('/responses')) {
					response.writeHead(200, { 'content-type': 'text/event-stream' });
					response.end(responsesMessageToSse({ content: [{ type: 'text', text: 'hello from responses' }], stopReason: 'stop' }));
				} else if (pathname.endsWith('/v1/messages')) {
					response.writeHead(200, { 'content-type': 'text/event-stream' });
					response.end(anthropicMessageToSse({ content: [{ type: 'text', text: 'hello from messages' }], stopReason: 'end_turn' }));
				} else {
					response.writeHead(404);
					response.end();
				}
			})();
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

		// Endpoints as a user configures them, in the shapes the extension accepts.
		const settings: Record<WireFormat, ICustomEndpointModelSettings> = {
			chatCompletions: { url: `${base}/openai/v1/chat/completions` },
			responses: { url: `${base}/openai/v1`, apiType: 'responses', thinking: true },
			messages: { url: `${base}/anthropic/v1/messages` },
			azure: { url: `${base}/azure/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview`, requestHeaders: { 'api-key': '${apiKey}' } },
		};
		const formats = Object.keys(settings) as WireFormat[];
		// One registered model source per format, each with its own key, as the window registers a provider group.
		const sources = formats.map(format => {
			const { endpoint } = resolveCustomEndpointRuntimeEndpoint(settings[format]);
			assert.ok(endpoint, `${format} is not routed directly`);
			return getCopilotModelSourceModels({ id: `vscode.byok/copilotcli/customendpoint/${format}`, format: BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT, definition: { models: [{ id: `model-${format}`, endpoint, toolCalling: true, maxOutputTokens: 512 }], requiresCredential: true }, credential: API_KEYS[format] })[0];
		});

		// A source that needs no key, such as an Ollama server, must not pick up keys from the environment.
		sources.push(getCopilotModelSourceModels({ id: 'vscode.byok/copilotcli/ollama/Local', format: BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT, definition: { models: [{ id: 'model-keyless', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: `${base}/keyless/v1` }, toolCalling: true }], requiresCredential: false } })[0]);

		const sessionId = 'byok-direct-endpoints';
		const homeDirectory = await mkdtemp(`${tmpdir()}/byok-direct-`);
		const client = new CopilotClient({
			// The agent host's main runtime client uses this mode.
			mode: 'coding-agent',
			runtime: RuntimeConnection.forSpawnedStdio({
				env: { ...createCopilotCliEnvironment(createIsolatedProviderEnvironment(homeDirectory)), OPENAI_API_KEY: AMBIENT_KEY, ANTHROPIC_API_KEY: AMBIENT_KEY },
			}),
			github: { useLoggedInUser: false },
			observability: { logLevel: 'all' },
		});
		let clientStarted = false;
		let session: Awaited<ReturnType<CopilotClient['createSession']>> | undefined;

		try {
			const byok = withLocalModelSessionConfig({}, undefined, {
				providers: sources.map(source => source.runtimeProvider),
				models: sources.map(source => source.runtimeModel),
			});
			await client.start();
			clientStarted = true;
			session = await client.createSession({
				sessionId,
				model: sources[0].id,
				inference: byok,
				github: { capi: { enabled: false } },
				events: { streaming: true },
				tools: { availableTools: [] },
			});

			// The id the agent host publishes is the runtime's selection id, so it is used as is in both directions.
			const turns: { selected: boolean; reply: string | undefined }[] = [];
			for (const source of sources) {
				await session.rpc.model.switchTo({ modelId: source.id });
				const selected = (await session.rpc.model.getCurrent()).modelId === source.id;
				const reply = await session.sendAndWait({ prompt: 'Reply with a greeting.' }, 60_000);
				turns.push({ selected, reply: reply?.type === 'assistant.message' ? reply.data.content : undefined });
			}
			await session.disconnect();
			session = undefined;
			await client.stop();
			clientStarted = false;

			const keyFiles: string[] = [];
			const files = (await readdir(homeDirectory, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile());
			for (const file of files) {
				const path = join(file.parentPath, file.name);
				const content = await readFile(path, 'utf8');
				if ([...Object.values(API_KEYS), AMBIENT_KEY].some(key => content.includes(key))) {
					keyFiles.push(relative(homeDirectory, path));
				}
			}

			assert.deepStrictEqual({
				turns,
				requests: requests.filter(request => request.path !== '/models'),
				sessionStateWritten: existsSync(join(homeDirectory, '.copilot', 'session-state', sessionId)),
				keyFiles,
			}, {
				turns: [
					{ selected: true, reply: 'hello from chat completions' },
					{ selected: true, reply: 'hello from responses' },
					{ selected: true, reply: 'hello from messages' },
					{ selected: true, reply: 'hello from azure' },
					{ selected: true, reply: 'hello from keyless' },
				],
				// Each endpoint gets its own group's key. Chat Completions gets no output cap, which reasoning models would reject as `max_tokens`.
				requests: [
					{ path: '/openai/v1/chat/completions', auth: 'bearer:chatCompletions', model: 'model-chatCompletions', outputCap: [] },
					{ path: '/openai/v1/responses', auth: 'bearer:responses', model: 'model-responses', outputCap: ['max_output_tokens'] },
					{ path: '/anthropic/v1/messages', auth: 'x-api-key:messages', model: 'model-messages', outputCap: ['max_tokens'] },
					{ path: '/azure/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview', auth: 'api-key:azure', model: 'model-azure', outputCap: [] },
					{ path: '/keyless/v1/chat/completions', auth: 'none', model: 'model-keyless', outputCap: [] },
				],
				sessionStateWritten: true,
				keyFiles: [],
			});
		} finally {
			try {
				await session?.disconnect();
			} finally {
				try {
					if (clientStarted) {
						await client.stop();
					}
				} finally {
					await new Promise(resolve => server.close(resolve));
					await rm(homeDirectory, { recursive: true, force: true });
				}
			}
		}
	});
});
