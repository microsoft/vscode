/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileType, l10n, LogOutputChannel, QuickDiffProvider, Uri, workspace } from 'vscode';
import { IRepositoryResolver, Repository } from './repository';
import { isDescendant, pathEquals } from './util';
import { toGitUri } from './uri';
import { Status } from './api/git';

export class GitQuickDiffProvider implements QuickDiffProvider {
	readonly label = l10n.t('Git Local Changes (Working Tree)');

	constructor(
		private readonly repository: Repository,
		private readonly repositoryResolver: IRepositoryResolver,
		private readonly logger: LogOutputChannel
	) { }

	async provideOriginalResource(uri: Uri): Promise<Uri | undefined> {
		this.logger.trace(`[Repository][provideOriginalResource] Resource: ${uri.toString()}`);

		if (uri.scheme !== 'file') {
			this.logger.trace(`[Repository][provideOriginalResource] Resource is not a file: ${uri.scheme}`);
			return undefined;
		}

		// Ignore path that is inside the .git directory (ex: COMMIT_EDITMSG)
		if (isDescendant(this.repository.dotGit.commonPath ?? this.repository.dotGit.path, uri.fsPath)) {
			this.logger.trace(`[Repository][provideOriginalResource] Resource is inside .git directory: ${uri.toString()}`);
			return undefined;
		}

		// Ignore symbolic links
		const stat = await workspace.fs.stat(uri);
		if ((stat.type & FileType.SymbolicLink) !== 0) {
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
		if (this.repository.mergeGroup.resourceStates.some(r => pathEquals(r.resourceUri.fsPath, uri.fsPath))) {
			this.logger.trace(`[Repository][provideOriginalResource] Resource is part of a merge group: ${uri.toString()}`);
			return undefined;
		}

		// Ignore path that is untracked
		if (this.repository.untrackedGroup.resourceStates.some(r => pathEquals(r.resourceUri.path, uri.path)) ||
			this.repository.workingTreeGroup.resourceStates.some(r => pathEquals(r.resourceUri.path, uri.path) && r.type === Status.UNTRACKED)) {
			this.logger.trace(`[Repository][provideOriginalResource] Resource is untracked: ${uri.toString()}`);
			return undefined;
		}

		// Ignore path that is git ignored
		const ignored = await this.repository.checkIgnore([uri.fsPath]);
		if (ignored.size > 0) {
			this.logger.trace(`[Repository][provideOriginalResource] Resource is git ignored: ${uri.toString()}`);
			return undefined;
		}

		const originalResource = toGitUri(uri, '', { replaceFileExtension: true });
		this.logger.trace(`[Repository][provideOriginalResource] Original resource: ${originalResource.toString()}`);

		return originalResource;
	}
}

export class StagedResourceQuickDiffProvider implements QuickDiffProvider {
	readonly label = l10n.t('Git Local Changes (Index)');

	constructor(
		private readonly _repository: Repository,
		private readonly logger: LogOutputChannel
	) { }

	async provideOriginalResource(uri: Uri): Promise<Uri | undefined> {
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
		const stat = await workspace.fs.stat(uri);
		if ((stat.type & FileType.SymbolicLink) !== 0) {
			this.logger.trace(`[StagedResourceQuickDiffProvider][provideOriginalResource] Resource is a symbolic link: ${uri.toString()}`);
			return undefined;
		}

		// Ignore resources that are not in the index group
		if (!this._repository.indexGroup.resourceStates.some(r => pathEquals(r.resourceUri.fsPath, uri.fsPath))) {
			this.logger.trace(`[StagedResourceQuickDiffProvider][provideOriginalResource] Resource is not part of a index group: ${uri.toString()}`);
			return undefined;
		}

		const originalResource = toGitUri(uri, 'HEAD', { replaceFileExtension: true });
		this.logger.trace(`[StagedResourceQuickDiffProvider][provideOriginalResource] Original resource: ${originalResource.toString()}`);
		return originalResource;
	}
}
