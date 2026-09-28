/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import type { CustomAgentConfig, MCPServerConfig, SessionHooks } from '@github/copilot-sdk';
import { Schemas } from '../../../../base/common/network.js';
import { dirname } from '../../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { parseFrontMatter } from '../../../../base/common/yaml.js';
import { IFileService } from '../../../files/common/files.js';
import { toCopilotMcpServerConfiguration } from '../../../mcp/common/mcpCopilotConfiguration.js';
import { McpServerType, type IMcpServerConfiguration } from '../../../mcp/common/mcpPlatformTypes.js';
import type { IMcpServerDefinition, INamedPluginResource, IParsedAgent, IParsedHookCommand, IParsedHookGroup, IParsedPlugin } from '../../../agentPlugins/common/pluginParsers.js';
import { type AgentCustomization, type ChildCustomization } from '../../common/state/protocol/state.js';
import { resolveMcpServerWorkingDirectory } from '../shared/mcpServerWorkingDirectory.js';

type PreToolUseHookInput = Parameters<NonNullable<SessionHooks['onPreToolUse']>>[0];
type PreToolUseHookOutput = Awaited<ReturnType<NonNullable<SessionHooks['onPreToolUse']>>>;
type PostToolUseHookInput = Parameters<NonNullable<SessionHooks['onPostToolUse']>>[0];
type PostToolUseHookOutput = Exclude<Awaited<ReturnType<NonNullable<SessionHooks['onPostToolUse']>>>, void>;
type PostToolUseFailureHookInput = Parameters<NonNullable<SessionHooks['onPostToolUseFailure']>>[0];
type PostToolUseFailureHookOutput = Exclude<Awaited<ReturnType<NonNullable<SessionHooks['onPostToolUseFailure']>>>, void>;
type UserPromptSubmittedHookInput = Parameters<NonNullable<SessionHooks['onUserPromptSubmitted']>>[0];
type UserPromptTransformedHookInput = Parameters<NonNullable<SessionHooks['onUserPromptTransformed']>>[0];
type UserPromptTransformedHookOutput = Exclude<Awaited<ReturnType<NonNullable<SessionHooks['onUserPromptTransformed']>>>, void>;
type SessionStartHookInput = Parameters<NonNullable<SessionHooks['onSessionStart']>>[0];
type SessionStartHookOutput = Exclude<Awaited<ReturnType<NonNullable<SessionHooks['onSessionStart']>>>, void>;
type SessionEndHookInput = Parameters<NonNullable<SessionHooks['onSessionEnd']>>[0];
type ErrorOccurredHookInput = Parameters<NonNullable<SessionHooks['onErrorOccurred']>>[0];
type AgentStopHookInput = Parameters<NonNullable<SessionHooks['onAgentStop']>>[0];
type AgentStopHookOutput = Exclude<Awaited<ReturnType<NonNullable<SessionHooks['onAgentStop']>>>, void>;

type SupportedHookInput =
	| PreToolUseHookInput
	| PostToolUseHookInput
	| PostToolUseFailureHookInput
	| UserPromptSubmittedHookInput
	| UserPromptTransformedHookInput
	| SessionStartHookInput
	| SessionEndHookInput
	| ErrorOccurredHookInput
	| AgentStopHookInput;

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
		});

		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let stdoutSize = 0;
		let stderrSize = 0;
		let timedOut = false;
		let settled = false;
		const append = (chunks: Buffer[], size: number, data: Buffer): number => {
			const remaining = MAX_HOOK_OUTPUT_BYTES - size;
			if (remaining > 0) {
				const chunk = data.byteLength > remaining ? data.subarray(0, remaining) : data;
				chunks.push(chunk);
				return size + chunk.byteLength;
			}
			return size;
		};
		const read = (chunks: Buffer[], size: number) => Buffer.concat(chunks, size).toString();
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill();
		}, timeout);

		child.stdout.on('data', (data: Buffer) => { stdoutSize = append(stdoutChunks, stdoutSize, data); });
		child.stderr.on('data', (data: Buffer) => { stderrSize = append(stderrChunks, stderrSize, data); });

		if (stdin) {
			child.stdin.write(stdin);
			child.stdin.end();
		} else {
			child.stdin.end();
		}

		child.on('error', error => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				reject(new HookCommandExecutionError('error', error.message, read(stdoutChunks, stdoutSize), read(stderrChunks, stderrSize)));
			}
		});
		child.on('close', (code) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			const stdout = read(stdoutChunks, stdoutSize);
			const stderr = read(stderrChunks, stderrSize);
			if (timedOut) {
				reject(new HookCommandExecutionError('timeout', `Hook command timed out after ${hook.timeout ?? 30} seconds: ${command.slice(0, 80)}`, stdout, stderr, code));
				return;
			}
			if (code === 0) {
				resolve(stdout);
			} else {
				reject(new HookCommandExecutionError('error', `Hook command exited with code ${code}: ${stderr || stdout}`, stdout, stderr, code));
			}
		});
	});
}

