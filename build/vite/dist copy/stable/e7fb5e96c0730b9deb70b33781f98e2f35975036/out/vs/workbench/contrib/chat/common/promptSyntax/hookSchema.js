/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { isAbsolute } from '../../../../../base/common/path.js';
import { untildify } from '../../../../../base/common/labels.js';
import { HookType, HOOKS_BY_TARGET, HOOK_METADATA } from './hookTypes.js';
import { Target } from './promptTypes.js';
/**
 * Merges two sets of hooks by concatenating the command arrays for each hook type.
 * Additional hooks are appended after the base hooks.
 */
export function mergeHooks(base, additional) {
    if (!base) {
        return additional;
    }
    const result = { ...base };
    for (const hookType of Object.values(HookType)) {
        const baseArr = base[hookType];
        const additionalArr = additional[hookType];
        if (additionalArr && additionalArr.length > 0) {
            result[hookType] = baseArr ? [...baseArr, ...additionalArr] : additionalArr;
        }
    }
    return result;
}
/**
 * Descriptions for hook command fields, used by both the JSON schema and the hover provider.
 */
export const HOOK_COMMAND_FIELD_DESCRIPTIONS = {
    type: nls.localize('hook.type', 'Must be "command".'),
    command: nls.localize('hook.command', 'The command to execute. This is the default cross-platform command.'),
    windows: nls.localize('hook.windows', 'Windows-specific command. If specified and running on Windows, this overrides the "command" field.'),
    linux: nls.localize('hook.linux', 'Linux-specific command. If specified and running on Linux, this overrides the "command" field.'),
    osx: nls.localize('hook.osx', 'macOS-specific command. If specified and running on macOS, this overrides the "command" field.'),
    bash: nls.localize('hook.bash', 'Bash command for Linux and macOS.'),
    powershell: nls.localize('hook.powershell', 'PowerShell command for Windows.'),
    cwd: nls.localize('hook.cwd', 'Working directory for the script (relative to repository root).'),
    env: nls.localize('hook.env', 'Additional environment variables that are merged with the existing environment.'),
    timeout: nls.localize('hook.timeout', 'Maximum execution time in seconds (default: 30).'),
    timeoutSec: nls.localize('hook.timeoutSec', 'Maximum execution time in seconds (default: 10).'),
};
/**
 * JSON Schema for GitHub Copilot hook configuration files.
 * Hooks enable executing custom shell commands at strategic points in an agent's workflow.
 */
const vscodeHookCommandSchema = {
    type: 'object',
    additionalProperties: true,
    required: ['type'],
    anyOf: [
        { required: ['command'] },
        { required: ['windows'] },
        { required: ['linux'] },
        { required: ['osx'] },
        { required: ['bash'] },
        { required: ['powershell'] }
    ],
    errorMessage: nls.localize('hook.commandRequired', 'At least one of "command", "windows", "linux", or "osx" must be specified.'),
    properties: {
        type: {
            type: 'string',
            enum: ['command'],
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.type
        },
        command: {
            type: 'string',
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.command
        },
        windows: {
            type: 'string',
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.windows
        },
        linux: {
            type: 'string',
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.linux
        },
        osx: {
            type: 'string',
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.osx
        },
        cwd: {
            type: 'string',
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.cwd
        },
        env: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.env
        },
        timeout: {
            type: 'number',
            default: 30,
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.timeout
        }
    }
};
const hookArraySchema = {
    type: 'array',
    items: vscodeHookCommandSchema
};
/**
 * Builds JSON Schema hook properties for a given target by looking up
 * the hook keys from HOOKS_BY_TARGET and descriptions from HOOK_METADATA.
 */
function buildHookProperties(target, arraySchema) {
    return Object.fromEntries(Object.entries(HOOKS_BY_TARGET[target]).map(([key, hookType]) => [
        key,
        { ...arraySchema, description: HOOK_METADATA[hookType]?.description }
    ]));
}
/**
 * Hook properties for the VS Code format.
 */
