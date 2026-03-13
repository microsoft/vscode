/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	TaskDefinition, Task, TaskGroup, WorkspaceFolder, RelativePattern, ShellExecution, Uri, workspace,
	TaskProvider, TextDocument, tasks, TaskScope, QuickPickItem, window, Position, ExtensionContext, env,
	ShellQuotedString, ShellQuoting, commands, Location, CancellationTokenSource, l10n
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import minimatch from 'minimatch';
import { Utils } from 'vscode-uri';
import { findPreferredPM } from './preferred-pm';
import { readScripts } from './readScripts';

const excludeRegex = new RegExp('^(node_modules|.vscode-test)$', 'i');

export interface INpmTaskDefinition extends TaskDefinition {
	script: string;
	path?: string;
}

export interface IFolderTaskItem extends QuickPickItem {
	label: string;
	task: Task;
}

type AutoDetect = 'on' | 'off';

let cachedTasks: ITaskWithLocation[] | undefined = undefined;

export const INSTALL_SCRIPT = 'install';

export interface ITaskLocation {
	document: Uri;
	line: Position;
}

export interface ITaskWithLocation {
	task: Task;
	location?: Location;
}

export class NpmTaskProvider implements TaskProvider {

	constructor(private context: ExtensionContext) {
	}

	get tasksWithLocation(): Promise<ITaskWithLocation[]> {
		return provideNpmScripts(this.context, false);
	}

	public async provideTasks() {
		const tasks = await provideNpmScripts(this.context, true);
		return tasks.map(task => task.task);
	}

	public async resolveTask(_task: Task): Promise<Task | undefined> {
		const npmTask = _task.definition.script;
		if (npmTask) {
			const kind = _task.definition as INpmTaskDefinition;
			let packageJsonUri: Uri;
			if (_task.scope === undefined || _task.scope === TaskScope.Global || _task.scope === TaskScope.Workspace) {
				// scope is required to be a WorkspaceFolder for resolveTask
				return undefined;
			}
			if (kind.path) {
				packageJsonUri = _task.scope.uri.with({ path: _task.scope.uri.path + '/' + kind.path + `${kind.path.endsWith('/') ? '' : '/'}` + 'package.json' });
			} else {
				packageJsonUri = _task.scope.uri.with({ path: _task.scope.uri.path + '/package.json' });
			}
			let task: Task;
			if (kind.script === INSTALL_SCRIPT) {
				task = await createInstallationTask(this.context, _task.scope, packageJsonUri);
			} else {
				task = await createScriptRunnerTask(this.context, kind.script, _task.scope, packageJsonUri);
			}
			// VSCode requires that task.definition must not change between resolutions
			// We need to restore task.definition to its original value
			task.definition = kind;
			return task;
		}
		return undefined;
	}
}

export function invalidateTasksCache() {
	cachedTasks = undefined;
}

const buildNames: string[] = ['build', 'compile', 'watch'];
function isBuildTask(name: string): boolean {
	for (const buildName of buildNames) {
		if (name.indexOf(buildName) !== -1) {
			return true;
		}
	}
	return false;
}

const testNames: string[] = ['test'];
function isTestTask(name: string): boolean {
	for (const testName of testNames) {
		if (name === testName) {
			return true;
		}
	}
	return false;
}
const preScripts: Set<string> = new Set([
	'install', 'pack', 'pack', 'publish', 'restart', 'shrinkwrap',
	'stop', 'test', 'uninstall', 'version'
]);

const postScripts: Set<string> = new Set([
	'install', 'pack', 'pack', 'publish', 'publishOnly', 'restart', 'shrinkwrap',
	'stop', 'test', 'uninstall', 'version'
]);

function canHavePrePostScript(name: string): boolean {
	return preScripts.has(name) || postScripts.has(name);
}

export function isWorkspaceFolder(value: any): value is WorkspaceFolder {
	return value && typeof value !== 'number';
}

export async function getScriptRunner(folder: Uri, context?: ExtensionContext, showWarning?: boolean): Promise<string> {
	let scriptRunner = workspace.getConfiguration('npm', folder).get<string>('scriptRunner', 'npm');

	if (scriptRunner === 'auto') {
		scriptRunner = await detectPackageManager(folder, context, showWarning);
	}

	return scriptRunner;
}

