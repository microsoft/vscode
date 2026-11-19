/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { DeferredPromise, raceTimeout, retry } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { AgentSession, fixedChatOwnerRef, type IAgentChatContext } from '../../../common/agent.js';
import { AgentHostCanvasesEnabledConfigKey } from '../../../common/agentHostSchema.js';
import type { CanvasState } from '../../../common/state/protocol/channels-canvas/state.js';
import type { ToolCallPendingConfirmationState } from '../../../common/state/protocol/channels-chat/state.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { createTestDirectory } from '../e2e/harness/testDirectories.js';
import { createLocalEndpointCopilotAgent } from './copilotAgentIntegrationTestHarness.js';
import { extensionEnvironmentSentinels, fakeCapiCredentialForLabel, labelTestCredential, replaceCredentialEnvironment } from './copilotCredentialTestUtils.js';

interface IModelToolCall {
	readonly name: string;
	readonly arguments: object;
}

/**
 * Native Copilot extensions through the production Copilot agent, its extension launcher, and the bundled runtime. An
 * extension with an `extension.json` sidecar stays dormant until its canvas is opened or one of its tools is called.
 */
suite('Agent Host Provider Integration — Copilot native extensions', function () {
	const resource = 'https://api.github.com';
	let server: Server;
	let directory: string;
	let store: DisposableStore;
	let agent: ReturnType<typeof createLocalEndpointCopilotAgent> | undefined;
	let restoreEnvironment: (() => void) | undefined;
	const unexpectedRequests: string[] = [];
	/** The tool calls the model makes for a prompt that contains the key. */
	const toolCallsByPrompt = new Map<string, readonly IModelToolCall[]>();
	/** The tool results the model received, in order. */
	const toolResults: string[] = [];
	/** The latest tool definitions the model received, by name. */
	const modelTools = new Map<string, unknown>();

	setup(async () => {
		restoreEnvironment = replaceCredentialEnvironment(extensionEnvironmentSentinels);
		unexpectedRequests.length = 0;
		toolCallsByPrompt.clear();
		toolResults.length = 0;
		modelTools.clear();
		store = new DisposableStore();
		directory = createTestDirectory(join(tmpdir(), 'copilot-native-extensions-'));
		const { createServer } = await import('http');
		let endpoint = '';
		server = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://localhost').pathname;
			let body = '';
			for await (const chunk of request) {
				body += chunk;
			}
			const json = (value: object) => {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify(value));
			};
			if (path === '/user') {
				json({ login: 'native-extensions-user', id: 1, type: 'User' });
			} else if (path === '/copilot_internal/managed_settings') {
				json({});
			} else if (path === '/chat/completions' && request.method === 'POST' && !body.includes('"stream":false')) {
				json(respondToModelRequest(JSON.parse(body)));
			} else if (path.includes('/copilot_internal/') && (path.includes('/token') || path.includes('/nltoken'))) {
				json({ token: fakeCapiCredentialForLabel(labelTestCredential(request.headers.authorization)), expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_in: 1800, endpoints: { api: endpoint, proxy: endpoint, telemetry: endpoint } });
			} else {
				const stub = getAncillaryStub(request.method ?? 'GET', path, body);
				if (stub) {
					response.writeHead(stub.status, stub.headers);
					response.end(stub.body.replaceAll('${capi}', endpoint));
				} else {
					unexpectedRequests.push(`${request.method} ${path}`);
					response.writeHead(500, { 'x-should-retry': 'false' });
					response.end();
				}
			}
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		endpoint = `http://127.0.0.1:${address.port}`;
	});

	teardown(async () => {
		try {
			// Runtime processes must stop before the endpoint closes and their home is removed, also after a failed test.
			await agent?.shutdown();
			agent = undefined;
			store.dispose();
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
			await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		} finally {
			restoreEnvironment?.();
			restoreEnvironment = undefined;
		}
	});

	/** Answers with the tool calls the latest prompt asks for, then with text once their results arrive. */
	function respondToModelRequest(request: { readonly messages: readonly { readonly role: string; readonly content?: unknown }[]; readonly tools?: readonly { readonly function?: { readonly name?: string } }[] }): object {
		for (const tool of request.tools ?? []) {
			if (tool.function?.name) {
				modelTools.set(tool.function.name, tool);
			}
		}
		const text = (content: unknown) => typeof content === 'string' ? content : JSON.stringify(content ?? '');
		const lastAssistant = request.messages.findLastIndex(message => message.role === 'assistant');
		const results = request.messages.slice(lastAssistant + 1).filter(message => message.role === 'tool');
		const prompt = text(request.messages.findLast(message => message.role === 'user')?.content);
		const calls = results.length === 0 ? [...toolCallsByPrompt].find(([key]) => prompt.includes(key))?.[1] : undefined;
		toolResults.push(...results.map(result => text(result.content)));
		return {
			id: `native-extensions-${request.messages.length}`,
			choices: [{
				index: 0,
				message: calls
					? { role: 'assistant', content: null, tool_calls: calls.map((call, index) => ({ id: `call-${request.messages.length}-${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) }
					: { role: 'assistant', content: 'Done.' },
				finish_reason: calls ? 'tool_calls' : 'stop',
			}],
			usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
		};
	}

	/** Starts a chat in `workspace` whose first turn has completed, so its runtime discovered the workspace's extensions. */
	async function startChat(name: string, workspace: string) {
		const copilot = createLocalEndpointCopilotAgent(store, directory, `http://127.0.0.1:${(server.address() as { port: number }).port}`, { [AgentHostCanvasesEnabledConfigKey]: true });
		agent = copilot;
		await copilot.authenticate(resource, 'legacy-l', 7200);
		const session = AgentSession.uri('copilotcli', name);
		const chat = URI.parse(buildDefaultChatUri(session.toString()));
		const context: IAgentChatContext = { resource: session, owner: fixedChatOwnerRef(session), sessionSettings: undefined, launchWorkingDirectories: undefined, workspaceless: false };
		assert.ok(await copilot.chats.createChat(chat, context, { deferBacking: true, model: { id: 'gpt-4o' }, workingDirectories: [URI.file(workspace)] }));
		store.add(copilot.onDidChatProgress(signal => {
			if (signal.kind === 'pending_confirmation') {
				copilot.respondToPermissionRequest(signal.state.toolCallId, true);
			}
		}));
		let turns = 0;
		const send = async (prompt: string) => {
			const turnId = `turn-${++turns}`;
			const completed = new DeferredPromise<boolean>();
			const observed: string[] = [];
			const listener = copilot.onDidChatProgress(signal => {
				observed.push(signal.kind === 'action' ? signal.action.type : signal.kind);
				if (signal.kind === 'action' && signal.action.type === ActionType.ChatTurnComplete && signal.action.turnId === turnId) {
					void completed.complete(true);
				}
			});
			try {
				await copilot.chats.prepareTurn!(chat, turnId, [URI.file(workspace)], context);
				await copilot.chats.sendMessage(chat, prompt, [URI.file(workspace)], undefined, turnId, undefined, context);
				assert.notStrictEqual(await raceTimeout(completed.p, 60_000), undefined, `Turn ${turnId} must complete; observed ${JSON.stringify(observed)}; results ${JSON.stringify(toolResults)}`);
			} finally {
				listener.dispose();
			}
		};
		await send('Hello');
		return { copilot, session, chat, context, send };
	}

	test('reports a lazy canvas extension as dormant until a canvas opened from the UI starts it once, and runs its action for the model', async function () {
		this.timeout(180_000);
		const workspace = join(directory, 'workspace');
		const extensionDirectory = join(workspace, '.github', 'extensions', 'lazy-canvas');
		// Outside the extension directory, so that writing it never reloads the extension.
		const launchLog = join(directory, 'lazy-canvas-launches.log');
		await mkdir(extensionDirectory, { recursive: true });
		await writeFile(join(extensionDirectory, 'extension.json'), JSON.stringify({
			version: 1,
			initialization: 'module',
			canvases: [{
				id: 'lazy-canvas',
				displayName: 'Lazy canvas',
				description: 'Starts on first use.',
				actions: [{ name: 'record', description: 'Records a label.', inputSchema: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] } }],
			}],
		}), 'utf8');
		await writeFile(join(extensionDirectory, 'extension.mjs'), `
import { appendFileSync } from 'node:fs';
import { createCanvas, joinSession } from '@microsoft/copilot-sdk/extension';
import declaration from './extension.json' with { type: 'json' };
appendFileSync(${JSON.stringify(launchLog)}, \`\${process.pid}\\n\`);
const labels = [];
await joinSession({
	canvases: { definitions: declaration.canvases.map(canvas => createCanvas({
		...canvas,
		actions: canvas.actions.map(action => ({ ...action, handler: ({ instanceId, input }) => {
			labels.push(input.label);
			return { instanceId, labels };
		} })),
		open: ({ instanceId }) => ({ url: \`http://127.0.0.1:43119/\${instanceId}\` }),
	})) },
});
`, 'utf8');
		const launches = async () => existsSync(launchLog) ? (await readFile(launchLog, 'utf8')).split('\n').filter(Boolean).length : 0;

		const { copilot, session, chat, context, send } = await startChat('lazy-canvas', workspace);
		const canvases: CanvasState[] = [];
		store.add(copilot.onDidChatProgress(signal => {
			if (signal.kind === 'canvas' && signal.state) {
				canvases.push(signal.state);
			}
		}));
		const status = async () => (await copilot.listAgentExtensions(session, chat)).extensions.find(extension => extension.id === 'project:lazy-canvas')?.status;
		const open = async () => (await copilot.openSessionCanvas(session, { canvasId: 'lazy-canvas', extensionId: 'project:lazy-canvas', instanceId: 'lazy' }, chat, context)).kind;

		const beforeFirstOpen = { status: await status(), definitions: await copilot.listSessionCanvases(session, chat, context), launches: await launches() };
		const firstOpen = await open();
		await retry(async () => assert.ok(canvases.some(canvas => canvas.instanceId === 'lazy' && canvas.uri)), 100, 300);
		const afterFirstOpen = { result: firstOpen, uri: canvases.findLast(canvas => canvas.instanceId === 'lazy')?.uri, status: await status(), launches: await launches() };
		const repeatedOpen = { result: await open(), launches: await launches() };
		toolCallsByPrompt.set('RUN_CANVAS_ACTION', [{ name: 'invoke_canvas_action', arguments: { instanceId: 'lazy', actionName: 'record', input: { label: 'from-model' } } }]);
		await send('RUN_CANVAS_ACTION');

		assert.deepStrictEqual({
			beforeFirstOpen,
			afterFirstOpen,
			repeatedOpen,
			action: { results: toolResults.map(result => JSON.parse(result)), launches: await launches() },
			unexpectedRequests,
		}, {
			beforeFirstOpen: {
				status: 'dormant',
				definitions: [{ canvasId: 'lazy-canvas', extensionId: 'project:lazy-canvas', extensionSource: 'project', extensionName: 'lazy-canvas', displayName: 'Lazy canvas', description: 'Starts on first use.', requiresInput: false, actionCount: 1 }],
				launches: 0,
			},
			afterFirstOpen: { result: 'opened', uri: 'http://127.0.0.1:43119/lazy', status: 'running', launches: 1 },
			repeatedOpen: { result: 'opened', launches: 1 },
			action: { results: [{ result: { instanceId: 'lazy', labels: ['from-model'] } }], launches: 1 },
			unexpectedRequests: [],
		});
	});
	test('shows the titles that native extension tools declare, for lazily started and eager extensions, without sending them to the model', async function () {
		this.timeout(180_000);
		const workspace = join(directory, 'workspace');
		const lazyDirectory = join(workspace, '.github', 'extensions', 'lazy-tools');
		const eagerDirectory = join(workspace, '.github', 'extensions', 'eager-tools');
		await mkdir(lazyDirectory, { recursive: true });
		await mkdir(eagerDirectory, { recursive: true });
		const parameters = { type: 'object', properties: { item: { type: 'string' } }, required: ['item'] };
		await writeFile(join(lazyDirectory, 'extension.json'), JSON.stringify({
			version: 1,
			initialization: 'module',
			tools: [{ name: 'lazy_lookup', title: 'Look Up Inventory', description: 'Looks up an inventory item.', parameters }],
		}), 'utf8');
		await writeFile(join(lazyDirectory, 'extension.mjs'), `
import { joinSession } from '@microsoft/copilot-sdk/extension';
import declaration from './extension.json' with { type: 'json' };
await joinSession({
	tools: { definitions: declaration.tools.map(tool => ({ ...tool, handler: ({ item }) => \`lazy found \${item}\` })) },
});
`, 'utf8');
		await writeFile(join(eagerDirectory, 'extension.mjs'), `
import { joinSession } from '@microsoft/copilot-sdk/extension';
await joinSession({
	tools: { definitions: [{
		name: 'eager_lookup',
		title: 'Look Up Orders',
		description: 'Looks up an order.',
		parameters: ${JSON.stringify(parameters)},
		handler: ({ item }) => \`eager found \${item}\`,
	}] },
});
`, 'utf8');

		const { copilot, send } = await startChat('native-tool-titles', workspace);
		const shown: { toolName: string; displayName: string }[] = [];
		const confirmations: Pick<ToolCallPendingConfirmationState, 'toolName' | 'displayName' | 'confirmationTitle' | 'invocationMessage'>[] = [];
		store.add(copilot.onDidChatProgress(signal => {
			if (signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallStart && signal.action.toolName.endsWith('_lookup')) {
				shown.push({ toolName: signal.action.toolName, displayName: signal.action.displayName });
			}
			if (signal.kind === 'pending_confirmation' && signal.state.toolName.endsWith('_lookup')) {
				confirmations.push({ toolName: signal.state.toolName, displayName: signal.state.displayName, confirmationTitle: signal.state.confirmationTitle, invocationMessage: signal.state.invocationMessage });
			}
		}));
		toolCallsByPrompt.set('LOOK_UP_ITEMS', [
			{ name: 'lazy_lookup', arguments: { item: 'gear' } },
			{ name: 'eager_lookup', arguments: { item: 'order-7' } },
		]);
		await send('LOOK_UP_ITEMS');

		// The eager tool can start while the lazily started extension is still starting.
		const byToolName = (first: { toolName: string }, second: { toolName: string }) => first.toolName.localeCompare(second.toolName);
		assert.deepStrictEqual({
			shown: shown.sort(byToolName),
			confirmations: confirmations.sort(byToolName),
			results: toolResults.sort(),
			titlesSentToModel: ['lazy_lookup', 'eager_lookup'].map(name => JSON.stringify(modelTools.get(name) ?? null).includes('Look Up')),
			unexpectedRequests,
		}, {
			shown: [
				{ toolName: 'eager_lookup', displayName: 'Look Up Orders' },
				{ toolName: 'lazy_lookup', displayName: 'Look Up Inventory' },
			],
			// The title names the row; the question names the exact tool, since the title is the extension's free text.
			confirmations: [
				{ toolName: 'eager_lookup', displayName: 'Look Up Orders', confirmationTitle: 'Allow tool call?', invocationMessage: { markdown: 'Allow the model to call `eager_lookup`?' } },
				{ toolName: 'lazy_lookup', displayName: 'Look Up Inventory', confirmationTitle: 'Allow tool call?', invocationMessage: { markdown: 'Allow the model to call `lazy_lookup`?' } },
			],
			results: ['eager found order-7', 'lazy found gear'],
			titlesSentToModel: [false, false],
			unexpectedRequests: [],
		});
	});
});
