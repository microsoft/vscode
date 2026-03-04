/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun } from '../../../../base/common/observable.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';

const hasWorktreeAndRepositoryContextKey = new RawContextKey<boolean>('agentSessionHasWorktreeAndRepository', false, {
	type: 'boolean',
	description: localize('agentSessionHasWorktreeAndRepository', "True when the active agent session has both a worktree and a parent repository.")
});

class ApplyChangesToParentRepoContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.applyChangesToParentRepo';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
	) {
		super();

		const worktreeAndRepoKey = hasWorktreeAndRepositoryContextKey.bindTo(contextKeyService);

		this._register(autorun(reader => {
			const activeSession = sessionManagementService.activeSession.read(reader);
			const hasWorktreeAndRepo = !!activeSession?.worktree && !!activeSession?.repository;
			worktreeAndRepoKey.set(hasWorktreeAndRepo);
		}));
	}
}

class ApplyChangesToParentRepoAction extends Action2 {
	static readonly ID = 'chatEditing.applyChangesToParentRepo';

	constructor() {
		super({
			id: ApplyChangesToParentRepoAction.ID,
			title: localize2('applyChangesToParentRepo', 'Apply Changes to Parent Repository'),
			icon: Codicon.desktopDownload,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				IsSessionsWindowContext,
				hasWorktreeAndRepositoryContextKey,
			),
			menu: [
				{
					id: MenuId.ChatEditingSessionApplySubmenu,
					group: 'navigation',
					order: 2,
					when: ContextKeyExpr.and(
						IsSessionsWindowContext,
						hasWorktreeAndRepositoryContextKey,
					),
				},
			],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionManagementService = accessor.get(ISessionsManagementService);
		const commandService = accessor.get(ICommandService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);
		const openerService = accessor.get(IOpenerService);
		const productService = accessor.get(IProductService);

		const activeSession = sessionManagementService.getActiveSession();
		if (!activeSession?.worktree || !activeSession?.repository) {
			return;
		}

		const worktreeRoot = activeSession.worktree;
		const repoRoot = activeSession.repository;

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
			const worktreeBranch = await commandService.executeCommand<string>(
				'_git.revParseAbbrevRef',
				worktreeRoot.fsPath
			);

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
			} else {
				notificationService.notify({
					severity: Severity.Info,
					message: typeof result === 'string' && result.startsWith('Already up to date')
						? localize('alreadyUpToDate', 'Parent repository is up to date with worktree.')
						: localize('applyChangesSuccess', 'Applied changes to parent repository.'),
					actions: { primary: [openFolderAction] }
				});
			}
		} catch (err) {
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
registerWorkbenchContribution2(ApplyChangesToParentRepoContribution.ID, ApplyChangesToParentRepoContribution, WorkbenchPhase.AfterRestored);

// Register the apply submenu in the session changes toolbar
MenuRegistry.appendMenuItem(MenuId.ChatEditingSessionChangesToolbar, {
	submenu: MenuId.ChatEditingSessionApplySubmenu,
	title: localize2('applyActions', 'Apply Actions'),
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.hasAgentSessionChanges),
});
