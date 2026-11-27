/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fsPromises from 'fs/promises';
import { cp as copyFile } from '@vscode/fs-copyfile';
import { distinct } from '../../../base/common/arrays.js';
import { Schemas } from '../../../base/common/network.js';
import * as path from '../../../base/common/path.js';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../base/common/resources.js';
import { isDefined } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { killTree } from '../../../base/node/processes.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { FileEditKind, type ISessionFileDiff, type ISessionGitState } from '../common/state/sessionState.js';
import { buildGitBlobUri } from './gitDiffContent.js';
import { CheckoutBlockedByLocalChangesError, EMPTY_TREE_OBJECT, IAddWorktreeOptions, IAgentHostGitService, IAgentHostGitWorktree, IBranch, IBranchDiffSafetyInfo, ICommitOptions, IRefQuery, IComputeSessionFileDiffsOptions, IDefaultBranch, IGitRemote, IPullOptions, IPushOptions, GitRefType, IRemoteBranch, GitRef, ITag, Branch, IWorktreeFileProgress, IDetachedHead, BaseBranch, parseBaseBranchRef, WorktreeAddError, IAddWorktreeResult } from '../common/agentHostGitService.js';
import { LRUCache } from '../../../base/common/map.js';
import { isWindows } from '../../../base/common/platform.js';
import { localize } from '../../../nls.js';
import { firstParallel, Limiter, timeout } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { derived, observableValueOpts, type IObservable } from '../../../base/common/observable.js';
import { createWorktreeSymlink } from './worktreeSymlink.js';
import { AgentHostGitCoalesceReadsConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { AgentHostGitCoalesceReadsSettingId } from '../common/agentService.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentHostSettingExperimentTrigger } from './agentHostSettingExperimentTrigger.js';
import { AgentHostGitReadTelemetry, type GitReadArm } from './agentHostGitReadTelemetry.js';

/**
 * `git worktree remove`/`prune` can transiently fail — or, worse, exit 0 while
 * leaving the `.git/worktrees/<id>` admin directory behind — when a concurrent
 * git process in the worktree still holds an `index.lock`, so the admin
 * directory is non-empty. That clears once the other process exits, so retry a
 * few times with a capped exponential backoff and verify de-registration.
 */
const WORKTREE_REMOVAL_MAX_ATTEMPTS = 5;
const WORKTREE_REMOVAL_RETRY_BASE_DELAY_MS = 100;
const WORKTREE_REMOVAL_RETRY_MAX_DELAY_MS = 500;

/** Budget for reading one blob; a timeout here drops a diff's original side. */
const SHOW_BLOB_TIMEOUT_MS = 15_000;

/**
 * Budget for listing refs. Sorting by commit date reads every ref's tip commit, which can
 * exceed the default timeout on a cold disk cache, e.g. on the first start after an update.
 */
const GET_REFS_TIMEOUT_MS = 30_000;

/** Budget for a git command that doesn't set its own, so that an unresponsive remote can't hang a caller. */
const GIT_COMMAND_TIMEOUT_MS = 30_000;

/** How many read-only git commands the host runs at once. Slow reads that pile up make each other slower, so the rest wait for a free slot. */
const MAX_CONCURRENT_GIT_READS = 8;

/** How long the same read-only command fails fast after it timed out, instead of waiting out the timeout again. */
const GIT_READ_TIMEOUT_COOLDOWN_MS = 10_000;

/** Git subcommands that only read, so identical concurrent calls can share one process. */
const READ_ONLY_GIT_SUBCOMMANDS = new Set(['status', 'rev-parse', 'show-ref', 'for-each-ref', 'merge-base', 'rev-list', 'ls-files', 'diff', 'show', 'cat-file', 'ls-tree', 'log']);

/** Beyond this many changed paths, stat-ing them costs about as much as the diff the fingerprint would save. */
const MAX_FINGERPRINTED_CHANGED_PATHS = 2000;

/**
 * An empty `process` driver turns off the `smudge` and `clean` commands too,
 * and an optional filter lets git skip it rather than fail.
 */
const GIT_LFS_DISABLED_CONFIG = ['-c', 'filter.lfs.process=', '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.required=false'];

/** Another git process holds `index.lock` only briefly, so an index refresh retries a few times. */
const INDEX_REFRESH_MAX_ATTEMPTS = 5;
const INDEX_REFRESH_RETRY_DELAY_MS = 200;

export class AgentHostGitService extends Disposable implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	/** The timeout of the git commands that don't set their own; tests shorten it to observe it quickly. */
	protected readonly _defaultTimeoutMs: number = GIT_COMMAND_TIMEOUT_MS;

	/**
	 * A cache of repository roots and confirmed non-repositories.
	 */
	private readonly _repositoryRoots = observableValueOpts({ owner: this, equalsFn: () => false }, new LRUCache<string, URI | undefined>(100));
	private readonly _pendingRepositoryRoots = new Map<string, Promise<URI | undefined>>();
	private readonly _indexPaths = new LRUCache<string, string>(100);
	private readonly _pendingBranches = new Map<string, Promise<Branch | undefined>>();
	private readonly _gitReadLimiter = this._register(new Limiter<string | undefined>(MAX_CONCURRENT_GIT_READS));
	private readonly _pendingGitReads = new Map<string, Map<string, Promise<string | undefined>>>();
	private readonly _timedOutGitReads = new Map<string, number>();
	private readonly _coalesceReadsTrigger: AgentHostSettingExperimentTrigger;
	private readonly _readTelemetry: AgentHostGitReadTelemetry;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();
		this._coalesceReadsTrigger = this._register(new AgentHostSettingExperimentTrigger(AgentHostGitCoalesceReadsSettingId, _configurationService, telemetryService));
		this._readTelemetry = this._register(new AgentHostGitReadTelemetry(telemetryService));
	}

	async getCurrentBranch(workingDirectory: URI): Promise<string | undefined> {
		return (await this._runGit(workingDirectory, ['branch', '--show-current']))?.trim()
			|| (await this._runGit(workingDirectory, ['rev-parse', '--short', 'HEAD']))?.trim()
			|| undefined;
	}

	async getHEAD(workingDirectory: URI, options?: { readonly nameOnly?: boolean }): Promise<IBranch | IDetachedHead | undefined> {
		const headRef = await this._runGit(workingDirectory, ['symbolic-ref', 'HEAD']);
		if (headRef) {
			const ref = headRef.trim();
			if (options?.nameOnly && ref.startsWith('refs/heads/')) {
				return { kind: GitRefType.Head, ref, name: ref.substring('refs/heads/'.length) };
			}
			const branch = await this.getBranch(workingDirectory, ref);
			return branch?.kind === GitRefType.Head ? branch : undefined;
		}

		// Detached HEAD
		const result = await this._runGit(workingDirectory, ['rev-parse', 'HEAD']);
		return result ? { kind: GitRefType.DetachedHead, name: result.trim() } : undefined;
	}

	async getCurrentBranchName(workingDirectory: URI, options?: { readonly throwOnError?: boolean }): Promise<string | undefined> {
		return (await this._runGit(workingDirectory, ['branch', '--show-current'], options))?.trim() || undefined;
	}

	async getDefaultBranch(workingDirectory: URI): Promise<IDefaultBranch | undefined> {
		// Try to read the default branch from the remote HEAD reference
		const remoteRef = (await this._runGit(workingDirectory, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']))?.trim();
		if (remoteRef) {
			if (!remoteRef.startsWith('refs/remotes/origin/')) {
				return { name: remoteRef, startPoint: remoteRef };
			}

			const branch = remoteRef.substring('refs/remotes/origin/'.length);
			// Retain the remote-tracking ref for consumers of the default branch's
			// start point (e.g. the diff base); worktrees use the selected ref.
			const hasRemoteRef = (await this._runGit(workingDirectory, ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`])) !== undefined;
			if (hasRemoteRef) {
				return { name: branch, startPoint: `origin/${branch}` };
			}
			const hasLocalBranch = (await this._runGit(workingDirectory, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])) !== undefined;
			return hasLocalBranch ? { name: branch, startPoint: branch } : undefined;
		}
		return undefined;
	}

	async getDefaultBranch2(workingDirectory: URI, remote?: string): Promise<Branch | undefined> {
		const originHead = !remote ? this._runGit(workingDirectory, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']).catch(() => undefined) : undefined;
		if (!remote) {
			const remotes = await this.getFetchRemotes(workingDirectory) ?? [];
			if (remotes.length === 0) {
				return undefined;
			}

			// Prefer `origin` if present, otherwise pick the first remote name.
			remote = remotes.find(remoteEntry => remoteEntry.name === 'origin')?.name ?? remotes[0].name;
		}

		const defaultBranchRef = remote === 'origin' && originHead
			? await originHead
			: await this._runGit(workingDirectory, ['symbolic-ref', '--quiet', `refs/remotes/${remote}/HEAD`]);
		if (!defaultBranchRef) {
			return undefined;
		}

		const remotePrefix = `refs/remotes/${remote}/`;
		const defaultBranchRefName = defaultBranchRef.trim();
		if (!defaultBranchRefName.startsWith(remotePrefix)) {
			return undefined;
		}

		const defaultBranchName = defaultBranchRefName.substring(remotePrefix.length);
		const localBranch = await this.getBranch(workingDirectory, defaultBranchName);
		if (localBranch?.kind === GitRefType.Head) {
			return localBranch;
		}

		const remoteBranch = await this.getBranch(workingDirectory, defaultBranchRefName);
		return remoteBranch?.kind === GitRefType.RemoteHead ? remoteBranch : undefined;
	}

	async getRefs(workingDirectory: URI, query?: IRefQuery): Promise<GitRef[]> {
		const args = ['for-each-ref', '--format=%(refname)%00%(upstream)'];

		if (query?.sort && query.sort !== 'alphabetically') {
			args.push('--sort', `-${query.sort}`);
		}

		if (query?.count) {
			args.push(`--count=${query.count}`);
		}

		if (query?.pattern) {
			const patterns = Array.isArray(query.pattern) ? query.pattern : [query.pattern];
			for (const pattern of patterns) {
				args.push(pattern.startsWith('refs/') ? pattern : `refs/${pattern}`);
			}
		}

		const output = await this._runGit(workingDirectory, args, { timeout: GET_REFS_TIMEOUT_MS });
		return parseGitRefs(output);
	}

	async getBranches(workingDirectory: URI, query?: IRefQuery): Promise<Branch[]> {
		const refs = await this.getRefs(workingDirectory, query);
		return refs.filter(r => r.kind === GitRefType.Head || r.kind === GitRefType.RemoteHead);
	}

	getBranch(workingDirectory: URI, name: string): Promise<Branch | undefined> {
		const key = JSON.stringify([extUriBiasedIgnorePathCase.getComparisonKey(workingDirectory), name]);
		let pending = this._pendingBranches.get(key);
		if (!pending) {
			pending = this._readBranch(workingDirectory, name).finally(() => this._pendingBranches.delete(key));
			this._pendingBranches.set(key, pending);
		}
		return pending;
	}

	private async _readBranch(workingDirectory: URI, name: string): Promise<Branch | undefined> {
		const branchRefs = name.startsWith('refs/')
			? [name]
			: [`refs/heads/${name}`, `refs/remotes/${name}`];
		const branches = await this.getBranches(workingDirectory, { pattern: branchRefs });
		const branch = branchRefs
			.map(ref => branches.find(branch => branch.ref === ref))
			.find(branch => branch !== undefined);
		if (branch?.kind !== GitRefType.RemoteHead) {
			return branch;
		}

		const remotes = (await this._runGit(workingDirectory, ['remote']))
			?.split(/\r?\n/)
			.map(remote => remote.trim())
			.filter(remote => remote.length > 0)
			.sort((a, b) => b.length - a.length);
		const remote = remotes?.find(remote => branch.name.startsWith(`${remote}/`));
		return remote ? { ...branch, remote } : branch;
	}

	hasGitRoot(workingDirectory: URI): IObservable<boolean | undefined> {
		const key = extUriBiasedIgnorePathCase.getComparisonKey(workingDirectory);
		return derived(this, reader => {
			const roots = this._repositoryRoots.read(reader);
			if (roots.has(key)) {
				return roots.peek(key) !== undefined;
			}
			for (const root of roots.values()) {
				if (root && extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, root)) {
					return true;
				}
			}
			return undefined;
		});
	}

	private _cacheRepositoryRoot(key: string, root: URI | undefined): void {
		const roots = this._repositoryRoots.get();
		if (roots.has(key) && roots.peek(key) === root) {
			return;
		}
		roots.set(key, root);
		if (root) {
			roots.set(extUriBiasedIgnorePathCase.getComparisonKey(root), root);
		}
		this._repositoryRoots.set(roots, undefined);
	}

	/**
	 * Forgets the cached repository roots of a removed worktree, so lookups stop resolving to a checkout that is gone.
	 * Entries cached under the worktree's canonical path, which git reports as the root, are forgotten too.
	 */
	private async _forgetRepositoryRoots(worktree: URI): Promise<void> {
		const removedRoots = [worktree, await this._canonicalizeWorktreePath(worktree)];
		const roots = this._repositoryRoots.get();
		const cachedRoot = roots.peek(extUriBiasedIgnorePathCase.getComparisonKey(worktree));
		if (cachedRoot) {
			removedRoots.push(cachedRoot);
		}
		const isRemoved = (resource: URI) => removedRoots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(resource, root));
		// Collect the keys first: the cache throws when it is modified during iteration.
		const keys = [...roots].filter(([key, root]) => isRemoved(URI.parse(key)) || (root !== undefined && isRemoved(root))).map(([key]) => key);
		if (keys.length === 0) {
			return;
		}
		for (const key of keys) {
			roots.delete(key);
		}
		this._repositoryRoots.set(roots, undefined);
	}

	async getRepositoryRoot(workingDirectory: URI, options?: { readonly refreshIfNone?: boolean }): Promise<URI | undefined> {
		if (workingDirectory.scheme !== Schemas.file) {
			return undefined;
		}

		const workingDirectoryKey = extUriBiasedIgnorePathCase.getComparisonKey(workingDirectory);

		const pending = this._pendingRepositoryRoots.get(workingDirectoryKey);
		if (pending) {
			return pending;
		}

		const roots = this._repositoryRoots.get();
		if (roots.has(workingDirectoryKey)) {
			const repositoryRoot = roots.get(workingDirectoryKey);
			if (repositoryRoot || !options?.refreshIfNone) {
				return repositoryRoot;
			}
		}

		const request = this._readRepositoryRoot(workingDirectory, workingDirectoryKey)
			.finally(() => this._pendingRepositoryRoots.delete(workingDirectoryKey));
		this._pendingRepositoryRoots.set(workingDirectoryKey, request);
		return request;
	}

	private async _readRepositoryRoot(workingDirectory: URI, workingDirectoryKey: string): Promise<URI | undefined> {
		const roots = this._repositoryRoots.get();
		if (await this._isMissingDirectory(workingDirectory.fsPath)) {
			this._logService.trace(`[agentHostGitService] Skipping repository root lookup for missing directory ${workingDirectory.fsPath}`);
			return undefined;
		}

		try {
			const repositoryRootPath = (await this._runGit(workingDirectory, ['rev-parse', '--show-toplevel'], { throwOnError: true, env: { LC_ALL: 'C' } }))?.trim();
			if (repositoryRootPath) {
				const repositoryRoot = URI.file(repositoryRootPath);
				this._cacheRepositoryRoot(workingDirectoryKey, repositoryRoot);
				return repositoryRoot;
			}
			throw new Error('Git repository root lookup returned no path');
		} catch (error) {
			if (error instanceof GitCommandError && /^fatal: (?:not a git repository\b|this operation must be run in a work tree\b)/m.test(error.stderr)) {
				if (!roots.peek(workingDirectoryKey)) {
					this._cacheRepositoryRoot(workingDirectoryKey, undefined);
				}
			} else {
				if (roots.has(workingDirectoryKey) && !roots.peek(workingDirectoryKey)) {
					roots.delete(workingDirectoryKey);
					this._repositoryRoots.set(roots, undefined);
				}
				if (isSpawnEnoentError(error) && await this._isMissingDirectory(workingDirectory.fsPath)) {
					this._logService.trace(`[agentHostGitService] Directory ${workingDirectory.fsPath} disappeared during repository root lookup`);
				} else {
					this._logService.warn(`[agentHostGitService] Failed to resolve repository root for ${workingDirectory.fsPath}`, error);
				}
			}
		}

		return undefined;
	}

	async getWorktreeRoots(workingDirectory: URI): Promise<URI[]> {
		return parseGitWorktrees(await this._runGit(workingDirectory, ['worktree', 'list', '--porcelain', '-z']) ?? '').map(worktree => worktree.path);
	}

	async getWorktrees(workingDirectory: URI): Promise<IAgentHostGitWorktree[]> {
		return parseGitWorktrees(await this._runGit(workingDirectory, ['worktree', 'list', '--porcelain', '-z'], { throwOnError: true }) ?? '');
	}

	async addWorktree(repositoryRoot: URI, options: IAddWorktreeOptions): Promise<IAddWorktreeResult> {
		const getArgs = (newBranchOption: '-b' | '-B') => {
			const args = ['-c', 'checkout.workers=0', 'worktree', 'add'];

			if (options.newBranchName) {
				if (!options.track) {
					// Pass --no-track so the new agent branch never picks up upstream
					// tracking from the start point (e.g. when starting from
					// 'origin/main', without --no-track git would set the new branch's
					// upstream to origin/main, which would mis-attribute pushes/pulls).
					args.push('--no-track');
				}

				args.push(newBranchOption, options.newBranchName);
			}

			// `--` ends the options: neither the path nor the commit-ish can be read as one.
			args.push('--', options.path.fsPath, options.commitish);
			return args;
		};

		// `git worktree add` forces progress reporting on its internal checkout
		// even when stderr is a pipe, so `Updating files: N% (x/y)` can be
		// parsed for live feedback. GIT_PROGRESS_DELAY=0 lifts git's default
		// two-second suppression so the first sample arrives immediately.
		const progressParser = options.onProgress ? new GitCheckoutProgressParser(options.onProgress) : undefined;

		// Git creates the new branch before the checkout and keeps it when the
		// checkout fails, so a retry resets that branch rather than creating it.
		return this._runWorktreeAdd(repositoryRoot, options.path, getArgs('-b'), getArgs('-B'), {
			timeout: 180_000,
			throwOnError: true,
			...(progressParser ? { env: { GIT_PROGRESS_DELAY: '0' }, onStderr: chunk => progressParser.push(chunk) } : {}),
		});
	}

	/**
	 * Runs `git worktree add`, replacing a failure with a well-known cause by a
	 * {@link WorktreeAddError}. When `git-lfs` is missing, it checks Git LFS
	 * files out as their pointer files instead of failing.
	 */
	private async _runWorktreeAdd(repositoryRoot: URI, worktree: URI, args: readonly string[], retryArgs: readonly string[], options: IRunGitOptions): Promise<IAddWorktreeResult> {
		// The C locale keeps git's messages in English, which the failure and progress patterns match.
		options = { ...options, env: { ...options.env, LANG: 'C', LC_ALL: 'C' } };
		try {
			await this._runGit(repositoryRoot, args, options);
			return { gitLfsPointerFiles: false };
		} catch (error) {
			if (!isGitLfsMissingError(error)) {
				throw toWorktreeAddError(error);
			}
			this._logService.warn(`[agentHostGitService] git-lfs is not available, so the worktree '${worktree.fsPath}' keeps Git LFS pointer files`);
			// Git deletes the worktree when its checkout fails, but keeps it when
			// only the post-checkout hook fails, as the one Git LFS installs does.
			if (!await this._isCreatedWorktree(worktree)) {
				try {
					await this._runGit(repositoryRoot, [...GIT_LFS_DISABLED_CONFIG, ...retryArgs], options);
				} catch (retryError) {
					if (!isGitLfsMissingError(retryError) || !await this._isCreatedWorktree(worktree)) {
						throw toWorktreeAddError(retryError);
					}
				}
			}
		}

		await this._refreshPointerFileIndex(worktree);
		return { gitLfsPointerFiles: true };
	}

	/**
	 * Rewrites the index of a worktree with Git LFS pointer files without the
	 * filter, then checks that an ordinary `git status` can read it. Git
	 * rehashes files changed in the same second the index was written ("racily
	 * clean") through the filter, so every later read fails until the index is
	 * rewritten in a later second. `-q` is not passed: it also hides the error
	 * when another git process holds `index.lock`.
	 */
	private async _refreshPointerFileIndex(worktree: URI): Promise<void> {
		const options: IRunGitOptions = { throwOnError: true, env: { LANG: 'C', LC_ALL: 'C' } };
		await timeout(1000 - Date.now() % 1000);
		for (let attempt = 1; ; attempt++) {
			try {
				await this._runGit(worktree, [...GIT_LFS_DISABLED_CONFIG, 'update-index', '--refresh'], options);
				break;
			} catch (error) {
				if (isIndexNeedsUpdateError(error)) {
					break;
				}
				if (attempt === INDEX_REFRESH_MAX_ATTEMPTS || !isGitLockError(error)) {
					throw toWorktreeAddError(error);
				}
				await timeout(INDEX_REFRESH_RETRY_DELAY_MS);
			}
		}
		try {
			await this._runGit(worktree, ['status', '--porcelain', '--untracked-files=no'], options);
		} catch (error) {
			throw toWorktreeAddError(error);
		}
	}

	private _isCreatedWorktree(worktree: URI): Promise<boolean> {
		return this._pathExists(path.join(worktree.fsPath, '.git'));
	}

	async copyWorktreeIncludeFiles(repositoryRoot: URI, worktree: URI, patterns: readonly string[], sessionId: string, onProgress?: (progress: IWorktreeFileProgress) => void, excludedFolders: readonly string[] = []): Promise<void> {
		try {
			const worktreeIncludePaths = await this._getWorktreeIncludePaths(repositoryRoot, worktree, patterns, sessionId, excludedFolders);
			if (worktreeIncludePaths.length === 0) {
				return;
			}

			const startTime = performance.now();
			const limiter = new Limiter<boolean>(15);
			const filesTotal = worktreeIncludePaths.reduce((total, entry) => total + entry.fileCount, 0);
			let filesDone = 0;
			const results = await Promise.allSettled(worktreeIncludePaths.map(entry => limiter.queue(async () => {
				const targetPath = path.join(worktree.fsPath, path.relative(repositoryRoot.fsPath, entry.sourcePath));

				try {
					await fsPromises.lstat(targetPath);
					filesDone += entry.fileCount;
					onProgress?.({ filesDone, filesTotal });
					return false;
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
						throw error;
					}
				}

				await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
				await copyFile(entry.sourcePath, targetPath, { force: true, recursive: true, verbatimSymlinks: true });
				filesDone += entry.fileCount;
				onProgress?.({ filesDone, filesTotal });
				return true;
			})));

			const failedOperations = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
			const copiedEntries = results.filter(result => result.status === 'fulfilled' && result.value).length;
			this._logService.info(`[AgentHostGitService][copyWorktreeIncludeFiles] Copied ${copiedEntries}/${worktreeIncludePaths.length} folder(s)/file(s) to worktree ${worktree.fsPath}. [${(performance.now() - startTime).toFixed(2)}ms]`);

			if (failedOperations.length > 0) {
				this._logService.warn(`[AgentHostGitService][copyWorktreeIncludeFiles] Failed to copy ${failedOperations.length} folder(s)/file(s) to worktree ${worktree.fsPath}.`);
				for (const error of failedOperations) {
					this._logService.warn(`[AgentHostGitService][copyWorktreeIncludeFiles] ${error.reason}`);
				}
			}
		} catch (error) {
			this._logService.warn(`[AgentHostGitService][copyWorktreeIncludeFiles] Failed to copy folder(s)/file(s) to worktree ${worktree.fsPath}: ${error}`);
		}
	}

	async symlinkWorktreeFolders(repositoryRoot: URI, worktree: URI, patterns: readonly string[], sessionId: string): Promise<readonly string[]> {
		try {
			const folders = await this._getWorktreeSymlinkFolders(repositoryRoot, patterns, sessionId);
			if (folders.length === 0) {
				return [];
			}

			const startTime = performance.now();
			const limiter = new Limiter<boolean>(15);
			const results = await Promise.allSettled(folders.map(folder => limiter.queue(() =>
				createWorktreeSymlink(repositoryRoot, worktree, folder))));
			const failedOperations = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
			const symlinkedFolders = results.filter(result => result.status === 'fulfilled' && result.value).length;
			this._logService.info(`[AgentHostGitService][symlinkWorktreeFolders] Symlinked ${symlinkedFolders}/${folders.length} folder(s) to worktree ${worktree.fsPath}. [${(performance.now() - startTime).toFixed(2)}ms]`);

			if (failedOperations.length > 0) {
				this._logService.warn(`[AgentHostGitService][symlinkWorktreeFolders] Failed to symlink ${failedOperations.length} folder(s) to worktree ${worktree.fsPath}.`);
				for (const error of failedOperations) {
					this._logService.warn(`[AgentHostGitService][symlinkWorktreeFolders] ${error.reason}`);
				}
			}
			return folders.filter((_, index) => {
				const result = results[index];
				return result?.status === 'fulfilled' && result.value;
			});
		} catch (error) {
			this._logService.warn(`[AgentHostGitService][symlinkWorktreeFolders] Failed to symlink folders to worktree ${worktree.fsPath}: ${error}`);
			return [];
		}
	}

	async addExistingWorktree(repositoryRoot: URI, worktree: URI, branchName: string): Promise<IAddWorktreeResult> {
		// `-f` (force) so recreation succeeds even when the worktree directory was
		// deleted out-of-band but git still has it registered ("missing but
		// already registered worktree"). This is our own managed per-session
		// worktree/branch, so overriding git's safeguards here is safe.
		const args = ['-c', 'checkout.workers=0', 'worktree', 'add', '-f', '--', worktree.fsPath, branchName];
		return this._runWorktreeAdd(repositoryRoot, worktree, args, args, { timeout: 180_000, throwOnError: true });
	}

	/**
	 * Removes a session's git worktree, tolerating the teardown race where a
	 * concurrent git process is still running inside it.
	 *
	 * `git worktree remove` deletes the working tree and then the admin directory
	 * `.git/worktrees/<id>`. If another git process (our own status/diff probes,
	 * or the agent's own git) re-created `index.lock` there, that last step fails
	 * with "Directory not empty". And `git worktree prune` — which we use to
	 * finish a partially-removed worktree — can even exit 0 while failing to
	 * delete that directory, so a zero exit is not proof of success.
	 *
	 * Example the loop below handles:
	 * ```
	 *   attempt 1  `remove` deletes the tree, then can't rmdir .git/worktrees/<id>
	 *              (a probe's index.lock is still there)                  -> throws
	 *   wait ~100ms  the probe finishes and releases its lock
	 *   attempt 2  tree already gone -> `prune` clears the stale entry
	 *              -> verified de-registered                              -> done
	 * ```
	 *
	 * So we: retry with a capped exponential backoff to let the racing process
	 * finish; switch to `prune` once the working tree is already gone; only retry
	 * transient lock / "directory not empty" failures (a dirty-tree "use --force"
	 * still fails fast); finish forced removal directly when git no longer tracks
	 * a residual directory; and verify the worktree is truly de-registered before
	 * returning, so a silent `prune` no-op cannot mask a leaked entry.
	 */
	async removeWorktree(repositoryRoot: URI, worktree: URI, options?: { readonly force?: boolean; readonly discardChanges?: boolean }): Promise<void> {
		if (options?.discardChanges && !options.force) {
			throw new Error('Discarding worktree changes requires forced removal.');
		}
		if (options?.force && !options.discardChanges && await this._pathExists(worktree.fsPath) && await this.isWorktreeRegistered(repositoryRoot, worktree)) {
			if (!await this._pathExists(path.join(worktree.fsPath, '.git'))) {
				throw new Error(`Cannot preserve registered worktree '${worktree.fsPath}': its .git file is missing`);
			}
			// Preserve non-ignored work in the shared object store without changing the checkout's index or branch.
			const tree = await this.captureWorkingTreeAsTree(worktree);
			if (!tree) {
				throw new Error(`Cannot preserve worktree '${worktree.fsPath}' before removal`);
			}
			if (tree !== await this.revParse(worktree, 'HEAD^{tree}')) {
				const parent = await this.revParse(worktree, 'HEAD');
				const message = `Preserving worktree before removal: ${worktree.fsPath}`;
				let commit: string | undefined;
				try {
					commit = await this.commitTree(worktree, tree, parent, message);
				} catch (error) {
					// For example, the repository has no user identity configured.
					this._logService.info(`[agentHostGitService] Retrying preservation commit for '${worktree.fsPath}' with the internal identity: ${error instanceof Error ? error.message : String(error)}`);
					commit = await this.commitTree(worktree, tree, parent, message, { useInternalIdentity: true });
				}
				if (!commit) {
					throw new Error(`Cannot create preservation commit for '${worktree.fsPath}'`);
				}
				const ref = `refs/vscode-preserved-worktrees/${generateUuid()}`;
				await this.updateRef(repositoryRoot, ref, commit);
				this._logService.warn(`[agentHostGitService] Preserved worktree '${worktree.fsPath}' at '${ref}'. Recover with: git branch recovered-worktree ${ref}`);
			}
		}
		const removeArgs = ['worktree', 'remove'];
		if (options?.force) {
			removeArgs.push('--force');
		}
		removeArgs.push(worktree.fsPath);

		let lastError: unknown;
		for (let attempt = 0; attempt < WORKTREE_REMOVAL_MAX_ATTEMPTS; attempt++) {
			if (attempt > 0) {
				await timeout(Math.min(WORKTREE_REMOVAL_RETRY_MAX_DELAY_MS, WORKTREE_REMOVAL_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
			}
			let gitCommandSucceeded = false;
			try {
				if (await this._pathExists(worktree.fsPath) && !(options?.force && !await this._pathExists(path.join(worktree.fsPath, '.git')))) {
					await this._runGit(repositoryRoot, removeArgs, { timeout: 60_000, throwOnError: true });
				} else {
					// The checkout or its .git file is gone: prune, then verify Git released the exact path before removing residue.
					await this._runGit(repositoryRoot, ['worktree', 'prune'], { timeout: 60_000, throwOnError: true });
				}
				gitCommandSucceeded = true;
			} catch (error) {
				lastError = error;
				if (!isRetryableWorktreeRemovalError(error)) {
					if (!await this.isWorktreeRegistered(repositoryRoot, worktree)) {
						await this._removeResidualWorktreeDirectory(repositoryRoot, worktree, options?.force === true);
						await this._forgetRepositoryRoots(worktree);
						return;
					}
					throw error;
				}
			}
			// A zero exit is not proof of success (see the doc above), so confirm de-registration.
			if (!await this.isWorktreeRegistered(repositoryRoot, worktree)) {
				await this._removeResidualWorktreeDirectory(repositoryRoot, worktree, options?.force === true);
				await this._forgetRepositoryRoots(worktree);
				return;
			}
			if (gitCommandSucceeded) {
				lastError = new Error(`git worktree removal left '${worktree.fsPath}' registered (admin directory not deleted)`);
			}
			if (attempt < WORKTREE_REMOVAL_MAX_ATTEMPTS - 1) {
				this._logService.warn(`[agentHostGitService] worktree removal attempt ${attempt + 1}/${WORKTREE_REMOVAL_MAX_ATTEMPTS} did not complete for '${worktree.fsPath}', retrying: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
			}
		}
		throw lastError;
	}

	private async _removeResidualWorktreeDirectory(repositoryRoot: URI, worktree: URI, force: boolean): Promise<void> {
		if (!await this._pathExists(worktree.fsPath)) {
			return;
		}
		if (!force) {
			throw new Error(`Worktree '${worktree.fsPath}' is de-registered, but its directory remains and cannot be removed without force`);
		}
		const stat = await fsPromises.lstat(worktree.fsPath);
		const root = await this._canonicalizeWorktreePath(repositoryRoot);
		const target = await this._canonicalizeWorktreePath(worktree);
		if (!stat.isDirectory() || stat.isSymbolicLink() || extUriBiasedIgnorePathCase.isEqualOrParent(root, target)) {
			throw new Error(`Refusing to remove unsafe worktree residue '${worktree.fsPath}'`);
		}

		await fsPromises.rm(worktree.fsPath, {
			recursive: true,
			force: true,
			maxRetries: WORKTREE_REMOVAL_MAX_ATTEMPTS,
			retryDelay: WORKTREE_REMOVAL_RETRY_BASE_DELAY_MS,
		});
	}

	/**
	 * Whether `fsPath` is definitely not a directory: it does not exist, a parent is not a directory, or it is a file.
	 * Other `stat` failures (e.g. `EACCES`) are not treated as missing, so git still runs and reports them.
	 */
	private async _isMissingDirectory(fsPath: string): Promise<boolean> {
		try {
			return !(await fsPromises.stat(fsPath)).isDirectory();
		} catch (error) {
			const code = (error as NodeJS.ErrnoException)?.code;
			return code === 'ENOENT' || code === 'ENOTDIR';
		}
	}

	private async _pathExists(fsPath: string): Promise<boolean> {
		try {
			await fsPromises.access(fsPath);
			return true;
		} catch (error) {
			// Only a definitive "not found" means the path is gone. Treat any
			// other error (e.g. EACCES/EPERM) as "exists" so we don't wrongly
			// take the prune path for a still-present worktree.
			return (error as NodeJS.ErrnoException)?.code !== 'ENOENT';
		}
	}

	/**
	 * Whether `worktree` is still registered with git (its admin entry survives).
	 * Fails closed (returns `true`) if the registry cannot be read, so an unrelated
	 * `git worktree list` failure is never mistaken for a completed removal.
	 */
	async isWorktreeRegistered(repositoryRoot: URI, worktree: URI): Promise<boolean> {
		let registered: URI[];
		try {
			registered = (await this.getWorktrees(repositoryRoot)).map(worktree => worktree.path);
		} catch {
			return true;
		}
		if (registered.length === 0) {
			return false;
		}
		const target = await this._canonicalizeWorktreePath(worktree);
		// Check every registered worktree in parallel and resolve as soon as one matches.
		const matched = await firstParallel(
			registered.map(async entry =>
				extUriBiasedIgnorePathCase.isEqual(entry, worktree)
				|| extUriBiasedIgnorePathCase.isEqual(await this._canonicalizeWorktreePath(entry), target)),
			isMatch => isMatch,
			false,
		);
		return matched ?? false;
	}

	/**
	 * Resolves symlinks on the worktree's parent (which persists even after the
	 * worktree directory itself is deleted) so a path we passed to git (e.g.
	 * `/var/...`) matches the realpath'd form git reports (`/private/var/...`).
	 */
	private async _canonicalizeWorktreePath(worktree: URI): Promise<URI> {
		try {
			const parentReal = await fsPromises.realpath(path.dirname(worktree.fsPath));
			return URI.file(path.join(parentReal, path.basename(worktree.fsPath)));
		} catch {
			return worktree;
		}
	}

	async branchExists(repositoryRoot: URI, branchName: string): Promise<boolean> {
		// `show-ref --verify --quiet` exits 0 when the ref exists and 1 otherwise.
		// `_runGit` returns undefined on non-zero exit, so `!== undefined` is the existence signal.
		const output = await this._runGit(repositoryRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);
		return output !== undefined;
	}

	async createBranch(workingDirectory: URI, branchName: string, options?: { readonly checkout?: boolean }): Promise<void> {
		const args = options?.checkout
			? ['checkout', '-q', '-b', branchName, '--no-track']
			: ['branch', '-q', branchName];

		await this._runGit(workingDirectory, args, { throwOnError: true });
	}

	async checkout(workingDirectory: URI, treeish: string): Promise<void> {
		try {
			await this._runGit(workingDirectory, ['checkout', '-q', treeish], {
				throwOnError: true,
				env: { LANG: 'C', LC_ALL: 'C' },
			});
		} catch (error) {
			if (error instanceof GitCommandError && isCheckoutBlockedByLocalChanges(error.stderr)) {
				throw new CheckoutBlockedByLocalChangesError(error.message, { cause: error });
			}
			throw error;
		}
	}

	async hasUncommittedChanges(workingDirectory: URI): Promise<boolean> {
		const output = await this._runGitStatus(workingDirectory, ['--porcelain'], false);
		return !!output && output.trim().length > 0;
	}

	async createStash(workingDirectory: URI, options?: { readonly message?: string; readonly includeUntracked?: boolean; readonly staged?: boolean }): Promise<void> {
		const args = ['stash', 'push'];

		if (options?.includeUntracked) {
			args.push('-u');
		}

		if (options?.staged) {
			args.push('-S');
		}

		if (options?.message) {
			args.push('-m', options.message);
		}

		await this._runGit(workingDirectory, args, { timeout: 60_000, throwOnError: true });
	}

	async commitAll(workingDirectory: URI, message: string): Promise<void> {
		await this._runGit(workingDirectory, ['add', '-A', '--', ':/'], { throwOnError: true });
		await this._runGit(workingDirectory, ['commit', '--no-verify', '-m', message], { timeout: 60_000, throwOnError: true });
	}

	async commit(workingDirectory: URI, message: string, options?: ICommitOptions): Promise<void> {
		if (options?.all) {
			await this._runGit(workingDirectory, ['add', options.all === 'tracked' ? '-u' : '-A', '--', ':/'], { throwOnError: true });
		}

		const args = ['commit'];

		if (options?.noVerify) {
			args.push('--no-verify');
		}

		if (options?.signCommit !== undefined) {
			args.push(options.signCommit ? '-S' : '--no-gpg-sign');
		}

		args.push('-m', message);
		await this._runGit(workingDirectory, args, { timeout: 60_000, throwOnError: true });
	}

	async mergeBranch(workingDirectory: URI, branchName: string): Promise<string> {
		const existingMergeHead = await this._runGit(workingDirectory, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']);
		if (existingMergeHead) {
			throw new Error(`Cannot merge '${branchName}' because another merge is already in progress.`);
		}
		try {
			return (await this._runGit(workingDirectory, ['merge', '--no-edit', '--', branchName], { timeout: 60_000, throwOnError: true }))?.trim() ?? '';
		} catch (error) {
			const mergeHead = await this._runGit(workingDirectory, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']);
			if (mergeHead) {
				try {
					await this._runGit(workingDirectory, ['merge', '--abort'], { timeout: 60_000, throwOnError: true });
				} catch (abortError) {
					const mergeMessage = error instanceof Error ? error.message : String(error);
					const abortMessage = abortError instanceof Error ? abortError.message : String(abortError);
					throw new Error(`Merge failed and could not be aborted: ${mergeMessage}; ${abortMessage}`, { cause: error });
				}
			}
			throw error;
		}
	}

	async restore(workingDirectory: URI, paths: readonly string[], options?: { readonly staged?: boolean; readonly ref?: string }): Promise<void> {
		const args = ['restore'];

		if (options?.staged) {
			args.push('--staged');
		}

		if (options?.ref) {
			args.push('--source', options.ref);
		}

		if (paths.length === 0) {
			paths = ['.'];
		}

		await this._runGit(workingDirectory, [...args, '--', ...paths], { throwOnError: true });
	}

	async hasUpstream(workingDirectory: URI, branchName: string): Promise<boolean> {
		const output = await this._runGit(workingDirectory, ['rev-parse', '--abbrev-ref', `${branchName}@{upstream}`]);
		return output !== undefined && output.trim().length > 0;
	}

	async fetch(workingDirectory: URI, branch: IRemoteBranch, options?: { readonly timeout?: number }): Promise<void> {
		const branchName = branch.name.substring(branch.remote.length + 1);
		const refspec = `+refs/heads/${branchName}:${branch.ref}`;
		await this._runGit(workingDirectory, ['fetch', branch.remote, refspec], { timeout: options?.timeout, throwOnError: true });
	}

	async pull(workingDirectory: URI, options?: IPullOptions): Promise<void> {
		const args = ['pull'];

		if (options?.rebase) {
			args.push('-r');
		}

		// A ref can only be passed alongside a
		// remote; default to `origin` when a ref
		// is given without one.
		if (options?.remote || options?.ref) {
			args.push(options.remote ?? 'origin');

			if (options.ref) {
				args.push(options.ref);
			}
		}

		await this._runGit(workingDirectory, args, { timeout: 180_000, throwOnError: true });
	}

	async push(workingDirectory: URI, options?: IPushOptions): Promise<void> {
		const args = ['push'];

		if (options?.setUpstream) {
			args.push('--set-upstream');
		}

		// A ref can only be passed alongside a
		// remote; resolve the branch's default
		// push remote when a ref is given without one.
		if (options?.remote || options?.ref) {
			args.push(options.remote ?? await this._resolveDefaultPushRemote(workingDirectory, options.ref) ?? 'origin');

			if (options.ref) {
				args.push(options.ref);
			}
		}

		await this._runGit(workingDirectory, args, { timeout: 180_000, throwOnError: true });
	}

	private async _resolveDefaultPushRemote(workingDirectory: URI, ref: string | undefined): Promise<string | undefined> {
		const branchName = ref?.split(':')[0];
		const [configuredPushRemote, remotesOutput] = await Promise.all([
			branchName ? this._getPushRemote(workingDirectory, branchName) : undefined,
			this._runGit(workingDirectory, ['remote', '-v']),
		]);
		return selectDefaultPushRemote(remotesOutput, configuredPushRemote);
	}

	async computeSessionFileDiffs(workingDirectory: URI, options: IComputeSessionFileDiffsOptions): Promise<readonly ISessionFileDiff[] | undefined> {
		// All git invocations run from the working tree's repository root so
		// `--raw` paths are repo-relative — that's what `git show <sha>:<path>`
		// expects when we resolve `git-blob:` URIs later.
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		// A fingerprint taken moments before already holds the merge base and status.
		const fingerprinted = readBranchDiffFingerprint(options.fingerprint, options.baseBranch);

		// Resolve the merge-base commit the Branch Changes diff is anchored on.
		const mergeBaseCommit = fingerprinted?.mergeBaseCommit ?? await this._resolveBranchMergeBaseCommit(repositoryRoot, options.baseBranch);

		return this._computeWorkingTreeDiffs(repositoryRoot, mergeBaseCommit, options.sessionUri, fingerprinted?.statusOutput);
	}

	private async _computeWorkingTreeDiffs(repositoryRoot: URI, baseCommit: string, sessionUri: string, knownStatusOutput?: string): Promise<ISessionFileDiff[] | undefined> {
		// Detect whether the working tree has any untracked files. If so we
		// have to use the temp-index trick so the untracked content is
		// included in `--cached --raw` output; otherwise a plain `git diff`
		// is sufficient and avoids the temp-dir overhead.
		const statusOut = knownStatusOutput ?? await this._runGitStatus(repositoryRoot, ['--porcelain=v1', '-z', '--untracked-files=all']);
		if (statusOut === undefined) {
			return undefined;
		}
		const hasUntracked = parseUntrackedPaths(statusOut).length > 0;

		let rawDiffOutput: string | undefined;
		if (!hasUntracked) {
			rawDiffOutput = await this._runGit(repositoryRoot, ['diff', '--raw', '--numstat', '--diff-filter=ADMR', '-z', baseCommit, '--']);
		} else {
			const changedPaths = parseChangedPaths(statusOut);
			rawDiffOutput = await this._runWithTempIndex(repositoryRoot, baseCommit, changedPaths);
		}

		if (rawDiffOutput === undefined) {
			return undefined;
		}

		const diffs = parseGitDiffRawNumstat(rawDiffOutput, repositoryRoot, sessionUri, baseCommit);
		const submodules = await this._getSubmodules(repositoryRoot);
		if (!submodules.length) {
			return diffs;
		}

		// Git reports a changed submodule as a single entry, if at all, so
		// list the files changed inside each changed submodule instead.
		const changedPaths = new Set(parseChangedPaths(statusOut));
		const diffUris = new Set(diffs.map(diff => diff.after?.uri ?? diff.before?.uri));
		const expanded = (await Promise.all(submodules.map(async submodule => {
			if (!changedPaths.has(submodule.path) && !diffUris.has(submodule.root.toString())) {
				return undefined;
			}
			// A submodule that is new since the base commit stays a single entry.
			const submoduleBaseCommit = await this.revParse(repositoryRoot, `${baseCommit}:${submodule.path}`);
			const submoduleDiffs = submoduleBaseCommit && await this._computeWorkingTreeDiffs(submodule.root, submoduleBaseCommit, sessionUri);
			return submoduleDiffs ? { uri: submodule.root.toString(), diffs: submoduleDiffs } : undefined;
		}))).filter(isDefined);
		const expandedUris = new Set(expanded.map(submodule => submodule.uri));
		return [
			...diffs.filter(diff => !expandedUris.has(diff.after?.uri ?? diff.before?.uri ?? '')),
			...expanded.flatMap(submodule => submodule.diffs),
		];
	}

	/**
	 * Returns the submodules that the repository's `.gitmodules` registers
	 * inside it and that are checked out, in the order it registers them.
	 */
	private async _getSubmodules(repositoryRoot: URI): Promise<{ readonly path: string; readonly root: URI }[]> {
		try {
			await fsPromises.access(path.join(repositoryRoot.fsPath, '.gitmodules'));
		} catch {
			return [];
		}
		// Each `-z` entry is the key and the value, separated by a newline.
		const output = await this._runGit(repositoryRoot, ['config', '-z', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$']);
		const submodules = (output?.split('\x00') ?? [])
			.map(entry => entry.substring(entry.indexOf('\n') + 1))
			.filter(Boolean)
			.map(submodulePath => ({ path: submodulePath, root: URI.joinPath(repositoryRoot, submodulePath) }))
			.filter(submodule => extUriBiasedIgnorePathCase.isEqualOrParent(submodule.root, repositoryRoot) && !extUriBiasedIgnorePathCase.isEqual(submodule.root, repositoryRoot));
		// The folder of a submodule that isn't checked out has no `.git` and belongs to the repository itself.
		// Git doesn't check out a submodule through a symlink, so a registered path that resolves anywhere
		// but its place inside the repository isn't one of its submodules.
		let realRepositoryRoot: URI;
		try {
			realRepositoryRoot = URI.file(await fsPromises.realpath(repositoryRoot.fsPath));
		} catch {
			return [];
		}
		const checkedOut = await Promise.all(submodules.map(async submodule => {
			try {
				const realRoot = await fsPromises.realpath(submodule.root.fsPath);
				await fsPromises.access(path.join(realRoot, '.git'));
				return extUriBiasedIgnorePathCase.isEqual(URI.file(realRoot), URI.joinPath(realRepositoryRoot, submodule.path));
			} catch {
				return false;
			}
		}));
		return submodules.filter((_, index) => checkedOut[index]);
	}

	async getSubmoduleRoot(workingDirectory: URI, resource: URI): Promise<URI | undefined> {
		const file = normalizePath(resource);
		let submoduleRoot: URI | undefined;
		let repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		while (repositoryRoot) {
			const submodule = (await this._getSubmodules(repositoryRoot)).find(({ root }) => extUriBiasedIgnorePathCase.isEqualOrParent(file, root) && !extUriBiasedIgnorePathCase.isEqual(file, root));
			submoduleRoot = submodule?.root ?? submoduleRoot;
			repositoryRoot = submodule?.root;
		}
		return submoduleRoot;
	}

	async resolveBranchBaselineCommit(workingDirectory: URI, baseBranch?: string): Promise<string | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		return this._resolveBranchMergeBaseCommit(repositoryRoot, baseBranch);
	}

	async getBranchDiffFingerprint(workingDirectory: URI, baseBranch?: string): Promise<string | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}
		return this._computeBranchDiffFingerprint(repositoryRoot, baseBranch);
	}

	private async _computeBranchDiffFingerprint(repositoryRoot: URI, baseBranch: string | undefined): Promise<string | undefined> {
		const [mergeBaseCommit, head, statusOut] = await Promise.all([
			this._resolveBranchMergeBaseCommit(repositoryRoot, baseBranch),
			this._runGit(repositoryRoot, ['rev-parse', 'HEAD']),
			this._runGitStatus(repositoryRoot, ['--porcelain=v1', '-z', '--untracked-files=all']),
		]);
		if (statusOut === undefined) {
			return undefined;
		}
		const changedPaths = parseChangedPaths(statusOut);
		if (changedPaths.length > MAX_FINGERPRINTED_CHANGED_PATHS) {
			return undefined;
		}
		const limiter = new Limiter<string>(16);
		try {
			const [files, submodules] = await Promise.all([
				Promise.all(changedPaths.map(changedPath => limiter.queue(async () => {
					try {
						const stat = await fsPromises.lstat(path.join(repositoryRoot.fsPath, changedPath), { bigint: true });
						return `${stat.size}:${stat.mtimeNs}`;
					} catch {
						return 'missing';
					}
				}))),
				this._getSubmodules(repositoryRoot),
			]);
			// Edits inside a submodule leave its entry in the repository's status as it was.
			const submoduleFingerprints = await Promise.all(submodules
				.filter(submodule => changedPaths.includes(submodule.path))
				.map(submodule => this._computeBranchDiffFingerprint(submodule.root, undefined)));
			if (submoduleFingerprints.some(fingerprint => fingerprint === undefined)) {
				return undefined;
			}
			// Read back by `readBranchDiffFingerprint`.
			return JSON.stringify([baseBranch || null, mergeBaseCommit, head?.trim(), statusOut, files, submoduleFingerprints]);
		} finally {
			limiter.dispose();
		}
	}

	async hasUnignoredPaths(workingDirectory: URI, resources: readonly URI[]): Promise<boolean | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot || resources.length === 0) {
			return undefined;
		}
		const gitDirectory = path.join(repositoryRoot.fsPath, '.git');
		const paths = resources.map(resource => resource.fsPath);
		if (paths.some(candidate => candidate === gitDirectory || candidate.startsWith(gitDirectory + path.sep))) {
			return true;
		}
		try {
			// Tracked files are never reported, only untracked ones that an ignore rule covers.
			const ignored = await this._runGit(repositoryRoot, ['check-ignore', '-z', '--stdin'], { throwOnError: true, input: paths.join('\0') + '\0' });
			const ignoredPaths = new Set(ignored?.split('\0').filter(Boolean));
			return paths.some(candidate => !ignoredPaths.has(candidate));
		} catch (error) {
			// Exit status 1 is `check-ignore` saying that no path is ignored.
			return error instanceof GitCommandError && (error.cause as cp.ExecFileException | undefined)?.code === 1 ? true : undefined;
		}
	}

	/**
	 * Resolves the merge-base commit-ish the Branch Changes baseline is anchored
	 * on: the merge-base of `HEAD` and `baseBranch`, used exactly as given.
	 * Without a usable base, falls back to `HEAD` (surfaces uncommitted work but
	 * no committed-on-branch work). For empty repos with no `HEAD`, falls back
	 * to the empty-tree object. Always resolves to a commit-ish (never
	 * `undefined`) once the repository root is known.
	 */
	private async _resolveBranchMergeBaseCommit(repositoryRoot: URI, baseBranch?: string): Promise<string> {
		let mergeBaseCommit: string | undefined;
		if (baseBranch) {
			mergeBaseCommit = (await this._runGit(repositoryRoot, ['merge-base', 'HEAD', baseBranch]))?.trim();
		}
		if (!mergeBaseCommit) {
			mergeBaseCommit = (await this._runGit(repositoryRoot, ['rev-parse', 'HEAD']))?.trim();
		}

		return mergeBaseCommit ?? EMPTY_TREE_OBJECT;
	}

	private async _runWithTempIndex(repositoryRoot: URI, mergeBaseCommit: string, changedPaths: readonly string[]): Promise<string | undefined> {
		// Build a throwaway index so we can stage the changed working tree
		// paths (including untracked files) without disturbing the user's real
		// index. `read-tree HEAD` seeds it; in empty repos that fails so we
		// fall back to the empty tree, leaving everything as "added".
		const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-git-diff-${generateUuid()}`);
		await this._fileService.createFolder(tempDir);
		// `GIT_INDEX_FILE` is consumed by the `git` subprocess so it must be
		// a real OS path string, not a URI.
		const indexFile = URI.joinPath(tempDir, 'index').fsPath;
		const env: Record<string, string> = { GIT_INDEX_FILE: indexFile };
		// GVFS (Virtual File System) repos use a hook that acquires a lock around
		// git commands. Setting COMMAND_HOOK_LOCK=1 prevents the temp-index
		// operations from blocking the main working-tree lock. This mirrors what
		// the extension's `buildTempIndexEnv` does for the same reason.
		env.COMMAND_HOOK_LOCK = '1';
		try {
			const seeded = await this._runGit(repositoryRoot, ['read-tree', 'HEAD'], { env });
			if (seeded === undefined) {
				// Empty repo (no HEAD yet) - `read-tree` of the empty tree always succeeds.
				await this._runGit(repositoryRoot, ['read-tree', EMPTY_TREE_OBJECT], { env });
			}
			if (!(await this._stageChangedPaths(repositoryRoot, tempDir, changedPaths, env))) {
				return undefined;
			}
			return await this._runGit(repositoryRoot, ['diff', '--cached', '--raw', '--numstat', '--diff-filter=ADMR', '-z', mergeBaseCommit, '--'], { env });
		} finally {
			try { await this._fileService.del(tempDir, { recursive: true, useTrash: false }); } catch { /* best-effort */ }
		}
	}

	private async _stageAndWriteTree(repositoryRoot: URI, tempDir: URI, changedPaths: readonly string[], env: Record<string, string>): Promise<string | undefined> {
		if (!(await this._stageChangedPaths(repositoryRoot, tempDir, changedPaths, env))) {
			return undefined;
		}
		return (await this._runGit(repositoryRoot, ['write-tree'], { env }))?.trim() || undefined;
	}

	/**
	 * Resolves the absolute path of the repository's index file, which lives
	 * under `.git/worktrees/<name>/` for linked worktrees.
	 */
	private async _getIndexPath(repositoryRoot: URI): Promise<string | undefined> {
		const key = repositoryRoot.toString();
		const cached = this._indexPaths.get(key);
		if (cached) {
			return cached;
		}
		const indexPath = (await this._runGit(repositoryRoot, ['rev-parse', '--git-path', 'index']))?.trim();
		if (!indexPath) {
			return undefined;
		}
		const absoluteIndexPath = path.isAbsolute(indexPath) ? indexPath : path.join(repositoryRoot.fsPath, indexPath);
		this._indexPaths.set(key, absoluteIndexPath);
		return absoluteIndexPath;
	}

	private async _tryCopyIndex(source: string, target: string): Promise<boolean> {
		try {
			const stat = await fsPromises.stat(source);
			await fsPromises.copyFile(source, target);
			// A newer index timestamp can make Git miss racily clean, same-size working-tree edits.
			await fsPromises.utimes(target, stat.atime, stat.mtime);
			return true;
		} catch (error) {
			this._logService.debug('[agentHostGitService] Copying the index failed; seeding the temp index from HEAD', error);
			return false;
		}
	}

	private async _stageChangedPaths(repositoryRoot: URI, tempDir: URI, changedPaths: readonly string[], env: Record<string, string>): Promise<boolean> {
		if (changedPaths.length === 0) {
			return true;
		}
		const pathspecFile = URI.joinPath(tempDir, 'pathspec');
		// Stage only the paths `git status` reported as changed. The previous
		// full-repo `git add -A -- :/` walked nested repos/worktrees and large
		// checkouts, which made temp-index diffing slow and timeout-prone. A
		// NUL-separated pathspec preserves odd filenames while keeping deletes
		// and rename/copy sources in scope.
		await this._fileService.writeFile(pathspecFile, VSBuffer.fromString(changedPaths.join('\x00') + '\x00'));
		this._logService.debug(`[agentHostGitService] Staging ${changedPaths.length} changed path(s) into temp index`);
		return await this._runGit(repositoryRoot, ['add', '-A', `--pathspec-from-file=${pathspecFile.fsPath}`, '--pathspec-file-nul'], {
			env: { ...env, GIT_LITERAL_PATHSPECS: '1' },
		}) !== undefined;
	}

	/**
	 * Resolves the git-ignored paths to copy into a worktree. `patterns` are
	 * matched by git using `.gitignore` semantics.
	 */
	private async _getWorktreeIncludePaths(repositoryRoot: URI, worktreeRoot: URI, patterns: readonly string[], sessionId: string, excludedFolders: readonly string[]): Promise<IWorktreeIncludeEntry[]> {
		// Each setting entry must stay a single `.gitignore` line; an embedded
		// line break would inject additional patterns (e.g. a `!` negation).
		const includePatterns = sanitizeWorktreePatterns(patterns);
		if (includePatterns.length !== patterns.length) {
			this._logService.warn(`[AgentHostGitService][copyWorktreeIncludeFiles] Ignoring ${patterns.length - includePatterns.length} pattern(s) containing line breaks.`);
		}
		if (includePatterns.length === 0) {
			return [];
		}

		// Git reads the patterns from a file so that they are parsed exactly
		// like a `.gitignore` file (comments, blank lines, trailing spaces).
		const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-worktree-include-${toFileNameSafeSessionId(sessionId)}`);
		const includePatternsFile = URI.joinPath(tempDir, 'patterns');
		await this._fileService.createFolder(tempDir);

		try {
			await this._fileService.writeFile(includePatternsFile, VSBuffer.fromString(includePatterns.join('\n') + '\n'));

			// List the git-ignored (but untracked) files: `--others` selects
			// untracked files, `--ignored` restricts to those matched by an exclude
			// source, and `--exclude-standard` uses the standard sources (.gitignore,
			// .git/info/exclude, core.excludesFile). `-z` NUL-separates entries so
			// paths containing spaces or other special characters survive intact.
			//
			// The `--directory` variant additionally collapses a *wholly*-ignored
			// directory (one containing no tracked files) into a single `dir/`
			// entry. It is enumerated in parallel and used below to copy such
			// directories as one recursive unit rather than file-by-file.
			//
			// The `--exclude-from` variant uses *only* the include patterns as the
			// exclude source (no standard sources), so it lists the untracked files
			// matching `git.worktreeIncludeFiles`. Passing both sources to a single
			// invocation would yield their union, hence the separate call.
			const baseArgs = ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'];
			const [filesOutput, directoryOutput, includedOutput, worktreeOutput] = await Promise.all([
				this._runGit(repositoryRoot, baseArgs, { timeout: 60_000 }),
				this._runGit(repositoryRoot, [...baseArgs, '--directory', '--no-empty-directory'], { timeout: 60_000 }),
				this._runGit(repositoryRoot, ['ls-files', '--others', '--ignored', `--exclude-from=${includePatternsFile.fsPath}`, '-z'], { timeout: 60_000 }),
				this._runGit(worktreeRoot, ['ls-files', '-z'], { timeout: 60_000 }),
			]);
			if (!filesOutput || !includedOutput) {
				return [];
			}

			// git emits repository-relative, forward-slash paths.
			const ignoredFiles = filesOutput.split('\x00').filter(entry => entry.length > 0);
			if (ignoredFiles.length === 0) {
				return [];
			}

			return resolveWorktreeIncludeEntries(repositoryRoot, ignoredFiles, includedOutput, directoryOutput, worktreeOutput, excludedFolders);
		} finally {
			try { await this._fileService.del(tempDir, { recursive: true, useTrash: false }); } catch { /* best-effort */ }
		}
	}

	private async _getWorktreeSymlinkFolders(repositoryRoot: URI, patterns: readonly string[], sessionId: string): Promise<string[]> {
		const symlinkPatterns = sanitizeWorktreePatterns(patterns);
		if (symlinkPatterns.length !== patterns.length) {
			this._logService.warn(`[AgentHostGitService][symlinkWorktreeFolders] Ignoring ${patterns.length - symlinkPatterns.length} pattern(s) containing line breaks.`);
		}
		if (symlinkPatterns.length === 0) {
			return [];
		}

		const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-worktree-symlink-${toFileNameSafeSessionId(sessionId)}`);
		const patternsFile = URI.joinPath(tempDir, 'patterns');
		const matcherRoot = URI.joinPath(tempDir, 'matcher');
		await this._fileService.createFolder(matcherRoot);

		try {
			await this._fileService.writeFile(patternsFile, VSBuffer.fromString(symlinkPatterns.join('\n') + '\n'));

			const baseArgs = ['ls-files', '--others', '--ignored', '-z'];
			const [ignoredOutput, matchedOutput, directoryOutput] = await Promise.all([
				this._runGit(repositoryRoot, [...baseArgs, '--exclude-standard'], { timeout: 60_000 }),
				this._runGit(repositoryRoot, [...baseArgs, `--exclude-from=${patternsFile.fsPath}`], { timeout: 60_000 }),
				this._runGit(repositoryRoot, [...baseArgs, '--exclude-standard', '--directory'], { timeout: 60_000 }),
			]);
			if (ignoredOutput === undefined || matchedOutput === undefined || directoryOutput === undefined) {
				return [];
			}

			const candidates = getWorktreeSymlinkFolderCandidates(ignoredOutput, matchedOutput);
			if (candidates.length === 0) {
				return [];
			}

			if (await this._runGit(matcherRoot, ['init', '--quiet'], { timeout: 60_000 }) === undefined) {
				return [];
			}

			const candidateInput = candidates.map(candidate => `${candidate}/`).join('\0');
			const [ignoredFoldersOutput, matchedFoldersOutput] = await Promise.all([
				this._runGit(repositoryRoot, ['check-ignore', '--no-index', '-z', '--stdin'], { timeout: 60_000, input: candidateInput }),
				this._runGit(matcherRoot, ['-c', `core.excludesFile=${patternsFile.fsPath}`, 'check-ignore', '--no-index', '-z', '--stdin'], { timeout: 60_000, input: candidateInput }),
			]);

			return filterWorktreeSymlinkFolders(candidates, ignoredFoldersOutput ?? '', matchedFoldersOutput ?? '', directoryOutput);
		} finally {
			try { await this._fileService.del(tempDir, { recursive: true, useTrash: false }); } catch { /* best-effort */ }
		}
	}

	async showBlob(workingDirectory: URI, ref: string, repoRelativePath: string): Promise<VSBuffer | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		const args = ['show', `${ref}:${repoRelativePath}`];
		this._logService.trace(`[agentHostGitService] > git ${args.join(' ')}`);

		// Callers only get `undefined`, which surfaces as "git blob not found"
		// whatever actually went wrong, so log the real reason.
		return new Promise((resolve) => {
			cp.execFile('git', args, { cwd: workingDirectory.fsPath, timeout: SHOW_BLOB_TIMEOUT_MS, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
				if (error) {
					// The timeout above is the only thing that kills this process.
					this._logService.warn(`[agentHostGitService] > git ${args.join(' ')} failed: ${formatGitError(args, SHOW_BLOB_TIMEOUT_MS, error.killed === true, error, (stderr as Buffer).toString())}`);
					resolve(undefined);
					return;
				}
				resolve(VSBuffer.wrap(stdout as Buffer));
			});
		});
	}

	async getSessionGitState(workingDirectory: URI, baseBranch?: string): Promise<ISessionGitState | undefined> {
		return this._computeSessionGitState(workingDirectory, baseBranch);
	}

	async resolveBaseBranch(workingDirectory: URI, baseBranch: string): Promise<BaseBranch | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}
		return this._parseBaseBranch(repositoryRoot, baseBranch, await this._runGit(repositoryRoot, ['remote', '-v']));
	}

	async resolveMergeTargetBranch(workingDirectory: URI, baseBranch: BaseBranch): Promise<string | undefined> {
		if (baseBranch.kind === 'local') {
			return baseBranch.branch;
		}
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		return repositoryRoot ? (await this._resolveMergeTarget(repositoryRoot, baseBranch))?.branch : undefined;
	}

	/** Parses a recorded base branch with the remotes `git remote -v` reported; see {@link resolveBaseBranch}. */
	private async _parseBaseBranch(repositoryRoot: URI, baseBranch: string, remotesOutput: string | undefined): Promise<BaseBranch | undefined> {
		const fetchRemotes = parseFetchRemotes(remotesOutput);
		if (!fetchRemotes) {
			// Without the remotes, only the full ref of a local branch says what it is.
			return baseBranch.startsWith('refs/') ? parseBaseBranchRef(baseBranch, []) : undefined;
		}
		const remotes = distinct(fetchRemotes.map(remote => remote.name));
		return parseBaseBranchRef(await this._toBaseBranchRef(repositoryRoot, baseBranch, remotes), remotes);
	}

	/**
	 * Returns the full ref of a recorded base branch. A short name resolves like git resolves it, which prefers a
	 * local branch over a remote-tracking branch of the same name (a local `origin/main` shadows the remote's
	 * `main`). A remote's branch stays one when it has been pruned.
	 */
	private async _toBaseBranchRef(repositoryRoot: URI, baseBranch: string, remotes: readonly string[]): Promise<string> {
		if (baseBranch.startsWith('refs/')) {
			return baseBranch;
		}
		if (await this.branchExists(repositoryRoot, baseBranch)) {
			return `refs/heads/${baseBranch}`;
		}
		return remotes.some(remote => baseBranch.startsWith(`${remote}/`)) ? `refs/remotes/${baseBranch}` : `refs/heads/${baseBranch}`;
	}

	/**
	 * Resolves the local branch Merge merges into for a remote base, see {@link resolveMergeTargetBranch}: preferring
	 * the branch of the same name when several track it. `undefined` when the local branches cannot be read.
	 */
	private async _resolveMergeTarget(repositoryRoot: URI, baseBranch: Extract<BaseBranch, { readonly kind: 'remote' }>): Promise<{ readonly branch: string | undefined } | undefined> {
		const output = await this._runGit(repositoryRoot, ['for-each-ref', '--format=%(refname)%00%(upstream)', 'refs/heads']);
		if (output === undefined) {
			return undefined;
		}
		const localPrefix = 'refs/heads/';
		const branches = new Set<string>();
		const tracking: string[] = [];
		for (const line of output.split(/\r?\n/)) {
			const [ref, upstream] = line.split('\0');
			if (ref.startsWith(localPrefix)) {
				const branch = ref.substring(localPrefix.length);
				branches.add(branch);
				if (upstream === baseBranch.ref) {
					tracking.push(branch);
				}
			}
		}
		if (tracking.length) {
			return { branch: tracking.includes(baseBranch.branch) ? baseBranch.branch : tracking[0] };
		}
		return { branch: branches.has(baseBranch.branch) ? baseBranch.branch : undefined };
	}

	async getFetchRemoteUrls(workingDirectory: URI, preferredRemote?: string): Promise<readonly string[] | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}
		return parseFetchRemoteUrls(await this._runGit(repositoryRoot, ['remote', '-v']), preferredRemote);
	}

	async getFetchRemotes(workingDirectory: URI): Promise<readonly IGitRemote[] | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}
		return parseFetchRemotes(await this._runGit(repositoryRoot, ['remote', '-v']));
	}

	async getUntrackedPaths(workingDirectory: URI): Promise<readonly string[] | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}
		const status = await this._runGitStatus(repositoryRoot, ['--porcelain=v1', '-z', '--untracked-files=all']);
		return status === undefined ? undefined : parseUntrackedPaths(status);
	}

	async captureWorkingTreeAsTree(workingDirectory: URI): Promise<string | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		// `git status` dominates this capture, so resolve HEAD's tree and the
		// repository's index path alongside it.
		const [statusOut, headTree, indexPath] = await Promise.all([
			this._runGitStatus(repositoryRoot, ['--porcelain=v1', '-z', '--untracked-files=all']),
			this.revParse(repositoryRoot, 'HEAD^{tree}'),
			this._getIndexPath(repositoryRoot),
		]);
		if (statusOut === undefined) {
			return undefined;
		}
		const changedPaths = parseChangedPaths(statusOut);
		// Seeding a temp index from HEAD and staging no paths writes exactly
		// HEAD's tree, so a clean working tree with a HEAD needs no temp index
		// or further git processes. An unborn repository still goes through
		// `write-tree` so the empty tree uses the repository's object format.
		if (changedPaths.length === 0 && headTree) {
			return headTree;
		}
		const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-checkpoint-${generateUuid()}`);
		await this._fileService.createFolder(tempDir);
		const indexFile = URI.joinPath(tempDir, 'index').fsPath;
		const env: Record<string, string> = { GIT_INDEX_FILE: indexFile, COMMAND_HOOK_LOCK: '1' };
		try {
			// Copying a HEAD-equivalent index avoids read-tree without trusting cached metadata for staged blobs.
			if (indexPath && canRestageOntoIndexCopy(statusOut) && await this._tryCopyIndex(indexPath, indexFile)) {
				const tree = await this._stageAndWriteTree(repositoryRoot, tempDir, changedPaths, env);
				if (tree) {
					return tree;
				}
				this._logService.debug('[agentHostGitService] Capturing from a copy of the index failed; seeding the temp index from HEAD');
			}
			// Seed the temp index from HEAD; for empty repos seed from the empty tree.
			const seeded = await this._runGit(repositoryRoot, ['read-tree', headTree ?? 'HEAD'], { env });
			if (seeded === undefined) {
				await this._runGit(repositoryRoot, ['read-tree', EMPTY_TREE_OBJECT], { env });
			}
			return await this._stageAndWriteTree(repositoryRoot, tempDir, changedPaths, env);
		} finally {
			try { await this._fileService.del(tempDir, { recursive: true, useTrash: false }); } catch { /* best-effort */ }
		}
	}

	async commitTree(repositoryRoot: URI, treeOid: string, parentOid: string | undefined, message: string, options?: { readonly useInternalIdentity?: boolean }): Promise<string | undefined> {
		const args = ['commit-tree', treeOid];
		if (parentOid) {
			args.push('-p', parentOid);
		}
		args.push('-m', message);
		const env = options?.useInternalIdentity ? {
			GIT_AUTHOR_NAME: 'VS Code',
			GIT_AUTHOR_EMAIL: 'vscode@localhost',
			GIT_COMMITTER_NAME: 'VS Code',
			GIT_COMMITTER_EMAIL: 'vscode@localhost',
		} : undefined;
		const out = await this._runGit(repositoryRoot, args, { throwOnError: true, ...(env ? { env } : {}) });
		return out?.trim() || undefined;
	}

	async updateRef(repositoryRoot: URI, ref: string, newOid: string): Promise<void> {
		await this._runGit(repositoryRoot, ['update-ref', ref, newOid], { throwOnError: true });
	}

	flushTelemetry(): void {
		this._readTelemetry.flush();
	}

	async deleteRefs(repositoryRoot: URI, refs: readonly string[]): Promise<void> {
		if (refs.length === 0) {
			return;
		}
		// Use `update-ref --stdin -z` so all deletions go through a single git
		// invocation. Each command is `delete SP <ref> NUL [<expected_oid>] NUL`;
		// we omit the expected oid so already-missing refs don't fail the batch.
		const stdin = refs.map(ref => `delete ${ref}\x00\x00`).join('');
		this._invalidatePendingReads();
		try {
			await new Promise<void>((resolve) => {
				const proc = cp.execFile('git', ['update-ref', '--stdin', '-z'], { cwd: repositoryRoot.fsPath, timeout: 10_000 }, () => {
					// Tolerate non-zero exits — missing refs are not fatal for cleanup.
					resolve();
				});
				// git can exit before it reads stdin (e.g. not a repository); without a
				// handler the resulting EPIPE is an uncaught error.
				proc.stdin?.on('error', () => { });
				proc.stdin?.end(stdin);
			});
		} finally {
			this._invalidatePendingReads();
		}
	}

	async revParse(repositoryRoot: URI, expression: string): Promise<string | undefined> {
		const out = await this._runGit(repositoryRoot, ['rev-parse', '--verify', '--quiet', expression]);
		return out?.trim() || undefined;
	}

	async listRefNamesWithOids(repositoryRoot: URI, pattern: string, options?: { readonly throwOnError?: boolean }): Promise<Array<{ readonly ref: string; readonly oid: string }>> {
		const out = await this._runGit(repositoryRoot, ['for-each-ref', '--format=%(refname)%00%(objectname)', pattern], options);
		if (!out) {
			return [];
		}
		const result: Array<{ ref: string; oid: string }> = [];
		for (const line of out.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}
			const [ref, oid] = trimmed.split('\x00');
			if (ref && oid) {
				result.push({ ref, oid });
			}
		}
		return result;
	}

	async overlayPathIntoTree(repositoryRoot: URI, baseTreeOid: string, path: string, sourceTreeOid: string): Promise<string | undefined> {
		// Build a throwaway index seeded from `baseTreeOid`, replace/remove the
		// single `path` using `sourceTreeOid`, and write the result back out as
		// a new tree. The user's real index is never touched (mirrors the
		// temp-index technique used by `captureWorkingTreeAsTree`).
		const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-review-overlay-${generateUuid()}`);
		await this._fileService.createFolder(tempDir);
		const indexFile = URI.joinPath(tempDir, 'index').fsPath;
		const env: Record<string, string> = { GIT_INDEX_FILE: indexFile, COMMAND_HOOK_LOCK: '1' };

		try {
			const readTreeOut = await this._runGit(repositoryRoot, ['read-tree', baseTreeOid], { env, throwOnError: false });
			if (readTreeOut === undefined) {
				return undefined;
			}

			// Resolve the source blob (mode + oid) for `path`. `-z` avoids
			// path quoting; an empty result means the path is absent in the
			// source tree, so the overlay removes it from the base.
			const lsTreeOut = await this._runGit(repositoryRoot, ['ls-tree', '-z', sourceTreeOid, '--', path], { env });
			const entry = parseSingleLsTreeEntry(lsTreeOut);
			if (entry) {
				const updateIndexOut = await this._runGit(repositoryRoot, ['update-index', '--add', '--cacheinfo', `${entry.mode},${entry.oid},${path}`], { env, throwOnError: false });
				if (updateIndexOut === undefined) {
					return undefined;
				}
			} else {
				// `--force-remove` tolerates the path already being absent from
				// the index, so removing an untracked/added path is a no-op.
				const updateIndexOut = await this._runGit(repositoryRoot, ['update-index', '--force-remove', '--', path], { env, throwOnError: false });
				if (updateIndexOut === undefined) {
					return undefined;
				}
			}

			const writeTreeOut = await this._runGit(repositoryRoot, ['write-tree'], { env });
			return writeTreeOut?.trim();
		} finally {
			try {
				await this._fileService.del(tempDir, { recursive: true, useTrash: false });
			} catch { /* best-effort */ }
		}
	}

	async diffTreePaths(repositoryRoot: URI, fromTreeish: string, toTreeish: string): Promise<string[] | undefined> {
		const out = await this._runGit(repositoryRoot, ['diff', '--name-only', '--no-renames', '-z', fromTreeish, toTreeish, '--']);
		if (out === undefined) {
			return undefined;
		}
		return out.split('\x00').filter(Boolean);
	}

	async computeFileDiffsBetweenRefs(workingDirectory: URI, options: { readonly sessionUri: string; readonly fromRef: string; readonly toRef: string }): Promise<readonly ISessionFileDiff[] | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		try {
			const raw = await this._runGit(repositoryRoot, ['diff', '--raw', '--numstat', '--diff-filter=ADMR', '-z', options.fromRef, options.toRef, '--']);
			if (raw === undefined) {
				return undefined;
			}

			return parseGitDiffRawNumstat(raw, repositoryRoot, options.sessionUri, options.fromRef, options.toRef);
		} catch (err) {
			this._logService.warn(`[AgentHostGitService][computeFileDiffsBetweenRefs] Failed to compute file diffs ${repositoryRoot.toString()}, ${options.fromRef}, ${options.toRef}: ${err}`);
			return undefined;
		}
	}

	async getBranchDiffSafetyInfo(workingDirectory: URI, baselineCommit: string): Promise<IBranchDiffSafetyInfo | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		const [virtualFileSystem, sparseCheckout, timestamp, commitCount, workspaceFiles] = await Promise.all([
			this._runGit(repositoryRoot, ['config', '--get', 'core.virtualfilesystem']),
			this._runGit(repositoryRoot, ['config', '--get', 'core.sparsecheckout']),
			this._runGit(repositoryRoot, ['show', '-s', '--format=%ct', baselineCommit]),
			this._runGit(repositoryRoot, ['rev-list', '--count', `${baselineCommit}..HEAD`]),
			this._runGit(repositoryRoot, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']),
		]);
		const sparseCheckoutEnabled = new Set(['true', 'yes', 'on', '1']).has(sparseCheckout?.trim().toLowerCase() ?? '');
		const timestampSeconds = Number(timestamp?.trim());
		const parsedCommitCount = Number(commitCount?.trim());
		return {
			hasVirtualFileSystem: Boolean(virtualFileSystem?.trim()) || sparseCheckoutEnabled,
			baselineCommitTimestamp: Number.isFinite(timestampSeconds) ? timestampSeconds * 1000 : undefined,
			commitCount: Number.isFinite(parsedCommitCount) ? parsedCommitCount : undefined,
			workspaceFileCount: workspaceFiles?.split('\x00').filter(Boolean).length ?? 0,
		};
	}

	async getDiffPatchBetweenRefs(workingDirectory: URI, options: { readonly fromRef: string; readonly toRef: string; readonly paths: readonly string[]; readonly maxBuffer: number }): Promise<{ readonly patch: string | undefined; readonly tooLarge: boolean } | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}
		const paths = [...new Set(options.paths)];
		if (paths.length === 0) {
			return { patch: '', tooLarge: false };
		}
		try {
			const patch = await this._runGit(repositoryRoot, ['diff', '--patch', '--no-ext-diff', '--find-renames', '--diff-filter=ADMR', options.fromRef, options.toRef, '--', ...paths], { maxBuffer: options.maxBuffer, throwOnError: true });
			return patch === undefined ? undefined : { patch, tooLarge: false };
		} catch (error) {
			if (isMaxBufferError(error)) {
				return { patch: undefined, tooLarge: true };
			}
			throw error;
		}
	}

	private async _computeSessionGitState(workingDirectory: URI, configuredBaseBranch?: string): Promise<ISessionGitState | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		// Run all probes in parallel. Each handles its own errors and returns
		// undefined on failure so we can populate fields independently.
		// `origin/HEAD` is always probed: besides the fallback base branch, it
		// reports the repository's default branch.
		const [
			statusOutput,
			remotesOutput,
			defaultBranchRef,
		] = await Promise.all([
			this._runGitStatus(repositoryRoot, ['-b', '--porcelain=v2']),
			this._runGit(repositoryRoot, ['remote', '-v']),
			this._runGit(repositoryRoot, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']),
		]);

		// `git status` is the only probe that reports the branch, so a state
		// computed without it is not merely incomplete — it is misleading.
		// Callers persist the result wholesale, so returning a branch-less
		// object here would overwrite the last known good branch and strand
		// every consumer that keys off it (Agent Merge binds its pull request
		// by branch). Report the failure instead and let callers keep what
		// they already had.
		if (statusOutput === undefined) {
			this._logService.warn(`[agentHostGitService] Not reporting session git state because git status failed: ${repositoryRoot.fsPath}`);
			return undefined;
		}

		const status = parseGitStatusV2(statusOutput);
		const hasGitRemote = remotesOutput !== undefined ? remotesOutput.trim().length > 0 : undefined;
		const hasGitHubRemote = parseHasGitHubRemote(remotesOutput);
		const defaultBranch = parseDefaultRemoteBranchRef(defaultBranchRef);
		// `origin/HEAD` can outlive its target (e.g. after the remote renames its default branch).
		const hasDefaultRemoteBranch = defaultBranch
			? this._runGit(repositoryRoot, ['show-ref', '--verify', '--quiet', `refs/remotes/${defaultBranch.remoteBranchName}`]).then(output => output !== undefined)
			: Promise.resolve(false);
		// Without a recorded base, compare against the default branch's start point: its remote-tracking
		// branch when it exists, so a stale local default branch does not show unrelated upstream commits.
		const baseBranch = configuredBaseBranch || (defaultBranch
			? (await hasDefaultRemoteBranch ? `refs/remotes/${defaultBranch.remoteBranchName}` : `refs/heads/${defaultBranch.branchName}`)
			: parseDefaultBranchRef(defaultBranchRef));
		const parsedBaseBranch = baseBranch ? await this._parseBaseBranch(repositoryRoot, baseBranch, remotesOutput) : undefined;
		const baseBranchName = parsedBaseBranch?.branch;
		const githubRepo = parseGitHubRepoFromRemote(remotesOutput);
		const upstreamRemote = status.upstreamBranchName?.split('/')[0];
		// `gh pr checkout` can create a local branch whose head lives on a fork but
		// has no upstream tracking ref; Git still reports the branch's push remote,
		// which can be a remote name or the literal fork URL.
		const [pushRemote, baseBranchDivergence, defaultRemoteBranchExists] = await Promise.all([
			!upstreamRemote && status.branchName
				? this._getPushRemote(repositoryRoot, status.branchName)
				: undefined,
			parsedBaseBranch && status.branchName && status.branchName !== parsedBaseBranch.branch
				? this._computeBaseBranchDivergence(repositoryRoot, parsedBaseBranch, status.outgoingChanges === undefined)
				: undefined,
			hasDefaultRemoteBranch,
		]);
		const githubHeadRepo = upstreamRemote
			? parseGitHubRepoFromRemote(remotesOutput, upstreamRemote)
			: parseGitHubHeadRepoFromRemoteSelection(remotesOutput, pushRemote);

		// `git status -b --porcelain=v2` only emits ahead/behind counts when the
		// branch has an upstream tracking ref. For agent-host worktrees the
		// branch is typically created locally with no upstream, so the user can
		// have committed work that we'd otherwise report as 0 outgoing changes
		// and the "Create PR" button would never appear. Fall back to counting
		// commits relative to the base branch — that matches what the user
		// actually cares about for "is there work to PR?".
		let outgoingChanges = status.outgoingChanges;
		if (outgoingChanges === undefined) {
			outgoingChanges = baseBranchDivergence?.count;
		}

		const result: ISessionGitState = {
			hasGitRemote,
			hasGitHubRemote,
			branchName: status.branchName,
			isDetachedHead: status.isDetachedHead,
			baseBranchName,
			baseBranchRef: parsedBaseBranch?.ref ?? (baseBranch?.startsWith('refs/') ? baseBranch : undefined),
			upstreamBranchName: status.upstreamBranchName,
			defaultBranchName: defaultBranch?.branchName,
			defaultRemoteBranchName: defaultRemoteBranchExists
				? defaultBranch?.remoteBranchName
				: undefined,
			incomingChanges: status.incomingChanges,
			outgoingChanges,
			uncommittedChanges: status.uncommittedChanges,
			hasBaseBranchChanges: baseBranchDivergence?.hasChanges,
			githubOwner: githubRepo?.owner,
			githubHeadOwner: githubHeadRepo?.owner,
			githubRepo: githubRepo?.repo,
		};
		// Strip undefined fields so the resulting object is the same regardless
		// of which probes succeeded — easier to compare in tests.
		return stripUndefined(result);
	}

	private async _getPushRemote(repositoryRoot: URI, branchName: string): Promise<string | undefined> {
		return (await this._runGit(repositoryRoot, ['for-each-ref', '--format=%(push:remotename)', `refs/heads/${branchName}`]))?.trim() || undefined;
	}

	/**
	 * Compares `HEAD` with the base branch. With `countCommits`, counts the commits `HEAD` has that `baseBranch`
	 * lacks, the ref Branch Changes compares against. Whether `HEAD` has changes is relative to the local branch Merge
	 * merges into when there is one: an upstream still lacks the commits a local merge added.
	 */
	private async _computeBaseBranchDivergence(repositoryRoot: URI, baseBranch: BaseBranch, countCommits: boolean): Promise<{ readonly hasChanges: boolean; readonly count?: number } | undefined> {
		const mergeTarget = baseBranch.kind === 'local' ? { branch: baseBranch.branch } : await this._resolveMergeTarget(repositoryRoot, baseBranch);
		if (!mergeTarget) {
			return undefined;
		}
		const mergeTargetRef = mergeTarget.branch !== undefined ? `refs/heads/${mergeTarget.branch}` : baseBranch.ref;
		const [unmerged, ahead] = await Promise.all([
			this._runGit(repositoryRoot, ['rev-list', '--max-count=1', `${mergeTargetRef}..HEAD`]),
			countCommits ? this._runGit(repositoryRoot, ['rev-list', '--count', `${baseBranch.ref}..HEAD`]) : undefined,
		]);
		if (unmerged === undefined) {
			return undefined;
		}
		const count = Number(ahead?.trim());
		return { hasChanges: unmerged.trim().length > 0, ...(Number.isFinite(count) ? { count } : {}) };
	}

	private _runGitStatus(workingDirectory: URI, args: readonly string[], failFastAfterTimeout = true): Promise<string | undefined> {
		// Background status probes must not contend with mutating git commands for index.lock.
		return this._runGit(workingDirectory, ['status', ...args], { env: { GIT_OPTIONAL_LOCKS: '0' }, failFastAfterTimeout });
	}

	protected _runGit(workingDirectory: URI, args: readonly string[], options?: IRunGitOptions): Promise<string | undefined> {
		if (!isShareableGitRead(args, options)) {
			return this._runGitMutation(workingDirectory, args, options);
		}

		// Reported before the arms diverge, so that control and treatment reach it alike.
		this._coalesceReadsTrigger.report();
		if (!this._configurationService.getRootValue(platformRootSchema, AgentHostGitCoalesceReadsConfigKey)) {
			return this._runMeasuredGitRead('passthrough', () => this._spawnGit(workingDirectory, args, options));
		}

		const directoryKey = extUriBiasedIgnorePathCase.getComparisonKey(workingDirectory);
		const readKey = JSON.stringify([args, options?.env, options?.timeout, options?.throwOnError, options?.maxBuffer]);
		let pendingReads = this._pendingGitReads.get(directoryKey);
		const pending = pendingReads?.get(readKey);
		if (pending) {
			return this._runMeasuredGitRead('coalesced', () => {
				this._readTelemetry.readShared();
				return pending;
			});
		}

		const timedOutAt = this._timedOutGitReads.get(`${directoryKey}\0${readKey}`);
		if (timedOutAt !== undefined && options?.failFastAfterTimeout && !options.throwOnError) {
			if (Date.now() - timedOutAt < GIT_READ_TIMEOUT_COOLDOWN_MS) {
				this._logService.trace(`[agentHostGitService] > git ${args.join(' ')} skipped: it timed out moments ago`);
				this._readTelemetry.readRequested('coalesced');
				this._readTelemetry.readSkipped();
				return Promise.resolve(undefined);
			}
			this._timedOutGitReads.delete(`${directoryKey}\0${readKey}`);
		}

		if (!pendingReads) {
			pendingReads = new Map();
			this._pendingGitReads.set(directoryKey, pendingReads);
		}
		const reads = pendingReads;
		const queuedAt = Date.now();
		const read = this._runMeasuredGitRead('coalesced', () => this._gitReadLimiter.queue(() => {
			const waitMs = Date.now() - queuedAt;
			if (waitMs > 0) {
				this._readTelemetry.readQueued(waitMs);
			}
			return this._spawnGit(workingDirectory, args, options, () => {
				this._timedOutGitReads.set(`${directoryKey}\0${readKey}`, Date.now());
				if (this._timedOutGitReads.size > 100) {
					this._timedOutGitReads.delete(this._timedOutGitReads.keys().next().value!);
				}
			});
		}));
		reads.set(readKey, read);
		const forget = () => {
			if (reads.get(readKey) === read) {
				reads.delete(readKey);
			}
			if (reads.size === 0 && this._pendingGitReads.get(directoryKey) === reads) {
				this._pendingGitReads.delete(directoryKey);
			}
		};
		read.then(forget, forget);
		return read;
	}

	private async _runMeasuredGitRead(arm: GitReadArm, run: () => Promise<string | undefined>): Promise<string | undefined> {
		this._readTelemetry.readRequested(arm);
		const startedAt = Date.now();
		try {
			return await run();
		} finally {
			this._readTelemetry.readCompleted(Date.now() - startedAt);
		}
	}

	/** Runs a git command that may change what a read sees; reads that began before it must not be shared with reads after it. */
	private async _runGitMutation(workingDirectory: URI, args: readonly string[], options?: IRunGitOptions): Promise<string | undefined> {
		const invalidates = !isGitObjectOnlyWrite(args, options);
		if (invalidates) {
			this._invalidatePendingReads();
		}
		try {
			return await this._spawnGit(workingDirectory, args, options);
		} finally {
			if (invalidates) {
				this._invalidatePendingReads();
			}
		}
	}

	/** Linked worktrees share refs, so a command in one directory can change what a read in another sees: no pending read of any directory may be joined afterwards. */
	private _invalidatePendingReads(): void {
		this._pendingGitReads.clear();
	}

	protected _spawnGit(workingDirectory: URI, args: readonly string[], options?: IRunGitOptions, onTimedOut?: () => void): Promise<string | undefined> {
		this._logService.trace(`[agentHostGitService] > git ${args.join(' ')}`);

		return new Promise((resolve, reject) => {
			const env = options?.env ? { ...process.env, ...options.env } : undefined;
			const timeoutMs = options?.timeout ?? this._defaultTimeoutMs;
			// Use our own timer rather than execFile's `timeout` option so
			// we can definitively flag the timeout case in the error
			// message — execFile only surfaces signal/killed, which can
			// also mean the process was killed for other reasons.
			let didTimeOut = false;
			// Default maxBuffer is 32MB — Node's default is ~1MB, which is
			// easy to exceed for diff output in large repos. Exceeding it
			// causes execFile to error and we'd silently drop the diff.
			// Counted as ended exactly once, however the process or its failure to start is reported.
			let didEnd = false;
			const markEnded = () => {
				if (!didEnd) {
					didEnd = true;
					this._readTelemetry.spawnEnded();
				}
			};
			const child = cp.execFile('git', [...args], { cwd: workingDirectory.fsPath, env, maxBuffer: options?.maxBuffer ?? 32 * 1024 * 1024 }, (error, stdout, stderr) => {
				clearTimeout(timer);
				markEnded();
				if (error) {
					// stderr is summarized in the thrown error message to keep
					// it readable; log the full unmodified output here so the
					// raw progress/diagnostic text is still available.
					if (stderr) {
						this._logService.warn(`[agentHostGitService] > git ${args.join(' ')} failed; full stderr:\n${stderr}`);
					} else if (didTimeOut || error.killed) {
						// A timed-out or signalled git writes nothing to stderr,
						// so this is the only trace such a failure ever leaves.
						// Callers that degrade quietly on `undefined` are then
						// impossible to diagnose from logs alone.
						this._logService.warn(`[agentHostGitService] > git ${args.join(' ')} failed: ${formatGitError(args, timeoutMs, didTimeOut, error, stderr)}`);
					} else {
						// A silent non-zero exit is how the `--quiet` probes
						// report "not found", so this stays below `warn`.
						this._logService.trace(`[agentHostGitService] > git ${args.join(' ')} failed: ${formatGitError(args, timeoutMs, didTimeOut, error, stderr)}`);
					}
					if (options?.throwOnError) {
						reject(new GitCommandError(formatGitError(args, timeoutMs, didTimeOut, error, stderr), stderr, error));
						return;
					}
					resolve(undefined);
					return;
				}
				resolve(stdout);
			});
			// Counted once `execFile` returned, since it throws synchronously for invalid arguments, and its callback only runs later.
			this._readTelemetry.spawnStarted();
			// `execFile` keeps its own listener for the buffered result; an
			// extra one just tees the same chunks for live progress.
			const onStderr = options?.onStderr;
			if (onStderr) {
				child.stderr?.on('data', (chunk: Buffer | string) => onStderr(chunk.toString()));
			}
			if (options?.input !== undefined) {
				child.stdin?.end(options.input, 'utf8');
			}
			const timer = setTimeout(() => {
				didTimeOut = true;
				this._readTelemetry.spawnTimedOut();
				onTimedOut?.();
				if (child.pid === undefined) {
					child.kill();
					return;
				}
				void killTree(child.pid, true, message => this._logService.debug(`[agentHostGitService] ${message}`)).catch(() => child.kill('SIGKILL'));
			}, timeoutMs);
			child.on('exit', () => clearTimeout(timer));
		});
	}
}

/** Whether a git command only reads and has no per-call side channels, so concurrent identical calls can share one process. */
function isShareableGitRead(args: readonly string[], options?: IRunGitOptions): boolean {
	return READ_ONLY_GIT_SUBCOMMANDS.has(args[0]) && options?.input === undefined && !options?.onStderr;
}

/** Whether a git command writes only objects or a throwaway index, which no read of the checkout or its refs observes. */
function isGitObjectOnlyWrite(args: readonly string[], options?: IRunGitOptions): boolean {
	return options?.env?.GIT_INDEX_FILE !== undefined || args[0] === 'commit-tree' || args[0] === 'write-tree' || args[0] === 'hash-object' || args[0] === 'mktree';
}

interface IRunGitOptions {
	readonly timeout?: number;
	readonly throwOnError?: boolean;
	readonly env?: Record<string, string>;
	readonly maxBuffer?: number;
	readonly onStderr?: (chunk: string) => void;
	readonly input?: string;
	/** Skip the command for a short while after the same command timed out, for callers that treat a missing result as unknown. */
	readonly failFastAfterTimeout?: boolean;
}

class GitCommandError extends Error {
	constructor(message: string, readonly stderr: string, cause: cp.ExecFileException) {
		super(message, { cause });
	}
}

/** Whether spawning git failed with `ENOENT`, raised both for a missing git executable and for a missing working directory. */
function isSpawnEnoentError(error: unknown): boolean {
	return error instanceof GitCommandError && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

function isCheckoutBlockedByLocalChanges(stderr: string): boolean {
	return /(?:local changes to the following files|untracked working tree files) would be overwritten by checkout:/i.test(stderr);
}

/**
 * Incrementally extracts checkout progress from git's stderr. Git rewrites the
 * progress line in place with carriage returns, so a chunk carries any number
 * of samples and may split one across chunk boundaries; the trailing partial
 * line is held back until the rest arrives. Every complete sample is forwarded
 * verbatim — rounding and rate limiting belong to the consumer, which knows how
 * it wants to present them.
 *
 * Exported for tests.
 */
export class GitCheckoutProgressParser {

	private static readonly _pattern = /Updating files:\s+\d+% \((?<done>\d+)\/(?<total>\d+)\)/g;

	private _pending = '';

	constructor(private readonly _onProgress: (progress: IWorktreeFileProgress) => void) { }

	push(chunk: string): void {
		// Keep whatever follows the last line break for the next chunk; git
		// separates progress samples with `\r` and ends the phase with `\n`.
		const buffer = this._pending + chunk;
		const lastBreak = Math.max(buffer.lastIndexOf('\r'), buffer.lastIndexOf('\n'));
		if (lastBreak === -1) {
			this._pending = buffer;
			return;
		}
		this._pending = buffer.substring(lastBreak + 1);

		const complete = buffer.substring(0, lastBreak);
		GitCheckoutProgressParser._pattern.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = GitCheckoutProgressParser._pattern.exec(complete))) {
			const filesTotal = Number(match.groups!.total);
			if (filesTotal > 0) {
				this._onProgress({ filesDone: Number(match.groups!.done), filesTotal });
			}
		}
	}
}

/**
 * A path to copy into a worktree, plus how many individual ignored files it
 * covers — one for a plain file, the whole tally for a collapsed directory —
 * so callers can report progress in files rather than in entries of wildly
 * different size.
 */
interface IWorktreeIncludeEntry {
	readonly sourcePath: string;
	readonly fileCount: number;
}

/**
 * Builds the entries to copy: one per collapsed directory, standing in for all
 * the matched files beneath it, plus one per matched file no collapsed
 * directory covers.
 */
function toWorktreeIncludeEntries(repositoryRoot: URI, matchedFiles: readonly string[], collapsedDirectories: ReadonlySet<string>): IWorktreeIncludeEntry[] {
	const toEntry = (relativePath: string, fileCount: number): IWorktreeIncludeEntry => ({
		sourcePath: path.join(repositoryRoot.fsPath, relativePath),
		fileCount,
	});

	// Seeded with every collapsed directory so one is still emitted even if the
	// tally below never reaches it.
	const directoryFileCounts = new Map<string, number>();
	for (const dir of collapsedDirectories) {
		directoryFileCounts.set(dir, 0);
	}

	const fileEntries: IWorktreeIncludeEntry[] = [];
	for (const file of matchedFiles) {
		const containingDirectory = collapsedDirectories.size > 0
			? findContainingDirectory(file, collapsedDirectories)
			: undefined;
		if (containingDirectory === undefined) {
			fileEntries.push(toEntry(file, 1));
		} else {
			directoryFileCounts.set(containingDirectory, directoryFileCounts.get(containingDirectory)! + 1);
		}
	}

	return [
		...[...directoryFileCounts].map(([dir, fileCount]) => toEntry(dir, fileCount)),
		...fileEntries,
	];
}

/**
 * Replaces characters that are not safe in a file name so a session id can
 * be embedded in a temporary directory name without escaping `tmpDir`.
 */
function toFileNameSafeSessionId(sessionId: string): string {
	return sessionId.replace(/[^\w.-]/g, '_');
}

function sanitizeWorktreePatterns(patterns: readonly string[]): string[] {
	return patterns.filter(pattern => !/[\r\n]/.test(pattern));
}

function getWorktreeSymlinkFolderCandidates(ignoredOutput: string, matchedOutput: string): string[] {
	const matchedFiles = new Set(splitNulSeparated(matchedOutput));
	const candidates = new Set<string>();

	for (const file of splitNulSeparated(ignoredOutput)) {
		if (!matchedFiles.has(file)) {
			continue;
		}

		let index = file.lastIndexOf('/');
		while (index !== -1) {
			candidates.add(file.slice(0, index));
			index = file.lastIndexOf('/', index - 1);
		}
	}

	return Array.from(candidates);
}

function filterWorktreeSymlinkFolders(candidates: readonly string[], ignoredOutput: string, matchedOutput: string, directoryOutput: string): string[] {
	const ignoredFolders = new Set(splitNulSeparated(ignoredOutput));
	const matchedFolders = new Set(splitNulSeparated(matchedOutput));
	const whollyIgnoredFolders = new Set(splitNulSeparated(directoryOutput).filter(folder => folder.endsWith('/')));

	const folders = candidates.filter(folder =>
		ignoredFolders.has(`${folder}/`) &&
		matchedFolders.has(`${folder}/`) &&
		hasContainingFolder(folder, whollyIgnoredFolders)
	);
	const folderSet = new Set(folders.map(folder => `${folder}/`));

	return folders.filter(folder =>
		!hasContainingFolder(folder, folderSet, false)
	);
}

function splitNulSeparated(output: string): string[] {
	return output.split('\x00').filter(entry => entry.length > 0);
}

function hasContainingFolder(folder: string, folders: ReadonlySet<string>, includeSelf = true): boolean {
	let index = includeSelf ? folder.length : folder.lastIndexOf('/');
	while (index > 0) {
		if (folders.has(`${folder.slice(0, index)}/`)) {
			return true;
		}
		index = folder.lastIndexOf('/', index - 1);
	}
	return false;
}

/**
 * Selects the ignored files to copy into a worktree from the NUL-separated
 * `git ls-files` outputs, collapsing wholly-ignored directories whose every
 * ignored file is included into a single recursive entry.
 */
function resolveWorktreeIncludeEntries(repositoryRoot: URI, ignoredFiles: readonly string[], includedOutput: string, directoryOutput: string | undefined, worktreeOutput: string | undefined, excludedFolders: readonly string[] = []): IWorktreeIncludeEntry[] {
	// Keep only the ignored files that also match one of the configured
	// `git.worktreeIncludeFiles` patterns, and — in the same pass — tally
	// which wholly-ignored directories contain an ignored file that cannot
	// be copied (and therefore cannot be collapsed). `git ls-files
	// --directory` reports a wholly-ignored directory as a single `dir/`
	// entry and never nests these entries (it stops descending once a
	// directory is wholly ignored), so each file has at most one containing
	// directory and no de-duplication of the directory set is required.
	const includedFiles = new Set(includedOutput
		.split('\x00').filter(entry => entry.length > 0));
	const wholeDirectories = new Set((directoryOutput ?? '')
		.split('\x00').filter(entry => entry.endsWith('/')));
	const worktreeFiles = new Set((worktreeOutput ?? '')
		.split('\x00').filter(entry => entry.length > 0));
	const excludedDirectories = new Set(excludedFolders.map(folder => folder.endsWith('/') ? folder : `${folder}/`));

	// Every ancestor directory of a tracked path, with the trailing `/` used
	// by `git ls-files --directory`, so a source path can be checked against
	// the shape (file vs directory) of its destination.
	const worktreeDirectories = new Set<string>();
	for (const file of worktreeFiles) {
		let index = file.indexOf('/');
		while (index !== -1) {
			worktreeDirectories.add(file.slice(0, index + 1));
			index = file.indexOf('/', index + 1);
		}
	}

	const matchedFiles: string[] = [];
	const nonCollapsibleDirectories = new Set<string>();
	for (const file of ignoredFiles) {
		if (
			includedFiles.has(file) &&
			findContainingDirectory(file, excludedDirectories) === undefined &&
			!hasWorktreePathCollision(file, worktreeFiles, worktreeDirectories)
		) {
			matchedFiles.push(file);
		} else if (wholeDirectories.size > 0) {
			const containingDirectory = findContainingDirectory(file, wholeDirectories);
			if (containingDirectory !== undefined) {
				nonCollapsibleDirectories.add(containingDirectory);
			}
		}
	}

	if (matchedFiles.length === 0) {
		return [];
	}

	// Collapse matched files into their containing directory when the whole
	// directory can be copied as a single recursive unit — i.e. it is
	// wholly ignored (so it has no tracked files a recursive copy would
	// clobber) and every ignored file it contains matched a pattern (so
	// nothing unwanted is copied, tracked by `nonCollapsibleDirectories` above).
	// This turns a large tree such as `node_modules/` into one copy instead
	// of one per file, while a partially-matched or partially-tracked
	// directory falls back to its individual matched files. `--directory`
	// with `--no-empty-directory` never reports an empty directory, so every
	// entry in `wholeDirectories` is known to contain at least one ignored file.
	const collapsedDirectories = new Set<string>();
	for (const dir of wholeDirectories) {
		if (!nonCollapsibleDirectories.has(dir)) {
			collapsedDirectories.add(dir);
		}
	}

	return toWorktreeIncludeEntries(repositoryRoot, matchedFiles, collapsedDirectories);
}

