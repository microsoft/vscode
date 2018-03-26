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
import * as minimatch from 'minimatch';

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
	path?: string;
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
			let folder = folders[i];
			if (isEnabled(folder)) {
				let relativePattern = new vscode.RelativePattern(folder, '**/package.json');
				let paths = await vscode.workspace.findFiles(relativePattern, '**/node_modules/**');
				for (let j = 0; j < paths.length; j++) {
					if (!isExcluded(folder, paths[j])) {
						let tasks = await provideNpmScriptsForFolder(paths[j]);
						allTasks.push(...tasks);
					}
				}
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

function isExcluded(folder: vscode.WorkspaceFolder, packageJsonUri: vscode.Uri) {
	function testForExclusionPattern(path: string, pattern: string): boolean {
		return minimatch(path, pattern, { dot: true });
	}

	let exclude = vscode.workspace.getConfiguration('npm', folder.uri).get<string | string[]>('exclude');

	if (exclude) {
		if (Array.isArray(exclude)) {
			for (let pattern of exclude) {
				if (testForExclusionPattern(packageJsonUri.fsPath, pattern)) {
					return true;
				}
			}
		} else if (testForExclusionPattern(packageJsonUri.fsPath, exclude)) {
			return true;
		}
	}
	return false;
}

async function provideNpmScriptsForFolder(packageJsonUri: vscode.Uri): Promise<vscode.Task[]> {
	let emptyTasks: vscode.Task[] = [];

	if (packageJsonUri.scheme !== 'file') {
		return emptyTasks;
	}

	let packageJson = packageJsonUri.fsPath;

	if (!await exists(packageJson)) {
		return emptyTasks;
	}

	let folder = vscode.workspace.getWorkspaceFolder(packageJsonUri);
	if (!folder) {
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
			const task = createTask(each, `run ${each}`, folder!, packageJsonUri);
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
		let localizedParseError = localize('npm.parseError', 'Npm task detection: failed to parse the file {0}', packageJsonUri);
		throw new Error(localizedParseError);
	}
}

function createTask(script: string, cmd: string, folder: vscode.WorkspaceFolder, packageJsonUri: vscode.Uri, matcher?: any): vscode.Task {

	function getTaskName(script: string, file: string) {
		if (file.length) {
			return `${script} - ${file.substring(0, file.length - 1)}`;
		}
		return script;
	}

	function getCommandLine(folder: vscode.WorkspaceFolder, cmd: string): string {
		let packageManager = vscode.workspace.getConfiguration('npm', folder.uri).get<string>('packageManager', 'npm');
		if (vscode.workspace.getConfiguration('npm', folder.uri).get<boolean>('runSilent')) {
			return `${packageManager} --silent ${cmd}`;
		}
		return `${packageManager} ${cmd}`;
	}

	function getRelativePath(folder: vscode.WorkspaceFolder, packageJsonUri: vscode.Uri): string {
		let rootUri = folder.uri;
		let absolutePath = packageJsonUri.path.substring(0, packageJsonUri.path.length - 'package.json'.length);
		return absolutePath.substring(rootUri.path.length + 1);
	}

	let kind: NpmTaskDefinition = {
		type: 'npm',
		script: script
	};
	let relativePackageJson = getRelativePath(folder, packageJsonUri);
	if (relativePackageJson.length) {
		kind.path = getRelativePath(folder, packageJsonUri);
	}
	let taskName = getTaskName(script, relativePackageJson);
	let cwd = path.dirname(packageJsonUri.fsPath);
	return new vscode.Task(kind, folder, taskName, 'npm', new vscode.ShellExecution(getCommandLine(folder, cmd), { cwd: cwd }), matcher);
}
