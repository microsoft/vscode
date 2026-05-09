/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { ToolExecutionContext } from 'son-of-anton-core/tools/types';
import type { HookRunner } from 'son-of-anton-core/persistence/HookRunner';
import { instrumentToolExecutionContext } from 'son-of-anton-core/persistence/instrumentToolExecutionContext';

// Re-export the moved registry surface so existing relative imports
// (`../tools/registry`) keep working without churning every call site.
export { ToolRegistry, BUILTIN_TOOLS } from 'son-of-anton-core/tools/registry';

/**
 * Description of a pending side-effecting tool action awaiting host approval.
 * Passed to a {@link CreateWorkspaceToolContextOptions.requestApproval}
 * callback so a chat-level UI (e.g. webview cards) can render a richer
 * confirmation surface than the modal popups used by default.
 *
 * `kind` discriminates `writeFile` (`'write'`) from `runCommand` (`'shell'`);
 * the remaining fields are populated per-kind and otherwise omitted.
 */
export interface ApprovalRequest {
	readonly kind: 'write' | 'shell';
	/** Workspace-relative target path. `'write'` only. */
	readonly path?: string;
	/** Proposed file content. `'write'` only. */
	readonly content?: string;
	/** Existing file content captured before the write. `'write'` only. */
	readonly preImage?: string;
	/** Whether the file existed when approval was requested. `'write'` only. */
	readonly existed?: boolean;
	/** Executable to invoke. `'shell'` only. */
	readonly command?: string;
	/** Arguments passed to the executable. `'shell'` only. */
	readonly args?: ReadonlyArray<string>;
	/** Workspace-relative working directory for the command. `'shell'` only. */
	readonly cwd?: string;
	/** Hard timeout for the command in milliseconds. `'shell'` only. */
	readonly timeoutMs?: number;
}

/**
 * Result of an approval prompt resolved by the host. `'approve'` lets the
 * action proceed; `'reject'` and `'cancel'` both block it but `'cancel'` is
 * reserved for chat-level aborts so the caller can distinguish "user said
 * no" from "the whole turn was torn down". `reason` flows back to the LLM
 * via the tool result so the model has structured context for the refusal.
 */
export interface ApprovalDecision {
	readonly action: 'approve' | 'reject' | 'cancel';
	readonly reason?: string;
}

/**
 * Optional configuration for {@link createWorkspaceToolContext}. Currently
 * carries only the host-supplied approval callback — when omitted, the
 * factory falls back to its built-in modal `vscode.window` prompts so
 * non-chat-panel callers (palette commands, programmatic invocations)
 * continue to receive a confirmation UI.
 */
export interface CreateWorkspaceToolContextOptions {
	/**
	 * Host-supplied approval gate. Invoked by `writeFile` / `runCommand`
	 * before any side-effecting work; the returned {@link ApprovalDecision}
	 * determines whether the operation proceeds.
	 *
	 * Supplying this callback suppresses the default modal popup paths so
	 * the host can render its own UI (e.g. webview approval cards).
	 */
	readonly requestApproval?: (request: ApprovalRequest) => Promise<ApprovalDecision>;
}

/**
 * Build a `ToolExecutionContext` backed by the live VS Code workspace. Stays
 * in the extension because it depends on `vscode.workspace.fs`,
 * `vscode.workspace.findFiles`, and the `vscode.diff` confirmation UI — all
 * surfaces unavailable to the future CLI host. The CLI will provide its own
 * implementation of the same `ToolExecutionContext` interface.
 *
 * When `options.requestApproval` is supplied, `writeFile` and `runCommand`
 * delegate the user-confirmation step to that callback instead of popping
 * the default modal dialogs. This is how the chat panel injects its
 * inline webview-card approval flow into the orchestrator-dispatched
 * specialist path so both surfaces share the same UX.
 */
/**
 * Modal-based fallback for {@link CreateWorkspaceToolContextOptions.requestApproval}.
 * Pops the existing diff-preview + `vscode.window.showInformationMessage` /
 * `showWarningMessage` modals so callers without a webview surface (palette
 * commands, programmatic invocations, surfaces with no chat panel registered)
 * still get a visible approval prompt instead of silently auto-approving.
 *
 * Exported so registry-consulting callbacks can fall back here when no
 * higher-priority host callback is registered. The implementation is a
 * direct lift of the inline modal branches that lived inside
 * `createWorkspaceToolContext` before the H1 webview-card unification.
 */