const vscodeHookProperties = buildHookProperties(Target.VSCode, hookArraySchema);
/**
 * Hook command schema for the Copilot CLI format.
 * Adds `bash`, `powershell`, and `timeoutSec` fields alongside the standard ones.
 */
const copilotCliHookCommandSchema = {
    type: 'object',
    additionalProperties: true,
    required: ['type'],
    anyOf: [
        { required: ['bash'] },
        { required: ['powershell'] }
    ],
    errorMessage: nls.localize('hook.cliCommandRequired', 'At least one of "bash" or "powershell" must be specified.'),
    properties: {
        type: {
            type: 'string',
            enum: ['command'],
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.type
        },
        bash: {
            type: 'string',
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.bash
        },
        powershell: {
            type: 'string',
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.powershell
        },
        cwd: {
            type: 'string',
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.cwd
        },
        env: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.env
        },
        timeoutSec: {
            type: 'number',
            default: 10,
            description: HOOK_COMMAND_FIELD_DESCRIPTIONS.timeoutSec
        }
    }
};
const copilotCliHookArraySchema = {
    type: 'array',
    items: copilotCliHookCommandSchema
};
/**
 * Hook properties for the Copilot CLI format.
 */
const copilotCliHookProperties = buildHookProperties(Target.GitHubCopilot, copilotCliHookArraySchema);
export const hookFileSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    description: nls.localize('hookFile.description', 'GitHub Copilot hook configuration file. Hooks enable executing custom shell commands at strategic points in an agent\'s workflow.'),
    additionalProperties: true,
    required: ['hooks'],
    properties: {
        hooks: {
            type: 'object',
            description: nls.localize('hookFile.hooks', 'Hook definitions organized by type.'),
            additionalProperties: true,
        }
    },
    // Conditionally apply PascalCase or camelCase hook properties based on
    // whether the file uses the Copilot CLI format (detected by the "version" field).
    if: {
        required: ['version'],
        properties: {
            version: { type: 'number' }
        }
    },
    then: {
        // Copilot CLI format: camelCase hook names, bash/powershell/timeoutSec fields
        properties: {
            version: {
                type: 'number',
                description: nls.localize('hookFile.version', 'Hook configuration format version.'),
            },
            hooks: {
                properties: copilotCliHookProperties
            }
        }
    },
    else: {
        // VS Code / PascalCase format
        properties: {
            hooks: {
                properties: vscodeHookProperties
            }
        }
    },
    defaultSnippets: [
        {
            label: nls.localize('hookFile.snippet.basic', 'Basic hook configuration'),
            description: nls.localize('hookFile.snippet.basic.description', 'A basic hook configuration with common hooks'),
            body: {
                hooks: {
                    SessionStart: [
                        {
                            type: 'command',
                            command: '${1:echo "Session started" >> session.log}',
                        }
                    ],
                    PreToolUse: [
                        {
                            type: 'command',
                            command: '${2:./scripts/validate.sh}',
                            timeout: 15
                        }
                    ]
                }
            }
        }
    ]
};
/**
 * URI for the hook schema registration.
 */
export const HOOK_SCHEMA_URI = 'vscode://schemas/hooks';
/**
 * Normalizes a raw hook type identifier to the canonical HookType enum value.
 * Only matches exact enum values. For tool-specific naming conventions (e.g., Claude, Copilot CLI),
 * use the corresponding compat module's resolver function.
 */
export function toHookType(rawHookTypeId) {
    if (Object.values(HookType).includes(rawHookTypeId)) {
        return rawHookTypeId;
    }
    return undefined;
}
/**
 * Normalizes a raw hook command object, validating structure.
 * Maps legacy bash/powershell fields to platform-specific overrides:
 * - bash -> linux + osx
 * - powershell -> windows
 * This is an internal helper - use resolveHookCommand for the full resolution.
 */