/**
 * Returns the shallowest directory from `directories` that contains `file`, or
 * `undefined` if none does. `file` is a repository-relative, forward-slash path
 * and every entry in `directories` is expected to end with a trailing `/` (as
 * produced by `git ls-files --directory`). Walking the path's `/` boundaries
 * and probing the set is O(path depth) per file, avoiding an O(directories)
 * scan for each file.
 */
function findContainingDirectory(file: string, directories: ReadonlySet<string>): string | undefined {
	let index = file.indexOf('/');
	while (index !== -1) {
		const prefix = file.slice(0, index + 1);
		if (directories.has(prefix)) {
			return prefix;
		}
		index = file.indexOf('/', index + 1);
	}
	return undefined;
}

/**
 * Returns whether copying a source path would overwrite a tracked worktree path
 * or conflict with the file/directory shape of its destination. `file` and both
 * sets use repository-relative, forward-slash paths, with `worktreeDirectories`
 * entries carrying a trailing `/`.
 */
function hasWorktreePathCollision(file: string, worktreeFiles: ReadonlySet<string>, worktreeDirectories: ReadonlySet<string>): boolean {
	// The destination is a tracked file, which the copy would overwrite, or a
	// tracked directory, which a file cannot take the place of.
	if (worktreeFiles.has(file) || worktreeDirectories.has(`${file}/`)) {
		return true;
	}

	// An ancestor of the destination is a tracked file, so the directories
	// leading up to it cannot be created.
	let index = file.indexOf('/');
	while (index !== -1) {
		if (worktreeFiles.has(file.slice(0, index))) {
			return true;
		}
		index = file.indexOf('/', index + 1);
	}
	return false;
}

