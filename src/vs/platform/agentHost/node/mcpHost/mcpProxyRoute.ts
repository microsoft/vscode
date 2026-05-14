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
	type IJsonRpcNotification,
	type IJsonRpcRequest,
	type IJsonRpcSuccessResponse,
	type JsonRpcId,
	type JsonRpcMessage,
} from '../../../../base/common/jsonRpcProtocol.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import type { ILogger } from '../../../log/common/log.js';
import { MCP } from '../../../mcp/common/modelContextProtocol.js';
import type { AhpMcpUiHostCapabilities } from '../../common/state/protocol/state.js';
import type { IInitializeInjector } from './mcpInitializeInjector.js';
import type { IMcpUpstream, IMcpUpstreamCapabilities } from './mcpUpstream.js';

/** Default timeout (ms) for an SDK→upstream request awaiting a response. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** JSON-RPC error code used when the request body cannot be parsed. */
const RPC_PARSE_ERROR = -32700;

/** JSON-RPC error code used when the upstream times out. */
const RPC_INTERNAL_ERROR = -32603;

/** Build a JSON-RPC error response. */
function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): IJsonRpcErrorResponse {
	const error: IJsonRpcErrorResponse['error'] = { code, message };
	if (data !== undefined) {
		error.data = data;
	}
	return { jsonrpc: '2.0', id, error };
}

/** Build a JSON-RPC success response. */
function jsonRpcSuccess(id: JsonRpcId, result: unknown): IJsonRpcSuccessResponse {
	return { jsonrpc: '2.0', id, result };
}

/**
 * Outcome of an upstream → AHP-client request: either a JSON-RPC `result`
 * or a JSON-RPC `error`.
 */
export interface IUpstreamRequestOutcome {
	readonly result?: unknown;
	readonly error?: { code: number; message: string; data?: unknown };
}

/**
 * The MCP Apps `_meta.ui` payload carried by a `Tool` definition.
 *
 * Mirrors the
 * [MCP Apps spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).
 * The proxy captures these payloads from `tools/list` responses so the
 * agent can decorate AHP `ToolCallBase._meta` with `ui` / `uiHostCapabilities`
 * when the Copilot SDK invokes the matching tool.
 */
export interface IMcpUiToolMeta {
	/** `ui://…` URI of the UI resource for rendering the tool result. */
	readonly resourceUri?: string;
	/**
	 * Who can access this tool. Default `["model", "app"]`. `"model"` makes
	 * the tool visible to the agent; `"app"` makes it callable by the UI
	 * view from the same MCP server.
	 */
	readonly visibility?: readonly ('model' | 'app')[];
}

/**
 * Project the upstream MCP server's `InitializeResult.capabilities` into
 * the subset of MCP-Apps host capabilities the AHP proxy is willing to
 * satisfy for a View backed by that server.
 *
 *  - `serverTools` / `serverResources` — advertised iff the upstream
 *    advertised the matching `tools` / `resources` capability. The
 *    `listChanged` flag mirrors what the upstream said; the proxy
 *    forwards those notifications transparently when present.
 *  - `logging` — advertised iff the upstream said it accepts log
 *    notifications. The proxy forwards `notifications/message` from the
 *    View and `logging/setLevel` from the View back to the server.
 *  - `sampling` — never advertised today: even when the upstream
 *    supports it, the AHP host has no LLM bridge to serve
 *    `sampling/createMessage` from the View.
 *
 * Tolerates malformed upstream payloads — bad data simply produces an
 * empty capability set rather than throwing.
 */
