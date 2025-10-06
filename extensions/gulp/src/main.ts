/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as vscode from 'vscode';


type AutoDetect = 'on' | 'off';

/**
 * Check if the given filename is a file.
 *
 * If returns false in case the file does not exist or
 * the file stats cannot be accessed/queried or it
 * is no file at all.
 *
 * @param filename
 *   the filename to the checked
 * @returns
 *   true in case the file exists, in any other case false.
 */
async function exists(filename: string): Promise<boolean> {
	try {

		if ((await fs.promises.stat(filename)).isFile()) {
			return true;
		}
	} catch (ex) {
		// In case requesting the file statistics fail.
		// we assume it does not exist.
		return false;
	}

	return false;
}

function exec(command: string, options: cp.ExecOptions): Promise<{ stdout: string; stderr: string }> {
	return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
		cp.exec(command, options, (error, stdout, stderr) => {
			if (error) {
				reject({ error, stdout, stderr });
			}
			resolve({ stdout, stderr });
		});
	});
}

const buildNames: string[] = ['build', 'compile', 'watch'];
function isBuildTask(name: string): boolean {
	for (const buildName of buildNames) {
		if (name.indexOf(buildName) !== -1) {
			return true;
		}
	}
	return false;
}

const testNames: string[] = ['test'];
function isTestTask(name: string): boolean {
	for (const testName of testNames) {
		if (name.indexOf(testName) !== -1) {
			return true;
		}
	}
	return false;
}

let _channel: vscode.OutputChannel;
function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel('Gulp Auto Detection');
	}
	return _channel;
}

function showError() {
	vscode.window.showWarningMessage(vscode.l10n.t("Problem finding gulp tasks. See the output for more information."),
		vscode.l10n.t("Go to output")).then((choice) => {
			if (choice !== undefined) {
				_channel.show(true);
			}
		});
}

async function findGulpCommand(rootPath: string): Promise<string> {
	const platform = process.platform;

	if (platform === 'win32' && await exists(path.join(rootPath, 'node_modules', '.bin', 'gulp.cmd'))) {
		const globalGulp = path.join(process.env.APPDATA ? process.env.APPDATA : '', 'npm', 'gulp.cmd');
		if (await exists(globalGulp)) {
			return `"${globalGulp}"`;
		}

		return path.join('.', 'node_modules', '.bin', 'gulp.cmd');

	}

	if ((platform === 'linux' || platform === 'darwin') && await exists(path.join(rootPath, 'node_modules', '.bin', 'gulp'))) {
		return path.join('.', 'node_modules', '.bin', 'gulp');
	}

	return 'gulp';
}

interface GulpTaskDefinition extends vscode.TaskDefinition {
	task: string;
	file?: string;
}

class FolderDetector {

	private fileWatcher: vscode.FileSystemWatcher | undefined;
	private promise: Thenable<vscode.Task[]> | undefined;

	constructor(
		private _workspaceFolder: vscode.WorkspaceFolder,
		private _gulpCommand: Promise<string>) {
	}

	public get workspaceFolder(): vscode.WorkspaceFolder {
		return this._workspaceFolder;
	}

	public isEnabled(): boolean {
		return vscode.workspace.getConfiguration('gulp', this._workspaceFolder.uri).get<AutoDetect>('autoDetect') === 'on';
	}

	public start(): void {
		const pattern = path.join(this._workspaceFolder.uri.fsPath, '{node_modules,gulpfile{.babel.js,.esm.js,.js,.mjs,.cjs,.ts}}');
		this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
		this.fileWatcher.onDidChange(() => this.promise = undefined);
		this.fileWatcher.onDidCreate(() => this.promise = undefined);
		this.fileWatcher.onDidDelete(() => this.promise = undefined);
	}

	public async getTasks(): Promise<vscode.Task[]> {
		if (!this.isEnabled()) {
			return [];
		}

		if (!this.promise) {
			this.promise = this.computeTasks();
		}

		return this.promise;
	}