/**
 * Whether a `git worktree remove`/`prune` failure is a transient filesystem or
 * lock race — a concurrent git process in the worktree left the
 * `.git/worktrees/<id>` admin directory non-empty — and is worth retrying.
 * Genuine failures (a dirty tree needing `--force`, a missing worktree, or any
 * other fatal git error) are not retryable.
 */
export function isRetryableWorktreeRemovalError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /directory not empty/i.test(message) || isGitLockError(error);
}

/** Whether a git command failed because another git process holds a lock file. */
function isGitLockError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /\bindex\.lock\b/i.test(message)
		|| /unable to (?:create|write|append)[^\n]*\.lock/i.test(message)
		|| /could not lock/i.test(message);
}

/**
 * Builds a diagnostic error message for a failed `git` invocation that
 * preserves the reason (timeout / signal / exit code) instead of just
 * surfacing whatever happened to be on stderr. When `git` is killed by
 * the timeout, stderr often contains only progress output (e.g.
 * `Updating files:   0% (149/14834)`), so without the timeout indicator
 * the bubbled-up error is misleading.
 *
 * Exported for tests.
 */
export function formatGitError(args: readonly string[], timeoutMs: number, didTimeOut: boolean, error: cp.ExecFileException, stderr: string): string {
	// Skip leading `-c <name>=<value>` options to name the subcommand.
	const subcommand = args.find((arg, index) => !arg.startsWith('-') && args[index - 1] !== '-c') ?? '(unknown)';
	let reason: string;
	if (didTimeOut) {
		reason = `git ${subcommand} timed out after ${timeoutMs}ms`;
	} else if (error.killed && error.signal) {
		reason = `git ${subcommand} killed by ${error.signal}`;
	} else if (typeof error.code === 'number') {
		reason = `git ${subcommand} exited with code ${error.code}`;
	} else {
		reason = error.message;
	}
	const detail = summarizeStderrForError(stderr);
	return detail ? `${reason}: ${detail}` : reason;
}

