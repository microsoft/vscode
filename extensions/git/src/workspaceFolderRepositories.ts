/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkspaceFolder } from 'vscode';
import { pathEquals, PendingOperations } from './util';

/**
 * What {@link WorkspaceFolderRepositories} needs from the repositories model.
 */
export interface IWorkspaceFolderRepositoriesHost<T> {
	getWorkspaceFolders(): readonly WorkspaceFolder[];
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
	/** Shows that the repository of a location that a folder switched to is opening, until `opening` settles. */
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

	/** The repositories that a switch opened and that await their first git status, with the number of switches awaiting each. */
	private readonly pending = new Map<T, number>();

	/** The repositories that switches open, until they are open. */
	private readonly opening = new PendingOperations();

	/** Ends the wait for the first git status of a pending repository that is closed. */
	private readonly onDidClose = new Map<T, () => void>();

	/** The locations whose repository a switch opens, once for each switch, until it is shown or kept warm. */
	private readonly openingLocations: string[] = [];

	constructor(
		private readonly host: IWorkspaceFolderRepositoriesHost<T>,
		private readonly warmCapacity = 3,
		private readonly firstStatusTimeout = 10000
	) { }

	/**
	 * Returns the folders among `removed` whose known locations include one of the `added` folders, with the folder
	 * that each switched to. The locations of a folder are known once resolved, so a switch right after the folder
	 * was added cannot be told from a replacement; see {@link onDidChangeWorkspaceFolderLocations}.
	 */
	getFolderLocationSwitches(added: readonly WorkspaceFolder[], removed: readonly WorkspaceFolder[]): IFolderLocationSwitch[] {
		const result: IFolderLocationSwitch[] = [];
		for (const from of removed) {
			const to = added.find(folder => !pathEquals(folder.uri.fsPath, from.uri.fsPath)
				&& !result.some(s => s.to === folder)
				&& (from.locations ?? []).some(location => location.uri.scheme === 'file' && pathEquals(location.uri.fsPath, folder.uri.fsPath)));
			if (to) {
				result.push({ from, to });
			}
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
	 * Closes the warm repositories of locations that are not known anymore, and when `keepLeftLocationsWarm`, keeps the
	 * open repositories of other known locations of the folders warm. This is the case for a folder that switched before
	 * its locations were known, whose repository was handled as the one of any removed folder.
	 */
	onDidChangeWorkspaceFolderLocations(keepLeftLocationsWarm: boolean): void {
		// A folder whose locations are not known yet, for example right after it switched, could still have them
		if (this.host.getWorkspaceFolders().some(folder => folder.locations === undefined)) {
			return;
		}

		for (const repository of [...this.warm]) {
			// A folder that switched back before its locations were known is at a warm repository
			if (this.isCurrent(repository)) {
				this.takeWarmRepository(repository);
				this.host.setWarm(repository, false);
			} else if (!this.isOtherFolderLocation(this.host.getRoot(repository)) && !this.isOpening(this.host.getRoot(repository))) {
				this.takeWarmRepository(repository);
				this.host.close(repository);
			}
		}

		if (!keepLeftLocationsWarm) {
			return;
		}

		for (const repository of [...this.host.getOpenRepositories()]) {
			if (!this.host.isWarm(repository) && !this.pending.has(repository) && !this.isOpening(this.host.getRoot(repository))
				&& this.isOtherFolderLocation(this.host.getRoot(repository)) && !this.isCurrent(repository)) {
				this.keepWarm(repository);
			}
		}

		// A folder that switched to a repository nested in the one it left has none open, as the one it left contained it
		for (const folder of this.host.getWorkspaceFolders()) {
			const repository = this.host.getOpenRepository(folder.uri.fsPath);
			if ((folder.locations?.length ?? 0) > 1 && (!repository || this.host.isWarm(repository)) && !this.isOpening(folder.uri.fsPath)) {
				this.openLocation(folder.uri.fsPath);
			}
		}
	}

	/**
	 * Closes the warm repositories of the known locations of folders that were removed.
	 */
	onDidRemoveWorkspaceFolders(removed: readonly WorkspaceFolder[]): void {
		for (const repository of [...this.warm]) {
			const root = this.host.getRoot(repository);
			if (removed.some(folder => (folder.locations ?? []).some(location => pathEquals(location.uri.fsPath, root)))
				&& !this.isOtherFolderLocation(root)) {
				this.warm.splice(this.warm.indexOf(repository), 1);
				this.host.close(repository);
			}
		}
	}

	/**
	 * Forgets a repository, for example because it was closed.
	 */
	delete(repository: T): void {
		const index = this.warm.indexOf(repository);
		if (index !== -1) {
			this.warm.splice(index, 1);
		}
		this.pending.delete(repository);
		this.onDidClose.get(repository)?.();
		this.onDidClose.delete(repository);
	}

	private isOpening(fsPath: string): boolean {
		return this.openingLocations.some(l => pathEquals(l, fsPath));
	}

	private async openLocation(fsPath: string): Promise<void> {
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
			if (this.warm.includes(repository)) {
				endOpening();
				this.complete(repository);
				return;
			}

			this.pending.set(repository, (this.pending.get(repository) ?? 0) + 1);
			try {
				const closed = new Promise<void>(c => {
					const previous = this.onDidClose.get(repository);
					this.onDidClose.set(repository, () => { previous?.(); c(); });
				});
				let timer: ReturnType<typeof setTimeout> | undefined;
				const timeout = new Promise<void>(c => timer = setTimeout(c, this.firstStatusTimeout));
				await Promise.race([this.host.whenFirstStatus(repository), closed, timeout]);
				clearTimeout(timer);
			} finally {
				const count = this.pending.get(repository);
				if (count !== undefined && count > 1) {
					this.pending.set(repository, count - 1);
				} else {
					this.pending.delete(repository);
					this.onDidClose.delete(repository);
				}
			}

			endOpening();
			this.complete(repository);
		})();

		opened.then(endOpening, endOpening);
		this.host.showOpening(opened);
		return opened;
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
		return this.host.getWorkspaceFolders().some(folder => !pathEquals(folder.uri.fsPath, fsPath)
			&& (folder.locations ?? []).some(location => location.uri.scheme === 'file' && pathEquals(location.uri.fsPath, fsPath)));
	}
}

