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
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const cp = __importStar(require("child_process"));
const vscode = __importStar(require("vscode"));
function exists(file) {
    return new Promise((resolve, _reject) => {
        fs.exists(file, (value) => {
            resolve(value);
        });
    });
}
function exec(command, options) {
    return new Promise((resolve, reject) => {
        cp.exec(command, options, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stdout, stderr });
            }
            resolve({ stdout, stderr });
        });
    });
}
const buildNames = ['build', 'compile', 'watch'];
function isBuildTask(name) {
    for (const buildName of buildNames) {
        if (name.indexOf(buildName) !== -1) {
            return true;
        }
    }
    return false;
}
const testNames = ['test'];
function isTestTask(name) {
    for (const testName of testNames) {
        if (name.indexOf(testName) !== -1) {
            return true;
        }
    }
    return false;
}
let _channel;
function getOutputChannel() {
    if (!_channel) {
        _channel = vscode.window.createOutputChannel('Grunt Auto Detection');
    }
    return _channel;
}
function showError() {
    vscode.window.showWarningMessage(vscode.l10n.t("Problem finding grunt tasks. See the output for more information."), vscode.l10n.t("Go to output")).then(() => {
        getOutputChannel().show(true);
    });
}
async function findGruntCommand(rootPath) {
    let command;
    const platform = process.platform;
    if (platform === 'win32' && await exists(path.join(rootPath, 'node_modules', '.bin', 'grunt.cmd'))) {
        command = path.join('.', 'node_modules', '.bin', 'grunt.cmd');
    }
    else if ((platform === 'linux' || platform === 'darwin') && await exists(path.join(rootPath, 'node_modules', '.bin', 'grunt'))) {
        command = path.join('.', 'node_modules', '.bin', 'grunt');
    }
    else {
        command = 'grunt';
    }
    return command;
}
class FolderDetector {
    _workspaceFolder;
    _gruntCommand;
    fileWatcher;
    promise;
    constructor(_workspaceFolder, _gruntCommand) {
        this._workspaceFolder = _workspaceFolder;
        this._gruntCommand = _gruntCommand;
    }
    get workspaceFolder() {
        return this._workspaceFolder;
    }
    isEnabled() {
        return vscode.workspace.getConfiguration('grunt', this._workspaceFolder.uri).get('autoDetect') === 'on';
    }
    start() {
        const pattern = path.join(this._workspaceFolder.uri.fsPath, '{node_modules,[Gg]runtfile.js}');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        this.fileWatcher.onDidChange(() => this.promise = undefined);
        this.fileWatcher.onDidCreate(() => this.promise = undefined);
        this.fileWatcher.onDidDelete(() => this.promise = undefined);
    }
    async getTasks() {
        if (this.isEnabled()) {
            if (!this.promise) {
                this.promise = this.computeTasks();
            }
            return this.promise;
        }
        else {
            return [];
        }
    }
    async getTask(_task) {
        const taskDefinition = _task.definition;
        const gruntTask = taskDefinition.task;
        if (gruntTask) {
            const options = { cwd: this.workspaceFolder.uri.fsPath };
            const source = 'grunt';
            const task = gruntTask.indexOf(' ') === -1
                ? new vscode.Task(taskDefinition, this.workspaceFolder, gruntTask, source, new vscode.ShellExecution(`${await this._gruntCommand}`, [gruntTask, ...taskDefinition.args], options))
                : new vscode.Task(taskDefinition, this.workspaceFolder, gruntTask, source, new vscode.ShellExecution(`${await this._gruntCommand}`, [`"${gruntTask}"`, ...taskDefinition.args], options));
            return task;
        }
        return undefined;
    }
    async computeTasks() {
        const rootPath = this._workspaceFolder.uri.scheme === 'file' ? this._workspaceFolder.uri.fsPath : undefined;
        const emptyTasks = [];
        if (!rootPath) {
            return emptyTasks;
        }
        if (!await exists(path.join(rootPath, 'gruntfile.js')) && !await exists(path.join(rootPath, 'Gruntfile.js'))) {
            return emptyTasks;
        }
        const commandLine = `${await this._gruntCommand} --help --no-color`;
        try {
            const { stdout, stderr } = await exec(commandLine, { cwd: rootPath });
            if (stderr) {
                getOutputChannel().appendLine(stderr);
                showError();
            }
            const result = [];
            if (stdout) {
                // grunt lists tasks as follows (description is wrapped into a new line if too long):
                // ...
                // Available tasks
                //         uglify  Minify files with UglifyJS. *
                //         jshint  Validate files with JSHint. *
                //           test  Alias for "jshint", "qunit" tasks.
                //        default  Alias for "jshint", "qunit", "concat", "uglify" tasks.
                //           long  Alias for "eslint", "qunit", "browserify", "sass",
                //                 "autoprefixer", "uglify", tasks.
                //
                // Tasks run in the order specified
                const lines = stdout.split(/\r{0,1}\n/);
                let tasksStart = false;
                let tasksEnd = false;
                for (const line of lines) {
                    if (line.length === 0) {
                        continue;
                    }
                    if (!tasksStart && !tasksEnd) {
                        if (line.indexOf('Available tasks') === 0) {
                            tasksStart = true;
                        }
                    }
                    else if (tasksStart && !tasksEnd) {
                        if (line.indexOf('Tasks run in the order specified') === 0) {
                            tasksEnd = true;
                        }
                        else {
                            const regExp = /^\s*(\S.*\S)  \S/g;
                            const matches = regExp.exec(line);
                            if (matches && matches.length === 2) {
                                const name = matches[1];
                                const kind = {
                                    type: 'grunt',
                                    task: name
                                };
                                const source = 'grunt';
                                const options = { cwd: this.workspaceFolder.uri.fsPath };
                                const task = name.indexOf(' ') === -1
                                    ? new vscode.Task(kind, this.workspaceFolder, name, source, new vscode.ShellExecution(`${await this._gruntCommand} ${name}`, options))
                                    : new vscode.Task(kind, this.workspaceFolder, name, source, new vscode.ShellExecution(`${await this._gruntCommand} "${name}"`, options));
                                result.push(task);
                                const lowerCaseTaskName = name.toLowerCase();
                                if (isBuildTask(lowerCaseTaskName)) {
                                    task.group = vscode.TaskGroup.Build;
                                }
                                else if (isTestTask(lowerCaseTaskName)) {
                                    task.group = vscode.TaskGroup.Test;
                                }
                            }
                        }
                    }
                }
            }
            return result;
        }
        catch (err) {
            const channel = getOutputChannel();
            if (err.stderr) {
                channel.appendLine(err.stderr);
            }
            if (err.stdout) {
                channel.appendLine(err.stdout);
            }
            channel.appendLine(vscode.l10n.t("Auto detecting Grunt for folder {0} failed with error: {1}', this.workspaceFolder.name, err.error ? err.error.toString() : 'unknown"));
            showError();
            return emptyTasks;
        }
    }
    dispose() {
        this.promise = undefined;
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
    }
}
class TaskDetector {
    taskProvider;
    detectors = new Map();
    constructor() {
    }
    start() {
        const folders = vscode.workspace.workspaceFolders;
        if (folders) {
            this.updateWorkspaceFolders(folders, []);
        }
        vscode.workspace.onDidChangeWorkspaceFolders((event) => this.updateWorkspaceFolders(event.added, event.removed));
        vscode.workspace.onDidChangeConfiguration(this.updateConfiguration, this);
    }
    dispose() {
        if (this.taskProvider) {
            this.taskProvider.dispose();
            this.taskProvider = undefined;
        }
        this.detectors.clear();
    }
    updateWorkspaceFolders(added, removed) {
        for (const remove of removed) {
            const detector = this.detectors.get(remove.uri.toString());
            if (detector) {
                detector.dispose();
                this.detectors.delete(remove.uri.toString());
            }
        }
        for (const add of added) {
            const detector = new FolderDetector(add, findGruntCommand(add.uri.fsPath));
            this.detectors.set(add.uri.toString(), detector);
            if (detector.isEnabled()) {
                detector.start();
            }
        }
        this.updateProvider();
    }
    updateConfiguration() {
        for (const detector of this.detectors.values()) {
            detector.dispose();
            this.detectors.delete(detector.workspaceFolder.uri.toString());
        }
        const folders = vscode.workspace.workspaceFolders;
        if (folders) {
            for (const folder of folders) {
                if (!this.detectors.has(folder.uri.toString())) {
                    const detector = new FolderDetector(folder, findGruntCommand(folder.uri.fsPath));
                    this.detectors.set(folder.uri.toString(), detector);
                    if (detector.isEnabled()) {
                        detector.start();
                    }
                }
            }
        }
        this.updateProvider();
    }
    updateProvider() {
        if (!this.taskProvider && this.detectors.size > 0) {
            const thisCapture = this;
            this.taskProvider = vscode.tasks.registerTaskProvider('grunt', {
                provideTasks: () => {
                    return thisCapture.getTasks();
                },
                resolveTask(_task) {
                    return thisCapture.getTask(_task);
                }
            });
        }
        else if (this.taskProvider && this.detectors.size === 0) {
            this.taskProvider.dispose();
            this.taskProvider = undefined;
        }
    }
    getTasks() {
        return this.computeTasks();
    }
    computeTasks() {
        if (this.detectors.size === 0) {
            return Promise.resolve([]);
        }
        else if (this.detectors.size === 1) {
            return this.detectors.values().next().value.getTasks();
        }
        else {
            const promises = [];
            for (const detector of this.detectors.values()) {
                promises.push(detector.getTasks().then((value) => value, () => []));
            }
            return Promise.all(promises).then((values) => {
                const result = [];
                for (const tasks of values) {
                    if (tasks && tasks.length > 0) {
                        result.push(...tasks);
                    }
                }
                return result;
            });
        }
    }
    async getTask(task) {
        if (this.detectors.size === 0) {
            return undefined;
        }
        else if (this.detectors.size === 1) {
            return this.detectors.values().next().value.getTask(task);
        }
        else {
            if ((task.scope === vscode.TaskScope.Workspace) || (task.scope === vscode.TaskScope.Global)) {
                return undefined;
            }
            else if (task.scope) {
                const detector = this.detectors.get(task.scope.uri.toString());
                if (detector) {
                    return detector.getTask(task);
                }
            }
            return undefined;
        }
    }
}
let detector;
function activate(_context) {
    detector = new TaskDetector();
    detector.start();
}
function deactivate() {
    detector.dispose();
}
//# sourceMappingURL=main.js.map