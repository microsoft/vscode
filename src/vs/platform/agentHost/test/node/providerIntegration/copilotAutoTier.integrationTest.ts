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
import { NullLogService } from '../../../../log/common/log.js';
import type { IAgentModelInfo } from '../../../common/agent.js';
import { autoModeTiers, parseManagedAutoTierDefault } from '../../../common/autoModeTiers.js';
import type { ModelSelection } from '../../../common/state/sessionState.js';
import { getCopilotAutoTier, getCopilotContextTier, getCopilotReasoningEffort } from '../../../node/copilot/copilotSessionLauncher.js';
import { omitCopilotManagedModelDefaults, projectCopilotManagedModelConfiguration } from '../../../node/copilot/copilotManagedModelConfiguration.js';
import { modelConfigurationSourceKey } from '../../../common/agentModelConfiguration.js';
import { resolveCopilotManagedSettings } from '../../../node/copilot/copilotManagedSettings.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

suite('Copilot SDK managed model configuration', function () {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	this.timeout(60_000);

	let client: CopilotClient;
	let server: Server;
	let home: string;
	let policy: {
		model?: string;
		autoTier?: string;
		fusionTier?: string;
		effortLevel?: string;
		contextTier?: 'default' | 'long_context';
	};
	let modelEfforts: string[] | undefined;
	let routedTiers: unknown[];
	let completionEfforts: (string | undefined)[];
	let unexpectedRequests: string[];

	setup(async () => {
		home = await mkdtemp(join(tmpdir(), 'copilot-auto-default-'));
		policy = {};
		modelEfforts = undefined;
		routedTiers = [];
		completionEfforts = [];
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
				const completion: { reasoning_effort?: string } = JSON.parse(body);
				completionEfforts.push(completion.reasoning_effort);
				json({
					id: 'test-completion',
					choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				});
			} else {
				const stub = getAncillaryStub(request.method ?? 'GET', path, body);
				if (stub) {
					response.writeHead(stub.status, stub.headers);
					let content = stub.body.replaceAll('${capi}', baseUrl);
					if (path === '/models' && modelEfforts) {
						const catalog: { data: { id: string; capabilities: { supports: { reasoning_effort?: string[] } } }[] } = JSON.parse(content);
						const model = catalog.data.find(model => model.id === 'gpt-5');
						assert.ok(model);
						model.capabilities.supports.reasoning_effort = modelEfforts;
						content = JSON.stringify(catalog);
					}
					response.end(content);
				} else {
					unexpectedRequests.push(`${request.method} ${path}`);
					response.writeHead(500, { 'x-should-retry': 'false' });
					response.end(`Unexpected test endpoint: ${request.method} ${path}`);
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
		await client.start();
		const resolved = await resolveCopilotManagedSettings(client.rpc.managedSettings, 'test-only-no-real-credential', 30_000, home);
		const deviceSettings = resolved.layers.find(layer => layer.source === 'device')?.settings;
		const conflictingKeys = deviceSettings && typeof deviceSettings === 'object'
			? Object.keys(deviceSettings).filter(key => ['model', 'autoTier', 'fusion', 'fusionTier', 'effortLevel', 'contextTier', 'permissions'].includes(key))
			: [];
		assert.deepStrictEqual(conflictingKeys, [],
			'Managed-model integration tests require no native model or permission policy. An isolated HOME does not isolate MDM, registry, or machine-wide managed-settings files.');
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

	test('server-shaped concrete defaults preserve explicit choices and remain mutable', async () => {
		modelEfforts = ['low', 'high'];
		policy = { model: 'gpt-5', effortLevel: 'high', contextTier: 'default' };
		await client.start();
		const { models } = await client.rpc.models.list({ gitHubToken: 'test-only-no-real-credential' });
		const session = await client.createSession({
			model: 'gpt-5', reasoningEffort: 'low', contextTier: 'long_context',
			workingDirectory: home, enableManagedSettings: true,
			availableTools: [], enableConfigDiscovery: false,
			onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' }),
		});
		try {
			const initial = await session.rpc.model.getCurrent();
			await session.setModel('gpt-5', { reasoningEffort: 'high', contextTier: 'default' });
			const edited = await session.rpc.model.getCurrent();
			await session.setModel('gpt-4o', { contextTier: 'long_context' });
			const changed = await session.rpc.model.getCurrent();
			assert.deepStrictEqual({
				offeredEfforts: models.find(model => model.id === 'gpt-5')?.supportedReasoningEfforts,
				initial: { model: initial.modelId, effort: initial.reasoningEffort, context: initial.contextTier },
				edited: { effort: edited.reasoningEffort, context: edited.contextTier },
				changed: { model: changed.modelId, context: changed.contextTier },
				unexpectedRequests,
			}, {
				offeredEfforts: ['low', 'high'],
				initial: { model: 'gpt-5', effort: 'low', context: 'long_context' },
				edited: { effort: 'high', context: 'default' },
				changed: { model: 'gpt-4o', context: 'long_context' },
				unexpectedRequests: [],
			});
		} finally {
			await session.disconnect();
		}
	});

	test('server-shaped defaults distinguish omission from explicit session choices', async () => {
		modelEfforts = ['low', 'high'];
		policy = { model: 'gpt-5', effortLevel: 'high', contextTier: 'long_context' };
		await client.start();
		const resolved = await resolveCopilotManagedSettings(client.rpc.managedSettings, 'test-only-no-real-credential', 30_000, home);
		const observations = [];
		for (const explicit of [false, true]) {
			const selection: ModelSelection = JSON.parse(JSON.stringify({
				id: 'gpt-5', config: {
					thinkingLevel: 'low', contextSize: 200_000,
					[modelConfigurationSourceKey('thinkingLevel')]: explicit ? 'explicit' : 'default',
					[modelConfigurationSourceKey('contextSize')]: explicit ? 'explicit' : 'default',
				},
			}));
			const requested = omitCopilotManagedModelDefaults(selection, resolved);
			const session = await client.createSession({
				model: requested.id,
				reasoningEffort: getCopilotReasoningEffort(requested),
				contextTier: getCopilotContextTier(requested, 1_000_000),
				workingDirectory: home, enableManagedSettings: true,
				availableTools: [], enableConfigDiscovery: false,
				onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' }),
			});
			try {
				await session.rpc.model.list();
				const initial = await session.rpc.model.getCurrent();
				await session.setModel('gpt-5', { reasoningEffort: 'low', contextTier: 'default' });
				const changed = await session.rpc.model.getCurrent();
				observations.push({
					initial: { effort: initial.reasoningEffort, context: initial.contextTier },
					changed: { effort: changed.reasoningEffort, context: changed.contextTier },
				});
			} finally {
				await session.disconnect();
			}
		}
		assert.deepStrictEqual({ observations, unexpectedRequests }, {
			observations: [
				{ initial: { effort: 'high', context: 'long_context' }, changed: { effort: 'low', context: 'default' } },
				{ initial: { effort: 'low', context: 'default' }, changed: { effort: 'low', context: 'default' } },
			],
			unexpectedRequests: [],
		});
	});

	test('an unavailable managed model does not attach its defaults to an explicitly selected available model', async () => {
		policy = { model: 'unavailable-model', effortLevel: 'high', contextTier: 'default' };
		const session = await client.createSession({
			model: 'gpt-4o', contextTier: 'long_context',
			workingDirectory: home, enableManagedSettings: true,
			availableTools: [], enableConfigDiscovery: false,
			onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' }),
		});

		try {
			const current = await session.rpc.model.getCurrent();
			assert.deepStrictEqual({
				model: current.modelId, effort: current.reasoningEffort, context: current.contextTier, unexpectedRequests,
			}, { model: 'gpt-4o', effort: undefined, context: 'long_context', unexpectedRequests: [] });
		} finally {
			await session.disconnect();
		}
	});

	for (const mode of ['absent', 'server-default'] as const) {
		test(`concrete session resumes without overwriting its choices under ${mode} policy`, async () => {
			modelEfforts = ['low', 'high'];
			const options = {
				workingDirectory: home, enableManagedSettings: true, enableConfigDiscovery: false,
				availableTools: [],
				onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' as const }),
			};
			const session = await client.createSession({ ...options, model: 'gpt-4o' });
			await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
			await session.setModel('gpt-5', { reasoningEffort: 'low', contextTier: 'default' });
			const sessionId = session.sessionId;
			await session.disconnect();
			policy = mode === 'absent' ? {} : {
				model: 'gpt-5',
				effortLevel: 'high',
				contextTier: 'long_context',
			};
			const resumed = await client.resumeSession(sessionId, options);
			try {
				const current = await resumed.rpc.model.getCurrent();
				const messages = await resumed.getEvents();
				assert.deepStrictEqual({
					model: current.modelId, effort: current.reasoningEffort, context: current.contextTier,
					historyRetained: messages.some(event => event.type === 'assistant.message' && event.data.content === 'OK'),
					unexpectedRequests,
				}, {
					model: 'gpt-5', effort: 'low', context: 'default',
					historyRetained: true,
					unexpectedRequests: [],
				});
			} finally {
				await resumed.disconnect();
			}
		});
	}

	for (const mode of ['absent', 'server-default'] as const) {
		test(`Auto session resumes without overwriting its tier under ${mode} policy`, async () => {
			const options = {
				workingDirectory: home, enableManagedSettings: true, enableConfigDiscovery: false,
				availableTools: [],
				onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' as const }),
			};
			const session = await client.createSession({ ...options, model: 'auto', capi: { autoTier: 'efficiency' } });
			await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
			const sessionId = session.sessionId;
			await session.disconnect();
			policy = mode === 'absent' ? {} : { model: 'auto', autoTier: 'intelligence' };
			const resumed = await client.resumeSession(sessionId, options);
			try {
				const current = await resumed.rpc.model.getCurrent();
				const messages = await resumed.getEvents();
				assert.deepStrictEqual({
					model: current.modelId, tier: current.pendingAutoTier ?? current.autoTier,
					historyRetained: messages.some(event => event.type === 'assistant.message' && event.data.content === 'OK'),
					unexpectedRequests,
				}, {
					model: 'auto', tier: 'efficiency',
					historyRetained: true,
					unexpectedRequests: [],
				});
			} finally {
				await resumed.disconnect();
			}
		});
	}

	// The runtime intermittently rejects this strict-mode resume; see e2e/KNOWN_ISSUES.md and #26739.
	test.skip('strict SDK opt-in resumes under a changed effort lock without deleting history (#26739)', async () => {
		modelEfforts = ['low', 'high'];
		const options = {
			workingDirectory: home, enableManagedSettings: true, enableConfigDiscovery: false,
			availableTools: [],
			onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' as const }),
		};
		const session = await client.createSession({ ...options, model: 'gpt-4o' });
		await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
		await session.setModel('gpt-5', { reasoningEffort: 'low', contextTier: 'default' });
		const sessionId = session.sessionId;
		await session.disconnect();
		policy = { model: 'gpt-5', effortLevel: 'high' };
		const resumed = await client.resumeSession(sessionId, { ...options, enforceManagedModelDefaults: true });
		try {
			const current = await resumed.rpc.model.getCurrent();
			const messages = await resumed.getEvents();
			assert.deepStrictEqual({
				model: current.modelId, effort: current.reasoningEffort,
				historyRetained: messages.some(event => event.type === 'assistant.message' && event.data.content === 'OK'),
				unexpectedRequests,
			}, {
				model: 'gpt-5', effort: 'high', historyRetained: true, unexpectedRequests: [],
			});
		} finally {
			await resumed.disconnect();
		}
	});

	for (const explicit of [false, true]) {
		test(`server-shaped Auto default stays editable through inference, explicit=${explicit}`, async () => {
			policy = { model: 'auto', autoTier: 'intelligence' };
			await client.start();
			const resolved = await resolveCopilotManagedSettings(client.rpc.managedSettings, 'test-only-no-real-credential', 30_000, home);
			const requested = omitCopilotManagedModelDefaults({
				id: 'auto', config: { tier: 'efficiency', [modelConfigurationSourceKey('tier')]: explicit ? 'explicit' : 'default' },
			}, resolved);
			const session = await client.createSession({
				model: 'auto', capi: { autoTier: getCopilotAutoTier(requested) },
				workingDirectory: home, enableManagedSettings: true, enableConfigDiscovery: false,
				availableTools: [],
				onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' }),
			});
			try {
				await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
				await session.setModel('auto', { autoTier: 'balance' });
				await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
				const current = await session.rpc.model.getCurrent();
				assert.deepStrictEqual({ routedTiers, tier: current.autoTier, unexpectedRequests }, {
					routedTiers: [explicit ? 'efficiency' : 'intelligence', 'balance'], tier: 'balance', unexpectedRequests: [],
				});
			} finally {
				await session.disconnect();
			}
		});
	}

	for (const testCase of [
		{ name: 'Fusion High runs Intelligence without HydraFusion', policy: { fusionTier: 'high' }, expected: 'intelligence' },
		{ name: 'Fusion Standard supersedes legacy Intelligence', policy: { fusionTier: 'standard', autoTier: 'intelligence' }, expected: 'balance' },
		{ name: 'unmanaged Fusion withdraws legacy Intelligence', policy: { fusionTier: 'unmanaged', autoTier: 'intelligence' }, expected: 'balance' },
		{ name: 'legacy Efficiency keeps its legacy execution', policy: { autoTier: 'efficiency' }, expected: 'efficiency' },
	] as const) {
		test(`${testCase.name} in the picker and the first Auto request`, async () => {
			policy = testCase.policy;
			const resolved = await resolveCopilotManagedSettings(client.rpc.managedSettings, 'test-only-no-real-credential', 30_000, home);
			const auto: IAgentModelInfo = {
				provider: 'copilotcli', id: 'auto', name: 'Auto', supportsVision: false,
				configSchema: { type: 'object', properties: { tier: { type: 'string', title: 'Optimize for', enum: [...autoModeTiers], default: 'balance' } } },
			};
			const requested = omitCopilotManagedModelDefaults({
				id: 'auto', config: { tier: 'balance', [modelConfigurationSourceKey('tier')]: 'default' },
			}, resolved);
			const session = await client.createSession({
				model: 'auto', capi: { autoTier: getCopilotAutoTier(requested) },
				workingDirectory: home, enableManagedSettings: true, enableConfigDiscovery: false,
				availableTools: [],
				onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' }),
			});
			try {
				await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
				const current = await session.rpc.model.getCurrent();
				assert.deepStrictEqual({
					picker: projectCopilotManagedModelConfiguration(auto, resolved, new NullLogService()).configSchema?.properties.tier.default,
					routedTiers, tier: current.autoTier, unexpectedRequests,
				}, {
					picker: testCase.expected, routedTiers: [testCase.expected], tier: testCase.expected, unexpectedRequests: [],
				});
			} finally {
				await session.disconnect();
			}
		});
	}

	test('bundled SDK regression: unsupported server effort reaches inference even in default-only mode (#26681)', async () => {
		policy = { model: 'gpt-4o', effortLevel: 'high' };
		const session = await client.createSession({
			model: 'gpt-4o', workingDirectory: home, enableManagedSettings: true, enableConfigDiscovery: false,
			availableTools: [],
			onPermissionRequest: async () => ({ kind: 'denied-interactively-by-user' }),
		});
		try {
			await session.rpc.model.list();
			const response = await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
			assert.deepStrictEqual({ response: response?.data.content, completionEfforts, unexpectedRequests }, {
				response: 'OK', completionEfforts: ['high'], unexpectedRequests: [],
			});
		} finally {
			await session.disconnect();
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
		const routed: string[] = [];
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
			const tier = current.autoTier === 'intelligence' ? 'intelligence' : current.autoTier === 'balance' ? 'balance' : undefined;
			assert.ok(tier);
			routed.push(tier);
			await session.disconnect();
		}
		assert.deepStrictEqual({ routed, routedTiers, unexpectedRequests }, {
			routed: ['intelligence', 'balance'], routedTiers: ['intelligence', 'balance'], unexpectedRequests: [],
		});
	});
});
