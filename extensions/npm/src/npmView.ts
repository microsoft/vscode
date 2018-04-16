/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import {
	DebugConfiguration, Event, EventEmitter, ExtensionContext, Task, TaskProvider,
	TextDocument, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri,
	WorkspaceFolder, commands, debug, window, workspace, Selection
} from 'vscode';
import { visit, JSONVisitor } from 'jsonc-parser';
import { NpmTaskDefinition, getPackageJsonUriFromTask, getScripts, isWorkspaceFolder, getPackageManager, getTaskName } from './tasks';

class Folder extends TreeItem {
	packages: PackageJSON[] = [];
	workspaceFolder: WorkspaceFolder;

	constructor(folder: WorkspaceFolder) {
		super(folder.name, TreeItemCollapsibleState.Expanded);
		this.contextValue = 'folder';
		this.resourceUri = folder.uri;
		this.workspaceFolder = folder;
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
		super(PackageJSON.getLabel(folder.label!, relativePath), TreeItemCollapsibleState.Expanded);
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

	constructor(context: ExtensionContext, packageJson: PackageJSON, task: Task) {
		super(task.name, TreeItemCollapsibleState.None);
		this.contextValue = 'script';
		this.package = packageJson;
		this.task = task;
		this.command = {
			title: 'Run Script',
			command: 'npm.runScript',
			arguments: [this]
		};
		this.iconPath = {
			light: context.asAbsolutePath(path.join('resources', 'light', 'script.svg')),
			dark: context.asAbsolutePath(path.join('resources', 'dark', 'script.svg'))
		};
	}

	getFolder(): WorkspaceFolder {
		return this.package.folder.workspaceFolder;
	}
}

export class NpmScriptsTreeDataProvider implements TreeDataProvider<TreeItem> {
	private taskTree: Folder[] | PackageJSON[] | null = null;
	private taskProvider: TaskProvider;
	private localize: any;
	private extensionContext: ExtensionContext;
	private _onDidChangeTreeData: EventEmitter<TreeItem | null> = new EventEmitter<TreeItem | null>();
	readonly onDidChangeTreeData: Event<TreeItem | null> = this._onDidChangeTreeData.event;

	constructor(context: ExtensionContext, taskProvider: TaskProvider, localize: any) {
		const subscriptions = context.subscriptions;
		this.taskProvider = taskProvider;
		this.localize = localize;
		this.extensionContext = context;
		subscriptions.push(commands.registerCommand('npm.runScript', this.runScript, this));
		subscriptions.push(commands.registerCommand('npm.debugScript', this.debugScript, this));
		subscriptions.push(commands.registerCommand('npm.openScript', this.openScript, this));
		subscriptions.push(commands.registerCommand('npm.refresh', this.refresh, this));
	}

	private scriptIsValid(scripts: any, task: Task): boolean {
		for (const script in scripts) {
			let label = getTaskName(script, task.definition.path);
			if (task.name === label) {
				return true;
			}
		}
		return false;
	}

	private async runScript(script: NpmScript) {
		let task = script.task;
		let uri = getPackageJsonUriFromTask(task);
		let scripts = await getScripts(uri!, this.localize);

		if (!this.scriptIsValid(scripts, task)) {
			this.scriptNotValid(task);
			return;
		}
		workspace.executeTask(script.task);
	}

	private async extractDebugArg(scripts: any, task: Task): Promise<[string, number] | undefined> {
		let script: string = scripts[task.name];

		let match = script.match(/--(inspect|debug)(-brk)?(=(\d*))?/);
		if (match) {
			if (match[4]) {
				return [match[1], parseInt(match[4])];
			}
			if (match[1] === 'inspect') {
				return [match[1], 9229];
			}
			if (match[1] === 'debug') {
				return [match[1], 5858];
			}
		}
		return undefined;
	}

	private async debugScript(script: NpmScript) {
		let task = script.task;
		let uri = getPackageJsonUriFromTask(task);
		let scripts = await getScripts(uri!, this.localize);

		if (!this.scriptIsValid(scripts, task)) {
			this.scriptNotValid(task);
			return;
		}

		let debugArg = await this.extractDebugArg(scripts, task);
		if (!debugArg) {
			let message = this.localize('npm.noDebugOptions', 'Could not launch "{0}" for debugging, the script needs to include the node debug options: "--nolazy --inspect-brk=port", [learn more](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_launch-configuration-support-for-npm-and-other-tools).', task.name);
			window.showErrorMessage(message);
			return;
		}

		let packageManager = getPackageManager(script.getFolder());
		const config: DebugConfiguration = {
			type: 'node',
			request: 'launch',
			name: `Debug ${task.name}`,
			runtimeExecutable: packageManager,
			runtimeArgs: [
				'run-script',
				task.name,
			],
			port: debugArg[1]
		};

		if (isWorkspaceFolder(task.scope)) {
			debug.startDebugging(task.scope, config);
		}
	}

	private scriptNotValid(task: Task) {
		let message = this.localize('npm.scriptInvalid', 'Could not find the script "{0}". Try to refresh the view.', task.name);
		window.showErrorMessage(message);
	}

	private findScript(document: TextDocument, script?: NpmScript): number {
		let scriptOffset = 0;
		let inScripts = false;

		let visitor: JSONVisitor = {
			onError() {
				return scriptOffset;
			},
			onObjectEnd() {
				if (inScripts) {
					inScripts = false;
				}
			},
			onObjectProperty(property: string, offset: number, _length: number) {
				if (property === 'scripts') {
					inScripts = true;
					if (!script) { // select the script section
						scriptOffset = offset;
					}
				}
				else if (inScripts && script) {
					let label = getTaskName(property, script.task.definition.path);
					if (script.task.name === label) {
						scriptOffset = offset;
					}
				}
			}
		};
		visit(document.getText(), visitor);
		return scriptOffset;

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
		let offset = this.findScript(document, selection instanceof NpmScript ? selection : undefined);
		let position = document.positionAt(offset);
		await window.showTextDocument(document, { selection: new Selection(position, position) });
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
				let relativePath = definition.path ? definition.path : '';
				let fullPath = path.join(each.scope.name, relativePath);
				packageJson = packages.get(fullPath);
				if (!packageJson) {
					packageJson = new PackageJSON(folder, relativePath);
					folder.addPackage(packageJson);
					packages.set(fullPath, packageJson);
				}
				let script = new NpmScript(this.extensionContext, packageJson, each);
				packageJson.addScript(script);
			}
		});
		if (folders.size === 1) {
			return [...packages.values()];
		}
		return [...folders.values()];
	}
}