/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { type CustomizationDisabledReason } from '../../../../platform/agentHost/common/customizationEnablement.js';
import { type McpServerSource } from '../../../../platform/agentHost/common/meta/mcpCustomizationMeta.js';
import { McpServerStatus, type CustomizationEnablement, type McpServerState, type TextRange } from '../../../../platform/agentHost/common/state/protocol/state.js';
import type { IMcpServerConfiguration } from '../../../../platform/mcp/common/mcpPlatformTypes.js';

/** A tool reported by an agent-host MCP server's `tools/list`. */
export type AgentHostMcpTool = {
	readonly name: string;
	readonly title?: string;
	readonly description?: string;
};

/**
 * A rich view of a single MCP server exposed by an agent host session.
 * Encapsulates the dispatch plumbing so consumers can present and toggle
 * servers without depending on the low-level protocol action surface.
 */
export interface IAgentHostMcpServer {
	readonly id: string;
	readonly name: string;
	/** Optional Connector catalog name for presentation only. */
	readonly displayName?: string;
	/**
	 * Canonical Copilot Connector that owns this server. Connector-owned servers authenticate with the
	 * session's GitHub credential, so they are authorized through Copilot Connectors, not an MCP token.
	 */
	readonly connectorName?: string;
	readonly source?: McpServerSource;
	/**
	 * Plugin the host reports as the source of this server's configuration. Unlike
	 * {@link isPluginProvided}, the plugin may be one the client never published,
	 * such as a plugin bundled with the agent.
	 */
	readonly sourcePluginName?: string;
	/**
	 * Definition held by the agent host's own MCP server configuration, for a server configured there
	 * (for example with MCP: Add Server > Add to Current Agent Session) rather than in a file.
	 */
	readonly hostConfiguration?: IMcpServerConfiguration;
	/**
	 * VS Code setting the host declares as controlling whether it includes this server. Present only when
	 * the providing host says so; never inferred from the server's name.
	 */
	readonly controllingSettingId?: string;
	readonly enabled: boolean;
	readonly enablement?: readonly CustomizationEnablement[];
	readonly isPluginProvided?: boolean;
	/** Raw id of the plugin customization that declares this server, when it is published as a plugin child. */
	readonly pluginId?: string;
	readonly isClientBundled?: boolean;
	readonly owningPluginClientId?: string;
	readonly disabledReason?: CustomizationDisabledReason;
	readonly status: McpServerStatus;
	/**
	 * True while the server is `AuthRequired` but VS Code is silently authenticating it (or has done so
	 * and is waiting for the host to pick up the token). Clients show progress instead of a sign-in prompt.
	 */
	readonly authenticating?: boolean;
	readonly state: McpServerState;
	readonly sourceUri?: URI;
	readonly sourceRange?: TextRange;
	readonly logOutputChannelId?: string;
	/**
	 * Skills this server serves in the session while it is effectively enabled. `id` is the server
	 * customization's raw id, which identifies the server's skill bundle in the Skills list.
	 */
	readonly skillBundle?: { readonly id: string; readonly count: number };
	/** Starts or restarts the server. Providers that cannot control lifecycle may no-op. */
	start(): Promise<void>;
	/** Stops the server. Providers that cannot control lifecycle may no-op. */
	stop(): Promise<void>;
	/** Continues a blocking startup in the background when the host supports it. */
	background?(): Promise<void>;
	/**
	 * Lists the server's tools with MCP `tools/list` over its AHP `mcp://` channel, following
	 * `nextCursor` pagination. Present only while the server advertises a channel and the host
	 * connection can route MCP requests.
	 */
	listTools?(): Promise<readonly AgentHostMcpTool[]>;
	setEnabled(enabled: boolean): void;
}

