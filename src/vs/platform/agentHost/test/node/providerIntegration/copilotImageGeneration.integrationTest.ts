/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, readFile, rm } from 'fs/promises';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { basename, join, relative, sep } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CopilotCliConfigKey } from '../../../common/copilotCliConfig.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { ROOT_STATE_URI, type RootState } from '../../../common/state/sessionState.js';
import type { SubscribeResult } from '../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { driveTurnWithModelToCompletion } from '../e2e/harness/agentHostE2ETestHarness.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { createTestDirectory } from '../e2e/harness/testDirectories.js';
import { createProviderSession } from '../providerIntegrationTestHelpers.js';
import { startRealServer, stopServer, TestProtocolClient, type IServerHandle, defaultChatChannel, isActionNotification, getActionEnvelope } from '../serverIntegrationTestHelpers.js';

interface IChatRequest {
	readonly model: string;
	readonly stream?: boolean;
	readonly messages: readonly { readonly role: string; readonly content: string | readonly { readonly text?: string }[] | null }[];
	readonly tools?: readonly { readonly name?: string; readonly function?: { readonly name: string } }[];
}

/** A 1x1 PNG, which the Copilot CLI's own tests save as `image-dc2f9147f39d1c93.png`. */
const GENERATED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAABHNCSVQICAgIfAhkiAAAAAFzUkdCAK7OHOkAAAANSURBVAiZY2BgYPgPAAEEAQB9ssjfAAAAAElFTkSuQmCC';

function messageText(content: IChatRequest['messages'][number]['content']): string {
	return typeof content === 'string' ? content : (content ?? []).map(part => part.text ?? '').join('');
}

function offersImageTool(chat: IChatRequest): boolean {
	return !!chat.tools?.some(tool => (tool.name ?? tool.function?.name) === 'image_generation');
}

