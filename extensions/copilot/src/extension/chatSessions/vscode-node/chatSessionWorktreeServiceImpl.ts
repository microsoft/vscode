/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { CancellationToken } from 'vscode-languageserver-protocol';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IGitCommitMessageService } from '../../../platform/git/common/gitCommitMessageService';
import { getGitHubRepoInfoFromContext, IGitService, RepoContext } from '../../../platform/git/common/gitService';
import { toGitUri } from '../../../platform/git/common/utils';
import { buildTempIndexEnv, getUncommittedFilePaths, parseGitChangesRaw } from '../../../platform/git/vscode-node/utils';
import { DiffChange } from '../../../platform/git/vscode/git';
import { ILogService } from '../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import * as path from '../../../util/vs/base/common/path';
import { isEqual } from '../../../util/vs/base/common/resources';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IAgentSessionsWorkspace } from '../common/agentSessionsWorkspace';
import { IChatSessionMetadataStore } from '../common/chatSessionMetadataStore';
import { ChatSessionWorktreeData, ChatSessionWorktreeFile, ChatSessionWorktreeProperties, ChatSessionWorktreePropertiesV2, IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';

const CHAT_SESSION_WORKTREE_MEMENTO_KEY = 'github.copilot.cli.sessionWorktrees';

export class ChatSessionWorktreeService extends Disposable implements IChatSessionWorktreeService {
	declare _serviceBrand: undefined;

	private _sessionWorktrees: Map<string, string | ChatSessionWorktreeProperties> = new Map();

	constructor(
		@IAgentSessionsWorkspace private readonly agentSessionsWorkspace: IAgentSessionsWorkspace,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IGitCommitMessageService private readonly gitCommitMessageService: IGitCommitMessageService,
		@IGitService private readonly gitService: IGitService,
		@ILogService private readonly logService: ILogService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IChatSessionMetadataStore private readonly metadataStore: IChatSessionMetadataStore,
	) {
		super();
	}

	async createWorktree(repositoryPath: vscode.Uri, stream?: vscode.ChatResponseStream, baseBranch?: string, branchName?: string): Promise<ChatSessionWorktreeProperties | undefined> {
		if (!stream) {
			return this._createWorktree(repositoryPath, undefined, baseBranch, branchName);
		}

		return new Promise<ChatSessionWorktreeProperties | undefined>((resolve) => {
			stream.progress(l10n.t('Creating isolated worktree for Copilot CLI session...'), async progress => {
				const result = await this._createWorktree(repositoryPath, progress, baseBranch, branchName);
				resolve(result);
				if (result) {
					return l10n.t('Created isolated worktree for branch {0}', result.branchName);
				}
				return undefined;
			});
		});
	}

	private async _createWorktree(repositoryPath: vscode.Uri, progress?: vscode.Progress<vscode.ChatResponsePart>, baseBranch?: string, branchName?: string): Promise<ChatSessionWorktreeProperties | undefined> {
		try {
			const activeRepository = await this.gitService.getRepository(repositoryPath);
			if (!activeRepository) {
				progress?.report(new vscode.ChatResponseWarningPart(vscode.l10n.t('Failed to create worktree for isolation, using default workspace directory')));
				this.logService.error('[ChatSessionWorktreeService][_createWorktree] No active repository found to create worktree for isolation.');
				return undefined;
			}

			const autoCommit = this.configurationService.getConfig<boolean>(ConfigKey.Advanced.CLIAutoCommitEnabled);

			let baseCommit: string | undefined = undefined;
			const branch = await this.generateBranchName(branchName, activeRepository);

			// When a base branch is provided, we attempt to resolve it, to see whether it has an
			// upstream. If there is an upstream, we use the upstream as the base for the worktree
			// since that is more likely to be up to date.
			if (this.agentSessionsWorkspace.isAgentSessionsWorkspace && baseBranch) {
				try {
					// Attempt to resolve the provided base branch
					const branchDetails = await this.gitService.getBranch(activeRepository.rootUri, baseBranch);
					if (branchDetails?.upstream?.remote && branchDetails.upstream?.name) {
						const upstreamBranchName = `${branchDetails.upstream.remote}/${branchDetails.upstream.name}`;

						try {
							// Attempt to resolve the upstream branch before using it as the base for the worktree
							const upstreamBranch = await this.gitService.getBranch(activeRepository.rootUri, upstreamBranchName);
							if (upstreamBranch) {
								baseBranch = upstreamBranchName;
								baseCommit = upstreamBranch.commit;
							}
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : String(error);
							this.logService.warn(`[ChatSessionWorktreeService][_createWorktree] Failed to resolve upstream branch ${upstreamBranchName}. Error: ${errorMessage}`);
						}
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					this.logService.warn(`[ChatSessionWorktreeService][_createWorktree] Failed to resolve base branch ${baseBranch}. Error: ${errorMessage}`);
				}
			}

			const worktreePath = await this.gitService.createWorktree(activeRepository.rootUri, { branch, commitish: baseBranch, noTrack: true });

			if (worktreePath && activeRepository.headCommitHash && activeRepository.headBranchName) {
				const baseBranchName = baseBranch ?? activeRepository.headBranchName;
				const baseBranchProtected = await this.gitService.isBranchProtected(activeRepository.rootUri, baseBranchName);

				if (baseBranch && !baseCommit) {
					const refs = await this.gitService.getRefs(activeRepository.rootUri, { pattern: `refs/heads/${baseBranch}` });
					baseCommit = refs.length === 1 && refs[0].commit ? refs[0].commit : undefined;
				}

				const gitHubRemote = getGitHubRepoInfoFromContext(activeRepository);
				const incomingChanges = activeRepository.headIncomingChanges ?? 0;
				const outgoingChanges = activeRepository.headOutgoingChanges ?? 0;
				const uncommittedChanges = (activeRepository.changes?.mergeChanges.length ?? 0) +
					(activeRepository.changes?.indexChanges.length ?? 0) +
					(activeRepository.changes?.workingTree.length ?? 0) +
					(activeRepository.changes?.untrackedChanges.length ?? 0);

				return {
					autoCommit,
					branchName: branch,
					baseCommit: baseCommit ?? activeRepository.headCommitHash,
					baseBranchName,
					baseBranchProtected,
					upstreamBranchName: activeRepository.upstreamRemote && activeRepository.upstreamBranchName
						? `${activeRepository.upstreamRemote}/${activeRepository.upstreamBranchName}`
						: undefined,
					hasGitHubRemote: gitHubRemote !== undefined,
					incomingChanges,
					outgoingChanges,
					uncommittedChanges,
					repositoryPath: activeRepository.rootUri.fsPath,
					worktreePath,
					version: 2
				} satisfies ChatSessionWorktreeProperties;
			}
			progress?.report(new vscode.ChatResponseWarningPart(vscode.l10n.t('Failed to create worktree for isolation, using default workspace directory')));
			this.logService.error('[ChatSessionWorktreeService][_createWorktree] Failed to create worktree for isolation.');
			return undefined;
		} catch (error) {
			progress?.report(new vscode.ChatResponseWarningPart(vscode.l10n.t('Error creating worktree for isolation: {0}', error instanceof Error ? error.message : String(error))));
			this.logService.error('[ChatSessionWorktreeService][_createWorktree] Error creating worktree for isolation: ', error);
			return undefined;
		}
	}

	private async generateBranchName(preferredName: string | undefined, repository: RepoContext) {
		const branchPrefixConfig = vscode.workspace.getConfiguration('git').get<string>('branchPrefix') ?? '';
		const branchPrefix = this.agentSessionsWorkspace.isAgentSessionsWorkspace ? 'agents' : 'copilot';

		if (preferredName) {
			let branchName = `${branchPrefixConfig}${branchPrefix}/${preferredName}`;
			// Check if we already have a branch with the preferred name, and if not, then use it.
			// Else suffix the preferred name with a random string to avoid conflicts.
			const refs = await this.gitService.getRefs(repository.rootUri, { pattern: `refs/heads/${branchName}` });
			if (refs.some(ref => ref.name === branchName)) {
				branchName = `${branchName}-${generateUuid().replaceAll('-', '').substring(0, 8).toLowerCase()}`;
			}

			return branchName;
		}

		// Attempt to generate a random branch name for the worktree
		const randomBranchName = await this.gitService.generateRandomBranchName(repository.rootUri);

		const branch = randomBranchName ? `${branchPrefixConfig}${branchPrefix}/${randomBranchName.substring(branchPrefixConfig.length)}`
			: `${branchPrefixConfig}${branchPrefix}/worktree-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

		return branch;
	}

	getWorktreeProperties(sessionId: string): Promise<ChatSessionWorktreeProperties | undefined>;
	getWorktreeProperties(folder: vscode.Uri): Promise<ChatSessionWorktreeProperties | undefined>;
	async getWorktreeProperties(sessionIdOrFolder: string | vscode.Uri): Promise<ChatSessionWorktreeProperties | undefined> {
		if (typeof sessionIdOrFolder === 'string') {
			const properties = this._sessionWorktrees.get(sessionIdOrFolder);
			if (properties !== undefined) {
				return typeof properties === 'string' ? undefined : properties;
			}
			// Fall back to metadata store (file-based)
			return this.metadataStore.getWorktreeProperties(sessionIdOrFolder);
		} else {
			for (const [_, value] of this._sessionWorktrees.entries()) {
				if (typeof value === 'string') {
					continue;
				}
				if (isEqual(vscode.Uri.file(value.worktreePath), sessionIdOrFolder)) {
					return value;
				}
			}
			// Fall back to metadata store (file-based)
			return this.metadataStore.getWorktreeProperties(sessionIdOrFolder);
		}
	}

	async setWorktreeProperties(sessionId: string, properties: ChatSessionWorktreeProperties): Promise<void> {
		this._sessionWorktrees.set(sessionId, properties);

		const sessionWorktreesProperties = this.extensionContext.globalState.get<Record<string, string | ChatSessionWorktreeData>>(CHAT_SESSION_WORKTREE_MEMENTO_KEY, {});
		sessionWorktreesProperties[sessionId] = { data: JSON.stringify(properties), version: properties.version };
		await this.metadataStore.storeWorktreeInfo(sessionId, properties);
		await this.extensionContext.globalState.update(CHAT_SESSION_WORKTREE_MEMENTO_KEY, sessionWorktreesProperties);
	}

	async getWorktreeRepository(sessionId: string): Promise<RepoContext | undefined> {
		const worktreeProperties = await this.getWorktreeProperties(sessionId);
		if (typeof worktreeProperties === 'string' || !worktreeProperties?.repositoryPath) {
			return undefined;
		}

		return this.gitService.getRepository(vscode.Uri.file(worktreeProperties.repositoryPath));
	}

	async getWorktreePath(sessionId: string): Promise<vscode.Uri | undefined> {
		const worktreeProperties = await this.getWorktreeProperties(sessionId);
		if (!worktreeProperties) {
			return undefined;
		} else if (typeof worktreeProperties === 'string') {
			// Legacy worktree path
			return vscode.Uri.file(worktreeProperties);
		} else {
			// Worktree properties v1
			return vscode.Uri.file(worktreeProperties.worktreePath);
		}
	}

	async applyWorktreeChanges(sessionId: string): Promise<void> {
		const worktreeProperties = await this.getWorktreeProperties(sessionId);

		if (worktreeProperties === undefined || (worktreeProperties.version === 1 && worktreeProperties.autoCommit === false)) {
			// Legacy background session that has the changes staged in the worktree.
			// To apply the changes, we need to migrate them from the worktree to the
			// main repository using a stash.
			const worktreePath = await this.getWorktreePath(sessionId);
			if (!worktreePath) {
				return;
			}

			const activeRepository = worktreeProperties?.repositoryPath
				? await this.gitService.getRepository(vscode.Uri.file(worktreeProperties.repositoryPath))
				: this.workspaceService.getWorkspaceFolders().length === 1 ? this.gitService.activeRepository.get() : undefined;

			if (!activeRepository) {
				return;
			}

			// Migrate the changes from the worktree to the main repository
			await this.gitService.migrateChanges(activeRepository.rootUri, worktreePath, {
				confirmation: false,
				deleteFromSource: false,
				untracked: true
			});

			// Delete worktree changes cache
			if (worktreeProperties) {
				await this.setWorktreeProperties(sessionId, {
					...worktreeProperties,
					changes: undefined
				});
			}

			return;
		}

		// Copilot CLI session that has the changes committed in the worktree. To apply the
		// changes, we need to migrate them from the worktree to the main repository using
		// a patch file.
		const patch = await this.gitService.diffBetweenPatch(
			vscode.Uri.file(worktreeProperties.worktreePath),
			worktreeProperties.baseCommit,
			worktreeProperties.branchName);

		if (!patch) {
			return;
		}

		// Write the patch to a temporary file
		const encoder = new TextEncoder();
		const patchFilePath = path.join(worktreeProperties.repositoryPath, '.git', `${worktreeProperties.branchName}.patch`);
		const patchFileUri = vscode.Uri.file(patchFilePath);
		await vscode.workspace.fs.writeFile(patchFileUri, encoder.encode(patch));

		try {
			// Apply patch
			await this.gitService.applyPatch(vscode.Uri.file(worktreeProperties.repositoryPath), patchFilePath);
		} catch (error) {
			this.logService.error(`[ChatSessionWorktreeService][applyWorktreeChanges] Error applying patch file ${patchFilePath} to repository ${worktreeProperties.repositoryPath}: `, error);
			throw error;
		} finally {
			await vscode.workspace.fs.delete(patchFileUri);
		}

		// Update base commit for the worktree after applying the changes
		const ref = await this.gitService.getRefs(vscode.Uri.file(worktreeProperties.repositoryPath), {
			pattern: `refs/heads/${worktreeProperties.branchName}`
		});

		if (ref.length === 1 && ref[0].commit && ref[0].commit !== worktreeProperties.baseCommit) {
			// Update baseCommit to the new HEAD of the worktree branch. We are doing this to
			// clear the list of changes for the session since all changes have been applied
			// to the main repository at this point.
			await this.setWorktreeProperties(sessionId, {
				...worktreeProperties,
				baseCommit: ref[0].commit,
				changes: undefined
			});
		} else {
			// Clear the changes cache even if we couldn't determine the new HEAD
			await this.setWorktreeProperties(sessionId, {
				...worktreeProperties,
				changes: undefined
			});
		}
	}

	async getWorktreeChanges(sessionId: string): Promise<readonly vscode.ChatSessionChangedFile2[] | undefined> {
		const worktreeProperties = await this.getWorktreeProperties(sessionId);
		if (!worktreeProperties || typeof worktreeProperties === 'string') {
			return undefined;
		}

		// Return cached changes
		if (worktreeProperties.changes) {
			return worktreeProperties.changes
				.map(change => this._toChatSessionChangedFile2(sessionId, change, worktreeProperties));
		}

		try {
			// Ensure the initial repository discovery is completed and the repository
			// states are initialized in the vscode.git extension. This is needed as these
			// will be the repositories that we use to compute the worktree changes. We do
			// not have to open each worktree individually since the changes are committed
			// so we can get them from the main repository or discovered worktree.
			await this.gitService.initialize();

			// Legacy - these changes are staged in the worktree but not yet committed. Since
			// the changes are not committed, we need to get them from the worktree repository
			// state. To do that we need to open the worktree repository. The source control
			// provider will not be shown in the Source Control view since it is being hidden.
			if (worktreeProperties.version === 1 && worktreeProperties.autoCommit === false) {
				const changes = await this._getWorktreeChangesFromIndex(worktreeProperties) ?? [];
				await this.setWorktreeProperties(sessionId, {
					...worktreeProperties, changes
				});

				return changes.map(change => this._toChatSessionChangedFile2(sessionId, change, worktreeProperties));
			}

			// Auto-commit is enabled which means that following each turn the changes are
			// committed. We can use the commit history of the worktree branch to compute
			// the changes. For the Sessions app, we do want to provide updated changes
			// while the session is in progress.
			if (worktreeProperties.version === 2 && worktreeProperties.autoCommit === true) {
				const properties = vscode.workspace.isAgentSessionsWorkspace
					? await this._getWorktreeChanges(sessionId, worktreeProperties)
					: await this._getWorktreeChangesFromCommits(worktreeProperties);

				if (properties) {
					await this.setWorktreeProperties(sessionId, {
						...worktreeProperties, ...properties
					});
				}

				return properties?.changes.map(change => this._toChatSessionChangedFile2(sessionId, change, worktreeProperties)) ?? [];
			}

			// Use checkpoints to compute the changes
			const properties = await this._getWorktreeChanges(sessionId, worktreeProperties);
			if (properties) {
				await this.setWorktreeProperties(sessionId, {
					...worktreeProperties, ...properties
				});
			}

			return properties?.changes.map(change => this._toChatSessionChangedFile2(sessionId, change, worktreeProperties)) ?? [];
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.warn(`[ChatSessionWorktreeCheckpointService][getWorktreeChanges] Session ${sessionId}: error computing diff for committed changes, returning empty. Error: ${errorMessage}`);
			await this.setWorktreeProperties(sessionId, {
				...worktreeProperties, changes: []
			});

			return [];
		}
	}

	async getSessionIdForWorktree(folder: vscode.Uri): Promise<string | undefined> {
		for (const [sessionId, value] of this._sessionWorktrees.entries()) {
			if (typeof value === 'string') {
				continue;
			}
			if (isEqual(vscode.Uri.file(value.worktreePath), folder)) {
				return sessionId;
			}
		}
		return this.metadataStore.getSessionIdForWorktree(folder);
	}

	async handleRequestCompleted(sessionId: string): Promise<void> {
		const worktreeProperties = await this.getWorktreeProperties(sessionId);
		if (!worktreeProperties) {
			return;
		}

		// Auto-commit is disabled for this worktree
		if (worktreeProperties.autoCommit === false) {
			this.logService.trace(`[ChatSessionWorktreeService][handleRequestCompleted] Auto-commit is disabled, skipping commit of worktree changes for session ${sessionId}`);

			// Delete worktree changes cache
			await this.setWorktreeProperties(sessionId, {
				...worktreeProperties,
				changes: undefined
			});

			return;
		}

		const worktreePath = worktreeProperties.worktreePath;

		// Commit all changes in the worktree
		const repository = await this.gitCommitMessageService.getRepository(vscode.Uri.file(worktreePath));
		if (!repository) {
			this.logService.error(`[ChatSessionWorktreeService][handleRequestCompleted] Unable to find repository for working directory ${worktreePath}`);
			throw new Error(`Unable to find repository for working directory ${worktreePath}`);
		}

		if (repository.state.workingTreeChanges.length === 0 && repository.state.indexChanges.length === 0 && repository.state.untrackedChanges.length === 0) {
			this.logService.trace(`[ChatSessionWorktreeService][handleRequestCompleted] No changes to commit in working directory ${worktreePath}`);

			// Delete worktree changes cache
			await this.setWorktreeProperties(sessionId, {
				...worktreeProperties,
				changes: undefined
			});

			return;
		}

		let message: string | undefined;
		try {
			this.logService.trace(`[ChatSessionWorktreeService][handleRequestCompleted] Generating commit message for working directory ${worktreePath}. Repository state: ${JSON.stringify(repository.state)}`);
			message = await this.gitCommitMessageService.generateCommitMessage(repository, CancellationToken.None);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error(`[ChatSessionWorktreeService][handleRequestCompleted] Error generating commit message for working directory ${worktreePath}. Repository state: ${JSON.stringify(repository.state)}. Error: ${errorMessage}`);
		}

		if (!message) {
			// Fallback commit message
			this.logService.warn(`[ChatSessionWorktreeService][handleRequestCompleted] Unable to generate commit message for working directory ${worktreePath}. Repository state: ${JSON.stringify(repository.state)}`);
			message = `Copilot CLI session ${sessionId} changes`;
		}

		// Commit the changes
		await this.gitService.commit(vscode.Uri.file(worktreePath), message, { all: true, noVerify: true, signCommit: false });
		this.logService.trace(`[ChatSessionWorktreeService] Committed all changes in working directory ${worktreePath}`);

		// Delete worktree changes cache
		await this.setWorktreeProperties(sessionId, {
			...worktreeProperties,
			changes: undefined
		});
	}

	async cleanupWorktreeOnArchive(sessionId: string): Promise<{ cleaned: boolean; reason?: string }> {
		const worktreeProperties = await this.getWorktreeProperties(sessionId);
		if (!worktreeProperties) {
			return { cleaned: false, reason: 'no-worktree' };
		}

		const worktreePath = worktreeProperties.worktreePath;

		// Check if the worktree directory exists
		try {
			await fs.access(worktreePath);
		} catch {
			this.logService.trace(`[ChatSessionWorktreeService][cleanupWorktreeOnArchive] Worktree path does not exist: ${worktreePath}`);
			return { cleaned: false, reason: 'worktree-not-found' };
		}

		// Get the git repository for the worktree
		const repository = await this.gitCommitMessageService.getRepository(vscode.Uri.file(worktreePath));
		if (!repository) {
			this.logService.warn(`[ChatSessionWorktreeService][cleanupWorktreeOnArchive] Unable to find repository for worktree ${worktreePath}`);
			return { cleaned: false, reason: 'no-repository' };
		}

		const hasUncommittedChanges = repository.state.workingTreeChanges.length > 0
			|| repository.state.indexChanges.length > 0
			|| repository.state.untrackedChanges.length > 0;

		if (hasUncommittedChanges) {
			// For auto-commit sessions, commit changes before cleanup
			if (worktreeProperties.autoCommit !== false) {
				this.logService.trace(`[ChatSessionWorktreeService][cleanupWorktreeOnArchive] Auto-committing changes before cleanup for session ${sessionId}`);
				try {
					await this.handleRequestCompleted(sessionId);
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					this.logService.error(`[ChatSessionWorktreeService][cleanupWorktreeOnArchive] Failed to auto-commit: ${errorMessage}`);
					return { cleaned: false, reason: 'auto-commit-failed' };
				}
			} else {
				// Non-auto-commit sessions with uncommitted changes: skip cleanup
				this.logService.trace(`[ChatSessionWorktreeService][cleanupWorktreeOnArchive] Skipping cleanup for session ${sessionId}: has uncommitted changes and auto-commit is disabled`);
				return { cleaned: false, reason: 'uncommitted-changes' };
			}
		}

		// Verify the branch exists before deleting the worktree
		try {
			const refs = await this.gitService.getRefs(
				vscode.Uri.file(worktreeProperties.repositoryPath),
				{ pattern: `refs/heads/${worktreeProperties.branchName}` }
			);
			if (!refs || refs.length === 0) {
				this.logService.warn(`[ChatSessionWorktreeService][cleanupWorktreeOnArchive] Branch ${worktreeProperties.branchName} not found, skipping cleanup`);
				return { cleaned: false, reason: 'branch-not-found' };
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.warn(`[ChatSessionWorktreeService][cleanupWorktreeOnArchive] Failed to verify branch: ${errorMessage}`);
			return { cleaned: false, reason: 'branch-check-failed' };
		}

		// Delete the worktree
		try {
			const parentRepository = await this.gitService.getRepository(vscode.Uri.file(worktreeProperties.repositoryPath), true);
			if (!parentRepository) {
				this.logService.warn(`[ChatSessionWorktreeService][cleanupWorktreeOnArchive] No parent repository found for ${worktreeProperties.repositoryPath}`);
				return { cleaned: false, reason: 'no-parent-repository' };
			}
			await this.gitService.deleteWorktree(parentRepository.rootUri, worktreePath);
			this.logService.trace(`[ChatSessionWorktreeService][cleanupWorktreeOnArchive] Deleted worktree ${worktreePath} for session ${sessionId}`);
			return { cleaned: true };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error(`[ChatSessionWorktreeService][cleanupWorktreeOnArchive] Failed to delete worktree: ${errorMessage}`);
			return { cleaned: false, reason: 'delete-failed' };
		}
	}

	async recreateWorktreeOnUnarchive(sessionId: string): Promise<{ recreated: boolean; reason?: string }> {
		const worktreeProperties = await this.getWorktreeProperties(sessionId);
		if (!worktreeProperties) {
			return { recreated: false, reason: 'no-worktree-properties' };
		}

		const worktreePath = worktreeProperties.worktreePath;

		// Check if the worktree already exists on disk
		try {
			await fs.access(worktreePath);
			this.logService.trace(`[ChatSessionWorktreeService][recreateWorktreeOnUnarchive] Worktree already exists at ${worktreePath}`);
			return { recreated: false, reason: 'already-exists' };
		} catch {
			// Expected — worktree was cleaned up on archive
		}

		// Verify the branch still exists in the parent repository
		try {
			const refs = await this.gitService.getRefs(
				vscode.Uri.file(worktreeProperties.repositoryPath),
				{ pattern: `refs/heads/${worktreeProperties.branchName}` }
			);
			if (!refs || refs.length === 0) {
				this.logService.warn(`[ChatSessionWorktreeService][recreateWorktreeOnUnarchive] Branch ${worktreeProperties.branchName} no longer exists`);
				return { recreated: false, reason: 'branch-not-found' };
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.warn(`[ChatSessionWorktreeService][recreateWorktreeOnUnarchive] Failed to verify branch: ${errorMessage}`);
			return { recreated: false, reason: 'branch-check-failed' };
		}

		// Recreate the worktree from the existing branch
		try {
			const parentRepository = await this.gitService.getRepository(vscode.Uri.file(worktreeProperties.repositoryPath), true);
			if (!parentRepository) {
				this.logService.warn(`[ChatSessionWorktreeService][recreateWorktreeOnUnarchive] No parent repository found for ${worktreeProperties.repositoryPath}`);
				return { recreated: false, reason: 'no-parent-repository' };
			}

			// Use commitish (existing branch) without branch (no -b flag) to checkout the existing branch
			const createdPath = await this.gitService.createWorktree(parentRepository.rootUri, {
				path: worktreePath,
				commitish: worktreeProperties.branchName,
			});

			if (!createdPath) {
				this.logService.error(`[ChatSessionWorktreeService][recreateWorktreeOnUnarchive] createWorktree returned no path`);
				return { recreated: false, reason: 'create-failed' };
			}

			this.logService.trace(`[ChatSessionWorktreeService][recreateWorktreeOnUnarchive] Recreated worktree at ${createdPath} for session ${sessionId}`);
			return { recreated: true };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error(`[ChatSessionWorktreeService][recreateWorktreeOnUnarchive] Failed to recreate worktree: ${errorMessage}`);
			return { recreated: false, reason: 'create-failed' };
		}
	}

	private async _getWorktreeChangesFromIndex(worktreeProperties: ChatSessionWorktreeProperties): Promise<readonly ChatSessionWorktreeFile[] | undefined> {
		const worktreePath = vscode.Uri.file(worktreeProperties.worktreePath);
		const worktreeRepository = await this.gitService.getRepository(worktreePath);

		if (!worktreeRepository?.changes) {
			return [];
		}

		const changes: ChatSessionWorktreeFile[] = [];
		for (const change of [...worktreeRepository.changes.indexChanges, ...worktreeRepository.changes.workingTree]) {
			try {
				const fileStats = await this.gitService.diffIndexWithHEADShortStats(change.uri);
				changes.push({
					filePath: change.uri.fsPath,
					originalFilePath: change.status !== 1 /* INDEX_ADDED */
						? change.originalUri?.fsPath
						: undefined,
					modifiedFilePath: change.status !== 2 /* INDEX_DELETED */
						? change.uri.fsPath
						: undefined,
					statistics: {
						additions: fileStats?.insertions ?? 0,
						deletions: fileStats?.deletions ?? 0
					}
				} satisfies ChatSessionWorktreeFile);
			} catch (error) { }
		}

		return changes;
	}

	private async _getWorktreeChangesFromCommits(worktreeProperties: ChatSessionWorktreePropertiesV2): Promise<{ changes: readonly ChatSessionWorktreeFile[] } | undefined> {
		// Open the main repository that contains the worktree. We have to open
		// the repository so that we can run do `git diff` against the repository
		// to get the committed changes in the worktree branch.
		const repository = await this.gitService.getRepository(vscode.Uri.file(worktreeProperties.repositoryPath));

		if (!repository) {
			return undefined;
		}

		// These changes are committed in the worktree branch but since they are
		// committed we can get the changes from the main repository and we do
		// not need to open the worktree repository.
		const diff = await this.gitService.diffBetweenWithStats(
			repository.rootUri,
			worktreeProperties.baseCommit,
			worktreeProperties.branchName);

		if (!diff) {
			return { changes: [] };
		}

		const changes = diff.map(change => {
			// Since the diff was computed using the main repository, the file paths in the diff are relative to the
			// main repository. We need to convert them to absolute paths by joining them with the repository path.
			const worktreeFilePath = path.join(worktreeProperties.worktreePath, path.relative(worktreeProperties.repositoryPath, change.uri.fsPath));
			const worktreeOriginalFilePath = change.originalUri
				? path.join(worktreeProperties.worktreePath, path.relative(worktreeProperties.repositoryPath, change.originalUri.fsPath))
				: undefined;

			return {
				filePath: worktreeFilePath,
				originalFilePath: change.status !== 1 /* INDEX_ADDED */
					? worktreeOriginalFilePath
					: undefined,
				modifiedFilePath: change.status !== 6 /* DELETED */
					? worktreeFilePath
					: undefined,
				statistics: {
					additions: change.insertions,
					deletions: change.deletions
				}
			} satisfies ChatSessionWorktreeFile;
		});

		return { changes };
	}

	private async _getWorktreeChanges(sessionId: string, worktreeProperties: ChatSessionWorktreeProperties): Promise<{
		readonly changes: readonly ChatSessionWorktreeFile[];
		readonly hasGitHubRemote?: boolean;
		readonly upstreamBranchName?: string;
		readonly incomingChanges?: number;
		readonly outgoingChanges?: number;
		readonly uncommittedChanges?: number;
	} | undefined> {
		if (worktreeProperties.version !== 2) {
			this.logService.warn(`[ChatSessionWorktreeService][_getWorktreeChanges] Worktree properties for session ${sessionId} is not version 2.`);
			return undefined;
		}

		// We need to open the worktree repository since we need access to the worktree repository's
		// working tree in order to compute the diff statistics. We do this to provide updates while
		// the session is in progress, or if auto-commit is disabled
		const worktreeRepository = await this.gitService.getRepository(vscode.Uri.file(worktreeProperties.worktreePath));

		if (!worktreeRepository) {
			this.logService.warn(`[ChatSessionWorktreeService][_getWorktreeChanges] Unable to open worktree repository for session ${sessionId} at path ${worktreeProperties.worktreePath}`);
			return undefined;
		}

		// Check for untracked changes
		const hasUntrackedChanges = [
			...worktreeRepository.changes?.workingTree ?? [],
			...worktreeRepository.changes?.untrackedChanges ?? [],
		].some(change => change.status === 7 /* UNTRACKED */);


		// If the repository is using a virtual file system, we need to
		// disable rename detection to avoid expensive git operations
		const noRenamesArg = worktreeRepository.isUsingVirtualFileSystem
			? ['--no-renames']
			: [];

		const diffChanges: DiffChange[] = [];
		const worktreePath = vscode.Uri.file(worktreeProperties.worktreePath);

		if (hasUntrackedChanges) {
			// Tracked + untracked changes
			const tmpDirName = `vscode-sessions-${sessionId}-${generateUuid()}`;
			const diffIndexFile = path.join(this.extensionContext.globalStorageUri.fsPath, tmpDirName, 'diff.index');
			const pathspecFile = path.join(this.extensionContext.globalStorageUri.fsPath, tmpDirName, `pathspec.txt`);

			const env = buildTempIndexEnv(worktreeRepository, diffIndexFile);

			try {
				// Create temp index file directory
				await fs.mkdir(path.dirname(diffIndexFile), { recursive: true });

				// Populate temp index from HEAD
				await this.gitService.exec(worktreePath, ['read-tree', 'HEAD'], env);

				// Stage entire working directory into temp index
				const uncommittedFilePaths = getUncommittedFilePaths(worktreeRepository);
				await fs.writeFile(pathspecFile, uncommittedFilePaths.join('\n'), 'utf8');
				await this.gitService.exec(worktreePath, ['add', '-A', `--pathspec-from-file=${pathspecFile}`], env);

				// Diff the temp index with the base branch
				const result = await this.gitService.exec(worktreePath, ['diff', '--cached', '--raw', '--numstat', '--diff-filter=ADMR', ...noRenamesArg, '-z', '--merge-base', worktreeProperties.baseBranchName, '--'], env);
				diffChanges.push(...parseGitChangesRaw(worktreeProperties.worktreePath, result));
			} catch (error) {
				this.logService.error(`[ChatSessionWorktreeService][_getWorktreeChanges] Error while processing worktree changes for session ${sessionId}: ${error}`);
				return undefined;
			} finally {
				try {
					await fs.rm(path.dirname(diffIndexFile), { recursive: true, force: true });
				} catch (error) {
					this.logService.error(`[ChatSessionWorktreeService][_getWorktreeChanges] Error while cleaning up temp index file for session ${sessionId}: ${error}`);
				}
			}
		} else {
			// Tracked changes
			try {
				const result = await this.gitService.exec(worktreePath, ['diff', '--raw', '--numstat', '--diff-filter=ADMR', ...noRenamesArg, '-z', '--merge-base', worktreeProperties.baseBranchName, '--']);
				diffChanges.push(...parseGitChangesRaw(worktreeProperties.worktreePath, result));
			} catch (error) {
				this.logService.error(`[ChatSessionWorktreeService][_getWorktreeChanges] Error while processing worktree changes for session ${sessionId}: ${error}`);
				return undefined;
			}
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
			hasGitHubRemote: getGitHubRepoInfoFromContext(worktreeRepository) !== undefined,
			upstreamBranchName: worktreeRepository.upstreamRemote && worktreeRepository.upstreamBranchName
				? `${worktreeRepository.upstreamRemote}/${worktreeRepository.upstreamBranchName}`
				: undefined,
			incomingChanges: worktreeRepository.headIncomingChanges ?? 0,
			outgoingChanges: worktreeRepository.headOutgoingChanges ?? 0,
			uncommittedChanges:
				(worktreeRepository.changes?.mergeChanges.length ?? 0) +
				(worktreeRepository.changes?.indexChanges.length ?? 0) +
				(worktreeRepository.changes?.workingTree.length ?? 0) +
				(worktreeRepository.changes?.untrackedChanges.length ?? 0)
		};

		return { changes, ...repositoryState };
	}

	private _toChatSessionChangedFile2(sessionId: string, change: ChatSessionWorktreeFile, worktreeProperties: ChatSessionWorktreeProperties): vscode.ChatSessionChangedFile2 {
		let originalFileRef: string, modifiedFileRef: string | undefined;
		if (worktreeProperties.version === 2) {
			// Commit | Working tree
			originalFileRef = vscode.workspace.isAgentSessionsWorkspace
				? worktreeProperties.baseBranchName
				: worktreeProperties.baseCommit;
			modifiedFileRef = vscode.workspace.isAgentSessionsWorkspace
				? undefined
				: worktreeProperties.branchName;
		} else {
			// Legacy
			originalFileRef = worktreeProperties.baseCommit;
			modifiedFileRef = worktreeProperties.branchName;
		}

		return new vscode.ChatSessionChangedFile2(
			vscode.Uri.file(change.filePath),
			change.originalFilePath
				? toGitUri(vscode.Uri.file(change.originalFilePath), originalFileRef)
				: undefined,
			change.modifiedFilePath
				? modifiedFileRef
					? toGitUri(vscode.Uri.file(change.modifiedFilePath), modifiedFileRef)
					: vscode.Uri.file(change.modifiedFilePath)
				: undefined,
			change.statistics.additions,
			change.statistics.deletions);
	}

	async getAdditionalWorktreeProperties(sessionId: string): Promise<ChatSessionWorktreeProperties[]> {
		const additionalWorkspaces = await this.metadataStore.getAdditionalWorkspaces(sessionId);
		return additionalWorkspaces
			.map(ws => ws.worktreeProperties)
			.filter((props): props is ChatSessionWorktreeProperties => !!props);
	}

	async setAdditionalWorktreeProperties(sessionId: string, properties: ChatSessionWorktreeProperties[]): Promise<void> {
		const workspaces = properties.map(props => ({
			folder: undefined,
			repository: vscode.Uri.file(props.repositoryPath),
			worktree: vscode.Uri.file(props.worktreePath),
			worktreeProperties: props,
		}));
		await this.metadataStore.setAdditionalWorkspaces(sessionId, workspaces);
	}

	async handleRequestCompletedForWorktree(worktreeProperties: ChatSessionWorktreeProperties): Promise<void> {
		if (worktreeProperties.autoCommit === false) {
			this.logService.trace(`[ChatSessionWorktreeService][handleRequestCompletedForWorktree] Auto-commit is disabled, skipping commit for worktree ${worktreeProperties.worktreePath}`);
			return;
		}

		const worktreePath = worktreeProperties.worktreePath;
		const repository = await this.gitCommitMessageService.getRepository(vscode.Uri.file(worktreePath));
		if (!repository) {
			this.logService.error(`[ChatSessionWorktreeService][handleRequestCompletedForWorktree] Unable to find repository for working directory ${worktreePath}`);
			throw new Error(`Unable to find repository for working directory ${worktreePath}`);
		}

		if (repository.state.workingTreeChanges.length === 0 && repository.state.indexChanges.length === 0 && repository.state.untrackedChanges.length === 0) {
			this.logService.trace(`[ChatSessionWorktreeService][handleRequestCompletedForWorktree] No changes to commit in working directory ${worktreePath}`);
			return;
		}

		let message: string | undefined;
		try {
			message = await this.gitCommitMessageService.generateCommitMessage(repository, CancellationToken.None);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error(`[ChatSessionWorktreeService][handleRequestCompletedForWorktree] Error generating commit message for ${worktreePath}: ${errorMessage}`);
		}

		if (!message) {
			message = `Copilot CLI session changes`;
		}

		await this.gitService.commit(vscode.Uri.file(worktreePath), message, { all: true, noVerify: true, signCommit: false });
		this.logService.trace(`[ChatSessionWorktreeService][handleRequestCompletedForWorktree] Committed all changes in working directory ${worktreePath}`);
	}
}
