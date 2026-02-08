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

/**
 * Enum of available hook types that can be configured in hooks.json
 */
export enum HookType {
	SessionStart = 'SessionStart',
	UserPromptSubmit = 'UserPromptSubmit',
	PreToolUse = 'PreToolUse',
	PostToolUse = 'PostToolUse',
	PreCompact = 'PreCompact',
	SubagentStart = 'SubagentStart',
	SubagentStop = 'SubagentStop',
	Stop = 'Stop',
}

/**
 * String literal type derived from HookType enum values.
 */
export type HookTypeValue = `${HookType}`;

/**
 * Metadata for hook types including localized labels and descriptions
 */
export const HOOK_TYPES = [
	{
		id: HookType.SessionStart,
		label: nls.localize('hookType.sessionStart.label', "Session Start"),
		description: nls.localize('hookType.sessionStart.description', "Executed when a new agent session begins or when resuming an existing session.")
	},
	{
		id: HookType.UserPromptSubmit,
		label: nls.localize('hookType.userPromptSubmit.label', "User Prompt Submit"),
		description: nls.localize('hookType.userPromptSubmit.description', "Executed when the user submits a prompt to the agent.")
	},
	{
		id: HookType.PreToolUse,
		label: nls.localize('hookType.preToolUse.label', "Pre-Tool Use"),
		description: nls.localize('hookType.preToolUse.description', "Executed before the agent uses any tool.")
	},
	{
		id: HookType.PostToolUse,
		label: nls.localize('hookType.postToolUse.label', "Post-Tool Use"),
		description: nls.localize('hookType.postToolUse.description', "Executed after a tool completes execution successfully.")
	},
	{
		id: HookType.PreCompact,
		label: nls.localize('hookType.preCompact.label', "Pre-Compact"),
		description: nls.localize('hookType.preCompact.description', "Executed before the agent compacts the conversation context.")
	},
	{
		id: HookType.SubagentStart,
		label: nls.localize('hookType.subagentStart.label', "Subagent Start"),
		description: nls.localize('hookType.subagentStart.description', "Executed when a subagent is started.")
	},
	{
		id: HookType.SubagentStop,
		label: nls.localize('hookType.subagentStop.label', "Subagent Stop"),
		description: nls.localize('hookType.subagentStop.description', "Executed when a subagent stops.")
	},
	{
		id: HookType.Stop,
		label: nls.localize('hookType.stop.label', "Stop"),
		description: nls.localize('hookType.stop.description', "Executed when the agent stops.")
	}
] as const;

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
	readonly timeoutSec?: number;
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
export interface IChatRequestHooks {
	readonly [HookType.SessionStart]?: readonly IHookCommand[];
	readonly [HookType.UserPromptSubmit]?: readonly IHookCommand[];
	readonly [HookType.PreToolUse]?: readonly IHookCommand[];
	readonly [HookType.PostToolUse]?: readonly IHookCommand[];
	readonly [HookType.PreCompact]?: readonly IHookCommand[];
	readonly [HookType.SubagentStart]?: readonly IHookCommand[];
	readonly [HookType.SubagentStop]?: readonly IHookCommand[];
	readonly [HookType.Stop]?: readonly IHookCommand[];
}

/**
 * JSON Schema for GitHub Copilot hook configuration files.
 * Hooks enable executing custom shell commands at strategic points in an agent's workflow.
 */
const hookCommandSchema: IJSONSchema = {
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
		timeoutSec: {
			type: 'number',
			default: 30,
			description: nls.localize('hook.timeoutSec', 'Maximum execution time in seconds (default: 30).')
		}
	}
};

const hookArraySchema: IJSONSchema = {
	type: 'array',
	items: hookCommandSchema
};

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
			properties: {
				SessionStart: {
					...hookArraySchema,
					description: nls.localize('hookFile.sessionStart', 'Executed when a new agent session begins or when resuming an existing session. Use to initialize environments, log session starts, validate project state, or set up temporary resources.')
				},
				UserPromptSubmit: {
					...hookArraySchema,
					description: nls.localize('hookFile.userPromptSubmit', 'Executed when the user submits a prompt to the agent. Use to log user requests for auditing and usage analysis.')
				},
				PreToolUse: {
					...hookArraySchema,
					description: nls.localize('hookFile.preToolUse', 'Executed before the agent uses any tool. This is the most powerful hook as it can approve or deny tool executions. Use to block dangerous commands, enforce security policies, require approval for sensitive operations, or log tool usage.')
				},
				PostToolUse: {
					...hookArraySchema,
					description: nls.localize('hookFile.postToolUse', 'Executed after a tool completes execution successfully. Use to log execution results, track usage statistics, generate audit trails, or monitor performance.')
				},
				PreCompact: {
					...hookArraySchema,
					description: nls.localize('hookFile.preCompact', 'Executed before the agent compacts the conversation context. Use to save conversation state, export important information, or prepare for context reduction.')
				},
				SubagentStart: {
					...hookArraySchema,
					description: nls.localize('hookFile.subagentStart', 'Executed when a subagent is started. Use to log subagent spawning, track nested agent usage, or initialize subagent-specific resources.')
				},
				SubagentStop: {
					...hookArraySchema,
					description: nls.localize('hookFile.subagentStop', 'Executed when a subagent stops. Use to log subagent completion, cleanup subagent resources, or aggregate subagent results.')
				},
				Stop: {
					...hookArraySchema,
					description: nls.localize('hookFile.stop', 'Executed when the agent session stops. Use to cleanup resources, generate final reports, or send completion notifications.')
				}
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
							timeoutSec: 15
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
 * Glob pattern for hook files.
 */
export const HOOK_FILE_GLOB = 'hooks/hooks.json';

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
function normalizeHookCommand(raw: Record<string, unknown>): { command?: string; windows?: string; linux?: string; osx?: string; windowsSource?: 'windows' | 'powershell'; linuxSource?: 'linux' | 'bash'; osxSource?: 'osx' | 'bash'; cwd?: string; env?: Record<string, string>; timeoutSec?: number } | undefined {
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
		...(typeof raw.timeoutSec === 'number' && { timeoutSec: raw.timeoutSec }),
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

	// Add platform badge if using platform-specific override
	if (isUsingPlatformOverride(hook, os)) {
		const platformLabel = getPlatformLabel(os);
		return `[${platformLabel}] ${command}`;
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
		...(normalized.timeoutSec !== undefined && { timeoutSec: normalized.timeoutSec }),
	};
}
