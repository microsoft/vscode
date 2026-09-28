/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CustomAgentConfig, MCPServerConfig } from '@github/copilot-sdk';
import { Schemas } from '../../../../base/common/network.js';
import { dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { parseFrontMatter } from '../../../../base/common/yaml.js';
import { IFileService } from '../../../files/common/files.js';
import { toCopilotMcpServerConfiguration } from '../../../mcp/common/mcpCopilotConfiguration.js';
import { McpServerType, type IMcpServerConfiguration } from '../../../mcp/common/mcpPlatformTypes.js';
import type { IMcpServerDefinition, INamedPluginResource, IParsedAgent, IParsedPlugin } from '../../../agentPlugins/common/pluginParsers.js';
import { type AgentCustomization, type ChildCustomization } from '../../common/state/protocol/state.js';
import { resolveMcpServerWorkingDirectory } from '../shared/mcpServerWorkingDirectory.js';

// ---------------------------------------------------------------------------
// MCP servers
// ---------------------------------------------------------------------------

/**
 * Converts parsed MCP server definitions into the SDK's `mcpServers` config.
 */
export function toSdkMcpServers(defs: readonly IMcpServerDefinition[]): Record<string, MCPServerConfig> {
	const result: Record<string, MCPServerConfig> = {};
	for (const def of defs) {
		result[def.name] = toSdkMcpServer(def.name, def.configuration, def.defaultCwd);
	}
	return result;
}

/**
 * Converts root MCP server config maps into the SDK's `mcpServers` config.
 *
 * The map originates from user-controlled root config, where the schema cannot
 * express per-entry validation (no `additionalProperties`). Entries are
 * therefore treated as `unknown` and silently skipped unless they match one of
 * the two supported shapes (`stdio` with a `command`, or `http` with a `url`),
 * so a malformed entry can't surface as `command`/`url: undefined` in the SDK
 * config.
 */
export function toSdkMcpServersFromConfigMap(servers: Record<string, unknown>): Record<string, MCPServerConfig> {
	const result: Record<string, MCPServerConfig> = {};
	for (const [name, config] of Object.entries(servers)) {
		if (isSupportedMcpServerConfiguration(config)) {
			result[name] = toSdkMcpServer(name, config);
		}
	}
	return result;
}

/**
 * Narrows an untrusted value to a supported {@link IMcpServerConfiguration}:
 * a `stdio` server with a string `command`, or an `http` server with a string
 * `url`.
 */
function isSupportedMcpServerConfiguration(value: unknown): value is IMcpServerConfiguration {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as { type?: unknown; command?: unknown; url?: unknown };
	if (candidate.type === McpServerType.LOCAL) {
		return typeof candidate.command === 'string';
	}
	if (candidate.type === McpServerType.REMOTE) {
		return typeof candidate.url === 'string';
	}
	return false;
}

function toSdkMcpServer(_name: string, config: IMcpServerConfiguration, defaultCwd?: URI): MCPServerConfig {
	return toCopilotMcpServerConfiguration(config, config.type === McpServerType.LOCAL ? resolveMcpServerWorkingDirectory(config.cwd, defaultCwd) : undefined);
}

// ---------------------------------------------------------------------------
// Custom agents
// ---------------------------------------------------------------------------

const customAgentReasoningEfforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const satisfies readonly NonNullable<CustomAgentConfig['reasoningEffort']>[];
type CustomAgentReasoningEffort = (typeof customAgentReasoningEfforts)[number];

function isCustomAgentReasoningEffort(value: string | undefined): value is CustomAgentReasoningEffort {
	return customAgentReasoningEfforts.some(reasoningEffort => reasoningEffort === value);
}

/**
 * Converts parsed plugin agents into the SDK's `customAgents` config.
 *
 * Each agent file is read and (when present) its YAML frontmatter is parsed:
 *  - `name` falls back to the agent's resource name (filename stem).
 *  - `description` is forwarded verbatim.
 *  - `tools` is forwarded as the SDK's allow-list; an empty / missing array
 *    becomes `null` so the SDK grants the agent access to all tools.
 *  - `reasoning-effort` is forwarded when it is a supported runtime value.
 *  - `prompt` is the markdown body that follows the frontmatter (or the
 *    full file content when there is no frontmatter).
 */
export async function toSdkCustomAgents(agents: readonly INamedPluginResource[], fileService: IFileService): Promise<CustomAgentConfig[]> {
	const configs: CustomAgentConfig[] = [];
	for (const agent of agents) {
		try {
			const content = await fileService.readFile(agent.uri);
			const raw = content.value.toString();
			const md = parseFrontMatter(raw);
			if (!md) {
				configs.push({
					name: agent.name,
					prompt: raw,
				});
			} else {
				// Match `parseAgentFile`'s name derivation (trim + falsy fallback) so
				// the SDK config name equals the `resolvedAgentName` resolved from the
				// parsed plugin agent; otherwise a whitespace-padded frontmatter `name`
				// would make the SDK reject the session-start `agent:` as not found.
				const name = md.getStringValue('name')?.trim() || agent.name;
				const description = md.getStringValue('description');
				const tools = md.getStringArrayValue('tools');
				const skills = md.getStringArrayValue('skills');
				const reasoningEffort = md.getStringValue('reasoning-effort');
				let infer = md.getBooleanValue('infer');
				const disableModelInvocation = md.getBooleanValue('disable-model-invocation');
				if (infer === undefined && disableModelInvocation === true) {
					infer = false;
				}
				const prompt = md.body ?? raw;
				let model: string | undefined = md.getStringValue('model') ?? undefined;
				const models = md.getStringArrayValue('model') ?? undefined;
				if (!model && models && Array.isArray(models) && models.length > 0) {
					model = models[0];
				}
				configs.push({
					name,
					...(description ? { description } : {}),
					...(model ? { model } : {}),
					...(isCustomAgentReasoningEffort(reasoningEffort) ? { reasoningEffort } : {}),
					tools: tools && tools.length > 0 ? tools : null,
					...(skills !== undefined ? { skills } : {}),
					...(infer !== undefined ? { infer } : {}),
					prompt,
				});
			}
		} catch {
			// Skip agents whose file cannot be read
		}
	}
	return configs;
}

/** A plugin's agents together with its on-disk location (if any). */
export interface IPluginAgentsForSdk {
	readonly pluginDir?: URI;
	readonly agents: readonly INamedPluginResource[];
}

/**
 * Builds the SDK's `customAgents` config for a session.
 *
 * Agents contributed by plugins materialized into an on-disk (file-scheme)
 * directory are normally left out of `customAgents` and discovered by the SDK
 * through `pluginDirectories` instead, to avoid duplicates. However, the SDK
 * validates the session-start `agent:` option against `customAgents` *by name
 * only* — it does NOT consult `pluginDirectories`. So a selected plugin or
 * extension agent (e.g. one chosen in the agent picker) would otherwise fail
 * with "Custom agent '<name>' not found". This forces the resolved selection
 * into `customAgents` so it can be activated, while every other file-dir agent
 * continues to load via `pluginDirectories`.
 */
export async function toSdkSessionCustomAgents(
	plugins: readonly IPluginAgentsForSdk[],
	resolvedAgentName: string | undefined,
	fileService: IFileService,
): Promise<CustomAgentConfig[]> {
	const pluginsWithoutDirs = plugins.filter(p => !p.pluginDir || p.pluginDir.scheme !== Schemas.file);
	const customAgents = await toSdkCustomAgents(pluginsWithoutDirs.flatMap(p => p.agents), fileService);
	if (resolvedAgentName && !customAgents.some(agent => agent.name === resolvedAgentName)) {
		const selectedAgents = plugins.flatMap(p => p.agents).filter(agent => agent.name === resolvedAgentName);
		for (const config of await toSdkCustomAgents(selectedAgents, fileService)) {
			if (!customAgents.some(agent => agent.name === config.name)) {
				customAgents.push(config);
			}
		}
	}
	return customAgents;
}

/**
 * Projects parsed plugin agents into their protocol-level
 * {@link AgentCustomization} shape.
 */
export function toAgentCustomizations(agents: readonly IParsedAgent[]): AgentCustomization[] {
	return agents.map(a => a.customization);
}

/**
 * Collects every child customization (agent, skill, rule, hook, MCP
 * server) produced by a parsed plugin, deduped by id. This is the single
 * source of truth for populating a container customization's `children`
 * array — every projector that produced an SDK config above derives its
 * matching protocol child from the same parsed primitive.
 */
export function toChildCustomizations(plugins: readonly IParsedPlugin[]): ChildCustomization[] {
	const byId = new Map<string, ChildCustomization>();
	const add = (c: ChildCustomization) => {
		if (!byId.has(c.id)) {
			byId.set(c.id, c);
		}
	};
	for (const plugin of plugins) {
		for (const a of plugin.agents) { add(a.customization); }
		for (const s of plugin.skills) { add(s.customization); }
		for (const r of plugin.instructions) { add(r.customization); }
		for (const h of plugin.hooks) { add(h.customization); }
		for (const m of plugin.mcpServers) { add(m.customization); }
	}
	return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Skill directories
// ---------------------------------------------------------------------------

/**
 * Converts parsed plugin skills into the SDK's `skillDirectories` config.
 * The SDK expects directory paths; we extract the parent directory of each SKILL.md.
 */
export function toSdkSkillDirectories(skills: readonly INamedPluginResource[]): string[] {
	return toSdkResourceDirectories(skills);
}

/**
 * Converts parsed plugin instructions into the SDK's
 * `instructionDirectories` config.
 */
export function toSdkInstructionDirectories(instructions: readonly INamedPluginResource[]): string[] {
	return toSdkResourceDirectories(instructions);
}

function toSdkResourceDirectories(resources: readonly INamedPluginResource[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const resource of resources) {
		const dir = dirname(resource.uri.fsPath);
		if (!seen.has(dir)) {
			seen.add(dir);
			result.push(dir);
		}
	}
	return result;
}

/**
 * Checks whether two sets of parsed plugins produce equivalent SDK config.
 * Used to determine if a session needs to be refreshed.
 */
export function parsedPluginsEqual(a: readonly IParsedPlugin[], b: readonly IParsedPlugin[]): boolean {
	// Simple structural comparison via JSON serialization.
	// We serialize only the essential fields, replacing URIs with strings.
	const serialize = (plugins: readonly IParsedPlugin[]) => {
		return JSON.stringify(plugins.map(p => ({
			format: p.format,
			hooks: p.hooks.map(h => ({ type: h.type, commands: h.commands.map(c => ({ command: c.command, windows: c.windows, linux: c.linux, osx: c.osx, cwd: c.cwd?.toString(), env: c.env, timeout: c.timeout })) })),
			mcpServers: p.mcpServers.map(m => ({ name: m.name, configuration: m.configuration, defaultCwd: m.defaultCwd?.toString() })),
			skills: p.skills.map(s => ({
				uri: s.uri.toString(),
				name: s.name,
				disableModelInvocation: s.disableModelInvocation,
				disableUserInvocation: s.disableUserInvocation,
			})),
			agents: p.agents.map(a => ({ uri: a.uri.toString(), name: a.name })),
			instructions: p.instructions.map(i => ({ uri: i.uri.toString(), name: i.name })),
		})));
	};
	return serialize(a) === serialize(b);
}
