"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitArtifactProvider = void 0;
const vscode_1 = require("vscode");
const util_1 = require("./util");
const git_constants_1 = require("./api/git.constants");
/**
 * Sorts refs like a directory tree: refs with more path segments (directories) appear first
 * and are sorted alphabetically, while refs at the same level (files) maintain insertion order.
 * Refs without '/' maintain their insertion order and appear after refs with '/'.
 */
function sortRefByName(refA, refB) {
    const nameA = refA.name ?? '';
    const nameB = refB.name ?? '';
    const lastSlashA = nameA.lastIndexOf('/');
    const lastSlashB = nameB.lastIndexOf('/');
    // Neither ref has a slash, maintain insertion order
    if (lastSlashA === -1 && lastSlashB === -1) {
        return 0;
    }
    // Ref with a slash comes first
    if (lastSlashA !== -1 && lastSlashB === -1) {
        return -1;
    }
    else if (lastSlashA === -1 && lastSlashB !== -1) {
        return 1;
    }
    // Both have slashes
    // Get directory segments
    const segmentsA = nameA.substring(0, lastSlashA).split('/');
    const segmentsB = nameB.substring(0, lastSlashB).split('/');
    // Compare directory segments
    for (let index = 0; index < Math.min(segmentsA.length, segmentsB.length); index++) {
        const result = segmentsA[index].localeCompare(segmentsB[index]);
        if (result !== 0) {
            return result;
        }
    }
    // Directory with more segments comes first
    if (segmentsA.length !== segmentsB.length) {
        return segmentsB.length - segmentsA.length;
    }
    // Insertion order
    return 0;
}
function sortByWorktreeTypeAndNameAsc(a, b) {
    if (a.main && !b.main) {
        return -1;
    }
    else if (!a.main && b.main) {
        return 1;
    }
    else {
        return a.name.localeCompare(b.name);
    }
}
class GitArtifactProvider {
    repository;
    logger;
    _onDidChangeArtifacts = new vscode_1.EventEmitter();
    onDidChangeArtifacts = this._onDidChangeArtifacts.event;
    _groups;
    _disposables = [];
    constructor(repository, logger) {
        this.repository = repository;
        this.logger = logger;
        this._groups = [
            { id: 'branches', name: vscode_1.l10n.t('Branches'), icon: new vscode_1.ThemeIcon('git-branch'), supportsFolders: true },
            { id: 'stashes', name: vscode_1.l10n.t('Stashes'), icon: new vscode_1.ThemeIcon('git-stash'), supportsFolders: false },
            { id: 'tags', name: vscode_1.l10n.t('Tags'), icon: new vscode_1.ThemeIcon('tag'), supportsFolders: true },
            { id: 'worktrees', name: vscode_1.l10n.t('Worktrees'), icon: new vscode_1.ThemeIcon('worktree'), supportsFolders: false }
        ];
        this._disposables.push(this._onDidChangeArtifacts);
        this._disposables.push(repository.historyProvider.onDidChangeHistoryItemRefs(e => {
            const groups = new Set();
            for (const ref of e.added.concat(e.modified).concat(e.removed)) {
                if (ref.id.startsWith('refs/heads/')) {
                    groups.add('branches');
                }
                else if (ref.id.startsWith('refs/tags/')) {
                    groups.add('tags');
                }
            }
            this._onDidChangeArtifacts.fire(Array.from(groups));
        }));
        const onDidRunWriteOperation = (0, util_1.filterEvent)(repository.onDidRunOperation, e => !e.operation.readOnly);
        this._disposables.push(onDidRunWriteOperation(result => {
            if (result.operation.kind === "Stash" /* OperationKind.Stash */) {
                this._onDidChangeArtifacts.fire(['stashes']);
            }
            else if (result.operation.kind === "Worktree" /* OperationKind.Worktree */) {
                this._onDidChangeArtifacts.fire(['worktrees']);
            }
        }));
    }
    provideArtifactGroups() {
        return this._groups;
    }
    async provideArtifacts(group) {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        const shortCommitLength = config.get('commitShortHashLength', 7);
        try {
            if (group === 'branches') {
                const refs = await this.repository
                    .getRefs({ pattern: 'refs/heads', includeCommitDetails: true, sort: 'creatordate' });
                return refs.sort(sortRefByName).map(r => ({
                    id: `refs/heads/${r.name}`,
                    name: r.name ?? r.commit ?? '',
                    description: (0, util_1.coalesce)([
                        r.commit?.substring(0, shortCommitLength),
                        r.commitDetails?.message.split('\n')[0]
                    ]).join(' \u2022 '),
                    icon: this.repository.HEAD?.type === git_constants_1.RefType.Head && r.name === this.repository.HEAD?.name
                        ? new vscode_1.ThemeIcon('target')
                        : new vscode_1.ThemeIcon('git-branch'),
                    timestamp: r.commitDetails?.commitDate?.getTime()
                }));
            }
            else if (group === 'tags') {
                const refs = await this.repository
                    .getRefs({ pattern: 'refs/tags', includeCommitDetails: true, sort: 'creatordate' });
                return refs.sort(sortRefByName).map(r => ({
                    id: `refs/tags/${r.name}`,
                    name: r.name ?? r.commit ?? '',
                    description: (0, util_1.coalesce)([
                        r.commit?.substring(0, shortCommitLength),
                        r.commitDetails?.message.split('\n')[0]
                    ]).join(' \u2022 '),
                    icon: this.repository.HEAD?.type === git_constants_1.RefType.Tag && r.name === this.repository.HEAD?.name
                        ? new vscode_1.ThemeIcon('target')
                        : new vscode_1.ThemeIcon('tag'),
                    timestamp: r.commitDetails?.commitDate?.getTime()
                }));
            }
            else if (group === 'stashes') {
                const stashes = await this.repository.getStashes();
                return stashes.map(s => ({
                    id: `stash@{${s.index}}`,
                    name: s.description,
                    description: s.branchName,
                    icon: new vscode_1.ThemeIcon('git-stash'),
                    timestamp: s.commitDate?.getTime(),
                    command: {
                        title: vscode_1.l10n.t('View Stash'),
                        command: 'git.repositories.stashView'
                    }
                }));
            }
            else if (group === 'worktrees') {
                const worktrees = await this.repository.getWorktreeDetails();
                return worktrees.sort(sortByWorktreeTypeAndNameAsc).map(w => ({
                    id: w.path,
                    name: w.name,
                    description: (0, util_1.coalesce)([
                        w.detached ? vscode_1.l10n.t('detached') : w.ref.substring(11),
                        w.commitDetails?.hash.substring(0, shortCommitLength),
                        w.commitDetails?.message.split('\n')[0]
                    ]).join(' \u2022 '),
                    icon: w.main
                        ? new vscode_1.ThemeIcon('repo')
                        : (0, util_1.isCopilotWorktreeFolder)(w.path)
                            ? new vscode_1.ThemeIcon('chat-sparkle')
                            : new vscode_1.ThemeIcon('worktree')
                }));
            }
        }
        catch (err) {
            this.logger.error(`[GitArtifactProvider][provideArtifacts] Error while providing artifacts for group '${group}': `, err);
            return [];
        }
        return [];
    }
    dispose() {
        (0, util_1.dispose)(this._disposables);
    }
}
exports.GitArtifactProvider = GitArtifactProvider;
//# sourceMappingURL=artifactProvider.js.map