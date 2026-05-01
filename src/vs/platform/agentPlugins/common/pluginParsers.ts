/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as parseJSONC } from '../../../base/common/json.js';
import { cloneAndChange } from '../../../base/common/objects.js';
import { isAbsolute } from '../../../base/common/path.js';
import { untildify } from '../../../base/common/labels.js';
import { basename, extname, isEqualOrParent, joinPath, normalizePath } from '../../../base/common/resources.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { hasKey, Mutable } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { IMcpRemoteServerConfiguration, IMcpServerConfiguration, IMcpStdioServerConfiguration, McpServerType } from '../../mcp/common/mcpPlatformTypes.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single hook command to execute. Platform resolution happens at conversion time. */
export interface IParsedHookCommand {
	/** Cross-platform default command. */
	readonly command?: string;
	/** Windows-specific command. */
	readonly windows?: string;
	/** Linux-specific command. */
	readonly linux?: string;
	/** macOS-specific command. */
	readonly osx?: string;
	/** Working directory. */
	readonly cwd?: URI;
	/** Environment variables. */
	readonly env?: Record<string, string>;
	/** Timeout in seconds. */
	readonly timeout?: number;
	/** URI of the file this hook was defined in. */
	readonly sourceUri?: URI;
}

/** A group of hooks for a single lifecycle event. */
export interface IParsedHookGroup {
	/** Canonical hook type identifier (e.g. `'SessionStart'`, `'PreToolUse'`). */
	readonly type: string;
	/** The commands to execute for this hook type. */
	readonly commands: readonly IParsedHookCommand[];
	/** URI where this hook is defined. */
	readonly uri: URI;
	/** Original key as it appears in the hook file. */
	readonly originalId: string;
}

export interface IMcpServerDefinition {
	readonly name: string;
	readonly configuration: IMcpServerConfiguration;
	readonly uri: URI;
}

/** A named resource (skill, agent, command, or instruction) within a plugin. */
export interface INamedPluginResource {
	readonly uri: URI;
	readonly name: string;
}

/** The result of parsing a single plugin directory. */
export interface IParsedPlugin {
	readonly hooks: readonly IParsedHookGroup[];
	readonly mcpServers: readonly IMcpServerDefinition[];
	readonly skills: readonly INamedPluginResource[];
	readonly agents: readonly INamedPluginResource[];
}

// ---------------------------------------------------------------------------
// Plugin format detection
// ---------------------------------------------------------------------------

export const enum PluginFormat {
	Copilot,
	Claude,
	OpenPlugin,
}

export interface IPluginFormatConfig {
	readonly format: PluginFormat;
	readonly manifestPath: string;
	readonly hookConfigPath: string;
	readonly pluginRootToken: string | undefined;
	readonly pluginRootEnvVar: string | undefined;
	/** Parses hooks from a JSON object using the format's conventions. */
	parseHooks(hookUri: URI, json: unknown, pluginUri: URI, workspaceRoot: URI | undefined, userHome: string): IParsedHookGroup[];
}

const COPILOT_FORMAT: IPluginFormatConfig = {
	format: PluginFormat.Copilot,
	manifestPath: 'plugin.json',
	hookConfigPath: 'hooks.json',
	pluginRootToken: undefined,
	pluginRootEnvVar: undefined,
	parseHooks(hookUri, json, _pluginUri, workspaceRoot, userHome) {
		return parseHooksJson(hookUri, json, workspaceRoot, userHome);
	},
};

const CLAUDE_FORMAT: IPluginFormatConfig = {
	format: PluginFormat.Claude,
	manifestPath: '.claude-plugin/plugin.json',
	hookConfigPath: 'hooks/hooks.json',
	pluginRootToken: '${CLAUDE_PLUGIN_ROOT}',
	pluginRootEnvVar: 'CLAUDE_PLUGIN_ROOT',
	parseHooks(hookUri, json, pluginUri, workspaceRoot, userHome) {
		return interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, '${CLAUDE_PLUGIN_ROOT}', 'CLAUDE_PLUGIN_ROOT');
	},
};

