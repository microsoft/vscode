/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionRequest, SkillInvokedData } from '@github/copilot-sdk';
import { hasKey, isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { appendEscapedMarkdownInlineCode, escapeMarkdownLinkLabel, MarkdownString } from '../../../../base/common/htmlContent.js';
import { hash } from '../../../../base/common/hash.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { localize } from '../../../../nls.js';
import type { IAgentToolPendingConfirmationSignal } from '../../common/agent.js';
import type { ToolKind } from '../../common/meta/agentToolCallMeta.js';
import { stripRedundantCdPrefix } from '../../common/commandLineHelpers.js';
import { parsePartialToolInput } from '../../common/partialToolInput.js';
import { StringOrMarkdown } from '../../common/state/protocol/state.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { getStreamingCreateMessage, getStreamingInsertMessage, getStreamingPatchMessage, getStreamingReplaceMessage, streamingToolTextLineCount, type ToolPathResolver } from '../../common/streamingToolCallDisplay.js';
import { getServerToolDisplay } from '../shared/serverToolGroups.js';

// =============================================================================
// Copilot CLI built-in tool interfaces
//
// The Copilot CLI (via @github/copilot-sdk) exposes these built-in tools. Tool names
// and parameter shapes are not typed in the SDK -- they come from the CLI server
// as plain strings. These interfaces are derived from observing the CLI's actual
// tool events and the Copilot Chat extension's CLI display table.
//
// Shell tool names follow a pattern per ShellConfig:
//   shellToolName, readShellToolName, writeShellToolName,
//   stopShellToolName, listShellsToolName
// For bash: bash, read_bash, write_bash, stop_bash/bash_shutdown, list_bash
// For powershell: powershell, read_powershell, write_powershell, stop_powershell/powershell_shutdown, list_powershell
// =============================================================================

/**
 * Known Copilot CLI tool names. These are the `toolName` values that appear
 * in `tool.execution_start` events from the SDK.
 */
export const enum CopilotToolName {
	StrReplaceEditor = 'str_replace_editor',
	StrReplace = 'str_replace',
	Insert = 'insert',

	Bash = 'bash',
	ReadBash = 'read_bash',
	WriteBash = 'write_bash',
	StopBash = 'stop_bash',
	BashShutdown = 'bash_shutdown',
	ListBash = 'list_bash',

	PowerShell = 'powershell',
	ReadPowerShell = 'read_powershell',
	WritePowerShell = 'write_powershell',
	StopPowerShell = 'stop_powershell',
	PowerShellShutdown = 'powershell_shutdown',
	ListPowerShell = 'list_powershell',

	View = 'view',
	Edit = 'edit',
	Create = 'create',
	Grep = 'grep',
	Rg = 'rg',
	Glob = 'glob',
	SearchCodeSubagent = 'search_code_subagent',
	ReplyToComment = 'reply_to_comment',
	CodeReview = 'code_review',
	ApplyPatch = 'apply_patch',
	GitApplyPatch = 'git_apply_patch',
	WebSearch = 'web_search',
	WebFetch = 'web_fetch',
	AskUser = 'ask_user',
	ReportIntent = 'report_intent',
	Think = 'think',
	ReportProgress = 'report_progress',
	UpdateTodo = 'update_todo',
	ShowFile = 'show_file',
	FetchCopilotCliDocumentation = 'fetch_copilot_cli_documentation',
	ProposeWork = 'propose_work',
	TaskComplete = 'task_complete',
	Skill = 'skill',
	Task = 'task',
	ListAgents = 'list_agents',
	ReadAgent = 'read_agent',
	ExitPlanMode = 'exit_plan_mode',
	Sql = 'sql',
	Lsp = 'lsp',
	CreatePullRequest = 'create_pull_request',
	GhAdvisoryDatabase = 'gh-advisory-database',
	StoreMemory = 'store_memory',
	ParallelValidation = 'parallel_validation',
	WriteAgent = 'write_agent',
	McpReload = 'mcp_reload',
	McpValidate = 'mcp_validate',
	ToolSearchToolRegex = 'tool_search_tool_regex',
	CodeqlChecker = 'codeql_checker',
}

/**
 * Copilot CLI tools withheld from ephemeral sessions, where subagents only add
 * latency.
 */
export const EPHEMERAL_DISABLED_COPILOT_TOOLS: readonly CopilotToolName[] = [
	CopilotToolName.Task,
];

/** Parameters for the `bash` / `powershell` shell tools. */
interface ICopilotShellToolArgs {
	command: string;
	timeout?: number;
}

/** Parameters for file tools (`view`, `edit`, `create`). */
interface ICopilotFileToolArgs {
	path: string;
}

interface ICopilotEditToolArgs extends ICopilotFileToolArgs {
	old_str?: string;
	new_str?: string;
}

interface ICopilotCreateToolArgs extends ICopilotFileToolArgs {
	file_text?: string;
}

interface ICopilotInsertToolArgs extends ICopilotFileToolArgs {
	insert_line?: number;
	new_str?: string;
}

interface ICopilotStrReplaceEditorToolArgs extends ICopilotEditToolArgs, ICopilotCreateToolArgs, ICopilotInsertToolArgs {
	command?: string;
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

/**
 * Parameters for the `grep` tool. The Copilot CLI's `grep` accepts the same
 * rich rg-flag schema as `rg`; the older narrower shape (e.g. `include`) is
 * no longer used.
 */
interface ICopilotGrepToolArgs {
	pattern: string;
	path?: string;
	output_mode?: 'content' | 'files_with_matches' | 'count';
	glob?: string;
	type?: string;
	'-i'?: boolean;
	'-A'?: number;
	'-B'?: number;
	'-C'?: number;
	'-n'?: boolean;
	head_limit?: number;
	multiline?: boolean;
}

/**
 * Parameters for the `rg` tool. Mirrors {@link ICopilotGrepToolArgs} today but
 * is kept as a distinct interface so the two tools can drift independently if
 * the SDK ever differentiates them.
 */
interface ICopilotRgToolArgs {
	pattern: string;
	path?: string;
	output_mode?: 'content' | 'files_with_matches' | 'count';
	glob?: string;
	type?: string;
	'-i'?: boolean;
	'-A'?: number;
	'-B'?: number;
	'-C'?: number;
	'-n'?: boolean;
	head_limit?: number;
	multiline?: boolean;
}

/** Parameters for the `glob` tool. */
interface ICopilotGlobToolArgs {
	pattern: string;
	path?: string;
}

/** Parameters for the `sql` tool. */
interface ICopilotSqlToolArgs {
	description?: string;
	query?: string;
}

/** Parameters for the `web_fetch` tool. */
interface ICopilotWebFetchToolArgs {
	url: string;
}

/** Parameters for the network and subagent search tools. */
interface ICopilotLongRunningSearchToolArgs {
	query: string;
}

/**
 * Parameters shared by the agent-coordination tools (`read_agent`,
 * `write_agent`). The Copilot CLI identifies the target agent by its
 * human-readable `agent_id` (e.g. `math-helper`).
 */
interface ICopilotAgentToolArgs {
	agent_id?: string;
}

/**
 * Reads a well-formed `agent_id` from untrusted tool parameters. Since these are
 * parsed from JSON they may not match the expected shape, so the id is returned
 * only when it is a non-empty string and is therefore safe to render as inline
 * markdown code.
 */
function getAgentId(parameters: Record<string, unknown> | undefined): string | undefined {
	const agentId = (parameters as ICopilotAgentToolArgs | undefined)?.agent_id;
	return typeof agentId === 'string' && agentId.length > 0 ? agentId : undefined;
}

/**
 * Parameters for the `apply_patch` / `git_apply_patch` tools. The patch text
 * itself lives in `input` using the V4A diff format (file headers like
 * `*** Update File: <path>`), so file paths must be parsed out of the body
 * rather than read from a top-level field.
 */
interface ICopilotApplyPatchToolArgs {
	input?: string;
	/** Some SDK callers send the patch under `patch` instead of `input`. */
	patch?: string;
	explanation?: string;
}

/**
 * Headers of the V4A patch format the `apply_patch` tool accepts. Tolerates
 * leading whitespace; trims the captured path.
 */
const APPLY_PATCH_FILE_HEADERS = [
	/^\s*\*\*\*\s+Update File:\s*(.+?)\s*$/,
	/^\s*\*\*\*\s+Add File:\s*(.+?)\s*$/,
	/^\s*\*\*\*\s+Delete File:\s*(.+?)\s*$/,
	/^\s*\*\*\*\s+Move to:\s*(.+?)\s*$/,
];

/**
 * Extracts the set of file paths affected by an `apply_patch` payload. Reads
 * the `*** Update File:` / `*** Add File:` / `*** Delete File:` / `*** Move to:`
 * headers from the V4A diff body. Returns paths in document order with
 * duplicates removed.
 *
 * Accepts either a structured args object ({@link ICopilotApplyPatchToolArgs})
 * or a bare patch string. The Copilot SDK delivers `apply_patch` with
 * `arguments` as a raw V4A patch string (custom tool format), not as a JSON
 * object, so the string fallback is the common case for apply_patch.
 */
function getApplyPatchFiles(args: string | ICopilotApplyPatchToolArgs | undefined): string[] {
	const text = typeof args === 'string' ? args : (args?.input ?? args?.patch);
	if (typeof text !== 'string' || text.length === 0) {
		return [];
	}
	const seen = new Set<string>();
	const out: string[] = [];
	for (const line of text.split('\n')) {
		for (const re of APPLY_PATCH_FILE_HEADERS) {
			const m = re.exec(line);
			if (m) {
				const path = m[1];
				if (path && !seen.has(path)) {
					seen.add(path);
					out.push(path);
				}
				break;
			}
		}
	}
	return out;
}

/** Set of tool names that perform file edits. */
const EDIT_TOOL_NAMES: ReadonlySet<string> = new Set([
	CopilotToolName.Edit,
	CopilotToolName.StrReplace,
	CopilotToolName.Insert,
	CopilotToolName.Create,
	CopilotToolName.ApplyPatch,
	CopilotToolName.GitApplyPatch,
]);

const STR_REPLACE_EDITOR_EDIT_COMMANDS: ReadonlySet<string> = new Set([
	CopilotToolName.Edit,
	CopilotToolName.StrReplace,
	CopilotToolName.Insert,
	CopilotToolName.Create,
]);

/**
 * Returns true if the tool modifies files on disk.
 */
export function isEditTool(toolName: string, command?: string): boolean {
	if (EDIT_TOOL_NAMES.has(toolName)) {
		return true;
	}
	if (toolName === CopilotToolName.StrReplaceEditor) {
		return command !== undefined && STR_REPLACE_EDITOR_EDIT_COMMANDS.has(command);
	}
	return false;
}

/**
 * Extracts the target file path from an edit tool's parameters, if available.
 * For `apply_patch` / `git_apply_patch` the first file in the V4A patch body
 * is returned. Callers that need every affected file (for snapshotting all
 * edits in a multi-file patch) should use {@link getEditFilePaths} instead.
 */
export function getEditFilePath(parameters: unknown): string | undefined {
	return getEditFilePaths(parameters)[0];
}

/**
 * Extracts every file path an edit tool will touch. For `edit` / `create` this
 * is the single `path` parameter; for `apply_patch` / `git_apply_patch` this
 * is the unique set of files declared in the V4A patch body, in document
 * order. Returns an empty array if no paths can be determined.
 */
export function getEditFilePaths(parameters: unknown): string[] {
	if (typeof parameters === 'string') {
		// Could be either a JSON-encoded args object or a raw V4A patch
		// string. Copilot SDK delivers `apply_patch` arguments as a bare
		// patch string (custom tool format), so when JSON parsing fails
		// fall back to treating it as the patch body.
		try {
			parameters = JSON.parse(parameters);
		} catch {
			return getApplyPatchFiles(parameters as string);
		}
		// JSON.parse may have returned a string (e.g. a JSON-encoded patch
		// body that round-trips through tryStringify on the call site).
		if (typeof parameters === 'string') {
			return getApplyPatchFiles(parameters);
		}
	}

	if (!parameters || typeof parameters !== 'object') {
		return [];
	}

	const patchArgs = parameters as ICopilotApplyPatchToolArgs;
	if (typeof patchArgs.input === 'string' || typeof patchArgs.patch === 'string') {
		return getApplyPatchFiles(patchArgs);
	}

	const args = parameters as ICopilotFileToolArgs;
	return typeof args.path === 'string' ? [args.path] : [];
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

/** Set of tool names that perform file/text search. */
const SEARCH_TOOL_NAMES: ReadonlySet<string> = new Set([
	CopilotToolName.Grep,
	CopilotToolName.Rg,
	CopilotToolName.Glob,
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
 * Returns true for the auto-approved agent-coordination tools (list/read/write
 * agents). These are client-contributed tools that never go through the
 * permission flow, so the agent host auto-readies them at start to surface a
 * tailored invocation message instead of the generic fallback.
 */
export function isAgentCoordinationTool(toolName: string): boolean {
	return toolName === CopilotToolName.ListAgents
		|| toolName === CopilotToolName.ReadAgent
		|| toolName === CopilotToolName.WriteAgent;
}

/**
 * Returns true when the tool is Copilot's internal Autopilot completion signal.
 */
export function isTaskCompleteTool(toolName: string): boolean {
	return toolName === CopilotToolName.TaskComplete;
}

/**
 * Extracts the user-facing Autopilot completion summary from the original
 * `summary` argument, falling back to the tool output for incomplete events.
 */
export function getTaskCompleteSummary(parameters: Record<string, unknown> | undefined, toolOutput: string | undefined): string | undefined {
	const summary = parameters?.summary;
	if (typeof summary === 'string' && summary.trim().length > 0) {
		return summary;
	}
	return toolOutput && toolOutput.trim().length > 0 ? toolOutput : undefined;
}

/**
 * Formats the Autopilot completion summary as the markdown response part
 * content, including the localized prefix.
 */
export function getTaskCompleteMarkdown(parameters: Record<string, unknown> | undefined, toolOutput: string | undefined): string | undefined {
	const summary = getTaskCompleteSummary(parameters, toolOutput);
	if (!summary) {
		return undefined;
	}
	return '\n\n' + localize('toolMarkdown.taskComplete', "**Task completed:** {0}", summary);
}

/**
 * Returns true if the tool should render as a markdown response part instead
 * of a tool-call entry.
 */
export function isMarkdownRenderedTool(toolName: string): boolean {
	return isTaskCompleteTool(toolName);
}

/**
 * Returns markdown content for tools rendered as inline markdown response
 * parts.
 */
export function getToolMarkdownContent(toolName: string, parameters: Record<string, unknown> | undefined): string | undefined {
	if (!isMarkdownRenderedTool(toolName)) {
		return undefined;
	}
	const summary = getTaskCompleteSummary(parameters, undefined);
	if (!summary) {
		return undefined;
	}
	return getTaskCompleteMarkdown(parameters, undefined);
}

/**
 * Returns true if the tool executes shell commands.
 */
export function isShellTool(toolName: string): boolean {
	return SHELL_TOOL_NAMES.has(toolName);
}

/**
 * Extracts the intention for a shell tool call from its `description`
 * argument. The Copilot shell tools (`bash`/`powershell`) carry a short
 * human-readable description of what the command does, which matches the
 * model's intention summary. Non-shell tools have no such argument, so this
 * returns `undefined` for them.
 */
export function getShellIntention(toolName: string, parameters: Record<string, unknown> | undefined): string | undefined {
	if (isShellTool(toolName) && typeof parameters?.description === 'string' && parameters.description.length > 0) {
		return parameters.description;
	}
	return undefined;
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

const COPILOT_SDK_TOOL_OUTPUT_BASENAME_RE = /^(?:\d{10,}-copilot-tool-output-(?:[a-z0-9]{6}|\d+-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})|copilot-tool-output-\d{10,}-[a-z0-9]+)\.txt$/i;

/**
 * Matches the temp-file basename layouts the Copilot SDK uses when spilling large tool output to disk.
 * Callers making trust decisions must separately verify the parent directory.
 */
export function isCopilotSdkToolOutputFile(filePath: string): boolean {
	const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
	const fileName = lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;
	return COPILOT_SDK_TOOL_OUTPUT_BASENAME_RE.test(fileName);
}

/**
 * Formats a file path as a markdown link `[](file-uri)` so it renders
 * as a clickable file widget in the chat UI.
 */
function formatPathAsMarkdownLink(path: string): string {
	const uri = URI.file(path);
	return `[${escapeMarkdownLinkLabel(basename(uri))}](${uri})`;
}

function formatUrlAsMarkdownLink(url: string): string {
	return new MarkdownString().appendLink(url, truncate(url, 80)).value;
}

/**
 * Wraps a localized message containing a markdown file link into a
 * `StringOrMarkdown` object so the renderer treats it as markdown.
 */
function md(value: string): StringOrMarkdown {
	return { markdown: value };
}

const identityPathResolver: ToolPathResolver = path => path;

export function parseCopilotStreamingToolInput(raw: string): unknown {
	return parsePartialToolInput(raw) ?? raw;
}

export function getToolDisplayName(toolName: string): string {
	const serverDisplay = getServerToolDisplay(toolName, undefined)?.displayName;
	if (serverDisplay !== undefined) {
		return serverDisplay;
	}
	switch (toolName) {
		case CopilotToolName.StrReplaceEditor:
		case CopilotToolName.Edit:
		case CopilotToolName.StrReplace:
		case CopilotToolName.Insert: return localize('toolName.edit', "Edit File");
		case CopilotToolName.Create: return localize('toolName.create', "Create File");
		case CopilotToolName.View: return localize('toolName.read', "Read");
		case CopilotToolName.Bash:
		case CopilotToolName.PowerShell: return localize('toolName.shell', "Run Shell Command");
		case CopilotToolName.ReadBash:
		case CopilotToolName.ReadPowerShell: return localize('toolName.readTerminal', "Read Terminal");
		case CopilotToolName.WriteBash: return localize('toolName.writeBash', "Write to Bash");
		case CopilotToolName.WritePowerShell: return localize('toolName.writePowerShell', "Write to PowerShell");
		case CopilotToolName.StopBash:
		case CopilotToolName.StopPowerShell:
		case CopilotToolName.BashShutdown:
		case CopilotToolName.PowerShellShutdown: return localize('toolName.stopShell', "Stop Terminal Session");
		case CopilotToolName.ListBash:
		case CopilotToolName.ListPowerShell: return localize('toolName.listShellSessions', "List Shell Sessions");
		case CopilotToolName.Grep:
		case CopilotToolName.Rg:
		case CopilotToolName.Glob: return localize('toolName.search', "Search");
		case CopilotToolName.SearchCodeSubagent: return localize('toolName.searchCode', "Search Code");
		case CopilotToolName.ApplyPatch: return localize('toolName.applyPatch', "Apply Patch");
		case CopilotToolName.GitApplyPatch: return localize('toolName.patch', "Patch");
		case CopilotToolName.CodeqlChecker: return localize('toolName.codeqlChecker', "CodeQL Security Scan");
		case CopilotToolName.CodeReview: return localize('toolName.codeReview', "Code Review");
		case CopilotToolName.ReplyToComment: return localize('toolName.replyToComment', "Reply to Comment");
		case CopilotToolName.Think: return localize('toolName.think', "Thinking");
		case CopilotToolName.ReportIntent: return localize('toolName.reportIntent', "Report Intent");
		case CopilotToolName.ReportProgress: return localize('toolName.reportProgress', "Progress update");
		case CopilotToolName.WebSearch: return localize('toolName.webSearch', "Web Search");
		case CopilotToolName.WebFetch: return localize('toolName.fetchWebContent', "Fetch Web Content");
		case CopilotToolName.UpdateTodo: return localize('toolName.updateTodo', "Update Todo");
		case CopilotToolName.ShowFile: return localize('toolName.showFile', "Show File");
		case CopilotToolName.FetchCopilotCliDocumentation: return localize('toolName.fetchCopilotCliDocumentation', "Fetch Documentation");
		case CopilotToolName.ProposeWork: return localize('toolName.proposeWork', "Propose Work");
		case CopilotToolName.TaskComplete: return localize('toolName.taskComplete', "Task Complete");
		case CopilotToolName.AskUser: return localize('toolName.askUser', "Ask User");
		case CopilotToolName.Skill: return localize('toolName.invokeSkill', "Invoke Skill");
		case CopilotToolName.Task: return localize('toolName.task', "Delegate Task");
		case CopilotToolName.ListAgents: return localize('toolName.listAgents', "List Agents");
		case CopilotToolName.ReadAgent: return localize('toolName.readAgent', "Read Agent");
		case CopilotToolName.ExitPlanMode: return localize('toolName.exitPlanModeFull', "Exit Plan Mode");
		case CopilotToolName.Sql: return localize('toolName.sql', "Execute SQL");
		case CopilotToolName.Lsp: return localize('toolName.lsp', "Language Server");
		case CopilotToolName.CreatePullRequest: return localize('toolName.createPullRequest', "Create Pull Request");
		case CopilotToolName.GhAdvisoryDatabase: return localize('toolName.ghAdvisoryDatabase', "Check Dependencies");
		case CopilotToolName.StoreMemory: return localize('toolName.storeMemory', "Store Memory");
		case CopilotToolName.ParallelValidation: return localize('toolName.parallelValidation', "Validate Changes");
		case CopilotToolName.WriteAgent: return localize('toolName.writeAgent', "Write to Agent");
		case CopilotToolName.McpReload: return localize('toolName.mcpReload', "Reload MCP Config");
		case CopilotToolName.McpValidate: return localize('toolName.mcpValidate', "Validate MCP Config");
		case CopilotToolName.ToolSearchToolRegex: return localize('toolName.toolSearchToolRegex', "Search Tools");
		default: return toolName;
	}
}

export function getInvocationMessage(toolName: string, displayName: string, parameters: Record<string, unknown> | undefined, resolvePath: ToolPathResolver = identityPathResolver): StringOrMarkdown {
	const serverDisplay = getServerToolDisplay(toolName, parameters)?.invocationMessage;
	if (serverDisplay !== undefined) {
		return serverDisplay;
	}

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
			return md(localize('toolInvoke.writeShellCmd', "Send {0} to shell", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
		}
		return localize('toolInvoke.writeShell', "Send input to shell");
	}

	if (READ_SHELL_TOOL_NAMES.has(toolName)) {
		return localize('toolInvoke.readTerminal', "Reading Terminal");
	}

	switch (toolName) {
		case CopilotToolName.View: {
			const args = parameters as ICopilotViewToolArgs | undefined;
			if (typeof args?.path === 'string' && args.path) {
				if (isCopilotSdkToolOutputFile(args.path)) {
					return localize('toolInvoke.viewToolOutput', "Read tool output");
				}
				const link = formatPathAsMarkdownLink(resolvePath(args.path));
				const range = formatViewRange(args.view_range);
				if (range) {
					if (range.endLine === -1) {
						return md(localize('toolInvoke.viewFileFromLine', "Read {0}, line {1} to the end", link, range.startLine));
					}
					if (range.endLine !== range.startLine) {
						return md(localize('toolInvoke.viewFileRange', "Read {0}, lines {1} to {2}", link, range.startLine, range.endLine));
					}
					return md(localize('toolInvoke.viewFileLine', "Read {0}, line {1}", link, range.startLine));
				}
				return md(localize('toolInvoke.viewFile', "Read {0}", link));
			}
			return localize('toolInvoke.view', "Read file");
		}
		case CopilotToolName.Edit:
		case CopilotToolName.StrReplace: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (typeof args?.path === 'string' && args.path) {
				return md(localize('toolInvoke.editFile', "Edit {0}", formatPathAsMarkdownLink(resolvePath(args.path))));
			}
			return localize('toolInvoke.edit', "Edit file");
		}
		case CopilotToolName.Insert: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (typeof args?.path === 'string' && args.path) {
				return md(localize('toolInvoke.insertFile', "Insert text in {0}", formatPathAsMarkdownLink(resolvePath(args.path))));
			}
			return localize('toolInvoke.insert', "Insert text");
		}
		case CopilotToolName.Create: {
			const args = parameters as ICopilotFileToolArgs | undefined;
			if (typeof args?.path === 'string' && args.path) {
				return md(localize('toolInvoke.createFile', "Create {0}", formatPathAsMarkdownLink(resolvePath(args.path))));
			}
			return localize('toolInvoke.create', "Create file");
		}
		case CopilotToolName.StrReplaceEditor: {
			const command = (parameters as ICopilotStrReplaceEditorToolArgs | undefined)?.command;
			switch (command) {
				case 'view':
					return getInvocationMessage(CopilotToolName.View, displayName, parameters, resolvePath);
				case 'create':
					return getInvocationMessage(CopilotToolName.Create, displayName, parameters, resolvePath);
				case 'insert':
					return getInvocationMessage(CopilotToolName.Insert, displayName, parameters, resolvePath);
				case 'edit':
				case 'str_replace':
				default:
					return getInvocationMessage(CopilotToolName.Edit, displayName, parameters, resolvePath);
			}
		}
		case CopilotToolName.Grep: {
			const args = parameters as ICopilotGrepToolArgs | undefined;
			if (args?.pattern) {
				return md(localize('toolInvoke.grepPattern', "Search for {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
			}
			return localize('toolInvoke.grep', "Search files");
		}
		case CopilotToolName.Rg: {
			const args = parameters as ICopilotRgToolArgs | undefined;
			if (args?.pattern) {
				return md(localize('toolInvoke.grepPattern', "Search for {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
			}
			return localize('toolInvoke.grep', "Search files");
		}
		case CopilotToolName.Glob: {
			const args = parameters as ICopilotGlobToolArgs | undefined;
			if (args?.pattern) {
				return md(localize('toolInvoke.globPattern', "Find files matching {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
			}
			return localize('toolInvoke.glob', "Find files");
		}
		case CopilotToolName.ApplyPatch:
		case CopilotToolName.GitApplyPatch: {
			const files = getEditFilePaths(parameters).map(resolvePath);
			if (files.length === 1) {
				return md(localize('toolInvoke.patchFile', "Edit {0}", formatPathAsMarkdownLink(files[0])));
			}
			if (files.length > 1) {
				return md(localize('toolInvoke.patchFiles', "Edit {0}", files.map(formatPathAsMarkdownLink).join(', ')));
			}
			return localize('toolInvoke.patch', "Edit files");
		}
		case CopilotToolName.Sql: {
			const args = parameters as ICopilotSqlToolArgs | undefined;
			return args?.description || localize('toolInvoke.sql', "Execute SQL query");
		}
		case CopilotToolName.WebFetch: {
			const args = parameters as ICopilotWebFetchToolArgs | undefined;
			if (args?.url) {
				return md(localize('toolInvoke.webFetch', "Fetching {0}", formatUrlAsMarkdownLink(args.url)));
			}
			return localize('toolInvoke.webFetchGeneric', "Fetching URL");
		}
		case CopilotToolName.WebSearch: {
			const args = parameters as ICopilotLongRunningSearchToolArgs | undefined;
			if (args?.query) {
				return md(localize('toolInvoke.webSearchQuery', "Searching the web for {0}", appendEscapedMarkdownInlineCode(truncate(args.query, 80))));
			}
			return localize('toolInvoke.webSearch', "Searching the web");
		}
		case CopilotToolName.SearchCodeSubagent: {
			const args = parameters as ICopilotLongRunningSearchToolArgs | undefined;
			if (args?.query) {
				return md(localize('toolInvoke.searchCodeQuery', "Search code for {0}", appendEscapedMarkdownInlineCode(truncate(args.query, 80))));
			}
			return localize('toolInvoke.searchCode', "Search code");
		}
		case CopilotToolName.ExitPlanMode:
			return localize('toolInvoke.exitPlanMode', "Present plan");
		case CopilotToolName.Task:
			return localize('toolInvoke.task', "Delegating task");
		case CopilotToolName.ListAgents:
			return localize('toolInvoke.listAgents', "List agents");
		case CopilotToolName.ReadAgent: {
			const agentId = getAgentId(parameters);
			if (agentId) {
				return md(localize('toolInvoke.readAgent', "Read agent {0}", appendEscapedMarkdownInlineCode(agentId)));
			}
			return localize('toolInvoke.readAgentGeneric', "Read agent");
		}
		case CopilotToolName.WriteAgent: {
			const agentId = getAgentId(parameters);
			if (agentId) {
				return md(localize('toolInvoke.writeAgent', "Write to agent {0}", appendEscapedMarkdownInlineCode(agentId)));
			}
			return localize('toolInvoke.writeAgentGeneric', "Write to agent");
		}
		default:
			return displayName;
	}
}

/**
 * Returns the progressively refined message shown while Copilot generates tool input.
 */
export function getStreamingInvocationMessage(toolName: string, displayName: string, parameters: unknown, resolvePath: ToolPathResolver = identityPathResolver): StringOrMarkdown {
	const objectParameters = parameters !== null && typeof parameters === 'object' && !Array.isArray(parameters)
		? parameters as Record<string, unknown>
		: undefined;
	switch (toolName) {
		case CopilotToolName.Edit:
		case CopilotToolName.StrReplace: {
			const args = objectParameters as ICopilotEditToolArgs | undefined;
			return getStreamingReplaceMessage(args?.path, streamingToolTextLineCount(args?.old_str), streamingToolTextLineCount(args?.new_str), resolvePath);
		}
		case CopilotToolName.Create: {
			const args = objectParameters as ICopilotCreateToolArgs | undefined;
			return getStreamingCreateMessage(args?.path, streamingToolTextLineCount(args?.file_text), resolvePath);
		}
		case CopilotToolName.Insert: {
			const args = objectParameters as ICopilotInsertToolArgs | undefined;
			return getStreamingInsertMessage(args?.path, streamingToolTextLineCount(args?.new_str), resolvePath);
		}
		case CopilotToolName.StrReplaceEditor: {
			const args = objectParameters as ICopilotStrReplaceEditorToolArgs | undefined;
			const command = args?.command;
			switch (command) {
				case 'view':
					return getInvocationMessage(CopilotToolName.View, displayName, objectParameters, resolvePath);
				case 'create':
					return getStreamingCreateMessage(args?.path, streamingToolTextLineCount(args?.file_text), resolvePath);
				case 'insert':
					return getStreamingInsertMessage(args?.path, streamingToolTextLineCount(args?.new_str), resolvePath);
				case 'edit':
				case 'str_replace':
				default:
					return getStreamingReplaceMessage(args?.path, streamingToolTextLineCount(args?.old_str), streamingToolTextLineCount(args?.new_str), resolvePath);
			}
		}
		case CopilotToolName.ApplyPatch:
		case CopilotToolName.GitApplyPatch: {
			const args = objectParameters as ICopilotApplyPatchToolArgs | undefined;
			const patch = typeof parameters === 'string' ? parameters : args?.input ?? args?.patch;
			return getStreamingPatchMessage(getEditFilePaths(parameters), streamingToolTextLineCount(patch), resolvePath);
		}
		default:
			return getInvocationMessage(toolName, displayName, objectParameters, resolvePath);
	}
}

export function getPastTenseMessage(toolName: string, displayName: string, parameters: Record<string, unknown> | undefined, success: boolean, resultText?: string, resolvePath: ToolPathResolver = identityPathResolver): StringOrMarkdown {
	if (!success) {
		return localize('toolComplete.failed', "\"{0}\" failed", displayName);
	}

	const serverDisplay = getServerToolDisplay(toolName, parameters, { text: resultText, success })?.pastTenseMessage;
	if (serverDisplay !== undefined) {
		return serverDisplay;
	}

	if (SHELL_TOOL_NAMES.has(toolName)) {
		const args = parameters as ICopilotShellToolArgs | undefined;
		if (args?.command) {
			const firstLine = args.command.split('\n')[0];
			return md(localize('toolComplete.shellCmd', "Ran {0}", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
		}
		return localize('toolComplete.shell', "Ran {0} command", displayName);
	}

	if (READ_SHELL_TOOL_NAMES.has(toolName)) {
		return localize('toolComplete.readTerminal', "Read Terminal");
	}

	switch (toolName) {
		case CopilotToolName.WebFetch: {
			const args = parameters as ICopilotWebFetchToolArgs | undefined;
			if (args?.url) {
				return md(localize('toolComplete.webFetch', "Fetched {0}", formatUrlAsMarkdownLink(args.url)));
			}
			return localize('toolComplete.webFetchGeneric', "Fetched URL");
		}
		case CopilotToolName.WebSearch: {
			const args = parameters as ICopilotLongRunningSearchToolArgs | undefined;
			if (args?.query) {
				return md(localize('toolComplete.webSearchQuery', "Searched the web for {0}", appendEscapedMarkdownInlineCode(truncate(args.query, 80))));
			}
			return localize('toolComplete.webSearch', "Searched the web");
		}
		case CopilotToolName.Task:
			return localize('toolComplete.task', "Delegated task");
		default:
			return getInvocationMessage(toolName, displayName, parameters, resolvePath);
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

/**
 * Builds a stable synthetic tool call id for a `skill.invoked` event so
 * reconnect/replay produces the same id as the original live emit. The id
 * is used unencoded as a path segment (e.g. by `ChatResponseResource.createUri`),
 * so it must not contain characters like `/` -- we hash any fallback values
 * that could carry filesystem paths or arbitrary text.
 */
export function getSkillSyntheticToolCallId(eventId: string | undefined, data: SkillInvokedData): string {
	if (eventId) {
		return `synth-skill-${eventId}`;
	}
	return `synth-skill-${hash(data.path).toString(16)}`;
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
	data: SkillInvokedData,
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
	const skillLink = `[${escapedName}](${URI.file(data.path)})`;
	const invocationMessage = md(localize('toolInvoke.skill', "Read skill {0}", skillLink));
	return {
		toolCallId,
		toolName: CopilotToolName.Skill,
		displayName,
		invocationMessage,
		pastTenseMessage: invocationMessage,
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
		case CopilotToolName.Rg: {
			const args = parameters as ICopilotRgToolArgs | undefined;
			return args?.pattern ?? rawArguments;
		}
		case CopilotToolName.WebFetch: {
			const args = parameters as ICopilotWebFetchToolArgs | undefined;
			return args?.url ?? rawArguments;
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
 * Returns a rendering hint for the given tool.
 */
export function getToolKind(toolName: string, parameters?: Record<string, unknown>): ToolKind | undefined {
	if (SHELL_TOOL_NAMES.has(toolName)) {
		return 'terminal';
	}
	if (SUBAGENT_TOOL_NAMES.has(toolName)) {
		return 'subagent';
	}
	if (SEARCH_TOOL_NAMES.has(toolName)) {
		return 'search';
	}
	if (toolName === CopilotToolName.View
		|| (toolName === CopilotToolName.StrReplaceEditor && parameters?.['command'] === 'view')) {
		return 'read';
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

/** Safely extract a string value from an SDK field that may be `unknown` at runtime. */
function str(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/**
 * True when a request came from the runtime's unauthorized-path gate.
 *
 * That gate runs ahead of the per-kind gates and fires only for paths outside
 * the allowed directories, so it *is* the out-of-workspace case by
 * construction. It is not a distinct request kind: it reuses the access kind
 * (`read`/`write`/`shell`) and carries `paths` instead of the per-kind `path`,
 * which the SDK's `PermissionRequestRead` type does not model — hence the
 * structural check.
 */
function isUnauthorizedPathGateRequest(request: PermissionRequest): boolean {
	return isObject(request) && Array.isArray((request as { paths?: unknown }).paths);
}

/**
 * Chooses the confirmation title for a read request based on why approval is
 * actually needed.
 *
 * A read is gated for several reasons — the path lies outside the allowed
 * directories, a managed or scoped rule matched it, or the model asked to
 * escape the sandbox. Only the first is about location, so the title claims it
 * either when the unauthorized-path gate raised the request or when the path is
 * absolute and contained by none of the session's workspace roots. A relative
 * path, an unknown path, or an unknown workspace falls back to the neutral
 * title rather than asserting a location the request does not establish.
 */
function readConfirmationTitle(request: PermissionRequest, path: string | undefined, workspaceRoots: readonly URI[], requestSandboxBypass: boolean | undefined): string {
	if (requestSandboxBypass) {
		return localize('copilot.permission.read.bypass.title', "Read file outside the sandbox?");
	}
	const outsideWorkspace = isUnauthorizedPathGateRequest(request)
		|| (path !== undefined
			&& isAbsolute(path)
			&& workspaceRoots.length > 0
			&& !workspaceRoots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(URI.file(path), root)));
	return outsideWorkspace
		? localize('copilot.permission.read.title', "Allow reading file outside of workspace?")
		: localize('copilot.permission.read.generic.title', "Allow reading file?");
}

/**
 * Derives display fields from a permission request for the tool confirmation UI.
 *
 * `additionalDirectories` carries the peer roots of a multi-root session, so a
 * read under any root is recognized as inside the workspace.
 */
export function getPermissionDisplay(request: PermissionRequest, workingDirectory?: URI, isNewFile?: boolean, additionalDirectories?: readonly URI[]): {
	confirmationTitle: string;
	invocationMessage: StringOrMarkdown;
	toolInput?: string;
	/** Normalized permission kind for auto-approval routing. */
	permissionKind: IAgentToolPendingConfirmationSignal['permissionKind'];
	/** File path extracted from the request. */
	permissionPath?: string;
} {
	const path = request.kind === 'read' ? str(request.path) : request.kind === 'write' ? str(request.fileName) : undefined;
	const fullCommandText = request.kind === 'shell' ? str(request.fullCommandText) : undefined;
	const intention = request.kind === 'shell' || request.kind === 'write' || request.kind === 'read' || request.kind === 'url'
		? str(request.intention)
		: undefined;
	const serverName = request.kind === 'mcp' ? str(request.serverName) : undefined;
	const toolName = request.kind === 'mcp' || request.kind === 'custom-tool' || request.kind === 'hook'
		? str(request.toolName)
		: undefined;
	const requestSandboxBypass = request.kind === 'shell' || request.kind === 'write' || request.kind === 'read' || request.kind === 'url'
		? request.requestSandboxBypass
		: undefined;

	const shellConfirmationTitle = requestSandboxBypass
		? localize('copilot.permission.shell.bypass.title', "Run in terminal outside the sandbox?")
		: localize('copilot.permission.shell.title', "Run in terminal?");

	switch (request.kind) {
		case 'shell': {
			// Strip a redundant `cd <workingDirectory> && …` prefix so the
			// confirmation dialog shows the simplified command.
			const shellParams: Record<string, unknown> | undefined = fullCommandText ? { command: fullCommandText } : undefined;
			stripRedundantCdPrefix(CopilotToolName.Bash, shellParams, workingDirectory);
			const cleanedCommand = typeof shellParams?.command === 'string' ? shellParams.command : fullCommandText;
			return {
				confirmationTitle: shellConfirmationTitle,
				invocationMessage: intention ?? getInvocationMessage(CopilotToolName.Bash, getToolDisplayName(CopilotToolName.Bash), cleanedCommand ? { command: cleanedCommand } : undefined),
				toolInput: cleanedCommand,
				permissionKind: 'shell',
				permissionPath: path,
			};
		}
		case 'custom-tool': {
			// Custom tool overrides (e.g. our shell tool). Extract the actual
			// tool args from the SDK's wrapper envelope.
			const args = isObject(request.args) ? request.args as Record<string, unknown> : undefined;
			const sdkToolName = str(request.toolName);
			if (args && sdkToolName && isShellTool(sdkToolName) && typeof args.command === 'string') {
				stripRedundantCdPrefix(sdkToolName, args, workingDirectory);
				const command = args.command as string;
				return {
					confirmationTitle: shellConfirmationTitle,
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
		case 'write': {
			const toolName = isNewFile ? CopilotToolName.Create : CopilotToolName.Edit;
			return {
				confirmationTitle: isNewFile
					? localize('copilot.permission.create.title', "Create file?")
					: localize('copilot.permission.write.title', "Write file?"),
				invocationMessage: getInvocationMessage(toolName, getToolDisplayName(toolName), path ? { path } : undefined),
				toolInput: tryStringify(path ? { path } : request) ?? undefined,
				permissionKind: 'write',
				permissionPath: path,
			};
		}
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
				confirmationTitle: readConfirmationTitle(request, path, workingDirectory ? [workingDirectory, ...(additionalDirectories ?? [])] : [], requestSandboxBypass),
				invocationMessage: getInvocationMessage(CopilotToolName.View, getToolDisplayName(CopilotToolName.View), path ? { path } : undefined),
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
