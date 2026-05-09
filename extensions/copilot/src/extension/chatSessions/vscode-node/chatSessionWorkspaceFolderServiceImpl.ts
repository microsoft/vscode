/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { getGitHubRepoInfoFromContext, IGitService } from '../../../platform/git/common/gitService';
import { buildTempIndexEnv, getUncommittedFilePaths, parseGitChangesRaw } from '../../../platform/git/vscode-node/utils';
import { DiffChange } from '../../../platform/git/vscode/git';
import { ILogService } from '../../../platform/log/common/logService';
import { SequencerByKey } from '../../../util/vs/base/common/async';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import * as path from '../../../util/vs/base/common/path';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IChatSessionMetadataStore, RepositoryProperties, WorkspaceFolderEntry } from '../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';
import { ChatSessionWorktreeFile } from '../common/chatSessionWorktreeService';

/**
 * Service for tracking workspace folder selections for chat sessions.
 * This is used in multi-root workspaces where some folders may not have git repositories.
 */
export class ChatSessionWorkspaceFolderService extends Disposable implements IChatSessionWorkspaceFolderService {
	declare _serviceBrand: undefined;

	private static readonly EMPTY_TREE_OBJECT = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
	private readonly _onDidChangeWorkspaceFolderChanges = this._register(new vscode.EventEmitter<{ sessionId: string }>());
	readonly onDidChangeWorkspaceFolderChanges = this._onDidChangeWorkspaceFolderChanges.event;

	private readonly workspaceState = new Map<string, WorkspaceFolderEntry>();
	private readonly sessionRepoKeys = new Map<string, string>();
	private readonly sessionsWithNoRepoProperties = new Set<string>();
	private readonly workspaceFolderChanges = new Map<string, ChatSessionWorktreeFile[]>();
	private readonly sessionsAssociatedWithFolders = new ResourceMap<Set<string>>();

	private readonly workspaceChangesSequencer = new SequencerByKey<string>();
	private readonly repoChangesSequencer = new SequencerByKey<string>();

	constructor(
		@IGitService private readonly gitService: IGitService,
		@ILogService private readonly logService: ILogService,
		@IChatSessionMetadataStore private readonly metadataStore: IChatSessionMetadataStore,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
	) {
		super();
	}

	async deleteTrackedWorkspaceFolder(sessionId: string): Promise<void> {
		this.invalidateSessionCache(sessionId);
		const entry = this.workspaceState.get(sessionId);
		if (entry?.folderPath) {
			const folderUri = vscode.Uri.file(entry.folderPath);
			this.sessionsAssociatedWithFolders.get(folderUri)?.delete(sessionId);
		}
		this.workspaceState.delete(sessionId);
		await this.metadataStore.deleteSessionMetadata(sessionId);
	}

	async trackSessionWorkspaceFolder(sessionId: string, workspaceFolderUri: string, repositoryProperties?: RepositoryProperties): Promise<void> {
		const entry: WorkspaceFolderEntry = {
			folderPath: workspaceFolderUri,
			timestamp: Date.now()
		};
		this.workspaceState.set(sessionId, entry);

		// Associate session with workspace folder for cache invalidation
		const folderUri = vscode.Uri.file(workspaceFolderUri);
		const sessionIds = this.sessionsAssociatedWithFolders.get(folderUri) ?? new Set<string>();
		sessionIds.add(sessionId);
		this.sessionsAssociatedWithFolders.set(folderUri, sessionIds);

		await this.metadataStore.storeWorkspaceFolderInfo(sessionId, entry);
		if (repositoryProperties) {
			this.sessionsWithNoRepoProperties.delete(sessionId);
			await this.metadataStore.storeRepositoryProperties(sessionId, repositoryProperties);
		}
		this.logService.trace(`[ChatSessionWorkspaceFolderService] Tracked workspace folder ${workspaceFolderUri} for session ${sessionId}`);
	}

	async getSessionWorkspaceFolder(sessionId: string): Promise<vscode.Uri | undefined> {
		const entry = this.workspaceState.get(sessionId);
		if (entry?.folderPath) {
			return vscode.Uri.file(entry.folderPath);
		}
		return await this.metadataStore.getSessionWorkspaceFolder(sessionId);
	}

	async getSessionWorkspaceFolderEntry(sessionId: string): Promise<WorkspaceFolderEntry | undefined> {
		const entry = this.workspaceState.get(sessionId);
		if (entry) {
			return entry;
		}
		return await this.metadataStore.getSessionWorkspaceFolderEntry(sessionId);
	}

	async getRepositoryProperties(sessionId: string): Promise<RepositoryProperties | undefined> {
		return await this.metadataStore.getRepositoryProperties(sessionId);
	}