/**
 * Squashes multi-line / carriage-return-heavy stderr (e.g. git progress
 * meters that emit `Updating files:   0% (149/14834)\r...` repeatedly)
 * into a single short line suitable for a one-liner error message.
 * Prefers actionable diagnostics over trailing advice and caps total length.
 *
 * Exported for tests.
 */
export function summarizeStderrForError(stderr: string): string {
	if (!stderr) {
		return '';
	}
	const lines = stderr.split(/[\r\n]+/g).map(line => line.trim()).filter(line => line.length > 0);
	if (lines.length === 0) {
		return '';
	}
	const MAX = 200;
	const summary = lines.find(isGitLfsMissing) ?? lines.find(line => /^fatal:/i.test(line)) ?? lines[lines.length - 1];
	return summary.length > MAX ? `${summary.slice(0, MAX - 1)}…` : summary;
}

/**
 * Whether a stderr line reports that `git-lfs` is required but can't be run, as
 * bash, dash (`: not found`) or Windows report a missing filter command, or as
 * the hooks Git LFS installs report themselves.
 */
function isGitLfsMissing(line: string): boolean {
	return /\bgit-lfs\b/i.test(line) && /(command not found|: not found|not recognized|no such file|was not found)/i.test(line);
}

function isGitLfsMissingError(error: unknown): boolean {
	return error instanceof GitCommandError && error.stderr.split(/[\r\n]+/).some(isGitLfsMissing);
}