function normalizeHookCommand(raw) {
    if (raw.type !== 'command') {
        return undefined;
    }
    const hasCommand = typeof raw.command === 'string' && raw.command.length > 0;
    const hasBash = typeof raw.bash === 'string' && raw.bash.length > 0;
    const hasPowerShell = typeof raw.powershell === 'string' && raw.powershell.length > 0;
    // Platform overrides can be strings directly
    const hasWindows = typeof raw.windows === 'string' && raw.windows.length > 0;
    const hasLinux = typeof raw.linux === 'string' && raw.linux.length > 0;
    const hasOsx = typeof raw.osx === 'string' && raw.osx.length > 0;
    // Map bash -> linux + osx (if not already specified)
    // Map powershell -> windows (if not already specified)
    const windows = hasWindows ? raw.windows : (hasPowerShell ? raw.powershell : undefined);
    const linux = hasLinux ? raw.linux : (hasBash ? raw.bash : undefined);
    const osx = hasOsx ? raw.osx : (hasBash ? raw.bash : undefined);
    // Track source field names for editor focus (which JSON field to highlight)
    const windowsSource = hasWindows ? 'windows' : (hasPowerShell ? 'powershell' : undefined);
    const linuxSource = hasLinux ? 'linux' : (hasBash ? 'bash' : undefined);
    const osxSource = hasOsx ? 'osx' : (hasBash ? 'bash' : undefined);
    return {
        ...(hasCommand && { command: raw.command }),
        ...(windows && { windows }),
        ...(linux && { linux }),
        ...(osx && { osx }),
        ...(windowsSource && { windowsSource }),
        ...(linuxSource && { linuxSource }),
        ...(osxSource && { osxSource }),
        ...(typeof raw.cwd === 'string' && { cwd: raw.cwd }),
        ...(typeof raw.env === 'object' && raw.env !== null && { env: raw.env }),
        ...(typeof raw.timeout !== 'number' && typeof raw.timeoutSec === 'number' && { timeout: raw.timeoutSec }),
        ...(typeof raw.timeout === 'number' && { timeout: raw.timeout }),
    };
}
/**
 * Gets a label for the given platform.
 */
export function getPlatformLabel(os) {
    if (os === 1 /* OperatingSystem.Windows */) {
        return 'Windows';
    }
    else if (os === 2 /* OperatingSystem.Macintosh */) {
        return 'macOS';
    }
    else if (os === 3 /* OperatingSystem.Linux */) {
        return 'Linux';
    }
    return '';
}
/**
 * Resolves the effective command for the given platform.
 * This applies OS-specific overrides (windows, linux, osx) to get the actual command that will be executed.
 * Similar to how launch.json handles platform-specific configurations in debugAdapter.ts.
 */
export function resolveEffectiveCommand(hook, os) {
    // Select the platform-specific override based on the OS
    if (os === 1 /* OperatingSystem.Windows */ && hook.windows) {
        return hook.windows;
    }
    else if (os === 2 /* OperatingSystem.Macintosh */ && hook.osx) {
        return hook.osx;
    }
    else if (os === 3 /* OperatingSystem.Linux */ && hook.linux) {
        return hook.linux;
    }
    // Fall back to the default command
    return hook.command;
}
/**
 * Checks if the hook is using a platform-specific command override.
 */
export function isUsingPlatformOverride(hook, os) {
    if (os === 1 /* OperatingSystem.Windows */ && hook.windows) {
        return true;
    }
    else if (os === 2 /* OperatingSystem.Macintosh */ && hook.osx) {
        return true;
    }
    else if (os === 3 /* OperatingSystem.Linux */ && hook.linux) {
        return true;
    }
    return false;
}
/**
 * Gets the source shell type for the effective command on the given platform.
 * Returns 'powershell' if the Windows command came from a powershell field,
 * 'bash' if the Linux/macOS command came from a bash field,
 * or undefined for default shell handling.
 */
export function getEffectiveCommandSource(hook, os) {
    if (os === 1 /* OperatingSystem.Windows */ && hook.windows && hook.windowsSource === 'powershell') {
        return 'powershell';
    }
    else if (os === 2 /* OperatingSystem.Macintosh */ && hook.osx && hook.osxSource === 'bash') {
        return 'bash';
    }
    else if (os === 3 /* OperatingSystem.Linux */ && hook.linux && hook.linuxSource === 'bash') {
        return 'bash';
    }
    return undefined;
}
/**
 * Gets the original JSON field key name for the given platform's command.
 * Returns the actual field name from the JSON (e.g., 'bash' instead of 'osx' if bash was used).
 * This is used for editor focus to highlight the correct field.
 */
