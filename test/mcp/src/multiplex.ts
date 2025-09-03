/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Server, ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Implementation, ListToolsRequestSchema, CallToolRequestSchema, ListToolsResult, Tool, CallToolResult, McpError, ErrorCode, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { getServer as getAutomationServer } from './automation';
import { getServer as getPlaywrightServer } from './playwright';
import { ApplicationService } from './application';
import { createInMemoryTransportPair } from './inMemoryTransport';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Application } from '../../automation';

interface SubServer {
	client: Client;
	prefix: string;
}

export async function getServer(): Promise<Server> {
	const appService = new ApplicationService();
	const automationServer = await getAutomationServer(appService);
	const [automationServerTransport, automationClientTransport] = createInMemoryTransportPair();
	const automationClient = new Client({ name: 'Automation Client', version: '1.0.0' });
	await automationServer.connect(automationServerTransport);
	await automationClient.connect(automationClientTransport);

	const multiplexServer = new MultiplexServer(
		[{ client: automationClient, prefix: 'vscode_automation_' }],
		{
			name: 'VS Code Automation + Playwright Server',
			version: '1.0.0',
			title: 'Contains tools that can interact with a local build of VS Code. Used for verifying UI behavior.'
		}
	);

	const closables: { close(): Promise<void> }[] = [];
	const createPlaywrightServer = async (app: Application) => {
		const playwrightServer = await getPlaywrightServer(app);
		const [playwrightServerTransport, playwrightClientTransport] = createInMemoryTransportPair();
		const playwrightClient = new Client({ name: 'Playwright Client', version: '1.0.0' });
		await playwrightServer.connect(playwrightServerTransport);
		await playwrightClient.connect(playwrightClientTransport);
		await playwrightClient.notification({ method: 'notifications/initialized' });
		// Prefixes could change in the future... be careful.
		const playwrightSubServer = { client: playwrightClient, prefix: 'browser_' };
		multiplexServer.addSubServer(playwrightSubServer);
		multiplexServer.sendToolListChanged();
		closables.push(
			playwrightClient,
			playwrightServer,
			playwrightServerTransport,
			playwrightClientTransport,
			{
				async close() {
					multiplexServer.removeSubServer(playwrightSubServer);
					multiplexServer.sendToolListChanged();
				}
			}
		);
	};
	const disposePlaywrightServer = async () => {
		while (closables.length) {
			closables.pop()?.close();
		}
	};
	appService.onApplicationChange(async app => {
		if (app) {
			await createPlaywrightServer(app);
		} else {
			await disposePlaywrightServer();
		}
	});

	return multiplexServer.server;
}

/**
 * High-level MCP server that provides a simpler API for working with resources, tools, and prompts.
 * For advanced usage (like sending notifications or setting custom request handlers), use the underlying
 * Server instance available via the `server` property.
 */
export class MultiplexServer {
	/**
	 * The underlying Server instance, useful for advanced operations like sending notifications.
	 */
	public readonly server: Server;

	constructor(private readonly subServers: SubServer[], serverInfo: Implementation, options?: ServerOptions) {
		this.server = new Server(serverInfo, options);
		this.setToolRequestHandlers();
	}

	async start(): Promise<void> {
		await this.server.sendToolListChanged();
	}

	/**
	 * Attaches to the given transport, starts it, and starts listening for messages.
	 *
	 * The `server` object assumes ownership of the Transport, replacing any callbacks that have already been set, and expects that it is the only user of the Transport instance going forward.
	 */
	async connect(transport: Transport): Promise<void> {
		return await this.server.connect(transport);
	}

	/**
	 * Closes the connection.
	 */
	async close(): Promise<void> {
		await this.server.close();
	}

	private _toolHandlersInitialized = false;

	private setToolRequestHandlers() {
		if (this._toolHandlersInitialized) {
			return;
		}

		this.server.assertCanSetRequestHandler(
			ListToolsRequestSchema.shape.method.value,
		);
		this.server.assertCanSetRequestHandler(
			CallToolRequestSchema.shape.method.value,
		);

		this.server.registerCapabilities({
			tools: {
				listChanged: true
			}
		});

		this.server.setRequestHandler(
			ListToolsRequestSchema,
			async (): Promise<ListToolsResult> => {
				const tools: Tool[] = [];
				for (const subServer of this.subServers) {
					const result = await subServer.client.listTools();
					tools.push(...result.tools);
				}
				return { tools };
			},
		);

		this.server.setRequestHandler(
			CallToolRequestSchema,
			async (request, extra): Promise<CallToolResult> => {
				const toolName = request.params.name;
				for (const subServer of this.subServers) {
					if (toolName.startsWith(subServer.prefix)) {
						return await subServer.client.request(
							{
								method: 'tools/call',
								params: request.params
							},
							CallToolResultSchema
						);
					}
				}
				throw new McpError(ErrorCode.InvalidParams, `Tool with ID ${toolName} not found`);
			},
		);

		this._toolHandlersInitialized = true;
	}

	/**
	 * Checks if the server is connected to a transport.
	 * @returns True if the server is connected
	 */
	isConnected() {
		return this.server.transport !== undefined;
	}

	/**
	 * Sends a tool list changed event to the client, if connected.
	 */
	sendToolListChanged() {
		if (this.isConnected()) {
			this.server.sendToolListChanged();
		}
	}

	addSubServer(subServer: SubServer) {
		this.subServers.push(subServer);
		this.sendToolListChanged();
	}

	removeSubServer(subServer: SubServer) {
		const index = this.subServers.indexOf(subServer);
		if (index >= 0) {
			const removed = this.subServers.splice(index);
			if (removed) {
				this.sendToolListChanged();
			}
		} else {
			throw new Error('SubServer not found.');
		}
	}
}
