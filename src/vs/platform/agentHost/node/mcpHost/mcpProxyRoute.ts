/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout } from '../../../../base/common/async.js';
import {
	isJsonRpcNotification,
	isJsonRpcRequest,
	isJsonRpcResponse,
	isJsonRpcSuccessResponse,
	type IJsonRpcErrorResponse,
	type IJsonRpcRequest,
	type IJsonRpcSuccessResponse,
	type JsonRpcId,
	type JsonRpcMessage,
} from '../../../../base/common/jsonRpcProtocol.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import type { ILogger } from '../../../log/common/log.js';
import type { McpRpcCallResponse, McpRpcMessage } from '../../common/state/protocol/state.js';
import type { IInitializeInjector } from './mcpInitializeInjector.js';
import {
	jsonRpcError,
	jsonRpcNotificationToMcp,
	jsonRpcRequestToMcpCall,
	mcpCallResponseToJsonRpc,
} from './mcpRpcEnvelope.js';
import type { IMcpUpstream, IMcpUpstreamCapabilities } from './mcpUpstream.js';

/** Default timeout (ms) for an SDK→upstream request awaiting a response. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** JSON-RPC error code used when the request body cannot be parsed. */
const RPC_PARSE_ERROR = -32700;

/** JSON-RPC error code used when the upstream times out. */
const RPC_INTERNAL_ERROR = -32603;

export interface IMcpProxyRouteOptions {
	readonly upstream: IMcpUpstream;
	readonly logger: ILogger;
	/**
	 * Optional: rewrites client→upstream `initialize` requests to add
	 * extension capabilities. Caller chooses based on the AHP client's
	 * advertised support.
	 */
	readonly initializeInjector?: IInitializeInjector;
	/**
	 * Tap fired when the upstream emits a notification or request. The
	 * implementation returns a stable messageId the route uses to pair
	 * any later response (for upstream-originated requests). The host
	 * service mints this id and remembers the (id ↔ JSON-RPC id)
	 * mapping so it can write the reply back when the AHP client
	 * dispatches `mcp/messageResponded`.
	 */
	readonly onUpstreamMessage: (message: McpRpcMessage) => string;
	/** Override request timeout (ms). Defaults to 30s. */
	readonly requestTimeoutMs?: number;
}

/**
 * One per advertised MCP server. Bridges:
 *   SDK ⟷ HTTP ⟷ McpProxyRoute ⟷ IMcpUpstream
 *
 * Pass-through is blind in both directions, with three hooks.
 *  1. client→upstream `initialize` requests are rewritten via
 *     {@link IInitializeInjector} when one is configured.
 *  2. upstream-originated notifications are tapped and recorded in AHP
 *     state. They are NOT pushed to the SDK in v1 (HTTP request/response
 *     has no return channel; SSE is a Phase 6 follow-up).
 *  3. upstream-originated requests are tapped and recorded in AHP
 *     state. The AHP client answers them via
 *     {@link McpProxyRoute.deliverClientResponse}; same caveat as (2)
 *     applies — they are not pushed to the SDK in v1.
 */
export class McpProxyRoute extends Disposable {

	/**
	 * Maps host-minted messageId → JSON-RPC id for upstream-originated
	 * requests awaiting an AHP-client response.
	 */
	private readonly _pendingUpstreamRequests = new Map<string, JsonRpcId>();

	/**
	 * Maps SDK JSON-RPC id (as a string for safe Map keys) → entry. The
	 * route forwards the SDK's request to the upstream and resolves the
	 * deferred once the upstream replies. The original {@link JsonRpcId}
	 * is retained so disposal can complete the deferred with an error
	 * response carrying the id the SDK actually sent (not `0`).
	 */
	private readonly _pendingSdkRequests = new Map<string, { id: JsonRpcId; deferred: DeferredPromise<JsonRpcMessage> }>();

	/**
	 * Set of SDK JSON-RPC ids (string-keyed) that the route has forwarded
	 * to the upstream as `initialize` requests. When a matching response
	 * arrives we extract `result.capabilities` and push it to
	 * {@link IMcpUpstream.setUpstreamCapabilities}. Cleared on dispose.
	 */
	private readonly _pendingInitializeIds = new Set<string>();

	private readonly _requestTimeoutMs: number;
	private _disposed = false;

	constructor(private readonly _options: IMcpProxyRouteOptions) {
		super();
		this._requestTimeoutMs = _options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
		this._register(this._options.upstream.onMessage(msg => this._onUpstreamMessage(msg)));
	}

	/**
	 * Handle an inbound HTTP body from the SDK. The body is a single
	 * JSON-RPC message: request, notification, or response (responses
	 * arrive when the upstream had previously sent the SDK a request).
	 *
	 * Returns the response body to send back as HTTP 200, or empty
	 * string for a notification (HTTP 204).
	 */
	public async handleSdkBody(body: string): Promise<string> {
		let parsed: JsonRpcMessage;
		try {
			parsed = JSON.parse(body) as JsonRpcMessage;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._options.logger.warn(`McpProxyRoute: failed to parse SDK body: ${message}`);
			return JSON.stringify(jsonRpcError(0, RPC_PARSE_ERROR, `Parse error: ${message}`));
		}

		if (isJsonRpcRequest(parsed)) {
			return this._handleSdkRequest(parsed);
		}
		if (isJsonRpcNotification(parsed)) {
			await this._sendToUpstream(parsed);
			return '';
		}
		if (isJsonRpcResponse(parsed)) {
			// SDK is answering a previously-tapped upstream request. Forward
			// it through; the host service tracks the messageId mapping
			// separately, so all we need to do is relay.
			await this._sendToUpstream(parsed);
			return '';
		}
		this._options.logger.warn('McpProxyRoute: SDK body is not a valid JSON-RPC message');
		return JSON.stringify(jsonRpcError(0, RPC_PARSE_ERROR, 'Invalid JSON-RPC message'));
	}

