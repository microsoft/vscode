/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Disposable, Event, WorkspaceFolder, WorkspaceFoldersChangeEvent } from 'vscode';
import { dispose, pathEquals, PendingOperations } from './util';

/**
 * What {@link WorkspaceFolderRepositories} needs from the workspace and the repositories model.
 */
export interface IWorkspaceFolderRepositoriesHost<T> {
	readonly onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>;
	readonly onDidChangeWorkspaceFolderLocations: Event<unknown>;
	getWorkspaceFolders(): readonly WorkspaceFolder[];
	/** Whether git opens the worktrees of the repository of `folder` anyway, see `git.detectWorktrees`. */
	isDetectingWorktrees(folder: WorkspaceFolder): boolean;
	getOpenRepositories(): readonly T[];
	getRoot(repository: T): string;
	/** The deepest open repository that contains `fsPath`. */
	getOpenRepository(fsPath: string): T | undefined;
	/** Opens the repository at `fsPath` hidden, as a warm repository, unless it is open already. */
	openRepository(fsPath: string): Promise<void>;
	isWarm(repository: T): boolean;
	setWarm(repository: T, isWarm: boolean): void;
	whenFirstStatus(repository: T): Promise<void>;
	close(repository: T): void;
	/** Shows that the repositories of locations that folders switched to are opening, until `opening` settles. */
	showOpening(opening: Promise<void>): void;
}

/**
 * A workspace folder that switched to another of its known locations, for example from a repository to one of
 * its worktrees. A switch is reported as the folder being removed and added at its new location.
 */
export interface IFolderLocationSwitch {
	readonly from: WorkspaceFolder;
	readonly to: WorkspaceFolder;
}

/**
 * Shows one repository for a workspace folder that switches between its locations, and switches without
 * flicker. The repository of the location that is left is kept warm: hidden, with git status paused, and
 * shown again right away when the folder switches back. At most `warmCapacity` repositories are kept warm,
 * the least recently left one is closed first. The repository of a location that is not warm opens hidden,
 * and is shown once its first git status ran, at most `firstStatusTimeout` later, so that it shows with its
 * changes. Only the repositories of the switching folders are affected.
 */
export class WorkspaceFolderRepositories<T> {

	/** The warm repositories, the least recently left first. These are ready: their first git status ran. */
	private readonly warm: T[] = [];

	/** The repositories that a switch opened and that await their first git status, with the switches awaiting each. */
	private readonly pending = new Map<T, number>();

	/** Ends the wait for the first git status of a pending repository that is closed. */
	private readonly onDidClose = new Map<T, () => void>();

	/** The repositories that switches open, until they are open. */
	private readonly opening = new PendingOperations();

	/** The switches to locations that are not warm, until their repository is shown or kept warm. */
	private readonly switching = new PendingOperations();

	/** The locations whose repository a switch opens, once for each switch, until it is shown or kept warm. */
	private readonly openingLocations: string[] = [];

	/** The folders that a switch added, until their locations are known. */
	private readonly awaitingLocations = new Set<WorkspaceFolder>();

	private readonly disposables: Disposable[] = [];

	constructor(
		private readonly host: IWorkspaceFolderRepositoriesHost<T>,
		private readonly warmCapacity = 3,
		private readonly firstStatusTimeout = 10000
	) {
		host.onDidChangeWorkspaceFolders(this.closeWarmRepositoriesOfRemovedFolders, this, this.disposables);
		host.onDidChangeWorkspaceFolderLocations(this.updateLeftLocations, this, this.disposables);
	}

