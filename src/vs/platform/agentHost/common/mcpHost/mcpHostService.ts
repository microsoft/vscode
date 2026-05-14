/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IMcpServerDefinition } from '../../../agentPlugins/common/pluginParsers.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { McpMethodCallParams, McpMethodCallResult, McpNotificationParams } from '../state/protocol/commands.js';
import { AhpMcpUiHostCapabilities, McpServerSummary } from '../state/protocol/state.js';

/**
 * The MCP Apps `_meta.ui` payload carried by a `Tool` definition.
 *
 * Mirrors the
 * [MCP Apps spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).
 * The host captures these payloads opportunistically from `tools/list`
 * responses; consumers (typically a Copilot/Claude agent's tool-call
 * mapper) look them up by tool name when surfacing a tool call to AHP
 * so the resulting `ToolCallBase._meta` carries `ui` /
 * `uiHostCapabilities` for MCP-App-aware clients.
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
 * An upstream-originated `mcpMethodCall` request. The host invokes the
 * configured {@link IMcpHostUpstreamDelegate.handleUpstreamRequest} once
 * per inbound JSON-RPC request from an MCP server and writes the
 * returned outcome back as a JSON-RPC response.
 */
export interface IUpstreamMcpRequest {
	/** MCP server URI; matches {@link McpServerSummary.resource}. */
	readonly server: URI;
	/** JSON-RPC method (e.g. `sampling/createMessage`, `ui/open-link`). */
	readonly method: string;
	/** Method params; opaque to AHP. */
	readonly params?: unknown;
}

/**
 * Outcome the delegate produces for an {@link IUpstreamMcpRequest}.
 *
 * Either {@link result} or {@link error} is set. The host forwards either
 * one to the upstream MCP server as a JSON-RPC success or error response.
 */
export interface IUpstreamMcpResponse {
	readonly result?: unknown;
	readonly error?: { code: number; message: string; data?: unknown };
}

/**
 * Upstream-originated `mcpNotification` payload. Fire-and-forget; the
 * host calls {@link IMcpHostUpstreamDelegate.handleUpstreamNotification}
 * whenever the upstream MCP server publishes a JSON-RPC notification
 * (e.g. `notifications/tools/list_changed`).
 */
export interface IUpstreamMcpNotification {
	readonly server: URI;
	readonly method: string;
	readonly params?: unknown;
}

/**
 * Bridge for forwarding upstream-originated MCP traffic out to an AHP
 * client (typically wired up by `ProtocolServerHandler`). At most one
 * delegate is installed at a time; calls when none is installed yield
 * `MethodNotFound`.
 */
export interface IMcpHostUpstreamDelegate {
	handleUpstreamRequest(request: IUpstreamMcpRequest): Promise<IUpstreamMcpResponse>;
	handleUpstreamNotification(notification: IUpstreamMcpNotification): void;
}

/**
 * Per-MCP-server handle owned by {@link IMcpHostService}. Lifetime is bounded
 * by {@link IMcpHostService.setSessionServers} — once the parent session no
 * longer lists the server, the handle is disposed.
 */
export interface IMcpServerHandle extends IDisposable {
	/** The `mcp:/<sessionId>/<serverId>` URI; matches {@link McpServerSummary.resource}. */
	readonly resource: URI;

	/** Latest summary observed for this server. */
	readonly summary: IObservable<McpServerSummary>;

	/**
	 * Endpoint the upstream SDK should connect to. `undefined` until the
	 * proxy is up.
	 */
	readonly endpoint: IObservable<URI | undefined>;

	/**
	 * Push a bearer token. Returns `true` when accepted by the upstream;
	 * `false` when the resource doesn't match this server.
	 */
	authenticate(resource: string, token: string): Promise<boolean>;

	/**
	 * Forward an AHP-client → MCP server JSON-RPC **request** and resolve
	 * with the upstream's result. Rejects with a `ProtocolError` if the
	 * upstream returns a JSON-RPC error.
	 */
	callMethod(params: McpMethodCallParams): Promise<McpMethodCallResult>;

	/**
	 * Forward an AHP-client → MCP server JSON-RPC **notification**.
	 * Fire-and-forget.
	 */
	notify(params: McpNotificationParams): void;

	/**
	 * Most recent `_meta.ui` payload the upstream MCP server advertised
	 * for `toolName` via `tools/list`. Returns `undefined` when no
	 * MCP-Apps-enabled tool with that name has been observed (for
	 * example, before the SDK has listed tools, or for non-app tools).
	 *
	 * Captured opportunistically as `tools/list` responses flow through
	 * the proxy from either the upstream SDK or AHP-client
	 * `mcpMethodCall` traffic.
	 */
	getToolUiMeta(toolName: string): IMcpUiToolMeta | undefined;

	/**
	 * The MCP-Apps host-capability set the AHP host satisfies for a View
	 * backed by this server, derived from the upstream's `initialize`
	 * response. Producers attach this to `_meta.uiHostCapabilities` on
	 * every tool-call state surfacing an MCP App so consumers can
	 * forward the same set into the view's `ui/initialize` response.
	 *
	 * Empty until the SDK's `initialize` handshake has completed through
	 * the proxy.
	 */
	getUiHostCapabilities(): AhpMcpUiHostCapabilities;
}

/**
 * Owns per-(session, MCP server) state and bridges AHP traffic to the
 * underlying MCP transports. Platform-agnostic; the node-only proxy
 * mechanics live in `IMcpProxyFactory`.
 */
export interface IMcpHostService {
	readonly _serviceBrand: undefined;

	/**
	 * Replace the set of MCP servers registered for `session`. Diffing against
	 * the previous set, the service dispatches `session/mcpServerAdded` and
	 * `session/mcpServerRemoved` actions through the state manager.
	 */
	setSessionServers(session: URI, servers: readonly IMcpServerDefinition[]): readonly IMcpServerHandle[];

	/** Return the current lightweight summaries for all MCP servers in `session`. */
	getServerSummaries(session: URI): readonly McpServerSummary[];

	/** Look up a handle by its resource URI. */
	getServer(resource: URI): IMcpServerHandle | undefined;

	/**
	 * Pure router for client `mcpMethodCall` requests. Resolves the handle
	 * from `params.server` and forwards. Used by `ProtocolServerHandler`.
	 */
	callMethod(params: McpMethodCallParams): Promise<McpMethodCallResult>;

	/**
	 * Pure router for client `mcpNotification` notifications.
	 */
	notify(params: McpNotificationParams): void;

	/**
	 * Install a delegate for upstream-originated traffic (the only direction
	 * the host service cannot satisfy locally). The disposable removes the
	 * delegate, after which upstream requests fail with `MethodNotFound`.
	 */
	setUpstreamDelegate(delegate: IMcpHostUpstreamDelegate): IDisposable;
}

export const IMcpHostService = createDecorator<IMcpHostService>('mcpHostService');


