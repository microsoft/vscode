/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { MCP } from './modelContextProtocol.js';

export const IMcpGatewayService = createDecorator<IMcpGatewayService>('IMcpGatewayService');

export const McpGatewayChannelName = 'mcpGateway';
export const McpGatewayToolBrokerChannelName = 'mcpGatewayToolBroker';

/**
 * Descriptor for an MCP server known to the gateway.
 */
export interface IMcpGatewayServerDescriptor {
	readonly id: string;
	readonly label: string;
}

/**
 * A single server entry exposed by the gateway.
 */
export interface IMcpGatewayServerInfo {
	readonly label: string;
	readonly address: URI;
}

/**
 * Per-server tool invoker used by a single gateway route/session.
 * All methods operate on the specific server this invoker is bound to.
 */
export interface IMcpGatewaySingleServerInvoker {
	readonly onDidChangeTools: Event<void>;
	readonly onDidChangeResources: Event<void>;
	listTools(): Promise<readonly MCP.Tool[]>;
	callTool(name: string, args: Record<string, unknown>): Promise<MCP.CallToolResult>;
	listResources(): Promise<readonly MCP.Resource[]>;
	readResource(uri: string): Promise<MCP.ReadResourceResult>;
	listResourceTemplates(): Promise<readonly MCP.ResourceTemplate[]>;
}

/**
 * Aggregating tool invoker that provides per-server operations and
 * server lifecycle tracking. Used by the gateway service to create
 * and manage per-server routes.
 */
export interface IMcpGatewayToolInvoker {
	readonly onDidChangeServers: Event<readonly IMcpGatewayServerDescriptor[]>;
	readonly onDidChangeTools: Event<void>;
	readonly onDidChangeResources: Event<void>;
	listServers(): readonly IMcpGatewayServerDescriptor[];
	listToolsForServer(serverId: string): Promise<readonly MCP.Tool[]>;
	callToolForServer(serverId: string, name: string, args: Record<string, unknown>): Promise<MCP.CallToolResult>;
	listResourcesForServer(serverId: string): Promise<readonly MCP.Resource[]>;
	readResourceForServer(serverId: string, uri: string): Promise<MCP.ReadResourceResult>;
	listResourceTemplatesForServer(serverId: string): Promise<readonly MCP.ResourceTemplate[]>;
}

/**
 * Serializable result of creating an MCP gateway (safe for IPC).
 */
export interface IMcpGatewayDto {
	/**
	 * The servers currently exposed by this gateway.
	 */
	readonly servers: readonly IMcpGatewayServerInfo[];

	/**
	 * The unique identifier for this gateway, used for disposal.
	 */
	readonly gatewayId: string;
}

/**
 * Result of creating an MCP gateway (in-process, includes event).
 */
export interface IMcpGatewayInfo extends IMcpGatewayDto {
	/**
	 * Event that fires when the set of servers changes.
	 */
	readonly onDidChangeServers: Event<readonly IMcpGatewayServerInfo[]>;
}

/**
 * Service that manages MCP gateway HTTP endpoints in the main process (or remote server).
 *
 * The gateway provides an HTTP server that external processes can connect
 * to in order to interact with MCP servers known to the editor. The server
 * is shared among all gateways and is automatically torn down when the
 * last gateway is disposed.
 */
export interface IMcpGatewayService {
	readonly _serviceBrand: undefined;

	/**
	 * Disposes all gateways associated with a given client context (e.g., client ID or connection).
	 * @param context The client context whose gateways should be disposed.
	 * @return A disposable that can be used to unregister the client context from future cleanup (e.g., if the context is reused).
	 */
	disposeGatewaysForClient<TContext>(context: TContext): void;

	/**
	 * Creates a new MCP gateway endpoint.
	 *
	 * The gateway is assigned a secure random route ID to make the endpoint
	 * URL unguessable without authentication.
	 *
	 * @param context Optional context (e.g., client ID) to associate with the gateway for cleanup purposes.
	 * @returns A promise that resolves to the gateway info if successful.
	 */
	createGateway<TContext>(context: TContext, toolInvoker?: IMcpGatewayToolInvoker): Promise<IMcpGatewayInfo>;

	/**
	 * Disposes a previously created gateway.
	 *
	 * When the last gateway is disposed, the underlying HTTP server is shut down.
	 *
	 * @param gatewayId The unique identifier of the gateway to dispose.
	 */
	disposeGateway(gatewayId: string): Promise<void>;
}
