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

export interface InstructionSource {
	/**
	 * Unique identifier for this source (used for toggling)
	 */
	id: string;
	/**
	 * Human-readable label
	 */
	label: string;
	/**
	 * File path relative to repo or absolute for home
	 */
	sourcePath: string;
	/**
	 * Raw content of the instruction file
	 */
	content: string;
	type: InstructionSourceType;
	location: InstructionSourceLocation;
	/**
	 * Glob pattern(s) from frontmatter — when set, this instruction applies only to matching files
	 */
	applyTo?: string[];
	/**
	 * Short description (body after frontmatter) for use in instruction tables
	 */
	description?: string;
	/**
	 * When true, this source starts disabled and must be toggled on by the user
	 */
	defaultDisabled?: boolean;
	/**
	 * The project path this source was discovered from. Only set by sessionless discovery for repository/working-directory sources, where it disambiguates same-named files (e.g. .github/copilot-instructions.md) across multiple workspace roots. The session-scoped getSources leaves it unset.
	 */
	projectPath?: string;
}

export type InstructionSourceType =
	/** Instructions loaded from the user's home configuration. */
	'home'
	/** Instructions loaded from repository-scoped files. */
	| 'repo'
	/** Instructions loaded from model-specific files. */
	| 'model'
	/** Instructions loaded from VS Code instruction files. */
	| 'vscode'
	/** Instructions discovered from nested agent files. */
	| 'nested-agents'
	/** Instructions inherited from child instruction files. */
	| 'child-instructions'
	/** Instructions supplied by an installed plugin. */
	| 'plugin';

export type InstructionSourceLocation =
	/** Instructions live in user-level configuration. */
	'user'
	/** Instructions live in repository-level configuration. */
	| 'repository'
	/** Instructions live under the current working directory. */
	| 'working-directory'
	/** Instructions live in plugin-provided configuration. */
	| 'plugin';
