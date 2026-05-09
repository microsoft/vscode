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

interface ClaudeToolDisplayEntry {
	readonly permissionKind: ClaudePermissionKind;
}

/**
 * Source-of-truth mapping for Phase 7 S4. Add a row here when the SDK
 * adds a new built-in; the snapshot test will fail until both this map
 * and the snapshot are updated together.
 *
 * `displayName` is intentionally NOT stored here — it is user-facing
 * and must be `localize()`-d, which we cannot do at module-init time
 * without freezing the bundle's locale. Lookup lives in
 * {@link getClaudeToolDisplayName}.
 */
const TOOL_DISPLAY: { readonly [toolName: string]: ClaudeToolDisplayEntry } = {
	// shell tools
	Bash: { permissionKind: 'shell' },
	BashOutput: { permissionKind: 'shell' },
	KillBash: { permissionKind: 'shell' },

	// read tools
	Read: { permissionKind: 'read' },
	Glob: { permissionKind: 'read' },
	Grep: { permissionKind: 'read' },
	LS: { permissionKind: 'read' },
	NotebookRead: { permissionKind: 'read' },

	// write tools
	Write: { permissionKind: 'write' },
	Edit: { permissionKind: 'write' },
	MultiEdit: { permissionKind: 'write' },
	NotebookEdit: { permissionKind: 'write' },
	TodoWrite: { permissionKind: 'write' },

	// network tools
	WebFetch: { permissionKind: 'url' },

	// host-routed / custom
	Task: { permissionKind: 'custom-tool' },
	ExitPlanMode: { permissionKind: 'custom-tool' },
	AskUserQuestion: { permissionKind: 'custom-tool' },
};

const MCP_TOOL_PREFIX = 'mcp__';

/**
 * S4 row lookup. Falls back to `'custom-tool'` for unknown tools so
 * Claude's growing built-in list never breaks the host.
 */
export function getClaudePermissionKind(toolName: string): ClaudePermissionKind {
	const entry = TOOL_DISPLAY[toolName];
	if (entry) {
		return entry.permissionKind;
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
 * S4 path extractor for `pending_confirmation.permissionPath`. Returns
 * the `string` field of `input` named per the S4 table, or `undefined`
 * when the field is missing or wrong-typed (defensive against malformed
 * SDK input).
 */
export function extractPermissionPath(toolName: string, input: Record<string, unknown>): string | undefined {
	switch (toolName) {
		case 'Read':
		case 'Write':
		case 'Edit':
		case 'MultiEdit': {
			const fp = input.file_path;
			return typeof fp === 'string' ? fp : undefined;
		}
		case 'NotebookRead':
		case 'NotebookEdit': {
			const fp = input.notebook_path;
			return typeof fp === 'string' ? fp : undefined;
		}
		case 'Glob':
		case 'Grep':
		case 'LS': {
			const p = input.path;
			return typeof p === 'string' ? p : undefined;
		}
		case 'WebFetch': {
			const url = input.url;
			return typeof url === 'string' ? url : undefined;
		}
		default:
			return undefined;
	}
}

/**
 * Phase 7 S3.5. Tools whose `canUseTool` invocation is satisfied by a
 * `SessionInputRequested` round-trip rather than the standard
 * `pending_confirmation` signal:
 * - `AskUserQuestion` — carousel (S3.5a).
 *
 * `ExitPlanMode` is dispatched via this same path so it can flip
 * `permissionMode` on approve, but uses the standard
 * `pending_confirmation` channel (with a custom title + plan body
 * rendered as the invocation message) rather than the carousel UI —
 * matching what tool calls already render in the workbench.
 *
 * `_handleCanUseTool` dispatches via `INTERACTIVE_CLAUDE_TOOLS.has(toolName)`.
 */
export const INTERACTIVE_CLAUDE_TOOLS: ReadonlySet<string> = new Set([
	'AskUserQuestion',
	'ExitPlanMode',
]);

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
