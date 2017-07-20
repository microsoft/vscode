/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//tslint:disable
'use strict';

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

type AutoDetect = 'on' | 'off';
let taskProvider: vscode.Disposable | undefined;

export function activate(_context: vscode.ExtensionContext): void {
	if (!vscode.workspace.workspaceFolders) {
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
					return provideNpmScripts();
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

	let folderPaths = folders.map(each => each.uri.fsPath);
	let shortPaths = shorten(folderPaths);

	const isSingleRoot = allTasks.length === 1;

	for (let i = 0; i < folders.length; i++) {
		let tasks = await provideNpmScriptsForFolder(folders[i], shortPaths[i], isSingleRoot);
		allTasks.push(...tasks);
	}
	return allTasks;
}

async function provideNpmScriptsForFolder(folder: vscode.WorkspaceFolder, shortPath: string, singleRoot: boolean): Promise<vscode.Task[]> {
	let rootPath = folder.uri.fsPath;
	let emptyTasks: vscode.Task[] = [];

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
			const task = createTask(each, `run ${each}`, rootPath, shortPath, singleRoot);
			const lowerCaseTaskName = each.toLowerCase();
			if (isBuildTask(lowerCaseTaskName)) {
				task.group = vscode.TaskGroup.Build;
			} else if (isTestTask(lowerCaseTaskName)) {
				task.group = vscode.TaskGroup.Test;
			}
			result.push(task);
		});
		// always add npm install (without a problem matcher)
		result.push(createTask('install', 'install', rootPath, shortPath, singleRoot, []));
		return result;
	} catch (e) {
		return emptyTasks;
	}
}

function createTask(script: string, cmd: string, rootPath: string, shortPath: string, singleRoot: boolean, matcher?: any): vscode.Task {

	function getTaskName(script: string, shortPath: string, singleRoot: boolean) {
		if (singleRoot) {
			return script;
		}
		return `${script} - ${shortPath}`;
	}

	function getNpmCommandLine(cmd: string): string {
		if (vscode.workspace.getConfiguration('npm').get<boolean>('runSilent')) {
			return `npm --silent ${cmd}`;
		}
		return `npm ${cmd}`;
	}

	let kind: NpmTaskDefinition = {
		type: 'npm',
		script: script,
		path: rootPath
	};
	let taskName = getTaskName(script, shortPath, singleRoot);

	return new vscode.Task(kind, taskName, 'npm', new vscode.ShellExecution(getNpmCommandLine(cmd), { cwd: rootPath }), matcher);
}

// tslint:disable:no-unused-variable

// TODO code to shorten paths - this should be available as a utility module/API

// copied from base/platform.ts

// --- THIS FILE IS TEMPORARY UNTIL ENV.TS IS CLEANED UP. IT CAN SAFELY BE USED IN ALL TARGET EXECUTION ENVIRONMENTS (node & dom) ---

let _isWindows = false;
let _isMacintosh = false;
let _isLinux = false;
let _isRootUser = false;
let _isNative = false;
let _isWeb = false;
let _locale: string = '';
let _language: string = '';

interface NLSConfig {
	locale: string;
	availableLanguages: { [key: string]: string; };
}

export interface IProcessEnvironment {
	[key: string]: string;
}

interface INodeProcess {
	platform: string;
	env: IProcessEnvironment;
	getuid(): number;
}
declare let process: INodeProcess;
declare let global: any;

interface INavigator {
	userAgent: string;
	language: string;
}
declare let navigator: INavigator;
declare let self: any;

export const LANGUAGE_DEFAULT = 'en';

// OS detection
if (typeof process === 'object') {
	_isWindows = (process.platform === 'win32');
	_isMacintosh = (process.platform === 'darwin');
	_isLinux = (process.platform === 'linux');
	_isRootUser = !_isWindows && (process.getuid() === 0);
	let rawNlsConfig = process.env['VSCODE_NLS_CONFIG'];
	if (rawNlsConfig) {
		try {
			let nlsConfig: NLSConfig = JSON.parse(rawNlsConfig);
			let resolved = nlsConfig.availableLanguages['*'];
			_locale = nlsConfig.locale;
			// VSCode's default language is 'en'
			_language = resolved ? resolved : LANGUAGE_DEFAULT;
		} catch (e) {
		}
	}
	_isNative = true;
} else if (typeof navigator === 'object') {
	let userAgent = navigator.userAgent;
	_isWindows = userAgent.indexOf('Windows') >= 0;
	_isMacintosh = userAgent.indexOf('Macintosh') >= 0;
	_isLinux = userAgent.indexOf('Linux') >= 0;
	_isWeb = true;
	_locale = navigator.language;
	_language = _locale;
}

