/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface AgentsDiscoverRequest {
	/**
	 * Optional list of project directory paths to scan for project-scoped agents. When omitted or empty, only user/plugin/remote-independent agents are returned (no project scan).
	 */
	projectPaths?: string[];
	/**
	 * When true, omit the host's agents (the `<COPILOT_HOME>/agents` directory and all plugin agents), leaving only project and remote agents. For multitenant deployments.
	 */
	excludeHostAgents?: boolean;
}

export interface ServerAgentList {
	/**
	 * All discovered agents across all sources
	 */
	agents: AgentInfo[];
}

export interface AgentInfo {
	/**
	 * Unique identifier of the custom agent
	 */
	name: string;
	/**
	 * Human-readable display name
	 */
	displayName: string;
	/**
	 * Description of the agent's purpose
	 */
	description: string;
	/**
	 * Absolute local file path of the agent definition. Only set for file-based agents loaded from disk; remote agents do not have a path.
	 */
	path?: string;
	/**
	 * Stable identifier for selection. For most agents this is the same as `name`; for plugin/builtin agents it may differ. Always populated; defaults to `name` when no distinct id was assigned.
	 */
	id: string;
	source?: AgentInfoSource;
	/**
	 * Whether the agent can be selected directly by the user. Agents marked `false` are subagent-only.
	 */
	userInvocable?: boolean;
	/**
	 * Allowed tool names for this agent. Empty array means none; omitted means inherit defaults.
	 */
	tools?: string[];
	/**
	 * Preferred model id for this agent. When omitted, inherits the outer agent's model.
	 */
	model?: string;
	/**
	 * MCP server configurations attached to this agent, keyed by server name. Server config shape mirrors the MCP `mcpServers` schema.
	 *
	 * @experimental
	 */
	mcpServers?: {
		[k: string]: unknown | undefined;
	};
	/**
	 * Skill names preloaded into this agent's context. Omitted means none.
	 */
	skills?: string[];
}

export type AgentInfoSource =
	/** Agent loaded from the user's personal agent configuration. */
	'user'
	/** Agent loaded from the current project's repository configuration. */
	| 'project'
	/** Agent inherited from a parent project or workspace. */
	| 'inherited'
	/** Agent provided by a remote runtime or service. */
	| 'remote'
	/** Agent contributed by an installed plugin. */
	| 'plugin'
	/** Agent built into the Copilot runtime. */
	| 'builtin';

export interface InstructionsDiscoverRequest {
	/**
	 * Optional list of project directory paths to scan for repository/working-directory instruction sources. When omitted or empty, only user-level and plugin instruction sources are returned (no project scan).
	 */
	projectPaths?: string[];
	/**
	 * When true, omit the host's instruction sources (user/home-level files and plugin rules), leaving only repository and working-directory sources. For multitenant deployments.
	 */
	excludeHostInstructions?: boolean;
}