	/**
	 * Forward a client-initiated message (from `mcpMessage` command) to
	 * the upstream. Notifications return immediately; requests await the
	 * response. The caller is expected to mint the JSON-RPC id when the
	 * message is a request (the proxy does not rewrite ids here).
	 */
	public async sendClientMessage(message: JsonRpcMessage): Promise<JsonRpcMessage | undefined> {
		if (isJsonRpcRequest(message)) {
			// If the caller did not provide an id, mint one.
			const id: JsonRpcId = message.id ?? generateUuid();
			const patched: IJsonRpcRequest = { ...message, id };
			return this._dispatchSdkRequest(patched);
		}
		if (isJsonRpcNotification(message) || isJsonRpcResponse(message)) {
			await this._sendToUpstream(message);
			return undefined;
		}
		this._options.logger.warn('McpProxyRoute: sendClientMessage received an invalid JSON-RPC message');
		return undefined;
	}

	/**
	 * Forward an AHP-client response to a previously-tapped upstream
	 * request. Looks up `messageId` in the pending-upstream-requests map
	 * to find the original JSON-RPC id; idempotent on unknown ids.
	 */
	public deliverClientResponse(messageId: string, response: McpRpcCallResponse): void {
		const id = this._pendingUpstreamRequests.get(messageId);
		if (id === undefined) {
			this._options.logger.warn(`McpProxyRoute: deliverClientResponse for unknown messageId '${messageId}'`);
			return;
		}
		this._pendingUpstreamRequests.delete(messageId);
		const reply: IJsonRpcSuccessResponse | IJsonRpcErrorResponse = mcpCallResponseToJsonRpc(id, response);
		void this._sendToUpstream(reply);
	}

	private async _handleSdkRequest(request: IJsonRpcRequest): Promise<string> {
		let outbound = request;
		if (request.method === 'initialize' && this._options.initializeInjector) {
			outbound = this._options.initializeInjector.inject(request);
		}
		if (request.method === 'initialize') {
			this._pendingInitializeIds.add(String(outbound.id));
		}
		const reply = await this._dispatchSdkRequest(outbound);
		return JSON.stringify(reply);
	}

	private async _dispatchSdkRequest(request: IJsonRpcRequest): Promise<JsonRpcMessage> {
		const key = String(request.id);
		const deferred = new DeferredPromise<JsonRpcMessage>();
		this._pendingSdkRequests.set(key, { id: request.id, deferred });

		const timeoutHandle = disposableTimeout(() => {
			this._pendingSdkRequests.delete(key);
			this._options.logger.warn(`McpProxyRoute: upstream timed out for id '${key}'`);
			deferred.complete(jsonRpcError(request.id, RPC_INTERNAL_ERROR, 'Upstream MCP server did not respond within timeout'));
		}, this._requestTimeoutMs);

		try {
			await this._sendToUpstream(request);
		} catch (err) {
			timeoutHandle.dispose();
			this._pendingSdkRequests.delete(key);
			const message = err instanceof Error ? err.message : String(err);
			this._options.logger.warn(`McpProxyRoute: upstream send failed for id '${key}': ${message}`);
			return jsonRpcError(request.id, RPC_INTERNAL_ERROR, message);
		}

		try {
			return await deferred.p;
		} finally {
			timeoutHandle.dispose();
		}
	}

	private async _sendToUpstream(message: JsonRpcMessage): Promise<void> {
		await this._options.upstream.send(message);
	}

	private _captureUpstreamCapabilities(result: unknown): void {
		if (!result || typeof result !== 'object') {
			return;
		}
		const caps = (result as { capabilities?: unknown }).capabilities;
		if (caps && typeof caps === 'object') {
			this._options.upstream.setUpstreamCapabilities(caps as IMcpUpstreamCapabilities);
		}
	}

	private _onUpstreamMessage(message: JsonRpcMessage): void {
		if (isJsonRpcRequest(message)) {
			const mcp = jsonRpcRequestToMcpCall(message);
			const messageId = this._options.onUpstreamMessage(mcp);
			this._pendingUpstreamRequests.set(messageId, message.id);
			return;
		}
		if (isJsonRpcResponse(message)) {
			const id = message.id;
			if (id === undefined) {
				this._options.logger.warn('McpProxyRoute: upstream response missing id');
				return;
			}
			const key = String(id);
			if (this._pendingInitializeIds.delete(key) && isJsonRpcSuccessResponse(message)) {
				this._captureUpstreamCapabilities(message.result);
			}
			const entry = this._pendingSdkRequests.get(key);
			if (!entry) {
				this._options.logger.warn(`McpProxyRoute: upstream response for unknown id '${key}'`);
				return;
			}
			this._pendingSdkRequests.delete(key);
			entry.deferred.complete(message);
			return;
		}
		if (isJsonRpcNotification(message)) {
			const mcp = jsonRpcNotificationToMcp(message);
			if (!mcp) {
				this._options.logger.warn('McpProxyRoute: upstream notification was malformed');
				return;
			}
			this._options.onUpstreamMessage(mcp);
			return;
		}
		this._options.logger.warn('McpProxyRoute: upstream emitted an unrecognized JSON-RPC message');
	}

	public override dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		for (const { id, deferred } of this._pendingSdkRequests.values()) {
			deferred.complete(jsonRpcError(id, RPC_INTERNAL_ERROR, 'Proxy route disposed'));
		}
		this._pendingSdkRequests.clear();
		this._pendingUpstreamRequests.clear();
		this._pendingInitializeIds.clear();
		super.dispose();
	}
}
