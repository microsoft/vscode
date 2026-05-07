/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IMcpServerDefinition } from '../../../agentPlugins/common/pluginParsers.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ClientCapabilities, McpMessageParams, McpMessageResult, ServerMcpCapabilities } from '../state/protocol/commands.js';
import { McpRpcCallResponse, McpServerSummary } from '../state/protocol/state.js';

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
	 * proxy is up. Phase 4 populates this; Phase 2 always returns `undefined`
	 * (null impl).
	 */
	readonly endpoint: IObservable<URI | undefined>;

	/**
	 * Push a bearer token. Returns `true` when accepted by the upstream;
	 * `false` when the resource doesn't match this server.
	 */
	authenticate(resource: string, token: string): Promise<boolean>;

	/**
	 * Forward a client → MCP server JSON-RPC message. The host service gates
	 * `ui/*` methods by client capabilities and refuses provider-disallowed
	 * methods. Notifications resolve immediately.
	 */
	sendMessage(params: McpMessageParams, client: IMcpClientContext): Promise<McpMessageResult>;

	/**
	 * Forward a client's response to an earlier upstream → client request,
	 * then emit `mcp/messageRemoved` after the response has been written to
	 * the upstream transport.
	 */
	deliverResponse(messageId: string, response: McpRpcCallResponse): void;
}

/**
 * Subset of the originating client's identity captured at request time.
 * Carries the client's advertised capabilities so the host service can gate
 * MCP-Apps-only methods.
 */
export interface IMcpClientContext {
	readonly clientId: string;
	readonly capabilities: ClientCapabilities | undefined;
}

/**
 * Owns per-(session, MCP server) state and bridges AHP traffic to the
 * underlying MCP transports (via Phase 3's `IMcpProxy`). Platform-agnostic;
 * the node-only proxy mechanics live in `IMcpProxyFactory`.
 */
export interface IMcpHostService {
	readonly _serviceBrand: undefined;

	/**
	 * Capabilities the host advertises in `InitializeResult.capabilities.mcp`.
	 * The null implementation returns an empty object (no MCP support).
	 */
	readonly serverCapabilities: ServerMcpCapabilities;

	/**
	 * Replace the set of MCP servers registered for `session`. Diffing against
	 * the previous set, the service dispatches `mcp/serverAdded` and
	 * `mcp/serverRemoved` actions through the state manager.
	 */
	setSessionServers(session: URI, servers: readonly IMcpServerDefinition[]): readonly IMcpServerHandle[];

	/** Look up a handle by its resource URI. */
	getServer(resource: URI): IMcpServerHandle | undefined;

	/**
	 * Pure router for client `mcpMessage` calls. Resolves the handle from
	 * `params.server` and forwards. Used by `ProtocolServerHandler`.
	 */
	sendMessage(params: McpMessageParams, client: IMcpClientContext): Promise<McpMessageResult>;

	/**
	 * Notify the host that a client has dispatched `mcp/messageResponded` —
	 * forwarded onto the upstream transport.
	 */
	deliverResponse(mcpServer: URI, messageId: string, response: McpRpcCallResponse): void;
}

export const IMcpHostService = createDecorator<IMcpHostService>('mcpHostService');
