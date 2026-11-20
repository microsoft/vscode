/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkspaceFolder, WorkspaceFoldersChangeEvent } from 'vscode';
import { isDescendant, pathEquals } from './util';

/**
 * A workspace folder that switched to another of its known locations, for example from a repository to one of
 * its worktrees. A switch is reported as the folder being removed and added at its new location.
 */
export interface IFolderLocationSwitch {
	readonly from: WorkspaceFolder;
	readonly to: WorkspaceFolder;
}

/**
 * A location whose repository a switch opens, hidden, until it is shown or kept warm.
 */
export interface ILocationOpening {
	readonly location: string;
}

/**
 * What to do with the repositories: show them, keep them warm (hidden, with git status paused), close them, and
 * the locations whose repository to open hidden, see {@link WorkspaceFolderRepositories.completeOpening}.
 */
export interface IRepositoryChanges<T> {
	readonly show: T[];
	readonly warm: T[];
	readonly close: T[];
	readonly open: ILocationOpening[];
}

interface Opening<T> extends ILocationOpening {
	repository?: T;
}

/**
 * A repository of a workspace folder location. `parentRoot` is the root of the repository it is shown under, which
 * closes it when it closes.
 */
export interface IFolderLocationRepository {
	readonly root: string;
	readonly parentRoot?: string;
}

/**
 * Decides which repositories to show for workspace folders that switch between their locations, so that a folder
 * shows one repository and switches without flicker. The repository of the location that is left is kept warm and
 * shown again right away when the folder switches back. At most `warmCapacity` repositories are kept warm, the least
 * recently left one is closed first. The repository of a location that is not warm opens hidden, and is shown once
 * ready. Only the repositories of the switching folders are affected.
 */
export class WorkspaceFolderRepositories<T extends IFolderLocationRepository> {

	/** The warm repositories, the least recently left first. These are ready. */
	private readonly warm: T[] = [];

	/** The locations whose repository switches open, one for each switch, until it is shown or kept warm. */
	private readonly openings = new Set<Opening<T>>();

	/** The folders that a switch added, until their locations are known. */
	private readonly awaitingLocations = new Set<WorkspaceFolder>();

	constructor(private readonly warmCapacity = 3) { }

	/**
	 * Returns the switches of folders to other locations in `e`, or `undefined` if `e` is not only that: the removed
	 * folders' known locations include the added folders. The locations of a folder are known once resolved, so a
	 * switch right after the folder was added cannot be told from any folder change, see {@link updateLeftLocations}.
	 */
	getFolderLocationSwitches(e: WorkspaceFoldersChangeEvent): IFolderLocationSwitch[] | undefined {
		if (e.added.length === 0 || e.added.length !== e.removed.length) {
			return undefined;
		}

		const result: IFolderLocationSwitch[] = [];
		for (const from of e.removed) {
			const to = e.added.find(folder => !pathEquals(folder.uri.fsPath, from.uri.fsPath)
				&& !result.some(s => s.to === folder)
				&& (from.locations ?? []).some(location => location.uri.scheme === 'file' && pathEquals(location.uri.fsPath, folder.uri.fsPath)));
			if (!to) {
				return undefined;
			}
			result.push({ from, to });
		}
		return result;
	}

	/**
	 * Switches the repositories of folders that switched location: keeps the repository of the location that is left
	 * warm, and shows the repository of the new location right away when it is warm, or opens it otherwise.
	 */
	switchFolderLocations(switches: readonly IFolderLocationSwitch[], workspaceFolders: readonly WorkspaceFolder[], repositories: readonly T[]): IRepositoryChanges<T> {
		const changes = createChanges<T>();
		const targets = switches.map(s => s.to);

		// Take the warm repositories of the new locations first, so that keeping the left ones warm cannot evict them
		for (const to of targets) {
			this.awaitingLocations.add(to);
			const target = this.takeWarm(to.uri.fsPath);
			if (target) {
				changes.show.push(target);
			} else {
				changes.open.push(this.addOpening(to.uri.fsPath));
			}
		}

		for (const { from } of switches) {
			// The new location can be a repository nested in the one that is left, which is open while the new one is not yet
			const left = getDeepest(repositories, from.uri.fsPath);
			if (left && this.isShown(left) && !changes.show.includes(left) && !this.isCurrent(left, workspaceFolders, repositories, targets)) {
				this.keepWarm(left, changes, repositories);
			}
		}
		return changes;
	}

