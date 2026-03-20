/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

// =============================================================================
// Copilot CLI built-in tool interfaces
//
// The Copilot CLI (via @github/copilot) exposes these built-in tools. Tool names
// and parameter shapes are not typed in the SDK -- they come from the CLI server
// as plain strings. These interfaces are derived from observing the CLI's actual
// tool events and the ShellConfig class in @github/copilot.
//
// Shell tool names follow a pattern per ShellConfig:
//   shellToolName, readShellToolName, writeShellToolName,
//   stopShellToolName, listShellsToolName
// For bash: bash, read_bash, write_bash, bash_shutdown, list_bash
// For powershell: powershell, read_powershell, write_powershell, list_powershell
// =============================================================================

/**
 * Known Copilot CLI tool names. These are the `toolName` values that appear
 * in `tool.execution_start` events from the SDK.
 */
const enum CopilotToolName {
	Bash = 'bash',
	ReadBash = 'read_bash',
	WriteBash = 'write_bash',
	BashShutdown = 'bash_shutdown',
	ListBash = 'list_bash',

	PowerShell = 'powershell',
	ReadPowerShell = 'read_powershell',
	WritePowerShell = 'write_powershell',
	ListPowerShell = 'list_powershell',

	View = 'view',
	Edit = 'edit',
	Write = 'write',
	Grep = 'grep',
	Glob = 'glob',
	Patch = 'patch',
	WebSearch = 'web_search',
	AskUser = 'ask_user',
	ReportIntent = 'report_intent',
}

/** Parameters for the `bash` / `powershell` shell tools. */
interface ICopilotShellToolArgs {
	command: string;
	timeout?: number;
}

/** Parameters for file tools (`view`, `edit`, `write`). */
interface ICopilotFileToolArgs {
	file_path: string;
}

/** Parameters for the `grep` tool. */
interface ICopilotGrepToolArgs {
	pattern: string;
	path?: string;
	include?: string;
}

/** Parameters for the `glob` tool. */
interface ICopilotGlobToolArgs {
	pattern: string;
	path?: string;
}

/** Set of tool names that execute shell commands (bash or powershell). */
const SHELL_TOOL_NAMES: ReadonlySet<string> = new Set([
	CopilotToolName.Bash,
	CopilotToolName.PowerShell,
]);

/**
 * Tools that should not be shown to the user. These are internal tools
 * used by the CLI for its own purposes (e.g., reporting intent to the model).
 */
const HIDDEN_TOOL_NAMES: ReadonlySet<string> = new Set([
	CopilotToolName.ReportIntent,
]);

/**
 * Returns true if the tool should be hidden from the UI.
 */
export function isHiddenTool(toolName: string): boolean {
	return HIDDEN_TOOL_NAMES.has(toolName);
}

// =============================================================================
// Display helpers
//
// These functions translate Copilot CLI tool names and arguments into
// human-readable display strings. This logic lives here -- in the agent-host
// process -- so the IPC protocol stays agent-agnostic; the renderer never needs
// to know about specific tool names.
// =============================================================================

function truncate(text: string, maxLength: number): string {
	return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

export function getToolDisplayName(toolName: string): string {
	switch (toolName) {
		case CopilotToolName.Bash: return localize('toolName.bash', "Bash");
		case CopilotToolName.PowerShell: return localize('toolName.powershell', "PowerShell");
		case CopilotToolName.ReadBash:
		case CopilotToolName.ReadPowerShell: return localize('toolName.readShell', "Read Shell Output");
		case CopilotToolName.WriteBash:
		case CopilotToolName.WritePowerShell: return localize('toolName.writeShell', "Write Shell Input");
		case CopilotToolName.BashShutdown: return localize('toolName.bashShutdown', "Stop Shell");
		case CopilotToolName.ListBash:
		case CopilotToolName.ListPowerShell: return localize('toolName.listShells', "List Shells");
		case CopilotToolName.View: return localize('toolName.view', "View File");
		case CopilotToolName.Edit: return localize('toolName.edit', "Edit File");
		case CopilotToolName.Write: return localize('toolName.write', "Write File");
		case CopilotToolName.Grep: return localize('toolName.grep', "Search");
		case CopilotToolName.Glob: return localize('toolName.glob', "Find Files");
		case CopilotToolName.Patch: return localize('toolName.patch', "Patch");
		case CopilotToolName.WebSearch: return localize('toolName.webSearch', "Web Search");
		case CopilotToolName.AskUser: return localize('toolName.askUser', "Ask User");
		default: return toolName;
	}
}

export function getInvocationMessage(toolName: string, displayName: string, parameters: Record<string, unknown> | undefined): string {
	if (SHELL_TOOL_NAMES.has(toolName)) {
		const args = parameters as ICopilotShellToolArgs | undefined;
		if (args?.command) {
			const firstLine = args.command.split('\n')[0];
			return localize('toolInvoke.shellCmd', "Running `{0}`", truncate(firstLine, 80));
		}
		return localize('toolInvoke.shell', "Running {0} command", displayName);
	}

	switch (toolName) {
		case CopilotToolName.View: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (args?.file_path) {
				return localize('toolInvoke.viewFile', "Reading {0}", args.file_path);
			}
			return localize('toolInvoke.view', "Reading file");
		}
		case CopilotToolName.Edit: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (args?.file_path) {
				return localize('toolInvoke.editFile', "Editing {0}", args.file_path);
			}
			return localize('toolInvoke.edit', "Editing file");
		}
		case CopilotToolName.Write: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (args?.file_path) {
				return localize('toolInvoke.writeFile', "Writing to {0}", args.file_path);
			}
			return localize('toolInvoke.write', "Writing file");
		}
		case CopilotToolName.Grep: {
			const args = parameters as ICopilotGrepToolArgs | undefined;
			if (args?.pattern) {
				return localize('toolInvoke.grepPattern', "Searching for `{0}`", truncate(args.pattern, 80));
			}
			return localize('toolInvoke.grep', "Searching files");
		}
		case CopilotToolName.Glob: {
			const args = parameters as ICopilotGlobToolArgs | undefined;
			if (args?.pattern) {
				return localize('toolInvoke.globPattern', "Finding files matching `{0}`", truncate(args.pattern, 80));
			}
			return localize('toolInvoke.glob', "Finding files");
		}
		default:
			return localize('toolInvoke.generic', "Using \"{0}\"", displayName);
	}
}

