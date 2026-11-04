/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable, observableValue, ISettableObservable } from '../../../../base/common/observable.js';
import { relativePath, basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IChatPromptSlashCommand, IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CustomizationCreatorService } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationCreatorService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';
import { ILabelService } from '../../../../platform/label/common/label.js';

/**
 * Agent Sessions override of IAICustomizationWorkspaceService.
 * Delegates to ISessionsService to provide the active session's
 * worktree/repository as the project root, and supports worktree commit.
 *
 * Customization files are always committed to the main repository so they
 * persist across worktrees. When a worktree is active the file is also
 * copied into the worktree and committed there so the running session
 * picks it up immediately.
 */
export class SessionsAICustomizationWorkspaceService implements IAICustomizationWorkspaceService {
	declare readonly _serviceBrand: undefined;

	readonly activeProjectRoot: IObservable<URI | undefined>;
	readonly activeProjectLabel: IObservable<string | undefined>;
	readonly hasOverrideProjectRoot: IObservable<boolean>;

	/**
	 * Transient override for the project root. When set, `activeProjectRoot`
	 * returns this value instead of the session-derived root.
	 */
	private readonly _overrideRoot: ISettableObservable<URI | undefined>;

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IGitService private readonly gitService: IGitService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		this._overrideRoot = observableValue(this, undefined);

		this.activeProjectRoot = derived(reader => {
			const override = this._overrideRoot.read(reader);
			if (override) {
				return override;
			}
			const session = this.sessionsService.activeSession.read(reader);
			const folder = session?.activeChat.read(reader).workspace.read(reader)?.folders[0];
			const root = folder?.workingDirectory;
			if (root?.scheme === AGENT_HOST_SCHEME) {
				return undefined;
			}
			return root;
		});

		this.activeProjectLabel = derived(reader => {
			const override = this._overrideRoot.read(reader);
			if (override) {
				return this.labelService.getUriBasenameLabel(override);
			}
			const session = this.sessionsService.activeSession.read(reader);
			const workspace = session?.activeChat.read(reader).workspace.read(reader);
			return workspace?.isVirtualWorkspace ? workspace.label : workspace?.folders[0]?.name;
		});