/** Whether `git update-index --refresh` exited only because files differ from the index, which it still rewrites. */
function isIndexNeedsUpdateError(error: unknown): boolean {
	return error instanceof GitCommandError && (error.cause as cp.ExecFileException | undefined)?.code === 1;
}

function toWorktreeAddError(error: unknown): unknown {
	const message = error instanceof GitCommandError ? getWorktreeAddFailureMessage(error.stderr) : undefined;
	return message ? new WorktreeAddError(message, { cause: error }) : error;
}

/**
 * Explains a `git worktree add` failure with a well-known cause, or returns
 * `undefined`. Git reports the cause before a generic closing `fatal:` line,
 * so this reads all of stderr instead of its summary.
 *
 * Exported for tests.
 */
export function getWorktreeAddFailureMessage(stderr: string): string | undefined {
	// "File name too long" on macOS and Linux, "Filename too long" in Git for Windows.
	if (/\bfile ?name too long\b/i.test(stderr)) {
		return isWindows
			? localize('agentHostGit.worktreeAdd.pathTooLongWindows', "A file path in the worktree is too long for Windows. If the full path is longer than 260 characters, run `git config --global core.longpaths true` to allow long paths in Git. If a file or folder name is longer than 255 characters, shorten it in the repository.")
			: localize('agentHostGit.worktreeAdd.pathTooLong', "A file path in the worktree is too long for the file system.");
	}
	if (stderr.split(/[\r\n]+/).some(isGitLfsMissing)) {
		return localize('agentHostGit.worktreeAdd.gitLfsMissing', "The repository uses Git LFS, but Git LFS isn't installed or can't be found on the PATH.");
	}
	const lockFile = /Unable to create '(?<lockFile>[^']+\.lock)': File exists/.exec(stderr)?.groups?.lockFile;
	if (lockFile) {
		return localize('agentHostGit.worktreeAdd.locked', "Another Git process is using the repository. If no Git process is running, delete the lock file '{0}'.", lockFile);
	}
	return undefined;
}

