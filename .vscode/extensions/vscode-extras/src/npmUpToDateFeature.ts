/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface FileHashes {
	readonly [relativePath: string]: string;
}

interface PostinstallState {
	readonly nodeVersion: string;
	readonly fileHashes: FileHashes;
}

interface InstallState {
	readonly root: string;
	readonly current: PostinstallState;
	readonly saved: PostinstallState | undefined;
	readonly files: readonly string[];
}

export class NpmUpToDateFeature extends vscode.Disposable {
	private readonly _statusBarItem: vscode.StatusBarItem;
	private readonly _disposables: vscode.Disposable[] = [];
	private _watchers: fs.FSWatcher[] = [];
	private _terminal: vscode.Terminal | undefined;

	constructor(private readonly _output: vscode.LogOutputChannel) {
		const disposables: vscode.Disposable[] = [];
		super(() => {
			disposables.forEach(d => d.dispose());
			for (const w of this._watchers) {
				w.close();
			}
		});
		this._disposables = disposables;

		this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10000);
		this._statusBarItem.name = 'npm Install State';
		this._statusBarItem.text = '$(warning) node_modules is stale - run npm i';
		this._statusBarItem.tooltip = 'Dependencies are out of date. Click to run npm install.';
		this._statusBarItem.command = 'vscode-extras.runNpmInstall';
		this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		this._disposables.push(this._statusBarItem);

		this._disposables.push(
			vscode.commands.registerCommand('vscode-extras.runNpmInstall', () => this._runNpmInstall())
		);

		this._disposables.push(
			vscode.window.onDidCloseTerminal(t => {
				if (t === this._terminal) {
					this._terminal = undefined;
					this._check();
				}
			})
		);

		this._check();
	}

	private _runNpmInstall(): void {
		if (this._terminal) {
			this._terminal.show();
			return;
		}
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
		if (!workspaceRoot) {
			return;
		}
		this._terminal = vscode.window.createTerminal({ name: 'npm install', cwd: workspaceRoot });
		this._terminal.sendText('node build/npm/fast-install.ts --force');
		this._terminal.show();

		this._statusBarItem.text = '$(loading~spin) npm i';
		this._statusBarItem.tooltip = 'npm install is running...';
		this._statusBarItem.backgroundColor = undefined;
		this._statusBarItem.command = 'vscode-extras.runNpmInstall';
	}

	private _queryState(): InstallState | undefined {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			return undefined;
		}
		try {
			const script = path.join(workspaceRoot, 'build', 'npm', 'installStateHash.ts');
			const output = cp.execFileSync(process.execPath, [script], {
				cwd: workspaceRoot,
				timeout: 10_000,
				encoding: 'utf8',
			});
			const parsed = JSON.parse(output.trim());
			this._output.trace('raw output:', output.trim());
			return parsed;
		} catch (e) {
			this._output.error('_queryState error:', e as any);
			return undefined;
		}
	}

	private _check(): void {
		const state = this._queryState();
		this._output.trace('state:', JSON.stringify(state, null, 2));
		if (!state) {
			this._output.trace('no state, hiding');
			this._statusBarItem.hide();
			return;
		}

		this._setupWatcher(state);

		const changedFiles = this._getChangedFiles(state);
		this._output.trace('changedFiles:', JSON.stringify(changedFiles));

		if (changedFiles.length === 0) {
			this._statusBarItem.hide();
		} else {
			this._statusBarItem.text = '$(warning) node_modules is stale - run npm i';
			const tooltip = new vscode.MarkdownString();
			tooltip.appendText('Dependencies are out of date. Click to run npm install.\n\nChanged files:\n');
			for (const file of changedFiles) {
				tooltip.appendText(`  • ${file}\n`);
			}
			this._statusBarItem.tooltip = tooltip;
			this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			this._statusBarItem.show();
		}
	}

	private _getChangedFiles(state: InstallState): string[] {
		if (!state.saved) {
			return ['(no postinstall state found)'];
		}
		const changed: string[] = [];
		if (state.saved.nodeVersion !== state.current.nodeVersion) {
			changed.push(`Node.js version (${state.saved.nodeVersion} → ${state.current.nodeVersion})`);
		}
		const allKeys = new Set([...Object.keys(state.current.fileHashes), ...Object.keys(state.saved.fileHashes)]);
		for (const key of allKeys) {
			if (state.current.fileHashes[key] !== state.saved.fileHashes[key]) {
				changed.push(key);
			}
		}
		return changed;
	}

	private _setupWatcher(state: InstallState): void {
		for (const w of this._watchers) {
			w.close();
		}
		this._watchers = [];

		let debounceTimer: ReturnType<typeof setTimeout> | undefined;
		const scheduleCheck = () => {
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}
			debounceTimer = setTimeout(() => this._check(), 500);
		};

		for (const file of state.files) {
			try {
				const watcher = fs.watch(file, scheduleCheck);
				this._watchers.push(watcher);
			} catch {
				// file may not exist yet
			}
		}
	}
}