		this.hasOverrideProjectRoot = derived(reader => {
			return this._overrideRoot.read(reader) !== undefined;
		});
	}

	getActiveProjectRoot(): URI | undefined {
		const override = this._overrideRoot.get();
		if (override) {
			return override;
		}
		const session = this.sessionsService.activeSession.get();
		const folder = session?.activeChat.get().workspace.get()?.folders[0];
		const root = folder?.workingDirectory;
		if (root?.scheme === AGENT_HOST_SCHEME) {
			return undefined;
		}
		return root;
	}

	setOverrideProjectRoot(root: URI): void {
		this._overrideRoot.set(root, undefined);
	}

	clearOverrideProjectRoot(): void {
		this._overrideRoot.set(undefined, undefined);
	}

	readonly managementSections: readonly AICustomizationManagementSection[] = [
		AICustomizationManagementSection.Plugins,
		AICustomizationManagementSection.Canvases,
		AICustomizationManagementSection.McpServers,
		AICustomizationManagementSection.Skills,
		AICustomizationManagementSection.Instructions,
		AICustomizationManagementSection.Agents,
		AICustomizationManagementSection.Hooks,
		AICustomizationManagementSection.Tools,
		AICustomizationManagementSection.Extensions,
		AICustomizationManagementSection.Automations,
		AICustomizationManagementSection.HarnessSettings,
	];

	readonly isSessionsWindow = true;

	readonly welcomePageFeatures = {
		showGettingStartedBanner: true,
	};

	/**
	 * Commits customization files. Always commits to the main repository
	 * so the change persists across worktrees. When a worktree is active
	 * the file is also committed there so the session sees it immediately.
	 */
	async commitFiles(_projectRoot: URI, fileUris: URI[]): Promise<boolean> {
		const session = this.sessionsService.activeSession.get();
		const folder = session?.activeChat.get().workspace.get()?.folders[0];
		if (!folder?.root) {
			return true;
		}

		let succeeded = true;
		for (const fileUri of fileUris) {
			succeeded = await this.commitFileToRepos(fileUri, folder.root, folder.workingDirectory) && succeeded;
		}
		return succeeded;
	}

	/**
	 * Commits the deletion of files that have already been removed from disk.
	 * Always stages + commits the removal in the main repository, and also
	 * in the worktree if one is active.
	 */
	async deleteFiles(_projectRoot: URI, fileUris: URI[]): Promise<boolean> {
		const session = this.sessionsService.activeSession.get();
		const folder = session?.activeChat.get().workspace.get()?.folders[0];
		if (!folder?.root) {
			return true;
		}

		let succeeded = true;
		for (const fileUri of fileUris) {
			succeeded = await this.commitDeletionToRepos(fileUri, folder.root, folder.workingDirectory) && succeeded;
		}
		return succeeded;
	}

	/**
	 * Computes the repository-relative path for a file. The file may be
	 * located under the worktree or the repository root.
	 */
	private getRelativePath(fileUri: URI, repositoryUri: URI, worktreeUri: URI | undefined): string | undefined {
		// Try worktree first (when active, files are written under it)
		if (worktreeUri) {
			const rel = relativePath(worktreeUri, fileUri);
			if (rel) {
				return rel;
			}
		}
		return relativePath(repositoryUri, fileUri);
	}

	/**
	 * Commits a single file to the main repository and optionally the worktree.
	 * Copies the file content between trees when needed. Both trees are attempted
	 * even if the first fails.
	 *
	 * @returns `false` if any commit failed.
	 */
	private async commitFileToRepos(fileUri: URI, repositoryUri: URI, worktreeUri: URI | undefined): Promise<boolean> {
		const relPath = this.getRelativePath(fileUri, repositoryUri, worktreeUri);
		if (!relPath) {
			return true;
		}

		const repoFileUri = URI.joinPath(repositoryUri, relPath);
		let succeeded = true;

		// 1. Always commit to main repository
		try {
			if (repoFileUri.toString() !== fileUri.toString()) {
				const content = await this.fileService.readFile(fileUri);
				await this.fileService.writeFile(repoFileUri, content.value);
			}
			await this.commitToGit(repositoryUri, repoFileUri);
		} catch (error) {
			succeeded = false;
			this.logService.error('[SessionsAICustomizationWorkspaceService] Failed to commit to repository:', error);
			this.notificationService.notify(worktreeUri ? {
				severity: Severity.Warning,
				message: localize('commitToRepoFailed', "Your customization was saved to this session's worktree, but we couldn't apply it to the default branch. You may need to apply it manually."),
			} : {
				severity: Severity.Error,
				message: localize('commitToRepoOnlyFailed', "Your customization was saved, but we couldn't commit it to the repository."),
			});
		}

		// 2. Also commit to the worktree if active
		if (worktreeUri) {
			const worktreeFileUri = URI.joinPath(worktreeUri, relPath);
			try {
				if (worktreeFileUri.toString() !== fileUri.toString()) {
					const content = await this.fileService.readFile(fileUri);
					await this.fileService.writeFile(worktreeFileUri, content.value);
				}
				await this.commitToGit(worktreeUri, worktreeFileUri);
			} catch (error) {
				succeeded = false;
				this.logService.error('[SessionsAICustomizationWorkspaceService] Failed to commit to worktree:', error);
				this.notificationService.notify({
					severity: Severity.Error,
					message: localize('commitToWorktreeFailed', "Your customization was saved, but we couldn't commit it to this session's worktree."),
				});
			}
		}

		return succeeded;
	}

	/**
	 * Commits the deletion of a file to the main repository and optionally
	 * the worktree. The file is already deleted from disk before this is called;
	 * `git add` on a deleted path stages the removal. Both trees are attempted
	 * even if the first fails.
	 *
	 * @returns `false` if any commit failed.
	 */
	private async commitDeletionToRepos(fileUri: URI, repositoryUri: URI, worktreeUri: URI | undefined): Promise<boolean> {
		const relPath = this.getRelativePath(fileUri, repositoryUri, worktreeUri);
		if (!relPath) {
			return true;
		}

		const repoFileUri = URI.joinPath(repositoryUri, relPath);
		let succeeded = true;

		// 1. Delete from main repository if it exists there, then commit
		try {
			if (await this.fileService.exists(repoFileUri)) {
				await this.fileService.del(repoFileUri, { useTrash: true, recursive: true });
			}
			await this.commitToGit(repositoryUri, repoFileUri);
		} catch (error) {
			succeeded = false;
			this.logService.error('[SessionsAICustomizationWorkspaceService] Failed to commit deletion to repository:', error);
			this.notificationService.notify(worktreeUri ? {
				severity: Severity.Warning,
				message: localize('deleteFromRepoFailed', "Your customization was removed from this session's worktree, but we couldn't apply the change to the default branch. You may need to remove it manually."),
			} : {
				severity: Severity.Error,
				message: localize('deleteFromRepoOnlyFailed', "Your customization was removed, but we couldn't commit the removal to the repository."),
			});
		}

		// 2. Also commit the deletion in the worktree if active
		if (worktreeUri) {
			const worktreeFileUri = URI.joinPath(worktreeUri, relPath);
			try {
				// The file may already be deleted from the worktree by the caller
				await this.commitToGit(worktreeUri, worktreeFileUri);
			} catch (error) {
				succeeded = false;
				this.logService.error('[SessionsAICustomizationWorkspaceService] Failed to commit deletion to worktree:', error);
				this.notificationService.notify({
					severity: Severity.Error,
					message: localize('deleteFromWorktreeFailed', "Your customization was removed, but we couldn't commit the removal to this session's worktree."),
				});
			}
		}

		return succeeded;
	}

	/**
	 * Stages and commits a single customization file (or its deletion) in the
	 * git repository rooted at `repositoryRoot`. Does nothing when the folder
	 * is not a git repository or the file has no changes to commit.
	 */
	private async commitToGit(repositoryRoot: URI, fileUri: URI): Promise<void> {
		const repository = await this.gitService.openRepository(repositoryRoot);
		if (!repository) {
			this.logService.debug(`[SessionsAICustomizationWorkspaceService] Not a git repository, skipping commit: ${repositoryRoot.toString()}`);
			return;
		}

		await repository.commitFiles(
			[fileUri],
			localize('commitCustomizationMessage', "Update customization: {0}", basename(fileUri)),
			{ noVerify: true, signCommit: false }
		);
	}

	async generateCustomization(type: PromptsType, workspaceFolder?: URI): Promise<void> {
		const creator = this.instantiationService.createInstance(CustomizationCreatorService);
		await creator.createWithAI(type, workspaceFolder);
	}

	async getFilteredPromptSlashCommands(token: CancellationToken): Promise<readonly IChatPromptSlashCommand[]> {
		return await this.promptsService.getPromptSlashCommands(token);
	}

	private static readonly _skillUIIntegrations: ReadonlyMap<string, string> = new Map([
		['act-on-feedback', localize('skillUI.actOnFeedback', "Used by the Submit Feedback button in the Changes toolbar")],
		['fix-ci', localize('skillUI.fixCi', "Used by the Fix Checks button in the Changes toolbar")],
		['code-review', localize('skillUI.codeReview', "Used by the Run Code Review button in the Changes view")],
		['generate-run-commands', localize('skillUI.generateRunCommands', "Used by the Run button in the title bar")],
		['create-pr', localize('skillUI.createPr', "Used by the Create PR button in the Changes toolbar")],
		['create-draft-pr', localize('skillUI.createDraftPr', "Used by the Create Draft PR button in the Changes toolbar")],
		['update-pr', localize('skillUI.updatePr', "Used by the Update Pull Request button in the Changes toolbar")],
		['merge-changes', localize('skillUI.mergeChanges', "Used by the Merge button in the Changes toolbar")],
		['commit', localize('skillUI.commit', "Used by the Commit button in the Changes toolbar")],
	]);

	getSkillUIIntegrations(): ReadonlyMap<string, string> {
		return SessionsAICustomizationWorkspaceService._skillUIIntegrations;
	}
}