export function parseGitWorktrees(output: string): IAgentHostGitWorktree[] {
	const branchPrefix = 'branch refs/heads/';
	return output.split('\0\0').filter(record => record.startsWith('worktree ')).map(record => {
		const fields = record.split('\0');
		const branch = fields.find(field => field.startsWith(branchPrefix));
		return { path: URI.file(fields[0].slice('worktree '.length)), branchName: branch?.slice(branchPrefix.length) };
	});
}

/**
 * Parses NUL-separated `git status --porcelain=v1 -z --untracked-files=all`
 * output and returns the repo-relative paths of untracked entries (status
 * `??`). Other entries are ignored; we only need to know whether any
 * untracked files exist to decide whether to use the temp-index path.
 *
 * Exported for tests.
 */
export function parseUntrackedPaths(output: string | undefined): string[] {
	return parseChangedPaths(output, status => status === '??');
}

/**
 * Reads the merge base and `git status` output back from what `getBranchDiffFingerprint` returned for
 * `baseBranch`. `undefined` when there is no fingerprint, it was taken for another base branch, or it
 * cannot be read.
 */
function readBranchDiffFingerprint(fingerprint: string | undefined, baseBranch: string | undefined): { readonly mergeBaseCommit: string; readonly statusOutput: string } | undefined {
	if (!fingerprint) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(fingerprint);
		if (Array.isArray(parsed) && parsed[0] === (baseBranch || null) && typeof parsed[1] === 'string' && typeof parsed[3] === 'string') {
			return { mergeBaseCommit: parsed[1], statusOutput: parsed[3] };
		}
	} catch {
		// Not a fingerprint: compute everything.
	}
	return undefined;
}

