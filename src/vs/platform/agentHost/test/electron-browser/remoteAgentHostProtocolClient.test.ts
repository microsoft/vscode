/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostClientState, RemoteAgentHostProtocolClient } from '../../browser/remoteAgentHostProtocolClient.js';
import { IAgentHostPermissionService } from '../../common/agentHostPermissionService.js';
import { ContentEncoding, ReconnectResultType } from '../../common/state/protocol/commands.js';
import { AhpErrorCodes } from '../../common/state/protocol/errors.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { ActionType, type SessionActiveClientChangedAction, type SessionTitleChangedAction } from '../../common/state/sessionActions.js';
import { ProtocolError, type AhpServerNotification, type JsonRpcNotification, type JsonRpcRequest, type JsonRpcResponse, type ProtocolMessage } from '../../common/state/sessionProtocol.js';
import { hasKey } from '../../../../base/common/types.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ROOT_STATE_URI, StateComponents } from '../../common/state/sessionState.js';
import type { IClientTransport, IProtocolTransport } from '../../common/state/sessionTransport.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentHostTelemetryLevelConfigKey, telemetryLevelToAgentHostConfigValue } from '../../common/agentHostSchema.js';

type ProtocolTransportMessage = ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcResponse | JsonRpcRequest;

function isPingRequest(msg: ProtocolTransportMessage): msg is JsonRpcRequest & { method: 'ping' } {
	return hasKey(msg, { method: true, id: true }) && msg.method === 'ping';
}

class TestProtocolTransport extends Disposable implements IProtocolTransport {
	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	readonly sentMessages: ProtocolTransportMessage[] = [];

	send(message: ProtocolTransportMessage): void {
		this.sentMessages.push(message);
	}

	fireMessage(message: ProtocolMessage): void {
		this._onMessage.fire(message);
	}

	fireClose(): void {
		this._onClose.fire();
	}
}

class TestClientProtocolTransport extends TestProtocolTransport implements IClientTransport {
	readonly connectDeferred = new DeferredPromise<void>();

	connect(): Promise<void> {
		return this.connectDeferred.p;
	}
}

class CloseOnDisposeProtocolTransport extends TestProtocolTransport {
	override dispose(): void {
		this.fireClose();
		super.dispose();
	}
}