export async function getPackageManager(folder: Uri, context?: ExtensionContext, showWarning?: boolean): Promise<string> {
	let packageManager = workspace.getConfiguration('npm', folder).get<string>('packageManager', 'npm');

	if (packageManager === 'auto') {
		packageManager = await detectPackageManager(folder, context, showWarning);
	}

	return packageManager;
}

export async function detectPackageManager(folder: Uri, extensionContext?: ExtensionContext, showWarning: boolean = false): Promise<string> {
	const { name, multipleLockFilesDetected: multiplePMDetected } = await findPreferredPM(folder.fsPath);
	const neverShowWarning = 'npm.multiplePMWarning.neverShow';
	if (showWarning && multiplePMDetected && extensionContext && !extensionContext.globalState.get<boolean>(neverShowWarning)) {
		const multiplePMWarning = l10n.t('Using {0} as the preferred package manager. Found multiple lockfiles for {1}.  To resolve this issue, delete the lockfiles that don\'t match your preferred package manager or change the setting "npm.packageManager" to a value other than "auto".', name, folder.fsPath);
		const neverShowAgain = l10n.t("Do not show again");
		const learnMore = l10n.t("Learn more");
		window.showInformationMessage(multiplePMWarning, learnMore, neverShowAgain).then(result => {
			switch (result) {
				case neverShowAgain: extensionContext.globalState.update(neverShowWarning, true); break;
				case learnMore: env.openExternal(Uri.parse('https://docs.npmjs.com/cli/v9/configuring-npm/package-lock-json'));
			}
		});
	}

	return name;
}

export async function hasNpmScripts(): Promise<boolean> {
	const folders = workspace.workspaceFolders;
	if (!folders) {
		return false;
	}
	for (const folder of folders) {
		if (isAutoDetectionEnabled(folder) && !excludeRegex.test(Utils.basename(folder.uri))) {
			const relativePattern = new RelativePattern(folder, '**/package.json');
			const paths = await workspace.findFiles(relativePattern, '**/node_modules/**');
			if (paths.length > 0) {
				return true;
			}
		}
	}
	return false;
}

async function* findNpmPackages(): AsyncGenerator<Uri> {

	const visitedPackageJsonFiles: Set<string> = new Set();

	const folders = workspace.workspaceFolders;
	if (!folders) {
		return;
	}
	for (const folder of folders) {
		if (isAutoDetectionEnabled(folder) && !excludeRegex.test(Utils.basename(folder.uri))) {
			const relativePattern = new RelativePattern(folder, '**/package.json');
			const paths = await workspace.findFiles(relativePattern, '**/{node_modules,.vscode-test}/**');
			for (const path of paths) {
				if (!isExcluded(folder, path) && !visitedPackageJsonFiles.has(path.fsPath)) {
					yield path;
					visitedPackageJsonFiles.add(path.fsPath);
				}
			}
		}
	}
}


export async function detectNpmScriptsForFolder(context: ExtensionContext, folder: Uri): Promise<IFolderTaskItem[]> {

	const folderTasks: IFolderTaskItem[] = [];

	if (excludeRegex.test(Utils.basename(folder))) {
		return folderTasks;
	}
	const relativePattern = new RelativePattern(folder.fsPath, '**/package.json');
	const paths = await workspace.findFiles(relativePattern, '**/node_modules/**');

	const visitedPackageJsonFiles: Set<string> = new Set();
	for (const path of paths) {
		if (!visitedPackageJsonFiles.has(path.fsPath)) {
			const tasks = await provideNpmScriptsForFolder(context, path, true);
			visitedPackageJsonFiles.add(path.fsPath);
			folderTasks.push(...tasks.map(t => ({ label: t.task.name, task: t.task })));
		}
	}
	return folderTasks;
}

export async function provideNpmScripts(context: ExtensionContext, showWarning: boolean): Promise<ITaskWithLocation[]> {
	if (!cachedTasks) {
		const allTasks: ITaskWithLocation[] = [];
		for await (const path of findNpmPackages()) {
			const tasks = await provideNpmScriptsForFolder(context, path, showWarning);
			allTasks.push(...tasks);
		}
		cachedTasks = allTasks;
	}
	return cachedTasks;
}

export function isAutoDetectionEnabled(folder?: WorkspaceFolder): boolean {
	return workspace.getConfiguration('npm', folder?.uri).get<AutoDetect>('autoDetect') === 'on';
}