/** Allows index copying only when changed paths have no staged blobs or unmatched pathspecs. */
export function canRestageOntoIndexCopy(output: string): boolean {
	for (const segment of output.split('\x00')) {
		if (!segment) {
			continue;
		}
		const index = segment[0];
		const workingTree = segment[1];
		if (index !== ' ' && index !== '?') {
			return false;
		}
		if (workingTree === 'U' || workingTree === 'R' || workingTree === 'C') {
			return false;
		}
	}
	return true;
}

/**
 * Parses NUL-separated `git status --porcelain=v1 -z --untracked-files=all`
 * output and returns all changed repo-relative paths. Rename/copy entries
 * include both the destination and source paths so scoped `git add -A`
 * stages both sides of the change. Paths added to the index and then deleted
 * from the worktree are omitted because they do not exist in either HEAD or
 * the worktree.
 *
 * Exported for tests.
 */
export function parseChangedPaths(output: string | undefined, includeStatus: (status: string) => boolean = () => true): string[] {
	if (!output) {
		return [];
	}
	const result: string[] = [];
	const seen = new Set<string>();
	const addPath = (path: string) => {
		if (path && !seen.has(path)) {
			seen.add(path);
			result.push(path);
		}
	};
	const segments = output.split('\x00');
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (!seg) { continue; }
		// Each entry is "XY <path>"; for renames v1 emits a second NUL-separated
		// "from" path.
		const status = seg.substring(0, 2);
		const path = seg.substring(3);
		const isRenameOrCopy = status[0] === 'R' || status[1] === 'R' || status[0] === 'C' || status[1] === 'C';
		if (includeStatus(status)) {
			const isDeletedIndexAddition = status[1] === 'D' && (status[0] === 'A' || status[0] === 'R' || status[0] === 'C');
			if (!isDeletedIndexAddition) {
				addPath(path);
			}
			if (isRenameOrCopy) {
				const sourcePath = segments[++i];
				if (sourcePath) {
					addPath(sourcePath);
				}
			}
		} else if (isRenameOrCopy) {
			i++;
		}
	}
	return result;
}

