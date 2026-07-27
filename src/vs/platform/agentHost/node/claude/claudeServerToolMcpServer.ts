/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import type { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { jsonSchemaToZodRawShape } from './clientTools/claudeJsonSchemaToZod.js';

/**
 * Name of the single in-process MCP server that surfaces the agent host's
 * server tools (feedback "comments" today, more in the future) to the Claude
 * SDK via `Options.mcpServers['host']`.
 *
 * Distinct from the client-tool server ({@link CLAUDE_CLIENT_MCP_SERVER_NAME})
 * because the two have opposite execution models: client tools round-trip to
 * the workbench, whereas server tools execute in-process against the session's
 * own state channels.
 */
export const CLAUDE_SERVER_TOOL_MCP_SERVER_NAME = 'host';

/**
 * Prefix the given server tool names into the SDK names the model sees
 * (`mcp__<server>__<tool>`). The Anthropic SDK prefixes every in-process MCP
 * tool with `mcp__<serverName>__`, so callers feed the result into
 * `Options.allowedTools` to auto-approve the server tools without prompting —
 * they only read or mutate the session's own server-held state and never touch
 * the workspace, shell, or network.
 *
 * Takes the names from the host (rather than a static list) so any contributed
 * server tool is auto-approved automatically.
 */
export function serverToolAllowList(toolNames: readonly string[]): string[] {
	return toolNames.map(name => `mcp__${CLAUDE_SERVER_TOOL_MCP_SERVER_NAME}__${name}`);
}

/**
 * Build the per-session in-process MCP server that surfaces the agent host's
 * server tools to the Claude SDK.
 *
 * Unlike {@link buildClientToolMcpServer}, these tools do not round-trip to
 * the workbench: each handler executes synchronously in-process via
 * {@link IAgentServerToolHost.executeTool} against the session's own state and
 * returns the textual tool result directly. A throwing host (invalid
 * arguments, unknown tool) degrades to an `isError` result rather than
 * rejecting, mirroring the client-tool server.
 *
 * Pure factory — no SDK loading beyond the injected {@link IClaudeAgentSdkService}.
 */
export async function buildServerToolMcpServer(
	host: IAgentServerToolHost,
	sessionUri: string,
	sdk: IClaudeAgentSdkService,
): Promise<McpSdkServerConfigWithInstance> {
	const tools = await Promise.all(host.definitions.map(def => sdk.tool(
		def.name,
		def.description ?? '',
		jsonSchemaToZodRawShape(def.inputSchema),
		async args => {
			try {
				const text = await host.executeTool(sessionUri, def.name, args);
				return { content: [{ type: 'text' as const, text }] };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { content: [{ type: 'text' as const, text: message }], isError: true };
			}
		}
	)));
	return sdk.createSdkMcpServer({ name: CLAUDE_SERVER_TOOL_MCP_SERVER_NAME, tools });
}
