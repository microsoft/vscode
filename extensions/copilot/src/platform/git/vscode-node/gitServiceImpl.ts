/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { execFile } from 'child_process';
import { promisify } from 'util';
import { Uri } from 'vscode';
import { BatchedProcessor } from '../../../util/common/async';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { Sequencer } from '../../../util/vs/base/common/async';
import { CachedFunction } from '../../../util/vs/base/common/cache';
import { CancellationToken, cancelOnDispose } from '../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, IObservable, observableFromEvent, observableSignalFromEvent, observableValue, waitForState } from '../../../util/vs/base/common/observableInternal';
import * as path from '../../../util/vs/base/common/path';
import { isEqual } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { ILogService } from '../../log/common/logService';
import { IGitExtensionService } from '../common/gitExtensionService';
import { IGitService, RepoContext } from '../common/gitService';
import { parseGitRemotes } from '../common/utils';
import { API, APIState, Branch, Change, CommitOptions, CommitShortStat, DiffChange, Ref, RefQuery, Repository, RepositoryAccessDetails } from '../vscode/git';

const execFileAsync = promisify(execFile);

export class GitServiceImpl extends Disposable implements IGitService {

	declare readonly _serviceBrand: undefined;

	readonly activeRepository = observableValue<RepoContext | undefined>(this, undefined);

	private readonly _getRepositorySequencer = new Sequencer();

	private _onDidOpenRepository = new Emitter<RepoContext>();
	readonly onDidOpenRepository: Event<RepoContext> = this._onDidOpenRepository.event;
	private _onDidCloseRepository = new Emitter<RepoContext>();
	readonly onDidCloseRepository: Event<RepoContext> = this._onDidCloseRepository.event;
	private _onDidFinishInitialRepositoryDiscovery = new Emitter<void>();
	readonly onDidFinishInitialization: Event<void> = this._onDidFinishInitialRepositoryDiscovery.event;
	private _isInitialized = observableValue(this, false);
	constructor(
		@IGitExtensionService private readonly gitExtensionService: IGitExtensionService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._register(this._onDidOpenRepository);
		this._register(this._onDidCloseRepository);
		this._register(this._onDidFinishInitialRepositoryDiscovery);

		const gitAPI = this.gitExtensionService.getExtensionApi();
		if (gitAPI) {
			this.registerGitAPIListeners(gitAPI);
		} else {
			this._register(this.gitExtensionService.onDidChange((status) => {
				if (status.enabled) {
					const gitAPI = this.gitExtensionService.getExtensionApi();
					if (gitAPI) {
						this.registerGitAPIListeners(gitAPI);
						return;
					}
				}

				// Extension is disabled / git is not available so we say all repositories are discovered
				this._onDidFinishInitialRepositoryDiscovery.fire();
			}));
		}
	}

	private registerGitAPIListeners(gitAPI: API) {
		this._register(gitAPI.onDidOpenRepository(repository => this.doOpenRepository(repository)));
		this._register(gitAPI.onDidCloseRepository(repository => this.doCloseRepository(repository)));

		for (const repository of gitAPI.repositories) {
			this.doOpenRepository(repository);
		}

		// Initial repository discovery
		const stateObs = observableFromEvent(this,
			gitAPI.onDidChangeState as Event<APIState>, () => gitAPI.state);

		this._register(autorun(async reader => {
			const state = stateObs.read(reader);
			if (state !== 'initialized') {
				return;
			}

			// Wait for all discovered repositories to be initialized
			await Promise.all(gitAPI.repositories.map(repository => {
				const HEAD = observableFromEvent(this, repository.state.onDidChange as Event<void>, () => repository.state.HEAD);
				return waitForState(HEAD, state => state !== undefined, undefined, cancelOnDispose(this._store));
			}));

			this._isInitialized.set(true, undefined);
			this._onDidFinishInitialRepositoryDiscovery.fire();

			this.logService.trace(`[GitServiceImpl] Initial repository discovery finished: ${this.repositories.length} repositories found.`);
		}));
	}

	get isInitialized(): boolean {
		return this._isInitialized.get();
	}