/**
 * Parses NUL-terminated `git ls-tree -z <tree> -- <path>` output for a single
 * path and returns its `{ mode, oid }`, or `undefined` when the path is absent
 * from the tree (empty output). Each entry has the form
 * `<mode> SP <type> SP <oid> TAB <path> NUL`; we only need the mode and oid.
 *
 * Exported for tests.
 */
export function parseSingleLsTreeEntry(output: string | undefined): { mode: string; oid: string } | undefined {
	if (!output) {
		return undefined;
	}
	const entry = output.split('\x00')[0];
	if (!entry) {
		return undefined;
	}
	const tabIndex = entry.indexOf('\t');
	const meta = (tabIndex === -1 ? entry : entry.substring(0, tabIndex)).split(' ');
	if (meta.length < 3) {
		return undefined;
	}
	return { mode: meta[0], oid: meta[2] };
}

/**
 * Parses combined `--raw --numstat -z` output produced by
 * {@link IAgentHostGitService.computeSessionFileDiffs} and converts each
 * change into an {@link ISessionFileDiff} ready for the protocol.
 *
 * The combined NUL-separated stream alternates between `--raw` segments
 * (start with `:`) and `--numstat` segments. For renames the raw segment
 * is followed by two extra path segments (old, new); the numstat segment
 * has an empty path field followed by old/new path segments.
 *
 * `beforeRef` is the commit the `before` side is anchored on (typically a
 * merge-base or the lower bound of a ref-to-ref diff).
 *
 * `afterRef` controls how the `after` side is built:
 * - When `undefined` (the merge-base → working-tree case) the `after`
 *   content URI points at the on-disk working-tree file. The diff editor
 *   reads the file from disk as the user currently sees it.
 * - When set (the ref → ref case, e.g. checkpoint diffs) both `after.uri`
 *   and `after.content.uri` are built as `git-blob:` URIs anchored on that
 *   commit, so the after pane reflects the state at that commit
 *   regardless of what is currently on disk. This also makes the diff
 *   correct when the file does not (or no longer) exists in the working
 *   tree.
 *
 * Exported for tests.
 */
export function parseGitDiffRawNumstat(output: string, repositoryRoot: URI, sessionUri: string, beforeRef: string, afterRef?: string): ISessionFileDiff[] {
	const segments = output.split('\x00');
	const changes: { kind: FileEditKind; oldPath?: string; newPath?: string }[] = [];
	const numStats = new Map<string, { added: number; removed: number }>();

	let i = 0;
	while (i < segments.length) {
		const segment = segments[i++];
		if (!segment) { continue; }

		if (segment.startsWith(':')) {
			// Raw line: ":<srcMode> <dstMode> <srcSha> <dstSha> <status>"
			// followed by NUL-separated path(s).
			const fields = segment.split(' ');
			const status = fields[4] ?? '';
			const path1 = segments[i++];
			if (!path1) { continue; }

			switch (status[0]) {
				case 'A':
					changes.push({ kind: FileEditKind.Create, newPath: path1 });
					break;
				case 'M':
					changes.push({ kind: FileEditKind.Edit, oldPath: path1, newPath: path1 });
					break;
				case 'D':
					changes.push({ kind: FileEditKind.Delete, oldPath: path1 });
					break;
				case 'R': {
					const path2 = segments[i++];
					if (!path2) { continue; }
					changes.push({ kind: FileEditKind.Rename, oldPath: path1, newPath: path2 });
					break;
				}
				default:
					break;
			}
		} else {
			// Numstat line: "<added>\t<removed>\t<path>" or, for renames,
			// "<added>\t<removed>\t" followed by NUL-separated old/new paths.
			const [addedStr, removedStr, filePath] = segment.split('\t');
			let key: string;
			if (filePath === '' || filePath === undefined) {
				const oldPath = segments[i++];
				const newPath = segments[i++];
				key = newPath ?? oldPath ?? '';
			} else {
				key = filePath;
			}
			if (!key) { continue; }
			numStats.set(key, {
				added: addedStr === '-' ? 0 : Number(addedStr) || 0,
				removed: removedStr === '-' ? 0 : Number(removedStr) || 0,
			});
		}
	}

	return changes.map(change => {
		const stats = numStats.get(change.newPath ?? change.oldPath ?? '');

		const beforeFileUri = change.oldPath ? URI.joinPath(repositoryRoot, change.oldPath) : undefined;
		const afterFileUri = change.newPath ? URI.joinPath(repositoryRoot, change.newPath) : undefined;

		const before = change.kind !== FileEditKind.Create && change.oldPath && beforeFileUri
			? {
				uri: beforeFileUri.toString(),
				content: { uri: buildGitBlobUri(sessionUri, beforeRef, change.oldPath, beforeFileUri.path) },
			}
			: undefined;

		const after = change.kind !== FileEditKind.Delete && change.newPath && afterFileUri
			? {
				uri: afterFileUri.toString(),
				content: afterRef !== undefined
					? { uri: buildGitBlobUri(sessionUri, afterRef, change.newPath, afterFileUri.path) }
					: { uri: afterFileUri.toString() }
			}
			: undefined;

		const diff = {
			added: stats?.added ?? 0,
			removed: stats?.removed ?? 0
		};

		return {
			...(before ? { before } : {}),
			...(after ? { after } : {}),
			diff
		};
	});
}

/**
 * Parses output of `git status -b --porcelain=v2`. The format is documented
 * at https://git-scm.com/docs/git-status. We care about a few header lines:
 *
 *   # branch.head <name>
 *   # branch.upstream <name>
 *   # branch.ab +<ahead> -<behind>
 *
 * and the count of non-header lines (one per changed entry).
 *
 * Exported for tests.
 */
export function parseGitStatusV2(output: string | undefined): {
	branchName?: string;
	isDetachedHead?: boolean;
	upstreamBranchName?: string;
	outgoingChanges?: number;
	incomingChanges?: number;
	uncommittedChanges?: number;
} {
	if (!output) {
		return {};
	}
	let branchName: string | undefined;
	let isDetachedHead: boolean | undefined;
	let upstreamBranchName: string | undefined;
	let outgoingChanges: number | undefined;
	let incomingChanges: number | undefined;
	let uncommittedChanges = 0;
	for (const rawLine of output.split(/\r?\n/g)) {
		const line = rawLine.trimEnd();
		if (!line) { continue; }
		if (line.startsWith('# branch.head ')) {
			const head = line.substring('# branch.head '.length).trim();
			// `(detached)` is what git emits for a detached HEAD. Treat as no
			// branch, but report why so consumers can tell an intentionally
			// branch-less checkout from a status probe that never ran.
			isDetachedHead = head === '(detached)' ? true : undefined;
			branchName = isDetachedHead ? undefined : head;
		} else if (line.startsWith('# branch.upstream ')) {
			upstreamBranchName = line.substring('# branch.upstream '.length).trim();
		} else if (line.startsWith('# branch.ab ')) {
			const m = /^# branch\.ab \+(\d+) -(\d+)$/.exec(line);
			if (m) {
				outgoingChanges = Number(m[1]);
				incomingChanges = Number(m[2]);
			}
		} else if (!line.startsWith('#')) {
			uncommittedChanges++;
		}
	}
	return { branchName, isDetachedHead, upstreamBranchName, outgoingChanges, incomingChanges, uncommittedChanges };
}

/** Exported for tests. */
export function parseHasGitHubRemote(remotesOutput: string | undefined): boolean | undefined {
	if (remotesOutput === undefined) {
		return undefined;
	}
	if (!remotesOutput.trim()) {
		return false;
	}
	return /github\.com[:\/]/i.test(remotesOutput);
}

/** Returns fetch remote URLs with the preferred remote, then `origin`, first. */
export function parseFetchRemoteUrls(remotesOutput: string | undefined, preferredRemote?: string): string[] | undefined {
	const candidates = parseFetchRemotes(remotesOutput);
	if (!candidates) {
		return undefined;
	}
	const preferredNames = new Set([preferredRemote, 'origin'].filter((name): name is string => Boolean(name)));
	const ordered = [
		...candidates.filter(candidate => candidate.name === preferredRemote),
		...candidates.filter(candidate => candidate.name === 'origin' && candidate.name !== preferredRemote),
		...candidates.filter(candidate => !preferredNames.has(candidate.name)),
	];
	return [...new Set(ordered.map(candidate => candidate.url))];
}

function parseFetchRemotes(remotesOutput: string | undefined): { name: string; url: string }[] | undefined {
	if (remotesOutput === undefined) {
		return undefined;
	}
	const candidates: { name: string; url: string }[] = [];
	for (const rawLine of remotesOutput.split(/\r?\n/)) {
		// Partial clones append the object filter, e.g. `origin <url> (fetch) [blob:none]`.
		const match = /^(?<name>\S+)\s+(?<url>\S+)\s+\(fetch\)(?:\s+\[[^\]]*\])?$/.exec(rawLine.trim());
		if (match?.groups) {
			candidates.push({ name: match.groups.name, url: match.groups.url });
		}
	}
	return candidates;
}

/**
 * Parse `owner` and `repo` from `git remote -v` output. When `remoteName` is
 * provided, only that remote is considered. Otherwise, `origin` is preferred.
 *
 * Exported for tests.
 */
export function parseGitHubRepoFromRemote(remotesOutput: string | undefined, remoteName?: string): { owner: string; repo: string } | undefined {
	const candidates = remoteName === undefined
		? parseFetchRemoteUrls(remotesOutput)
		: parseFetchRemotes(remotesOutput)?.filter(candidate => candidate.name === remoteName).map(candidate => candidate.url);
	if (!candidates) {
		return undefined;
	}
	for (const url of candidates) {
		const parsed = parseGitHubOwnerRepoFromUrl(url);
		if (parsed) {
			return parsed;
		}
	}
	return undefined;
}

/**
 * Selects the remote to push a branch to when the caller does not name one:
 * the branch's configured push remote (`branch.<name>.pushRemote`,
 * `remote.pushDefault` or `branch.<name>.remote`), else the remote the GitHub
 * repository is resolved from (preferring `origin`), else `origin`, else the
 * only remote.
 *
 * Exported for tests.
 */
export function selectDefaultPushRemote(remotesOutput: string | undefined, configuredPushRemote: string | undefined): string | undefined {
	if (configuredPushRemote) {
		return configuredPushRemote;
	}
	const remotes = parseFetchRemotes(remotesOutput) ?? [];
	const origin = remotes.find(remote => remote.name === 'origin');
	const ordered = origin ? [origin, ...remotes.filter(remote => remote !== origin)] : remotes;
	return ordered.find(remote => parseGitHubOwnerRepoFromUrl(remote.url))?.name
		?? origin?.name
		?? (remotes.length === 1 ? remotes[0].name : undefined);
}

function parseGitHubHeadRepoFromRemoteSelection(remotesOutput: string | undefined, remoteSelection: string | undefined): { owner: string; repo: string } | undefined {
	if (!remoteSelection) {
		return undefined;
	}
	return parseGitHubRepoFromRemote(remotesOutput, remoteSelection) ?? parseGitHubOwnerRepoFromUrl(remoteSelection);
}

/**
 * Extract `{owner, repo}` from a GitHub remote URL. Handles the common
 * forms: `git@github.com:owner/repo(.git)?`, `https://github.com/owner/repo(.git)?`,
 * `ssh://git@github.com/owner/repo(.git)?`, `git://github.com/owner/repo(.git)?`.
 */
export function parseGitHubOwnerRepoFromUrl(url: string): { owner: string; repo: string } | undefined {
	// SCP-like: git@github.com:owner/repo(.git)?
	let m = /^[^@\s]+@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(url);
	if (m) {
		return { owner: m[1], repo: m[2] };
	}
	// URL-form: <scheme>://[user@]github.com[:port]/owner/repo(.git)?
	m = /^[a-z+]+:\/\/(?:[^@\/\s]+@)?github\.com(?::\d+)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(url);
	if (m) {
		return { owner: m[1], repo: m[2] };
	}
	return undefined;
}

/** Exported for tests. */
export function parseDefaultBranchRef(symbolicRefOutput: string | undefined): string | undefined {
	const ref = symbolicRefOutput?.trim();
	if (!ref) { return undefined; }
	const prefix = 'refs/remotes/origin/';
	return ref.startsWith(prefix) ? ref.substring(prefix.length) : ref;
}

/**
 * Parses the target of `refs/remotes/origin/HEAD` (e.g. `refs/remotes/origin/main`)
 * into the default branch name (`main`) and its remote-tracking branch
 * (`origin/main`). Returns `undefined` for targets outside `refs/remotes/origin/`.
 */
export function parseDefaultRemoteBranchRef(symbolicRefOutput: string | undefined): { readonly branchName: string; readonly remoteBranchName: string } | undefined {
	const ref = symbolicRefOutput?.trim();
	const prefix = 'refs/remotes/origin/';
	if (!ref?.startsWith(prefix) || ref.length === prefix.length) {
		return undefined;
	}
	return {
		branchName: ref.substring(prefix.length),
		remoteBranchName: ref.substring('refs/remotes/'.length),
	};
}

export function parseRemoteBranchRef(ref: string): { ref: string; name: string; remote: string } | undefined {
	if (!ref.startsWith('refs/remotes/')) {
		return undefined;
	}

	const name = ref.substring(13);
	const remote = name.split('/')[0];
	return { ref, name, remote };
}

export function parseGitRefs(output: string | undefined): GitRef[] {
	if (!output) {
		return [];
	}

	const refs: GitRef[] = [];
	for (const line of output.split(/\r?\n/g)) {
		const [ref, upstream] = line.trim().split('\0');

		if (ref.startsWith('refs/heads/')) {
			refs.push({
				ref,
				name: ref.substring(11),
				upstream: upstream
					? parseRemoteBranchRef(upstream)
					: undefined,
				kind: GitRefType.Head
			} satisfies IBranch);
		} else if (ref.startsWith('refs/remotes/') && !/^refs\/remotes\/[^/]+\/HEAD$/.test(ref)) {
			const parsedRemoteBranch = parseRemoteBranchRef(ref);
			if (parsedRemoteBranch) {
				refs.push({
					...parsedRemoteBranch,
					kind: GitRefType.RemoteHead
				} satisfies IRemoteBranch);
			}
		} else if (ref.startsWith('refs/tags/')) {
			refs.push({
				ref,
				name: ref.substring(10),
				kind: GitRefType.Tag
			} satisfies ITag);
		}
	}

	return refs;
}

function stripUndefined<T extends object>(obj: T): T {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v !== undefined) { out[k] = v; }
	}
	return out as T;
}

function isMaxBufferError(error: unknown): boolean {
	const cause = error instanceof Error ? error.cause : undefined;
	return cause instanceof Error && (cause as cp.ExecFileException).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
}
