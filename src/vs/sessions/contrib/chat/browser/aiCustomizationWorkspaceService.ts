/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable, observableValue, ISettableObservable } from '../../../../base/common/observable.js';
import { relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection, IStorageSourceFilter, applyStorageSourceFilter } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IChatPromptSlashCommand, IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CustomizationCreatorService } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationCreatorService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';

/**
 * Agent Sessions override of IAICustomizationWorkspaceService.
 * Delegates to ISessionsManagementService to provide the active session's
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
	readonly hasOverrideProjectRoot: IObservable<boolean>;

	/**
	 * Transient override for the project root. When set, `activeProjectRoot`
	 * returns this value instead of the session-derived root.
	 */
	private readonly _overrideRoot: ISettableObservable<URI | undefined>;

	constructor(
		@ISessionsManagementService private readonly sessionsService: ISessionsManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		this._overrideRoot = observableValue(this, undefined);

		this.activeProjectRoot = derived(reader => {
			const override = this._overrideRoot.read(reader);
			if (override) {
				return override;
			}
			const session = this.sessionsService.activeSession.read(reader);
			const repo = session?.workspace.read(reader)?.repositories[0];
			const root = repo?.workingDirectory ?? repo?.uri;
			if (root?.scheme === AGENT_HOST_SCHEME) {
				return undefined;
			}
			return root;
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
		const repo = session?.workspace.get()?.repositories[0];
		const root = repo?.workingDirectory ?? repo?.uri;
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
		AICustomizationManagementSection.Agents,
		AICustomizationManagementSection.Skills,
		AICustomizationManagementSection.Instructions,
		AICustomizationManagementSection.Prompts,
		AICustomizationManagementSection.Hooks,
		AICustomizationManagementSection.McpServers,
		AICustomizationManagementSection.Plugins,
	];

	getStorageSourceFilter(type: PromptsType): IStorageSourceFilter {
		return this.harnessService.getStorageSourceFilter(type);
	}

	readonly isSessionsWindow = true;

	/**
	 * Commits customization files. Always commits to the main repository
	 * so the change persists across worktrees. When a worktree is active
	 * the file is also committed there so the session sees it immediately.
	 */
	async commitFiles(_projectRoot: URI, fileUris: URI[]): Promise<void> {
		const session = this.sessionsService.activeSession.get();
		const repo = session?.workspace.get()?.repositories[0];
		if (!repo?.uri) {
			return;
		}

		for (const fileUri of fileUris) {
			await this.commitFileToRepos(fileUri, repo.uri, repo.workingDirectory);
		}
	}

	/**
	 * Commits the deletion of files that have already been removed from disk.
	 * Always stages + commits the removal in the main repository, and also
	 * in the worktree if one is active.
	 */
	async deleteFiles(_projectRoot: URI, fileUris: URI[]): Promise<void> {
		const session = this.sessionsService.activeSession.get();
		const repo = session?.workspace.get()?.repositories[0];
		if (!repo?.uri) {
			return;
		}

		for (const fileUri of fileUris) {
			await this.commitDeletionToRepos(fileUri, repo.uri, repo.workingDirectory);
		}
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
	 * Copies the file content between trees when needed.
	 */
	private async commitFileToRepos(fileUri: URI, repositoryUri: URI, worktreeUri: URI | undefined): Promise<void> {
		const relPath = this.getRelativePath(fileUri, repositoryUri, worktreeUri);
		if (!relPath) {
			return;
		}

		const repoFileUri = URI.joinPath(repositoryUri, relPath);

		// 1. Always commit to main repository
		try {
			if (repoFileUri.toString() !== fileUri.toString()) {
				const content = await this.fileService.readFile(fileUri);
				await this.fileService.writeFile(repoFileUri, content.value);
			}
			await this.commandService.executeCommand(
				'github.copilot.cli.sessions.commitToRepository',
				{ repositoryUri, fileUri: repoFileUri }
			);
		} catch (error) {
			this.logService.error('[SessionsAICustomizationWorkspaceService] Failed to commit to repository:', error);
			if (worktreeUri) {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: localize('commitToRepoFailed', "Your customization was saved to this session's worktree, but we couldn't apply it to the default branch. You may need to apply it manually."),
				});
			}
		}

		// 2. Also commit to the worktree if active
		if (worktreeUri) {
			const worktreeFileUri = URI.joinPath(worktreeUri, relPath);
			try {
				if (worktreeFileUri.toString() !== fileUri.toString()) {
					const content = await this.fileService.readFile(fileUri);
					await this.fileService.writeFile(worktreeFileUri, content.value);
				}
				await this.commandService.executeCommand(
					'github.copilot.cli.sessions.commitToWorktree',
					{ worktreeUri, fileUri: worktreeFileUri }
				);
			} catch (error) {
				this.logService.error('[SessionsAICustomizationWorkspaceService] Failed to commit to worktree:', error);
			}
		}
	}

	/**
	 * Commits the deletion of a file to the main repository and optionally
	 * the worktree. The file is already deleted from disk before this is called;
	 * `git add` on a deleted path stages the removal.
	 */
	private async commitDeletionToRepos(fileUri: URI, repositoryUri: URI, worktreeUri: URI | undefined): Promise<void> {
		const relPath = this.getRelativePath(fileUri, repositoryUri, worktreeUri);
		if (!relPath) {
			return;
		}

		const repoFileUri = URI.joinPath(repositoryUri, relPath);

		// 1. Delete from main repository if it exists there, then commit
		try {
			if (await this.fileService.exists(repoFileUri)) {
				await this.fileService.del(repoFileUri, { useTrash: true, recursive: true });
			}
			await this.commandService.executeCommand(
				'github.copilot.cli.sessions.commitToRepository',
				{ repositoryUri, fileUri: repoFileUri }
			);
		} catch (error) {
			this.logService.error('[SessionsAICustomizationWorkspaceService] Failed to commit deletion to repository:', error);
			if (worktreeUri) {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: localize('deleteFromRepoFailed', "Your customization was removed from this session's worktree, but we couldn't apply the change to the default branch. You may need to remove it manually."),
				});
			}
		}

		// 2. Also commit the deletion in the worktree if active
		if (worktreeUri) {
			const worktreeFileUri = URI.joinPath(worktreeUri, relPath);
			try {
				// The file may already be deleted from the worktree by the caller
				await this.commandService.executeCommand(
					'github.copilot.cli.sessions.commitToWorktree',
					{ worktreeUri, fileUri: worktreeFileUri }
				);
			} catch (error) {
				this.logService.error('[SessionsAICustomizationWorkspaceService] Failed to commit deletion to worktree:', error);
			}
		}
	}

	async generateCustomization(type: PromptsType): Promise<void> {
		const creator = this.instantiationService.createInstance(CustomizationCreatorService);
		await creator.createWithAI(type);
	}

	async getFilteredPromptSlashCommands(token: CancellationToken): Promise<readonly IChatPromptSlashCommand[]> {
		const allCommands = await this.promptsService.getPromptSlashCommands(token);
		return allCommands.filter(cmd => {
			const filter = this.getStorageSourceFilter(cmd.type);
			return applyStorageSourceFilter([cmd], filter).length > 0;
		});
	}

	private static readonly _skillUIIntegrations: ReadonlyMap<string, string> = new Map([
		['act-on-feedback', localize('skillUI.actOnFeedback', "Used by the Submit Feedback button in the Changes toolbar")],
		['generate-run-commands', localize('skillUI.generateRunCommands', "Used by the Run button in the title bar")],
		['create-pr', localize('skillUI.createPr', "Used by the Create Pull Request button in the Changes toolbar")],
		['create-draft-pr', localize('skillUI.createDraftPr', "Used by the Create Draft Pull Request button in the Changes toolbar")],
		['update-pr', localize('skillUI.updatePr', "Used by the Update Pull Request button in the Changes toolbar")],
		['merge-changes', localize('skillUI.mergeChanges', "Used by the Merge button in the Changes toolbar")],
		['commit', localize('skillUI.commit', "Used by the Commit button in the Changes toolbar")],
	]);

	getSkillUIIntegrations(): ReadonlyMap<string, string> {
		return SessionsAICustomizationWorkspaceService._skillUIIntegrations;
	}
}
