/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isAbsolute } from '../../../../../base/common/path.js';
import { basename, dirname, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';

/**
 * The git repository that a local folder is a checkout of, read from its `.git`: the folder itself when `.git` is a
 * directory, and the main checkout when `.git` is the file of a worktree (`gitdir: <repository>/.git/worktrees/<name>`).
 * `undefined` for a folder that is not the root of a checkout, or whose `.git` cannot be read.
 */
export async function readFolderGitRepository(fileService: IFileService, folder: URI): Promise<URI | undefined> {
	const dotGit = joinPath(folder, '.git');
	try {
		const stat = await fileService.stat(dotGit);
		if (stat.isDirectory) {
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
	} catch {
		return undefined;
	}
}

/**
 * The git repositories of the local folders of the window's workspace (see {@link readFolderGitRepository}), which the
 * Sessions list of an editor window scopes its sessions to, with the folders themselves. Each folder's `.git` is read
 * once, as the folder joins the workspace; there are no watchers.
 */
export class WorkspaceFolderRepositories extends Disposable {

	private readonly _repositories = observableValue<readonly URI[]>(this, []);
	readonly repositories: IObservable<readonly URI[]> = this._repositories;

	private readonly _byFolder = new ResourceMap<Promise<URI | undefined>>();
	private _generation = 0;

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._register(_workspaceContextService.onDidChangeWorkspaceFolders(() => void this._update()));
		void this._update();
	}

	private async _update(): Promise<void> {
		const generation = ++this._generation;
		const folders = this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri).filter(folder => folder.scheme === Schemas.file);
		for (const folder of [...this._byFolder.keys()]) {
			if (!folders.some(candidate => isEqual(candidate, folder))) {
				this._byFolder.delete(folder);
			}
		}
		const repositories = await Promise.all(folders.map(folder => {
			let repository = this._byFolder.get(folder);
			if (!repository) {
				repository = readFolderGitRepository(this._fileService, folder);
				this._byFolder.set(folder, repository);
			}
			return repository;
		}));
		if (generation === this._generation && !this._store.isDisposed) {
			this._repositories.set(repositories.filter(isDefined), undefined);
		}
	}
}
