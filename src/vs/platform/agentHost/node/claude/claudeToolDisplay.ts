/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { appendEscapedMarkdownInlineCode, escapeMarkdownLinkLabel } from '../../../../base/common/htmlContent.js';
import { basename } from '../../../../base/common/resources.js';
import { truncate } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import type { StringOrMarkdown } from '../../common/state/protocol/state.js';

/**
 * Phase 7 S4 — pure tool-name → display/permission helpers for Claude.
 *
 * Mirrors the shape of [copilotToolDisplay.ts](../copilot/copilotToolDisplay.ts)
 * but is keyed off the SDK's built-in tool list. The mapping table lives
 * here (and is snapshot-tested in
 * [claudeToolDisplay.test.ts](../../test/node/claudeToolDisplay.test.ts))
 * so renames of either the SDK tool names or the host's `permissionKind`
 * union flow through compile-checks and the snapshot diff.
 *
 * No I/O, no DI; safe to import from any layer of `agentHost`.
 */

/**
 * Auto-approval kind reported alongside `pending_confirmation` signals
 * (see `IAgentToolPendingConfirmationSignal.permissionKind` in
 * [agentService.ts:317](../../common/agentService.ts#L317)).
 *
 * Phase 7 only emits the subset relevant to Claude's built-in tools —
 * `hook` and `memory` are reserved for later phases.
 */
export type ClaudePermissionKind =
	| 'shell'
	| 'write'
	| 'mcp'
	| 'read'
	| 'url'
	| 'custom-tool';

/**
 * Phase 8.5 — rendering hint for the workbench. Drives terminal /
 * search / subagent renderers (the workbench picks a renderer off
 * `_meta.toolKind`; unknown values fall through to the generic tool
 * renderer). Mirror of
 * [`copilotToolDisplay.getToolKind`](../copilot/copilotToolDisplay.ts).
 */
export type ClaudeToolKind = 'terminal' | 'subagent' | 'search';

/**
 * Which field on the SDK's `tool_input` carries the path/url surfaced
 * to the user (and tracked by Phase 8 for file-edit tools). One field
 * per tool — tools without a path-bearing field omit this.
 */
type ClaudeToolPathField = 'file_path' | 'notebook_path' | 'path' | 'url';

/**
 * Single source-of-truth row for one of Claude's built-in tools. Every
 * structural fact the host needs about the tool sits in this row; the
 * exported helpers below are one-liners over the table. Adding a new
 * SDK tool means adding one row and one `displayName` arm. The
 * snapshot test in [claudeToolDisplay.test.ts](../../test/node/claudeToolDisplay.test.ts)
 * fails until both this map and the snapshot are updated together.
 *
 * `displayName` is intentionally NOT on the row — it is user-facing
 * and must be `localize()`-d, which we cannot do at module-init time
 * without freezing the bundle's locale. Lookup lives in
 * {@link getClaudeToolDisplayName}.
 */
interface ClaudeToolRow {
	readonly permissionKind: ClaudePermissionKind;
	/** Field on `tool_input` carrying the path/url for this tool, if any. */
	readonly pathField?: ClaudeToolPathField;
	/** True for tools whose execution writes to disk and is tracked by `FileEditTracker` (Phase 8). */
	readonly isFileEdit?: true;
	/**
	 * True for tools the SDK never auto-approves under any
	 * `permissionMode` (so they always reach `canUseTool`). Drives
	 * {@link INTERACTIVE_CLAUDE_TOOLS}.
	 */
	readonly interactive?: true;
	/**
	 * Phase 8.5 — rendering hint for the workbench (drives the
	 * terminal / search / subagent renderers). Omit for tools that
	 * render in the generic tool renderer (read, write, MCP, …).
	 */
	readonly toolKind?: ClaudeToolKind;
}