const MAX_HOOK_OUTPUT_BYTES = 10 * 1024 * 1024;
const MAX_POST_TOOL_CONTEXT_BYTES = 10 * 1024;

/**
 * Describes a hook process failure while retaining its bounded output.
 */
class HookCommandExecutionError extends Error {
	constructor(
		readonly kind: 'error' | 'timeout',
		message: string,
		readonly stdout: string,
		readonly stderr: string,
		readonly exitCode?: number | null,
	) {
		super(message);
	}
}

interface IPluginHookCommand {
	readonly type: string;
	readonly originalId: string;
	readonly command: IParsedHookCommand;
}

function parseHookCommandOutput(stdout: string): object | undefined {
	const output = stdout
		.split(/\r?\n/)
		.filter(line => {
			const trimmed = line.trim();
			if (!trimmed) {
				return true;
			}
			try {
				const value = JSON.parse(trimmed);
				return !value || typeof value !== 'object' || (value as { type?: unknown }).type !== 'progress';
			} catch {
				return true;
			}
		})
		.join('\n')
		.trim();
	if (!output) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(output);
		return parsed && typeof parsed === 'object' ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function toClaudeToolName(toolName: string): string {
	switch (toolName) {
		case 'bash':
		case 'powershell':
			return 'Bash';
		case 'view':
			return 'Read';
		case 'create':
			return 'Write';
		case 'edit':
		case 'str_replace_editor':
		case 'apply_patch':
			return 'Edit';
		case 'grep':
		case 'rg':
			return 'Grep';
		case 'glob':
			return 'Glob';
		case 'web_fetch':
			return 'WebFetch';
		case 'web_search':
			return 'WebSearch';
		case 'ask_user':
			return 'AskUserQuestion';
		case 'update_todo':
			return 'TodoWrite';
		case 'task':
			return 'Agent';
		default:
			return toolName;
	}
}

function matchesHookCommand(hook: IPluginHookCommand, input: SupportedHookInput): boolean {
	const matcher = hook.command.matcher;
	const toolName = (input as { toolName?: string }).toolName;
	if (matcher === undefined || toolName === undefined) {
		return true;
	}

	const isCompatiblePreToolUse = hook.type === 'PreToolUse' && hook.originalId === 'PreToolUse';
	const matcherToolName = isCompatiblePreToolUse ? toClaudeToolName(toolName) : toolName;
	if (isCompatiblePreToolUse) {
		if (matcher === '' || matcher === '*' || matcher === '**') {
			return true;
		}
		if (/^[\w.:-]+(?:\|[\w.:-]+)*$/.test(matcher)) {
			return matcher.split('|').some(candidate => candidate === matcherToolName || candidate === toolName || (candidate === 'Task' && matcherToolName === 'Agent'));
		}
	}

	try {
		return new RegExp(`^(?:${matcher})$`).test(matcherToolName);
	} catch {
		return false;
	}
}

function toCompatibleToolResult(input: PostToolUseHookInput): object {
	return {
		result_type: input.toolResult.resultType,
		...(input.toolResult.textResultForLlm !== undefined ? { text_result_for_llm: input.toolResult.textResultForLlm } : undefined),
	};
}

function toHookCommandInput(hook: IPluginHookCommand, input: SupportedHookInput): object {
	const compatible = /^[A-Z]/.test(hook.originalId);
	const cwd = hook.command.cwd?.fsPath ?? input.workingDirectory;
	const common = compatible
		? {
			hook_event_name: hook.originalId,
			session_id: input.sessionId,
			timestamp: input.timestamp.toISOString(),
			cwd,
		}
		: {
			sessionId: input.sessionId,
			timestamp: input.timestamp.getTime(),
			cwd,
		};

	switch (hook.type) {
		case 'SessionStart': {
			const event = input as SessionStartHookInput;
			return compatible
				? { ...common, source: event.source, ...(event.initialPrompt !== undefined ? { initial_prompt: event.initialPrompt } : undefined) }
				: { ...common, source: event.source, ...(event.initialPrompt !== undefined ? { initialPrompt: event.initialPrompt } : undefined) };
		}
		case 'SessionEnd':
			return { ...common, reason: (input as SessionEndHookInput).reason };
		case 'UserPromptSubmit':
			return { ...common, prompt: (input as UserPromptSubmittedHookInput).prompt };
		case 'UserPromptTransformed': {
			const event = input as UserPromptTransformedHookInput;
			return { ...common, prompt: event.prompt, transformedPrompt: event.transformedPrompt };
		}
		case 'PreToolUse': {
			const event = input as PreToolUseHookInput;
			const toolName = compatible ? toClaudeToolName(event.toolName) : event.toolName;
			return compatible
				? { ...common, tool_name: toolName, tool_input: event.toolArgs }
				: { ...common, toolName, toolArgs: event.toolArgs };
		}
		case 'PostToolUse': {
			const event = input as PostToolUseHookInput;
			return compatible
				? { ...common, tool_name: event.toolName, tool_input: event.toolArgs, tool_result: toCompatibleToolResult(event) }
				: { ...common, toolName: event.toolName, toolArgs: event.toolArgs, toolResult: event.toolResult };
		}
		case 'PostToolUseFailure': {
			const event = input as PostToolUseFailureHookInput;
			return compatible
				? { ...common, tool_name: event.toolName, tool_input: event.toolArgs, error: event.error }
				: { ...common, toolName: event.toolName, toolArgs: event.toolArgs, error: event.error };
		}
		case 'Stop': {
			const event = input as AgentStopHookInput;
			const fields = {
				...(event.transcriptPath !== undefined ? { transcriptPath: event.transcriptPath } : undefined),
				...(event.stopReason !== undefined ? { stopReason: event.stopReason } : undefined),
				stop_hook_active: event.stopHookActive ?? false,
			};
			return compatible
				? {
					...common,
					...(event.transcriptPath !== undefined ? { transcript_path: event.transcriptPath } : undefined),
					...(event.stopReason !== undefined ? { stop_reason: event.stopReason } : undefined),
					stop_hook_active: event.stopHookActive ?? false,
				}
				: { ...common, ...fields };
		}
		case 'ErrorOccurred': {
			const event = input as ErrorOccurredHookInput;
			const error = { message: event.error, name: 'Error' };
			return compatible
				? { ...common, error, error_context: event.errorContext, recoverable: event.recoverable }
				: { ...common, error, errorContext: event.errorContext, recoverable: event.recoverable };
		}
		default:
			return common;
	}
}

/**
 * Runs a list of hook commands sequentially, passing `input` as JSON stdin.
 * Returns every valid JSON object so callers can combine all hook results.
 * Command failures are swallowed — hooks are non-fatal.
 */
async function runHookCommands(commands: readonly IPluginHookCommand[] | undefined, input: SupportedHookInput): Promise<object[]> {
	if (!commands) {
		return [];
	}
	const results: object[] = [];
	for (const hook of commands) {
		if (!matchesHookCommand(hook, input)) {
			continue;
		}
		const stdin = JSON.stringify(toHookCommandInput(hook, input));
		try {
			const output = parseHookCommandOutput(await executeHookCommand(hook.command, stdin));
			if (output) {
				results.push(output);
			}
		} catch (error) {
			if (!(error instanceof HookCommandExecutionError) || error.kind === 'timeout') {
				continue;
			}
			const output = parseHookCommandOutput(error.stdout);
			if (output) {
				results.push(output);
			}
			if (hook.type === 'PreToolUse') {
				results.push({
					permissionDecision: 'deny',
					permissionDecisionReason: error.stderr.trim() || (error.exitCode !== undefined ? `Hook command exited with code ${error.exitCode}` : error.message),
				});
			} else if (hook.type === 'PostToolUseFailure' && error.exitCode === 2 && !output) {
				const additionalContext = error.stdout.trim() || error.stderr.trim();
				if (additionalContext) {
					results.push({ additionalContext });
				}
			}
		}
	}
	return results;
}

function mergeAdditionalContext(outputs: readonly object[], maxBytes: number): string | undefined {
	const contexts = outputs
		.map(output => (output as { additionalContext?: unknown }).additionalContext)
		.filter((context): context is string => typeof context === 'string');
	if (contexts.length === 0) {
		return undefined;
	}
	const meaningful = contexts.filter(context => context.trim().length > 0);
	const contributions = meaningful.length > 0 ? meaningful : [contexts.at(-1)!];
	let merged = '';
	for (const context of contributions) {
		const candidate = merged ? `${merged}\n\n${context}` : context;
		if (Buffer.byteLength(candidate) <= maxBytes) {
			merged = candidate;
		}
	}
	return merged;
}

function mergeHookCommandOutputs(outputs: readonly object[], maxContextBytes = MAX_HOOK_OUTPUT_BYTES): Record<string, unknown> | undefined {
	if (outputs.length === 0) {
		return undefined;
	}

	const merged: Record<string, unknown> = {};
	for (const output of outputs) {
		Object.assign(merged, output);
	}
	const additionalContext = mergeAdditionalContext(outputs, maxContextBytes);
	if (additionalContext !== undefined) {
		merged.additionalContext = additionalContext;
	} else {
		delete merged.additionalContext;
	}
	return merged;
}

const permissionDecisionPriority = {
	allow: 1,
	ask: 2,
	deny: 3,
} as const;

function mergePreToolUseHookOutputs(outputs: readonly object[]): Exclude<PreToolUseHookOutput, void> | undefined {
	const merged = mergeHookCommandOutputs(outputs);
	if (!merged) {
		return undefined;
	}

	let winningDecision: keyof typeof permissionDecisionPriority | undefined;
	let winningReason: string | undefined;
	const denyReasons: string[] = [];
	for (const output of outputs) {
		const candidate = output as { permissionDecision?: unknown; permissionDecisionReason?: unknown };
		const decision = candidate.permissionDecision;
		if (decision !== 'allow' && decision !== 'ask' && decision !== 'deny') {
			continue;
		}
		const reason = typeof candidate.permissionDecisionReason === 'string' ? candidate.permissionDecisionReason : undefined;
		if (decision === 'deny' && reason) {
			denyReasons.push(reason);
		}
		if (!winningDecision || permissionDecisionPriority[decision] > permissionDecisionPriority[winningDecision]) {
			winningDecision = decision;
			winningReason = reason;
		}
	}

	if (winningDecision) {
		merged.permissionDecision = winningDecision;
		const reason = winningDecision === 'deny' && denyReasons.length > 0 ? denyReasons.join('\n') : winningReason;
		if (reason !== undefined) {
			merged.permissionDecisionReason = reason;
		} else {
			delete merged.permissionDecisionReason;
		}
	}

	return merged;
}

function mergeAdditionalContextOutput<T extends object>(outputs: readonly object[], maxBytes = MAX_HOOK_OUTPUT_BYTES): T | undefined {
	if (outputs.length === 0) {
		return undefined;
	}
	const additionalContext = mergeAdditionalContext(outputs, maxBytes);
	return (additionalContext !== undefined ? { additionalContext } : {}) as T;
}

function mergeUserPromptTransformedOutputs(outputs: readonly object[]): UserPromptTransformedHookOutput | undefined {
	for (let index = outputs.length - 1; index >= 0; index--) {
		const modifiedTransformedPrompt = (outputs[index] as { modifiedTransformedPrompt?: unknown }).modifiedTransformedPrompt;
		if (typeof modifiedTransformedPrompt === 'string' && modifiedTransformedPrompt.length > 0) {
			return { modifiedTransformedPrompt };
		}
	}
	return outputs.length > 0 ? {} : undefined;
}

function mergeAgentStopOutputs(outputs: readonly object[]): AgentStopHookOutput | undefined {
	const reasons: string[] = [];
	let blocked = false;
	for (const output of outputs) {
		const candidate = output as { decision?: unknown; reason?: unknown };
		if (candidate.decision === 'block') {
			blocked = true;
			if (typeof candidate.reason === 'string' && candidate.reason.length > 0) {
				reasons.push(candidate.reason);
			}
		}
	}
	if (!blocked) {
		return outputs.length > 0 ? {} : undefined;
	}
	return {
		decision: 'block',
		...(reasons.length > 0 ? { reason: reasons.join('\n\n') } : undefined),
	};
}

/**
 * Mapping from canonical hook type identifiers to SDK SessionHooks handler keys.
 */
const HOOK_TYPE_TO_SDK_KEY: Record<string, keyof SessionHooks> = {
	'PreToolUse': 'onPreToolUse',
	'PostToolUse': 'onPostToolUse',
	'PostToolUseFailure': 'onPostToolUseFailure',
	'UserPromptSubmit': 'onUserPromptSubmitted',
	'UserPromptTransformed': 'onUserPromptTransformed',
	'SessionStart': 'onSessionStart',
	'SessionEnd': 'onSessionEnd',
	'ErrorOccurred': 'onErrorOccurred',
	'Stop': 'onAgentStop',
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
		readonly onPreToolUse: (input: PreToolUseHookInput) => Promise<PreToolUseHookOutput>;
		readonly onPostToolUse: (input: PostToolUseHookInput) => Promise<void>;
		readonly onPostToolUseFailure?: (input: PostToolUseFailureHookInput) => Promise<void>;
		readonly onUserPromptSubmitted?: () => { readonly additionalContext: string } | undefined;
	},
): SessionHooks {
	// Group all commands by SDK handler key
	const commandsByKey = new Map<keyof SessionHooks, IPluginHookCommand[]>();
	for (const group of hookGroups) {
		const sdkKey = HOOK_TYPE_TO_SDK_KEY[group.type];
		if (!sdkKey) {
			continue;
		}
		const existing = commandsByKey.get(sdkKey) ?? [];
		existing.push(...group.commands.map(command => ({ type: group.type, originalId: group.originalId, command })));
		commandsByKey.set(sdkKey, existing);
	}

	const hooks: SessionHooks = {};

	// Pre-tool-use handler
	const preToolCommands = commandsByKey.get('onPreToolUse');
	if (preToolCommands?.length || editTrackingHooks) {
		hooks.onPreToolUse = async (input: PreToolUseHookInput) => {
			const internalResult = await editTrackingHooks?.onPreToolUse(input);
			const outputs = await runHookCommands(preToolCommands, input);
			return mergePreToolUseHookOutputs(internalResult === undefined ? outputs : [internalResult, ...outputs]);
		};
	}

	// Post-tool-use handler
	const postToolCommands = commandsByKey.get('onPostToolUse');
	if (postToolCommands?.length || editTrackingHooks) {
		hooks.onPostToolUse = async (input: PostToolUseHookInput) => {
			await editTrackingHooks?.onPostToolUse(input);
			return mergeHookCommandOutputs(await runHookCommands(postToolCommands, input), MAX_POST_TOOL_CONTEXT_BYTES) as PostToolUseHookOutput | undefined;
		};
	}

	const postToolFailureCommands = commandsByKey.get('onPostToolUseFailure');
	if (postToolFailureCommands?.length || editTrackingHooks?.onPostToolUseFailure) {
		hooks.onPostToolUseFailure = async (input: PostToolUseFailureHookInput) => {
			await editTrackingHooks?.onPostToolUseFailure?.(input);
			return mergeAdditionalContextOutput<PostToolUseFailureHookOutput>(await runHookCommands(postToolFailureCommands, input));
		};
	}

	// User-prompt-submitted handler
	const promptCommands = commandsByKey.get('onUserPromptSubmitted');
	if (promptCommands?.length || editTrackingHooks?.onUserPromptSubmitted) {
		hooks.onUserPromptSubmitted = async (input: UserPromptSubmittedHookInput) => {
			await runHookCommands(promptCommands, input);
			return editTrackingHooks?.onUserPromptSubmitted?.();
		};
	}

	const transformedPromptCommands = commandsByKey.get('onUserPromptTransformed');
	if (transformedPromptCommands?.length) {
		hooks.onUserPromptTransformed = async (input: UserPromptTransformedHookInput) => {
			return mergeUserPromptTransformedOutputs(await runHookCommands(transformedPromptCommands, input));
		};
	}

	// Session-start handler
	const startCommands = commandsByKey.get('onSessionStart');
	if (startCommands?.length) {
		hooks.onSessionStart = async (input: SessionStartHookInput) => {
			return mergeAdditionalContextOutput<SessionStartHookOutput>(await runHookCommands(startCommands, input));
		};
	}

	// Session-end handler
	const endCommands = commandsByKey.get('onSessionEnd');
	if (endCommands?.length) {
		hooks.onSessionEnd = async (input: SessionEndHookInput) => {
			await runHookCommands(endCommands, input);
		};
	}

	// Error-occurred handler
	const errorCommands = commandsByKey.get('onErrorOccurred');
	if (errorCommands?.length) {
		hooks.onErrorOccurred = async (input: ErrorOccurredHookInput) => {
			await runHookCommands(errorCommands, input);
		};
	}

	const stopCommands = commandsByKey.get('onAgentStop');
	if (stopCommands?.length) {
		hooks.onAgentStop = async (input: AgentStopHookInput) => {
			return mergeAgentStopOutputs(await runHookCommands(stopCommands, input));
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
			format: p.format,
			hooks: p.hooks.map(h => ({ type: h.type, originalId: h.originalId, commands: h.commands.map(c => ({ command: c.command, windows: c.windows, linux: c.linux, osx: c.osx, cwd: c.cwd?.toString(), env: c.env, timeout: c.timeout, matcher: c.matcher })) })),
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