function deriveUiHostCapabilities(upstream: IMcpUpstreamCapabilities | undefined): AhpMcpUiHostCapabilities {
	if (!upstream) {
		return {};
	}
	try {
		const caps = upstream as MCP.ServerCapabilities;
		return {
			...(caps.tools && { serverTools: { listChanged: caps.tools.listChanged === true } }),
			...(caps.resources && { serverResources: { listChanged: caps.resources.listChanged === true } }),
			...(caps.logging && { logging: {} }),
		};
	} catch {
		return {};
	}
}

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
	 * Tap fired when the upstream emits a JSON-RPC **request**. The route
	 * awaits the returned promise and writes the JSON-RPC response back
	 * to the upstream transport using the original request id.
	 */
	readonly onUpstreamRequest: (method: string, params: unknown) => Promise<IUpstreamRequestOutcome>;
	/**
	 * Tap fired when the upstream emits a JSON-RPC **notification**.
	 * Fire-and-forget; no response is expected.
	 */
	readonly onUpstreamNotification: (method: string, params: unknown) => void;
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
 *  2. upstream-originated notifications are tapped and forwarded to the
 *     AHP client via {@link IMcpProxyRouteOptions.onUpstreamNotification}
 *     (which routes them out as `mcpNotification`).
 *  3. upstream-originated requests are tapped and forwarded to the AHP
 *     client via {@link IMcpProxyRouteOptions.onUpstreamRequest} (which
 *     routes them out as `mcpMethodCall`). The route awaits the
 *     returned outcome and writes the JSON-RPC response back to the
 *     upstream transport using the original request id.
 */
export class McpProxyRoute extends Disposable {

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

	/**
	 * Set of SDK JSON-RPC ids (string-keyed) that the route has forwarded
	 * to the upstream as `tools/list` requests. When a matching response
	 * arrives the route parses `result.tools[]._meta.ui` and refreshes
	 * {@link _toolUiMeta} so the agent can decorate MCP tool calls with
	 * the MCP Apps payload.
	 */
	private readonly _pendingToolsListIds = new Set<string>();

	/**
	 * Latest `_meta.ui` payload captured per upstream tool name. Populated
	 * lazily as `tools/list` responses flow through the proxy (from either
	 * the SDK or AHP-client `mcpMethodCall` traffic) and exposed via
	 * {@link getToolUiMeta} for the agent's tool-call decoration path.
	 */
	private readonly _toolUiMeta = new Map<string, IMcpUiToolMeta>();

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
	 * Forward a client-initiated message (from `mcpMethodCall` /
	 * `mcpNotification`) to the upstream. Notifications return
	 * immediately; requests await the response. The caller is expected
	 * to mint the JSON-RPC id when the message is a request (the proxy
	 * does not rewrite ids here).
	 */
	public async sendClientMessage(message: JsonRpcMessage): Promise<JsonRpcMessage | undefined> {
		if (isJsonRpcRequest(message)) {
			// If the caller did not provide an id, mint one.
			const id: JsonRpcId = message.id ?? generateUuid();
			const patched: IJsonRpcRequest = { ...message, id };
			// Both SDK→upstream and AHP-client→upstream `tools/list` traffic
			// goes through `_dispatchSdkRequest`; tracking the id here keeps
			// {@link _toolUiMeta} fresh regardless of which peer asked.
			if (patched.method === 'tools/list') {
				this._pendingToolsListIds.add(String(patched.id));
			}
			return this._dispatchSdkRequest(patched);
		}
		if (isJsonRpcNotification(message) || isJsonRpcResponse(message)) {
			await this._sendToUpstream(message);
			return undefined;
		}
		this._options.logger.warn('McpProxyRoute: sendClientMessage received an invalid JSON-RPC message');
		return undefined;
	}

