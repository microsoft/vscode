/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { cp, mkdir, mkdtemp, realpath, rm } from 'fs/promises';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { CopilotClient, RuntimeConnection, type CopilotClientOptions, type CopilotSession, type SessionConfig, type SessionEvent } from '@github/copilot-sdk';
import { dirname, join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';
import { NoModelRequests, readCanvasFixtureAudit, waitFor } from './copilotCanvasTestUtils.js';

type Entrypoint = 'vscode-index' | 'npm-loader-compatibility';
type CanvasInstance = Awaited<ReturnType<CopilotSession['rpc']['canvas']['open']>>;

const canvasTools = ['list_canvas_capabilities', 'open_canvas', 'invoke_canvas_action'];
const bootstrapName = 'bootstrap-canvas-fixture';
const savedSessionId = 'canvas-startup-seed';

function extensionId(name: string): string {
	return `user:${name}`;
}

function instanceIdentity(name: string, instanceId: string) {
	return { instanceId, extensionId: extensionId(name), canvasId: 'counter' };
}

function canvasPayloads(events: readonly SessionEvent[]) {
	return events.filter(event =>
		event.type === 'session.canvas.opened' ||
		event.type === 'session.canvas.unavailable' ||
		event.type === 'session.canvas.recorded' ||
		event.type === 'session.canvas.closed' ||
		event.type === 'session.canvas.removed'
	).map(({ id, parentId, timestamp, ...payload }) => payload);
}

async function readDocument(instance: CanvasInstance): Promise<unknown> {
	assert.ok(instance.url);
	const url = new URL(instance.url);
	assert.deepStrictEqual({ protocol: url.protocol, hostname: url.hostname }, { protocol: 'http:', hostname: '127.0.0.1' });
	url.pathname = '/document';
	const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
	if (!response.ok) {
		assert.fail(`${response.status}: ${await response.text()}`);
	}
	return response.json();
}

async function toolNames(session: CopilotSession): Promise<string[]> {
	await session.rpc.tools.initializeAndValidate();
	const { tools } = await session.rpc.tools.getCurrentMetadata();
	assert.ok(tools);
	return tools.map(tool => tool.name).sort();
}

class OfflineCanvasRuntime {
	readonly modelRequests = new NoModelRequests();
	readonly approvalRequests: string[] = [];
	readonly events: SessionEvent[] = [];
	readonly copilotHome: string;
	readonly workingDirectory: string;
	private readonly directories = new Map<string, string>();
	private readonly clients: CopilotClient[] = [];

	constructor(
		readonly home: string,
		readonly host: Entrypoint,
		readonly mode: CopilotClientOptions['mode'],
	) {
		this.copilotHome = join(home, '.copilot');
		this.workingDirectory = join(home, 'workspace');
	}

	get cliPath(): string {
		const require = createRequire(import.meta.url);
		return this.host === 'vscode-index'
			? join(dirname(require.resolve(`@github/copilot-${process.platform}-${process.arch}`)), 'index.js')
			: join(dirname(require.resolve('@github/copilot/package.json')), 'npm-loader.js');
	}

	clientOptions(): CopilotClientOptions {
		return {
			...(this.mode === undefined ? {} : { mode: this.mode }),
			connection: RuntimeConnection.forStdio({ path: this.cliPath }),
			baseDirectory: this.copilotHome,
			workingDirectory: this.workingDirectory,
			useLoggedInUser: false,
			enableRemoteSessions: false,
			logLevel: 'error',
			requestHandler: this.modelRequests,
			env: createIsolatedProviderEnvironment(this.home, {
				PATH: process.env.PATH,
				SystemRoot: process.env.SystemRoot,
				ELECTRON_RUN_AS_NODE: '1',
				COPILOT_CLI_RUN_AS_NODE: '1',
				COPILOT_DISABLE_KEYTAR: '1',
				DO_NOT_TRACK: '1',
			}),
		};
	}

	sessionOptions(overrides: Partial<SessionConfig> = {}): SessionConfig {
		return {
			model: 'canvas-proof-no-model',
			provider: { type: 'openai', wireApi: 'responses', baseUrl: 'http://127.0.0.1:1' },
			availableTools: [],
			workingDirectory: this.workingDirectory,
			configDirectory: this.copilotHome,
			enableConfigDiscovery: true,
			enableFileHooks: true,
			enableSessionTelemetry: false,
			enableSessionStore: false,
			memory: { enabled: false },
			skipEmbeddingRetrieval: true,
			embeddingCacheStorage: 'in-memory',
			mcpServers: {},
			disabledMcpServers: ['github-mcp-server'],
			mcpOAuthTokenStorage: 'in-memory',
			pluginDirectories: [],
			remoteSession: 'off',
			requestExtensions: true,
			onEvent: event => this.events.push(event),
			onPermissionRequest: request => {
				this.approvalRequests.push(`permission:${request.kind}`);
				return { kind: 'denied-no-approval-rule-and-could-not-request-from-user' };
			},
			onUserInputRequest: () => {
				this.approvalRequests.push('user-input');
				throw new Error('Interactive approval is unavailable in the isolated startup proof');
			},
			onElicitationRequest: () => {
				this.approvalRequests.push('elicitation');
				return { action: 'decline' };
			},
			...overrides,
		};
	}

	async start(): Promise<CopilotClient> {
		const client = new CopilotClient(this.clientOptions());
		this.clients.push(client);
		await client.start();
		return client;
	}

	async install(name: string): Promise<void> {
		assert.ok(!this.directories.has(name), 'Fixture installation must not overwrite an existing candidate');
		const directory = join(this.copilotHome, 'extensions', name);
		this.directories.set(name, directory);
		await cp(new URL('./fixtures/localCanvas/', import.meta.url), directory, { recursive: true });
	}

	audit(name: string, kind: string): Promise<unknown[]> {
		const directory = this.directories.get(name);
		assert.ok(directory);
		return readCanvasFixtureAudit(directory, kind);
	}

	async joined(name: string, count = 1): Promise<void> {
		await waitFor(() => this.audit(name, 'joined'), value => value.length === count);
	}

	async startupState(client: CopilotClient, name: string, phase: string) {
		const started = (await this.audit(name, 'started')).length;
		const stopped = (await this.audit(name, 'stopped')).length;
		const entry = (await client.rpc.extensions.discover()).extensions.find(entry => entry.id === extensionId(name));
		assert.ok(entry);
		return { phase, started, stopped, preferenceEnabled: entry.enabled };
	}

	async seedSavedSession(): Promise<void> {
		await this.install(bootstrapName);
		const client = await this.start();
		await client.rpc.extensions.disable({ ids: [extensionId(bootstrapName)] });
		const session = await client.createSession({ ...this.sessionOptions(), sessionId: savedSessionId });
		assert.deepStrictEqual(await this.audit(bootstrapName, 'started'), []);
		await session.rpc.extensions.enable({ id: extensionId(bootstrapName) });
		await this.joined(bootstrapName);
		await session.rpc.name.set({ name: 'Isolated canvas startup history' });
		await session.rpc.canvas.open({ extensionId: extensionId(bootstrapName), canvasId: 'counter', instanceId: 'seed-live', input: { documentId: 'seed-document' } });
		await session.rpc.canvas.action.invoke({ instanceId: 'seed-live', actionName: 'increment', input: { amount: 1 } });
		await session.rpc.canvas.open({ extensionId: extensionId(bootstrapName), canvasId: 'counter', instanceId: 'seed-closed', input: { documentId: 'seed-document' } });
		await session.rpc.canvas.close({ instanceId: 'seed-closed' });
		await client.rpc.extensions.disable({ ids: [extensionId(bootstrapName)] });
		assert.deepStrictEqual(await client.stop(), []);
		assert.deepStrictEqual(await this.audit(bootstrapName, 'stopped'), await this.audit(bootstrapName, 'started'));
	}

	async stop(): Promise<void> {
		const errors: unknown[] = [];
		for (const client of this.clients.reverse()) {
			try {
				errors.push(...await client.stop());
			} catch (error) {
				errors.push(error);
			}
		}
		for (const name of this.directories.keys()) {
			assert.deepStrictEqual(await this.audit(name, 'stopped'), await this.audit(name, 'started'));
		}
		assert.deepStrictEqual(this.modelRequests.requests, []);
		if (errors.length) {
			throw new AggregateError(errors, 'Offline canvas fixture cleanup failed');
		}
	}
}

async function withRuntime(
	run: (fixture: OfflineCanvasRuntime) => Promise<void>,
	host: Entrypoint = 'vscode-index',
	mode: CopilotClientOptions['mode'] = undefined,
): Promise<void> {
	const home = await realpath(await mkdtemp(join(tmpdir(), 'copilot-canvas-modes-')));
	const fixture = new OfflineCanvasRuntime(home, host, mode);
	try {
		await mkdir(fixture.workingDirectory, { recursive: true });
		await run(fixture);
	} finally {
		try {
			await fixture.stop();
		} finally {
			await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	}
}

// Run only under the documented OS network sandbox, never as an ambient normal-mode integration test.
const offlineSuite = process.platform === 'darwin' && process.env.VSCODE_CANVAS_MODE_PROBE_NETWORK_ISOLATED === '1' ? suite : suite.skip;

offlineSuite('Copilot Canvas Startup - Entrypoints and Authorization Boundaries', function () {
	ensureNoDisposablesAreLeakedInTestSuite();
	this.timeout(60_000);

	const profiles: { host: Entrypoint; mode: CopilotClientOptions['mode'] }[] = [
		{ host: 'vscode-index', mode: undefined },
		{ host: 'vscode-index', mode: 'empty' },
		{ host: 'npm-loader-compatibility', mode: 'empty' },
	];
	for (const { host, mode } of profiles) {
		for (const requestExtensions of [false, true]) {
			test(`${host}, mode ${mode ?? 'omitted'}, requestExtensions ${requestExtensions}: startup is measured before advertisement`, async () => {
				await withRuntime(async fixture => {
					const name = 'local-canvas-fixture';
					await fixture.install(name);
					const client = await fixture.start();
					const session = await client.createSession({ ...fixture.sessionOptions({ requestExtensions }), sessionId: 'canvas-client-mode-proof' });
					const started = requestExtensions
						? await waitFor(() => fixture.audit(name, 'started'), value => value.length === 1)
						: await fixture.audit(name, 'started');
					if (requestExtensions) {
						await fixture.joined(name);
					}
					const { extensions } = await session.rpc.extensions.list();
					const pid = extensions[0]?.pid;
					if (requestExtensions) {
						assert.ok(typeof pid === 'number');
					}
					assert.deepStrictEqual({
						modeOptionPresent: Object.hasOwn(fixture.clientOptions(), 'mode'),
						startedBeforeIntrospection: started,
						extensions: extensions.map(({ id, status }) => ({ id, status })),
						approvalRequests: fixture.approvalRequests,
						modelRequests: fixture.modelRequests.requests,
					}, {
						modeOptionPresent: mode !== undefined,
						startedBeforeIntrospection: requestExtensions ? [{ pid }] : [],
						extensions: requestExtensions ? [{ id: extensionId(name), status: 'running' }] : [],
						approvalRequests: [],
						modelRequests: [],
					});
					console.log('CANVAS_ENTRYPOINT_MATRIX', JSON.stringify({
						host, cliPath: fixture.cliPath, mode: mode ?? 'omitted', requestExtensions,
						requestCanvasRenderer: 'omitted', extensionSdkPath: 'CLI default', availableTools: [],
						startupMarkers: started, approvalRequests: fixture.approvalRequests,
					}));
				}, host, mode);
			});
		}
	}

	for (const requestCanvasRenderer of [false, true]) {
		test(`production entrypoint renderer ${requestCanvasRenderer} changes tools, not backend startup`, async () => {
			await withRuntime(async fixture => {
				const name = 'renderer-canvas-fixture';
				await fixture.install(name);
				const client = await fixture.start();
				const session = await client.createSession({
					...fixture.sessionOptions({ requestCanvasRenderer, availableTools: canvasTools }),
					sessionId: 'canvas-renderer-proof',
				});
				const started = await waitFor(() => fixture.audit(name, 'started'), value => value.length === 1);
				await fixture.joined(name);
				const advertised = (await toolNames(session)).filter(name => canvasTools.includes(name));
				assert.deepStrictEqual({ starts: started.length, advertised, approvalRequests: fixture.approvalRequests }, {
					starts: 1, advertised: requestCanvasRenderer ? [...canvasTools].sort() : [], approvalRequests: [],
				});
				console.log('CANVAS_RENDERER_MATRIX', JSON.stringify({
					cliPath: fixture.cliPath, mode: 'omitted', requestExtensions: true, requestCanvasRenderer,
					startupMarkers: started, canvasTools: advertised,
				}));
			});
		});
	}

	test('disabled subject never starts across create, reload and cold resume; enabling only it is distinct from stopping it later', async () => {
		await withRuntime(async fixture => {
			await fixture.seedSavedSession();
			const name = 'disabled-subject-fixture';
			const controlName = 'disabled-control-fixture';
			await fixture.install(name);
			await fixture.install(controlName);
			const client = await fixture.start();
			await client.rpc.extensions.disable({ ids: [extensionId(name), extensionId(controlName)] });
			const created = await client.createSession({ ...fixture.sessionOptions(), sessionId: 'disabled-create-proof' });
			const states = [await fixture.startupState(client, name, 'create before first startup')];
			await created.rpc.extensions.reload();
			states.push(await fixture.startupState(client, name, 'reload before first startup'));
			assert.deepStrictEqual(await client.stop(), []);

			const resumedClient = await fixture.start();
			const session = await resumedClient.resumeSession(savedSessionId, fixture.sessionOptions());
			states.push(await fixture.startupState(resumedClient, name, 'cold resume before first startup'));
			await session.rpc.extensions.reload();
			states.push(await fixture.startupState(resumedClient, name, 'resumed reload before first startup'));
			assert.deepStrictEqual(await fixture.audit(controlName, 'started'), []);
			await session.rpc.extensions.enable({ id: extensionId(name) });
			await fixture.joined(name);
			states.push(await fixture.startupState(resumedClient, name, 'explicitly enable only subject'));
			const bootstrapStarts = (await fixture.audit(bootstrapName, 'started')).length;
			assert.deepStrictEqual(bootstrapStarts, 1, 'The separate bootstrap fixture must not be restarted');

			const cursor = fixture.events.length;
			const identity = instanceIdentity(name, 'subject-instance');
			const input = { documentId: 'subject-document' };
			const first = await session.rpc.canvas.open({ ...identity, input });
			const rpcResult = await session.rpc.canvas.action.invoke({ instanceId: identity.instanceId, actionName: 'increment', input: { amount: 1 } });
			const rawHandlerReturns = await fixture.audit(name, 'action.result');
			await session.rpc.extensions.disable({ id: extensionId(name) });
			await waitFor(() => fixture.audit(name, 'stopped'), value => value.length === 1);
			states.push(await fixture.startupState(resumedClient, name, 'disable after first startup'));
			await session.rpc.extensions.reload();
			states.push(await fixture.startupState(resumedClient, name, 'reload after post-start disable'));
			await session.rpc.extensions.enable({ id: extensionId(name) });
			await fixture.joined(name, 2);
			const { openCanvases } = await waitFor(
				() => session.rpc.canvas.listOpen(),
				value => value.openCanvases.some(instance => instance.instanceId === identity.instanceId && instance.url !== first.url),
			);
			const second = openCanvases.find(instance => instance.instanceId === identity.instanceId);
			assert.ok(second);
			await session.rpc.canvas.close({ instanceId: identity.instanceId });

			const context = { sessionId: session.sessionId, session: { workingDirectory: fixture.workingDirectory } };
			const providerOpen = { ...identity, input, ...context };
			const providerAction = { ...identity, actionName: 'increment', input: { amount: 1 }, ...context };
			const document = { documentId: 'subject-document', value: 1, actions: 1, interactions: 0 };
			const lifecycle = canvasPayloads(fixture.events.slice(cursor));
			const callbacks = {
				open: await fixture.audit(name, 'open'),
				action: await fixture.audit(name, 'action'),
				close: await fixture.audit(name, 'close'),
			};
			assert.deepStrictEqual({
				states, rawHandlerReturns, rpcResult, callbacks, lifecycle,
				controlStarted: await fixture.audit(controlName, 'started'),
				approvalRequests: fixture.approvalRequests,
			}, {
				states: [
					{ phase: 'create before first startup', started: 0, stopped: 0, preferenceEnabled: false },
					{ phase: 'reload before first startup', started: 0, stopped: 0, preferenceEnabled: false },
					{ phase: 'cold resume before first startup', started: 0, stopped: 0, preferenceEnabled: false },
					{ phase: 'resumed reload before first startup', started: 0, stopped: 0, preferenceEnabled: false },
					{ phase: 'explicitly enable only subject', started: 1, stopped: 0, preferenceEnabled: true },
					{ phase: 'disable after first startup', started: 1, stopped: 1, preferenceEnabled: false },
					{ phase: 'reload after post-start disable', started: 1, stopped: 1, preferenceEnabled: false },
				],
				rawHandlerReturns: [document],
				rpcResult: { result: document },
				callbacks: { open: [providerOpen, providerOpen], action: [providerAction], close: [{ ...identity, ...context }] },
				lifecycle: [
					{ type: 'session.canvas.opened', data: first, ephemeral: true },
					{ type: 'session.canvas.recorded', data: { ...identity, title: 'Counter: subject-document', input } },
					{ type: 'session.canvas.unavailable', data: identity, ephemeral: true },
					{ type: 'session.canvas.opened', data: second, ephemeral: true },
					{ type: 'session.canvas.closed', data: identity, ephemeral: true },
					{ type: 'session.canvas.removed', data: identity },
				],
				controlStarted: [],
				approvalRequests: [],
			});
			console.log('CANVAS_SELECTIVE_AND_RPC_PROOF', JSON.stringify({
				cliPath: fixture.cliPath, mode: 'omitted',
				initialCreateSessionId: 'disabled-create-proof', coldResumeSessionId: savedSessionId,
				bootstrap: { name: bootstrapName, started: bootstrapStarts, stopped: (await fixture.audit(bootstrapName, 'stopped')).length },
				neverStartedControl: { name: controlName, started: (await fixture.audit(controlName, 'started')).length },
				subject: name, states,
				rawHandlerReturns, rpcResult, callbacks, lifecycle,
			}));
		});
	});

	for (const operation of ['reload', 'resume']) {
		test(`production entrypoint starts a newly discovered backend on ${operation} without explicit enable or approval`, async () => {
			await withRuntime(async fixture => {
				await fixture.seedSavedSession();
				const client = await fixture.start();
				const options = fixture.sessionOptions({ requestCanvasRenderer: false, excludedTools: ['extensions_manage', 'extensions_reload'] });
				const existingSession = operation === 'reload' ? await client.resumeSession(savedSessionId, options) : undefined;
				const name = 'newly-discovered-canvas-fixture';
				await fixture.install(name);
				const before = await fixture.audit(name, 'started');
				const discovered = (await client.rpc.extensions.discover()).extensions.find(entry => entry.id === extensionId(name));
				assert.ok(discovered);
				assert.deepStrictEqual(await fixture.audit(name, 'started'), []);
				if (existingSession) {
					await existingSession.rpc.extensions.reload();
				}
				const session = existingSession ?? await client.resumeSession(savedSessionId, options);
				await fixture.joined(name);
				const after = await fixture.audit(name, 'started');
				const advertised = await toolNames(session);
				const state = await fixture.startupState(client, name, `new discovery on ${operation}`);
				assert.deepStrictEqual({
					before, state, advertised,
					bootstrapStarts: (await fixture.audit(bootstrapName, 'started')).length,
					approvalRequests: fixture.approvalRequests,
				}, {
					before: [],
					state: { phase: `new discovery on ${operation}`, started: 1, stopped: 0, preferenceEnabled: true },
					advertised: [],
					bootstrapStarts: 1,
					approvalRequests: [],
				});
				const opened = await session.rpc.canvas.open({
					extensionId: extensionId(name), canvasId: 'counter', instanceId: 'new-discovery', input: { documentId: 'new-document' },
				});
				assert.deepStrictEqual(await readDocument(opened), { documentId: 'new-document', value: 0, actions: 0, interactions: 0 });
				await session.rpc.canvas.close({ instanceId: 'new-discovery' });
				console.log('CANVAS_NEW_DISCOVERY_PROOF', JSON.stringify({
					cliPath: fixture.cliPath, mode: 'omitted', operation, before, after,
					catalogPreference: discovered.enabled, advertisedTools: advertised, approvalRequests: fixture.approvalRequests,
				}));
			});
		});
	}
});
