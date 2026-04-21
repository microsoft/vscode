/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, IntervalTimer } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { ResourceMap, ResourceSet } from '../../../../util/vs/base/common/map';
import { isEqualOrParent } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { Change } from '../../../git/vscode/git';
import { LogExecTime } from '../../../log/common/logExecTime';
import { ILogService } from '../../../log/common/logService';
import { ISimulationTestContext } from '../../../simulationTestContext/common/simulationTestContext';
import { IWorkspaceFileIndex } from '../workspaceFileIndex';
import { RepoEntry } from './codeSearchChunkSearch';
import { CodeSearchRepoStatus } from './codeSearchRepo';

enum RepoState {
	Initializing,
	Error,
	Ready,
}

interface RepoDiffState {
	state: RepoState;
	readonly info: RepoEntry;
	readonly initialChanges: ResourceSet;
}

interface CodeSearchRepoTracker {
	readonly onDidAddOrUpdateRepo: Event<RepoEntry>;
	readonly onDidRemoveRepo: Event<RepoEntry>;

	initialize(): Promise<void>;
	getAllRepos(): Iterable<RepoEntry>;
	diffWithIndexedCommit(repoInfo: RepoEntry): Promise<CodeSearchDiff | undefined>;
}

export class CodeSearchWorkspaceDiffTracker extends Disposable {

	private static readonly _diffRefreshInterval = 1000 * 60 * 2; // 2 minutes

	private static readonly _maxDiffFiles = 10000;

	private readonly _repos = new ResourceMap<RepoDiffState>();

	private readonly _repoTracker: CodeSearchRepoTracker;

	/**
	 * Tracks all files that have been changed in the workspace during this session.
	 */
	private readonly _locallyChangedFiles = new ResourceSet();

	private readonly _onDidChangeDiffFiles = this._register(new Emitter<readonly URI[]>());
	public readonly onDidChangeDiffFiles = this._onDidChangeDiffFiles.event;

	private readonly _diffRefreshTimer = this._register(new IntervalTimer());

	private readonly _initialized = new DeferredPromise<void>();
	public readonly initialized = this._initialized.p;

	constructor(
		repoTracker: CodeSearchRepoTracker,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceFileIndex private readonly _workspaceFileIndex: IWorkspaceFileIndex,
		@ISimulationTestContext private readonly _simulationTestContext: ISimulationTestContext,
	) {
		super();

		this._repoTracker = repoTracker;

		this._register(this._repoTracker.onDidAddOrUpdateRepo(repoEntry => {
			if (repoEntry.status !== CodeSearchRepoStatus.Ready) {
				return;
			}
			const entry = this._repos.get(repoEntry.info.rootUri);
			if (entry) {
				this.refreshRepoDiff(entry);
			} else {
				this.openRepo(repoEntry);
			}
		}));
		this._register(this._repoTracker.onDidRemoveRepo(repo => this.closeRepo(repo)));

		this._register(Event.any(
			this._workspaceFileIndex.onDidCreateFiles,
			this._workspaceFileIndex.onDidChangeFiles
		)(async uris => {
			for (const uri of uris) {
				this._locallyChangedFiles.add(uri);
			}
			this._onDidChangeDiffFiles.fire(uris);
		}));

		this._diffRefreshTimer.cancelAndSet(() => {
			this.refreshRepoDiffs();
		}, CodeSearchWorkspaceDiffTracker._diffRefreshInterval);

		this.init();
	}

	@LogExecTime(self => self._logService, 'CodeSearchWorkspaceDiff::init')
	private async init() {
		try {
			await Promise.all([
				this._workspaceFileIndex.initialize(),
				this._repoTracker.initialize()
			]);

			await Promise.allSettled(Array.from(this._repoTracker.getAllRepos(), repo => {
				if (repo.status === CodeSearchRepoStatus.Ready || repo.status === CodeSearchRepoStatus.NotYetIndexed) {
					return this.openRepo(repo);
				}
			}));
		} finally {
			this._initialized.complete();
		}
	}

