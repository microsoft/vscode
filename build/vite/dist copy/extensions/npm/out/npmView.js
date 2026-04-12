"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NpmScriptsTreeDataProvider = void 0;
const path = __importStar(require("path"));
const vscode_1 = require("vscode");
const readScripts_1 = require("./readScripts");
const tasks_1 = require("./tasks");
class Folder extends vscode_1.TreeItem {
    packages = [];
    workspaceFolder;
    constructor(folder) {
        super(folder.name, vscode_1.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'folder';
        this.resourceUri = folder.uri;
        this.workspaceFolder = folder;
        this.iconPath = vscode_1.ThemeIcon.Folder;
    }
    addPackage(packageJson) {
        this.packages.push(packageJson);
    }
}
const packageName = 'package.json';
class PackageJSON extends vscode_1.TreeItem {
    path;
    folder;
    scripts = [];
    static getLabel(relativePath) {
        if (relativePath.length > 0) {
            return path.join(relativePath, packageName);
        }
        return packageName;
    }
    constructor(folder, relativePath) {
        super(PackageJSON.getLabel(relativePath), vscode_1.TreeItemCollapsibleState.Expanded);
        this.folder = folder;
        this.path = relativePath;
        this.contextValue = 'packageJSON';
        if (relativePath) {
            this.resourceUri = vscode_1.Uri.file(path.join(folder.resourceUri.fsPath, relativePath, packageName));
        }
        else {
            this.resourceUri = vscode_1.Uri.file(path.join(folder.resourceUri.fsPath, packageName));
        }
        this.iconPath = vscode_1.ThemeIcon.File;
    }
    addScript(script) {
        this.scripts.push(script);
    }
}
class NpmScript extends vscode_1.TreeItem {
    task;
    package;
    taskLocation;
    constructor(_context, packageJson, task) {
        const name = packageJson.path.length > 0
            ? task.task.name.substring(0, task.task.name.length - packageJson.path.length - 2)
            : task.task.name;
        super(name, vscode_1.TreeItemCollapsibleState.None);
        this.taskLocation = task.location;
        const command = name === `${tasks_1.INSTALL_SCRIPT} ` ? 'run' : vscode_1.workspace.getConfiguration('npm').get('scriptExplorerAction') || 'open';
        const commandList = {
            'open': {
                title: 'Edit Script',
                command: 'vscode.open',
                arguments: [
                    this.taskLocation?.uri,
                    this.taskLocation ?
                        {
                            selection: new vscode_1.Range(this.taskLocation.range.start, this.taskLocation.range.start)
                        }
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
        if (this.task.group && this.task.group === vscode_1.TaskGroup.Clean) {
            this.iconPath = new vscode_1.ThemeIcon('wrench-subaction');
        }
        else {
            this.iconPath = new vscode_1.ThemeIcon('wrench');
        }
        if (this.task.detail) {
            this.tooltip = this.task.detail;
            this.description = this.task.detail;
        }
    }
    getFolder() {
        return this.package.folder.workspaceFolder;
    }
}
class NoScripts extends vscode_1.TreeItem {
    constructor(message) {
        super(message, vscode_1.TreeItemCollapsibleState.None);
        this.contextValue = 'noscripts';
    }
}
class NpmScriptsTreeDataProvider {
    context;
    taskProvider;
    taskTree = null;
    extensionContext;
    _onDidChangeTreeData = new vscode_1.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(context, taskProvider) {
        this.context = context;
        this.taskProvider = taskProvider;
        const subscriptions = context.subscriptions;
        this.extensionContext = context;
        subscriptions.push(vscode_1.commands.registerCommand('npm.runScript', this.runScript, this));
        subscriptions.push(vscode_1.commands.registerCommand('npm.debugScript', this.debugScript, this));
        subscriptions.push(vscode_1.commands.registerCommand('npm.openScript', this.openScript, this));
        subscriptions.push(vscode_1.commands.registerCommand('npm.runInstall', this.runInstall, this));
    }
    async runScript(script) {
        // Call detectPackageManager to trigger the multiple lock files warning.
        await (0, tasks_1.detectPackageManager)(script.getFolder().uri, this.context, true);
        vscode_1.tasks.executeTask(script.task);
    }
    async debugScript(script) {
        (0, tasks_1.startDebugging)(this.extensionContext, script.task.definition.script, path.dirname(script.package.resourceUri.fsPath), script.getFolder());
    }
    findScriptPosition(document, script) {
        const scripts = (0, readScripts_1.readScripts)(document);
        if (!scripts) {
            return undefined;
        }
        if (!script) {
            return scripts.location.range.start;
        }
        const found = scripts.scripts.find(s => (0, tasks_1.getTaskName)(s.name, script.task.definition.path) === script.task.name);
        return found?.nameRange.start;
    }
    async runInstall(selection) {
        let uri = undefined;
        if (selection instanceof PackageJSON) {
            uri = selection.resourceUri;
        }
        if (!uri) {
            return;
        }
        const task = await (0, tasks_1.createInstallationTask)(this.context, selection.folder.workspaceFolder, uri);
        vscode_1.tasks.executeTask(task);
    }
    async openScript(selection) {
        let uri = undefined;
        if (selection instanceof PackageJSON) {
            uri = selection.resourceUri;
        }
        else if (selection instanceof NpmScript) {
            uri = selection.package.resourceUri;
        }
        if (!uri) {
            return;
        }
        const document = await vscode_1.workspace.openTextDocument(uri);
        const position = this.findScriptPosition(document, selection instanceof NpmScript ? selection : undefined) || new vscode_1.Position(0, 0);
        await vscode_1.window.showTextDocument(document, { preserveFocus: true, selection: new vscode_1.Selection(position, position) });
    }
    refresh() {
        this.taskTree = null;
        this._onDidChangeTreeData.fire(null);
    }
    getTreeItem(element) {
        return element;
    }
    getParent(element) {
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
    async getChildren(element) {
        if (!this.taskTree) {
            const taskItems = await this.taskProvider.tasksWithLocation;
            if (taskItems) {
                const taskTree = this.buildTaskTree(taskItems);
                this.taskTree = this.sortTaskTree(taskTree);
                if (this.taskTree.length === 0) {
                    let message = vscode_1.l10n.t("No scripts found.");
                    if (!(0, tasks_1.isAutoDetectionEnabled)()) {
                        message = vscode_1.l10n.t('The setting "npm.autoDetect" is "off".');
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
    isInstallTask(task) {
        const fullName = (0, tasks_1.getTaskName)('install', task.definition.path);
        return fullName === task.name;
    }
    getTaskTreeItemLabel(taskTreeLabel) {
        if (taskTreeLabel === undefined) {
            return '';
        }
        if (typeof taskTreeLabel === 'string') {
            return taskTreeLabel;
        }
        return taskTreeLabel.label;
    }
    sortTaskTree(taskTree) {
        return taskTree.sort((first, second) => {
            const firstLabel = this.getTaskTreeItemLabel(first.label);
            const secondLabel = this.getTaskTreeItemLabel(second.label);
            return firstLabel.localeCompare(secondLabel);
        });
    }
    buildTaskTree(tasks) {
        const folders = new Map();
        const packages = new Map();
        let folder = null;
        let packageJson = null;
        const excludeConfig = new Map();
        tasks.forEach(each => {
            const location = each.location;
            if (location && !excludeConfig.has(location.uri.toString())) {
                const regularExpressionsSetting = vscode_1.workspace.getConfiguration('npm', location.uri).get('scriptExplorerExclude', []);
                excludeConfig.set(location.uri.toString(), regularExpressionsSetting?.map(value => RegExp(value)));
            }
            const regularExpressions = (location && excludeConfig.has(location.uri.toString())) ? excludeConfig.get(location.uri.toString()) : undefined;
            if (regularExpressions && regularExpressions.some((regularExpression) => each.task.definition.script.match(regularExpression))) {
                return;
            }
            if ((0, tasks_1.isWorkspaceFolder)(each.task.scope) && !this.isInstallTask(each.task)) {
                folder = folders.get(each.task.scope.name);
                if (!folder) {
                    folder = new Folder(each.task.scope);
                    folders.set(each.task.scope.name, folder);
                }
                const definition = each.task.definition;
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
exports.NpmScriptsTreeDataProvider = NpmScriptsTreeDataProvider;
//# sourceMappingURL=npmView.js.map