export async function defaultModalApproval(req: ApprovalRequest): Promise<ApprovalDecision> {
	const root = vscode.workspace.workspaceFolders?.[0]?.uri;
	if (req.kind === 'write') {
		if (!root) {
			return { action: 'reject', reason: 'no workspace folder is open' };
		}
		const path = req.path ?? '';
		const content = req.content ?? '';
		try {
			const targetUri = vscode.Uri.joinPath(root, path);
			const proposedDoc = await vscode.workspace.openTextDocument({ content, language: 'plaintext' });
			const title = req.existed ? `${path} (proposed change)` : `${path} (proposed new file)`;
			await vscode.commands.executeCommand('vscode.diff', targetUri, proposedDoc.uri, title);
		} catch {
			// Diff editor failure is non-fatal — proceed to confirm.
		}
		const choice = await vscode.window.showInformationMessage(
			`Allow Son of Anton to write to ${path}?`,
			{ modal: true },
			'Apply',
			'Cancel',
		);
		return choice === 'Apply'
			? { action: 'approve' }
			: { action: 'reject', reason: 'declined by user' };
	}
	// kind === 'shell'
	const command = req.command ?? '';
	const args = req.args ?? [];
	const argDisplay = args.length > 0 ? ' ' + args.map(a => /[\s"']/.test(a) ? JSON.stringify(a) : a).join(' ') : '';
	const fullDisplay = `${command}${argDisplay}`;
	const cwdDisplay = req.cwd ? ` (in ${req.cwd})` : '';
	const choice = await vscode.window.showWarningMessage(
		`Allow Son of Anton to run:\n\n${fullDisplay}${cwdDisplay}\n\nTimeout: ${Math.round((req.timeoutMs ?? 30_000) / 1000)}s`,
		{ modal: true },
		'Run',
		'Cancel',
	);
	return choice === 'Run'
		? { action: 'approve' }
		: { action: 'reject', reason: 'declined by user' };
}

export function createWorkspaceToolContext(options?: CreateWorkspaceToolContextOptions): ToolExecutionContext {
	const requestApproval = options?.requestApproval;
	const root = vscode.workspace.workspaceFolders?.[0]?.uri;
	const resolveSafe = (relPath: string): vscode.Uri => {
		if (!root) {
			throw new Error('No workspace folder is open.');
		}
		return vscode.Uri.joinPath(root, relPath);
	};
	return {
		workspaceRoot: root?.fsPath,
		getConfigValue: <T>(key: string): T | undefined => {
			// Host-side accessor used by tools (e.g. `run_command` sandbox mode)
			// to read user/workspace settings at execute time. Reading via the
			// VS Code config API picks up live changes without an extension
			// reload, and crucially is not influenced by tool input — the LLM
			// cannot escalate its own privileges through this channel.
			return vscode.workspace.getConfiguration().get<T>(key);
		},
		readFile: async (relPath: string) => {
			const uri = resolveSafe(relPath);
			const bytes = await vscode.workspace.fs.readFile(uri);
			return new TextDecoder('utf-8').decode(bytes);
		},
		readDir: async (relPath: string) => {
			const uri = resolveSafe(relPath);
			const entries = await vscode.workspace.fs.readDirectory(uri);
			return entries.map(([name, kind]) => ({
				name,
				isDirectory: (kind & vscode.FileType.Directory) !== 0,
			}));
		},
		writeFile: async (relPath: string, content: string) => {
			if (!root) {
				return { written: false, reason: 'no workspace folder is open' };
			}
			if (typeof relPath !== 'string' || relPath.length === 0) {
				return { written: false, reason: 'path is required' };
			}
			if (relPath.includes('..') || relPath.startsWith('/') || relPath.startsWith('\\') || relPath.includes('\0')) {
				return { written: false, reason: 'path rejected: must be a workspace-relative path without traversal' };
			}
			const targetUri = vscode.Uri.joinPath(root, relPath);

			// Read existing content (empty if file doesn't exist).
			let existing = '';
			let exists = true;
			try {
				const bytes = await vscode.workspace.fs.readFile(targetUri);
				existing = new TextDecoder('utf-8').decode(bytes);
			} catch {
				exists = false;
			}

			// No-op write — skip prompt.
			if (exists && existing === content) {
				return { written: true };
			}

			if (requestApproval) {
				// Host-supplied callback — delegate the confirmation UX
				// (e.g. webview approval card) and skip the modal/diff
				// flow below. The host is responsible for rendering its
				// own preview before resolving.
				const decision = await requestApproval({
					kind: 'write',
					path: relPath,
					content,
					preImage: existing,
					existed: exists,
				});
				if (decision.action !== 'approve') {
					return { written: false, reason: decision.reason ?? 'declined by user' };
				}
			} else {
				// Show the diff editor so the user can preview the change.
				try {
					const proposedDoc = await vscode.workspace.openTextDocument({ content, language: 'plaintext' });
					const title = exists ? `${relPath} (proposed change)` : `${relPath} (proposed new file)`;
					await vscode.commands.executeCommand('vscode.diff', targetUri, proposedDoc.uri, title);
				} catch {
					// Diff editor failure is non-fatal — proceed to confirm.
				}

				const choice = await vscode.window.showInformationMessage(
					`Allow Son of Anton to write to ${relPath}?`,
					{ modal: true },
					'Apply',
					'Cancel',
				);
				if (choice !== 'Apply') {
					return { written: false, reason: 'declined by user' };
				}
			}

			try {
				// Ensure parent directory exists.
				const lastSep = relPath.lastIndexOf('/');
				if (lastSep > 0) {
					const parentRel = relPath.slice(0, lastSep);
					try {
						await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, parentRel));
					} catch { /* directory may already exist — ignore */ }
				}
				await vscode.workspace.fs.writeFile(targetUri, new TextEncoder().encode(content));
				// Surface the pre-image and existence flag so the host can
				// stash a snapshot for the side-by-side diff editor. The
				// pre-image is the content the file held *before* this
				// write completed — which is what the diff button needs to
				// show "before ↔ after". For new files we still report a
				// snapshot (empty string) so the diff is offered uniformly.
				return { written: true, preImage: existing, existed: exists };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { written: false, reason: msg };
			}
		},
		runCommand: async (command, args, opts) => {
			if (!root) {
				return { ran: false, reason: 'no workspace folder is open' };
			}

			if (requestApproval) {
				// Host-supplied callback — delegate the confirmation UX.
				const decision = await requestApproval({
					kind: 'shell',
					command,
					args,
					cwd: opts.cwd,
					timeoutMs: opts.timeoutMs,
				});
				if (decision.action !== 'approve') {
					return { ran: false, reason: decision.reason ?? 'declined by user' };
				}
			} else {
				const argDisplay = args.length > 0 ? ' ' + args.map(a => /[\s"']/.test(a) ? JSON.stringify(a) : a).join(' ') : '';
				const fullDisplay = `${command}${argDisplay}`;
				const cwdDisplay = opts.cwd ? ` (in ${opts.cwd})` : '';

				const choice = await vscode.window.showWarningMessage(
					`Allow Son of Anton to run:\n\n${fullDisplay}${cwdDisplay}\n\nTimeout: ${Math.round((opts.timeoutMs ?? 30_000) / 1000)}s`,
					{ modal: true },
					'Run',
					'Cancel',
				);
				if (choice !== 'Run') {
					return { ran: false, reason: 'declined by user' };
				}
			}

			const cwdAbs = opts.cwd ? vscode.Uri.joinPath(root, opts.cwd).fsPath : root.fsPath;
			const timeoutMs = opts.timeoutMs ?? 30_000;

			return await new Promise((resolve) => {
				let stdout = '';
				let stderr = '';
				let timedOut = false;
				let settled = false;

				let child;
				try {
					child = spawn(command, [...args], {
						cwd: cwdAbs,
						env: process.env,
						shell: false,
						windowsHide: true,
					});
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					resolve({ ran: false, reason: `spawn failed: ${msg}` });
					return;
				}

				const timer = setTimeout(() => {
					if (!settled) {
						timedOut = true;
						try { child.kill('SIGKILL'); } catch { /* ignore */ }
					}
				}, timeoutMs);

				child.stdout?.setEncoding('utf8');
				child.stderr?.setEncoding('utf8');
				child.stdout?.on('data', (chunk: string) => {
					if (stdout.length < 25_000) { stdout += chunk; }
				});
				child.stderr?.on('data', (chunk: string) => {
					if (stderr.length < 25_000) { stderr += chunk; }
				});

				child.on('error', (err) => {
					if (settled) { return; }
					settled = true;
					clearTimeout(timer);
					const code = (err as NodeJS.ErrnoException).code;
					const reason = code === 'ENOENT' ? 'command not found' : err.message;
					resolve({ ran: false, reason });
				});

				child.on('close', (code) => {
					if (settled) { return; }
					settled = true;
					clearTimeout(timer);
					resolve({
						ran: true,
						stdout,
						stderr,
						exitCode: code ?? undefined,
						timedOut,
					});
				});
			});
		},
		searchTextInWorkspace: async (query: string, maxMatches: number) => {
			const results: Array<{ relPath: string; line: number; preview: string }> = [];
			const proposed = (vscode.workspace as unknown as { findTextInFiles?: Function }).findTextInFiles;
			if (typeof proposed === 'function' && root) {
				try {
					await proposed.call(vscode.workspace, { pattern: query }, {
						previewOptions: { matchLines: 1, charsPerLine: 200 },
					}, (match: { uri: vscode.Uri; ranges: vscode.Range[]; preview: { text: string; matches: vscode.Range[] } }) => {
						if (results.length >= maxMatches) {
							return;
						}
						const rel = vscode.workspace.asRelativePath(match.uri);
						const line = match.ranges[0]?.start.line ?? 0;
						results.push({ relPath: rel, line: line + 1, preview: match.preview.text.split('\n')[0]?.slice(0, 200) ?? '' });
					});
					return results;
				} catch { /* fall through */ }
			}
			const files = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,out,dist,build}/**', 5_000);
			for (const file of files) {
				if (results.length >= maxMatches) {
					break;
				}
				try {
					const bytes = await vscode.workspace.fs.readFile(file);
					const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
					const lines = text.split('\n');
					for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
						if (lines[i].includes(query)) {
							results.push({ relPath: vscode.workspace.asRelativePath(file), line: i + 1, preview: lines[i].slice(0, 200) });
						}
					}
				} catch { /* skip unreadable */ }
			}
			return results;
		},
	};
}

