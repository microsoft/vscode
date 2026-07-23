/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import type { CustomAgentConfig, MCPServerConfig, SessionConfig } from '@github/copilot-sdk';
import { Schemas } from '../../../../base/common/network.js';
import { OperatingSystem, OS } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { parseFrontMatter } from '../../../../base/common/yaml.js';
import { IFileService } from '../../../files/common/files.js';
import { McpServerType, type IMcpServerConfiguration } from '../../../mcp/common/mcpPlatformTypes.js';
import type { IMcpServerDefinition, INamedPluginResource, IParsedAgent, IParsedHookCommand, IParsedHookGroup, IParsedPlugin } from '../../../agentPlugins/common/pluginParsers.js';
import { type AgentCustomization, type ChildCustomization } from '../../common/state/protocol/state.js';
import { dirname } from '../../../../base/common/path.js';

type SessionHooks = NonNullable<SessionConfig['hooks']>;
type PreToolUseHookInput = Parameters<NonNullable<SessionHooks['onPreToolUse']>>[0];
type PostToolUseHookInput = Parameters<NonNullable<SessionHooks['onPostToolUse']>>[0];
type UserPromptSubmittedHookInput = Parameters<NonNullable<SessionHooks['onUserPromptSubmitted']>>[0];
type SessionStartHookInput = Parameters<NonNullable<SessionHooks['onSessionStart']>>[0];
type SessionEndHookInput = Parameters<NonNullable<SessionHooks['onSessionEnd']>>[0];
type ErrorOccurredHookInput = Parameters<NonNullable<SessionHooks['onErrorOccurred']>>[0];

// ---------------------------------------------------------------------------
// MCP servers
// ---------------------------------------------------------------------------

/**
 * Converts parsed MCP server definitions into the SDK's `mcpServers` config.
 */
export function toSdkMcpServers(defs: readonly IMcpServerDefinition[]): Record<string, MCPServerConfig> {
	const result: Record<string, MCPServerConfig> = {};
	for (const def of defs) {
		result[def.name] = toSdkMcpServer(def.name, def.configuration);
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

function toSdkMcpServer(_name: string, config: IMcpServerConfiguration): MCPServerConfig {
	if (config.type === McpServerType.LOCAL) {
		return {
			type: 'local',
			command: config.command,
			args: config.args ? [...config.args] : [],
			tools: ['*'],
			...(config.env && { env: toStringEnv(config.env) }),
			...(config.cwd && { cwd: config.cwd }),
		};
	}
	return {
		type: 'http',
		url: config.url,
		tools: ['*'],
		...(config.headers && { headers: { ...config.headers } }),
	};
}

/**
 * Ensures all env values are strings (the SDK requires `Record<string, string>`).
 */
function toStringEnv(env: Record<string, string | number | null>): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (value !== null) {
			result[key] = String(value);
		}
	}
	return result;
}

// ---------------------------------------------------------------------------
// Custom agents
// ---------------------------------------------------------------------------

/**
 * Converts parsed plugin agents into the SDK's `customAgents` config.
 *
 * Each agent file is read and (when present) its YAML frontmatter is parsed:
 *  - `name` falls back to the agent's resource name (filename stem).
 *  - `description` is forwarded verbatim.
 *  - `tools` is forwarded as the SDK's allow-list; an empty / missing array
 *    becomes `null` so the SDK grants the agent access to all tools.
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

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Resolves the effective command for the current platform from a parsed hook command.
 */
function resolveEffectiveCommand(hook: IParsedHookCommand, os: OperatingSystem): string | undefined {
	if (os === OperatingSystem.Windows && hook.windows) {
		return hook.windows;
	} else if (os === OperatingSystem.Macintosh && hook.osx) {
		return hook.osx;
	} else if (os === OperatingSystem.Linux && hook.linux) {
		return hook.linux;
	}
	return hook.command;
}

/**
 * Executes a hook command as a shell process. Returns the stdout on success,
 * or throws on non-zero exit code or timeout.
 */
function executeHookCommand(hook: IParsedHookCommand, stdin?: string): Promise<string> {
	const command = resolveEffectiveCommand(hook, OS);
	if (!command) {
		return Promise.resolve('');
	}

	const timeout = (hook.timeout ?? 30) * 1000;
	const cwd = hook.cwd?.fsPath;

	return new Promise<string>((resolve, reject) => {
		const isWindows = OS === OperatingSystem.Windows;
		const shell = isWindows ? 'cmd.exe' : '/bin/sh';
		const shellArgs = isWindows ? ['/c', command] : ['-c', command];

		const child = spawn(shell, shellArgs, {
			cwd,
			env: { ...process.env, ...hook.env },
			stdio: ['pipe', 'pipe', 'pipe'],
			timeout,
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
		child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

		if (stdin) {
			child.stdin.write(stdin);
			child.stdin.end();
		} else {
			child.stdin.end();
		}

		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) {
				resolve(stdout);
			} else {
				reject(new Error(`Hook command exited with code ${code}: ${stderr || stdout}`));
			}
		});
	});
}

/**
 * Runs a list of hook commands sequentially, passing `input` as JSON stdin.
 * Returns the parsed output of the first command that emits a valid JSON object,
 * or `undefined` if no command produces parseable JSON output.
 * Command failures are swallowed — hooks are non-fatal.
 */
