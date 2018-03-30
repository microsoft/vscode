/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import {
	DebugConfiguration, Event, EventEmitter, ExtensionContext, Task, TaskProvider,
	TextDocument, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri,
	WorkspaceFolder, commands, debug, window, workspace
} from 'vscode';
import { NpmTaskDefinition, getPackageJsonUriFromTask, getScripts, isWorkspaceFolder } from './tasks';

class Folder extends TreeItem {
	packages: PackageJSON[] = [];

	constructor(folder: WorkspaceFolder) {
		super(folder.name, TreeItemCollapsibleState.Collapsed);
		this.contextValue = 'folder';
		this.resourceUri = folder.uri;
		this.iconPath = ThemeIcon.Folder;
	}

	addPackage(packageJson: PackageJSON) {
		this.packages.push(packageJson);
	}
}

const packageName = 'package.json';

class PackageJSON extends TreeItem {
	path: string;
	folder: Folder;
	scripts: NpmScript[] = [];

	static getLabel(folderName: string, relativePath: string): string {
		if (relativePath.length > 0) {
			return path.join(relativePath, packageName);
		}
		return path.join(folderName, packageName);
	}

	constructor(folder: Folder, relativePath: string) {
		super(PackageJSON.getLabel(folder.label!, relativePath), TreeItemCollapsibleState.Collapsed);
		this.folder = folder;
		this.path = relativePath;
		this.contextValue = 'packageJSON';
		if (relativePath) {
			this.resourceUri = Uri.file(path.join(folder!.resourceUri!.fsPath, relativePath, packageName));
		} else {
			this.resourceUri = Uri.file(path.join(folder!.resourceUri!.fsPath, packageName));
		}
		this.iconPath = ThemeIcon.File;
	}

	addScript(script: NpmScript) {
		this.scripts.push(script);
	}
}

class NpmScript extends TreeItem {
	task: Task;
	package: PackageJSON;

	constructor(packageJson: PackageJSON, task: Task) {
		super(task.name, TreeItemCollapsibleState.None);
		this.contextValue = 'script';
		this.package = packageJson;
		this.task = task;
		this.command = {
			title: 'Run Script',
			command: 'npm.runScript',
			arguments: [this]
		};
	}
}

export class NpmScriptsTreeDataProvider implements TreeDataProvider<TreeItem> {
	private taskTree: Folder[] | PackageJSON[] | null = null;
	private taskProvider: TaskProvider;
	private localize: any;
	private _onDidChangeTreeData: EventEmitter<TreeItem | null> = new EventEmitter<TreeItem | null>();
	readonly onDidChangeTreeData: Event<TreeItem | null> = this._onDidChangeTreeData.event;


	constructor(context: ExtensionContext, taskProvider: TaskProvider, localize: any) {
		const subscriptions = context.subscriptions;
		this.taskProvider = taskProvider;
		this.localize = localize;

		subscriptions.push(commands.registerCommand('npm.runScript', this.runScript, this));
		subscriptions.push(commands.registerCommand('npm.debugScript', this.debugScript, this));
		subscriptions.push(commands.registerCommand('npm.openScript', this.openScript, this));
		subscriptions.push(commands.registerCommand('npm.refresh', this.refresh, this));
	}

	private async scriptIsValid(scripts: any, task: Task): Promise<boolean> {
		if (scripts[task.name]) {
			return true;
		}
		return false;
	}

	private async runScript(script: NpmScript) {
		let task = script.task;
		let uri = getPackageJsonUriFromTask(task);
		let scripts = await getScripts(uri!, this.localize);

		if (!await this.scriptIsValid(scripts, task)) {
			window.showErrorMessage(`Could not find script '${task.name}'. Try to refresh the view.`);
			return;
		}
		workspace.executeTask(script.task);
	}

	private async extractPort(scripts: any, task: Task): Promise<number | null> {
		let script: string = scripts[task.name];
		let match = script.match(/--inspect-brk=(\d*)/);
		if (match && match.length === 2) {
			return parseInt(match[1]);
		}
		return null;
	}

	private async debugScript(script: NpmScript) {
		let task = script.task;
		let uri = getPackageJsonUriFromTask(task);
		let scripts = await getScripts(uri!, this.localize);

		if (!await this.scriptIsValid(scripts, task)) {
			window.showErrorMessage(`Could not find script '${task.name}'. Try to refresh the view.`);
			return;
		}

		let port = await this.extractPort(scripts, task);
		// let debugArgs = null;
		// if (!port) {
		// 	port = 9229;
		// 	debugArgs = ['--', '--nolazy', `--inspect-brk=${port}`];
		// }
		if (!port) {
			window.showErrorMessage(`Could not launch for debugging, the script does not define --inspect-brk=port.`);
			return;
		}
		const config: DebugConfiguration = {
			type: 'node',
			request: 'launch',
			name: `Debug ${task.name}`,
			runtimeExecutable: 'npm',
			runtimeArgs: [
				'run-script',
				task.name,
			],
			port: port
		};
		// if (debugArgs) {
		// 	config.runtimeArgs.push(...debugArgs);
		// }
		if (isWorkspaceFolder(task.scope)) {
			debug.startDebugging(task.scope, config);
		}
	}

	private async openScript(selection: PackageJSON | NpmScript) {
		let uri: Uri | undefined = undefined;
		if (selection instanceof PackageJSON) {
			uri = selection.resourceUri!;
		} else if (selection instanceof NpmScript) {
			uri = selection.package.resourceUri;
		}
		if (!uri) {
			return;
		}
		let document: TextDocument = await workspace.openTextDocument(uri);
		window.showTextDocument(document);
	}

	private refresh() {
		this.taskTree = null;
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TreeItem): TreeItem {
		return element;
	}

	getParent(element: TreeItem): TreeItem | null {
		if (element instanceof Folder) {
			return null;
		}
		if (element instanceof PackageJSON) {
			return element.folder;
		}
		if (element instanceof NpmScript) {
			return element.package;
		}
		return null;
	}

	async getChildren(element?: TreeItem): Promise<TreeItem[]> {
		if (!this.taskTree) {
			let tasks = await this.taskProvider.provideTasks();
			if (tasks) {
				this.taskTree = this.buildTaskTree(tasks);
			}
		}
		if (element instanceof Folder) {
			return element.packages;
		}
		if (element instanceof PackageJSON) {
			return element.scripts;
		}
		if (element instanceof NpmScript) {
			return [];
		}
		if (!element) {
			if (this.taskTree) {
				return this.taskTree;
			}
		}
		return [];
	}

	private buildTaskTree(tasks: Task[]): Folder[] | PackageJSON[] {
		let folders: Map<String, Folder> = new Map();
		let packages: Map<String, PackageJSON> = new Map();

		let folder = null;
		let packageJson = null;

		tasks.forEach(each => {
			if (isWorkspaceFolder(each.scope)) {
				folder = folders.get(each.scope.name);
				if (!folder) {
					folder = new Folder(each.scope);
					folders.set(each.scope.name, folder);
				}
				let definition: NpmTaskDefinition = <NpmTaskDefinition>each.definition;
				let path = definition.path ? definition.path : '';
				packageJson = packages.get(path);
				if (!packageJson) {
					packageJson = new PackageJSON(folder, path);
					folder.addPackage(packageJson);
					packages.set(path, packageJson);
				}
				let script = new NpmScript(packageJson, each);
				packageJson.addScript(script);
			}
		});
		if (folders.size === 1) {
			return [...packages.values()];
		}
		return [...folders.values()];
	}
}