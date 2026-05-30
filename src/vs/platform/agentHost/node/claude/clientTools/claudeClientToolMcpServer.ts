/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '../../../common/state/protocol/state.js';
import type { IClaudeAgentSdkService } from '../claudeAgentSdkService.js';
import { jsonSchemaToZodRawShape } from './claudeJsonSchemaToZod.js';

/**
 * Anthropic SDK contract: the in-process MCP `tool()` handler receives a
 * `RequestHandlerExtra` whose `_meta` carries the originating
 * `tool_use_id` under this namespaced key. Verified empirically against
 * `@anthropic-ai/claude-agent-sdk@0.2.128`. If a future SDK version drops
 * or renames this field, the handler returns an error result instead of
 * silently deadlocking — see {@link extractToolUseId}.
 */
const TOOL_USE_ID_META_KEY = 'claudecode/toolUseId';

/**
 * Build the per-session in-process MCP server that surfaces the workbench
 * client's {@link ToolDefinition}s to the Claude SDK via
 * `Options.mcpServers['client']`.
 *
 * Each tool's handler reads the originating `tool_use_id` from the SDK's
 * `extra._meta["claudecode/toolUseId"]` and delegates to `awaitResult`,
 * which is expected to return a promise that settles when the workbench
 * echoes a completion (typically via a parked deferred owned by the
 * session). Keeping that plumbing behind a callback lets this factory
 * stay ignorant of how the host tracks in-flight tool calls.
 *
 * Pure factory — no SDK loading, no I/O.
 */
export async function buildClientToolMcpServer(
	snapshot: readonly ToolDefinition[],
	awaitResult: (toolUseId: string) => Promise<CallToolResult>,
	sdk: IClaudeAgentSdkService
): Promise<McpSdkServerConfigWithInstance> {
	const tools = await Promise.all(snapshot.map(def => sdk.tool(
		def.name,
		def.description ?? '',
		jsonSchemaToZodRawShape(def.inputSchema),
		async (_args, extra) => {
			const toolUseId = extractToolUseId(extra);
			if (toolUseId === undefined) {
				return {
					content: [{
						type: 'text',
						text: `Client tool "${def.name}" could not run: SDK omitted tool_use_id (expected at extra._meta["${TOOL_USE_ID_META_KEY}"]).`,
					}],
					isError: true,
				};
			}
			return awaitResult(toolUseId);
		}
	)));
	return sdk.createSdkMcpServer({ name: CLAUDE_CLIENT_MCP_SERVER_NAME, tools });
}

/**
 * Recover the SDK-supplied `tool_use_id` from the MCP `tool()` handler's
 * `extra` argument. Returns `undefined` (and the handler degrades to an
 * error result) if the SDK ever drops the meta field — preferable to
 * deadlocking the call.
 */
export function extractToolUseId(extra: unknown): string | undefined {
	if (!extra || typeof extra !== 'object') {
		return undefined;
	}
	const meta = (extra as { _meta?: unknown })._meta;
	if (!meta || typeof meta !== 'object') {
		return undefined;
	}
	const value = (meta as Record<string, unknown>)[TOOL_USE_ID_META_KEY];
	return typeof value === 'string' ? value : undefined;
}

/**
 * Name of the single in-process MCP server we register client tools on.
 * Exported so the stream mapper can strip the SDK's `mcp__<server>__` name
 * prefix before stamping `SessionToolCallStart.toolClientId`.
 */
export const CLAUDE_CLIENT_MCP_SERVER_NAME = 'client';

/**
 * Per the Anthropic SDK's MCP server naming convention, an in-process MCP
 * server registered as `Options.mcpServers[<serverName>]` surfaces its
 * tools to the model with names of the form `mcp__<serverName>__<toolName>`.
 * The stream mapper must strip the prefix before the workbench (which
 * registered tools by their unprefixed `ToolDefinition.name`) can
 * recognize them as client tools.
 *
 * Returns the input unchanged when it doesn't carry the prefix (SDK-owned
 * tools, subagent spawn tools, etc.) so non-client-tool calls flow
 * through without interference.
 */
export function stripClientToolNamePrefix(toolName: string): string {
	const prefix = `mcp__${CLAUDE_CLIENT_MCP_SERVER_NAME}__`;
	return toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName;
}

/**
 * Whether the SDK-emitted tool name carries the in-process MCP server
 * prefix, i.e. the tool is one of the workbench's client-provided tools.
 * Used by the stream mapper to set `SessionToolCallStart.toolClientId` so
 * the workbench takes the client-tool invocation branch.
 */
export function hasClientToolNamePrefix(toolName: string): boolean {
	return toolName.startsWith(`mcp__${CLAUDE_CLIENT_MCP_SERVER_NAME}__`);
}
