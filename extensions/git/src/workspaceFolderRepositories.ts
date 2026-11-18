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
 * The repository of a location that a folder left, right away when the folder switched to
 * another of its known locations or once the locations are known, is kept warm instead: hidden
 * and ready to be shown when the folder switches back. At most `warmCapacity` repositories are
 * kept warm, the least recently left one is closed first.
 */
export class WorkspaceFolderRepositories<T> {

	private readonly retained = new Set<T>();

	/** The repositories of removed folders that are kept as they are inside a remaining folder. */
	private readonly keptInWorkspace = new Set<T>();

	/** The warm repositories, the least recently left first. */
	private readonly warm: T[] = [];

	/** The repositories that stay shown in place of the pending repository of a location that a folder switched to. */
	private fallbacks = new Set<T>();

	constructor(
		private readonly getRoot: (repository: T) => string,
		private readonly warmCapacity = 3
	) { }

	/**
	 * The added workspace folders to open a repository for: the ones that are not the root of an open repository.
	 * A folder inside an open repository is still opened, as it can be a repository of its own, for example a
	 * worktree nested in it. Opening a folder whose repository is open already does nothing.
	 */
	getAddedFoldersToOpen(added: readonly WorkspaceFolder[], openRepositoryRoots: readonly string[]): WorkspaceFolder[] {
		return added.filter(folder => !openRepositoryRoots.some(root => pathEquals(root, folder.uri.fsPath)));
	}

	/**
	 * Returns the repositories of the folders removed in `e` to close now and the ones of the locations
	 * that the folders left, to keep warm. Retains the ones that a visible editor belongs to, unless
	 * their folder switched location.
	 */
	onDidChangeWorkspaceFolders(e: WorkspaceFoldersChangeEvent, workspaceFolders: readonly WorkspaceFolder[], getRepository: (folder: Uri) => T | undefined, hasVisibleEditor: (repository: T) => boolean): { close: T[]; leave: T[] } {
		this.forgetRepositoriesInWorkspace(workspaceFolders);

		const close = new Set<T>();
		const leave = new Set<T>();
		for (const folder of e.removed) {
			// The location that is left is kept warm, also when it is nested in the new location, and its editors are replaced by the ones of the new location
			const isSwitch = this.isFolderLocationSwitch(folder, e.added);
			const repository = getRepository(folder.uri);
			if (!repository) {
				continue;
			}

			if (!isSwitch && this.isInWorkspace(repository, workspaceFolders)) {
				this.keptInWorkspace.add(repository);
				continue;
			}

			this.retained.delete(repository);
			this.keptInWorkspace.delete(repository);

			if (isSwitch) {
				leave.add(repository);
			} else if (hasVisibleEditor(repository)) {
				this.retained.add(repository);
			} else {
				close.add(repository);
			}
		}

		return { close: [...close], leave: [...leave] };
	}

	/**
	 * Returns the repositories of removed folders that were kept as they are inside a remaining folder,
	 * and that turn out to be another known location of a workspace folder, to keep warm, and the warm
	 * repositories that are not a known location anymore, to close. This is how a switch from a folder
	 * whose locations were not known yet is told apart, once they are.
	 */
	onDidChangeWorkspaceFolderLocations(workspaceFolders: readonly WorkspaceFolder[]): { close: T[]; leave: T[] } {
		const leave = [...this.keptInWorkspace].filter(r => this.isOtherFolderLocation(this.getRoot(r), workspaceFolders));
		leave.forEach(r => this.keptInWorkspace.delete(r));

		const close = this.warm.filter(r => !this.isOtherFolderLocation(this.getRoot(r), workspaceFolders));
		close.forEach(r => this.warm.splice(this.warm.indexOf(r), 1));

		return { close, leave };
	}

	/**
	 * Keeps `repository` warm, as the most recently left one. Returns the warm repositories that
	 * do not fit anymore, to close.
	 */
	keepWarm(repository: T): T[] {
		const index = this.warm.indexOf(repository);
		if (index !== -1) {
			this.warm.splice(index, 1);
		}

		this.warm.push(repository);
		return this.warm.splice(0, Math.max(0, this.warm.length - this.warmCapacity));
	}

	/**
	 * Completes a switch of folders to other locations: returns the repositories among `candidates` to show and
	 * the ones to keep warm. The folders can have changed again while a location was opening, so this follows the
	 * current folders rather than the switch: a folder is at the deepest repository that contains it among the
	 * candidates and the `openRepositories` that are not kept warm. While that repository is `pending`, still
	 * awaiting its first status for another switch, the deepest ready one that contains the folder stays shown in
	 * its place, until a later switch completes with the pending one ready.
	 */
	completeSwitch(workspaceFolders: readonly WorkspaceFolder[], candidates: readonly T[], openRepositories: readonly T[], pending: readonly T[]): { show: T[]; warm: T[] } {
		const affected = [...new Set([...candidates, ...[...this.fallbacks].filter(r => openRepositories.includes(r))])];
		const repositories = [...new Set([...affected, ...openRepositories.filter(r => !this.warm.includes(r))])];
		const show = new Set<T>();
		const fallbacks = new Set<T>();
		for (const folder of workspaceFolders) {
			const containing = repositories
				.filter(r => isDescendant(this.getRoot(r), folder.uri.fsPath))
				.sort((a, b) => this.getRoot(b).length - this.getRoot(a).length);
			const current = containing.find(r => !pending.includes(r));
			if (!current || !affected.includes(current)) {
				continue;
			}
			show.add(current);
			if (current !== containing[0]) {
				fallbacks.add(current);
			}
		}
		this.fallbacks = fallbacks;
		return { show: [...show], warm: affected.filter(r => !show.has(r)) };
	}

	/**
	 * Takes the warm repository whose root is `fsPath`, to show it.
	 */
	takeWarm(fsPath: string): T | undefined {
		const index = this.warm.findIndex(r => pathEquals(this.getRoot(r), fsPath));
		return index === -1 ? undefined : this.warm.splice(index, 1)[0];
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
		this.fallbacks.delete(repository);

		const index = this.warm.indexOf(repository);
		if (index !== -1) {
			this.warm.splice(index, 1);
		}
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