const TOOL_ROWS: { readonly [toolName: string]: ClaudeToolRow } = {
	// shell tools — no `language` is carried: the workbench picks
	// `'shellscript'` from the tool name (it only special-cases
	// `'powershell'`), and the SDK's `Bash` tool is the generic shell
	// entry point (bash on POSIX, Git Bash on Windows), so claiming a
	// specific dialect here would be misleading and unused.
	Bash: { permissionKind: 'shell', toolKind: 'terminal' },
	BashOutput: { permissionKind: 'shell', toolKind: 'terminal' },
	KillBash: { permissionKind: 'shell', toolKind: 'terminal' },

	// read tools
	Read: { permissionKind: 'read', pathField: 'file_path' },
	Glob: { permissionKind: 'read', pathField: 'path', toolKind: 'search' },
	Grep: { permissionKind: 'read', pathField: 'path', toolKind: 'search' },
	LS: { permissionKind: 'read', pathField: 'path' },
	NotebookRead: { permissionKind: 'read', pathField: 'notebook_path' },

	// write tools
	Write: { permissionKind: 'write', pathField: 'file_path', isFileEdit: true },
	Edit: { permissionKind: 'write', pathField: 'file_path', isFileEdit: true },
	MultiEdit: { permissionKind: 'write', pathField: 'file_path', isFileEdit: true },
	NotebookEdit: { permissionKind: 'write', pathField: 'notebook_path', isFileEdit: true },
	TodoWrite: { permissionKind: 'write' },

	// network tools
	WebFetch: { permissionKind: 'url', pathField: 'url' },

	// host-routed / custom
	Task: { permissionKind: 'custom-tool', toolKind: 'subagent' },
	Agent: { permissionKind: 'custom-tool', toolKind: 'subagent' },
	ExitPlanMode: { permissionKind: 'custom-tool', interactive: true },
	AskUserQuestion: { permissionKind: 'custom-tool', interactive: true },
};

const MCP_TOOL_PREFIX = 'mcp__';

/**
 * S4 row lookup. Falls back to `'custom-tool'` for unknown tools so
 * Claude's growing built-in list never breaks the host.
 */
export function getClaudePermissionKind(toolName: string): ClaudePermissionKind {
	const row = TOOL_ROWS[toolName];
	if (row) {
		return row.permissionKind;
	}
	if (toolName.startsWith(MCP_TOOL_PREFIX)) {
		return 'mcp';
	}
	return 'custom-tool';
}

/**
 * Localized display name for the SDK's built-in tools (S4). Falls back
 * to the raw tool name so unknown tools still render something
 * sensible. For `mcp__server__tool` the prefix is stripped to surface
 * the server/tool pair.
 */
export function getClaudeToolDisplayName(toolName: string): string {
	switch (toolName) {
		case 'Bash': return localize('claude.tool.bash', "Run shell command");
		case 'BashOutput': return localize('claude.tool.bashOutput', "Read shell output");
		case 'KillBash': return localize('claude.tool.killBash', "Kill shell command");
		case 'Read': return localize('claude.tool.read', "Read file");
		case 'Glob': return localize('claude.tool.glob', "Find files");
		case 'Grep': return localize('claude.tool.grep', "Search files");
		case 'LS': return localize('claude.tool.ls', "List directory");
		case 'NotebookRead': return localize('claude.tool.notebookRead', "Read notebook");
		case 'Write': return localize('claude.tool.write', "Write file");
		case 'Edit': return localize('claude.tool.edit', "Edit file");
		case 'MultiEdit': return localize('claude.tool.multiEdit', "Edit file");
		case 'NotebookEdit': return localize('claude.tool.notebookEdit', "Edit notebook");
		case 'TodoWrite': return localize('claude.tool.todoWrite', "Update todo list");
		case 'WebFetch': return localize('claude.tool.webFetch', "Fetch URL");
		case 'Task':
		case 'Agent': return localize('claude.tool.task', "Run subagent task");
		case 'ExitPlanMode': return localize('claude.tool.exitPlanMode', "Ready to code?");
		case 'AskUserQuestion': return localize('claude.tool.askUserQuestion', "Ask user a question");
	}
	if (toolName.startsWith(MCP_TOOL_PREFIX)) {
		return localize('claude.tool.mcp', "Run MCP tool {0}", toolName.slice(MCP_TOOL_PREFIX.length));
	}
	return toolName;
}

/**
 * Read the `pathField` named on the tool's row from `input`. Returns
 * `undefined` for tools without a path field, for missing fields, or
 * for wrong-typed fields (defensive against malformed SDK input).
 *
 * Used both for `pending_confirmation.permissionPath` (S4) and Phase 8
 * file-edit tracking — callers that only care about edits gate with
 * {@link isClaudeFileEditTool} first.
 */
