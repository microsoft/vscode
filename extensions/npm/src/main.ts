/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

type AutoDetect = 'on' | 'off';
let taskProvider: vscode.Disposable | undefined;

export function activate(_context: vscode.ExtensionContext): void {
	let workspaceRoot = vscode.workspace.rootPath;
	if (!workspaceRoot) {
		return;
	}

	function onConfigurationChanged() {
		let autoDetect = vscode.workspace.getConfiguration('npm').get<AutoDetect>('autoDetect');
		if (taskProvider && autoDetect === 'off') {
			taskProvider.dispose();
			taskProvider = undefined;
		} else if (!taskProvider && autoDetect === 'on') {
			taskProvider = vscode.workspace.registerTaskProvider('npm', {
				provideTasks: () => {
					return getNpmScriptsAsTasks();
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

async function exists(file: string): Promise<boolean> {
	return new Promise<boolean>((resolve, _reject) => {
		fs.exists(file, (value) => {
			resolve(value);
		});
	});
}

async function readFile(file: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		fs.readFile(file, (err, data) => {
			if (err) {
				reject(err);
			}
			resolve(data.toString());
		});
	});
}

interface NpmTaskDefinition extends vscode.TaskDefinition {
	script: string;
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
		if (name === testName) {
			return true;
		}
	}
	return false;
}

function getNpmCommandLine(script: string): string {
	if (vscode.workspace.getConfiguration('npm').get<boolean>('runSilent')) {
		return `npm --silent run ${script}`;
	}
	return `npm run ${script}`;
}

async function getNpmScriptsAsTasks(): Promise<vscode.Task[]> {
	let workspaceRoot = vscode.workspace.rootPath;

	let emptyTasks: vscode.Task[] = [];

	if (!workspaceRoot) {
		return emptyTasks;
	}

	let packageJson = path.join(workspaceRoot, 'package.json');
	if (!await exists(packageJson)) {
		return emptyTasks;
	}

	let silent = '';
	if (vscode.workspace.getConfiguration('npm').get<boolean>('runSilent')) {
		silent = '--silent';
	}

	try {
		var contents = await readFile(packageJson);
		var json = JSON.parse(contents);
		if (!json.scripts) {
			return Promise.resolve(emptyTasks);
		}

		const result: vscode.Task[] = [];
		Object.keys(json.scripts).forEach(each => {
			const kind: NpmTaskDefinition = {
				type: 'npm',
				script: each
			};
			const task = new vscode.Task(kind, `run ${each}`, 'npm', new vscode.ShellExecution(getNpmCommandLine(each)));
			const lowerCaseTaskName = each.toLowerCase();
			if (isBuildTask(lowerCaseTaskName)) {
				task.group = vscode.TaskGroup.Build;
			} else if (isTestTask(lowerCaseTaskName)) {
				task.group = vscode.TaskGroup.Test;
			}
			result.push(task);
		});
		// add some 'well known' npm tasks
		result.push(new vscode.Task({ type: 'npm', script: 'install' } as NpmTaskDefinition, `install`, 'npm', new vscode.ShellExecution(`npm install`), []));
		return Promise.resolve(result);
	} catch (e) {
		return Promise.resolve(emptyTasks);
	}
}