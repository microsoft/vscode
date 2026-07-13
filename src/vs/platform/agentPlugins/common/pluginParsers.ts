/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as parseJSONC } from '../../../base/common/json.js';
import { cloneAndChange, equals as objectEquals } from '../../../base/common/objects.js';
import { isAbsolute } from '../../../base/common/path.js';
import { basename, extname, isEqualOrParent, joinPath, normalizePath, isEqual as isURLEquals, dirname } from '../../../base/common/resources.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { hasKey, Mutable } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { parseFrontMatter } from '../../../base/common/yaml.js';
import { IMcpRemoteServerConfiguration, IMcpServerConfiguration, IMcpStdioServerConfiguration, McpServerType } from '../../mcp/common/mcpPlatformTypes.js';
import { CustomizationType, McpServerStatus, type AgentCustomization, type HookCustomization, type McpServerCustomization, type RuleCustomization, type SkillCustomization } from '../../agentHost/common/state/protocol/state.js';
import { DEFAULT_MCP_APP } from '../../agentHost/common/state/protocol/mcpAppDefaults.js';
import { customizationId } from '../../agentHost/common/state/sessionState.js';

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

export namespace IParsedHookCommand {
	export function isEquals(a: IParsedHookCommand | undefined, b: IParsedHookCommand | undefined): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.command === b.command
			&& a.windows === b.windows
			&& a.linux === b.linux
			&& a.osx === b.osx
			&& isURLEquals(a.cwd, b.cwd)
			&& objectEquals(a.env, b.env)
			&& a.timeout === b.timeout
			&& isURLEquals(a.sourceUri, b.sourceUri);
	}
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
	/**
	 * Protocol-level projection of this hook group as a child customization.
	 * Multiple groups parsed from the same file share the same `customization.id`
	 * so consumers can dedupe by id when collecting customizations.
	 */
	readonly customization: HookCustomization;
}

export interface IMcpServerDefinition {
	readonly name: string;
	readonly configuration: IMcpServerConfiguration;
	readonly uri: URI;
	/** Protocol-level projection of this MCP server as a child customization. */
	readonly customization: McpServerCustomization;
}

/** A named resource (skill, agent, command, or instruction) within a plugin. */
export interface INamedPluginResource {
	readonly uri: URI;
	readonly name: string;
	/**
	 * Optional short description, populated for resources whose readers
	 * parse it from the file's YAML frontmatter (e.g. agents).
	 */
	readonly description?: string;
}

/** A parsed agent paired with its protocol-level child customization. */
export interface IParsedAgent extends INamedPluginResource {
	readonly customization: AgentCustomization;
}

/** A parsed skill paired with its protocol-level child customization. */
export interface IParsedSkill extends INamedPluginResource {
	readonly customization: SkillCustomization;
}

/** A parsed rule (instruction) paired with its protocol-level child customization. */
export interface IParsedRule extends INamedPluginResource {
	readonly customization: RuleCustomization;
}

/** The result of parsing a single plugin directory. */
export interface IParsedPlugin {
	readonly hooks: readonly IParsedHookGroup[];
	readonly mcpServers: readonly IMcpServerDefinition[];
	readonly skills: readonly IParsedSkill[];
	readonly agents: readonly IParsedAgent[];
	readonly instructions: readonly IParsedRule[];
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
	readonly pluginRootTokens: readonly string[];
	readonly pluginRootEnvVars: readonly string[];
	/** Parses hooks from a JSON object using the format's conventions. */
	parseHooks(hookUri: URI, json: unknown, pluginUri: URI, workspaceRoot: URI | undefined, userHome: URI): IParsedHookGroup[];
}