export function getClaudeToolPath(toolName: string, input: unknown): string | undefined {
	const row = TOOL_ROWS[toolName];
	if (!row?.pathField || typeof input !== 'object' || input === null) {
		return undefined;
	}
	const value = (input as Record<string, unknown>)[row.pathField];
	return typeof value === 'string' ? value : undefined;
}

/**
 * Phase 8 — true for tools that produce on-disk file edits tracked by
 * `FileEditTracker`. Excludes `TodoWrite` (in-memory) and `Bash` (edits
 * not surfaced as canonical SDK `tool_use` blocks the host can pair
 * with `tool_result`).
 */
export function isClaudeFileEditTool(toolName: string): boolean {
	return TOOL_ROWS[toolName]?.isFileEdit === true;
}

/**
 * Phase 7 S3.5. Tools whose `canUseTool` invocation is satisfied by a
 * host-driven round-trip rather than the SDK's auto-approval:
 * - `AskUserQuestion` — carousel (S3.5a).
 * - `ExitPlanMode` — `pending_confirmation` with custom Approve/Deny
 *   labels and the plan body as `invocationMessage` (S3.5b).
 *
 * Membership only signals that the SDK does not auto-approve under any
 * `permissionMode`, ensuring the call always reaches the host.
 * `_handleCanUseTool` dispatches via `INTERACTIVE_CLAUDE_TOOLS.has(toolName)`.
 *
 * Derived from the `interactive: true` rows above so the table stays
 * the single source of truth.
 */
export const INTERACTIVE_CLAUDE_TOOLS: ReadonlySet<string> = new Set(
	Object.entries(TOOL_ROWS)
		.filter(([, row]) => row.interactive)
		.map(([name]) => name),
);

/**
 * Confirmation-card title shown when a tool needs explicit user
 * approval (S3.4 `pending_confirmation` flow). Mirrors the per-kind
 * titles in {@link getPermissionDisplay} for CopilotAgent so both
 * agents render identical wording. The workbench keys off
 * `confirmationTitle` to render the Approve/Deny buttons — when it
 * is absent, the tool card silently flips to "auto-approved" state
 * even though the agent is parked. See `sessionPermissions.ts`'s
 * `createToolReadyAction`.
 */
export function getClaudeConfirmationTitle(toolName: string): string {
	switch (getClaudePermissionKind(toolName)) {
		case 'shell':
			return localize('claude.permission.shell.title', "Run in terminal?");
		case 'write':
			return localize('claude.permission.write.title', "Edit file?");
		case 'read':
			return localize('claude.permission.read.title', "Read file?");
		case 'url':
			return localize('claude.permission.url.title', "Fetch URL?");
		case 'mcp': {
			const serverName = toolName.startsWith(MCP_TOOL_PREFIX)
				? toolName.slice(MCP_TOOL_PREFIX.length).split('__')[0]
				: undefined;
			return serverName
				? localize('claude.permission.mcp.title', "Allow tool from {0}?", serverName)
				: localize('claude.permission.default.title', "Allow tool call?");
		}
		case 'custom-tool':
		default:
			return localize('claude.permission.default.title', "Allow tool call?");
	}
}

// #region Phase 8.5 — rich tool-call rendering helpers

/**
 * Phase 8.5 — workbench rendering hint. One-liner over `TOOL_ROWS`.
 * Returns `'terminal'` for shell tools (drives the terminal renderer),
 * `'search'` for `Grep` / `Glob` (drives the search renderer),
 * `'subagent'` for `Task` / `Agent` (drives the subagent renderer),
 * `undefined` for everything else (generic tool renderer).
 */
export function getClaudeToolKind(toolName: string): ClaudeToolKind | undefined {
	return TOOL_ROWS[toolName]?.toolKind;
}

/**
 * Phase 8.5 — build the `_meta` bag stamped at the tool-open seam.
 * Returns `undefined` for tools that have no `toolKind` hint so the
 * resulting envelope stays minimal (a `Read` row gets no `_meta` at
 * all). Mirrors Copilot's
 * [`mapSessionEvents.ts:197`](../copilot/mapSessionEvents.ts#L197)
 * single-write pattern.
 */
