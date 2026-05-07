/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJsonRpcErrorResponse, IJsonRpcNotification, IJsonRpcRequest, IJsonRpcSuccessResponse, isJsonRpcSuccessResponse, JsonRpcId } from '../../../../base/common/jsonRpcProtocol.js';
import { McpRpcCall, McpRpcCallResponse, McpRpcMessageKind, McpRpcNotification } from '../../common/state/protocol/state.js';

/**
 * Convert a JSON-RPC notification arriving from an MCP server into the
 * AHP `McpRpcNotification` shape. Returns `undefined` if the message is
 * malformed (missing `method`).
 */
export function jsonRpcNotificationToMcp(notification: IJsonRpcNotification): McpRpcNotification | undefined {
	if (typeof notification.method !== 'string' || notification.method.length === 0) {
		return undefined;
	}
	return {
		kind: McpRpcMessageKind.Notification,
		method: notification.method,
		params: notification.params,
	};
}

/**
 * Convert a JSON-RPC server→client request (the MCP server is asking
 * the AHP client to satisfy a call) into the AHP `McpRpcCall` shape
 * with `response: undefined`. The caller is responsible for tracking
 * the original `id` so it can pair the eventual response back.
 */
export function jsonRpcRequestToMcpCall(request: IJsonRpcRequest): McpRpcCall {
	return {
		kind: McpRpcMessageKind.Call,
		method: request.method,
		request: request.params,
		response: undefined,
	};
}

/**
 * Build a JSON-RPC response message from an `McpRpcCallResponse` and
 * the original request `id`. Used to forward the AHP client's response
 * back over the upstream JSON-RPC transport.
 */
export function mcpCallResponseToJsonRpc(id: JsonRpcId, response: McpRpcCallResponse): IJsonRpcSuccessResponse | IJsonRpcErrorResponse {
	if (isJsonRpcSuccessResponse(response)) {
		return jsonRpcSuccess(id, response.result);
	}
	return jsonRpcError(id, response.error.code, response.error.message, response.error.data);
}

/**
 * Build a JSON-RPC error response with a given error code/message. Used
 * by the proxy to fail an in-flight upstream request when the AHP client
 * disconnects or rejects the call.
 */
export function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): IJsonRpcErrorResponse {
	const error: IJsonRpcErrorResponse['error'] = { code, message };
	if (data !== undefined) {
		error.data = data;
	}
	return {
		jsonrpc: '2.0',
		id,
		error,
	};
}

/**
 * Build a JSON-RPC success response.
 */
export function jsonRpcSuccess(id: JsonRpcId, result: unknown): IJsonRpcSuccessResponse {
	return {
		jsonrpc: '2.0',
		id,
		result,
	};
}