export function getEffectiveCommandFieldKey(hook, os) {
    const h = hook;
    if (os === 1 /* OperatingSystem.Windows */ && hook.windows) {
        return h.windowsSource ?? 'windows';
    }
    else if (os === 2 /* OperatingSystem.Macintosh */ && hook.osx) {
        return h.osxSource ?? 'osx';
    }
    else if (os === 3 /* OperatingSystem.Linux */ && hook.linux) {
        return h.linuxSource ?? 'linux';
    }
    return 'command';
}
/**
 * Formats a hook command for display.
 * Resolves OS-specific overrides to show the effective command for the given platform.
 * If using a platform-specific override, includes the platform as a prefix badge.
 */
export function formatHookCommandLabel(hook, os) {
    const command = resolveEffectiveCommand(hook, os);
    if (!command) {
        return '';
    }
    return command;
}
/**
 * Resolves a raw hook command object to the canonical IHookCommand format.
 * Normalizes the command and resolves the cwd path relative to the workspace root.
 * @param raw The raw hook command object from JSON
 * @param workspaceRootUri The workspace root URI to resolve relative cwd paths against
 * @param userHome The user's home directory path for tilde expansion
 */
export function resolveHookCommand(raw, workspaceRootUri, userHome) {
    const normalized = normalizeHookCommand(raw);
    if (!normalized) {
        return undefined;
    }
    let cwdUri;
    if (normalized.cwd) {
        // Expand tilde to user home directory
        const expandedCwd = untildify(normalized.cwd, userHome);
        if (isAbsolute(expandedCwd)) {
            // Use absolute path directly
            cwdUri = URI.file(expandedCwd);
        }
        else if (workspaceRootUri) {
            // Resolve relative to workspace root
            cwdUri = joinPath(workspaceRootUri, expandedCwd);
        }
    }
    else {
        cwdUri = workspaceRootUri;
    }
    return {
        type: 'command',
        ...(normalized.command && { command: normalized.command }),
        ...(normalized.windows && { windows: normalized.windows }),
        ...(normalized.linux && { linux: normalized.linux }),
        ...(normalized.osx && { osx: normalized.osx }),
        ...(normalized.windowsSource && { windowsSource: normalized.windowsSource }),
        ...(normalized.linuxSource && { linuxSource: normalized.linuxSource }),
        ...(normalized.osxSource && { osxSource: normalized.osxSource }),
        ...(cwdUri && { cwd: cwdUri }),
        ...(normalized.env && { env: normalized.env }),
        ...(normalized.timeout !== undefined && { timeout: normalized.timeout }),
    };
}
/**
 * Helper to extract hook commands from an item that could be:
 * 1. A direct command object: { type: 'command', command: '...' }
 * 2. A nested structure with matcher (Claude style): { matcher: '...', hooks: [{ type: 'command', command: '...' }] }
 *
 * This allows Copilot format to handle Claude-style entries if pasted.
 * Also handles Claude's leniency where 'type' field can be omitted.
 */
export function extractHookCommandsFromItem(item, workspaceRootUri, userHome) {
    if (!item || typeof item !== 'object') {
        return [];
    }
    const itemObj = item;
    const commands = [];
    // Check for nested hooks with matcher (Claude style): { matcher: "...", hooks: [...] }
    const nestedHooks = itemObj.hooks;
    if (nestedHooks !== undefined && Array.isArray(nestedHooks)) {
        for (const nestedHook of nestedHooks) {
            if (!nestedHook || typeof nestedHook !== 'object') {
                continue;
            }
            const normalized = normalizeForResolve(nestedHook);
            const resolved = resolveHookCommand(normalized, workspaceRootUri, userHome);
            if (resolved) {
                commands.push(resolved);
            }
        }
    }
    else {
        // Direct command object
        const normalized = normalizeForResolve(itemObj);
        const resolved = resolveHookCommand(normalized, workspaceRootUri, userHome);
        if (resolved) {
            commands.push(resolved);
        }
    }
    return commands;
}
/**
 * Normalizes a hook command object for resolving.
 * Claude format allows omitting the 'type' field, treating it as 'command'.
 * This ensures compatibility when Claude-style hooks are pasted into Copilot format.
 */
