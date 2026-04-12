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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NpmTaskProvider = exports.INSTALL_SCRIPT = void 0;
exports.invalidateTasksCache = invalidateTasksCache;
exports.isWorkspaceFolder = isWorkspaceFolder;
exports.getScriptRunner = getScriptRunner;
exports.getPackageManager = getPackageManager;
exports.detectPackageManager = detectPackageManager;
exports.hasNpmScripts = hasNpmScripts;
exports.detectNpmScriptsForFolder = detectNpmScriptsForFolder;
exports.provideNpmScripts = provideNpmScripts;
exports.isAutoDetectionEnabled = isAutoDetectionEnabled;
exports.getTaskName = getTaskName;
exports.getRunScriptCommand = getRunScriptCommand;
exports.createScriptRunnerTask = createScriptRunnerTask;
exports.createInstallationTask = createInstallationTask;
exports.getPackageJsonUriFromTask = getPackageJsonUriFromTask;
exports.hasPackageJson = hasPackageJson;
exports.runScript = runScript;
exports.startDebugging = startDebugging;
exports.findScriptAtPosition = findScriptAtPosition;
exports.getScripts = getScripts;
const vscode_1 = require("vscode");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const minimatch_1 = __importDefault(require("minimatch"));
const vscode_uri_1 = require("vscode-uri");
const preferred_pm_1 = require("./preferred-pm");
const readScripts_1 = require("./readScripts");
const excludeRegex = new RegExp('^(node_modules|.vscode-test)$', 'i');
let cachedTasks = undefined;
exports.INSTALL_SCRIPT = 'install';
class NpmTaskProvider {
    context;
    constructor(context) {
        this.context = context;
    }
    get tasksWithLocation() {
        return provideNpmScripts(this.context, false);
    }
    async provideTasks() {
        const tasks = await provideNpmScripts(this.context, true);
        return tasks.map(task => task.task);
    }
    async resolveTask(_task) {
        const npmTask = _task.definition.script;
        if (npmTask) {
            const kind = _task.definition;
            let packageJsonUri;
            if (_task.scope === undefined || _task.scope === vscode_1.TaskScope.Global || _task.scope === vscode_1.TaskScope.Workspace) {
                // scope is required to be a WorkspaceFolder for resolveTask
                return undefined;
            }
            if (kind.path) {
                packageJsonUri = _task.scope.uri.with({ path: _task.scope.uri.path + '/' + kind.path + `${kind.path.endsWith('/') ? '' : '/'}` + 'package.json' });
            }
            else {
                packageJsonUri = _task.scope.uri.with({ path: _task.scope.uri.path + '/package.json' });
            }
            let task;
            if (kind.script === exports.INSTALL_SCRIPT) {
                task = await createInstallationTask(this.context, _task.scope, packageJsonUri);
            }
            else {
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
exports.NpmTaskProvider = NpmTaskProvider;
function invalidateTasksCache() {
    cachedTasks = undefined;
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
        if (name === testName) {
            return true;
        }
    }
    return false;
}
const preScripts = new Set([
    'install', 'pack', 'pack', 'publish', 'restart', 'shrinkwrap',
    'stop', 'test', 'uninstall', 'version'
]);
const postScripts = new Set([
    'install', 'pack', 'pack', 'publish', 'publishOnly', 'restart', 'shrinkwrap',
    'stop', 'test', 'uninstall', 'version'
]);
function canHavePrePostScript(name) {
    return preScripts.has(name) || postScripts.has(name);
}
function isWorkspaceFolder(value) {
    return value && typeof value !== 'number';
}
async function getScriptRunner(folder, context, showWarning) {
    let scriptRunner = vscode_1.workspace.getConfiguration('npm', folder).get('scriptRunner', 'npm');
    if (scriptRunner === 'auto') {
        scriptRunner = await detectPackageManager(folder, context, showWarning);
    }
    return scriptRunner;
}
async function getPackageManager(folder, context, showWarning) {
    let packageManager = vscode_1.workspace.getConfiguration('npm', folder).get('packageManager', 'npm');
    if (packageManager === 'auto') {
        packageManager = await detectPackageManager(folder, context, showWarning);
    }
    return packageManager;
}
async function detectPackageManager(folder, extensionContext, showWarning = false) {
    const { name, multipleLockFilesDetected: multiplePMDetected } = await (0, preferred_pm_1.findPreferredPM)(folder.fsPath);
    const neverShowWarning = 'npm.multiplePMWarning.neverShow';
    if (showWarning && multiplePMDetected && extensionContext && !extensionContext.globalState.get(neverShowWarning)) {
        const multiplePMWarning = vscode_1.l10n.t('Using {0} as the preferred package manager. Found multiple lockfiles for {1}.  To resolve this issue, delete the lockfiles that don\'t match your preferred package manager or change the setting "npm.packageManager" to a value other than "auto".', name, folder.fsPath);
        const neverShowAgain = vscode_1.l10n.t("Do not show again");
        const learnMore = vscode_1.l10n.t("Learn more");
        vscode_1.window.showInformationMessage(multiplePMWarning, learnMore, neverShowAgain).then(result => {
            switch (result) {
                case neverShowAgain:
                    extensionContext.globalState.update(neverShowWarning, true);
                    break;
                case learnMore: vscode_1.env.openExternal(vscode_1.Uri.parse('https://docs.npmjs.com/cli/v9/configuring-npm/package-lock-json'));
            }
        });
    }
    return name;
}
async function hasNpmScripts() {
    const folders = vscode_1.workspace.workspaceFolders;
    if (!folders) {
        return false;
    }
    for (const folder of folders) {
        if (isAutoDetectionEnabled(folder) && !excludeRegex.test(vscode_uri_1.Utils.basename(folder.uri))) {
            const relativePattern = new vscode_1.RelativePattern(folder, '**/package.json');
            const paths = await vscode_1.workspace.findFiles(relativePattern, '**/node_modules/**');
            if (paths.length > 0) {
                return true;
            }
        }
    }
    return false;
}
async function* findNpmPackages() {
    const visitedPackageJsonFiles = new Set();
    const folders = vscode_1.workspace.workspaceFolders;
    if (!folders) {
        return;
    }
    for (const folder of folders) {
        if (isAutoDetectionEnabled(folder) && !excludeRegex.test(vscode_uri_1.Utils.basename(folder.uri))) {
            const relativePattern = new vscode_1.RelativePattern(folder, '**/package.json');
            const paths = await vscode_1.workspace.findFiles(relativePattern, '**/{node_modules,.vscode-test}/**');
            for (const path of paths) {
                if (!isExcluded(folder, path) && !visitedPackageJsonFiles.has(path.fsPath)) {
                    yield path;
                    visitedPackageJsonFiles.add(path.fsPath);
                }
            }
        }
    }
}
async function detectNpmScriptsForFolder(context, folder) {
    const folderTasks = [];
    if (excludeRegex.test(vscode_uri_1.Utils.basename(folder))) {
        return folderTasks;
    }
    const relativePattern = new vscode_1.RelativePattern(folder.fsPath, '**/package.json');
    const paths = await vscode_1.workspace.findFiles(relativePattern, '**/node_modules/**');
    const visitedPackageJsonFiles = new Set();
    for (const path of paths) {
        if (!visitedPackageJsonFiles.has(path.fsPath)) {
            const tasks = await provideNpmScriptsForFolder(context, path, true);
            visitedPackageJsonFiles.add(path.fsPath);
            folderTasks.push(...tasks.map(t => ({ label: t.task.name, task: t.task })));
        }
    }
    return folderTasks;
}
async function provideNpmScripts(context, showWarning) {
    if (!cachedTasks) {
        const allTasks = [];
        for await (const path of findNpmPackages()) {
            const tasks = await provideNpmScriptsForFolder(context, path, showWarning);
            allTasks.push(...tasks);
        }
        cachedTasks = allTasks;
    }
    return cachedTasks;
}
function isAutoDetectionEnabled(folder) {
    return vscode_1.workspace.getConfiguration('npm', folder?.uri).get('autoDetect') === 'on';
}
function isExcluded(folder, packageJsonUri) {
    function testForExclusionPattern(path, pattern) {
        return (0, minimatch_1.default)(path, pattern, { dot: true });
    }
    const exclude = vscode_1.workspace.getConfiguration('npm', folder.uri).get('exclude');
    const packageJsonFolder = path.dirname(packageJsonUri.fsPath);
    if (exclude) {
        if (Array.isArray(exclude)) {
            for (const pattern of exclude) {
                if (testForExclusionPattern(packageJsonFolder, pattern)) {
                    return true;
                }
            }
        }
        else if (testForExclusionPattern(packageJsonFolder, exclude)) {
            return true;
        }
    }
    return false;
}
function isDebugScript(script) {
    const match = script.match(/--(inspect|debug)(-brk)?(=((\[[0-9a-fA-F:]*\]|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[a-zA-Z0-9\.]*):)?(\d+))?/);
    return match !== null;
}
async function provideNpmScriptsForFolder(context, packageJsonUri, showWarning) {
    const emptyTasks = [];
    const folder = vscode_1.workspace.getWorkspaceFolder(packageJsonUri);
    if (!folder) {
        return emptyTasks;
    }
    const scripts = await getScripts(packageJsonUri);
    if (!scripts) {
        return emptyTasks;
    }
    const result = [];
    for (const { name, value, nameRange } of scripts.scripts) {
        const task = await createScriptRunnerTask(context, name, folder, packageJsonUri, value, showWarning);
        result.push({ task, location: new vscode_1.Location(packageJsonUri, nameRange) });
    }
    if (!vscode_1.workspace.getConfiguration('npm', folder).get('scriptExplorerExclude', []).find(e => e.includes(exports.INSTALL_SCRIPT))) {
        result.push({ task: await createInstallationTask(context, folder, packageJsonUri, 'install dependencies from package', showWarning) });
    }
    return result;
}
function getTaskName(script, relativePath) {
    if (relativePath && relativePath.length) {
        return `${script} - ${relativePath.substring(0, relativePath.length - 1)}`;
    }
    return script;
}
function escapeCommandLine(cmd) {
    return cmd.map(arg => {
        if (/\s/.test(arg)) {
            return { value: arg, quoting: arg.includes('--') ? vscode_1.ShellQuoting.Weak : vscode_1.ShellQuoting.Strong };
        }
        else {
            return arg;
        }
    });
}
function getRelativePath(rootUri, packageJsonUri) {
    const absolutePath = packageJsonUri.path.substring(0, packageJsonUri.path.length - 'package.json'.length);
    return absolutePath.substring(rootUri.path.length + 1);
}
async function getRunScriptCommand(script, folder, context, showWarning = true) {
    const scriptRunner = await getScriptRunner(folder, context, showWarning);
    if (scriptRunner === 'node') {
        return ['node', '--run', script];
    }
    else {
        const result = [scriptRunner, 'run'];
        if (vscode_1.workspace.getConfiguration('npm', folder).get('runSilent')) {
            result.push('--silent');
        }
        result.push(script);
        return result;
    }
}
async function createScriptRunnerTask(context, script, folder, packageJsonUri, scriptValue, showWarning) {
    const kind = { type: 'npm', script };
    const relativePackageJson = getRelativePath(folder.uri, packageJsonUri);
    if (relativePackageJson.length && !kind.path) {
        kind.path = relativePackageJson.substring(0, relativePackageJson.length - 1);
    }
    const taskName = getTaskName(script, relativePackageJson);
    const cwd = path.dirname(packageJsonUri.fsPath);
    const args = await getRunScriptCommand(script, folder.uri, context, showWarning);
    const scriptRunner = args.shift();
    const task = new vscode_1.Task(kind, folder, taskName, 'npm', new vscode_1.ShellExecution(scriptRunner, escapeCommandLine(args), { cwd: cwd }));
    task.detail = scriptValue;
    const lowerCaseTaskName = script.toLowerCase();
    if (isBuildTask(lowerCaseTaskName)) {
        task.group = vscode_1.TaskGroup.Build;
    }
    else if (isTestTask(lowerCaseTaskName)) {
        task.group = vscode_1.TaskGroup.Test;
    }
    else if (canHavePrePostScript(lowerCaseTaskName)) {
        task.group = vscode_1.TaskGroup.Clean; // hack: use Clean group to tag pre/post scripts
    }
    else if (scriptValue && isDebugScript(scriptValue)) {
        // todo@connor4312: all scripts are now debuggable, what is a 'debug script'?
        task.group = vscode_1.TaskGroup.Rebuild; // hack: use Rebuild group to tag debug scripts
    }
    return task;
}
async function getInstallDependenciesCommand(folder, context, showWarning = true) {
    const packageManager = await getPackageManager(folder, context, showWarning);
    const result = [packageManager, exports.INSTALL_SCRIPT];
    if (vscode_1.workspace.getConfiguration('npm', folder).get('runSilent')) {
        result.push('--silent');
    }
    return result;
}
async function createInstallationTask(context, folder, packageJsonUri, scriptValue, showWarning) {
    const kind = { type: 'npm', script: exports.INSTALL_SCRIPT };
    const relativePackageJson = getRelativePath(folder.uri, packageJsonUri);
    if (relativePackageJson.length && !kind.path) {
        kind.path = relativePackageJson.substring(0, relativePackageJson.length - 1);
    }
    const taskName = getTaskName(exports.INSTALL_SCRIPT, relativePackageJson);
    const cwd = path.dirname(packageJsonUri.fsPath);
    const args = await getInstallDependenciesCommand(folder.uri, context, showWarning);
    const packageManager = args.shift();
    const task = new vscode_1.Task(kind, folder, taskName, 'npm', new vscode_1.ShellExecution(packageManager, escapeCommandLine(args), { cwd: cwd }));
    task.detail = scriptValue;
    task.group = vscode_1.TaskGroup.Clean;
    return task;
}
function getPackageJsonUriFromTask(task) {
    if (isWorkspaceFolder(task.scope)) {
        if (task.definition.path) {
            return vscode_1.Uri.file(path.join(task.scope.uri.fsPath, task.definition.path, 'package.json'));
        }
        else {
            return vscode_1.Uri.file(path.join(task.scope.uri.fsPath, 'package.json'));
        }
    }
    return null;
}
async function hasPackageJson() {
    // Faster than `findFiles` for workspaces with a root package.json.
    if (await hasRootPackageJson()) {
        return true;
    }
    const token = new vscode_1.CancellationTokenSource();
    // Search for files for max 1 second.
    const timeout = setTimeout(() => token.cancel(), 1000);
    const files = await vscode_1.workspace.findFiles('**/package.json', undefined, 1, token.token);
    clearTimeout(timeout);
    return files.length > 0;
}
async function hasRootPackageJson() {
    const folders = vscode_1.workspace.workspaceFolders;
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
async function exists(file) {
    return new Promise((resolve, _reject) => {
        fs.exists(file, (value) => {
            resolve(value);
        });
    });
}
async function runScript(context, script, document) {
    const uri = document.uri;
    const folder = vscode_1.workspace.getWorkspaceFolder(uri);
    if (folder) {
        const task = await createScriptRunnerTask(context, script, folder, uri);
        vscode_1.tasks.executeTask(task);
    }
}
async function startDebugging(context, scriptName, cwd, folder) {
    const runScriptCommand = await getRunScriptCommand(scriptName, folder.uri, context, true);
    vscode_1.commands.executeCommand('extension.js-debug.createDebuggerTerminal', runScriptCommand.join(' '), folder, { cwd });
}
function findScriptAtPosition(document, buffer, position) {
    const read = (0, readScripts_1.readScripts)(document, buffer);
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
async function getScripts(packageJsonUri) {
    if (packageJsonUri.scheme !== 'file') {
        return undefined;
    }
    const packageJson = packageJsonUri.fsPath;
    if (!await exists(packageJson)) {
        return undefined;
    }
    try {
        const document = await vscode_1.workspace.openTextDocument(packageJsonUri);
        return (0, readScripts_1.readScripts)(document);
    }
    catch (e) {
        const localizedParseError = vscode_1.l10n.t("Npm task detection: failed to parse the file {0}", packageJsonUri.fsPath);
        throw new Error(localizedParseError);
    }
}
//# sourceMappingURL=tasks.js.map