export enum Platform {
	Web,
	Mac,
	Linux,
	Windows
}

let _platform: Platform = Platform.Web;
if (_isNative) {
	if (_isMacintosh) {
		_platform = Platform.Mac;
	} else if (_isWindows) {
		_platform = Platform.Windows;
	} else if (_isLinux) {
		_platform = Platform.Linux;
	}
}

export const isWindows = _isWindows;
export const isMacintosh = _isMacintosh;
export const isLinux = _isLinux;
export const isRootUser = _isRootUser;
export const isNative = _isNative;
export const isWeb = _isWeb;
export const platform = _platform;

/**
 * The language used for the user interface. The format of
 * the string is all lower case (e.g. zh-tw for Traditional
 * Chinese)
 */
export const language = _language;

/**
 * The OS locale or the locale specified by --locale. The format of
 * the string is all lower case (e.g. zh-tw for Traditional
 * Chinese). The UI is not necessarily shown in the provided locale.
 */
export const locale = _locale;

export interface TimeoutToken {
}

export interface IntervalToken {
}

interface IGlobals {
	Worker?: any;
	setTimeout(callback: (...args: any[]) => void, delay: number, ...args: any[]): TimeoutToken;
	clearTimeout(token: TimeoutToken): void;

	setInterval(callback: (...args: any[]) => void, delay: number, ...args: any[]): IntervalToken;
	clearInterval(token: IntervalToken): void;
}

const _globals = <IGlobals>(typeof self === 'object' ? self : global);
export const globals: any = _globals;

export function hasWebWorkerSupport(): boolean {
	return typeof _globals.Worker !== 'undefined';
}
export const setTimeout = _globals.setTimeout.bind(_globals);
export const clearTimeout = _globals.clearTimeout.bind(_globals);

export const setInterval = _globals.setInterval.bind(_globals);
export const clearInterval = _globals.clearInterval.bind(_globals);

export const enum OperatingSystem {
	Windows = 1,
	Macintosh = 2,
	Linux = 3
}
export const OS = (_isMacintosh ? OperatingSystem.Macintosh : (_isWindows ? OperatingSystem.Windows : OperatingSystem.Linux));

export const enum AccessibilitySupport {
	/**
	 * This should be the browser case where it is not known if a screen reader is attached or no.
	 */
	Unknown = 0,

	Disabled = 1,

	Enabled = 2
}

// copied from vscode/src/base/common/label.ts

const nativeSep = isWindows ? '\\' : '/';

/**
 * Shortens the paths but keeps them easy to distinguish.
 * Replaces not important parts with ellipsis.
 * Every shorten path matches only one original path and vice versa.
 *
 * Algorithm for shortening paths is as follows:
 * 1. For every path in list, find unique substring of that path.
 * 2. Unique substring along with ellipsis is shortened path of that path.
 * 3. To find unique substring of path, consider every segment of length from 1 to path.length of path from end of string
 *    and if present segment is not substring to any other paths then present segment is unique path,
 *    else check if it is not present as suffix of any other path and present segment is suffix of path itself,
 *    if it is true take present segment as unique path.
 * 4. Apply ellipsis to unique segment according to whether segment is present at start/in-between/end of path.
 *
 * Example 1
 * 1. consider 2 paths i.e. ['a\\b\\c\\d', 'a\\f\\b\\c\\d']
 * 2. find unique path of first path,
 * 	a. 'd' is present in path2 and is suffix of path2, hence not unique of present path.
 * 	b. 'c' is present in path2 and 'c' is not suffix of present path, similarly for 'b' and 'a' also.
 * 	c. 'd\\c' is suffix of path2.
 *  d. 'b\\c' is not suffix of present path.
 *  e. 'a\\b' is not present in path2, hence unique path is 'a\\b...'.
 * 3. for path2, 'f' is not present in path1 hence unique is '...\\f\\...'.
 *
 * Example 2
 * 1. consider 2 paths i.e. ['a\\b', 'a\\b\\c'].
 * 	a. Even if 'b' is present in path2, as 'b' is suffix of path1 and is not suffix of path2, unique path will be '...\\b'.
 * 2. for path2, 'c' is not present in path1 hence unique path is '..\\c'.
 */