	async setRepositoryProperties(sessionId: string, repositoryProperties: RepositoryProperties): Promise<void> {
		this.sessionsWithNoRepoProperties.delete(sessionId);
		await this.metadataStore.storeRepositoryProperties(sessionId, repositoryProperties);
	}

	async handleRequestCompleted(sessionId: string): Promise<void> {
		// Clear changes cache
		this.invalidateSessionCache(sessionId);
	}

	async hasCachedChanges(sessionId: string): Promise<boolean> {
		const existingRepoKey = this.sessionRepoKeys.get(sessionId);
		const cachedChanges = existingRepoKey ? this.workspaceFolderChanges.get(existingRepoKey) : undefined;
		return !!cachedChanges;
	}

	async getWorkspaceChanges(sessionId: string): Promise<readonly ChatSessionWorktreeFile[] | undefined> {
		return this.workspaceChangesSequencer.queue(sessionId, async () => {

			// Fast path: session previously had no repository properties
			if (this.sessionsWithNoRepoProperties.has(sessionId)) {
				return [];
			}

			// Fast path: check if we already have the repo key and a cached result
			const existingRepoKey = this.sessionRepoKeys.get(sessionId);
			const cachedChanges = existingRepoKey ? this.workspaceFolderChanges.get(existingRepoKey) : undefined;
			if (cachedChanges) {
				return cachedChanges;
			}

			const repositoryProperties = await this.getRepositoryProperties(sessionId);
			if (!repositoryProperties) {
				this.logService.warn(`[ChatSessionWorkspaceFolderService][getWorkspaceChanges] No repository properties found for session ${sessionId}`);
				this.sessionsWithNoRepoProperties.add(sessionId);
				return [];
			}

			const repoKey = `${repositoryProperties.repositoryPath}\0${repositoryProperties.baseBranchName ?? ''}\0${repositoryProperties.branchName ?? ''}`;
			this.sessionRepoKeys.set(sessionId, repoKey);

			return this.repoChangesSequencer.queue(repoKey, async () => {
				// Check cache again — another session may have computed it while we waited in the repo sequencer
				const cachedChanges = this.workspaceFolderChanges.get(repoKey);
				if (cachedChanges) {
					return cachedChanges;
				}

				const properties = await this.computeWorkspaceChanges(repositoryProperties, sessionId);
				this.workspaceFolderChanges.set(repoKey, properties?.changes ?? []);

				if (properties) {
					await this.metadataStore.storeRepositoryProperties(sessionId, {
						...repositoryProperties,
						mergeBaseCommit: properties.mergeBaseCommit,
						hasGitHubRemote: properties.hasGitHubRemote,
						upstreamBranchName: properties.upstreamBranchName,
						incomingChanges: properties.incomingChanges,
						outgoingChanges: properties.outgoingChanges,
						uncommittedChanges: properties.uncommittedChanges
					});
				}

				return properties?.changes ?? [];
			});
		});
	}

