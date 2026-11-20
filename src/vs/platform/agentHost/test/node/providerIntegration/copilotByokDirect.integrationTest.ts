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
import { Emitter, Event } from '../../../../../base/common/event.js';
import { join, relative } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { getByokLmAgentModelId, type IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { resolveCustomEndpointRuntimeEndpoint, type ICustomEndpointModelSettings } from '../../../common/byokCustomEndpoint.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { toAgentByokCurrentModel, toRuntimeByokModelId } from '../../../node/copilot/copilotByokModelIds.js';
import { synthesizeByokSessionConfig } from '../../../node/copilot/copilotSessionLauncher.js';
import { anthropicMessageToSse, responsesMessageToSse } from '../e2e/harness/capiWireCodec.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

type WireFormat = 'chatCompletions' | 'responses' | 'messages' | 'azure';

/** The auth a request carried, as a fixed label so key values never enter assertion data. */
type ObservedAuth = 'bearer' | 'x-api-key' | 'api-key' | 'none' | 'unexpected';

interface IObservedRequest {
	readonly path: string;
	readonly auth: ObservedAuth;
	readonly model: unknown;
}

const API_KEYS: Record<WireFormat, string> = {
	chatCompletions: 'direct-byok-key-chat-completions-6f1d',
	responses: 'direct-byok-key-responses-0a9c',
	messages: 'direct-byok-key-messages-b27e',
	azure: 'direct-byok-key-azure-4c58',
};

function observeAuth(request: IncomingMessage): ObservedAuth {
	const keys = new Set(Object.values(API_KEYS));
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
	if (typeof authorization === 'string' && authorization.startsWith('Bearer ') && keys.has(authorization.slice('Bearer '.length))) {
		return 'bearer';
	}
	if (typeof xApiKey === 'string' && keys.has(xApiKey)) {
		return 'x-api-key';
	}
	if (typeof apiKey === 'string' && keys.has(apiKey)) {
		return 'api-key';
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

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the bundled runtime calls each wire format with the group key and keeps the key off disk', async function () {
		this.timeout(180_000);

		const requests: IObservedRequest[] = [];
		const { createServer } = await import('http');
		const server = createServer((request, response) => {
			void (async () => {
				const body = JSON.parse(await readBody(request) || '{}');
				const path = request.url ?? '';
				const auth = observeAuth(request);
				requests.push({ path, auth, model: body.model });
				const pathname = path.split('?')[0];
				const expectedAuth: ObservedAuth = pathname.startsWith('/anthropic/') ? 'x-api-key' : pathname.startsWith('/azure/') ? 'api-key' : 'bearer';
				if (auth !== expectedAuth) {
					response.writeHead(401, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ error: { message: 'unauthorized' } }));
					return;
				}
				if (pathname.endsWith('/chat/completions')) {
					writeChatCompletion(response, String(body.model), pathname.startsWith('/azure/') ? 'hello from azure' : 'hello from chat completions');
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
			responses: { url: `${base}/openai/v1`, apiType: 'responses' },
			messages: { url: `${base}/anthropic/v1/messages` },
			azure: { url: `${base}/azure/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview`, requestHeaders: { 'api-key': '${apiKey}' } },
		};
		const formats = Object.keys(settings) as WireFormat[];
		const byokModels: IByokLmModelInfo[] = formats.map(format => {
			const endpoint = resolveCustomEndpointRuntimeEndpoint(settings[format]).endpoint;
			assert.ok(endpoint, `${format} is not routed directly`);
			return { vendor: 'customendpoint', id: `model-${format}`, modelIdentifier: `customendpoint/${format}/model-${format}`, supportsToolCalls: true, direct: { ...endpoint, group: format } };
		});

		const sessionId = 'byok-direct-endpoints';
		const homeDirectory = await mkdtemp(`${tmpdir()}/byok-direct-`);
		const models = store.add(new Emitter<IByokLmModelInfo[]>());
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client', {
			chat: async () => ({ output: [], error: 'not routed through the bridge' }),
			resolveCredential: async ({ group }) => ({ apiKey: API_KEYS[group as WireFormat] }),
			onDidChangeModels: models.event,
			onDidDelta: Event.None,
		});
		models.fire(byokModels);
		const client = new CopilotClient({
			// The agent host's main runtime client uses this mode.
			mode: 'coding-agent',
			runtime: RuntimeConnection.forSpawnedStdio({
				env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(homeDirectory)),
			}),
			github: { useLoggedInUser: false },
			observability: { logLevel: 'all' },
		});
		let clientStarted = false;
		let session: Awaited<ReturnType<CopilotClient['createSession']>> | undefined;

		try {
			const byok = await synthesizeByokSessionConfig(sessionId, registry, () => Promise.reject(new Error('the proxy is not needed')), new NullLogService());
			const agentModelIds = byokModels.map(getByokLmAgentModelId);
			await client.start();
			clientStarted = true;
			session = await client.createSession({
				sessionId,
				model: toRuntimeByokModelId(agentModelIds[0], byok),
				inference: byok,
				github: { capi: { enabled: false } },
				events: { streaming: true },
				tools: { availableTools: [] },
			});

			const turns: { selected: string | undefined; reply: string | undefined }[] = [];
			for (const agentModelId of agentModelIds) {
				await session.rpc.model.switchTo({ modelId: toRuntimeByokModelId(agentModelId, byok) });
				const selected = toAgentByokCurrentModel(await session.rpc.model.getCurrent()).modelId;
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
				if (Object.values(API_KEYS).some(key => content.includes(key))) {
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
					{ selected: 'customendpoint/chatCompletions/model-chatCompletions', reply: 'hello from chat completions' },
					{ selected: 'customendpoint/responses/model-responses', reply: 'hello from responses' },
					{ selected: 'customendpoint/messages/model-messages', reply: 'hello from messages' },
					{ selected: 'customendpoint/azure/model-azure', reply: 'hello from azure' },
				],
				requests: [
					{ path: '/openai/v1/chat/completions', auth: 'bearer', model: 'model-chatCompletions' },
					{ path: '/openai/v1/responses', auth: 'bearer', model: 'model-responses' },
					{ path: '/anthropic/v1/messages', auth: 'x-api-key', model: 'model-messages' },
					{ path: '/azure/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview', auth: 'api-key', model: 'model-azure' },
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
					registration.dispose();
					await new Promise(resolve => server.close(resolve));
					await rm(homeDirectory, { recursive: true, force: true });
				}
			}
		}
	});
});