	public async getTask(_task: vscode.Task): Promise<vscode.Task | undefined> {
		const gulpTask = _task.definition.task;
		if (gulpTask) {
			const kind = _task.definition as GulpTaskDefinition;
			const options: vscode.ShellExecutionOptions = { cwd: this.workspaceFolder.uri.fsPath };
			const task = new vscode.Task(kind, this.workspaceFolder, gulpTask, 'gulp', new vscode.ShellExecution(await this._gulpCommand, [gulpTask], options));
			return task;
		}
		return undefined;
	}

	/**
	 * Searches for a gulp entry point inside the given folder.
	 *
	 * Typically the entry point is a file named "gulpfile.js"
	 *
	 * It can also be a transposed gulp entry points, like gulp.babel.js or gulp.esm.js
	 *
	 * Additionally recent node version prefer the .mjs or .cjs extension over the .js.
	 *
	 * @param root
	 *   the folder which should be checked.
	 */
	private async hasGulpfile(root: string): Promise<boolean | undefined> {

		for (const filename of await fs.promises.readdir(root)) {

			const ext = path.extname(filename);
			if (ext !== '.js' && ext !== '.mjs' && ext !== '.cjs' && ext !== '.ts') {
				continue;
			}

			if (!exists(filename)) {
				continue;
			}

			const basename = path.basename(filename, ext).toLowerCase();
			if (basename === 'gulpfile') {
				return true;
			}
			if (basename === 'gulpfile.esm') {
				return true;
			}
			if (basename === 'gulpfile.babel') {
				return true;
			}
		}

		return false;
	}

	private async computeTasks(): Promise<vscode.Task[]> {
		const rootPath = this._workspaceFolder.uri.scheme === 'file' ? this._workspaceFolder.uri.fsPath : undefined;
		const emptyTasks: vscode.Task[] = [];
		if (!rootPath) {
			return emptyTasks;
		}

		if (!await this.hasGulpfile(rootPath)) {
			return emptyTasks;
		}

		const commandLine = `${await this._gulpCommand} --tasks-simple --no-color`;
		try {
			const { stdout, stderr } = await exec(commandLine, { cwd: rootPath });
			if (stderr && stderr.length > 0) {
				// Filter out "No license field"
				const errors = stderr.split('\n');
				errors.pop(); // The last line is empty.
				if (!errors.every(value => value.indexOf('No license field') >= 0)) {
					getOutputChannel().appendLine(stderr);
					showError();
				}
			}
			const result: vscode.Task[] = [];
			if (stdout) {
				const lines = stdout.split(/\r{0,1}\n/);
				for (const line of lines) {
					if (line.length === 0) {
						continue;
					}
					const kind: GulpTaskDefinition = {
						type: 'gulp',
						task: line
					};
					const options: vscode.ShellExecutionOptions = { cwd: this.workspaceFolder.uri.fsPath };
					const task = new vscode.Task(kind, this.workspaceFolder, line, 'gulp', new vscode.ShellExecution(await this._gulpCommand, [line], options));
					result.push(task);
					const lowerCaseLine = line.toLowerCase();
					if (isBuildTask(lowerCaseLine)) {
						task.group = vscode.TaskGroup.Build;
					} else if (isTestTask(lowerCaseLine)) {
						task.group = vscode.TaskGroup.Test;
					}
				}
			}
			return result;
		} catch (err) {
			const channel = getOutputChannel();
			if (err.stderr) {
				channel.appendLine(err.stderr);
			}
			if (err.stdout) {
				channel.appendLine(err.stdout);
			}
			channel.appendLine(vscode.l10n.t("Auto detecting gulp for folder {0} failed with error: {1}', this.workspaceFolder.name, err.error ? err.error.toString() : 'unknown"));
			showError();
			return emptyTasks;
		}
	}

	public dispose() {
		this.promise = undefined;
		if (this.fileWatcher) {
			this.fileWatcher.dispose();
		}
	}
}

class TaskDetector {

	private taskProvider: vscode.Disposable | undefined;
	private detectors: Map<string, FolderDetector> = new Map();

