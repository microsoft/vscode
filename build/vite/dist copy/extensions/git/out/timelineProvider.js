"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitTimelineProvider = exports.GitTimelineItem = void 0;
const vscode_1 = require("vscode");
const repository_1 = require("./repository");
const decorators_1 = require("./decorators");
const emoji_1 = require("./emoji");
const util_1 = require("./util");
const historyItemDetailsProvider_1 = require("./historyItemDetailsProvider");
const hover_1 = require("./hover");
class GitTimelineItem extends vscode_1.TimelineItem {
    static is(item) {
        return item instanceof GitTimelineItem;
    }
    ref;
    previousRef;
    message;
    constructor(ref, previousRef, message, timestamp, id, contextValue) {
        const index = message.indexOf('\n');
        const label = index !== -1 ? `${(0, util_1.truncate)(message, index, false)}` : message;
        super(label, timestamp);
        this.ref = ref;
        this.previousRef = previousRef;
        this.message = message;
        this.id = id;
        this.contextValue = contextValue;
    }
    get shortRef() {
        return this.shortenRef(this.ref);
    }
    get shortPreviousRef() {
        return this.shortenRef(this.previousRef);
    }
    shortenRef(ref) {
        if (ref === '' || ref === '~' || ref === 'HEAD') {
            return ref;
        }
        return ref.endsWith('^') ? `${ref.substr(0, 8)}^` : ref.substr(0, 8);
    }
}
exports.GitTimelineItem = GitTimelineItem;
class GitTimelineProvider {
    model;
    commands;
    _onDidChange = new vscode_1.EventEmitter();
    get onDidChange() {
        return this._onDidChange.event;
    }
    id = 'git-history';
    label = vscode_1.l10n.t('Git History');
    disposable;
    providerDisposable;
    repo;
    repoDisposable;
    repoOperationDate;
    constructor(model, commands) {
        this.model = model;
        this.commands = commands;
        this.disposable = vscode_1.Disposable.from(model.onDidOpenRepository(this.onRepositoriesChanged, this), vscode_1.workspace.onDidChangeConfiguration(this.onConfigurationChanged, this));
        if (model.repositories.length) {
            this.ensureProviderRegistration();
        }
    }
    dispose() {
        this.providerDisposable?.dispose();
        this.disposable.dispose();
    }
    async provideTimeline(uri, options, token) {
        // console.log(`GitTimelineProvider.provideTimeline: uri=${uri}`);
        const repo = this.model.getRepository(uri);
        if (!repo) {
            this.repoDisposable?.dispose();
            this.repoOperationDate = undefined;
            this.repo = undefined;
            return { items: [] };
        }
        if (this.repo?.root !== repo.root) {
            this.repoDisposable?.dispose();
            this.repo = repo;
            this.repoOperationDate = new Date();
            this.repoDisposable = vscode_1.Disposable.from(repo.onDidChangeRepository(uri => this.onRepositoryChanged(repo, uri)), repo.onDidRunGitStatus(() => this.onRepositoryStatusChanged(repo)), repo.onDidRunOperation(result => this.onRepositoryOperationRun(repo, result)));
        }
        // TODO@eamodio: Ensure that the uri is a file -- if not we could get the history of the repo?
        let limit;
        if (options.limit !== undefined && typeof options.limit !== 'number') {
            try {
                const result = await this.model.git.exec(repo.root, ['rev-list', '--count', `${options.limit.id}..`, '--', uri.fsPath]);
                if (!result.exitCode) {
                    // Ask for 2 more (1 for the limit commit and 1 for the next commit) than so we can determine if there are more commits
                    limit = Number(result.stdout) + 2;
                }
            }
            catch {
                limit = undefined;
            }
        }
        else {
            // If we are not getting everything, ask for 1 more than so we can determine if there are more commits
            limit = options.limit === undefined ? undefined : options.limit + 1;
        }
        await (0, emoji_1.ensureEmojis)();
        const commits = await repo.logFile(uri, {
            maxEntries: limit,
            hash: options.cursor,
            follow: true,
            shortStats: true,
            // sortByAuthorDate: true
        }, token);
        const paging = commits.length ? {
            cursor: limit === undefined ? undefined : (commits.length >= limit ? commits[commits.length - 1]?.hash : undefined)
        } : undefined;
        // If we asked for an extra commit, strip it off
        if (limit !== undefined && commits.length >= limit) {
            commits.splice(commits.length - 1, 1);
        }
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(repo.root));
        const dateType = config.get('timeline.date');
        const showAuthor = config.get('timeline.showAuthor');
        const showUncommitted = config.get('timeline.showUncommitted');
        const openComparison = vscode_1.l10n.t('Open Comparison');
        const emptyTree = await repo.getEmptyTree();
        const unpublishedCommits = await repo.getUnpublishedCommits();
        const remoteHoverCommands = await (0, historyItemDetailsProvider_1.provideSourceControlHistoryItemHoverCommands)(this.model, repo);
        const avatarQuery = {
            commits: commits.map(c => ({
                hash: c.hash,
                authorName: c.authorName,
                authorEmail: c.authorEmail
            })),
            size: 20
        };
        const avatars = await (0, historyItemDetailsProvider_1.provideSourceControlHistoryItemAvatar)(this.model, repo, avatarQuery);
        const items = [];
        for (let index = 0; index < commits.length; index++) {
            const c = commits[index];
            const date = dateType === 'authored' ? c.authorDate : c.commitDate;
            const message = (0, emoji_1.emojify)(c.message);
            const previousRef = commits[index + 1]?.hash ?? emptyTree;
            const item = new GitTimelineItem(c.hash, previousRef, message, date?.getTime() ?? 0, c.hash, 'git:file:commit');
            item.iconPath = new vscode_1.ThemeIcon('git-commit');
            if (showAuthor) {
                item.description = c.authorName;
            }
            const commitRemoteSourceCommands = !unpublishedCommits.has(c.hash) ? remoteHoverCommands ?? [] : [];
            const messageWithLinks = await (0, historyItemDetailsProvider_1.provideSourceControlHistoryItemMessageLinks)(this.model, repo, message) ?? message;
            const commands = [
                (0, hover_1.getHoverCommitHashCommands)(uri, c.hash),
                (0, hover_1.processHoverRemoteCommands)(commitRemoteSourceCommands, c.hash)
            ];
            item.tooltip = (0, hover_1.getCommitHover)(avatars?.get(c.hash), c.authorName, c.authorEmail, date, messageWithLinks, c.shortStat, commands);
            const cmd = this.commands.resolveTimelineOpenDiffCommand(item, uri);
            if (cmd) {
                item.command = {
                    title: openComparison,
                    command: cmd.command,
                    arguments: cmd.arguments,
                };
            }
            items.push(item);
        }
        if (options.cursor === undefined) {
            const you = vscode_1.l10n.t('You');
            const index = repo.indexGroup.resourceStates.find(r => r.resourceUri.fsPath === uri.fsPath);
            if (index) {
                const date = this.repoOperationDate ?? new Date();
                const item = new GitTimelineItem('~', 'HEAD', vscode_1.l10n.t('Staged Changes'), date.getTime(), 'index', 'git:file:index');
                // TODO@eamodio: Replace with a better icon -- reflecting its status maybe?
                item.iconPath = new vscode_1.ThemeIcon('git-commit');
                item.description = '';
                item.tooltip = (0, hover_1.getCommitHover)(undefined, you, undefined, date, repository_1.Resource.getStatusText(index.type), undefined, undefined);
                const cmd = this.commands.resolveTimelineOpenDiffCommand(item, uri);
                if (cmd) {
                    item.command = {
                        title: openComparison,
                        command: cmd.command,
                        arguments: cmd.arguments,
                    };
                }
                items.splice(0, 0, item);
            }
            if (showUncommitted) {
                const working = repo.workingTreeGroup.resourceStates.find(r => r.resourceUri.fsPath === uri.fsPath);
                if (working) {
                    const date = new Date();
                    const item = new GitTimelineItem('', index ? '~' : 'HEAD', vscode_1.l10n.t('Uncommitted Changes'), date.getTime(), 'working', 'git:file:working');
                    item.iconPath = new vscode_1.ThemeIcon('circle-outline');
                    item.description = '';
                    item.tooltip = (0, hover_1.getCommitHover)(undefined, you, undefined, date, repository_1.Resource.getStatusText(working.type), undefined, undefined);
                    const cmd = this.commands.resolveTimelineOpenDiffCommand(item, uri);
                    if (cmd) {
                        item.command = {
                            title: openComparison,
                            command: cmd.command,
                            arguments: cmd.arguments,
                        };
                    }
                    items.splice(0, 0, item);
                }
            }
        }
        return {
            items: items,
            paging: paging
        };
    }
    ensureProviderRegistration() {
        if (this.providerDisposable === undefined) {
            this.providerDisposable = vscode_1.workspace.registerTimelineProvider(['file', 'git', 'vscode-remote', 'vscode-local-history'], this);
        }
    }
    onConfigurationChanged(e) {
        if (e.affectsConfiguration('git.timeline.date') || e.affectsConfiguration('git.timeline.showAuthor') || e.affectsConfiguration('git.timeline.showUncommitted')) {
            this.fireChanged();
        }
    }
    onRepositoriesChanged(_repo) {
        // console.log(`GitTimelineProvider.onRepositoriesChanged`);
        this.ensureProviderRegistration();
        // TODO@eamodio: Being naive for now and just always refreshing each time there is a new repository
        this.fireChanged();
    }
    onRepositoryChanged(_repo, _uri) {
        // console.log(`GitTimelineProvider.onRepositoryChanged: uri=${uri.toString(true)}`);
        this.fireChanged();
    }
    onRepositoryStatusChanged(_repo) {
        // console.log(`GitTimelineProvider.onRepositoryStatusChanged`);
        const config = vscode_1.workspace.getConfiguration('git.timeline');
        const showUncommitted = config.get('showUncommitted') === true;
        if (showUncommitted) {
            this.fireChanged();
        }
    }
    onRepositoryOperationRun(_repo, _result) {
        // console.log(`GitTimelineProvider.onRepositoryOperationRun`);
        // Successful operations that are not read-only and not status operations
        if (!_result.error && !_result.operation.readOnly && _result.operation.kind !== "Status" /* OperationKind.Status */) {
            // This is less than ideal, but for now just save the last time an
            // operation was run and use that as the timestamp for staged items
            this.repoOperationDate = new Date();
            this.fireChanged();
        }
    }
    fireChanged() {
        this._onDidChange.fire(undefined);
    }
}
exports.GitTimelineProvider = GitTimelineProvider;
__decorate([
    (0, decorators_1.debounce)(500)
], GitTimelineProvider.prototype, "fireChanged", null);
//# sourceMappingURL=timelineProvider.js.map