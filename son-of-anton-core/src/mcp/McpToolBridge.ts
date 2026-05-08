/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { Disposable } from '../host';
import { McpClient, McpToolListing } from './McpClient';
import { Tool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../tools/types';
import { ToolRegistry } from '../tools/registry';

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

/**
 * Subscribe the registry to live MCP tool updates. Whenever the McpClient
 * reconciles its connection set (servers added/removed/modified through the
 * settings UI), this listener:
 *
 * 1. Unregisters every previously-bridged MCP tool name from the registry.
 * 2. Re-registers the latest set under the same `mcp__<server>__<tool>`
 *    namespace.
 *
 * Returns a `Disposable` that unsubscribes from the event. Bridged tool
 * names are tracked in a closure-local set so we never accidentally
 * unregister a built-in tool (anything outside the `mcp__` prefix is
 * untouched, but this gives us an extra defence-in-depth).
 */
export function subscribeMcpToolBridge(
	mcpClient: McpClient,
	registry: ToolRegistry,
): Disposable {
	const registeredNames = new Set<string>();

	// Re-hydrate the set from a fresh listTools() call so we know which names
	// the initial bridge run registered. Fire-and-forget — if the call fails
	// the set stays empty and the first onDidChangeTools event will populate
	// it from scratch.
	void (async () => {
		try {
			const initial = await mcpClient.listTools();
			for (const entry of initial) {
				registeredNames.add(toolNameFor(entry));
			}
		} catch {
			// Best-effort; an empty set just means the first reconcile will
			// register everything from scratch.
		}
	})();

	const subscription = mcpClient.onDidChangeTools(listing => {
		// Drop everything we previously registered so renamed servers don't
		// leave stale tool entries behind.
		for (const name of registeredNames) {
			registry.unregister(name);
		}
		registeredNames.clear();

		for (const entry of listing) {
			try {
				const tool = createBridgedTool(mcpClient, entry);
				registry.register(tool);
				registeredNames.add(tool.definition.name);
			} catch (err) {
				console.warn(`[McpToolBridge] Failed to register ${entry.server}/${entry.tool} on reconcile:`, err);
			}
		}
	});

	return subscription;
}

function toolNameFor(entry: McpToolListing): string {
	return `${MCP_TOOL_PREFIX}${sanitiseNameSegment(entry.server)}__${sanitiseNameSegment(entry.tool)}`;
}

function createBridgedTool(
	mcpClient: McpClient,
	entry: McpToolListing,
): Tool {
	const namespacedName = toolNameFor(entry);

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
		// MCP tools land in the `'mcp'` auto-approval category so users can opt
		// every external server in/out wholesale via `sota.autoApprove.mcp`.
		// Per-server toggles live in the MCP sub-tab separately.
		category: 'mcp',
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
