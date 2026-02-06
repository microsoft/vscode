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

/**
 * Enum of available hook types that can be configured in hooks.json
 */
export enum HookType {
	SessionStart = 'SessionStart',
	UserPromptSubmit = 'UserPromptSubmit',
	PreToolUse = 'PreToolUse',
	PostToolUse = 'PostToolUse',
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
	/** Bash-specific command. */
	readonly bash?: string;
	/** PowerShell-specific command. */
	readonly powershell?: string;
	/** Resolved working directory URI. */
	readonly cwd?: URI;
	readonly env?: Record<string, string>;
	readonly timeoutSec?: number;
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
	additionalProperties: false,
	required: ['type'],
	anyOf: [
		{ required: ['command'] },
		{ required: ['bash'] },
		{ required: ['powershell'] }
	],
	errorMessage: nls.localize('hook.commandRequired', 'At least one of "command", "bash", or "powershell" must be specified.'),
	properties: {
		type: {
			type: 'string',
			enum: ['command'],
			description: nls.localize('hook.type', 'Must be "command".')
		},
		command: {
			type: 'string',
			description: nls.localize('hook.command', 'The command to execute. This is the recommended way to specify commands and works cross-platform.')
		},
		bash: {
			type: 'string',
			description: nls.localize('hook.bash', 'Path to a bash script or an inline bash command. Use for Unix-specific commands when cross-platform "command" is not sufficient.')
		},
		powershell: {
			type: 'string',
			description: nls.localize('hook.powershell', 'Path to a PowerShell script or an inline PowerShell command. Use for Windows-specific commands when cross-platform "command" is not sufficient.')
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
	additionalProperties: false,
	required: ['version', 'hooks'],
	properties: {
		version: {
			type: 'number',
			enum: [1],
			description: nls.localize('hookFile.version', 'Schema version. Must be 1.')
		},
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
				version: 1,
				hooks: {
					sessionStart: [
						{
							type: 'command',
							command: '${1:echo "Session started"}'
						}
					],
					preToolUse: [
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
 * This is an internal helper - use resolveHookCommand for the full resolution.
 */
function normalizeHookCommand(raw: Record<string, unknown>): { command?: string; bash?: string; powershell?: string; cwd?: string; env?: Record<string, string>; timeoutSec?: number } | undefined {
	if (raw.type !== 'command') {
		return undefined;
	}

	const hasCommand = typeof raw.command === 'string' && raw.command.length > 0;
	const hasBash = typeof raw.bash === 'string' && raw.bash.length > 0;
	const hasPowerShell = typeof raw.powershell === 'string' && raw.powershell.length > 0;

	return {
		...(hasCommand && { command: raw.command as string }),
		...(hasBash && { bash: raw.bash as string }),
		...(hasPowerShell && { powershell: raw.powershell as string }),
		...(typeof raw.cwd === 'string' && { cwd: raw.cwd }),
		...(typeof raw.env === 'object' && raw.env !== null && { env: raw.env as Record<string, string> }),
		...(typeof raw.timeoutSec === 'number' && { timeoutSec: raw.timeoutSec }),
	};
}

/**
 * Formats a hook command for display.
 * If `command` is present, returns just that value.
 * Otherwise, joins "bash: <value>" and "powershell: <value>" with " | ".
 */
export function formatHookCommandLabel(hook: IHookCommand): string {
	if (hook.command) {
		return hook.command;
	}

	const parts: string[] = [];
	if (hook.bash) {
		parts.push(`bash: ${hook.bash}`);
	}
	if (hook.powershell) {
		parts.push(`powershell: ${hook.powershell}`);
	}
	return parts.join(' | ');
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
		...(normalized.bash && { bash: normalized.bash }),
		...(normalized.powershell && { powershell: normalized.powershell }),
		...(cwdUri && { cwd: cwdUri }),
		...(normalized.env && { env: normalized.env }),
		...(normalized.timeoutSec !== undefined && { timeoutSec: normalized.timeoutSec }),
	};
}
