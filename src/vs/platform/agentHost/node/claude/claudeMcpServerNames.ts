/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CLAUDE_SERVER_TOOL_MCP_SERVER_NAME } from './claudeServerToolMcpServer.js';
import { CLAUDE_CLIENT_MCP_SERVER_NAME } from './clientTools/claudeClientToolMcpServer.js';

/**
 * The in-process MCP servers the agent host injects into `Options.mcpServers`
 * itself: the client-tool bridge and the server-tool bridge.
 *
 * They are internal plumbing — the SDK reports them alongside real,
 * user-configured servers in `mcpServerStatus()`, but they have no definition
 * the user can act on and cannot be toggled through the CLI's MCP control
 * requests. An SDK-reported server under one of these names must therefore
 * never surface as a user-visible MCP customization: doing so shows a phantom
 * entry AND feeds the name into the session's MCP enablement reconciliation,
 * which then fails with `Server not found: <name>` and takes the turn down
 * with it.
 */
const HOST_INJECTED_MCP_SERVER_NAMES: ReadonlySet<string> = new Set([
	CLAUDE_CLIENT_MCP_SERVER_NAME,
	CLAUDE_SERVER_TOOL_MCP_SERVER_NAME,
]);

/** Whether `name` is one of the {@link HOST_INJECTED_MCP_SERVER_NAMES}. */
export function isHostInjectedMcpServerName(name: string): boolean {
	return HOST_INJECTED_MCP_SERVER_NAMES.has(name);
}
