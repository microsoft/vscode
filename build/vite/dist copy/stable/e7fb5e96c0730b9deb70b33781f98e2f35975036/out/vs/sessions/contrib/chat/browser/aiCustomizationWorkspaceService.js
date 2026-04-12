/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SessionsAICustomizationWorkspaceService_1;
import { derived, observableValue } from '../../../../base/common/observable.js';
import { relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { AICustomizationManagementSection, applyStorageSourceFilter } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CustomizationCreatorService } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationCreatorService.js';
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
let SessionsAICustomizationWorkspaceService = class SessionsAICustomizationWorkspaceService {
    static { SessionsAICustomizationWorkspaceService_1 = this; }
    constructor(sessionsService, instantiationService, promptsService, harnessService, commandService, logService, fileService, notificationService) {
        this.sessionsService = sessionsService;
        this.instantiationService = instantiationService;
        this.promptsService = promptsService;
        this.harnessService = harnessService;
        this.commandService = commandService;
        this.logService = logService;
        this.fileService = fileService;
        this.notificationService = notificationService;
        this.managementSections = [
            AICustomizationManagementSection.Agents,
            AICustomizationManagementSection.Skills,
            AICustomizationManagementSection.Instructions,
            AICustomizationManagementSection.Prompts,
            AICustomizationManagementSection.Hooks,
            AICustomizationManagementSection.McpServers,
            AICustomizationManagementSection.Plugins,
        ];
        this.isSessionsWindow = true;
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
    getActiveProjectRoot() {
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
    setOverrideProjectRoot(root) {
        this._overrideRoot.set(root, undefined);
    }
    clearOverrideProjectRoot() {
        this._overrideRoot.set(undefined, undefined);
    }
    getStorageSourceFilter(type) {
        return this.harnessService.getStorageSourceFilter(type);
    }
    /**
     * Commits customization files. Always commits to the main repository
     * so the change persists across worktrees. When a worktree is active
     * the file is also committed there so the session sees it immediately.
     */
    async commitFiles(_projectRoot, fileUris) {
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
    async deleteFiles(_projectRoot, fileUris) {
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
    getRelativePath(fileUri, repositoryUri, worktreeUri) {
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
    async commitFileToRepos(fileUri, repositoryUri, worktreeUri) {
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
            await this.commandService.executeCommand('github.copilot.cli.sessions.commitToRepository', { repositoryUri, fileUri: repoFileUri });
        }
        catch (error) {
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
                await this.commandService.executeCommand('github.copilot.cli.sessions.commitToWorktree', { worktreeUri, fileUri: worktreeFileUri });
            }
            catch (error) {
                this.logService.error('[SessionsAICustomizationWorkspaceService] Failed to commit to worktree:', error);
            }
        }
    }
    /**
     * Commits the deletion of a file to the main repository and optionally
     * the worktree. The file is already deleted from disk before this is called;
     * `git add` on a deleted path stages the removal.
     */
    async commitDeletionToRepos(fileUri, repositoryUri, worktreeUri) {
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
            await this.commandService.executeCommand('github.copilot.cli.sessions.commitToRepository', { repositoryUri, fileUri: repoFileUri });
        }
        catch (error) {
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
                await this.commandService.executeCommand('github.copilot.cli.sessions.commitToWorktree', { worktreeUri, fileUri: worktreeFileUri });
            }
            catch (error) {
                this.logService.error('[SessionsAICustomizationWorkspaceService] Failed to commit deletion to worktree:', error);
            }
        }
    }
    async generateCustomization(type) {
        const creator = this.instantiationService.createInstance(CustomizationCreatorService);
        await creator.createWithAI(type);
    }
    async getFilteredPromptSlashCommands(token) {
        const allCommands = await this.promptsService.getPromptSlashCommands(token);
        return allCommands.filter(cmd => {
            const filter = this.getStorageSourceFilter(cmd.type);
            return applyStorageSourceFilter([cmd], filter).length > 0;
        });
    }
    static { this._skillUIIntegrations = new Map([
        ['act-on-feedback', localize('skillUI.actOnFeedback', "Used by the Submit Feedback button in the Changes toolbar")],
        ['generate-run-commands', localize('skillUI.generateRunCommands', "Used by the Run button in the title bar")],
        ['create-pr', localize('skillUI.createPr', "Used by the Create Pull Request button in the Changes toolbar")],
        ['create-draft-pr', localize('skillUI.createDraftPr', "Used by the Create Draft Pull Request button in the Changes toolbar")],
        ['update-pr', localize('skillUI.updatePr', "Used by the Update Pull Request button in the Changes toolbar")],
        ['merge-changes', localize('skillUI.mergeChanges', "Used by the Merge button in the Changes toolbar")],
        ['commit', localize('skillUI.commit', "Used by the Commit button in the Changes toolbar")],
    ]); }
    getSkillUIIntegrations() {
        return SessionsAICustomizationWorkspaceService_1._skillUIIntegrations;
    }
};
SessionsAICustomizationWorkspaceService = SessionsAICustomizationWorkspaceService_1 = __decorate([
    __param(0, ISessionsManagementService),
    __param(1, IInstantiationService),
    __param(2, IPromptsService),
    __param(3, ICustomizationHarnessService),
    __param(4, ICommandService),
    __param(5, ILogService),
    __param(6, IFileService),
    __param(7, INotificationService)
], SessionsAICustomizationWorkspaceService);
export { SessionsAICustomizationWorkspaceService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQWUsZUFBZSxFQUF1QixNQUFNLHVDQUF1QyxDQUFDO0FBQ25ILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFckQsT0FBTyxFQUFvQyxnQ0FBZ0MsRUFBd0Isd0JBQXdCLEVBQUUsTUFBTSw4RUFBOEUsQ0FBQztBQUNsTixPQUFPLEVBQTJCLGVBQWUsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVJLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBQ3hILE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDJGQUEyRixDQUFDO0FBRXhJLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FB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