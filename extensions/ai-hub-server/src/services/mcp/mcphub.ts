/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { McpServer, McpConnection, McpTool, McpResource } from "./types";
import { McpSettingsSchema } from "./schemas";
import { z } from "zod";

export class McpHub {
	private connections: McpConnection[] = [];
	private readonly clientVersion = "1.0.0";

	private readonly toolCallResultSchema = z.object({
		content: z.array(z.object({
			type: z.string(),
			text: z.string().optional(),
			data: z.any().optional()
		})).optional(),
		isError: z.boolean().optional()
	});

	private readonly resourceReadResultSchema = z.object({
		contents: z.array(z.object({
			uri: z.string(),
			mimeType: z.string().optional(),
			text: z.string().optional(),
			blob: z.string().optional()
		}))
	});

	private readonly toolsListResultSchema = z.object({
		tools: z.array(z.object({
			name: z.string(),
			description: z.string().optional(),
			inputSchema: z.object({}).passthrough().optional()
		}))
	});

	private readonly resourcesListResultSchema = z.object({
		resources: z.array(z.object({
			uri: z.string(),
			name: z.string().optional(),
			description: z.string().optional(),
			mimeType: z.string().optional()
		}))
	});

	constructor(private readonly context: vscode.ExtensionContext) { }

	async initialize(): Promise<void> {
		console.log("Initializing MCP Hub...");

		try {
			await this.ensureStorageFolderExists();
			const settings = await this.readMcpSettings();
			if (!settings) {
				console.log("No MCP settings found, creating default settings file");
				await this.createDefaultSettings();
				return;
			}

			for (const [serverName, serverConfig] of Object.entries(settings.mcpServers)) {
				const config = serverConfig as any;
				if (!config.disabled) {
					try {
						await this.connectToServer(serverName, config);
						console.log(`Connected to MCP server: ${serverName}`);
					} catch (error) {
						console.error(`Failed to connect to MCP server ${serverName}:`, error);
					}
				}
			}
		} catch (error) {
			console.error("Error initializing MCP Hub:", error);
			vscode.window.showErrorMessage(`Failed to initialize MCP Hub: ${error}`);
		}
	}

	private async ensureStorageFolderExists(): Promise<void> {
		const folderPath = this.context.globalStorageUri.fsPath;
		await fs.mkdir(folderPath, { recursive: true });
	}

	private getMcpSettingsPath(): string {
		const globalStorageUri = this.context.globalStorageUri;
		return path.join(globalStorageUri.fsPath, "mcpSettings.json");
	}

	private async createDefaultSettings(): Promise<void> {
		await this.ensureStorageFolderExists();
		const defaultSettings = {
			mcpServers: {
				"example-server": {
					type: "stdio",
					command: "node",
					args: ["path/to/your/mcp-server.js"],
					disabled: true
				}
			}
		};

		const settingsPath = this.getMcpSettingsPath();
		await fs.writeFile(settingsPath, JSON.stringify(defaultSettings, null, 2));

		vscode.window.showInformationMessage(
			"MCP settings file created at: " + settingsPath,
			"Open Settings"
		).then(selection => {
			if (selection === "Open Settings") {
				vscode.window.showTextDocument(vscode.Uri.file(settingsPath));
			}
		});
	}

	private async readMcpSettings(): Promise<any> {
		try {
			const settingsPath = this.getMcpSettingsPath();
			const content = await fs.readFile(settingsPath, "utf-8");
			const config = JSON.parse(content);

			const result = McpSettingsSchema.safeParse(config);
			if (!result.success) {
				console.error("Invalid MCP settings schema:", result.error);
				return null;
			}

			return result.data;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return null;
			}
			throw error;
		}
	}

	async getServers(): Promise<McpServer[]> {
		return this.connections.map(conn => conn.server);
	}

	async callTool(serverName: string, toolName: string, args: any): Promise<any> {
		const connection = this.connections.find(conn => conn.server.name === serverName);
		if (!connection) throw new Error(`No connection found for server: ${serverName}`);

		try {
			const response = await connection.client.request({
				method: "tools/call",
				params: { name: toolName, arguments: args }
			}, this.toolCallResultSchema);

			return response;
		} catch (error) {
			console.error(`Error calling tool ${toolName} on server ${serverName}:`, error);
			throw error;
		}
	}

	async readResource(serverName: string, uri: string): Promise<any> {
		const connection = this.connections.find(conn => conn.server.name === serverName);
		if (!connection) throw new Error(`No connection found for server: ${serverName}`);

		try {
			const response = await connection.client.request({
				method: "resources/read",
				params: { uri: uri }
			}, this.resourceReadResultSchema);

			return response;
		} catch (error) {
			console.error(`Error reading resource ${uri} from server ${serverName}:`, error);
			throw error;
		}
	}

	private async connectToServer(name: string, config: any): Promise<void> {
		this.connections = this.connections.filter(conn => conn.server.name !== name);

		const client = new Client(
			{ name: "AI-Chatbot", version: this.clientVersion },
			{ capabilities: {} }
		);

		let transport;

		switch (config.type) {
			case "stdio":
				transport = new StdioClientTransport({
					command: config.command,
					args: config.args || [],
					env: config.env || {},
					stderr: "inherit"
				});
				await (transport as StdioClientTransport).start();
				break;

			case "sse":
				transport = new SSEClientTransport(new URL(config.url));
				break;

			default:
				throw new Error(`Unknown transport type: ${config.type}`);
		}

		const connection: McpConnection = {
			server: {
				name,
				config: JSON.stringify(config),
				status: "connecting",
				disabled: config.disabled || false,
				tools: [],
				resources: []
			},
			client,
			transport
		};

		this.connections.push(connection);

		try {
			await client.connect(transport);
			connection.server.status = "connected";
			connection.server.tools = await this.fetchToolsList(name);
			connection.server.resources = await this.fetchResourcesList(name);
			console.log(`Successfully connected to MCP server: ${name}`);
		} catch (error) {
			connection.server.status = "error";
			connection.server.error = error instanceof Error ? error.message : String(error);
			console.error(`Failed to connect to MCP server ${name}:`, error);
			throw error;
		}
	}

	private async fetchToolsList(serverName: string): Promise<McpTool[]> {
		const connection = this.connections.find(conn => conn.server.name === serverName);
		if (!connection) return [];

		try {
			const response = await connection.client.request({ method: "tools/list" }, this.toolsListResultSchema);
			return (response.tools || []).map(tool => ({
				name: tool.name,
				description: tool.description || "",
				inputSchema: tool.inputSchema
			}));
		} catch (error) {
			console.error(`Failed to fetch tools for ${serverName}:`, error);
			return [];
		}
	}

	private async fetchResourcesList(serverName: string): Promise<McpResource[]> {
		const connection = this.connections.find(conn => conn.server.name === serverName);
		if (!connection) return [];

		try {
			const response = await connection.client.request({ method: "resources/list" }, this.resourcesListResultSchema);
			return (response.resources || []).map(resource => ({
				uri: resource.uri,
				name: resource.name || "",
				description: resource.description || "",
				mimeType: resource.mimeType
			}));
		} catch (error) {
			console.error(`Failed to fetch resources for ${serverName}:`, error);
			return [];
		}
	}

	dispose(): void {
		for (const connection of this.connections) {
			try {
				connection.transport.close?.();
			} catch (error) {
				console.error("Error closing transport:", error);
			}
		}
		this.connections = [];
	}
}