	constructor() {
	}

	public start(): void {
		const folders = vscode.workspace.workspaceFolders;
		if (folders) {
			this.updateWorkspaceFolders(folders, []);
		}
		vscode.workspace.onDidChangeWorkspaceFolders((event) => this.updateWorkspaceFolders(event.added, event.removed));
		vscode.workspace.onDidChangeConfiguration(this.updateConfiguration, this);
	}

	public dispose(): void {
		if (this.taskProvider) {
			this.taskProvider.dispose();
			this.taskProvider = undefined;
		}
		this.detectors.clear();
	}

	private updateWorkspaceFolders(added: readonly vscode.WorkspaceFolder[], removed: readonly vscode.WorkspaceFolder[]): void {
		for (const remove of removed) {
			const detector = this.detectors.get(remove.uri.toString());
			if (detector) {
				detector.dispose();
				this.detectors.delete(remove.uri.toString());
			}
		}
		for (const add of added) {
			const detector = new FolderDetector(add, findGulpCommand(add.uri.fsPath));
			this.detectors.set(add.uri.toString(), detector);
			if (detector.isEnabled()) {
				detector.start();
			}
		}
		this.updateProvider();
	}

	private updateConfiguration(): void {
		for (const detector of this.detectors.values()) {
			detector.dispose();
			this.detectors.delete(detector.workspaceFolder.uri.toString());
		}
		const folders = vscode.workspace.workspaceFolders;
		if (folders) {
			for (const folder of folders) {
				if (!this.detectors.has(folder.uri.toString())) {
					const detector = new FolderDetector(folder, findGulpCommand(folder.uri.fsPath));
					this.detectors.set(folder.uri.toString(), detector);
					if (detector.isEnabled()) {
						detector.start();
					}
				}
			}
		}
		this.updateProvider();
	}

	private updateProvider(): void {
		if (!this.taskProvider && this.detectors.size > 0) {
			const thisCapture = this;
			this.taskProvider = vscode.tasks.registerTaskProvider('gulp', {
				provideTasks(): Promise<vscode.Task[]> {
					return thisCapture.getTasks();
				},
				resolveTask(_task: vscode.Task): Promise<vscode.Task | undefined> {
					return thisCapture.getTask(_task);
				}
			});
		}
		else if (this.taskProvider && this.detectors.size === 0) {
			this.taskProvider.dispose();
			this.taskProvider = undefined;
		}
	}

	public getTasks(): Promise<vscode.Task[]> {
		return this.computeTasks();
	}

	private computeTasks(): Promise<vscode.Task[]> {
		if (this.detectors.size === 0) {
			return Promise.resolve([]);
		} else if (this.detectors.size === 1) {
			return this.detectors.values().next().value!.getTasks();
		} else {
			const promises: Promise<vscode.Task[]>[] = [];
			for (const detector of this.detectors.values()) {
				promises.push(detector.getTasks().then((value) => value, () => []));
			}
			return Promise.all(promises).then((values) => {
				const result: vscode.Task[] = [];
				for (const tasks of values) {
					if (tasks && tasks.length > 0) {
						result.push(...tasks);
					}
				}
				return result;
			});
		}
	}

	public async getTask(task: vscode.Task): Promise<vscode.Task | undefined> {
		if (this.detectors.size === 0) {
			return undefined;
		} else if (this.detectors.size === 1) {
			return this.detectors.values().next().value!.getTask(task);
		} else {
			if ((task.scope === vscode.TaskScope.Workspace) || (task.scope === vscode.TaskScope.Global)) {
				// Not supported, we don't have enough info to create the task.
				return undefined;
			} else if (task.scope) {
				const detector = this.detectors.get(task.scope.uri.toString());
				if (detector) {
					return detector.getTask(task);
				}
			}
			return undefined;
		}
	}
}

let detector: TaskDetector;
export function activate(_context: vscode.ExtensionContext): void {
	detector = new TaskDetector();
	detector.start();
}

export function deactivate(): void {
	detector.dispose();
}
