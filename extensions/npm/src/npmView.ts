/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	ExtensionContext, Task, TreeDataProvider, TreeItem, TreeItemCollapsibleState,
	WorkspaceFolder, workspace, commands, window, EventEmitter, Event,
	ThemeIcon, Uri, TextDocument, TaskProvider
} from 'vscode';
import { NpmTaskDefinition, ScriptValidator } from './tasks';
import * as path from 'path';

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
		this.resourceUri = Uri.file(path.join(folder!.resourceUri!.fsPath, relativePath, packageName));
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
			arguments: [task]
		};
	}
}

export class NpmScriptsTreeDataProvider implements TreeDataProvider<TreeItem> {
	private taskTree: Folder[] | PackageJSON[] | null = null;
	private validator: ScriptValidator;
	private taskProvider: TaskProvider;
	private _onDidChangeTreeData: EventEmitter<TreeItem | null> = new EventEmitter<TreeItem | null>();
	readonly onDidChangeTreeData: Event<TreeItem | null> = this._onDidChangeTreeData.event;


	constructor(context: ExtensionContext, taskProvider: TaskProvider, validator: ScriptValidator) {
		const subscriptions = context.subscriptions;
		this.validator = validator;
		this.taskProvider = taskProvider;
		subscriptions.push(commands.registerCommand('npm.runScript', this.runScript, this));
		subscriptions.push(commands.registerCommand('npm.openScript', this.openScript, this));
		subscriptions.push(commands.registerCommand('npm.refresh', this.refresh, this));
	}

	private runScript(task: Task) {
		if (!this.validator.scriptIsValid(task)) {
			window.showErrorMessage(`Could not find script ${task.name}`);
			return;
		}
		workspace.executeTask(task);
	}

	private async openScript(packageJSON: PackageJSON) {
		let document: TextDocument = await workspace.openTextDocument(packageJSON.resourceUri!);
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

	private isWorkspaceFolder(value: any): value is WorkspaceFolder {
		return value && typeof value !== 'number';
	}

	private buildTaskTree(tasks: Task[]): Folder[] | PackageJSON[] {
		let folders: Map<String, Folder> = new Map();
		let packages: Map<String, PackageJSON> = new Map();

		let folder = null;
		let packageJson = null;

		tasks.forEach(each => {
			if (this.isWorkspaceFolder(each.scope)) {
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