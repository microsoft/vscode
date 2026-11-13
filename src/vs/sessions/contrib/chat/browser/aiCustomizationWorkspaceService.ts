/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable, observableValue, ISettableObservable } from '../../../../base/common/observable.js';
import { relativePath, basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection, IAICustomizationTargetLabels } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IChatPromptSlashCommand, IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IFocusedSessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
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
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { getHarnessPresentationOrDefault } from '../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { INewSessionComposerService, INewSessionTargetLabels } from '../../../../workbench/contrib/sessions/browser/newSessionComposerService.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { getChatHarness, IChat, ISession, ISessionFolder, ISessionWorkspace } from '../../../../workbench/services/sessions/common/session.js';

type ActiveCustomizationTarget =
	| { readonly kind: 'chat'; readonly session: ISession; readonly chat: IChat }
	| { readonly kind: 'composer'; readonly labels: INewSessionTargetLabels };

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
	readonly activeTargetLabels: IObservable<IAICustomizationTargetLabels>;
	readonly hasOverrideProjectRoot: IObservable<boolean>;

	/**
	 * Transient override for the project root. When set, `activeProjectRoot`
	 * returns this value instead of the session-derived root.
	 */
	private readonly _overrideRoot: ISettableObservable<URI | undefined>;
	private readonly _activeSessionResource: ISettableObservable<URI | undefined>;
	private readonly _activeTarget: IObservable<ActiveCustomizationTarget | undefined>;

	constructor(
		@IFocusedSessionHostService private readonly _focusedSessionHostService: IFocusedSessionHostService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IGitService private readonly gitService: IGitService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILabelService private readonly labelService: ILabelService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@INewSessionComposerService private readonly newSessionComposerService: INewSessionComposerService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		this._overrideRoot = observableValue(this, undefined);
		this._activeSessionResource = observableValue(this, undefined);

		this._activeTarget = derived(this, reader => {
			const explicitResource = this._activeSessionResource.read(reader);
			if (explicitResource) {
				const ownedChat = this.sessionsManagementService.getSessionForChatResource(explicitResource);
				if (ownedChat) {
					return { kind: 'chat', ...ownedChat };
				}
				const explicitSession = this.sessionsManagementService.getSession(explicitResource);
				if (explicitSession) {
					return { kind: 'chat', session: explicitSession, chat: explicitSession.mainChat.read(reader) };
				}
			}

			const host = this._focusedSessionHostService.focusedHost.read(reader);
			const focusedSession = host.session.read(reader);
			if (focusedSession) {
				return { kind: 'chat', session: focusedSession, chat: host.chat.read(reader) ?? focusedSession.mainChat.read(reader) };
			}
			const labels = this.newSessionComposerService.getComposer(host, reader)?.targetLabels?.read(reader);
			return labels ? { kind: 'composer', labels } : undefined;
		});

		this.activeProjectRoot = derived(this, reader => {
			const override = this._overrideRoot.read(reader);
			if (override) {
				return override;
			}
			const target = this._activeTarget.read(reader);
			if (!target) {
				return undefined;
			}
			const root = target.kind === 'composer' ? target.labels.projectRoot : target.chat.workspace.read(reader)?.folders[0]?.workingDirectory;
			if (root?.scheme === AGENT_HOST_SCHEME) {
				return undefined;
			}
			return root;
		});

		this.activeProjectLabel = derived(this, reader => {
			const override = this._overrideRoot.read(reader);
			if (override) {
				return this.labelService.getUriBasenameLabel(override);
			}
			const target = this._activeTarget.read(reader);
			if (!target) {
				return undefined;
			}
			return target.kind === 'composer' ? target.labels.workspace : this.getWorkspaceLabel(target.chat.workspace.read(reader));
		});

		this.activeTargetLabels = derived(this, reader => {
			const target = this._activeTarget.read(reader);
			if (!target) {
				return {};
			}
			if (target.kind === 'composer') {
				const { harness, workspace, environment } = target.labels;
				return { harness, workspace, environment };
			}
			const provider = this.sessionsProvidersService.getProvider(target.session.providerId, target.session.sessionId);
			return {
				harness: getHarnessPresentationOrDefault(provider, getChatHarness(target.session, target.chat), reader).label,
				workspace: this.getWorkspaceLabel(target.chat.workspace.read(reader)),
				environment: provider?.environment.label ?? target.session.environment,
			};
		});

		this.hasOverrideProjectRoot = derived(reader => {
			return this._overrideRoot.read(reader) !== undefined;
		});
	}

	getActiveProjectRoot(): URI | undefined {
		return this.activeProjectRoot.get();
	}

	setActiveSessionResource(resource: URI | undefined): void {
		this._activeSessionResource.set(resource, undefined);
	}

	setOverrideProjectRoot(root: URI): void {
		this._overrideRoot.set(root, undefined);
	}

	clearOverrideProjectRoot(): void {
		this._overrideRoot.set(undefined, undefined);
	}

	private getWorkspaceLabel(workspace: ISessionWorkspace | undefined): string | undefined {
		return workspace?.isVirtualWorkspace ? workspace.label : workspace?.folders[0]?.name;
	}

	private getActiveFolder(): Pick<ISessionFolder, 'root' | 'workingDirectory'> | undefined {
		const target = this._activeTarget.get();
		if (!target) {
			return undefined;
		}
		if (target.kind === 'chat') {
			return target.chat.workspace.get()?.folders[0];
		}
		return target.labels.repositoryRoot ? {
			root: target.labels.repositoryRoot,
			workingDirectory: target.labels.projectRoot ?? target.labels.repositoryRoot,
		} : undefined;
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
	async commitFiles(projectRoot: URI, fileUris: URI[]): Promise<boolean> {
		const folder = this.getActiveFolder();
		const repositoryRoot = folder?.root ?? projectRoot;
		const workingDirectory = folder?.workingDirectory ?? projectRoot;
		let succeeded = true;
		for (const fileUri of fileUris) {
			succeeded = await this.commitFileToRepos(fileUri, repositoryRoot, workingDirectory) && succeeded;
		}
		return succeeded;
	}

	/**
	 * Commits the deletion of files that have already been removed from disk.
	 * Always stages + commits the removal in the main repository, and also
	 * in the worktree if one is active.
	 */
	async deleteFiles(projectRoot: URI, fileUris: URI[]): Promise<boolean> {
		const folder = this.getActiveFolder();
		const repositoryRoot = folder?.root ?? projectRoot;
		const workingDirectory = folder?.workingDirectory ?? projectRoot;
		let succeeded = true;
		for (const fileUri of fileUris) {
			succeeded = await this.commitDeletionToRepos(fileUri, repositoryRoot, workingDirectory) && succeeded;
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
