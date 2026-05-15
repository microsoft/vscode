/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

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
}

const TOOL_ROWS: { readonly [toolName: string]: ClaudeToolRow } = {
	// shell tools
	Bash: { permissionKind: 'shell' },
	BashOutput: { permissionKind: 'shell' },
	KillBash: { permissionKind: 'shell' },

	// read tools
	Read: { permissionKind: 'read', pathField: 'file_path' },
	Glob: { permissionKind: 'read', pathField: 'path' },
	Grep: { permissionKind: 'read', pathField: 'path' },
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
	Task: { permissionKind: 'custom-tool' },
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
		case 'Task': return localize('claude.tool.task', "Run subagent task");
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
