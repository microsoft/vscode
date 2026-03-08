/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export interface McpToolCall {
	server: string;
	tool: string;
	inputs: Record<string, unknown>;
}

export interface McpToolResult {
	content: string;
	isError: boolean;
	latencyMs: number;
}

/**
 * Client for communicating with MCP servers.
 * Phase 1 stub — will be connected to the son-of-anton-mcp servers.
 */
export class McpClient {
	/**
	 * Call a tool on an MCP server.
	 * Currently a stub that returns a placeholder response.
	 */
	async callTool(call: McpToolCall): Promise<McpToolResult> {
		const start = Date.now();
		// Stub: will be replaced with actual MCP protocol communication
		vscode.window.showInformationMessage(
			`MCP call: ${call.server}/${call.tool} (stub — not yet connected)`
		);
		return {
			content: `Stub response for ${call.server}/${call.tool}`,
			isError: false,
			latencyMs: Date.now() - start,
		};
	}

	/**
	 * List available tools from all connected MCP servers.
	 */
	async listTools(): Promise<{ server: string; tool: string; description: string }[]> {
		// Stub: will enumerate tools from connected MCP servers
		return [];
	}
}
