/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TaskDefinition, Task, TaskGroup, WorkspaceFolder, RelativePattern, ShellExecution, Uri, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as minimatch from 'minimatch';

export interface NpmTaskDefinition extends TaskDefinition {
	script: string;
	path?: string;
}

type AutoDetect = 'on' | 'off';

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

export function isWorkspaceFolder(value: any): value is WorkspaceFolder {
	return value && typeof value !== 'number';
}

export function getPackageManager(folder: WorkspaceFolder): string {
	return workspace.getConfiguration('npm', folder.uri).get<string>('packageManager', 'npm');
}

export async function provideNpmScripts(localize: any): Promise<Task[]> {
	let emptyTasks: Task[] = [];
	let allTasks: Task[] = [];

	let folders = workspace.workspaceFolders;
	if (!folders) {
		return emptyTasks;
	}
	try {
		for (let i = 0; i < folders.length; i++) {
			let folder = folders[i];
			if (isEnabled(folder)) {
				let relativePattern = new RelativePattern(folder, '**/package.json');
				let paths = await workspace.findFiles(relativePattern, '**/node_modules/**');
				for (let j = 0; j < paths.length; j++) {
					if (!isExcluded(folder, paths[j])) {
						let tasks = await provideNpmScriptsForFolder(localize, paths[j]);
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

function isEnabled(folder: WorkspaceFolder): boolean {
	return workspace.getConfiguration('npm', folder.uri).get<AutoDetect>('autoDetect') === 'on';
}

function isExcluded(folder: WorkspaceFolder, packageJsonUri: Uri) {
	function testForExclusionPattern(path: string, pattern: string): boolean {
		return minimatch(path, pattern, { dot: true });
	}

	let exclude = workspace.getConfiguration('npm', folder.uri).get<string | string[]>('exclude');

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

async function provideNpmScriptsForFolder(localize: any, packageJsonUri: Uri): Promise<Task[]> {
	let emptyTasks: Task[] = [];

	let folder = workspace.getWorkspaceFolder(packageJsonUri);
	if (!folder) {
		return emptyTasks;
	}
	let scripts = await getScripts(packageJsonUri, localize);
	if (!scripts) {
		return emptyTasks;
	}

	const result: Task[] = [];
	Object.keys(scripts).filter(isNotPreOrPostScript).forEach(each => {
		const task = createTask(each, `run ${each}`, folder!, packageJsonUri);
		const lowerCaseTaskName = each.toLowerCase();
		if (isBuildTask(lowerCaseTaskName)) {
			task.group = TaskGroup.Build;
		} else if (isTestTask(lowerCaseTaskName)) {
			task.group = TaskGroup.Test;
		}
		result.push(task);
	});
	// always add npm install (without a problem matcher)
	// result.push(createTask('install', 'install', rootPath, folder, []));
	return result;
}

function createTask(script: string, cmd: string, folder: WorkspaceFolder, packageJsonUri: Uri, matcher?: any): Task {

	function getTaskName(script: string, file: string) {
		if (file.length) {
			return `${script} - ${file.substring(0, file.length - 1)}`;
		}
		return script;
	}

	function getCommandLine(folder: WorkspaceFolder, cmd: string): string {
		let packageManager = getPackageManager(folder);
		if (workspace.getConfiguration('npm', folder.uri).get<boolean>('runSilent')) {
			return `${packageManager} --silent ${cmd}`;
		}
		return `${packageManager} ${cmd}`;
	}

	function getRelativePath(folder: WorkspaceFolder, packageJsonUri: Uri): string {
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
	return new Task(kind, folder, taskName, 'npm', new ShellExecution(getCommandLine(folder, cmd), { cwd: cwd }), matcher);
}


export function getPackageJsonUriFromTask(task: Task): Uri | null {
	if (isWorkspaceFolder(task.scope)) {
		if (task.definition.path) {
			return Uri.file(path.join(task.scope.uri.fsPath, task.definition.path, 'package.json'));
		} else {
			return Uri.file(path.join(task.scope.uri.fsPath, 'package.json'));
		}
	}
	return null;
}

export async function exists(file: string): Promise<boolean> {
	return new Promise<boolean>((resolve, _reject) => {
		fs.exists(file, (value) => {
			resolve(value);
		});
	});
}

export async function readFile(file: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		fs.readFile(file, (err, data) => {
			if (err) {
				reject(err);
			}
			resolve(data.toString());
		});
	});
}

export async function getScripts(packageJsonUri: Uri, localize: any): Promise<any> {

	if (packageJsonUri.scheme !== 'file') {
		return null;
	}

	let packageJson = packageJsonUri.fsPath;
	if (!await exists(packageJson)) {
		return null;
	}

	try {
		var contents = await readFile(packageJson);
		var json = JSON.parse(contents);
		return json.scripts;
	} catch (e) {
		let localizedParseError = localize('npm.parseError', 'Npm task detection: failed to parse the file {0}', packageJsonUri);
		throw new Error(localizedParseError);
	}
}
