/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionRequest } from '@github/copilot-sdk';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { appendEscapedMarkdownInlineCode, escapeMarkdownLinkLabel } from '../../../../base/common/htmlContent.js';
import { hash } from '../../../../base/common/hash.js';
import { localize } from '../../../../nls.js';
import type { IAgentToolPendingConfirmationSignal } from '../../common/agentService.js';
import { stripRedundantCdPrefix } from '../../common/commandLineHelpers.js';
import { StringOrMarkdown } from '../../common/state/protocol/state.js';
import { basename } from '../../../../base/common/resources.js';

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
	Skill = 'skill',
	ExitPlanMode = 'exit_plan_mode',
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

/**
 * Parameters for the `view` tool. The Copilot CLI accepts an optional
 * `view_range: [startLine, endLine]` (1-based, inclusive). `endLine` may be
 * `-1` to mean "to end of file".
 */
interface ICopilotViewToolArgs extends ICopilotFileToolArgs {
	view_range?: number[];
}

/**
 * Normalizes a `view_range` array. Returns `undefined` unless the array has
 * exactly two integer elements with `startLine >= 0`. `endLine === -1` is
 * preserved as the "to end of file" sentinel; otherwise `endLine` must be
 * `>= startLine`.
 */
function formatViewRange(view_range: number[] | undefined): { startLine: number; endLine: number } | undefined {
	if (!Array.isArray(view_range) || view_range.length !== 2) {
		return undefined;
	}
	const [startLine, endLine] = view_range;
	if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
		return undefined;
	}
	if (startLine < 0) {
		return undefined;
	}
	if (endLine !== -1 && endLine < startLine) {
		return undefined;
	}
	return { startLine, endLine };
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

/** Set of tool names that write input to an interactive shell session. */
const WRITE_SHELL_TOOL_NAMES: ReadonlySet<string> = new Set([
	CopilotToolName.WriteBash,
	CopilotToolName.WritePowerShell,
]);

/** Set of tool names that read output from an interactive shell session. */
const READ_SHELL_TOOL_NAMES: ReadonlySet<string> = new Set([
	CopilotToolName.ReadBash,
	CopilotToolName.ReadPowerShell,
]);

/** Set of tool names that spawn subagent sessions. */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set([
	'task',
]);

/**
 * Tools that should not be shown to the user. These are internal tools
 * used by the CLI for its own purposes (e.g., reporting intent to the model).
 *
 * `skill` is hidden because the SDK already emits a richer `skill.invoked`
 * lifecycle event with the resolved skill file path; the agent session
 * synthesizes a tool-start/complete pair from that event so the UI can
 * render a clickable file link instead of just the skill name. See
 * {@link synthesizeSkillToolCall}.
 */
const HIDDEN_TOOL_NAMES: ReadonlySet<string> = new Set([
	CopilotToolName.ReportIntent,
	CopilotToolName.Skill,
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
	const uri = URI.file(path);
	return `[${basename(uri)}](${uri})`;
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
		case CopilotToolName.ExitPlanMode: return localize('toolName.exitPlanMode', "Plan");
		default: return toolName;
	}
}

