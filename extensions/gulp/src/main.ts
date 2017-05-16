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
			taskProvider = vscode.workspace.registerTaskProvider({
				provideTasks: () => {
					if (!gulpPromise) {
						gulpPromise = getGulpTasks();
					}
					return gulpPromise;
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
	let channel = vscode.window.createOutputChannel('tasks');
	try {
		let { stdout, stderr } = await exec(commandLine, { cwd: workspaceRoot });
		if (stderr) {
			channel.appendLine(stderr);
		}
		let result: vscode.Task[] = [];
		if (stdout) {
			let buildTask: { task: vscode.Task | undefined, rank: number } = { task: undefined, rank: 0 };
			let testTask: { task: vscode.Task | undefined, rank: number } = { task: undefined, rank: 0 };
			let lines = stdout.split(/\r{0,1}\n/);
			for (let line of lines) {
				if (line.length === 0) {
					continue;
				}
				let task = new vscode.ShellTask(`gulp: ${line}`, `${gulpCommand} ${line}`);
				task.identifier = `gulp.${line}`;
				result.push(task);
				let lowerCaseLine = line.toLowerCase();
				if (lowerCaseLine === 'build') {
					buildTask = { task, rank: 2 };
				} else if (lowerCaseLine.indexOf('build') !== -1 && buildTask.rank < 1) {
					buildTask = { task, rank: 1 };
				} else if (lowerCaseLine === 'test') {
					testTask = { task, rank: 2 };
				} else if (lowerCaseLine.indexOf('test') !== -1 && testTask.rank < 1) {
					testTask = { task, rank: 1 };
				}
			}
			if (buildTask.task) {
				buildTask.task.group = vscode.TaskGroup.Build;
			}
			if (testTask.task) {
				testTask.task.group = vscode.TaskGroup.Test;
			}
		}
		return result;
	} catch (err) {
		if (err.stderr) {
			channel.appendLine(err.stderr);
		}
		channel.appendLine(localize('execFailed', 'Auto detecting gulp failed with error: {0}', err.error ? err.error.toString() : 'unknown'));
		return emptyTasks;
	}
}