	public getRecentRepositories(): Iterable<RepositoryAccessDetails> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		if (!gitAPI) {
			return [];
		}
		return gitAPI.recentRepositories;
	}

	async initRepository(uri: URI): Promise<Repository | undefined> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = await gitAPI?.init(uri);
		if (!repository) {
			return undefined;
		}

		await this.waitForRepositoryState(repository);
		return repository;
	}

	async openRepository(uri: URI): Promise<Repository | undefined> {
		const repository = await this._getRepository(uri, true);
		if (!repository) {
			return undefined;
		}

		await this.waitForRepositoryState(repository);
		return repository;
	}

	async getRepository2(uri: URI): Promise<Repository | undefined> {
		const repository = await this._getRepository(uri, false);
		return repository;
	}

	async getRepository(uri: URI, forceOpen = true): Promise<RepoContext | undefined> {
		const repository = await this._getRepository(uri, forceOpen);
		if (!repository) {
			return undefined;
		}

		await this.waitForRepositoryState(repository);
		return GitServiceImpl.repoToRepoContext(repository);
	}

	private async _getRepository(uri: URI, forceOpen = true): Promise<Repository | undefined> {
		return this._getRepositorySequencer.queue(async () => {
			const gitAPI = this.gitExtensionService.getExtensionApi();
			if (!gitAPI) {
				return undefined;
			}

			if (!(uri instanceof vscode.Uri)) {
				// The git extension API expects a vscode.Uri, so we convert it if necessary
				uri = vscode.Uri.parse(uri.toString());
			}

			// Ensure that the initial
			// repository discovery is
			// finished
			await this.initialize();

			// Query opened repositories
			let repository = gitAPI.getRepository(uri);
			if (repository) {
				return repository;
			}

			if (!forceOpen) {
				return undefined;
			}

			// Open repository
			repository = await gitAPI.openRepository(uri);
			if (!repository) {
				return undefined;
			}

			return repository;
		});
	}

	async getRepositoryFetchUrls(uri: URI): Promise<Pick<RepoContext, 'rootUri' | 'remoteFetchUrls'> | undefined> {
		this.logService.trace(`[GitServiceImpl][getRepositoryFetchUrls] URI: ${uri.toString()}`);

		const gitAPI = this.gitExtensionService.getExtensionApi();
		if (!gitAPI) {
			return undefined;
		}

		// Query opened repositories
		const repository = gitAPI.getRepository(uri);
		if (repository) {
			await this.waitForRepositoryState(repository);

			const remotes = {
				rootUri: repository.rootUri,
				remoteFetchUrls: repository.state.remotes.map(r => r.fetchUrl),
			};

			this.logService.trace(`[GitServiceImpl][getRepositoryFetchUrls] Remotes (open repository): ${JSON.stringify(remotes)}`);
			return remotes;
		}

		try {
			const uriStat = await vscode.workspace.fs.stat(uri);
			if (uriStat.type !== vscode.FileType.Directory) {
				uri = URI.file(path.dirname(uri.fsPath));
			}

			// Get repository root
			const repositoryRoot = await gitAPI.getRepositoryRoot(uri);
			if (!repositoryRoot) {
				this.logService.trace(`[GitServiceImpl][getRepositoryFetchUrls] No repository root found`);
				return undefined;
			}

			this.logService.trace(`[GitServiceImpl][getRepositoryFetchUrls] Repository root: ${repositoryRoot.toString()}`);
			const buffer = await vscode.workspace.fs.readFile(URI.file(path.join(repositoryRoot.fsPath, '.git', 'config')));

			const remotes = {
				rootUri: repositoryRoot,
				remoteFetchUrls: parseGitRemotes(buffer.toString()).map(remote => remote.fetchUrl)
			};

			this.logService.trace(`[GitServiceImpl][getRepositoryFetchUrls] Remotes (.git/config): ${JSON.stringify(remotes)}`);
			return remotes;
		} catch (error) {
			this.logService.error(`[GitServiceImpl][getRepositoryFetchUrls] Failed to read remotes from .git/config: ${error.message}`);
			return undefined;
		}
	}

	async add(uri: URI, paths: string[]): Promise<void> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		await repository?.add(paths);
	}

	async restore(uri: URI, paths: string[], options?: { staged?: boolean; ref?: string }): Promise<void> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		await repository?.restore(paths, options);
	}

	async diffBetweenPatch(uri: vscode.Uri, ref1: string, ref2: string, path?: string): Promise<string | undefined> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		return repository?.diffBetweenPatch(ref1, ref2, path);
	}

	async diffBetweenWithStats(uri: vscode.Uri, ref1: string, ref2: string, path?: string): Promise<DiffChange[] | undefined> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		return await repository?.diffBetweenWithStats(ref1, ref2, path);
	}

	async diffWith(uri: vscode.Uri, ref: string): Promise<Change[] | undefined> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		return repository?.diffWith(ref);
	}

	async diffIndexWithHEADShortStats(uri: URI): Promise<CommitShortStat | undefined> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		if (!repository?.diffIndexWithHEADShortStats) {
			return undefined;
		}
		return await repository?.diffIndexWithHEADShortStats(uri.fsPath);
	}

	async getMergeBase(uri: URI, ref1: string, ref2: string): Promise<string | undefined> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		return repository?.getMergeBase(ref1, ref2);
	}

	async commit(uri: URI, message: string, opts?: CommitOptions): Promise<void> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		if (!repository) {
			return;
		}

		await repository.commit(message, opts);
	}

	async applyPatch(uri: URI, patch: string): Promise<void> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		return await repository?.apply(patch, false);
	}

	async rebase(uri: URI, branch: string): Promise<void> {
		try {
			const gitAPI = this.gitExtensionService.getExtensionApi();
			const repository = gitAPI?.getRepository(uri);
			await repository?.rebase(branch);
		} catch (error) {
			this.logService.error(`[GitServiceImpl][rebase] Failed to rebase ${uri.toString()} on ${branch}: ${error.message}`);
		}
	}

	async createWorktree(uri: URI, options?: { path?: string; commitish?: string; branch?: string; noTrack?: boolean }): Promise<string | undefined> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		return await repository?.createWorktree(options);
	}

	async deleteWorktree(uri: URI, path: string, options?: { force?: boolean }): Promise<void> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		return await repository?.deleteWorktree(path, options);
	}

	async migrateChanges(uri: URI, sourceRepositoryUri: URI, options?: { confirmation?: boolean; deleteFromSource?: boolean; untracked?: boolean }): Promise<void> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		return await repository?.migrateChanges(sourceRepositoryUri.fsPath, options);
	}

	async getBranch(uri: URI, name: string): Promise<Branch | undefined> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		return await repository?.getBranch(name);
	}

	async getBranchBase(uri: URI, name: string): Promise<Branch | undefined> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		return await repository?.getBranchBase(name);
	}

	async getRefs(uri: URI, query: RefQuery, cancellationToken?: CancellationToken): Promise<Ref[]> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(uri);
		return await repository?.getRefs(query, cancellationToken) ?? [];
	}

	async isBranchProtected(uri: URI, branch?: string | Branch): Promise<boolean | undefined> {
		try {
			const gitAPI = this.gitExtensionService.getExtensionApi();
			const repository = gitAPI?.getRepository(uri);
			if (!repository) {
				return undefined;
			}

			const branchToCheck = typeof branch === 'string'
				? await repository.getBranch(branch)
				: branch;
			return repository.isBranchProtected(branchToCheck);
		} catch (error) {
			const branchLabel = typeof branch === 'string' ? branch : branch?.name;
			this.logService.error(`[GitServiceImpl][isBranchProtected] Failed to check branch protection for ${uri.toString()}${branchLabel ? ` (${branchLabel})` : ''}: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	async generateRandomBranchName(uri: URI): Promise<string | undefined> {
		try {
			const gitAPI = this.gitExtensionService.getExtensionApi();
			const repository = gitAPI?.getRepository(uri);

			const branchName = await repository?.generateRandomBranchName();
			return branchName;
		} catch (error) {
			this.logService.error(`[GitServiceImpl][generateRandomBranchName] Failed to generate random branch name: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	async exec(cwd: URI, args: string[], env?: Record<string, string>): Promise<string> {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		const gitPath = gitAPI?.git.path ?? 'git';
		const gitEnv = Object.assign({}, process.env, env, {
			GIT_AUTHOR_NAME: 'VS Code',
			GIT_AUTHOR_EMAIL: 'vscode@users.noreply.github.com',
			GIT_COMMITTER_NAME: 'VS Code',
			GIT_COMMITTER_EMAIL: 'vscode@users.noreply.github.com',
			LANG: 'en_US.UTF-8',
			LANGUAGE: 'en',
			LC_ALL: 'en_US.UTF-8'
		} satisfies Record<string, string>);

		const timer = performance.now();

		try {
			const result = await execFileAsync(gitPath, args, {
				cwd: cwd.fsPath,
				encoding: 'utf8',
				env: gitEnv
			});

			if (result.stderr) {
				this.logService.error(`[GitServiceImpl][exec] git ${args.join(' ')} [${Math.round(performance.now() - timer)}ms] Error: ${result.stderr}`);
				throw new Error(`Failed to execute git command (git ${args.join(' ')}). Error: ${result.stderr}`);
			}

			this.logService.trace(`[GitServiceImpl][exec] git ${args.join(' ')} [${Math.round(performance.now() - timer)}ms]`);
			return result.stdout.trim();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error(`[GitServiceImpl][exec] git ${args.join(' ')} [${Math.round(performance.now() - timer)}ms] Error: ${errorMessage}`);

			throw new Error(`Failed to execute git command (git ${args.join(' ')}). Error: ${errorMessage}`);
		}
	}

	async initialize(): Promise<void> {
		if (this._isInitialized.get()) {
			return;
		}

		await waitForState(this._isInitialized, state => state, undefined, cancelOnDispose(this._store));

		if (this.repositories.length > 0) {
			await waitForState(this.activeRepository, state => state !== undefined, undefined, cancelOnDispose(this._store));
		}
	}

	private async doOpenRepository(repository: Repository): Promise<void> {
		this.logService.trace(`[GitServiceImpl][doOpenRepository] Repository: ${repository.rootUri.toString()}`);

		// The `gitAPI.onDidOpenRepository` event is fired before `git status` completes and the repository
		// state is initialized. `IGitService.onDidOpenRepository` will only fire after the repository state
		// is initialized.
		const HEAD = observableFromEvent(this, repository.state.onDidChange as Event<void>, () => repository.state.HEAD);
		await waitForState(HEAD, state => state !== undefined, undefined, cancelOnDispose(this._store));

		this.logService.trace(`[GitServiceImpl][doOpenRepository] Repository initialized: ${JSON.stringify(HEAD.get())}`);

		// Active repository
		const selectedObs = observableFromEvent(this,
			repository.ui.onDidChange as Event<void>, () => repository.ui.selected);

		const onDidChangeStateSignal = observableSignalFromEvent(this, repository.state.onDidChange as Event<void>);

		this._register(autorun(reader => {
			onDidChangeStateSignal.read(reader);
			const selected = selectedObs.read(reader);

			const activeRepository = this.activeRepository.get();
			if (activeRepository && !selected && !isEqual(activeRepository.rootUri, repository.rootUri)) {
				return;
			}

			const repositoryContext = GitServiceImpl.repoToRepoContext(repository);
			this.logService.trace(`[GitServiceImpl][doOpenRepository] Active repository: ${JSON.stringify(repositoryContext)}`);
			this.activeRepository.set(repositoryContext, undefined);
		}));

		// Open repository event
		const repositoryContext = GitServiceImpl.repoToRepoContext(repository);
		if (repositoryContext) {
			this._onDidOpenRepository.fire(repositoryContext);
		}
	}

	private doCloseRepository(repository: Repository): void {
		this.logService.trace(`[GitServiceImpl][doCloseRepository] Repository: ${repository.rootUri.toString()}`);

		const repositoryContext = GitServiceImpl.repoToRepoContext(repository);
		if (repositoryContext) {
			this._onDidCloseRepository.fire(repositoryContext);
		}
	}

	private async waitForRepositoryState(repository: Repository): Promise<void> {
		if (repository.state.HEAD) {
			return;
		}

		const HEAD = observableFromEvent(this, repository.state.onDidChange as Event<void>, () => repository.state.HEAD);
		await waitForState(HEAD, state => state !== undefined, undefined, cancelOnDispose(this._store));
	}

	private static repoToRepoContext(repo: Repository): RepoContext;
	private static repoToRepoContext(repo: Repository | undefined | null): RepoContext | undefined
	private static repoToRepoContext(repo: Repository | undefined | null): RepoContext | undefined {
		if (!repo) {
			return undefined;
		}

		return new RepoContextImpl(repo);
	}

	get repositories(): RepoContext[] {
		const gitAPI = this.gitExtensionService.getExtensionApi();
		if (!gitAPI) {
			return [];
		}

		return coalesce(gitAPI.repositories
			.filter(repository => repository.state.HEAD !== undefined)
			.map(repository => GitServiceImpl.repoToRepoContext(repository)));
	}
}

export class RepoContextImpl implements RepoContext {
	public readonly rootUri = this._repo.rootUri;
	public readonly kind = this._repo.kind;
	public readonly isUsingVirtualFileSystem = this._repo.isUsingVirtualFileSystem;
	public readonly headBranchName = this._repo.state.HEAD?.name;
	public readonly headCommitHash = this._repo.state.HEAD?.commit;
	public readonly headIncomingChanges = this._repo.state.HEAD?.behind;
	public readonly headOutgoingChanges = this._repo.state.HEAD?.ahead;
	public readonly upstreamBranchName = this._repo.state.HEAD?.upstream?.name;
	public readonly upstreamRemote = this._repo.state.HEAD?.upstream?.remote;
	public readonly isRebasing = this._repo.state.rebaseCommit !== null;
	public readonly remotes = this._repo.state.remotes.map(r => r.name);
	public readonly remoteFetchUrls = this._repo.state.remotes.map(r => r.fetchUrl);
	public readonly worktrees = this._repo.state.worktrees;

	public readonly changes = {
		mergeChanges: this._repo.state.mergeChanges,
		indexChanges: this._repo.state.indexChanges,
		workingTree: this._repo.state.workingTreeChanges,
		untrackedChanges: this._repo.state.untrackedChanges
	};

	private readonly _onDidChangeSignal = observableSignalFromEvent(this, this._repo.state.onDidChange as Event<void>);

	public readonly headBranchNameObs: IObservable<string | undefined> = this._onDidChangeSignal.map(() => this._repo.state.HEAD?.name);
	public readonly headCommitHashObs: IObservable<string | undefined> = this._onDidChangeSignal.map(() => this._repo.state.HEAD?.commit);
	public readonly upstreamBranchNameObs: IObservable<string | undefined> = this._onDidChangeSignal.map(() => this._repo.state.HEAD?.upstream?.name);
	public readonly upstreamRemoteObs: IObservable<string | undefined> = this._onDidChangeSignal.map(() => this._repo.state.HEAD?.upstream?.remote);
	public readonly isRebasingObs: IObservable<boolean> = this._onDidChangeSignal.map(() => this._repo.state.rebaseCommit !== null);

	private readonly _checkIsIgnored = new BatchedProcessor<string, boolean>(async (paths) => {
		const result = await this._repo.checkIgnore(paths);
		return paths.map(p => result.has(p));
	}, 1000);
	private readonly _isIgnored = new CachedFunction(async (documentUri: string) => {
		const path = Uri.parse(documentUri).fsPath;
		const result = await this._checkIsIgnored.request(path);
		return result;
	});

	public isIgnored(uri: URI): Promise<boolean> {
		return this._isIgnored.get(uri.toString());
	}

	constructor(
		private readonly _repo: Repository
	) {
	}
}