const COPILOT_FORMAT: IPluginFormatConfig = {
	format: PluginFormat.Copilot,
	manifestPath: 'plugin.json',
	hookConfigPath: 'hooks.json',
	pluginRootTokens: ['${PLUGIN_ROOT}', '${CLAUDE_PLUGIN_ROOT}'],
	pluginRootEnvVars: ['PLUGIN_ROOT', 'CLAUDE_PLUGIN_ROOT'],
	parseHooks(hookUri, json, _pluginUri, workspaceRoot, userHome) {
		return parseHooksJson(hookUri, json, workspaceRoot, userHome);
	},
};

const CLAUDE_FORMAT: IPluginFormatConfig = {
	format: PluginFormat.Claude,
	manifestPath: '.claude-plugin/plugin.json',
	hookConfigPath: 'hooks/hooks.json',
	pluginRootTokens: ['${PLUGIN_ROOT}', '${CLAUDE_PLUGIN_ROOT}'],
	pluginRootEnvVars: ['PLUGIN_ROOT', 'CLAUDE_PLUGIN_ROOT'],
	parseHooks(hookUri, json, pluginUri, workspaceRoot, userHome) {
		return interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, '${CLAUDE_PLUGIN_ROOT}', 'CLAUDE_PLUGIN_ROOT');
	},
};

