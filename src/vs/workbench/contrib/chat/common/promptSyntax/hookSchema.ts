/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import * as nls from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { isAbsolute } from '../../../../../base/common/path.js';
import { untildify } from '../../../../../base/common/labels.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { HookType, HOOKS_BY_TARGET, HOOK_METADATA } from './hookTypes.js';
import { Target } from './promptTypes.js';

/**
 * A single hook command configuration.
 */
export interface IHookCommand {
	readonly type: 'command';
	/** Cross-platform command to execute. */
	readonly command?: string;
	/** Windows-specific command override. */
	readonly windows?: string;
	/** Linux-specific command override. */
	readonly linux?: string;
	/** macOS-specific command override. */
	readonly osx?: string;
	/** Resolved working directory URI. */
	readonly cwd?: URI;
	readonly env?: Record<string, string>;
	readonly timeout?: number;
	/** Original JSON field name that provided the windows command. */
	readonly windowsSource?: 'windows' | 'powershell';
	/** Original JSON field name that provided the linux command. */
	readonly linuxSource?: 'linux' | 'bash';
	/** Original JSON field name that provided the osx command. */
	readonly osxSource?: 'osx' | 'bash';
}

/**
 * Collected hooks for a chat request, organized by hook type.
 * This is passed to the extension host so it knows what hooks are available.
 */
export type ChatRequestHooks = {
	readonly [K in HookType]?: readonly IHookCommand[];
};

/**
 * JSON Schema for GitHub Copilot hook configuration files.
 * Hooks enable executing custom shell commands at strategic points in an agent's workflow.
 */
const vscodeHookCommandSchema: IJSONSchema = {
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
			description: nls.localize('hook.type', 'Must be "command".')
		},
		command: {
			type: 'string',
			description: nls.localize('hook.command', 'The command to execute. This is the default cross-platform command.')
		},
		windows: {
			type: 'string',
			description: nls.localize('hook.windows', 'Windows-specific command. If specified and running on Windows, this overrides the "command" field.')
		},
		linux: {
			type: 'string',
			description: nls.localize('hook.linux', 'Linux-specific command. If specified and running on Linux, this overrides the "command" field.')
		},
		osx: {
			type: 'string',
			description: nls.localize('hook.osx', 'macOS-specific command. If specified and running on macOS, this overrides the "command" field.')
		},
		cwd: {
			type: 'string',
			description: nls.localize('hook.cwd', 'Working directory for the script (relative to repository root).')
		},
		env: {
			type: 'object',
			additionalProperties: { type: 'string' },
			description: nls.localize('hook.env', 'Additional environment variables that are merged with the existing environment.')
		},
		timeout: {
			type: 'number',
			default: 30,
			description: nls.localize('hook.timeout', 'Maximum execution time in seconds (default: 30).')
		}
	}
};

const hookArraySchema: IJSONSchema = {
	type: 'array',
	items: vscodeHookCommandSchema
};

/**
 * Builds JSON Schema hook properties for a given target by looking up
 * the hook keys from HOOKS_BY_TARGET and descriptions from HOOK_METADATA.
 */
function buildHookProperties(target: Target, arraySchema: IJSONSchema): Record<string, IJSONSchema> {
	return Object.fromEntries(
		Object.entries(HOOKS_BY_TARGET[target]).map(([key, hookType]) => [
			key,
			{ ...arraySchema, description: HOOK_METADATA[hookType]?.description }
		])
	);
}

/**
 * Hook properties for the VS Code format.
 */
const vscodeHookProperties: Record<string, IJSONSchema> = buildHookProperties(Target.VSCode, hookArraySchema);

/**
 * Hook command schema for the Copilot CLI format.
 * Adds `bash`, `powershell`, and `timeoutSec` fields alongside the standard ones.
 */
const copilotCliHookCommandSchema: IJSONSchema = {
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
			description: nls.localize('hook.type', 'Must be "command".')
		},
		bash: {
			type: 'string',
			description: nls.localize('hook.bash', 'Bash command for Linux and macOS.')
		},
		powershell: {
			type: 'string',
			description: nls.localize('hook.powershell', 'PowerShell command for Windows.')
		},
		cwd: {
			type: 'string',
			description: nls.localize('hook.cwd', 'Working directory for the script (relative to repository root).')
		},
		env: {
			type: 'object',
			additionalProperties: { type: 'string' },
			description: nls.localize('hook.env', 'Additional environment variables that are merged with the existing environment.')
		},
		timeoutSec: {
			type: 'number',
			default: 10,
			description: nls.localize('hook.timeoutSec', 'Maximum execution time in seconds (default: 10).')
		}
	}
};

const copilotCliHookArraySchema: IJSONSchema = {
	type: 'array',
	items: copilotCliHookCommandSchema
};

/**
 * Hook properties for the Copilot CLI format.
 */
const copilotCliHookProperties: Record<string, IJSONSchema> = buildHookProperties(Target.GitHubCopilot, copilotCliHookArraySchema);

