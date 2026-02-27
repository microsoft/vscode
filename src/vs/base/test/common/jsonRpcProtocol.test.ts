/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../common/cancellation.js';
import { CancellationError } from '../../common/errors.js';
import { IJsonRpcNotification, IJsonRpcProtocolHandlers, IJsonRpcRequest, JsonRpcError, JsonRpcMessage, JsonRpcProtocol } from '../../common/jsonRpcProtocol.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('JsonRpcProtocol', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const createProtocol = (handlers: IJsonRpcProtocolHandlers = {}) => {
		const sentMessages: JsonRpcMessage[] = [];
		const protocol = new JsonRpcProtocol(message => sentMessages.push(message), handlers);
		store.add(protocol);
		return { protocol, sentMessages };
	};

	test('sendNotification adds jsonrpc envelope', () => {
		const { protocol, sentMessages } = createProtocol();

		protocol.sendNotification({ method: 'notify', params: { value: 1 } });

		assert.deepStrictEqual(sentMessages, [{
			jsonrpc: '2.0',
			method: 'notify',
			params: { value: 1 }
		}]);
	});

	test('sendRequest resolves on success response', async () => {
		const { protocol, sentMessages } = createProtocol();

		const requestPromise = protocol.sendRequest<string>({ method: 'echo', params: { value: 'ok' } });
		const outgoingRequest = sentMessages[0] as IJsonRpcRequest;

		await protocol.handleMessage({
			jsonrpc: '2.0',
			id: outgoingRequest.id,
			result: 'done'
		});

		const result = await requestPromise;
		assert.strictEqual(result, 'done');
	});

	test('sendRequest rejects on error response', async () => {
		const { protocol, sentMessages } = createProtocol();

		const requestPromise = protocol.sendRequest({ method: 'fail' });
		const outgoingRequest = sentMessages[0] as IJsonRpcRequest;

		await protocol.handleMessage({
			jsonrpc: '2.0',
			id: outgoingRequest.id,
			error: {
				code: 123,
				message: 'Failure',
				data: { source: 'test' }
			}
		});

		await assert.rejects(requestPromise, error => {
			assert.ok(error instanceof JsonRpcError);
			assert.strictEqual(error.code, 123);
			assert.strictEqual(error.message, 'Failure');
			assert.deepStrictEqual(error.data, { source: 'test' });
			return true;
		});
	});

	test('sendRequest honors cancellation token and invokes onCancel', async () => {
		const { protocol, sentMessages } = createProtocol();
		const cts = new CancellationTokenSource();
		let canceledId: string | number | undefined;

		const requestPromise = protocol.sendRequest(
			{ method: 'cancel-me' },
			cts.token,
			id => canceledId = id,
		);
		const outgoingRequest = sentMessages[0] as IJsonRpcRequest;

		cts.cancel();

		await assert.rejects(requestPromise, error => error instanceof CancellationError);
		assert.strictEqual(canceledId, outgoingRequest.id);

		cts.dispose(true);
	});

	test('cancelPendingRequest rejects active request', async () => {
		const { protocol, sentMessages } = createProtocol();

		const requestPromise = protocol.sendRequest({ method: 'pending' });
		const outgoingRequest = sentMessages[0] as IJsonRpcRequest;
		protocol.cancelPendingRequest(outgoingRequest.id);

		await assert.rejects(requestPromise, error => error instanceof CancellationError);
	});

	test('handleRequest responds with method not found without handler', async () => {
		const { protocol, sentMessages } = createProtocol();

		await protocol.handleMessage({
			jsonrpc: '2.0',
			id: 7,
			method: 'unknown'
		});

		assert.deepStrictEqual(sentMessages, [{
			jsonrpc: '2.0',
			id: 7,
			error: {
				code: -32601,
				message: 'Method not found: unknown'
			}
		}]);
	});

	test('handleRequest responds with result and passes cancellation token', async () => {
		let receivedToken: CancellationToken | undefined;
		let wasCanceledDuringHandler: boolean | undefined;
		const { protocol, sentMessages } = createProtocol({
			handleRequest: async (request, token) => {
				receivedToken = token;
				wasCanceledDuringHandler = token.isCancellationRequested;
				return `${request.method}:ok`;
			}
		});

		await protocol.handleMessage({
			jsonrpc: '2.0',
			id: 9,
			method: 'compute'
		});

		assert.ok(receivedToken);
		assert.strictEqual(wasCanceledDuringHandler, false);
		assert.deepStrictEqual(sentMessages, [{
			jsonrpc: '2.0',
			id: 9,
			result: 'compute:ok'
		}]);
	});

	test('handleRequest serializes JsonRpcError', async () => {
		const { protocol, sentMessages } = createProtocol({
			handleRequest: () => {
				throw new JsonRpcError(88, 'bad request', { detail: true });
			}
		});

		await protocol.handleMessage({
			jsonrpc: '2.0',
			id: 'a',
			method: 'boom'
		});

		assert.deepStrictEqual(sentMessages, [{
			jsonrpc: '2.0',
			id: 'a',
			error: {
				code: 88,
				message: 'bad request',
				data: { detail: true }
			}
		}]);
	});

	test('handleRequest maps unknown errors to internal error', async () => {
		const { protocol, sentMessages } = createProtocol({
			handleRequest: () => {
				throw new Error('unexpected');
			}
		});

		await protocol.handleMessage({
			jsonrpc: '2.0',
			id: 'b',
			method: 'explode'
		});

		assert.deepStrictEqual(sentMessages, [{
			jsonrpc: '2.0',
			id: 'b',
			error: {
				code: -32603,
				message: 'unexpected'
			}
		}]);
	});

	test('handleMessage processes batch sequentially', async () => {
		const sequence: string[] = [];
		const gate = new DeferredPromise<void>();
		const { protocol } = createProtocol({
			handleRequest: async () => {
				sequence.push('request:start');
				await gate.p;
				sequence.push('request:end');
				return true;
			},
			handleNotification: () => {
				sequence.push('notification');
			}
		});

		const request: IJsonRpcRequest = {
			jsonrpc: '2.0',
			id: 1,
			method: 'first'
		};
		const notification: IJsonRpcNotification = {
			jsonrpc: '2.0',
			method: 'second'
		};

		const handlingPromise = protocol.handleMessage([request, notification]);
		assert.deepStrictEqual(sequence, ['request:start']);

		gate.complete();
		await handlingPromise;

		assert.deepStrictEqual(sequence, ['request:start', 'request:end', 'notification']);
	});
});
