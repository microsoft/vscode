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

export interface IMcpGatewayToolInvoker {
	readonly onDidChangeTools: Event<void>;
	listTools(): Promise<readonly MCP.Tool[]>;
	callTool(name: string, args: Record<string, unknown>): Promise<MCP.CallToolResult>;
}

/**
 * Result of creating an MCP gateway.
 */
export interface IMcpGatewayInfo {
	/**
	 * The address of the HTTP endpoint for this gateway.
	 */
	readonly address: URI;

	/**
	 * The unique identifier for this gateway, used for disposal.
	 */
	readonly gatewayId: string;
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