export const hookFileSchema: IJSONSchema = {
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
export function toHookType(rawHookTypeId: string): HookType | undefined {
	if (Object.values(HookType).includes(rawHookTypeId as HookType)) {
		return rawHookTypeId as HookType;
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
function normalizeHookCommand(raw: Record<string, unknown>): { command?: string; windows?: string; linux?: string; osx?: string; windowsSource?: 'windows' | 'powershell'; linuxSource?: 'linux' | 'bash'; osxSource?: 'osx' | 'bash'; cwd?: string; env?: Record<string, string>; timeout?: number } | undefined {
	if (raw.type !== 'command') {
		return undefined;
	}

	const hasCommand = typeof raw.command === 'string' && raw.command.length > 0;
	const hasBash = typeof raw.bash === 'string' && (raw.bash as string).length > 0;
	const hasPowerShell = typeof raw.powershell === 'string' && (raw.powershell as string).length > 0;

	// Platform overrides can be strings directly
	const hasWindows = typeof raw.windows === 'string' && (raw.windows as string).length > 0;
	const hasLinux = typeof raw.linux === 'string' && (raw.linux as string).length > 0;
	const hasOsx = typeof raw.osx === 'string' && (raw.osx as string).length > 0;

	// Map bash -> linux + osx (if not already specified)
	// Map powershell -> windows (if not already specified)
	const windows = hasWindows ? raw.windows as string : (hasPowerShell ? raw.powershell as string : undefined);
	const linux = hasLinux ? raw.linux as string : (hasBash ? raw.bash as string : undefined);
	const osx = hasOsx ? raw.osx as string : (hasBash ? raw.bash as string : undefined);

	// Track source field names for editor focus (which JSON field to highlight)
	const windowsSource: 'windows' | 'powershell' | undefined = hasWindows ? 'windows' : (hasPowerShell ? 'powershell' : undefined);
	const linuxSource: 'linux' | 'bash' | undefined = hasLinux ? 'linux' : (hasBash ? 'bash' : undefined);
	const osxSource: 'osx' | 'bash' | undefined = hasOsx ? 'osx' : (hasBash ? 'bash' : undefined);

	return {
		...(hasCommand && { command: raw.command as string }),
		...(windows && { windows }),
		...(linux && { linux }),
		...(osx && { osx }),
		...(windowsSource && { windowsSource }),
		...(linuxSource && { linuxSource }),
		...(osxSource && { osxSource }),
		...(typeof raw.cwd === 'string' && { cwd: raw.cwd }),
		...(typeof raw.env === 'object' && raw.env !== null && { env: raw.env as Record<string, string> }),
		...(typeof raw.timeout !== 'number' && typeof raw.timeoutSec === 'number' && { timeout: raw.timeoutSec }),
		...(typeof raw.timeout === 'number' && { timeout: raw.timeout }),
	};
}

/**
 * Gets a label for the given platform.
 */
export function getPlatformLabel(os: OperatingSystem): string {
	if (os === OperatingSystem.Windows) {
		return 'Windows';
	} else if (os === OperatingSystem.Macintosh) {
		return 'macOS';
	} else if (os === OperatingSystem.Linux) {
		return 'Linux';
	}
	return '';
}

/**
 * Resolves the effective command for the given platform.
 * This applies OS-specific overrides (windows, linux, osx) to get the actual command that will be executed.
 * Similar to how launch.json handles platform-specific configurations in debugAdapter.ts.
 */
export function resolveEffectiveCommand(hook: IHookCommand, os: OperatingSystem): string | undefined {
	// Select the platform-specific override based on the OS
	if (os === OperatingSystem.Windows && hook.windows) {
		return hook.windows;
	} else if (os === OperatingSystem.Macintosh && hook.osx) {
		return hook.osx;
	} else if (os === OperatingSystem.Linux && hook.linux) {
		return hook.linux;
	}

	// Fall back to the default command
	return hook.command;
}

/**
 * Checks if the hook is using a platform-specific command override.
 */
export function isUsingPlatformOverride(hook: IHookCommand, os: OperatingSystem): boolean {
	if (os === OperatingSystem.Windows && hook.windows) {
		return true;
	} else if (os === OperatingSystem.Macintosh && hook.osx) {
		return true;
	} else if (os === OperatingSystem.Linux && hook.linux) {
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
export function getEffectiveCommandSource(hook: IHookCommand, os: OperatingSystem): 'powershell' | 'bash' | undefined {
	if (os === OperatingSystem.Windows && hook.windows && hook.windowsSource === 'powershell') {
		return 'powershell';
	} else if (os === OperatingSystem.Macintosh && hook.osx && hook.osxSource === 'bash') {
		return 'bash';
	} else if (os === OperatingSystem.Linux && hook.linux && hook.linuxSource === 'bash') {
		return 'bash';
	}
	return undefined;
}

/**
 * Gets the original JSON field key name for the given platform's command.
 * Returns the actual field name from the JSON (e.g., 'bash' instead of 'osx' if bash was used).
 * This is used for editor focus to highlight the correct field.
 */
export function getEffectiveCommandFieldKey(hook: IHookCommand, os: OperatingSystem): string {
	if (os === OperatingSystem.Windows && hook.windows) {
		return hook.windowsSource ?? 'windows';
	} else if (os === OperatingSystem.Macintosh && hook.osx) {
		return hook.osxSource ?? 'osx';
	} else if (os === OperatingSystem.Linux && hook.linux) {
		return hook.linuxSource ?? 'linux';
	}
	return 'command';
}

/**
 * Formats a hook command for display.
 * Resolves OS-specific overrides to show the effective command for the given platform.
 * If using a platform-specific override, includes the platform as a prefix badge.
 */
export function formatHookCommandLabel(hook: IHookCommand, os: OperatingSystem): string {
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
export function resolveHookCommand(raw: Record<string, unknown>, workspaceRootUri: URI | undefined, userHome: string): IHookCommand | undefined {
	const normalized = normalizeHookCommand(raw);
	if (!normalized) {
		return undefined;
	}

	let cwdUri: URI | undefined;
	if (normalized.cwd) {
		// Expand tilde to user home directory
		const expandedCwd = untildify(normalized.cwd, userHome);
		if (isAbsolute(expandedCwd)) {
			// Use absolute path directly
			cwdUri = URI.file(expandedCwd);
		} else if (workspaceRootUri) {
			// Resolve relative to workspace root
			cwdUri = joinPath(workspaceRootUri, expandedCwd);
		}
	} else {
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
