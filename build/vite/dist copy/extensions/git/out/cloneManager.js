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
exports.CloneManager = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const remoteSource_1 = require("./remoteSource");
const vscode_1 = require("vscode");
var PostCloneAction;
(function (PostCloneAction) {
    PostCloneAction[PostCloneAction["Open"] = 0] = "Open";
    PostCloneAction[PostCloneAction["OpenNewWindow"] = 1] = "OpenNewWindow";
    PostCloneAction[PostCloneAction["AddToWorkspace"] = 2] = "AddToWorkspace";
    PostCloneAction[PostCloneAction["None"] = 3] = "None";
})(PostCloneAction || (PostCloneAction = {}));
class CloneManager {
    model;
    telemetryReporter;
    repositoryCache;
    constructor(model, telemetryReporter, repositoryCache) {
        this.model = model;
        this.telemetryReporter = telemetryReporter;
        this.repositoryCache = repositoryCache;
    }
    async clone(url, options = {}) {
        if (!url || typeof url !== 'string') {
            url = await (0, remoteSource_1.pickRemoteSource)({
                providerLabel: provider => vscode_1.l10n.t('Clone from {0}', provider.name),
                urlLabel: vscode_1.l10n.t('Clone from URL')
            });
        }
        if (!url) {
            /* __GDPR__
                "clone" : {
                    "owner": "lszomoru",
                    "outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the git operation" },
                    "openFolder": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Indicates whether the folder is opened following the clone operation" }
                }
            */
            this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'no_URL' });
            return;
        }
        url = url.trim().replace(/^git\s+clone\s+/, '');
        const cachedRepository = this.repositoryCache.get(url);
        if (cachedRepository && (cachedRepository.length > 0)) {
            return this.tryOpenExistingRepository(cachedRepository, url, options.postCloneAction, options.parentPath, options.ref);
        }
        return this.cloneRepository(url, options.parentPath, options);
    }
    async cloneRepository(url, parentPath, options = {}) {
        if (!parentPath) {
            const config = vscode_1.workspace.getConfiguration('git');
            let defaultCloneDirectory = config.get('defaultCloneDirectory') || os.homedir();
            defaultCloneDirectory = defaultCloneDirectory.replace(/^~/, os.homedir());
            const uris = await vscode_1.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri: vscode_1.Uri.file(defaultCloneDirectory),
                title: vscode_1.l10n.t('Choose a folder to clone {0} into', url),
                openLabel: vscode_1.l10n.t('Select as Repository Destination')
            });
            if (!uris || uris.length === 0) {
                /* __GDPR__
                    "clone" : {
                        "owner": "lszomoru",
                        "outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the git operation" },
                        "openFolder": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Indicates whether the folder is opened following the clone operation" }
                    }
                */
                this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'no_directory' });
                return;
            }
            const uri = uris[0];
            parentPath = uri.fsPath;
        }
        try {
            const opts = {
                location: vscode_1.ProgressLocation.Notification,
                title: vscode_1.l10n.t('Cloning git repository "{0}"...', url),
                cancellable: true
            };
            const repositoryPath = await vscode_1.window.withProgress(opts, (progress, token) => this.model.git.clone(url, { parentPath: parentPath, progress, recursive: options.recursive, ref: options.ref }, token));
            await this.doPostCloneAction(repositoryPath, options.postCloneAction);
            return repositoryPath;
        }
        catch (err) {
            if (/already exists and is not an empty directory/.test(err && err.stderr || '')) {
                /* __GDPR__
                    "clone" : {
                        "owner": "lszomoru",
                        "outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the git operation" },
                        "openFolder": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Indicates whether the folder is opened following the clone operation" }
                    }
                */
                this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'directory_not_empty' });
            }
            else if (/Cancelled/i.test(err && (err.message || err.stderr || ''))) {
                return;
            }
            else {
                /* __GDPR__
                    "clone" : {
                        "owner": "lszomoru",
                        "outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the git operation" },
                        "openFolder": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Indicates whether the folder is opened following the clone operation" }
                    }
                */
                this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'error' });
            }
            throw err;
        }
    }
    async doPostCloneAction(target, postCloneAction) {
        const config = vscode_1.workspace.getConfiguration('git');
        const openAfterClone = config.get('openAfterClone');
        let action = undefined;
        if (postCloneAction && postCloneAction === 'none') {
            action = PostCloneAction.None;
        }
        else {
            if (openAfterClone === 'always') {
                action = PostCloneAction.Open;
            }
            else if (openAfterClone === 'alwaysNewWindow') {
                action = PostCloneAction.OpenNewWindow;
            }
            else if (openAfterClone === 'whenNoFolderOpen' && !vscode_1.workspace.workspaceFolders) {
                action = PostCloneAction.Open;
            }
        }
        if (action === undefined) {
            let message = vscode_1.l10n.t('Would you like to open the repository?');
            const open = vscode_1.l10n.t('Open');
            const openNewWindow = vscode_1.l10n.t('Open in New Window');
            const choices = [open, openNewWindow];
            const addToWorkspace = vscode_1.l10n.t('Add to Workspace');
            if (vscode_1.workspace.workspaceFolders) {
                message = vscode_1.l10n.t('Would you like to open the repository, or add it to the current workspace?');
                choices.push(addToWorkspace);
            }
            const result = await vscode_1.window.showInformationMessage(message, { modal: true }, ...choices);
            action = result === open ? PostCloneAction.Open
                : result === openNewWindow ? PostCloneAction.OpenNewWindow
                    : result === addToWorkspace ? PostCloneAction.AddToWorkspace : undefined;
        }
        /* __GDPR__
            "clone" : {
                "owner": "lszomoru",
                "outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the git operation" },
                "openFolder": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Indicates whether the folder is opened following the clone operation" }
            }
        */
        this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'success' }, { openFolder: action === PostCloneAction.Open || action === PostCloneAction.OpenNewWindow ? 1 : 0 });
        const uri = vscode_1.Uri.file(target);
        if (action === PostCloneAction.Open) {
            vscode_1.commands.executeCommand('vscode.openFolder', uri, { forceReuseWindow: true });
        }
        else if (action === PostCloneAction.AddToWorkspace) {
            vscode_1.workspace.updateWorkspaceFolders(vscode_1.workspace.workspaceFolders.length, 0, { uri });
        }
        else if (action === PostCloneAction.OpenNewWindow) {
            vscode_1.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
        }
    }
    async chooseExistingRepository(url, existingCachedRepositories, ref, parentPath, postCloneAction) {
        try {
            const items = existingCachedRepositories.map(knownFolder => {
                const isWorkspace = knownFolder.workspacePath.endsWith('.code-workspace');
                const label = isWorkspace ? vscode_1.l10n.t('Workspace: {0}', path.basename(knownFolder.workspacePath, '.code-workspace')) : path.basename(knownFolder.workspacePath);
                return { label, description: knownFolder.workspacePath, item: knownFolder };
            });
            const cloneAgain = { label: vscode_1.l10n.t('Clone again') };
            items.push(cloneAgain);
            const placeHolder = vscode_1.l10n.t('Open Existing Repository Clone');
            const pick = await vscode_1.window.showQuickPick(items, { placeHolder, canPickMany: false });
            if (pick === cloneAgain) {
                return (await this.cloneRepository(url, parentPath, { ref, postCloneAction })) ?? undefined;
            }
            if (!pick?.item) {
                return undefined;
            }
            return pick.item.workspacePath;
        }
        catch {
            return undefined;
        }
    }
    async tryOpenExistingRepository(cachedRepository, url, postCloneAction, parentPath, ref) {
        // Gather existing folders/workspace files (ignore ones that no longer exist)
        const existingCachedRepositories = (await Promise.all(cachedRepository.map(async (folder) => {
            const stat = await fs.promises.stat(folder.workspacePath).catch(() => undefined);
            if (stat) {
                return folder;
            }
            return undefined;
        }))).filter((folder) => folder !== undefined);
        if (!existingCachedRepositories.length) {
            // fallback to clone
            return (await this.cloneRepository(url, parentPath, { ref, postCloneAction }) ?? undefined);
        }
        // First, find the cached repo that exists in the current workspace
        const matchingInCurrentWorkspace = existingCachedRepositories?.find(cachedRepo => {
            return vscode_1.workspace.workspaceFolders?.some(workspaceFolder => workspaceFolder.uri.fsPath === cachedRepo.workspacePath);
        });
        if (matchingInCurrentWorkspace) {
            return matchingInCurrentWorkspace.workspacePath;
        }
        let repoForWorkspace = (existingCachedRepositories.length === 1 ? existingCachedRepositories[0].workspacePath : undefined);
        if (!repoForWorkspace) {
            repoForWorkspace = await this.chooseExistingRepository(url, existingCachedRepositories, ref, parentPath, postCloneAction);
        }
        if (repoForWorkspace) {
            await this.doPostCloneAction(repoForWorkspace, postCloneAction);
            return repoForWorkspace;
        }
        return;
    }
}
exports.CloneManager = CloneManager;
//# sourceMappingURL=cloneManager.js.map