function isExcluded(folder: WorkspaceFolder, packageJsonUri: Uri) {
	function testForExclusionPattern(path: string, pattern: string): boolean {
		return minimatch(path, pattern, { dot: true });
	}

	const exclude = workspace.getConfiguration('npm', folder.uri).get<string | string[]>('exclude');
	const packageJsonFolder = path.dirname(packageJsonUri.fsPath);

	if (exclude) {
		if (Array.isArray(exclude)) {
			for (const pattern of exclude) {
				if (testForExclusionPattern(packageJsonFolder, pattern)) {
					return true;
				}
			}
		} else if (testForExclusionPattern(packageJsonFolder, exclude)) {
			return true;
		}
	}
	return false;
}

function isDebugScript(script: string): boolean {
	const match = script.match(/--(inspect|debug)(-brk)?(=((\[[0-9a-fA-F:]*\]|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[a-zA-Z0-9\.]*):)?(\d+))?/);
	return match !== null;
}

async function provideNpmScriptsForFolder(context: ExtensionContext, packageJsonUri: Uri, showWarning: boolean): Promise<ITaskWithLocation[]> {
	const emptyTasks: ITaskWithLocation[] = [];

	const folder = workspace.getWorkspaceFolder(packageJsonUri);
	if (!folder) {
		return emptyTasks;
	}
	const scripts = await getScripts(packageJsonUri);
	if (!scripts) {
		return emptyTasks;
	}

	const result: ITaskWithLocation[] = [];

	for (const { name, value, nameRange } of scripts.scripts) {
		const task = await createScriptRunnerTask(context, name, folder!, packageJsonUri, value, showWarning);
		result.push({ task, location: new Location(packageJsonUri, nameRange) });
	}

	if (!workspace.getConfiguration('npm', folder).get<string[]>('scriptExplorerExclude', []).find(e => e.includes(INSTALL_SCRIPT))) {
		result.push({ task: await createInstallationTask(context, folder, packageJsonUri, 'install dependencies from package', showWarning) });
	}
	return result;
}

export function getTaskName(script: string, relativePath: string | undefined) {
	if (relativePath && relativePath.length) {
		return `${script} - ${relativePath.substring(0, relativePath.length - 1)}`;
	}
	return script;
}

function escapeCommandLine(cmd: string[]): (string | ShellQuotedString)[] {
	return cmd.map(arg => {
		if (/\s/.test(arg)) {
			return { value: arg, quoting: arg.includes('--') ? ShellQuoting.Weak : ShellQuoting.Strong };
		} else {
			return arg;
		}
	});
}

function getRelativePath(rootUri: Uri, packageJsonUri: Uri): string {
	const absolutePath = packageJsonUri.path.substring(0, packageJsonUri.path.length - 'package.json'.length);
	return absolutePath.substring(rootUri.path.length + 1);
}

export async function getRunScriptCommand(script: string, folder: Uri, context?: ExtensionContext, showWarning = true): Promise<string[]> {
	const scriptRunner = await getScriptRunner(folder, context, showWarning);

	if (scriptRunner === 'node') {
		return ['node', '--run', script];
	} else {
		const result = [scriptRunner, 'run'];
		if (workspace.getConfiguration('npm', folder).get<boolean>('runSilent')) {
			result.push('--silent');
		}
		result.push(script);
		return result;
	}
}

export async function createScriptRunnerTask(context: ExtensionContext, script: string, folder: WorkspaceFolder, packageJsonUri: Uri, scriptValue?: string, showWarning?: boolean): Promise<Task> {
	const kind: INpmTaskDefinition = { type: 'npm', script };

	const relativePackageJson = getRelativePath(folder.uri, packageJsonUri);
	if (relativePackageJson.length && !kind.path) {
		kind.path = relativePackageJson.substring(0, relativePackageJson.length - 1);
	}
	const taskName = getTaskName(script, relativePackageJson);
	const cwd = path.dirname(packageJsonUri.fsPath);
	const args = await getRunScriptCommand(script, folder.uri, context, showWarning);
	const scriptRunner = args.shift()!;
	const task = new Task(kind, folder, taskName, 'npm', new ShellExecution(scriptRunner, escapeCommandLine(args), { cwd: cwd }));
	task.detail = scriptValue;

	const lowerCaseTaskName = script.toLowerCase();
	if (isBuildTask(lowerCaseTaskName)) {
		task.group = TaskGroup.Build;
	} else if (isTestTask(lowerCaseTaskName)) {
		task.group = TaskGroup.Test;
	} else if (canHavePrePostScript(lowerCaseTaskName)) {
		task.group = TaskGroup.Clean; // hack: use Clean group to tag pre/post scripts
	} else if (scriptValue && isDebugScript(scriptValue)) {
		// todo@connor4312: all scripts are now debuggable, what is a 'debug script'?
		task.group = TaskGroup.Rebuild; // hack: use Rebuild group to tag debug scripts
	}
	return task;
}

