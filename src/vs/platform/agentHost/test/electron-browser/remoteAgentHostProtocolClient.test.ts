/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import { RemoteAgentHostProtocolClient, RemoteAgentHostProtocolError } from '../../browser/remoteAgentHostProtocolClient.js';
import { AhpErrorCodes } from '../../common/state/protocol/errors.js';
import type { IAhpServerNotification, IJsonRpcNotification, IJsonRpcRequest, IJsonRpcResponse, IProtocolMessage } from '../../common/state/sessionProtocol.js';
import type { IClientTransport, IProtocolTransport } from '../../common/state/sessionTransport.js';

type ProtocolTransportMessage = IProtocolMessage | IAhpServerNotification | IJsonRpcNotification | IJsonRpcResponse | IJsonRpcRequest;

class TestProtocolTransport extends Disposable implements IProtocolTransport {
	private readonly _onMessage = this._register(new Emitter<IProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	readonly sentMessages: ProtocolTransportMessage[] = [];

	send(message: ProtocolTransportMessage): void {
		this.sentMessages.push(message);
	}

	fireMessage(message: IProtocolMessage): void {
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

	function createClient(transport = disposables.add(new TestProtocolTransport())): { client: RemoteAgentHostProtocolClient; transport: TestProtocolTransport } {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const client = disposables.add(new RemoteAgentHostProtocolClient('test.example:1234', transport, new NullLogService(), fileService));
		return { client, transport };
	}

	async function assertRemoteProtocolError(promise: Promise<unknown>, expected: { code: number; message: string; data?: unknown }): Promise<void> {
		try {
			await promise;
			assert.fail('Expected promise to reject');
		} catch (error) {
			if (!(error instanceof RemoteAgentHostProtocolError)) {
				assert.fail(`Expected RemoteAgentHostProtocolError, got ${String(error)}`);
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
});
