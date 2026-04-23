/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { LanguageModelTextPart } from 'vscode';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { getGitHubRepoInfoFromContext, IGitService } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { raceCancellation } from '../../../util/vs/base/common/async';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { ResourceSet } from '../../../util/vs/base/common/map';
import { isEqual } from '../../../util/vs/base/common/resources';
import { createTimeout } from '../../inlineEdits/common/common';
import { IToolsService } from '../../tools/common/toolsService';
import { RepositoryProperties, IChatSessionMetadataStore } from '../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';
import { ChatSessionWorktreeProperties, IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';
import {
	FolderRepositoryInfo,
	FolderRepositoryMRUEntry,
	GetFolderRepositoryOptions,
	IFolderRepositoryManager,
	InitializeFolderRepositoryOptions
} from '../common/folderRepositoryManager';
import { isUntitledSessionId } from '../common/utils';
import { isWelcomeView } from '../copilotcli/node/copilotCli';
import { IClaudeSessionStateService } from '../claude/common/claudeSessionStateService';
import { ICopilotCLISessionService } from '../copilotcli/node/copilotcliSessionService';

/**
 * Message shown when user needs to trust a folder to continue.
 */
export const UNTRUSTED_FOLDER_MESSAGE = l10n.t('The selected folder is not trusted. Please trust the folder to continue with the {0}.', 'Copilot CLI');

// #region FolderRepositoryManager (abstract base)

/**
 * Abstract base implementation of IFolderRepositoryManager.
 *
 * This service centralizes all shared folder/repository management logic including:
 * - Tracking folder selection for untitled sessions
 * - Resolving folder/repository/worktree information for new sessions
 * - Creating worktrees for git repositories
 * - Verifying trust status
 * - Tracking MRU (Most Recently Used) folders
 *
 * Subclasses must implement {@link getFolderRepository} to provide session-type-specific
 * resolution of folder information for existing (named) sessions.
 */
export abstract class FolderRepositoryManager extends Disposable implements IFolderRepositoryManager {
	declare _serviceBrand: undefined;

	/**
	 * In-memory storage for new session folder selections.
	 * Maps session ID → folder URI.
	 */
	protected readonly _newSessionFolders = new Map<string, { uri: vscode.Uri; lastAccessTime: number }>();

	constructor(
		protected readonly worktreeService: IChatSessionWorktreeService,
		protected readonly workspaceFolderService: IChatSessionWorkspaceFolderService,
		protected readonly gitService: IGitService,
		protected readonly workspaceService: IWorkspaceService,
		protected readonly logService: ILogService,
		protected readonly toolsService: IToolsService,
		protected readonly metadataStore: IChatSessionMetadataStore

	) {
		super();
	}

	/**
	 * @deprecated
	 */
	setNewSessionFolder(sessionId: string, folderUri: vscode.Uri): void {
		this._newSessionFolders.set(sessionId, { uri: folderUri, lastAccessTime: Date.now() });
	}

	/**
	 * @deprecated
	 */
	deleteNewSessionFolder(sessionId: string): void {
		this._newSessionFolders.delete(sessionId);
	}

	/**
	 * Subclasses provide a fallback folder URI when no worktree or workspace
	 * folder is found for a named session.
	 */
	protected abstract getSessionFallbackFolder(sessionId: string): Promise<vscode.Uri | undefined>;

	/**
	 * @inheritdoc
	 */
	async getFolderRepository(
		sessionId: string,
		options: GetFolderRepositoryOptions | undefined,
		_token: vscode.CancellationToken
	): Promise<FolderRepositoryInfo> {
		// For untitled sessions, use whatever is in memory.
		if (isUntitledSessionId(sessionId)) {
			if (options) {
				const { folder, repository, repositoryProperties, trusted } = await this.getFolderRepositoryForNewSession(sessionId, undefined, options.stream, _token);
				return { folder, repository, repositoryProperties, worktree: undefined, worktreeProperties: undefined, trusted };
			} else {
				const folder = this._newSessionFolders.get(sessionId)?.uri
					?? await this.workspaceFolderService.getSessionWorkspaceFolder(sessionId);
				return { folder, repository: undefined, repositoryProperties: undefined, worktree: undefined, trusted: undefined, worktreeProperties: undefined };
			}
		}

		// For named sessions, check worktree properties first
		const worktreeProperties = await this.worktreeService.getWorktreeProperties(sessionId);
		if (worktreeProperties) {
			const repositoryUri = vscode.Uri.file(worktreeProperties.repositoryPath);
			const worktreeUri = vscode.Uri.file(worktreeProperties.worktreePath);

			// Trust check on repository path (not worktree path)
			let trusted: boolean | undefined;
			if (options) {
				trusted = await this.verifyTrust(repositoryUri, options.stream);
			}

			return {
				folder: repositoryUri,
				repository: repositoryUri,
				repositoryProperties: undefined,
				worktree: worktreeUri,
				worktreeProperties,
				trusted
			};
		}

		// Check session workspace folder
		const sessionWorkspaceFolderEntry = await this.workspaceFolderService.getSessionWorkspaceFolderEntry(sessionId);
		if (sessionWorkspaceFolderEntry) {
			const repositoryProperties = await this.workspaceFolderService.getRepositoryProperties(sessionId);
			let trusted: boolean | undefined;
			if (options) {
				trusted = await this.verifyTrust(vscode.Uri.file(sessionWorkspaceFolderEntry.folderPath), options.stream);
			}

			return {
				folder: vscode.Uri.file(sessionWorkspaceFolderEntry.folderPath),
				repository: repositoryProperties?.repositoryPath
					? vscode.Uri.file(repositoryProperties.repositoryPath)
					: undefined,
				repositoryProperties,
				worktree: undefined,
				worktreeProperties: undefined,
				trusted
			};
		}

		// Fall back to subclass-specific folder resolution
		const fallbackFolder = await this.getSessionFallbackFolder(sessionId);
		if (fallbackFolder) {
			let trusted: boolean | undefined;
			if (options) {
				trusted = await this.verifyTrust(fallbackFolder, options.stream);
			}

			return {
				folder: fallbackFolder,
				repository: undefined,
				repositoryProperties: undefined,
				worktree: undefined,
				worktreeProperties: undefined,
				trusted
			};
		}

		return { folder: undefined, repository: undefined, repositoryProperties: undefined, worktree: undefined, trusted: undefined, worktreeProperties: undefined };
	}

	/**
	 * @inheritdoc
	 */
	async getRepositoryInfo(
		folder: vscode.Uri,
		_token: vscode.CancellationToken
	): Promise<{ repository: vscode.Uri | undefined; headBranchName: string | undefined }> {
		const repoContext = await this.gitService.getRepository(folder, true);
		return {
			repository: repoContext?.rootUri,
			headBranchName: repoContext?.headBranchName
		};
	}

	protected async getFolderRepositoryForNewSession(sessionId: string | undefined, selectedFolder: vscode.Uri | undefined, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<FolderRepositoryInfo> {
		// Use the explicitly provided folder, or fall back to the session's stored folder
		selectedFolder = selectedFolder ?? (sessionId ? (this._newSessionFolders.get(sessionId)?.uri
			?? await this.workspaceFolderService.getSessionWorkspaceFolder(sessionId)) : undefined);

		// If no folder selected and we have a single workspace folder, use active repository
		let repositoryUri: vscode.Uri | undefined;
		let folderUri = selectedFolder;
		let worktree: vscode.Uri | undefined = undefined;
		let worktreeProperties: ChatSessionWorktreeProperties | undefined = undefined;
		let repositoryProperties: RepositoryProperties | undefined = undefined;

		// If we have just one folder opened in workspace, use that as default
		// TODO: @DonJayamanne Handle Session View.
		if (!selectedFolder && !isWelcomeView(this.workspaceService) && this.workspaceService.getWorkspaceFolders().length === 1) {
			const activeRepo = this.gitService.activeRepository.get();
			repositoryUri = activeRepo?.rootUri;
			folderUri = repositoryUri ?? this.workspaceService.getWorkspaceFolders()[0];

			// If we're in a single folder workspace, possible the user has opened the worktree folder directly.
			if (sessionId && folderUri) {
				const worktreeSessionIds = this.metadataStore.getWorktreeSessions(folderUri);
				worktreeProperties = worktreeSessionIds.length ? await this.worktreeService.getWorktreeProperties(worktreeSessionIds[0]) : undefined;
				worktree = worktreeProperties ? vscode.Uri.file(worktreeProperties.worktreePath) : undefined;
				repositoryUri = worktreeProperties ? vscode.Uri.file(worktreeProperties.repositoryPath) : repositoryUri;
			}
		} else if (selectedFolder) {
			// First check if user trusts the folder.
			// We need to do this before looking for git repos to avoid prompting for trust twice.
			// Using getRepository will prompt user to trust the repo, and if not trusted
			// then undefined is returned and we cannot distinguish between "not a git repo" and "not trusted".
			const trusted = await this.workspaceService.requestResourceTrust({
				uri: selectedFolder,
				message: UNTRUSTED_FOLDER_MESSAGE
			});

			if (!trusted) {
				stream.warning(l10n.t('The selected folder is not trusted.'));
				return {
					folder: selectedFolder,
					repository: undefined,
					repositoryProperties: undefined,
					trusted: false,
					worktree,
					worktreeProperties
				};
			}

			// If we're in a single folder workspace, possible the user has opened the worktree folder directly.
			if (sessionId && folderUri) {
				const worktreeSessionIds = this.metadataStore.getWorktreeSessions(folderUri);
				worktreeProperties = worktreeSessionIds.length ? await this.worktreeService.getWorktreeProperties(worktreeSessionIds[0]) : undefined;
				worktree = worktreeProperties ? vscode.Uri.file(worktreeProperties.worktreePath) : undefined;
				repositoryUri = worktreeProperties ? vscode.Uri.file(worktreeProperties.repositoryPath) : repositoryUri;
			}

			// Now look for a git repository in the selected folder.
			// If found, use it. If not, proceed without isolation.`
			if (worktreeProperties) {
				repositoryUri = vscode.Uri.file(worktreeProperties.repositoryPath);
			} else {
				const repoContext = await this.gitService.getRepository(selectedFolder);
				const branchBase = repoContext?.headBranchName && repoContext.headCommitHash
					? await this.gitService.getBranchBase(repoContext.rootUri, repoContext.headBranchName)
					: undefined;

				const mergeBaseCommit = repoContext?.headBranchName && branchBase?.commit
					? await this.gitService.getMergeBase(repoContext.rootUri, repoContext.headBranchName, branchBase.commit)
					: undefined;

				const gitHubRemote = repoContext
					? getGitHubRepoInfoFromContext(repoContext)
					: undefined;
				const incomingChanges = repoContext?.headIncomingChanges ?? 0;
				const outgoingChanges = repoContext?.headOutgoingChanges ?? 0;
				const uncommittedChanges = (repoContext?.changes?.mergeChanges.length ?? 0) +
					(repoContext?.changes?.indexChanges.length ?? 0) +
					(repoContext?.changes?.workingTree.length ?? 0) +
					(repoContext?.changes?.untrackedChanges.length ?? 0);

				repositoryUri = repoContext?.rootUri;
				repositoryProperties = repoContext
					? {
						repositoryPath: repoContext.rootUri.fsPath,
						branchName: repoContext.headBranchName,
						baseBranchName: branchBase && branchBase.remote && branchBase.name
							? `${branchBase.remote}/${branchBase.name}`
							: undefined,
						upstreamBranchName: repoContext?.upstreamRemote && repoContext?.upstreamBranchName
							? `${repoContext.upstreamRemote}/${repoContext.upstreamBranchName}`
							: undefined,
						baseCommit: repoContext.headCommitHash,
						mergeBaseCommit,
						hasGitHubRemote: gitHubRemote !== undefined,
						incomingChanges,
						outgoingChanges,
						uncommittedChanges
					} satisfies RepositoryProperties
					: undefined;
			}

			// If no git repo found, use folder directly without isolation
			if (!repositoryUri) {
				return {
					folder: selectedFolder,
					repository: undefined,
					repositoryProperties: undefined,
					trusted: true,
					worktree,
					worktreeProperties
				};
			}
		}

		if (!repositoryUri) {
			// No folder or repository selected
			if (folderUri) {
				const trusted = await this.verifyTrust(folderUri, stream);
				return {
					folder: folderUri,
					repository: undefined,
					repositoryProperties: undefined,
					trusted,
					worktree,
					worktreeProperties
				};
			}

			return {
				folder: undefined,
				repository: undefined,
				repositoryProperties: undefined,
				trusted: true,
				worktree,
				worktreeProperties
			};
		}

		// Verify trust on repository path
		const trusted = await this.verifyTrust(repositoryUri, stream);

		if (!trusted) {
			return {
				folder: folderUri ?? repositoryUri,
				repository: repositoryUri,
				repositoryProperties,
				trusted: false,
				worktree,
				worktreeProperties
			};
		}

		return {
			folder: folderUri ?? repositoryUri,
			repository: repositoryUri,
			repositoryProperties,
			trusted: true,
			worktree,
			worktreeProperties
		};
	}

	/**
	 * @inheritdoc
	 */
	async initializeFolderRepository(
		sessionId: string | undefined,
		options: InitializeFolderRepositoryOptions,
		token: vscode.CancellationToken
	): Promise<FolderRepositoryInfo> {
		const { stream, toolInvocationToken, branch, isolation } = options;

		let { folder, repository, repositoryProperties, trusted, worktree, worktreeProperties } = await this.getFolderRepositoryForNewSession(sessionId, options.folder, stream, token);
		if (trusted === false) {
			return { folder, repository, repositoryProperties, worktree, worktreeProperties, trusted };
		}
		if (!repository) {
			// No git repository found, proceed without isolation
			return { folder, repository, repositoryProperties, worktree, worktreeProperties, trusted: true };
		}

		// If user explicitly chose workspace mode, skip worktree creation
		if (isolation === 'workspace') {
			this.logService.info(`[FolderRepositoryManager] Workspace isolation mode selected for session ${sessionId}, skipping worktree creation`);
			return {
				folder: folder ?? repository,
				repository,
				repositoryProperties,
				worktree: undefined,
				worktreeProperties: undefined,
				trusted: true
			};
		}

		// Check for uncommitted changes and prompt user before creating worktree
		let uncommittedChangesAction: 'move' | 'copy' | 'skip' | 'cancel' | undefined = undefined;
		if (!worktreeProperties) {
			uncommittedChangesAction = await this.promptForUncommittedChangesAction(sessionId, repository, branch, toolInvocationToken, token);
			if (uncommittedChangesAction === 'cancel') {
				return { folder, repository, repositoryProperties, worktree, worktreeProperties, trusted: true, cancelled: true };
			}
		}

		// Create worktree for the git repository
		let newBranchName: string | undefined = undefined;
		try {
			newBranchName = options.newBranch ? await options.newBranch : undefined;
		} catch (ex) {
			const error = ex instanceof Error ? ex : new Error(String(ex));
			this.logService.error(error, 'Failed to generate a new branch name for worktree creation');
		}
		worktreeProperties = worktreeProperties ?? await this.worktreeService.createWorktree(repository, stream, branch, newBranchName);

		if (!worktreeProperties) {
			stream.warning(l10n.t('Failed to create worktree. Proceeding without isolation.'));

			return {
				folder: folder ?? repository,
				repository,
				repositoryProperties,
				worktree,
				worktreeProperties,
				trusted
			};
		}

		// Store worktree properties for the session
		// Note: The caller is responsible for calling setWorktreeProperties after getting the real session ID

		this.logService.info(`[FolderRepositoryManager] Created worktree for session ${sessionId}: ${worktreeProperties.worktreePath}`);

		// Migrate changes from active repository to worktree if requested
		if (uncommittedChangesAction === 'move' || uncommittedChangesAction === 'copy') {
			await this.moveOrCopyChangesToWorkTree(
				repository,
				worktree ?? vscode.Uri.file(worktreeProperties.worktreePath),
				uncommittedChangesAction,
				stream,
				token
			);
		}

		return {
			folder: folder ?? repository,
			repository,
			repositoryProperties,
			worktree: worktree ?? vscode.Uri.file(worktreeProperties.worktreePath),
			worktreeProperties,
			trusted: true
		};
	}

	async initializeMultiRootFolderRepositories(
		sessionId: string,
		primaryFolder: vscode.Uri,
		additionalFolders: vscode.Uri[],
		options: InitializeFolderRepositoryOptions,
		token: vscode.CancellationToken
	): Promise<{ primary: FolderRepositoryInfo; additional: FolderRepositoryInfo[] }> {
		const { stream, toolInvocationToken, isolation } = options;
		const allFolders = [primaryFolder, ...additionalFolders];

		// 1. Resolve all folder/repo info
		const folderInfos = await Promise.all(
			allFolders.map(folder => this.getFolderRepositoryForNewSession(sessionId, folder, stream, token))
		);

		// 2. Filter out untrusted folders
		const trustedInfos: { folder: vscode.Uri; info: FolderRepositoryInfo }[] = [];
		for (let i = 0; i < allFolders.length; i++) {
			if (folderInfos[i].trusted === false) {
				this.logService.warn(`[FolderRepositoryManager] Multi-root: folder ${allFolders[i].fsPath} is not trusted, excluding`);
				continue;
			}
			trustedInfos.push({ folder: allFolders[i], info: folderInfos[i] });
		}

		if (trustedInfos.length === 0) {
			return {
				primary: { folder: primaryFolder, repository: undefined, repositoryProperties: undefined, worktree: undefined, worktreeProperties: undefined, trusted: false },
				additional: []
			};
		}

		// 3. If workspace mode, skip worktree creation — return all as-is
		if (isolation === 'workspace') {
			this.logService.info(`[FolderRepositoryManager] Multi-root: workspace isolation mode, skipping worktree creation for all folders`);
			const primary = trustedInfos.find(t => t.folder.fsPath === primaryFolder.fsPath)?.info
				?? { folder: primaryFolder, repository: undefined, repositoryProperties: undefined, worktree: undefined, worktreeProperties: undefined, trusted: true };
			const additional = trustedInfos
				.filter(t => t.folder.fsPath !== primaryFolder.fsPath)
				.map(t => ({
					folder: t.info.folder ?? t.folder,
					repository: undefined,
					repositoryProperties: undefined,
					worktree: undefined,
					worktreeProperties: undefined,
					trusted: true as boolean | undefined,
				}));
			return {
				primary: { ...primary, repository: undefined, repositoryProperties: undefined, worktree: undefined, worktreeProperties: undefined },
				additional
			};
		}

		// 4. Collect uncommitted changes from ALL git repos into one combined list
		const reposWithChanges: { folder: vscode.Uri; repository: vscode.Uri; modifiedFiles: Array<{ uri: vscode.Uri; originalUri?: vscode.Uri; insertions?: number; deletions?: number }> }[] = [];
		for (const { folder, info } of trustedInfos) {
			if (!info.repository) {
				continue;
			}
			const repo = await this.gitService.getRepository(info.repository, false);
			if (!repo) {
				continue;
			}
			const modifiedFiles = await this.getModifiedFilesForConfirmation(info.repository, repo, token);
			if (modifiedFiles.length > 0) {
				reposWithChanges.push({ folder, repository: info.repository, modifiedFiles });
			}
		}

		// 5. Show ONE combined prompt if any repo has uncommitted changes
		let uncommittedChangesAction: 'move' | 'copy' | 'skip' | 'cancel' | undefined = undefined;
		if (reposWithChanges.length > 0) {
			const allModifiedFiles = reposWithChanges.flatMap(r => r.modifiedFiles);
			uncommittedChangesAction = await this._promptForMultiRootUncommittedChanges(toolInvocationToken, allModifiedFiles, token);
			if (uncommittedChangesAction === 'cancel') {
				return {
					primary: { folder: primaryFolder, repository: undefined, repositoryProperties: undefined, worktree: undefined, worktreeProperties: undefined, trusted: true, cancelled: true },
					additional: []
				};
			}
		}

		// 6. Create worktrees for all git repo folders in parallel
		const results: { folder: vscode.Uri; info: FolderRepositoryInfo }[] = [];
		const worktreeCreationResults = await Promise.allSettled(
			trustedInfos.map(async ({ folder, info }) => {
				if (!info.repository) {
					// Non-git folder — keep as plain folder
					return { folder, info };
				}

				const worktreeProperties = await this.worktreeService.createWorktree(info.repository, stream);
				if (!worktreeProperties) {
					this.logService.warn(`[FolderRepositoryManager] Multi-root: failed to create worktree for ${info.repository.fsPath}, proceeding without isolation`);
					return { folder, info };
				}

				this.logService.info(`[FolderRepositoryManager] Multi-root: created worktree for ${info.repository.fsPath}: ${worktreeProperties.worktreePath}`);
				return {
					folder,
					info: {
						folder: info.folder ?? info.repository,
						repository: info.repository,
						repositoryProperties: info.repositoryProperties,
						worktree: vscode.Uri.file(worktreeProperties.worktreePath),
						worktreeProperties,
						trusted: true as boolean | undefined,
					}
				};
			})
		);

		for (const result of worktreeCreationResults) {
			if (result.status === 'fulfilled') {
				results.push(result.value);
			} else {
				this.logService.error(`[FolderRepositoryManager] Multi-root: worktree creation failed: ${result.reason}`);
			}
		}

		// 7. Migrate changes to worktrees if requested
		if (uncommittedChangesAction === 'move' || uncommittedChangesAction === 'copy') {
			const reposWithChangesSet = new Set(reposWithChanges.map(r => r.repository.fsPath));
			await Promise.allSettled(
				results
					.filter(r => r.info.repository && r.info.worktree && reposWithChangesSet.has(r.info.repository.fsPath))
					.map(r => this.moveOrCopyChangesToWorkTree(r.info.repository!, r.info.worktree!, uncommittedChangesAction!, stream, token))
			);
		}

		// 8. Build result
		const primaryResult = results.find(r => r.folder.fsPath === primaryFolder.fsPath)?.info
			?? { folder: primaryFolder, repository: undefined, repositoryProperties: undefined, worktree: undefined, worktreeProperties: undefined, trusted: true };
		const additionalResults = results
			.filter(r => r.folder.fsPath !== primaryFolder.fsPath)
			.map(r => r.info);

		return { primary: primaryResult, additional: additionalResults };
	}

	private async _promptForMultiRootUncommittedChanges(
		toolInvocationToken: vscode.ChatParticipantToolToken,
		modifiedFiles: Array<{ uri: vscode.Uri; originalUri?: vscode.Uri; insertions?: number; deletions?: number }>,
		token: vscode.CancellationToken
	): Promise<'move' | 'copy' | 'skip' | 'cancel'> {
		const title = l10n.t('Uncommitted Changes');
		const message = l10n.t('Some repositories have uncommitted changes. Should these changes be included in the new worktrees?');
		const copyChanges = l10n.t('Copy Changes');
		const moveChanges = l10n.t('Move Changes');
		const skipChanges = l10n.t('Skip Changes');
		const options = [copyChanges, moveChanges, skipChanges];
		const input = { title, message, options, modifiedFiles };
		const result = await this.toolsService.invokeTool('vscode_get_modified_files_confirmation', { input, toolInvocationToken }, token);
		const selection = this.getSelectedUncommittedChangesAction(result, options);
		switch (selection?.toUpperCase()) {
			case moveChanges.toUpperCase(): return 'move';
			case copyChanges.toUpperCase(): return 'copy';
			case skipChanges.toUpperCase(): return 'skip';
			default: return 'cancel';
		}
	}

	/**
	 * @inheritdoc
	 */
	async getFolderMRU(): Promise<FolderRepositoryMRUEntry[]> {
		const latestReposAndFolders: FolderRepositoryMRUEntry[] = [];
		const seenUris = new ResourceSet();

		for (const { uri, lastAccessTime } of this._newSessionFolders.values()) {
			if (seenUris.has(uri)) {
				continue;
			}
			seenUris.add(uri);
			latestReposAndFolders.push({
				folder: uri,
				repository: undefined,
				lastAccessed: lastAccessTime,
			});
		}

		// Add recent git repositories
		for (const repo of this.gitService.getRecentRepositories()) {
			if (seenUris.has(repo.rootUri)) {
				continue;
			}
			seenUris.add(repo.rootUri);
			latestReposAndFolders.push({
				folder: repo.rootUri,
				repository: repo.rootUri,
				lastAccessed: repo.lastAccessTime,
			});
		}

		// Sort by last access time descending and limit
		latestReposAndFolders.sort((a, b) => b.lastAccessed - a.lastAccessed);

		return latestReposAndFolders;
	}

	/**
	 * Check for uncommitted changes and prompt user for action.
	 *
	 * @returns The user's chosen action, or `undefined` if there are no uncommitted changes.
	 */
	private async promptForUncommittedChangesAction(
		sessionId: string | undefined,
		repositoryUri: vscode.Uri,
		branch: string | undefined,
		toolInvocationToken: vscode.ChatParticipantToolToken,
		token: vscode.CancellationToken
	): Promise<'move' | 'copy' | 'skip' | 'cancel' | undefined> {
		const uncommittedChanges = await this.getUncommittedChanges(repositoryUri, branch, token);
		if (!uncommittedChanges) {
			return undefined;
		}

		const isDelegation = !sessionId;
		const title = isDelegation
			? l10n.t('Delegate to Copilot CLI')
			: l10n.t('Uncommitted Changes');
		const message = isDelegation
			? l10n.t('Copilot CLI will work in an isolated worktree to implement your requested changes.')
			+ '\n\n'
			+ l10n.t('The selected repository has uncommitted changes. Should these changes be included in the new worktree?')
			: l10n.t('The selected repository has uncommitted changes. Should these changes be included in the new worktree?');

		const copyChanges = l10n.t('Copy Changes');
		const moveChanges = l10n.t('Move Changes');
		const skipChanges = l10n.t('Skip Changes');
		const options = [copyChanges, moveChanges, skipChanges];
		const input = {
			title,
			message,
			options,
			modifiedFiles: uncommittedChanges.modifiedFiles
		};
		const result = await this.toolsService.invokeTool('vscode_get_modified_files_confirmation', { input, toolInvocationToken }, token);

		const selection = this.getSelectedUncommittedChangesAction(result, options);

		switch (selection?.toUpperCase()) {
			case moveChanges.toUpperCase():
				return 'move';
			case copyChanges.toUpperCase():
				return 'copy';
			case skipChanges.toUpperCase():
				return 'skip';
			default:
				return 'cancel';
		}
	}

	private getSelectedUncommittedChangesAction(
		result: vscode.LanguageModelToolResult,
		options: readonly string[]
	): string | undefined {
		for (const part of result.content) {
			if (!(part instanceof LanguageModelTextPart)) {
				continue;
			}

			const matchedOption = options.find(option => option.toUpperCase() === part.value.toUpperCase());
			if (matchedOption) {
				return matchedOption;
			}
		}

		return undefined;
	}

	private async getUncommittedChanges(
		folderPath: vscode.Uri,
		branch: string | undefined,
		token: vscode.CancellationToken
	): Promise<{ repository: vscode.Uri; modifiedFiles: Array<{ uri: vscode.Uri; originalUri?: vscode.Uri; insertions?: number; deletions?: number }> } | undefined> {
		const repository = await this.gitService.getRepository(folderPath);
		if (!repository) {
			return undefined;
		}

		// If the current branch is not the same as the requested branch, we cannot reliably determine the uncommitted changes, so skip the confirmation.
		if (branch && repository.headBranchName !== branch) {
			return undefined;
		}

		const modifiedFiles = await this.getModifiedFilesForConfirmation(repository.rootUri, repository, token);
		if (modifiedFiles.length === 0) {
			return undefined;
		}

		return {
			repository: repository.rootUri,
			modifiedFiles
		};
	}

	private async getModifiedFilesForConfirmation(
		repositoryUri: vscode.Uri,
		repository: NonNullable<ReturnType<IGitService['activeRepository']['get']>>,
		token: vscode.CancellationToken
	): Promise<Array<{ uri: vscode.Uri; originalUri?: vscode.Uri; insertions?: number; deletions?: number }>> {

		if (token.isCancellationRequested || !repository.changes) {
			return [];
		}

		const modifiedFiles = new Map<string, { uri: vscode.Uri; originalUri?: vscode.Uri; insertions?: number; deletions?: number }>();
		for (const change of [...repository.changes.indexChanges, ...repository.changes.workingTree]) {
			const changePath = (change as { path?: string }).path;
			const fileUri = change.uri ?? (changePath ? vscode.Uri.joinPath(repositoryUri, changePath) : undefined);
			modifiedFiles.set(fileUri.toString(), {
				uri: fileUri,
				originalUri: change.originalUri
			});
		}

		return [...modifiedFiles.values()];
	}

	/**
	 * Verify trust for a folder/repository and report via stream if not trusted.
	 */
	protected async verifyTrust(folderUri: vscode.Uri, stream: vscode.ChatResponseStream): Promise<boolean> {
		const trusted = await this.workspaceService.requestResourceTrust({
			uri: folderUri,
			message: UNTRUSTED_FOLDER_MESSAGE
		});

		if (!trusted) {
			stream.warning(l10n.t('The selected folder is not trusted.'));
			return false;
		}

		return true;
	}

	/**
	 * Move or copy uncommitted changes from the active repository to the worktree.
	 */
	private async moveOrCopyChangesToWorkTree(
		repositoryPath: vscode.Uri,
		worktreePath: vscode.Uri,
		moveOrCopyChanges: 'move' | 'copy',
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<void> {
		// Migrate changes from active repository to worktree
		const activeRepository = await this.gitService.getRepository(repositoryPath);
		if (!activeRepository) {
			return;
		}
		const hasUncommittedChanges = activeRepository.changes
			? (activeRepository.changes.indexChanges.length > 0 || activeRepository.changes.workingTree.length > 0)
			: false;
		if (!hasUncommittedChanges) {
			return;
		}

		const disposables = new DisposableStore();
		try {
			// Wait for the worktree repository to be ready
			stream.progress(l10n.t('Migrating changes to worktree...'));
			const worktreeRepo = await raceCancellation(new Promise<typeof activeRepository | undefined>((resolve) => {
				disposables.add(this.gitService.onDidOpenRepository(repo => {
					if (isEqual(repo.rootUri, worktreePath)) {
						resolve(repo);
					}
				}));

				this.gitService.getRepository(worktreePath).then(repo => {
					if (repo) {
						resolve(repo);
					}
				});

				disposables.add(createTimeout(10_000, () => resolve(undefined)));
			}), token);

			if (!worktreeRepo) {
				stream.warning(l10n.t('Failed to get worktree repository. Proceeding without migration.'));
			} else {
				await this.gitService.migrateChanges(worktreeRepo.rootUri, activeRepository.rootUri, {
					confirmation: false,
					deleteFromSource: moveOrCopyChanges === 'move',
					untracked: true
				});
				stream.markdown(l10n.t('Changes migrated to worktree.\n'));
			}
		} catch (error) {
			// Continue even if migration fails
			stream.warning(l10n.t('Failed to migrate some changes: {0}. Continuing with worktree creation.', error instanceof Error ? error.message : String(error)));
		} finally {
			disposables.dispose();
		}
	}
}

// #endregion

// #region CopilotCLIFolderRepositoryManager

/**
 * CopilotCLI-specific implementation that resolves folder information for
 * existing sessions using the CLI session service as a fallback.
 */
export class CopilotCLIFolderRepositoryManager extends FolderRepositoryManager {
	constructor(
		@IChatSessionWorktreeService worktreeService: IChatSessionWorktreeService,
		@IChatSessionWorkspaceFolderService workspaceFolderService: IChatSessionWorkspaceFolderService,
		@ICopilotCLISessionService private readonly sessionService: ICopilotCLISessionService,
		@IGitService gitService: IGitService,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@ILogService logService: ILogService,
		@IToolsService toolsService: IToolsService,
		@IFileSystemService private readonly fileSystem: IFileSystemService,
		@IChatSessionMetadataStore metadataStore: IChatSessionMetadataStore
	) {
		super(worktreeService, workspaceFolderService, gitService, workspaceService, logService, toolsService, metadataStore);
	}

	/**
	 * @inheritdoc
	 */
	protected async getSessionFallbackFolder(sessionId: string): Promise<vscode.Uri | undefined> {
		const cwd = this.sessionService.getSessionWorkingDirectory(sessionId);
		if (cwd && (await checkPathExists(cwd, this.fileSystem))) {
			return cwd;
		}
		return undefined;
	}
}

async function checkPathExists(filePath: vscode.Uri, fileSystem: IFileSystemService): Promise<boolean> {
	try {
		await fileSystem.stat(filePath);
		return true;
	} catch (error) {
		return false;
	}
}

// #endregion

// #region ClaudeFolderRepositoryManager

/**
 * Claude-specific implementation that resolves folder information for
 * existing sessions using the Claude session state service as a fallback.
 */
export class ClaudeFolderRepositoryManager extends FolderRepositoryManager {
	constructor(
		@IChatSessionWorktreeService worktreeService: IChatSessionWorktreeService,
		@IChatSessionWorkspaceFolderService workspaceFolderService: IChatSessionWorkspaceFolderService,
		@IGitService gitService: IGitService,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@ILogService logService: ILogService,
		@IToolsService toolsService: IToolsService,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService,
		@IFileSystemService private readonly fileSystem: IFileSystemService,
		@IChatSessionMetadataStore metadataStore: IChatSessionMetadataStore
	) {
		super(worktreeService, workspaceFolderService, gitService, workspaceService, logService, toolsService, metadataStore);
	}

	/**
	 * @inheritdoc
	 */
	protected async getSessionFallbackFolder(sessionId: string): Promise<vscode.Uri | undefined> {
		const folderInfo = this.sessionStateService.getFolderInfoForSession(sessionId);
		if (folderInfo && (await checkPathExists(vscode.Uri.file(folderInfo.cwd), this.fileSystem))) {
			return vscode.Uri.file(folderInfo.cwd);
		}
		return undefined;
	}
}

// #endregion
