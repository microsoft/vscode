/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { McpClient } from './McpClient';
import { Tool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../tools/types';
import { ToolRegistry } from './../tools/registry';

const MCP_TOOL_PREFIX = 'mcp__';

/**
 * Discover tools from connected MCP servers and register them with the
 * ToolRegistry. Each MCP tool is exposed under a namespaced name like
 * `mcp__<server>__<tool>` to avoid collisions with built-in tools.
 *
 * The MCP listTools call is best-effort — when it fails or returns an empty
 * list (e.g. no MCP servers configured), the function logs a console.warn and
 * leaves the registry untouched. The chat continues to work with built-in
 * tools only.
 */
export async function bridgeMcpToolsIntoRegistry(
	mcpClient: McpClient,
	registry: ToolRegistry,
): Promise<{ registered: number; failed: boolean; reason?: string }> {
	let listed: Awaited<ReturnType<McpClient['listTools']>>;
	try {
		listed = await mcpClient.listTools();
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		console.warn('[McpToolBridge] listTools failed:', reason);
		return { registered: 0, failed: true, reason };
	}

	if (!Array.isArray(listed) || listed.length === 0) {
		return { registered: 0, failed: false };
	}

	let registered = 0;
	for (const entry of listed) {
		try {
			const tool = createBridgedTool(mcpClient, entry);
			registry.register(tool);
			registered += 1;
		} catch (err) {
			console.warn(`[McpToolBridge] Failed to register ${entry.server}/${entry.tool}:`, err);
		}
	}
	return { registered, failed: false };
}

function createBridgedTool(
	mcpClient: McpClient,
	entry: { server: string; tool: string; description: string },
): Tool {
	const sanitisedServer = sanitiseNameSegment(entry.server);
	const sanitisedTool = sanitiseNameSegment(entry.tool);
	const namespacedName = `${MCP_TOOL_PREFIX}${sanitisedServer}__${sanitisedTool}`;

	const definition: ToolDefinition = {
		name: namespacedName,
		description: `[MCP/${entry.server}] ${entry.description ?? entry.tool}`,
		inputSchema: {
			// MCP tool input schemas aren't surfaced by the simple listTools
			// shape used here. Accept arbitrary properties; the MCP server
			// validates per-tool when callTool runs.
			type: 'object',
			properties: {},
		},
	};

	return {
		definition,
		async execute(input: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
			try {
				const result = await mcpClient.callTool({
					server: entry.server,
					tool: entry.tool,
					inputs: input,
				});
				return { content: result.content, isError: result.isError };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { content: `MCP tool '${entry.server}/${entry.tool}' failed: ${msg}`, isError: true };
			}
		},
	};
}

function sanitiseNameSegment(s: string): string {
	return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}
