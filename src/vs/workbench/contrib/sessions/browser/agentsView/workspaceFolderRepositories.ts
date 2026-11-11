/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { isAbsolute } from '../../../../../base/common/path.js';
import { basename, dirname, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ISessionsListingScope } from '../sessionScope.js';

/**
 * The git repository that a local folder is a checkout of, read from its `.git`: the folder itself when `.git` is a
 * directory, and the main checkout when `.git` is the file of a worktree (`gitdir: <repository>/.git/worktrees/<name>`).
 * `undefined` for a folder without `.git`, or whose `.git` names no worktree, such as a submodule's. Throws when `.git`
 * exists but cannot be read.
 */
export async function readFolderGitRepository(fileService: IFileService, folder: URI): Promise<URI | undefined> {
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
 * The scope the sessions providers of an editor window list their sessions in: the folders of the window's workspace, and
 * the git repositories of its local folders (see {@link readFolderGitRepository}). Each folder's `.git` is read once, as
 * the folder joins the workspace, and again only after a read that failed; there are no watchers. A folder that leaves
 * the workspace stops counting at once.
 */
export class WorkspaceFolderRepositories extends Disposable implements ISessionsListingScope {

	readonly folders: IObservable<readonly URI[]>;

	private readonly _repositories = observableValue<readonly URI[]>(this, []);
	readonly repositories: IObservable<readonly URI[]> = this._repositories;

	/** The read of each folder's repository, while it is pending or after it succeeded. */
	private readonly _reads = new ResourceMap<Promise<URI | undefined>>();
	/** The repository of each folder whose read succeeded; `undefined` when it is not a checkout. */
	private readonly _resolved = new ResourceMap<URI | undefined>();
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
		for (const folder of [...this._reads.keys()]) {
			if (!folders.some(candidate => isEqual(candidate, folder))) {
				this._reads.delete(folder);
				this._resolved.delete(folder);
			}
		}
		// The folders that left stop counting now, before the folders that joined are read.
		this._repositories.set(folders.map(folder => this._resolved.get(folder)).filter(isDefined), undefined);
		const repositories = await Promise.all(folders.map(folder => this._read(folder)));
		if (generation === this._generation && !this._store.isDisposed) {
			this._repositories.set(repositories.filter(isDefined), undefined);
		}
	}

	private _read(folder: URI): Promise<URI | undefined> {
		let read = this._reads.get(folder);
		if (!read) {
			const pending = readFolderGitRepository(this._fileService, folder).then(repository => {
				if (this._reads.get(folder) === pending) {
					this._resolved.set(folder, repository);
				}
				return repository;
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
}
