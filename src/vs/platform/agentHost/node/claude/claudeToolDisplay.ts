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
	readonly displayName: string;
}

/**
 * Source-of-truth mapping for Phase 7 S4. Add a row here when the SDK
 * adds a new built-in; the snapshot test will fail until both this map
 * and the snapshot are updated together.
 */
const TOOL_DISPLAY: { readonly [toolName: string]: ClaudeToolDisplayEntry } = {
	// shell tools
	Bash: { permissionKind: 'shell', displayName: 'Run shell command' },
	BashOutput: { permissionKind: 'shell', displayName: 'Read shell output' },
	KillBash: { permissionKind: 'shell', displayName: 'Kill shell command' },

	// read tools
	Read: { permissionKind: 'read', displayName: 'Read file' },
	Glob: { permissionKind: 'read', displayName: 'Find files' },
	Grep: { permissionKind: 'read', displayName: 'Search files' },
	LS: { permissionKind: 'read', displayName: 'List directory' },
	NotebookRead: { permissionKind: 'read', displayName: 'Read notebook' },

	// write tools
	Write: { permissionKind: 'write', displayName: 'Write file' },
	Edit: { permissionKind: 'write', displayName: 'Edit file' },
	MultiEdit: { permissionKind: 'write', displayName: 'Edit file' },
	NotebookEdit: { permissionKind: 'write', displayName: 'Edit notebook' },
	TodoWrite: { permissionKind: 'write', displayName: 'Update todo list' },

	// network tools
	WebFetch: { permissionKind: 'url', displayName: 'Fetch URL' },

	// host-routed / custom
	Task: { permissionKind: 'custom-tool', displayName: 'Run subagent task' },
	ExitPlanMode: { permissionKind: 'custom-tool', displayName: 'Ready to code?' },
	AskUserQuestion: { permissionKind: 'custom-tool', displayName: 'Ask user a question' },
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
 * S4 row lookup. Falls back to the raw tool name so unknown tools still
 * render something sensible. For `mcp__server__tool` the prefix is
 * stripped to surface the server/tool pair.
 */
export function getClaudeToolDisplayName(toolName: string): string {
	const entry = TOOL_DISPLAY[toolName];
	if (entry) {
		return entry.displayName;
	}
	if (toolName.startsWith(MCP_TOOL_PREFIX)) {
		return `Run MCP tool ${toolName.slice(MCP_TOOL_PREFIX.length)}`;
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
