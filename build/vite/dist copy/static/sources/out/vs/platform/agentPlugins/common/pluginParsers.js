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
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
// ---------------------------------------------------------------------------
// Plugin format detection
// ---------------------------------------------------------------------------
export var PluginFormat;
(function (PluginFormat) {
    PluginFormat[PluginFormat["Copilot"] = 0] = "Copilot";
    PluginFormat[PluginFormat["Claude"] = 1] = "Claude";
    PluginFormat[PluginFormat["OpenPlugin"] = 2] = "OpenPlugin";
})(PluginFormat || (PluginFormat = {}));
const COPILOT_FORMAT = {
    format: 0 /* PluginFormat.Copilot */,
    manifestPath: 'plugin.json',
    hookConfigPath: 'hooks.json',
    pluginRootToken: undefined,
    pluginRootEnvVar: undefined,
    parseHooks(hookUri, json, _pluginUri, workspaceRoot, userHome) {
        return parseHooksJson(hookUri, json, workspaceRoot, userHome);
    },
};
const CLAUDE_FORMAT = {
    format: 1 /* PluginFormat.Claude */,
    manifestPath: '.claude-plugin/plugin.json',
    hookConfigPath: 'hooks/hooks.json',
    pluginRootToken: '${CLAUDE_PLUGIN_ROOT}',
    pluginRootEnvVar: 'CLAUDE_PLUGIN_ROOT',
    parseHooks(hookUri, json, pluginUri, workspaceRoot, userHome) {
        return interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, '${CLAUDE_PLUGIN_ROOT}', 'CLAUDE_PLUGIN_ROOT');
    },
};
const OPEN_PLUGIN_FORMAT = {
    format: 2 /* PluginFormat.OpenPlugin */,
    manifestPath: '.plugin/plugin.json',
    hookConfigPath: 'hooks/hooks.json',
    pluginRootToken: '${PLUGIN_ROOT}',
    pluginRootEnvVar: 'PLUGIN_ROOT',
    parseHooks(hookUri, json, pluginUri, workspaceRoot, userHome) {
        return interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, '${PLUGIN_ROOT}', 'PLUGIN_ROOT');
    },
};
export async function detectPluginFormat(pluginUri, fileService) {
    if (await pathExists(joinPath(pluginUri, '.plugin', 'plugin.json'), fileService)) {
        return OPEN_PLUGIN_FORMAT;
    }
    const isInClaudeDirectory = pluginUri.path.split('/').includes('.claude');
    if (isInClaudeDirectory || await pathExists(joinPath(pluginUri, '.claude-plugin', 'plugin.json'), fileService)) {
        return CLAUDE_FORMAT;
    }
    return COPILOT_FORMAT;
}
const emptyComponentPathConfig = { paths: [], exclusive: false };
/**
 * Parses a manifest component path field into a normalized config.
 * Supports `undefined`, `string`, `string[]`, and `{ paths: string[], exclusive?: boolean }`.
 */
