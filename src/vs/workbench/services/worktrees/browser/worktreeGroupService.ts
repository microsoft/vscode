/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { IObservable, ISettableObservable, derived, observableFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { basename, dirname, isEqual, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceEditingService } from '../../workspaces/common/workspaceEditing.js';
import { IWorktree, IWorktreeGroupService, IWorktreesChangeEvent } from '../common/worktrees.js';

interface IDiscoveredWorktree {
	readonly uri: URI;
	readonly commonDir: URI;
	readonly label: string;
	readonly branch: string | undefined;
	readonly isMain: boolean;
}

class Worktree implements IWorktree {

	private readonly _label: ISettableObservable<string>;
	private readonly _branch: ISettableObservable<string | undefined>;

	readonly label: IObservable<string>;
	readonly branch: IObservable<string | undefined>;

	constructor(
		readonly uri: URI,
		readonly commonDir: URI,
		readonly isMain: boolean,
		initialLabel: string,
		initialBranch: string | undefined,
	) {
		this._label = observableValue<string>(this, initialLabel);
		this._branch = observableValue<string | undefined>(this, initialBranch);
		this.label = this._label;
		this.branch = this._branch;
	}

	update(label: string, branch: string | undefined): void {
		transaction(tx => {
			this._label.set(label, tx);
			this._branch.set(branch, tx);
		});
	}
}

/**
 * Parses an on-disk `HEAD` file (`ref: refs/heads/<branch>` or a raw SHA)
 * and returns the branch name when present, otherwise `undefined`.
 */
function parseHeadFile(content: string): string | undefined {
	const trimmed = content.trim();
	const match = /^ref:\s*refs\/heads\/(.+)$/.exec(trimmed);
	return match ? match[1] : undefined;
}

async function tryReadFile(fileService: IFileService, uri: URI): Promise<string | undefined> {
	try {
		const content = await fileService.readFile(uri);
		return content.value.toString();
	} catch {
		return undefined;
	}
}

export class WorktreeGroupService extends Disposable implements IWorktreeGroupService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeWorktrees = this._register(new Emitter<IWorktreesChangeEvent>());
	readonly onDidChangeWorktrees: Event<IWorktreesChangeEvent> = this._onDidChangeWorktrees.event;

	private readonly _worktrees: ISettableObservable<readonly IWorktree[]>;
	readonly worktrees: IObservable<readonly IWorktree[]>;

	private readonly _pendingActiveWorktree: ISettableObservable<URI | undefined>;
	readonly activeWorktree: IObservable<IWorktree | undefined>;

	private readonly _byUri: ResourceMap<Worktree>;
	private readonly _watcher = this._register(new MutableDisposable());
	private _refreshInFlight: Promise<void> | undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Use the extUri comparison key so case-insensitive filesystems
		// (Windows, default APFS) and encoded URI variants resolve to the
		// same worktree on lookup.
		this._byUri = new ResourceMap<Worktree>(uri => this.uriIdentityService.extUri.getComparisonKey(uri));

		this._worktrees = observableValue<readonly IWorktree[]>(this, []);
		this.worktrees = this._worktrees;

		this._pendingActiveWorktree = observableValue<URI | undefined>(this, undefined);

		// Active worktree: prefer an explicitly pending one (set during openWorktree)
		// when it matches a known worktree; otherwise fall back to whichever known
		// worktree matches the first workspace folder.
		const workspaceFoldersObs = observableFromEvent(
			this.workspaceContextService.onDidChangeWorkspaceFolders,
			() => this.workspaceContextService.getWorkspace().folders,
		);

		this.activeWorktree = derived(reader => {
			const worktrees = this._worktrees.read(reader);
			const pending = this._pendingActiveWorktree.read(reader);
			const folders = workspaceFoldersObs.read(reader);
			const firstFolder = folders[0]?.uri;

			if (pending) {
				const match = worktrees.find(w => isEqual(w.uri, pending));
				if (match) {
					return match;
				}
			}

			if (!firstFolder) {
				return undefined;
			}
			return worktrees.find(w => isEqual(w.uri, firstFolder));
		});

		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			void this.refresh();
		}));

		void this.refresh();
	}

	getWorktree(uri: URI): IWorktree | undefined {
		return this._byUri.get(uri);
	}

	async openWorktree(uri: URI): Promise<void> {
		const worktree = this._byUri.get(uri);
		if (!worktree) {
			this.logService.warn(`[Worktrees] openWorktree called for unknown worktree: ${uri.toString()}`);
			return;
		}

		// Re-verify existence at click time: the directory may have been
		// removed externally since the last refresh.
		const stat = await this._tryStat(worktree.uri);
		if (!stat?.isDirectory) {
			this.logService.warn(`[Worktrees] worktree no longer exists on disk, refreshing: ${worktree.uri.toString()}`);
			await this.refresh();
			return;
		}

		const workspace = this.workspaceContextService.getWorkspace();
		const currentFirst = workspace.folders[0]?.uri;
		if (currentFirst && this.uriIdentityService.extUri.isEqual(currentFirst, worktree.uri)) {
			this._pendingActiveWorktree.set(undefined, undefined);
			return;
		}

		// Set pending first so observers (layout, terminal) react to the worktree
		// change before the workspace folders swap.
		this._pendingActiveWorktree.set(worktree.uri, undefined);

		const folderData = {
			uri: worktree.uri,
			name: worktree.label.get(),
		};

		if (!currentFirst) {
			await this.workspaceEditingService.addFolders([folderData], true);
		} else {
			await this.workspaceEditingService.updateFolders(0, 1, [folderData], true);
		}
	}

	async refresh(): Promise<void> {
		if (this._refreshInFlight) {
			return this._refreshInFlight;
		}
		this._refreshInFlight = this._doRefresh()
			.catch(err => this.logService.error('[Worktrees] refresh failed', err))
			.finally(() => { this._refreshInFlight = undefined; });
		return this._refreshInFlight;
	}

	private async _doRefresh(): Promise<void> {
		const workspace = this.workspaceContextService.getWorkspace();
		const firstFolder = workspace.folders[0]?.uri;
		if (!firstFolder || firstFolder.scheme !== Schemas.file) {
			this._applyDiscovered([]);
			this._updateWatcher(undefined);
			return;
		}

		const commonDir = await this._resolveCommonGitDir(firstFolder);
		if (!commonDir) {
			this._applyDiscovered([]);
			this._updateWatcher(undefined);
			return;
		}

		const discovered = await this._discoverWorktrees(commonDir);
		this._applyDiscovered(discovered);
		this._updateWatcher(commonDir);
	}

	/**
	 * Resolves the absolute path to the main repository's common `.git` directory
	 * starting from any folder inside any worktree of that repository.
	 */
	private async _resolveCommonGitDir(folder: URI): Promise<URI | undefined> {
		let current: URI = folder;
		while (true) {
			const dotGit = joinPath(current, '.git');
			const stat = await this._tryStat(dotGit);

			if (stat?.isDirectory) {
				return dotGit;
			}

			if (stat?.isFile) {
				// Linked worktree: `.git` is a file `gitdir: <path>`. `git
				// worktree add` writes absolute paths, but be defensive:
				// resolve relative values against the worktree root.
				const content = await tryReadFile(this.fileService, dotGit);
				const match = content && /^gitdir:\s*(.+)$/m.exec(content);
				if (match) {
					const gitDirPath = match[1].trim();
					const gitDirUri = isAbsolute(gitDirPath)
						? URI.file(gitDirPath)
						: joinPath(dirname(dotGit), gitDirPath);
					const commonDirFile = joinPath(gitDirUri, 'commondir');
					const commonDirContents = await tryReadFile(this.fileService, commonDirFile);
					if (commonDirContents) {
						const rel = commonDirContents.trim();
						return isAbsolute(rel)
							? URI.file(rel)
							: joinPath(gitDirUri, rel);
					}
					// Fallback: `.git/worktrees/<name>` → up two levels is the common `.git`.
					return dirname(dirname(gitDirUri));
				}
				return undefined;
			}

			const parent = dirname(current);
			if (isEqual(parent, current)) {
				return undefined;
			}
			current = parent;
		}
	}

	/**
	 * Lists all worktrees rooted at the given common `.git` directory: the main
	 * worktree (the directory containing `.git`) plus every linked worktree
	 * recorded under `.git/worktrees/<name>/`.
	 */
	private async _discoverWorktrees(commonDir: URI): Promise<IDiscoveredWorktree[]> {
		const results: IDiscoveredWorktree[] = [];

		const mainWorktreeRoot = dirname(commonDir);
		const mainHead = await tryReadFile(this.fileService, joinPath(commonDir, 'HEAD'));
		const mainBranch = mainHead ? parseHeadFile(mainHead) : undefined;
		results.push({
			uri: mainWorktreeRoot,
			commonDir,
			label: basename(mainWorktreeRoot) || mainWorktreeRoot.fsPath,
			branch: mainBranch,
			isMain: true,
		});

		const worktreesDir = joinPath(commonDir, 'worktrees');
		try {
			const entries = await this.fileService.resolve(worktreesDir);
			if (entries.children) {
				for (const child of entries.children) {
					if (child.isDirectory) {
						const wt = await this._readLinkedWorktree(child.resource, commonDir);
						if (wt) {
							results.push(wt);
						}
					}
				}
			}
		} catch {
			// no linked worktrees — that's fine
		}

		return results;
	}

	private async _readLinkedWorktree(entryDir: URI, commonDir: URI): Promise<IDiscoveredWorktree | undefined> {
		const gitdirFile = joinPath(entryDir, 'gitdir');
		const gitdirContents = await tryReadFile(this.fileService, gitdirFile);
		if (!gitdirContents) {
			return undefined;
		}

		// `gitdir` contents point at the linked worktree's `.git` file, e.g.
		// `/abs/path/to/linked-tree/.git`. The worktree root is its parent dir.
		const worktreeGitFile = URI.file(gitdirContents.trim());
		const worktreeRoot = dirname(worktreeGitFile);

		// Skip prunable worktrees: the `.git/worktrees/<name>/` entry outlives
		// the worktree directory when the user removes it externally. `git
		// worktree prune` would clean these up; we just hide them from the list.
		const rootStat = await this._tryStat(worktreeRoot);
		if (!rootStat?.isDirectory) {
			return undefined;
		}

		const head = await tryReadFile(this.fileService, joinPath(entryDir, 'HEAD'));
		const branch = head ? parseHeadFile(head) : undefined;

		return {
			uri: worktreeRoot,
			commonDir,
			label: basename(worktreeRoot) || worktreeRoot.fsPath,
			branch,
			isMain: false,
		};
	}

	private async _tryStat(uri: URI) {
		try {
			return await this.fileService.stat(uri);
		} catch {
			return undefined;
		}
	}

	private _applyDiscovered(discovered: readonly IDiscoveredWorktree[]): void {
		const seen = new ResourceMap<true>();
		const added: IWorktree[] = [];

		for (const d of discovered) {
			seen.set(d.uri, true);
			const existing = this._byUri.get(d.uri);
			if (existing) {
				existing.update(d.label, d.branch);
			} else {
				const wt = new Worktree(d.uri, d.commonDir, d.isMain, d.label, d.branch);
				this._byUri.set(d.uri, wt);
				added.push(wt);
			}
		}

		const removed: IWorktree[] = [];
		for (const [uri, wt] of this._byUri) {
			if (!seen.has(uri)) {
				removed.push(wt);
				this._byUri.delete(uri);
			}
		}

		if (added.length === 0 && removed.length === 0) {
			return;
		}

		const list: IWorktree[] = [];
		for (const wt of this._byUri.values()) {
			list.push(wt);
		}
		// Stable ordering: main first, then alphabetical by label.
		list.sort((a, b) => {
			if (a.isMain !== b.isMain) {
				return a.isMain ? -1 : 1;
			}
			return a.label.get().localeCompare(b.label.get());
		});

		this._worktrees.set(list, undefined);
		this._onDidChangeWorktrees.fire({ added, removed });
	}

	private _updateWatcher(commonDir: URI | undefined): void {
		if (!commonDir) {
			this._watcher.value = undefined;
			return;
		}
		try {
			const worktreesDir = joinPath(commonDir, 'worktrees');
			const watcher = this.fileService.createWatcher(worktreesDir, { recursive: false, excludes: [] });
			const sub = watcher.onDidChange(() => {
				void this.refresh();
			});
			this._watcher.value = {
				dispose: () => {
					sub.dispose();
					watcher.dispose();
				}
			};
		} catch (err) {
			this.logService.warn(`[Worktrees] failed to watch worktrees dir: ${err}`);
		}
	}
}

registerSingleton(IWorktreeGroupService, WorktreeGroupService, InstantiationType.Delayed);
