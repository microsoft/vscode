/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { URI } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { FileEditKind, type ISessionFileDiff, type ISessionGitState } from '../common/state/sessionState.js';
import { buildGitBlobUri } from './gitDiffContent.js';

export const IAgentHostGitService = createDecorator<IAgentHostGitService>('agentHostGitService');

export interface IAgentHostGitService {
	readonly _serviceBrand: undefined;
	isInsideWorkTree(workingDirectory: URI): Promise<boolean>;
	getCurrentBranch(workingDirectory: URI): Promise<string | undefined>;
	getDefaultBranch(workingDirectory: URI): Promise<string | undefined>;
	getBranches(workingDirectory: URI, options?: { readonly query?: string; readonly limit?: number }): Promise<string[]>;
	getRepositoryRoot(workingDirectory: URI): Promise<URI | undefined>;
	getWorktreeRoots(workingDirectory: URI): Promise<URI[]>;
	addWorktree(repositoryRoot: URI, worktree: URI, branchName: string, startPoint: string): Promise<void>;
	/**
	 * Adds a worktree for an existing branch (no `-b`). Used when restoring
	 * a worktree whose branch was preserved (e.g. unarchiving a session
	 * whose worktree was previously cleaned up on archive).
	 */
	addExistingWorktree(repositoryRoot: URI, worktree: URI, branchName: string): Promise<void>;
	removeWorktree(repositoryRoot: URI, worktree: URI): Promise<void>;
	/**
	 * Returns true when the named branch exists in the repository
	 * (`refs/heads/<branchName>` resolves). Used by archive cleanup to
	 * confirm the branch is preserved before deleting the worktree, and by
	 * the unarchive path to confirm the branch is still around before
	 * recreating the worktree.
	 */
	branchExists(repositoryRoot: URI, branchName: string): Promise<boolean>;
	/**
	 * Returns true when the working tree has any tracked, staged, or
	 * untracked changes. Used by archive cleanup to skip removing a
	 * worktree that still contains uncommitted work.
	 */
	hasUncommittedChanges(workingDirectory: URI): Promise<boolean>;
	/**
	 * Computes the {@link ISessionGitState} for the working directory by
	 * shelling out to `git`. Returns undefined if the directory is not a
	 * git work tree. Called on session open and after each turn completes
	 * so the UI always reflects current branch/remote/change state.
	 */
	getSessionGitState(workingDirectory: URI): Promise<ISessionGitState | undefined>;

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
	 * Reads a single git blob via `git show <sha>:<repoRelativePath>` from
	 * the given working directory. Returns `undefined` when the blob does
	 * not exist or the directory is not a git work tree.
	 */
	showBlob(workingDirectory: URI, sha: string, repoRelativePath: string): Promise<VSBuffer | undefined>;
}

/**
 * Provider-agnostic session-database metadata key under which agents
 * persist the branch they want git-driven diffs anchored to. Read by
 * {@link AgentSideEffects} when computing per-session file diffs; absent
 * value means the diff falls back to anchoring at HEAD.
 */
export const META_DIFF_BASE_BRANCH = 'agentHost.diffBaseBranch';

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

function getCommonBranchPriority(branch: string): number {
	if (branch === 'main') {
		return 0;
	}
	if (branch === 'master') {
		return 1;
	}
	return 2;
}

export function getBranchCompletions(branches: readonly string[], options?: { readonly query?: string; readonly limit?: number }): string[] {
	const normalizedQuery = options?.query?.toLowerCase();
	const filtered = normalizedQuery
		? branches.filter(branch => branch.toLowerCase().includes(normalizedQuery))
		: [...branches];

	filtered.sort((a, b) => getCommonBranchPriority(a) - getCommonBranchPriority(b));
	return options?.limit ? filtered.slice(0, options.limit) : filtered;
}

