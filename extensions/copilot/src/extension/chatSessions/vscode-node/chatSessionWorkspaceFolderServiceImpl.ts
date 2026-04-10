/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IGitService } from '../../../platform/git/common/gitService';
import { parseGitChangesRaw } from '../../../platform/git/vscode-node/utils';
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

	async handleRequestCompleted(sessionId: string): Promise<void> {
		// Clear changes cache
		this.invalidateSessionCache(sessionId);
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

				const changes = await this.computeWorkspaceChanges(repositoryProperties, sessionId);
				this.workspaceFolderChanges.set(repoKey, changes);
				return changes;
			});
		});
	}

	private async computeWorkspaceChanges(repositoryProperties: RepositoryProperties, sessionId: string): Promise<ChatSessionWorktreeFile[]> {
		const repository = await this.gitService.getRepository(vscode.Uri.file(repositoryProperties.repositoryPath));
		if (repository) {
			const sessionIds = this.sessionsAssociatedWithFolders.get(repository.rootUri) ?? new Set<string>();
			sessionIds.add(sessionId);
			this.sessionsAssociatedWithFolders.set(repository.rootUri, sessionIds);
		}
		if (!repository?.changes) {
			this.logService.warn(`[ChatSessionWorkspaceFolderService][getWorkspaceChanges] No repository found for session ${sessionId}`);
			return [];
		}

		// Check for untracked changes, only if the session branch matches the current branch
		const hasUntrackedChanges = repositoryProperties.branchName === repository.headBranchName
			? [
				...repository.changes?.workingTree ?? [],
				...repository.changes?.untrackedChanges ?? [],
			].some(change => change.status === 7 /* UNTRACKED */)
			: false;

		const diffChanges: DiffChange[] = [];

		if (hasUntrackedChanges) {
			// Tracked + untracked changes
			const tmpDirName = `vscode-sessions-${generateUuid()}`;
			const diffIndexFile = path.join(this.extensionContext.globalStorageUri.fsPath, tmpDirName, 'diff.index');

			try {
				// Create temp index file directory
				await fs.mkdir(path.dirname(diffIndexFile), { recursive: true });

				try {
					// Populate temp index from HEAD, fall back to empty tree if no commits exist
					await this.gitService.exec(repository.rootUri, ['read-tree', 'HEAD'], { GIT_INDEX_FILE: diffIndexFile });
				} catch {
					// Fall back to empty tree for repositories with no commits
					await this.gitService.exec(repository.rootUri, ['read-tree', ChatSessionWorkspaceFolderService.EMPTY_TREE_OBJECT], { GIT_INDEX_FILE: diffIndexFile });
				}

				// Stage entire working directory into temp index
				await this.gitService.exec(repository.rootUri, ['add', '--', '.'], { GIT_INDEX_FILE: diffIndexFile });

				// Diff the temp index with the base branch
				const result = repositoryProperties.baseBranchName
					? await this.gitService.exec(repository.rootUri, ['diff', '--cached', '--raw', '--numstat', '--diff-filter=ADMR', '-z', '--merge-base', repositoryProperties.baseBranchName, '--'], { GIT_INDEX_FILE: diffIndexFile })
					: await this.gitService.exec(repository.rootUri, ['diff', '--cached', '--raw', '--numstat', '--diff-filter=ADMR', '-z', '--'], { GIT_INDEX_FILE: diffIndexFile });
				diffChanges.push(...parseGitChangesRaw(repository.rootUri.fsPath, result));
			} catch (error) {
				this.logService.error(`[ChatSessionWorkspaceFolderService][getWorkspaceChanges] Error while processing workspace changes: ${error}`);
				return [];
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
				const result = repositoryProperties.baseBranchName
					? await this.gitService.exec(repository.rootUri, ['diff', '--raw', '--numstat', '--diff-filter=ADMR', '-z', '--merge-base', repositoryProperties.baseBranchName, '--'])
					: await this.gitService.exec(repository.rootUri, ['diff', '--raw', '--numstat', '--diff-filter=ADMR', '-z', '--']);
				diffChanges.push(...parseGitChangesRaw(repository.rootUri.fsPath, result));
			} catch (error) {
				this.logService.error(`[ChatSessionWorkspaceFolderService][getWorkspaceChanges] Error while processing workspace changes: ${error}`);
				return [];
			}
		}

		return diffChanges.map(change => ({
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
	}

	getAssociatedSessions(folderUri: vscode.Uri): string[] {
		const folderSessionIds = this.sessionsAssociatedWithFolders.get(folderUri) ?? new Set<string>();
		return Array.from(folderSessionIds);
	}
}