const OPEN_PLUGIN_FORMAT: IPluginFormatConfig = {
	format: PluginFormat.OpenPlugin,
	manifestPath: '.plugin/plugin.json',
	hookConfigPath: 'hooks/hooks.json',
	pluginRootToken: '${PLUGIN_ROOT}',
	pluginRootEnvVar: 'PLUGIN_ROOT',
	parseHooks(hookUri, json, pluginUri, workspaceRoot, userHome) {
		return interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, '${PLUGIN_ROOT}', 'PLUGIN_ROOT');
	},
};

export async function detectPluginFormat(pluginUri: URI, fileService: IFileService): Promise<IPluginFormatConfig> {
	if (await pathExists(joinPath(pluginUri, '.plugin', 'plugin.json'), fileService)) {
		return OPEN_PLUGIN_FORMAT;
	}

	const isInClaudeDirectory = pluginUri.path.split('/').includes('.claude');
	if (isInClaudeDirectory || await pathExists(joinPath(pluginUri, '.claude-plugin', 'plugin.json'), fileService)) {
		return CLAUDE_FORMAT;
	}

	return COPILOT_FORMAT;
}

// ---------------------------------------------------------------------------
// Component path config
// ---------------------------------------------------------------------------

export interface IComponentPathConfig {
	readonly paths: readonly string[];
	readonly exclusive: boolean;
}

const emptyComponentPathConfig: IComponentPathConfig = { paths: [], exclusive: false };

/**
 * Parses a manifest component path field into a normalized config.
 * Supports `undefined`, `string`, `string[]`, and `{ paths: string[], exclusive?: boolean }`.
 */
export function parseComponentPathConfig(raw: unknown): IComponentPathConfig {
	if (raw === undefined || raw === null) {
		return emptyComponentPathConfig;
	}

	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		return trimmed ? { paths: [trimmed], exclusive: false } : emptyComponentPathConfig;
	}

	if (Array.isArray(raw)) {
		const paths = raw
			.filter(v => typeof v === 'string')
			.map(v => v.trim())
			.filter(v => v.length > 0);
		return { paths, exclusive: false };
	}

	if (typeof raw === 'object') {
		const obj = raw as Record<string, unknown>;
		if (Array.isArray(obj['paths'])) {
			const paths = (obj['paths'] as unknown[])
				.filter(v => typeof v === 'string')
				.map(v => v.trim())
				.filter(v => v.length > 0);
			const exclusive = obj['exclusive'] === true;
			return { paths, exclusive };
		}
	}

	return emptyComponentPathConfig;
}

/**
 * Resolves the directories to scan for a given component type, combining
 * the default directory with any custom paths from the manifest config.
 * Paths that resolve outside the boundary are silently ignored.
 * @param boundaryUri The outermost directory that resolved paths must stay within. Defaults to {@link pluginUri}.
 */
export function resolveComponentDirs(pluginUri: URI, defaultDir: string, config: IComponentPathConfig, boundaryUri?: URI): readonly URI[] {
	const boundary = (boundaryUri && isEqualOrParent(pluginUri, boundaryUri)) ? boundaryUri : pluginUri;
	const dirs: URI[] = [];
	if (!config.exclusive) {
		dirs.push(joinPath(pluginUri, defaultDir));
	}
	for (const p of config.paths) {
		const resolved = normalizePath(joinPath(pluginUri, p));
		if (isEqualOrParent(resolved, boundary)) {
			dirs.push(resolved);
		}
	}
	return dirs;
}

// ---------------------------------------------------------------------------
// MCP server helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the MCP server map from a raw JSON value. Accepts both the
 * wrapped format `{ mcpServers: { … } }` and the flat format.
 */
export function resolveMcpServersMap(raw: unknown): Record<string, unknown> | undefined {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return undefined;
	}
	const obj = raw as Record<string, unknown>;
	return Object.hasOwn(obj, 'mcpServers')
		? (obj.mcpServers as Record<string, unknown>)
		: obj;
}

/**
 * Normalizes a raw JSON value into a typed MCP server configuration.
 */