export function parseComponentPathConfig(raw) {
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
        const obj = raw;
        if (Array.isArray(obj['paths'])) {
            const paths = obj['paths']
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
 * Paths that resolve outside the plugin root are silently ignored.
 */
export function resolveComponentDirs(pluginUri, defaultDir, config) {
    const dirs = [];
    if (!config.exclusive) {
        dirs.push(joinPath(pluginUri, defaultDir));
    }
    for (const p of config.paths) {
        const resolved = normalizePath(joinPath(pluginUri, p));
        if (isEqualOrParent(resolved, pluginUri)) {
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
export function resolveMcpServersMap(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const obj = raw;
    return Object.hasOwn(obj, 'mcpServers')
        ? obj.mcpServers
        : obj;
}
/**
 * Normalizes a raw JSON value into a typed MCP server configuration.
 */
export function normalizeMcpServerConfiguration(rawConfig) {
    if (!rawConfig || typeof rawConfig !== 'object') {
        return undefined;
    }
    const candidate = rawConfig;
    const type = typeof candidate['type'] === 'string' ? candidate['type'] : undefined;
    const command = typeof candidate['command'] === 'string' ? candidate['command'] : undefined;
    const url = typeof candidate['url'] === 'string' ? candidate['url'] : undefined;
    const args = Array.isArray(candidate['args']) ? candidate['args'].filter((value) => typeof value === 'string') : undefined;
    const env = candidate['env'] && typeof candidate['env'] === 'object'
        ? Object.fromEntries(Object.entries(candidate['env'])
            .filter(([, value]) => typeof value === 'string' || typeof value === 'number' || value === null)
            .map(([key, value]) => [key, value]))
        : undefined;
    const envFile = typeof candidate['envFile'] === 'string' ? candidate['envFile'] : undefined;
    const cwd = typeof candidate['cwd'] === 'string' ? candidate['cwd'] : undefined;
    const headers = candidate['headers'] && typeof candidate['headers'] === 'object'
        ? Object.fromEntries(Object.entries(candidate['headers'])
            .filter(([, value]) => typeof value === 'string')
            .map(([key, value]) => [key, value]))
        : undefined;
    const dev = candidate['dev'] && typeof candidate['dev'] === 'object' ? candidate['dev'] : undefined;
    if (type === 'ws') {
        return undefined;
    }
    if (type === "stdio" /* McpServerType.LOCAL */ || (!type && command)) {
        if (!command) {
            return undefined;
        }
        return { type: "stdio" /* McpServerType.LOCAL */, command, args, env, envFile, cwd, dev };
    }
    if (type === "http" /* McpServerType.REMOTE */ || type === 'sse' || (!type && url)) {
        if (!url) {
            return undefined;
        }
        return { type: "http" /* McpServerType.REMOTE */, url, headers, dev };
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
export function shellQuotePluginRootInCommand(command, fsPath, token) {
    if (!command.includes(token)) {
        return command;
    }
    if (!shellUnsafeChars.test(fsPath)) {
        return command.replaceAll(token, fsPath);
    }
    const escapedToken = escapeRegExpCharacters(token);
    const pattern = new RegExp(`(["']?)` + escapedToken + `([\\w./\\\\~:-]*)`, 'g');
    return command.replace(pattern, (_match, leadingQuote, suffix) => {
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
export function interpolateMcpPluginRoot(def, fsPath, token, envVar) {
    const replace = (s) => s.replaceAll(token, fsPath);
    const config = def.configuration;
    let interpolated;
    if (config.type === "stdio" /* McpServerType.LOCAL */) {
        const local = { ...config };
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
    }
    else {
        const remote = { ...config };
        remote.url = replace(remote.url);
        if (remote.headers) {
            remote.headers = Object.fromEntries(Object.entries(remote.headers).map(([k, v]) => [k, replace(v)]));
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
export function convertBareEnvVarsToVsCodeSyntax(def) {
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
const HOOK_TYPE_MAP = {
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
function normalizeHookCommand(raw) {
    // Allow omitted type (Claude compatibility) — treat as 'command'
    if (raw.type !== undefined && raw.type !== 'command') {
        return undefined;
    }
    const hasCommand = typeof raw.command === 'string' && raw.command.length > 0;
    const hasBash = typeof raw.bash === 'string' && raw.bash.length > 0;
    const hasPowerShell = typeof raw.powershell === 'string' && raw.powershell.length > 0;
    const hasWindows = typeof raw.windows === 'string' && raw.windows.length > 0;
    const hasLinux = typeof raw.linux === 'string' && raw.linux.length > 0;
    const hasOsx = typeof raw.osx === 'string' && raw.osx.length > 0;
    if (!hasCommand && !hasBash && !hasPowerShell && !hasWindows && !hasLinux && !hasOsx) {
        return undefined;
    }
    const windows = hasWindows ? raw.windows : (hasPowerShell ? raw.powershell : undefined);
    const linux = hasLinux ? raw.linux : (hasBash ? raw.bash : undefined);
    const osx = hasOsx ? raw.osx : (hasBash ? raw.bash : undefined);
    const timeout = typeof raw.timeout === 'number'
        ? raw.timeout
        : (typeof raw.timeoutSec === 'number' ? raw.timeoutSec : undefined);
    return {
        ...(hasCommand && { command: raw.command }),
        ...(windows && { windows }),
        ...(linux && { linux }),
        ...(osx && { osx }),
        ...(typeof raw.env === 'object' && raw.env !== null && { env: raw.env }),
        ...(timeout !== undefined && { timeout }),
    };
}
/**
 * Resolves a raw hook command JSON object into a {@link IParsedHookCommand},
 * normalizing fields and resolving the working directory.
 */
function resolveHookCommand(raw, workspaceRoot, userHome) {
    const normalized = normalizeHookCommand(raw);
    if (!normalized) {
        return undefined;
    }
    let cwdUri;
    const rawCwd = typeof raw.cwd === 'string' ? raw.cwd : undefined;
    if (rawCwd) {
        const expanded = untildify(rawCwd, userHome);
        if (isAbsolute(expanded)) {
            cwdUri = URI.file(expanded);
        }
        else if (workspaceRoot) {
            cwdUri = joinPath(workspaceRoot, expanded);
        }
    }
    else {
        cwdUri = workspaceRoot;
    }
    return { ...normalized, cwd: cwdUri };
}
/**
 * Extracts hook commands from an item that may be a direct command object
 * or a nested structure with a `matcher` (Claude format).
 */
function extractHookCommands(item, workspaceRoot, userHome) {
    if (!item || typeof item !== 'object') {
        return [];
    }
    const itemObj = item;
    const commands = [];
    // Nested hooks with matcher (Claude style): { matcher: "...", hooks: [...] }
    const nestedHooks = itemObj.hooks;
    if (nestedHooks !== undefined && Array.isArray(nestedHooks)) {
        for (const nested of nestedHooks) {
            if (!nested || typeof nested !== 'object') {
                continue;
            }
            const resolved = resolveHookCommand(nested, workspaceRoot, userHome);
            if (resolved) {
                commands.push(resolved);
            }
        }
    }
    else {
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
function parseHooksJson(hookUri, json, workspaceRoot, userHome) {
    if (!json || typeof json !== 'object') {
        return [];
    }
    const root = json;
    // Claude's disableAllHooks
    if (root.disableAllHooks === true) {
        return [];
    }
    const hooks = root.hooks;
    if (!hooks || typeof hooks !== 'object') {
        return [];
    }
    const hooksObj = hooks;
    const result = [];
    for (const originalId of Object.keys(hooksObj)) {
        const canonicalType = HOOK_TYPE_MAP[originalId];
        if (!canonicalType) {
            continue;
        }
        const hookArray = hooksObj[originalId];
        if (!Array.isArray(hookArray)) {
            continue;
        }
        const commands = [];
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
export function interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, token, envVar) {
    const fsPath = pluginUri.fsPath;
    const typedJson = json;
    const mutateHookCommand = (hook) => {
        for (const field of ['command', 'windows', 'linux', 'osx']) {
            if (typeof hook[field] === 'string') {
                hook[field] = shellQuotePluginRootInCommand(hook[field], fsPath, token);
            }
        }
        if (!hook.env || typeof hook.env !== 'object') {
            hook.env = {};
        }
        hook.env[envVar] = fsPath;
    };
    for (const lifecycle of Object.values(typedJson.hooks ?? {})) {
        if (!Array.isArray(lifecycle)) {
            continue;
        }
        for (const lifecycleEntry of lifecycle) {
            if (!lifecycleEntry || typeof lifecycleEntry !== 'object') {
                continue;
            }
            const entry = lifecycleEntry;
            if (Array.isArray(entry.hooks)) {
                for (const hook of entry.hooks) {
                    mutateHookCommand(hook);
                }
            }
            else {
                mutateHookCommand(entry);
            }
        }
    }
    const replacer = (v) => {
        return typeof v === 'string'
            ? v.replaceAll(token, pluginUri.fsPath)
            : undefined;
    };
    return parseHooksJson(hookUri, cloneAndChange(json, replacer), workspaceRoot, userHome);
}
// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------
export async function readJsonFile(uri, fileService) {
    try {
        const fileContents = await fileService.readFile(uri);
        return parseJSONC(fileContents.value.toString());
    }
    catch {
        return undefined;
    }
}
export async function pathExists(resource, fileService) {
    try {
        await fileService.resolve(resource);
        return true;
    }
    catch {
        return false;
    }
}
// ---------------------------------------------------------------------------
// Component readers
// ---------------------------------------------------------------------------
const COMMAND_FILE_SUFFIX = '.md';
export async function readSkills(pluginRoot, dirs, fileService) {
    const seen = new Set();
    const skills = [];
    const addSkill = (name, skillMd) => {
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
        }
        catch {
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
export async function readMarkdownComponents(dirs, fileService) {
    const seen = new Set();
    const items = [];
    const addItem = (name, uri) => {
        if (!seen.has(name)) {
            seen.add(name);
            items.push({ uri, name });
        }
    };
    for (const dir of dirs) {
        let stat;
        try {
            stat = await fileService.resolve(dir);
        }
        catch {
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
async function readHooks(pluginUri, paths, formatConfig, fileService, workspaceRoot, userHome) {
    for (const hookPath of paths) {
        const json = await readJsonFile(hookPath, fileService);
        if (!json) {
            continue;
        }
        return formatConfig.parseHooks(hookPath, json, pluginUri, workspaceRoot, userHome);
    }
    return [];
}
async function readMcpServers(paths, pluginFsPath, formatConfig, fileService) {
    const merged = new Map();
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
export function parseMcpServerDefinitionMap(definitionURI, raw, pluginFsPath, formatConfig) {
    const mcpServers = resolveMcpServersMap(raw);
    if (!mcpServers) {
        return [];
    }
    const definitions = [];
    for (const [name, configValue] of Object.entries(mcpServers)) {
        const configuration = normalizeMcpServerConfiguration(configValue);
        if (!configuration) {
            continue;
        }
        let def = { name, configuration, uri: definitionURI };
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
export async function parsePlugin(pluginUri, fileService, workspaceRoot, userHome) {
    const formatConfig = await detectPluginFormat(pluginUri, fileService);
    // Read manifest
    const manifestJson = await readJsonFile(joinPath(pluginUri, formatConfig.manifestPath), fileService);
    const manifest = (manifestJson && typeof manifestJson === 'object') ? manifestJson : undefined;
    // Resolve component directories from manifest
    const hookDirs = resolveComponentDirs(pluginUri, formatConfig.hookConfigPath, parseComponentPathConfig(manifest?.['hooks']));
    const mcpDirs = resolveComponentDirs(pluginUri, '.mcp.json', parseComponentPathConfig(manifest?.['mcpServers']));
    const skillDirs = resolveComponentDirs(pluginUri, 'skills', parseComponentPathConfig(manifest?.['skills']));
    const agentDirs = resolveComponentDirs(pluginUri, 'agents', parseComponentPathConfig(manifest?.['agents']));
    // Handle embedded MCP servers in manifest
    let embeddedMcp = [];
    const mcpSection = manifest?.['mcpServers'];
    if (mcpSection && typeof mcpSection === 'object' && !Array.isArray(mcpSection) && !(hasKey(mcpSection, { paths: true }))) {
        embeddedMcp = parseMcpServerDefinitionMap(joinPath(pluginUri, formatConfig.manifestPath), { mcpServers: mcpSection }, pluginUri.fsPath, formatConfig);
    }
    // Handle embedded hooks in manifest
    let embeddedHooks = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luUGFyc2Vycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsS0FBSyxJQUFJLFVBQVUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ25FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDMUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEgsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekUsT0FBTyxFQUFFLE1BQU0sRUFBVyxNQUFNLCtCQUErQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQTBEbEQsOEVBQThFO0FBQzlFLDBCQUEwQjtBQUMxQiw4RUFBOEU7QUFFOUUsTUFBTSxDQUFOLElBQWtCLFlBSWpCO0FBSkQsV0FBa0IsWUFBWTtJQUM3QixxREFBTyxDQUFBO0lBQ1AsbURBQU0sQ0FBQTtJQUNOLDJEQUFVLENBQUE7QUFDWCxDQUFDLEVBSmlCLFlBQVksS0FBWixZQUFZLFFBSTdCO0FBWUQsTUFBTSxjQUFjLEdBQXdCO0lBQzNDLE1BQU0sOEJBQXNCO0lBQzVCLFlBQVksRUFBRSxhQUFhO0lBQzNCLGNBQWMsRUFBRSxZQUFZO0lBQzVCLGVBQWUsRUFBRSxTQUFTO0lBQzFCLGdCQUFnQixFQUFFLFNBQVM7SUFDM0IsVUFBVSxDQUFD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QU0sT0FBTyxHQUFHLE9BQU8sU0FBUyxDQUFDLFNBQVMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDNUYsTUFBTSxHQUFHLEdBQUcsT0FBTyxTQUFTLENBQUMsS0FBSyxDQUFDLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUNoRixNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxFQUFtQixFQUFFLENBQUMsT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUM1SSxNQUFNLEdBQUcsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksT0FBTyxTQUFTLENBQUMsS0FBSyxDQUFDLEtBQUssUUFBUTtRQUNuRSxDQUFDLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQTRCLENBQUM7YUFDOUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLEtBQUssS0FBSyxJQUFJLENBQUM7YUFDL0YsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxFQUFFLEtBQStCLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDYixNQUFNLE9BQU8sR0FBRyxPQUFPLFNBQVMsQ0FBQyxTQUFTLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNB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