function normalizeForResolve(raw) {
    // If type is missing or already 'command', ensure it's set to 'command'
    if (raw.type === undefined || raw.type === 'command') {
        return { ...raw, type: 'command' };
    }
    return raw;
}
/**
 * Converts an {@link IValue} YAML AST node into a plain JavaScript value
 * (string, array, or object) suitable for passing to hook parsing helpers.
 */
function yamlValueToPlain(value) {
    switch (value.type) {
        case 'scalar':
            return value.value;
        case 'sequence':
            return value.items.map(yamlValueToPlain);
        case 'map': {
            const obj = {};
            for (const prop of value.properties) {
                obj[prop.key.value] = yamlValueToPlain(prop.value);
            }
            return obj;
        }
    }
}
/**
 * Parses hooks from a subagent's YAML frontmatter `hooks` attribute.
 *
 * Supports two formats for hook entries:
 *
 * 1. **Direct command** (our format, without matcher):
 * ```yaml
 * hooks:
 *   PreToolUse:
 *     - type: command
 *       command: "./scripts/validate.sh"
 * ```
 *
 * 2. **Nested with matcher** (Claude Code format):
 * ```yaml
 * hooks:
 *   PreToolUse:
 *     - matcher: "Bash"
 *       hooks:
 *         - type: command
 *           command: "./scripts/validate.sh"
 * ```
 *
 * @param hooksMap The raw YAML map value from the `hooks` frontmatter attribute.
 * @param workspaceRootUri Workspace root for resolving relative `cwd` paths.
 * @param userHome User home directory path for tilde expansion.
 * @param target The agent's target, used to resolve hook type names correctly.
 * @returns Resolved hooks organized by hook type, ready for use in {@link ChatRequestHooks}.
 */
export function parseSubagentHooksFromYaml(hooksMap, workspaceRootUri, userHome, target = Target.Undefined) {
    const result = {};
    const targetHookMap = HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined];
    for (const prop of hooksMap.properties) {
        const hookTypeName = prop.key.value;
        // Resolve hook type name using the target's own map first, then fall back to canonical names
        const hookType = targetHookMap[hookTypeName] ?? toHookType(hookTypeName);
        if (!hookType) {
            continue;
        }
        // The value must be a sequence (array of hook entries)
        if (prop.value.type !== 'sequence') {
            continue;
        }
        const commands = [];
        for (const item of prop.value.items) {
            // Convert the YAML AST node to a plain object so the existing
            // extractHookCommandsFromItem helper can handle both direct
            // commands and nested matcher structures.
            const plainItem = yamlValueToPlain(item);
            const extracted = extractHookCommandsFromItem(plainItem, workspaceRootUri, userHome);
            commands.push(...extracted);
        }
        if (commands.length > 0) {
            if (!result[hookType]) {
                result[hookType] = [];
            }
            result[hookType].push(...commands);
        }
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9va1NjaGVtYS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9ob29rU2NoZW1hLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUJBQXVCLENBQUM7QUFDN0MsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR2pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQzFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQTBCMUM7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLFVBQVUsQ0FBQyxJQUFrQyxFQUFFLFVBQTRCO0lBQzFGLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNYLE9BQU8sVUFBVSxDQUFDO0lBQ25CLENBQUM7SUFFRCxNQUFNLE1BQU0sR0FBNkQsRUFBRSxHQUFHLElBQUksRUFBRSxDQUFDO0lBQ3JGLEtBQUssTUFBTSxRQUFRLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1FBQ2hELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvQixNQUFNLGFBQWEsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0MsSUFBSSxhQUFhLElBQUksYUFBYSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUMv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