	private async _handleSdkRequest(request: IJsonRpcRequest): Promise<string> {
		let outbound = request;
		if (request.method === 'initialize' && this._options.initializeInjector) {
			outbound = this._options.initializeInjector.inject(request);
		}
		if (request.method === 'initialize') {
			this._pendingInitializeIds.add(String(outbound.id));
		}
		if (request.method === 'tools/list') {
			this._pendingToolsListIds.add(String(outbound.id));
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

	/**
	 * Parse a `tools/list` response body and refresh {@link _toolUiMeta}
	 * with whatever `_meta.ui` payloads the upstream advertised. Each
	 * `tools/list` call replaces the entire map so stale entries don't
	 * linger when the server removes a tool. Tolerates malformed payloads
	 * — bad data simply yields an empty map rather than throwing.
	 */
	private _captureToolUiMeta(result: unknown): void {
		try {
			const { tools } = result as MCP.ListToolsResult;
			this._toolUiMeta.clear();
			for (const tool of tools) {
				const ui = tool._meta?.ui as IMcpUiToolMeta | undefined;
				if (ui && tool.name) {
					this._toolUiMeta.set(tool.name, ui);
				}
			}
		} catch (err) {
			this._options.logger.warn(`McpProxyRoute: failed to capture tool _meta.ui: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Look up the most recently captured MCP Apps `_meta.ui` payload for a
	 * tool advertised by this upstream, or `undefined` if no
	 * MCP-Apps-enabled tool with this name has been observed.
	 */
	public getToolUiMeta(toolName: string): IMcpUiToolMeta | undefined {
		return this._toolUiMeta.get(toolName);
	}

	/**
	 * The set of MCP App host capabilities the AHP proxy can satisfy for
	 * a View backed by THIS upstream server, derived from the upstream's
	 * `initialize` response.
	 *
	 * For each capability in {@link AhpMcpUiHostCapabilities} the proxy
	 * advertises it only when both
	 *  (a) the upstream advertised the corresponding server capability,
	 *      and
	 *  (b) the proxy actually forwards the matching MCP method/notification
	 *      traffic.
	 *
	 * `(b)` always holds for `serverTools`, `serverResources`, and
	 * `logging` — the proxy is a blind passthrough for those. `sampling`
	 * is intentionally omitted today: even when the upstream supports it,
	 * the AHP host has no LLM bridge to satisfy `sampling/createMessage`
	 * calls from the View.
	 *
	 * Returns an empty object when no `initialize` has been observed yet
	 * (the upstream hasn't told us what it supports, so we can't honestly
	 * advertise anything).
	 */
	public getUiHostCapabilities(): AhpMcpUiHostCapabilities {
		const upstream = this._options.upstream.upstreamCapabilities.get();
		return deriveUiHostCapabilities(upstream);
	}

	private _onUpstreamMessage(message: JsonRpcMessage): void {
		if (isJsonRpcRequest(message)) {
			this._handleUpstreamRequest(message);
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
			if (this._pendingToolsListIds.delete(key) && isJsonRpcSuccessResponse(message)) {
				this._captureToolUiMeta(message.result);
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
			this._handleUpstreamNotification(message);
			return;
		}
		this._options.logger.warn('McpProxyRoute: upstream emitted an unrecognized JSON-RPC message');
	}

	private _handleUpstreamRequest(request: IJsonRpcRequest): void {
		const method = request.method;
		const params = request.params;
		this._options.onUpstreamRequest(method, params).then(outcome => {
			if (this._disposed) {
				return;
			}
			const reply: IJsonRpcSuccessResponse | IJsonRpcErrorResponse = outcome.error
				? jsonRpcError(request.id, outcome.error.code, outcome.error.message, outcome.error.data)
				: jsonRpcSuccess(request.id, outcome.result);
			void this._sendToUpstream(reply);
		}, err => {
			if (this._disposed) {
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			this._options.logger.warn(`McpProxyRoute: upstream request handler threw for method '${method}': ${message}`);
			void this._sendToUpstream(jsonRpcError(request.id, RPC_INTERNAL_ERROR, message));
		});
	}

	private _handleUpstreamNotification(notification: IJsonRpcNotification): void {
		if (typeof notification.method !== 'string' || notification.method.length === 0) {
			this._options.logger.warn('McpProxyRoute: upstream notification was malformed');
			return;
		}
		try {
			this._options.onUpstreamNotification(notification.method, notification.params);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._options.logger.warn(`McpProxyRoute: upstream notification handler threw for method '${notification.method}': ${message}`);
		}
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
		this._pendingInitializeIds.clear();
		this._pendingToolsListIds.clear();
		this._toolUiMeta.clear();
		super.dispose();
	}
}
