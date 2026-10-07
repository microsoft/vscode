/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient } from '@github/copilot-sdk';
import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseManagedAutoTierDefault, type AutoModeTier } from '../../../common/autoModeTiers.js';
import type { ModelSelection } from '../../../common/state/sessionState.js';
import { getCopilotAutoTier } from '../../../node/copilot/copilotSessionLauncher.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

suite('Copilot SDK client-selected Auto startup defaults', function () {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	this.timeout(60_000);

	let client: CopilotClient;
	let server: Server;
	let home: string;
	let policy: { autoTier?: string };
	let routedTiers: unknown[];
	let unexpectedRequests: string[];

	setup(async () => {
		home = await mkdtemp(join(tmpdir(), 'copilot-auto-default-'));
		policy = {};
		routedTiers = [];
		unexpectedRequests = [];
		let baseUrl = '';
		const { createServer } = await import('http');
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
			if (path === '/copilot_internal/managed_settings') {
				json(policy);
			} else if (path === '/user') {
				json({ login: 'replay-user', id: 1 });
			} else if (path === '/auto' && request.method === 'POST') {
				const routing: { tier?: unknown } = JSON.parse(body);
				routedTiers.push(routing.tier);
				const catalog: { data: { id: string }[] } = JSON.parse(getAncillaryStub('GET', '/models')!.body);
				json({
					session_token: 'auto-test-token',
					expires_at: Math.floor(Date.now() / 1000) + 3600,
					selected_model: catalog.data.find(model => model.id === 'gpt-4o'),
				});
			} else if (path === '/chat/completions' && request.method === 'POST') {
				json({
					id: 'test-completion',
					choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			} else {
				const stub = getAncillaryStub(request.method ?? 'GET', path, body);
				if (stub) {
					response.writeHead(stub.status, stub.headers);
					response.end(stub.body.replaceAll('${capi}', baseUrl));
				} else {
					unexpectedRequests.push(`${request.method} ${path}`);
					response.writeHead(500, { 'x-should-retry': 'false' });
					response.end('Unexpected test endpoint');
				}
			}
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		baseUrl = `http://127.0.0.1:${address.port}`;
		client = new CopilotClient({
			workingDirectory: home,
			baseDirectory: join(home, 'copilot'),
			useLoggedInUser: false,
			gitHubToken: 'test-only-no-real-credential',
			env: createIsolatedProviderEnvironment(home, {
				PATH: process.env.PATH,
				SystemRoot: process.env.SystemRoot,
				COPILOT_API_URL: baseUrl,
				COPILOT_DEBUG_GITHUB_API_URL: baseUrl,
				COPILOT_MANAGED_SETTINGS_CACHE: '0',
				COPILOT_TELEMETRY_ENABLED: 'false',
			}),
		});
	});

	teardown(async () => {
		try {
			// Unlike forceStop, stop waits for the runtime process to exit.
			assert.deepStrictEqual(await client?.stop() ?? [], []);
		} finally {
			server?.closeAllConnections();
			if (server?.listening) {
				await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
			}
			if (home) {
				await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		}
	});

	for (const testCase of [
		{ name: 'unmanaged fallback', managed: undefined, source: 'default', preference: 'balance', expected: 'balance' },
		{ name: 'enterprise startup default', managed: 'intelligence', source: 'default', preference: 'balance', expected: 'intelligence' },
		{ name: 'managed default instead of an inherited preference', managed: 'intelligence', source: 'preference', preference: 'efficiency', expected: 'intelligence' },
		{ name: 'explicit choice equal to ordinary default', managed: 'intelligence', source: 'explicit', preference: 'balance', expected: 'balance' },
		{ name: 'explicit non-default choice', managed: 'intelligence', source: 'explicit', preference: 'efficiency', expected: 'efficiency' },
	] as const) {
		test(`${testCase.name} reaches the first Auto request and survives resume`, async () => {
			policy = { autoTier: testCase.managed };
			const explicit = testCase.source === 'explicit';
			const model: ModelSelection = JSON.parse(JSON.stringify({
				id: 'auto', config: {
					tier: explicit ? testCase.preference : parseManagedAutoTierDefault(testCase.managed) ?? testCase.preference,
					tierSource: explicit ? 'explicit' : testCase.managed ? 'managed' : testCase.source,
				},
			}));
			const options = {
				workingDirectory: home,
				enableManagedSettings: true,
				enableConfigDiscovery: false,
				availableTools: [],
				onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' as const }),
			};
			const session = await client.createSession({
				...options, model: 'auto',
				capi: { autoTier: getCopilotAutoTier(model) },
			});
			const changes: { model: string; tier: string | null | undefined }[] = [];
			disposables.add(toDisposable(session.on('session.model_change', event => changes.push({ model: event.data.newModel, tier: event.data.autoTier }))));
			const pending = await session.rpc.model.getCurrent();
			const response = await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
			const committed = await session.rpc.model.getCurrent();
			const sessionId = session.sessionId;
			await session.disconnect();
			policy = {};
			const resumed = await client.resumeSession(sessionId, options);
			const restored = await resumed.rpc.model.getCurrent();
			await resumed.disconnect();
			assert.deepStrictEqual({
				startup: pending.pendingAutoTier ?? pending.autoTier,
				routedTiers,
				reply: response?.data.content,
				committed: committed.autoTier,
				restored: restored.autoTier,
				notificationsMatch: changes.every(change => change.model !== 'auto' || change.tier === testCase.expected),
				unexpectedRequests,
			}, {
				startup: testCase.expected,
				routedTiers: [testCase.expected],
				reply: 'OK',
				committed: testCase.expected,
				restored: testCase.expected,
				notificationsMatch: true,
				unexpectedRequests: [],
			});
		});
	}

	test('a new untouched session observes policy withdrawal without resetting the earlier session', async () => {
		const routed: AutoModeTier[] = [];
		for (const managed of ['intelligence', undefined] as const) {
			policy = { autoTier: managed };
			const session = await client.createSession({
				model: 'auto', workingDirectory: home, enableManagedSettings: true,
				capi: { autoTier: parseManagedAutoTierDefault(managed) ?? 'balance' },
				availableTools: [], enableConfigDiscovery: false,
				onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' }),
			});
			await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
			const current = await session.rpc.model.getCurrent();
			assert.ok(current.autoTier === 'intelligence' || current.autoTier === 'balance');
			routed.push(current.autoTier);
			await session.disconnect();
		}
		assert.deepStrictEqual({ routed, routedTiers, unexpectedRequests }, {
			routed: ['intelligence', 'balance'], routedTiers: ['intelligence', 'balance'], unexpectedRequests: [],
		});
	});
});
