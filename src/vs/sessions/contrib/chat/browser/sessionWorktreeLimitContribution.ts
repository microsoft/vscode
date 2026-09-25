/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

const WORKTREE_COUNT_LIMIT = 20;
const MINIMUM_SESSION_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_DELAY_MS = 10_000;
const STORAGE_KEY_SNOOZED_UNTIL = 'sessions.worktreeLimit.snoozedUntil';

interface ICleanupPickItem extends IQuickPickItem {
	readonly session: ISession;
}

export class SessionWorktreeLimitContribution extends Disposable {
	static readonly ID = 'workbench.contrib.sessionWorktreeLimit';

	private _promptPromise: Promise<void> | undefined;
	private _lastPromptedWorktreeCount = 0;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsListModelService private readonly sessionsListModelService: ISessionsListModelService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const refreshScheduler = this._register(new RunOnceScheduler(() => {
			void this.refresh().catch(error => this.logService.error('[SessionWorktreeLimitContribution] Failed to check the worktree limit', error));
		}, REFRESH_DELAY_MS));
		this._register(this.sessionsManagementService.onDidChangeSessions(() => refreshScheduler.schedule()));
		refreshScheduler.schedule();
	}

	async refresh(): Promise<void> {
		if (this._promptPromise || this._isSnoozed()) {
			return this._promptPromise;
		}

		const sessions = this.sessionsManagementService.getSessions();
		const worktrees = new Set<string>();
		for (const session of sessions) {
			if (!session.isArchived.get()) {
				for (const folder of session.workspace.get()?.folders ?? []) {
					const worktree = folder.gitRepository?.workTreeUri;
					if (worktree) {
						worktrees.add(getComparisonKey(worktree));
					}
				}
			}
		}
		const worktreeCount = worktrees.size;
		if (worktreeCount < WORKTREE_COUNT_LIMIT || worktreeCount === this._lastPromptedWorktreeCount) {
			return;
		}

		const activeSession = this.sessionsService.activeSession.get();
		const cutoff = Date.now() - MINIMUM_SESSION_AGE_MS;
		const candidates = sessions.filter(session =>
			session !== activeSession
			&& session.status.get() === SessionStatus.Completed
			&& !session.isArchived.get()
			&& !this.sessionsListModelService.isSessionPinned(session)
			&& session.updatedAt.get().getTime() <= cutoff
			&& session.workspace.get()?.folders.some(folder => folder.gitRepository?.workTreeUri) === true
		).sort((a, b) => a.updatedAt.get().getTime() - b.updatedAt.get().getTime());
		if (candidates.length === 0) {
			return;
		}

		this._lastPromptedWorktreeCount = worktreeCount;
		const prompt = this._promptForCleanup(worktreeCount, candidates);
		this._promptPromise = prompt;
		try {
			await prompt;
		} finally {
			if (this._promptPromise === prompt) {
				this._promptPromise = undefined;
			}
		}
	}

	private async _promptForCleanup(worktreeCount: number, candidates: readonly ISession[]): Promise<void> {
		const confirmation = await this.dialogService.confirm({
			message: localize('worktreeLimit.message', "You have {0} session worktrees", worktreeCount),
			detail: localize('worktreeLimit.detail', "Storage is limited by the number of worktrees. Archive old sessions to clean up their worktrees and make room for new sessions."),
			primaryButton: localize('worktreeLimit.review', "Review and Clean Up"),
			cancelButton: localize('worktreeLimit.later', "Remind Me Later"),
		});
		if (!confirmation.confirmed) {
			this.storageService.store(STORAGE_KEY_SNOOZED_UNTIL, Date.now() + SNOOZE_DURATION_MS, StorageScope.APPLICATION, StorageTarget.MACHINE);
			return;
		}

		const selected = await this._pickCandidates(candidates);
		if (selected.length === 0) {
			return;
		}

		const archiveConfirmation = await this.dialogService.confirm({
			message: selected.length === 1
				? localize('worktreeLimit.archive.one', "Archive 1 session and clean up its worktree?")
				: localize('worktreeLimit.archive.many', "Archive {0} sessions and clean up their worktrees?", selected.length),
			detail: localize('worktreeLimit.archive.detail', "You can restore archived sessions later."),
			primaryButton: localize('worktreeLimit.archive.primary', "Archive and Clean Up"),
		});
		if (!archiveConfirmation.confirmed) {
			return;
		}

		for (const session of selected) {
			try {
				await this.sessionsManagementService.archiveSession(session);
			} catch (error) {
				this.logService.error(`[SessionWorktreeLimitContribution] Failed to archive session ${session.sessionId}`, error);
			}
		}

		status(selected.length === 1
			? localize('worktreeLimit.archived.one', "Archived 1 session. Worktree cleanup continues in the background.")
			: localize('worktreeLimit.archived.many', "Archived {0} sessions. Worktree cleanup continues in the background.", selected.length));
	}

	private _pickCandidates(candidates: readonly ISession[]): Promise<readonly ISession[]> {
		const store = new DisposableStore();
		const picker = store.add(this.quickInputService.createQuickPick<ICleanupPickItem>());
		picker.canSelectMany = true;
		picker.title = localize('worktreeLimit.picker.title', "Clean Up Old Session Worktrees");
		picker.placeholder = localize('worktreeLimit.picker.placeholder', "Select sessions to archive and clean up");
		picker.items = candidates.map(session => ({
			label: session.title.get() || localize('worktreeLimit.untitled', "Untitled session"),
			detail: localize('worktreeLimit.lastUpdated', "Last updated {0}", session.updatedAt.get().toLocaleDateString()),
			session,
		}));
		picker.selectedItems = [...picker.items];

		return new Promise(resolve => {
			store.add(picker.onDidAccept(() => {
				const selected = picker.selectedItems.map(item => item.session);
				picker.hide();
				resolve(selected);
			}));
			store.add(picker.onDidHide(() => {
				store.dispose();
				resolve([]);
			}));
			picker.show();
		});
	}

	private _isSnoozed(): boolean {
		return this.storageService.getNumber(STORAGE_KEY_SNOOZED_UNTIL, StorageScope.APPLICATION, 0) > Date.now();
	}
}
