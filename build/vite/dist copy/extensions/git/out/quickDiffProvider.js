"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.StagedResourceQuickDiffProvider = exports.GitQuickDiffProvider = void 0;
const vscode_1 = require("vscode");
const util_1 = require("./util");
const uri_1 = require("./uri");
const git_constants_1 = require("./api/git.constants");
class GitQuickDiffProvider {
    repository;
    repositoryResolver;
    logger;
    label = vscode_1.l10n.t('Git Local Changes (Working Tree)');
    constructor(repository, repositoryResolver, logger) {
        this.repository = repository;
        this.repositoryResolver = repositoryResolver;
        this.logger = logger;
    }
    async provideOriginalResource(uri) {
        this.logger.trace(`[Repository][provideOriginalResource] Resource: ${uri.toString()}`);
        if (uri.scheme !== 'file') {
            this.logger.trace(`[Repository][provideOriginalResource] Resource is not a file: ${uri.scheme}`);
            return undefined;
        }
        // Ignore path that is inside the .git directory (ex: COMMIT_EDITMSG)
        if ((0, util_1.isDescendant)(this.repository.dotGit.commonPath ?? this.repository.dotGit.path, uri.fsPath)) {
            this.logger.trace(`[Repository][provideOriginalResource] Resource is inside .git directory: ${uri.toString()}`);
            return undefined;
        }
        // Ignore symbolic links
        const stat = await vscode_1.workspace.fs.stat(uri);
        if ((stat.type & vscode_1.FileType.SymbolicLink) !== 0) {
            this.logger.trace(`[Repository][provideOriginalResource] Resource is a symbolic link: ${uri.toString()}`);
            return undefined;
        }
        // Ignore path that is not inside the current repository
        if (this.repositoryResolver.getRepository(uri) !== this.repository) {
            this.logger.trace(`[Repository][provideOriginalResource] Resource is not part of the repository: ${uri.toString()}`);
            return undefined;
        }
        // Ignore path that is inside a hidden repository
        if (this.repository.isHidden === true) {
            this.logger.trace(`[Repository][provideOriginalResource] Repository is hidden: ${uri.toString()}`);
            return undefined;
        }
        // Ignore path that is inside a merge group
        if (this.repository.mergeGroup.resourceStates.some(r => (0, util_1.pathEquals)(r.resourceUri.fsPath, uri.fsPath))) {
            this.logger.trace(`[Repository][provideOriginalResource] Resource is part of a merge group: ${uri.toString()}`);
            return undefined;
        }
        // Ignore path that is untracked
        if (this.repository.untrackedGroup.resourceStates.some(r => (0, util_1.pathEquals)(r.resourceUri.path, uri.path)) ||
            this.repository.workingTreeGroup.resourceStates.some(r => (0, util_1.pathEquals)(r.resourceUri.path, uri.path) && r.type === git_constants_1.Status.UNTRACKED)) {
            this.logger.trace(`[Repository][provideOriginalResource] Resource is untracked: ${uri.toString()}`);
            return undefined;
        }
        // Ignore path that is git ignored
        const ignored = await this.repository.checkIgnore([uri.fsPath]);
        if (ignored.size > 0) {
            this.logger.trace(`[Repository][provideOriginalResource] Resource is git ignored: ${uri.toString()}`);
            return undefined;
        }
        const originalResource = (0, uri_1.toGitUri)(uri, '', { replaceFileExtension: true });
        this.logger.trace(`[Repository][provideOriginalResource] Original resource: ${originalResource.toString()}`);
        return originalResource;
    }
}
exports.GitQuickDiffProvider = GitQuickDiffProvider;
class StagedResourceQuickDiffProvider {
    _repository;
    logger;
    label = vscode_1.l10n.t('Git Local Changes (Index)');
    constructor(_repository, logger) {
        this._repository = _repository;
        this.logger = logger;
    }
    async provideOriginalResource(uri) {
        this.logger.trace(`[StagedResourceQuickDiffProvider][provideOriginalResource] Resource: ${uri.toString()}`);
        if (uri.scheme !== 'file') {
            this.logger.trace(`[StagedResourceQuickDiffProvider][provideOriginalResource] Resource is not a file: ${uri.scheme}`);
            return undefined;
        }
        // Ignore path that is inside a hidden repository
        if (this._repository.isHidden === true) {
            this.logger.trace(`[StagedResourceQuickDiffProvider][provideOriginalResource] Repository is hidden: ${uri.toString()}`);
            return undefined;
        }
        // Ignore symbolic links
        const stat = await vscode_1.workspace.fs.stat(uri);
        if ((stat.type & vscode_1.FileType.SymbolicLink) !== 0) {
            this.logger.trace(`[StagedResourceQuickDiffProvider][provideOriginalResource] Resource is a symbolic link: ${uri.toString()}`);
            return undefined;
        }
        // Ignore resources that are not in the index group
        if (!this._repository.indexGroup.resourceStates.some(r => (0, util_1.pathEquals)(r.resourceUri.fsPath, uri.fsPath))) {
            this.logger.trace(`[StagedResourceQuickDiffProvider][provideOriginalResource] Resource is not part of a index group: ${uri.toString()}`);
            return undefined;
        }
        const originalResource = (0, uri_1.toGitUri)(uri, 'HEAD', { replaceFileExtension: true });
        this.logger.trace(`[StagedResourceQuickDiffProvider][provideOriginalResource] Original resource: ${originalResource.toString()}`);
        return originalResource;
    }
}
exports.StagedResourceQuickDiffProvider = StagedResourceQuickDiffProvider;
//# sourceMappingURL=quickDiffProvider.js.map