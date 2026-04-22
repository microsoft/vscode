/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IGitService } from '../../../platform/git/common/gitService';
import { toGitUri } from '../../../platform/git/common/utils';
import { buildTempIndexEnv, getUncommittedFilePaths, parseGitChangesRaw } from '../../../platform/git/vscode-node/utils';
import { DiffChange } from '../../../platform/git/vscode/git';
import { ILogService } from '../../../platform/log/common/logService';
import * as path from '../../../util/vs/base/common/path';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { ChatSessionWorktreeFile } from '../common/chatSessionWorktreeService';
import { IClaudeWorkspaceFolderService } from '../common/claudeWorkspaceFolderService';

// #region Constants

const EMPTY_TREE_OBJECT = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

// #endregion

export class ClaudeWorkspaceFolderService extends Disposable implements IClaudeWorkspaceFolderService {
	declare _serviceBrand: undefined;

	private readonly _cache = new Map<string, vscode.ChatSessionChangedFile[]>();

	constructor(
		@IGitService private readonly _gitService: IGitService,
		@ILogService private readonly _logService: ILogService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
	) {
		super();
	}

	override dispose(): void {
		this._cache.clear();
		super.dispose();
	}

	async getWorkspaceChanges(
		cwd: string,
		gitBranch: string | undefined,
		gitBaseBranch: string | undefined,
		forceRefresh?: boolean,
	): Promise<vscode.ChatSessionChangedFile[]> {
		const cacheKey = `${cwd}\0${gitBranch ?? ''}\0${gitBaseBranch ?? ''}`;

		if (!forceRefresh) {
			const cached = this._cache.get(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const result = await this.computeRepositoryChanges(cwd, gitBranch, gitBaseBranch);
		if (!result) {
			return [];
		}

		const originalRef = result.mergeBaseCommit ?? 'HEAD';
		const changes = result.changes.map(change => new vscode.ChatSessionChangedFile(
			vscode.Uri.file(change.filePath),
			change.originalFilePath
				? toGitUri(vscode.Uri.file(change.originalFilePath), originalRef)
				: undefined,
			change.modifiedFilePath
				? vscode.Uri.file(change.modifiedFilePath)
				: undefined,
			change.statistics.additions,
			change.statistics.deletions,
		));

		this._cache.set(cacheKey, changes);
		return changes;
	}

	private async computeRepositoryChanges(
		repositoryPath: string,
		branchName: string | undefined,
		baseBranchName: string | undefined,
	): Promise<{
		readonly changes: ChatSessionWorktreeFile[];
		readonly mergeBaseCommit?: string;
	} | undefined> {
		const repository = await this._gitService.getRepository(vscode.Uri.file(repositoryPath));
		if (!repository?.changes) {
			this._logService.warn(`[ClaudeWorkspaceFolderService] No repository found at ${repositoryPath}`);
			return undefined;
		}

		let resolvedBaseBranchName = baseBranchName;
		if (!resolvedBaseBranchName && branchName && repository.headCommitHash) {
			try {
				const branchBase = await this._gitService.getBranchBase(repository.rootUri, branchName);
				resolvedBaseBranchName = branchBase?.name;
			} catch (error) {
				this._logService.warn(`[ClaudeWorkspaceFolderService] Failed to resolve base branch for ${branchName}: ${error}`);
			}
		}

		// Check for untracked changes, only if the session branch matches the current branch
		const hasUntrackedChanges = branchName === repository.headBranchName
			? [
				...repository.changes?.workingTree ?? [],
				...repository.changes?.untrackedChanges ?? [],
			].some(change => change.status === 7 /* UNTRACKED */)
			: false;

		const diffChanges: DiffChange[] = [];

		// If the repository is using a virtual file system, we need to
		// disable rename detection to avoid expensive git operations
		const noRenamesArg = repository.isUsingVirtualFileSystem
			? ['--no-renames']
			: [];

		const mergeBaseArg = resolvedBaseBranchName
			? ['--merge-base', resolvedBaseBranchName]
			: [];

		if (hasUntrackedChanges) {
			// Tracked + untracked changes
			const tmpDirName = `vscode-sessions-${generateUuid()}`;
			const diffIndexFile = path.join(this._extensionContext.globalStorageUri.fsPath, tmpDirName, 'diff.index');
			const pathspecFile = path.join(this._extensionContext.globalStorageUri.fsPath, tmpDirName, `pathspec.txt`);

			const env = buildTempIndexEnv(repository, diffIndexFile);

			try {
				// Create temp index file directory
				await this._fileSystemService.createDirectory(vscode.Uri.file(path.dirname(diffIndexFile)));

				try {
					// Populate temp index from HEAD, fall back to empty tree if no commits exist
					await this._gitService.exec(repository.rootUri, ['read-tree', 'HEAD'], env);
				} catch {
					// Fall back to empty tree for repositories with no commits
					await this._gitService.exec(repository.rootUri, ['read-tree', EMPTY_TREE_OBJECT], env);
				}

				// Stage entire working directory into temp index
				const uncommittedFilePaths = getUncommittedFilePaths(repository);
				await this._fileSystemService.writeFile(vscode.Uri.file(pathspecFile), new TextEncoder().encode(uncommittedFilePaths.join('\n')));
				await this._gitService.exec(repository.rootUri, ['add', '-A', `--pathspec-from-file=${pathspecFile}`], env);

				// Diff the temp index with the base branch
				const result = await this._gitService.exec(repository.rootUri, ['diff', '--cached', '--raw', '--numstat', '--diff-filter=ADMR', ...noRenamesArg, '-z', ...mergeBaseArg, '--'], env);
				diffChanges.push(...parseGitChangesRaw(repository.rootUri.fsPath, result));
			} catch (error) {
				this._logService.error(`[ClaudeWorkspaceFolderService] Error while processing workspace changes: ${error}`);
				return undefined;
			} finally {
				try {
					await this._fileSystemService.delete(vscode.Uri.file(path.dirname(diffIndexFile)), { recursive: true });
				} catch (error) {
					this._logService.error(`[ClaudeWorkspaceFolderService] Error while cleaning up temp index file: ${error}`);
				}
			}
		} else {
			// Tracked changes
			try {
				const result = await this._gitService.exec(repository.rootUri, ['diff', '--raw', '--numstat', '--diff-filter=ADMR', ...noRenamesArg, '-z', ...mergeBaseArg, '--']);
				diffChanges.push(...parseGitChangesRaw(repository.rootUri.fsPath, result));
			} catch (error) {
				this._logService.error(`[ClaudeWorkspaceFolderService] Error while processing workspace changes: ${error}`);
				return undefined;
			}
		}

		// Since the diff may be computed using the merge base commit of the current
		// branch and the base branch, we need to compute it as well so that we can use
		// it as the originalRef (left-hand side) of the diff editor
		let mergeBaseCommit: string | undefined;
		try {
			if (branchName && resolvedBaseBranchName) {
				mergeBaseCommit = await this._gitService.getMergeBase(repository.rootUri, branchName, resolvedBaseBranchName);
			}
		} catch (error) {
			this._logService.error(`[ClaudeWorkspaceFolderService] Error while getting merge base (${branchName}, ${resolvedBaseBranchName}): ${error}`);
		}

		const changes = diffChanges.map(change => ({
			filePath: change.uri.fsPath,
			originalFilePath: change.status !== 1 /* INDEX_ADDED */
				? change.originalUri?.fsPath
				: undefined,
			modifiedFilePath: change.status !== 6 /* DELETED */
				? change.uri.fsPath
				: undefined,
			statistics: {
				additions: change.insertions,
				deletions: change.deletions
			}
		} satisfies ChatSessionWorktreeFile));

		return { changes, mergeBaseCommit };
	}
}
