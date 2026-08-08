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
	readonly stateContentsFile: string;
	readonly current: PostinstallState;
	readonly saved: PostinstallState | undefined;
	readonly files: readonly string[];
}

export class NpmUpToDateFeature extends vscode.Disposable {
	private readonly _statusBarItem: vscode.StatusBarItem;
	private readonly _disposables: vscode.Disposable[] = [];
	private _watchers: fs.FSWatcher[] = [];
	private _watcherDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	private _terminal: vscode.Terminal | undefined;
	private _stateContentsFile: string | undefined;
	private _root: string | undefined;

	private static readonly _scheme = 'npm-dep-state';

	constructor(private readonly _output: vscode.LogOutputChannel) {
		const disposables: vscode.Disposable[] = [];
		super(() => {
			disposables.forEach(d => d.dispose());
			this._clearWatchers();
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
			vscode.workspace.registerTextDocumentContentProvider(NpmUpToDateFeature._scheme, {
				provideTextDocumentContent: (uri) => {
					const params = new URLSearchParams(uri.query);
					const source = params.get('source');
					const file = uri.path.slice(1); // strip leading /
					if (source === 'saved') {
						return this._readSavedContent(file);
					}
					return this._readCurrentContent(file);
				}
			})
		);

		this._disposables.push(
			vscode.commands.registerCommand('vscode-extras.runNpmInstall', () => this._runNpmInstall())
		);

		this._disposables.push(
			vscode.commands.registerCommand('vscode-extras.showDependencyDiff', (file: string) => this._showDiff(file))
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
		const workspaceRoot = this._getWorkspaceRoot();
		if (!workspaceRoot) {
			void vscode.window.showErrorMessage('npm install requires an open workspace folder');
			return;
		}

		const installScript = path.join(workspaceRoot, 'build', 'npm', 'fast-install.ts');
		if (!fs.existsSync(installScript)) {
			void vscode.window.showErrorMessage('Could not find build/npm/fast-install.ts in the selected workspace folder.');
			this._output.warn('Skipping npm install: missing script', installScript);
			return;
		}

		if (this._terminal) {
			this._terminal.dispose();
		}

		const escapedNodePath = process.execPath.replace(/"/g, '\\"');
		this._terminal = vscode.window.createTerminal({ name: 'npm install', cwd: workspaceRoot });
		this._terminal.sendText(`"${escapedNodePath}" build/npm/fast-install.ts --force`);
		this._terminal.show();

		this._statusBarItem.text = '$(loading~spin) npm i';
		this._statusBarItem.tooltip = 'npm install is running...';
		this._statusBarItem.backgroundColor = undefined;
		this._statusBarItem.command = 'vscode-extras.runNpmInstall';
	}

	private _queryState(): InstallState | undefined {
		const workspaceRoot = this._getWorkspaceRoot();
		if (!workspaceRoot) {
			return undefined;
		}

		const script = path.join(workspaceRoot, 'build', 'npm', 'installStateHash.ts');
		if (!fs.existsSync(script)) {
			this._output.trace('Skipping npm state check: installStateHash.ts not found at', script);
			return undefined;
		}

		try {
			const output = cp.execFileSync(process.execPath, [script, '--ignore-node-version'], {
				cwd: workspaceRoot,
				timeout: 10_000,
				encoding: 'utf8',
			});
			const parsed: unknown = JSON.parse(output.trim());
			if (!this._isInstallState(parsed)) {
				this._output.error('installStateHash.ts returned an unexpected payload shape');
				return undefined;
			}
			this._output.trace('raw output:', output.trim());
			return parsed;
		} catch (e) {
			this._output.error('_queryState error:', e);
			return undefined;
		}
	}

	private _check(): void {
		const state = this._queryState();
		this._output.trace('state:', JSON.stringify(state, null, 2));
		if (!state) {
			this._output.trace('no state, hiding');
			this._stateContentsFile = undefined;
			this._root = undefined;
			this._clearWatchers();
			this._statusBarItem.hide();
			return;
		}

		this._stateContentsFile = state.stateContentsFile;
		this._root = state.root;
		this._setupWatcher(state);

		const changedFiles = this._getChangedFiles(state);
		this._output.trace('changedFiles:', JSON.stringify(changedFiles));

		if (changedFiles.length === 0) {
			this._statusBarItem.hide();
		} else {
			this._statusBarItem.text = '$(warning) node_modules is stale - run npm i';
			const tooltip = new vscode.MarkdownString();
			tooltip.isTrusted = true;
			tooltip.supportHtml = true;
			tooltip.appendMarkdown('**Dependencies are out of date.** Click to run npm install.\n\nChanged files:\n\n');
			for (const entry of changedFiles) {
				if (entry.isFile) {
					const args = encodeURIComponent(JSON.stringify(entry.label));
					tooltip.appendMarkdown(`- [${entry.label}](command:vscode-extras.showDependencyDiff?${args})\n`);
				} else {
					tooltip.appendMarkdown(`- ${entry.label}\n`);
				}
			}
			this._statusBarItem.tooltip = tooltip;
			this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			this._statusBarItem.show();
		}
	}

	private _showDiff(file: string): void {
		const cacheBuster = Date.now().toString();
		const savedUri = vscode.Uri.from({
			scheme: NpmUpToDateFeature._scheme,
			path: `/${file}`,
			query: new URLSearchParams({ source: 'saved', t: cacheBuster }).toString(),
		});
		const currentUri = vscode.Uri.from({
			scheme: NpmUpToDateFeature._scheme,
			path: `/${file}`,
			query: new URLSearchParams({ source: 'current', t: cacheBuster }).toString(),
		});

		vscode.commands.executeCommand('vscode.diff', savedUri, currentUri, `${file} (last install ↔ current)`);
	}

	private _readSavedContent(file: string): string {
		if (!this._stateContentsFile) {
			return '';
		}
		try {
			const contents: Record<string, string> = JSON.parse(fs.readFileSync(this._stateContentsFile, 'utf8'));
			return contents[file] ?? '';
		} catch (e) {
			this._output.debug('Failed reading saved npm install state content:', e);
			return '';
		}
	}

	private _readCurrentContent(file: string): string {
		if (!this._root) {
			return '';
		}

		const normalizedFilePath = path.resolve(this._root, file);
		if (!this._isInsideRoot(this._root, normalizedFilePath)) {
			this._output.warn('Rejected dependency diff request outside workspace root:', file);
			return '';
		}

		try {
			const script = path.join(this._root, 'build', 'npm', 'installStateHash.ts');
			return cp.execFileSync(process.execPath, [script, '--normalize-file', normalizedFilePath], {
				cwd: this._root,
				timeout: 10_000,
				encoding: 'utf8',
			});
		} catch (e) {
			this._output.debug('Failed reading current npm install state content:', e);
			return '';
		}
	}

	private _getChangedFiles(state: InstallState): { readonly label: string; readonly isFile: boolean }[] {
		if (!state.saved) {
			return [{ label: '(no postinstall state found)', isFile: false }];
		}
		const changed: { readonly label: string; readonly isFile: boolean }[] = [];
		if (state.saved.nodeVersion !== state.current.nodeVersion) {
			changed.push({ label: `Node.js version (${state.saved.nodeVersion} → ${state.current.nodeVersion})`, isFile: false });
		}
		const allKeys = new Set([...Object.keys(state.current.fileHashes), ...Object.keys(state.saved.fileHashes)]);
		for (const key of allKeys) {
			if (state.current.fileHashes[key] !== state.saved.fileHashes[key]) {
				changed.push({ label: key, isFile: true });
			}
		}
		return changed;
	}

	private _setupWatcher(state: InstallState): void {
		this._clearWatchers();

		const scheduleCheck = () => {
			if (this._watcherDebounceTimer) {
				clearTimeout(this._watcherDebounceTimer);
			}
			this._watcherDebounceTimer = setTimeout(() => this._check(), 500);
		};

		for (const file of state.files) {
			try {
				const watcher = fs.watch(file, scheduleCheck);
				watcher.on('error', e => this._output.trace('Watcher failed for file:', file, e));
				this._watchers.push(watcher);
			} catch (e) {
				this._output.trace('Skipping watcher for file:', file, e);
			}
		}
	}

	private _clearWatchers(): void {
		for (const watcher of this._watchers) {
			watcher.close();
		}
		this._watchers = [];
		if (this._watcherDebounceTimer) {
			clearTimeout(this._watcherDebounceTimer);
			this._watcherDebounceTimer = undefined;
		}
	}

	private _isInstallState(value: unknown): value is InstallState {
		if (!value || typeof value !== 'object') {
			return false;
		}
		const candidate = value as {
			root?: unknown;
			stateContentsFile?: unknown;
			current?: unknown;
			saved?: unknown;
			files?: unknown;
		};
		return (
			typeof candidate.root === 'string' &&
			typeof candidate.stateContentsFile === 'string' &&
			this._isPostinstallState(candidate.current) &&
			(candidate.saved === undefined || this._isPostinstallState(candidate.saved)) &&
			Array.isArray(candidate.files) &&
			candidate.files.every(file => typeof file === 'string')
		);
	}

	private _isPostinstallState(value: unknown): value is PostinstallState {
		if (!value || typeof value !== 'object') {
			return false;
		}
		const candidate = value as { nodeVersion?: unknown; fileHashes?: unknown };
		return typeof candidate.nodeVersion === 'string' && this._isFileHashes(candidate.fileHashes);
	}

	private _isFileHashes(value: unknown): value is FileHashes {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return false;
		}
		const hashes = value as Record<string, unknown>;
		return Object.values(hashes).every(hash => typeof hash === 'string');
	}

	private _isInsideRoot(root: string, candidatePath: string): boolean {
		const relativePath = path.relative(root, candidatePath);
		return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
	}

	private _getWorkspaceRoot(): string | undefined {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return undefined;
		}

		for (const folder of workspaceFolders) {
			const workspaceRoot = folder.uri.fsPath;
			const stateScriptPath = path.join(workspaceRoot, 'build', 'npm', 'installStateHash.ts');
			if (fs.existsSync(stateScriptPath)) {
				return workspaceRoot;
			}
		}

		return workspaceFolders[0].uri.fsPath;
	}
}
