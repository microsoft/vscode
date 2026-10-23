/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AhpMcpUiHostCapabilities, McpServerCustomizationApps } from './channels-session/state.js';

/**
 * MCP App capabilities the agent host proxies for every MCP server it
 * advertises over the `mcp://` side-channel.
 *
 * - `serverTools.listChanged` is `true`: we forward
 *   `notifications/tools/list_changed` whenever the SDK signals that the
 *   tool inventory has refreshed (see `CopilotAgentSession`).
 * - `serverResources` is advertised as an empty object: we serve the
 *   `resources/*` methods over the channel but do not promise
 *   `notifications/resources/list_changed` forwarding (no `listChanged`).
 * - `sampling` is advertised as an empty object: we serve
 *   `sampling/createMessage` requests from the App over the `mcp://`
 *   channel (the agent host handler forwards them to
 *   `session.rpc.mcp.executeSampling`). The SEP-1577 `tools`
 *   sub-flag is NOT set — we don't pass through tool content blocks.
 *
 * Per the AHP spec, `mcpApp` is a static capability declaration —
 * "SHOULD be present whenever the server can host Apps" — so this
 * constant is set on every MCP customization at construction time,
 * regardless of the server's current lifecycle state.
 */
export const DEFAULT_MCP_APP_CAPABILITIES: AhpMcpUiHostCapabilities = {
	serverTools: { listChanged: true },
	serverResources: {},
	sampling: {},
};

/**
 * The full `mcpApp` shape applied to a {@link McpServerCustomization}.
 * Wraps {@link DEFAULT_MCP_APP_CAPABILITIES} so callers can drop it in
 * directly without re-allocating the same wrapper object at every call
 * site.
 */
export const DEFAULT_MCP_APP: McpServerCustomizationApps = {
	capabilities: DEFAULT_MCP_APP_CAPABILITIES,
};