export class AgentHostGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
	) { }

	async isInsideWorkTree(workingDirectory: URI): Promise<boolean> {
		return (await this._runGit(workingDirectory, ['rev-parse', '--is-inside-work-tree']))?.trim() === 'true';
	}

	async getCurrentBranch(workingDirectory: URI): Promise<string | undefined> {
		return (await this._runGit(workingDirectory, ['branch', '--show-current']))?.trim()
			|| (await this._runGit(workingDirectory, ['rev-parse', '--short', 'HEAD']))?.trim()
			|| undefined;
	}

	async getDefaultBranch(workingDirectory: URI): Promise<string | undefined> {
		// Try to read the default branch from the remote HEAD reference
		const remoteRef = (await this._runGit(workingDirectory, ['symbolic-ref', 'refs/remotes/origin/HEAD']))?.trim();
		if (remoteRef) {
			if (!remoteRef.startsWith('refs/remotes/origin/')) {
				return remoteRef;
			}

			const branch = remoteRef.substring('refs/remotes/origin/'.length);
			// Prefer the remote-tracking ref ('origin/<branch>') over the local
			// branch when both exist, so worktrees are based on the most
			// up-to-date commit rather than a possibly stale local branch.
			// This mirrors the extension-host CLI which resolves a branch's
			// upstream and uses that as the worktree start point. Falls back
			// to the local branch when the remote-tracking ref is missing
			// (e.g. fresh clone with no remote-tracking refs yet).
			const hasRemoteRef = (await this._runGit(workingDirectory, ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`])) !== undefined;
			if (hasRemoteRef) {
				return `origin/${branch}`;
			}
			const hasLocalBranch = (await this._runGit(workingDirectory, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])) !== undefined;
			return hasLocalBranch ? branch : undefined;
		}
		return undefined;
	}

	async getBranches(workingDirectory: URI, options?: { readonly query?: string; readonly limit?: number }): Promise<string[]> {
		const args = ['for-each-ref', '--format=%(refname:short)', '--sort=-committerdate'];
		args.push('refs/heads');

		const output = await this._runGit(workingDirectory, args);
		if (!output) {
			return [];
		}
		const branches = output.split(/\r?\n/g).map(line => line.trim()).filter(branch => branch.length > 0);
		return getBranchCompletions(branches, options);
	}

	async getRepositoryRoot(workingDirectory: URI): Promise<URI | undefined> {
		const repositoryRootPath = (await this._runGit(workingDirectory, ['rev-parse', '--show-toplevel']))?.trim();
		return repositoryRootPath ? URI.file(repositoryRootPath) : undefined;
	}

	async getWorktreeRoots(workingDirectory: URI): Promise<URI[]> {
		const output = await this._runGit(workingDirectory, ['worktree', 'list', '--porcelain']);
		if (!output) {
			return [];
		}
		return output.split(/\r?\n/g)
			.filter(line => line.startsWith('worktree '))
			.map(line => URI.file(line.substring('worktree '.length)));
	}

	async addWorktree(repositoryRoot: URI, worktree: URI, branchName: string, startPoint: string): Promise<void> {
		// Pass --no-track so the new agent branch never picks up upstream
		// tracking from the start point (e.g. when starting from
		// 'origin/main', without --no-track git would set the new branch's
		// upstream to origin/main, which would mis-attribute pushes/pulls).
		await this._runGit(repositoryRoot, ['worktree', 'add', '--no-track', '-b', branchName, worktree.fsPath, startPoint], { timeout: 30_000, throwOnError: true });
	}

	async addExistingWorktree(repositoryRoot: URI, worktree: URI, branchName: string): Promise<void> {
		await this._runGit(repositoryRoot, ['worktree', 'add', worktree.fsPath, branchName], { timeout: 30_000, throwOnError: true });
	}

	async removeWorktree(repositoryRoot: URI, worktree: URI): Promise<void> {
		await this._runGit(repositoryRoot, ['worktree', 'remove', '--force', worktree.fsPath], { timeout: 30_000, throwOnError: true });
	}

	async branchExists(repositoryRoot: URI, branchName: string): Promise<boolean> {
		// `show-ref --verify --quiet` exits 0 when the ref exists and 1 otherwise.
		// `_runGit` returns undefined on non-zero exit, so `!== undefined` is the existence signal.
		const output = await this._runGit(repositoryRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);
		return output !== undefined;
	}

	async hasUncommittedChanges(workingDirectory: URI): Promise<boolean> {
		const output = await this._runGit(workingDirectory, ['status', '--porcelain']);
		return !!output && output.trim().length > 0;
	}

	async computeSessionFileDiffs(workingDirectory: URI, options: IComputeSessionFileDiffsOptions): Promise<readonly ISessionFileDiff[] | undefined> {
		// Bail fast if not inside a git work tree so callers can fall back
		// to other diff sources.
		const inside = await this._runGit(workingDirectory, ['rev-parse', '--is-inside-work-tree']);
		if (inside?.trim() !== 'true') {
			return undefined;
		}

		// All git invocations run from the working tree's repository root so
		// `--raw` paths are repo-relative — that's what `git show <sha>:<path>`
		// expects when we resolve `git-blob:` URIs later.
		const repositoryRootPath = (await this._runGit(workingDirectory, ['rev-parse', '--show-toplevel']))?.trim();
		if (!repositoryRootPath) {
			return undefined;
		}
		const repositoryRoot = URI.file(repositoryRootPath);

		// Resolve the merge-base commit. With a base branch, this is
		// `merge-base HEAD <base>` so the diff stays anchored even when the
		// base branch advances. Without one, fall back to HEAD itself, which
		// surfaces uncommitted work but no committed-on-branch work — the
		// best we can do without context. For empty repos with no HEAD, fall
		// back to the well-known empty-tree object.
		let mergeBaseCommit: string | undefined;
		if (options.baseBranch) {
			mergeBaseCommit = (await this._runGit(repositoryRoot, ['merge-base', 'HEAD', options.baseBranch]))?.trim();
		}
		if (!mergeBaseCommit) {
			mergeBaseCommit = (await this._runGit(repositoryRoot, ['rev-parse', 'HEAD']))?.trim();
		}
		if (!mergeBaseCommit) {
			mergeBaseCommit = EMPTY_TREE_OBJECT;
		}

		// Detect whether the working tree has any untracked files. If so we
		// have to use the temp-index trick so the untracked content is
		// included in `--cached --raw` output; otherwise a plain `git diff`
		// is sufficient and avoids the temp-dir overhead.
		const statusOut = await this._runGit(repositoryRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
		const untracked = parseUntrackedPaths(statusOut);

		let rawDiffOutput: string | undefined;
		if (untracked.length === 0) {
			rawDiffOutput = await this._runGit(repositoryRoot, ['diff', '--raw', '--numstat', '--diff-filter=ADMR', '-z', mergeBaseCommit, '--']);
		} else {
			rawDiffOutput = await this._runWithTempIndex(repositoryRoot, mergeBaseCommit);
		}

		if (rawDiffOutput === undefined) {
			return undefined;
		}

		return parseGitDiffRawNumstat(rawDiffOutput, repositoryRoot, options.sessionUri, mergeBaseCommit);
	}

	private async _runWithTempIndex(repositoryRoot: URI, mergeBaseCommit: string): Promise<string | undefined> {
		// Build a throwaway index so we can stage the entire working tree
		// (including untracked files) without disturbing the user's real
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
			// Stage every change in the working tree (modified, deleted,
			// untracked, renamed). `add -A` plus an explicit `:/` pathspec
			// covers the entire repo from any cwd.
			await this._runGit(repositoryRoot, ['add', '-A', '--', ':/'], { env });
			return await this._runGit(repositoryRoot, ['diff', '--cached', '--raw', '--numstat', '--diff-filter=ADMR', '-z', mergeBaseCommit, '--'], { env });
		} finally {
			try { await this._fileService.del(tempDir, { recursive: true, useTrash: false }); } catch { /* best-effort */ }
		}
	}

	async showBlob(workingDirectory: URI, sha: string, repoRelativePath: string): Promise<VSBuffer | undefined> {
		// Validate sha before passing it to git. `git show <sha>:<path>` parses
		// its argument as a revision, so an attacker-controlled sha that starts
		// with `-` could inject options, and a non-hex value could resolve to
		// commit could resolve to surprising refs. Object names are 4-64 lowercase hex chars.
		if (!/^[0-9a-f]{4,64}$/.test(sha)) {
			return undefined;
		}
		const inside = await this._runGit(workingDirectory, ['rev-parse', '--is-inside-work-tree']);
		if (inside?.trim() !== 'true') {
			return undefined;
		}
		// `git show` exits non-zero when the path didn't exist at that
		// commit; `_runGit` swallows that into `undefined` which is exactly
		// the contract callers want.
		return new Promise((resolve) => {
			cp.execFile('git', ['show', `${sha}:${repoRelativePath}`], { cwd: workingDirectory.fsPath, timeout: 5000, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
				if (error) {
					resolve(undefined);
					return;
				}
				resolve(VSBuffer.wrap(stdout as Buffer));
			});
		});
	}

	async getSessionGitState(workingDirectory: URI): Promise<ISessionGitState | undefined> {
		return this._computeSessionGitState(workingDirectory);
	}

	private async _computeSessionGitState(workingDirectory: URI): Promise<ISessionGitState | undefined> {
		// Bail fast if not inside a git work tree.
		const inside = await this._runGit(workingDirectory, ['rev-parse', '--is-inside-work-tree']);
		if (inside?.trim() !== 'true') {
			return undefined;
		}

		// Run all probes in parallel. Each handles its own errors and returns
		// undefined on failure so we can populate fields independently.
		const [
			statusOutput,
			remotesOutput,
			defaultBranchRef,
		] = await Promise.all([
			this._runGit(workingDirectory, ['status', '-b', '--porcelain=v2']),
			this._runGit(workingDirectory, ['remote', '-v']),
			this._runGit(workingDirectory, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']),
		]);

		const status = parseGitStatusV2(statusOutput);
		const hasGitHubRemote = parseHasGitHubRemote(remotesOutput);
		const baseBranchName = parseDefaultBranchRef(defaultBranchRef);
		const githubRepo = parseGitHubRepoFromRemote(remotesOutput);

		// `git status -b --porcelain=v2` only emits ahead/behind counts when the
		// branch has an upstream tracking ref. For agent-host worktrees the
		// branch is typically created locally with no upstream, so the user can
		// have committed work that we'd otherwise report as 0 outgoing changes
		// and the "Create PR" button would never appear. Fall back to counting
		// commits relative to the base branch — that matches what the user
		// actually cares about for "is there work to PR?".
		let outgoingChanges = status.outgoingChanges;
		if (outgoingChanges === undefined && baseBranchName && status.branchName && status.branchName !== baseBranchName) {
			const ahead = await this._runGit(workingDirectory, ['rev-list', '--count', `${baseBranchName}..HEAD`]);
			const parsed = ahead === undefined ? NaN : Number(ahead.trim());
			if (Number.isFinite(parsed)) {
				outgoingChanges = parsed;
			}
		}

		const result: ISessionGitState = {
			hasGitHubRemote,
			branchName: status.branchName,
			baseBranchName,
			upstreamBranchName: status.upstreamBranchName,
			incomingChanges: status.incomingChanges,
			outgoingChanges,
			uncommittedChanges: status.uncommittedChanges,
			githubOwner: githubRepo?.owner,
			githubRepo: githubRepo?.repo,
		};
		// Strip undefined fields so the resulting object is the same regardless
		// of which probes succeeded — easier to compare in tests.
		return stripUndefined(result);
	}

	private _runGit(workingDirectory: URI, args: readonly string[], options?: { readonly timeout?: number; readonly throwOnError?: boolean; readonly env?: Record<string, string>; readonly maxBuffer?: number }): Promise<string | undefined> {
		return new Promise((resolve, reject) => {
			const env = options?.env ? { ...process.env, ...options.env } : undefined;
			// Default maxBuffer is 32MB — Node's default is ~1MB, which is
			// easy to exceed for diff output in large repos. Exceeding it
			// causes execFile to error and we'd silently drop the diff.
			cp.execFile('git', [...args], { cwd: workingDirectory.fsPath, timeout: options?.timeout ?? 5000, env, maxBuffer: options?.maxBuffer ?? 32 * 1024 * 1024 }, (error, stdout, stderr) => {
				if (error) {
					if (options?.throwOnError) {
						reject(new Error(stderr || error.message));
						return;
					}
					resolve(undefined);
					return;
				}
				resolve(stdout);
			});
		});
	}
}

/**
 * The well-known SHA-1 of git's empty tree, used as a fallback when a
 * repository has no commits (no `HEAD` to read into the temp index).
 */
export const EMPTY_TREE_OBJECT = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/**
 * Parses NUL-separated `git status --porcelain=v1 -z --untracked-files=all`
 * output and returns the repo-relative paths of untracked entries (status
 * `??`). Other entries are ignored; we only need to know whether any
 * untracked files exist to decide whether to use the temp-index path.
 *
 * Exported for tests.
 */
export function parseUntrackedPaths(output: string | undefined): string[] {
	if (!output) {
		return [];
	}
	const result: string[] = [];
	const segments = output.split('\x00');
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (!seg) { continue; }
		// Each entry is "XY <path>"; for renames v1 emits a second NUL-separated
		// "from" path that we have to skip. We only care about untracked here.
		const status = seg.substring(0, 2);
		const path = seg.substring(3);
		if (status === '??') {
			result.push(path);
		} else if (status[0] === 'R' || status[0] === 'C') {
			// Skip the "from" path for renames/copies.
			i++;
		}
	}
	return result;
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
 * Exported for tests.
 */
export function parseGitDiffRawNumstat(output: string, repositoryRoot: URI, sessionUri: string, mergeBaseCommit: string): ISessionFileDiff[] {
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
		const hasBefore = change.kind !== FileEditKind.Create;
		const hasAfter = change.kind !== FileEditKind.Delete;
		return {
			...(hasBefore && change.oldPath ? {
				before: {
					uri: URI.joinPath(repositoryRoot, change.oldPath).toString(),
					content: { uri: buildGitBlobUri(sessionUri, mergeBaseCommit, change.oldPath) },
				},
			} : {}),
			...(hasAfter && change.newPath ? {
				after: {
					uri: URI.joinPath(repositoryRoot, change.newPath).toString(),
					content: { uri: URI.joinPath(repositoryRoot, change.newPath).toString() },
				},
			} : {}),
			diff: { added: stats?.added ?? 0, removed: stats?.removed ?? 0 },
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
	upstreamBranchName?: string;
	outgoingChanges?: number;
	incomingChanges?: number;
	uncommittedChanges?: number;
} {
	if (!output) {
		return {};
	}
	let branchName: string | undefined;
	let upstreamBranchName: string | undefined;
	let outgoingChanges: number | undefined;
	let incomingChanges: number | undefined;
	let uncommittedChanges = 0;
	for (const rawLine of output.split(/\r?\n/g)) {
		const line = rawLine.trimEnd();
		if (!line) { continue; }
		if (line.startsWith('# branch.head ')) {
			const head = line.substring('# branch.head '.length).trim();
			// `(detached)` is what git emits for a detached HEAD. Treat as no branch.
			branchName = head === '(detached)' ? undefined : head;
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
	return { branchName, upstreamBranchName, outgoingChanges, incomingChanges, uncommittedChanges };
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

/**
 * Parse `owner` and `repo` from `git remote -v` output. Prefers the `origin`
 * remote; falls back to the first GitHub remote so worktrees that renamed
 * the remote still surface PR state. Returns `undefined` if no GitHub
 * remote is present or the URL doesn't match a GitHub repo shape.
 *
 * Exported for tests.
 */
export function parseGitHubRepoFromRemote(remotesOutput: string | undefined): { owner: string; repo: string } | undefined {
	if (!remotesOutput) {
		return undefined;
	}
	// Each line: `<name>\t<url> (<fetch|push>)`. Take fetch URLs only so we
	// don't double-count the same remote.
	const candidates: { name: string; url: string }[] = [];
	for (const rawLine of remotesOutput.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) { continue; }
		const m = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line);
		if (!m) { continue; }
		candidates.push({ name: m[1], url: m[2] });
	}
	if (candidates.length === 0) {
		return undefined;
	}
	// Prefer `origin`, otherwise first matching remote.
	const ordered = [
		...candidates.filter(c => c.name === 'origin'),
		...candidates.filter(c => c.name !== 'origin'),
	];
	for (const { url } of ordered) {
		const parsed = parseGitHubOwnerRepoFromUrl(url);
		if (parsed) {
			return parsed;
		}
	}
	return undefined;
}

/**
 * Extract `{owner, repo}` from a GitHub remote URL. Handles the common
 * forms: `git@github.com:owner/repo(.git)?`, `https://github.com/owner/repo(.git)?`,
 * `ssh://git@github.com/owner/repo(.git)?`, `git://github.com/owner/repo(.git)?`.
 */
function parseGitHubOwnerRepoFromUrl(url: string): { owner: string; repo: string } | undefined {
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

function stripUndefined<T extends object>(obj: T): T {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v !== undefined) { out[k] = v; }
	}
	return out as T;
}
