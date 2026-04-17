/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionRequest } from '@github/copilot-sdk';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import type { IAgentToolReadyEvent } from '../../common/agentService.js';
import { StringOrMarkdown } from '../../common/state/protocol/state.js';

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
	Create = 'create',
	Grep = 'grep',
	Glob = 'glob',
	ApplyPatch = 'apply_patch',
	GitApplyPatch = 'git_apply_patch',
	WebSearch = 'web_search',
	WebFetch = 'web_fetch',
	AskUser = 'ask_user',
	ReportIntent = 'report_intent',
}

/** Parameters for the `bash` / `powershell` shell tools. */
interface ICopilotShellToolArgs {
	command: string;
	timeout?: number;
}

/** Parameters for file tools (`view`, `edit`, `create`). */
interface ICopilotFileToolArgs {
	path: string;
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

/** Set of tool names that perform file edits. */
const EDIT_TOOL_NAMES: ReadonlySet<string> = new Set([
	CopilotToolName.Edit,
	CopilotToolName.Create,
	CopilotToolName.ApplyPatch,
	CopilotToolName.GitApplyPatch,
]);

/**
 * Returns true if the tool modifies files on disk.
 */
export function isEditTool(toolName: string): boolean {
	return EDIT_TOOL_NAMES.has(toolName);
}

/**
 * Extracts the target file path from an edit tool's parameters, if available.
 */
export function getEditFilePath(parameters: unknown): string | undefined {
	if (typeof parameters === 'string') {
		try {
			parameters = JSON.parse(parameters);
		} catch {
			return undefined;
		}
	}

	const args = parameters as ICopilotFileToolArgs | undefined;
	return args?.path;
}

/** Set of tool names that execute shell commands (bash or powershell). */
const SHELL_TOOL_NAMES: ReadonlySet<string> = new Set([
	CopilotToolName.Bash,
	CopilotToolName.PowerShell,
]);

/** Set of tool names that spawn subagent sessions. */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set([
	'task',
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

/**
 * Returns true if the tool executes shell commands.
 */
export function isShellTool(toolName: string): boolean {
	return SHELL_TOOL_NAMES.has(toolName);
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

/**
 * Formats a file path as a markdown link `[](file-uri)` so it renders
 * as a clickable file widget in the chat UI.
 */
function formatPathAsMarkdownLink(path: string): string {
	return `[](${URI.file(path).toString()})`;
}

/**
 * Wraps a localized message containing a markdown file link into a
 * `StringOrMarkdown` object so the renderer treats it as markdown.
 */
function md(value: string): StringOrMarkdown {
	return { markdown: value };
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
		case CopilotToolName.Create: return localize('toolName.create', "Create File");
		case CopilotToolName.Grep: return localize('toolName.grep', "Search");
		case CopilotToolName.Glob: return localize('toolName.glob', "Find Files");
		case CopilotToolName.ApplyPatch:
		case CopilotToolName.GitApplyPatch: return localize('toolName.patch', "Patch");
		case CopilotToolName.WebSearch: return localize('toolName.webSearch', "Web Search");
		case CopilotToolName.WebFetch: return localize('toolName.webFetch', "Web Fetch");
		case CopilotToolName.AskUser: return localize('toolName.askUser', "Ask User");
		default: return toolName;
	}
}

export function getInvocationMessage(toolName: string, displayName: string, parameters: Record<string, unknown> | undefined): StringOrMarkdown {
	if (SHELL_TOOL_NAMES.has(toolName)) {
		const args = parameters as ICopilotShellToolArgs | undefined;
		if (args?.command) {
			const firstLine = args.command.split('\n')[0];
			return md(localize('toolInvoke.shellCmd', "Running `{0}`", truncate(firstLine, 80)));
		}
		return localize('toolInvoke.shell', "Running {0} command", displayName);
	}

	switch (toolName) {
		case CopilotToolName.View: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (args?.path) {
				return md(localize('toolInvoke.viewFile', "Reading {0}", formatPathAsMarkdownLink(args.path)));
			}
			return localize('toolInvoke.view', "Reading file");
		}
		case CopilotToolName.Edit: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (args?.path) {
				return md(localize('toolInvoke.editFile', "Editing {0}", formatPathAsMarkdownLink(args.path)));
			}
			return localize('toolInvoke.edit', "Editing file");
		}
		case CopilotToolName.Create: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (args?.path) {
				return md(localize('toolInvoke.createFile', "Creating {0}", formatPathAsMarkdownLink(args.path)));
			}
			return localize('toolInvoke.create', "Creating file");
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

export function getPastTenseMessage(toolName: string, displayName: string, parameters: Record<string, unknown> | undefined, success: boolean): StringOrMarkdown {
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
			if (args?.path) {
				return md(localize('toolComplete.viewFile', "Read {0}", formatPathAsMarkdownLink(args.path)));
			}
			return localize('toolComplete.view', "Read file");
		}
		case CopilotToolName.Edit: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (args?.path) {
				return md(localize('toolComplete.editFile', "Edited {0}", formatPathAsMarkdownLink(args.path)));
			}
			return localize('toolComplete.edit', "Edited file");
		}
		case CopilotToolName.Create: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (args?.path) {
				return md(localize('toolComplete.createFile', "Created {0}", formatPathAsMarkdownLink(args.path)));
			}
			return localize('toolComplete.create', "Created file");
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
		// Custom tool overrides may wrap the args: { kind: 'custom-tool', args: { command: '...' } }
		const command = args?.command ?? (args as Record<string, unknown> | undefined)?.args;
		if (typeof command === 'string') {
			return command;
		}
		if (typeof command === 'object' && command !== null && hasKey(command, { command: true })) {
			return (command as ICopilotShellToolArgs).command;
		}
		return rawArguments;
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
export function getToolKind(toolName: string): 'terminal' | 'subagent' | undefined {
	if (SHELL_TOOL_NAMES.has(toolName)) {
		return 'terminal';
	}
	if (SUBAGENT_TOOL_NAMES.has(toolName)) {
		return 'subagent';
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

// =============================================================================
// Permission display
//
// Derives display fields from SDK permission requests for the tool
// confirmation UI. Colocated with the tool-start display helpers above so
// that formatting utilities (formatPathAsMarkdownLink, md, etc.) are shared.
// =============================================================================

export function tryStringify(value: unknown): string | undefined {
	try {
		return JSON.stringify(value);
	} catch {
		return undefined;
	}
}

/**
 * Extends the SDK's {@link PermissionRequest} with the known extra properties
 * that arrive on the index-signature. The SDK defines these as `[key: string]: unknown`
 * so this interface adds proper types for the fields we actually use.
 */
export interface ITypedPermissionRequest extends PermissionRequest {
	/** File path — set for `read` permission requests. */
	path?: string;
	/** File path — set for `write` permission requests. */
	fileName?: string;
	/** Full shell command text — set for `shell` permission requests. */
	fullCommandText?: string;
	/** Human-readable intention describing the operation. */
	intention?: string;
	/** MCP server name — set for `mcp` permission requests. */
	serverName?: string;
	/** Tool name — set for `mcp` and `custom-tool` permission requests. */
	toolName?: string;
	/** Tool arguments — set for `custom-tool` permission requests. */
	args?: Record<string, unknown>;
}

/** Safely extract a string value from an SDK field that may be `unknown` at runtime. */
function str(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/**
 * Derives display fields from a permission request for the tool confirmation UI.
 */
export function getPermissionDisplay(request: ITypedPermissionRequest): {
	confirmationTitle: string;
	invocationMessage: StringOrMarkdown;
	toolInput?: string;
	/** Normalized permission kind for auto-approval routing. */
	permissionKind: IAgentToolReadyEvent['permissionKind'];
	/** File path extracted from the request. */
	permissionPath?: string;
} {
	const path = str(request.path) ?? str(request.fileName);
	const fullCommandText = str(request.fullCommandText);
	const intention = str(request.intention);
	const serverName = str(request.serverName);
	const toolName = str(request.toolName);

	switch (request.kind) {
		case 'shell':
			return {
				confirmationTitle: localize('copilot.permission.shell.title', "Run in terminal"),
				invocationMessage: intention ?? getInvocationMessage(CopilotToolName.Bash, getToolDisplayName(CopilotToolName.Bash), fullCommandText ? { command: fullCommandText } : undefined),
				toolInput: fullCommandText,
				permissionKind: 'shell',
				permissionPath: path,
			};
		case 'custom-tool': {
			// Custom tool overrides (e.g. our shell tool). Extract the actual
			// tool args from the SDK's wrapper envelope.
			const args = typeof request.args === 'object' && request.args !== null ? request.args as Record<string, unknown> : undefined;
			const command = typeof args?.command === 'string' ? args.command : undefined;
			const sdkToolName = str(request.toolName);
			if (command && sdkToolName && isShellTool(sdkToolName)) {
				return {
					confirmationTitle: localize('copilot.permission.shell.title', "Run in terminal"),
					invocationMessage: getInvocationMessage(sdkToolName, getToolDisplayName(sdkToolName), { command }),
					toolInput: command,
					permissionKind: 'shell',
					permissionPath: path,
				};
			}
			return {
				confirmationTitle: toolName ?? localize('copilot.permission.default.title', "Permission request"),
				invocationMessage: localize('copilot.permission.default.message', "Permission request"),
				toolInput: args ? tryStringify(args) : tryStringify(request),
				permissionKind: request.kind,
				permissionPath: path,
			};
		}
		case 'write':
			return {
				confirmationTitle: localize('copilot.permission.write.title', "Write file"),
				invocationMessage: getInvocationMessage(CopilotToolName.Edit, getToolDisplayName(CopilotToolName.Edit), path ? { path } : undefined),
				toolInput: tryStringify(path ? { path } : request) ?? undefined,
				permissionKind: 'write',
				permissionPath: path,
			};
		case 'mcp': {
			const title = toolName ?? localize('copilot.permission.mcp.defaultTool', "MCP Tool");
			return {
				confirmationTitle: serverName ? `${serverName}: ${title}` : title,
				invocationMessage: serverName ? `${serverName}: ${title}` : title,
				toolInput: tryStringify({ serverName, toolName }) ?? undefined,
				permissionKind: 'mcp',
				permissionPath: path,
			};
		}
		case 'read':
			return {
				confirmationTitle: localize('copilot.permission.read.title', "Read file"),
				invocationMessage: intention ?? getInvocationMessage(CopilotToolName.View, getToolDisplayName(CopilotToolName.View), path ? { path } : undefined),
				toolInput: tryStringify(path ? { path, intention } : request) ?? undefined,
				permissionKind: 'read',
				permissionPath: path,
			};
		default:
			return {
				confirmationTitle: localize('copilot.permission.default.title', "Permission request"),
				invocationMessage: localize('copilot.permission.default.message', "Permission request"),
				toolInput: tryStringify(request) ?? undefined,
				permissionKind: request.kind,
				permissionPath: path,
			};
	}
}
