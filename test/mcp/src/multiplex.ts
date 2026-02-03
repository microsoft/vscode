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
import { opts } from './options';

interface SubServerConfig {
	subServer: Client;
	excludeTools?: string[];
}

export async function getServer(): Promise<Server> {
	const appService = new ApplicationService();
	const automationServer = await getAutomationServer(appService);
	const [automationServerTransport, automationClientTransport] = createInMemoryTransportPair();
	const automationClient = new Client({ name: 'Automation Client', version: '1.0.0' });
	await automationServer.connect(automationServerTransport);
	await automationClient.connect(automationClientTransport);

	const multiplexServer = new MultiplexServer(
		[{ subServer: automationClient }],
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

		// Add subserver with optional tool exclusions
		multiplexServer.addSubServer({
			subServer: playwrightClient,
			excludeTools: [
				// Playwright MCP doesn't properly support Electron's multi-window model.
				// It uses browserContext.pages() which doesn't track Electron windows correctly.
				// We provide vscode_automation_window_* alternatives that use ElectronApplication.windows().

				// Navigation not needed - VS Code opens its own windows
				'browser_navigate',
				'browser_navigate_back',
				'browser_tabs',

				// Page interaction tools - replaced by vscode_automation_window_*
				'browser_click',          // → vscode_automation_window_click
				'browser_type',           // → vscode_automation_window_type
				'browser_hover',          // → vscode_automation_window_hover
				'browser_drag',           // → vscode_automation_window_drag
				'browser_select_option',  // → vscode_automation_window_select_option
				'browser_fill_form',      // → vscode_automation_window_fill_form
				'browser_press_key',      // → vscode_automation_window_press_key

				// Mouse operations - replaced by vscode_automation_window_mouse_*
				'browser_mouse_move_xy',  // → vscode_automation_window_mouse_move
				'browser_mouse_click_xy', // → vscode_automation_window_mouse_click
				'browser_mouse_drag_xy',  // → vscode_automation_window_mouse_drag

				// Content capture - replaced by vscode_automation_window_*
				'browser_snapshot',         // → vscode_automation_window_snapshot
				'browser_take_screenshot',  // → vscode_automation_window_screenshot
				'browser_evaluate',         // → vscode_automation_window_evaluate

				// Console/debugging - replaced by vscode_automation_window_*
				'browser_console_messages', // → vscode_automation_window_console_messages

				// Wait/timing - replaced by vscode_automation_window_*
				'browser_wait_for',         // → vscode_automation_window_wait_for_text / wait_for_time

				// Verification - replaced by vscode_automation_window_*
				'browser_verify_element_visible', // → vscode_automation_window_verify_element_visible
				'browser_verify_text_visible',    // → vscode_automation_window_verify_text_visible
				'browser_verify_list_visible',    // (no direct replacement - use multiple verify_text_visible)
				'browser_verify_value',           // → vscode_automation_window_get_input_value

				// Other page-dependent tools (not typically needed for VS Code testing)
				'browser_close',
				'browser_resize',
				'browser_network_requests',
				'browser_file_upload',
				'browser_handle_dialog',
				'browser_pdf_save',
				'browser_generate_locator'
			]
		});
		multiplexServer.sendToolListChanged();
		closables.push(
			playwrightClient,
			playwrightServer,
			playwrightServerTransport,
			playwrightClientTransport,
			{
				async close() {
					multiplexServer.removeSubServer(playwrightClient);
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

	if (opts.autostart) {
		await appService.getOrCreateApplication();
	}
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
	readonly server: Server;

	private readonly _subServerToToolSet = new Map<Client, Set<string>>();
	private readonly _subServerToExcludedTools = new Map<Client, Set<string>>();
	private readonly _subServers: Client[];

	constructor(subServerConfigs: SubServerConfig[], serverInfo: Implementation, options?: ServerOptions) {
		this.server = new Server(serverInfo, options);
		this._subServers = [];

		// Process configurations and set up subservers
		for (const config of subServerConfigs) {
			this._subServers.push(config.subServer);
			if (config.excludeTools && config.excludeTools.length > 0) {
				this._subServerToExcludedTools.set(config.subServer, new Set(config.excludeTools));
			}
		}

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
				for (const subServer of this._subServers) {
					const result = await subServer.listTools();
					const allToolNames = new Set(result.tools.map(t => t.name));
					const excludedForThisServer = this._subServerToExcludedTools.get(subServer) || new Set();
					const filteredTools = result.tools.filter(tool => !excludedForThisServer.has(tool.name));
					this._subServerToToolSet.set(subServer, allToolNames);
					tools.push(...filteredTools);
				}
				return { tools };
			},
		);

		this.server.setRequestHandler(
			CallToolRequestSchema,
			async (request, extra): Promise<CallToolResult> => {
				const toolName = request.params.name;
				for (const subServer of this._subServers) {
					const toolSet = this._subServerToToolSet.get(subServer);
					const excludedForThisServer = this._subServerToExcludedTools.get(subServer) || new Set();
					if (toolSet?.has(toolName)) {
						// Check if tool is excluded for this specific subserver
						if (excludedForThisServer.has(toolName)) {
							throw new McpError(ErrorCode.InvalidParams, `Tool with ID ${toolName} is excluded`);
						}
						return await subServer.request(
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

	addSubServer(config: SubServerConfig) {
		this._subServers.push(config.subServer);
		if (config.excludeTools && config.excludeTools.length > 0) {
			this._subServerToExcludedTools.set(config.subServer, new Set(config.excludeTools));
		}
		this.sendToolListChanged();
	}

	removeSubServer(subServer: Client) {
		const index = this._subServers.indexOf(subServer);
		if (index >= 0) {
			const removed = this._subServers.splice(index, 1);
			if (removed.length > 0) {
				// Clean up excluded tools mapping
				this._subServerToExcludedTools.delete(subServer);
				this.sendToolListChanged();
			}
		} else {
			throw new Error('SubServer not found.');
		}
	}
}
