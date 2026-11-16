/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { IObservable, observableFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { basename, dirname, isEqual, joinPath } from '../../../../base/common/resources.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISessionsListingScope } from '../common/sessionsProvider.js';
import { parseGitHubRepositoryFromGitConfig } from './gitHubRepositoryResolver.js';

/** The hosts of the GitHub repositories that Copilot Cloud sessions work in (`github-remote-file://github/...`). */
const GITHUB_HOSTS = ['github.com'];

/** What a local folder is a checkout of: its git repository, and the GitHub repository of that repository's `origin`. */
interface IFolderCheckout {
	readonly repository: URI | undefined;
	readonly gitHubRepository: string | undefined;
}

/**
 * The scope the sessions providers of an editor window list their sessions in: the folders of the window's workspace, the
 * git repositories of its local folders, read from their `.git`, and the GitHub repositories of those repositories'
 * `origin`, read from their `.git/config`, such as for Copilot Cloud sessions. Each folder's `.git` and its repository's
 * `.git/config` are read once, as the folder joins the workspace, and again only after a read that failed; there are no
 * watchers. A folder that leaves the workspace stops counting at once.
 */
export class WorkspaceFolderRepositories extends Disposable implements ISessionsListingScope {

	readonly folders: IObservable<readonly URI[]>;

	private readonly _repositories = observableValue<readonly URI[]>(this, []);
	readonly repositories: IObservable<readonly URI[]> = this._repositories;

	private readonly _gitHubRepositories = observableValue<readonly string[]>(this, []);
	readonly gitHubRepositories: IObservable<readonly string[]> = this._gitHubRepositories;

	/** The read of each folder's checkout, while it is pending or after it succeeded. */
	private readonly _reads = new ResourceMap<Promise<IFolderCheckout | undefined>>();
	/** The checkout of each folder whose read succeeded. */
	private readonly _resolved = new ResourceMap<IFolderCheckout>();
	private _generation = 0;

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this.folders = observableFromEvent(this, _workspaceContextService.onDidChangeWorkspaceFolders, () => _workspaceContextService.getWorkspace().folders.map(folder => folder.uri));
		this._register(_workspaceContextService.onDidChangeWorkspaceFolders(() => void this._update()));
		void this._update();
	}

	private async _update(): Promise<void> {
		const generation = ++this._generation;
		const folders = this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri).filter(folder => folder.scheme === Schemas.file);
		for (const folder of [...this._reads.keys(), ...this._resolved.keys()]) {
			if (!folders.some(candidate => isEqual(candidate, folder))) {
				this._reads.delete(folder);
				this._resolved.delete(folder);
			}
		}
		// The folders that left stop counting now, before the folders that joined are read.
		this._publish(folders.map(folder => this._resolved.get(folder)));
		const checkouts = await Promise.all(folders.map(folder => this._read(folder)));
		if (generation === this._generation && !this._store.isDisposed) {
			this._publish(checkouts);
		}
	}

	private _publish(checkouts: readonly (IFolderCheckout | undefined)[]): void {
		transaction(tx => {
			this._repositories.set(checkouts.map(checkout => checkout?.repository).filter(isDefined), tx);
			this._gitHubRepositories.set(checkouts.map(checkout => checkout?.gitHubRepository).filter(isDefined), tx);
		});
	}

	private _read(folder: URI): Promise<IFolderCheckout | undefined> {
		let read = this._reads.get(folder);
		if (!read) {
			const pending = this._readCheckout(folder).then(({ checkout, readAgain }) => {
				if (this._reads.get(folder) === pending) {
					this._resolved.set(folder, checkout);
					if (readAgain) {
						this._reads.delete(folder);
					}
				}
				return checkout;
			}, error => {
				// A read that failed, other than for a missing `.git`, is tried again as the folders change.
				this._logService.warn(`[WorkspaceFolderRepositories] Could not read the git repository of ${folder.toString()}`, error);
				if (this._reads.get(folder) === pending) {
					this._reads.delete(folder);
				}
				return undefined;
			});
			read = pending;
			this._reads.set(folder, read);
		}
		return read;
	}

	/** The checkout of `folder`, and whether to read it again as the folders change, as its `origin` could not be read. */
	private async _readCheckout(folder: URI): Promise<{ readonly checkout: IFolderCheckout; readonly readAgain: boolean }> {
		const repository = await WorkspaceFolderRepositories._readFolderGitRepository(this._fileService, folder);
		if (!repository) {
			return { checkout: { repository, gitHubRepository: undefined }, readAgain: false };
		}
		try {
			return { checkout: { repository, gitHubRepository: await WorkspaceFolderRepositories._readRepositoryGitHubOrigin(this._fileService, repository) }, readAgain: false };
		} catch (error) {
			// The repository still counts; its `origin` is read again, like a failed read of `.git`, as the folders change.
			this._logService.warn(`[WorkspaceFolderRepositories] Could not read the git origin of ${repository.toString()}`, error);
			return { checkout: { repository, gitHubRepository: undefined }, readAgain: true };
		}
	}

	/**
	 * The git repository that a local folder is a checkout of, read from its `.git`: the folder itself when `.git` is a
	 * directory, and the main checkout when `.git` is the file of a worktree (`gitdir: <repository>/.git/worktrees/<name>`).
	 * `undefined` for a folder without `.git`, or whose `.git` names no worktree, such as a submodule's. Throws when `.git`
	 * exists but cannot be read.
	 */
	private static async _readFolderGitRepository(fileService: IFileService, folder: URI): Promise<URI | undefined> {
		const dotGit = joinPath(folder, '.git');
		let isDirectory: boolean;
		try {
			isDirectory = (await fileService.stat(dotGit)).isDirectory;
		} catch (error) {
			if (error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return undefined;
			}
			throw error;
		}
		if (isDirectory) {
			return folder;
		}
		const content = (await fileService.readFile(dotGit)).value.toString();
		const gitdir = /^gitdir:\s*(?<path>.+?)\s*$/m.exec(content)?.groups?.path;
		if (!gitdir) {
			return undefined;
		}
		const worktreeGitDir = isAbsolute(gitdir) ? URI.file(gitdir) : joinPath(folder, gitdir);
		const worktreesDir = dirname(worktreeGitDir);
		const commonGitDir = dirname(worktreesDir);
		return basename(worktreesDir) === 'worktrees' && basename(commonGitDir) === '.git' && !isEqual(commonGitDir, worktreesDir)
			? dirname(commonGitDir)
			: undefined;
	}

	/**
	 * The GitHub repository, as lowercase `owner/repo`, that the `origin` remote of a git `config` names, such as
	 * `https://github.com/owner/repo.git` or `git@github.com:owner/repo`; `undefined` for another host or without `origin`.
	 */
	private static _parseGitHubOrigin(config: string): string | undefined {
		const repository = parseGitHubRepositoryFromGitConfig(config, GITHUB_HOSTS, 'origin');
		return repository && `${repository.owner}/${repository.repo}`.toLowerCase();
	}

	/**
	 * The GitHub repository the `origin` of a local git `repository` names, read from its `.git/config` (see
	 * {@link _parseGitHubOrigin}). `undefined` without that file; throws when it exists but cannot be read.
	 */
	private static async _readRepositoryGitHubOrigin(fileService: IFileService, repository: URI): Promise<string | undefined> {
		try {
			return WorkspaceFolderRepositories._parseGitHubOrigin((await fileService.readFile(joinPath(repository, '.git', 'config'))).value.toString());
		} catch (error) {
			if (error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return undefined;
			}
			throw error;
		}
	}
}
