/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { JsonRpcMessage, isJsonRpcRequest } from '../../../../../base/common/jsonRpcProtocol.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue, type ISettableObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService, ILogger } from '../../../../log/common/log.js';
import { IMcpServerDefinition } from '../../../../agentPlugins/common/pluginParsers.js';
import {
	IMcpRemoteServerConfiguration,
	IMcpStdioServerConfiguration,
	McpServerType,
} from '../../../../mcp/common/mcpPlatformTypes.js';
import { ActionType, type ActionEnvelope } from '../../../common/state/sessionActions.js';
import { SessionStatus } from '../../../common/state/sessionState.js';
import {
	McpServerStatusKind,
	type McpServerStatus,
} from '../../../common/state/protocol/state.js';
import { JsonRpcErrorCodes } from '../../../common/state/protocol/errors.js';
import { ProtocolError } from '../../../common/state/sessionProtocol.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { McpAppsInitializeInjector } from '../../../node/mcpHost/mcpInitializeInjector.js';
import { McpHostServiceImpl } from '../../../node/mcpHost/mcpHostServiceImpl.js';
import { buildMcpServerUri } from '../../../common/state/mcpServerUri.js';
import type { IMcpUpstream, IMcpUpstreamCapabilities } from '../../../node/mcpHost/mcpUpstream.js';
import type { IMcpProxy, IMcpProxyFactory, IMcpProxyOptions } from '../../../node/mcpHost/mcpProxy.js';
import type { IUpstreamRequestOutcome } from '../../../node/mcpHost/mcpProxyRoute.js';

// ----- Mocks ---------------------------------------------------------------

class StubUpstream implements IMcpUpstream {
	public readonly status = { read: () => ({ kind: McpServerStatusKind.Stopped }) } as unknown as IMcpUpstream['status'];
	public readonly onMessage = (() => () => { /* unsubscribe */ }) as unknown as IMcpUpstream['onMessage'];
	private readonly _upstreamCapabilities: ISettableObservable<IMcpUpstreamCapabilities | undefined> =
		observableValue<IMcpUpstreamCapabilities | undefined>('stub-caps', undefined);
	public readonly upstreamCapabilities = this._upstreamCapabilities;
	public startCalls = 0;
	public disposed = false;

	public async start(): Promise<McpServerStatus> {
		this.startCalls++;
		return { kind: McpServerStatusKind.Ready };
	}
	public async send(_message: JsonRpcMessage): Promise<void> { /* noop */ }
	public setBearerToken(_token: string | undefined): void { /* noop */ }
	public setUpstreamCapabilities(caps: IMcpUpstreamCapabilities | undefined): void {
		this._upstreamCapabilities.set(caps, undefined);
	}
	public dispose(): void { this.disposed = true; }
}

class StubProxy implements IMcpProxy {
	public readonly resource: URI;
	public readonly endpoint: URI;
	public disposed = false;
	public readonly sentMessages: JsonRpcMessage[] = [];

	/**
	 * Synchronous reply for the next `sendClientMessage` call. If unset,
	 * `sendClientMessage` returns a pending DeferredPromise the test must
	 * resolve manually.
	 */
	public nextResponse: JsonRpcMessage | undefined;

	constructor(public readonly options: IMcpProxyOptions) {
		this.resource = options.resource;
		this.endpoint = URI.parse(`http://127.0.0.1:1/mcp/${encodeURIComponent(options.resource.toString())}`);
	}

	public async authenticate(_resource: string, _token: string): Promise<boolean> {
		return true;
	}

	public sendClientMessage(message: JsonRpcMessage): Promise<JsonRpcMessage | undefined> {
		this.sentMessages.push(message);
		if (this.nextResponse !== undefined) {
			const response = this.nextResponse;
			this.nextResponse = undefined;
			if (isJsonRpcRequest(message)) {
				return Promise.resolve({ ...(response as { id?: unknown }), id: message.id } as JsonRpcMessage);
			}
			return Promise.resolve(response);
		}
		return Promise.resolve(undefined);
	}

	public getToolUiMeta(): undefined {
		return undefined;
	}

	public getUiHostCapabilities() {
		return {};
	}

	public dispose(): void { this.disposed = true; }
}

interface IRecordedCreate {
	readonly options: IMcpProxyOptions;
	readonly upstream: StubUpstream;
}