	/**
	 * Returns the switches of folders to other locations in `e`, or `undefined` if `e` is not only that: the removed
	 * folders' known locations include the added folders, and git does not open their worktrees anyway. The locations
	 * of a folder are known once resolved, so a switch right after the folder was added runs as any folder change,
	 * see {@link updateLeftLocations}.
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
			if (!to || this.host.isDetectingWorktrees(to)) {
				return undefined;
			}
			result.push({ from, to });
		}
		return result;
	}

	/**
	 * Switches the repositories of folders that switched location: keeps the repository of the location that is
	 * left warm, and shows the repository of the new location, right away when it is warm. Otherwise opens it hidden
	 * and shows it once ready. Resolves once the switches completed.
	 */
	async switchFolderLocations(switches: readonly IFolderLocationSwitch[]): Promise<void> {
		const targets = switches.map(s => s.to);
		const opening: Promise<void>[] = [];
		for (const { from, to } of switches) {
			this.awaitingLocations.add(to);

			// The new location can be a repository nested in the one that is left, which is open while the new one is not yet
			const left = this.host.getOpenRepository(from.uri.fsPath);
			if (left && !this.pending.has(left) && !this.host.isWarm(left) && !this.isCurrent(left, targets)) {
				this.keepWarm(left);
			}

			const target = this.takeWarm(to.uri.fsPath);
			if (target) {
				this.host.setWarm(target, false);
			} else {
				opening.push(this.openLocation(to.uri.fsPath));
			}
		}

		await Promise.all(opening);
	}

	/**
	 * Resolves once the repositories that switches open are open, so that their git resources can be served.
	 */
	whenSwitchesOpened(): Promise<void> {
		return this.opening.settled();
	}

	/**
	 * Forgets a repository that is closed.
	 */
	delete(repository: T): void {
		this.takeWarmRepository(repository);
		this.pending.delete(repository);
		this.onDidClose.get(repository)?.();
		this.onDidClose.delete(repository);
	}

	dispose(): void {
		dispose(this.disposables);
	}

	/**
	 * Once the locations of the folders are known: shows the warm repository that a folder is at, closes the warm
	 * repositories of locations that are not known anymore and, unless git opens worktrees anyway, keeps the open
	 * repositories of other known locations of the folders warm. That is the case for a folder that switched before
	 * its locations were known, whose repositories were handled as the ones of any removed and added folder.
	 */
	private updateLeftLocations(): void {
		for (const folder of [...this.awaitingLocations]) {
			if (folder.locations !== undefined || !this.host.getWorkspaceFolders().includes(folder)) {
				this.awaitingLocations.delete(folder);
			}
		}

		// The locations of a folder that just switched are not known yet, so the ones it left would look unknown
		if (this.awaitingLocations.size > 0) {
			return;
		}

		for (const repository of [...this.warm]) {
			const root = this.host.getRoot(repository);
			if (this.isCurrent(repository)) {
				// A folder that switched back before its locations were known is at a warm repository
				this.takeWarmRepository(repository);
				this.host.setWarm(repository, false);
			} else if (!this.isOtherFolderLocation(root) && !this.isOpening(root)) {
				this.takeWarmRepository(repository);
				this.host.close(repository);
			}
		}

		for (const repository of [...this.host.getOpenRepositories()]) {
			const root = this.host.getRoot(repository);
			const folder = this.getFolderAtOtherLocation(root);
			if (folder && !this.host.isDetectingWorktrees(folder) && !this.host.isWarm(repository) && !this.pending.has(repository)
				&& !this.isOpening(root) && !this.isCurrent(repository)) {
				this.keepWarm(repository);
			}
		}

		// A folder that switched to a repository nested in the one it left has none open, as the one it left contained it
		for (const folder of this.host.getWorkspaceFolders()) {
			const repository = this.host.getOpenRepository(folder.uri.fsPath);
			if ((folder.locations?.length ?? 0) > 1 && !this.host.isDetectingWorktrees(folder)
				&& (!repository || this.host.isWarm(repository)) && !this.isOpening(folder.uri.fsPath)) {
				this.openLocation(folder.uri.fsPath);
			}
		}
	}

	/**
	 * Closes the warm repositories of the known locations of folders that were removed, rather than switched.
	 */
	private closeWarmRepositoriesOfRemovedFolders(e: WorkspaceFoldersChangeEvent): void {
		if (this.warm.length === 0 || this.getFolderLocationSwitches(e)) {
			return;
		}

		for (const repository of [...this.warm]) {
			const root = this.host.getRoot(repository);
			if (e.removed.some(folder => (folder.locations ?? []).some(location => pathEquals(location.uri.fsPath, root))) && !this.isOtherFolderLocation(root)) {
				this.takeWarmRepository(repository);
				this.host.close(repository);
			}
		}
	}

