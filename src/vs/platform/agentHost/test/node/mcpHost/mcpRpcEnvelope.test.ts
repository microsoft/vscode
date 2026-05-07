/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { IJsonRpcNotification, IJsonRpcRequest } from '../../../../../base/common/jsonRpcProtocol.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpRpcMessageKind } from '../../../common/state/protocol/state.js';
import { jsonRpcError, jsonRpcNotificationToMcp, jsonRpcRequestToMcpCall, jsonRpcSuccess, mcpCallResponseToJsonRpc } from '../../../node/mcpHost/mcpRpcEnvelope.js';

suite('mcpRpcEnvelope', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('jsonRpcNotificationToMcp maps method/params and returns Notification kind', () => {
		const notification: IJsonRpcNotification = {
			jsonrpc: '2.0',
			method: 'notifications/tools/list_changed',
			params: { foo: 1 },
		};

		assert.deepStrictEqual(jsonRpcNotificationToMcp(notification), {
			kind: McpRpcMessageKind.Notification,
			method: 'notifications/tools/list_changed',
			params: { foo: 1 },
		});
	});

	test('jsonRpcNotificationToMcp returns undefined when method is missing', () => {
		const malformed = { jsonrpc: '2.0' } as unknown as IJsonRpcNotification;
		assert.strictEqual(jsonRpcNotificationToMcp(malformed), undefined);
	});

	test('jsonRpcRequestToMcpCall maps method/params, sets Call kind, leaves response undefined', () => {
		const request: IJsonRpcRequest = {
			jsonrpc: '2.0',
			id: 7,
			method: 'sampling/createMessage',
			params: { messages: [] },
		};

		assert.deepStrictEqual(jsonRpcRequestToMcpCall(request), {
			kind: McpRpcMessageKind.Call,
			method: 'sampling/createMessage',
			request: { messages: [] },
			response: undefined,
		});
	});

	test('mcpCallResponseToJsonRpc handles success result discriminant', () => {
		assert.deepStrictEqual(
			mcpCallResponseToJsonRpc(42, { jsonrpc: '2.0', id: 1, result: { ok: true } }),
			{ jsonrpc: '2.0', id: 42, result: { ok: true } },
		);
	});

	test('mcpCallResponseToJsonRpc handles error discriminant including data', () => {
		assert.deepStrictEqual(
			mcpCallResponseToJsonRpc('id-1', { jsonrpc: '2.0', error: { code: -32000, message: 'boom', data: { detail: 'x' } } }),
			{ jsonrpc: '2.0', id: 'id-1', error: { code: -32000, message: 'boom', data: { detail: 'x' } } },
		);
	});

	test('jsonRpcSuccess and jsonRpcError produce well-formed messages', () => {
		assert.deepStrictEqual(
			jsonRpcSuccess(1, 'hello'),
			{ jsonrpc: '2.0', id: 1, result: 'hello' },
		);
		assert.deepStrictEqual(
			jsonRpcError(2, -32601, 'Method not found'),
			{ jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'Method not found' } },
		);
	});
});
