/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert, status } from '../../../../base/browser/ui/aria/aria.js';
import { Limiter, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { EXPERIMENTAL_WORKTREE_LIMIT_PROMPT_SETTING } from '../common/constants.js';

const WORKTREE_COUNT_LIMIT = 20;
const MINIMUM_SESSION_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const PROMPT_COOLDOWN_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_DELAY_MS = 10_000;
const STORAGE_KEY_SNOOZED_UNTIL = 'sessions.worktreeLimit.snoozedUntil';
const CLEANUP_SESSION_WORKTREES_COMMAND_ID = 'sessions.action.cleanupWorktrees';
const CLEANUP_SESSION_WORKTREES_WHEN = ContextKeyExpr.and(
	IsSessionsWindowContext,
	ChatContextKeys.enabled,
	ContextKeyExpr.equals(`config.${EXPERIMENTAL_WORKTREE_LIMIT_PROMPT_SETTING}`, true),
);

interface ICleanupPickItem extends IQuickPickItem {
	readonly candidate: ICleanupCandidate;
}

interface ICleanupCandidate {
	readonly session: ISession;
	readonly sizeBytes: number | undefined;
	readonly sizeMeasured: boolean;
	readonly recommendation: CleanupRecommendation;
}

const enum CleanupRecommendation {
	Recommended,
	Recent,
	Pinned,
}

export class SessionWorktreeLimitContribution extends Disposable {
	static readonly ID = 'workbench.contrib.sessionWorktreeLimit';

	private _promptPromise: Promise<void> | undefined;
	private _automaticPromptCancellation: CancellationTokenSource | undefined;

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

		const refreshScheduler = this._register(new RunOnceScheduler(() => {
			void this.refresh().catch(error => this.logService.error('[SessionWorktreeLimitContribution] Failed to check the worktree limit', error));
		}, REFRESH_DELAY_MS));
		const contribution = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: CLEANUP_SESSION_WORKTREES_COMMAND_ID,
					title: localize2('sessions.cleanupWorktrees', "Clean Up Session Worktrees..."),
					category: SessionsCategories.Sessions,
					precondition: CLEANUP_SESSION_WORKTREES_WHEN,
					menu: [{ id: MenuId.CommandPalette, when: CLEANUP_SESSION_WORKTREES_WHEN }],
				});
			}

			override run(): Promise<void> {
				return contribution.cleanupWorktrees();
			}
		}));
		refreshScheduler.schedule();
	}

	async refresh(): Promise<void> {
		if (!this.configurationService.getValue<boolean>(EXPERIMENTAL_WORKTREE_LIMIT_PROMPT_SETTING) || this._promptPromise || this._isPromptOnCooldown()) {
			return this._promptPromise;
		}

		const { worktreeCount, availableSessions, recommendedSessionIds } = this._getCleanupState();
		if (worktreeCount < WORKTREE_COUNT_LIMIT || recommendedSessionIds.size === 0) {
			return;
		}

		this.storageService.store(STORAGE_KEY_SNOOZED_UNTIL, Date.now() + PROMPT_COOLDOWN_DURATION_MS, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const cancellation = new CancellationTokenSource();
		this._automaticPromptCancellation = cancellation;
		try {
			await this._measureAndPromptForCleanup(worktreeCount, availableSessions, recommendedSessionIds, cancellation.token);
		} finally {
			if (this._automaticPromptCancellation === cancellation) {
				this._automaticPromptCancellation = undefined;
			}
			cancellation.dispose();
		}
	}

	async cleanupWorktrees(): Promise<void> {
		this._automaticPromptCancellation?.dispose(true);
		this._automaticPromptCancellation = undefined;
		if (this._promptPromise) {
			return this._promptPromise;
		}

		const { availableSessions, recommendedSessionIds } = this._getCleanupState();
		if (availableSessions.length === 0) {
			await this.dialogService.info(
				localize('worktreeCleanup.none.title', "No Session Worktrees to Clean Up"),
				localize('worktreeCleanup.none.detail', "Cleanup is available for completed, inactive sessions that exclusively own their worktrees."),
			);
			return;
		}

		return this._trackPrompt(this._measureAndReviewCleanup(availableSessions, recommendedSessionIds));
	}

	private _getCleanupState(): { worktreeCount: number; availableSessions: readonly ISession[]; recommendedSessionIds: ReadonlySet<string> } {
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
		const activeSessionId = this.sessionsService.activeSession.get()?.sessionId;
		const cutoff = Date.now() - MINIMUM_SESSION_AGE_MS;
		const availableSessions = sessions.filter(session =>
			session.sessionId !== activeSessionId
			&& session.status.get() === SessionStatus.Completed
			&& !session.isArchived.get()
			&& [...(sessionWorktrees.get(session.sessionId) ?? [])].every(worktree => worktreeOwners.get(worktree)?.size === 1)
			&& (sessionWorktrees.get(session.sessionId)?.size ?? 0) > 0
		).sort((a, b) => a.updatedAt.get().getTime() - b.updatedAt.get().getTime());
		const recommendedSessionIds = new Set(availableSessions
			.filter(session => !this.sessionsListModelService.isSessionPinned(session) && session.updatedAt.get().getTime() <= cutoff)
			.map(session => session.sessionId));
		return { worktreeCount, availableSessions, recommendedSessionIds };
	}

	private async _measureCandidates(availableSessions: readonly ISession[], recommendedSessionIds: ReadonlySet<string>, token = CancellationToken.None): Promise<readonly ICleanupCandidate[]> {
		const candidates = this._createCandidates(availableSessions, recommendedSessionIds);
		const getDiskUsage = this.sessionsManagementService.getSessionWorktreeDiskUsage;
		const limiter = new Limiter<number | undefined>(2);
		return Promise.all(candidates.map(async candidate => {
			let sizeBytes: number | undefined;
			if (getDiskUsage) {
				try {
					sizeBytes = await limiter.queue(() => token.isCancellationRequested
						? Promise.resolve(undefined)
						: getDiskUsage.call(this.sessionsManagementService, candidate.session));
				} catch (error) {
					this.logService.warn(`[SessionWorktreeLimitContribution] Failed to measure worktree for session ${candidate.session.sessionId}`, error);
				}
			}
			return { ...candidate, sizeBytes, sizeMeasured: true };
		}));
	}

	private _createCandidates(availableSessions: readonly ISession[], recommendedSessionIds: ReadonlySet<string>): readonly ICleanupCandidate[] {
		return availableSessions.map(session => ({
			session,
			sizeBytes: undefined,
			sizeMeasured: false,
			recommendation: recommendedSessionIds.has(session.sessionId)
				? CleanupRecommendation.Recommended
				: this.sessionsListModelService.isSessionPinned(session)
					? CleanupRecommendation.Pinned
					: CleanupRecommendation.Recent,
		}));
	}

	private async _measureAndPromptForCleanup(worktreeCount: number, availableSessions: readonly ISession[], recommendedSessionIds: ReadonlySet<string>, token: CancellationToken): Promise<void> {
		const candidates = await this._measureCandidates(availableSessions, recommendedSessionIds, token);
		if (!token.isCancellationRequested) {
			await this._trackPrompt(this._promptForCleanup(worktreeCount, candidates));
		}
	}

	private async _measureAndReviewCleanup(availableSessions: readonly ISession[], recommendedSessionIds: ReadonlySet<string>): Promise<void> {
		const selected = await this._pickCandidates(
			this._createCandidates(availableSessions, recommendedSessionIds),
			token => this._measureCandidates(availableSessions, recommendedSessionIds, token),
		);
		if (selected.length === 0) {
			return;
		}
		await this._confirmAndArchive(selected);
	}

	private async _trackPrompt(prompt: Promise<void>): Promise<void> {
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
		const recommended = candidates.filter(candidate => candidate.recommendation === CleanupRecommendation.Recommended);
		const estimatedBytes = recommended.reduce((total, candidate) => total + (candidate.sizeBytes ?? 0), 0);
		const measuredCount = recommended.filter(candidate => candidate.sizeBytes !== undefined).length;
		const confirmation = await this.dialogService.confirm({
			message: localize('worktreeLimit.message', "You have {0} session worktrees", worktreeCount),
			detail: measuredCount === recommended.length
				? recommended.length === 1
					? localize('worktreeLimit.detail.measured.one', "Storage is limited by the number of worktrees. Archiving this old session can reclaim about {0} and make room for new sessions.", ByteSize.formatSize(estimatedBytes))
					: localize('worktreeLimit.detail.measured.many', "Storage is limited by the number of worktrees. Archiving the {0} recommended old sessions can reclaim about {1} and make room for new sessions.", recommended.length, ByteSize.formatSize(estimatedBytes))
				: estimatedBytes > 0
					? recommended.length === 1
						? localize('worktreeLimit.detail.partiallyMeasured.one', "Storage is limited by the number of worktrees. Archiving this old session can reclaim at least {0} and make room for new sessions.", ByteSize.formatSize(estimatedBytes))
						: localize('worktreeLimit.detail.partiallyMeasured.many', "Storage is limited by the number of worktrees. Archiving the {0} recommended old sessions can reclaim at least {1} and make room for new sessions.", recommended.length, ByteSize.formatSize(estimatedBytes))
					: localize('worktreeLimit.detail.unmeasured', "Storage is limited by the number of worktrees. Archive old sessions to clean up their worktrees and make room for new sessions."),
			primaryButton: localize('worktreeLimit.review', "Review and Clean Up"),
			cancelButton: localize('worktreeLimit.later', "Remind Me Later"),
		});
		if (!confirmation.confirmed) {
			return;
		}

		await this._reviewAndCleanup(candidates);
	}

	private async _reviewAndCleanup(candidates: readonly ICleanupCandidate[]): Promise<void> {
		const selected = await this._pickCandidates(candidates);
		if (selected.length === 0) {
			return;
		}

		await this._confirmAndArchive(selected);
	}

	private async _confirmAndArchive(selected: readonly ICleanupCandidate[]): Promise<void> {
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

	private _pickCandidates(candidates: readonly ICleanupCandidate[], measure?: (token: CancellationToken) => Promise<readonly ICleanupCandidate[]>): Promise<readonly ICleanupCandidate[]> {
		const store = new DisposableStore();
		const picker = store.add(this.quickInputService.createQuickPick<ICleanupPickItem>({ useSeparators: true }));
		const measurementCancellation = new CancellationTokenSource();
		store.add(toDisposable(() => measurementCancellation.dispose(true)));
		picker.canSelectMany = true;
		picker.title = localize('worktreeLimit.picker.title', "Clean Up Old Session Worktrees");
		picker.placeholder = localize('worktreeLimit.picker.placeholder', "Select sessions to archive and clean up");
		const createItems = (items: readonly ICleanupCandidate[]): readonly (ICleanupPickItem | IQuickPickSeparator)[] => {
			const createItem = (candidate: ICleanupCandidate): ICleanupPickItem => ({
				label: candidate.session.title.get() || localize('worktreeLimit.untitled', "Untitled session"),
				description: !candidate.sizeMeasured
					? localize('worktreeLimit.size.calculating', "Calculating...")
					: candidate.sizeBytes === undefined
						? localize('worktreeLimit.size.unavailable', "Size unavailable")
						: ByteSize.formatSize(candidate.sizeBytes),
				detail: candidate.recommendation === CleanupRecommendation.Recommended
					? localize('worktreeLimit.lastUpdated', "Last updated {0}", candidate.session.updatedAt.get().toLocaleDateString())
					: candidate.recommendation === CleanupRecommendation.Pinned
						? localize('worktreeLimit.pinned', "Pinned — last updated {0}", candidate.session.updatedAt.get().toLocaleDateString())
						: localize('worktreeLimit.recent', "Recently updated {0}", candidate.session.updatedAt.get().toLocaleDateString()),
				candidate,
			});
			const recommended = items.filter(candidate => candidate.recommendation === CleanupRecommendation.Recommended);
			const additional = items.filter(candidate => candidate.recommendation !== CleanupRecommendation.Recommended);
			return [
				...(recommended.length > 0 ? [
					{ type: 'separator' as const, label: localize('worktreeLimit.recommended', "Recommended"), description: localize('worktreeLimit.recommended.description', "Inactive for at least 14 days") },
					...recommended.map(createItem),
				] : []),
				...(additional.length > 0 ? [
					{ type: 'separator' as const, label: localize('worktreeLimit.additional', "Additional"), description: localize('worktreeLimit.additional.description', "Not selected automatically") },
					...additional.map(createItem),
				] : []),
			];
		};
		picker.items = createItems(candidates);
		picker.selectedItems = picker.items.filter((item): item is ICleanupPickItem =>
			item.type !== 'separator' && item.candidate.recommendation === CleanupRecommendation.Recommended);

		return new Promise(resolve => {
			const measuredCandidates = measure
				? Promise.resolve().then(() => measure(measurementCancellation.token))
				: Promise.resolve(candidates);
			void measuredCandidates.then(measured => {
				if (measurementCancellation.token.isCancellationRequested) {
					return;
				}
				const selectedIds = new Set(picker.selectedItems.map(item => item.candidate.session.sessionId));
				picker.items = createItems(measured);
				picker.selectedItems = picker.items.filter((item): item is ICleanupPickItem =>
					item.type !== 'separator' && selectedIds.has(item.candidate.session.sessionId));
			});
			let accepting = false;
			store.add(picker.onDidAccept(async () => {
				if (accepting) {
					return;
				}
				accepting = true;
				picker.busy = true;
				const selectedIds = new Set(picker.selectedItems.map(item => item.candidate.session.sessionId));
				const measured = await measuredCandidates;
				const selected = measured.filter(candidate => selectedIds.has(candidate.session.sessionId));
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

	private _isPromptOnCooldown(): boolean {
		return this.storageService.getNumber(STORAGE_KEY_SNOOZED_UNTIL, StorageScope.APPLICATION, 0) > Date.now();
	}

	override dispose(): void {
		this._automaticPromptCancellation?.dispose(true);
		super.dispose();
	}
}
