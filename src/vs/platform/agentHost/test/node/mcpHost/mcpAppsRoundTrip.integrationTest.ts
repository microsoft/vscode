/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end MCP Apps round-trip test. Wires together {@link McpHostServiceImpl},
 * a real {@link McpProxyFactory} (which binds a real localhost HTTP listener),
 * a real {@link AgentHostStateManager}, and a fake in-memory MCP App upstream
 * that simulates the wire behaviour of an MCP server speaking the
 * `io.modelcontextprotocol/ui` extension.
 *
 * The single test in this suite exercises the full lifecycle the MCP Apps
 * extension relies on, in the order it occurs at runtime:
 *
 *   1. `setSessionServers` registers the MCP server, the host kicks off
 *      proxy creation, and the per-(session, server) entry exposes an HTTP
 *      endpoint URI back to the SDK.
 *
 *   2. The SDK (simulated via `fetch`) issues `initialize` to the proxy
 *      endpoint. {@link McpAppsInitializeInjector} rewrites the outbound
 *      params to advertise `mcp.apps`. The fake upstream replies with its
 *      own Apps capability; {@link McpProxyRoute} captures it on the
 *      upstream's `upstreamCapabilities` observable, which is what
 *      {@link McpHostServiceImpl.sendMessage} consults when gating `ui/*`
 *      methods.
 *
 *   3. The fake upstream pushes a `ui/notifications/host-context-changed`
 *      notification. The proxy taps it and fires `onUpstreamMessage`,
 *      which causes the host service to dispatch `mcp/messageReceived`
 *      followed by an immediate `mcp/messageRemoved` (notifications have
 *      no response phase).
 *
 *   4. An AHP client invokes `mcpMessage` for `ui/some-method`. The host
 *      service's allowlist permits the call (client advertises `mcp.apps`,
 *      upstream advertises Apps), the request reaches the fake which
 *      auto-replies, and the result is propagated back as
 *      {@link McpMessageResult}.
 *
 *   5. The fake upstream pushes a server→client `ui/open-link` request.
 *      The proxy taps it; the host service mints a fresh messageId and
 *      dispatches `mcp/messageReceived` with the call.
 *
 *   6. The AHP client supplies a response via `deliverResponse` (the
 *      handler for the client-dispatchable `mcp/messageResponded` action).
 *      The proxy resolves the messageId back to the upstream's original
 *      JSON-RPC id and writes the response onto the upstream transport.
 *      The host service then dispatches `mcp/messageRemoved`.
 *
 * Run via `scripts/test-integration.sh` / `scripts\test-integration.bat`.
 */

import * as assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, type Event } from '../../../../../base/common/event.js';
import {
	isJsonRpcRequest,
	isJsonRpcResponse,
	type IJsonRpcRequest,
	type IJsonRpcSuccessResponse,
	type JsonRpcId,
	type JsonRpcMessage,
} from '../../../../../base/common/jsonRpcProtocol.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import {
	observableValue,
	type IObservable,
	type ISettableObservable,
} from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMcpServerDefinition } from '../../../../agentPlugins/common/pluginParsers.js';
import { ILogger, NullLogService } from '../../../../log/common/log.js';
import { McpServerType } from '../../../../mcp/common/mcpPlatformTypes.js';
import { ActionType, type ActionEnvelope } from '../../../common/state/sessionActions.js';
import {
	McpRpcMessageKind,
	McpServerStatusKind,
	type McpRpcCallResponse,
	type McpServerStatus,
} from '../../../common/state/protocol/state.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import type { IMcpServerHandle } from '../../../common/mcpHost/mcpHostService.js';
import { McpHostServiceImpl } from '../../../node/mcpHost/mcpHostServiceImpl.js';
import { McpProxyFactory } from '../../../node/mcpHost/mcpProxy.js';
import type { IMcpUpstream, IMcpUpstreamCapabilities } from '../../../node/mcpHost/mcpUpstream.js';

// ----- Fake MCP App upstream ----------------------------------------------

const APPS_EXTENSION_KEY = 'io.modelcontextprotocol/ui';