suite('Agent Host Provider Integration — Copilot image generation', function () {
	this.timeout(120_000);
	ensureNoDisposablesAreLeakedInTestSuite();

	let directory: string;
	let endpoint: string;
	let collector: Server | undefined;
	let host: IServerHandle | undefined;
	let client: TestProtocolClient | undefined;
	let imageModelAvailable: boolean;
	const requests: IChatRequest[] = [];
	const unexpectedRequests: string[] = [];
	const imageRequests: string[] = [];
	/** Answers chat requests in place of the default reply, for tests that call the image tool. */
	let respond: ((chat: IChatRequest) => { readonly message: object; readonly finishReason: string }) | undefined;
	/** The image the synthetic image endpoint returns, for tests that generate one. */
	let generatedImage: string | undefined;
	const config = { provider: 'copilotcli', scheme: 'copilotcli', githubToken: 'synthetic-no-real-credential' };

	setup(async () => {
		directory = createTestDirectory(join(tmpdir(), 'copilot-image-generation-'));
		await mkdir(join(directory, 'workspace'));
		requests.length = 0;
		unexpectedRequests.length = 0;
		imageRequests.length = 0;
		respond = undefined;
		generatedImage = undefined;
		const { createServer } = await import('http');
		collector = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://localhost').pathname;
			let body = '';
			for await (const chunk of request) {
				body += chunk;
			}
			if (path === '/chat/completions' && request.method === 'POST') {
				const chat: IChatRequest = JSON.parse(body);
				requests.push(chat);
				const { message, finishReason } = respond?.(chat) ?? { message: { role: 'assistant', content: 'IMAGE_TOOL_READY' }, finishReason: 'stop' };
				const completion = {
					id: 'synthetic-image-tool-completion', model: chat.model,
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				};
				if (chat.stream) {
					response.writeHead(200, { 'content-type': 'text/event-stream' });
					response.end(`data: ${JSON.stringify({ ...completion, choices: [{ index: 0, delta: message, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`);
				} else {
					response.writeHead(200, { 'content-type': 'application/json' });
					response.end(JSON.stringify({ ...completion, choices: [{ index: 0, message, finish_reason: finishReason }] }));
				}
				return;
			}
			if (path === '/v1/images/generations' && request.method === 'POST' && generatedImage) {
				imageRequests.push(`${request.method} ${path}`);
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ created: 1, data: [{ b64_json: generatedImage }], output_format: 'png' }));
				return;
			}
			const stub = getAncillaryStub(request.method ?? 'GET', path, body);
			if (stub) {
				let content = stub.body.replaceAll('${capi}', endpoint);
				if (path === '/models' && imageModelAvailable) {
					const catalog: { data: object[] } = JSON.parse(content);
					catalog.data.push({
						id: 'gpt-image-2.5-flare', name: 'Synthetic authorized image model',
						capabilities: { type: 'image' }, supported_endpoints: ['/v1/images/generations'],
						model_picker_enabled: false, policy: { state: 'enabled' },
					});
					content = JSON.stringify(catalog);
				}
				response.writeHead(stub.status, stub.headers);
				response.end(content);
				return;
			}
			const target = `${request.method} ${path}`;
			if (path.includes('/images/')) {
				imageRequests.push(target);
			} else {
				unexpectedRequests.push(target);
			}
			response.writeHead(500, { 'x-should-retry': 'false' });
			response.end('Unexpected synthetic endpoint');
		});
		await new Promise<void>(resolve => collector!.listen(0, '127.0.0.1', resolve));
		const address = collector.address();
		assert.ok(address && typeof address !== 'string');
		endpoint = `http://127.0.0.1:${address.port}`;
	});

	teardown(async function () {
		this.timeout(60_000);
		client?.close();
		client = undefined;
		try {
			await stopServer(host);
			host = undefined;
		} finally {
			try {
				if (collector) {
					collector.closeAllConnections();
					await new Promise<void>((resolve, reject) => collector!.close(error => error ? reject(error) : resolve()));
					collector = undefined;
				}
			} finally {
				await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		}
	});

	async function startHost(): Promise<TestProtocolClient> {
		host = await startRealServer({
			homeDir: directory, userDataDir: join(directory, 'user-data'),
			env: {
				COPILOT_API_URL: endpoint, COPILOT_DEBUG_GITHUB_API_URL: endpoint,
				VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: endpoint,
				COPILOT_MANAGED_SETTINGS_CACHE: '0', COPILOT_TELEMETRY_ENABLED: 'false',
				IMAGE_GENERATION_TOOL: 'false',
			},
		});
		client = new TestProtocolClient(host.port);
		await client.connect();
		return client;
	}

	/** Opts in to image generation through the host's root configuration, as the workbench does. */
	async function enableImages(connection: TestProtocolClient, clientSeq: number): Promise<void> {
		const result = await connection.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		const root = result.snapshot?.state as RootState | undefined;
		assert.ok(root, 'The host must publish its root configuration');
		if (root.config?.values[CopilotCliConfigKey.ImageGeneration] === true) {
			return;
		}
		connection.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq,
			action: { type: ActionType.RootConfigChanged, config: { [CopilotCliConfigKey.ImageGeneration]: true } },
		});
		await connection.waitForNotification(notification =>
			isActionNotification(notification, ActionType.RootConfigChanged)
			&& getActionEnvelope(notification).origin?.clientSeq === clientSeq);
	}

	for (const { available, optIn } of [{ available: true, optIn: true }, { available: false, optIn: true }, { available: true, optIn: false }]) {
		test(`${!optIn ? 'withholds the default-off' : available ? 'offers the authorized' : 'withholds the unavailable'} image tool on create and cold host resume`, async () => {
			imageModelAvailable = available;
			let connection = await startHost();
			const enableImagesIfOptedIn = async (clientSeq: number) => {
				if (optIn) {
					await enableImages(connection, clientSeq);
				}
			};
			const session = await createProviderSession(connection, config, 'image-tool-client', [], URI.file(join(directory, 'workspace')), () => enableImagesIfOptedIn(1));
			const offered: boolean[] = [];
			const responses: string[] = [];
			const run = async (turnId: string, sequence: number) => {
				const prompt = `Reply IMAGE_TOOL_READY for ${turnId}.`;
				const completed = await driveTurnWithModelToCompletion(connection, session, turnId, prompt, 'gpt-4o', sequence);
				responses.push(completed.responseText.trim());
				const matching = requests.filter(request => request.tools?.length && JSON.stringify(request.messages).includes(prompt));
				assert.ok(matching.length > 0, 'The real SDK must send the test turn to the local model');
				offered.push(matching.every(request => request.tools?.some(tool => (tool.name ?? tool.function?.name) === 'image_generation')));
			};
			await run('image-first', 2);
			connection.close();
			await stopServer(host);
			host = undefined;
			connection = await startHost();
			await connection.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'image-tool-client' }, 30_000);
			await enableImagesIfOptedIn(99);
			await connection.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: config.githubToken }, 30_000);
			await connection.call('subscribe', { channel: session }, 30_000);
			await connection.call('subscribe', { channel: defaultChatChannel(session) }, 30_000);
			await run('image-resumed', 100);
			assert.deepStrictEqual({ offered, responses, unexpectedRequests, imageRequests }, {
				offered: [available && optIn, available && optIn], responses: ['IMAGE_TOOL_READY', 'IMAGE_TOOL_READY'],
				unexpectedRequests: [], imageRequests: [],
			});
		});
	}

	test('saves a generated image in the session folder and gives the agent its path', async () => {
		imageModelAvailable = true;
		generatedImage = GENERATED_PNG;
		// Calls the image tool once, then answers once its result comes back.
		respond = chat => offersImageTool(chat) && !chat.messages.some(message => message.role === 'tool')
			? {
				message: { role: 'assistant', content: null, tool_calls: [{ index: 0, id: 'call_image', type: 'function', function: { name: 'image_generation', arguments: JSON.stringify({ prompt: 'A red dot' }) } }] },
				finishReason: 'tool_calls',
			}
			: { message: { role: 'assistant', content: 'IMAGE_SAVED' }, finishReason: 'stop' };
		const connection = await startHost();
		const session = await createProviderSession(connection, config, 'image-tool-client', [], URI.file(join(directory, 'workspace')), () => enableImages(connection, 1));

		const completed = await driveTurnWithModelToCompletion(connection, session, 'image-saved', 'Generate a red dot.', 'gpt-4o', 2);
		// What the real SDK sent the model as the image tool's result.
		const toolResult = requests.flatMap(request => request.messages).filter(message => message.role === 'tool').map(message => messageText(message.content)).join('\n');
		const [resultText, hookGuidance] = toolResult.split('\n\nTool "image_generation" succeeded. Additional guidance from postToolUse hooks:\n');
		const path = /^path: (?<path>.+)$/m.exec(resultText)?.groups?.path;
		const location = path ? relative(directory, path).split(sep) : [];

		assert.deepStrictEqual({
			response: completed.responseText.trim(),
			toolResult: resultText.replace(/sha256:[0-9a-f]{64}/, 'sha256:<id>').replaceAll(path ?? '<no path>', '<path>'),
			missingPresentationGuidance: [
				'already displayed in the chat',
				'listed as artifacts',
				'Do not embed them again in Markdown',
				'or register them with add_artifact_or_reference',
			].filter(clause => !hookGuidance?.includes(clause)),
			location: { insideHome: location[0] !== '..', folder: [location.at(-4), location.at(-2)], fileName: path && basename(path) },
			savedImage: path ? (await readFile(path)).equals(Buffer.from(GENERATED_PNG, 'base64')) : false,
			imageRequests,
			unexpectedRequests,
		}, {
			response: 'IMAGE_SAVED',
			toolResult: 'Image generated successfully.\nimage_id: sha256:<id>\npath: <path>\nsaved_to: <path>',
			missingPresentationGuidance: [],
			location: { insideHome: true, folder: ['session-state', 'images'], fileName: 'image-dc2f9147f39d1c93.png' },
			savedImage: true,
			imageRequests: ['POST /v1/images/generations'],
			unexpectedRequests: [],
		});
	});
});
