/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import * as fs from 'fs';
import * as httpRequest from 'request-light';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import { addJSONProviders } from './features/jsonContributions';

type AutoDetect = 'on' | 'off';
let taskProvider: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext): void {
	if (!vscode.workspace.workspaceFolders) {
		return;
	}

	taskProvider = vscode.workspace.registerTaskProvider('npm', {
		provideTasks: () => {
			return provideNpmScripts();
		},
		resolveTask(_task: vscode.Task): vscode.Task | undefined {
			return undefined;
		}
	});
	configureHttpRequest();
	vscode.workspace.onDidChangeConfiguration(() => configureHttpRequest());

	context.subscriptions.push(addJSONProviders(httpRequest.xhr));
}

function configureHttpRequest() {
	const httpSettings = vscode.workspace.getConfiguration('http');
	httpRequest.configure(httpSettings.get<string>('proxy', ''), httpSettings.get<boolean>('proxyStrictSSL', true));
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

function isNotPreOrPostScript(script: string): boolean {
	return !(script.startsWith('pre') || script.startsWith('post'));
}

async function provideNpmScripts(): Promise<vscode.Task[]> {
	let emptyTasks: vscode.Task[] = [];
	let allTasks: vscode.Task[] = [];
	let folders = vscode.workspace.workspaceFolders;

	if (!folders) {
		return emptyTasks;
	}
	try {
		for (let i = 0; i < folders.length; i++) {
			if (isEnabled(folders[i])) {
				let tasks = await provideNpmScriptsForFolder(folders[i]);
				allTasks.push(...tasks);
			}
		}
		return allTasks;
	} catch (error) {
		return Promise.reject(error);
	}
}

function isEnabled(folder: vscode.WorkspaceFolder): boolean {
	return vscode.workspace.getConfiguration('npm', folder.uri).get<AutoDetect>('autoDetect') === 'on';
}

async function provideNpmScriptsForFolder(folder: vscode.WorkspaceFolder): Promise<vscode.Task[]> {
	let emptyTasks: vscode.Task[] = [];

	if (folder.uri.scheme !== 'file') {
		return emptyTasks;
	}
	let rootPath = folder.uri.fsPath;

	let packageJson = path.join(rootPath, 'package.json');
	if (!await exists(packageJson)) {
		return emptyTasks;
	}

	try {
		var contents = await readFile(packageJson);
		var json = JSON.parse(contents);
		if (!json.scripts) {
			return emptyTasks;
		}

		const result: vscode.Task[] = [];
		Object.keys(json.scripts).filter(isNotPreOrPostScript).forEach(each => {
			const task = createTask(each, `run ${each}`, rootPath, folder);
			const lowerCaseTaskName = each.toLowerCase();
			if (isBuildTask(lowerCaseTaskName)) {
				task.group = vscode.TaskGroup.Build;
			} else if (isTestTask(lowerCaseTaskName)) {
				task.group = vscode.TaskGroup.Test;
			}
			result.push(task);
		});
		// always add npm install (without a problem matcher)
		// result.push(createTask('install', 'install', rootPath, folder, []));
		return result;
	} catch (e) {
		let localizedParseError = localize('npm.parseError', 'Npm task detection: failed to parse the file {0}', packageJson);
		throw new Error(localizedParseError);
	}
}

function createTask(script: string, cmd: string, rootPath: string, folder: vscode.WorkspaceFolder, matcher?: any): vscode.Task {

	function getTaskName(script: string) {
		return script;
	}

	function getCommandLine(folder: vscode.WorkspaceFolder, cmd: string): string {
		let packageManager = vscode.workspace.getConfiguration('npm', folder.uri).get<string>('packageManager', 'npm');
		if (vscode.workspace.getConfiguration('npm', folder.uri).get<boolean>('runSilent')) {
			return `${packageManager} --silent ${cmd}`;
		}
		return `${packageManager} ${cmd}`;
	}

	let kind: NpmTaskDefinition = {
		type: 'npm',
		script: script
	};
	let taskName = getTaskName(script);
	return new vscode.Task(kind, folder, taskName, 'npm', new vscode.ShellExecution(getCommandLine(folder, cmd), { cwd: rootPath }), matcher);
}
