/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolExecutionContext } from 'son-of-anton-core/dist/tools/types';
import type { HookRunner } from './HookRunner';

/**
 * Stringify an arbitrary tool result for the `post-tool-call` payload. We
 * keep this best-effort: anything that can't survive `JSON.stringify`
 * (circular refs, very large buffers) falls back to `String(value)` so the
 * hook still gets a non-empty `output` field rather than failing the call.
 */
function stringifyOutput(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

/**
 * Decorate a {@link ToolExecutionContext} so configured `.son-of-anton/hooks.json`
 * scripts fire on the host primitives the tool registry calls into.
 *
 * Wired events (H14, tool-loop scope only):
 *
 * - `pre-write-file` — fires inside `writeFile` BEFORE the fs write. Stdin
 *   payload is `{ path, content }`. If any script writes non-empty stdout,
 *   that becomes the new content; if any script exits non-zero, the write
 *   is denied and `{ written: false, reason }` is returned without touching
 *   disk.
 * - `pre-shell-command` — fires inside `runCommand` BEFORE spawn. Stdin
 *   payload is `{ command, args, cwd }`. Non-zero exit denies the command
 *   and returns `{ ran: false, reason }`.
 * - `post-tool-call` — fires AFTER each `writeFile`, `runCommand`,
 *   `readFile`, `readDir`, and `searchTextInWorkspace` returns. Informational
 *   only — the hook's exit code is ignored.
 *
 * Deviation from the cli-upgrade-plan spec: `post-tool-call`'s `name` field
 * is the ToolExecutionContext METHOD name (e.g. `'writeFile'`,
 * `'runCommand'`) rather than the tool-registry tool name (e.g.
 * `'write_file'`, `'run_command'`). The decorator sits below the registry
 * boundary, where tool names are not in scope. The pre-tool-call hook is
 * deferred for the same reason — it fires conceptually at the registry
 * boundary, not at the host-primitive boundary.
 *
 * @param ctx The base CLI tool execution context to wrap.
 * @param hookRunner A constructed {@link HookRunner}. Must already be gated
 *                   on `host.workspace.isTrusted`; this decorator does not
 *                   re-check trust because `HookRunner.fire` is itself a
 *                   no-op for untrusted workspaces.
 */
export function instrumentToolExecutionContext(
	ctx: ToolExecutionContext,
	hookRunner: HookRunner,
): ToolExecutionContext {
	return {
		workspaceRoot: ctx.workspaceRoot,

		// Forward the host config accessor unchanged — hooks have no need to
		// observe or mutate config reads, and dropping this would silently
		// pin sandbox-aware tools (e.g. `run_command`) to their `'safe'`
		// default whenever a hook runner is active.
		getConfigValue: ctx.getConfigValue,

		readFile: async (relPath) => {
			const result = await ctx.readFile(relPath);
			await hookRunner.fire('post-tool-call', {
				name: 'readFile',
				input: { path: relPath },
				output: stringifyOutput(result),
				isError: false,
			});
			return result;
		},

		readDir: async (relPath) => {
			const result = await ctx.readDir(relPath);
			await hookRunner.fire('post-tool-call', {
				name: 'readDir',
				input: { path: relPath },
				output: stringifyOutput(result),
				isError: false,
			});
			return result;
		},

		searchTextInWorkspace: async (query, maxMatches) => {
			const result = await ctx.searchTextInWorkspace(query, maxMatches);
			await hookRunner.fire('post-tool-call', {
				name: 'searchTextInWorkspace',
				input: { query, maxMatches },
				output: stringifyOutput(result),
				isError: false,
			});
			return result;
		},

		writeFile: async (relPath, content) => {
			const fired = await hookRunner.fire('pre-write-file', { path: relPath, content });
			if (!fired.allowed) {
				const denied = { written: false as const, reason: 'pre-write-file hook denied write' };
				await hookRunner.fire('post-tool-call', {
					name: 'writeFile',
					input: { path: relPath, content },
					output: stringifyOutput(denied),
					isError: false,
				});
				return denied;
			}
			const effectiveContent = fired.replacement !== undefined ? fired.replacement : content;
			const result = await ctx.writeFile(relPath, effectiveContent);
			await hookRunner.fire('post-tool-call', {
				name: 'writeFile',
				input: { path: relPath, content: effectiveContent },
				output: stringifyOutput(result),
				isError: false,
			});
			return result;
		},

		runCommand: async (command, args, opts) => {
			const fired = await hookRunner.fire('pre-shell-command', {
				command,
				args,
				cwd: opts?.cwd,
			});
			if (!fired.allowed) {
				const denied = { ran: false as const, reason: 'pre-shell-command hook denied command' };
				await hookRunner.fire('post-tool-call', {
					name: 'runCommand',
					input: { command, args, cwd: opts?.cwd },
					output: stringifyOutput(denied),
					isError: false,
				});
				return denied;
			}
			const result = await ctx.runCommand(command, args, opts);
			await hookRunner.fire('post-tool-call', {
				name: 'runCommand',
				input: { command, args, cwd: opts?.cwd },
				output: stringifyOutput(result),
				isError: false,
			});
			return result;
		},
	};
}
