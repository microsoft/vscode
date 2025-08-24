/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { z, ZodRawShape, AnyZodObject, ZodTypeAny } from 'zod';
import { Server, ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Implementation, ListToolsRequestSchema, CallToolRequestSchema, ListToolsResult, Tool, CallToolResult, McpError, ErrorCode, ToolAnnotations, ServerRequest, ServerNotification, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { getServer as getAutomationServer } from './automation';
import { getServer as getPlaywrightServer } from './playwright';
import { getApplication } from './application';
import { createInMemoryTransportPair } from './inMemoryTransport';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

interface SubServer {
	client: Client;
	prefix: string;
}

export async function getServer(): Promise<Server> {
	const app = await getApplication();
	const automationServer = await getAutomationServer(app);
	const playwrightServer = await getPlaywrightServer(app);

	// Create in-memory transport pairs for internal communication
	const [automationServerTransport, automationClientTransport] = createInMemoryTransportPair();
	const [playwrightServerTransport, playwrightClientTransport] = createInMemoryTransportPair();

	const automationClient = new Client({
		name: 'Automation Client',
		version: '1.0.0'
	});
	const playwrightClient = new Client({
		name: 'Playwright Client',
		version: '1.0.0'
	});

	await automationServer.connect(automationServerTransport);
	await automationClient.connect(automationClientTransport);
	await playwrightServer.connect(playwrightServerTransport);
	await playwrightClient.connect(playwrightClientTransport);
	await playwrightClient.notification({
		method: 'notifications/initialized',
	});

	return new MultiplexServer(
		[
			// Prefixes could change in the future... be careful.
			{ client: playwrightClient, prefix: 'browser_' },
			{ client: automationClient, prefix: 'vscode_automation_' }
		],
		{
			name: 'VS Code Automation + Playwright Server',
			version: '1.0.0',
			title: 'Contains tools that can interact with a local build of VS Code. Used for verifying UI behavior.'
		}
	).server;
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
}

/**
 * Callback for a tool handler registered with Server.tool().
 *
 * Parameters will include tool arguments, if applicable, as well as other request handler context.
 *
 * The callback should return:
 * - `structuredContent` if the tool has an outputSchema defined
 * - `content` if the tool does not have an outputSchema
 * - Both fields are optional but typically one should be provided
 */
export type ToolCallback<Args extends undefined | ZodRawShape = undefined> =
	Args extends ZodRawShape
	? (
		args: z.objectOutputType<Args, ZodTypeAny>,
		extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
	) => CallToolResult | Promise<CallToolResult>
	: (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => CallToolResult | Promise<CallToolResult>;

export type RegisteredTool = {
	title?: string;
	description?: string;
	inputSchema?: AnyZodObject;
	outputSchema?: AnyZodObject;
	annotations?: ToolAnnotations;
	callback: ToolCallback<undefined | ZodRawShape>;
	enabled: boolean;
	enable(): void;
	disable(): void;
	update<InputArgs extends ZodRawShape, OutputArgs extends ZodRawShape>(
		updates: {
			name?: string | null;
			title?: string;
			description?: string;
			paramsSchema?: InputArgs;
			outputSchema?: OutputArgs;
			annotations?: ToolAnnotations;
			callback?: ToolCallback<InputArgs>;
			enabled?: boolean;
		}): void;
	remove(): void;
};