const APPS_INITIALIZE_RESULT = {
	protocolVersion: '2024-11-05',
	capabilities: {
		extensions: {
			[APPS_EXTENSION_KEY]: { mimeTypes: ['text/html;profile=mcp-app'] },
		},
	},
	serverInfo: { name: 'fake-apps-server', version: '0.0.1' },
} as const;

/**
 * In-memory {@link IMcpUpstream} that simulates an MCP server speaking the
 * Apps extension. Auto-replies to `initialize` with the Apps capability,
 * captures everything sent by the SDK/proxy, and exposes
 * {@link FakeMcpAppsUpstream.pushNotification} and
 * {@link FakeMcpAppsUpstream.pushRequest} so the test can drive
 * server→client traffic.
 */
class FakeMcpAppsUpstream extends Disposable implements IMcpUpstream {

	private readonly _status: ISettableObservable<McpServerStatus> =
		observableValue<McpServerStatus>('fake-upstream', { kind: McpServerStatusKind.Stopped });
	public readonly status: IObservable<McpServerStatus> = this._status;

	private readonly _onMessage = this._register(new Emitter<JsonRpcMessage>());
	public readonly onMessage: Event<JsonRpcMessage> = this._onMessage.event;

	private readonly _upstreamCapabilities: ISettableObservable<IMcpUpstreamCapabilities | undefined> =
		observableValue<IMcpUpstreamCapabilities | undefined>('fake-upstream-caps', undefined);
	public readonly upstreamCapabilities: IObservable<IMcpUpstreamCapabilities | undefined> = this._upstreamCapabilities;

	/** Every JSON-RPC message the proxy/SDK sent to the upstream. */
	public readonly received: JsonRpcMessage[] = [];

	/** Auto-reply policy keyed by request method (used for `ui/*` calls). */
	private readonly _replies = new Map<string, unknown>();

	private _upstreamReqCounter = 0;

	public override dispose(): void {
		super.dispose();
	}

	public async start(): Promise<McpServerStatus> {
		this._status.set({ kind: McpServerStatusKind.Starting }, undefined);
		// Yield once so any observer that latched onto Starting can run
		// before we transition to Ready — mirrors the real stdio upstream.
		await Promise.resolve();
		const ready: McpServerStatus = { kind: McpServerStatusKind.Ready };
		this._status.set(ready, undefined);
		return ready;
	}

	public async send(message: JsonRpcMessage): Promise<void> {
		this.received.push(message);

		if (isJsonRpcRequest(message)) {
			if (message.method === 'initialize') {
				this._onMessage.fire({
					jsonrpc: '2.0',
					id: message.id,
					result: APPS_INITIALIZE_RESULT,
				} satisfies IJsonRpcSuccessResponse);
				return;
			}
			if (this._replies.has(message.method)) {
				const result = this._replies.get(message.method);
				this._onMessage.fire({
					jsonrpc: '2.0',
					id: message.id,
					result,
				} satisfies IJsonRpcSuccessResponse);
			}
		}
	}

	public setBearerToken(_token: string | undefined): void { /* noop */ }

	public setUpstreamCapabilities(caps: IMcpUpstreamCapabilities | undefined): void {
		this._upstreamCapabilities.set(caps, undefined);
	}

	// ---- Test driver helpers ----

	public replyTo(method: string, result: unknown): void {
		this._replies.set(method, result);
	}

	public pushNotification(method: string, params?: unknown): void {
		this._onMessage.fire({ jsonrpc: '2.0', method, params });
	}

	public pushRequest(method: string, params?: unknown): JsonRpcId {
		const id: JsonRpcId = ++this._upstreamReqCounter;
		this._onMessage.fire({ jsonrpc: '2.0', id, method, params } satisfies IJsonRpcRequest);
		return id;
	}

	public lastReceivedRequest(method: string): IJsonRpcRequest | undefined {
		for (let i = this.received.length - 1; i >= 0; i--) {
			const m = this.received[i];
			if (isJsonRpcRequest(m) && m.method === method) {
				return m;
			}
		}
		return undefined;
	}

