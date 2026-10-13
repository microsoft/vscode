/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IWorkbenchMcpGatewayService = createDecorator<IWorkbenchMcpGatewayService>('IWorkbenchMcpGatewayService');

/**
 * A single server entry exposed by the gateway at the workbench layer.
 */
export interface IMcpGatewayResultServer {
	readonly label: string;
	readonly address: URI;
}

/**
 * Result of creating an MCP gateway, which is itself disposable.
 */
export interface IMcpGatewayResult extends IDisposable {
	/**
	 * The servers currently exposed by this gateway.
	 */
	readonly servers: readonly IMcpGatewayResultServer[];

	/**
	 * Event that fires when the set of servers changes.
	 */
	readonly onDidChangeServers: Event<readonly IMcpGatewayResultServer[]>;
}

/**
 * Service that manages MCP gateway HTTP endpoints in the workbench.
 *
 * The gateway provides an HTTP server that external processes can connect
 * to in order to interact with MCP servers known to the editor. The server
 * is shared among all gateways and is automatically torn down when the
 * last gateway is disposed.
 */
export interface IWorkbenchMcpGatewayService {
	readonly _serviceBrand: undefined;

	/**
	 * Creates a new MCP gateway endpoint.
	 *
	 * The gateway is assigned a secure random route ID to make the endpoint
	 * URL unguessable without authentication.
	 *
	 * @param inRemote Whether to create the gateway in the remote environment.
	 * If true, the gateway is created on the remote server (requires a remote connection).
	 * If false, the gateway is created locally (requires a local Node process, e.g., desktop).
	 * @param chatSessionResource Optional chat session resource URI to associate with this
	 * gateway. When provided, MCP tool calls made through this gateway will be associated
	 * with the chat session, enabling inline elicitation UI instead of notification fallback.
	 * @returns A promise that resolves to the gateway result if successful,
	 * or `undefined` if the requested environment is not available.
	 */
	createGateway(inRemote: boolean, chatSessionResource?: URI): Promise<IMcpGatewayResult | undefined>;
}