	/**
	 * Sets the repository that `opening` opened, hidden. Returns whether it is ready to be shown: otherwise it is once
	 * its first git status ran.
	 */
	setOpenedRepository(opening: ILocationOpening, repository: T): boolean {
		(opening as Opening<T>).repository = repository;
		return this.warm.includes(repository);
	}

	/**
	 * Completes `opening`: shows the repository it opened if a folder is at it, and keeps it warm otherwise, unless
	 * another switch opens it too. The folders can have switched again while it was opening.
	 */
	completeOpening(opening: ILocationOpening, workspaceFolders: readonly WorkspaceFolder[], repositories: readonly T[]): IRepositoryChanges<T> {
		const changes = createChanges<T>();
		const repository = (opening as Opening<T>).repository;
		this.openings.delete(opening as Opening<T>);
		if (!repository || !repositories.includes(repository)) {
			return changes;
		}

		if (this.isCurrent(repository, workspaceFolders, repositories)) {
			this.takeWarmRepository(repository);
			changes.show.push(repository);
		} else if (!this.isPending(repository) && !this.isOpening(repository.root)) {
			this.keepWarm(repository, changes, repositories);
		}
		return changes;
	}

	/**
	 * Once the locations of the folders are known: shows the warm repository that a folder is at, closes the warm
	 * repositories of locations that are not known anymore and, for the `switchingFolders` (the folders that show the
	 * repository of their current location only), keeps the open repositories of their other known locations warm and
	 * opens the location of a folder whose repository is not the one of that location. That is the case for a folder
	 * that switched before its locations were known, whose repositories were handled as the ones of any removed and
	 * added folder.
	 */
	updateLeftLocations(workspaceFolders: readonly WorkspaceFolder[], repositories: readonly T[], switchingFolders: readonly WorkspaceFolder[]): IRepositoryChanges<T> {
		const changes = createChanges<T>();
		for (const folder of [...this.awaitingLocations]) {
			if (folder.locations !== undefined || !workspaceFolders.includes(folder)) {
				this.awaitingLocations.delete(folder);
			}
		}

		// The locations of a folder that just switched are not known yet, so the ones it left would look unknown
		if (this.awaitingLocations.size > 0) {
			return changes;
		}

		// A folder that switched to a repository nested in the one it left has none open, as the one it left contained it
		// and is still open, warm or shown. That one must not be shown as the folder's repository.
		for (const folder of switchingFolders) {
			const repository = getDeepest(repositories, folder.uri.fsPath);
			if ((folder.locations?.length ?? 0) > 1 && !this.isOpening(folder.uri.fsPath)
				&& (!repository || this.warm.includes(repository) || (!pathEquals(repository.root, folder.uri.fsPath) && isOtherFolderLocation(repository.root, [folder])))) {
				changes.open.push(this.addOpening(folder.uri.fsPath));
			}
		}

		for (const repository of [...this.warm]) {
			if (this.isCurrent(repository, workspaceFolders, repositories)) {
				// A folder that switched back before its locations were known is at a warm repository
				this.takeWarmRepository(repository);
				changes.show.push(repository);
			} else if (!isOtherFolderLocation(repository.root, workspaceFolders) && !this.isOpening(repository.root)) {
				this.takeWarmRepository(repository);
				changes.close.push(repository);
			}
		}

		for (const repository of repositories) {
			if (this.isShown(repository) && !this.isOpening(repository.root) && !changes.show.includes(repository)
				&& isOtherFolderLocation(repository.root, switchingFolders) && !this.isCurrent(repository, workspaceFolders, repositories)) {
				this.keepWarm(repository, changes, repositories);
			}
		}

		return changes;
	}