	/**
	 * Get a list of files that have changed in the workspace.
	 *
	 * @returns A list of URIs for files that have changed vs our indexed commit. Return undefined if we don't know that status of the workspace.
	 */
	getDiffFiles(): Iterable<URI> | undefined {
		if (!this._repos.size) {
			return undefined;
		}

		const seenFiles = new ResourceSet();
		for (const file of this._locallyChangedFiles) {
			if (this._workspaceFileIndex.get(file)) {
				seenFiles.add(file);
			}
		}

		for (const repoEntry of this._repos.values()) {
			if (repoEntry.state === RepoState.Ready) {
				for (const file of repoEntry.initialChanges) {
					if (this._workspaceFileIndex.get(file)) {
						seenFiles.add(file);
					}
				}
			}
		}

		return seenFiles;
	}

	private async openRepo(info: RepoEntry) {
		this._repos.delete(info.info.rootUri);

		const repoEntry: RepoDiffState = {
			state: RepoState.Initializing,
			info: info,
			initialChanges: new ResourceSet(),
		};

		this._repos.set(info.info.rootUri, repoEntry);
		this.refreshRepoDiff(repoEntry);
	}

	private closeRepo(info: RepoEntry) {
		this._repos.delete(info.info.rootUri);
	}

	private async tryGetDiffedIndexedFiles(info: RepoEntry): Promise<URI[] | undefined> {
		const diff = await this.tryGetDiff(info);
		this._logService.trace(`CodeSearchWorkspaceDiff::tryGetDiffedIndexedFiles() Got ${diff?.changes.length ?? 0} initially changed files for ${info.info.rootUri}`);
		if (!diff) {
			return;
		}

		const initialChanges = new ResourceSet();
		await Promise.all(diff.changes.slice(0, CodeSearchWorkspaceDiffTracker._maxDiffFiles).map(async change => {
			if (await this._workspaceFileIndex.shouldIndexWorkspaceFile(change.uri, CancellationToken.None)) {
				initialChanges.add(change.uri);
			}
		}));

		this._logService.trace(`CodeSearchWorkspaceDiff::tryGetDiffedIndexedFiles() Returning ${initialChanges} changes for ${info.info.rootUri}`);

		return Array.from(initialChanges);
	}

	private async tryGetDiff(repoInfo: RepoEntry): Promise<CodeSearchDiff | undefined> {
		return this._repoTracker.diffWithIndexedCommit(repoInfo);
	}

	private async refreshRepoDiffs() {
		await Promise.all(Array.from(this._repos.values(), repo => this.refreshRepoDiff(repo)));
		this._logService.trace(`CodeSearchWorkspaceDiff: Refreshed all diffs. New local diffs count: ${this._locallyChangedFiles.size}`);
	}

	private async refreshRepoDiff(repo: RepoDiffState) {
		this._logService.trace(`CodeSearchWorkspaceDiff: refreshing diff for ${repo.info.info.rootUri}`);

		if (this._simulationTestContext.isInSimulationTests) {
			// In simulation tests, we don't want to refresh the diff
			this._logService.trace(`CodeSearchWorkspaceDiff: Skipping diff refresh for ${repo.info.info.rootUri} in simulation tests`);
			repo.state = RepoState.Ready;
			return;
		}

		try {
			const diff = await this.tryGetDiffedIndexedFiles(repo.info);
			if (diff) {
				// Update initial changes for repo
				repo.initialChanges.clear();
				for (const changedFile of diff) {
					repo.initialChanges.add(changedFile);
				}

				this._logService.trace(`CodeSearchWorkspaceDiff: Refreshed diff for ${repo.info.info.rootUri}. New diff count: ${repo.initialChanges.size}`);

				// Delete any local changes that have no longer changed
				for (const locallyChangedFile of this._locallyChangedFiles) {
					if (isEqualOrParent(locallyChangedFile, repo.info.info.rootUri)) {
						const file = this._workspaceFileIndex.get(locallyChangedFile);
						if (file) {
							// The diff git returns to use only includes the files from disk.
							// Any dirty files still have to be considered changed.
							if (!file.isDirty()) {
								this._locallyChangedFiles.delete(locallyChangedFile);
							}
						}
					}
				}
				repo.state = RepoState.Ready;

			} else {
				this._logService.error(`CodeSearchWorkspaceDiff: Failed to get new diff for ${repo.info.info.rootUri}.`);
				repo.state = RepoState.Error;
			}
		} catch (e) {
			this._logService.error(`CodeSearchWorkspaceDiff: Failed to refresh diff for ${repo.info.info.rootUri}.`, e);
			repo.state = RepoState.Error;
		}
	}
}

export interface CodeSearchDiff {
	readonly changes: readonly Change[];
	readonly mayBeOutdated?: boolean;
}

