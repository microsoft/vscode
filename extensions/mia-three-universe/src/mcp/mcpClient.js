// src/mcp/mcpClient.js — MCP client bridge for tool discovery and invocation
// Bridges MCP tools from mia-code-server into VS Code extension commands.

const vscode = require('vscode');

class MCPClientService {
	/**
	 * @param {string} serverUrl
	 * @param {import('vscode').ExtensionContext} context
	 */
	constructor(serverUrl, context) {
		this._serverUrl = serverUrl;
		this._context = context;
		this._tools = new Map();
		this._resources = new Map();
		this._registeredCommands = [];
		this._refreshInterval = null;
	}

	get mcpUrl() {
		return this._serverUrl ? `${this._serverUrl}/api/mcp` : null;
	}

	async discoverTools() {
		if (!this.mcpUrl) return [];

		try {
			const token = await this._context.secrets.get('mia.serverToken');
			const headers = { 'Content-Type': 'application/json' };
			if (token) headers['Authorization'] = `Bearer ${token}`;

			const response = await fetch(this.mcpUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/list',
					params: {},
				}),
			});

			if (!response.ok) return [];

			const result = await response.json();
			if (result.result && result.result.tools) {
				this._tools.clear();
				for (const tool of result.result.tools) {
					this._tools.set(tool.name, tool);
				}
				this._registerToolCommands();
				return result.result.tools;
			}
		} catch {
			// MCP not available — graceful degradation
		}

		return [];
	}

	async discoverResources() {
		if (!this.mcpUrl) return [];

		try {
			const token = await this._context.secrets.get('mia.serverToken');
			const headers = { 'Content-Type': 'application/json' };
			if (token) headers['Authorization'] = `Bearer ${token}`;

			const response = await fetch(this.mcpUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 2,
					method: 'resources/list',
					params: {},
				}),
			});

			if (!response.ok) return [];

			const result = await response.json();
			if (result.result && result.result.resources) {
				this._resources.clear();
				for (const resource of result.result.resources) {
					this._resources.set(resource.uri, resource);
				}
				return result.result.resources;
			}
		} catch {
			// MCP resources not available
		}

		return [];
	}

	async invokeTool(toolName, params) {
		if (!this.mcpUrl) {
			throw new Error('MCP not available — no server URL configured');
		}

		const token = await this._context.secrets.get('mia.serverToken');
		const headers = { 'Content-Type': 'application/json' };
		if (token) headers['Authorization'] = `Bearer ${token}`;

		const response = await fetch(this.mcpUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: Date.now(),
				method: 'tools/call',
				params: {
					name: toolName,
					arguments: params,
				},
			}),
		});

		if (!response.ok) {
			throw new Error(`MCP call failed: HTTP ${response.status}`);
		}

		const result = await response.json();
		if (result.error) {
			throw new Error(`MCP error: ${result.error.message}`);
		}

		return result.result;
	}

	async readResource(uri) {
		if (!this.mcpUrl) {
			throw new Error('MCP not available');
		}

		const token = await this._context.secrets.get('mia.serverToken');
		const headers = { 'Content-Type': 'application/json' };
		if (token) headers['Authorization'] = `Bearer ${token}`;

		const response = await fetch(this.mcpUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: Date.now(),
				method: 'resources/read',
				params: { uri },
			}),
		});

		if (!response.ok) {
			throw new Error(`MCP resource read failed: HTTP ${response.status}`);
		}

		const result = await response.json();
		return result.result;
	}

	_registerToolCommands() {
		// Dispose old registrations
		for (const disposable of this._registeredCommands) {
			disposable.dispose();
		}
		this._registeredCommands = [];

		for (const [name, tool] of this._tools) {
			const commandId = `mia.mcp.${name}`;
			const disposable = vscode.commands.registerCommand(commandId, async () => {
				// Gather parameters from user via input boxes
				const params = {};
				if (tool.inputSchema && tool.inputSchema.properties) {
					for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
						const value = await vscode.window.showInputBox({
							prompt: `${key}: ${schema.description || ''}`,
							placeHolder: schema.type || 'value',
						});
						if (value === undefined) return; // cancelled
						params[key] = value;
					}
				}

				try {
					const result = await this.invokeTool(name, params);
					// Show result in output channel
					const channel = vscode.window.createOutputChannel(`Mia MCP: ${name}`);
					channel.appendLine(JSON.stringify(result, null, 2));
					channel.show();
				} catch (err) {
					vscode.window.showErrorMessage(`MCP tool ${name} failed: ${err.message}`);
				}
			});
			this._registeredCommands.push(disposable);
		}
	}

	startPeriodicRefresh(intervalMs = 300000) {
		this.stopPeriodicRefresh();
		this._refreshInterval = setInterval(() => {
			this.discoverTools();
			this.discoverResources();
		}, intervalMs);
	}

	stopPeriodicRefresh() {
		if (this._refreshInterval) {
			clearInterval(this._refreshInterval);
			this._refreshInterval = null;
		}
	}

	getAvailableTools() {
		return Array.from(this._tools.values());
	}

	getAvailableResources() {
		return Array.from(this._resources.values());
	}
}

module.exports = { MCPClientService };
