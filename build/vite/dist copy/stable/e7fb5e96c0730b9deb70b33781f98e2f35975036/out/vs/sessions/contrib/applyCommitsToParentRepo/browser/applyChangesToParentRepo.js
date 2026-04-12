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
import { toAction } from '../../../../base/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun } from '../../../../base/common/observable.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
const hasWorktreeAndRepositoryContextKey = new RawContextKey('agentSessionHasWorktreeAndRepository', false, {
    type: 'boolean',
    description: localize('agentSessionHasWorktreeAndRepository', "True when the active agent session has both a worktree and a parent repository.")
});
let ApplyChangesToParentRepoContribution = class ApplyChangesToParentRepoContribution extends Disposable {
    static { this.ID = 'sessions.contrib.applyChangesToParentRepo'; }
    constructor(contextKeyService, sessionManagementService) {
        super();
        const worktreeAndRepoKey = hasWorktreeAndRepositoryContextKey.bindTo(contextKeyService);
        this._register(autorun(reader => {
            const activeSession = sessionManagementService.activeSession.read(reader);
            const repo = activeSession?.workspace.read(reader)?.repositories[0];
            const hasWorktreeAndRepo = !!repo?.workingDirectory && !!repo?.uri;
            worktreeAndRepoKey.set(hasWorktreeAndRepo);
        }));
    }
};
ApplyChangesToParentRepoContribution = __decorate([
    __param(0, IContextKeyService),
    __param(1, ISessionsManagementService)
], ApplyChangesToParentRepoContribution);
class ApplyChangesToParentRepoAction extends Action2 {
    static { this.ID = 'chatEditing.applyChangesToParentRepo'; }
    constructor() {
        super({
            id: ApplyChangesToParentRepoAction.ID,
            title: localize2('applyChangesToParentRepo', 'Apply Changes to Parent Repository'),
            icon: Codicon.desktopDownload,
            category: CHAT_CATEGORY,
            precondition: ContextKeyExpr.and(IsSessionsWindowContext, hasWorktreeAndRepositoryContextKey),
            menu: [
                {
                    id: MenuId.ChatEditingSessionApplySubmenu,
                    group: 'navigation',
                    order: 2,
                    when: ContextKeyExpr.and(ContextKeyExpr.false(), IsSessionsWindowContext, hasWorktreeAndRepositoryContextKey),
                },
            ],
        });
    }
    async run(accessor) {
        const sessionManagementService = accessor.get(ISessionsManagementService);
        const commandService = accessor.get(ICommandService);
        const notificationService = accessor.get(INotificationService);
        const logService = accessor.get(ILogService);
        const openerService = accessor.get(IOpenerService);
        const productService = accessor.get(IProductService);
        const activeSession = sessionManagementService.activeSession.get();
        const repo = activeSession?.workspace.get()?.repositories[0];
        if (!activeSession || !repo?.workingDirectory || !repo?.uri) {
            return;
        }
        const worktreeRoot = repo.workingDirectory;
        const repoRoot = repo.uri;
        const openFolderAction = toAction({
            id: 'applyChangesToParentRepo.openFolder',
            label: localize('openInVSCode', "Open in VS Code"),
            run: () => {
                const scheme = productService.quality === 'stable'
                    ? 'vscode'
                    : productService.quality === 'exploration'
                        ? 'vscode-exploration'
                        : 'vscode-insiders';
                const params = new URLSearchParams();
                params.set('windowId', '_blank');
                params.set('session', activeSession.resource.toString());
                openerService.open(URI.from({
                    scheme,
                    authority: Schemas.file,
                    path: repoRoot.path,
                    query: params.toString(),
                }), { openExternal: true });
            }
        });
        try {
            // Get the worktree branch name. Since the worktree and parent repo
            // share the same git object store, the parent can directly reference
            // this branch for a merge.
            const worktreeBranch = await commandService.executeCommand('_git.revParseAbbrevRef', worktreeRoot.fsPath);
            if (!worktreeBranch) {
                notificationService.notify({
                    severity: Severity.Warning,
                    message: localize('applyChangesNoBranch', "Could not determine worktree branch name."),
                });
                return;
            }
            // Merge the worktree branch into the parent repo.
            // This is idempotent: if already merged, git says "Already up to date."
            // If new commits exist, they're brought in. Handles partial applies naturally.
            const result = await commandService.executeCommand('_git.mergeBranch', repoRoot.fsPath, worktreeBranch);
            if (!result) {
                logService.warn('[ApplyChangesToParentRepo] No result from merge command');
            }
            else {
                notificationService.notify({
                    severity: Severity.Info,
                    message: typeof result === 'string' && result.startsWith('Already up to date')
                        ? localize('alreadyUpToDate', 'Parent repository is up to date with worktree.')
                        : localize('applyChangesSuccess', 'Applied changes to parent repository.'),
                    actions: { primary: [openFolderAction] }
                });
            }
        }
        catch (err) {
            logService.error('[ApplyChangesToParentRepo] Failed to apply changes', err);
            notificationService.notify({
                severity: Severity.Warning,
                message: localize('applyChangesConflict', "Failed to apply changes to parent repo. The parent repo may have diverged — resolve conflicts manually."),
                actions: { primary: [openFolderAction] }
            });
        }
    }
}
registerAction2(ApplyChangesToParentRepoAction);
registerWorkbenchContribution2(ApplyChangesToParentRepoContribution.ID, ApplyChangesToParentRepoContribution, 3 /* WorkbenchPhase.AfterRestored */);
// Register the apply submenu in the session changes toolbar
MenuRegistry.appendMenuItem(MenuId.ChatEditingSessionChangesToolbar, {
    submenu: MenuId.ChatEditingSessionApplySubmenu,
    title: localize2('applyActions', 'Apply Actions'),
    group: 'navigation',
    order: 1,
    when: IsSessionsWindowContext,
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwbHlDaGFuZ2VzVG9QYXJlbnRSZXBvLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9hcHBseUNvbW1pdHNUb1BhcmVudFJlcG8vYnJvd3Nlci9hcHBseUNoYW5nZXNUb1BhcmVudFJlcG8udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUV6SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQTBCLDhCQUE4QixFQUFrQixNQUFNLCtDQUErQyxDQUFDO0FBQ3ZJLE9BQU8sRUFBRSx1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