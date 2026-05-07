/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { Tool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './types';
import { BUILTIN_TOOLS } from './builtin';

export class ToolRegistry {
	private readonly tools = new Map<string, Tool>();

	constructor(initial: ReadonlyArray<Tool> = BUILTIN_TOOLS) {
		for (const t of initial) {
			this.tools.set(t.definition.name, t);
		}
	}

	register(tool: Tool): void { this.tools.set(tool.definition.name, tool); }
	unregister(name: string): boolean { return this.tools.delete(name); }
	get(name: string): Tool | undefined { return this.tools.get(name); }
	definitions(): ReadonlyArray<ToolDefinition> { return [...this.tools.values()].map(t => t.definition); }

	async execute(name: string, input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
		const tool = this.tools.get(name);
		if (!tool) {
			return { content: `Unknown tool: ${name}`, isError: true };
		}
		try {
			return await tool.execute(input, ctx);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { content: `Tool '${name}' threw: ${msg}`, isError: true };
		}
	}
}

export function createWorkspaceToolContext(): ToolExecutionContext {
	const root = vscode.workspace.workspaceFolders?.[0]?.uri;
	const resolveSafe = (relPath: string): vscode.Uri => {
		if (!root) {
			throw new Error('No workspace folder is open.');
		}
		return vscode.Uri.joinPath(root, relPath);
	};
	return {
		workspaceRoot: root?.fsPath,
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
				return { written: true };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { written: false, reason: msg };
			}
		},
		runCommand: async (command, args, opts) => {
			if (!root) {
				return { ran: false, reason: 'no workspace folder is open' };
			}

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

export { BUILTIN_TOOLS };