	private isOpening(fsPath: string): boolean {
		return this.openingLocations.some(l => pathEquals(l, fsPath));
	}

	private openLocation(fsPath: string): Promise<void> {
		// Tracked before awaiting, so that git resources read in the same tick wait for the repository
		const open = this.opening.track(this.host.openRepository(fsPath));
		this.openingLocations.push(fsPath);
		let isOpening = true;
		const endOpening = () => {
			if (isOpening) {
				isOpening = false;
				this.openingLocations.splice(this.openingLocations.indexOf(fsPath), 1);
			}
		};

		const opened = (async () => {
			await open;

			const repository = this.host.getOpenRepository(fsPath);
			if (!repository || !this.host.isWarm(repository)) {
				return;
			}

			// The location is in a warm repository, for example the one that was left, which is ready
			if (!this.warm.includes(repository)) {
				await this.whenReady(repository);
			}

			endOpening();
			this.complete(repository);
		})();
		opened.then(endOpening, endOpening);

		// One loading state for all the switches that are in progress
		const isSwitching = !this.switching.isEmpty;
		this.switching.track(opened);
		if (!isSwitching) {
			this.host.showOpening(this.switching.settled());
		}

		return opened;
	}

	/**
	 * Resolves once the first git status of `repository` ran, it is closed, or `firstStatusTimeout` passed.
	 */
	private async whenReady(repository: T): Promise<void> {
		this.pending.set(repository, (this.pending.get(repository) ?? 0) + 1);
		const closed = new Promise<void>(c => {
			const previous = this.onDidClose.get(repository);
			this.onDidClose.set(repository, () => { previous?.(); c(); });
		});
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<void>(c => timer = setTimeout(c, this.firstStatusTimeout));
		try {
			await Promise.race([this.host.whenFirstStatus(repository), closed, timeout]);
		} finally {
			clearTimeout(timer);
			const count = this.pending.get(repository);
			if (count !== undefined && count > 1) {
				this.pending.set(repository, count - 1);
			} else {
				this.pending.delete(repository);
				this.onDidClose.delete(repository);
			}
		}
	}

	/**
	 * Shows the repository that a switch opened if a folder is at it, and keeps it warm otherwise, once no other
	 * switch awaits it. The folders can have switched again while it was opening.
	 */
	private complete(repository: T): void {
		if (!this.host.getOpenRepositories().includes(repository) || !this.host.isWarm(repository)) {
			return;
		}

		if (this.isCurrent(repository)) {
			this.takeWarmRepository(repository);
			this.host.setWarm(repository, false);
		} else if (!this.pending.has(repository) && !this.isOpening(this.host.getRoot(repository))) {
			// A switch that opens the location again decides about it
			this.keepWarm(repository);
		}
	}

	private keepWarm(repository: T): void {
		this.takeWarmRepository(repository);
		this.warm.push(repository);
		this.host.setWarm(repository, true);

		for (const evicted of this.warm.splice(0, Math.max(0, this.warm.length - this.warmCapacity))) {
			this.host.close(evicted);
		}
	}

	private takeWarm(fsPath: string): T | undefined {
		const repository = this.warm.find(r => pathEquals(this.host.getRoot(r), fsPath));
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
	private isCurrent(repository: T, excluded: readonly WorkspaceFolder[] = []): boolean {
		return this.host.getWorkspaceFolders().some(folder => !excluded.some(e => pathEquals(e.uri.fsPath, folder.uri.fsPath))
			&& !this.isOpening(folder.uri.fsPath)
			&& this.host.getOpenRepository(folder.uri.fsPath) === repository);
	}

	/**
	 * Whether `fsPath` is a known location of a workspace folder other than the one it is at.
	 */
	private isOtherFolderLocation(fsPath: string): boolean {
		return !!this.getFolderAtOtherLocation(fsPath);
	}

	/**
	 * The workspace folder that `fsPath` is another known location of.
	 */
	private getFolderAtOtherLocation(fsPath: string): WorkspaceFolder | undefined {
		return this.host.getWorkspaceFolders().find(folder => !pathEquals(folder.uri.fsPath, fsPath)
			&& (folder.locations ?? []).some(location => location.uri.scheme === 'file' && pathEquals(location.uri.fsPath, fsPath)));
	}
}
