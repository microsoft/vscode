/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

const localize = nls.config(process.env.VSCODE_NLS_CONFIG)();

type AutoDetect = 'on' | 'off';
let taskProvider: vscode.Disposable | undefined;

export function activate(_context: vscode.ExtensionContext): void {
	let workspaceRoot = vscode.workspace.rootPath;
	if (!workspaceRoot) {
		return;
	}
	let pattern = path.join(workspaceRoot, 'gulpfile{.babel.js,.js}');
	let gulpPromise: Thenable<vscode.Task[]> | undefined = undefined;
	let fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
	fileWatcher.onDidChange(() => gulpPromise = undefined);
	fileWatcher.onDidCreate(() => gulpPromise = undefined);
	fileWatcher.onDidDelete(() => gulpPromise = undefined);

	function onConfigurationChanged() {
		let autoDetect = vscode.workspace.getConfiguration('gulp').get<AutoDetect>('autoDetect');
		if (taskProvider && autoDetect === 'off') {
			gulpPromise = undefined;
			taskProvider.dispose();
			taskProvider = undefined;
		} else if (!taskProvider && autoDetect === 'on') {
			taskProvider = vscode.workspace.registerTaskProvider('gulp', {
				provideTasks: () => {
					if (!gulpPromise) {
						gulpPromise = getGulpTasks();
					}
					return gulpPromise;
				},
				resolveTask(_task: vscode.Task): vscode.Task | undefined {
					return undefined;
				}
			});
		}
	}
	vscode.workspace.onDidChangeConfiguration(onConfigurationChanged);
	onConfigurationChanged();
}

export function deactivate(): void {
	if (taskProvider) {
		taskProvider.dispose();
	}
}

function exists(file: string): Promise<boolean> {
	return new Promise<boolean>((resolve, _reject) => {
		fs.exists(file, (value) => {
			resolve(value);
		});
	});
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

let _channel: vscode.OutputChannel;
function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel('Gulp Auto Detection');
	}
	return _channel;
}

interface GulpTaskDefinition extends vscode.TaskDefinition {
	task: string;
	file?: string;
}

const buildNames: string[] = ['build', 'compile', 'watch'];
function isBuildTask(name: string): boolean {
	for (let buildName of buildNames) {
		if (name.indexOf(buildName) !== -1) {
			return true;
		}
	}
	return false;
}

const testNames: string[] = ['test'];
function isTestTask(name: string): boolean {
	for (let testName of testNames) {
		if (name.indexOf(testName) !== -1) {
			return true;
		}
	}
	return false;
}

async function getGulpTasks(): Promise<vscode.Task[]> {
	let workspaceRoot = vscode.workspace.rootPath;
	let emptyTasks: vscode.Task[] = [];
	if (!workspaceRoot) {
		return emptyTasks;
	}
	let gulpfile = path.join(workspaceRoot, 'gulpfile.js');
	if (!await exists(gulpfile)) {
		gulpfile = path.join(workspaceRoot, 'gulpfile.babel.js');
		if (! await exists(gulpfile)) {
			return emptyTasks;
		}
	}

	let gulpCommand: string;
	let platform = process.platform;
	if (platform === 'win32' && await exists(path.join(workspaceRoot!, 'node_modules', '.bin', 'gulp.cmd'))) {
		gulpCommand = path.join('.', 'node_modules', '.bin', 'gulp.cmd');
	} else if ((platform === 'linux' || platform === 'darwin') && await exists(path.join(workspaceRoot!, 'node_modules', '.bin', 'gulp'))) {
		gulpCommand = path.join('.', 'node_modules', '.bin', 'gulp');
	} else {
		gulpCommand = 'gulp';
	}

	let commandLine = `${gulpCommand} --tasks-simple --no-color`;
	try {
		let { stdout, stderr } = await exec(commandLine, { cwd: workspaceRoot });
		if (stderr && stderr.length > 0) {
			getOutputChannel().appendLine(stderr);
			getOutputChannel().show(true);
		}
		let result: vscode.Task[] = [];
		if (stdout) {
			let lines = stdout.split(/\r{0,1}\n/);
			for (let line of lines) {
				if (line.length === 0) {
					continue;
				}
				let kind: GulpTaskDefinition = {
					type: 'gulp',
					task: line
				};
				let task = new vscode.Task(kind, line, 'gulp', new vscode.ShellExecution(`${gulpCommand} ${line}`));
				result.push(task);
				let lowerCaseLine = line.toLowerCase();
				if (isBuildTask(lowerCaseLine)) {
					task.group = vscode.TaskGroup.Build;
				} else if (isTestTask(lowerCaseLine)) {
					task.group = vscode.TaskGroup.Test;
				}
			}
		}
		return result;
	} catch (err) {
		let channel = getOutputChannel();
		if (err.stderr) {
			channel.appendLine(err.stderr);
		}
		if (err.stdout) {
			channel.appendLine(err.stdout);
		}
		channel.appendLine(localize('execFailed', 'Auto detecting gulp failed with error: {0}', err.error ? err.error.toString() : 'unknown'));
		channel.show(true);
		return emptyTasks;
	}
}