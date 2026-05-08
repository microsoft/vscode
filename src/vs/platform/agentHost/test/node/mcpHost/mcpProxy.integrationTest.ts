/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for {@link McpProxy}/{@link McpProxyFactory} that bind
 * a real localhost HTTP listener and exercise the full SDK ⟷ HTTP ⟷
 * route ⟷ upstream pipeline. Kept out of the unit suite because the
 * listener does real socket work; same convention as
 * `agentHostGitService.integrationTest.ts`.
 *
 * Run via `scripts/test-integration.sh`.
 */

import * as assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, type Event } from '../../../../../base/common/event.js';
import { isJsonRpcRequest, type JsonRpcMessage } from '../../../../../base/common/jsonRpcProtocol.js';
import { observableValue, type IObservable, type ISettableObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogger } from '../../../../log/common/log.js';
import {
	McpAuthRequiredReason,
	McpRpcMessageKind,
	McpServerStatusKind,
	type McpRpcMessage,
	type McpServerStatus,
	type McpServerStatusAuthRequired,
} from '../../../common/state/protocol/state.js';
import { McpAppsInitializeInjector } from '../../../node/mcpHost/mcpInitializeInjector.js';
import { McpProxyFactory, type IMcpProxyOptions } from '../../../node/mcpHost/mcpProxy.js';
import type { IMcpUpstream, IMcpUpstreamCapabilities } from '../../../node/mcpHost/mcpUpstream.js';

class StubUpstream implements IMcpUpstream {
	private readonly _status: ISettableObservable<McpServerStatus> = observableValue<McpServerStatus>('stub-upstream', { kind: McpServerStatusKind.Stopped });
	public readonly status: IObservable<McpServerStatus> = this._status;
	private readonly _onMessage = new Emitter<JsonRpcMessage>();
	public readonly onMessage: Event<JsonRpcMessage> = this._onMessage.event;
	private readonly _upstreamCapabilities: ISettableObservable<IMcpUpstreamCapabilities | undefined> =
		observableValue<IMcpUpstreamCapabilities | undefined>('stub-upstream-caps', undefined);
	public readonly upstreamCapabilities: IObservable<IMcpUpstreamCapabilities | undefined> = this._upstreamCapabilities;

	public readonly sent: JsonRpcMessage[] = [];
	public readonly tokens: (string | undefined)[] = [];
	public startCalls = 0;
	public disposeCalls = 0;

	public startResult: McpServerStatus = { kind: McpServerStatusKind.Ready };
	public sendThrows: Error | undefined;

	/** Optional reaction invoked synchronously after each `send`. */
	public onSend: ((msg: JsonRpcMessage) => void) | undefined;

	public async start(): Promise<McpServerStatus> {
		this.startCalls++;
		this._status.set(this.startResult, undefined);
		return this.startResult;
	}

	public async send(message: JsonRpcMessage): Promise<void> {
		if (this.sendThrows) {
			throw this.sendThrows;
		}
		this.sent.push(message);
		this.onSend?.(message);
	}

	public setBearerToken(token: string | undefined): void {
		this.tokens.push(token);
	}

	public setUpstreamCapabilities(caps: IMcpUpstreamCapabilities | undefined): void {
		this._upstreamCapabilities.set(caps, undefined);
	}

	public emit(message: JsonRpcMessage): void {
		this._onMessage.fire(message);
	}

	public setStatus(status: McpServerStatus): void {
		this._status.set(status, undefined);
	}

	public dispose(): void {
		this.disposeCalls++;
		this._onMessage.dispose();
	}
}

interface IRecordedMessage {
	mcp: McpRpcMessage;
	messageId: string;
}

interface ITestHarness {
	readonly factory: McpProxyFactory;
	readonly upstream: StubUpstream;
	readonly recorded: IRecordedMessage[];
	readonly authChallenges: McpServerStatusAuthRequired[];
	readonly stateChanges: McpServerStatus[];
	makeOptions(overrides?: Partial<IMcpProxyOptions>): IMcpProxyOptions;
}

