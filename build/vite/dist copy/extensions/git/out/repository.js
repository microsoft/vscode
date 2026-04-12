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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Repository = exports.Resource = void 0;
const fs_copyfile_1 = require("@vscode/fs-copyfile");
const unique_names_generator_1 = require("@joaomoreno/unique-names-generator");
const fs = __importStar(require("fs"));
const fsPromises = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const picomatch_1 = __importDefault(require("picomatch"));
const vscode_1 = require("vscode");
const actionButton_1 = require("./actionButton");
const api1_1 = require("./api/api1");
const git_constants_1 = require("./api/git.constants");
const autofetch_1 = require("./autofetch");
const branchProtection_1 = require("./branchProtection");
const decorators_1 = require("./decorators");
const git_1 = require("./git");
const historyProvider_1 = require("./historyProvider");
const operation_1 = require("./operation");
const postCommitCommands_1 = require("./postCommitCommands");
const statusbar_1 = require("./statusbar");
const uri_1 = require("./uri");
const util_1 = require("./util");
const watch_1 = require("./watch");
const artifactProvider_1 = require("./artifactProvider");
const quickDiffProvider_1 = require("./quickDiffProvider");
const timeout = (millis) => new Promise(c => setTimeout(c, millis));
const iconsRootPath = path.join(path.dirname(__dirname), 'resources', 'icons');
function getIconUri(iconName, theme) {
    return vscode_1.Uri.file(path.join(iconsRootPath, theme, `${iconName}.svg`));
}
class Resource {
    _commandResolver;
    _resourceGroupType;
    _resourceUri;
    _type;
    _useIcons;
    _renameResourceUri;
    _repositoryKind;
    static getStatusLetter(type) {
        switch (type) {
            case git_constants_1.Status.INDEX_MODIFIED:
            case git_constants_1.Status.MODIFIED:
                return 'M';
            case git_constants_1.Status.INDEX_ADDED:
            case git_constants_1.Status.INTENT_TO_ADD:
                return 'A';
            case git_constants_1.Status.INDEX_DELETED:
            case git_constants_1.Status.DELETED:
                return 'D';
            case git_constants_1.Status.INDEX_RENAMED:
            case git_constants_1.Status.INTENT_TO_RENAME:
                return 'R';
            case git_constants_1.Status.TYPE_CHANGED:
                return 'T';
            case git_constants_1.Status.UNTRACKED:
                return 'U';
            case git_constants_1.Status.IGNORED:
                return 'I';
            case git_constants_1.Status.INDEX_COPIED:
                return 'C';
            case git_constants_1.Status.BOTH_DELETED:
            case git_constants_1.Status.ADDED_BY_US:
            case git_constants_1.Status.DELETED_BY_THEM:
            case git_constants_1.Status.ADDED_BY_THEM:
            case git_constants_1.Status.DELETED_BY_US:
            case git_constants_1.Status.BOTH_ADDED:
            case git_constants_1.Status.BOTH_MODIFIED:
                return '!'; // Using ! instead of ⚠, because the latter looks really bad on windows
            default:
                throw new Error('Unknown git status: ' + type);
        }
    }
    static getStatusText(type) {
        switch (type) {
            case git_constants_1.Status.INDEX_MODIFIED: return vscode_1.l10n.t('Index Modified');
            case git_constants_1.Status.MODIFIED: return vscode_1.l10n.t('Modified');
            case git_constants_1.Status.INDEX_ADDED: return vscode_1.l10n.t('Index Added');
            case git_constants_1.Status.INDEX_DELETED: return vscode_1.l10n.t('Index Deleted');
            case git_constants_1.Status.DELETED: return vscode_1.l10n.t('Deleted');
            case git_constants_1.Status.INDEX_RENAMED: return vscode_1.l10n.t('Index Renamed');
            case git_constants_1.Status.INDEX_COPIED: return vscode_1.l10n.t('Index Copied');
            case git_constants_1.Status.UNTRACKED: return vscode_1.l10n.t('Untracked');
            case git_constants_1.Status.IGNORED: return vscode_1.l10n.t('Ignored');
            case git_constants_1.Status.INTENT_TO_ADD: return vscode_1.l10n.t('Intent to Add');
            case git_constants_1.Status.INTENT_TO_RENAME: return vscode_1.l10n.t('Intent to Rename');
            case git_constants_1.Status.TYPE_CHANGED: return vscode_1.l10n.t('Type Changed');
            case git_constants_1.Status.BOTH_DELETED: return vscode_1.l10n.t('Conflict: Both Deleted');
            case git_constants_1.Status.ADDED_BY_US: return vscode_1.l10n.t('Conflict: Added By Us');
            case git_constants_1.Status.DELETED_BY_THEM: return vscode_1.l10n.t('Conflict: Deleted By Them');
            case git_constants_1.Status.ADDED_BY_THEM: return vscode_1.l10n.t('Conflict: Added By Them');
            case git_constants_1.Status.DELETED_BY_US: return vscode_1.l10n.t('Conflict: Deleted By Us');
            case git_constants_1.Status.BOTH_ADDED: return vscode_1.l10n.t('Conflict: Both Added');
            case git_constants_1.Status.BOTH_MODIFIED: return vscode_1.l10n.t('Conflict: Both Modified');
            default: return '';
        }
    }
    static getStatusColor(type) {
        switch (type) {
            case git_constants_1.Status.INDEX_MODIFIED:
                return new vscode_1.ThemeColor('gitDecoration.stageModifiedResourceForeground');
            case git_constants_1.Status.MODIFIED:
            case git_constants_1.Status.TYPE_CHANGED:
                return new vscode_1.ThemeColor('gitDecoration.modifiedResourceForeground');
            case git_constants_1.Status.INDEX_DELETED:
                return new vscode_1.ThemeColor('gitDecoration.stageDeletedResourceForeground');
            case git_constants_1.Status.DELETED:
                return new vscode_1.ThemeColor('gitDecoration.deletedResourceForeground');
            case git_constants_1.Status.INDEX_ADDED:
            case git_constants_1.Status.INTENT_TO_ADD:
                return new vscode_1.ThemeColor('gitDecoration.addedResourceForeground');
            case git_constants_1.Status.INDEX_COPIED:
            case git_constants_1.Status.INDEX_RENAMED:
            case git_constants_1.Status.INTENT_TO_RENAME:
                return new vscode_1.ThemeColor('gitDecoration.renamedResourceForeground');
            case git_constants_1.Status.UNTRACKED:
                return new vscode_1.ThemeColor('gitDecoration.untrackedResourceForeground');
            case git_constants_1.Status.IGNORED:
                return new vscode_1.ThemeColor('gitDecoration.ignoredResourceForeground');
            case git_constants_1.Status.BOTH_DELETED:
            case git_constants_1.Status.ADDED_BY_US:
            case git_constants_1.Status.DELETED_BY_THEM:
            case git_constants_1.Status.ADDED_BY_THEM:
            case git_constants_1.Status.DELETED_BY_US:
            case git_constants_1.Status.BOTH_ADDED:
            case git_constants_1.Status.BOTH_MODIFIED:
                return new vscode_1.ThemeColor('gitDecoration.conflictingResourceForeground');
            default:
                throw new Error('Unknown git status: ' + type);
        }
    }
    get resourceUri() {
        if (this.renameResourceUri && (this._type === git_constants_1.Status.MODIFIED || this._type === git_constants_1.Status.DELETED || this._type === git_constants_1.Status.INDEX_RENAMED || this._type === git_constants_1.Status.INDEX_COPIED || this._type === git_constants_1.Status.INTENT_TO_RENAME)) {
            return this.renameResourceUri;
        }
        return this._resourceUri;
    }
    get leftUri() {
        return this.resources.left;
    }
    get rightUri() {
        return this.resources.right;
    }
    get multiDiffEditorOriginalUri() {
        return this.resources.original;
    }
    get multiFileDiffEditorModifiedUri() {
        return this.resources.modified;
    }
    get command() {
        return this._commandResolver.resolveDefaultCommand(this);
    }
    get resources() {
        return this._commandResolver.getResources(this);
    }
    get resourceGroupType() { return this._resourceGroupType; }
    get type() { return this._type; }
    get original() { return this._resourceUri; }
    get renameResourceUri() { return this._renameResourceUri; }
    get contextValue() { return this._repositoryKind; }
    static Icons = {
        light: {
            Modified: getIconUri('status-modified', 'light'),
            Added: getIconUri('status-added', 'light'),
            Deleted: getIconUri('status-deleted', 'light'),
            Renamed: getIconUri('status-renamed', 'light'),
            Copied: getIconUri('status-copied', 'light'),
            Untracked: getIconUri('status-untracked', 'light'),
            Ignored: getIconUri('status-ignored', 'light'),
            Conflict: getIconUri('status-conflict', 'light'),
            TypeChanged: getIconUri('status-type-changed', 'light')
        },
        dark: {
            Modified: getIconUri('status-modified', 'dark'),
            Added: getIconUri('status-added', 'dark'),
            Deleted: getIconUri('status-deleted', 'dark'),
            Renamed: getIconUri('status-renamed', 'dark'),
            Copied: getIconUri('status-copied', 'dark'),
            Untracked: getIconUri('status-untracked', 'dark'),
            Ignored: getIconUri('status-ignored', 'dark'),
            Conflict: getIconUri('status-conflict', 'dark'),
            TypeChanged: getIconUri('status-type-changed', 'dark')
        }
    };
    getIconPath(theme) {
        switch (this.type) {
            case git_constants_1.Status.INDEX_MODIFIED: return Resource.Icons[theme].Modified;
            case git_constants_1.Status.MODIFIED: return Resource.Icons[theme].Modified;
            case git_constants_1.Status.INDEX_ADDED: return Resource.Icons[theme].Added;
            case git_constants_1.Status.INDEX_DELETED: return Resource.Icons[theme].Deleted;
            case git_constants_1.Status.DELETED: return Resource.Icons[theme].Deleted;
            case git_constants_1.Status.INDEX_RENAMED: return Resource.Icons[theme].Renamed;
            case git_constants_1.Status.INDEX_COPIED: return Resource.Icons[theme].Copied;
            case git_constants_1.Status.UNTRACKED: return Resource.Icons[theme].Untracked;
            case git_constants_1.Status.IGNORED: return Resource.Icons[theme].Ignored;
            case git_constants_1.Status.INTENT_TO_ADD: return Resource.Icons[theme].Added;
            case git_constants_1.Status.INTENT_TO_RENAME: return Resource.Icons[theme].Renamed;
            case git_constants_1.Status.TYPE_CHANGED: return Resource.Icons[theme].TypeChanged;
            case git_constants_1.Status.BOTH_DELETED: return Resource.Icons[theme].Conflict;
            case git_constants_1.Status.ADDED_BY_US: return Resource.Icons[theme].Conflict;
            case git_constants_1.Status.DELETED_BY_THEM: return Resource.Icons[theme].Conflict;
            case git_constants_1.Status.ADDED_BY_THEM: return Resource.Icons[theme].Conflict;
            case git_constants_1.Status.DELETED_BY_US: return Resource.Icons[theme].Conflict;
            case git_constants_1.Status.BOTH_ADDED: return Resource.Icons[theme].Conflict;
            case git_constants_1.Status.BOTH_MODIFIED: return Resource.Icons[theme].Conflict;
            default: throw new Error('Unknown git status: ' + this.type);
        }
    }
    get tooltip() {
        return Resource.getStatusText(this.type);
    }
    get strikeThrough() {
        switch (this.type) {
            case git_constants_1.Status.DELETED:
            case git_constants_1.Status.BOTH_DELETED:
            case git_constants_1.Status.DELETED_BY_THEM:
            case git_constants_1.Status.DELETED_BY_US:
            case git_constants_1.Status.INDEX_DELETED:
                return true;
            default:
                return false;
        }
    }
    get faded() {
        // TODO@joao
        return false;
        // const workspaceRootPath = this.workspaceRoot.fsPath;
        // return this.resourceUri.fsPath.substr(0, workspaceRootPath.length) !== workspaceRootPath;
    }
    get decorations() {
        const light = this._useIcons ? { iconPath: this.getIconPath('light') } : undefined;
        const dark = this._useIcons ? { iconPath: this.getIconPath('dark') } : undefined;
        const tooltip = this.tooltip;
        const strikeThrough = this.strikeThrough;
        const faded = this.faded;
        return { strikeThrough, faded, tooltip, light, dark };
    }
    get letter() {
        return Resource.getStatusLetter(this.type);
    }
    get color() {
        return Resource.getStatusColor(this.type);
    }
    get priority() {
        switch (this.type) {
            case git_constants_1.Status.INDEX_MODIFIED:
            case git_constants_1.Status.MODIFIED:
            case git_constants_1.Status.INDEX_COPIED:
            case git_constants_1.Status.TYPE_CHANGED:
                return 2;
            case git_constants_1.Status.IGNORED:
                return 3;
            case git_constants_1.Status.BOTH_DELETED:
            case git_constants_1.Status.ADDED_BY_US:
            case git_constants_1.Status.DELETED_BY_THEM:
            case git_constants_1.Status.ADDED_BY_THEM:
            case git_constants_1.Status.DELETED_BY_US:
            case git_constants_1.Status.BOTH_ADDED:
            case git_constants_1.Status.BOTH_MODIFIED:
                return 4;
            default:
                return 1;
        }
    }
    get resourceDecoration() {
        const res = new vscode_1.FileDecoration(this.letter, this.tooltip, this.color);
        res.propagate = this.type !== git_constants_1.Status.DELETED && this.type !== git_constants_1.Status.INDEX_DELETED;
        return res;
    }
    constructor(_commandResolver, _resourceGroupType, _resourceUri, _type, _useIcons, _renameResourceUri, _repositoryKind) {
        this._commandResolver = _commandResolver;
        this._resourceGroupType = _resourceGroupType;
        this._resourceUri = _resourceUri;
        this._type = _type;
        this._useIcons = _useIcons;
        this._renameResourceUri = _renameResourceUri;
        this._repositoryKind = _repositoryKind;
    }
    async open() {
        const command = this.command;
        await vscode_1.commands.executeCommand(command.command, ...(command.arguments || []));
    }
    async openFile() {
        const command = this._commandResolver.resolveFileCommand(this);
        await vscode_1.commands.executeCommand(command.command, ...(command.arguments || []));
    }
    async openChange() {
        const command = this._commandResolver.resolveChangeCommand(this);
        await vscode_1.commands.executeCommand(command.command, ...(command.arguments || []));
    }
    async compareWithWorkspace() {
        const command = this._commandResolver.resolveCompareWithWorkspaceCommand(this);
        await vscode_1.commands.executeCommand(command.command, ...(command.arguments || []));
    }
    clone(resourceGroupType) {
        return new Resource(this._commandResolver, resourceGroupType ?? this._resourceGroupType, this._resourceUri, this._type, this._useIcons, this._renameResourceUri, this._repositoryKind);
    }
}
exports.Resource = Resource;
__decorate([
    decorators_1.memoize
], Resource.prototype, "resourceUri", null);
__decorate([
    decorators_1.memoize
], Resource.prototype, "command", null);
__decorate([
    decorators_1.memoize
], Resource.prototype, "resources", null);
__decorate([
    decorators_1.memoize
], Resource.prototype, "faded", null);
class ProgressManager {
    repository;
    enabled = false;
    disposable = util_1.EmptyDisposable;
    constructor(repository) {
        this.repository = repository;
        const onDidChange = (0, util_1.filterEvent)(vscode_1.workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git', vscode_1.Uri.file(this.repository.root)));
        onDidChange(_ => this.updateEnablement());
        this.updateEnablement();
        this.repository.onDidChangeOperations(() => {
            // Disable input box when the commit operation is running
            this.repository.sourceControl.inputBox.enabled = !this.repository.operations.isRunning("Commit" /* OperationKind.Commit */);
        });
    }
    updateEnablement() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        if (config.get('showProgress')) {
            this.enable();
        }
        else {
            this.disable();
        }
    }
    enable() {
        if (this.enabled) {
            return;
        }
        const start = (0, util_1.onceEvent)((0, util_1.filterEvent)(this.repository.onDidChangeOperations, () => this.repository.operations.shouldShowProgress()));
        const end = (0, util_1.onceEvent)((0, util_1.filterEvent)((0, util_1.debounceEvent)(this.repository.onDidChangeOperations, 300), () => !this.repository.operations.shouldShowProgress()));
        const setup = () => {
            this.disposable = start(() => {
                const promise = (0, util_1.eventToPromise)(end).then(() => setup());
                vscode_1.window.withProgress({ location: vscode_1.ProgressLocation.SourceControl }, () => promise);
            });
        };
        setup();
        this.enabled = true;
    }
    disable() {
        if (!this.enabled) {
            return;
        }
        this.disposable.dispose();
        this.disposable = util_1.EmptyDisposable;
        this.enabled = false;
    }
    dispose() {
        this.disable();
    }
}
class FileEventLogger {
    onWorkspaceWorkingTreeFileChange;
    onDotGitFileChange;
    logger;
    eventDisposable = util_1.EmptyDisposable;
    logLevelDisposable = util_1.EmptyDisposable;
    constructor(onWorkspaceWorkingTreeFileChange, onDotGitFileChange, logger) {
        this.onWorkspaceWorkingTreeFileChange = onWorkspaceWorkingTreeFileChange;
        this.onDotGitFileChange = onDotGitFileChange;
        this.logger = logger;
        this.logLevelDisposable = logger.onDidChangeLogLevel(this.onDidChangeLogLevel, this);
        this.onDidChangeLogLevel(logger.logLevel);
    }
    onDidChangeLogLevel(logLevel) {
        this.eventDisposable.dispose();
        if (logLevel > vscode_1.LogLevel.Debug) {
            return;
        }
        this.eventDisposable = (0, util_1.combinedDisposable)([
            this.onWorkspaceWorkingTreeFileChange(uri => this.logger.debug(`[FileEventLogger][onWorkspaceWorkingTreeFileChange] ${uri.fsPath}`)),
            this.onDotGitFileChange(uri => this.logger.debug(`[FileEventLogger][onDotGitFileChange] ${uri.fsPath}`))
        ]);
    }
    dispose() {
        this.eventDisposable.dispose();
        this.logLevelDisposable.dispose();
    }
}
class DotGitWatcher {
    repository;
    logger;
    event;
    emitter = new vscode_1.EventEmitter();
    transientDisposables = [];
    disposables = [];
    constructor(repository, logger) {
        this.repository = repository;
        this.logger = logger;
        const rootWatcher = (0, watch_1.watch)(repository.dotGit.path);
        this.disposables.push(rootWatcher);
        // Ignore changes to the "index.lock" file (including worktree index.lock files), and watchman fsmonitor hook (https://git-scm.com/docs/githooks#_fsmonitor_watchman) cookie files.
        // Watchman creates a cookie file inside the git directory whenever a query is run (https://facebook.github.io/watchman/docs/cookies.html).
        const filteredRootWatcher = (0, util_1.filterEvent)(rootWatcher.event, uri => uri.scheme === 'file' && !/\/\.git(\/index\.lock|\/worktrees\/[^/]+\/index\.lock)?$|\/\.watchman-cookie-/.test(uri.path));
        this.event = (0, util_1.anyEvent)(filteredRootWatcher, this.emitter.event);
        repository.onDidRunGitStatus(this.updateTransientWatchers, this, this.disposables);
        this.updateTransientWatchers();
    }
    updateTransientWatchers() {
        this.transientDisposables = (0, util_1.dispose)(this.transientDisposables);
        if (!this.repository.HEAD || !this.repository.HEAD.upstream) {
            return;
        }
        this.transientDisposables = (0, util_1.dispose)(this.transientDisposables);
        const { name, remote } = this.repository.HEAD.upstream;
        const upstreamPath = path.join(this.repository.dotGit.commonPath ?? this.repository.dotGit.path, 'refs', 'remotes', remote, name);
        try {
            const upstreamWatcher = (0, watch_1.watch)(upstreamPath);
            this.transientDisposables.push(upstreamWatcher);
            upstreamWatcher.event(this.emitter.fire, this.emitter, this.transientDisposables);
        }
        catch (err) {
            this.logger.warn(`[DotGitWatcher][updateTransientWatchers] Failed to watch ref '${upstreamPath}', is most likely packed.`);
        }
    }
    dispose() {
        this.emitter.dispose();
        this.transientDisposables = (0, util_1.dispose)(this.transientDisposables);
        this.disposables = (0, util_1.dispose)(this.disposables);
    }
}
class ResourceCommandResolver {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    resolveDefaultCommand(resource) {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        const openDiffOnClick = config.get('openDiffOnClick', true);
        return openDiffOnClick ? this.resolveChangeCommand(resource) : this.resolveFileCommand(resource);
    }
    resolveFileCommand(resource) {
        return {
            command: 'vscode.open',
            title: vscode_1.l10n.t('Open'),
            arguments: [resource.resourceUri]
        };
    }
    resolveChangeCommand(resource, compareWithWorkspace, leftUri) {
        if (!compareWithWorkspace) {
            leftUri = resource.leftUri;
        }
        const title = this.getTitle(resource);
        if (!leftUri) {
            const bothModified = resource.type === git_constants_1.Status.BOTH_MODIFIED;
            if (resource.rightUri && vscode_1.workspace.getConfiguration('git').get('mergeEditor', false) && (bothModified || resource.type === git_constants_1.Status.BOTH_ADDED)) {
                const command = this.repository.isWorktreeMigrating ? 'git.openWorktreeMergeEditor' : 'git.openMergeEditor';
                return {
                    command,
                    title: vscode_1.l10n.t('Open Merge'),
                    arguments: [resource.rightUri]
                };
            }
            else {
                return {
                    command: 'vscode.open',
                    title: vscode_1.l10n.t('Open'),
                    arguments: [resource.rightUri, { override: bothModified ? false : undefined }, title]
                };
            }
        }
        else {
            return {
                command: 'vscode.diff',
                title: vscode_1.l10n.t('Open'),
                arguments: [leftUri, resource.rightUri, title]
            };
        }
    }
    resolveCompareWithWorkspaceCommand(resource) {
        // Resource is not a worktree
        if (!this.repository.dotGit.commonPath) {
            return this.resolveChangeCommand(resource);
        }
        const parentRepoRoot = path.dirname(this.repository.dotGit.commonPath);
        const relPath = path.relative(this.repository.root, resource.resourceUri.fsPath);
        const candidateFsPath = path.join(parentRepoRoot, relPath);
        const leftUri = fs.existsSync(candidateFsPath) ? vscode_1.Uri.file(candidateFsPath) : undefined;
        return this.resolveChangeCommand(resource, true, leftUri);
    }
    getResources(resource) {
        for (const submodule of this.repository.submodules) {
            if (path.join(this.repository.root, submodule.path) === resource.resourceUri.fsPath) {
                const original = undefined;
                const modified = (0, uri_1.toGitUri)(resource.resourceUri, resource.resourceGroupType === 1 /* ResourceGroupType.Index */ ? 'index' : 'wt', { submoduleOf: this.repository.root });
                return { left: original, right: modified, original, modified };
            }
        }
        const left = this.getLeftResource(resource);
        const right = this.getRightResource(resource);
        return {
            left: left.original ?? left.modified,
            right: right.original ?? right.modified,
            original: left.original ?? right.original,
            modified: left.modified ?? right.modified,
        };
    }
    getLeftResource(resource) {
        switch (resource.type) {
            case git_constants_1.Status.INDEX_MODIFIED:
            case git_constants_1.Status.INDEX_RENAMED:
            case git_constants_1.Status.INTENT_TO_RENAME:
            case git_constants_1.Status.TYPE_CHANGED:
                return { original: (0, uri_1.toGitUri)(resource.original, 'HEAD') };
            case git_constants_1.Status.MODIFIED:
                return { original: (0, uri_1.toGitUri)(resource.resourceUri, '~') };
            case git_constants_1.Status.DELETED_BY_US:
            case git_constants_1.Status.DELETED_BY_THEM:
                return { original: (0, uri_1.toGitUri)(resource.resourceUri, '~1') };
        }
        return {};
    }
    getRightResource(resource) {
        switch (resource.type) {
            case git_constants_1.Status.INDEX_MODIFIED:
            case git_constants_1.Status.INDEX_ADDED:
            case git_constants_1.Status.INDEX_COPIED:
            case git_constants_1.Status.INDEX_RENAMED:
                return { modified: (0, uri_1.toGitUri)(resource.resourceUri, '') };
            case git_constants_1.Status.INDEX_DELETED:
            case git_constants_1.Status.DELETED:
                return { original: (0, uri_1.toGitUri)(resource.resourceUri, 'HEAD') };
            case git_constants_1.Status.DELETED_BY_US:
                return { original: (0, uri_1.toGitUri)(resource.resourceUri, '~3') };
            case git_constants_1.Status.DELETED_BY_THEM:
                return { original: (0, uri_1.toGitUri)(resource.resourceUri, '~2') };
            case git_constants_1.Status.MODIFIED:
            case git_constants_1.Status.UNTRACKED:
            case git_constants_1.Status.IGNORED:
            case git_constants_1.Status.INTENT_TO_ADD:
            case git_constants_1.Status.INTENT_TO_RENAME:
            case git_constants_1.Status.TYPE_CHANGED: {
                const uriString = resource.resourceUri.toString();
                const [indexStatus] = this.repository.indexGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString);
                if (indexStatus && indexStatus.renameResourceUri) {
                    return { modified: indexStatus.renameResourceUri };
                }
                return { modified: resource.resourceUri };
            }
            case git_constants_1.Status.BOTH_ADDED:
            case git_constants_1.Status.BOTH_MODIFIED:
                return { modified: resource.resourceUri };
        }
        return {};
    }
    getTitle(resource) {
        const basename = path.basename(resource.resourceUri.fsPath);
        switch (resource.type) {
            case git_constants_1.Status.INDEX_MODIFIED:
            case git_constants_1.Status.INDEX_RENAMED:
            case git_constants_1.Status.INDEX_ADDED:
                return vscode_1.l10n.t('{0} (Index)', basename);
            case git_constants_1.Status.MODIFIED:
            case git_constants_1.Status.BOTH_ADDED:
            case git_constants_1.Status.BOTH_MODIFIED:
                return vscode_1.l10n.t('{0} (Working Tree)', basename);
            case git_constants_1.Status.INDEX_DELETED:
            case git_constants_1.Status.DELETED:
                return vscode_1.l10n.t('{0} (Deleted)', basename);
            case git_constants_1.Status.DELETED_BY_US:
                return vscode_1.l10n.t('{0} (Theirs)', basename);
            case git_constants_1.Status.DELETED_BY_THEM:
                return vscode_1.l10n.t('{0} (Ours)', basename);
            case git_constants_1.Status.UNTRACKED:
                return vscode_1.l10n.t('{0} (Untracked)', basename);
            case git_constants_1.Status.INTENT_TO_ADD:
            case git_constants_1.Status.INTENT_TO_RENAME:
                return vscode_1.l10n.t('{0} (Intent to add)', basename);
            case git_constants_1.Status.TYPE_CHANGED:
                return vscode_1.l10n.t('{0} (Type changed)', basename);
            default:
                return '';
        }
    }
}
class Repository {
    repository;
    repositoryResolver;
    pushErrorHandlerRegistry;
    branchProtectionProviderRegistry;
    globalState;
    logger;
    telemetryReporter;
    repositoryCache;
    static WORKTREE_ROOT_STORAGE_KEY = 'worktreeRoot';
    _onDidChangeRepository = new vscode_1.EventEmitter();
    onDidChangeRepository = this._onDidChangeRepository.event;
    _onDidChangeState = new vscode_1.EventEmitter();
    onDidChangeState = this._onDidChangeState.event;
    _onDidChangeStatus = new vscode_1.EventEmitter();
    onDidRunGitStatus = this._onDidChangeStatus.event;
    _onDidChangeOriginalResource = new vscode_1.EventEmitter();
    onDidChangeOriginalResource = this._onDidChangeOriginalResource.event;
    _onRunOperation = new vscode_1.EventEmitter();
    onRunOperation = this._onRunOperation.event;
    _onDidRunOperation = new vscode_1.EventEmitter();
    onDidRunOperation = this._onDidRunOperation.event;
    _onDidChangeBranchProtection = new vscode_1.EventEmitter();
    onDidChangeBranchProtection = this._onDidChangeBranchProtection.event;
    get onDidChangeOperations() {
        return (0, util_1.anyEvent)(this.onRunOperation, this.onDidRunOperation);
    }
    _sourceControl;
    get sourceControl() { return this._sourceControl; }
    get inputBox() { return this._sourceControl.inputBox; }
    _mergeGroup;
    get mergeGroup() { return this._mergeGroup; }
    _indexGroup;
    get indexGroup() { return this._indexGroup; }
    _workingTreeGroup;
    get workingTreeGroup() { return this._workingTreeGroup; }
    _untrackedGroup;
    get untrackedGroup() { return this._untrackedGroup; }
    _EMPTY_TREE;
    _HEAD;
    get HEAD() {
        return this._HEAD;
    }
    _refs = [];
    get refs() {
        return this._refs;
    }
    get headShortName() {
        if (!this.HEAD) {
            return;
        }
        const HEAD = this.HEAD;
        if (HEAD.name) {
            return HEAD.name;
        }
        return (HEAD.commit || '').substr(0, 8);
    }
    _remotes = [];
    get remotes() {
        return this._remotes;
    }
    _submodules = [];
    get submodules() {
        return this._submodules;
    }
    _worktrees = [];
    get worktrees() {
        return this._worktrees;
    }
    _rebaseCommit = undefined;
    set rebaseCommit(rebaseCommit) {
        if (this._rebaseCommit && !rebaseCommit) {
            this.inputBox.value = '';
        }
        else if (rebaseCommit && (!this._rebaseCommit || this._rebaseCommit.hash !== rebaseCommit.hash)) {
            this.inputBox.value = rebaseCommit.message;
        }
        const shouldUpdateContext = !!this._rebaseCommit !== !!rebaseCommit;
        this._rebaseCommit = rebaseCommit;
        if (shouldUpdateContext) {
            vscode_1.commands.executeCommand('setContext', 'gitRebaseInProgress', !!this._rebaseCommit);
        }
    }
    get rebaseCommit() {
        return this._rebaseCommit;
    }
    _mergeInProgress = false;
    set mergeInProgress(value) {
        if (this._mergeInProgress === value) {
            return;
        }
        this._mergeInProgress = value;
        vscode_1.commands.executeCommand('setContext', 'gitMergeInProgress', value);
    }
    get mergeInProgress() {
        return this._mergeInProgress;
    }
    _cherryPickInProgress = false;
    set cherryPickInProgress(value) {
        if (this._cherryPickInProgress === value) {
            return;
        }
        this._cherryPickInProgress = value;
        vscode_1.commands.executeCommand('setContext', 'gitCherryPickInProgress', value);
    }
    get cherryPickInProgress() {
        return this._cherryPickInProgress;
    }
    _isWorktreeMigrating = false;
    get isWorktreeMigrating() { return this._isWorktreeMigrating; }
    set isWorktreeMigrating(value) { this._isWorktreeMigrating = value; }
    _operations;
    get operations() { return this._operations; }
    _state = 0 /* RepositoryState.Idle */;
    get state() { return this._state; }
    set state(state) {
        this._state = state;
        this._onDidChangeState.fire(state);
        this._HEAD = undefined;
        this._remotes = [];
        this.mergeGroup.resourceStates = [];
        this.indexGroup.resourceStates = [];
        this.workingTreeGroup.resourceStates = [];
        this.untrackedGroup.resourceStates = [];
        this._sourceControl.count = 0;
    }
    get root() {
        return this.repository.root;
    }
    get rootRealPath() {
        return this.repository.rootRealPath;
    }
    get dotGit() {
        return this.repository.dotGit;
    }
    get kind() {
        return this.repository.kind;
    }
    _artifactProvider;
    get artifactProvider() { return this._artifactProvider; }
    _historyProvider;
    get historyProvider() { return this._historyProvider; }
    _isHidden;
    get isHidden() { return this._isHidden; }
    isRepositoryHuge = false;
    didWarnAboutLimit = false;
    unpublishedCommits = undefined;
    branchProtection = new Map();
    commitCommandCenter;
    resourceCommandResolver = new ResourceCommandResolver(this);
    updateModelStateCancellationTokenSource;
    disposables = [];
    constructor(repository, repositoryResolver, pushErrorHandlerRegistry, remoteSourcePublisherRegistry, postCommitCommandsProviderRegistry, branchProtectionProviderRegistry, historyItemDetailProviderRegistry, globalState, logger, telemetryReporter, repositoryCache) {
        this.repository = repository;
        this.repositoryResolver = repositoryResolver;
        this.pushErrorHandlerRegistry = pushErrorHandlerRegistry;
        this.branchProtectionProviderRegistry = branchProtectionProviderRegistry;
        this.globalState = globalState;
        this.logger = logger;
        this.telemetryReporter = telemetryReporter;
        this.repositoryCache = repositoryCache;
        this._operations = new operation_1.OperationManager(this.logger);
        const repositoryWatcher = vscode_1.workspace.createFileSystemWatcher(new vscode_1.RelativePattern(vscode_1.Uri.file(repository.root), '**'));
        this.disposables.push(repositoryWatcher);
        const onRepositoryFileChange = (0, util_1.anyEvent)(repositoryWatcher.onDidChange, repositoryWatcher.onDidCreate, repositoryWatcher.onDidDelete);
        const onRepositoryWorkingTreeFileChange = (0, util_1.filterEvent)(onRepositoryFileChange, uri => !/\.git($|\\|\/)/.test((0, util_1.relativePath)(repository.root, uri.fsPath)));
        let onRepositoryDotGitFileChange;
        try {
            const dotGitFileWatcher = new DotGitWatcher(this, logger);
            onRepositoryDotGitFileChange = dotGitFileWatcher.event;
            this.disposables.push(dotGitFileWatcher);
        }
        catch (err) {
            logger.error(`Failed to watch path:'${this.dotGit.path}' or commonPath:'${this.dotGit.commonPath}', reverting to legacy API file watched. Some events might be lost.\n${err.stack || err}`);
            onRepositoryDotGitFileChange = (0, util_1.filterEvent)(onRepositoryFileChange, uri => /\.git($|\\|\/)/.test(uri.path));
        }
        // FS changes should trigger `git status`:
        // 	- any change inside the repository working tree
        //	- any change within the first level of the `.git` folder, except the folder itself and `index.lock` (repository and worktree)
        const onFileChange = (0, util_1.anyEvent)(onRepositoryWorkingTreeFileChange, onRepositoryDotGitFileChange);
        onFileChange(this.onFileChange, this, this.disposables);
        // Relevate repository changes should trigger virtual document change events
        onRepositoryDotGitFileChange(this._onDidChangeRepository.fire, this._onDidChangeRepository, this.disposables);
        this.disposables.push(new FileEventLogger(onRepositoryWorkingTreeFileChange, onRepositoryDotGitFileChange, logger));
        // Parent source control. Repositories opened in the Sessions app
        // don't use the parent/child relationship and it is expected for
        // a worktree repository to be opened while the main repository
        // is closed.
        const parentRoot = vscode_1.workspace.isAgentSessionsWorkspace
            ? undefined
            : repository.kind === 'submodule'
                ? repository.dotGit.superProjectPath
                : repository.kind === 'worktree' && repository.dotGit.commonPath
                    ? path.dirname(repository.dotGit.commonPath)
                    : undefined;
        const parent = parentRoot
            ? this.repositoryResolver.getRepository(parentRoot)?.sourceControl
            : undefined;
        // Icon
        const icon = repository.kind === 'submodule'
            ? new vscode_1.ThemeIcon('archive')
            : repository.kind === 'worktree'
                ? (0, util_1.isCopilotWorktreeFolder)(repository.root)
                    ? new vscode_1.ThemeIcon('chat-sparkle')
                    : new vscode_1.ThemeIcon('worktree')
                : new vscode_1.ThemeIcon('repo');
        // Hidden
        // This is a temporary solution to hide:
        // * repositories in the empty window
        // * worktrees created by Copilot when the main repository
        //   is opened. Users can still manually open the worktree
        //   from the Repositories view.
        this._isHidden = vscode_1.workspace.workspaceFolders === undefined ||
            (repository.kind === 'worktree' &&
                (0, util_1.isCopilotWorktreeFolder)(repository.root) && parent !== undefined);
        const root = vscode_1.Uri.file(repository.root);
        this._sourceControl = vscode_1.scm.createSourceControl('git', 'Git', root, icon, this._isHidden, parent);
        this._sourceControl.contextValue = repository.kind;
        this._sourceControl.quickDiffProvider = new quickDiffProvider_1.GitQuickDiffProvider(this, this.repositoryResolver, logger);
        this._sourceControl.secondaryQuickDiffProvider = new quickDiffProvider_1.StagedResourceQuickDiffProvider(this, logger);
        this._historyProvider = new historyProvider_1.GitHistoryProvider(historyItemDetailProviderRegistry, this, logger);
        this._sourceControl.historyProvider = this._historyProvider;
        this.disposables.push(this._historyProvider);
        this._artifactProvider = new artifactProvider_1.GitArtifactProvider(this, logger);
        this._sourceControl.artifactProvider = this._artifactProvider;
        this.disposables.push(this._artifactProvider);
        this._sourceControl.acceptInputCommand = { command: 'git.commit', title: vscode_1.l10n.t('Commit'), arguments: [this._sourceControl] };
        this._sourceControl.inputBox.validateInput = this.validateInput.bind(this);
        this.disposables.push(this._sourceControl);
        this.updateInputBoxPlaceholder();
        this.disposables.push(this.onDidRunGitStatus(() => this.updateInputBoxPlaceholder()));
        this._mergeGroup = this._sourceControl.createResourceGroup('merge', vscode_1.l10n.t('Merge Changes'));
        this._indexGroup = this._sourceControl.createResourceGroup('index', vscode_1.l10n.t('Staged Changes'), { multiDiffEditorEnableViewChanges: true });
        this._workingTreeGroup = this._sourceControl.createResourceGroup('workingTree', vscode_1.l10n.t('Changes'), { multiDiffEditorEnableViewChanges: true });
        this._untrackedGroup = this._sourceControl.createResourceGroup('untracked', vscode_1.l10n.t('Untracked Changes'), { multiDiffEditorEnableViewChanges: true });
        const updateIndexGroupVisibility = () => {
            const config = vscode_1.workspace.getConfiguration('git', root);
            this.indexGroup.hideWhenEmpty = !config.get('alwaysShowStagedChangesResourceGroup');
        };
        const onConfigListener = (0, util_1.filterEvent)(vscode_1.workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.alwaysShowStagedChangesResourceGroup', root));
        onConfigListener(updateIndexGroupVisibility, this, this.disposables);
        updateIndexGroupVisibility();
        vscode_1.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('git.mergeEditor')) {
                this.mergeGroup.resourceStates = this.mergeGroup.resourceStates.map(r => r.clone());
            }
        }, undefined, this.disposables);
        (0, util_1.filterEvent)(vscode_1.workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.branchSortOrder', root)
            || e.affectsConfiguration('git.untrackedChanges', root)
            || e.affectsConfiguration('git.ignoreSubmodules', root)
            || e.affectsConfiguration('git.openDiffOnClick', root)
            || e.affectsConfiguration('git.showActionButton', root)
            || e.affectsConfiguration('git.similarityThreshold', root))(() => this.updateModelState(), this, this.disposables);
        const updateInputBoxVisibility = () => {
            const config = vscode_1.workspace.getConfiguration('git', root);
            this._sourceControl.inputBox.visible = config.get('showCommitInput', true);
        };
        const onConfigListenerForInputBoxVisibility = (0, util_1.filterEvent)(vscode_1.workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.showCommitInput', root));
        onConfigListenerForInputBoxVisibility(updateInputBoxVisibility, this, this.disposables);
        updateInputBoxVisibility();
        this.mergeGroup.hideWhenEmpty = true;
        this.untrackedGroup.hideWhenEmpty = true;
        this.disposables.push(this.mergeGroup);
        this.disposables.push(this.indexGroup);
        this.disposables.push(this.workingTreeGroup);
        this.disposables.push(this.untrackedGroup);
        // Don't allow auto-fetch in untrusted workspaces
        if (vscode_1.workspace.isTrusted) {
            this.disposables.push(new autofetch_1.AutoFetcher(this, globalState));
        }
        else {
            const trustDisposable = vscode_1.workspace.onDidGrantWorkspaceTrust(() => {
                trustDisposable.dispose();
                this.disposables.push(new autofetch_1.AutoFetcher(this, globalState));
            });
            this.disposables.push(trustDisposable);
        }
        // https://github.com/microsoft/vscode/issues/39039
        const onSuccessfulPush = (0, util_1.filterEvent)(this.onDidRunOperation, e => e.operation.kind === "Push" /* OperationKind.Push */ && !e.error);
        onSuccessfulPush(() => {
            const gitConfig = vscode_1.workspace.getConfiguration('git');
            if (gitConfig.get('showPushSuccessNotification')) {
                vscode_1.window.showInformationMessage(vscode_1.l10n.t('Successfully pushed.'));
            }
        }, null, this.disposables);
        // Default branch protection provider
        const onBranchProtectionProviderChanged = (0, util_1.filterEvent)(this.branchProtectionProviderRegistry.onDidChangeBranchProtectionProviders, e => (0, util_1.pathEquals)(e.fsPath, root.fsPath));
        this.disposables.push(onBranchProtectionProviderChanged(root => this.updateBranchProtectionMatchers(root)));
        this.disposables.push(this.branchProtectionProviderRegistry.registerBranchProtectionProvider(root, new branchProtection_1.GitBranchProtectionProvider(root)));
        const statusBar = new statusbar_1.StatusBarCommands(this, remoteSourcePublisherRegistry);
        this.disposables.push(statusBar);
        statusBar.onDidChange(() => this._sourceControl.statusBarCommands = statusBar.commands, null, this.disposables);
        this._sourceControl.statusBarCommands = statusBar.commands;
        this.commitCommandCenter = new postCommitCommands_1.CommitCommandsCenter(globalState, this, postCommitCommandsProviderRegistry);
        this.disposables.push(this.commitCommandCenter);
        const actionButton = new actionButton_1.ActionButton(this, this.commitCommandCenter, this.logger);
        this.disposables.push(actionButton);
        actionButton.onDidChange(() => this._sourceControl.actionButton = actionButton.button, this, this.disposables);
        this._sourceControl.actionButton = actionButton.button;
        const progressManager = new ProgressManager(this);
        this.disposables.push(progressManager);
        const onDidChangeCountBadge = (0, util_1.filterEvent)(vscode_1.workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.countBadge', root));
        onDidChangeCountBadge(this.setCountBadge, this, this.disposables);
        this.setCountBadge();
    }
    validateInput(text, _) {
        if (this.isRepositoryHuge) {
            return {
                message: vscode_1.l10n.t('Too many changes were detected. Only the first {0} changes will be shown below.', this.isRepositoryHuge.limit),
                type: vscode_1.SourceControlInputBoxValidationType.Warning
            };
        }
        if (this.rebaseCommit) {
            if (this.rebaseCommit.message !== text) {
                return {
                    message: vscode_1.l10n.t('It\'s not possible to change the commit message in the middle of a rebase. Please complete the rebase operation and use interactive rebase instead.'),
                    type: vscode_1.SourceControlInputBoxValidationType.Warning
                };
            }
        }
        return undefined;
    }
    async getInputTemplate() {
        const commitMessage = (await Promise.all([this.repository.getMergeMessage(), this.repository.getSquashMessage()])).find(msg => !!msg);
        if (commitMessage) {
            return commitMessage;
        }
        return await this.repository.getCommitTemplate();
    }
    getConfigs() {
        return this.run(operation_1.Operation.Config(true), () => this.repository.getConfigs('local'));
    }
    getConfig(key) {
        return this.run(operation_1.Operation.Config(true), () => this.repository.config('get', 'local', key));
    }
    getGlobalConfig(key) {
        return this.run(operation_1.Operation.Config(true), () => this.repository.config('get', 'global', key));
    }
    setConfig(key, value) {
        return this.run(operation_1.Operation.Config(false), () => this.repository.config('add', 'local', key, value));
    }
    unsetConfig(key) {
        return this.run(operation_1.Operation.Config(false), () => this.repository.config('unset', 'local', key));
    }
    log(options, cancellationToken) {
        const showProgress = !options || options.silent !== true;
        return this.run(operation_1.Operation.Log(showProgress), () => this.repository.log(options, cancellationToken));
    }
    logFile(uri, options, cancellationToken) {
        // TODO: This probably needs per-uri granularity
        return this.run(operation_1.Operation.LogFile, () => this.repository.logFile(uri, options, cancellationToken));
    }
    async status() {
        await this.run(operation_1.Operation.Status);
    }
    async refresh() {
        await this.run(operation_1.Operation.Refresh);
    }
    diff(cached) {
        return this.run(operation_1.Operation.Diff, () => this.repository.diff(cached));
    }
    diffWithHEAD(path) {
        return this.run(operation_1.Operation.Diff, () => this.repository.diffWithHEAD(path));
    }
    diffWithHEADShortStats(path) {
        return this.run(operation_1.Operation.Diff, () => this.repository.diffWithHEADShortStats(path));
    }
    diffWith(ref, path) {
        return this.run(operation_1.Operation.Diff, () => this.repository.diffWith(ref, path));
    }
    diffIndexWithHEAD(path) {
        return this.run(operation_1.Operation.Diff, () => this.repository.diffIndexWithHEAD(path));
    }
    diffIndexWithHEADShortStats(path) {
        return this.run(operation_1.Operation.Diff, () => this.repository.diffIndexWithHEADShortStats(path));
    }
    diffIndexWith(ref, path) {
        return this.run(operation_1.Operation.Diff, () => this.repository.diffIndexWith(ref, path));
    }
    diffBlobs(object1, object2) {
        return this.run(operation_1.Operation.Diff, () => this.repository.diffBlobs(object1, object2));
    }
    diffBetween(ref1, ref2, path) {
        return this.run(operation_1.Operation.Diff, () => this.repository.diffBetween(ref1, ref2, path));
    }
    diffBetweenPatch(ref1, ref2, path) {
        return this.run(operation_1.Operation.Diff, () => this.repository.diffBetweenPatch(`${ref1}...${ref2}`, { path }));
    }
    diffBetweenWithStats(ref1, ref2, path) {
        if (ref1 === this._EMPTY_TREE) {
            // Use git diff-tree to get the
            // changes in the first commit
            return this.diffTrees(ref1, ref2);
        }
        const scopedConfig = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
        const similarityThreshold = scopedConfig.get('similarityThreshold', 50);
        return this.run(operation_1.Operation.Diff, () => this.repository.diffBetweenWithStats(`${ref1}...${ref2}`, { path, similarityThreshold }));
    }
    diffBetweenWithStats2(ref, path) {
        const scopedConfig = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
        const similarityThreshold = scopedConfig.get('similarityThreshold', 50);
        return this.run(operation_1.Operation.Diff, () => this.repository.diffBetweenWithStats(ref, { path, similarityThreshold }));
    }
    diffTrees(treeish1, treeish2) {
        const scopedConfig = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
        const similarityThreshold = scopedConfig.get('similarityThreshold', 50);
        return this.run(operation_1.Operation.Diff, () => this.repository.diffTrees(treeish1, treeish2, { similarityThreshold }));
    }
    getMergeBase(ref1, ref2, ...refs) {
        return this.run(operation_1.Operation.MergeBase, () => this.repository.getMergeBase(ref1, ref2, ...refs));
    }
    async hashObject(data) {
        return this.run(operation_1.Operation.HashObject, () => this.repository.hashObject(data));
    }
    async add(resources, opts) {
        await this.run(operation_1.Operation.Add(!this.optimisticUpdateEnabled()), async () => {
            await this.repository.add(resources.map(r => r.fsPath), opts);
            this.closeDiffEditors([], [...resources.map(r => r.fsPath)]);
            // Accept working set changes across all chat sessions
            vscode_1.commands.executeCommand('_chat.editSessions.accept', resources);
        }, () => {
            const resourcePaths = resources.map(r => r.fsPath);
            const indexGroupResourcePaths = this.indexGroup.resourceStates.map(r => r.resourceUri.fsPath);
            // Collect added resources
            const addedResourceStates = [];
            for (const resource of [...this.mergeGroup.resourceStates, ...this.untrackedGroup.resourceStates, ...this.workingTreeGroup.resourceStates]) {
                if (resourcePaths.includes(resource.resourceUri.fsPath) && !indexGroupResourcePaths.includes(resource.resourceUri.fsPath)) {
                    addedResourceStates.push(resource.clone(1 /* ResourceGroupType.Index */));
                }
            }
            // Add new resource(s) to index group
            const indexGroup = [...this.indexGroup.resourceStates, ...addedResourceStates];
            // Remove resource(s) from merge group
            const mergeGroup = this.mergeGroup.resourceStates
                .filter(r => !resourcePaths.includes(r.resourceUri.fsPath));
            // Remove resource(s) from working group
            const workingTreeGroup = this.workingTreeGroup.resourceStates
                .filter(r => !resourcePaths.includes(r.resourceUri.fsPath));
            // Remove resource(s) from untracked group
            const untrackedGroup = this.untrackedGroup.resourceStates
                .filter(r => !resourcePaths.includes(r.resourceUri.fsPath));
            return { indexGroup, mergeGroup, workingTreeGroup, untrackedGroup };
        });
    }
    async rm(resources) {
        await this.run(operation_1.Operation.Remove, () => this.repository.rm(resources.map(r => r.fsPath)));
    }
    async stage(resource, contents, encoding) {
        await this.run(operation_1.Operation.Stage, async () => {
            const data = await vscode_1.workspace.encode(contents, { encoding });
            await this.repository.stage(resource.fsPath, data);
            this._onDidChangeOriginalResource.fire(resource);
            this.closeDiffEditors([], [...resource.fsPath]);
        });
    }
    async revert(resources) {
        await this.run(operation_1.Operation.RevertFiles(!this.optimisticUpdateEnabled()), async () => {
            await this.repository.revert('HEAD', resources.map(r => r.fsPath));
            for (const resource of resources) {
                this._onDidChangeOriginalResource.fire(resource);
            }
            this.closeDiffEditors([...resources.length !== 0 ?
                    resources.map(r => r.fsPath) :
                    this.indexGroup.resourceStates.map(r => r.resourceUri.fsPath)], []);
            // Clear AI contribution tracking for reverted resources
            const uris = resources.length !== 0
                ? resources
                : this.indexGroup.resourceStates.map(r => r.resourceUri);
            vscode_1.commands.executeCommand('_aiEdits.clearAiContributions', uris);
        }, () => {
            const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
            const untrackedChanges = config.get('untrackedChanges');
            const untrackedChangesResourceGroupType = untrackedChanges === 'mixed' ? 2 /* ResourceGroupType.WorkingTree */ : 3 /* ResourceGroupType.Untracked */;
            const resourcePaths = resources.length === 0 ?
                this.indexGroup.resourceStates.map(r => r.resourceUri.fsPath) : resources.map(r => r.fsPath);
            // Collect removed resources
            const trackedResources = [];
            const untrackedResources = [];
            for (const resource of this.indexGroup.resourceStates) {
                if (resourcePaths.includes(resource.resourceUri.fsPath)) {
                    if (resource.type === git_constants_1.Status.INDEX_ADDED) {
                        untrackedResources.push(resource.clone(untrackedChangesResourceGroupType));
                    }
                    else {
                        trackedResources.push(resource.clone(2 /* ResourceGroupType.WorkingTree */));
                    }
                }
            }
            // Remove resource(s) from index group
            const indexGroup = this.indexGroup.resourceStates
                .filter(r => !resourcePaths.includes(r.resourceUri.fsPath));
            // Add resource(s) to working group
            const workingTreeGroup = untrackedChanges === 'mixed' ?
                [...this.workingTreeGroup.resourceStates, ...trackedResources, ...untrackedResources] :
                [...this.workingTreeGroup.resourceStates, ...trackedResources];
            // Add resource(s) to untracked group
            const untrackedGroup = untrackedChanges === 'separate' ?
                [...this.untrackedGroup.resourceStates, ...untrackedResources] : undefined;
            return { indexGroup, workingTreeGroup, untrackedGroup };
        });
    }
    async restore(resources, options) {
        await this.run(operation_1.Operation.Restore(!this.optimisticUpdateEnabled()), async () => {
            const toClean = [];
            const toRestore = [];
            const resourceStates = [
                ...this.indexGroup.resourceStates,
                ...this.workingTreeGroup.resourceStates,
                ...this.untrackedGroup.resourceStates
            ];
            for (const resource of resources) {
                const scmResource = (0, util_1.find)(resourceStates, r => r.resourceUri.toString() === resource.toString());
                if (!scmResource) {
                    toRestore.push(resource.fsPath);
                    continue;
                }
                switch (scmResource.type) {
                    case git_constants_1.Status.UNTRACKED:
                    case git_constants_1.Status.IGNORED:
                        toClean.push(resource.fsPath);
                        break;
                    default:
                        toRestore.push(resource.fsPath);
                        break;
                }
            }
            if (toClean.length > 0) {
                await this._clean(toClean);
            }
            if (toRestore.length > 0) {
                await this.repository.restore(toRestore, options);
            }
            this.closeDiffEditors([], [...toClean, ...toRestore]);
            // Clear AI contribution tracking for discarded resources
            vscode_1.commands.executeCommand('_aiEdits.clearAiContributions', resources);
        });
    }
    async commit(message, opts = Object.create(null)) {
        const indexResources = [...this.indexGroup.resourceStates.map(r => r.resourceUri.fsPath)];
        const workingGroupResources = opts.all && opts.all !== 'tracked' ?
            [...this.workingTreeGroup.resourceStates.map(r => r.resourceUri.fsPath)] : [];
        if (this.rebaseCommit) {
            await this.run(operation_1.Operation.RebaseContinue, async () => {
                if (opts.all) {
                    const addOpts = opts.all === 'tracked' ? { update: true } : {};
                    await this.repository.add([], addOpts);
                }
                await this.repository.rebaseContinue();
                await this.commitOperationCleanup(message, indexResources, workingGroupResources);
            }, () => this.commitOperationGetOptimisticResourceGroups(opts));
        }
        else {
            // Set post-commit command to render the correct action button
            this.commitCommandCenter.postCommitCommand = opts.postCommitCommand;
            await this.run(operation_1.Operation.Commit, async () => {
                if (opts.all) {
                    const addOpts = opts.all === 'tracked' ? { update: true } : {};
                    await this.repository.add([], addOpts);
                }
                delete opts.all;
                if (opts.requireUserConfig === undefined || opts.requireUserConfig === null) {
                    const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
                    opts.requireUserConfig = config.get('requireGitUserConfig');
                }
                // Add AI co-author trailer if applicable
                message = await this.appendAICoAuthorTrailer(message, indexResources, workingGroupResources);
                await this.repository.commit(message, opts);
                await this.commitOperationCleanup(message, indexResources, workingGroupResources);
            }, () => this.commitOperationGetOptimisticResourceGroups(opts));
            // Execute post-commit command
            await this.run(operation_1.Operation.PostCommitCommand, async () => {
                await this.commitCommandCenter.executePostCommitCommand(opts.postCommitCommand);
            });
        }
    }
    async commitOperationCleanup(message, indexResources, workingGroupResources) {
        if (message) {
            this.inputBox.value = await this.getInputTemplate();
        }
        this.closeDiffEditors(indexResources, workingGroupResources);
        // Accept working set changes across all chat sessions
        const resources = indexResources.length !== 0
            ? indexResources.map(r => vscode_1.Uri.file(r))
            : workingGroupResources.map(r => vscode_1.Uri.file(r));
        vscode_1.commands.executeCommand('_chat.editSessions.accept', resources);
        // Clear AI contribution tracking for committed resources
        vscode_1.commands.executeCommand('_aiEdits.clearAiContributions', resources);
    }
    static AI_CO_AUTHOR_TRAILER = 'Co-authored-by: Copilot <copilot@github.com>';
    async appendAICoAuthorTrailer(message, indexResources, workingGroupResources) {
        if (!message) {
            return message;
        }
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
        const addAICoAuthor = config.get('addAICoAuthor', 'off');
        if (addAICoAuthor === 'off') {
            return message;
        }
        // Don't add if trailer is already present
        if (message.includes(Repository.AI_CO_AUTHOR_TRAILER)) {
            return message;
        }
        const resources = indexResources.length !== 0
            ? indexResources.map(r => vscode_1.Uri.file(r))
            : workingGroupResources.map(r => vscode_1.Uri.file(r));
        if (resources.length === 0) {
            return message;
        }
        try {
            const level = addAICoAuthor === 'all' ? 'all' : 'chatAndAgent';
            const hasAiContributions = await vscode_1.commands.executeCommand('_aiEdits.hasAiContributions', resources, level);
            if (hasAiContributions) {
                // Ensure proper trailer formatting: blank line before trailers
                const trimmed = message.trimEnd();
                return `${trimmed}\n\n${Repository.AI_CO_AUTHOR_TRAILER}`;
            }
        }
        catch {
            // Command may not be available (e.g., in web environment)
        }
        return message;
    }
    commitOperationGetOptimisticResourceGroups(opts) {
        let untrackedGroup = undefined, workingTreeGroup = undefined;
        if (opts.all === 'tracked') {
            workingTreeGroup = this.workingTreeGroup.resourceStates
                .filter(r => r.type === git_constants_1.Status.UNTRACKED);
        }
        else if (opts.all) {
            untrackedGroup = workingTreeGroup = [];
        }
        return { indexGroup: [], mergeGroup: [], untrackedGroup, workingTreeGroup };
    }
    async clean(resources) {
        await this.run(operation_1.Operation.Clean(!this.optimisticUpdateEnabled()), async () => {
            const toClean = [];
            const toCheckout = [];
            const submodulesToUpdate = [];
            const resourceStates = [...this.workingTreeGroup.resourceStates, ...this.untrackedGroup.resourceStates];
            resources.forEach(r => {
                const fsPath = r.fsPath;
                for (const submodule of this.submodules) {
                    if (path.join(this.root, submodule.path) === fsPath) {
                        submodulesToUpdate.push(fsPath);
                        return;
                    }
                }
                const raw = r.toString();
                const scmResource = (0, util_1.find)(resourceStates, sr => sr.resourceUri.toString() === raw);
                if (!scmResource) {
                    return;
                }
                switch (scmResource.type) {
                    case git_constants_1.Status.UNTRACKED:
                    case git_constants_1.Status.IGNORED:
                        toClean.push(fsPath);
                        break;
                    default:
                        toCheckout.push(fsPath);
                        break;
                }
            });
            if (toClean.length > 0) {
                await this._clean(toClean);
            }
            if (toCheckout.length > 0) {
                try {
                    await this.repository.checkout('', toCheckout);
                }
                catch (err) {
                    if (err.gitErrorCode !== git_constants_1.GitErrorCodes.BranchNotYetBorn) {
                        throw err;
                    }
                }
            }
            if (submodulesToUpdate.length > 0) {
                await this.repository.updateSubmodules(submodulesToUpdate);
            }
            this.closeDiffEditors([], [...toClean, ...toCheckout]);
            // Clear AI contribution tracking for discarded resources
            vscode_1.commands.executeCommand('_aiEdits.clearAiContributions', resources);
        }, () => {
            const resourcePaths = resources.map(r => r.fsPath);
            // Remove resource(s) from working group
            const workingTreeGroup = this.workingTreeGroup.resourceStates
                .filter(r => !resourcePaths.includes(r.resourceUri.fsPath));
            // Remove resource(s) from untracked group
            const untrackedGroup = this.untrackedGroup.resourceStates
                .filter(r => !resourcePaths.includes(r.resourceUri.fsPath));
            return { workingTreeGroup, untrackedGroup };
        });
    }
    async _clean(resources) {
        const config = vscode_1.workspace.getConfiguration('git');
        const discardUntrackedChangesToTrash = config.get('discardUntrackedChangesToTrash', true) && !util_1.isRemote && !util_1.isLinuxSnap;
        if (resources.length === 0) {
            return;
        }
        if (discardUntrackedChangesToTrash) {
            try {
                // Attempt to move the first resource to the recycle bin/trash to check
                // if it is supported. If it fails, we show a confirmation dialog and
                // fall back to deletion.
                await vscode_1.workspace.fs.delete(vscode_1.Uri.file(resources[0]), { useTrash: true });
                const limiter = new util_1.Limiter(5);
                await Promise.all(resources.slice(1).map(fsPath => limiter.queue(async () => await vscode_1.workspace.fs.delete(vscode_1.Uri.file(fsPath), { useTrash: true }))));
            }
            catch {
                const message = util_1.isWindows
                    ? vscode_1.l10n.t('Failed to delete using the Recycle Bin. Do you want to permanently delete instead?')
                    : vscode_1.l10n.t('Failed to delete using the Trash. Do you want to permanently delete instead?');
                const primaryAction = resources.length === 1
                    ? vscode_1.l10n.t('Delete File')
                    : vscode_1.l10n.t('Delete All {0} Files', resources.length);
                const result = await vscode_1.window.showWarningMessage(message, { modal: true }, primaryAction);
                if (result === primaryAction) {
                    // Delete permanently
                    await this.repository.clean(resources);
                }
            }
        }
        else {
            await this.repository.clean(resources);
        }
    }
    closeDiffEditors(indexResources, workingTreeResources, ignoreSetting = false) {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
        if (!config.get('closeDiffOnOperation', false) && !ignoreSetting) {
            return;
        }
        function checkTabShouldClose(input) {
            if (input.modified.scheme === 'git' && (indexResources === undefined || indexResources.some(r => (0, util_1.pathEquals)(r, input.modified.fsPath)))) {
                // Index
                return true;
            }
            if (input.modified.scheme === 'file' && input.original.scheme === 'git' && (workingTreeResources === undefined || workingTreeResources.some(r => (0, util_1.pathEquals)(r, input.modified.fsPath)))) {
                // Working Tree
                return true;
            }
            return false;
        }
        const diffEditorTabsToClose = vscode_1.window.tabGroups.all
            .flatMap(g => g.tabs)
            .filter(({ input }) => {
            if (input instanceof vscode_1.TabInputTextDiff || input instanceof vscode_1.TabInputNotebookDiff) {
                return checkTabShouldClose(input);
            }
            else if (input instanceof vscode_1.TabInputTextMultiDiff) {
                return input.textDiffs.every(checkTabShouldClose);
            }
            return false;
        });
        // Close editors
        vscode_1.window.tabGroups.close(diffEditorTabsToClose, true);
    }
    async branch(name, _checkout, _ref) {
        await this.run(operation_1.Operation.Branch, () => this.repository.branch(name, _checkout, _ref));
    }
    async deleteBranch(name, force) {
        return this.run(operation_1.Operation.DeleteBranch, async () => {
            await this.repository.deleteBranch(name, force);
            await this.repository.config('unset', 'local', `branch.${name}.vscode-merge-base`);
        });
    }
    async renameBranch(name) {
        await this.run(operation_1.Operation.RenameBranch, () => this.repository.renameBranch(name));
    }
    async fastForwardBranch(name) {
        // Get branch details
        const branch = await this.getBranch(name);
        if (!branch.upstream?.remote || !branch.upstream?.name || !branch.name) {
            return;
        }
        try {
            // Fast-forward the branch if possible
            const options = { remote: branch.upstream.remote, ref: `${branch.upstream.name}:${branch.name}` };
            await this.run(operation_1.Operation.Fetch(true), async () => this.repository.fetch(options));
        }
        catch (err) {
            if (err.gitErrorCode === git_constants_1.GitErrorCodes.BranchFastForwardRejected) {
                return;
            }
            throw err;
        }
    }
    async cherryPick(commitHash) {
        await this.run(operation_1.Operation.CherryPick, () => this.repository.cherryPick(commitHash));
    }
    async cherryPickAbort() {
        await this.run(operation_1.Operation.CherryPick, () => this.repository.cherryPickAbort());
    }
    async move(from, to) {
        await this.run(operation_1.Operation.Move, () => this.repository.move(from, to));
    }
    async getBranch(name) {
        return await this.run(operation_1.Operation.GetBranch, () => this.repository.getBranch(name));
    }
    async getBranches(query = {}, cancellationToken) {
        return await this.run(operation_1.Operation.GetBranches, async () => {
            const refs = await this.getRefs(query, cancellationToken);
            return refs.filter(value => value.type === git_constants_1.RefType.Head || (value.type === git_constants_1.RefType.RemoteHead && query.remote));
        });
    }
    async getBranchBase(ref) {
        const branch = await this.getBranch(ref);
        // Git config
        const mergeBaseConfigKey = `branch.${branch.name}.vscode-merge-base`;
        try {
            const mergeBase = await this.getConfig(mergeBaseConfigKey);
            const branchFromConfig = mergeBase !== '' ? await this.getBranch(mergeBase) : undefined;
            // There was a brief period of time when we would consider local branches as a valid
            // merge base. Since then we have fixed the issue and only remote branches can be used
            // as a merge base so we are adding an additional check.
            if (branchFromConfig && branchFromConfig.remote) {
                return branchFromConfig;
            }
        }
        catch (err) { }
        // Reflog
        const branchFromReflog = await this.getBranchBaseFromReflog(ref);
        let branchFromReflogUpstream = undefined;
        if (branchFromReflog?.type === git_constants_1.RefType.RemoteHead) {
            branchFromReflogUpstream = branchFromReflog;
        }
        else if (branchFromReflog?.type === git_constants_1.RefType.Head) {
            branchFromReflogUpstream = await this.getUpstreamBranch(branchFromReflog);
        }
        if (branchFromReflogUpstream) {
            await this.setConfig(mergeBaseConfigKey, `${branchFromReflogUpstream.remote}/${branchFromReflogUpstream.name}`);
            return branchFromReflogUpstream;
        }
        // Default branch
        const defaultBranch = await this.getDefaultBranch();
        if (defaultBranch) {
            await this.setConfig(mergeBaseConfigKey, `${defaultBranch.remote}/${defaultBranch.name}`);
            return defaultBranch;
        }
        return undefined;
    }
    async getBranchBaseFromReflog(ref) {
        try {
            const reflogEntries = await this.repository.reflog(ref, 'branch: Created from *.');
            if (reflogEntries.length !== 1) {
                return undefined;
            }
            // Branch created from an explicit branch
            const match = reflogEntries[0].match(/branch: Created from (?<name>.*)$/);
            if (match && match.length === 2 && match[1] !== 'HEAD') {
                return await this.getBranch(match[1]);
            }
            // Branch created from HEAD
            const headReflogEntries = await this.repository.reflog('HEAD', `checkout: moving from .* to ${ref.replace('refs/heads/', '')}`);
            if (headReflogEntries.length === 0) {
                return undefined;
            }
            const match2 = headReflogEntries[headReflogEntries.length - 1].match(/checkout: moving from ([^\s]+)\s/);
            if (match2 && match2.length === 2) {
                return await this.getBranch(match2[1]);
            }
        }
        catch (err) { }
        return undefined;
    }
    async getDefaultBranch() {
        const defaultRemote = this.getDefaultRemote();
        if (!defaultRemote) {
            return undefined;
        }
        try {
            const defaultBranch = await this.repository.getDefaultBranch(defaultRemote.name);
            return defaultBranch;
        }
        catch (err) {
            this.logger.warn(`[Repository][getDefaultBranch] Failed to get default branch details: ${err.message}.`);
            return undefined;
        }
    }
    async getUpstreamBranch(branch) {
        if (!branch.upstream) {
            return undefined;
        }
        try {
            const upstreamBranch = await this.getBranch(`refs/remotes/${branch.upstream.remote}/${branch.upstream.name}`);
            return upstreamBranch;
        }
        catch (err) {
            this.logger.warn(`[Repository][getUpstreamBranch] Failed to get branch details for 'refs/remotes/${branch.upstream.remote}/${branch.upstream.name}': ${err.message}.`);
            return undefined;
        }
    }
    async getRefs(query = {}, cancellationToken) {
        const config = vscode_1.workspace.getConfiguration('git');
        let defaultSort = config.get('branchSortOrder');
        if (defaultSort !== 'alphabetically' && defaultSort !== 'committerdate') {
            defaultSort = 'alphabetically';
        }
        query = { ...query, sort: query?.sort ?? defaultSort };
        return await this.run(operation_1.Operation.GetRefs, () => this.repository.getRefs(query, cancellationToken));
    }
    async getWorktrees() {
        return await this.run(operation_1.Operation.Worktree(true), () => this.repository.getWorktrees());
    }
    async getWorktreeDetails() {
        return this.run(operation_1.Operation.Worktree(true), async () => {
            const worktrees = await this.repository.getWorktrees();
            if (worktrees.length === 0) {
                return [];
            }
            // Get refs for worktrees that point to a ref
            const worktreeRefs = worktrees
                .filter(worktree => !worktree.detached)
                .map(worktree => worktree.ref);
            // Get the commit details for worktrees that point to a ref
            const refs = await this.getRefs({ pattern: worktreeRefs, includeCommitDetails: true });
            // Get the commit details for detached worktrees
            const commits = await Promise.all(worktrees
                .filter(worktree => worktree.detached)
                .map(worktree => this.repository.getCommit(worktree.ref)));
            return worktrees.map(worktree => {
                const commitDetails = worktree.detached
                    ? commits.find(commit => commit.hash === worktree.ref)
                    : refs.find(ref => `refs/heads/${ref.name}` === worktree.ref)?.commitDetails;
                return { ...worktree, commitDetails };
            });
        });
    }
    async getRemoteRefs(remote, opts) {
        return await this.run(operation_1.Operation.GetRemoteRefs, () => this.repository.getRemoteRefs(remote, opts));
    }
    async setBranchUpstream(name, upstream) {
        await this.run(operation_1.Operation.SetBranchUpstream, () => this.repository.setBranchUpstream(name, upstream));
    }
    async merge(ref) {
        await this.run(operation_1.Operation.Merge, () => this.repository.merge(ref));
    }
    async mergeAbort() {
        await this.run(operation_1.Operation.MergeAbort, async () => await this.repository.mergeAbort());
    }
    async rebase(branch) {
        await this.run(operation_1.Operation.Rebase, () => this.repository.rebase(branch));
    }
    async tag(options) {
        await this.run(operation_1.Operation.Tag, () => this.repository.tag(options));
    }
    async deleteTag(name) {
        await this.run(operation_1.Operation.DeleteTag, () => this.repository.deleteTag(name));
    }
    async createWorktree(options) {
        const defaultWorktreeRoot = this.globalState.get(`${Repository.WORKTREE_ROOT_STORAGE_KEY}:${this.root}`);
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
        const branchPrefix = config.get('branchPrefix', '');
        return await this.run(operation_1.Operation.Worktree(false), async () => {
            let worktreeName;
            let { path: worktreePath, commitish, branch } = options || {};
            // Create worktree path based on the branch name
            if (worktreePath === undefined && branch !== undefined) {
                worktreeName = branch.startsWith(branchPrefix)
                    ? branch.substring(branchPrefix.length).replace(/\//g, '-')
                    : branch.replace(/\//g, '-');
                worktreePath = defaultWorktreeRoot
                    ? path.join(defaultWorktreeRoot, worktreeName)
                    : path.join(path.dirname(this.root), `${path.basename(this.root)}.worktrees`, worktreeName);
            }
            // Ensure that the worktree path is unique
            if (this.worktrees.some(worktree => (0, util_1.pathEquals)(path.normalize(worktree.path), path.normalize(worktreePath)))) {
                let counter = 0, uniqueWorktreePath;
                do {
                    uniqueWorktreePath = `${worktreePath}-${++counter}`;
                } while (this.worktrees.some(wt => (0, util_1.pathEquals)(path.normalize(wt.path), path.normalize(uniqueWorktreePath))));
                worktreePath = uniqueWorktreePath;
            }
            // Create the worktree
            await this.repository.addWorktree({ path: worktreePath, commitish: commitish ?? 'HEAD', branch });
            // Update worktree root in global state
            const newWorktreeRoot = path.dirname(worktreePath);
            if (defaultWorktreeRoot && !(0, util_1.pathEquals)(newWorktreeRoot, defaultWorktreeRoot)) {
                this.globalState.update(`${Repository.WORKTREE_ROOT_STORAGE_KEY}:${this.root}`, newWorktreeRoot);
            }
            this._setupWorktree(worktreePath);
            return worktreePath;
        });
    }
    async _setupWorktree(worktreePath) {
        // Copy worktree include files and wait for the copy to complete
        // before running any worktree-created tasks.
        await this._copyWorktreeIncludeFiles(worktreePath);
        await this._runWorktreeCreatedTasks(worktreePath);
    }
    async _runWorktreeCreatedTasks(worktreePath) {
        try {
            const allTasks = await vscode_1.tasks.fetchTasks();
            const worktreeTasks = allTasks.filter(task => task.runOptions.runOn === vscode_1.TaskRunOn.WorktreeCreated);
            for (const task of worktreeTasks) {
                const worktreeTask = retargetTaskToWorktree(task, worktreePath);
                if (!worktreeTask) {
                    this.logger.warn(`[Repository][_runWorktreeCreatedTasks] Skipped task '${task.name}' because it could not be retargeted to worktree '${worktreePath}'.`);
                    continue;
                }
                vscode_1.tasks.executeTask(worktreeTask).then(undefined, err => {
                    this.logger.warn(`[Repository][_runWorktreeCreatedTasks] Failed to execute worktree-created task '${task.name}' for '${worktreePath}': ${err}`);
                });
            }
        }
        catch (err) {
            this.logger.warn(`[Repository][_runWorktreeCreatedTasks] Failed to execute worktree-created tasks for '${worktreePath}': ${err}`);
        }
    }
    async _getWorktreeIncludePaths() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
        const worktreeIncludeFiles = config.get('worktreeIncludeFiles', []);
        if (worktreeIncludeFiles.length === 0) {
            return new Set();
        }
        const filePattern = worktreeIncludeFiles
            .map(pattern => new vscode_1.RelativePattern(this.root, pattern));
        // Get all files matching the globs (no ignore files applied)
        const allFiles = await vscode_1.workspace.findFiles2(filePattern, {
            useExcludeSettings: vscode_1.ExcludeSettingOptions.None,
            useIgnoreFiles: { local: false, parent: false, global: false }
        });
        // Get files matching the globs with git ignore files applied
        const nonIgnoredFiles = await vscode_1.workspace.findFiles2(filePattern, {
            useExcludeSettings: vscode_1.ExcludeSettingOptions.None,
            useIgnoreFiles: { local: true, parent: true, global: true }
        });
        // Files that are git ignored = all files - non-ignored files
        const gitIgnoredFiles = new Set(allFiles.map(uri => uri.fsPath));
        for (const uri of nonIgnoredFiles) {
            gitIgnoredFiles.delete(uri.fsPath);
        }
        // Compute the base directory for each glob pattern (the fixed
        // prefix before any wildcard characters). This will be used to
        // optimize the upward traversal when adding parent directories.
        const filePatternBases = new Set();
        for (const pattern of worktreeIncludeFiles) {
            const segments = pattern.split(/[\/\\]/);
            const fixedSegments = [];
            for (const seg of segments) {
                if (/[*?{}[\]]/.test(seg)) {
                    break;
                }
                fixedSegments.push(seg);
            }
            filePatternBases.add(path.join(this.root, ...fixedSegments));
        }
        // Add the folder paths for git ignored files, walking
        // up only to the nearest file pattern base directory.
        const gitIgnoredPaths = new Set(gitIgnoredFiles);
        for (const filePath of gitIgnoredFiles) {
            let dir = path.dirname(filePath);
            while (dir !== this.root && !gitIgnoredPaths.has(dir)) {
                gitIgnoredPaths.add(dir);
                if (filePatternBases.has(dir)) {
                    break;
                }
                dir = path.dirname(dir);
            }
        }
        // Find minimal set of paths (folders and files) to copy. Keep only topmost
        // paths — if a directory is already in the set, all its descendants are
        // implicitly included and don't need separate entries.
        let lastTopmost;
        const pathsToCopy = new Set();
        for (const p of Array.from(gitIgnoredPaths).sort()) {
            if (lastTopmost && (p === lastTopmost || p.startsWith(lastTopmost + path.sep))) {
                continue;
            }
            pathsToCopy.add(p);
            lastTopmost = p;
        }
        return pathsToCopy;
    }
    async _copyWorktreeIncludeFiles(worktreePath) {
        const worktreeIncludePaths = await this._getWorktreeIncludePaths();
        if (worktreeIncludePaths.size === 0) {
            return;
        }
        try {
            const startTime = performance.now();
            const limiter = new util_1.Limiter(15);
            const files = Array.from(worktreeIncludePaths);
            // Copy files
            const results = await Promise.allSettled(files.map(sourceFile => {
                return limiter.queue(async () => {
                    const targetFile = path.join(worktreePath, (0, util_1.relativePath)(this.root, sourceFile));
                    await fsPromises.mkdir(path.dirname(targetFile), { recursive: true });
                    await (0, fs_copyfile_1.cp)(sourceFile, targetFile, { force: true, recursive: true, verbatimSymlinks: true });
                });
            }));
            // Log any failed operations
            const failedOperations = results.filter(r => r.status === 'rejected');
            this.logger.info(`[Repository][_copyWorktreeIncludeFiles] Copied ${files.length - failedOperations.length}/${files.length} folder(s)/file(s) to worktree. [${(performance.now() - startTime).toFixed(2)}ms]`);
            if (failedOperations.length > 0) {
                vscode_1.window.showWarningMessage(vscode_1.l10n.t('Failed to copy {0} folder(s)/file(s) to the worktree.', failedOperations.length));
                this.logger.warn(`[Repository][_copyWorktreeIncludeFiles] Failed to copy ${failedOperations.length} folder(s)/file(s) to worktree.`);
                for (const error of failedOperations) {
                    this.logger.warn(`  - ${error.reason}`);
                }
            }
        }
        catch (err) {
            this.logger.warn(`[Repository][_copyWorktreeIncludeFiles] Failed to copy folder(s)/file(s) to worktree: ${err}`);
        }
    }
    async deleteWorktree(path, options) {
        await this.run(operation_1.Operation.Worktree(false), async () => {
            const worktree = this.repositoryResolver.getRepository(path);
            const deleteWorktree = async (options) => {
                await this.repository.deleteWorktree(path, options);
                worktree?.dispose();
            };
            try {
                await deleteWorktree();
            }
            catch (err) {
                if (err.gitErrorCode === git_constants_1.GitErrorCodes.WorktreeContainsChanges) {
                    const forceDelete = vscode_1.l10n.t('Force Delete');
                    const message = vscode_1.l10n.t('The worktree contains modified or untracked files. Do you want to force delete?');
                    const choice = await vscode_1.window.showWarningMessage(message, { modal: true }, forceDelete);
                    if (choice === forceDelete) {
                        await deleteWorktree({ ...options, force: true });
                    }
                    return;
                }
                throw err;
            }
        });
    }
    async deleteRemoteRef(remoteName, refName, options) {
        await this.run(operation_1.Operation.DeleteRemoteRef, () => this.repository.deleteRemoteRef(remoteName, refName, options));
    }
    async checkout(treeish, opts) {
        const refLabel = opts?.detached ? (0, util_1.getCommitShortHash)(vscode_1.Uri.file(this.root), treeish) : treeish;
        await this.run(operation_1.Operation.Checkout(refLabel), async () => {
            if (opts?.pullBeforeCheckout && !opts?.detached) {
                try {
                    await this.fastForwardBranch(treeish);
                }
                catch (err) {
                    // noop
                }
            }
            await this.repository.checkout(treeish, [], opts);
            // Clear all AI contribution tracking on branch switch
            vscode_1.commands.executeCommand('_aiEdits.clearAllAiContributions');
        });
    }
    async checkoutTracking(treeish, opts = {}) {
        const refLabel = opts.detached ? (0, util_1.getCommitShortHash)(vscode_1.Uri.file(this.root), treeish) : treeish;
        await this.run(operation_1.Operation.CheckoutTracking(refLabel), async () => {
            await this.repository.checkout(treeish, [], { ...opts, track: true });
            // Clear all AI contribution tracking on branch switch
            vscode_1.commands.executeCommand('_aiEdits.clearAllAiContributions');
        });
    }
    async findTrackingBranches(upstreamRef) {
        return await this.run(operation_1.Operation.FindTrackingBranches, () => this.repository.findTrackingBranches(upstreamRef));
    }
    async getCommit(ref) {
        return await this.repository.getCommit(ref);
    }
    async showChanges(ref) {
        return await this.run(operation_1.Operation.Log(false), () => this.repository.showChanges(ref));
    }
    async showChangesBetween(ref1, ref2, path) {
        return await this.run(operation_1.Operation.Log(false), () => this.repository.showChangesBetween(ref1, ref2, path));
    }
    async getEmptyTree() {
        if (!this._EMPTY_TREE) {
            const result = await this.repository.exec(['hash-object', '-t', 'tree', '/dev/null']);
            this._EMPTY_TREE = result.stdout.trim();
        }
        return this._EMPTY_TREE;
    }
    async reset(treeish, hard) {
        await this.run(operation_1.Operation.Reset, async () => {
            await this.repository.reset(treeish, hard);
            if (hard) {
                // Clear all AI contribution tracking on hard reset
                vscode_1.commands.executeCommand('_aiEdits.clearAllAiContributions');
            }
        });
    }
    async deleteRef(ref) {
        await this.run(operation_1.Operation.DeleteRef, () => this.repository.deleteRef(ref));
    }
    getDefaultRemote() {
        if (this.remotes.length === 0) {
            return undefined;
        }
        return this.remotes.find(r => r.name === 'origin') ?? this.remotes[0];
    }
    async addRemote(name, url) {
        await this.run(operation_1.Operation.Remote, async () => {
            const result = await this.repository.addRemote(name, url);
            this.repositoryCache.update(this.remotes, [], this.root);
            return result;
        });
    }
    async removeRemote(name) {
        await this.run(operation_1.Operation.Remote, async () => {
            const result = this.repository.removeRemote(name);
            const remote = this.remotes.find(remote => remote.name === name);
            if (remote) {
                this.repositoryCache.update([], [remote], this.root);
            }
            return result;
        });
    }
    async renameRemote(name, newName) {
        await this.run(operation_1.Operation.Remote, () => this.repository.renameRemote(name, newName));
    }
    async fetchDefault(options = {}) {
        await this._fetch({ silent: options.silent });
    }
    async fetchPrune() {
        await this._fetch({ prune: true });
    }
    async fetchAll(options = {}, cancellationToken) {
        await this._fetch({ all: true, silent: options.silent, cancellationToken });
    }
    async fetch(options) {
        await this._fetch(options);
    }
    async _fetch(options = {}) {
        if (!options.prune) {
            const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
            const prune = config.get('pruneOnFetch');
            options.prune = prune;
        }
        await this.run(operation_1.Operation.Fetch(options.silent !== true), async () => this.repository.fetch(options));
    }
    async pullWithRebase(head) {
        let remote;
        let branch;
        if (head && head.name && head.upstream) {
            remote = head.upstream.remote;
            branch = `${head.upstream.name}`;
        }
        return this.pullFrom(true, remote, branch);
    }
    async pull(head, unshallow) {
        let remote;
        let branch;
        if (head && head.name && head.upstream) {
            remote = head.upstream.remote;
            branch = `${head.upstream.name}`;
        }
        return this.pullFrom(false, remote, branch, unshallow);
    }
    async pullFrom(rebase, remote, branch, unshallow) {
        await this.run(operation_1.Operation.Pull, async () => {
            await this.maybeAutoStash(async () => {
                const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
                const autoStash = config.get('autoStash');
                const fetchOnPull = config.get('fetchOnPull');
                const tags = config.get('pullTags');
                // When fetchOnPull is enabled, fetch all branches when pulling
                if (fetchOnPull) {
                    await this.fetchAll();
                }
                if (await this.checkIfMaybeRebased(this.HEAD?.name)) {
                    await this._pullAndHandleTagConflict(rebase, remote, branch, { unshallow, tags, autoStash });
                }
            });
        });
    }
    async _pullAndHandleTagConflict(rebase, remote, branch, options = {}) {
        try {
            await this.repository.pull(rebase, remote, branch, options);
        }
        catch (err) {
            if (err.gitErrorCode !== git_constants_1.GitErrorCodes.TagConflict) {
                throw err;
            }
            // Handle tag(s) conflict
            if (await this.handleTagConflict(remote, err.stderr)) {
                await this.repository.pull(rebase, remote, branch, options);
            }
        }
    }
    async push(head, forcePushMode) {
        let remote;
        let branch;
        if (head && head.name && head.upstream) {
            remote = head.upstream.remote;
            branch = `${head.name}:${head.upstream.name}`;
        }
        await this.run(operation_1.Operation.Push, () => this._push(remote, branch, undefined, undefined, forcePushMode));
    }
    async pushTo(remote, name, setUpstream = false, forcePushMode) {
        await this.run(operation_1.Operation.Push, () => this._push(remote, name, setUpstream, undefined, forcePushMode));
    }
    async pushFollowTags(remote, forcePushMode) {
        await this.run(operation_1.Operation.Push, () => this._push(remote, undefined, false, true, forcePushMode));
    }
    async pushTags(remote, forcePushMode) {
        await this.run(operation_1.Operation.Push, () => this._push(remote, undefined, false, false, forcePushMode, true));
    }
    async blame(path) {
        return await this.run(operation_1.Operation.Blame(true), () => this.repository.blame(path));
    }
    async blame2(path, ref) {
        return await this.run(operation_1.Operation.Blame(false), () => {
            const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
            const ignoreWhitespace = config.get('blame.ignoreWhitespace', false);
            return this.repository.blame2(path, ref, ignoreWhitespace);
        });
    }
    sync(head, rebase) {
        return this._sync(head, rebase);
    }
    async _sync(head, rebase) {
        let remoteName;
        let pullBranch;
        let pushBranch;
        if (head.name && head.upstream) {
            remoteName = head.upstream.remote;
            pullBranch = `${head.upstream.name}`;
            pushBranch = `${head.name}:${head.upstream.name}`;
        }
        await this.run(operation_1.Operation.Sync, async () => {
            await this.maybeAutoStash(async () => {
                const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
                const autoStash = config.get('autoStash');
                const fetchOnPull = config.get('fetchOnPull');
                const tags = config.get('pullTags');
                const followTags = config.get('followTagsWhenSync');
                const supportCancellation = config.get('supportCancellation');
                const fn = async (cancellationToken) => {
                    // When fetchOnPull is enabled, fetch all branches when pulling
                    if (fetchOnPull) {
                        await this.fetchAll({}, cancellationToken);
                    }
                    if (await this.checkIfMaybeRebased(this.HEAD?.name)) {
                        await this._pullAndHandleTagConflict(rebase, remoteName, pullBranch, { tags, cancellationToken, autoStash });
                    }
                };
                if (supportCancellation) {
                    const opts = {
                        location: vscode_1.ProgressLocation.Notification,
                        title: vscode_1.l10n.t('Syncing. Cancelling may cause serious damages to the repository'),
                        cancellable: true
                    };
                    await vscode_1.window.withProgress(opts, (_, token) => fn(token));
                }
                else {
                    await fn();
                }
                const remote = this.remotes.find(r => r.name === remoteName);
                if (remote && remote.isReadOnly) {
                    return;
                }
                const shouldPush = this.HEAD && (typeof this.HEAD.ahead === 'number' ? this.HEAD.ahead > 0 : true);
                if (shouldPush) {
                    await this._push(remoteName, pushBranch, false, followTags);
                }
            });
        });
    }
    async checkIfMaybeRebased(currentBranch) {
        const config = vscode_1.workspace.getConfiguration('git');
        const shouldIgnore = config.get('ignoreRebaseWarning') === true;
        if (shouldIgnore) {
            return true;
        }
        const maybeRebased = await this.run(operation_1.Operation.Log(true), async () => {
            try {
                const result = await this.repository.exec(['log', '--oneline', '--cherry', `${currentBranch ?? ''}...${currentBranch ?? ''}@{upstream}`, '--']);
                if (result.exitCode) {
                    return false;
                }
                return /^=/.test(result.stdout);
            }
            catch {
                return false;
            }
        });
        if (!maybeRebased) {
            return true;
        }
        const always = { title: vscode_1.l10n.t('Always Pull') };
        const pull = { title: vscode_1.l10n.t('Pull') };
        const cancel = { title: vscode_1.l10n.t('Don\'t Pull') };
        const result = await vscode_1.window.showWarningMessage(currentBranch
            ? vscode_1.l10n.t('It looks like the current branch "{0}" might have been rebased. Are you sure you still want to pull into it?', currentBranch)
            : vscode_1.l10n.t('It looks like the current branch might have been rebased. Are you sure you still want to pull into it?'), always, pull, cancel);
        if (result === pull) {
            return true;
        }
        if (result === always) {
            await config.update('ignoreRebaseWarning', true, true);
            return true;
        }
        return false;
    }
    async show(ref, filePath) {
        return await this.run(operation_1.Operation.Show, async () => {
            try {
                const content = await this.repository.buffer(ref, filePath);
                return await vscode_1.workspace.decode(content, { uri: vscode_1.Uri.file(filePath) });
            }
            catch (err) {
                if (err.gitErrorCode === git_constants_1.GitErrorCodes.WrongCase) {
                    const gitFilePath = await this.repository.getGitFilePath(ref, filePath);
                    const content = await this.repository.buffer(ref, gitFilePath);
                    return await vscode_1.workspace.decode(content, { uri: vscode_1.Uri.file(filePath) });
                }
                throw err;
            }
        });
    }
    async buffer(ref, filePath) {
        return this.run(operation_1.Operation.Show, () => this.repository.buffer(ref, filePath));
    }
    getObjectFiles(ref) {
        return this.run(operation_1.Operation.GetObjectFiles, () => this.repository.lstree(ref));
    }
    getObjectDetails(ref, path) {
        return this.run(operation_1.Operation.GetObjectDetails, () => this.repository.getObjectDetails(ref, path));
    }
    detectObjectType(object) {
        return this.run(operation_1.Operation.Show, () => this.repository.detectObjectType(object));
    }
    async apply(patch, options) {
        return await this.run(operation_1.Operation.Apply, () => this.repository.apply(patch, options));
    }
    async getStashes() {
        return this.run(operation_1.Operation.Stash(true), () => this.repository.getStashes());
    }
    async createStash(message, includeUntracked, staged) {
        const indexResources = [...this.indexGroup.resourceStates.map(r => r.resourceUri.fsPath)];
        const workingGroupResources = [
            ...!staged ? this.workingTreeGroup.resourceStates.map(r => r.resourceUri.fsPath) : [],
            ...includeUntracked ? this.untrackedGroup.resourceStates.map(r => r.resourceUri.fsPath) : []
        ];
        return await this.run(operation_1.Operation.Stash(false), async () => {
            await this.repository.createStash(message, includeUntracked, staged);
            this.closeDiffEditors(indexResources, workingGroupResources);
        });
    }
    async popStash(index, options) {
        return await this.run(operation_1.Operation.Stash(false), () => this.repository.popStash(index, options));
    }
    async dropStash(index) {
        return await this.run(operation_1.Operation.Stash(false), () => this.repository.dropStash(index));
    }
    async applyStash(index, options) {
        return await this.run(operation_1.Operation.Stash(false), () => this.repository.applyStash(index, options));
    }
    async showStash(index) {
        return await this.run(operation_1.Operation.Stash(true), () => this.repository.showStash(index));
    }
    async getCommitTemplate() {
        return await this.run(operation_1.Operation.GetCommitTemplate, async () => this.repository.getCommitTemplate());
    }
    async ignore(files) {
        return await this.run(operation_1.Operation.Ignore, async () => {
            const ignoreFile = `${this.repository.root}${path.sep}.gitignore`;
            const textToAppend = files
                .map(uri => (0, util_1.relativePath)(this.repository.root, uri.fsPath)
                .replace(/\\|\[/g, match => match === '\\' ? '/' : `\\${match}`))
                .join('\n');
            const document = await new Promise(c => fs.exists(ignoreFile, c))
                ? await vscode_1.workspace.openTextDocument(ignoreFile)
                : await vscode_1.workspace.openTextDocument(vscode_1.Uri.file(ignoreFile).with({ scheme: 'untitled' }));
            await vscode_1.window.showTextDocument(document);
            const edit = new vscode_1.WorkspaceEdit();
            const lastLine = document.lineAt(document.lineCount - 1);
            const text = lastLine.isEmptyOrWhitespace ? `${textToAppend}\n` : `\n${textToAppend}\n`;
            edit.insert(document.uri, lastLine.range.end, text);
            await vscode_1.workspace.applyEdit(edit);
            await document.save();
        });
    }
    async rebaseAbort() {
        await this.run(operation_1.Operation.RebaseAbort, async () => await this.repository.rebaseAbort());
    }
    checkIgnore(filePaths) {
        return this.run(operation_1.Operation.CheckIgnore, () => {
            return new Promise((resolve, reject) => {
                filePaths = filePaths
                    .filter(filePath => (0, util_1.isDescendant)(this.root, filePath));
                if (filePaths.length === 0) {
                    // nothing left
                    return resolve(new Set());
                }
                // https://git-scm.com/docs/git-check-ignore#git-check-ignore--z
                const child = this.repository.stream(['check-ignore', '-v', '-z', '--stdin'], { stdio: [null, null, null] });
                if (!child.stdin) {
                    return reject(new git_1.GitError({
                        message: 'Failed to spawn git process',
                        exitCode: -1
                    }));
                }
                child.stdin.end(filePaths.join('\0'), 'utf8');
                const onExit = (exitCode) => {
                    if (exitCode === 1) {
                        // nothing ignored
                        resolve(new Set());
                    }
                    else if (exitCode === 0) {
                        resolve(new Set(this.parseIgnoreCheck(data)));
                    }
                    else {
                        if (/ is in submodule /.test(stderr)) {
                            reject(new git_1.GitError({ stdout: data, stderr, exitCode, gitErrorCode: git_constants_1.GitErrorCodes.IsInSubmodule }));
                        }
                        else {
                            reject(new git_1.GitError({ stdout: data, stderr, exitCode }));
                        }
                    }
                };
                let data = '';
                const onStdoutData = (raw) => {
                    data += raw;
                };
                if (child.stdout) {
                    child.stdout.setEncoding('utf8');
                    child.stdout.on('data', onStdoutData);
                }
                let stderr = '';
                if (child.stderr) {
                    child.stderr.setEncoding('utf8');
                    child.stderr.on('data', raw => stderr += raw);
                }
                child.on('error', reject);
                child.on('exit', onExit);
            });
        });
    }
    // Parses output of `git check-ignore -v -z` and returns only those paths
    // that are actually ignored by git.
    // Matches to a negative pattern (starting with '!') are filtered out.
    // See also https://git-scm.com/docs/git-check-ignore#_output.
    parseIgnoreCheck(raw) {
        const ignored = [];
        const elements = raw.split('\0');
        for (let i = 0; i < elements.length; i += 4) {
            const pattern = elements[i + 2];
            const path = elements[i + 3];
            if (pattern && !pattern.startsWith('!')) {
                ignored.push(path);
            }
        }
        return ignored;
    }
    async _push(remote, refspec, setUpstream = false, followTags = false, forcePushMode, tags = false) {
        try {
            await this.repository.push(remote, refspec, setUpstream, followTags, forcePushMode, tags);
        }
        catch (err) {
            if (!remote || !refspec) {
                throw err;
            }
            const repository = new api1_1.ApiRepository(this);
            const remoteObj = repository.state.remotes.find(r => r.name === remote);
            if (!remoteObj) {
                throw err;
            }
            for (const handler of this.pushErrorHandlerRegistry.getPushErrorHandlers()) {
                if (await handler.handlePushError(repository, remoteObj, refspec, err)) {
                    return;
                }
            }
            throw err;
        }
    }
    async run(operation, runOperation = () => Promise.resolve(null), getOptimisticResourceGroups = () => undefined) {
        if (this.state !== 0 /* RepositoryState.Idle */) {
            throw new Error('Repository not initialized');
        }
        let error = null;
        this._operations.start(operation);
        this._onRunOperation.fire(operation.kind);
        try {
            const result = await this.retryRun(operation, runOperation);
            if (!operation.readOnly) {
                await this.updateModelState(this.optimisticUpdateEnabled() ? getOptimisticResourceGroups() : undefined);
            }
            return result;
        }
        catch (err) {
            error = err;
            if (err instanceof git_1.GitError && err.gitErrorCode === git_constants_1.GitErrorCodes.NotAGitRepository) {
                this.state = 1 /* RepositoryState.Disposed */;
            }
            if (!operation.readOnly) {
                await this.updateModelState();
            }
            throw err;
        }
        finally {
            this._operations.end(operation);
            this._onDidRunOperation.fire({ operation: operation, error });
        }
    }
    async migrateChanges(sourceRepositoryRoot, options) {
        const sourceRepository = this.repositoryResolver.getRepository(sourceRepositoryRoot);
        if (!sourceRepository) {
            vscode_1.window.showWarningMessage(vscode_1.l10n.t('The source repository could not be found.'));
            return;
        }
        if (sourceRepository.indexGroup.resourceStates.length === 0 &&
            sourceRepository.workingTreeGroup.resourceStates.length === 0 &&
            sourceRepository.untrackedGroup.resourceStates.length === 0) {
            await vscode_1.window.showInformationMessage(vscode_1.l10n.t('There are no changes in the selected worktree to migrate.'));
            return;
        }
        const sourceFilePaths = [
            ...sourceRepository.indexGroup.resourceStates,
            ...sourceRepository.workingTreeGroup.resourceStates,
            ...sourceRepository.untrackedGroup.resourceStates
        ].map(resource => path.relative(sourceRepository.root, resource.resourceUri.fsPath));
        const targetFilePaths = [
            ...this.workingTreeGroup.resourceStates,
            ...this.untrackedGroup.resourceStates
        ].map(resource => path.relative(this.root, resource.resourceUri.fsPath));
        // Detect overlapping unstaged files in worktree stash and target repository
        const conflicts = sourceFilePaths.filter(path => targetFilePaths.includes(path));
        if (conflicts.length > 0) {
            const maxFilesShown = 5;
            const filesToShow = conflicts.slice(0, maxFilesShown);
            const remainingCount = conflicts.length - maxFilesShown;
            const fileList = filesToShow.join('\n ') +
                (remainingCount > 0 ? vscode_1.l10n.t('\n and {0} more file{1}...', remainingCount, remainingCount > 1 ? 's' : '') : '');
            const message = vscode_1.l10n.t('Your local changes to the following files would be overwritten by merge:\n {0}\n\nPlease stage, commit, or stash your changes in the repository before migrating changes.', fileList);
            await vscode_1.window.showErrorMessage(message, { modal: true });
            return;
        }
        if (options?.confirmation) {
            // Non-interactive migration, do not show confirmation dialog
            const message = vscode_1.l10n.t('Proceed with migrating changes to the current repository?');
            const detail = vscode_1.l10n.t('This will apply the worktree\'s changes to this repository and discard changes in the worktree.\nThis is IRREVERSIBLE!');
            const proceed = vscode_1.l10n.t('Proceed');
            const pick = await vscode_1.window.showWarningMessage(message, { modal: true, detail }, proceed);
            if (pick !== proceed) {
                return;
            }
        }
        const stashName = `migration:${sourceRepository.HEAD?.name ?? sourceRepository.HEAD?.commit}-${this.HEAD?.name ?? this.HEAD?.commit}`;
        await sourceRepository.createStash(stashName, options?.untracked);
        const stashes = await sourceRepository.getStashes();
        try {
            if (options?.deleteFromSource) {
                await this.popStash(stashes[0].index);
            }
            else {
                await this.applyStash(stashes[0].index);
                await sourceRepository.popStash(stashes[0].index, { reinstateStagedChanges: true });
            }
        }
        catch (err) {
            if (err.gitErrorCode === git_constants_1.GitErrorCodes.StashConflict) {
                this.isWorktreeMigrating = true;
                const message = vscode_1.l10n.t('There are merge conflicts from migrating changes. Please resolve them before committing.');
                const show = vscode_1.l10n.t('Show Changes');
                const choice = await vscode_1.window.showWarningMessage(message, show);
                if (choice === show) {
                    await vscode_1.commands.executeCommand('workbench.view.scm');
                }
                await sourceRepository.popStash(stashes[0].index, { reinstateStagedChanges: true });
                return;
            }
            await sourceRepository.popStash(stashes[0].index, { reinstateStagedChanges: true });
            throw err;
        }
    }
    async retryRun(operation, runOperation) {
        let attempt = 0;
        while (true) {
            try {
                attempt++;
                return await runOperation();
            }
            catch (err) {
                const shouldRetry = attempt <= 10 && ((err.gitErrorCode === git_constants_1.GitErrorCodes.RepositoryIsLocked)
                    || (operation.retry && (err.gitErrorCode === git_constants_1.GitErrorCodes.CantLockRef || err.gitErrorCode === git_constants_1.GitErrorCodes.CantRebaseMultipleBranches)));
                if (shouldRetry) {
                    // quatratic backoff
                    await timeout(Math.pow(attempt, 2) * 50);
                }
                else {
                    throw err;
                }
            }
        }
    }
    static KnownHugeFolderNames = ['node_modules'];
    async findKnownHugeFolderPathsToIgnore() {
        const folderPaths = [];
        for (const folderName of Repository.KnownHugeFolderNames) {
            const folderPath = path.join(this.repository.root, folderName);
            if (await new Promise(c => fs.exists(folderPath, c))) {
                folderPaths.push(folderPath);
            }
        }
        const ignored = await this.checkIgnore(folderPaths);
        return folderPaths.filter(p => !ignored.has(p));
    }
    async updateModelState(optimisticResourcesGroups) {
        this.updateModelStateCancellationTokenSource?.cancel();
        this.updateModelStateCancellationTokenSource = new vscode_1.CancellationTokenSource();
        await this._updateModelState(optimisticResourcesGroups, this.updateModelStateCancellationTokenSource.token);
    }
    async _updateModelState(optimisticResourcesGroups, cancellationToken) {
        try {
            // Optimistically update resource groups
            if (optimisticResourcesGroups) {
                this._updateResourceGroupsState(optimisticResourcesGroups);
            }
            const [HEAD, remotes, submodules, worktrees, rebaseCommit, mergeInProgress, cherryPickInProgress, commitTemplate] = await Promise.all([
                this.repository.getHEADRef(),
                this.repository.getRemotes(),
                this.repository.getSubmodules(),
                this.repository.getWorktrees(),
                this.getRebaseCommit(),
                this.isMergeInProgress(),
                this.isCherryPickInProgress(),
                this.getInputTemplate()
            ]);
            // Reset the list of unpublished commits if HEAD has
            // changed (ex: checkout, fetch, pull, push, publish, etc.).
            // The list of unpublished commits will be computed lazily
            // on demand.
            if (this.HEAD?.name !== HEAD?.name ||
                this.HEAD?.commit !== HEAD?.commit ||
                this.HEAD?.ahead !== HEAD?.ahead ||
                this.HEAD?.upstream !== HEAD?.upstream) {
                this.unpublishedCommits = undefined;
            }
            this._HEAD = HEAD;
            this._remotes = remotes;
            this._submodules = submodules;
            this._worktrees = worktrees;
            this.rebaseCommit = rebaseCommit;
            this.mergeInProgress = mergeInProgress;
            this.cherryPickInProgress = cherryPickInProgress;
            this._sourceControl.commitTemplate = commitTemplate;
            // Execute cancellable long-running operation
            const [resourceGroups, refs] = await Promise.all([
                this.getStatus(cancellationToken),
                this.getRefs({}, cancellationToken)
            ]);
            this._refs = refs;
            this._updateResourceGroupsState(resourceGroups);
            this._onDidChangeStatus.fire();
        }
        catch (err) {
            if (err instanceof vscode_1.CancellationError) {
                return;
            }
            throw err;
        }
    }
    _updateResourceGroupsState(resourcesGroups) {
        // set resource groups
        if (resourcesGroups.indexGroup) {
            this.indexGroup.resourceStates = resourcesGroups.indexGroup;
        }
        if (resourcesGroups.mergeGroup) {
            this.mergeGroup.resourceStates = resourcesGroups.mergeGroup;
        }
        if (resourcesGroups.untrackedGroup) {
            this.untrackedGroup.resourceStates = resourcesGroups.untrackedGroup;
        }
        if (resourcesGroups.workingTreeGroup) {
            this.workingTreeGroup.resourceStates = resourcesGroups.workingTreeGroup;
        }
        // clear worktree migrating flag once all conflicts are resolved
        if (this._isWorktreeMigrating && resourcesGroups.mergeGroup && resourcesGroups.mergeGroup.length === 0) {
            this._isWorktreeMigrating = false;
        }
        // set count badge
        this.setCountBadge();
    }
    async getStatus(cancellationToken) {
        if (cancellationToken && cancellationToken.isCancellationRequested) {
            throw new vscode_1.CancellationError();
        }
        const scopedConfig = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        const untrackedChanges = scopedConfig.get('untrackedChanges');
        const ignoreSubmodules = scopedConfig.get('ignoreSubmodules');
        const limit = scopedConfig.get('statusLimit', 10000);
        const similarityThreshold = scopedConfig.get('similarityThreshold', 50);
        const start = new Date().getTime();
        const { status, statusLength, didHitLimit } = await this.repository.getStatus({ limit, ignoreSubmodules, similarityThreshold, untrackedChanges, cancellationToken });
        const totalTime = new Date().getTime() - start;
        this.isRepositoryHuge = didHitLimit ? { limit } : false;
        if (didHitLimit) {
            /* __GDPR__
                "statusLimit" : {
                    "owner": "lszomoru",
                    "ignoreSubmodules": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Setting indicating whether submodules are ignored" },
                    "limit": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Setting indicating the limit of status entries" },
                    "statusLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of status entries" },
                    "totalTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of ms the operation took" }
                }
            */
            this.telemetryReporter.sendTelemetryEvent('statusLimit', { ignoreSubmodules: String(ignoreSubmodules) }, { limit, statusLength, totalTime });
        }
        if (totalTime > 5000) {
            /* __GDPR__
                "statusSlow" : {
                    "owner": "digitarald",
                    "comment": "Reports when git status is slower than 5s",
                    "expiration": "1.73",
                    "ignoreSubmodules": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Setting indicating whether submodules are ignored" },
                    "didHitLimit": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Total number of status entries" },
                    "didWarnAboutLimit": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "True when the user was warned about slow git status" },
                    "statusLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of status entries" },
                    "totalTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of ms the operation took" }
                }
            */
            this.telemetryReporter.sendTelemetryEvent('statusSlow', { ignoreSubmodules: String(ignoreSubmodules), didHitLimit: String(didHitLimit), didWarnAboutLimit: String(this.didWarnAboutLimit) }, { statusLength, totalTime });
        }
        // Triggers or clears any validation warning
        this._sourceControl.inputBox.validateInput = this._sourceControl.inputBox.validateInput;
        const config = vscode_1.workspace.getConfiguration('git');
        const shouldIgnore = config.get('ignoreLimitWarning') === true;
        const useIcons = !config.get('decorations.enabled', true);
        if (didHitLimit && !shouldIgnore && !this.didWarnAboutLimit) {
            const knownHugeFolderPaths = await this.findKnownHugeFolderPathsToIgnore();
            const gitWarn = vscode_1.l10n.t('The git repository at "{0}" has too many active changes, only a subset of Git features will be enabled.', this.repository.root);
            const neverAgain = { title: vscode_1.l10n.t('Don\'t Show Again') };
            if (knownHugeFolderPaths.length > 0) {
                const folderPath = knownHugeFolderPaths[0];
                const folderName = path.basename(folderPath);
                const addKnown = vscode_1.l10n.t('Would you like to add "{0}" to .gitignore?', folderName);
                const yes = { title: vscode_1.l10n.t('Yes') };
                const no = { title: vscode_1.l10n.t('No') };
                vscode_1.window.showWarningMessage(`${gitWarn} ${addKnown}`, yes, no, neverAgain).then(result => {
                    if (result === yes) {
                        this.ignore([vscode_1.Uri.file(folderPath)]);
                    }
                    else {
                        if (result === neverAgain) {
                            config.update('ignoreLimitWarning', true, false);
                        }
                        this.didWarnAboutLimit = true;
                    }
                });
            }
            else {
                const ok = { title: vscode_1.l10n.t('OK') };
                vscode_1.window.showWarningMessage(gitWarn, ok, neverAgain).then(result => {
                    if (result === neverAgain) {
                        config.update('ignoreLimitWarning', true, false);
                    }
                    this.didWarnAboutLimit = true;
                });
            }
        }
        const indexGroup = [], mergeGroup = [], untrackedGroup = [], workingTreeGroup = [];
        status.forEach(raw => {
            const uri = vscode_1.Uri.file(path.join(this.repository.root, raw.path));
            const renameUri = raw.rename
                ? vscode_1.Uri.file(path.join(this.repository.root, raw.rename))
                : undefined;
            switch (raw.x + raw.y) {
                case '??': switch (untrackedChanges) {
                    case 'mixed': return workingTreeGroup.push(new Resource(this.resourceCommandResolver, 2 /* ResourceGroupType.WorkingTree */, uri, git_constants_1.Status.UNTRACKED, useIcons, undefined, this.kind));
                    case 'separate': return untrackedGroup.push(new Resource(this.resourceCommandResolver, 3 /* ResourceGroupType.Untracked */, uri, git_constants_1.Status.UNTRACKED, useIcons));
                    default: return undefined;
                }
                case '!!': switch (untrackedChanges) {
                    case 'mixed': return workingTreeGroup.push(new Resource(this.resourceCommandResolver, 2 /* ResourceGroupType.WorkingTree */, uri, git_constants_1.Status.IGNORED, useIcons, undefined, this.kind));
                    case 'separate': return untrackedGroup.push(new Resource(this.resourceCommandResolver, 3 /* ResourceGroupType.Untracked */, uri, git_constants_1.Status.IGNORED, useIcons));
                    default: return undefined;
                }
                case 'DD': return mergeGroup.push(new Resource(this.resourceCommandResolver, 0 /* ResourceGroupType.Merge */, uri, git_constants_1.Status.BOTH_DELETED, useIcons));
                case 'AU': return mergeGroup.push(new Resource(this.resourceCommandResolver, 0 /* ResourceGroupType.Merge */, uri, git_constants_1.Status.ADDED_BY_US, useIcons));
                case 'UD': return mergeGroup.push(new Resource(this.resourceCommandResolver, 0 /* ResourceGroupType.Merge */, uri, git_constants_1.Status.DELETED_BY_THEM, useIcons));
                case 'UA': return mergeGroup.push(new Resource(this.resourceCommandResolver, 0 /* ResourceGroupType.Merge */, uri, git_constants_1.Status.ADDED_BY_THEM, useIcons));
                case 'DU': return mergeGroup.push(new Resource(this.resourceCommandResolver, 0 /* ResourceGroupType.Merge */, uri, git_constants_1.Status.DELETED_BY_US, useIcons));
                case 'AA': return mergeGroup.push(new Resource(this.resourceCommandResolver, 0 /* ResourceGroupType.Merge */, uri, git_constants_1.Status.BOTH_ADDED, useIcons));
                case 'UU': return mergeGroup.push(new Resource(this.resourceCommandResolver, 0 /* ResourceGroupType.Merge */, uri, git_constants_1.Status.BOTH_MODIFIED, useIcons));
            }
            switch (raw.x) {
                case 'M':
                    indexGroup.push(new Resource(this.resourceCommandResolver, 1 /* ResourceGroupType.Index */, uri, git_constants_1.Status.INDEX_MODIFIED, useIcons, undefined, this.kind));
                    break;
                case 'A':
                    indexGroup.push(new Resource(this.resourceCommandResolver, 1 /* ResourceGroupType.Index */, uri, git_constants_1.Status.INDEX_ADDED, useIcons, undefined, this.kind));
                    break;
                case 'D':
                    indexGroup.push(new Resource(this.resourceCommandResolver, 1 /* ResourceGroupType.Index */, uri, git_constants_1.Status.INDEX_DELETED, useIcons, undefined, this.kind));
                    break;
                case 'R':
                    indexGroup.push(new Resource(this.resourceCommandResolver, 1 /* ResourceGroupType.Index */, uri, git_constants_1.Status.INDEX_RENAMED, useIcons, renameUri, this.kind));
                    break;
                case 'C':
                    indexGroup.push(new Resource(this.resourceCommandResolver, 1 /* ResourceGroupType.Index */, uri, git_constants_1.Status.INDEX_COPIED, useIcons, renameUri, this.kind));
                    break;
            }
            switch (raw.y) {
                case 'M':
                    workingTreeGroup.push(new Resource(this.resourceCommandResolver, 2 /* ResourceGroupType.WorkingTree */, uri, git_constants_1.Status.MODIFIED, useIcons, renameUri, this.kind));
                    break;
                case 'D':
                    workingTreeGroup.push(new Resource(this.resourceCommandResolver, 2 /* ResourceGroupType.WorkingTree */, uri, git_constants_1.Status.DELETED, useIcons, renameUri, this.kind));
                    break;
                case 'A':
                    workingTreeGroup.push(new Resource(this.resourceCommandResolver, 2 /* ResourceGroupType.WorkingTree */, uri, git_constants_1.Status.INTENT_TO_ADD, useIcons, renameUri, this.kind));
                    break;
                case 'R':
                    workingTreeGroup.push(new Resource(this.resourceCommandResolver, 2 /* ResourceGroupType.WorkingTree */, uri, git_constants_1.Status.INTENT_TO_RENAME, useIcons, renameUri, this.kind));
                    break;
                case 'T':
                    workingTreeGroup.push(new Resource(this.resourceCommandResolver, 2 /* ResourceGroupType.WorkingTree */, uri, git_constants_1.Status.TYPE_CHANGED, useIcons, renameUri, this.kind));
                    break;
            }
            return undefined;
        });
        return { indexGroup, mergeGroup, untrackedGroup, workingTreeGroup };
    }
    setCountBadge() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        const countBadge = config.get('countBadge');
        const untrackedChanges = config.get('untrackedChanges');
        let count = this.mergeGroup.resourceStates.length +
            this.indexGroup.resourceStates.length +
            this.workingTreeGroup.resourceStates.length;
        switch (countBadge) {
            case 'off':
                count = 0;
                break;
            case 'tracked':
                if (untrackedChanges === 'mixed') {
                    count -= this.workingTreeGroup.resourceStates.filter(r => r.type === git_constants_1.Status.UNTRACKED || r.type === git_constants_1.Status.IGNORED).length;
                }
                break;
            case 'all':
                if (untrackedChanges === 'separate') {
                    count += this.untrackedGroup.resourceStates.length;
                }
                break;
        }
        this._sourceControl.count = count;
    }
    async getRebaseCommit() {
        const rebaseHeadPath = path.join(this.repository.root, '.git', 'REBASE_HEAD');
        const rebaseApplyPath = path.join(this.repository.root, '.git', 'rebase-apply');
        const rebaseMergePath = path.join(this.repository.root, '.git', 'rebase-merge');
        try {
            const [rebaseApplyExists, rebaseMergePathExists, rebaseHead] = await Promise.all([
                new Promise(c => fs.exists(rebaseApplyPath, c)),
                new Promise(c => fs.exists(rebaseMergePath, c)),
                new Promise((c, e) => fs.readFile(rebaseHeadPath, 'utf8', (err, result) => err ? e(err) : c(result)))
            ]);
            if (!rebaseApplyExists && !rebaseMergePathExists) {
                return undefined;
            }
            return await this.getCommit(rebaseHead.trim());
        }
        catch (err) {
            return undefined;
        }
    }
    isMergeInProgress() {
        const mergeHeadPath = path.join(this.repository.root, '.git', 'MERGE_HEAD');
        return new Promise(resolve => fs.exists(mergeHeadPath, resolve));
    }
    isCherryPickInProgress() {
        const cherryPickHeadPath = path.join(this.repository.root, '.git', 'CHERRY_PICK_HEAD');
        return new Promise(resolve => fs.exists(cherryPickHeadPath, resolve));
    }
    async maybeAutoStash(runOperation) {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
        const shouldAutoStash = config.get('autoStash')
            && this.repository.git.compareGitVersionTo('2.27.0') < 0
            && (this.indexGroup.resourceStates.length > 0
                || this.workingTreeGroup.resourceStates.some(r => r.type !== git_constants_1.Status.UNTRACKED && r.type !== git_constants_1.Status.IGNORED));
        if (!shouldAutoStash) {
            return await runOperation();
        }
        await this.repository.createStash(undefined, true);
        try {
            const result = await runOperation();
            return result;
        }
        finally {
            await this.repository.popStash(undefined, { reinstateStagedChanges: true });
        }
    }
    onFileChange(_uri) {
        const config = vscode_1.workspace.getConfiguration('git');
        const autorefresh = config.get('autorefresh');
        if (!autorefresh) {
            this.logger.trace('[Repository][onFileChange] Skip running git status because autorefresh setting is disabled.');
            return;
        }
        if (this.isRepositoryHuge) {
            this.logger.trace('[Repository][onFileChange] Skip running git status because repository is huge.');
            return;
        }
        if (!this.operations.isIdle()) {
            this.logger.trace('[Repository][onFileChange] Skip running git status because an operation is running.');
            return;
        }
        this.eventuallyUpdateWhenIdleAndWait();
    }
    eventuallyUpdateWhenIdleAndWait() {
        this.updateWhenIdleAndWait();
    }
    async updateWhenIdleAndWait() {
        await this.whenIdleAndFocused();
        await this.status();
        await timeout(5000);
    }
    async whenIdleAndFocused() {
        while (true) {
            if (!this.operations.isIdle()) {
                await (0, util_1.eventToPromise)(this.onDidRunOperation);
                continue;
            }
            if (!vscode_1.window.state.focused) {
                const onDidFocusWindow = (0, util_1.filterEvent)(vscode_1.window.onDidChangeWindowState, e => e.focused);
                await (0, util_1.eventToPromise)(onDidFocusWindow);
                continue;
            }
            return;
        }
    }
    get headLabel() {
        const HEAD = this.HEAD;
        if (!HEAD) {
            return '';
        }
        const head = HEAD.name || (HEAD.commit || '').substr(0, 8);
        return head
            + (this.workingTreeGroup.resourceStates.length + this.untrackedGroup.resourceStates.length > 0 ? '*' : '')
            + (this.indexGroup.resourceStates.length > 0 ? '+' : '')
            + (this.mergeInProgress || !!this.rebaseCommit ? '!' : '');
    }
    get syncLabel() {
        if (!this.HEAD
            || !this.HEAD.name
            || !this.HEAD.commit
            || !this.HEAD.upstream
            || !(this.HEAD.ahead || this.HEAD.behind)) {
            return '';
        }
        const remoteName = this.HEAD && this.HEAD.remote || this.HEAD.upstream.remote;
        const remote = this.remotes.find(r => r.name === remoteName);
        if (remote && remote.isReadOnly) {
            return `${this.HEAD.behind}↓`;
        }
        return `${this.HEAD.behind}↓ ${this.HEAD.ahead}↑`;
    }
    get syncTooltip() {
        if (!this.HEAD
            || !this.HEAD.name
            || !this.HEAD.commit
            || !this.HEAD.upstream
            || !(this.HEAD.ahead || this.HEAD.behind)) {
            return vscode_1.l10n.t('Synchronize Changes');
        }
        const remoteName = this.HEAD && this.HEAD.remote || this.HEAD.upstream.remote;
        const remote = this.remotes.find(r => r.name === remoteName);
        if ((remote && remote.isReadOnly) || !this.HEAD.ahead) {
            return vscode_1.l10n.t('Pull {0} commits from {1}/{2}', this.HEAD.behind, this.HEAD.upstream.remote, this.HEAD.upstream.name);
        }
        else if (!this.HEAD.behind) {
            return vscode_1.l10n.t('Push {0} commits to {1}/{2}', this.HEAD.ahead, this.HEAD.upstream.remote, this.HEAD.upstream.name);
        }
        else {
            return vscode_1.l10n.t('Pull {0} and push {1} commits between {2}/{3}', this.HEAD.behind, this.HEAD.ahead, this.HEAD.upstream.remote, this.HEAD.upstream.name);
        }
    }
    updateInputBoxPlaceholder() {
        const branchName = this.headShortName;
        if (branchName) {
            // '{0}' will be replaced by the corresponding key-command later in the process, which is why it needs to stay.
            this._sourceControl.inputBox.placeholder = vscode_1.l10n.t('Message ({0} to commit on "{1}")', '{0}', branchName);
        }
        else {
            this._sourceControl.inputBox.placeholder = vscode_1.l10n.t('Message ({0} to commit)');
        }
    }
    updateBranchProtectionMatchers(root) {
        this.branchProtection.clear();
        for (const provider of this.branchProtectionProviderRegistry.getBranchProtectionProviders(root)) {
            for (const { remote, rules } of provider.provideBranchProtection()) {
                const matchers = [];
                for (const rule of rules) {
                    const include = rule.include && rule.include.length !== 0 ? (0, picomatch_1.default)(rule.include) : undefined;
                    const exclude = rule.exclude && rule.exclude.length !== 0 ? (0, picomatch_1.default)(rule.exclude) : undefined;
                    if (include || exclude) {
                        matchers.push({ include, exclude });
                    }
                }
                if (matchers.length !== 0) {
                    this.branchProtection.set(remote, matchers);
                }
            }
        }
        this._onDidChangeBranchProtection.fire();
    }
    optimisticUpdateEnabled() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
        return config.get('optimisticUpdate') === true;
    }
    async handleTagConflict(remote, raw) {
        // Ensure there is a remote
        remote = remote ?? this.HEAD?.upstream?.remote;
        if (!remote) {
            throw new Error('Unable to resolve tag conflict due to missing remote.');
        }
        // Extract tag names from message
        const tags = [];
        for (const match of raw.matchAll(/^ ! \[rejected\]\s+([^\s]+)\s+->\s+([^\s]+)\s+\(would clobber existing tag\)$/gm)) {
            if (match.length === 3) {
                tags.push(match[1]);
            }
        }
        if (tags.length === 0) {
            throw new Error(`Unable to extract tag names from error message: ${raw}`);
        }
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        const replaceTagsWhenPull = config.get('replaceTagsWhenPull', false) === true;
        if (!replaceTagsWhenPull) {
            // Notification
            const replaceLocalTags = vscode_1.l10n.t('Replace Local Tag(s)');
            const replaceLocalTagsAlways = vscode_1.l10n.t('Always Replace Local Tag(s)');
            const message = vscode_1.l10n.t('Unable to pull from remote repository due to conflicting tag(s): {0}. Would you like to resolve the conflict by replacing the local tag(s)?', tags.join(', '));
            const choice = await vscode_1.window.showErrorMessage(message, { modal: true }, replaceLocalTags, replaceLocalTagsAlways);
            if (choice !== replaceLocalTags && choice !== replaceLocalTagsAlways) {
                return false;
            }
            if (choice === replaceLocalTagsAlways) {
                await config.update('replaceTagsWhenPull', true, true);
            }
        }
        // Force fetch tags
        await this.repository.fetchTags({ remote, tags, force: true });
        return true;
    }
    isBranchProtected(branch = this.HEAD) {
        if (branch?.name) {
            // Default branch protection (settings)
            const defaultBranchProtectionMatcher = this.branchProtection.get('');
            if (defaultBranchProtectionMatcher?.length === 1 &&
                defaultBranchProtectionMatcher[0].include &&
                defaultBranchProtectionMatcher[0].include(branch.name)) {
                return true;
            }
            if (branch.upstream?.remote) {
                // Branch protection (contributed)
                const remoteBranchProtectionMatcher = this.branchProtection.get(branch.upstream.remote);
                if (remoteBranchProtectionMatcher && remoteBranchProtectionMatcher?.length !== 0) {
                    return remoteBranchProtectionMatcher.some(matcher => {
                        const include = matcher.include ? matcher.include(branch.name) : true;
                        const exclude = matcher.exclude ? matcher.exclude(branch.name) : false;
                        return include && !exclude;
                    });
                }
            }
        }
        return false;
    }
    async getUnpublishedCommits() {
        if (this.unpublishedCommits) {
            return this.unpublishedCommits;
        }
        if (!this.HEAD?.name) {
            this.unpublishedCommits = new Set();
            return this.unpublishedCommits;
        }
        if (this.HEAD.upstream) {
            // Upstream
            if (this.HEAD.ahead === 0) {
                this.unpublishedCommits = new Set();
            }
            else {
                const ref1 = `${this.HEAD.upstream.remote}/${this.HEAD.upstream.name}`;
                const ref2 = this.HEAD.name;
                const revList = await this.repository.revList(ref1, ref2);
                this.unpublishedCommits = new Set(revList);
            }
        }
        else if (this.historyProvider.currentHistoryItemBaseRef) {
            // Base
            const ref1 = this.historyProvider.currentHistoryItemBaseRef.id;
            const ref2 = this.HEAD.name;
            const revList = await this.repository.revList(ref1, ref2);
            this.unpublishedCommits = new Set(revList);
        }
        else {
            this.unpublishedCommits = new Set();
        }
        return this.unpublishedCommits;
    }
    async generateRandomBranchName() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.root));
        const branchRandomNameEnabled = config.get('branchRandomName.enable', false);
        if (!branchRandomNameEnabled) {
            return undefined;
        }
        const branchPrefix = config.get('branchPrefix', '');
        const branchWhitespaceChar = config.get('branchWhitespaceChar', '-');
        const branchRandomNameDictionary = config.get('branchRandomName.dictionary', ['adjectives', 'animals']);
        const dictionaries = [];
        for (const dictionary of branchRandomNameDictionary) {
            if (dictionary.toLowerCase() === 'adjectives') {
                dictionaries.push(unique_names_generator_1.adjectives);
            }
            if (dictionary.toLowerCase() === 'animals') {
                dictionaries.push(unique_names_generator_1.animals);
            }
            if (dictionary.toLowerCase() === 'colors') {
                dictionaries.push(unique_names_generator_1.colors);
            }
            if (dictionary.toLowerCase() === 'numbers') {
                dictionaries.push(unique_names_generator_1.NumberDictionary.generate({ length: 3 }));
            }
        }
        if (dictionaries.length === 0) {
            return undefined;
        }
        // 5 attempts to generate a random branch name
        for (let index = 0; index < 5; index++) {
            const randomName = (0, unique_names_generator_1.uniqueNamesGenerator)({
                dictionaries,
                length: dictionaries.length,
                separator: branchWhitespaceChar
            });
            // Check for local ref conflict
            const refs = await this.getRefs({ pattern: `refs/heads/${branchPrefix}${randomName}` });
            if (refs.length === 0) {
                return `${branchPrefix}${randomName}`;
            }
        }
        return undefined;
    }
    dispose() {
        this.disposables = (0, util_1.dispose)(this.disposables);
    }
}
exports.Repository = Repository;
__decorate([
    decorators_1.memoize
], Repository.prototype, "onDidChangeOperations", null);
__decorate([
    decorators_1.throttle
], Repository.prototype, "status", null);
__decorate([
    decorators_1.throttle
], Repository.prototype, "refresh", null);
__decorate([
    decorators_1.throttle
], Repository.prototype, "fastForwardBranch", null);
__decorate([
    decorators_1.sequentialize
], Repository.prototype, "getBranchBase", null);
__decorate([
    decorators_1.throttle
], Repository.prototype, "fetchDefault", null);
__decorate([
    decorators_1.throttle
], Repository.prototype, "fetchPrune", null);
__decorate([
    decorators_1.throttle
], Repository.prototype, "fetchAll", null);
__decorate([
    decorators_1.throttle
], Repository.prototype, "pullWithRebase", null);
__decorate([
    decorators_1.throttle
], Repository.prototype, "pull", null);
__decorate([
    decorators_1.throttle
], Repository.prototype, "push", null);
__decorate([
    decorators_1.throttle
], Repository.prototype, "sync", null);
__decorate([
    (0, decorators_1.debounce)(1000)
], Repository.prototype, "eventuallyUpdateWhenIdleAndWait", null);
__decorate([
    decorators_1.throttle
], Repository.prototype, "updateWhenIdleAndWait", null);
function retargetTaskToWorktree(task, worktreePath) {
    const execution = retargetTaskExecution(task.execution, worktreePath);
    if (!execution) {
        return undefined;
    }
    const worktreeFolder = {
        uri: vscode_1.Uri.file(worktreePath),
        name: path.basename(worktreePath),
        index: vscode_1.workspace.workspaceFolders?.length ?? 0
    };
    const worktreeTask = new vscode_1.Task({ ...task.definition }, worktreeFolder, task.name, task.source, execution, task.problemMatchers);
    worktreeTask.detail = task.detail;
    worktreeTask.group = task.group;
    worktreeTask.isBackground = task.isBackground;
    worktreeTask.presentationOptions = { ...task.presentationOptions, reveal: vscode_1.TaskRevealKind.Never, panel: vscode_1.TaskPanelKind.New };
    worktreeTask.runOptions = { ...task.runOptions };
    return worktreeTask;
}
function retargetTaskExecution(execution, worktreePath) {
    if (!execution) {
        return undefined;
    }
    if (execution instanceof vscode_1.ProcessExecution) {
        return new vscode_1.ProcessExecution(execution.process, execution.args, {
            ...execution.options,
            cwd: worktreePath
        });
    }
    if (execution instanceof vscode_1.ShellExecution) {
        if (execution.commandLine !== undefined) {
            return new vscode_1.ShellExecution(execution.commandLine, {
                ...execution.options,
                cwd: worktreePath
            });
        }
        if (execution.command !== undefined) {
            return new vscode_1.ShellExecution(execution.command, execution.args ?? [], {
                ...execution.options,
                cwd: worktreePath
            });
        }
    }
    return execution;
}
//# sourceMappingURL=repository.js.map