export function normalizeMcpServerConfiguration(rawConfig: unknown): IMcpServerConfiguration | undefined {
	if (!rawConfig || typeof rawConfig !== 'object') {
		return undefined;
	}

	const candidate = rawConfig as Record<string, unknown>;
	const type = typeof candidate['type'] === 'string' ? candidate['type'] : undefined;

	const command = typeof candidate['command'] === 'string' ? candidate['command'] : undefined;
	const url = typeof candidate['url'] === 'string' ? candidate['url'] : undefined;
	const args = Array.isArray(candidate['args']) ? candidate['args'].filter((value): value is string => typeof value === 'string') : undefined;
	const env = candidate['env'] && typeof candidate['env'] === 'object'
		? Object.fromEntries(Object.entries(candidate['env'] as Record<string, unknown>)
			.filter(([, value]) => typeof value === 'string' || typeof value === 'number' || value === null)
			.map(([key, value]) => [key, value as string | number | null]))
		: undefined;
	const envFile = typeof candidate['envFile'] === 'string' ? candidate['envFile'] : undefined;
	const cwd = typeof candidate['cwd'] === 'string' ? candidate['cwd'] : undefined;
	const headers = candidate['headers'] && typeof candidate['headers'] === 'object'
		? Object.fromEntries(Object.entries(candidate['headers'] as Record<string, unknown>)
			.filter(([, value]) => typeof value === 'string')
			.map(([key, value]) => [key, value as string]))
		: undefined;
	const dev = candidate['dev'] && typeof candidate['dev'] === 'object' ? candidate['dev'] as IMcpStdioServerConfiguration['dev'] : undefined;

	if (type === 'ws') {
		return undefined;
	}

	if (type === McpServerType.LOCAL || (!type && command)) {
		if (!command) {
			return undefined;
		}
		return { type: McpServerType.LOCAL, command, args, env, envFile, cwd, dev };
	}

	if (type === McpServerType.REMOTE || type === 'sse' || (!type && url)) {
		if (!url) {
			return undefined;
		}
		return { type: McpServerType.REMOTE, url, headers, dev };
	}

	return undefined;
}

/**
 * Characters in a file path that require shell quoting to prevent
 * word splitting or interpretation by common shells.
 */
