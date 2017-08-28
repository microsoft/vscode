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
	let pattern = path.join(workspaceRoot, '[Gg]runtfile.js');
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
			taskProvider = vscode.workspace.registerTaskProvider('grunt', {
				provideTasks: () => {
					if (!detectorPromise) {
						detectorPromise = getGruntTasks();
					}
					return detectorPromise;
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
		_channel = vscode.window.createOutputChannel('Grunt Auto Detection');
	}
	return _channel;
}

interface GruntTaskDefinition extends vscode.TaskDefinition {
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

async function getGruntTasks(): Promise<vscode.Task[]> {
	let workspaceRoot = vscode.workspace.rootPath;
	let emptyTasks: vscode.Task[] = [];
	if (!workspaceRoot) {
		return emptyTasks;
	}
	if (!await exists(path.join(workspaceRoot, 'gruntfile.js')) && !await exists(path.join(workspaceRoot, 'Gruntfile.js'))) {
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
	try {
		let { stdout, stderr } = await exec(commandLine, { cwd: workspaceRoot });
		if (stderr) {
			getOutputChannel().appendLine(stderr);
			getOutputChannel().show(true);
		}
		let result: vscode.Task[] = [];
		if (stdout) {
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
							let name = matches[1];
							let kind: GruntTaskDefinition = {
								type: 'grunt',
								task: name
							};
							let source = 'grunt';
							let task = name.indexOf(' ') === -1
								? new vscode.Task(kind, name, source, new vscode.ShellExecution(`${command} ${name}`))
								: new vscode.Task(kind, name, source, new vscode.ShellExecution(`${command} "${name}"`));
							result.push(task);
							let lowerCaseTaskName = name.toLowerCase();
							if (isBuildTask(lowerCaseTaskName)) {
								task.group = vscode.TaskGroup.Build;
							} else if (isTestTask(lowerCaseTaskName)) {
								task.group = vscode.TaskGroup.Test;
							}
						}
					}
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
		channel.appendLine(localize('execFailed', 'Auto detecting Grunt failed with error: {0}', err.error ? err.error.toString() : 'unknown'));
		channel.show(true);
		return emptyTasks;
	}
}