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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
exports.Model = void 0;
const vscode_1 = require("vscode");
const repository_1 = require("./repository");
const decorators_1 = require("./decorators");
const util_1 = require("./util");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const uri_1 = require("./uri");
const api1_1 = require("./api/api1");
const repositoryCache_1 = require("./repositoryCache");
class RepositoryPick {
    repository;
    index;
    get label() {
        return path.basename(this.repository.root);
    }
    get description() {
        return [this.repository.headLabel, this.repository.syncLabel]
            .filter(l => !!l)
            .join(' ');
    }
    get iconPath() {
        switch (this.repository.kind) {
            case 'submodule':
                return new vscode_1.ThemeIcon('archive');
            case 'worktree':
                return new vscode_1.ThemeIcon('list-tree');
            default:
                return new vscode_1.ThemeIcon('repo');
        }
    }
    constructor(repository, index) {
        this.repository = repository;
        this.index = index;
    }
}
__decorate([
    decorators_1.memoize
], RepositoryPick.prototype, "label", null);
__decorate([
    decorators_1.memoize
], RepositoryPick.prototype, "description", null);
__decorate([
    decorators_1.memoize
], RepositoryPick.prototype, "iconPath", null);
class ClosedRepositoriesManager {
    workspaceState;
    _repositories;
    get repositories() {
        return [...this._repositories.values()];
    }
    constructor(workspaceState) {
        this.workspaceState = workspaceState;
        this._repositories = new Set(workspaceState.get('closedRepositories', []));
        this.onDidChangeRepositories();
    }
    addRepository(repository) {
        this._repositories.add(repository);
        this.onDidChangeRepositories();
    }
    deleteRepository(repository) {
        const result = this._repositories.delete(repository);
        if (result) {
            this.onDidChangeRepositories();
        }
        return result;
    }
    isRepositoryClosed(repository) {
        return this._repositories.has(repository);
    }
    onDidChangeRepositories() {
        this.workspaceState.update('closedRepositories', [...this._repositories.values()]);
        vscode_1.commands.executeCommand('setContext', 'git.closedRepositoryCount', this._repositories.size);
    }
}
class ParentRepositoriesManager {
    globalState;
    /**
     * Key   - normalized path used in user interface
     * Value - value indicating whether the repository should be opened
     */
    _repositories = new Set;
    get repositories() {
        return [...this._repositories.values()];
    }
    constructor(globalState) {
        this.globalState = globalState;
        this.onDidChangeRepositories();
    }
    addRepository(repository) {
        this._repositories.add(repository);
        this.onDidChangeRepositories();
    }
    deleteRepository(repository) {
        const result = this._repositories.delete(repository);
        if (result) {
            this.onDidChangeRepositories();
        }
        return result;
    }
    hasRepository(repository) {
        return this._repositories.has(repository);
    }
    openRepository(repository) {
        this.globalState.update(`parentRepository:${repository}`, true);
        this.deleteRepository(repository);
    }
    onDidChangeRepositories() {
        vscode_1.commands.executeCommand('setContext', 'git.parentRepositoryCount', this._repositories.size);
    }
}
class UnsafeRepositoriesManager {
    /**
     * Key   - normalized path used in user interface
     * Value - path extracted from the output of the `git status` command
     *         used when calling `git config --global --add safe.directory`
     */
    _repositories = new Map();
    get repositories() {
        return [...this._repositories.keys()];
    }
    constructor() {
        this.onDidChangeRepositories();
    }
    addRepository(repository, path) {
        this._repositories.set(repository, path);
        this.onDidChangeRepositories();
    }
    deleteRepository(repository) {
        const result = this._repositories.delete(repository);
        if (result) {
            this.onDidChangeRepositories();
        }
        return result;
    }
    getRepositoryPath(repository) {
        return this._repositories.get(repository);
    }
    hasRepository(repository) {
        return this._repositories.has(repository);
    }
    onDidChangeRepositories() {
        vscode_1.commands.executeCommand('setContext', 'git.unsafeRepositoryCount', this._repositories.size);
    }
}
class Model {
    git;
    askpass;
    globalState;
    workspaceState;
    logger;
    telemetryReporter;
    _onDidOpenRepository = new vscode_1.EventEmitter();
    onDidOpenRepository = this._onDidOpenRepository.event;
    _onDidCloseRepository = new vscode_1.EventEmitter();
    onDidCloseRepository = this._onDidCloseRepository.event;
    _onDidChangeRepository = new vscode_1.EventEmitter();
    onDidChangeRepository = this._onDidChangeRepository.event;
    _onDidChangeOriginalResource = new vscode_1.EventEmitter();
    onDidChangeOriginalResource = this._onDidChangeOriginalResource.event;
    openRepositories = [];
    get repositories() { return this.openRepositories.map(r => r.repository); }
    possibleGitRepositoryPaths = new Set();
    _onDidChangeState = new vscode_1.EventEmitter();
    onDidChangeState = this._onDidChangeState.event;
    _onDidPublish = new vscode_1.EventEmitter();
    onDidPublish = this._onDidPublish.event;
    firePublishEvent(repository, branch) {
        this._onDidPublish.fire({ repository: new api1_1.ApiRepository(repository), branch: branch });
    }
    _state = 'uninitialized';
    get state() { return this._state; }
    setState(state) {
        this._state = state;
        this._onDidChangeState.fire(state);
        vscode_1.commands.executeCommand('setContext', 'git.state', state);
    }
    get isInitialized() {
        if (this._state === 'initialized') {
            return Promise.resolve();
        }
        return (0, util_1.eventToPromise)((0, util_1.filterEvent)(this.onDidChangeState, s => s === 'initialized'));
    }
    remoteSourcePublishers = new Set();
    _onDidAddRemoteSourcePublisher = new vscode_1.EventEmitter();
    onDidAddRemoteSourcePublisher = this._onDidAddRemoteSourcePublisher.event;
    _onDidRemoveRemoteSourcePublisher = new vscode_1.EventEmitter();
    onDidRemoveRemoteSourcePublisher = this._onDidRemoveRemoteSourcePublisher.event;
    postCommitCommandsProviders = new Set();
    _onDidChangePostCommitCommandsProviders = new vscode_1.EventEmitter();
    onDidChangePostCommitCommandsProviders = this._onDidChangePostCommitCommandsProviders.event;
    branchProtectionProviders = new Map();
    _onDidChangeBranchProtectionProviders = new vscode_1.EventEmitter();
    onDidChangeBranchProtectionProviders = this._onDidChangeBranchProtectionProviders.event;
    pushErrorHandlers = new Set();
    historyItemDetailsProviders = new Set();
    _unsafeRepositoriesManager;
    get unsafeRepositories() {
        return this._unsafeRepositoriesManager.repositories;
    }
    _parentRepositoriesManager;
    get parentRepositories() {
        return this._parentRepositoriesManager.repositories;
    }
    _closedRepositoriesManager;
    get closedRepositories() {
        return [...this._closedRepositoriesManager.repositories];
    }
    /**
     * We maintain a map containing both the path and the canonical path of the
     * workspace folders. We are doing this as `git.exe` expands the symbolic links
     * while there are scenarios in which VS Code does not.
     *
     * Key   - path of the workspace folder
     * Value - canonical path of the workspace folder
     */
    _workspaceFolders = new Map();
    _repositoryCache;
    get repositoryCache() {
        return this._repositoryCache;
    }
    disposables = [];
    constructor(git, askpass, globalState, workspaceState, logger, telemetryReporter) {
        this.git = git;
        this.askpass = askpass;
        this.globalState = globalState;
        this.workspaceState = workspaceState;
        this.logger = logger;
        this.telemetryReporter = telemetryReporter;
        // Repositories managers
        this._closedRepositoriesManager = new ClosedRepositoriesManager(workspaceState);
        this._parentRepositoriesManager = new ParentRepositoriesManager(globalState);
        this._unsafeRepositoriesManager = new UnsafeRepositoriesManager();
        vscode_1.workspace.onDidChangeWorkspaceFolders(this.onDidChangeWorkspaceFolders, this, this.disposables);
        vscode_1.workspace.onDidChangeWorkspaceTrustedFolders(this.onDidChangeWorkspaceTrustedFolders, this, this.disposables);
        vscode_1.window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors, this, this.disposables);
        vscode_1.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor, this, this.disposables);
        vscode_1.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this, this.disposables);
        const fsWatcher = vscode_1.workspace.createFileSystemWatcher('**');
        this.disposables.push(fsWatcher);
        const onWorkspaceChange = (0, util_1.anyEvent)(fsWatcher.onDidChange, fsWatcher.onDidCreate, fsWatcher.onDidDelete);
        const onGitRepositoryChange = (0, util_1.filterEvent)(onWorkspaceChange, uri => /\/\.git/.test(uri.path));
        const onPossibleGitRepositoryChange = (0, util_1.filterEvent)(onGitRepositoryChange, uri => !this.getRepository(uri));
        onPossibleGitRepositoryChange(this.onPossibleGitRepositoryChange, this, this.disposables);
        this.setState('uninitialized');
        this.doInitialScan().finally(() => this.setState('initialized'));
        this._repositoryCache = new repositoryCache_1.RepositoryCache(globalState, logger);
    }
    async doInitialScan() {
        this.logger.info('[Model][doInitialScan] Initial repository scan started');
        const config = vscode_1.workspace.getConfiguration('git');
        const autoRepositoryDetection = config.get('autoRepositoryDetection');
        const parentRepositoryConfig = config.get('openRepositoryInParentFolders', 'prompt');
        this.logger.trace(`[Model][doInitialScan] Settings: autoRepositoryDetection=${autoRepositoryDetection}, openRepositoryInParentFolders=${parentRepositoryConfig}`);
        // Initial repository scan function
        const initialScanFn = () => Promise.all([
            this.onDidChangeWorkspaceFolders({ added: vscode_1.workspace.workspaceFolders || [], removed: [] }),
            this.onDidChangeVisibleTextEditors(vscode_1.window.visibleTextEditors),
            this.scanWorkspaceFolders()
        ]);
        if (config.get('showProgress', true)) {
            await vscode_1.window.withProgress({ location: vscode_1.ProgressLocation.SourceControl }, initialScanFn);
        }
        else {
            await initialScanFn();
        }
        if (this.parentRepositories.length !== 0 &&
            parentRepositoryConfig === 'prompt') {
            // Parent repositories notification
            this.showParentRepositoryNotification();
        }
        else if (this.unsafeRepositories.length !== 0) {
            // Unsafe repositories notification
            this.showUnsafeRepositoryNotification();
        }
        /* __GDPR__
            "git.repositoryInitialScan" : {
                "owner": "lszomoru",
                "autoRepositoryDetection": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Setting that controls the initial repository scan" },
                "repositoryCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of repositories opened during initial repository scan" }
            }
        */
        this.telemetryReporter.sendTelemetryEvent('git.repositoryInitialScan', { autoRepositoryDetection: String(autoRepositoryDetection) }, { repositoryCount: this.openRepositories.length });
        this.logger.info(`[Model][doInitialScan] Initial repository scan completed - repositories (${this.repositories.length}), closed repositories (${this.closedRepositories.length}), parent repositories (${this.parentRepositories.length}), unsafe repositories (${this.unsafeRepositories.length})`);
    }
    /**
     * Scans each workspace folder, looking for git repositories. By
     * default it scans one level deep but that can be changed using
     * the git.repositoryScanMaxDepth setting.
     */
    async scanWorkspaceFolders() {
        try {
            const config = vscode_1.workspace.getConfiguration('git');
            const autoRepositoryDetection = config.get('autoRepositoryDetection');
            if (autoRepositoryDetection !== true && autoRepositoryDetection !== 'subFolders') {
                return;
            }
            await Promise.all((vscode_1.workspace.workspaceFolders || []).map(async (folder) => {
                const root = folder.uri.fsPath;
                this.logger.trace(`[Model][scanWorkspaceFolders] Workspace folder: ${root}`);
                // Workspace folder children
                const repositoryScanMaxDepth = (vscode_1.workspace.isTrusted ? vscode_1.workspace.getConfiguration('git', folder.uri) : config).get('repositoryScanMaxDepth', 1);
                const repositoryScanIgnoredFolders = (vscode_1.workspace.isTrusted ? vscode_1.workspace.getConfiguration('git', folder.uri) : config).get('repositoryScanIgnoredFolders', []);
                const subfolders = new Set(await this.traverseWorkspaceFolder(root, repositoryScanMaxDepth, repositoryScanIgnoredFolders));
                // Repository scan folders
                const scanPaths = (vscode_1.workspace.isTrusted ? vscode_1.workspace.getConfiguration('git', folder.uri) : config).get('scanRepositories') || [];
                this.logger.trace(`[Model][scanWorkspaceFolders] Workspace scan settings: repositoryScanMaxDepth=${repositoryScanMaxDepth}; repositoryScanIgnoredFolders=[${repositoryScanIgnoredFolders.join(', ')}]; scanRepositories=[${scanPaths.join(', ')}]`);
                for (const scanPath of scanPaths) {
                    if (scanPath === '.git') {
                        this.logger.trace('[Model][scanWorkspaceFolders] \'.git\' not supported in \'git.scanRepositories\' setting.');
                        continue;
                    }
                    if (path.isAbsolute(scanPath)) {
                        const notSupportedMessage = vscode_1.l10n.t('Absolute paths not supported in "git.scanRepositories" setting.');
                        this.logger.warn(`[Model][scanWorkspaceFolders] ${notSupportedMessage}`);
                        console.warn(notSupportedMessage);
                        continue;
                    }
                    subfolders.add(path.join(root, scanPath));
                }
                this.logger.trace(`[Model][scanWorkspaceFolders] Workspace scan sub folders: [${[...subfolders].join(', ')}]`);
                await Promise.all([...subfolders].map(f => this.openRepository(f)));
            }));
        }
        catch (err) {
            this.logger.warn(`[Model][scanWorkspaceFolders] Error: ${err}`);
        }
    }
    async traverseWorkspaceFolder(workspaceFolder, maxDepth, repositoryScanIgnoredFolders) {
        const result = [];
        const foldersToTravers = [{ path: workspaceFolder, depth: 0 }];
        while (foldersToTravers.length > 0) {
            const currentFolder = foldersToTravers.shift();
            const children = [];
            try {
                children.push(...await fs.promises.readdir(currentFolder.path, { withFileTypes: true }));
                if (currentFolder.depth !== 0) {
                    result.push(currentFolder.path);
                }
            }
            catch (err) {
                this.logger.warn(`[Model][traverseWorkspaceFolder] Unable to read workspace folder '${currentFolder.path}': ${err}`);
                continue;
            }
            if (currentFolder.depth < maxDepth || maxDepth === -1) {
                const childrenFolders = children
                    .filter(dirent => dirent.isDirectory() && dirent.name !== '.git' &&
                    !repositoryScanIgnoredFolders.find(f => (0, util_1.pathEquals)(dirent.name, f)))
                    .map(dirent => path.join(currentFolder.path, dirent.name));
                foldersToTravers.push(...childrenFolders.map(folder => {
                    return { path: folder, depth: currentFolder.depth + 1 };
                }));
            }
        }
        return result;
    }
    onPossibleGitRepositoryChange(uri) {
        const config = vscode_1.workspace.getConfiguration('git');
        const autoRepositoryDetection = config.get('autoRepositoryDetection');
        if (autoRepositoryDetection === false) {
            return;
        }
        this.eventuallyScanPossibleGitRepository(uri.fsPath.replace(/\.git.*$/, ''));
    }
    eventuallyScanPossibleGitRepository(path) {
        this.possibleGitRepositoryPaths.add(path);
        this.eventuallyScanPossibleGitRepositories();
    }
    eventuallyScanPossibleGitRepositories() {
        for (const path of this.possibleGitRepositoryPaths) {
            this.openRepository(path);
        }
        this.possibleGitRepositoryPaths.clear();
    }
    async onDidChangeWorkspaceFolders({ added, removed }) {
        try {
            const possibleRepositoryFolders = added
                .filter(folder => !this.getOpenRepository(folder.uri));
            const activeRepositoriesList = vscode_1.window.visibleTextEditors
                .map(editor => this.getRepository(editor.document.uri))
                .filter(repository => !!repository);
            const activeRepositories = new Set(activeRepositoriesList);
            const openRepositoriesToDispose = removed
                .map(folder => this.getOpenRepository(folder.uri))
                .filter(r => !!r)
                .filter(r => !activeRepositories.has(r.repository))
                .filter(r => !(vscode_1.workspace.workspaceFolders || []).some(f => (0, util_1.isDescendant)(f.uri.fsPath, r.repository.root)));
            openRepositoriesToDispose.forEach(r => r.dispose());
            this.logger.trace(`[Model][onDidChangeWorkspaceFolders] Workspace folders: [${possibleRepositoryFolders.map(p => p.uri.fsPath).join(', ')}]`);
            await Promise.all(possibleRepositoryFolders.map(p => this.openRepository(p.uri.fsPath)));
        }
        catch (err) {
            this.logger.warn(`[Model][onDidChangeWorkspaceFolders] Error: ${err}`);
        }
    }
    async onDidChangeWorkspaceTrustedFolders() {
        try {
            const openRepositoriesToDispose = [];
            for (const openRepository of this.openRepositories) {
                const dotGitPath = openRepository.repository.dotGit.commonPath ?? openRepository.repository.dotGit.path;
                const isTrusted = await vscode_1.workspace.isResourceTrusted(vscode_1.Uri.file(path.dirname(dotGitPath)));
                if (!isTrusted) {
                    openRepositoriesToDispose.push(openRepository);
                    this.logger.trace(`[Model][onDidChangeWorkspaceTrustedFolders] Repository is no longer trusted: ${openRepository.repository.root}`);
                }
            }
            openRepositoriesToDispose.forEach(r => r.dispose());
        }
        catch (err) {
            this.logger.warn(`[Model][onDidChangeWorkspaceTrustedFolders] Error: ${err}`);
        }
    }
    onDidChangeConfiguration() {
        const possibleRepositoryFolders = (vscode_1.workspace.workspaceFolders || [])
            .filter(folder => vscode_1.workspace.getConfiguration('git', folder.uri).get('enabled') === true)
            .filter(folder => !this.getOpenRepository(folder.uri));
        const openRepositoriesToDispose = this.openRepositories
            .map(repository => ({ repository, root: vscode_1.Uri.file(repository.repository.root) }))
            .filter(({ root }) => vscode_1.workspace.getConfiguration('git', root).get('enabled') !== true)
            .map(({ repository }) => repository);
        this.logger.trace(`[Model][onDidChangeConfiguration] Workspace folders: [${possibleRepositoryFolders.map(p => p.uri.fsPath).join(', ')}]`);
        possibleRepositoryFolders.forEach(p => this.openRepository(p.uri.fsPath));
        openRepositoriesToDispose.forEach(r => r.dispose());
    }
    async onDidChangeVisibleTextEditors(editors) {
        try {
            if (!vscode_1.workspace.isTrusted) {
                this.logger.trace('[Model][onDidChangeVisibleTextEditors] Workspace is not trusted.');
                return;
            }
            const config = vscode_1.workspace.getConfiguration('git');
            const autoRepositoryDetection = config.get('autoRepositoryDetection');
            if (autoRepositoryDetection !== true && autoRepositoryDetection !== 'openEditors') {
                return;
            }
            await Promise.all(editors.map(async (editor) => {
                const uri = editor.document.uri;
                if (uri.scheme !== 'file') {
                    return;
                }
                const repository = this.getRepository(uri);
                if (repository) {
                    this.logger.trace(`[Model][onDidChangeVisibleTextEditors] Repository for editor resource ${uri.fsPath} already exists: ${repository.root}`);
                    return;
                }
                this.logger.trace(`[Model][onDidChangeVisibleTextEditors] Open repository for editor resource ${uri.fsPath}`);
                await this.openRepository(path.dirname(uri.fsPath));
            }));
        }
        catch (err) {
            this.logger.warn(`[Model][onDidChangeVisibleTextEditors] Error: ${err}`);
        }
    }
    onDidChangeActiveTextEditor() {
        const textEditor = vscode_1.window.activeTextEditor;
        if (textEditor === undefined) {
            vscode_1.commands.executeCommand('setContext', 'git.activeResourceHasUnstagedChanges', false);
            vscode_1.commands.executeCommand('setContext', 'git.activeResourceHasStagedChanges', false);
            vscode_1.commands.executeCommand('setContext', 'git.activeResourceHasMergeConflicts', false);
            return;
        }
        const repository = this.getRepository(textEditor.document.uri);
        if (!repository) {
            vscode_1.commands.executeCommand('setContext', 'git.activeResourceHasUnstagedChanges', false);
            vscode_1.commands.executeCommand('setContext', 'git.activeResourceHasStagedChanges', false);
            vscode_1.commands.executeCommand('setContext', 'git.activeResourceHasMergeConflicts', false);
            return;
        }
        const indexResource = repository.indexGroup.resourceStates
            .find(resource => (0, util_1.pathEquals)(resource.resourceUri.fsPath, textEditor.document.uri.fsPath));
        const workingTreeResource = repository.workingTreeGroup.resourceStates
            .find(resource => (0, util_1.pathEquals)(resource.resourceUri.fsPath, textEditor.document.uri.fsPath));
        const mergeChangesResource = repository.mergeGroup.resourceStates
            .find(resource => (0, util_1.pathEquals)(resource.resourceUri.fsPath, textEditor.document.uri.fsPath));
        const hasMergeConflicts = mergeChangesResource ? /^(<{7,}|={7,}|>{7,})/m.test(textEditor.document.getText()) : false;
        vscode_1.commands.executeCommand('setContext', 'git.activeResourceHasStagedChanges', indexResource !== undefined);
        vscode_1.commands.executeCommand('setContext', 'git.activeResourceHasUnstagedChanges', workingTreeResource !== undefined);
        vscode_1.commands.executeCommand('setContext', 'git.activeResourceHasMergeConflicts', hasMergeConflicts);
    }
    async openRepository(repoPath, openIfClosed = false, openIfParent = false) {
        this.logger.trace(`[Model][openRepository] Repository: ${repoPath}`);
        const existingRepository = await this.getRepositoryExact(repoPath);
        if (existingRepository) {
            this.logger.trace(`[Model][openRepository] Repository for path ${repoPath} already exists: ${existingRepository.root}`);
            return;
        }
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(repoPath));
        const enabled = config.get('enabled') === true;
        if (!enabled) {
            this.logger.trace('[Model][openRepository] Git is not enabled');
            return;
        }
        try {
            const { repositoryRoot, unsafeRepositoryMatch } = await this.getRepositoryRoot(repoPath);
            this.logger.trace(`[Model][openRepository] Repository root for path ${repoPath} is: ${repositoryRoot}`);
            const existingRepository = await this.getRepositoryExact(repositoryRoot);
            if (existingRepository) {
                this.logger.trace(`[Model][openRepository] Repository for path ${repositoryRoot} already exists: ${existingRepository.root}`);
                return;
            }
            if (this.shouldRepositoryBeIgnored(repositoryRoot)) {
                this.logger.trace(`[Model][openRepository] Repository for path ${repositoryRoot} is ignored`);
                return;
            }
            // Handle git repositories that are in parent folders
            const parentRepositoryConfig = config.get('openRepositoryInParentFolders', 'prompt');
            if (parentRepositoryConfig !== 'always' && this.globalState.get(`parentRepository:${repositoryRoot}`) !== true) {
                const isRepositoryOutsideWorkspace = await this.isRepositoryOutsideWorkspace(repositoryRoot);
                if (!openIfParent && isRepositoryOutsideWorkspace) {
                    this.logger.trace(`[Model][openRepository] Repository in parent folder: ${repositoryRoot}`);
                    if (!this._parentRepositoriesManager.hasRepository(repositoryRoot)) {
                        // Show a notification if the parent repository is opened after the initial scan
                        if (this.state === 'initialized' && parentRepositoryConfig === 'prompt') {
                            this.showParentRepositoryNotification();
                        }
                        this._parentRepositoriesManager.addRepository(repositoryRoot);
                    }
                    return;
                }
            }
            // Handle unsafe repositories
            if (unsafeRepositoryMatch && unsafeRepositoryMatch.length === 3) {
                this.logger.trace(`[Model][openRepository] Unsafe repository: ${repositoryRoot}`);
                // Show a notification if the unsafe repository is opened after the initial scan
                if (this._state === 'initialized' && !this._unsafeRepositoriesManager.hasRepository(repositoryRoot)) {
                    this.showUnsafeRepositoryNotification();
                }
                this._unsafeRepositoriesManager.addRepository(repositoryRoot, unsafeRepositoryMatch[2]);
                return;
            }
            // Handle repositories that were closed by the user
            if (!openIfClosed && this._closedRepositoriesManager.isRepositoryClosed(repositoryRoot)) {
                this.logger.trace(`[Model][openRepository] Repository for path ${repositoryRoot} is closed`);
                return;
            }
            // Get .git path and real path
            const [dotGit, repositoryRootRealPath] = await Promise.all([this.git.getRepositoryDotGit(repositoryRoot), this.getRepositoryRootRealPath(repositoryRoot)]);
            // Check that the folder containing the .git folder is trusted
            const dotGitPath = dotGit.commonPath ?? dotGit.path;
            const result = await vscode_1.workspace.requestResourceTrust({
                message: vscode_1.l10n.t('You are opening a repository from a location that is not trusted. Do you trust the authors of the files in the repository you are opening?'),
                uri: vscode_1.Uri.file(path.dirname(dotGitPath)),
            });
            if (!result) {
                this.logger.trace(`[Model][openRepository] Repository folder is not trusted: ${path.dirname(dotGitPath)}`);
                return;
            }
            // Open repository
            const gitRepository = this.git.open(repositoryRoot, repositoryRootRealPath, dotGit, this.logger);
            const repository = new repository_1.Repository(gitRepository, this, this, this, this, this, this, this.globalState, this.logger, this.telemetryReporter, this._repositoryCache);
            this.open(repository);
            this._closedRepositoriesManager.deleteRepository(repository.root);
            this.logger.info(`[Model][openRepository] Opened repository (path): ${repository.root}`);
            this.logger.info(`[Model][openRepository] Opened repository (real path): ${repository.rootRealPath ?? repository.root}`);
            this.logger.info(`[Model][openRepository] Opened repository (kind): ${gitRepository.kind}`);
            // Do not await this, we want SCM
            // to know about the repo asap
            repository.status().then(() => {
                this._repositoryCache.update(repository.remotes, [], repository.root);
            });
        }
        catch (err) {
            // noop
            this.logger.trace(`[Model][openRepository] Opening repository for path='${repoPath}' failed. Error:${err}`);
        }
    }
    async openParentRepository(repoPath) {
        this._parentRepositoriesManager.openRepository(repoPath);
        await this.openRepository(repoPath);
    }
    async getRepositoryRoot(repoPath) {
        try {
            const rawRoot = await this.git.getRepositoryRoot(repoPath);
            // This can happen whenever `path` has the wrong case sensitivity in case
            // insensitive file systems https://github.com/microsoft/vscode/issues/33498
            return { repositoryRoot: vscode_1.Uri.file(rawRoot).fsPath, unsafeRepositoryMatch: null };
        }
        catch (err) {
            // Handle unsafe repository
            const unsafeRepositoryMatch = /^fatal: detected dubious ownership in repository at \'([^']+)\'[\s\S]*git config --global --add safe\.directory '?([^'\n]+)'?$/m.exec(err.stderr);
            if (unsafeRepositoryMatch && unsafeRepositoryMatch.length === 3) {
                return { repositoryRoot: path.normalize(unsafeRepositoryMatch[1]), unsafeRepositoryMatch };
            }
            throw err;
        }
    }
    async getRepositoryRootRealPath(repositoryRoot) {
        try {
            const repositoryRootRealPath = await fs.promises.realpath(repositoryRoot);
            return !(0, util_1.pathEquals)(repositoryRoot, repositoryRootRealPath) ? repositoryRootRealPath : undefined;
        }
        catch (err) {
            this.logger.warn(`[Model][getRepositoryRootRealPath] Failed to get repository realpath for "${repositoryRoot}": ${err}`);
            return undefined;
        }
    }
    shouldRepositoryBeIgnored(repositoryRoot) {
        const config = vscode_1.workspace.getConfiguration('git');
        const ignoredRepos = config.get('ignoredRepositories') || [];
        for (const ignoredRepo of ignoredRepos) {
            if (path.isAbsolute(ignoredRepo)) {
                if ((0, util_1.pathEquals)(ignoredRepo, repositoryRoot)) {
                    return true;
                }
            }
            else {
                for (const folder of vscode_1.workspace.workspaceFolders || []) {
                    if ((0, util_1.pathEquals)(path.join(folder.uri.fsPath, ignoredRepo), repositoryRoot)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    open(repository) {
        this.logger.trace(`[Model][open] Repository: ${repository.root}`);
        const onDidDisappearRepository = (0, util_1.filterEvent)(repository.onDidChangeState, state => state === 1 /* RepositoryState.Disposed */);
        const disappearListener = onDidDisappearRepository(() => dispose());
        const disposeParentListener = repository.sourceControl.onDidDisposeParent(() => dispose());
        const changeListener = repository.onDidChangeRepository(uri => this._onDidChangeRepository.fire({ repository, uri }));
        const originalResourceChangeListener = repository.onDidChangeOriginalResource(uri => this._onDidChangeOriginalResource.fire({ repository, uri }));
        const shouldDetectSubmodules = vscode_1.workspace
            .getConfiguration('git', vscode_1.Uri.file(repository.root))
            .get('detectSubmodules');
        const submodulesLimit = vscode_1.workspace
            .getConfiguration('git', vscode_1.Uri.file(repository.root))
            .get('detectSubmodulesLimit');
        const shouldDetectWorktrees = vscode_1.workspace
            .getConfiguration('git', vscode_1.Uri.file(repository.root))
            .get('detectWorktrees');
        const worktreesLimit = vscode_1.workspace
            .getConfiguration('git', vscode_1.Uri.file(repository.root))
            .get('detectWorktreesLimit');
        const checkForSubmodules = () => {
            if (!shouldDetectSubmodules) {
                this.logger.trace('[Model][open] Automatic detection of git submodules is not enabled.');
                return;
            }
            if (repository.submodules.length > submodulesLimit) {
                vscode_1.window.showWarningMessage(vscode_1.l10n.t('The "{0}" repository has {1} submodules which won\'t be opened automatically. You can still open each one individually by opening a file within.', path.basename(repository.root), repository.submodules.length));
                statusListener.dispose();
            }
            repository.submodules
                .slice(0, submodulesLimit)
                .map(r => path.join(repository.root, r.path))
                .forEach(p => {
                this.logger.trace(`[Model][open] Opening submodule: '${p}'`);
                this.eventuallyScanPossibleGitRepository(p);
            });
        };
        const checkForWorktrees = () => {
            if (!shouldDetectWorktrees) {
                this.logger.trace('[Model][open] Automatic detection of git worktrees is not enabled.');
                return;
            }
            if (repository.kind === 'worktree') {
                this.logger.trace('[Model][open] Automatic detection of git worktrees is not skipped.');
                return;
            }
            if (repository.worktrees.length > worktreesLimit) {
                vscode_1.window.showWarningMessage(vscode_1.l10n.t('The "{0}" repository has {1} worktrees which won\'t be opened automatically. You can still open each one individually by opening a file within.', path.basename(repository.root), repository.worktrees.length));
                statusListener.dispose();
            }
            repository.worktrees
                .slice(0, worktreesLimit)
                .forEach(w => {
                this.logger.trace(`[Model][open] Opening worktree: '${w.path}'`);
                this.eventuallyScanPossibleGitRepository(w.path);
            });
        };
        const updateMergeChanges = () => {
            // set mergeChanges context
            const mergeChanges = [];
            for (const { repository } of this.openRepositories.values()) {
                for (const state of repository.mergeGroup.resourceStates) {
                    mergeChanges.push(state.resourceUri);
                }
            }
            vscode_1.commands.executeCommand('setContext', 'git.mergeChanges', mergeChanges);
        };
        const statusListener = repository.onDidRunGitStatus(() => {
            checkForSubmodules();
            checkForWorktrees();
            updateMergeChanges();
            this.onDidChangeActiveTextEditor();
        });
        checkForSubmodules();
        checkForWorktrees();
        this.onDidChangeActiveTextEditor();
        const updateOperationInProgressContext = () => {
            let operationInProgress = false;
            for (const { repository } of this.openRepositories.values()) {
                if (repository.operations.shouldDisableCommands()) {
                    operationInProgress = true;
                }
            }
            vscode_1.commands.executeCommand('setContext', 'operationInProgress', operationInProgress);
        };
        const operationEvent = (0, util_1.anyEvent)(repository.onDidRunOperation, repository.onRunOperation);
        const operationListener = operationEvent(() => updateOperationInProgressContext());
        updateOperationInProgressContext();
        const dispose = () => {
            disappearListener.dispose();
            disposeParentListener.dispose();
            changeListener.dispose();
            originalResourceChangeListener.dispose();
            statusListener.dispose();
            operationListener.dispose();
            repository.dispose();
            this.openRepositories = this.openRepositories.filter(e => e !== openRepository);
            this._onDidCloseRepository.fire(repository);
        };
        const openRepository = { repository, dispose };
        this.openRepositories.push(openRepository);
        updateMergeChanges();
        this._onDidOpenRepository.fire(repository);
    }
    close(repository) {
        const openRepository = this.getOpenRepository(repository);
        if (!openRepository) {
            return;
        }
        this.logger.info(`[Model][close] Repository: ${repository.root}`);
        this._closedRepositoriesManager.addRepository(openRepository.repository.root);
        this._repositoryCache.update(repository.remotes, [], repository.root);
        openRepository.dispose();
    }
    async pickRepository(repositoryFilter) {
        if (this.openRepositories.length === 0) {
            throw new Error(vscode_1.l10n.t('There are no available repositories'));
        }
        const repositories = this.openRepositories
            .filter(r => !r.repository.isHidden &&
            (!repositoryFilter || repositoryFilter.includes(r.repository.kind)));
        if (repositories.length === 0) {
            throw new Error(vscode_1.l10n.t('There are no available repositories matching the filter'));
        }
        else if (repositories.length === 1) {
            return repositories[0].repository;
        }
        const active = vscode_1.window.activeTextEditor;
        const picks = repositories.map((e, index) => new RepositoryPick(e.repository, index));
        const repository = active && this.getRepository(active.document.fileName);
        const index = picks.findIndex(pick => pick.repository === repository);
        // Move repository pick containing the active text editor to appear first
        if (index > -1) {
            picks.unshift(...picks.splice(index, 1));
        }
        const placeHolder = vscode_1.l10n.t('Choose a repository');
        const pick = await vscode_1.window.showQuickPick(picks, { placeHolder });
        return pick && pick.repository;
    }
    getRepository(hint) {
        const liveRepository = this.getOpenRepository(hint);
        return liveRepository && liveRepository.repository;
    }
    async getRepositoryExact(repoPath) {
        // Use the repository path
        const openRepository = this.openRepositories
            .find(r => (0, util_1.pathEquals)(r.repository.root, repoPath));
        if (openRepository) {
            return openRepository.repository;
        }
        try {
            // Use the repository real path
            const repoPathRealPath = await fs.promises.realpath(repoPath, { encoding: 'utf8' });
            const openRepositoryRealPath = this.openRepositories
                .find(r => (0, util_1.pathEquals)(r.repository.rootRealPath ?? r.repository.root, repoPathRealPath));
            return openRepositoryRealPath?.repository;
        }
        catch (err) {
            this.logger.warn(`[Model][getRepositoryExact] Failed to get repository realpath for: "${repoPath}". Error:${err}`);
            return undefined;
        }
    }
    getOpenRepository(hint) {
        if (!hint) {
            return undefined;
        }
        if (hint instanceof repository_1.Repository) {
            return this.openRepositories.filter(r => r.repository === hint)[0];
        }
        if (hint instanceof api1_1.ApiRepository) {
            hint = hint.rootUri;
        }
        if (typeof hint === 'string') {
            hint = vscode_1.Uri.file(hint);
        }
        if (hint instanceof vscode_1.Uri) {
            let resourcePath;
            if (hint.scheme === 'git') {
                resourcePath = (0, uri_1.fromGitUri)(hint).path;
            }
            else {
                resourcePath = hint.fsPath;
            }
            outer: for (const liveRepository of this.openRepositories.sort((a, b) => b.repository.root.length - a.repository.root.length)) {
                if (!(0, util_1.isDescendant)(liveRepository.repository.root, resourcePath)) {
                    continue;
                }
                for (const submodule of liveRepository.repository.submodules) {
                    const submoduleRoot = path.join(liveRepository.repository.root, submodule.path);
                    if ((0, util_1.isDescendant)(submoduleRoot, resourcePath)) {
                        continue outer;
                    }
                }
                return liveRepository;
            }
            return undefined;
        }
        for (const liveRepository of this.openRepositories) {
            const repository = liveRepository.repository;
            if (hint === repository.sourceControl) {
                return liveRepository;
            }
            if (hint === repository.mergeGroup || hint === repository.indexGroup || hint === repository.workingTreeGroup || hint === repository.untrackedGroup) {
                return liveRepository;
            }
        }
        return undefined;
    }
    getRepositoryForSubmodule(submoduleUri) {
        for (const repository of this.repositories) {
            for (const submodule of repository.submodules) {
                const submodulePath = path.join(repository.root, submodule.path);
                if (submodulePath === submoduleUri.fsPath) {
                    return repository;
                }
            }
        }
        return undefined;
    }
    registerRemoteSourcePublisher(publisher) {
        this.remoteSourcePublishers.add(publisher);
        this._onDidAddRemoteSourcePublisher.fire(publisher);
        return (0, util_1.toDisposable)(() => {
            this.remoteSourcePublishers.delete(publisher);
            this._onDidRemoveRemoteSourcePublisher.fire(publisher);
        });
    }
    getRemoteSourcePublishers() {
        return [...this.remoteSourcePublishers.values()];
    }
    registerBranchProtectionProvider(root, provider) {
        const providerDisposables = [];
        this.branchProtectionProviders.set(root.toString(), (this.branchProtectionProviders.get(root.toString()) ?? new Set()).add(provider));
        providerDisposables.push(provider.onDidChangeBranchProtection(uri => this._onDidChangeBranchProtectionProviders.fire(uri)));
        this._onDidChangeBranchProtectionProviders.fire(root);
        return (0, util_1.toDisposable)(() => {
            const providers = this.branchProtectionProviders.get(root.toString());
            if (providers && providers.has(provider)) {
                providers.delete(provider);
                this.branchProtectionProviders.set(root.toString(), providers);
                this._onDidChangeBranchProtectionProviders.fire(root);
            }
            (0, util_1.dispose)(providerDisposables);
        });
    }
    getBranchProtectionProviders(root) {
        return [...(this.branchProtectionProviders.get(root.toString()) ?? new Set()).values()];
    }
    registerPostCommitCommandsProvider(provider) {
        this.postCommitCommandsProviders.add(provider);
        this._onDidChangePostCommitCommandsProviders.fire();
        return (0, util_1.toDisposable)(() => {
            this.postCommitCommandsProviders.delete(provider);
            this._onDidChangePostCommitCommandsProviders.fire();
        });
    }
    getPostCommitCommandsProviders() {
        return [...this.postCommitCommandsProviders.values()];
    }
    registerCredentialsProvider(provider) {
        return this.askpass.registerCredentialsProvider(provider);
    }
    registerPushErrorHandler(handler) {
        this.pushErrorHandlers.add(handler);
        return (0, util_1.toDisposable)(() => this.pushErrorHandlers.delete(handler));
    }
    getPushErrorHandlers() {
        return [...this.pushErrorHandlers];
    }
    registerSourceControlHistoryItemDetailsProvider(provider) {
        this.historyItemDetailsProviders.add(provider);
        return (0, util_1.toDisposable)(() => this.historyItemDetailsProviders.delete(provider));
    }
    getSourceControlHistoryItemDetailsProviders() {
        return [...this.historyItemDetailsProviders];
    }
    getUnsafeRepositoryPath(repository) {
        return this._unsafeRepositoriesManager.getRepositoryPath(repository);
    }
    deleteUnsafeRepository(repository) {
        return this._unsafeRepositoriesManager.deleteRepository(repository);
    }
    async isRepositoryOutsideWorkspace(repositoryPath) {
        // Allow opening repositories in the empty workspace
        if (vscode_1.workspace.workspaceFolders === undefined) {
            return false;
        }
        // Allow opening repositories in the agent session workspace
        if (vscode_1.workspace.isAgentSessionsWorkspace) {
            return false;
        }
        const workspaceFolders = vscode_1.workspace.workspaceFolders
            .filter(folder => folder.uri.scheme === 'file');
        if (workspaceFolders.length === 0) {
            return true;
        }
        // The repository path may be a worktree (usually stored outside the workspace) so we have
        // to check the repository path against all the worktree paths of the repositories that have
        // already been opened.
        const worktreePaths = this.repositories.map(r => r.worktrees.map(w => w.path)).flat();
        if (worktreePaths.some(p => (0, util_1.pathEquals)(p, repositoryPath))) {
            return false;
        }
        // The repository path may be a canonical path or it may contain a symbolic link so we have
        // to match it against the workspace folders and the canonical paths of the workspace folders
        const workspaceFolderPaths = new Set([
            ...workspaceFolders.map(folder => folder.uri.fsPath),
            ...await Promise.all(workspaceFolders.map(folder => this.getWorkspaceFolderRealPath(folder)))
        ]);
        return !Array.from(workspaceFolderPaths).some(folder => folder && ((0, util_1.pathEquals)(folder, repositoryPath) || (0, util_1.isDescendant)(folder, repositoryPath)));
    }
    async getWorkspaceFolderRealPath(workspaceFolder) {
        let result = this._workspaceFolders.get(workspaceFolder.uri.fsPath);
        if (!result) {
            try {
                result = await fs.promises.realpath(workspaceFolder.uri.fsPath, { encoding: 'utf8' });
                this._workspaceFolders.set(workspaceFolder.uri.fsPath, result);
            }
            catch (err) {
                // noop - Workspace folder does not exist
                this.logger.trace(`[Model][getWorkspaceFolderRealPath] Failed to resolve workspace folder "${workspaceFolder.uri.fsPath}". Error:${err}`);
            }
        }
        return result;
    }
    async showParentRepositoryNotification() {
        const message = this.parentRepositories.length === 1 ?
            vscode_1.l10n.t('A git repository was found in the parent folders of the workspace or the open file(s). Would you like to open the repository?') :
            vscode_1.l10n.t('Git repositories were found in the parent folders of the workspace or the open file(s). Would you like to open the repositories?');
        const yes = vscode_1.l10n.t('Yes');
        const always = vscode_1.l10n.t('Always');
        const never = vscode_1.l10n.t('Never');
        const choice = await vscode_1.window.showInformationMessage(message, yes, always, never);
        if (choice === yes) {
            // Open Parent Repositories
            vscode_1.commands.executeCommand('git.openRepositoriesInParentFolders');
        }
        else if (choice === always || choice === never) {
            // Update setting
            const config = vscode_1.workspace.getConfiguration('git');
            await config.update('openRepositoryInParentFolders', choice === always ? 'always' : 'never', true);
            if (choice === always) {
                for (const parentRepository of this.parentRepositories) {
                    await this.openParentRepository(parentRepository);
                }
            }
        }
    }
    async showUnsafeRepositoryNotification() {
        // If no repositories are open, we will use a welcome view to inform the user
        // that a potentially unsafe repository was found so we do not have to show
        // the notification
        if (this.repositories.length === 0) {
            return;
        }
        const message = this.unsafeRepositories.length === 1 ?
            vscode_1.l10n.t('The git repository in the current folder is potentially unsafe as the folder is owned by someone other than the current user.') :
            vscode_1.l10n.t('The git repositories in the current folder are potentially unsafe as the folders are owned by someone other than the current user.');
        const manageUnsafeRepositories = vscode_1.l10n.t('Manage Unsafe Repositories');
        const learnMore = vscode_1.l10n.t('Learn More');
        const choice = await vscode_1.window.showErrorMessage(message, manageUnsafeRepositories, learnMore);
        if (choice === manageUnsafeRepositories) {
            // Manage Unsafe Repositories
            vscode_1.commands.executeCommand('git.manageUnsafeRepositories');
        }
        else if (choice === learnMore) {
            // Learn More
            vscode_1.commands.executeCommand('vscode.open', vscode_1.Uri.parse('https://aka.ms/vscode-git-unsafe-repository'));
        }
    }
    dispose() {
        const openRepositories = [...this.openRepositories];
        openRepositories.forEach(r => r.dispose());
        this.openRepositories = [];
        this.possibleGitRepositoryPaths.clear();
        this.disposables = (0, util_1.dispose)(this.disposables);
    }
}
exports.Model = Model;
__decorate([
    decorators_1.memoize
], Model.prototype, "isInitialized", null);
__decorate([
    (0, decorators_1.debounce)(500)
], Model.prototype, "eventuallyScanPossibleGitRepositories", null);
__decorate([
    decorators_1.sequentialize
], Model.prototype, "openRepository", null);
//# sourceMappingURL=model.js.map