const shellUnsafeChars = /[\s&|<>()^;!`"']/;

/**
 * Replaces a plugin-root token in a shell command string with the
 * given fsPath, shell-quoting if the path contains special characters.
 */
export function shellQuotePluginRootInCommand(command: string, fsPath: string, token: string) {
	if (!command.includes(token)) {
		return command;
	}

	if (!shellUnsafeChars.test(fsPath)) {
		return command.replaceAll(token, fsPath);
	}

	const escapedToken = escapeRegExpCharacters(token);
	const pattern = new RegExp(
		`(["']?)` + escapedToken + `([\\w./\\\\~:-]*)`,
		'g',
	);

	return command.replace(pattern, (_match, leadingQuote: string, suffix: string) => {
		const fullPath = fsPath + suffix;
		if (leadingQuote) {
			return leadingQuote + fullPath;
		}
		return '"' + fullPath.replace(/"/g, '\\"') + '"';
	});
}

/**
 * Replaces plugin-root token references in MCP server definition string fields
 * with the plugin root filesystem path.
 */
export function interpolateMcpPluginRoot(
	def: IMcpServerDefinition,
	fsPath: string,
	token: string,
	envVar: string,
): IMcpServerDefinition {
	const replace = (s: string) => s.replaceAll(token, fsPath);

	const config = def.configuration;
	let interpolated: IMcpServerConfiguration;

	if (config.type === McpServerType.LOCAL) {
		const local: Mutable<IMcpStdioServerConfiguration> = { ...config };
		local.command = replace(local.command);
		if (local.args) {
			local.args = local.args.map(replace);
		}
		if (local.cwd) {
			local.cwd = replace(local.cwd);
		}
		local.env = { ...local.env };
		for (const [k, v] of Object.entries(local.env)) {
			if (typeof v === 'string') {
				local.env[k] = replace(v);
			}
		}
		local.env[envVar] = fsPath;
		if (local.envFile) {
			local.envFile = replace(local.envFile);
		}
		interpolated = local;
	} else {
		const remote: Mutable<IMcpRemoteServerConfiguration> = { ...config };
		remote.url = replace(remote.url);
		if (remote.headers) {
			remote.headers = Object.fromEntries(
				Object.entries(remote.headers).map(([k, v]) => [k, replace(v)])
			);
		}
		interpolated = remote;
	}

	return { name: def.name, configuration: interpolated, uri: def.uri };
}

/**
 * Regex matching bare `${VAR_NAME}` references (uppercase only) that are NOT
 * using VS Code's `${env:VAR}` colon-delimited syntax.
 */
const BARE_ENV_VAR_RE = /\$\{(?![A-Za-z]+:)([A-Z_][A-Z0-9_]*)\}/g;

/**
 * Converts bare `${VAR}` environment-variable references to VS Code `${env:VAR}` syntax.
 */
export function convertBareEnvVarsToVsCodeSyntax(
	def: IMcpServerDefinition,
): IMcpServerDefinition {
	return cloneAndChange(def, (value) => {
		if (URI.isUri(value)) {
			return value;
		}
		if (typeof value === 'string') {
			const replaced = value.replace(BARE_ENV_VAR_RE, '${env:$1}');
			return replaced !== value ? replaced : undefined;
		}
		return undefined;
	});
}

// ---------------------------------------------------------------------------
// Hook parsing helpers
// ---------------------------------------------------------------------------

/**
 * Maps known hook type identifiers from all formats (VS Code PascalCase,
 * Copilot CLI camelCase, Claude PascalCase) to canonical identifiers.
 */
const HOOK_TYPE_MAP: Record<string, string> = {
	// PascalCase (VS Code / Claude)
	'SessionStart': 'SessionStart',
	'SessionEnd': 'SessionEnd',
	'UserPromptSubmit': 'UserPromptSubmit',
	'PreToolUse': 'PreToolUse',
	'PostToolUse': 'PostToolUse',
	'PreCompact': 'PreCompact',
	'SubagentStart': 'SubagentStart',
	'SubagentStop': 'SubagentStop',
	'Stop': 'Stop',
	'ErrorOccurred': 'ErrorOccurred',
	// camelCase (GitHub Copilot CLI)
	'sessionStart': 'SessionStart',
	'sessionEnd': 'SessionEnd',
	'userPromptSubmitted': 'UserPromptSubmit',
	'preToolUse': 'PreToolUse',
	'postToolUse': 'PostToolUse',
	'agentStop': 'Stop',
	'subagentStop': 'SubagentStop',
	'errorOccurred': 'ErrorOccurred',
};

/**
 * Normalizes a raw hook command object, validating structure and mapping
 * legacy `bash`/`powershell` fields to platform-specific overrides.
 */
function normalizeHookCommand(raw: Record<string, unknown>): IParsedHookCommand | undefined {
	// Allow omitted type (Claude compatibility) — treat as 'command'
	if (raw.type !== undefined && raw.type !== 'command') {
		return undefined;
	}

	const hasCommand = typeof raw.command === 'string' && raw.command.length > 0;
	const hasBash = typeof raw.bash === 'string' && (raw.bash as string).length > 0;
	const hasPowerShell = typeof raw.powershell === 'string' && (raw.powershell as string).length > 0;
	const hasWindows = typeof raw.windows === 'string' && (raw.windows as string).length > 0;
	const hasLinux = typeof raw.linux === 'string' && (raw.linux as string).length > 0;
	const hasOsx = typeof raw.osx === 'string' && (raw.osx as string).length > 0;

	if (!hasCommand && !hasBash && !hasPowerShell && !hasWindows && !hasLinux && !hasOsx) {
		return undefined;
	}

	const windows = hasWindows ? raw.windows as string : (hasPowerShell ? raw.powershell as string : undefined);
	const linux = hasLinux ? raw.linux as string : (hasBash ? raw.bash as string : undefined);
	const osx = hasOsx ? raw.osx as string : (hasBash ? raw.bash as string : undefined);

	const timeout = typeof raw.timeout === 'number'
		? raw.timeout
		: (typeof raw.timeoutSec === 'number' ? raw.timeoutSec : undefined);

	return {
		...(hasCommand && { command: raw.command as string }),
		...(windows && { windows }),
		...(linux && { linux }),
		...(osx && { osx }),
		...(typeof raw.env === 'object' && raw.env !== null && { env: raw.env as Record<string, string> }),
		...(timeout !== undefined && { timeout }),
	};
}

/**
 * Resolves a raw hook command JSON object into a {@link IParsedHookCommand},
 * normalizing fields and resolving the working directory.
 */
function resolveHookCommand(raw: Record<string, unknown>, workspaceRoot: URI | undefined, userHome: string): IParsedHookCommand | undefined {
	const normalized = normalizeHookCommand(raw);
	if (!normalized) {
		return undefined;
	}

	let cwdUri: URI | undefined;
	const rawCwd = typeof raw.cwd === 'string' ? raw.cwd : undefined;
	if (rawCwd) {
		const expanded = untildify(rawCwd, userHome);
		if (isAbsolute(expanded)) {
			cwdUri = URI.file(expanded);
		} else if (workspaceRoot) {
			cwdUri = joinPath(workspaceRoot, expanded);
		}
	} else {
		cwdUri = workspaceRoot;
	}

	return { ...normalized, cwd: cwdUri };
}

/**
 * Extracts hook commands from an item that may be a direct command object
 * or a nested structure with a `matcher` (Claude format).
 */
function extractHookCommands(item: unknown, workspaceRoot: URI | undefined, userHome: string): IParsedHookCommand[] {
	if (!item || typeof item !== 'object') {
		return [];
	}

	const itemObj = item as Record<string, unknown>;
	const commands: IParsedHookCommand[] = [];

	// Nested hooks with matcher (Claude style): { matcher: "...", hooks: [...] }
	const nestedHooks = itemObj.hooks;
	if (nestedHooks !== undefined && Array.isArray(nestedHooks)) {
		for (const nested of nestedHooks) {
			if (!nested || typeof nested !== 'object') {
				continue;
			}
			const resolved = resolveHookCommand(nested as Record<string, unknown>, workspaceRoot, userHome);
			if (resolved) {
				commands.push(resolved);
			}
		}
	} else {
		const resolved = resolveHookCommand(itemObj, workspaceRoot, userHome);
		if (resolved) {
			commands.push(resolved);
		}
	}

	return commands;
}

/**
 * Parses hooks from a JSON object (any supported format).
 */
function parseHooksJson(
	hookUri: URI,
	json: unknown,
	workspaceRoot: URI | undefined,
	userHome: string,
): IParsedHookGroup[] {
	if (!json || typeof json !== 'object') {
		return [];
	}

	const root = json as Record<string, unknown>;

	// Claude's disableAllHooks
	if (root.disableAllHooks === true) {
		return [];
	}

	const hooks = root.hooks;
	if (!hooks || typeof hooks !== 'object') {
		return [];
	}

	const hooksObj = hooks as Record<string, unknown>;
	const result: IParsedHookGroup[] = [];

	for (const originalId of Object.keys(hooksObj)) {
		const canonicalType = HOOK_TYPE_MAP[originalId];
		if (!canonicalType) {
			continue;
		}

		const hookArray = hooksObj[originalId];
		if (!Array.isArray(hookArray)) {
			continue;
		}

		const commands: IParsedHookCommand[] = [];
		for (const item of hookArray) {
			commands.push(...extractHookCommands(item, workspaceRoot, userHome));
		}

		if (commands.length > 0) {
			result.push({ type: canonicalType, commands, uri: hookUri, originalId });
		}
	}

	return result;
}

/**
 * Applies plugin-root token interpolation to hook commands for
 * Claude and OpenPlugin formats.
 */
export function interpolateHookPluginRoot(
	hookUri: URI,
	json: unknown,
	pluginUri: URI,
	workspaceRoot: URI | undefined,
	userHome: string,
	token: string,
	envVar: string,
): IParsedHookGroup[] {
	const fsPath = pluginUri.fsPath;
	const typedJson = json as { hooks?: Record<string, unknown[]> };

	const mutateHookCommand = (hook: Record<string, unknown>): void => {
		for (const field of ['command', 'windows', 'linux', 'osx'] as const) {
			if (typeof hook[field] === 'string') {
				hook[field] = shellQuotePluginRootInCommand(hook[field] as string, fsPath, token);
			}
		}

		if (!hook.env || typeof hook.env !== 'object') {
			hook.env = {};
		}
		(hook.env as Record<string, string>)[envVar] = fsPath;
	};

	for (const lifecycle of Object.values(typedJson.hooks ?? {})) {
		if (!Array.isArray(lifecycle)) {
			continue;
		}
		for (const lifecycleEntry of lifecycle) {
			if (!lifecycleEntry || typeof lifecycleEntry !== 'object') {
				continue;
			}
			const entry = lifecycleEntry as { hooks?: Record<string, unknown>[] } & Record<string, unknown>;
			if (Array.isArray(entry.hooks)) {
				for (const hook of entry.hooks) {
					mutateHookCommand(hook);
				}
			} else {
				mutateHookCommand(entry);
			}
		}
	}

	const replacer = (v: unknown): unknown => {
		return typeof v === 'string'
			? v.replaceAll(token, pluginUri.fsPath)
			: undefined;
	};

	return parseHooksJson(hookUri, cloneAndChange(json, replacer), workspaceRoot, userHome);
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

export async function readJsonFile(uri: URI, fileService: IFileService): Promise<unknown | undefined> {
	try {
		const fileContents = await fileService.readFile(uri);
		return parseJSONC(fileContents.value.toString());
	} catch {
		return undefined;
	}
}

export async function pathExists(resource: URI, fileService: IFileService): Promise<boolean> {
	try {
		await fileService.resolve(resource);
		return true;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Component readers
// ---------------------------------------------------------------------------

const COMMAND_FILE_SUFFIX = '.md';

export async function readSkills(pluginRoot: URI, dirs: readonly URI[], fileService: IFileService): Promise<readonly INamedPluginResource[]> {
	const seen = new Set<string>();
	const skills: INamedPluginResource[] = [];

	const addSkill = (name: string, skillMd: URI) => {
		if (!seen.has(name)) {
			seen.add(name);
			skills.push({ uri: skillMd, name });
		}
	};

	for (const dir of dirs) {
		const skillMd = URI.joinPath(dir, 'SKILL.md');
		if (await pathExists(skillMd, fileService)) {
			addSkill(basename(dir), skillMd);
			continue;
		}

		let stat;
		try {
			stat = await fileService.resolve(dir);
		} catch {
			continue;
		}

		if (!stat.isDirectory || !stat.children) {
			continue;
		}

		for (const child of stat.children) {
			const childSkillMd = URI.joinPath(child.resource, 'SKILL.md');
			if (await pathExists(childSkillMd, fileService)) {
				addSkill(basename(child.resource), childSkillMd);
			}
		}
	}

	if (skills.length === 0) {
		const rootSkillMd = URI.joinPath(pluginRoot, 'SKILL.md');
		if (await pathExists(rootSkillMd, fileService)) {
			addSkill(basename(pluginRoot), rootSkillMd);
		}
	}

	skills.sort((a, b) => a.name.localeCompare(b.name));
	return skills;
}

export async function readMarkdownComponents(dirs: readonly URI[], fileService: IFileService): Promise<readonly INamedPluginResource[]> {
	const seen = new Set<string>();
	const items: INamedPluginResource[] = [];

	const addItem = (name: string, uri: URI) => {
		if (!seen.has(name)) {
			seen.add(name);
			items.push({ uri, name });
		}
	};

	for (const dir of dirs) {
		let stat;
		try {
			stat = await fileService.resolve(dir);
		} catch {
			continue;
		}

		if (stat.isFile && extname(dir).toLowerCase() === COMMAND_FILE_SUFFIX) {
			addItem(basename(dir).slice(0, -COMMAND_FILE_SUFFIX.length), dir);
			continue;
		}

		if (!stat.isDirectory || !stat.children) {
			continue;
		}

		for (const child of stat.children) {
			if (!child.isFile || extname(child.resource).toLowerCase() !== COMMAND_FILE_SUFFIX) {
				continue;
			}
			addItem(basename(child.resource).slice(0, -COMMAND_FILE_SUFFIX.length), child.resource);
		}
	}

	items.sort((a, b) => a.name.localeCompare(b.name));
	return items;
}

async function readHooks(
	pluginUri: URI,
	paths: readonly URI[],
	formatConfig: IPluginFormatConfig,
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	userHome: string,
): Promise<readonly IParsedHookGroup[]> {
	for (const hookPath of paths) {
		const json = await readJsonFile(hookPath, fileService);
		if (!json) {
			continue;
		}

		return formatConfig.parseHooks(hookPath, json, pluginUri, workspaceRoot, userHome);
	}
	return [];
}

async function readMcpServers(
	paths: readonly URI[],
	pluginFsPath: string,
	formatConfig: IPluginFormatConfig,
	fileService: IFileService,
): Promise<readonly IMcpServerDefinition[]> {
	const merged = new Map<string, IMcpServerDefinition>();
	for (const mcpPath of paths) {
		const json = await readJsonFile(mcpPath, fileService);
		for (const def of parseMcpServerDefinitionMap(mcpPath, json, pluginFsPath, formatConfig)) {
			if (!merged.has(def.name)) {
				merged.set(def.name, def);
			}
		}
	}
	return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function parseMcpServerDefinitionMap(
	definitionURI: URI,
	raw: unknown,
	pluginFsPath: string,
	formatConfig: IPluginFormatConfig,
): IMcpServerDefinition[] {
	const mcpServers = resolveMcpServersMap(raw);
	if (!mcpServers) {
		return [];
	}

	const definitions: IMcpServerDefinition[] = [];
	for (const [name, configValue] of Object.entries(mcpServers)) {
		const configuration = normalizeMcpServerConfiguration(configValue);
		if (!configuration) {
			continue;
		}

		let def: IMcpServerDefinition = { name, configuration, uri: definitionURI };
		if (formatConfig.pluginRootToken && formatConfig.pluginRootEnvVar) {
			def = interpolateMcpPluginRoot(def, pluginFsPath, formatConfig.pluginRootToken, formatConfig.pluginRootEnvVar);
		}
		def = convertBareEnvVarsToVsCodeSyntax(def);
		definitions.push(def);
	}

	return definitions;
}

// ---------------------------------------------------------------------------
// Top-level parse function
// ---------------------------------------------------------------------------

/**
 * Parses a plugin directory to extract hooks, MCP servers, skills, and agents.
 * This is the main entry point for the agent host to discover plugin contents.
 */
export async function parsePlugin(
	pluginUri: URI,
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	userHome: string,
	boundaryUri?: URI,
): Promise<IParsedPlugin> {
	const formatConfig = await detectPluginFormat(pluginUri, fileService);

	// Read manifest
	const manifestJson = await readJsonFile(joinPath(pluginUri, formatConfig.manifestPath), fileService);
	const manifest = (manifestJson && typeof manifestJson === 'object') ? manifestJson as Record<string, unknown> : undefined;

	// Resolve component directories from manifest
	const hookDirs = resolveComponentDirs(pluginUri, formatConfig.hookConfigPath, parseComponentPathConfig(manifest?.['hooks']), boundaryUri);
	const mcpDirs = resolveComponentDirs(pluginUri, '.mcp.json', parseComponentPathConfig(manifest?.['mcpServers']), boundaryUri);
	const skillDirs = resolveComponentDirs(pluginUri, 'skills', parseComponentPathConfig(manifest?.['skills']), boundaryUri);
	const agentDirs = resolveComponentDirs(pluginUri, 'agents', parseComponentPathConfig(manifest?.['agents']), boundaryUri);

	// Handle embedded MCP servers in manifest
	let embeddedMcp: IMcpServerDefinition[] = [];
	const mcpSection = manifest?.['mcpServers'];
	if (mcpSection && typeof mcpSection === 'object' && !Array.isArray(mcpSection) && !(hasKey(mcpSection, { paths: true }))) {
		embeddedMcp = parseMcpServerDefinitionMap(
			joinPath(pluginUri, formatConfig.manifestPath),
			{ mcpServers: mcpSection },
			pluginUri.fsPath,
			formatConfig,
		);
	}

	// Handle embedded hooks in manifest
	let embeddedHooks: IParsedHookGroup[] = [];
	const hooksSection = manifest?.['hooks'];
	if (hooksSection && typeof hooksSection === 'object' && !Array.isArray(hooksSection) && !(hasKey(hooksSection, { paths: true }))) {
		const manifestUri = joinPath(pluginUri, formatConfig.manifestPath);
		embeddedHooks = formatConfig.parseHooks(manifestUri, { hooks: hooksSection }, pluginUri, workspaceRoot, userHome);
	}

	const [hooks, mcpServers, skills, agents] = await Promise.all([
		embeddedHooks.length > 0
			? Promise.resolve(embeddedHooks)
			: readHooks(pluginUri, hookDirs, formatConfig, fileService, workspaceRoot, userHome),
		embeddedMcp.length > 0
			? Promise.resolve(embeddedMcp)
			: readMcpServers(mcpDirs, pluginUri.fsPath, formatConfig, fileService),
		readSkills(pluginUri, skillDirs, fileService),
		readMarkdownComponents(agentDirs, fileService),
	]);

	return { hooks, mcpServers, skills, agents };
}

