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
 * The repository of a folder that switched to another of its locations is closed right away,
 * or once the locations are known.
 */
export class WorkspaceFolderRepositories<T> {

	private readonly retained = new Set<T>();

	/** The repositories of removed folders that are kept as they are inside a remaining folder. */
	private readonly keptInWorkspace = new Set<T>();

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
	 * the ones that a visible editor belongs to, unless their folder switched location.
	 */
	onDidChangeWorkspaceFolders(e: WorkspaceFoldersChangeEvent, workspaceFolders: readonly WorkspaceFolder[], getRepository: (folder: Uri) => T | undefined, hasVisibleEditor: (repository: T) => boolean): T[] {
		this.forgetRepositoriesInWorkspace(workspaceFolders);

		const result = new Set<T>();
		for (const folder of e.removed) {
			// The location that is left is closed, also when it is nested in the new location, and its editors are replaced by the ones of the new location
			const isSwitch = this.isFolderLocationSwitch(folder, e.added);
			const repository = getRepository(folder.uri);
			if (!repository) {
				continue;
			}

			if (!isSwitch && this.isInWorkspace(repository, workspaceFolders)) {
				this.keptInWorkspace.add(repository);
				continue;
			}

			if (!isSwitch && hasVisibleEditor(repository)) {
				this.retained.add(repository);
			} else {
				this.retained.delete(repository);
				this.keptInWorkspace.delete(repository);
				result.add(repository);
			}
		}

		return [...result];
	}

	/**
	 * Returns the repositories of removed folders that were kept as they are inside a remaining folder,
	 * and that turn out to be another known location of a workspace folder, to close now. This is how a
	 * switch from a folder whose locations were not known yet is told apart, once they are.
	 */
	onDidChangeWorkspaceFolderLocations(workspaceFolders: readonly WorkspaceFolder[]): T[] {
		const result = [...this.keptInWorkspace].filter(r => this.isOtherFolderLocation(this.getRoot(r), workspaceFolders));
		result.forEach(r => this.keptInWorkspace.delete(r));
		return result;
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
		this.keptInWorkspace.delete(repository);
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

	/**
	 * Whether the removed folder `removed` is among the `added` ones at another of its known locations,
	 * which is how a workspace folder switching its location is reported. A switch from a folder whose
	 * locations are not known yet cannot be told from a replacement.
	 */
	private isFolderLocationSwitch(removed: WorkspaceFolder, added: readonly WorkspaceFolder[]): boolean {
		return added.some(folder => !pathEquals(folder.uri.fsPath, removed.uri.fsPath)
			&& (removed.locations ?? []).some(location => pathEquals(location.uri.fsPath, folder.uri.fsPath)));
	}

	/**
	 * Whether `fsPath` is a known location of a workspace folder other than the one it is at.
	 */
	private isOtherFolderLocation(fsPath: string, workspaceFolders: readonly WorkspaceFolder[]): boolean {
		return workspaceFolders.some(folder => !pathEquals(folder.uri.fsPath, fsPath)
			&& (folder.locations ?? []).some(location => location.uri.scheme === 'file' && pathEquals(location.uri.fsPath, fsPath)));
	}

	private isInWorkspace(repository: T, workspaceFolders: readonly WorkspaceFolder[]): boolean {
		return workspaceFolders.some(f => isDescendant(f.uri.fsPath, this.getRoot(repository)));
	}
}