export function getPastTenseMessage(toolName: string, displayName: string, parameters: Record<string, unknown> | undefined, success: boolean): string {
	if (!success) {
		return localize('toolComplete.failed', "\"{0}\" failed", displayName);
	}

	if (SHELL_TOOL_NAMES.has(toolName)) {
		const args = parameters as ICopilotShellToolArgs | undefined;
		if (args?.command) {
			const firstLine = args.command.split('\n')[0];
			return localize('toolComplete.shellCmd', "Ran `{0}`", truncate(firstLine, 80));
		}
		return localize('toolComplete.shell', "Ran {0} command", displayName);
	}

	switch (toolName) {
		case CopilotToolName.View: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (args?.file_path) {
				return localize('toolComplete.viewFile', "Read {0}", args.file_path);
			}
			return localize('toolComplete.view', "Read file");
		}
		case CopilotToolName.Edit: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (args?.file_path) {
				return localize('toolComplete.editFile', "Edited {0}", args.file_path);
			}
			return localize('toolComplete.edit', "Edited file");
		}
		case CopilotToolName.Write: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (args?.file_path) {
				return localize('toolComplete.writeFile', "Wrote to {0}", args.file_path);
			}
			return localize('toolComplete.write', "Wrote file");
		}
		case CopilotToolName.Grep: {
			const args = parameters as ICopilotGrepToolArgs | undefined;
			if (args?.pattern) {
				return localize('toolComplete.grepPattern', "Searched for `{0}`", truncate(args.pattern, 80));
			}
			return localize('toolComplete.grep', "Searched files");
		}
		case CopilotToolName.Glob: {
			const args = parameters as ICopilotGlobToolArgs | undefined;
			if (args?.pattern) {
				return localize('toolComplete.globPattern', "Found files matching `{0}`", truncate(args.pattern, 80));
			}
			return localize('toolComplete.glob', "Found files");
		}
		default:
			return localize('toolComplete.generic', "Used \"{0}\"", displayName);
	}
}

export function getToolInputString(toolName: string, parameters: Record<string, unknown> | undefined, rawArguments: string | undefined): string | undefined {
	if (!parameters && !rawArguments) {
		return undefined;
	}

	if (SHELL_TOOL_NAMES.has(toolName)) {
		const args = parameters as ICopilotShellToolArgs | undefined;
		return args?.command ?? rawArguments;
	}

	switch (toolName) {
		case CopilotToolName.Grep: {
			const args = parameters as ICopilotGrepToolArgs | undefined;
			return args?.pattern ?? rawArguments;
		}
		default:
			// For other tools, show the formatted JSON arguments
			if (parameters) {
				try {
					return JSON.stringify(parameters, null, 2);
				} catch {
					return rawArguments;
				}
			}
			return rawArguments;
	}
}

/**
 * Returns a rendering hint for the given tool. Currently only 'terminal' is
 * supported, which tells the renderer to display the tool as a terminal command
 * block.
 */
export function getToolKind(toolName: string): 'terminal' | undefined {
	if (SHELL_TOOL_NAMES.has(toolName)) {
		return 'terminal';
	}
	return undefined;
}

/**
 * Returns the shell language identifier for syntax highlighting.
 * Used when creating terminal tool-specific data for the renderer.
 */
export function getShellLanguage(toolName: string): string {
	switch (toolName) {
		case CopilotToolName.PowerShell: return 'powershell';
		default: return 'shellscript';
	}
}
