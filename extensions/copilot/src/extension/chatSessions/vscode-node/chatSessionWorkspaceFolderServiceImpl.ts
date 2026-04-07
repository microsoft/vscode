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
	private readonly workspaceFolderChanges = new Map<string, ChatSessionWorktreeFile[]>();

	private readonly workspaceChangesSequencer = new SequencerByKey<string>();

	constructor(
		@IGitService private readonly gitService: IGitService,
		@ILogService private readonly logService: ILogService,
		@IChatSessionMetadataStore private readonly metadataStore: IChatSessionMetadataStore,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
	) {
		super();
	}

	async deleteTrackedWorkspaceFolder(sessionId: string): Promise<void> {
		this.workspaceState.delete(sessionId);
		await this.metadataStore.deleteSessionMetadata(sessionId);
	}

	async trackSessionWorkspaceFolder(sessionId: string, workspaceFolderUri: string, repositoryProperties?: RepositoryProperties): Promise<void> {
		const entry: WorkspaceFolderEntry = {
			folderPath: workspaceFolderUri,
			timestamp: Date.now()
		};
		this.workspaceState.set(sessionId, entry);
		await this.metadataStore.storeWorkspaceFolderInfo(sessionId, entry);
		if (repositoryProperties) {
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
		this.workspaceFolderChanges.delete(sessionId);
	}

	async getWorkspaceChanges(sessionId: string): Promise<readonly ChatSessionWorktreeFile[] | undefined> {
		return this.workspaceChangesSequencer.queue(sessionId, async () => {

			const cachedChanges = this.workspaceFolderChanges.get(sessionId);
			if (cachedChanges) {
				return cachedChanges;
			}

			const repositoryProperties = await this.getRepositoryProperties(sessionId);
			if (!repositoryProperties) {
				this.logService.warn(`[ChatSessionWorkspaceFolderService][getWorkspaceChanges] No repository properties found for session ${sessionId}`);
				return [];
			}

			const repository = await this.gitService.getRepository(vscode.Uri.file(repositoryProperties.repositoryPath));
			if (!repository?.changes) {
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
					await this.gitService.exec(repository.rootUri, ['add', '-A', '--', '.'], { GIT_INDEX_FILE: diffIndexFile });

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
				const result = repositoryProperties.baseBranchName
					? await this.gitService.exec(repository.rootUri, ['diff', '--raw', '--numstat', '--diff-filter=ADMR', '-z', '--merge-base', repositoryProperties.baseBranchName, '--'])
					: await this.gitService.exec(repository.rootUri, ['diff', '--raw', '--numstat', '--diff-filter=ADMR', '-z', '--']);
				diffChanges.push(...parseGitChangesRaw(repository.rootUri.fsPath, result));
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

			this.workspaceFolderChanges.set(sessionId, changes);
			return changes;
		});
	}

	clearWorkspaceChanges(sessionId: string): void {
		this.workspaceFolderChanges.delete(sessionId);
	}
}
