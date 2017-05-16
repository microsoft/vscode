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
	let pattern = path.join(workspaceRoot, 'Gruntfile.js');
	let detectorPromise: Thenable<vscode.Task[]> | undefined = undefined;
	let fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
	fileWatcher.onDidChange(() => detectorPromise = undefined);
	fileWatcher.onDidCreate(() => detectorPromise = undefined);
	fileWatcher.onDidDelete(() => detectorPromise = undefined);

	function onConfigurationChanged() {
		let autoDetect = vscode.workspace.getConfiguration('grunt').get<AutoDetect>('autoDetect');
		if (taskProvider && autoDetect === 'off') {
			detectorPromise = undefined;
			taskProvider.dispose();
			taskProvider = undefined;
		} else if (!taskProvider && autoDetect === 'on') {
			taskProvider = vscode.workspace.registerTaskProvider({
				provideTasks: () => {
					if (!detectorPromise) {
						detectorPromise = getGruntTasks();
					}
					return detectorPromise;
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

async function getGruntTasks(): Promise<vscode.Task[]> {
	let workspaceRoot = vscode.workspace.rootPath;
	let emptyTasks: vscode.Task[] = [];
	if (!workspaceRoot) {
		return emptyTasks;
	}
	let gruntfile = path.join(workspaceRoot, 'Gruntfile.js');
	if (!await exists(gruntfile)) {
		return emptyTasks;
	}

	let command: string;
	let platform = process.platform;
	if (platform === 'win32' && await exists(path.join(workspaceRoot!, 'node_modules', '.bin', 'grunt.cmd'))) {
		command = path.join('.', 'node_modules', '.bin', 'grunt.cmd');
	} else if ((platform === 'linux' || platform === 'darwin') && await exists(path.join(workspaceRoot!, 'node_modules', '.bin', 'grunt'))) {
		command = path.join('.', 'node_modules', '.bin', 'grunt');
	} else {
		command = 'grunt';
	}

	let commandLine = `${command} --help --no-color`;
	let channel = vscode.window.createOutputChannel('tasks');
	try {
		let { stdout, stderr } = await exec(commandLine, { cwd: workspaceRoot });
		if (stderr) {
			channel.appendLine(stderr);
			channel.show(true);
		}
		let result: vscode.Task[] = [];
		if (stdout) {
			let buildTask: { task: vscode.Task | undefined, rank: number } = { task: undefined, rank: 0 };
			let testTask: { task: vscode.Task | undefined, rank: number } = { task: undefined, rank: 0 };

			// grunt lists tasks as follows (description is wrapped into a new line if too long):
			// ...
			// Available tasks
			//         uglify  Minify files with UglifyJS. *
			//         jshint  Validate files with JSHint. *
			//           test  Alias for "jshint", "qunit" tasks.
			//        default  Alias for "jshint", "qunit", "concat", "uglify" tasks.
			//           long  Alias for "eslint", "qunit", "browserify", "sass",
			//                 "autoprefixer", "uglify", tasks.
			//
			// Tasks run in the order specified

			let lines = stdout.split(/\r{0,1}\n/);
			let tasksStart = false;
			let tasksEnd = false;
			for (let line of lines) {
				if (line.length === 0) {
					continue;
				}
				if (!tasksStart && !tasksEnd) {
					if (line.indexOf('Available tasks') === 0) {
						tasksStart = true;
					}
				} else if (tasksStart && !tasksEnd) {
					if (line.indexOf('Tasks run in the order specified') === 0) {
						tasksEnd = true;
					} else {
						let regExp = /^\s*(\S.*\S)  \S/g;
						let matches = regExp.exec(line);
						if (matches && matches.length === 2) {
							let taskName = matches[1];
							let task = taskName.indexOf(' ') === -1
								? new vscode.ShellTask(`grunt: ${taskName}`, `${command} ${taskName}`)
								: new vscode.ShellTask(`grunt: ${taskName}`, `${command} "${taskName}"`);
							task.identifier = `grunt.${taskName}`;
							result.push(task);
							let lowerCaseTaskName = taskName.toLowerCase();
							if (lowerCaseTaskName === 'build') {
								buildTask = { task, rank: 2 };
							} else if (lowerCaseTaskName.indexOf('build') !== -1 && buildTask.rank < 1) {
								buildTask = { task, rank: 1 };
							} else if (lowerCaseTaskName === 'test') {
								testTask = { task, rank: 2 };
							} else if (lowerCaseTaskName.indexOf('test') !== -1 && testTask.rank < 1) {
								testTask = { task, rank: 1 };
							}
						}
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
		if (err.stderr) {
			channel.appendLine(err.stderr);
			channel.show(true);
		}
		channel.appendLine(localize('execFailed', 'Auto detecting Grunt failed with error: {0}', err.error ? err.error.toString() : 'unknown'));
		return emptyTasks;
	}
}