/**
 * Build a workspace-backed `ToolExecutionContext` and, when a {@link HookRunner}
 * is supplied, wrap it with the shared `instrumentToolExecutionContext`
 * decorator so configured `.son-of-anton/hooks.json` scripts fire on the
 * primitives the IDE's tool registry calls into (`pre-write-file`,
 * `pre-shell-command`, `post-tool-call`).
 *
 * Without a `hookRunner` this is equivalent to {@link createWorkspaceToolContext}
 * — call sites that don't need hooks (e.g. tests) keep using the bare factory.
 *
 * `options` is forwarded verbatim to {@link createWorkspaceToolContext} so a
 * host-supplied `requestApproval` callback travels through the hook
 * instrumentation layer unchanged.
 *
 * Wiring path for the chat panel (deferred — see follow-up):
 *   1. The chat panel already exposes a webview-card approval flow
 *      (`requestApproval` / `waitForApproval` in `ChatPanel.ts`).
 *   2. The agent-stack context built at activation in `extension.ts`
 *      currently calls `createInstrumentedWorkspaceToolContext(hookRunner)`
 *      without an `options.requestApproval`. The orchestrator-dispatched
 *      specialist path therefore still falls back to modal popups.
 *   3. To unify the two surfaces, expose a per-turn `requestApproval`
 *      adapter on the chat panel and pass it via `options.requestApproval`
 *      when the chat panel constructs the agent-stack context (or when it
 *      sets the agent stack's tool-execution context for a turn). This
 *      commit lands the shape only; the chat-panel side is its own commit.
 */
export function createInstrumentedWorkspaceToolContext(hookRunner?: HookRunner, options?: CreateWorkspaceToolContextOptions): ToolExecutionContext {
	const base = createWorkspaceToolContext(options);
	return hookRunner ? instrumentToolExecutionContext(base, hookRunner) : base;
}