export function buildClaudeToolMeta(toolName: string): Record<string, unknown> | undefined {
	const row = TOOL_ROWS[toolName];
	if (!row?.toolKind) {
		return undefined;
	}
	return { toolKind: row.toolKind };
}

function md(value: string): StringOrMarkdown {
	return { markdown: value };
}

function formatPathAsMarkdownLink(path: string): string {
	const uri = URI.file(path);
	return `[${escapeMarkdownLinkLabel(basename(uri))}](${uri})`;
}

/**
 * Defensive string-field access. Returns the field value when it is
 * a non-empty string, otherwise `undefined`.
 */
function readStringField(input: unknown, field: string): string | undefined {
	if (input === null || typeof input !== 'object') {
		return undefined;
	}
	const value = (input as Record<string, unknown>)[field];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Phase 8.5 — first-line command extractor for shell tools. Mirrors
 * Copilot's `command.split('\n')[0]` pattern.
 */
function firstShellLine(input: unknown): string | undefined {
	const command = readStringField(input, 'command');
	return command ? command.split('\n')[0] : undefined;
}

/**
 * Phase 8.5 — rich invocation message for a `pending_confirmation`
 * card or a streaming `SessionToolCallStart` action. Reads the
 * SDK's `tool_use.input` defensively and falls back to the static
 * `displayName` on any shape mismatch. Mirror of
 * [`copilotToolDisplay.getInvocationMessage`](../copilot/copilotToolDisplay.ts#L473).
 */
export function getClaudeInvocationMessage(
	toolName: string,
	displayName: string,
	input: unknown,
): StringOrMarkdown {
	switch (toolName) {
		case 'Bash': {
			const firstLine = firstShellLine(input);
			if (firstLine) {
				return md(localize('claude.toolInvoke.bashCmd', "Running {0}", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
			}
			return localize('claude.toolInvoke.bash', "Running shell command");
		}
		case 'BashOutput':
			return localize('claude.toolInvoke.bashOutput', "Reading shell output");
		case 'KillBash':
			return localize('claude.toolInvoke.killBash', "Killing shell command");
		case 'Read':
		case 'NotebookRead': {
			const path = getClaudeToolPath(toolName, input);
			if (path) {
				return md(localize('claude.toolInvoke.readFile', "Reading {0}", formatPathAsMarkdownLink(path)));
			}
			return localize('claude.toolInvoke.read', "Reading file");
		}
		case 'LS': {
			const path = getClaudeToolPath(toolName, input);
			if (path) {
				return md(localize('claude.toolInvoke.lsPath', "Listing {0}", formatPathAsMarkdownLink(path)));
			}
			return localize('claude.toolInvoke.ls', "Listing directory");
		}
		case 'Write':
		case 'Edit':
		case 'MultiEdit':
		case 'NotebookEdit': {
			const path = getClaudeToolPath(toolName, input);
			if (path) {
				return md(localize('claude.toolInvoke.editFile', "Editing {0}", formatPathAsMarkdownLink(path)));
			}
			return localize('claude.toolInvoke.edit', "Editing file");
		}
		case 'TodoWrite':
			return localize('claude.toolInvoke.todoWrite', "Updating todo list");
		case 'Grep': {
			const pattern = readStringField(input, 'pattern');
			if (pattern) {
				return md(localize('claude.toolInvoke.grepPattern', "Searching for {0}", appendEscapedMarkdownInlineCode(truncate(pattern, 80))));
			}
			return localize('claude.toolInvoke.grep', "Searching files");
		}
		case 'Glob': {
			const pattern = readStringField(input, 'pattern');
			if (pattern) {
				return md(localize('claude.toolInvoke.globPattern', "Finding files matching {0}", appendEscapedMarkdownInlineCode(truncate(pattern, 80))));
			}
			return localize('claude.toolInvoke.glob', "Finding files");
		}
		case 'WebFetch': {
			const url = readStringField(input, 'url');
			if (url) {
				return md(localize('claude.toolInvoke.webFetch', "Fetching {0}", `[${escapeMarkdownLinkLabel(truncate(url, 80))}](${url})`));
			}
			return localize('claude.toolInvoke.webFetchGeneric', "Fetching URL");
		}
		case 'Task':
		case 'Agent': {
			const description = readStringField(input, 'description');
			if (description) {
				return description;
			}
			return displayName;
		}
		default:
			return displayName;
	}
}

/**
 * Phase 8.5 — success-aware rich past-tense message. Mirror of
 * [`copilotToolDisplay.getPastTenseMessage`](../copilot/copilotToolDisplay.ts#L572).
 * Failure path returns a generic "failed" message; success path
 * mirrors the {@link getClaudeInvocationMessage} structure with
 * past-tense verbs.
 */
export function getClaudePastTenseMessage(
	toolName: string,
	displayName: string,
	input: unknown,
	success: boolean,
): StringOrMarkdown {
	if (!success) {
		return localize('claude.toolComplete.failed', "\"{0}\" failed", displayName);
	}
	switch (toolName) {
		case 'Bash': {
			const firstLine = firstShellLine(input);
			if (firstLine) {
				return md(localize('claude.toolComplete.bashCmd', "Ran {0}", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
			}
			return localize('claude.toolComplete.bash', "Ran shell command");
		}
		case 'BashOutput':
			return localize('claude.toolComplete.bashOutput', "Read shell output");
		case 'KillBash':
			return localize('claude.toolComplete.killBash', "Killed shell command");
		case 'Read':
		case 'NotebookRead': {
			const path = getClaudeToolPath(toolName, input);
			if (path) {
				return md(localize('claude.toolComplete.readFile', "Read {0}", formatPathAsMarkdownLink(path)));
			}
			return localize('claude.toolComplete.read', "Read file");
		}
		case 'LS': {
			const path = getClaudeToolPath(toolName, input);
			if (path) {
				return md(localize('claude.toolComplete.lsPath', "Listed {0}", formatPathAsMarkdownLink(path)));
			}
			return localize('claude.toolComplete.ls', "Listed directory");
		}
		case 'Write':
		case 'Edit':
		case 'MultiEdit':
		case 'NotebookEdit': {
			const path = getClaudeToolPath(toolName, input);
			if (path) {
				return md(localize('claude.toolComplete.editFile', "Edited {0}", formatPathAsMarkdownLink(path)));
			}
			return localize('claude.toolComplete.edit', "Edited file");
		}
		case 'TodoWrite':
			return localize('claude.toolComplete.todoWrite', "Updated todo list");
		case 'Grep': {
			const pattern = readStringField(input, 'pattern');
			if (pattern) {
				return md(localize('claude.toolComplete.grepPattern', "Searched for {0}", appendEscapedMarkdownInlineCode(truncate(pattern, 80))));
			}
			return localize('claude.toolComplete.grep', "Searched files");
		}
		case 'Glob': {
			const pattern = readStringField(input, 'pattern');
			if (pattern) {
				return md(localize('claude.toolComplete.globPattern', "Found files matching {0}", appendEscapedMarkdownInlineCode(truncate(pattern, 80))));
			}
			return localize('claude.toolComplete.glob', "Found files");
		}
		case 'WebFetch': {
			const url = readStringField(input, 'url');
			if (url) {
				return md(localize('claude.toolComplete.webFetch', "Fetched {0}", `[${escapeMarkdownLinkLabel(truncate(url, 80))}](${url})`));
			}
			return localize('claude.toolComplete.webFetchGeneric', "Fetched URL");
		}
		case 'Task':
		case 'Agent':
			return localize('claude.toolComplete.task', "Ran subagent");
		default:
			return localize('claude.toolComplete.generic', "Used \"{0}\"", displayName);
	}
}

/**
 * Phase 8.5 — canonical "input as code" string rendered under the
 * tool-call row. Shell tools surface the raw `command`; search tools
 * surface the `pattern`; everything else falls back to pretty-printed
 * JSON. Returns `undefined` only when the input is itself absent.
 */
export function getClaudeToolInputString(toolName: string, input: unknown): string | undefined {
	if (input === undefined) {
		return undefined;
	}
	if (toolName === 'Bash' || toolName === 'BashOutput' || toolName === 'KillBash') {
		const command = readStringField(input, 'command');
		if (command) {
			return command;
		}
	}
	if (toolName === 'Grep' || toolName === 'Glob') {
		const pattern = readStringField(input, 'pattern');
		if (pattern) {
			return pattern;
		}
	}
	try {
		return JSON.stringify(input, null, 2);
	} catch {
		return undefined;
	}
}

// #endregion