	private async computeWorkspaceChanges(repositoryProperties: RepositoryProperties, sessionId: string): Promise<{
		readonly changes: ChatSessionWorktreeFile[];
		readonly mergeBaseCommit?: string;
		readonly hasGitHubRemote?: boolean;
		readonly upstreamBranchName?: string;
		readonly incomingChanges?: number;
		readonly outgoingChanges?: number;
		readonly uncommittedChanges?: number;
	} | undefined> {
		const repository = await this.gitService.getRepository(vscode.Uri.file(repositoryProperties.repositoryPath));
		if (repository) {
			const sessionIds = this.sessionsAssociatedWithFolders.get(repository.rootUri) ?? new Set<string>();
			sessionIds.add(sessionId);
			this.sessionsAssociatedWithFolders.set(repository.rootUri, sessionIds);
		}
		if (!repository?.changes) {
			this.logService.warn(`[ChatSessionWorkspaceFolderService][getWorkspaceChanges] No repository found for session ${sessionId}`);
			return undefined;
		}

		// Check for untracked changes, only if the session branch matches the current branch
		const hasUntrackedChanges = repositoryProperties.branchName === repository.headBranchName
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

		const mergeBaseArg = repositoryProperties.baseBranchName
			? ['--merge-base', repositoryProperties.baseBranchName]
			: [];

		if (hasUntrackedChanges) {
			// Tracked + untracked changes
			const tmpDirName = `vscode-sessions-${generateUuid()}`;
			const diffIndexFile = path.join(this.extensionContext.globalStorageUri.fsPath, tmpDirName, 'diff.index');
			const pathspecFile = path.join(this.extensionContext.globalStorageUri.fsPath, tmpDirName, `pathspec.txt`);

			const env = buildTempIndexEnv(repository, diffIndexFile);

			try {
				// Create temp index file directory
				await fs.mkdir(path.dirname(diffIndexFile), { recursive: true });

				try {
					// Populate temp index from HEAD, fall back to empty tree if no commits exist
					await this.gitService.exec(repository.rootUri, ['read-tree', 'HEAD'], env);
				} catch {
					// Fall back to empty tree for repositories with no commits
					await this.gitService.exec(repository.rootUri, ['read-tree', ChatSessionWorkspaceFolderService.EMPTY_TREE_OBJECT], env);
				}

				// Stage entire working directory into temp index
				const uncommittedFilePaths = getUncommittedFilePaths(repository);
				await fs.writeFile(pathspecFile, uncommittedFilePaths.join('\n'), 'utf8');
				await this.gitService.exec(repository.rootUri, ['add', '-A', `--pathspec-from-file=${pathspecFile}`], env);

				// Diff the temp index with the base branch
				const result = await this.gitService.exec(repository.rootUri, ['diff', '--cached', '--raw', '--numstat', '--diff-filter=ADMR', ...noRenamesArg, '-z', ...mergeBaseArg, '--'], env);
				diffChanges.push(...parseGitChangesRaw(repository.rootUri.fsPath, result));
			} catch (error) {
				this.logService.error(`[ChatSessionWorkspaceFolderService][getWorkspaceChanges] Error while processing workspace changes: ${error}`);
				return undefined;
			} finally {
				try {
					await fs.rm(path.dirname(diffIndexFile), { recursive: true, force: true });
				} catch (error) {
					this.logService.error(`[ChatSessionWorkspaceFolderService][getWorkspaceChanges] Error while cleaning up temp index file: ${error}`);
				}
			}
		} else {
			// Tracked changes
			try {
				const result = await this.gitService.exec(repository.rootUri, ['diff', '--raw', '--numstat', '--diff-filter=ADMR', ...noRenamesArg, '-z', ...mergeBaseArg, '--']);
				diffChanges.push(...parseGitChangesRaw(repository.rootUri.fsPath, result));
			} catch (error) {
				this.logService.error(`[ChatSessionWorkspaceFolderService][getWorkspaceChanges] Error while processing workspace changes: ${error}`);
				return undefined;
			}
		}

		// Since the diff may be computed using the merge base commit of the current
		// branch and the base branch, we need to compute it as well so that we can use
		// it as the originalRef (left-hand side) of the diff editor
		let mergeBaseCommit: string | undefined;
		try {
			if (repositoryProperties.branchName && repositoryProperties.baseBranchName) {
				mergeBaseCommit = await this.gitService.getMergeBase(repository.rootUri, repositoryProperties.branchName, repositoryProperties.baseBranchName);
			}
		} catch (error) {
			this.logService.error(`[ChatSessionWorkspaceFolderService][getWorkspaceChanges] Error while getting merge base (${repositoryProperties.branchName}, ${repositoryProperties.baseBranchName}): ${error}`);
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

		const repositoryState = {
			mergeBaseCommit,
			hasGitHubRemote: getGitHubRepoInfoFromContext(repository) !== undefined,
			upstreamBranchName: repository.upstreamRemote && repository.upstreamBranchName
				? `${repository.upstreamRemote}/${repository.upstreamBranchName}`
				: undefined,
			incomingChanges: repository.headIncomingChanges ?? 0,
			outgoingChanges: repository.headOutgoingChanges ?? 0,
			uncommittedChanges:
				(repository.changes?.mergeChanges.length ?? 0) +
				(repository.changes?.indexChanges.length ?? 0) +
				(repository.changes?.workingTree.length ?? 0) +
				(repository.changes?.untrackedChanges.length ?? 0)
		};

		return { changes, ...repositoryState };
	}

	clearWorkspaceChanges(sessionId: string): string[];
	clearWorkspaceChanges(folderUri: vscode.Uri): string[];
	clearWorkspaceChanges(sessionIdOrFolderUri: string | vscode.Uri): string[] {
		const sessionIds = typeof sessionIdOrFolderUri === 'string' ? [sessionIdOrFolderUri] : this.getAssociatedSessions(sessionIdOrFolderUri);
		for (const sessionId of sessionIds) {
			this.invalidateSessionCache(sessionId);
		}
		return sessionIds;
	}

	private invalidateSessionCache(sessionId: string): void {
		const repoKey = this.sessionRepoKeys.get(sessionId);
		this.sessionRepoKeys.delete(sessionId);
		this.sessionsWithNoRepoProperties.delete(sessionId);
		if (repoKey) {
			this.workspaceFolderChanges.delete(repoKey);
		}
		this._onDidChangeWorkspaceFolderChanges.fire({ sessionId });
	}

	getAssociatedSessions(folderUri: vscode.Uri): string[] {
		const folderSessionIds = this.sessionsAssociatedWithFolders.get(folderUri) ?? new Set<string>();
		return Array.from(folderSessionIds);
	}
}
