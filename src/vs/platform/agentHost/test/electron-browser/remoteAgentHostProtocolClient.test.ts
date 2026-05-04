/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import { RemoteAgentHostProtocolClient } from '../../browser/remoteAgentHostProtocolClient.js';
import { IAgentHostPermissionService } from '../../common/agentHostPermissionService.js';
import { AhpErrorCodes } from '../../common/state/protocol/errors.js';
import { ContentEncoding } from '../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { ActionType, type SessionActiveClientChangedAction } from '../../common/state/sessionActions.js';
import { ProtocolError, type AhpServerNotification, type JsonRpcNotification, type JsonRpcRequest, type JsonRpcResponse, type ProtocolMessage } from '../../common/state/sessionProtocol.js';
import type { IClientTransport, IProtocolTransport } from '../../common/state/sessionTransport.js';

type ProtocolTransportMessage = ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcResponse | JsonRpcRequest;

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

	function createClient(transport = disposables.add(new TestProtocolTransport()), permissionService = createPermissionService()): { client: RemoteAgentHostProtocolClient; transport: TestProtocolTransport } {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const client = disposables.add(new RemoteAgentHostProtocolClient('test.example:1234', transport, new NullLogService(), fileService, permissionService));
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
});