export function getInvocationMessage(toolName: string, displayName: string, parameters: Record<string, unknown> | undefined): StringOrMarkdown {
	if (SHELL_TOOL_NAMES.has(toolName)) {
		const args = parameters as ICopilotShellToolArgs | undefined;
		if (args?.command) {
			const firstLine = args.command.split('\n')[0];
			return md(localize('toolInvoke.shellCmd', "Running {0}", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
		}
		return localize('toolInvoke.shell', "Running {0} command", displayName);
	}

	if (WRITE_SHELL_TOOL_NAMES.has(toolName)) {
		const args = parameters as ICopilotShellToolArgs | undefined;
		if (args?.command) {
			const firstLine = args.command.split('\n')[0];
			return md(localize('toolInvoke.writeShellCmd', "Sending {0} to shell", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
		}
		return localize('toolInvoke.writeShell', "Sending input to shell");
	}

	if (READ_SHELL_TOOL_NAMES.has(toolName)) {
		return localize('toolInvoke.readShell', "Reading shell output");
	}

	switch (toolName) {
		case CopilotToolName.View: {
			const args = parameters as ICopilotViewToolArgs | undefined;
			if (args?.path) {
				const link = formatPathAsMarkdownLink(args.path);
				const range = formatViewRange(args.view_range);
				if (range) {
					if (range.endLine === -1) {
						return md(localize('toolInvoke.viewFileFromLine', "Reading {0}, line {1} to the end", link, range.startLine));
					}
					if (range.endLine !== range.startLine) {
						return md(localize('toolInvoke.viewFileRange', "Reading {0}, lines {1} to {2}", link, range.startLine, range.endLine));
					}
					return md(localize('toolInvoke.viewFileLine', "Reading {0}, line {1}", link, range.startLine));
				}
				return md(localize('toolInvoke.viewFile', "Reading {0}", link));
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
				return md(localize('toolInvoke.grepPattern', "Searching for {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
			}
			return localize('toolInvoke.grep', "Searching files");
		}
		case CopilotToolName.Glob: {
			const args = parameters as ICopilotGlobToolArgs | undefined;
			if (args?.pattern) {
				return md(localize('toolInvoke.globPattern', "Finding files matching {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
			}
			return localize('toolInvoke.glob', "Finding files");
		}
		case CopilotToolName.ExitPlanMode:
			return localize('toolInvoke.exitPlanMode', "Presenting plan");
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
			return md(localize('toolComplete.shellCmd', "Ran {0}", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
		}
		return localize('toolComplete.shell', "Ran {0} command", displayName);
	}

	if (WRITE_SHELL_TOOL_NAMES.has(toolName)) {
		const args = parameters as ICopilotShellToolArgs | undefined;
		if (args?.command) {
			const firstLine = args.command.split('\n')[0];
			return md(localize('toolComplete.writeShellCmd', "Sent {0} to shell", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
		}
		return localize('toolComplete.writeShell', "Sent input to shell");
	}

	if (READ_SHELL_TOOL_NAMES.has(toolName)) {
		return localize('toolComplete.readShell', "Read shell output");
	}

	switch (toolName) {
		case CopilotToolName.View: {
			const args = parameters as ICopilotViewToolArgs | undefined;
			if (args?.path) {
				const link = formatPathAsMarkdownLink(args.path);
				const range = formatViewRange(args.view_range);
				if (range) {
					if (range.endLine === -1) {
						return md(localize('toolComplete.viewFileFromLine', "Read {0}, line {1} to the end", link, range.startLine));
					}
					if (range.endLine !== range.startLine) {
						return md(localize('toolComplete.viewFileRange', "Read {0}, lines {1} to {2}", link, range.startLine, range.endLine));
					}
					return md(localize('toolComplete.viewFileLine', "Read {0}, line {1}", link, range.startLine));
				}
				return md(localize('toolComplete.viewFile', "Read {0}", link));
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
				return md(localize('toolComplete.grepPattern', "Searched for {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
			}
			return localize('toolComplete.grep', "Searched files");
		}
		case CopilotToolName.Glob: {
			const args = parameters as ICopilotGlobToolArgs | undefined;
			if (args?.pattern) {
				return md(localize('toolComplete.globPattern', "Found files matching {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
			}
			return localize('toolComplete.glob', "Found files");
		}
		case CopilotToolName.ExitPlanMode:
			return localize('toolComplete.exitPlanMode', "Exited plan mode");
		default:
			return localize('toolComplete.generic', "Used \"{0}\"", displayName);
	}
}

// =============================================================================
// Skill event synthesis
//
// The Copilot SDK emits a `skill` tool call (which we hide) and, separately, a
// `skill.invoked` lifecycle event with the resolved skill file path. We turn
// the latter into a synthesized tool-start/complete pair so clients can render
// a clickable file link to the SKILL.md the agent loaded -- matching the
// existing `view`-tool display style. Live and replay paths share this helper
// so they stay in lock-step (see also the mirrored-pair gotcha for tool-call
// display in this file).
// =============================================================================

/** Subset of the SDK's `skill.invoked` payload that the synth helper needs. */
export interface ICopilotSkillInvokedData {
	readonly name: string;
	readonly path?: string;
	readonly description?: string;
}

/**
 * Builds a stable synthetic tool call id for a `skill.invoked` event so
 * reconnect/replay produces the same id as the original live emit. The id
 * is used unencoded as a path segment (e.g. by `ChatResponseResource.createUri`),
 * so it must not contain characters like `/` -- we hash any fallback values
 * that could carry filesystem paths or arbitrary text.
 */
export function getSkillSyntheticToolCallId(eventId: string | undefined, data: ICopilotSkillInvokedData): string {
	if (eventId) {
		return `synth-skill-${eventId}`;
	}
	const seed = data.path ?? data.name;
	return `synth-skill-${hash(seed).toString(16)}`;
}

/**
 * Synthesized data for a `skill.invoked` tool call. Used by both the live
 * session handler and the history-replay mapper so the two paths render
 * identically. Callers wrap this into protocol actions or {@link Turn}
 * data; this helper avoids any agent-protocol coupling.
 */
export interface ISynthesizedSkillToolCall {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly displayName: string;
	readonly invocationMessage: StringOrMarkdown;
	readonly pastTenseMessage: StringOrMarkdown;
}

/**
 * Synthesizes the data for a `skill.invoked` tool call (a tool-start /
 * tool-complete pair). Returns the constituent fields without coupling to
 * any specific event or action shape — callers compose them into protocol
 * actions or {@link Turn} entries as needed.
 */
export function synthesizeSkillToolCall(
	data: ICopilotSkillInvokedData,
	eventId: string | undefined,
): ISynthesizedSkillToolCall {
	const toolCallId = getSkillSyntheticToolCallId(eventId, data);
	const displayName = localize('toolName.skill', "Read Skill");
	// Use the skill name as the link text rather than the basename: every skill
	// file is named SKILL.md, so `Reading skill [plan]` reads better than the
	// always-identical `Reading skill [SKILL.md]`. The client may further upgrade
	// this link to a rich pill based on the `SKILL.md` basename. Skill names and
	// paths come from the SDK / agent host and are escaped to prevent markdown
	// injection from a malicious skill author.
	// Escape only the characters that would break out of markdown link text
	// syntax (`\` and `]`); a full markdown escape would leave visible
	// backslashes in renderers (like the skill pill) that extract link text
	// without re-parsing markdown.
	const escapedName = escapeMarkdownLinkLabel(data.name);
	const skillLink = data.path ? `[${escapedName}](${URI.file(data.path)})` : undefined;
	const invocationMessage: StringOrMarkdown = skillLink
		? md(localize('toolInvoke.skill', "Reading skill {0}", skillLink))
		: localize('toolInvoke.skillName', "Reading skill {0}", data.name);
	const pastTenseMessage: StringOrMarkdown = skillLink
		? md(localize('toolComplete.skill', "Read skill {0}", skillLink))
		: localize('toolComplete.skillName', "Read skill {0}", data.name);
	return {
		toolCallId,
		toolName: CopilotToolName.Skill,
		displayName,
		invocationMessage,
		pastTenseMessage,
	};
}

export function getToolInputString(toolName: string, parameters: Record<string, unknown> | undefined, rawArguments: string | undefined): string | undefined {
	if (!parameters && !rawArguments) {
		return undefined;
	}

	if (SHELL_TOOL_NAMES.has(toolName) || WRITE_SHELL_TOOL_NAMES.has(toolName)) {
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
 * Extracts subagent metadata (agent name, description) from the parsed
 * arguments of a Copilot SDK subagent tool call. The Copilot `task` tool
 * uses `agent_type` (snake_case), which this normalizes into the generic
 * `subagentAgentName` / `subagentDescription` shape used by the rest of the
 * agent host code.
 *
 * Only call this for tools where {@link getToolKind} returned `'subagent'`.
 */
export function getSubagentMetadata(parameters: Record<string, unknown> | undefined): { agentName?: string; description?: string } {
	if (!parameters) {
		return {};
	}
	const agentName = typeof parameters.agent_type === 'string' && parameters.agent_type.length > 0
		? parameters.agent_type
		: undefined;
	const description = typeof parameters.description === 'string' && parameters.description.length > 0
		? parameters.description
		: undefined;
	return { agentName, description };
}

/**
 * Returns the shell language identifier for syntax highlighting.
 * Used when creating terminal tool-specific data for the renderer.
 */
export function getShellLanguage(toolName: string): string {
	switch (toolName) {
		case CopilotToolName.PowerShell:
		case CopilotToolName.WritePowerShell:
		case CopilotToolName.ReadPowerShell: return 'powershell';
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
	/** URL — set for `url` permission requests. */
	url?: string;
	/** Unified diff of the proposed change — set for `write` permission requests. */
	diff?: string;
	/** New file contents that will be written — set for `write` permission requests. */
	newFileContents?: string;
}

/** Safely extract a string value from an SDK field that may be `unknown` at runtime. */
function str(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/**
 * Derives display fields from a permission request for the tool confirmation UI.
 */
export function getPermissionDisplay(request: ITypedPermissionRequest, workingDirectory?: URI): {
	confirmationTitle: string;
	invocationMessage: StringOrMarkdown;
	toolInput?: string;
	/** Normalized permission kind for auto-approval routing. */
	permissionKind: IAgentToolPendingConfirmationSignal['permissionKind'];
	/** File path extracted from the request. */
	permissionPath?: string;
} {
	const path = str(request.path) ?? str(request.fileName);
	const fullCommandText = str(request.fullCommandText);
	const intention = str(request.intention);
	const serverName = str(request.serverName);
	const toolName = str(request.toolName);

	switch (request.kind) {
		case 'shell': {
			// Strip a redundant `cd <workingDirectory> && …` prefix so the
			// confirmation dialog shows the simplified command.
			const shellParams: Record<string, unknown> | undefined = fullCommandText ? { command: fullCommandText } : undefined;
			stripRedundantCdPrefix(CopilotToolName.Bash, shellParams, workingDirectory);
			const cleanedCommand = typeof shellParams?.command === 'string' ? shellParams.command : fullCommandText;
			return {
				confirmationTitle: localize('copilot.permission.shell.title', "Run in terminal?"),
				invocationMessage: intention ?? getInvocationMessage(CopilotToolName.Bash, getToolDisplayName(CopilotToolName.Bash), cleanedCommand ? { command: cleanedCommand } : undefined),
				toolInput: cleanedCommand,
				permissionKind: 'shell',
				permissionPath: path,
			};
		}
		case 'custom-tool': {
			// Custom tool overrides (e.g. our shell tool). Extract the actual
			// tool args from the SDK's wrapper envelope.
			const args = typeof request.args === 'object' && request.args !== null ? request.args as Record<string, unknown> : undefined;
			const sdkToolName = str(request.toolName);
			if (args && sdkToolName && isShellTool(sdkToolName) && typeof args.command === 'string') {
				stripRedundantCdPrefix(sdkToolName, args, workingDirectory);
				const command = args.command as string;
				return {
					confirmationTitle: localize('copilot.permission.shell.title', "Run in terminal?"),
					invocationMessage: getInvocationMessage(sdkToolName, getToolDisplayName(sdkToolName), { command }),
					toolInput: command,
					permissionKind: 'shell',
					permissionPath: path,
				};
			}
			return {
				confirmationTitle: localize('copilot.permission.default.title', "Allow tool call?"),
				invocationMessage: md(localize('copilot.permission.default.message', "Allow the model to call {0}?", appendEscapedMarkdownInlineCode(toolName ?? request.kind))),
				toolInput: args ? tryStringify(args) : tryStringify(request),
				permissionKind: request.kind,
				permissionPath: path,
			};
		}
		case 'write':
			return {
				confirmationTitle: localize('copilot.permission.write.title', "Write file?"),
				invocationMessage: getInvocationMessage(CopilotToolName.Edit, getToolDisplayName(CopilotToolName.Edit), path ? { path } : undefined),
				toolInput: tryStringify(path ? { path } : request) ?? undefined,
				permissionKind: 'write',
				permissionPath: path,
			};
		case 'mcp': {
			const title = toolName ?? localize('copilot.permission.mcp.defaultTool', "MCP Tool");
			return {
				confirmationTitle: serverName
					? localize('copilot.permission.mcp.title', "Allow tool from {0}?", serverName)
					: localize('copilot.permission.default.title', "Allow tool call?"),
				invocationMessage: serverName ? `${serverName}: ${title}` : title,
				toolInput: tryStringify({ serverName, toolName }) ?? undefined,
				permissionKind: 'mcp',
				permissionPath: path,
			};
		}
		case 'read':
			return {
				confirmationTitle: localize('copilot.permission.read.title', "Read file?"),
				invocationMessage: intention ?? getInvocationMessage(CopilotToolName.View, getToolDisplayName(CopilotToolName.View), path ? { path } : undefined),
				toolInput: tryStringify(path ? { path, intention } : request) ?? undefined,
				permissionKind: 'read',
				permissionPath: path,
			};
		case 'url': {
			const url = str(request.url);
			// Parse through URL for punycode escaping, but preserve the raw value if parsing fails.
			const normalizedUrl = url ? (URL.canParse(url) ? new URL(url).href : url) : undefined;
			return {
				confirmationTitle: localize('copilot.permission.url.title', "Fetch URL?"),
				invocationMessage: md(localize('copilot.permission.url.message', "Allow fetching web content?")),
				toolInput: normalizedUrl ? JSON.stringify({ url: normalizedUrl }) : undefined,
				permissionKind: 'url',
			};
		}
		default:
			return {
				confirmationTitle: localize('copilot.permission.default.title', "Allow tool call?"),
				invocationMessage: md(localize('copilot.permission.default.message', "Allow the model to call {0}?", appendEscapedMarkdownInlineCode(toolName ?? request.kind))),
				toolInput: tryStringify(request) ?? undefined,
				permissionKind: request.kind,
				permissionPath: path,
			};
	}
}