function createHarness(): ITestHarness {
	const factory = new McpProxyFactory(new NullLogger());
	const upstream = new StubUpstream();
	const recorded: IRecordedMessage[] = [];
	const authChallenges: McpServerStatusAuthRequired[] = [];
	const stateChanges: McpServerStatus[] = [];
	let counter = 0;
	return {
		factory,
		upstream,
		recorded,
		authChallenges,
		stateChanges,
		makeOptions(overrides) {
			const base: IMcpProxyOptions = {
				resource: URI.parse('mcp:/session-1/server-1'),
				upstream,
				logger: new NullLogger(),
				onUpstreamMessage: msg => {
					const messageId = `msg-${++counter}`;
					recorded.push({ mcp: msg, messageId });
					return messageId;
				},
				onAuthRequired: status => {
					authChallenges.push(status);
				},
				onStateChange: status => {
					stateChanges.push(status);
				},
			};
			return { ...base, ...overrides };
		},
	};
}

async function postJson(endpoint: URI, body: object | string): Promise<{ status: number; text: string }> {
	const payload = typeof body === 'string' ? body : JSON.stringify(body);
	const response = await fetch(endpoint.toString(true), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: payload,
	});
	const text = await response.text();
	return { status: response.status, text };
}

suite('McpProxy (integration)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('initialize injection rewrites params before forwarding to upstream', async () => {
		const harness = createHarness();
		let proxy;
		try {
			harness.upstream.onSend = msg => {
				if (isJsonRpcRequest(msg) && msg.method === 'initialize') {
					harness.upstream.emit({ jsonrpc: '2.0', id: msg.id, result: { ok: true } });
				}
			};
			proxy = await harness.factory.create(harness.makeOptions({ initializeInjector: new McpAppsInitializeInjector() }));
			await harness.upstream.start();

			const { status, text } = await postJson(proxy.endpoint, {
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: { capabilities: { sampling: {} }, clientInfo: { name: 'sdk', version: '0.1' } },
			});

			const sent = harness.upstream.sent[0] as { method?: string; params?: { capabilities?: { sampling?: unknown; extensions?: Record<string, unknown> } } };
			assert.deepStrictEqual({
				status,
				text: JSON.parse(text),
				upstreamMethod: sent?.method,
				preservedSampling: sent?.params?.capabilities?.sampling,
				injectedExtension: sent?.params?.capabilities?.extensions?.['io.modelcontextprotocol/ui'],
			}, {
				status: 200,
				text: { jsonrpc: '2.0', id: 1, result: { ok: true } },
				upstreamMethod: 'initialize',
				preservedSampling: {},
				injectedExtension: { mimeTypes: ['text/html;profile=mcp-app'] },
			});
		} finally {
			proxy?.dispose();
			harness.factory.dispose();
			harness.upstream.dispose();
		}
	});

	test('SDK request is forwarded and upstream response routed back as HTTP 200', async () => {
		const harness = createHarness();
		let proxy;
		try {
			harness.upstream.onSend = msg => {
				if (isJsonRpcRequest(msg) && msg.method === 'tools/list') {
					harness.upstream.emit({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'echo' }] } });
				}
			};
			proxy = await harness.factory.create(harness.makeOptions());
			await harness.upstream.start();

			const { status, text } = await postJson(proxy.endpoint, { jsonrpc: '2.0', id: 7, method: 'tools/list' });

			assert.deepStrictEqual({ status, body: JSON.parse(text) }, {
				status: 200,
				body: { jsonrpc: '2.0', id: 7, result: { tools: [{ name: 'echo' }] } },
			});
		} finally {
			proxy?.dispose();
			harness.factory.dispose();
			harness.upstream.dispose();
		}
	});

	test('SDK notification is forwarded to upstream and yields HTTP 204', async () => {
		const harness = createHarness();
		let proxy;
		try {
			proxy = await harness.factory.create(harness.makeOptions());
			await harness.upstream.start();

			const { status, text } = await postJson(proxy.endpoint, {
				jsonrpc: '2.0',
				method: 'notifications/cancelled',
				params: { requestId: 7 },
			});

			assert.deepStrictEqual({
				status,
				text,
				sent: harness.upstream.sent,
			}, {
				status: 204,
				text: '',
				sent: [{ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 7 } }],
			});
		} finally {
			proxy?.dispose();
			harness.factory.dispose();
			harness.upstream.dispose();
		}
	});

	test('upstream notification fires onUpstreamMessage with McpRpcNotification', async () => {
		const harness = createHarness();
		let proxy;
		try {
			proxy = await harness.factory.create(harness.makeOptions());
			await harness.upstream.start();

			harness.upstream.emit({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });

			assert.deepStrictEqual(harness.recorded, [{
				mcp: { kind: McpRpcMessageKind.Notification, method: 'notifications/tools/list_changed', params: undefined },
				messageId: 'msg-1',
			}]);
		} finally {
			proxy?.dispose();
			harness.factory.dispose();
			harness.upstream.dispose();
		}
	});

	test('upstream request is tapped and deliverClientResponse forwards reply with original id', async () => {
		const harness = createHarness();
		let proxy;
		try {
			proxy = await harness.factory.create(harness.makeOptions());
			await harness.upstream.start();

			harness.upstream.emit({ jsonrpc: '2.0', id: 42, method: 'sampling/createMessage', params: { foo: 'bar' } });
			proxy.deliverClientResponse('msg-1', { jsonrpc: '2.0', id: 1, result: { ok: true } });

			assert.deepStrictEqual({
				recorded: harness.recorded,
				sent: harness.upstream.sent,
			}, {
				recorded: [{
					mcp: { kind: McpRpcMessageKind.Call, method: 'sampling/createMessage', request: { foo: 'bar' }, response: undefined },
					messageId: 'msg-1',
				}],
				sent: [{ jsonrpc: '2.0', id: 42, result: { ok: true } }],
			});
		} finally {
			proxy?.dispose();
			harness.factory.dispose();
			harness.upstream.dispose();
		}
	});

	test('AuthRequired status invokes onAuthRequired; authenticate() retries with bearer token', async () => {
		const harness = createHarness();
		let proxy;
		try {
			const challenge: McpServerStatusAuthRequired = {
				kind: McpServerStatusKind.AuthRequired,
				reason: McpAuthRequiredReason.Required,
				resource: { resource: 'https://example/' },
			};
			harness.upstream.startResult = challenge;
			proxy = await harness.factory.create(harness.makeOptions());
			await harness.upstream.start();

			// Now flip the upstream so the next start() returns Ready.
			harness.upstream.startResult = { kind: McpServerStatusKind.Ready };
			const ok = await proxy.authenticate('https://example/', 'token-xyz');

			assert.deepStrictEqual({
				ok,
				challenges: harness.authChallenges,
				tokens: harness.upstream.tokens,
				startCalls: harness.upstream.startCalls,
			}, {
				ok: true,
				challenges: [challenge],
				tokens: ['token-xyz'],
				startCalls: 2,
			});
		} finally {
			proxy?.dispose();
			harness.factory.dispose();
			harness.upstream.dispose();
		}
	});

	test('factory.dispose() shuts the listener down so subsequent fetch fails', async () => {
		const harness = createHarness();
		const proxy = await harness.factory.create(harness.makeOptions());
		await harness.upstream.start();
		proxy.dispose();
		harness.factory.dispose();
		harness.upstream.dispose();

		// Allow the close to propagate.
		const closed = new DeferredPromise<{ ok: boolean }>();
		fetch(proxy.endpoint.toString(true), { method: 'POST', body: '{}' })
			.then(() => closed.complete({ ok: true }))
			.catch(() => closed.complete({ ok: false }));

		const { ok } = await closed.p;
		assert.strictEqual(ok, false);
	});

	test('initialize response capabilities are captured on the upstream', async () => {
		const harness = createHarness();
		let proxy;
		try {
			harness.upstream.onSend = msg => {
				if (isJsonRpcRequest(msg) && msg.method === 'initialize') {
					harness.upstream.emit({
						jsonrpc: '2.0',
						id: msg.id,
						result: {
							capabilities: {
								extensions: {
									'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] },
								},
							},
						},
					});
				}
			};
			proxy = await harness.factory.create(harness.makeOptions());
			await harness.upstream.start();

			const { status } = await postJson(proxy.endpoint, {
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: { capabilities: {} },
			});

			assert.deepStrictEqual({
				status,
				caps: harness.upstream.upstreamCapabilities.get(),
			}, {
				status: 200,
				caps: {
					extensions: {
						'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] },
					},
				},
			});
		} finally {
			proxy?.dispose();
			harness.factory.dispose();
			harness.upstream.dispose();
		}
	});
});
