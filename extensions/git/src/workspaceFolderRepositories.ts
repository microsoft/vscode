/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Event, ProgressLocation, window, workspace, WorkspaceFolder, WorkspaceFoldersChangeEvent } from 'vscode';
import { RepositoryState } from './repository';
import { filterEvent, IDisposable, isDescendant, pathEquals, PendingOperations } from './util';

/**
 * A workspace folder that switched to another of its known locations, for example from a repository to one of
 * its worktrees. A switch is reported as the folder being removed and added at its new location.
 */
export interface IFolderLocationSwitch {
	readonly from: WorkspaceFolder;
	readonly to: WorkspaceFolder;
}

/**
 * A location whose repository a switch opens, until it is shown or kept warm.
 */
interface ILocationOpening<T> {
	readonly location: string;
	/** The repository that opened, once the opening is complete. */
	repository?: T;
}

/**
 * What to do with the repositories: show them (attach them), keep them warm (detach them), close them, and the
 * locations whose repository to open, see {@link WorkspaceFolderRepositories.apply}.
 */
interface IRepositoryChanges<T> {
	readonly show: T[];
	readonly warm: T[];
	readonly close: T[];
	readonly open: ILocationOpening<T>[];
}

/**
 * A repository of a workspace folder location, see `Repository`.
 */
export interface IFolderLocationRepository {
	readonly root: string;
	readonly rootRealPath: string | undefined;
	readonly onDidChangeState: Event<RepositoryState>;
	dispose(): void;
}

/**
 * The git model, which holds the attached repositories, see `Model`.
 */
export interface IFolderLocationModel<T> {
	/**
	 * Returns the attached repositories.
	 */
	getRepositories(): readonly T[];

	/**
	 * Opens the repository of `location` attached, as the repository of a workspace folder location, or attaches the
	 * warm one, see `Model.openRepository`.
	 */
	openRepository(location: string): Promise<T | undefined>;

	/**
	 * Attaches a repository as the repository of a workspace folder location. Does nothing if it is attached.
	 */
	attach(repository: T): void;

	/**
	 * Detaches a repository, which the model does not hold anymore, and returns whether it was attached.
	 */
	detach(repository: T): boolean;
}

/**
 * Holds the repositories of workspace folders that switch between their locations, so that a folder shows one
 * repository and switches without flicker. The repository of the location that is left is kept warm: it is detached,
 * and shown again right away when the folder switches back. At most `warmCapacity` repositories are kept warm, the
 * least recently left one is closed first. The repository of a location that is not warm opens, and is kept warm if
 * the folder left the location while it opened. Only the repositories of the switching folders are affected.
 */
export class WorkspaceFolderRepositories<T extends IFolderLocationRepository> {

	/**
	 * The warm repositories, the least recently left first, each with the listener that disposes it once it is gone.
	 * The model does not hold them.
	 */
	private readonly warm = new Map<T, IDisposable>();

	/** The locations whose repository switches open, one for each switch, until it is shown or kept warm. */
	private readonly openings = new Set<ILocationOpening<T>>();

	/** The folders that a switch added, until their locations are known. */
	private readonly awaitingLocations = new Set<WorkspaceFolder>();

	/** The repositories of the locations that switches open, until they are open. */
	private readonly locationOpens = new PendingOperations();

	/** The locations that switches open, until their repository is shown or kept warm. */
	private readonly locationSwitches = new PendingOperations();

	/** The switches in progress while the Source Control view shows that they are, see `showOpeningLocations`. */
	private openingLocations: Promise<void> | undefined;

	constructor(
		private readonly model: IFolderLocationModel<T>,
		private readonly getWorkspaceFolders: () => readonly WorkspaceFolder[] = () => workspace.workspaceFolders ?? [],
		private readonly warmCapacity = 3
	) { }

	/** The warm repositories, the least recently left first. */
	get warmRepositories(): T[] {
		return [...this.warm.keys()];
	}