class StubProxyFactory implements IMcpProxyFactory {
	public readonly _serviceBrand: undefined;
	public readonly created: IRecordedCreate[] = [];
	public readonly proxies: StubProxy[] = [];
	public failNextCreate: Error | undefined;
	/** When set, `create()` blocks until this is resolved. */
	public pendingCreate: DeferredPromise<void> | undefined;

	public async create(options: IMcpProxyOptions): Promise<IMcpProxy> {
		if (this.pendingCreate) {
			await this.pendingCreate.p;
		}
		if (this.failNextCreate) {
			const err = this.failNextCreate;
			this.failNextCreate = undefined;
			throw err;
		}
		const upstream = options.upstream as StubUpstream;
		this.created.push({ options, upstream });
		const proxy = new StubProxy(options);
		this.proxies.push(proxy);
		return proxy;
	}
}

/**
 * Subclass that swaps the real stdio/HTTP upstreams for {@link StubUpstream}.
 */
class TestMcpHostService extends McpHostServiceImpl {
	public readonly createdUpstreams: StubUpstream[] = [];
	protected override _createUpstream(_def: IMcpServerDefinition, _logger: ILogger): IMcpUpstream {
		const upstream = new StubUpstream();
		this.createdUpstreams.push(upstream);
		return upstream;
	}
}

// ----- Helpers --------------------------------------------------------------

function stdioDef(name: string, command = 'node', args: readonly string[] = []): IMcpServerDefinition {
	const configuration: IMcpStdioServerConfiguration = {
		type: McpServerType.LOCAL,
		command,
		args,
	};
	return { name, configuration, uri: URI.parse('file:///plugins/test') };
}

function remoteDef(name: string, url: string): IMcpServerDefinition {
	const configuration: IMcpRemoteServerConfiguration = {
		type: McpServerType.REMOTE,
		url,
	};
	return { name, configuration, uri: URI.parse('file:///plugins/test') };
}

interface IHarness {
	readonly service: TestMcpHostService;
	readonly factory: StubProxyFactory;
	readonly stateManager: AgentHostStateManager;
	readonly envelopes: ActionEnvelope[];
	readonly session: URI;
}

function setupHarness(disposables: DisposableStore): IHarness {
	const logService = new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const factory = new StubProxyFactory();
	const service = disposables.add(new TestMcpHostService(stateManager, factory, logService));
	const envelopes: ActionEnvelope[] = [];
	const session = URI.parse('copilot:/test-session');
	stateManager.createSession({
		resource: session.toString(),
		provider: 'copilot',
		title: 'Test',
		status: SessionStatus.Idle,
		createdAt: Date.now(),
		modifiedAt: Date.now(),
	});
	disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
	return {
		service,
		factory,
		stateManager,
		envelopes,
		session,
	};
}

/** Wait for the proxy factory to record at least `count` creates. */
async function waitForCreate(factory: StubProxyFactory, count = 1): Promise<void> {
	for (let i = 0; i < 50; i++) {
		if (factory.created.length >= count) {
			return;
		}
		await timeout(0);
	}
	throw new Error(`StubProxyFactory.create not called ${count} times after timeout`);
}

// ----- Tests ---------------------------------------------------------------

