/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert, status } from '../../../../base/browser/ui/aria/aria.js';
import { Limiter, RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { EXPERIMENTAL_WORKTREE_LIMIT_PROMPT_SETTING } from '../common/constants.js';

const WORKTREE_COUNT_LIMIT = 20;
const MINIMUM_SESSION_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_DELAY_MS = 10_000;
const STORAGE_KEY_SNOOZED_UNTIL = 'sessions.worktreeLimit.snoozedUntil';

interface ICleanupPickItem extends IQuickPickItem {
	readonly candidate: ICleanupCandidate;
}

interface ICleanupCandidate {
	readonly session: ISession;
	readonly sizeBytes: number | undefined;
}

export class SessionWorktreeLimitContribution extends Disposable {
	static readonly ID = 'workbench.contrib.sessionWorktreeLimit';

	private _promptPromise: Promise<void> | undefined;
	private _lastPromptedWorktreeCount = 0;
	private readonly _snoozeScheduler: RunOnceScheduler;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsListModelService private readonly sessionsListModelService: ISessionsListModelService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._snoozeScheduler = this._register(new RunOnceScheduler(() => {
			this._lastPromptedWorktreeCount = 0;
			void this.refresh().catch(error => this.logService.error('[SessionWorktreeLimitContribution] Failed to refresh after snooze', error));
		}, SNOOZE_DURATION_MS));
		const refreshScheduler = this._register(new RunOnceScheduler(() => {
			void this.refresh().catch(error => this.logService.error('[SessionWorktreeLimitContribution] Failed to check the worktree limit', error));
		}, REFRESH_DELAY_MS));
		this._register(this.sessionsManagementService.onDidChangeSessions(() => refreshScheduler.schedule()));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(EXPERIMENTAL_WORKTREE_LIMIT_PROMPT_SETTING)) {
				refreshScheduler.schedule();
			}
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, STORAGE_KEY_SNOOZED_UNTIL, this._store)(() => {
			this._lastPromptedWorktreeCount = 0;
			if (!this._isSnoozed()) {
				refreshScheduler.schedule();
			}
		}));
		refreshScheduler.schedule();
	}

	async refresh(): Promise<void> {
		if (!this.configurationService.getValue<boolean>(EXPERIMENTAL_WORKTREE_LIMIT_PROMPT_SETTING) || this._promptPromise || this._isSnoozed()) {
			return this._promptPromise;
		}

		const sessions = this.sessionsManagementService.getSessions();
		const worktreeOwners = new Map<string, Set<string>>();
		const sessionWorktrees = new Map<string, Set<string>>();
		for (const session of sessions) {
			if (!session.isArchived.get()) {
				for (const folder of session.workspace.get()?.folders ?? []) {
					const worktree = folder.gitRepository?.workTreeUri;
					if (worktree) {
						const key = getComparisonKey(worktree);
						let worktrees = sessionWorktrees.get(session.sessionId);
						if (!worktrees) {
							worktrees = new Set();
							sessionWorktrees.set(session.sessionId, worktrees);
						}
						if (!worktrees.has(key)) {
							worktrees.add(key);
							let owners = worktreeOwners.get(key);
							if (!owners) {
								owners = new Set();
								worktreeOwners.set(key, owners);
							}
							owners.add(session.sessionId);
						}
					}
				}
			}
		}
		const worktreeCount = worktreeOwners.size;
		if (worktreeCount < WORKTREE_COUNT_LIMIT || worktreeCount === this._lastPromptedWorktreeCount) {
			return;
		}

		const activeSessionId = this.sessionsService.activeSession.get()?.sessionId;
		const cutoff = Date.now() - MINIMUM_SESSION_AGE_MS;
		const eligibleSessions = sessions.filter(session =>
			session.sessionId !== activeSessionId
			&& session.status.get() === SessionStatus.Completed
			&& !session.isArchived.get()
			&& !this.sessionsListModelService.isSessionPinned(session)
			&& session.updatedAt.get().getTime() <= cutoff
			&& [...(sessionWorktrees.get(session.sessionId) ?? [])].every(worktree => worktreeOwners.get(worktree)?.size === 1)
			&& (sessionWorktrees.get(session.sessionId)?.size ?? 0) > 0
		).sort((a, b) => a.updatedAt.get().getTime() - b.updatedAt.get().getTime());
		if (eligibleSessions.length === 0) {
			return;
		}

		const getDiskUsage = this.sessionsManagementService.getSessionWorktreeDiskUsage;
		const limiter = new Limiter<number | undefined>(2);
		const candidates = await Promise.all(eligibleSessions.map(async session => {
			let sizeBytes: number | undefined;
			if (getDiskUsage) {
				try {
					sizeBytes = await limiter.queue(() => getDiskUsage.call(this.sessionsManagementService, session));
				} catch (error) {
					this.logService.warn(`[SessionWorktreeLimitContribution] Failed to measure worktree for session ${session.sessionId}`, error);
				}
			}
			return { session, sizeBytes };
		}));

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

	private async _promptForCleanup(worktreeCount: number, candidates: readonly ICleanupCandidate[]): Promise<void> {
		const estimatedBytes = candidates.reduce((total, candidate) => total + (candidate.sizeBytes ?? 0), 0);
		const measuredCount = candidates.filter(candidate => candidate.sizeBytes !== undefined).length;
		const confirmation = await this.dialogService.confirm({
			message: localize('worktreeLimit.message', "You have {0} session worktrees", worktreeCount),
			detail: measuredCount === candidates.length
				? candidates.length === 1
					? localize('worktreeLimit.detail.measured.one', "Storage is limited by the number of worktrees. Archiving this old session can reclaim about {0} and make room for new sessions.", ByteSize.formatSize(estimatedBytes))
					: localize('worktreeLimit.detail.measured.many', "Storage is limited by the number of worktrees. Archiving {0} old sessions can reclaim about {1} and make room for new sessions.", candidates.length, ByteSize.formatSize(estimatedBytes))
				: estimatedBytes > 0
					? candidates.length === 1
						? localize('worktreeLimit.detail.partiallyMeasured.one', "Storage is limited by the number of worktrees. Archiving this old session can reclaim at least {0} and make room for new sessions.", ByteSize.formatSize(estimatedBytes))
						: localize('worktreeLimit.detail.partiallyMeasured.many', "Storage is limited by the number of worktrees. Archiving {0} old sessions can reclaim at least {1} and make room for new sessions.", candidates.length, ByteSize.formatSize(estimatedBytes))
					: localize('worktreeLimit.detail.unmeasured', "Storage is limited by the number of worktrees. Archive old sessions to clean up their worktrees and make room for new sessions."),
			primaryButton: localize('worktreeLimit.review', "Review and Clean Up"),
			cancelButton: localize('worktreeLimit.later', "Remind Me Later"),
		});
		if (!confirmation.confirmed) {
			this._lastPromptedWorktreeCount = 0;
			this.storageService.store(STORAGE_KEY_SNOOZED_UNTIL, Date.now() + SNOOZE_DURATION_MS, StorageScope.APPLICATION, StorageTarget.MACHINE);
			this._snoozeScheduler.schedule();
			return;
		}

		const selected = await this._pickCandidates(candidates);
		if (selected.length === 0) {
			return;
		}

		const selectedBytes = selected.reduce((total, candidate) => total + (candidate.sizeBytes ?? 0), 0);
		const selectedMeasuredCount = selected.filter(candidate => candidate.sizeBytes !== undefined).length;
		const archiveConfirmation = await this.dialogService.confirm({
			message: selected.length === 1
				? localize('worktreeLimit.archive.one', "Archive 1 session and clean up its worktree?")
				: localize('worktreeLimit.archive.many', "Archive {0} sessions and clean up their worktrees?", selected.length),
			detail: selectedMeasuredCount === selected.length
				? localize('worktreeLimit.archive.detail.measured', "This can reclaim about {0}. You can restore archived sessions later.", ByteSize.formatSize(selectedBytes))
				: selectedBytes > 0
					? localize('worktreeLimit.archive.detail.partiallyMeasured', "This can reclaim at least {0}. You can restore archived sessions later.", ByteSize.formatSize(selectedBytes))
					: localize('worktreeLimit.archive.detail.unmeasured', "You can restore archived sessions later."),
			primaryButton: localize('worktreeLimit.archive.primary', "Archive and Clean Up"),
		});
		if (!archiveConfirmation.confirmed) {
			return;
		}

		let archivedCount = 0;
		for (const candidate of selected) {
			const session = candidate.session;
			try {
				await this.sessionsManagementService.archiveSession(session);
				if (session.isArchived.get()) {
					archivedCount++;
				} else {
					this.logService.error(`[SessionWorktreeLimitContribution] Provider did not archive session ${session.sessionId}`);
				}
			} catch (error) {
				this.logService.error(`[SessionWorktreeLimitContribution] Failed to archive session ${session.sessionId}`, error);
			}
		}

		if (archivedCount === 0) {
			alert(localize('worktreeLimit.archived.none', "No sessions were archived. Check the logs and try again."));
		} else if (archivedCount < selected.length) {
			alert(localize('worktreeLimit.archived.some', "Archived {0} of {1} selected sessions. Worktree cleanup continues in the background.", archivedCount, selected.length));
		} else {
			status(archivedCount === 1
				? localize('worktreeLimit.archived.one', "Archived 1 session. Worktree cleanup continues in the background.")
				: localize('worktreeLimit.archived.many', "Archived {0} sessions. Worktree cleanup continues in the background.", archivedCount));
		}
	}

	private _pickCandidates(candidates: readonly ICleanupCandidate[]): Promise<readonly ICleanupCandidate[]> {
		const store = new DisposableStore();
		const picker = store.add(this.quickInputService.createQuickPick<ICleanupPickItem>());
		picker.canSelectMany = true;
		picker.title = localize('worktreeLimit.picker.title', "Clean Up Old Session Worktrees");
		picker.placeholder = localize('worktreeLimit.picker.placeholder', "Select sessions to archive and clean up");
		picker.items = candidates.map(candidate => ({
			label: candidate.session.title.get() || localize('worktreeLimit.untitled', "Untitled session"),
			description: candidate.sizeBytes === undefined ? undefined : ByteSize.formatSize(candidate.sizeBytes),
			detail: localize('worktreeLimit.lastUpdated', "Last updated {0}", candidate.session.updatedAt.get().toLocaleDateString()),
			candidate,
		}));
		picker.selectedItems = [...picker.items];

		return new Promise(resolve => {
			store.add(picker.onDidAccept(() => {
				const selected = picker.selectedItems.map(item => item.candidate);
				resolve(selected);
				picker.hide();
			}));
			store.add(picker.onDidHide(() => {
				store.dispose();
				resolve([]);
			}));
			picker.show();
		});
	}

	private _isSnoozed(): boolean {
		const remaining = this.storageService.getNumber(STORAGE_KEY_SNOOZED_UNTIL, StorageScope.APPLICATION, 0) - Date.now();
		if (remaining <= 0) {
			this._snoozeScheduler.cancel();
			return false;
		}
		if (!this._snoozeScheduler.isScheduled()) {
			this._snoozeScheduler.schedule(remaining);
		}
		return true;
	}
}
