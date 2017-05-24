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
			taskProvider = vscode.workspace.registerTaskProvider({
				provideTasks: () => {
					return getNpmScriptsAsTasks();
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

	try {
		var contents = await readFile(packageJson);
		var json = JSON.parse(contents);
		if (!json.scripts) {
			return Promise.resolve(emptyTasks);
		}

		const result: vscode.Task[] = [];
		Object.keys(json.scripts).forEach(each => {
			const task = new vscode.ShellTask(`npm: run ${each}`, `npm run ${each}`);
			const lowerCaseTaskName = each.toLowerCase();
			if (lowerCaseTaskName === 'build') {
				task.group = vscode.TaskGroup.Build;
			} else if (lowerCaseTaskName === 'test') {
				task.group = vscode.TaskGroup.Test;
			}
			result.push(task);
		});
		return Promise.resolve(result);
	} catch (e) {
		return Promise.resolve(emptyTasks);
	}
}