	/** The attached and the warm repositories. */
	private get repositories(): T[] {
		return [...this.model.getRepositories(), ...this.warm.keys()];
	}

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
	 * warm, and shows the repository of the new location right away when it is warm, or opens it otherwise. Resolves once
	 * the repositories that it opens are shown or kept warm.
	 */
	async switchFolderLocations(switches: readonly IFolderLocationSwitch[]): Promise<void> {
		const workspaceFolders = this.getWorkspaceFolders();
		const repositories = this.repositories;
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
				this.keepWarm(left, changes);
			}
		}
		return this.apply(changes);
	}

	/**
	 * Opens the repository of a location that a workspace folder switched to, and keeps it warm if the folder is not at
	 * the location anymore once it is open.
	 */
	private async openSwitchedLocation(opening: ILocationOpening<T>): Promise<void> {
		opening.repository = await this.locationOpens.track(this.model.openRepository(opening.location));
		await this.apply(this.completeOpening(opening));
	}

	/**
	 * Completes `opening`: shows the repository it opened if a folder is at it, and keeps it warm otherwise, unless
	 * another switch opens it too. The folders can have switched again while it was opening.
	 */
	private completeOpening(opening: ILocationOpening<T>): IRepositoryChanges<T> {
		const workspaceFolders = this.getWorkspaceFolders();
		const repositories = this.repositories;
		const changes = createChanges<T>();
		const repository = opening.repository;
		this.openings.delete(opening);
		if (!repository || !repositories.includes(repository)) {
			return changes;
		}

		if (this.isCurrent(repository, workspaceFolders, repositories)) {
			this.takeWarmRepository(repository);
			changes.show.push(repository);
		} else if (!this.isPending(repository) && !this.isOpening(repository.root)) {
			this.keepWarm(repository, changes);
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
	async updateLeftLocations(switchingFolders: readonly WorkspaceFolder[]): Promise<void> {
		const workspaceFolders = this.getWorkspaceFolders();
		const repositories = this.repositories;
		const changes = createChanges<T>();
		for (const folder of [...this.awaitingLocations]) {
			if (folder.locations !== undefined || !workspaceFolders.includes(folder)) {
				this.awaitingLocations.delete(folder);
			}
		}

		// The locations of a folder that just switched are not known yet, so the ones it left would look unknown
		if (this.awaitingLocations.size > 0) {
			return;
		}

		// A folder that switched to a repository nested in the one it left has none open, as the one it left contained it
		// and is still open, warm or shown. That one must not be shown as the folder's repository.
		for (const folder of switchingFolders) {
			const repository = getDeepest(repositories, folder.uri.fsPath);
			if ((folder.locations?.length ?? 0) > 1 && !this.isOpening(folder.uri.fsPath)
				&& (!repository || this.warm.has(repository) || (!pathEquals(repository.root, folder.uri.fsPath) && isOtherFolderLocation(repository.root, [folder])))) {
				changes.open.push(this.addOpening(folder.uri.fsPath));
			}
		}

		for (const repository of [...this.warm.keys()]) {
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
				this.keepWarm(repository, changes);
			}
		}

		return this.apply(changes);
	}

	/**
	 * Shows (attaches), keeps warm (detaches) and closes repositories as decided, in one tick so that the views change in
	 * one step, and opens the repositories of the locations to open. Resolves once those are shown or kept warm. It shows
	 * before it keeps warm, so that the Source Control views always have a source control: core removes a source control
	 * only after the ones created before it.
	 */
	private async apply(changes: IRepositoryChanges<T>): Promise<void> {
		changes.show.forEach(r => this.model.attach(r));

		// A repository shown under one that detaches closes with it, see `Repository.detach`, so it is not kept warm
		for (const repository of changes.warm) {
			if (!this.model.detach(repository)) {
				this.takeWarmRepository(repository);
			}
		}

		changes.close.forEach(r => r.dispose());

		const opening = changes.open.map(o => this.locationSwitches.track(this.openSwitchedLocation(o)));
		if (opening.length > 0) {
			this.showOpeningLocations(this.locationSwitches.settled());
		}
		await Promise.all(opening);
	}

	/**
	 * Shows progress, and the Source Control view a loading message instead of an empty view, until `opening` settles.
	 */
	private showOpeningLocations(opening: Promise<void>): void {
		if (this.openingLocations) {
			return;
		}

		this.openingLocations = opening;
		commands.executeCommand('setContext', 'git.openingLocation', true);

		const done = () => {
			this.openingLocations = undefined;
			commands.executeCommand('setContext', 'git.openingLocation', false);
		};
		opening.then(done, done);

		window.withProgress({ location: ProgressLocation.SourceControl }, () => opening.catch(() => undefined));
	}

	/**
	 * Resolves once the repositories of the locations that switches open are open.
	 */
	whenLocationsOpened(): Promise<void> {
		return this.locationOpens.settled();
	}

	/**
	 * Takes the warm repository whose root or real path is `repoPath`, which is not kept warm anymore, for the model to
	 * attach it, see `Model.openRepository`.
	 */
	takeWarmRepositoryAt(repoPath: string): T | undefined {
		const repository = [...this.warm.keys()].find(r => pathEquals(r.root, repoPath) || (r.rootRealPath !== undefined && pathEquals(r.rootRealPath, repoPath)));
		if (repository) {
			this.takeWarmRepository(repository);
		}
		return repository;
	}

	/**
	 * Disposes a warm repository, which is not kept warm anymore. Does nothing if the repository is not warm.
	 */
	disposeWarmRepository(repository: T): void {
		if (this.takeWarmRepository(repository)) {
			repository.dispose();
		}
	}

	/**
	 * Disposes the warm repositories.
	 */
	dispose(): void {
		this.warmRepositories.forEach(r => this.disposeWarmRepository(r));
	}

	private addOpening(location: string): ILocationOpening<T> {
		const opening = { location };
		this.openings.add(opening);
		return opening;
	}

	/** Whether `repository` is shown: not warm, and not opening for a switch. */
	private isShown(repository: T): boolean {
		return !this.warm.has(repository) && !this.isPending(repository);
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
	 * Keeps `repository` warm, which the model detaches unless it is warm already, and closes the least recently left
	 * warm repositories beyond the capacity.
	 */
	private keepWarm(repository: T, changes: IRepositoryChanges<T>): void {
		let onDidDisappear = this.warm.get(repository);
		this.warm.delete(repository);
		if (!onDidDisappear) {
			onDidDisappear = filterEvent(repository.onDidChangeState, state => state === RepositoryState.Disposed)(() => this.disposeWarmRepository(repository));
			changes.warm.push(repository);
		}
		this.warm.set(repository, onDidDisappear);

		while (this.warm.size > this.warmCapacity) {
			const [leastRecentlyLeft] = this.warm.keys();
			this.takeWarmRepository(leastRecentlyLeft);
			changes.close.push(leastRecentlyLeft);
		}
	}

	private takeWarm(fsPath: string): T | undefined {
		const repository = [...this.warm.keys()].find(r => pathEquals(r.root, fsPath));
		if (repository) {
			this.takeWarmRepository(repository);
		}
		return repository;
	}

	/**
	 * Does not keep `repository` warm anymore, and returns whether it was warm.
	 */
	private takeWarmRepository(repository: T): boolean {
		this.warm.get(repository)?.dispose();
		return this.warm.delete(repository);
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
