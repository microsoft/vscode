/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TaskDefinition, Task, TaskGroup, WorkspaceFolder, RelativePattern, ShellExecution, Uri, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as minimatch from 'minimatch';
import * as nls from 'vscode-nls';
import { JSONVisitor, visit, ParseErrorCode } from 'jsonc-parser/lib/main';

const localize = nls.loadMessageBundle();

export interface NpmTaskDefinition extends TaskDefinition {
	script: string;
	path?: string;
}

type AutoDetect = 'on' | 'off';

let cachedTasks: Task[] | undefined = undefined;

export function invalidateScriptsCache() {
	cachedTasks = undefined;
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

function getPrePostScripts(scripts: any): Set<string> {
	const prePostScripts: Set<string> = new Set([
		'preuninstall', 'postuninstall', 'prepack', 'postpack', 'preinstall', 'postinstall',
		'prepack', 'postpack', 'prepublish', 'postpublish', 'preversion', 'postversion',
		'prestop', 'poststop', 'prerestart', 'postrestart', 'preshrinkwrap', 'postshrinkwrap',
		'pretest', 'postest', 'prepublishOnly'
	]);
	let keys = Object.keys(scripts);
	for (let i = 0; i < keys.length; i++) {
		const script = keys[i];
		const prepost = ['pre' + script, 'post' + script];
		prepost.forEach(each => {
			if (scripts[each]) {
				prePostScripts.add(each);
			}
		});
	}
	return prePostScripts;
}

export function isWorkspaceFolder(value: any): value is WorkspaceFolder {
	return value && typeof value !== 'number';
}

export function getPackageManager(folder: WorkspaceFolder): string {
	return workspace.getConfiguration('npm', folder.uri).get<string>('packageManager', 'npm');
}

export async function hasNpmScripts(): Promise<boolean> {
	let folders = workspace.workspaceFolders;
	if (!folders) {
		return false;
	}
	try {
		for (let i = 0; i < folders.length; i++) {
			let folder = folders[i];
			if (isAutoDetectionEnabled(folder)) {
				let relativePattern = new RelativePattern(folder, '**/package.json');
				let paths = await workspace.findFiles(relativePattern, '**/node_modules/**');
				if (paths.length > 0) {
					return true;
				}
			}
		}
		return false;
	} catch (error) {
		return Promise.reject(error);
	}
}

async function detectNpmScripts(): Promise<Task[]> {

	let emptyTasks: Task[] = [];
	let allTasks: Task[] = [];

	let folders = workspace.workspaceFolders;
	if (!folders) {
		return emptyTasks;
	}
	try {
		for (let i = 0; i < folders.length; i++) {
			let folder = folders[i];
			if (isAutoDetectionEnabled(folder)) {
				let relativePattern = new RelativePattern(folder, '**/package.json');
				let paths = await workspace.findFiles(relativePattern, '**/node_modules/**');
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

export async function provideNpmScripts(): Promise<Task[]> {
	if (!cachedTasks) {
		cachedTasks = await detectNpmScripts();
	}
	return cachedTasks;
}

function isAutoDetectionEnabled(folder: WorkspaceFolder): boolean {
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

async function provideNpmScriptsForFolder(packageJsonUri: Uri): Promise<Task[]> {
	let emptyTasks: Task[] = [];

	let folder = workspace.getWorkspaceFolder(packageJsonUri);
	if (!folder) {
		return emptyTasks;
	}
	let scripts = await getScripts(packageJsonUri);
	if (!scripts) {
		return emptyTasks;
	}

	const result: Task[] = [];

	const filterPrePost = workspace.getConfiguration('npm', folder.uri).get<boolean>('filterPrePostScripts');
	const prePostScripts = filterPrePost ? getPrePostScripts(scripts) : new Set<String>();
	Object.keys(scripts).filter(each => !prePostScripts.has(each)).forEach(each => {
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
	result.push(createTask('install', 'install', folder, packageJsonUri, []));
	return result;
}

export function getTaskName(script: string, relativePath: string | undefined) {
	if (relativePath && relativePath.length) {
		return `${script} - ${relativePath.substring(0, relativePath.length - 1)}`;
	}
	return script;
}

function createTask(script: string, cmd: string, folder: WorkspaceFolder, packageJsonUri: Uri, matcher?: any): Task {

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

export type StringMap = { [s: string]: string; };

async function findAllScripts(buffer: string): Promise<StringMap> {
	var scripts: StringMap = {};
	let script: string | undefined = undefined;
	let inScripts = false;

	let visitor: JSONVisitor = {
		onError(_error: ParseErrorCode, _offset: number, _length: number) {
			// TODO: inform user about the parse error
		},
		onObjectEnd() {
			if (inScripts) {
				inScripts = false;
			}
		},
		onLiteralValue(value: any, _offset: number, _length: number) {
			if (script) {
				scripts[script] = value;
				script = undefined;
			}
		},
		onObjectProperty(property: string, _offset: number, _length: number) {
			if (property === 'scripts') {
				inScripts = true;
			}
			else if (inScripts) {
				script = property;
			}
		}
	};
	visit(buffer, visitor);
	return scripts;
}

export async function getScripts(packageJsonUri: Uri): Promise<StringMap | undefined> {

	if (packageJsonUri.scheme !== 'file') {
		return undefined;
	}

	let packageJson = packageJsonUri.fsPath;
	if (!await exists(packageJson)) {
		return undefined;
	}

	try {
		var contents = await readFile(packageJson);
		var json = findAllScripts(contents);//JSON.parse(contents);
		return json;
	} catch (e) {
		let localizedParseError = localize('npm.parseError', 'Npm task detection: failed to parse the file {0}', packageJsonUri.fsPath);
		throw new Error(localizedParseError);
	}
}
