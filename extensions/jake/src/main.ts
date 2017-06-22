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
	let pattern = path.join(workspaceRoot, '{Jakefile,Jakefile.js}');
	let jakePromise: Thenable<vscode.Task[]> | undefined = undefined;
	let fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
	fileWatcher.onDidChange(() => jakePromise = undefined);
	fileWatcher.onDidCreate(() => jakePromise = undefined);
	fileWatcher.onDidDelete(() => jakePromise = undefined);

	function onConfigurationChanged() {
		let autoDetect = vscode.workspace.getConfiguration('jake').get<AutoDetect>('autoDetect');
		if (taskProvider && autoDetect === 'off') {
			jakePromise = undefined;
			taskProvider.dispose();
			taskProvider = undefined;
		} else if (!taskProvider && autoDetect === 'on') {
			taskProvider = vscode.workspace.registerTaskProvider('jake', {
				provideTasks: () => {
					if (!jakePromise) {
						jakePromise = getJakeTasks();
					}
					return jakePromise;
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
		_channel = vscode.window.createOutputChannel('Jake Auto Detection');
	}
	return _channel;
}

interface JakeTaskKind extends vscode.TaskKind {
	task: string;
	file?: string;
}

async function getJakeTasks(): Promise<vscode.Task[]> {
	let workspaceRoot = vscode.workspace.rootPath;
	let emptyTasks: vscode.Task[] = [];
	if (!workspaceRoot) {
		return emptyTasks;
	}
	let jakefile = path.join(workspaceRoot, 'Jakefile');
	if (!await exists(jakefile)) {
		jakefile = path.join(workspaceRoot, 'Jakefile.js');
		if (! await exists(jakefile)) {
			return emptyTasks;
		}
	}

	let jakeCommand: string;
	let platform = process.platform;
	if (platform === 'win32' && await exists(path.join(workspaceRoot!, 'node_modules', '.bin', 'jake.cmd'))) {
		jakeCommand = path.join('.', 'node_modules', '.bin', 'jake.cmd');
	} else if ((platform === 'linux' || platform === 'darwin') && await exists(path.join(workspaceRoot!, 'node_modules', '.bin', 'jake'))) {
		jakeCommand = path.join('.', 'node_modules', '.bin', 'jake');
	} else {
		jakeCommand = 'jake';
	}

	let commandLine = `${jakeCommand} --tasks`;
	try {
		let { stdout, stderr } = await exec(commandLine, { cwd: workspaceRoot });
		if (stderr) {
			getOutputChannel().appendLine(stderr);
			getOutputChannel().show(true);
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
				let regExp = /^jake\s+([^\s]+)\s/g;
				let matches = regExp.exec(line);
				if (matches && matches.length === 2) {
					let taskName = matches[1];
					let kind: JakeTaskKind = {
						type: 'jake',
						task: taskName
					};
					let task = new vscode.Task(kind, taskName, new vscode.ShellExecution(`${jakeCommand} ${taskName}`));
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
		let channel = getOutputChannel();
		if (err.stderr) {
			channel.appendLine(err.stderr);
		}
		if (err.stdout) {
			channel.appendLine(err.stdout);
		}
		channel.appendLine(localize('execFailed', 'Auto detecting Jake failed with error: {0}', err.error ? err.error.toString() : 'unknown'));
		channel.show(true);
		return emptyTasks;
	}
}