async function runHookCommands(commands: readonly IParsedHookCommand[] | undefined, input: unknown): Promise<object | undefined> {
	if (!commands) {
		return undefined;
	}
	const stdin = JSON.stringify(input);
	for (const cmd of commands) {
		try {
			const output = await executeHookCommand(cmd, stdin);
			if (output.trim()) {
				try {
					const parsed = JSON.parse(output);
					if (parsed && typeof parsed === 'object') {
						return parsed;
					}
				} catch {
					// Non-JSON output is fine — no modification
				}
			}
		} catch {
			// Hook failures are non-fatal
		}
	}
	return undefined;
}

/**
 * Mapping from canonical hook type identifiers to SDK SessionHooks handler keys.
 */
const HOOK_TYPE_TO_SDK_KEY: Record<string, keyof SessionHooks> = {
	'PreToolUse': 'onPreToolUse',
	'PostToolUse': 'onPostToolUse',
	'UserPromptSubmit': 'onUserPromptSubmitted',
	'SessionStart': 'onSessionStart',
	'SessionEnd': 'onSessionEnd',
	'ErrorOccurred': 'onErrorOccurred',
};

/**
 * Converts parsed plugin hooks into SDK {@link SessionHooks} handler functions.
 *
 * Each handler executes the hook's shell commands sequentially when invoked.
 * Hook types that don't map to SDK handler keys are silently ignored.
 *
 * The optional `editTrackingHooks` parameter provides internal edit-tracking
 * callbacks from {@link CopilotAgentSession} that are merged with plugin hooks.
 */
export function toSdkHooks(
	hookGroups: readonly IParsedHookGroup[],
	editTrackingHooks?: {
		readonly onPreToolUse: (input: PreToolUseHookInput) => Promise<void>;
		readonly onPostToolUse: (input: PostToolUseHookInput) => Promise<void>;
	},
): SessionHooks {
	// Group all commands by SDK handler key
	const commandsByKey = new Map<keyof SessionHooks, IParsedHookCommand[]>();
	for (const group of hookGroups) {
		const sdkKey = HOOK_TYPE_TO_SDK_KEY[group.type];
		if (!sdkKey) {
			continue;
		}
		const existing = commandsByKey.get(sdkKey) ?? [];
		existing.push(...group.commands);
		commandsByKey.set(sdkKey, existing);
	}

	const hooks: SessionHooks = {};

	// Pre-tool-use handler
	const preToolCommands = commandsByKey.get('onPreToolUse');
	if (preToolCommands?.length || editTrackingHooks) {
		hooks.onPreToolUse = async (input: PreToolUseHookInput) => {
			await editTrackingHooks?.onPreToolUse(input);
			return runHookCommands(preToolCommands, input);
		};
	}

	// Post-tool-use handler
	const postToolCommands = commandsByKey.get('onPostToolUse');
	if (postToolCommands?.length || editTrackingHooks) {
		hooks.onPostToolUse = async (input: PostToolUseHookInput) => {
			await editTrackingHooks?.onPostToolUse(input);
			return runHookCommands(postToolCommands, input);
		};
	}

	// User-prompt-submitted handler
	const promptCommands = commandsByKey.get('onUserPromptSubmitted');
	if (promptCommands?.length) {
		hooks.onUserPromptSubmitted = async (input: UserPromptSubmittedHookInput) => {
			const stdin = JSON.stringify(input);
			for (const cmd of promptCommands) {
				try {
					await executeHookCommand(cmd, stdin);
				} catch {
					// Hook failures are non-fatal
				}
			}
		};
	}

	// Session-start handler
	const startCommands = commandsByKey.get('onSessionStart');
	if (startCommands?.length) {
		hooks.onSessionStart = async (input: SessionStartHookInput) => {
			const stdin = JSON.stringify(input);
			for (const cmd of startCommands) {
				try {
					await executeHookCommand(cmd, stdin);
				} catch {
					// Hook failures are non-fatal
				}
			}
		};
	}

	// Session-end handler
	const endCommands = commandsByKey.get('onSessionEnd');
	if (endCommands?.length) {
		hooks.onSessionEnd = async (input: SessionEndHookInput) => {
			const stdin = JSON.stringify(input);
			for (const cmd of endCommands) {
				try {
					await executeHookCommand(cmd, stdin);
				} catch {
					// Hook failures are non-fatal
				}
			}
		};
	}

	// Error-occurred handler
	const errorCommands = commandsByKey.get('onErrorOccurred');
	if (errorCommands?.length) {
		hooks.onErrorOccurred = async (input: ErrorOccurredHookInput) => {
			const stdin = JSON.stringify(input);
			for (const cmd of errorCommands) {
				try {
					await executeHookCommand(cmd, stdin);
				} catch {
					// Hook failures are non-fatal
				}
			}
		};
	}

	return hooks;
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
			hooks: p.hooks.map(h => ({ type: h.type, commands: h.commands.map(c => ({ command: c.command, windows: c.windows, linux: c.linux, osx: c.osx, cwd: c.cwd?.toString(), env: c.env, timeout: c.timeout })) })),
			mcpServers: p.mcpServers.map(m => ({ name: m.name, configuration: m.configuration })),
			skills: p.skills.map(s => ({ uri: s.uri.toString(), name: s.name })),
			agents: p.agents.map(a => ({ uri: a.uri.toString(), name: a.name })),
			instructions: p.instructions.map(i => ({ uri: i.uri.toString(), name: i.name })),
		})));
	};
	return serialize(a) === serialize(b);
}