const ellipsis = '\u2026';
const unc = '\\\\';
export function shorten(paths: string[]): string[] {
	const shortenedPaths: string[] = new Array(paths.length);

	// for every path
	let match = false;
	for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
		let path = paths[pathIndex];

		if (path === '') {
			shortenedPaths[pathIndex] = `.${nativeSep}`;
			continue;
		}

		if (!path) {
			shortenedPaths[pathIndex] = path;
			continue;
		}

		match = true;

		// trim for now and concatenate unc path (e.g. \\network) or root path (/etc) later
		let prefix = '';
		if (path.indexOf(unc) === 0) {
			prefix = path.substr(0, path.indexOf(unc) + unc.length);
			path = path.substr(path.indexOf(unc) + unc.length);
		} else if (path.indexOf(nativeSep) === 0) {
			prefix = path.substr(0, path.indexOf(nativeSep) + nativeSep.length);
			path = path.substr(path.indexOf(nativeSep) + nativeSep.length);
		}

		// pick the first shortest subpath found
		const segments: string[] = path.split(nativeSep);
		for (let subpathLength = 1; match && subpathLength <= segments.length; subpathLength++) {
			for (let start = segments.length - subpathLength; match && start >= 0; start--) {
				match = false;
				let subpath = segments.slice(start, start + subpathLength).join(nativeSep);

				// that is unique to any other path
				for (let otherPathIndex = 0; !match && otherPathIndex < paths.length; otherPathIndex++) {

					// suffix subpath treated specially as we consider no match 'x' and 'x/...'
					if (otherPathIndex !== pathIndex && paths[otherPathIndex] && paths[otherPathIndex].indexOf(subpath) > -1) {
						const isSubpathEnding: boolean = (start + subpathLength === segments.length);

						// Adding separator as prefix for subpath, such that 'endsWith(src, trgt)' considers subpath as directory name instead of plain string.
						// prefix is not added when either subpath is root directory or path[otherPathIndex] does not have multiple directories.
						const subpathWithSep: string = (start > 0 && paths[otherPathIndex].indexOf(nativeSep) > -1) ? nativeSep + subpath : subpath;
						const isOtherPathEnding: boolean = endsWith(paths[otherPathIndex], subpathWithSep);

						match = !isSubpathEnding || isOtherPathEnding;
					}
				}

				// found unique subpath
				if (!match) {
					let result = '';

					// preserve disk drive or root prefix
					if (endsWith(segments[0], ':') || prefix !== '') {
						if (start === 1) {
							// extend subpath to include disk drive prefix
							start = 0;
							subpathLength++;
							subpath = segments[0] + nativeSep + subpath;
						}

						if (start > 0) {
							result = segments[0] + nativeSep;
						}

						result = prefix + result;
					}

					// add ellipsis at the beginning if neeeded
					if (start > 0) {
						result = result + ellipsis + nativeSep;
					}

					result = result + subpath;

					// add ellipsis at the end if needed
					if (start + subpathLength < segments.length) {
						result = result + nativeSep + ellipsis;
					}

					shortenedPaths[pathIndex] = result;
				}
			}
		}

		if (match) {
			shortenedPaths[pathIndex] = path; // use full path if no unique subpaths found
		}
	}

	return shortenedPaths;
}

// copied from base/strings.ts

/**
 * Determines if haystack ends with needle.
 */
export function endsWith(haystack: string, needle: string): boolean {
	let diff = haystack.length - needle.length;
	if (diff > 0) {
		return haystack.indexOf(needle, diff) === diff;
	} else if (diff === 0) {
		return haystack === needle;
	} else {
		return false;
	}
}