suite('McpHostServiceImpl', () => {

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('setSessionServers emits McpServerAdded with Starting status', async () => {
		const h = setupHarness(disposables);
		const def = stdioDef('foo');

		const handles = h.service.setSessionServers(h.session, [def]);
		await waitForCreate(h.factory);

		const expectedResource = buildMcpServerUri(h.session, 'foo').toString();
		const addedEnvelopes = h.envelopes.filter(e => e.action.type === ActionType.McpServerAdded);

		assert.deepStrictEqual({
			handleCount: handles.length,
			handleResource: handles[0]?.resource.toString(),
			added: addedEnvelopes.map(e => e.action.type === ActionType.McpServerAdded ? e.action.server : null),
		}, {
			handleCount: 1,
			handleResource: expectedResource,
			added: [{
				resource: expectedResource,
				label: 'foo',
				status: { kind: McpServerStatusKind.Starting },
			}],
		});
	});

	test('setSessionServers records summaries without emitting actions before session state exists', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const factory = new StubProxyFactory();
		const service = disposables.add(new TestMcpHostService(stateManager, factory, logService));
		const envelopes: ActionEnvelope[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
		const session = URI.parse('copilot:/pre-state');

		service.setSessionServers(session, [stdioDef('foo')]);
		await waitForCreate(factory);
		factory.created[0].options.onStateChange({ kind: McpServerStatusKind.Ready });

		assert.deepStrictEqual({
			envelopes: envelopes.map(e => e.action.type),
			summaries: service.getServerSummaries(session),
		}, {
			envelopes: [],
			summaries: [{
				resource: buildMcpServerUri(session, 'foo').toString(),
				label: 'foo',
				status: { kind: McpServerStatusKind.Ready },
			}],
		});
	});

	test('successful proxy.create flips status to Ready via onStateChange', async () => {
		const h = setupHarness(disposables);
		h.service.setSessionServers(h.session, [stdioDef('foo')]);

		await waitForCreate(h.factory);
		// Simulate the proxy emitting Ready (real proxy autorun does this
		// when upstream observable transitions).
		h.factory.created[0].options.onStateChange({ kind: McpServerStatusKind.Ready });

		const statusChanges = h.envelopes
			.filter(e => e.action.type === ActionType.McpServerStatusChanged)
			.map(e => e.action.type === ActionType.McpServerStatusChanged ? e.action.status : null);
		assert.deepStrictEqual(statusChanges.at(-1), { kind: McpServerStatusKind.Ready });
	});

	test('failed proxy.create flips status to Error', async () => {
		const h = setupHarness(disposables);
		h.factory.failNextCreate = new Error('listener bind failed');
		h.service.setSessionServers(h.session, [stdioDef('foo')]);

		// Wait for the rejection to propagate.
		for (let i = 0; i < 50; i++) {
			if (h.envelopes.some(e => e.action.type === ActionType.McpServerStatusChanged)) { break; }
			await timeout(0);
		}

		const errorStatus = h.envelopes
			.filter(e => e.action.type === ActionType.McpServerStatusChanged)
			.map(e => e.action.type === ActionType.McpServerStatusChanged ? e.action.status : null)
			.at(-1);
		assert.deepStrictEqual(errorStatus, {
			kind: McpServerStatusKind.Error,
			error: { errorType: 'proxyCreateFailed', message: 'listener bind failed' },
		});
	});

	test('setSessionServers([]) removes the entry and disposes the proxy', async () => {
		const h = setupHarness(disposables);
		h.service.setSessionServers(h.session, [stdioDef('foo')]);
		await waitForCreate(h.factory);

		h.envelopes.length = 0;
		h.service.setSessionServers(h.session, []);

		assert.deepStrictEqual({
			removedCount: h.envelopes.filter(e => e.action.type === ActionType.McpServerRemoved).length,
			proxyDisposed: h.factory.proxies[0].disposed,
		}, {
			removedCount: 1,
			proxyDisposed: true,
		});
	});

	test('setSessionServers reconfigures (same id, different config) → remove + add', async () => {
		const h = setupHarness(disposables);
		h.service.setSessionServers(h.session, [stdioDef('foo', 'node', ['v1'])]);
		await waitForCreate(h.factory);

		h.envelopes.length = 0;
		h.service.setSessionServers(h.session, [stdioDef('foo', 'node', ['v2'])]);
		await waitForCreate(h.factory, 2);

		assert.deepStrictEqual(
			h.envelopes.map(e => e.action.type),
			[ActionType.McpServerRemoved, ActionType.McpServerAdded],
		);
	});

	test('setSessionServers no-op (same id, same config) emits nothing', async () => {
		const h = setupHarness(disposables);
		const def = stdioDef('foo');
		h.service.setSessionServers(h.session, [def]);
		await waitForCreate(h.factory);

		h.envelopes.length = 0;
		const handles = h.service.setSessionServers(h.session, [stdioDef('foo')]);

		assert.deepStrictEqual({
			envelopes: h.envelopes,
			handleCount: handles.length,
			createCount: h.factory.created.length,
		}, {
			envelopes: [],
			handleCount: 1,
			createCount: 1,
		});
	});

	test('getServer returns undefined for unknown resources', () => {
		const h = setupHarness(disposables);
		assert.strictEqual(h.service.getServer(URI.parse('mcp:/no-such/server')), undefined);
	});

	test('callMethod for unknown server throws ProtocolError(InvalidParams)', async () => {
		const h = setupHarness(disposables);
		const unknown = buildMcpServerUri(h.session, 'missing');
		await assert.rejects(
			() => h.service.callMethod(
				{ server: unknown.toString(), method: 'tools/list' },
			),
			(err: Error) => err instanceof ProtocolError && err.code === JsonRpcErrorCodes.InvalidParams,
		);
	});

	test('callMethod for known server forwards to proxy.sendClientMessage', async () => {
		const h = setupHarness(disposables);
		h.service.setSessionServers(h.session, [stdioDef('foo')]);
		await waitForCreate(h.factory);

		const proxy = h.factory.proxies[0];
		proxy.nextResponse = { jsonrpc: '2.0', id: 'replaced', result: { ok: true } } as JsonRpcMessage;
		const result = await h.service.callMethod(
			{ server: buildMcpServerUri(h.session, 'foo').toString(), method: 'tools/list' },
		);

		assert.deepStrictEqual({
			result,
			sentCount: proxy.sentMessages.length,
			method: (proxy.sentMessages[0] as { method?: string }).method,
		}, {
			result: { result: { ok: true } },
			sentCount: 1,
			method: 'tools/list',
		});
	});

	test('notify for known server sends a JSON-RPC notification through the proxy', async () => {
		const h = setupHarness(disposables);
		h.service.setSessionServers(h.session, [stdioDef('foo')]);
		await waitForCreate(h.factory);

		const proxy = h.factory.proxies[0];
		h.service.notify({
			server: buildMcpServerUri(h.session, 'foo').toString(),
			method: 'notifications/message',
			params: { level: 'info', data: 'hi' },
		});

		assert.strictEqual(proxy.sentMessages.length, 1);
		assert.deepStrictEqual(proxy.sentMessages[0], {
			jsonrpc: '2.0',
			method: 'notifications/message',
			params: { level: 'info', data: 'hi' },
		});
	});

	test('proxy is created with an McpAppsInitializeInjector', async () => {
		const h = setupHarness(disposables);
		h.service.setSessionServers(h.session, [stdioDef('foo')]);
		await waitForCreate(h.factory);

		assert.ok(
			h.factory.created[0].options.initializeInjector instanceof McpAppsInitializeInjector,
			'expected initializeInjector to be McpAppsInitializeInjector',
		);
	});

	test('upstream request is routed to the installed upstream delegate', async () => {
		const h = setupHarness(disposables);
		h.service.setSessionServers(h.session, [stdioDef('foo')]);
		await waitForCreate(h.factory);

		let receivedMethod: string | undefined;
		h.service.setUpstreamDelegate({
			handleUpstreamRequest: async (request) => {
				receivedMethod = request.method;
				return { result: { ok: true } };
			},
			handleUpstreamNotification: () => { /* unused */ },
		});

		const outcome: IUpstreamRequestOutcome = await h.factory.created[0].options.onUpstreamRequest('sampling/createMessage', { messages: [] });

		assert.deepStrictEqual({ method: receivedMethod, outcome }, {
			method: 'sampling/createMessage',
			outcome: { result: { ok: true } },
		});
	});

	test('upstream request without an installed delegate yields MethodNotFound', async () => {
		const h = setupHarness(disposables);
		h.service.setSessionServers(h.session, [stdioDef('foo')]);
		await waitForCreate(h.factory);

		const outcome = await h.factory.created[0].options.onUpstreamRequest('sampling/createMessage', { messages: [] });
		assert.strictEqual(outcome.error?.code, JsonRpcErrorCodes.MethodNotFound);
	});

	test('upstream notification is forwarded to the installed delegate', async () => {
		const h = setupHarness(disposables);
		h.service.setSessionServers(h.session, [stdioDef('foo')]);
		await waitForCreate(h.factory);

		let receivedMethod: string | undefined;
		h.service.setUpstreamDelegate({
			handleUpstreamRequest: async () => ({ result: {} }),
			handleUpstreamNotification: (notification) => { receivedMethod = notification.method; },
		});

		h.factory.created[0].options.onUpstreamNotification('notifications/tools/list_changed', undefined);
		assert.strictEqual(receivedMethod, 'notifications/tools/list_changed');
	});

	test('remote MCP definition routes through HTTP upstream', async () => {
		const h = setupHarness(disposables);
		h.service.setSessionServers(h.session, [remoteDef('rem', 'https://example.com/mcp')]);
		await waitForCreate(h.factory);

		assert.strictEqual(h.factory.created.length, 1);
	});
});
