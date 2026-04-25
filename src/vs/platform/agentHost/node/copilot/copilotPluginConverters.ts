/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import type { CustomAgentConfig, MCPServerConfig, SessionConfig } from '@github/copilot-sdk';
import { OperatingSystem, OS } from '../../../../base/common/platform.js';
import { IFileService } from '../../../files/common/files.js';
import { McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import type { IMcpServerDefinition, INamedPluginResource, IParsedHookCommand, IParsedHookGroup, IParsedPlugin } from '../../../agentPlugins/common/pluginParsers.js';
import { dirname } from '../../../../base/common/path.js';

type SessionHooks = NonNullable<SessionConfig['hooks']>;

// ---------------------------------------------------------------------------
// MCP servers
// ---------------------------------------------------------------------------

/**
 * Converts parsed MCP server definitions into the SDK's `mcpServers` config.
 */
export function toSdkMcpServers(defs: readonly IMcpServerDefinition[]): Record<string, MCPServerConfig> {
	const result: Record<string, MCPServerConfig> = {};
	for (const def of defs) {
		const config = def.configuration;
		if (config.type === McpServerType.LOCAL) {
			result[def.name] = {
				type: 'local',
				command: config.command,
				args: config.args ? [...config.args] : [],
				tools: ['*'],
				...(config.env && { env: toStringEnv(config.env) }),
				...(config.cwd && { cwd: config.cwd }),
			};
		} else {
			result[def.name] = {
				type: 'http',
				url: config.url,
				tools: ['*'],
				...(config.headers && { headers: { ...config.headers } }),
			};
		}
	}
	return result;
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
 * Reads each agent's `.md` file to use as the prompt.
 */
export async function toSdkCustomAgents(agents: readonly INamedPluginResource[], fileService: IFileService): Promise<CustomAgentConfig[]> {
	const configs: CustomAgentConfig[] = [];
	for (const agent of agents) {
		try {
			const content = await fileService.readFile(agent.uri);
			configs.push({
				name: agent.name,
				prompt: content.value.toString(),
			});
		} catch {
			// Skip agents whose file cannot be read
		}
	}
	return configs;
}

// ---------------------------------------------------------------------------
// Skill directories
// ---------------------------------------------------------------------------

/**
 * Converts parsed plugin skills into the SDK's `skillDirectories` config.
 * The SDK expects directory paths; we extract the parent directory of each SKILL.md.
 */
export function toSdkSkillDirectories(skills: readonly INamedPluginResource[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const skill of skills) {
		// SKILL.md parent directory is the skill directory
		const dir = dirname(skill.uri.fsPath);
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
		readonly onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => Promise<void>;
		readonly onPostToolUse: (input: { toolName: string; toolArgs: unknown }) => Promise<void>;
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
		hooks.onPreToolUse = async (input: { toolName: string; toolArgs: unknown }) => {
			await editTrackingHooks?.onPreToolUse(input);
			return runHookCommands(preToolCommands, input);
		};
	}

	// Post-tool-use handler
	const postToolCommands = commandsByKey.get('onPostToolUse');
	if (postToolCommands?.length || editTrackingHooks) {
		hooks.onPostToolUse = async (input: { toolName: string; toolArgs: unknown }) => {
			await editTrackingHooks?.onPostToolUse(input);
			return runHookCommands(postToolCommands, input);
		};
	}

	// User-prompt-submitted handler
	const promptCommands = commandsByKey.get('onUserPromptSubmitted');
	if (promptCommands?.length) {
		hooks.onUserPromptSubmitted = async (input: { prompt: string }) => {
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
		hooks.onSessionStart = async (input: { source: string }) => {
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
		hooks.onSessionEnd = async (input: { reason: string }) => {
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
		hooks.onErrorOccurred = async (input: { error: string }) => {
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
		})));
	};
	return serialize(a) === serialize(b);
}
