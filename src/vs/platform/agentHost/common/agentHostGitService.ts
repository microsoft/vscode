/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { LRUCache } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ISessionFileDiff, ISessionGitState } from './state/sessionState.js';

/**
 * Provider-agnostic session-database metadata key under which agents
 * persist the branch they want git-driven diffs anchored to. Read by
 * {@link IAgentHostChangesetService} when computing per-session file diffs; absent
 * value means the diff falls back to anchoring at HEAD.
 */
export const META_DIFF_BASE_BRANCH = 'agentHost.diffBaseBranch';

/**
 * Resolves the Branch Changes base-branch **name** from its two sources, in
 * precedence order: the agent-persisted {@link META_DIFF_BASE_BRANCH} metadata
 * value, then the session git state's detected base branch. Returns `undefined`
 * when neither is available (callers then anchor the diff at `HEAD`).
 *
 * Shared by {@link IAgentHostChangesetService} and the review service so both
 * pick the same base branch.
 */
export function resolveDiffBaseBranchName(persistedBaseBranch: string | undefined, sessionGitStateBaseBranch: string | undefined): string | undefined {
	const branchName = persistedBaseBranch ?? sessionGitStateBaseBranch;
	if (!branchName) {
		return undefined;
	}
	return branchName
		.replace(/^refs\/remotes\/origin\//, '')
		.replace(/^origin\//, '');
}

/**
 * The well-known SHA-1 of git's empty tree, used as a fallback when a
 * repository has no commits (no `HEAD` to read into the temp index).
 */
export const EMPTY_TREE_OBJECT = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Options for {@link IAgentHostGitService.computeSessionFileDiffs}. */
export interface IComputeSessionFileDiffsOptions {
	/**
	 * The session URI, used as the authority of the produced
	 * `git-blob:` URIs so the resolver can find the session's working
	 * directory.
	 */
	readonly sessionUri: string;
	/**
	 * The branch to diff against. Typically the worktree's start-point
	 * branch (for worktree sessions) or the repository's default branch.
	 * When undefined or unresolvable, the diff is taken against `HEAD`,
	 * which surfaces uncommitted work but no committed-on-branch work.
	 */
	readonly baseBranch?: string;
}

/** Cheap repository facts used to decide whether a branch diff is safe to compute. */
export interface IBranchDiffSafetyInfo {
	readonly hasVirtualFileSystem: boolean;
	readonly baselineCommitTimestamp: number | undefined;
	readonly commitCount: number | undefined;
	readonly workspaceFileCount: number;
}

/** A bounded unified-diff result. */
export interface IDiffPatchResult {
	readonly patch: string | undefined;
	readonly tooLarge: boolean;
}

/** Options for {@link IAgentHostGitService.push}. */
export interface IPushOptions {
	/** The branch or refspec to push. Defaults to the current branch. */
	readonly ref?: string;
	/** The remote to push to. Defaults to `origin`. */
	readonly remote?: string;
	/**
	 * When true, the push uses `-u` so the pushed branch tracks the remote
	 * branch for subsequent fetch/push commands.
	 */
	readonly setUpstream?: boolean;
}

/** Options for {@link IAgentHostGitService.pull}. */
export interface IPullOptions {
	/** The branch or ref to pull. Defaults to the configured upstream. */
	readonly ref?: string;
	/** The remote to pull from. Defaults to `origin`. */
	readonly remote?: string;
	/** When true, local commits are rebased onto the fetched ref (`-r`) instead of merged. */
	readonly rebase?: boolean;
}

export const IAgentHostGitService = createDecorator<IAgentHostGitService>('agentHostGitService');

/**
 * Resolves linked checkouts to their primary worktree and caches successful mappings for every worktree reported by Git.
 * Resolution is serialized so concurrent requests across linked checkouts share one probe, while empty results remain retryable.
 */
class PrimaryWorktreeRootResolver {
	private readonly _roots = new LRUCache<string, URI>(100);
	private readonly _sequencer = new Sequencer();

	constructor(private readonly _gitService: IAgentHostGitService) { }

	async resolve(checkoutRoot: URI): Promise<URI | undefined> {
		const key = checkoutRoot.toString();
		const cached = this._roots.get(key);
		if (cached) {
			return cached;
		}
		return this._sequencer.queue(async () => {
			const cached = this._roots.get(key);
			if (cached) {
				return cached;
			}
			const roots = await this._gitService.getWorktreeRoots(checkoutRoot);
			const primaryRoot = roots[0];
			if (!primaryRoot) {
				return undefined;
			}
			this._roots.set(key, primaryRoot);
			for (const root of roots) {
				this._roots.set(root.toString(), primaryRoot);
			}
			return primaryRoot;
		});
	}
}

/** Resolver lifetime follows the injected Git service; each resolver owns a bounded path cache. */
const primaryWorktreeRootResolvers = new WeakMap<IAgentHostGitService, PrimaryWorktreeRootResolver>();

/** Resolves the primary worktree root when Git reports a worktree listing. */
export function tryResolvePrimaryWorktreeRoot(gitService: IAgentHostGitService, checkoutRoot: URI): Promise<URI | undefined> {
	let resolver = primaryWorktreeRootResolvers.get(gitService);
	if (!resolver) {
		resolver = new PrimaryWorktreeRootResolver(gitService);
		primaryWorktreeRootResolvers.set(gitService, resolver);
	}
	return resolver.resolve(checkoutRoot);
}

export interface IRefQuery {
	readonly count?: number;
	readonly pattern?: string | string[];
	readonly sort?: 'alphabetically' | 'committerdate' | 'creatordate';
}

export type Branch = IBranch | IRemoteBranch;
export type GitRef = IBranch | IRemoteBranch | ITag;

export const enum GitRefType {
	Head,
	RemoteHead,
	DetachedHead,
	Tag
}

export interface IBranch {
	readonly ref: string;
	readonly name: string;
	readonly upstream?: {
		readonly ref: string;
		readonly name: string;
		readonly remote: string;
	};
	readonly kind: GitRefType.Head;
}

export interface IRemoteBranch {
	readonly ref: string;
	readonly name: string;
	readonly remote: string;
	readonly kind: GitRefType.RemoteHead;
}

export interface ITag {
	readonly ref: string;
	readonly name: string;
	readonly kind: GitRefType.Tag;
}

export interface IDetachedHead {
	readonly name: string;
	readonly kind: GitRefType.DetachedHead;
}

export interface IDefaultBranch {
	readonly name: string;
	readonly startPoint: string;
}

/** How far along a worktree file operation is, in files. */
export interface IWorktreeFileProgress {
	readonly filesDone: number;
	readonly filesTotal: number;
}

export interface IAddWorktreeOptions {
	readonly path: URI;
	readonly commitish: string;
	readonly newBranchName?: string;
	readonly track: boolean;
	readonly preferRemoteBranch?: boolean;
	readonly onProgress?: (progress: IWorktreeFileProgress) => void;
}

export interface IAgentHostGitService {
	readonly _serviceBrand: undefined;
	getCurrentBranch(workingDirectory: URI): Promise<string | undefined>;
	getCurrentBranchName?(workingDirectory: URI): Promise<string | undefined>;
	getDefaultBranch(workingDirectory: URI): Promise<IDefaultBranch | undefined>;
	getRefs(workingDirectory: URI, query?: IRefQuery): Promise<GitRef[]>;
	getBranches(workingDirectory: URI, query?: IRefQuery): Promise<Branch[]>;
	getBranch(workingDirectory: URI, name: string): Promise<Branch | undefined>;
	getRepositoryRoot(workingDirectory: URI): Promise<URI | undefined>;
	/** Returns worktree roots in Git's porcelain order, with the primary worktree first. */
	getWorktreeRoots(workingDirectory: URI): Promise<URI[]>;
	/**
	 * Creates a worktree, optionally on a new branch. `onProgress` receives every checkout
	 * sample git reports, which can be several per second, so consumers are
	 * expected to round and rate limit for their own presentation. It may also
	 * never be called (fast checkouts and git versions that stay silent), so it
	 * MUST be treated as best-effort.
	 */
	addWorktree(repositoryRoot: URI, options: IAddWorktreeOptions): Promise<void>;
	/**
	 * Copies the git-ignored files matching `globs` into the worktree.
	 * `onProgress` counts the individual files covered, but only fires as whole
	 * entries finish — a wholly-ignored directory such as `node_modules` is
	 * copied as one recursive unit, so its files all land in a single step.
	 */
	copyWorktreeIncludeFiles(repositoryRoot: URI, worktree: URI, globs: readonly string[], onProgress?: (progress: IWorktreeFileProgress) => void): Promise<void>;
	/**
	 * Adds a worktree for an existing branch (no `-b`). Used when restoring
	 * a worktree whose branch was preserved (e.g. unarchiving a session
	 * whose worktree was previously cleaned up on archive).
	 */
	addExistingWorktree(repositoryRoot: URI, worktree: URI, branchName: string): Promise<void>;
	/** Removes a worktree, preserving Git's dirty-worktree protection unless `force` is explicitly requested. */
	removeWorktree(repositoryRoot: URI, worktree: URI, options?: { readonly force?: boolean }): Promise<void>;
	/**
	 * Returns true when the named branch exists in the repository
	 * (`refs/heads/<branchName>` resolves). Used by archive cleanup to
	 * confirm the branch is preserved before deleting the worktree, and by
	 * the unarchive path to confirm the branch is still around before
	 * recreating the worktree.
	 */
	branchExists(repositoryRoot: URI, branchName: string): Promise<boolean>;
	/** Creates a new branch and optionally checks it out while preserving the working tree. */
	createBranch(workingDirectory: URI, branchName: string, options?: { readonly checkout?: boolean }): Promise<void>;
	/**
	 * Returns true when the working tree has any tracked, staged, or
	 * untracked changes. Used by archive cleanup to skip removing a
	 * worktree that still contains uncommitted work.
	 */
	hasUncommittedChanges(workingDirectory: URI): Promise<boolean>;

	/**
	 * Stages and commits all tracked, staged, and untracked changes in the
	 * working tree. Mirrors the Copilot CLI session PR path, which commits
	 * uncommitted work before creating a pull request.
	 */
	commitAll(workingDirectory: URI, message: string): Promise<void>;

	/**
	 * Merges `branchName` into the currently checked-out branch. A failed merge is aborted before the error is rethrown.
	 */
	mergeBranch(workingDirectory: URI, branchName: string): Promise<string>;

	/**
	 * Restores files in the working tree via `git restore`. When
	 * {@link options.staged} is true, restores the index instead of the
	 * working tree. When {@link options.ref} is provided, the contents are
	 * taken from that ref (`--source`). An empty {@link paths} array
	 * restores everything (`.`).
	 */
	restore(workingDirectory: URI, paths: readonly string[], options?: { readonly staged?: boolean; readonly ref?: string }): Promise<void>;

	/**
	 * Returns true when the named branch has an upstream tracking ref
	 * (i.e. `<branch>@{upstream}` resolves). Used before {@link push}
	 * to decide whether `--set-upstream` is needed.
	 */
	hasUpstream(workingDirectory: URI, branchName: string): Promise<boolean>;

	/**
	 * Fetches the latest changes from the remote (`origin` unless
	 * {@link IPullOptions.remote} overrides it) and integrates them into the
	 * current branch. When {@link IPullOptions.rebase} is true, local commits
	 * are rebased onto the fetched ref instead of merged. When
	 * {@link IPullOptions.ref} is provided, that ref is pulled instead of the
	 * branch's configured upstream.
	 */
	pull(workingDirectory: URI, options?: IPullOptions): Promise<void>;

	/**
	 * Pushes the current branch (or {@link IPushOptions.ref}) to the remote
	 * (`origin` unless {@link IPushOptions.remote} overrides it). When
	 * {@link IPushOptions.setUpstream} is true, the push uses `-u` so
	 * subsequent fetch/push commands track the remote branch.
	 */
	push(workingDirectory: URI, options?: IPushOptions): Promise<void>;

	/**
	 * Computes the {@link ISessionGitState} for the working directory by
	 * shelling out to `git`. Returns undefined if the directory is not a
	 * git work tree. Called on session open and after each turn completes
	 * so the UI always reflects current branch/remote/change state.
	 */
	getSessionGitState(workingDirectory: URI, baseBranchName?: string): Promise<ISessionGitState | undefined>;
	/** Returns fetch remote URLs with the preferred remote, then `origin`, first. */
	getFetchRemoteUrls(workingDirectory: URI, preferredRemote?: string): Promise<readonly string[] | undefined>;
	/** Returns repo-relative untracked file paths. */
	getUntrackedPaths(workingDirectory: URI): Promise<readonly string[] | undefined>;

	/**
	 * Computes per-file diffs for the session by shelling out to `git
	 * diff --raw --numstat --diff-filter=ADMR -z` against the merge base of
	 * the current branch and {@link IComputeSessionFileDiffsOptions.baseBranch}
	 * (or `HEAD` if no base branch is available). When the working tree has
	 * untracked files, the diff is computed via a temp index so the
	 * untracked content is included.
	 *
	 * Returns `undefined` when {@link workingDirectory} is not a git work
	 * tree, so callers can fall back to other diff sources.
	 *
	 * Each returned {@link ISessionFileDiff} has its `before.content` set to
	 * a `git-blob:` URI ({@link buildGitBlobUri}); `after.content` is a
	 * `file:` URI on the working-tree path. Adds and deletes drop the
	 * missing side.
	 */
	computeSessionFileDiffs(workingDirectory: URI, options: IComputeSessionFileDiffsOptions): Promise<readonly ISessionFileDiff[] | undefined>;

	/**
	 * Resolves the commit-ish the **Branch Changes** baseline is measured from:
	 * the merge-base of `HEAD` and `baseBranch` (preferring the
	 * `origin/<baseBranch>` remote-tracking ref when it exists), falling back to
	 * `HEAD`, then to the empty-tree object for a repo with no commits. Returns
	 * `undefined` only when {@link workingDirectory} is not a git work tree.
	 *
	 * Shared by {@link computeSessionFileDiffs} (which anchors the Branch Changes
	 * diff here) and the review service, so both agree on the exact baseline.
	 */
	resolveBranchBaselineCommit(workingDirectory: URI, baseBranch?: string): Promise<string | undefined>;

	/**
	 * Reads a single git blob via `git show <ref>:<repoRelativePath>` from
	 * the given working directory. Returns `undefined` when the blob does
	 * not exist or the directory is not a git work tree.
	 */
	showBlob(workingDirectory: URI, ref: string, repoRelativePath: string): Promise<VSBuffer | undefined>;

	// ---- Checkpoint plumbing (used by IAgentHostCheckpointService) -------

	/**
	 * Captures the current working tree (including untracked files) as a
	 * tree object, returning the tree OID. Uses a throwaway `GIT_INDEX_FILE`
	 * so the user's real index is untouched. Returns `undefined` when the
	 * directory is not a git work tree.
	 */
	captureWorkingTreeAsTree(workingDirectory: URI): Promise<string | undefined>;

	/**
	 * Creates a commit object from a tree (optionally chained to a parent)
	 * and returns its OID. Does NOT update any ref.
	 */
	commitTree(repositoryRoot: URI, treeOid: string, parentOid: string | undefined, message: string): Promise<string | undefined>;

	/**
	 * Updates a ref to point at `newOid`. Creates the ref if missing.
	 */
	updateRef(repositoryRoot: URI, ref: string, newOid: string): Promise<void>;

	/**
	 * Batch-deletes the given refs via `git update-ref --stdin -z`.
	 * Missing refs are tolerated.
	 */
	deleteRefs(repositoryRoot: URI, refs: readonly string[]): Promise<void>;

	/**
	 * Resolves a ref/object expression to its OID, e.g. `revParse(repo, 'refs/agents/abc/...')`
	 * or `revParse(repo, '<commit>^{tree}')`. Returns `undefined` when the
	 * ref does not exist.
	 */
	revParse(repositoryRoot: URI, expression: string): Promise<string | undefined>;

	/**
	 * Lists refs matching `pattern` (a `git for-each-ref` glob such as
	 * `refs/sessions/<id>/*`) with their resolved commit OIDs. Returns an empty
	 * array when none match. Optional: implementations that don't support raw
	 * ref enumeration may omit it.
	 */
	listRefNamesWithOids?(repositoryRoot: URI, pattern: string): Promise<Array<{ readonly ref: string; readonly oid: string }>>;

	/**
	 * Builds a new tree from `baseTreeOid` in which the single repo-relative
	 * `path` is replaced by its content (blob + mode) from `sourceTreeOid`, or
	 * removed when the path is absent in `sourceTreeOid`. All other paths are
	 * copied verbatim from `baseTreeOid`. Uses a throwaway `GIT_INDEX_FILE` so
	 * the user's real index is untouched. Returns the new tree OID, or
	 * `undefined` on git failure.
	 *
	 * File-level building block for review (see `IAgentHostReviewService`): to
	 * mark a file reviewed, overlay it from the working-tree snapshot tree; to
	 * unmark, overlay it from the baseline tree.
	 */
	overlayPathIntoTree(repositoryRoot: URI, baseTreeOid: string, path: string, sourceTreeOid: string): Promise<string | undefined>;

	/**
	 * Returns the repo-relative paths that differ between two tree-ish (commit
	 * or tree) objects via `git diff --name-only --no-renames -z`. Rename
	 * detection is off so a rename shows as delete(old) + add(new). Returns
	 * `undefined` on git failure (e.g. not a git work tree).
	 */
	diffTreePaths(repositoryRoot: URI, fromTreeish: string, toTreeish: string): Promise<string[] | undefined>;

	/**
	 * Computes per-file diffs between two refs (typically two consecutive
	 * checkpoint refs) by shelling out to
	 * `git diff --raw --numstat --diff-filter=ADMR -z <fromRef> <toRef>`.
	 * Returns the same {@link ISessionFileDiff} shape as
	 * {@link computeSessionFileDiffs}: `before.content` is a `git-blob:`
	 * URI anchored on `fromRef`, `after.content` is a `git-blob:` URI
	 * anchored on `toRef`. Returns `undefined` on git failure.
	 *
	 * Used by the changeset service to materialise per-turn diffs from
	 * checkpoint refs when they are available — that path captures
	 * terminal-tool edits the FileEditTracker pipeline misses.
	 */
	computeFileDiffsBetweenRefs(workingDirectory: URI, options: { readonly sessionUri: string; readonly fromRef: string; readonly toRef: string }): Promise<readonly ISessionFileDiff[] | undefined>;
	/** Reads bounded facts needed before computing an expensive branch diff. */
	getBranchDiffSafetyInfo(workingDirectory: URI, baselineCommit: string): Promise<IBranchDiffSafetyInfo | undefined>;
	/** Computes a unified patch for paths between immutable tree-ish values. */
	getDiffPatchBetweenRefs(workingDirectory: URI, options: { readonly fromRef: string; readonly toRef: string; readonly paths: readonly string[]; readonly maxBuffer: number }): Promise<IDiffPatchResult | undefined>;
}

function getBranchPriority(branch: string, currentBranch: string | undefined, defaultBranch: string | undefined): number {
	if (branch === currentBranch) {
		return 0;
	}
	if (branch === defaultBranch) {
		return 1;
	}
	return 2;
}

/**
 * Splits an upstream tracking branch (e.g. `origin/feature`) into its remote
 * and remote-side branch name. Returns `undefined` when the branch has no
 * upstream or the value is not of the `<remote>/<branch>` shape.
 */
export function parseUpstreamBranchName(upstreamBranchName: string | undefined): { remote: string; branch: string } | undefined {
	const separatorIndex = upstreamBranchName?.indexOf('/') ?? -1;
	if (!upstreamBranchName || separatorIndex <= 0 || separatorIndex === upstreamBranchName.length - 1) {
		return undefined;
	}
	return {
		remote: upstreamBranchName.substring(0, separatorIndex),
		branch: upstreamBranchName.substring(separatorIndex + 1),
	};
}

export function getBranchCompletions(branches: readonly string[], options?: { readonly currentBranch?: string; readonly defaultBranch?: string; readonly query?: string; readonly limit?: number }): string[] {
	const normalizedQuery = options?.query?.toLowerCase();
	const filtered = normalizedQuery
		? branches.filter(branch => branch.toLowerCase().includes(normalizedQuery))
		: [...branches];

	filtered.sort((a, b) => getBranchPriority(a, options?.currentBranch, options?.defaultBranch) - getBranchPriority(b, options?.currentBranch, options?.defaultBranch));
	return options?.limit ? filtered.slice(0, options.limit) : filtered;
}
