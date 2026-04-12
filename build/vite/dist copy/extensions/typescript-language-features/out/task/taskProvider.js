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
exports.register = register;
const jsonc = __importStar(require("jsonc-parser"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const testUtils_1 = require("../test/testUtils");
const typescriptService_1 = require("../typescriptService");
const arrays_1 = require("../utils/arrays");
const configuration_1 = require("../utils/configuration");
const dispose_1 = require("../utils/dispose");
const fs_1 = require("../utils/fs");
const languageDescription_1 = require("../configuration/languageDescription");
const tsconfig_1 = require("../tsconfig");
const tsconfigProvider_1 = require("./tsconfigProvider");
var AutoDetect;
(function (AutoDetect) {
    AutoDetect["on"] = "on";
    AutoDetect["off"] = "off";
    AutoDetect["build"] = "build";
    AutoDetect["watch"] = "watch";
})(AutoDetect || (AutoDetect = {}));
/**
 * Provides tasks for building `tsconfig.json` files in a project.
 */
class TscTaskProvider extends dispose_1.Disposable {
    client;
    projectInfoRequestTimeout = 2000;
    findConfigFilesTimeout = 5000;
    autoDetect = AutoDetect.on;
    tsconfigProvider;
    constructor(client) {
        super();
        this.client = client;
        this.tsconfigProvider = new tsconfigProvider_1.TsConfigProvider();
        this._register(vscode.workspace.onDidChangeConfiguration(this.onConfigurationChanged, this));
        this.onConfigurationChanged();
    }
    async provideTasks(token) {
        const folders = vscode.workspace.workspaceFolders;
        if ((this.autoDetect === AutoDetect.off) || !folders?.length) {
            return [];
        }
        const configPaths = new Set();
        const tasks = [];
        for (const project of await this.getAllTsConfigs(token)) {
            if (!configPaths.has(project.fsPath)) {
                configPaths.add(project.fsPath);
                tasks.push(...(await this.getTasksForProject(project)));
            }
        }
        return tasks;
    }
    async resolveTask(task) {
        const definition = task.definition;
        if (/\\tsconfig.*\.json/.test(definition.tsconfig)) {
            // Warn that the task has the wrong slash type
            vscode.window.showWarningMessage(vscode.l10n.t("TypeScript Task in tasks.json contains \"\\\\\". TypeScript tasks tsconfig must use \"/\""));
            return undefined;
        }
        const tsconfigPath = definition.tsconfig;
        if (!tsconfigPath) {
            return undefined;
        }
        if (task.scope === undefined || task.scope === vscode.TaskScope.Global || task.scope === vscode.TaskScope.Workspace) {
            // scope is required to be a WorkspaceFolder for resolveTask
            return undefined;
        }
        const tsconfigUri = task.scope.uri.with({ path: task.scope.uri.path + '/' + tsconfigPath });
        const tsconfig = {
            uri: tsconfigUri,
            fsPath: tsconfigUri.fsPath,
            posixPath: tsconfigUri.path,
            workspaceFolder: task.scope
        };
        return this.getTasksForProjectAndDefinition(tsconfig, definition);
    }
    async getAllTsConfigs(token) {
        const configs = (await Promise.all([
            this.getTsConfigForActiveFile(token),
            this.getTsConfigsInWorkspace(token),
        ])).flat();
        return Promise.all(configs.map(async (config) => await (0, fs_1.exists)(config.uri) ? config : undefined)).then(arrays_1.coalesce);
    }
    async getTsConfigForActiveFile(token) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            if ((0, languageDescription_1.isTsConfigFileName)(editor.document.fileName)) {
                const uri = editor.document.uri;
                return [{
                        uri,
                        fsPath: uri.fsPath,
                        posixPath: uri.path,
                        workspaceFolder: vscode.workspace.getWorkspaceFolder(uri)
                    }];
            }
        }
        const file = this.getActiveTypeScriptFile();
        if (!file) {
            return [];
        }
        const response = await Promise.race([
            this.client.value.execute('projectInfo', { file, needFileNameList: false }, token),
            new Promise(resolve => setTimeout(() => resolve(typescriptService_1.ServerResponse.NoContent), this.projectInfoRequestTimeout))
        ]);
        if (response.type !== 'response' || !response.body) {
            return [];
        }
        const { configFileName } = response.body;
        if (configFileName && !(0, tsconfig_1.isImplicitProjectConfigFile)(configFileName)) {
            const normalizedConfigPath = path.normalize(configFileName);
            const uri = vscode.Uri.file(normalizedConfigPath);
            const folder = vscode.workspace.getWorkspaceFolder(uri);
            return [{
                    uri,
                    fsPath: normalizedConfigPath,
                    posixPath: uri.path,
                    workspaceFolder: folder
                }];
        }
        return [];
    }
    async getTsConfigsInWorkspace(token) {
        const getConfigsTimeout = new vscode.CancellationTokenSource();
        token.onCancellationRequested(() => getConfigsTimeout.cancel());
        return Promise.race([
            this.tsconfigProvider.getConfigsForWorkspace(getConfigsTimeout.token).then(x => Array.from(x)),
            (0, testUtils_1.wait)(this.findConfigFilesTimeout).then(() => {
                getConfigsTimeout.cancel();
                return [];
            }),
        ]);
    }
    static async getCommand(project) {
        if (project.workspaceFolder) {
            const localTsc = await TscTaskProvider.getLocalTscAtPath(path.dirname(project.fsPath));
            if (localTsc) {
                return localTsc;
            }
            const workspaceTsc = await TscTaskProvider.getLocalTscAtPath(project.workspaceFolder.uri.fsPath);
            if (workspaceTsc) {
                return workspaceTsc;
            }
        }
        // Use global tsc version
        return 'tsc';
    }
    static async getLocalTscAtPath(folderPath) {
        const platform = process.platform;
        const bin = path.join(folderPath, 'node_modules', '.bin');
        if (platform === 'win32' && await (0, fs_1.exists)(vscode.Uri.file(path.join(bin, 'tsc.cmd')))) {
            return path.join(bin, 'tsc.cmd');
        }
        else if ((platform === 'linux' || platform === 'darwin') && await (0, fs_1.exists)(vscode.Uri.file(path.join(bin, 'tsc')))) {
            return path.join(bin, 'tsc');
        }
        return undefined;
    }
    getActiveTypeScriptFile() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            if (document && (document.languageId === 'typescript' || document.languageId === 'typescriptreact')) {
                return this.client.value.toTsFilePath(document.uri);
            }
        }
        return undefined;
    }
    getBuildTask(workspaceFolder, label, command, args, buildTaskidentifier) {
        const buildTask = new vscode.Task(buildTaskidentifier, workspaceFolder || vscode.TaskScope.Workspace, vscode.l10n.t("build - {0}", label), 'tsc', new vscode.ShellExecution(command, args), '$tsc');
        buildTask.group = vscode.TaskGroup.Build;
        buildTask.isBackground = false;
        return buildTask;
    }
    getWatchTask(workspaceFolder, label, command, args, watchTaskidentifier) {
        const watchTask = new vscode.Task(watchTaskidentifier, workspaceFolder || vscode.TaskScope.Workspace, vscode.l10n.t("watch - {0}", label), 'tsc', new vscode.ShellExecution(command, [...args, '--watch']), '$tsc-watch');
        watchTask.group = vscode.TaskGroup.Build;
        watchTask.isBackground = true;
        return watchTask;
    }
    async getTasksForProject(project) {
        const command = await TscTaskProvider.getCommand(project);
        const args = await this.getBuildShellArgs(project);
        const label = this.getLabelForTasks(project);
        const tasks = [];
        if (this.autoDetect === AutoDetect.build || this.autoDetect === AutoDetect.on) {
            tasks.push(this.getBuildTask(project.workspaceFolder, label, command, args, { type: 'typescript', tsconfig: label }));
        }
        if (this.autoDetect === AutoDetect.watch || this.autoDetect === AutoDetect.on) {
            tasks.push(this.getWatchTask(project.workspaceFolder, label, command, args, { type: 'typescript', tsconfig: label, option: 'watch' }));
        }
        return tasks;
    }
    async getTasksForProjectAndDefinition(project, definition) {
        const command = await TscTaskProvider.getCommand(project);
        const args = await this.getBuildShellArgs(project);
        const label = this.getLabelForTasks(project);
        let task;
        if (definition.option === undefined) {
            task = this.getBuildTask(project.workspaceFolder, label, command, args, definition);
        }
        else if (definition.option === 'watch') {
            task = this.getWatchTask(project.workspaceFolder, label, command, args, definition);
        }
        return task;
    }
    async getBuildShellArgs(project) {
        const defaultArgs = ['-p', project.fsPath];
        try {
            const bytes = await vscode.workspace.fs.readFile(project.uri);
            const text = Buffer.from(bytes).toString('utf-8');
            const tsconfig = jsonc.parse(text);
            if (tsconfig?.references) {
                return ['-b', project.fsPath];
            }
        }
        catch {
            // noops
        }
        return defaultArgs;
    }
    getLabelForTasks(project) {
        if (project.workspaceFolder) {
            const workspaceNormalizedUri = vscode.Uri.file(path.normalize(project.workspaceFolder.uri.fsPath)); // Make sure the drive letter is lowercase
            return path.posix.relative(workspaceNormalizedUri.path, project.posixPath);
        }
        return project.posixPath;
    }
    onConfigurationChanged() {
        const type = (0, configuration_1.readUnifiedConfig)('tsc.autoDetect', undefined, { fallbackSection: 'typescript' });
        this.autoDetect = typeof type === 'undefined' ? AutoDetect.on : type;
    }
}
function register(lazyClient) {
    return vscode.tasks.registerTaskProvider('typescript', new TscTaskProvider(lazyClient));
}
//# sourceMappingURL=taskProvider.js.map