/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { cp, mkdir, mkdtemp, readFile, realpath, rm } from 'fs/promises';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { CopilotClient, RuntimeConnection, type CopilotSession, type SessionConfig, type SessionEvent } from '@github/copilot-sdk';
import { dirname, join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';
import { NoModelRequests, readCanvasFixtureAudit, waitFor } from './copilotCanvasTestUtils.js';

const extensionName = 'local-canvas-fixture';
const extensionId = `user:${extensionName}`;
const sdkPath = dirname(fileURLToPath(import.meta.resolve('@github/copilot-sdk')));
const cliPath = join(dirname(createRequire(import.meta.url).resolve('@github/copilot/package.json')), 'npm-loader.js');
const canvasTools = ['list_canvas_capabilities', 'open_canvas', 'invoke_canvas_action'];

type CanvasInstance = Awaited<ReturnType<CopilotSession['rpc']['canvas']['open']>>;

const declaration = {
	extensionId,
	extensionName,
	canvasId: 'counter',
	displayName: 'Local Counter',
	description: 'A deterministic document shared by local canvas instances.',
	inputSchema: {
		type: 'object',
		properties: {
			documentId: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
			failOnClose: { type: 'boolean' },
		},
		required: ['documentId'],
		additionalProperties: false,
	},
	actions: [{
		name: 'increment',
		description: 'Increment the document once.',
		inputSchema: {
			type: 'object',
			properties: { amount: { type: 'integer', minimum: 1, maximum: 10 } },
			required: ['amount'],
			additionalProperties: false,
		},
	}],
};

function canvasEvents(events: readonly SessionEvent[]) {
	return events.filter(event => event.type.startsWith('session.canvas.')).map(event => ({
		type: event.type,
		data: event.data,
		ephemeral: event.ephemeral === true,
	}));
}

function instanceIdentity(instanceId: string) {
	return { instanceId, extensionId, canvasId: 'counter' };
}

function fixtureUrl(instance: CanvasInstance, path: string): URL {
	assert.ok(instance.url);
	const original = new URL(instance.url);
	assert.strictEqual(original.protocol, 'http:');
	assert.strictEqual(original.hostname, '127.0.0.1');
	const url = new URL(path, original);
	url.search = original.search;
	return url;
}

async function fetchFixture(instance: CanvasInstance, path: string, init?: RequestInit): Promise<Response> {
	const response = await fetch(fixtureUrl(instance, path), { signal: AbortSignal.timeout(10_000), ...init });
	if (!response.ok) {
		assert.fail(`${response.status}: ${await response.text()}`);
	}
	return response;
}

async function toolNames(session: CopilotSession): Promise<string[]> {
	const { tools } = await session.rpc.tools.getCurrentMetadata();
	assert.ok(tools, 'Tool metadata must be initialized');
	return tools.map(tool => tool.name).sort();
}

async function readSseEvent(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<unknown> {
	const decoder = new TextDecoder();
	let content = '';
	while (!content.endsWith('\n\n')) {
		const chunk = await reader.read();
		assert.ok(!chunk.done, 'SSE ended before its next document snapshot');
		content += decoder.decode(chunk.value, { stream: true });
	}
	assert.match(content, /^data: /);
	return JSON.parse(content.slice('data: '.length));
}

class CanvasFixtureRuntime {
	readonly events: SessionEvent[] = [];
	readonly permissionRequests: string[] = [];
	readonly modelRequests = new NoModelRequests();
	readonly clients: CopilotClient[] = [];
	readonly workingDirectory: string;
	readonly copilotHome: string;
	readonly extensionDirectory: string;
	private readonly extensionDirectories: string[] = [];

	constructor(readonly home: string) {
		this.workingDirectory = join(home, 'workspace');
		this.copilotHome = join(home, '.copilot');
		this.extensionDirectory = join(this.copilotHome, 'extensions', extensionName);
	}

	async start(cliHost = true): Promise<CopilotClient> {
		const client = new CopilotClient({
			connection: RuntimeConnection.forStdio(cliHost ? { path: cliPath } : undefined),
			mode: 'empty',
			baseDirectory: this.copilotHome,
			workingDirectory: this.workingDirectory,
			useLoggedInUser: false,
			logLevel: 'error',
			requestHandler: this.modelRequests,
			env: createIsolatedProviderEnvironment(this.home, {
				PATH: process.env.PATH,
				SystemRoot: process.env.SystemRoot,
				ELECTRON_RUN_AS_NODE: '1',
				COPILOT_CLI_RUN_AS_NODE: '1',
				DO_NOT_TRACK: '1',
			}),
		});
		this.clients.push(client);
		await client.start();
		return client;
	}

	config(overrides: Partial<SessionConfig> = {}): SessionConfig {
		return {
			sessionId: 'local-canvas-contract',
			model: 'canvas-contract-no-llm',
			provider: { type: 'openai', wireApi: 'responses', baseUrl: 'http://127.0.0.1:1' },
			availableTools: canvasTools,
			workingDirectory: this.workingDirectory,
			configDirectory: this.copilotHome,
			enableSessionTelemetry: false,
			requestExtensions: true,
			requestCanvasRenderer: true,
			extensionSdkPath: sdkPath,
			onEvent: event => this.events.push(event),
			onPermissionRequest: request => {
				this.permissionRequests.push(request.kind);
				return { kind: 'denied-no-approval-rule-and-could-not-request-from-user' };
			},
			...overrides,
		};
	}

	async installExtension(name: string): Promise<string> {
		const directory = join(this.copilotHome, 'extensions', name);
		this.extensionDirectories.push(directory);
		await cp(new URL('./fixtures/localCanvas/', import.meta.url), directory, { recursive: true });
		return directory;
	}

	async readAudit(kind: string, directory = this.extensionDirectory): Promise<unknown[]> {
		return readCanvasFixtureAudit(directory, kind);
	}

	async waitForCanvas(session: CopilotSession, joins = 1): Promise<void> {
		await waitFor(() => this.readAudit('joined'), value => value.length === joins);
		await waitFor(() => session.rpc.canvas.list(), value => value.canvases.some(canvas => canvas.extensionId === extensionId));
	}

	async readDocument(documentId: string): Promise<unknown> {
		return JSON.parse(await readFile(join(this.extensionDirectory, 'documents', `${documentId}.json`), 'utf8'));
	}

	async readStartupState(phase: string, client: CopilotClient, session: CopilotSession) {
		const discovered = (await client.rpc.extensions.discover()).extensions.find(extension => extension.id === extensionId);
		const live = (await session.rpc.extensions.list()).extensions.find(extension => extension.id === extensionId);
		assert.ok(discovered && live);
		return {
			phase,
			enabled: discovered.enabled,
			status: live.status,
			started: (await this.readAudit('started')).length,
			stopped: (await this.readAudit('stopped')).length,
		};
	}

	context() {
		return {
			sessionId: 'local-canvas-contract',
			session: { workingDirectory: this.workingDirectory },
		};
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
		for (const directory of this.extensionDirectories) {
			assert.deepStrictEqual(await this.readAudit('stopped', directory), await this.readAudit('started', directory));
		}
		assert.deepStrictEqual(this.modelRequests.requests, []);
		if (errors.length) {
			throw new AggregateError(errors, 'Canvas runtime cleanup failed');
		}
	}
}

async function withFixture(run: (fixture: CanvasFixtureRuntime) => Promise<void>): Promise<void> {
	const home = await realpath(await mkdtemp(join(tmpdir(), 'copilot-canvas-contract-')));
	const fixture = new CanvasFixtureRuntime(home);
	try {
		await mkdir(fixture.workingDirectory, { recursive: true });
		await fixture.installExtension(extensionName);
		await run(fixture);
	} finally {
		try {
			await fixture.stop();
		} finally {
			await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	}
}

suite('Agent Host Provider Integration - Copilot Local Custom Canvases', function () {
	ensureNoDisposablesAreLeakedInTestSuite();
	this.timeout(120_000);

	test('standalone runtime fails closed without an extension launch provider', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start(false);
			const disabled = await client.createSession(fixture.config({ requestExtensions: false }));
			assert.deepStrictEqual(await disabled.rpc.extensions.list(), { extensions: [] });
			await disabled.disconnect();
			await assert.rejects(
				() => client.createSession(fixture.config()),
				/No extension launch provider is registered for standalone extensions/,
			);
			assert.deepStrictEqual(await fixture.readAudit('started'), []);
		});
	});

	for (const requestCanvasRenderer of [false, true]) {
		test(`requestExtensions false prevents backend startup with requestCanvasRenderer ${requestCanvasRenderer}`, async () => {
			await withFixture(async fixture => {
				const client = await fixture.start();
				const session = await client.createSession(fixture.config({
					requestExtensions: false,
					requestCanvasRenderer,
					enableExperimentalMode: true,
				}));
				const startedBeforeIntrospection = await fixture.readAudit('started');
				await session.rpc.tools.initializeAndValidate();
				await assert.rejects(() => session.rpc.extensions.enable({ id: extensionId }), /Extensions not available/);
				await assert.rejects(() => session.rpc.extensions.reload(), /Extensions not available/);
				assert.deepStrictEqual({
					capabilities: session.capabilities,
					extensions: await session.rpc.extensions.list(),
					canvases: await session.rpc.canvas.list(),
					tools: await toolNames(session),
					startedBeforeIntrospection,
					started: await fixture.readAudit('started'),
				}, {
					capabilities: { ui: { elicitation: false, mcpApps: false, canvases: requestCanvasRenderer }, extensions: false },
					extensions: { extensions: [] },
					canvases: { canvases: [] },
					tools: requestCanvasRenderer ? [...canvasTools].sort() : [],
					startedBeforeIntrospection: [],
					started: [],
				});
			});
		});
	}

	test('renderer opt-in gates model tools but does not authorize direct canvas RPCs', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			const session = await client.createSession(fixture.config({ requestCanvasRenderer: false }));
			const startedBeforeIntrospection = await waitFor(() => fixture.readAudit('started'), value => value.length === 1);
			await fixture.waitForCanvas(session);
			await session.rpc.tools.initializeAndValidate();
			const instance = await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'headless', input: { documentId: 'document-one' } });
			const document = await (await fetchFixture(instance, '/document')).json();
			assert.deepStrictEqual({
				capabilities: session.capabilities,
				catalog: await session.rpc.canvas.list(),
				tools: await toolNames(session),
				startedBeforeIntrospection: startedBeforeIntrospection.length,
				document,
				permissionRequests: fixture.permissionRequests,
			}, {
				capabilities: { ui: { elicitation: false, mcpApps: false, canvases: false }, extensions: true },
				catalog: { canvases: [declaration] },
				tools: ['extensions_manage', 'extensions_reload'],
				startedBeforeIntrospection: 1,
				document: { documentId: 'document-one', value: 0, actions: 0, interactions: 0 },
				permissionRequests: [],
			});
		});
	});

	test('discovery is inert, per-ID disable prevents startup, and session enable persists globally', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			const discovery = await client.rpc.extensions.discover();
			const beforeDiscoveryStartup = await fixture.readAudit('started');
			await client.rpc.extensions.disable({ ids: [extensionId] });
			const session = await client.createSession(fixture.config());
			const disabled = await session.rpc.extensions.list();
			const disabledCatalog = await session.rpc.canvas.list();
			const disabledStartup = await fixture.readAudit('started');
			await session.rpc.extensions.enable({ id: extensionId });
			await fixture.waitForCanvas(session);
			assert.deepStrictEqual({
				discovery,
				beforeDiscoveryStartup,
				disabled,
				disabledCatalog,
				disabledStartup,
				enabled: (await session.rpc.extensions.list()).extensions.map(({ pid, ...extension }) => extension),
				persistedDiscovery: await client.rpc.extensions.discover(),
				permissionRequests: fixture.permissionRequests,
			}, {
				discovery: {
					extensions: [{ id: extensionId, name: extensionName, path: join(fixture.extensionDirectory, 'extension.mjs'), source: 'user', enabled: true }],
					mode: 'load_and_augment',
				},
				beforeDiscoveryStartup: [],
				disabled: { extensions: [{ id: extensionId, name: extensionName, source: 'user', status: 'disabled' }] },
				disabledCatalog: { canvases: [] },
				disabledStartup: [],
				enabled: [{ id: extensionId, name: extensionName, source: 'user', status: 'running' }],
				persistedDiscovery: discovery,
				permissionRequests: [],
			});
		});
	});

	test('opt-in auto-starts the fixture and exposes real HTTP, SSE, actions and durable instance events', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			const session = await client.createSession(fixture.config());
			const startedBeforeIntrospection = await waitFor(() => fixture.readAudit('started'), value => value.length === 1);
			await fixture.waitForCanvas(session);
			await session.rpc.tools.initializeAndValidate();
			const cursor = fixture.events.length;
			const opened = await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'panel-one', input: { documentId: 'shared-document' } });
			const health: unknown = await (await fetchFixture(opened, '/health')).json();
			const pid = (await session.rpc.extensions.list()).extensions[0]?.pid;
			assert.ok(typeof pid === 'number');
			const expectedHealth = {
				pid, generation: fixtureUrl(opened, '/').searchParams.get('generation'),
				home: fixture.home, copilotHome: fixture.copilotHome, sdkPath,
				instances: ['panel-one'], subscribers: 0,
			};
			const page = await (await fetchFixture(opened, '/')).text();
			const script = await (await fetchFixture(opened, '/client.js')).text();
			const stream = await fetch(fixtureUrl(opened, '/events'), { signal: AbortSignal.timeout(10_000) });
			assert.ok(stream.ok && stream.body);
			const reader = stream.body.getReader();
			try {
				const initial = await readSseEvent(reader);
				const action = await session.rpc.canvas.action.invoke({ instanceId: 'panel-one', actionName: 'increment', input: { amount: 2 } });
				const afterAction = await readSseEvent(reader);
				const interaction = await (await fetchFixture(opened, '/increment', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ amount: 1 }),
				})).json();
				const afterInteraction = await readSseEvent(reader);
				const second = await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'panel-two', input: { documentId: 'shared-document' } });
				const sameDocument = await (await fetchFixture(second, '/document')).json();
				const snapshot = await session.rpc.canvas.listOpen();
				await session.rpc.canvas.close({ instanceId: 'panel-one' });
				const streamClosed = (await reader.read()).done;
				const remaining = session.openCanvases;
				await session.rpc.canvas.close({ instanceId: 'panel-two' });
				const finalHealth = await (await fetchFixture(opened, '/health')).json();
				const recorded = (instanceId: string) => ({
					type: 'session.canvas.recorded',
					data: { ...instanceIdentity(instanceId), title: 'Counter: shared-document', input: { documentId: 'shared-document' } },
					ephemeral: false,
				});
				const removed = (instanceId: string) => ({ type: 'session.canvas.removed', data: instanceIdentity(instanceId), ephemeral: false });
				assert.deepStrictEqual({
					catalog: await session.rpc.canvas.list(),
					startedBeforeIntrospection,
					opened,
					canvasTools: (await toolNames(session)).filter(name => canvasTools.includes(name)),
					health,
					pageHasButton: page.includes('<button type="button" id="increment">Increment</button>'),
					scriptHasSse: script.includes('new EventSource('),
					initial, action, afterAction, interaction, afterInteraction, sameDocument,
					snapshot, streamClosed, remaining,
					finalSnapshot: await session.rpc.canvas.listOpen(),
					finalHealth,
					events: canvasEvents(fixture.events.slice(cursor)),
					durable: canvasEvents(await session.getEvents()),
					actions: await fixture.readAudit('action'),
					rawHandlerReturns: await fixture.readAudit('action.result'),
					closes: await fixture.readAudit('close'),
					permissionRequests: fixture.permissionRequests,
				}, {
					catalog: { canvases: [declaration] },
					startedBeforeIntrospection: [{ pid }],
					opened: {
						...instanceIdentity('panel-one'), extensionName, title: 'Counter: shared-document', status: 'ready',
						url: opened.url, input: { documentId: 'shared-document' },
					},
					canvasTools: [...canvasTools].sort(),
					health: expectedHealth,
					pageHasButton: true,
					scriptHasSse: true,
					initial: { documentId: 'shared-document', value: 0, actions: 0, interactions: 0 },
					action: { result: { documentId: 'shared-document', value: 2, actions: 1, interactions: 0 } },
					afterAction: { documentId: 'shared-document', value: 2, actions: 1, interactions: 0 },
					interaction: { documentId: 'shared-document', value: 3, actions: 1, interactions: 1 },
					afterInteraction: { documentId: 'shared-document', value: 3, actions: 1, interactions: 1 },
					sameDocument: { documentId: 'shared-document', value: 3, actions: 1, interactions: 1 },
					snapshot: { openCanvases: [opened, second] },
					streamClosed: true,
					remaining: [second],
					finalSnapshot: { openCanvases: [] },
					finalHealth: { ...expectedHealth, instances: [], subscribers: 0 },
					events: [
						{ type: 'session.canvas.opened', data: opened, ephemeral: true }, recorded('panel-one'),
						{ type: 'session.canvas.opened', data: second, ephemeral: true }, recorded('panel-two'),
						{ type: 'session.canvas.closed', data: instanceIdentity('panel-one'), ephemeral: true }, removed('panel-one'),
						{ type: 'session.canvas.closed', data: instanceIdentity('panel-two'), ephemeral: true }, removed('panel-two'),
					],
					durable: [recorded('panel-one'), recorded('panel-two'), removed('panel-one'), removed('panel-two')],
					actions: [{ ...instanceIdentity('panel-one'), actionName: 'increment', input: { amount: 2 }, ...fixture.context() }],
					rawHandlerReturns: [{ documentId: 'shared-document', value: 2, actions: 1, interactions: 0 }],
					closes: ['panel-one', 'panel-two'].map(id => ({ ...instanceIdentity(id), ...fixture.context() })),
					permissionRequests: [],
				});
				assert.deepStrictEqual(await fixture.readDocument('shared-document'), sameDocument);
			} finally {
				await reader.cancel();
				reader.releaseLock();
			}
		});
	});

	test('repeated open invokes the provider again but records only the first input', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			const session = await client.createSession(fixture.config());
			await fixture.waitForCanvas(session);
			const cursor = fixture.events.length;
			const request = { canvasId: 'counter', instanceId: 'repeat', input: { documentId: 'original-document' } };
			const first = await session.rpc.canvas.open(request);
			const repeated = await session.rpc.canvas.open(request);
			const changed = await session.rpc.canvas.open({ ...request, input: { documentId: 'changed-document' } });
			assert.deepStrictEqual({
				repeated,
				changed,
				openCalls: await fixture.readAudit('open'),
				events: canvasEvents(fixture.events.slice(cursor)),
				snapshot: session.openCanvases,
			}, {
				repeated: first,
				changed: { ...first, title: 'Counter: changed-document', input: { documentId: 'changed-document' } },
				openCalls: ['original-document', 'original-document', 'changed-document'].map(documentId => ({
					...instanceIdentity('repeat'), input: { documentId }, ...fixture.context(),
				})),
				events: [
					{ type: 'session.canvas.opened', data: first, ephemeral: true },
					{
						type: 'session.canvas.recorded',
						data: { ...instanceIdentity('repeat'), title: 'Counter: original-document', input: { documentId: 'original-document' } },
						ephemeral: false,
					},
					{ type: 'session.canvas.opened', data: repeated, ephemeral: true },
					{ type: 'session.canvas.opened', data: changed, ephemeral: true },
				],
				snapshot: [changed],
			});
		});
	});

	test('rejects invalid inputs and unknown actions before provider callbacks; close errors do not reject close', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			const session = await client.createSession(fixture.config());
			await fixture.waitForCanvas(session);
			await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'validation', input: { documentId: 'validation-document', failOnClose: true } });
			const cases = [
				{ run: () => session.rpc.canvas.open({ canvasId: 'missing', instanceId: 'missing' }), message: /No canvas "missing" is registered/ },
				{ run: () => session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'bad-open', input: { documentId: '../invalid' } }), message: /Invalid input for canvas "counter" open input/ },
				{ run: () => session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'bad-open' }), message: /Invalid input for canvas "counter" open input/ },
				{ run: () => session.rpc.canvas.action.invoke({ instanceId: 'missing', actionName: 'increment', input: { amount: 1 } }), message: /Canvas instance "missing" is not open/ },
				{ run: () => session.rpc.canvas.action.invoke({ instanceId: 'validation', actionName: 'missing', input: { amount: 1 } }), message: /Unknown action "missing"/ },
				{ run: () => session.rpc.canvas.action.invoke({ instanceId: 'validation', actionName: 'increment', input: { amount: 'bad' } }), message: /Invalid input for action "increment"/ },
				{ run: () => session.rpc.canvas.action.invoke({ instanceId: 'validation', actionName: 'increment', input: { amount: 0 } }), message: /Invalid input for action "increment"/ },
				{ run: () => session.rpc.canvas.action.invoke({ instanceId: 'validation', actionName: 'increment', input: { amount: 1, extra: true } }), message: /Invalid input for action "increment"/ },
			];
			for (const invalid of cases) {
				await assert.rejects(invalid.run, { code: -32603, message: invalid.message });
			}
			await session.rpc.canvas.close({ instanceId: 'validation' });
			await assert.rejects(() => session.rpc.canvas.close({ instanceId: 'validation' }), /Canvas instance "validation" is not open/);
			assert.deepStrictEqual({
				opens: await fixture.readAudit('open'),
				actions: await fixture.readAudit('action'),
				closes: await fixture.readAudit('close'),
				closeFailures: await fixture.readAudit('close.failed'),
				snapshot: session.openCanvases,
			}, {
				opens: [{ ...instanceIdentity('validation'), input: { documentId: 'validation-document', failOnClose: true }, ...fixture.context() }],
				actions: [],
				closes: [{ ...instanceIdentity('validation'), ...fixture.context() }],
				closeFailures: [{ instanceId: 'validation' }],
				snapshot: [],
			});
		});
	});

	test('managed tool permissions do not sandbox the extension backend or guard direct canvas actions', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			const session = await client.createSession(fixture.config({
				managedSettings: { permissions: { deny: ['Read(**)', 'Edit(**)', 'Shell(*)'] } },
				excludedTools: ['extensions_manage', 'extensions_reload'],
			}));
			await fixture.waitForCanvas(session);
			await session.rpc.tools.initializeAndValidate();
			const instance = await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'policy', input: { documentId: 'policy-document' } });
			const action = await session.rpc.canvas.action.invoke({ instanceId: 'policy', actionName: 'increment', input: { amount: 1 } });
			assert.deepStrictEqual({
				action,
				document: await (await fetchFixture(instance, '/document')).json(),
				permissionRequests: fixture.permissionRequests,
				tools: await toolNames(session),
			}, {
				action: { result: { documentId: 'policy-document', value: 1, actions: 1, interactions: 0 } },
				document: { documentId: 'policy-document', value: 1, actions: 1, interactions: 0 },
				permissionRequests: [],
				tools: [...canvasTools].sort(),
			});
		});
	});

	test('provider disable hides live instances while the SDK retains a stale endpoint until reconnect', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			const session = await client.createSession(fixture.config());
			await fixture.waitForCanvas(session);
			const instance = await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'unavailable', input: { documentId: 'unavailable-document' } });
			const cursor = fixture.events.length;
			await session.rpc.extensions.disable({ id: extensionId });
			await waitFor(() => session.rpc.canvas.list(), value => value.canvases.length === 0);
			assert.deepStrictEqual({
				live: await session.rpc.canvas.listOpen(),
				snapshot: session.openCanvases,
				events: canvasEvents(fixture.events.slice(cursor)),
				closes: await fixture.readAudit('close'),
			}, {
				live: { openCanvases: [] },
				snapshot: [instance],
				events: [
					{ type: 'session.canvas.unavailable', data: instanceIdentity('unavailable'), ephemeral: true },
					{ type: 'session.canvas.registry_changed', data: { canvases: [] }, ephemeral: true },
				],
				closes: [],
			});
			await session.rpc.extensions.enable({ id: extensionId });
			await fixture.waitForCanvas(session, 2);
			const ready = await waitFor(
				() => session.rpc.canvas.listOpen(),
				value => value.openCanvases.length === 1 && value.openCanvases[0].url !== instance.url,
			);
			assert.deepStrictEqual(await (await fetchFixture(ready.openCanvases[0], '/document')).json(), {
				documentId: 'unavailable-document', value: 0, actions: 0, interactions: 0,
			});
		});
	});

	test('per-ID startup decisions persist through explicit enable, disable, reload and cold resume', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			await client.rpc.extensions.disable({ ids: [extensionId] });
			const options = fixture.config({ infiniteSessions: { enabled: true } });
			const session = await client.createSession(options);
			assert.ok(session.workspacePath, 'Expected an isolated session workspace');
			await session.rpc.name.set({ name: 'Startup decision persistence' });
			const states = [await fixture.readStartupState('create disabled', client, session)];
			await session.rpc.extensions.reload();
			states.push(await fixture.readStartupState('reload disabled before enable', client, session));

			await session.rpc.extensions.enable({ id: extensionId });
			await fixture.waitForCanvas(session);
			await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'startup-persistence', input: { documentId: 'startup-persistence' } });
			await session.rpc.canvas.action.invoke({ instanceId: 'startup-persistence', actionName: 'increment', input: { amount: 1 } });
			await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'closed-before-resume', input: { documentId: 'startup-persistence' } });
			await session.rpc.canvas.close({ instanceId: 'closed-before-resume' });
			states.push(await fixture.readStartupState('explicit enable', client, session));
			await session.rpc.extensions.disable({ id: extensionId });
			await waitFor(() => fixture.readAudit('stopped'), value => value.length === 1);
			states.push(await fixture.readStartupState('explicit disable', client, session));
			await session.rpc.extensions.reload();
			states.push(await fixture.readStartupState('reload disabled after enable', client, session));
			assert.deepStrictEqual(await client.stop(), []);

			const disabledClient = await fixture.start();
			const disabled = await disabledClient.resumeSession(session.sessionId, options);
			states.push(await fixture.readStartupState('resume disabled', disabledClient, disabled));
			await disabled.rpc.extensions.reload();
			states.push(await fixture.readStartupState('reload resumed disabled', disabledClient, disabled));
			await disabled.rpc.extensions.enable({ id: extensionId });
			await fixture.waitForCanvas(disabled, 2);
			states.push(await fixture.readStartupState('explicit enable after resume', disabledClient, disabled));
			assert.deepStrictEqual(await disabledClient.stop(), []);

			const enabledClient = await fixture.start();
			const enabled = await enabledClient.resumeSession(session.sessionId, { ...options, requestCanvasRenderer: false });
			await fixture.waitForCanvas(enabled, 3);
			states.push(await fixture.readStartupState('resume enabled without renderer', enabledClient, enabled));
			await enabled.rpc.extensions.disable({ id: extensionId });
			await waitFor(() => fixture.readAudit('stopped'), value => value.length === 3);
			states.push(await fixture.readStartupState('disable after enabled resume', enabledClient, enabled));
			assert.deepStrictEqual({ states, permissionRequests: fixture.permissionRequests }, {
				states: [
					{ phase: 'create disabled', enabled: false, status: 'disabled', started: 0, stopped: 0 },
					{ phase: 'reload disabled before enable', enabled: false, status: 'disabled', started: 0, stopped: 0 },
					{ phase: 'explicit enable', enabled: true, status: 'running', started: 1, stopped: 0 },
					{ phase: 'explicit disable', enabled: false, status: 'disabled', started: 1, stopped: 1 },
					{ phase: 'reload disabled after enable', enabled: false, status: 'disabled', started: 1, stopped: 1 },
					{ phase: 'resume disabled', enabled: false, status: 'disabled', started: 1, stopped: 1 },
					{ phase: 'reload resumed disabled', enabled: false, status: 'disabled', started: 1, stopped: 1 },
					{ phase: 'explicit enable after resume', enabled: true, status: 'running', started: 2, stopped: 1 },
					{ phase: 'resume enabled without renderer', enabled: true, status: 'running', started: 3, stopped: 2 },
					{ phase: 'disable after enabled resume', enabled: false, status: 'disabled', started: 3, stopped: 3 },
				],
				permissionRequests: [],
			});
		});
	});

	test('resume extension opt-out suppresses a saved enabled backend independently of renderer capability', async () => {
		await withFixture(async fixture => {
			const options = fixture.config({ requestExtensions: false, requestCanvasRenderer: true, infiniteSessions: { enabled: true } });
			const firstClient = await fixture.start();
			const first = await firstClient.createSession({ ...options, requestExtensions: true });
			await fixture.waitForCanvas(first);
			await first.rpc.name.set({ name: 'Extension surface opt-out' });
			await first.rpc.canvas.open({ canvasId: 'counter', instanceId: 'saved-canvas', input: { documentId: 'saved-document' } });
			await first.rpc.canvas.action.invoke({ instanceId: 'saved-canvas', actionName: 'increment', input: { amount: 1 } });
			await first.rpc.canvas.open({ canvasId: 'counter', instanceId: 'closed-before-resume', input: { documentId: 'saved-document' } });
			await first.rpc.canvas.close({ instanceId: 'closed-before-resume' });
			const baselineStartup = await fixture.readAudit('started');
			assert.deepStrictEqual(await firstClient.stop(), []);

			const secondClient = await fixture.start();
			const second = await secondClient.resumeSession(first.sessionId, options);
			await second.rpc.tools.initializeAndValidate();
			assert.deepStrictEqual({
				enabled: (await secondClient.rpc.extensions.discover()).extensions[0]?.enabled,
				started: await fixture.readAudit('started'),
				stopped: await fixture.readAudit('stopped'),
				extensions: await second.rpc.extensions.list(),
				canvasCapability: second.capabilities.ui?.canvases,
				tools: await toolNames(second),
				permissionRequests: fixture.permissionRequests,
			}, {
				enabled: true,
				started: baselineStartup,
				stopped: baselineStartup,
				extensions: { extensions: [] },
				canvasCapability: true,
				tools: [...canvasTools].sort(),
				permissionRequests: [],
			});
		});
	});

	test('a persisted per-ID disable is not a default-deny grant for newly discovered backend code', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			await client.rpc.extensions.disable({ ids: [extensionId] });
			const session = await client.createSession(fixture.config({
				requestCanvasRenderer: false,
				excludedTools: ['extensions_manage', 'extensions_reload'],
			}));
			const newName = 'newly-discovered-canvas-fixture';
			const newId = `user:${newName}`;
			const directory = await fixture.installExtension(newName);
			const discovered = (await client.rpc.extensions.discover()).extensions.map(({ id, enabled }) => ({ id, enabled })).sort((a, b) => a.id.localeCompare(b.id));
			const beforeReload = await fixture.readAudit('started', directory);
			await session.rpc.extensions.reload();
			await waitFor(() => fixture.readAudit('joined', directory), value => value.length === 1);
			const startedBeforeIntrospection = await fixture.readAudit('started', directory);
			await session.rpc.tools.initializeAndValidate();
			const live = await session.rpc.extensions.list();
			const newlyStarted = live.extensions.find(extension => extension.id === newId);
			assert.ok(newlyStarted && typeof newlyStarted.pid === 'number');
			assert.deepStrictEqual({
				discovered,
				beforeReload,
				disabledStartup: await fixture.readAudit('started'),
				startedBeforeIntrospection,
				live: live.extensions.map(({ id, status }) => ({ id, status })).sort((a, b) => a.id.localeCompare(b.id)),
				tools: await toolNames(session),
				permissionRequests: fixture.permissionRequests,
			}, {
				discovered: [{ id: extensionId, enabled: false }, { id: newId, enabled: true }],
				beforeReload: [],
				disabledStartup: [],
				startedBeforeIntrospection: [{ pid: newlyStarted.pid }],
				live: [{ id: extensionId, status: 'disabled' }, { id: newId, status: 'running' }],
				tools: [],
				permissionRequests: [],
			});
			const opened = await session.rpc.canvas.open({
				extensionId: newId, canvasId: 'counter', instanceId: 'newly-discovered', input: { documentId: 'new-document' },
			});
			assert.deepStrictEqual(await (await fetchFixture(opened, '/document')).json(), {
				documentId: 'new-document', value: 0, actions: 0, interactions: 0,
			});
			await session.rpc.canvas.close({ instanceId: 'newly-discovered' });
		});
	});

	test('a named single-open canvas is not retained even with explicit workspace persistence', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			const options = fixture.config({ infiniteSessions: { enabled: true } });
			const session = await client.createSession(options);
			await fixture.waitForCanvas(session);
			await session.rpc.name.set({ name: 'Named single-open canvas' });
			await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'named-single', input: { documentId: 'named-single-document' } });
			assert.deepStrictEqual({
				name: await session.rpc.name.get(),
				durable: canvasEvents(await session.getEvents()),
			}, {
				name: { name: 'Named single-open canvas' },
				durable: [{
					type: 'session.canvas.recorded',
					data: { ...instanceIdentity('named-single'), title: 'Counter: named-single-document', input: { documentId: 'named-single-document' } },
					ephemeral: false,
				}],
			});
			assert.deepStrictEqual(await client.stop(), []);
			const next = await fixture.start();
			await assert.rejects(() => next.resumeSession(session.sessionId, options), /Session not found: local-canvas-contract/);
		});
	});

	test('an unnamed canvas-only session is not retained on runtime shutdown', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			const session = await client.createSession(fixture.config());
			await fixture.waitForCanvas(session);
			await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'unnamed', input: { documentId: 'unnamed-document' } });
			assert.deepStrictEqual(await client.stop(), []);
			const next = await fixture.start();
			await assert.rejects(() => next.resumeSession(session.sessionId, fixture.config()), /Session not found: local-canvas-contract/);
		});
	});

	test('provider reconnect and runtime restart resolve fresh endpoints without replaying actions or removed instances', async () => {
		await withFixture(async fixture => {
			const client = await fixture.start();
			const session = await client.createSession(fixture.config());
			await session.rpc.name.set({ name: 'Local canvas contract' });
			await fixture.waitForCanvas(session);
			const first = await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'survivor', input: { documentId: 'durable-document' } });
			await session.rpc.canvas.action.invoke({ instanceId: 'survivor', actionName: 'increment', input: { amount: 3 } });
			await session.rpc.canvas.open({ canvasId: 'counter', instanceId: 'removed', input: { documentId: 'durable-document' } });
			await session.rpc.canvas.close({ instanceId: 'removed' });
			const cursor = fixture.events.length;
			await session.rpc.extensions.reload();
			await fixture.waitForCanvas(session, 2);
			const reconnected = await waitFor(
				() => session.rpc.canvas.listOpen(),
				value => value.openCanvases.length === 1 && value.openCanvases[0].url !== first.url,
			);
			const second = reconnected.openCanvases[0];
			assert.deepStrictEqual({
				document: await (await fetchFixture(second, '/document')).json(),
				events: canvasEvents(fixture.events.slice(cursor)),
				actionCount: (await fixture.readAudit('action')).length,
				closeCount: (await fixture.readAudit('close')).length,
			}, {
				document: { documentId: 'durable-document', value: 3, actions: 1, interactions: 0 },
				events: [
					{ type: 'session.canvas.unavailable', data: instanceIdentity('survivor'), ephemeral: true },
					{ type: 'session.canvas.registry_changed', data: { canvases: [] }, ephemeral: true },
					{ type: 'session.canvas.registry_changed', data: { canvases: [declaration] }, ephemeral: true },
					{ type: 'session.canvas.opened', data: second, ephemeral: true },
				],
				actionCount: 1,
				closeCount: 1,
			});
			assert.deepStrictEqual(await client.stop(), []);
			await assert.rejects(() => fetch(fixtureUrl(second, '/health'), { signal: AbortSignal.timeout(2000) }), /fetch failed/);
			const restoredClient = await fixture.start();
			const restoreCursor = fixture.events.length;
			const restored = await restoredClient.resumeSession(session.sessionId, fixture.config());
			await fixture.waitForCanvas(restored, 3);
			const restoredSnapshot = await waitFor(
				() => restored.rpc.canvas.listOpen(),
				value => value.openCanvases.length === 1 && !!value.openCanvases[0].url,
			);
			const third = restoredSnapshot.openCanvases[0];
			assert.notStrictEqual(third.url, second.url);
			assert.deepStrictEqual({
				identity: { ...third, url: undefined },
				snapshot: restored.openCanvases,
				document: await (await fetchFixture(third, '/document')).json(),
				actionCount: (await fixture.readAudit('action')).length,
				closes: await fixture.readAudit('close'),
				restoredOpens: canvasEvents(fixture.events.slice(restoreCursor)).filter(event => event.type === 'session.canvas.opened'),
			}, {
				identity: { ...first, url: undefined },
				snapshot: [third],
				document: { documentId: 'durable-document', value: 3, actions: 1, interactions: 0 },
				actionCount: 1,
				closes: [{ ...instanceIdentity('removed'), ...fixture.context() }],
				restoredOpens: [{ type: 'session.canvas.opened', data: third, ephemeral: true }],
			});
		});
	});
});