	/**
	 * Forgets a repository that is closed.
	 */
	delete(repository: T): void {
		this.takeWarmRepository(repository);
	}

	private addOpening(location: string): Opening<T> {
		const opening = { location };
		this.openings.add(opening);
		return opening;
	}

	/** Whether `repository` is shown: not warm, and not opening for a switch. */
	private isShown(repository: T): boolean {
		return !this.warm.includes(repository) && !this.isPending(repository);
	}

	/** Whether a switch opened `repository` and awaits it. */
	private isPending(repository: T): boolean {
		return [...this.openings].some(o => o.repository === repository);
	}

	private isOpening(fsPath: string): boolean {
		return [...this.openings].some(o => pathEquals(o.location, fsPath));
	}

	/**
	 * Whether `fsPath` is at or inside a location that a switch is opening the repository of.
	 */
	isOpeningLocationOf(fsPath: string): boolean {
		return [...this.openings].some(o => isAtOrInside(o.location, fsPath));
	}

	/**
	 * Keeps `repository` warm, and closes the least recently left warm repositories beyond the capacity. A repository
	 * that another open repository is shown under is not closed, as that would close the other one too.
	 */
	private keepWarm(repository: T, changes: IRepositoryChanges<T>, repositories: readonly T[]): void {
		this.takeWarmRepository(repository);
		this.warm.push(repository);
		changes.warm.push(repository);

		for (const candidate of [...this.warm]) {
			if (this.warm.length <= this.warmCapacity) {
				break;
			}
			if (!repositories.some(r => r !== candidate && r.parentRoot !== undefined && pathEquals(r.parentRoot, candidate.root))) {
				this.takeWarmRepository(candidate);
				changes.close.push(candidate);
			}
		}
	}

	private takeWarm(fsPath: string): T | undefined {
		const repository = this.warm.find(r => pathEquals(r.root, fsPath));
		if (repository) {
			this.takeWarmRepository(repository);
		}
		return repository;
	}

	private takeWarmRepository(repository: T): void {
		const index = this.warm.indexOf(repository);
		if (index !== -1) {
			this.warm.splice(index, 1);
		}
	}

	/**
	 * Whether `repository` is the deepest open repository of a workspace folder, other than the `excluded` ones. A folder
	 * whose location a switch opens is at no repository yet: the deepest open one can be the one it left, which contains it.
	 */
	private isCurrent(repository: T, workspaceFolders: readonly WorkspaceFolder[], repositories: readonly T[], excluded: readonly WorkspaceFolder[] = []): boolean {
		return workspaceFolders.some(folder => !excluded.some(e => pathEquals(e.uri.fsPath, folder.uri.fsPath))
			&& !this.isOpening(folder.uri.fsPath)
			&& getDeepest(repositories, folder.uri.fsPath) === repository);
	}
}

function createChanges<T>(): IRepositoryChanges<T> {
	return { show: [], warm: [], close: [], open: [] };
}

/**
 * The deepest of `repositories` that contains `fsPath`.
 */
function getDeepest<T extends IFolderLocationRepository>(repositories: readonly T[], fsPath: string): T | undefined {
	return repositories.filter(r => isAtOrInside(r.root, fsPath)).sort((a, b) => b.root.length - a.root.length)[0];
}

/**
 * Whether `fsPath` is `parent` or inside it, ignoring path casing where the file system does and trailing separators.
 */
function isAtOrInside(parent: string, fsPath: string): boolean {
	return pathEquals(parent, fsPath) || isDescendant(parent, fsPath);
}

/**
 * Whether `fsPath` is a known location of a workspace folder other than the one it is at.
 */
function isOtherFolderLocation(fsPath: string, workspaceFolders: readonly WorkspaceFolder[]): boolean {
	return workspaceFolders.some(folder => !pathEquals(folder.uri.fsPath, fsPath)
		&& (folder.locations ?? []).some(location => location.uri.scheme === 'file' && pathEquals(location.uri.fsPath, fsPath)));
}