async function getInstallDependenciesCommand(folder: Uri, context?: ExtensionContext, showWarning = true): Promise<string[]> {
	const packageManager = await getPackageManager(folder, context, showWarning);
	const result = [packageManager, INSTALL_SCRIPT];
	if (workspace.getConfiguration('npm', folder).get<boolean>('runSilent')) {
		result.push('--silent');
	}
	return result;
}

export async function createInstallationTask(context: ExtensionContext, folder: WorkspaceFolder, packageJsonUri: Uri, scriptValue?: string, showWarning?: boolean): Promise<Task> {
	const kind: INpmTaskDefinition = { type: 'npm', script: INSTALL_SCRIPT };

	const relativePackageJson = getRelativePath(folder.uri, packageJsonUri);
	if (relativePackageJson.length && !kind.path) {
		kind.path = relativePackageJson.substring(0, relativePackageJson.length - 1);
	}
	const taskName = getTaskName(INSTALL_SCRIPT, relativePackageJson);
	const cwd = path.dirname(packageJsonUri.fsPath);
	const args = await getInstallDependenciesCommand(folder.uri, context, showWarning);
	const packageManager = args.shift()!;
	const task = new Task(kind, folder, taskName, 'npm', new ShellExecution(packageManager, escapeCommandLine(args), { cwd: cwd }));
	task.detail = scriptValue;
	task.group = TaskGroup.Clean;

	return task;
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

export async function hasPackageJson(): Promise<boolean> {
	// Faster than `findFiles` for workspaces with a root package.json.
	if (await hasRootPackageJson()) {
		return true;
	}
	const token = new CancellationTokenSource();
	// Search for files for max 1 second.
	const timeout = setTimeout(() => token.cancel(), 1000);
	const files = await workspace.findFiles('**/package.json', undefined, 1, token.token);
	clearTimeout(timeout);
	return files.length > 0;
}

async function hasRootPackageJson(): Promise<boolean> {
	const folders = workspace.workspaceFolders;
	if (!folders) {
		return false;
	}
	for (const folder of folders) {
		if (folder.uri.scheme === 'file') {
			const packageJson = path.join(folder.uri.fsPath, 'package.json');
			if (await exists(packageJson)) {
				return true;
			}
		}
	}
	return false;
}

async function exists(file: string): Promise<boolean> {
	return new Promise<boolean>((resolve, _reject) => {
		fs.exists(file, (value) => {
			resolve(value);
		});
	});
}

export async function runScript(context: ExtensionContext, script: string, document: TextDocument) {
	const uri = document.uri;
	const folder = workspace.getWorkspaceFolder(uri);
	if (folder) {
		const task = await createScriptRunnerTask(context, script, folder, uri);
		tasks.executeTask(task);
	}
}

export async function startDebugging(context: ExtensionContext, scriptName: string, cwd: string, folder: WorkspaceFolder) {
	const runScriptCommand = await getRunScriptCommand(scriptName, folder.uri, context, true);

	commands.executeCommand(
		'extension.js-debug.createDebuggerTerminal',
		runScriptCommand.join(' '),
		folder,
		{ cwd },
	);
}


export type StringMap = { [s: string]: string };

export function findScriptAtPosition(document: TextDocument, buffer: string, position: Position): string | undefined {
	const read = readScripts(document, buffer);
	if (!read) {
		return undefined;
	}

	for (const script of read.scripts) {
		if (script.nameRange.start.isBeforeOrEqual(position) && script.valueRange.end.isAfterOrEqual(position)) {
			return script.name;
		}
	}

	return undefined;
}

export async function getScripts(packageJsonUri: Uri) {
	if (packageJsonUri.scheme !== 'file') {
		return undefined;
	}

	const packageJson = packageJsonUri.fsPath;
	if (!await exists(packageJson)) {
		return undefined;
	}

	try {
		const document: TextDocument = await workspace.openTextDocument(packageJsonUri);
		return readScripts(document);
	} catch (e) {
		const localizedParseError = l10n.t("Npm task detection: failed to parse the file {0}", packageJsonUri.fsPath);
		throw new Error(localizedParseError);
	}
}
