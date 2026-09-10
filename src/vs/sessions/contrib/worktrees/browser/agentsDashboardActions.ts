/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import Severity from '../../../../base/common/severity.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { AGENTS_DASHBOARD_CUSTOM_VIEW_ID, ARCHIVE_MERGED_PULL_REQUEST_SESSIONS_COMMAND_ID, DELETE_ARCHIVED_SESSION_WORKTREES_COMMAND_ID, OPEN_AGENTS_DASHBOARD_COMMAND_ID, REFRESH_AGENTS_DASHBOARD_COMMAND_ID } from '../common/agentsDashboard.js';
import { getArchivedSessionWorktrees, getMergedPullRequestSessions } from '../common/agentsDashboardModel.js';
import { IWorktreeDashboardService } from '../common/worktreeDashboard.js';
import { WorktreeContainsChangesError } from '../common/worktreeDashboardErrors.js';

registerAction2(class OpenAgentsDashboardAction extends Action2 {
	constructor() {
		super({
			id: OPEN_AGENTS_DASHBOARD_COMMAND_ID,
			title: localize2('openAgentsDashboard', "Open Agents Dashboard"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: IsSessionsWindowContext,
			menu: {
				id: Menus.AccountMenu,
				group: '2_settings',
				order: 2,
				when: IsSessionsWindowContext,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(ICustomViewService).showCustomView(AGENTS_DASHBOARD_CUSTOM_VIEW_ID);
	}
});

registerAction2(class RefreshAgentsDashboardAction extends Action2 {
	constructor() {
		super({
			id: REFRESH_AGENTS_DASHBOARD_COMMAND_ID,
			title: localize2('refreshAgentsDashboard', "Refresh Agents Dashboard"),
			icon: Codicon.refresh,
			menu: [{
				id: Menus.AgentsDashboardTabs,
				group: 'navigation',
				order: 1,
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		try {
			await accessor.get(IWorktreeDashboardService).refresh();
		} catch (error) {
			accessor.get(INotificationService).notify({
				severity: Severity.Error,
				message: localize('agentsDashboard.refreshFailed', "Failed to refresh Agents Dashboard: {0}", toErrorMessage(error)),
			});
		}
	}
});

registerAction2(class ArchiveMergedPullRequestSessionsAction extends Action2 {
	constructor() {
		super({
			id: ARCHIVE_MERGED_PULL_REQUEST_SESSIONS_COMMAND_ID,
			title: localize2('archiveMergedPullRequestSessions', "Archive Sessions with Merged Pull Requests"),
			icon: Codicon.gitPullRequestDone,
			f1: true,
			category: SessionsCategories.Sessions,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const notificationService = accessor.get(INotificationService);
		const candidates = getMergedPullRequestSessions(sessionsManagementService.getSessions());
		if (candidates.length === 0) {
			notificationService.info(localize('agentsDashboard.noMergedSessions', "No idle sessions with merged pull requests are ready to archive."));
			return;
		}

		const confirmation = await accessor.get(IDialogService).confirm({
			type: Severity.Info,
			message: candidates.length === 1
				? localize('agentsDashboard.archiveMergedSession.confirmSingle', "Archive the session with a merged pull request?")
				: localize('agentsDashboard.archiveMergedSession.confirm', "Archive {0} sessions with merged pull requests?", candidates.length),
			detail: localize('agentsDashboard.archiveMergedSession.detail', "Archived sessions remain available in the Archived section."),
			primaryButton: localize('agentsDashboard.archiveMergedSession.archive', "Archive"),
		});
		if (!confirmation.confirmed) {
			return;
		}

		const failures: string[] = [];
		for (const session of candidates) {
			try {
				await sessionsManagementService.archiveSession(session);
			} catch (error) {
				failures.push(toErrorMessage(error));
			}
		}

		notifyBatchResult(
			notificationService,
			candidates.length - failures.length,
			failures,
			localize('agentsDashboard.archiveMergedSession.success', "Archived {0} sessions with merged pull requests.", candidates.length - failures.length),
			localize('agentsDashboard.archiveMergedSession.failure', "Failed to archive {0} sessions: {1}", failures.length, failures.join('; ')),
		);
	}
});

registerAction2(class DeleteArchivedSessionWorktreesAction extends Action2 {
	constructor() {
		super({
			id: DELETE_ARCHIVED_SESSION_WORKTREES_COMMAND_ID,
			title: localize2('deleteArchivedSessionWorktrees', "Delete Worktrees from Archived Sessions"),
			icon: Codicon.trash,
			f1: true,
			category: SessionsCategories.Sessions,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const entries = accessor.get(IWorktreeDashboardService).entries.get();
		await deleteWorktrees(accessor, getArchivedSessionWorktrees(entries), {
			empty: localize('agentsDashboard.noArchivedWorktrees', "No archived-session worktrees are ready to delete."),
			confirmSingle: localize('agentsDashboard.deleteArchivedWorktree.confirmSingle', "Delete the worktree from the archived session?"),
			confirmMany: count => localize('agentsDashboard.deleteArchivedWorktree.confirm', "Delete {0} worktrees from archived sessions?", count),
			detail: localize('agentsDashboard.deleteArchivedWorktree.detail', "This removes the worktree directories from disk. The archived sessions remain available."),
			success: count => localize('agentsDashboard.deleteArchivedWorktree.success', "Deleted {0} archived-session worktrees.", count),
		});
	}
});

interface IDeleteWorktreesMessages {
	readonly empty: string;
	readonly confirmSingle: string;
	readonly confirmMany: (count: number) => string;
	readonly detail: string;
	readonly success: (count: number) => string;
}

async function deleteWorktrees(accessor: ServicesAccessor, candidates: ReturnType<typeof getArchivedSessionWorktrees>, messages: IDeleteWorktreesMessages): Promise<void> {
	const worktreeService = accessor.get(IWorktreeDashboardService);
	const notificationService = accessor.get(INotificationService);
	const dialogService = accessor.get(IDialogService);
	if (candidates.length === 0) {
		notificationService.info(messages.empty);
		return;
	}

	const confirmation = await dialogService.confirm({
		type: Severity.Warning,
		message: candidates.length === 1 ? messages.confirmSingle : messages.confirmMany(candidates.length),
		detail: messages.detail,
		primaryButton: localize('agentsDashboard.deleteWorktrees.delete', "Delete"),
	});
	if (!confirmation.confirmed) {
		return;
	}

	const dirty: typeof candidates = [];
	const failures: string[] = [];
	let deleted = 0;
	for (const entry of candidates) {
		try {
			await worktreeService.removeWorktree(entry);
			deleted++;
		} catch (error) {
			if (error instanceof WorktreeContainsChangesError) {
				dirty.push(entry);
			} else {
				failures.push(toErrorMessage(error));
			}
		}
	}

	if (dirty.length > 0) {
		const forceConfirmation = await dialogService.confirm({
			type: Severity.Warning,
			message: dirty.length === 1
				? localize('agentsDashboard.forceDeleteWorktree.confirmSingle', "The worktree contains uncommitted changes. Delete it anyway?")
				: localize('agentsDashboard.forceDeleteWorktree.confirm', "{0} worktrees contain uncommitted changes. Delete them anyway?", dirty.length),
			detail: localize('agentsDashboard.forceDeleteWorktree.detail', "Uncommitted and untracked files in these worktrees will be permanently lost."),
			primaryButton: localize('agentsDashboard.forceDeleteWorktree.delete', "Delete Anyway"),
		});
		if (forceConfirmation.confirmed) {
			for (const entry of dirty) {
				try {
					await worktreeService.removeWorktree(entry, { force: true });
					deleted++;
				} catch (error) {
					failures.push(toErrorMessage(error));
				}
			}
		} else {
			notificationService.info(localize('agentsDashboard.deleteWorktrees.skipped', "Deleted {0} worktrees. Kept {1} worktrees that contain uncommitted changes.", deleted, dirty.length));
			return;
		}
	}

	await worktreeService.refresh();
	notifyBatchResult(
		notificationService,
		deleted,
		failures,
		messages.success(deleted),
		localize('agentsDashboard.deleteWorktrees.failure', "Failed to delete {0} worktrees: {1}", failures.length, failures.join('; ')),
	);
}

function notifyBatchResult(notificationService: INotificationService, succeeded: number, failures: readonly string[], successMessage: string, failureMessage: string): void {
	if (failures.length > 0) {
		notificationService.notify({
			severity: Severity.Warning,
			message: succeeded > 0 ? localize('agentsDashboard.partialBatchSuccess', "{0} {1}", successMessage, failureMessage) : failureMessage,
		});
	} else {
		notificationService.info(successMessage);
	}
}
