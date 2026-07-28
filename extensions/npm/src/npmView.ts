/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import {
	commands, Event, EventEmitter, ExtensionContext,
	Range,
	Selection, Task,
	TaskGroup, tasks, TextDocument, TextDocumentShowOptions, ThemeIcon, TreeDataProvider, TreeItem, TreeItemLabel, TreeItemCollapsibleState, Uri,
	window, workspace, WorkspaceFolder, Position, Location, l10n
} from 'vscode';
import { readScripts } from './readScripts';
import {
	createInstallationTask, getTaskName, isAutoDetectionEnabled, isWorkspaceFolder, INpmTaskDefinition,
	NpmTaskProvider,
	startDebugging,
	detectPackageManager,
	ITaskWithLocation,
	INSTALL_SCRIPT
} from './tasks';


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

	static getLabel(relativePath: string): string {
		if (relativePath.length > 0) {
			return path.join(relativePath, packageName);
		}
		return packageName;
	}

	constructor(folder: Folder, relativePath: string) {
		super(PackageJSON.getLabel(relativePath), TreeItemCollapsibleState.Expanded);
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

type ExplorerCommands = 'open' | 'run';

class NpmScript extends TreeItem {
	task: Task;
	package: PackageJSON;
	taskLocation?: Location;

	constructor(_context: ExtensionContext, packageJson: PackageJSON, task: ITaskWithLocation) {
		const name = packageJson.path.length > 0
			? task.task.name.substring(0, task.task.name.length - packageJson.path.length - 2)
			: task.task.name;
		super(name, TreeItemCollapsibleState.None);
		this.taskLocation = task.location;
		const command: ExplorerCommands = name === `${INSTALL_SCRIPT} ` ? 'run' : workspace.getConfiguration('npm').get<ExplorerCommands>('scriptExplorerAction') || 'open';

		const commandList = {
			'open': {
				title: 'Edit Script',
				command: 'vscode.open',
				arguments: [
					this.taskLocation?.uri,
					this.taskLocation ?
						{
							selection: new Range(this.taskLocation.range.start, this.taskLocation.range.start)
						} satisfies TextDocumentShowOptions
						: undefined
				]
			},
			'run': {
				title: 'Run Script',
				command: 'npm.runScript',
				arguments: [this]
			}
		};
		this.contextValue = 'script';
		this.package = packageJson;
		this.task = task.task;
		this.command = commandList[command];

		if (this.task.group && this.task.group === TaskGroup.Clean) {
			this.iconPath = new ThemeIcon('wrench-subaction');
		} else {
			this.iconPath = new ThemeIcon('wrench');
		}
		if (this.task.detail) {
			this.tooltip = this.task.detail;
			this.description = this.task.detail;
		}
	}

	getFolder(): WorkspaceFolder {
		return this.package.folder.workspaceFolder;
	}
}

class NoScripts extends TreeItem {
	constructor(message: string) {
		super(message, TreeItemCollapsibleState.None);
		this.contextValue = 'noscripts';
	}
}

type TaskTree = Folder[] | PackageJSON[] | NoScripts[];

export class NpmScriptsTreeDataProvider implements TreeDataProvider<TreeItem> {
	private taskTree: TaskTree | null = null;
	private extensionContext: ExtensionContext;
	private _onDidChangeTreeData: EventEmitter<TreeItem | null> = new EventEmitter<TreeItem | null>();
	readonly onDidChangeTreeData: Event<TreeItem | null> = this._onDidChangeTreeData.event;

	constructor(private context: ExtensionContext, public taskProvider: NpmTaskProvider) {
		const subscriptions = context.subscriptions;
		this.extensionContext = context;
		subscriptions.push(commands.registerCommand('npm.runScript', this.runScript, this));
		subscriptions.push(commands.registerCommand('npm.debugScript', this.debugScript, this));
		subscriptions.push(commands.registerCommand('npm.openScript', this.openScript, this));
		subscriptions.push(commands.registerCommand('npm.runInstall', this.runInstall, this));
	}

	private async runScript(script: NpmScript) {
		// Call detectPackageManager to trigger the multiple lock files warning.
		await detectPackageManager(script.getFolder().uri, this.context, true);
		tasks.executeTask(script.task);
	}

	private async debugScript(script: NpmScript) {
		startDebugging(this.extensionContext, script.task.definition.script, path.dirname(script.package.resourceUri!.fsPath), script.getFolder());
	}

	private findScriptPosition(document: TextDocument, script?: NpmScript) {
		const scripts = readScripts(document);
		if (!scripts) {
			return undefined;
		}

		if (!script) {
			return scripts.location.range.start;
		}

		const found = scripts.scripts.find(s => getTaskName(s.name, script.task.definition.path) === script.task.name);
		return found?.nameRange.start;
	}

	private async runInstall(selection: PackageJSON) {
		let uri: Uri | undefined = undefined;
		if (selection instanceof PackageJSON) {
			uri = selection.resourceUri;
		}
		if (!uri) {
			return;
		}
		const task = await createInstallationTask(this.context, selection.folder.workspaceFolder, uri);
		tasks.executeTask(task);
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
		const document: TextDocument = await workspace.openTextDocument(uri);
		const position = this.findScriptPosition(document, selection instanceof NpmScript ? selection : undefined) || new Position(0, 0);
		await window.showTextDocument(document, { preserveFocus: true, selection: new Selection(position, position) });
	}

	public refresh() {
		this.taskTree = null;
		this._onDidChangeTreeData.fire(null);
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
		if (element instanceof NoScripts) {
			return null;
		}
		return null;
	}

	async getChildren(element?: TreeItem): Promise<TreeItem[]> {
		if (!this.taskTree) {
			const taskItems = await this.taskProvider.tasksWithLocation;
			if (taskItems) {
				const taskTree = this.buildTaskTree(taskItems);
				this.taskTree = this.sortTaskTree(taskTree);
				if (this.taskTree.length === 0) {
					let message = l10n.t("No scripts found.");
					if (!isAutoDetectionEnabled()) {
						message = l10n.t('The setting "npm.autoDetect" is "off".');
					}
					this.taskTree = [new NoScripts(message)];
				}
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
		if (element instanceof NoScripts) {
			return [];
		}
		if (!element) {
			if (this.taskTree) {
				return this.taskTree;
			}
		}
		return [];
	}

	private isInstallTask(task: Task): boolean {
		const fullName = getTaskName('install', task.definition.path);
		return fullName === task.name;
	}

	private getTaskTreeItemLabel(taskTreeLabel: string | TreeItemLabel | undefined): string {
		if (taskTreeLabel === undefined) {
			return '';
		}

		if (typeof taskTreeLabel === 'string') {
			return taskTreeLabel;
		}

		return taskTreeLabel.label;
	}

	private sortTaskTree(taskTree: TaskTree) {
		return taskTree.sort((first: TreeItem, second: TreeItem) => {
			const firstLabel = this.getTaskTreeItemLabel(first.label);
			const secondLabel = this.getTaskTreeItemLabel(second.label);
			return firstLabel.localeCompare(secondLabel);
		});
	}

	private buildTaskTree(tasks: ITaskWithLocation[]): TaskTree {
		const folders: Map<String, Folder> = new Map();
		const packages: Map<String, PackageJSON> = new Map();

		let folder = null;
		let packageJson = null;

		const excludeConfig: Map<string, RegExp[]> = new Map();

		tasks.forEach(each => {
			const location = each.location;
			if (location && !excludeConfig.has(location.uri.toString())) {
				const regularExpressionsSetting = workspace.getConfiguration('npm', location.uri).get<string[]>('scriptExplorerExclude', []);
				excludeConfig.set(location.uri.toString(), regularExpressionsSetting?.map(value => RegExp(value)));
			}
			const regularExpressions = (location && excludeConfig.has(location.uri.toString())) ? excludeConfig.get(location.uri.toString()) : undefined;

			if (regularExpressions && regularExpressions.some((regularExpression) => (<INpmTaskDefinition>each.task.definition).script.match(regularExpression))) {
				return;
			}

			if (isWorkspaceFolder(each.task.scope) && !this.isInstallTask(each.task)) {
				folder = folders.get(each.task.scope.name);
				if (!folder) {
					folder = new Folder(each.task.scope);
					folders.set(each.task.scope.name, folder);
				}
				const definition: INpmTaskDefinition = <INpmTaskDefinition>each.task.definition;
				const relativePath = definition.path ? definition.path : '';
				const fullPath = path.join(each.task.scope.name, relativePath);
				packageJson = packages.get(fullPath);
				if (!packageJson) {
					packageJson = new PackageJSON(folder, relativePath);
					folder.addPackage(packageJson);
					packages.set(fullPath, packageJson);
				}
				const script = new NpmScript(this.extensionContext, packageJson, each);
				packageJson.addScript(script);
			}
		});
		if (folders.size === 1) {
			return [...packages.values()];
		}
		return [...folders.values()];
	}
}
