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
exports.deactivate = deactivate;
exports._activate = _activate;
exports.getExtensionContext = getExtensionContext;
exports.activate = activate;
const vscode_1 = require("vscode");
const git_1 = require("./git");
const model_1 = require("./model");
const commands_1 = require("./commands");
const fileSystemProvider_1 = require("./fileSystemProvider");
const decorationProvider_1 = require("./decorationProvider");
const askpass_1 = require("./askpass");
const util_1 = require("./util");
const extension_telemetry_1 = __importDefault(require("@vscode/extension-telemetry"));
const protocolHandler_1 = require("./protocolHandler");
const extension_1 = require("./api/extension");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const timelineProvider_1 = require("./timelineProvider");
const api1_1 = require("./api/api1");
const terminal_1 = require("./terminal");
const ipcServer_1 = require("./ipc/ipcServer");
const gitEditor_1 = require("./gitEditor");
const postCommitCommands_1 = require("./postCommitCommands");
const editSessionIdentityProvider_1 = require("./editSessionIdentityProvider");
const diagnostics_1 = require("./diagnostics");
const blame_1 = require("./blame");
const cloneManager_1 = require("./cloneManager");
const askpassManager_1 = require("./askpassManager");
const deactivateTasks = [];
async function deactivate() {
    for (const task of deactivateTasks) {
        await task();
    }
}
async function createModel(context, logger, telemetryReporter, disposables) {
    const pathValue = vscode_1.workspace.getConfiguration('git').get('path');
    let pathHints = Array.isArray(pathValue) ? pathValue : pathValue ? [pathValue] : [];
    const { isTrusted, workspaceFolders = [] } = vscode_1.workspace;
    const excludes = isTrusted ? [] : workspaceFolders.map(f => path.normalize(f.uri.fsPath).replace(/[\r\n]+$/, ''));
    if (!isTrusted && pathHints.length !== 0) {
        // Filter out any non-absolute paths
        pathHints = pathHints.filter(p => path.isAbsolute(p));
    }
    const info = await (0, git_1.findGit)(pathHints, gitPath => {
        logger.info(vscode_1.l10n.t('[main] Validating found git in: "{0}"', gitPath));
        if (excludes.length === 0) {
            return true;
        }
        const normalized = path.normalize(gitPath).replace(/[\r\n]+$/, '');
        const skip = excludes.some(e => normalized.startsWith(e));
        if (skip) {
            logger.info(vscode_1.l10n.t('[main] Skipped found git in: "{0}"', gitPath));
        }
        return !skip;
    }, logger);
    let ipcServer = undefined;
    try {
        ipcServer = await (0, ipcServer_1.createIPCServer)(context.storagePath);
    }
    catch (err) {
        logger.error(`[main] Failed to create git IPC: ${err}`);
    }
    const askpassPaths = await (0, askpassManager_1.getAskpassPaths)(__dirname, context.globalStorageUri.fsPath, logger);
    const askpass = new askpass_1.Askpass(ipcServer, logger, askpassPaths);
    disposables.push(askpass);
    const gitEditor = new gitEditor_1.GitEditor(ipcServer);
    disposables.push(gitEditor);
    const environment = { ...askpass.getEnv(), ...gitEditor.getEnv(), ...ipcServer?.getEnv() };
    const terminalEnvironmentManager = new terminal_1.TerminalEnvironmentManager(context, [askpass, gitEditor, ipcServer]);
    disposables.push(terminalEnvironmentManager);
    logger.info(vscode_1.l10n.t('[main] Using git "{0}" from "{1}"', info.version, info.path));
    const git = new git_1.Git({
        gitPath: info.path,
        userAgent: `git/${info.version} (${os.version() ?? os.type()} ${os.release()}; ${os.platform()} ${os.arch()}) vscode/${vscode_1.version} (${vscode_1.env.appName})`,
        version: info.version,
        env: environment,
    });
    const model = new model_1.Model(git, askpass, context.globalState, context.workspaceState, logger, telemetryReporter);
    disposables.push(model);
    const cloneManager = new cloneManager_1.CloneManager(model, telemetryReporter, model.repositoryCache);
    const onRepository = () => vscode_1.commands.executeCommand('setContext', 'gitOpenRepositoryCount', `${model.repositories.length}`);
    model.onDidOpenRepository(onRepository, null, disposables);
    model.onDidCloseRepository(onRepository, null, disposables);
    onRepository();
    const onOutput = (str) => {
        const lines = str.split(/\r?\n/mg);
        while (/^\s*$/.test(lines[lines.length - 1])) {
            lines.pop();
        }
        logger.appendLine(lines.join('\n'));
    };
    git.onOutput.addListener('log', onOutput);
    disposables.push((0, util_1.toDisposable)(() => git.onOutput.removeListener('log', onOutput)));
    const cc = new commands_1.CommandCenter(git, model, context.globalState, logger, telemetryReporter, cloneManager);
    disposables.push(cc, new fileSystemProvider_1.GitFileSystemProvider(model, logger), new decorationProvider_1.GitDecorations(model), new blame_1.GitBlameController(model), new timelineProvider_1.GitTimelineProvider(model, cc), new editSessionIdentityProvider_1.GitEditSessionIdentityProvider(model), new terminal_1.TerminalShellExecutionManager(model, logger));
    const postCommitCommandsProvider = new postCommitCommands_1.GitPostCommitCommandsProvider(model);
    model.registerPostCommitCommandsProvider(postCommitCommandsProvider);
    const diagnosticsManager = new diagnostics_1.GitCommitInputBoxDiagnosticsManager(model);
    disposables.push(diagnosticsManager);
    const codeActionsProvider = new diagnostics_1.GitCommitInputBoxCodeActionsProvider(diagnosticsManager);
    disposables.push(codeActionsProvider);
    const gitEditorDocumentLinkProvider = vscode_1.languages.registerDocumentLinkProvider('git-commit', new gitEditor_1.GitEditorDocumentLinkProvider(model));
    disposables.push(gitEditorDocumentLinkProvider);
    checkGitVersion(info);
    vscode_1.commands.executeCommand('setContext', 'gitVersion2.35', git.compareGitVersionTo('2.35') >= 0);
    return { model, cloneManager };
}
async function isGitRepository(folder) {
    if (folder.uri.scheme !== 'file') {
        return false;
    }
    const dotGit = path.join(folder.uri.fsPath, '.git');
    try {
        const dotGitStat = await new Promise((c, e) => fs.stat(dotGit, (err, stat) => err ? e(err) : c(stat)));
        return dotGitStat.isDirectory();
    }
    catch (err) {
        return false;
    }
}
async function warnAboutMissingGit() {
    const config = vscode_1.workspace.getConfiguration('git');
    const shouldIgnore = config.get('ignoreMissingGitWarning') === true;
    if (shouldIgnore) {
        return;
    }
    if (!vscode_1.workspace.workspaceFolders) {
        return;
    }
    const areGitRepositories = await Promise.all(vscode_1.workspace.workspaceFolders.map(isGitRepository));
    if (areGitRepositories.every(isGitRepository => !isGitRepository)) {
        return;
    }
    const download = vscode_1.l10n.t('Download Git');
    const neverShowAgain = vscode_1.l10n.t('Don\'t Show Again');
    const choice = await vscode_1.window.showWarningMessage(vscode_1.l10n.t('Git not found. Install it or configure it using the "git.path" setting.'), download, neverShowAgain);
    if (choice === download) {
        vscode_1.commands.executeCommand('vscode.open', vscode_1.Uri.parse('https://aka.ms/vscode-download-git'));
    }
    else if (choice === neverShowAgain) {
        await config.update('ignoreMissingGitWarning', true, true);
    }
}
async function _activate(context) {
    const disposables = [];
    context.subscriptions.push(new vscode_1.Disposable(() => vscode_1.Disposable.from(...disposables).dispose()));
    const logger = vscode_1.window.createOutputChannel('Git', { log: true });
    disposables.push(logger);
    const onDidChangeLogLevel = (logLevel) => {
        logger.appendLine(vscode_1.l10n.t('[main] Log level: {0}', vscode_1.LogLevel[logLevel]));
    };
    disposables.push(logger.onDidChangeLogLevel(onDidChangeLogLevel));
    onDidChangeLogLevel(logger.logLevel);
    const { aiKey } = require('../package.json');
    const telemetryReporter = new extension_telemetry_1.default(aiKey);
    deactivateTasks.push(() => telemetryReporter.dispose());
    const config = vscode_1.workspace.getConfiguration('git', null);
    const enabled = config.get('enabled');
    if (!enabled) {
        const onConfigChange = (0, util_1.filterEvent)(vscode_1.workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git'));
        const onEnabled = (0, util_1.filterEvent)(onConfigChange, () => vscode_1.workspace.getConfiguration('git', null).get('enabled') === true);
        const result = new extension_1.GitExtensionImpl();
        (0, util_1.eventToPromise)(onEnabled).then(async () => {
            const { model, cloneManager } = await createModel(context, logger, telemetryReporter, disposables);
            result.model = model;
            result.cloneManager = cloneManager;
        });
        return result;
    }
    try {
        const { model, cloneManager } = await createModel(context, logger, telemetryReporter, disposables);
        return new extension_1.GitExtensionImpl({ model, cloneManager });
    }
    catch (err) {
        console.warn(err.message);
        logger.warn(`[main] Failed to create model: ${err}`);
        if (!/Git installation not found/.test(err.message || '')) {
            throw err;
        }
        /* __GDPR__
            "git.missing" : {
                "owner": "lszomoru"
            }
        */
        telemetryReporter.sendTelemetryEvent('git.missing');
        vscode_1.commands.executeCommand('setContext', 'git.missing', true);
        warnAboutMissingGit();
        return new extension_1.GitExtensionImpl();
    }
    finally {
        disposables.push(new protocolHandler_1.GitProtocolHandler(logger));
    }
}
let _context;
function getExtensionContext() {
    return _context;
}
async function activate(context) {
    _context = context;
    const result = await _activate(context);
    context.subscriptions.push((0, api1_1.registerAPICommands)(result));
    return result;
}
async function checkGitv1(info) {
    const config = vscode_1.workspace.getConfiguration('git');
    const shouldIgnore = config.get('ignoreLegacyWarning') === true;
    if (shouldIgnore) {
        return;
    }
    if (!/^[01]/.test(info.version)) {
        return;
    }
    const update = vscode_1.l10n.t('Update Git');
    const neverShowAgain = vscode_1.l10n.t('Don\'t Show Again');
    const choice = await vscode_1.window.showWarningMessage(vscode_1.l10n.t('You seem to have git "{0}" installed. Code works best with git >= 2', info.version), update, neverShowAgain);
    if (choice === update) {
        vscode_1.commands.executeCommand('vscode.open', vscode_1.Uri.parse('https://aka.ms/vscode-download-git'));
    }
    else if (choice === neverShowAgain) {
        await config.update('ignoreLegacyWarning', true, true);
    }
}
async function checkGitWindows(info) {
    if (!/^2\.(25|26)\./.test(info.version)) {
        return;
    }
    const config = vscode_1.workspace.getConfiguration('git');
    const shouldIgnore = config.get('ignoreWindowsGit27Warning') === true;
    if (shouldIgnore) {
        return;
    }
    const update = vscode_1.l10n.t('Update Git');
    const neverShowAgain = vscode_1.l10n.t('Don\'t Show Again');
    const choice = await vscode_1.window.showWarningMessage(vscode_1.l10n.t('There are known issues with the installed Git "{0}". Please update to Git >= 2.27 for the git features to work correctly.', info.version), update, neverShowAgain);
    if (choice === update) {
        vscode_1.commands.executeCommand('vscode.open', vscode_1.Uri.parse('https://aka.ms/vscode-download-git'));
    }
    else if (choice === neverShowAgain) {
        await config.update('ignoreWindowsGit27Warning', true, true);
    }
}
async function checkGitVersion(info) {
    await checkGitv1(info);
    if (process.platform === 'win32') {
        await checkGitWindows(info);
    }
}
//# sourceMappingURL=main.js.map