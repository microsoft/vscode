/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, rm, writeFile } from 'fs/promises';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { DeferredPromise, raceTimeout, retry } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { AgentExtensionConsentOption, AgentSession, fixedChatOwnerRef, type AgentCanvasOpenAnswer, type IAgentChatContext } from '../../../common/agent.js';
import { AgentHostCanvasesEnabledConfigKey } from '../../../common/agentHostSchema.js';
import type { CanvasState } from '../../../common/state/protocol/channels-canvas/state.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { createTestDirectory } from '../e2e/harness/testDirectories.js';
import { createLocalEndpointCopilotAgent } from './copilotAgentIntegrationTestHarness.js';
import { extensionEnvironmentSentinels, fakeCapiCredentialForLabel, labelTestCredential, replaceCredentialEnvironment } from './copilotCredentialTestUtils.js';

/**
 * Opens canvases from the UI, without a turn or a tool call, through the production Copilot agent and the bundled runtime.
 * A lazily started extension that requests a sensitive environment variable asks for the user's consent as it starts.
 */
suite('Agent Host Provider Integration — Copilot extension environment consent', function () {
	const resource = 'https://api.github.com';
	const variable = 'BLACKBIRD_AUTH_METIS_API_KEY';
	let server: Server;
	let directory: string;
	let store: DisposableStore;
	let agent: ReturnType<typeof createLocalEndpointCopilotAgent> | undefined;
	let restoreEnvironment: (() => void) | undefined;
	const unexpectedRequests: string[] = [];

	setup(async () => {
		restoreEnvironment = replaceCredentialEnvironment(extensionEnvironmentSentinels);
		unexpectedRequests.length = 0;
		store = new DisposableStore();
		directory = createTestDirectory(join(tmpdir(), 'copilot-env-consent-'));
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
				json({ login: 'consent-user', id: 1, type: 'User' });
			} else if (path === '/copilot_internal/managed_settings') {
				json({});
			} else if (path === '/chat/completions' && request.method === 'POST' && !body.includes('"stream":false')) {
				json({ id: 'consent-turn', choices: [{ index: 0, message: { role: 'assistant', content: 'Ready.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
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

	/** Writes a lazily started project extension whose canvas reports whether it could read the requested variable. */
	async function writeExtension(workspace: string, name: string): Promise<void> {
		const extensionDirectory = join(workspace, '.github', 'extensions', name);
		await mkdir(extensionDirectory, { recursive: true });
		await writeFile(join(extensionDirectory, 'extension.json'), JSON.stringify({
			version: 1,
			initialization: 'module',
			canvases: [{ id: name, displayName: name, description: 'Reads a sensitive environment variable.' }],
		}), 'utf8');
		await writeFile(join(extensionDirectory, 'extension.mjs'), `
import { createCanvas, joinSession } from '@github/copilot-sdk/extension';
import declaration from './extension.json' with { type: 'json' };
await joinSession({
	requestedEnvironmentVariables: [${JSON.stringify(variable)}],
	canvases: declaration.canvases.map(canvas => createCanvas({
		...canvas,
		open: ({ instanceId }) => ({ url: \`http://127.0.0.1:43119/\${instanceId}?env=\${process.env[${JSON.stringify(variable)}] === ${JSON.stringify(extensionEnvironmentSentinels[variable])} ? 'visible' : 'hidden'}\` }),
	})),
});
`, 'utf8');
	}

	for (const target of ['default', 'peer'] as const) {
		test(`asks before a canvas opened from the UI reads a sensitive variable, asks again after a retry, and keeps the approval across the refresh (${target} chat)`, async function () {
			this.timeout(180_000);
			const workspace = join(directory, 'workspace');
			await writeExtension(workspace, 'allowed-canvas');
			await writeExtension(workspace, 'declined-canvas');
			const copilot = createLocalEndpointCopilotAgent(store, directory, `http://127.0.0.1:${(server.address() as { port: number }).port}`, { [AgentHostCanvasesEnabledConfigKey]: true });
			agent = copilot;
			const canvases: CanvasState[] = [];
			store.add(copilot.onDidChatProgress(signal => {
				if (signal.kind === 'canvas' && signal.state) {
					canvases.push(signal.state);
				}
			}));
			await copilot.authenticate(resource, 'legacy-l', 7200);
			const session = AgentSession.uri('copilotcli', 'env-consent');
			const chat = URI.parse(buildDefaultChatUri(session.toString()));
			const context: IAgentChatContext = { resource: session, owner: fixedChatOwnerRef(session), sessionSettings: undefined, launchWorkingDirectories: undefined, workspaceless: false };
			assert.ok(await copilot.chats.createChat(chat, context, { deferBacking: true, model: { id: 'gpt-4o' }, workingDirectories: [URI.file(workspace)] }));
			// Canvases open in a chat that has started, as the Agents window offers them.
			const turnCompleted = new DeferredPromise<boolean>();
			store.add(copilot.onDidChatProgress(signal => {
				if (signal.kind === 'action' && signal.action.type === ActionType.ChatTurnComplete && signal.action.turnId === 'first-turn') {
					void turnCompleted.complete(true);
				}
			}));
			await copilot.chats.prepareTurn!(chat, 'first-turn', [URI.file(workspace)], context);
			await copilot.chats.sendMessage(chat, 'Hello', [URI.file(workspace)], undefined, 'first-turn', undefined, context);
			assert.notStrictEqual(await raceTimeout(turnCompleted.p, 60_000), undefined, 'The first turn must complete');
			// A peer chat has a runtime of its own from the start, which a refresh resolves differently from the session's main chat.
			const canvasChat = target === 'peer' ? URI.parse(buildChatUri(session.toString(), 'peer')) : chat;
			if (target === 'peer') {
				assert.ok(await copilot.chats.createChat(canvasChat, context, { model: { id: 'gpt-4o' }, workingDirectories: [URI.file(workspace)] }));
			}
			const open = (name: string, answer?: AgentCanvasOpenAnswer) => copilot.openSessionCanvas(session, { canvasId: name, extensionId: `project:${name}`, instanceId: name }, canvasChat, context, answer);
			const steps: string[] = [];
			const answer = async (name: string, optionId: AgentExtensionConsentOption, retrying?: boolean) => {
				const asked = await open(name, retrying ? { kind: 'retry' } : undefined);
				assert.strictEqual(asked.kind, 'consentRequired', `${name} must ask for consent`);
				steps.push(`${name} asks for ${asked.consent.items.join(', ')}`);
				const result = await open(name, { kind: 'consent', consentId: asked.consent.id, optionId });
				steps.push(`${name} ${optionId}: ${result.kind}${result.kind === 'consentDenied' ? ` (retryable: ${result.retryable})` : ''}`);
			};
			const latestUrl = (name: string) => canvases.findLast(canvas => canvas.instanceId === name)?.uri;

			await answer('allowed-canvas', AgentExtensionConsentOption.Allow);
			await answer('declined-canvas', AgentExtensionConsentOption.NotNow);
			const beforeRetry = canvases.length;
			await answer('declined-canvas', AgentExtensionConsentOption.Allow, true);
			// The retry replaced the runtime: the allowed canvas reopens in the background without asking again.
			await retry(async () => assert.ok(canvases.slice(beforeRetry).some(canvas => canvas.instanceId === 'allowed-canvas' && canvas.uri)), 200, 150);

			assert.deepStrictEqual({ steps, allowed: latestUrl('allowed-canvas'), declined: latestUrl('declined-canvas'), unexpectedRequests }, {
				steps: [
					`allowed-canvas asks for ${variable}`,
					'allowed-canvas allow-once: opened',
					`declined-canvas asks for ${variable}`,
					'declined-canvas not-now: consentDenied (retryable: true)',
					`declined-canvas asks for ${variable}`,
					'declined-canvas allow-once: opened',
				],
				allowed: 'http://127.0.0.1:43119/allowed-canvas?env=visible',
				declined: 'http://127.0.0.1:43119/declined-canvas?env=visible',
				unexpectedRequests: [],
			});
		});
	}
});
