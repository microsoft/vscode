/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fsPromises from 'fs/promises';
import { cp as copyFile } from '@vscode/fs-copyfile';
import * as path from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { parse } from '../../../base/common/glob.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { FileEditKind, type ISessionFileDiff, type ISessionGitState } from '../common/state/sessionState.js';
import { buildGitBlobUri } from './gitDiffContent.js';
import { EMPTY_TREE_OBJECT, IAgentHostGitService, IBranch, IBranchDiffSafetyInfo, IRefQuery, IComputeSessionFileDiffsOptions, IDefaultBranch, IPullOptions, IPushOptions } from '../common/agentHostGitService.js';
import { LRUCache } from '../../../base/common/map.js';
import { Limiter, SequencerByKey } from '../../../base/common/async.js';

export class AgentHostGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	/**
	 * A cache of repository roots that have already been discovered.
	 */
	private readonly _repositoryRoots = new LRUCache<string, URI>(100);
	private readonly _repositoryRootSequencer = new SequencerByKey<string>();

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async getCurrentBranch(workingDirectory: URI): Promise<string | undefined> {
		return (await this._runGit(workingDirectory, ['branch', '--show-current']))?.trim()
			|| (await this._runGit(workingDirectory, ['rev-parse', '--short', 'HEAD']))?.trim()
			|| undefined;
	}

	async getDefaultBranch(workingDirectory: URI): Promise<IDefaultBranch | undefined> {
		// Try to read the default branch from the remote HEAD reference
		const remoteRef = (await this._runGit(workingDirectory, ['symbolic-ref', 'refs/remotes/origin/HEAD']))?.trim();
		if (remoteRef) {
			if (!remoteRef.startsWith('refs/remotes/origin/')) {
				return { name: remoteRef, startPoint: remoteRef };
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
				return { name: branch, startPoint: `origin/${branch}` };
			}
			const hasLocalBranch = (await this._runGit(workingDirectory, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])) !== undefined;
			return hasLocalBranch ? { name: branch, startPoint: branch } : undefined;
		}
		return undefined;
	}

	async getBranches(workingDirectory: URI, query?: IRefQuery): Promise<IBranch[]> {
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

		const output = await this._runGit(workingDirectory, args);
		return parseBranchRefs(output);
	}

	async getRepositoryRoot(workingDirectory: URI): Promise<URI | undefined> {
		const workingDirectoryKey = workingDirectory.toString();

		return this._repositoryRootSequencer.queue(workingDirectoryKey, async () => {
			let repositoryRoot = this._repositoryRoots.get(workingDirectoryKey);
			if (repositoryRoot) {
				return repositoryRoot;
			}

			try {
				const repositoryRootPath = (await this._runGit(workingDirectory, ['rev-parse', '--show-toplevel']))?.trim();
				if (repositoryRootPath) {
					repositoryRoot = URI.file(repositoryRootPath);
					this._repositoryRoots.set(workingDirectoryKey, repositoryRoot);
				}

				return repositoryRoot;
			} catch (error) { }

			return undefined;
		});
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
		const resolvedStartPoint = await this._resolveRemoteTrackingBranch(repositoryRoot, startPoint) ?? startPoint;
		// Pass --no-track so the new agent branch never picks up upstream
		// tracking from the start point (e.g. when starting from
		// 'origin/main', without --no-track git would set the new branch's
		// upstream to origin/main, which would mis-attribute pushes/pulls).
		await this._runGit(repositoryRoot, ['-c', 'checkout.workers=0', 'worktree', 'add', '--no-track', '-b', branchName, worktree.fsPath, resolvedStartPoint], { timeout: 180_000, throwOnError: true });
	}

	async copyWorktreeIncludeFiles(repositoryRoot: URI, worktree: URI, globs: readonly string[]): Promise<void> {
		try {
			const worktreeIncludePaths = await this._getWorktreeIncludePaths(repositoryRoot, globs);
			if (worktreeIncludePaths.length === 0) {
				return;
			}

			const startTime = performance.now();
			const limiter = new Limiter<void>(15);
			const results = await Promise.allSettled(worktreeIncludePaths.map(sourcePath => limiter.queue(async () => {
				const targetPath = path.join(worktree.fsPath, path.relative(repositoryRoot.fsPath, sourcePath));
				await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
				await copyFile(sourcePath, targetPath, { force: true, recursive: true, verbatimSymlinks: true });
			})));

			const failedOperations = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
			this._logService.info(`[AgentHostGitService][copyWorktreeIncludeFiles] Copied ${worktreeIncludePaths.length - failedOperations.length}/${worktreeIncludePaths.length} folder(s)/file(s) to worktree ${worktree.fsPath}. [${(performance.now() - startTime).toFixed(2)}ms]`);

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

	async addExistingWorktree(repositoryRoot: URI, worktree: URI, branchName: string): Promise<void> {
		// `-f` (force) so recreation succeeds even when the worktree directory was
		// deleted out-of-band but git still has it registered ("missing but
		// already registered worktree"). This is our own managed per-session
		// worktree/branch, so overriding git's safeguards here is safe.
		await this._runGit(repositoryRoot, ['-c', 'checkout.workers=0', 'worktree', 'add', '-f', worktree.fsPath, branchName], { timeout: 180_000, throwOnError: true });
	}

	async removeWorktree(repositoryRoot: URI, worktree: URI): Promise<void> {
		await this._runGit(repositoryRoot, ['worktree', 'remove', '--force', worktree.fsPath], { timeout: 60_000, throwOnError: true });
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

	async commitAll(workingDirectory: URI, message: string): Promise<void> {
		await this._runGit(workingDirectory, ['add', '-A', '--', ':/'], { throwOnError: true });
		await this._runGit(workingDirectory, ['commit', '--no-verify', '-m', message], { timeout: 60_000, throwOnError: true });
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

	async computeSessionFileDiffs(workingDirectory: URI, options: IComputeSessionFileDiffsOptions): Promise<readonly ISessionFileDiff[] | undefined> {
		// All git invocations run from the working tree's repository root so
		// `--raw` paths are repo-relative — that's what `git show <sha>:<path>`
		// expects when we resolve `git-blob:` URIs later.
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		// Resolve the merge-base commit the Branch Changes diff is anchored on.
		const mergeBaseCommit = await this._resolveBranchMergeBaseCommit(repositoryRoot, options.baseBranch);

		// Detect whether the working tree has any untracked files. If so we
		// have to use the temp-index trick so the untracked content is
		// included in `--cached --raw` output; otherwise a plain `git diff`
		// is sufficient and avoids the temp-dir overhead.
		const statusOut = await this._runGit(repositoryRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
		if (statusOut === undefined) {
			return undefined;
		}
		const hasUntracked = parseUntrackedPaths(statusOut).length > 0;

		let rawDiffOutput: string | undefined;
		if (!hasUntracked) {
			rawDiffOutput = await this._runGit(repositoryRoot, ['diff', '--raw', '--numstat', '--diff-filter=ADMR', '-z', mergeBaseCommit, '--']);
		} else {
			const changedPaths = parseChangedPaths(statusOut);
			rawDiffOutput = await this._runWithTempIndex(repositoryRoot, mergeBaseCommit, changedPaths);
		}

		if (rawDiffOutput === undefined) {
			return undefined;
		}

		return parseGitDiffRawNumstat(rawDiffOutput, repositoryRoot, options.sessionUri, mergeBaseCommit);
	}

	async resolveBranchBaselineCommit(workingDirectory: URI, baseBranch?: string): Promise<string | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		return this._resolveBranchMergeBaseCommit(repositoryRoot, baseBranch);
	}

	/**
	 * Resolves the merge-base commit-ish the Branch Changes baseline is anchored
	 * on. With a base branch, prefers the corresponding `origin/<base>`
	 * remote-tracking ref when it exists so branch changes match a PR-style
	 * comparison even if the local base branch is stale. Without a usable base,
	 * falls back to `HEAD` (surfaces uncommitted work but no committed-on-branch
	 * work). For empty repos with no `HEAD`, falls back to the empty-tree object.
	 * Always resolves to a commit-ish (never `undefined`) once the repository
	 * root is known.
	 */
	private async _resolveBranchMergeBaseCommit(repositoryRoot: URI, baseBranch?: string): Promise<string> {
		let mergeBaseCommit: string | undefined;
		if (baseBranch) {
			const resolvedBase = await this._resolveRemoteTrackingBranch(repositoryRoot, baseBranch) ?? baseBranch;
			mergeBaseCommit = (await this._runGit(repositoryRoot, ['merge-base', 'HEAD', resolvedBase]))?.trim();
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

	private async _resolveRemoteTrackingBranch(repositoryRoot: URI, branch: string): Promise<string | undefined> {
		const remoteBranch = `origin/${branch}`;
		const output = await this._runGit(repositoryRoot, ['show-ref', '--verify', '--quiet', `refs/remotes/${remoteBranch}`]);
		return output !== undefined ? remoteBranch : undefined;
	}

	private async _getWorktreeIncludePaths(repositoryRoot: URI, globs: readonly string[]): Promise<string[]> {
		if (globs.length === 0) {
			return [];
		}

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
		const baseArgs = ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'];
		const [filesOutput, directoryOutput] = await Promise.all([
			this._runGit(repositoryRoot, baseArgs, { timeout: 30_000 }),
			this._runGit(repositoryRoot, [...baseArgs, '--directory', '--no-empty-directory'], { timeout: 30_000 }),
		]);
		if (!filesOutput) {
			return [];
		}

		// git emits repository-relative, forward-slash paths.
		const ignoredFiles = filesOutput.split('\x00').filter(entry => entry.length > 0);
		if (ignoredFiles.length === 0) {
			return [];
		}

		// Keep only the ignored files that match one of the configured
		// `git.worktreeIncludeFiles` glob patterns (VS Code glob semantics),
		// and — in the same pass — tally which wholly-ignored directories
		// contain an *unmatched* ignored file (and therefore cannot be
		// collapsed). `git ls-files --directory` reports a wholly-ignored
		// directory as a single `dir/` entry and never nests these entries
		// (it stops descending once a directory is wholly ignored), so each
		// file has at most one containing directory and no de-duplication of
		// the directory set is required.
		const matchers = globs.map(pattern => parse(pattern));
		const wholeDirectories = new Set((directoryOutput ?? '')
			.split('\x00').filter(entry => entry.endsWith('/')));

		const matchedFiles: string[] = [];
		const nonCollapsibleDirectories = new Set<string>();
		for (const file of ignoredFiles) {
			if (matchers.some(matcher => matcher(file))) {
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
		// clobber) and every ignored file it contains matched a glob (so
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

		// Emit the collapsed directories plus every matched file not already
		// covered by one of them.
		const includePaths: string[] = [...collapsedDirectories];
		for (const file of matchedFiles) {
			if (
				collapsedDirectories.size === 0 ||
				findContainingDirectory(file, collapsedDirectories) === undefined
			) {
				includePaths.push(file);
			}
		}

		return includePaths.map(entry => path.join(repositoryRoot.fsPath, entry));
	}

	async showBlob(workingDirectory: URI, ref: string, repoRelativePath: string): Promise<VSBuffer | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		// `git show` exits non-zero when the path didn't exist at that
		// ref; `_runGit` swallows that into `undefined` which is exactly
		// the contract callers want.
		return new Promise((resolve) => {
			cp.execFile('git', ['show', `${ref}:${repoRelativePath}`], { cwd: workingDirectory.fsPath, timeout: 5000, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
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

	async getFetchRemoteUrls(workingDirectory: URI, preferredRemote?: string): Promise<readonly string[] | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}
		return parseFetchRemoteUrls(await this._runGit(repositoryRoot, ['remote', '-v']), preferredRemote);
	}

	async getUntrackedPaths(workingDirectory: URI): Promise<readonly string[] | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}
		const status = await this._runGit(repositoryRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
		return status === undefined ? undefined : parseUntrackedPaths(status);
	}

	async captureWorkingTreeAsTree(workingDirectory: URI): Promise<string | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		const statusOut = await this._runGit(repositoryRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
		if (statusOut === undefined) {
			return undefined;
		}
		const changedPaths = parseChangedPaths(statusOut);
		const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-checkpoint-${generateUuid()}`);
		await this._fileService.createFolder(tempDir);
		const indexFile = URI.joinPath(tempDir, 'index').fsPath;
		const env: Record<string, string> = { GIT_INDEX_FILE: indexFile, COMMAND_HOOK_LOCK: '1' };
		try {
			// Seed the temp index from HEAD; for empty repos seed from the empty tree.
			const seeded = await this._runGit(repositoryRoot, ['read-tree', 'HEAD'], { env });
			if (seeded === undefined) {
				await this._runGit(repositoryRoot, ['read-tree', EMPTY_TREE_OBJECT], { env });
			}
			if (!(await this._stageChangedPaths(repositoryRoot, tempDir, changedPaths, env))) {
				return undefined;
			}
			const tree = (await this._runGit(repositoryRoot, ['write-tree'], { env }))?.trim();
			return tree || undefined;
		} finally {
			try { await this._fileService.del(tempDir, { recursive: true, useTrash: false }); } catch { /* best-effort */ }
		}
	}

	async commitTree(repositoryRoot: URI, treeOid: string, parentOid: string | undefined, message: string): Promise<string | undefined> {
		const args = ['commit-tree', treeOid];
		if (parentOid) {
			args.push('-p', parentOid);
		}
		args.push('-m', message);
		const out = await this._runGit(repositoryRoot, args, { throwOnError: true });
		return out?.trim() || undefined;
	}

	async updateRef(repositoryRoot: URI, ref: string, newOid: string): Promise<void> {
		await this._runGit(repositoryRoot, ['update-ref', ref, newOid], { throwOnError: true });
	}

	async deleteRefs(repositoryRoot: URI, refs: readonly string[]): Promise<void> {
		if (refs.length === 0) {
			return;
		}
		// Use `update-ref --stdin -z` so all deletions go through a single git
		// invocation. Each command is `delete SP <ref> NUL [<expected_oid>] NUL`;
		// we omit the expected oid so already-missing refs don't fail the batch.
		const stdin = refs.map(ref => `delete ${ref}\x00\x00`).join('');
		await new Promise<void>((resolve) => {
			const proc = cp.execFile('git', ['update-ref', '--stdin', '-z'], { cwd: repositoryRoot.fsPath, timeout: 10_000 }, () => {
				// Tolerate non-zero exits — missing refs are not fatal for cleanup.
				resolve();
			});
			proc.stdin?.end(stdin);
		});
	}

	async revParse(repositoryRoot: URI, expression: string): Promise<string | undefined> {
		const out = await this._runGit(repositoryRoot, ['rev-parse', '--verify', '--quiet', expression]);
		return out?.trim() || undefined;
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

	private async _computeSessionGitState(workingDirectory: URI): Promise<ISessionGitState | undefined> {
		const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		// Run all probes in parallel. Each handles its own errors and returns
		// undefined on failure so we can populate fields independently.
		const [
			statusOutput,
			remotesOutput,
			defaultBranchRef,
		] = await Promise.all([
			this._runGit(repositoryRoot, ['status', '-b', '--porcelain=v2']),
			this._runGit(repositoryRoot, ['remote', '-v']),
			this._runGit(repositoryRoot, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']),
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
			const ahead = await this._runGit(repositoryRoot, ['rev-list', '--count', `${baseBranchName}..HEAD`]);
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
		this._logService.trace(`[agentHostGitService] > git ${args.join(' ')}`);

		return new Promise((resolve, reject) => {
			const env = options?.env ? { ...process.env, ...options.env } : undefined;
			const timeoutMs = options?.timeout ?? 5000;
			// Use our own timer rather than execFile's `timeout` option so
			// we can definitively flag the timeout case in the error
			// message — execFile only surfaces signal/killed, which can
			// also mean the process was killed for other reasons.
			let didTimeOut = false;
			// Default maxBuffer is 32MB — Node's default is ~1MB, which is
			// easy to exceed for diff output in large repos. Exceeding it
			// causes execFile to error and we'd silently drop the diff.
			const child = cp.execFile('git', [...args], { cwd: workingDirectory.fsPath, env, maxBuffer: options?.maxBuffer ?? 32 * 1024 * 1024 }, (error, stdout, stderr) => {
				if (error) {
					// stderr is summarized in the thrown error message to keep
					// it readable; log the full unmodified output here so the
					// raw progress/diagnostic text is still available.
					if (stderr) {
						this._logService.warn(`[agentHostGitService] > git ${args.join(' ')} failed; full stderr:\n${stderr}`);
					}
					if (options?.throwOnError) {
						reject(new Error(formatGitError(args, timeoutMs, didTimeOut, error, stderr), { cause: error }));
						return;
					}
					resolve(undefined);
					return;
				}
				resolve(stdout);
			});
			const timer = setTimeout(() => {
				didTimeOut = true;
				child.kill();
			}, timeoutMs);
			child.on('exit', () => clearTimeout(timer));
		});
	}
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
	const subcommand = args[0] ?? '(unknown)';
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
 * Keeps the most recent non-empty line and caps total length.
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
	const gitLfsMissing = lines.find(line =>
		/\bgit-lfs\b/i.test(line) &&
		/(command not found|not recognized|no such file)/i.test(line)
	);
	const summary = gitLfsMissing ?? lines[lines.length - 1];
	return summary.length > MAX ? `${summary.slice(0, MAX - 1)}…` : summary;
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
 * Parses NUL-separated `git status --porcelain=v1 -z --untracked-files=all`
 * output and returns all changed repo-relative paths. Rename/copy entries
 * include both the destination and source paths so scoped `git add -A`
 * stages both sides of the change.
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
			addPath(path);
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

/** Returns fetch remote URLs with the preferred remote, then `origin`, first. */
export function parseFetchRemoteUrls(remotesOutput: string | undefined, preferredRemote?: string): string[] | undefined {
	if (remotesOutput === undefined) {
		return undefined;
	}
	const candidates: { name: string; url: string }[] = [];
	for (const rawLine of remotesOutput.split(/\r?\n/)) {
		const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(rawLine.trim());
		if (match) {
			candidates.push({ name: match[1], url: match[2] });
		}
	}
	const preferredNames = new Set([preferredRemote, 'origin'].filter((name): name is string => Boolean(name)));
	const ordered = [
		...candidates.filter(candidate => candidate.name === preferredRemote),
		...candidates.filter(candidate => candidate.name === 'origin' && candidate.name !== preferredRemote),
		...candidates.filter(candidate => !preferredNames.has(candidate.name)),
	];
	return [...new Set(ordered.map(candidate => candidate.url))];
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
	const candidates = parseFetchRemoteUrls(remotesOutput);
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

export function parseRemoteBranchRef(ref: string): { ref: string; name: string; remote: string } | undefined {
	if (!ref.startsWith('refs/remotes/')) {
		return undefined;
	}

	const name = ref.substring(13);
	const remote = name.split('/')[0];
	return { ref, name, remote };
}

export function parseBranchRefs(output: string | undefined): IBranch[] {
	if (!output) {
		return [];
	}

	const branches: IBranch[] = [];
	for (const line of output.split(/\r?\n/g)) {
		const [ref, upstream] = line.trim().split('\0');

		if (ref.startsWith('refs/heads/')) {
			branches.push({
				ref,
				name: ref.substring(11),
				upstream: upstream
					? parseRemoteBranchRef(upstream)
					: undefined
			});
		} else if (ref.startsWith('refs/remotes/') && !/^refs\/remotes\/[^/]+\/HEAD$/.test(ref)) {
			const parsedRemoteBranch = parseRemoteBranchRef(ref);
			if (parsedRemoteBranch) {
				branches.push(parsedRemoteBranch);
			}
		}
	}

	return branches;
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
