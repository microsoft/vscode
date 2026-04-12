/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DeferredPromise } from '../../common/async.js';
import { CancellationTokenSource } from '../../common/cancellation.js';
import { CancellationError } from '../../common/errors.js';
import { JsonRpcError, JsonRpcProtocol } from '../../common/jsonRpcProtocol.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('JsonRpcProtocol', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    const createProtocol = (handlers = {}) => {
        const sentMessages = [];
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
        const requestPromise = protocol.sendRequest({ method: 'echo', params: { value: 'ok' } });
        const outgoingRequest = sentMessages[0];
        const replies = await protocol.handleMessage({
            jsonrpc: '2.0',
            id: outgoingRequest.id,
            result: 'done'
        });
        const result = await requestPromise;
        assert.strictEqual(result, 'done');
        assert.deepStrictEqual(replies, []);
    });
    test('sendRequest rejects on error response', async () => {
        const { protocol, sentMessages } = createProtocol();
        const requestPromise = protocol.sendRequest({ method: 'fail' });
        const outgoingRequest = sentMessages[0];
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
        let canceledId;
        const requestPromise = protocol.sendRequest({ method: 'cancel-me' }, cts.token, id => canceledId = id);
        const outgoingRequest = sentMessages[0];
        cts.cancel();
        await assert.rejects(requestPromise, error => error instanceof CancellationError);
        assert.strictEqual(canceledId, outgoingRequest.id);
        cts.dispose(true);
    });
    test('cancelPendingRequest rejects active request', async () => {
        const { protocol, sentMessages } = createProtocol();
        const requestPromise = protocol.sendRequest({ method: 'pending' });
        const outgoingRequest = sentMessages[0];
        protocol.cancelPendingRequest(outgoingRequest.id);
        await assert.rejects(requestPromise, error => error instanceof CancellationError);
    });
    test('handleRequest responds with method not found without handler', async () => {
        const { protocol, sentMessages } = createProtocol();
        const replies = await protocol.handleMessage({
            jsonrpc: '2.0',
            id: 7,
            method: 'unknown'
        });
        const expected = [{
                jsonrpc: '2.0',
                id: 7,
                error: {
                    code: -32601,
                    message: 'Method not found: unknown'
                }
            }];
        assert.deepStrictEqual(sentMessages, expected);
        assert.deepStrictEqual(replies, expected);
    });
    test('handleRequest responds with result and passes cancellation token', async () => {
        let receivedToken;
        let wasCanceledDuringHandler;
        const { protocol, sentMessages } = createProtocol({
            handleRequest: async (request, token) => {
                receivedToken = token;
                wasCanceledDuringHandler = token.isCancellationRequested;
                return `${request.method}:ok`;
            }
        });
        const replies = await protocol.handleMessage({
            jsonrpc: '2.0',
            id: 9,
            method: 'compute'
        });
        assert.ok(receivedToken);
        assert.strictEqual(wasCanceledDuringHandler, false);
        const expected = [{
                jsonrpc: '2.0',
                id: 9,
                result: 'compute:ok'
            }];
        assert.deepStrictEqual(sentMessages, expected);
        assert.deepStrictEqual(replies, expected);
    });
    test('handleRequest serializes JsonRpcError and returns it', async () => {
        const { protocol, sentMessages } = createProtocol({
            handleRequest: () => {
                throw new JsonRpcError(88, 'bad request', { detail: true });
            }
        });
        const replies = await protocol.handleMessage({
            jsonrpc: '2.0',
            id: 'a',
            method: 'boom'
        });
        const expected = [{
                jsonrpc: '2.0',
                id: 'a',
                error: {
                    code: 88,
                    message: 'bad request',
                    data: { detail: true }
                }
            }];
        assert.deepStrictEqual(sentMessages, expected);
        assert.deepStrictEqual(replies, expected);
    });
    test('handleRequest maps unknown errors to internal error and returns it', async () => {
        const { protocol, sentMessages } = createProtocol({
            handleRequest: () => {
                throw new Error('unexpected');
            }
        });
        const replies = await protocol.handleMessage({
            jsonrpc: '2.0',
            id: 'b',
            method: 'explode'
        });
        const expected = [{
                jsonrpc: '2.0',
                id: 'b',
                error: {
                    code: -32603,
                    message: 'unexpected'
                }
            }];
        assert.deepStrictEqual(sentMessages, expected);
        assert.deepStrictEqual(replies, expected);
    });
    test('handleMessage processes batch sequentially', async () => {
        const sequence = [];
        const gate = new DeferredPromise();
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
        const request = {
            jsonrpc: '2.0',
            id: 1,
            method: 'first'
        };
        const notification = {
            jsonrpc: '2.0',
            method: 'second'
        };
        const handlingPromise = protocol.handleMessage([request, notification]);
        assert.deepStrictEqual(sequence, ['request:start']);
        gate.complete();
        const replies = await handlingPromise;
        assert.deepStrictEqual(sequence, ['request:start', 'request:end', 'notification']);
        assert.deepStrictEqual(replies, [{ jsonrpc: '2.0', id: 1, result: true }]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvblJwY1Byb3RvY29sLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvY29tbW9uL2pzb25ScGNQcm90b2NvbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDeEQsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzFGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzNELE9BQU8sRUFBbUUsWUFBWSxFQUFrQixlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNqSyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFckUsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtJQUU3QixNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELE1BQU0sY0FBYyxHQUFHLENBQUMsV0FBcUMsRUFBRSxFQUFFLEVBQUU7UUFDbEUsTUFBTSxZQUFZLEdBQXFCLEVBQUUsQ0FBQztRQUMxQyxNQUFNLFFBQVEsR0FBRyxJQUFJLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdEYsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNwQixPQUFPLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxDQUFDO0lBQ25DLENBQUMsQ0FBQztJQUVGLElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxHQUFHLEVBQUU7UUFDbkQsTUFBTSxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsR0FBRyxjQUFj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