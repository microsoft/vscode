/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, RuntimeConnection, type PermissionMode, type SessionConfig, type SessionEventPayload } from '@github/copilot-sdk';
import assert from 'assert';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { DeferredPromise, raceTimeout } from '../../../../../base/common/async.js';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getAncillaryStub } from '../e2e/harness/capiStubs.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';
import { CopilotGlobalPermissionOverride } from '../../../node/copilot/copilotPermissionModes.js';

suite('Copilot SDK managed permission modes', function () {
	ensureNoDisposablesAreLeakedInTestSuite();
	this.timeout(60_000);

	let client: CopilotClient;
	let server: Server;
	let home: string;
	let policy: { permissions?: { defaultMode?: PermissionMode; disableAssistedPermissionsMode?: boolean; disableBypassPermissionsMode?: string } };
	let unexpectedRequests: string[];
	let gate: DeferredPromise<void> | undefined;
	let policyRequested: DeferredPromise<void>;

	setup(async () => {
		home = await mkdtemp(join(tmpdir(), 'copilot-permission-modes-'));
		policy = {};
		unexpectedRequests = [];
		gate = undefined;
		policyRequested = new DeferredPromise<void>();
		await writeFile(join(home, 'device.json'), '{}');
		let baseUrl = '';
		const { createServer } = await import('http');
		server = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://localhost').pathname;
			let body = '';
			for await (const chunk of request) {
				body += chunk;
			}
			if (path === '/copilot_internal/managed_settings') {
				void policyRequested.complete();
				await gate?.p;
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify(policy));
			} else if (path === '/user') {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ login: 'replay-user', id: 1 }));
			} else if (path === '/chat/completions' && request.method === 'POST') {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify({
					id: 'test-completion',
					choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				}));
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
			...(process.env.AGENT_HOST_COPILOT_RUNTIME_PATH ? { connection: RuntimeConnection.forStdio({ path: process.env.AGENT_HOST_COPILOT_RUNTIME_PATH }) } : {}),
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
				COPILOT_E2E_TEST_HOOKS: '1',
				COPILOT_TEST_MANAGED_SETTINGS_FILE_PATH: join(home, 'device.json'),
			}),
		});
	});

	teardown(async () => {
		await gate?.complete();
		try {
			assert.deepStrictEqual(await client?.stop() ?? [], []);
			assert.deepStrictEqual(unexpectedRequests, []);
		} finally {
			server?.closeAllConnections();
			if (server?.listening) {
				await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
			}
			await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	});

	function options(): SessionConfig {
		return {
			workingDirectory: home, model: 'gpt-4o', enableManagedSettings: true,
			enableExperimentalMode: true, enableConfigDiscovery: false, availableTools: [],
			featureFlags: { AUTO_APPROVAL: true },
			onPermissionRequest: async () => ({ kind: 'reject' }),
		};
	}

	async function modeDatabase() {
		const metadataFile = join(home, 'host-permission-intent.json');
		await writeFile(metadataFile, '{}');
		const readMetadata = async (): Promise<Record<string, string>> => JSON.parse(await readFile(metadataFile, 'utf8'));
		const database: ConstructorParameters<typeof CopilotGlobalPermissionOverride>[0] = {
			getMetadata: async key => (await readMetadata())[key],
			setMetadata: async (key, value) => {
				await writeFile(metadataFile, JSON.stringify({ ...await readMetadata(), [key]: value }));
			},
			deleteMetadata: async keys => {
				const values = await readMetadata();
				for (const key of keys) {
					delete values[key];
				}
				await writeFile(metadataFile, JSON.stringify(values));
			},
		};
		return { database, readMetadata };
	}

	for (const capBeforeGlobal of [true, false]) {
		test(`cold runtime restores underlying Assisted with policy cap ${capBeforeGlobal ? 'before' : 'during'} global override`, async () => {
			const { database } = await modeDatabase();
			policy = { permissions: { defaultMode: 'assisted' } };
			let session = await client.createSession(options());
			const id = session.sessionId;
			let journal = new CopilotGlobalPermissionOverride(database);
			const startup = await journal.initializeStartupMode((await session.rpc.permissions.getMode()).mode);
			await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
			if (capBeforeGlobal) {
				await session.disconnect();
				await client.stop();
				policy = { permissions: { disableAssistedPermissionsMode: true } };
				await client.start();
				session = await client.resumeSession(id, options());
				journal = new CopilotGlobalPermissionOverride(database);
				await journal.load();
				assert.strictEqual((await session.rpc.permissions.getMode()).mode, 'manual');
			}
			await journal.capture(await journal.initializeStartupMode((await session.rpc.permissions.getMode()).mode));
			const captured = journal.mode;
			await session.rpc.permissions.setMode({ mode: 'allow-all' });
			await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
			await session.disconnect();
			await client.stop();
			policy = { permissions: { disableAssistedPermissionsMode: true, ...(!capBeforeGlobal ? { disableBypassPermissionsMode: 'disable' } : {}) } };
			await client.start();
			session = await client.resumeSession(id, options());
			journal = new CopilotGlobalPermissionOverride(database);
			await journal.load();
			if (capBeforeGlobal) {
				const rejected = await session.rpc.permissions.setMode({ mode: journal.mode! });
				assert.deepStrictEqual([rejected.success, rejected.mode], [false, 'allow-all']);
			}
			await session.rpc.permissions.setMode({ mode: 'manual' });
			await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
			const capped = (await session.rpc.permissions.getMode()).mode;
			await session.disconnect();
			await client.stop();
			policy = {};
			await client.start();
			session = await client.resumeSession(id, options());
			journal = new CopilotGlobalPermissionOverride(database);
			await journal.load();
			const retained = journal.mode;
			const restored = await session.rpc.permissions.setMode({ mode: journal.mode! });
			await journal.clear();
			await session.disconnect();
			assert.deepStrictEqual({ startup, captured, capped, retained, restored: [restored.success, restored.mode], marker: journal.mode }, {
				startup: 'assisted', captured: 'assisted', capped: 'manual', retained: 'assisted', restored: [true, 'assisted'], marker: undefined,
			});
		});
	}

	for (const defaultMode of ['manual', 'assisted', 'allow-all'] as const) {
		test(`${defaultMode} default applies only to untouched new sessions and survives cold resume`, async () => {
			policy = { permissions: { defaultMode } };
			const session = await client.createSession(options());
			const initial = await session.rpc.permissions.getMode();
			await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
			const id = session.sessionId;
			await session.disconnect();
			await client.stop();
			policy = { permissions: { defaultMode: defaultMode === 'manual' ? 'allow-all' : 'manual' } };
			await client.start();
			const resumed = await client.resumeSession(id, options());
			const restored = await resumed.rpc.permissions.getMode();
			await resumed.disconnect();
			const fresh = await client.createSession(options());
			const next = await fresh.rpc.permissions.getMode();
			await fresh.disconnect();
			assert.deepStrictEqual([initial.mode, restored.mode, next.mode], [defaultMode, defaultMode, policy.permissions?.defaultMode]);
		});
	}

	for (const requested of ['manual', 'assisted', 'allow-all'] as const) {
		test(`explicit ${requested} wins over a different managed default after delayed startup`, async () => {
			policy = { permissions: { defaultMode: requested === 'manual' ? 'allow-all' : 'manual' } };
			gate = new DeferredPromise<void>();
			const creating = client.createSession(options());
			await policyRequested.p;
			await gate.complete();
			const session = await creating;
			const selected = await session.rpc.permissions.setMode({ mode: requested });
			const effective = await session.rpc.permissions.getMode();
			await session.disconnect();
			assert.deepStrictEqual([selected.success, selected.mode, effective.mode], [true, requested, requested]);
		});
	}

	for (const underlying of ['manual', 'assisted'] as const) {
		test(`cold runtime and host reconstruction removes global Allow All over ${underlying}`, async () => {
			const { database, readMetadata } = await modeDatabase();
			policy = { permissions: { defaultMode: underlying } };
			const session = await client.createSession(options());
			const first = new CopilotGlobalPermissionOverride(database);
			await first.load();
			await first.capture((await session.rpc.permissions.getMode()).mode);
			await session.rpc.permissions.setMode({ mode: 'allow-all' });
			await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
			const id = session.sessionId;
			await session.disconnect();
			await client.stop();
			// Both the host controller and runtime are new; only their separate journals remain.
			const reconstructed = new CopilotGlobalPermissionOverride(database);
			await reconstructed.load();
			await client.start();
			const resumed = await client.resumeSession(id, options());
			const persistedEffective = (await resumed.rpc.permissions.getMode()).mode;
			assert.ok(reconstructed.mode);
			const restored = await resumed.rpc.permissions.setMode({ mode: reconstructed.mode });
			await reconstructed.clear();
			await resumed.disconnect();
			assert.deepStrictEqual({
				persistedEffective, restored: [restored.success, restored.mode], metadata: await readMetadata(),
			}, { persistedEffective: 'allow-all', restored: [true, underlying], metadata: {} });
		});
	}

	for (const restricted of ['assisted', 'allow-all'] as const) {
		test(`rejected ${restricted} reports the other elevated mode, not necessarily Manual`, async () => {
			const other = restricted === 'assisted' ? 'allow-all' : 'assisted';
			policy = { permissions: {
				defaultMode: other,
				...(restricted === 'assisted' ? { disableAssistedPermissionsMode: true } : { disableBypassPermissionsMode: 'disable' }),
			} };
			const session = await client.createSession(options());
			const denied = await session.rpc.permissions.setMode({ mode: restricted });
			const effective = await session.rpc.permissions.getMode();
			await session.disconnect();
			assert.deepStrictEqual([denied.success, denied.mode, effective.mode], [false, other, other]);
		});
	}

	test('unavailable Assisted default falls back to Manual', async () => {
		policy = { permissions: { defaultMode: 'assisted' } };
		const session = await client.createSession({ ...options(), featureFlags: { AUTO_APPROVAL: false } });
		const mode = await session.rpc.permissions.getMode();
		await session.disconnect();
		assert.deepStrictEqual(mode, { mode: 'manual' });
	});

	test('cold policy apply and removal preserve an explicit Assisted choice', async () => {
		const session = await client.createSession(options());
		await session.rpc.permissions.setMode({ mode: 'assisted' });
		await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
		const id = session.sessionId;
		await session.disconnect();
		await client.stop();
		policy = { permissions: { disableAssistedPermissionsMode: true, defaultMode: 'allow-all' } };
		await client.start();
		const restricted = await client.resumeSession(id, options());
		const duringPolicy = await restricted.rpc.permissions.getMode();
		await restricted.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
		await restricted.disconnect();
		await client.stop();
		policy = {};
		await client.start();
		const restored = await client.resumeSession(id, options());
		const afterPolicy = await restored.rpc.permissions.getMode();
		await restored.disconnect();
		assert.deepStrictEqual([duringPolicy.mode, afterPolicy.mode], ['manual', 'assisted']);
	});

	test('runtime composes defaults restrictively and Assisted disable stays true across sources', async () => {
		await writeFile(join(home, 'device.json'), JSON.stringify({
			permissions: { defaultMode: 'assisted', disableAssistedPermissionsMode: true },
		}));
		policy = { permissions: { defaultMode: 'allow-all', disableAssistedPermissionsMode: false } };
		await client.start();
		const resolved = await client.rpc.managedSettings.resolve({ workingDirectory: home });
		const session = await client.createSession(options());
		const mode = await session.rpc.permissions.getMode();
		await session.disconnect();
		assert.deepStrictEqual({
			permissions: (resolved.resolved.settings as { permissions?: object } | undefined)?.permissions,
			mode: mode.mode,
		}, {
			permissions: { defaultMode: 'assisted', disableAssistedPermissionsMode: true },
			mode: 'manual',
		});
	});

	for (const restricted of ['assisted', 'allow-all'] as const) {
		test(`${restricted} restriction is independent, emits enforcement, and clears on resume`, async () => {
			const permissions = restricted === 'assisted'
				? { disableAssistedPermissionsMode: true }
				: { disableBypassPermissionsMode: 'disable' };
			const enforced = new DeferredPromise<SessionEventPayload<'session.managed_settings_enforced'>['data']>();
			const session = await client.createSession({
				...options(), managedSettings: { permissions },
				onEvent: event => {
					if (event.type === 'session.managed_settings_enforced') {
						void enforced.complete(event.data);
					}
				},
			});
			const rejected = await session.rpc.permissions.setMode({ mode: restricted });
			const event = await raceTimeout(enforced.p, 5_000);
			const other = restricted === 'assisted' ? 'allow-all' : 'assisted';
			const independent = await session.rpc.permissions.setMode({ mode: other });
			await session.sendAndWait({ prompt: 'Reply only OK' }, 20_000);
			const id = session.sessionId;
			await session.disconnect();
			await client.stop();
			await client.start();
			const resumed = await client.resumeSession(id, options());
			const removed = await resumed.rpc.permissions.setMode({ mode: restricted });
			await resumed.disconnect();
			assert.deepStrictEqual({
				rejected: [rejected.success, rejected.mode],
				event: event && { setting: event.setting, escalation: event.escalation, failClosed: event.failClosed },
				independent: [independent.success, independent.mode], removed: [removed.success, removed.mode],
			}, {
				rejected: [false, 'manual'],
				event: { setting: restricted === 'assisted' ? 'permissions.disableAssistedPermissionsMode' : 'permissions.disableBypassPermissionsMode', 				escalation: restricted === 'assisted' ? 'assisted_approval' : 'allow_all', failClosed: false },
				independent: [true, other], removed: [true, restricted],
			});
		});
	}

	test('a prohibited managed default falls back to Manual rather than the other elevated mode', async () => {
		const modes: PermissionMode[] = [];
		for (const defaultMode of ['assisted', 'allow-all'] as const) {
			policy = { permissions: {
				defaultMode,
				...(defaultMode === 'assisted' ? { disableAssistedPermissionsMode: true } : { disableBypassPermissionsMode: 'disable' }),
			} };
			const session = await client.createSession(options());
			modes.push((await session.rpc.permissions.getMode()).mode);
			await session.disconnect();
		}
		assert.deepStrictEqual(modes, ['manual', 'manual']);
	});
});
