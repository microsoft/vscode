/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Uri, WorkspaceFolder, WorkspaceFoldersChangeEvent } from 'vscode';
import { isDescendant, pathEquals } from './util';

/**
 * Decides which repositories to open and close as the workspace folders change. The open
 * repositories of removed folders are closed, except that a repository that a visible
 * editor belongs to is retained, and closed once no visible editor belongs to it anymore.
 */
export class WorkspaceFolderRepositories<T> {

	private readonly retained = new Set<T>();

	constructor(private readonly getRoot: (repository: T) => string) { }

	/**
	 * The added workspace folders to open a repository for: the ones that are not the root of an open repository.
	 * A folder inside an open repository is still opened, as it can be a repository of its own, for example a
	 * worktree nested in it. Opening a folder whose repository is open already does nothing.
	 */
	getAddedFoldersToOpen(added: readonly WorkspaceFolder[], openRepositoryRoots: readonly string[]): WorkspaceFolder[] {
		return added.filter(folder => !openRepositoryRoots.some(root => pathEquals(root, folder.uri.fsPath)));
	}

	/**
	 * Returns the repositories of the folders removed in `e` to close now, and retains
	 * the ones that a visible editor belongs to.
	 */
	onDidChangeWorkspaceFolders(e: WorkspaceFoldersChangeEvent, workspaceFolders: readonly WorkspaceFolder[], getRepository: (folder: Uri) => T | undefined, hasVisibleEditor: (repository: T) => boolean): T[] {
		this.forgetRepositoriesInWorkspace(workspaceFolders);

		const result = new Set<T>();
		for (const folder of e.removed) {
			const repository = getRepository(folder.uri);
			if (!repository || this.isInWorkspace(repository, workspaceFolders)) {
				continue;
			}

			if (hasVisibleEditor(repository)) {
				this.retained.add(repository);
			} else {
				this.retained.delete(repository);
				result.add(repository);
			}
		}

		return [...result];
	}

	/**
	 * Returns the retained repositories that no visible editor belongs to anymore, to close now.
	 */
	onDidChangeVisibleEditors(workspaceFolders: readonly WorkspaceFolder[], hasVisibleEditor: (repository: T) => boolean): T[] {
		this.forgetRepositoriesInWorkspace(workspaceFolders);

		const result: T[] = [];
		for (const repository of this.retained) {
			if (!hasVisibleEditor(repository)) {
				this.retained.delete(repository);
				result.push(repository);
			}
		}

		return result;
	}

	/**
	 * Forgets a repository, for example because it was closed.
	 */
	delete(repository: T): void {
		this.retained.delete(repository);
	}

	/**
	 * A retained repository whose folder was added back stays open as any other repository of the workspace.
	 */
	private forgetRepositoriesInWorkspace(workspaceFolders: readonly WorkspaceFolder[]): void {
		for (const repository of this.retained) {
			if (this.isInWorkspace(repository, workspaceFolders)) {
				this.retained.delete(repository);
			}
		}
	}

	private isInWorkspace(repository: T, workspaceFolders: readonly WorkspaceFolder[]): boolean {
		return workspaceFolders.some(f => isDescendant(f.uri.fsPath, this.getRoot(repository)));
	}
}