suite('RemoteAgentHostProtocolClient', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPermissionService(allow = true): IAgentHostPermissionService {
		const empty = observableValue<readonly never[]>('test', []);
		return {
			_serviceBrand: undefined,
			check: async () => allow,
			request: async () => { /* auto-allow */ },
			pendingFor: () => empty,
			allPending: empty,
			findPending: () => undefined,
			grantImplicitRead: () => Disposable.None,
			connectionClosed: () => { },
		};
	}

	function createClient(transport = disposables.add(new TestProtocolTransport()), permissionService = createPermissionService(), loadEstimator?: { hasHighLoad(): boolean }): { client: RemoteAgentHostProtocolClient; transport: TestProtocolTransport } {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const client = disposables.add(new RemoteAgentHostProtocolClient('test.example:1234', transport, loadEstimator, new NullLogService(), fileService, permissionService, new TestConfigurationService()));
		return { client, transport };
	}

	async function assertRemoteProtocolError(promise: Promise<unknown>, expected: { code: number; message: string; data?: unknown }): Promise<void> {
		try {
			await promise;
			assert.fail('Expected promise to reject');
		} catch (error) {
			if (!(error instanceof ProtocolError)) {
				assert.fail(`Expected ProtocolError, got ${String(error)}`);
			}
			assert.strictEqual(error.code, expected.code);
			assert.strictEqual(error.message, expected.message);
			assert.deepStrictEqual(error.data, expected.data);
		}
	}

	test('completes matching response and removes it from pending requests', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.resourceList(URI.file('/workspace'));

		assert.deepStrictEqual(transport.sentMessages[0], {
			jsonrpc: '2.0',
			id: 1,
			method: 'resourceList',
			params: { uri: URI.file('/workspace').toString() },
		});

		transport.fireMessage({ jsonrpc: '2.0', id: 1, result: { entries: [] } });
		assert.deepStrictEqual(await resultPromise, { entries: [] });

		transport.fireMessage({ jsonrpc: '2.0', id: 1, result: { entries: [{ name: 'late', type: 'file' }] } });
		assert.strictEqual(transport.sentMessages.length, 1);
	});

	test('preserves JSON-RPC error code and data', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.resourceRead(URI.file('/missing'));
		const data = { uri: URI.file('/missing').toString() };

		transport.fireMessage({ jsonrpc: '2.0', id: 1, error: { code: AhpErrorCodes.NotFound, message: 'Missing resource', data } });

		await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: 'Missing resource', data });
	});

	test('ignores response for unknown request id', () => {
		const { transport } = createClient();

		transport.fireMessage({ jsonrpc: '2.0', id: 99, result: null });

		assert.strictEqual(transport.sentMessages.length, 0);
	});

	test('rejects all pending requests on transport close', async () => {
		const { client, transport } = createClient();
		const first = client.resourceList(URI.file('/one'));
		const second = client.resourceRead(URI.file('/two'));
		let closeCount = 0;
		disposables.add(client.onDidClose(() => closeCount++));
		const firstRejected = assertRemoteProtocolError(first, { code: -32000, message: 'Connection closed: test.example:1234' });
		const secondRejected = assertRemoteProtocolError(second, { code: -32000, message: 'Connection closed: test.example:1234' });

		transport.fireClose();
		transport.fireClose();

		await firstRejected;
		await secondRejected;
		assert.strictEqual(closeCount, 1);
	});

	test('rejects pending requests on dispose', async () => {
		const { client } = createClient();
		const resultPromise = client.resourceList(URI.file('/workspace'));
		const rejected = assertRemoteProtocolError(resultPromise, { code: -32000, message: 'Connection disposed: test.example:1234' });

		client.dispose();

		await rejected;
	});

	test('dispose rejection wins when transport emits close while disposing', async () => {
		const transport = disposables.add(new CloseOnDisposeProtocolTransport());
		const { client } = createClient(transport);
		const resultPromise = client.resourceList(URI.file('/workspace'));
		const rejected = assertRemoteProtocolError(resultPromise, { code: -32000, message: 'Connection disposed: test.example:1234' });

		client.dispose();

		await rejected;
	});

	test('late response after close does not complete rejected request', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.resourceList(URI.file('/workspace'));
		const rejected = assertRemoteProtocolError(resultPromise, { code: -32000, message: 'Connection closed: test.example:1234' });

		transport.fireClose();
		transport.fireMessage({ jsonrpc: '2.0', id: 1, result: { entries: [] } });

		await rejected;
	});

	test('rejects requests started after transport close', async () => {
		const { client, transport } = createClient();

		transport.fireClose();

		await assertRemoteProtocolError(client.resourceList(URI.file('/workspace')), { code: -32000, message: 'Connection closed: test.example:1234' });
		assert.strictEqual(transport.sentMessages.length, 0);
	});

	test('rejects requests started after dispose', async () => {
		const { client, transport } = createClient();

		client.dispose();

		await assertRemoteProtocolError(client.resourceList(URI.file('/workspace')), { code: -32000, message: 'Connection disposed: test.example:1234' });
		assert.strictEqual(transport.sentMessages.length, 0);
	});

	test('liveness sends a ping when idle and force-closes after the ping ages out', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const lowLoad = { hasHighLoad: () => false };
			const { client, transport } = createClient(undefined, undefined, lowLoad);
			let closeCount = 0;
			disposables.add(client.onDidClose(() => closeCount++));

			// First idle tick (t=5s) sends a ping; that ping then ages out
			// over the next ~20s and triggers a close at ~t=25s.
			await timeout(30_000);

			const pings = transport.sentMessages.filter(isPingRequest);
			assert.ok(pings.length >= 1, `expected at least 1 ping, got ${pings.length}`);
			assert.strictEqual(closeCount, 1);
			client.dispose();
		});
	});

	test('liveness keeps the connection open while pings are answered', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const lowLoad = { hasHighLoad: () => false };
			const { client, transport } = createClient(undefined, undefined, lowLoad);
			let closeCount = 0;
			disposables.add(client.onDidClose(() => closeCount++));

			// Auto-respond to every outgoing ping.
			let answered = 0;
			const dispose = mainWindow.setInterval(() => {
				for (const msg of transport.sentMessages) {
					if (isPingRequest(msg) && msg.id > answered) {
						answered = msg.id;
						transport.fireMessage({ jsonrpc: '2.0', id: msg.id, result: null });
					}
				}
			}, 1_000);

			await timeout(60_000);
			mainWindow.clearInterval(dispose);

			assert.strictEqual(closeCount, 0);
			assert.ok(answered >= 4, `expected several pings to have been answered, got ${answered}`);
			client.dispose();
		});
	});

	test('liveness is suppressed while local load is high', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const highLoad = { hasHighLoad: () => true };
			const { client } = createClient(undefined, undefined, highLoad);
			let closeCount = 0;
			disposables.add(client.onDidClose(() => closeCount++));

			// 60s of silence — would normally trigger the timeout — but
			// high local load means we attribute the silence to ourselves
			// and stay quiet.
			await timeout(60_000);

			assert.strictEqual(closeCount, 0);
			client.dispose();
		});
	});

	test('liveness stops after the connection is closed', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const lowLoad = { hasHighLoad: () => false };
			const { client, transport } = createClient(undefined, undefined, lowLoad);
			let closeCount = 0;
			disposables.add(client.onDidClose(() => closeCount++));

			// Wait for the first force-close.
			await timeout(30_000);
			assert.strictEqual(closeCount, 1, 'should have force-closed once');

			const pingsAtClose = transport.sentMessages.filter(isPingRequest).length;

			// Wait much longer; no further pings, no further closes.
			await timeout(60_000);
			assert.strictEqual(closeCount, 1, 'should not fire again after close');
			const pingsLater = transport.sentMessages.filter(isPingRequest).length;
			assert.strictEqual(pingsLater, pingsAtClose, 'no further pings should be sent after close');
			client.dispose();
		});
	});

	test('inbound messages are dropped after close', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const { client, transport } = createClient();
			let actionCount = 0;
			disposables.add(client.onDidAction(() => actionCount++));

			// Issue a request, then force close via the watchdog timeout.
			const pending = client.resourceList(URI.file('/workspace'));
			const rejected = pending.catch(err => err);
			await timeout(30_000);
			const err = await rejected;
			assert.ok(err instanceof ProtocolError);

			// Late response for the same request id — the shared
			// SSHRelayTransport feeds both old and new clients for the
			// same connectionId, so this can happen in production. The
			// pending request was already rejected; if _handleMessage
			// processed the response it would log a "unknown request id"
			// warning at best, or settle a request the caller no longer
			// owns at worst. Either way, after close it must be a no-op.
			transport.fireMessage({ jsonrpc: '2.0', id: 1, result: { entries: [] } });

			// Late notification — must not fan out as an action event.
			const lateAction: SessionActiveClientChangedAction = {
				type: ActionType.SessionActiveClientChanged,
				session: 'session://test/late',
				activeClient: null,
			};
			transport.fireMessage({
				jsonrpc: '2.0',
				method: 'action',
				params: { action: lateAction, serverSeq: 1, origin: undefined }
			});

			assert.strictEqual(actionCount, 0, 'late action notifications must be ignored after close');
			client.dispose();
		});
	});

	test('rejects connect when transport closes before connect completes', async () => {
		const transport = disposables.add(new TestClientProtocolTransport());
		const { client } = createClient(transport);
		const rejected = assertRemoteProtocolError(client.connect(), { code: -32000, message: 'Connection closed: test.example:1234' });

		transport.fireClose();
		transport.connectDeferred.complete();

		await rejected;
		assert.strictEqual(transport.sentMessages.length, 0);
	});

	test('rejects connect when disposed before transport connect completes', async () => {
		const transport = disposables.add(new TestClientProtocolTransport());
		const { client } = createClient(transport);
		const rejected = assertRemoteProtocolError(client.connect(), { code: -32000, message: 'Connection disposed: test.example:1234' });

		client.dispose();

		await rejected;
		assert.strictEqual(transport.sentMessages.length, 0);
	});

	test('initialize handshake offers PROTOCOL_VERSION as a SemVer array', async () => {
		const transport = disposables.add(new TestClientProtocolTransport());
		const { client } = createClient(transport);
		const connectPromise = client.connect();

		transport.connectDeferred.complete();
		// `connect()` chains through several awaits before posting the
		// initialize request — yield until it shows up.
		while (transport.sentMessages.length === 0) {
			await Promise.resolve();
		}

		const sent = transport.sentMessages[0] as JsonRpcRequest;
		assert.strictEqual(sent.method, 'initialize');
		const params = sent.params as { protocolVersions: readonly string[]; clientId: string };
		assert.deepStrictEqual(params.protocolVersions, [PROTOCOL_VERSION]);
		assert.strictEqual(typeof params.clientId, 'string');

		// Reply with a successful handshake so `connect()` resolves and the
		// test can finish cleanly.
		transport.fireMessage({
			jsonrpc: '2.0',
			id: sent.id,
			result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
		});
		await connectPromise;
		const telemetryLevel = transport.sentMessages[1] as JsonRpcNotification;
		assert.deepStrictEqual(telemetryLevel, {
			jsonrpc: '2.0',
			method: 'dispatchAction',
			params: {
				clientSeq: 0,
				action: {
					type: ActionType.RootConfigChanged,
					config: { [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.USAGE) },
				},
			},
		});
	});

	test('rejects connect when host returns UnsupportedProtocolVersion (-32005)', async () => {
		const transport = disposables.add(new TestClientProtocolTransport());
		const { client } = createClient(transport);
		const connectPromise = client.connect();

		transport.connectDeferred.complete();
		while (transport.sentMessages.length === 0) {
			await Promise.resolve();
		}

		const sent = transport.sentMessages[0] as JsonRpcRequest;
		transport.fireMessage({
			jsonrpc: '2.0',
			id: sent.id,
			error: {
				code: AhpErrorCodes.UnsupportedProtocolVersion,
				message: 'Client offered protocol versions [0.1.0], but this server only supports 0.2.0.',
				data: { supportedVersions: ['0.2.0'] },
			},
		});

		await assertRemoteProtocolError(connectPromise, {
			code: AhpErrorCodes.UnsupportedProtocolVersion,
			message: 'Client offered protocol versions [0.1.0], but this server only supports 0.2.0.',
			data: { supportedVersions: ['0.2.0'] },
		});
	});

	test('sends shutdown as a JSON-RPC request shape', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.shutdown();

		assert.deepStrictEqual(transport.sentMessages[0], {
			jsonrpc: '2.0',
			id: 1,
			method: 'shutdown',
			params: undefined,
		});

		transport.fireMessage({ jsonrpc: '2.0', id: 1, result: null });
		await resultPromise;
	});

	test('rejects shutdown with structured JSON-RPC error', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.shutdown();

		transport.fireMessage({ jsonrpc: '2.0', id: 1, error: { code: AhpErrorCodes.TurnInProgress, message: 'Turn in progress' } });

		await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.TurnInProgress, message: 'Turn in progress' });
	});

	test('ping sends a JSON-RPC request and resolves on response', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.ping();

		const sent = transport.sentMessages[0] as JsonRpcRequest;
		assert.strictEqual(sent.method, 'ping');
		assert.strictEqual(sent.id, 1);

		transport.fireMessage({ jsonrpc: '2.0', id: 1, result: null });

		assert.strictEqual(await resultPromise, undefined);
	});

	test('ping rejects with ProtocolError when the connection closes', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.ping();
		const rejected = assertRemoteProtocolError(resultPromise, { code: -32000, message: 'Connection closed: test.example:1234' });
		transport.fireClose();
		await rejected;
	});

	suite('reverse permission gating', () => {

		test('resourceRead is denied with PermissionDeniedErrorData when not granted', async () => {
			const { transport } = createClient(undefined, createPermissionService(false));
			const uri = URI.file('/etc/passwd').toString();

			transport.fireMessage({ jsonrpc: '2.0', id: 42, method: 'resourceRead', params: { uri } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 42,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: `Access to ${uri} is not granted.`,
					data: { request: { uri, read: true } },
				},
			});
		});

		test('resourceWrite is denied with PermissionDeniedErrorData when not granted', async () => {
			const { transport } = createClient(undefined, createPermissionService(false));
			const uri = URI.file('/etc/passwd').toString();

			transport.fireMessage({ jsonrpc: '2.0', id: 7, method: 'resourceWrite', params: { uri, data: 'aGVsbG8=', encoding: ContentEncoding.Base64 } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 7,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: `Access to ${uri} is not granted.`,
					data: { request: { uri, write: true } },
				},
			});
		});

		test('resourceList is denied with PermissionDeniedErrorData when not granted', async () => {
			const { transport } = createClient(undefined, createPermissionService(false));
			const uri = URI.file('/etc').toString();

			transport.fireMessage({ jsonrpc: '2.0', id: 5, method: 'resourceList', params: { uri } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 5,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: `Access to ${uri} is not granted.`,
					data: { request: { uri, read: true } },
				},
			});
		});

		test('resourceDelete is denied with PermissionDeniedErrorData when not granted', async () => {
			const { transport } = createClient(undefined, createPermissionService(false));
			const uri = URI.file('/etc/passwd').toString();

			transport.fireMessage({ jsonrpc: '2.0', id: 8, method: 'resourceDelete', params: { uri } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 8,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: `Access to ${uri} is not granted.`,
					data: { request: { uri, write: true } },
				},
			});
		});

		test('resourceMove is denied when destination lacks write access', async () => {
			const sourceUri = URI.file('/grant/foo').toString();
			const destUri = URI.file('/no-grant/bar').toString();
			const stub: ReturnType<typeof createPermissionService> = {
				...createPermissionService(false),
				check: async (_addr, uri) => uri.toString() === sourceUri,
			};
			const { transport } = createClient(undefined, stub);

			transport.fireMessage({ jsonrpc: '2.0', id: 9, method: 'resourceMove', params: { source: sourceUri, destination: destUri } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 9,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: `Access to ${destUri} is not granted.`,
					data: { request: { uri: destUri, write: true } },
				},
			});
		});

		test('reverse resourceRequest delegates to permission service and replies with empty result', async () => {
			let lastRequest: { address: string; params: { uri: string; read?: boolean; write?: boolean } } | undefined;
			const stub: ReturnType<typeof createPermissionService> = {
				...createPermissionService(false),
				request: async (address, params) => { lastRequest = { address, params }; },
			};
			const { transport } = createClient(undefined, stub);

			const uri = URI.file('/etc/foo').toString();
			transport.fireMessage({ jsonrpc: '2.0', id: 11, method: 'resourceRequest', params: { uri, read: true } });

			// Allow the awaited request promise to resolve.
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(lastRequest, { address: 'test.example:1234', params: { uri, read: true } });
			assert.deepStrictEqual(transport.sentMessages.pop(), { jsonrpc: '2.0', id: 11, result: {} });
		});

		test('reverse resourceRequest replies with PermissionDenied on cancellation', async () => {
			const stub: ReturnType<typeof createPermissionService> = {
				...createPermissionService(false),
				request: async () => { throw new CancellationError(); },
			};
			const { transport } = createClient(undefined, stub);

			const uri = URI.file('/etc/foo').toString();
			transport.fireMessage({ jsonrpc: '2.0', id: 12, method: 'resourceRequest', params: { uri, read: true } });

			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 12,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: 'Access to the requested resource is not granted.',
					data: undefined,
				},
			});
		});
	});

	suite('implicit grants for outgoing customization actions', () => {

		function createCapturingPermissionService(): { service: IAgentHostPermissionService; calls: { address: string; uri: URI }[] } {
			const empty = observableValue<readonly never[]>('test', []);
			const calls: { address: string; uri: URI }[] = [];
			const service: IAgentHostPermissionService = {
				_serviceBrand: undefined,
				check: async () => true,
				request: async () => { /* auto-allow */ },
				pendingFor: () => empty,
				allPending: empty,
				findPending: () => undefined,
				grantImplicitRead: (address, uri) => {
					calls.push({ address, uri });
					return Disposable.None;
				},
				connectionClosed: () => { },
			};
			return { service, calls };
		}

		test('SessionActiveClientChanged dispatches implicit reads for each customization', () => {
			const { service, calls } = createCapturingPermissionService();
			const { client } = createClient(undefined, service);

			client.dispatch({
				type: ActionType.SessionActiveClientChanged,
				session: 'session://test/1',
				activeClient: {
					clientId: 'c1',
					tools: [],
					customizations: [
						{ uri: 'file:///plugins/foo', displayName: 'Foo' },
						{ uri: 'file:///plugins/bar', displayName: 'Bar' },
					],
				},
			});

			assert.deepStrictEqual(
				calls.map(c => ({ address: c.address, uri: c.uri.toString() })),
				[
					{ address: 'test.example:1234', uri: 'file:///plugins/foo' },
					{ address: 'test.example:1234', uri: 'file:///plugins/bar' },
				],
			);
		});

		test('repeat dispatch dedupes per URI', () => {
			const { service, calls } = createCapturingPermissionService();
			const { client } = createClient(undefined, service);

			const action: SessionActiveClientChangedAction = {
				type: ActionType.SessionActiveClientChanged,
				session: 'session://test/1',
				activeClient: {
					clientId: 'c1',
					tools: [],
					customizations: [
						{ uri: 'file:///plugins/foo', displayName: 'Foo' },
					],
				},
			};

			client.dispatch(action);
			client.dispatch(action);

			assert.strictEqual(calls.length, 1);
		});

		test('null activeClient does not crash', () => {
			const { service, calls } = createCapturingPermissionService();
			const { client } = createClient(undefined, service);

			client.dispatch({
				type: ActionType.SessionActiveClientChanged,
				session: 'session://test/1',
				activeClient: null,
			});

			assert.strictEqual(calls.length, 0);
		});

		test('createSession with active-client customizations grants implicit reads', async () => {
			const { service, calls } = createCapturingPermissionService();
			const { client, transport } = createClient(undefined, service);

			void client.createSession({
				provider: 'copilot',
				activeClient: {
					clientId: 'c1',
					tools: [],
					customizations: [
						{ uri: 'file:///plugins/foo', displayName: 'Foo' },
					],
				},
			});

			// Resolve the in-flight createSession request for cleanup.
			const sent = transport.sentMessages.find(
				(m): m is JsonRpcRequest => 'method' in m && m.method === 'createSession');
			assert.ok(sent);
			transport.fireMessage({ jsonrpc: '2.0', id: sent.id, result: null });

			assert.deepStrictEqual(
				calls.map(c => c.uri.toString()),
				['file:///plugins/foo'],
			);
		});
	});

	suite('soft reconnect (transport factory)', () => {

		function findRequest(transport: TestProtocolTransport, method: string): JsonRpcRequest | undefined {
			return transport.sentMessages.find(
				(m): m is JsonRpcRequest => 'method' in m && (m as JsonRpcRequest).method === method && 'id' in m,
			);
		}

		function findNotification(transport: TestProtocolTransport, method: string): JsonRpcNotification | undefined {
			return transport.sentMessages.find(
				(m): m is JsonRpcNotification => 'method' in m && (m as JsonRpcNotification).method === method && !('id' in m),
			);
		}

		function findDispatchAction(transport: TestProtocolTransport, actionType: ActionType): JsonRpcNotification | undefined {
			return transport.sentMessages.find(
				(m): m is JsonRpcNotification => 'method' in m
					&& (m as JsonRpcNotification).method === 'dispatchAction'
					&& !('id' in m)
					&& ((m as JsonRpcNotification).params as { action?: { type?: unknown } } | undefined)?.action?.type === actionType,
			);
		}

		async function flushMicrotasks(): Promise<void> {
			// `await Promise.resolve()` only advances one microtask; loop a few times to
			// drain chained .then handlers without resorting to fake timers.
			for (let i = 0; i < 10; i++) {
				await Promise.resolve();
			}
		}

		/** Wait until the client transitions into the {@link AgentHostClientState.Reconnecting} state. */
		async function waitForReconnecting(client: RemoteAgentHostProtocolClient): Promise<void> {
			if (client.connectionState === AgentHostClientState.Reconnecting) {
				return;
			}
			await Event.toPromise(Event.filter(client.onDidChangeConnectionState, s => s === AgentHostClientState.Reconnecting));
		}

		/** Wait for the next time a method-named request appears in the transport's outbox. */
		async function waitForRequest(transport: TestProtocolTransport, method: string): Promise<JsonRpcRequest> {
			while (true) {
				const req = findRequest(transport, method);
				if (req) {
					return req;
				}
				await Promise.resolve();
			}
		}

		/** Wait for the next time the new transport is created by the factory. */
		async function waitForTransport(transports: TestClientProtocolTransport[], index: number): Promise<TestClientProtocolTransport> {
			while (transports.length <= index) {
				await new Promise<void>(r => setTimeout(r, 25));
			}
			return transports[index];
		}

		/**
		 * Build a client wired to a transport factory that hands out fresh
		 * `TestClientProtocolTransport`s on each invocation. Returns the
		 * client plus a `transports` array recording each transport handed
		 * out, so tests can drive handshake/reconnect interactions.
		 */
		function createFactoryClient(): { client: RemoteAgentHostProtocolClient; transports: TestClientProtocolTransport[] } {
			const transports: TestClientProtocolTransport[] = [];
			const factory = () => {
				const t = disposables.add(new TestClientProtocolTransport());
				transports.push(t);
				return t;
			};
			const fileService = disposables.add(new FileService(new NullLogService()));
			const client = disposables.add(new RemoteAgentHostProtocolClient(
				'test.example:1234', factory, undefined, new NullLogService(), fileService, createPermissionService(), new TestConfigurationService(),
			));
			return { client, transports };
		}

		async function completeHandshake(transport: TestClientProtocolTransport, connectPromise: Promise<void>): Promise<void> {
			transport.connectDeferred.complete();
			while (findRequest(transport, 'initialize') === undefined) {
				await Promise.resolve();
			}
			const init = findRequest(transport, 'initialize')!;
			transport.fireMessage({
				jsonrpc: '2.0', id: init.id,
				result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 5, snapshots: [] },
			});
			await connectPromise;
		}

		test('reuses clientId across transport reconnects', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);
				const originalClientId = client.clientId;

				// Drop the transport; the client should attach a fresh one and
				// reconnect with the same clientId rather than restart from scratch.
				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');

				const params = reconnect.params as { clientId: string; lastSeenServerSeq: number; subscriptions: unknown[] };
				assert.strictEqual(params.clientId, originalClientId);
				assert.strictEqual(params.lastSeenServerSeq, 5);
				assert.ok(Array.isArray(params.subscriptions));

				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});
				await flushMicrotasks();
				client.dispose();
			});
		});

		test('replays pending optimistic actions after reconnect', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				// Establish a session subscription so dispatch() can apply optimistically.
				const sessionUri = URI.parse('copilot:/test-session');
				const subRef = client.getSubscription(StateComponents.Session, sessionUri);
				const subscribeReq = await waitForRequest(transports[0], 'subscribe');
				transports[0].fireMessage({
					jsonrpc: '2.0', id: subscribeReq.id,
					result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } },
				});
				await Promise.resolve();

				// Dispatch an optimistic action right before the transport drops.
				const action: SessionTitleChangedAction = {
					type: ActionType.SessionTitleChanged,
					session: sessionUri.toString(),
					title: 'Renamed by user',
				};
				client.dispatch(action);
				const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged);
				assert.ok(initialDispatch, 'optimistic dispatch should reach the original transport');
				const initialSeq = (initialDispatch.params as { clientSeq: number }).clientSeq;

				// Drop the transport mid-flight. The new transport receives a
				// reconnect RPC plus a replay of the unconfirmed dispatch.
				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});
				await flushMicrotasks();

				const replayed = findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged);
				assert.ok(replayed, 'pending optimistic action should be re-sent after reconnect');
				assert.strictEqual((replayed.params as { clientSeq: number }).clientSeq, initialSeq, 'replayed dispatch must reuse the original clientSeq');

				subRef.dispose();
				client.dispose();
			});
		});

		test('skips replay when server already echoed the action in the replay buffer', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				const sessionUri = URI.parse('copilot:/test-session');
				const subRef = client.getSubscription(StateComponents.Session, sessionUri);
				const subscribeReq = await waitForRequest(transports[0], 'subscribe');
				transports[0].fireMessage({
					jsonrpc: '2.0', id: subscribeReq.id,
					result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } },
				});
				await Promise.resolve();

				const action: SessionTitleChangedAction = {
					type: ActionType.SessionTitleChanged,
					session: sessionUri.toString(),
					title: 'Echoed back',
				};
				client.dispatch(action);
				const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged)!;
				const initialSeq = (initialDispatch.params as { clientSeq: number }).clientSeq;

				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				// Reply with a replay buffer that already contains our action,
				// echoed back with origin = { clientId, clientSeq }.
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: {
						type: ReconnectResultType.Replay,
						actions: [{
							action,
							serverSeq: 6,
							origin: { clientId: client.clientId, clientSeq: initialSeq },
							rejectionReason: undefined,
						}],
						missing: [],
					},
				});
				await flushMicrotasks();

				assert.strictEqual(findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged), undefined,
					'action echoed back via replay buffer must not be re-sent');

				subRef.dispose();
				client.dispose();
			});
		});

		test('outgoing requests wait for reconnect to complete', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				// Drop the transport, then issue a new request while the
				// soft-reconnect is in flight. The request must land on the new
				// transport rather than racing the dead one or being dropped.
				transports[0].fireClose();
				const inFlight = client.resourceList(URI.file('/workspace')).catch(err => err);

				// Hold off the new transport's connect() so the request stays gated.
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				assert.strictEqual(findRequest(reconnectTransport, 'resourceList'), undefined,
					'request must NOT be sent before reconnect completes');

				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});

				const resourceList = await waitForRequest(reconnectTransport, 'resourceList');
				reconnectTransport.fireMessage({ jsonrpc: '2.0', id: resourceList.id, result: { entries: [] } });

				const value = await inFlight;
				assert.deepStrictEqual(value, { entries: [] });
				client.dispose();
			});
		});

		test('rejected action echoed in replay buffer is not applied to confirmed state', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				const sessionUri = URI.parse('copilot:/test-session');
				const subRef = client.getSubscription<{ summary: { title: string } }>(StateComponents.Session, sessionUri);
				const subscribeReq = await waitForRequest(transports[0], 'subscribe');
				transports[0].fireMessage({
					jsonrpc: '2.0', id: subscribeReq.id,
					result: { snapshot: { resource: sessionUri.toString(), state: { summary: { title: 'Original' }, turns: [] }, fromSeq: 5 } },
				});
				await Promise.resolve();

				const action: SessionTitleChangedAction = {
					type: ActionType.SessionTitleChanged,
					session: sessionUri.toString(),
					title: 'Rejected change',
				};
				client.dispatch(action);
				const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged)!;
				const initialSeq = (initialDispatch.params as { clientSeq: number }).clientSeq;

				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				// Server echoes back the action with a rejectionReason — the
				// confirmed state must NOT advance to 'Rejected change'.
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: {
						type: ReconnectResultType.Replay,
						actions: [{
							action,
							serverSeq: 6,
							origin: { clientId: client.clientId, clientSeq: initialSeq },
							rejectionReason: 'unauthorized',
						}],
						missing: [],
					},
				});
				await flushMicrotasks();

				const sessionState = subRef.object.verifiedValue;
				assert.ok(sessionState, 'session state should be hydrated');
				assert.strictEqual(sessionState.summary.title, 'Original',
					'rejected action must not have been applied to confirmed state');
				assert.strictEqual(findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged), undefined,
					'rejected action must not be re-dispatched');

				subRef.dispose();
				client.dispose();
			});
		});

		test('snapshot reconnect result reseats the root state', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: {
						type: ReconnectResultType.Snapshot,
						snapshots: [{
							resource: ROOT_STATE_URI,
							state: { agents: [{ provider: 'copilot', displayName: 'Copilot', models: [], tools: [] }], activeSessions: 0, terminals: [] },
							fromSeq: 42,
						}],
					},
				});
				await flushMicrotasks();

				const root = client.rootState.value;
				assert.ok(root && !(root instanceof Error), 'root state should be hydrated from snapshot');
				assert.strictEqual(root.agents[0]?.provider, 'copilot');
				client.dispose();
			});
		});

		test('transport drop during reconnect RPC re-schedules instead of hanging', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				transports[0].fireClose();
				await waitForReconnecting(client);
				const attempt1 = await waitForTransport(transports, 1);
				attempt1.connectDeferred.complete();
				await waitForRequest(attempt1, 'reconnect');

				// Second drop mid-handshake. The attempt's pending RPC must be rejected
				// so the retry path fires; without that the await stays pending and
				// every subsequent request deadlocks on the reconnect gate.
				attempt1.fireClose();

				const attempt2 = await waitForTransport(transports, 2);
				attempt2.connectDeferred.complete();
				const reconnect2 = await waitForRequest(attempt2, 'reconnect');
				attempt2.fireMessage({
					jsonrpc: '2.0', id: reconnect2.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});
				await flushMicrotasks();

				assert.strictEqual(client.connectionState, AgentHostClientState.Connected,
					'client must recover to Connected after a mid-reconnect drop');
				client.dispose();
			});
		});

		test('non-session dispatch issued during reconnect rides retries until success', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				// Drop transport before any successful reconnect so the gate stays
				// engaged across the failed attempt.
				transports[0].fireClose();
				await waitForReconnecting(client);

				// A terminal action dispatched while reconnecting. There is no
				// optimistic replay path for terminal/root actions; the only way
				// these reach the server is via the notification gate.
				const terminalUri = URI.parse('agenthost-terminal:/term-1');
				client.dispatch({
					type: ActionType.TerminalInput,
					terminal: terminalUri.toString(),
					data: 'echo hello\n',
				});

				// First attempt fails. The notification must NOT be dropped; the
				// rejection handler should re-queue it onto the new gate.
				const attempt1 = await waitForTransport(transports, 1);
				attempt1.connectDeferred.error(new Error('connect failed'));

				const attempt2 = await waitForTransport(transports, 2);
				attempt2.connectDeferred.complete();
				const reconnect2 = await waitForRequest(attempt2, 'reconnect');
				attempt2.fireMessage({
					jsonrpc: '2.0', id: reconnect2.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});
				await flushMicrotasks();

				const dispatched = findNotification(attempt2, 'dispatchAction');
				assert.ok(dispatched, 'terminal dispatch must ride the failed attempt through to the next successful one');
				client.dispose();
			});
		});

		test('request issued during reconnect rides retries until success', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				transports[0].fireClose();
				await waitForReconnecting(client);

				// Issue a request while the gate is engaged. The first reconnect
				// attempt will fail; the request must NOT surface the transient
				// failure to its caller, it should stay gated until the next
				// successful handshake.
				const inFlight = client.resourceList(URI.file('/workspace')).catch(err => err);

				const attempt1 = await waitForTransport(transports, 1);
				attempt1.connectDeferred.error(new Error('connect failed'));

				const attempt2 = await waitForTransport(transports, 2);
				assert.strictEqual(findRequest(attempt2, 'resourceList'), undefined,
					'request must not slip through to the new transport before its handshake completes');

				attempt2.connectDeferred.complete();
				const reconnect2 = await waitForRequest(attempt2, 'reconnect');
				attempt2.fireMessage({
					jsonrpc: '2.0', id: reconnect2.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});

				const resourceList = await waitForRequest(attempt2, 'resourceList');
				attempt2.fireMessage({ jsonrpc: '2.0', id: resourceList.id, result: { entries: [] } });

				const value = await inFlight;
				assert.deepStrictEqual(value, { entries: [] },
					'request must resolve once a later reconnect attempt succeeds');
				client.dispose();
			});
		});

		test('_sendExtensionRequest waits for the reconnect gate', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				transports[0].fireClose();
				await waitForReconnecting(client);
				const shutdown = client.shutdown().catch(err => err);

				const reconnectTransport = await waitForTransport(transports, 1);
				// Extension requests must not race the dead transport — nothing
				// should be on the wire yet.
				assert.strictEqual(findRequest(reconnectTransport, 'shutdown'), undefined,
					'shutdown extension request must NOT be sent before reconnect completes');

				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});

				const shutdownReq = await waitForRequest(reconnectTransport, 'shutdown');
				reconnectTransport.fireMessage({ jsonrpc: '2.0', id: shutdownReq.id, result: null });
				await shutdown;
				client.dispose();
			});
		});

		test('watchdog dead-transport detection triggers soft reconnect', async function () {
			this.timeout(60_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				// Issue a request the server never answers. After WATCHDOG_TIMEOUT_MS
				// of silence the watchdog must route through the soft-reconnect
				// path — *not* rely on the transport's onClose firing (it never
				// will for a silent dead socket, see WebSocketClientTransport.dispose).
				const pending = client.resourceList(URI.file('/workspace')).catch(err => err);
				await timeout(30_000);

				assert.strictEqual(client.connectionState, AgentHostClientState.Reconnecting,
					'watchdog must drive the client into Reconnecting via soft reconnect rather than firing onDidClose');

				const err = await pending;
				assert.ok(err instanceof ProtocolError);
				assert.match((err as ProtocolError).message, /Connection appears dead/);
			});
		});
	});
});
