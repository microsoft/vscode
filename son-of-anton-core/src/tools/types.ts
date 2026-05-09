/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ToolInputSchema {
	readonly type: 'object';
	readonly properties: Record<string, ToolInputProperty>;
	readonly required?: ReadonlyArray<string>;
}

export interface ToolInputProperty {
	readonly type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
	readonly description?: string;
	readonly items?: ToolInputProperty;
	readonly enum?: ReadonlyArray<string | number>;
}

/**
 * Coarse-grained category attached to every tool definition. Drives the
 * Phase 86 per-category auto-approval panel: each category is gated by a
 * dedicated `sota.autoApprove.<category>` flag so users can opt different
 * tool families into auto-approval independently.
 *
 * - `'read'`  — read-only inspection (read_file, list_directory, search, fetch_url).
 * - `'write'` — file mutation (write_file, edit_file).
 * - `'shell'` — arbitrary command execution (run_command).
 * - `'mcp'`   — tools exposed by external Model Context Protocol servers.
 *
 * Built-in tools that don't fit any of these (e.g. `emit_ui_block`) fall
 * back to `'read'` since they have no side effects beyond chat UI.
 */
export type ToolCategory = 'read' | 'write' | 'shell' | 'mcp';

export interface ToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: ToolInputSchema;
	/**
	 * Optional risk level. Tools marked `'requiresApproval'` are gated behind a
	 * user-confirmation prompt in interactive surfaces (e.g. the chat panel).
	 * Tools that omit this field — or set it to `'safe'` — execute immediately
	 * without an approval card. Defaults to `'safe'` when absent.
	 */
	readonly riskLevel?: 'safe' | 'requiresApproval';
	/**
	 * Coarse-grained category — see {@link ToolCategory}. Drives the per-category
	 * auto-approval toggles in the chat settings panel. Optional for backward
	 * compatibility; tools that omit it are treated as `'read'`.
	 */
	readonly category?: ToolCategory;
}

/**
 * Optional structured metadata that tools may attach to their result so the
 * chat surface can render richer UI (e.g. a terminal-style block for shell
 * commands) on top of the always-present plain-text `content` field. Tools
 * and LLM consumers that don't read `metadata` continue to work unchanged.
 */
export interface ShellExecutionMetadata {
	readonly kind: 'shell';
	readonly command: string;
	readonly args?: ReadonlyArray<string>;
	readonly cwd?: string;
	readonly exitCode?: number;
	readonly stdout?: string;
	readonly stderr?: string;
	/** Whether the command was killed/cancelled mid-run (e.g. timeout). */
	readonly cancelled?: boolean;
}

/**
 * Structured metadata attached to the result of a `write_file` (or future
 * write-shaped) tool. Lets the chat surface render a "View diff" affordance
 * that opens VS Code's native side-by-side diff editor showing the file
 * BEFORE the write (`preImage`) against the current on-disk content.
 *
 * `preImage` is omitted when the tool refused to write (e.g. user declined)
 * — in that case the result is still surfaced but no diff is offered.
 * `existed` distinguishes "modified an existing file" from "created a new
 * file"; the latter still benefits from a diff (left side empty) so callers
 * may show the button regardless.
 */
export interface WriteFileMetadata {
	readonly kind: 'write';
	readonly path: string;
	readonly existed: boolean;
	/** Pre-image content of the file (empty string if `existed === false`). */
	readonly preImage?: string;
	/** Byte length of the new content actually written. */
	readonly bytesWritten?: number;
}

/**
 * Structured metadata attached to the result of `emit_ui_block`. Lets the
 * chat surface intercept the tool result and render a generative-UI block
 * (card, form, confirm, table, chart, progress) inline in the assistant
 * message rather than displaying the tool result as an opaque text card.
 *
 * - `component` selects the renderer in the webview-side registry.
 * - `props` is forwarded verbatim to the renderer; renderers escape any
 *   user-/LLM-supplied strings before injection.
 * - `blockId` is generated host-side when the tool runs so subsequent
 *   `ui-block-response` / `ui-block-action` messages from the webview can
 *   target the correct block.
 */
export interface UiBlockMetadata {
	readonly kind: 'ui-block';
	readonly component: string;
	readonly props: Record<string, unknown>;
	readonly blockId: string;
}

/**
 * Structured metadata attached to the result of `todo_write`. Lets the chat
 * surface intercept the tool result and render an inline checklist below
 * the assistant message instead of an opaque tool card. The same array
 * shape is what the agent reads back via `todo_read`.
 */
export interface TodoListMetadata {
	readonly kind: 'todo-list';
	readonly todos: ReadonlyArray<TodoEntry>;
}

/**
 * Single entry in the agent's per-loop todo list. `id` is stable across
 * todo_write calls so the chat surface can animate state changes (pending
 * → in_progress → completed) without re-keying the whole list.
 */
export interface TodoEntry {
	readonly id: string;
	readonly text: string;
	readonly status: 'pending' | 'in_progress' | 'completed';
}

export type ToolExecutionMetadata = ShellExecutionMetadata | WriteFileMetadata | UiBlockMetadata | TodoListMetadata;

export interface ToolExecutionResult {
	readonly content: string;
	readonly isError?: boolean;
	/** Optional structured metadata. Tools may set this to drive richer rendering. */
	readonly metadata?: ToolExecutionMetadata;
}

export interface ToolExecutionContext {
	readonly workspaceRoot: string | undefined;
	readonly readFile: (relPath: string) => Promise<string>;
	readonly readDir: (relPath: string) => Promise<ReadonlyArray<{ name: string; isDirectory: boolean }>>;
	readonly searchTextInWorkspace: (query: string, maxMatches: number) => Promise<ReadonlyArray<{ relPath: string; line: number; preview: string }>>;
	readonly writeFile: (relPath: string, content: string) => Promise<{
		written: boolean;
		reason?: string;
		/**
		 * Pre-image content of the file at `relPath` *before* the write. The
		 * extension surface uses this to populate the side-by-side diff
		 * editor without having to re-read from disk after the fact.
		 * Implementations that can't capture a snapshot (e.g. CLI fallback)
		 * may omit this field — diff UI then degrades to git HEAD.
		 */
		preImage?: string;
		/** Whether the file existed at the start of the call. */
		existed?: boolean;
	}>;
	readonly runCommand: (command: string, args: ReadonlyArray<string>, opts: { cwd?: string; timeoutMs?: number }) => Promise<{ ran: boolean; reason?: string; stdout?: string; stderr?: string; exitCode?: number; timedOut?: boolean }>;
	/**
	 * Optional accessor for host configuration. Tools that need to read
	 * settings at execute time (e.g. the `run_command` sandbox mode) call
	 * this to retrieve a typed value by key. Hosts that don't supply this
	 * accessor will cause callers to fall back to the safest default —
	 * sandbox-mode reads return `undefined` and the tool treats that as
	 * `'safe'`. Crucially, the accessor is host-side only: the LLM cannot
	 * influence its return value, which prevents the model from
	 * self-escalating its own privileges via tool input.
	 */
	readonly getConfigValue?: <T>(key: string) => T | undefined;
}

export interface Tool {
	readonly definition: ToolDefinition;
	execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
}