const OPEN_PLUGIN_FORMAT: IPluginFormatConfig = {
	format: PluginFormat.OpenPlugin,
	manifestPath: '.plugin/plugin.json',
	hookConfigPath: 'hooks/hooks.json',
	pluginRootTokens: ['${PLUGIN_ROOT}', '${CLAUDE_PLUGIN_ROOT}'],
	pluginRootEnvVars: ['PLUGIN_ROOT', 'CLAUDE_PLUGIN_ROOT'],
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
// Child customization helpers
// ---------------------------------------------------------------------------

/**
 * Mints a child-customization id from a source uri plus an optional opaque
 * disambiguator. Used when multiple customizations are declared inline in
 * a single file (e.g. two MCP servers in one `.mcp.json`, or two hook
 * lifecycle groups in one hook file).
 *
 * Percent-encodes any pre-existing `#` in the URI before appending the
 * disambiguating fragment so the resulting id can never collide with a
 * URI that happens to already contain a matching fragment.
 */
function buildChildId(uri: URI, disambiguator?: string): string {
	const base = customizationId(uri.toString());
	if (!disambiguator) {
		return base;
	}
	return `${base.replace(/#/g, '%23')}#${disambiguator}`;
}

function makeAgentCustomization(resource: INamedPluginResource): AgentCustomization {
	const uri = resource.uri.toString();
	return {
		type: CustomizationType.Agent,
		id: buildChildId(resource.uri),
		uri,
		name: resource.name,
		...(resource.description ? { description: resource.description } : {}),
	};
}

function makeSkillCustomization(resource: INamedPluginResource): SkillCustomization {
	const uri = resource.uri.toString();
	return {
		type: CustomizationType.Skill,
		id: buildChildId(resource.uri),
		uri,
		name: resource.name,
		...(resource.description ? { description: resource.description } : {}),
	};
}

function makeRuleCustomization(resource: INamedPluginResource): RuleCustomization {
	const uri = resource.uri.toString();
	return {
		type: CustomizationType.Rule,
		id: buildChildId(resource.uri),
		uri,
		name: resource.name,
		...(resource.description ? { description: resource.description } : {}),
	};
}

function makeHookCustomization(hookUri: URI): HookCustomization {
	return {
		type: CustomizationType.Hook,
		id: buildChildId(hookUri),
		uri: hookUri.toString(),
		name: basename(hookUri),
	};
}

/**
 * Builds the protocol {@link McpServerCustomization} for an MCP server
 * declared at `definitionUri` (the manifest / settings / `.mcp.json` file
 * the server is defined in). The id is disambiguated by server `name` so
 * multiple servers declared in one file get distinct ids, and the entry
 * carries {@link DEFAULT_MCP_APP} so MCP App support is advertised
 * consistently with every other MCP customization.
 */
export function makeMcpServerCustomization(definitionUri: URI, name: string): McpServerCustomization {
	return {
		type: CustomizationType.McpServer,
		id: buildChildId(definitionUri, `mcp=${encodeURIComponent(name)}`),
		uri: definitionUri.toString(),
		name,
		enabled: true,
		state: { kind: McpServerStatus.Starting },
		mcpApp: DEFAULT_MCP_APP,
	};
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
	tokens: readonly string[],
	envVars: readonly string[],
): IMcpServerDefinition {
	const replace = (s: string) => tokens.reduce((result, token) => result.replaceAll(token, fsPath), s);

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
		for (const envVar of envVars) {
			local.env[envVar] = fsPath;
		}
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

	return { name: def.name, configuration: interpolated, uri: def.uri, customization: def.customization };
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
function resolveHookCommand(raw: Record<string, unknown>, workspaceRoot: URI | undefined, userHome: URI): IParsedHookCommand | undefined {
	const normalized = normalizeHookCommand(raw);
	if (!normalized) {
		return undefined;
	}

	let cwdUri: URI | undefined;
	const rawCwd = typeof raw.cwd === 'string' ? raw.cwd : undefined;
	if (rawCwd) {
		if (rawCwd.startsWith('~/')) {
			cwdUri = URI.joinPath(userHome, rawCwd.substring(2));
		} else if (isAbsolute(rawCwd)) {
			cwdUri = URI.file(rawCwd);
		} else if (workspaceRoot) {
			cwdUri = joinPath(workspaceRoot, rawCwd);
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
function extractHookCommands(item: unknown, workspaceRoot: URI | undefined, userHome: URI): IParsedHookCommand[] {
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
 *
 * Handles Claude's `disableAllHooks` short-circuit, the `HOOK_TYPE_MAP`
 * canonicalization, and the nested `{ matcher, hooks: [...] }` command
 * form. Returns one {@link IParsedHookGroup} per recognized lifecycle
 * event; all groups parsed from the same file share a single
 * {@link IParsedHookGroup.customization} (keyed on `hookUri`), so callers
 * that only need the file-level customization can read it off any group.
 */
export function parseHooksJson(
	hookUri: URI,
	json: unknown,
	workspaceRoot: URI | undefined,
	userHome: URI,
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
	const customization = makeHookCustomization(hookUri);

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
			result.push({ type: canonicalType, commands, uri: hookUri, originalId, customization });
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
	userHome: URI,
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
const RULE_FILE_SUFFIX = '.mdc';
const INSTRUCTION_FILE_SUFFIX = '.instructions.md';

export async function readSkills(pluginRoot: URI, dirs: readonly URI[], fileService: IFileService): Promise<readonly INamedPluginResource[]> {
	const seen = new Set<string>();
	const skills: INamedPluginResource[] = [];

	const addSkill = async (name: string, skillMd: URI) => {
		let description: string | undefined;
		try {
			const parsedInfo = await parseSkillFile(skillMd, fileService);
			description = parsedInfo.description;
			name = parsedInfo.name || name;
		} catch {
			// Keep the existing best-effort discovery behavior for malformed skills.
		}
		if (seen.has(name)) {
			return;
		}
		seen.add(name);
		skills.push({ uri: skillMd, name, ...(description ? { description } : {}) });
	};

	await Promise.all(dirs.map(async dir => {
		const skillMd = URI.joinPath(dir, 'SKILL.md');
		if (await pathExists(skillMd, fileService)) {
			await addSkill(basename(dir), skillMd);
			return;
		}

		let stat;
		try {
			stat = await fileService.resolve(dir);
		} catch {
			return;
		}

		if (!stat.isDirectory || !stat.children) {
			return;
		}

		await Promise.all(stat.children.map(async child => {
			const childSkillMd = URI.joinPath(child.resource, 'SKILL.md');
			if (await pathExists(childSkillMd, fileService)) {
				await addSkill(basename(child.resource), childSkillMd);
			}
		}));
	}));

	if (skills.length === 0) {
		const rootSkillMd = URI.joinPath(pluginRoot, 'SKILL.md');
		if (await pathExists(rootSkillMd, fileService)) {
			await addSkill(basename(pluginRoot), rootSkillMd);
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

function getInstructionFileName(resource: URI): string | undefined {
	const fileName = basename(resource);
	const lowerName = fileName.toLowerCase();
	if (lowerName.endsWith(RULE_FILE_SUFFIX)) {
		return fileName.slice(0, -RULE_FILE_SUFFIX.length);
	}
	if (lowerName.endsWith(INSTRUCTION_FILE_SUFFIX)) {
		return fileName.slice(0, -INSTRUCTION_FILE_SUFFIX.length);
	}
	return undefined;
}

/**
 * Reads rule/instruction files from plugin `rules` component directories.
 *
 * Open Plugins rules are conventionally `.mdc` files. We also accept
 * `.instructions.md` for compatibility with VS Code-discovered instructions
 * bundled as synthetic plugins.
 */
export async function readInstructionComponents(dirs: readonly URI[], fileService: IFileService): Promise<readonly INamedPluginResource[]> {
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

		if (stat.isFile) {
			const instructionName = getInstructionFileName(dir);
			if (instructionName) {
				addItem(instructionName, dir);
			}
			continue;
		}

		if (!stat.isDirectory || !stat.children) {
			continue;
		}

		for (const child of stat.children) {
			if (!child.isFile) {
				continue;
			}
			const instructionName = getInstructionFileName(child.resource);
			if (instructionName) {
				addItem(instructionName, child.resource);
			}
		}
	}

	items.sort((a, b) => a.name.localeCompare(b.name));
	return items;
}

/**
 * Reads `.md` files in agent directories and enriches each entry with
 * the optional `name` / `description` from YAML frontmatter. Falls back
 * to the file-derived name when frontmatter is missing or unreadable.
 */
export async function readAgentComponents(dirs: readonly URI[], fileService: IFileService): Promise<readonly INamedPluginResource[]> {
	const files = await readMarkdownComponents(dirs, fileService);
	if (files.length === 0) {
		return files;
	}
	const enriched = await Promise.all(files.map(async file => {
		try {
			const { name, description } = await parseAgentFile(file.uri, fileService);
			return {
				uri: file.uri,
				name: name || file.name,
				...(description ? { description } : {}),
			} satisfies INamedPluginResource;
		} catch {
			return file;
		}
	}));
	// De-dupe again in case frontmatter `name` collides; first-seen wins.
	const seen = new Set<string>();
	const result: INamedPluginResource[] = [];
	for (const item of enriched) {
		if (seen.has(item.name)) {
			continue;
		}
		seen.add(item.name);
		result.push(item);
	}
	result.sort((a, b) => a.name.localeCompare(b.name));
	return result;
}

export async function parseAgentFile(uri: URI, fileService: IFileService): Promise<{ name: string; description?: string; userInvocable?: boolean }> {
	// Use regex to strip the trailing `.agent.md` or .md before parsing, so we can fall back to a cleaner name if frontmatter is missing or broken.
	const nameFromFile = basename(uri).replace(/(\.agent)?\.md$/i, '');
	try {
		const content = await fileService.readFile(uri);
		const frontmatter = parseFrontMatter(content.value.toString());
		const name = frontmatter?.getStringValue('name')?.trim() || nameFromFile;
		const description = frontmatter?.getStringValue('description')?.trim();
		const userInvocable = frontmatter?.getBooleanValue('user-invocable');
		return { name, description, userInvocable };
	} catch {
		return { name: nameFromFile };
	}
}

export async function parseSkillFile(uri: URI, fileService: IFileService): Promise<{ name: string; description?: string; userInvokable?: boolean }> {
	try {
		const content = await fileService.readFile(uri);
		const frontmatter = parseFrontMatter(content.value.toString());
		const name = frontmatter?.getStringValue('name')?.trim() || basename(dirname(uri));
		const description = frontmatter?.getStringValue('description')?.trim();
		const userInvokable = frontmatter?.getBooleanValue('user-invocable');
		return { name, description, userInvokable };
	} catch {
		return { name: basename(dirname(uri)) };
	}
}

export async function parseRuleFile(uri: URI, fileService: IFileService): Promise<{ name: string; description?: string; globs?: string[]; alwaysApply?: boolean }> {
	const nameFromFile = basename(uri).replace(/(\.instructions)?\.md$/i, '');
	try {
		const content = await fileService.readFile(uri);
		const frontmatter = parseFrontMatter(content.value.toString());
		const name = frontmatter?.getStringValue('name')?.trim() || nameFromFile;
		const description = frontmatter?.getStringValue('description')?.trim();
		const globs = frontmatter?.getStringArrayValue('globs') ?? frontmatter?.getStringArrayValue('applyTo') ?? frontmatter?.getStringArrayValue('paths') ?? undefined;
		const alwaysApply = frontmatter?.getBooleanValue('alwaysApply');
		return { name, description, globs, alwaysApply };
	} catch {
		return { name: nameFromFile };
	}
}

async function readHooks(
	pluginUri: URI,
	paths: readonly URI[],
	formatConfig: IPluginFormatConfig,
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	userHome: URI,
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

		let def: IMcpServerDefinition = {
			name,
			configuration,
			uri: definitionURI,
			customization: makeMcpServerCustomization(definitionURI, name),
		};
		def = interpolateMcpPluginRoot(def, pluginFsPath, formatConfig.pluginRootTokens, formatConfig.pluginRootEnvVars);
		if (def.configuration.type === McpServerType.LOCAL && def.configuration.cwd === undefined) {
			def = { ...def, configuration: { ...def.configuration, cwd: pluginFsPath } };
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
 * Parses a plugin directory to extract hooks, MCP servers, skills, agents,
 * and instructions.
 * This is the main entry point for the agent host to discover plugin contents.
 */
export async function parsePlugin(
	pluginUri: URI,
	fileService: IFileService,
	workspaceRoot: URI | undefined,
	userHome: URI,
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
	const instructionDirs = resolveComponentDirs(pluginUri, 'rules', parseComponentPathConfig(manifest?.['rules']), boundaryUri);

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

	const [hooks, mcpServers, skills, agents, instructions] = await Promise.all([
		embeddedHooks.length > 0
			? Promise.resolve(embeddedHooks)
			: readHooks(pluginUri, hookDirs, formatConfig, fileService, workspaceRoot, userHome),
		embeddedMcp.length > 0
			? Promise.resolve(embeddedMcp)
			: readMcpServers(mcpDirs, pluginUri.fsPath, formatConfig, fileService),
		readSkills(pluginUri, skillDirs, fileService),
		readAgentComponents(agentDirs, fileService),
		readInstructionComponents(instructionDirs, fileService),
	]);

	return {
		hooks,
		mcpServers,
		skills: skills.map(toParsedSkill),
		agents: agents.map(toParsedAgent),
		instructions: instructions.map(toParsedRule),
	};
}

/** Pairs an agent {@link INamedPluginResource} with its protocol-level {@link AgentCustomization}. */
export function toParsedAgent(resource: INamedPluginResource): IParsedAgent {
	return { ...resource, customization: makeAgentCustomization(resource) };
}

/** Pairs a skill {@link INamedPluginResource} with its protocol-level {@link SkillCustomization}. */
export function toParsedSkill(resource: INamedPluginResource): IParsedSkill {
	return { ...resource, customization: makeSkillCustomization(resource) };
}

function toParsedRule(resource: INamedPluginResource): IParsedRule {
	return { ...resource, customization: makeRuleCustomization(resource) };
}