	public lastResponseTo(id: JsonRpcId): JsonRpcMessage | undefined {
		for (let i = this.received.length - 1; i >= 0; i--) {
			const m = this.received[i];
			if (isJsonRpcResponse(m) && m.id === id) {
				return m;
			}
		}
		return undefined;
	}
}

// ----- Test seam ----------------------------------------------------------

/**
 * Subclass that swaps the real stdio/HTTP upstreams for a caller-supplied
 * factory. The test uses this to inject {@link FakeMcpAppsUpstream} instead
 * of the production transports.
 */
class TestMcpHostService extends McpHostServiceImpl {
	constructor(
		stateManager: AgentHostStateManager,
		proxyFactory: McpProxyFactory,
		logService: NullLogService,
		private readonly _upstreamFactory: () => IMcpUpstream,
	) {
		super(stateManager, proxyFactory, logService);
	}
	protected override _createUpstream(_def: IMcpServerDefinition, _logger: ILogger): IMcpUpstream {
		return this._upstreamFactory();
	}
}

// ----- Helpers ------------------------------------------------------------

async function fetchPostJson(endpoint: URI, body: unknown): Promise<{ status: number; json: unknown }> {
	const response = await fetch(endpoint.toString(true), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const text = await response.text();
	return { status: response.status, json: text.length > 0 ? JSON.parse(text) : undefined };
}

async function waitForEndpoint(handle: IMcpServerHandle): Promise<URI> {
	for (let i = 0; i < 200; i++) {
		const ep = handle.endpoint.get();
		if (ep) {
			return ep;
		}
		await timeout(10);
	}
	throw new Error('Timed out waiting for proxy endpoint');
}

async function flushMicrotasks(): Promise<void> {
	// Three turns is enough for autorun + the route's onUpstreamMessage tap
	// to settle through the host service's dispatch path.
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

// ----- Test ---------------------------------------------------------------

suite('MCP Apps round-trip (integration)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('full ui/* lifecycle: initialize, notification, client→server call, server→client request', async () => {
		const logService = new NullLogService();
		const stateManager = new AgentHostStateManager(logService);
		const proxyFactory = new McpProxyFactory(logService);
		const fakeUpstream = new FakeMcpAppsUpstream();
		fakeUpstream.replyTo('ui/some-method', { ok: true, payload: 42 });

		const hostService = new TestMcpHostService(stateManager, proxyFactory, logService, () => fakeUpstream);

		const envelopes: ActionEnvelope[] = [];
		const envelopeSubscription = stateManager.onDidEmitEnvelope(e => envelopes.push(e));

		try {
			// ---- 1. Register the MCP server. ----------------------------
			const session = URI.parse('copilot:/00000000-0000-0000-0000-000000000001');
			const def: IMcpServerDefinition = {
				name: 'apps-server',
				uri: URI.parse('inmemory:/apps-server'),
				configuration: { type: McpServerType.LOCAL, command: 'unused', args: [] },
			};
			const [handle] = hostService.setSessionServers(session, [def]);
			const endpoint = await waitForEndpoint(handle);

			// ---- 2. SDK posts `initialize` through the proxy. -----------
			const initResp = await fetchPostJson(endpoint, {
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: '2024-11-05',
					capabilities: { sampling: {} },
					clientInfo: { name: 'test-sdk', version: '0.0.0' },
				},
			});

			const initResult = (initResp.json as { result?: { capabilities?: { extensions?: Record<string, unknown> } } } | undefined)?.result;
			const sentInitParams = (fakeUpstream.lastReceivedRequest('initialize')?.params ?? {}) as {
				capabilities?: { extensions?: Record<string, unknown>; sampling?: unknown };
			};

			const phase2Summary = {
				httpStatus: initResp.status,
				upstreamSeesAppsExtension: !!sentInitParams.capabilities?.extensions?.[APPS_EXTENSION_KEY],
				upstreamSeesPreservedSampling: sentInitParams.capabilities?.sampling,
				sdkSeesAppsExtension: !!initResult?.capabilities?.extensions?.[APPS_EXTENSION_KEY],
				upstreamCapabilitiesObservable: !!fakeUpstream.upstreamCapabilities.get()?.extensions?.[APPS_EXTENSION_KEY],
			};
			assert.deepStrictEqual(phase2Summary, {
				httpStatus: 200,
				upstreamSeesAppsExtension: true,
				upstreamSeesPreservedSampling: {},
				sdkSeesAppsExtension: true,
				upstreamCapabilitiesObservable: true,
			});

			// ---- 3. Server→client notification. -------------------------
			envelopes.length = 0;
			fakeUpstream.pushNotification('ui/notifications/host-context-changed', { theme: 'dark' });
			await flushMicrotasks();

			const notificationEnvelopes = envelopes
				.filter(e =>
					e.action.type === ActionType.McpMessageReceived
					&& e.action.message.kind === McpRpcMessageKind.Notification,
				)
				.map(e => {
					const a = e.action;
					if (a.type !== ActionType.McpMessageReceived || a.message.kind !== McpRpcMessageKind.Notification) {
						return null;
					}
					return { method: a.message.method, params: a.message.params };
				});

			const phase3Summary = {
				notifications: notificationEnvelopes,
				envelopeKinds: envelopes.map(e => e.action.type),
			};
			assert.deepStrictEqual(phase3Summary, {
				notifications: [{ method: 'ui/notifications/host-context-changed', params: { theme: 'dark' } }],
				envelopeKinds: [ActionType.McpMessageReceived, ActionType.McpMessageRemoved],
			});

			// ---- 4. Client→server `ui/*` call via mcpMessage. -----------
			const clientResult = await hostService.sendMessage(
				{
					server: handle.resource.toString(),
					method: 'ui/some-method',
					params: { foo: 1 },
				},
				{ clientId: 'test-client', capabilities: { mcp: { apps: {} } } },
			);

			const sentUiRequest = fakeUpstream.lastReceivedRequest('ui/some-method');
			assert.deepStrictEqual({
				clientResult,
				sentMethod: sentUiRequest?.method,
				sentParams: sentUiRequest?.params,
			}, {
				clientResult: { result: { ok: true, payload: 42 } },
				sentMethod: 'ui/some-method',
				sentParams: { foo: 1 },
			});

			// ---- 5. Server→client request (`ui/open-link`). -------------
			envelopes.length = 0;
			const upstreamReqId = fakeUpstream.pushRequest('ui/open-link', { url: 'https://example.com' });
			await flushMicrotasks();

			const callEnvelope = envelopes.find(e =>
				e.action.type === ActionType.McpMessageReceived
				&& e.action.message.kind === McpRpcMessageKind.Call,
			);
			assert.ok(callEnvelope, 'expected an mcp/messageReceived envelope for the upstream-originated call');
			const callAction = callEnvelope.action;
			if (callAction.type !== ActionType.McpMessageReceived || callAction.message.kind !== McpRpcMessageKind.Call) {
				throw new Error('callEnvelope shape unexpected');
			}
			const messageId = callAction.messageId;

			assert.deepStrictEqual({
				method: callAction.message.method,
				request: callAction.message.request,
				response: callAction.message.response,
				envelopeKinds: envelopes.map(e => e.action.type),
			}, {
				method: 'ui/open-link',
				request: { url: 'https://example.com' },
				response: undefined,
				envelopeKinds: [ActionType.McpMessageReceived],
			});

			// ---- 6. Client responds via deliverResponse. ----------------
			envelopes.length = 0;
			const response: McpRpcCallResponse = { jsonrpc: '2.0', id: 'unused', result: { handled: true } };
			hostService.deliverResponse(handle.resource, messageId, response);
			await flushMicrotasks();

			assert.deepStrictEqual({
				upstreamResponse: fakeUpstream.lastResponseTo(upstreamReqId),
				envelopeKinds: envelopes.map(e => e.action.type),
			}, {
				upstreamResponse: { jsonrpc: '2.0', id: upstreamReqId, result: { handled: true } },
				envelopeKinds: [ActionType.McpMessageRemoved],
			});
		} finally {
			envelopeSubscription.dispose();
			hostService.dispose();
			proxyFactory.dispose();
			stateManager.dispose();
		}
	});
});
