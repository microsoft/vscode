/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Limiter, RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { localize } from '../../../../nls.js';
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

const CLEANUP_THRESHOLD_BYTES = 5 * ByteSize.GB;
const MINIMUM_SESSION_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const SCAN_CACHE_DURATION_MS = 60 * 60 * 1000;
const STORAGE_KEY_SNOOZED_UNTIL = 'sessions.worktreeCleanup.snoozedUntil';

export interface ISessionWorktreeCleanupCandidate {
	readonly session: ISession;
	readonly sizeBytes: number;
}

export interface ISessionWorktreeCleanupSummary {
	readonly candidates: readonly ISessionWorktreeCleanupCandidate[];
	readonly totalBytes: number;
}

export const ISessionWorktreeCleanupService = createDecorator<ISessionWorktreeCleanupService>('sessionWorktreeCleanupService');

export interface ISessionWorktreeCleanupService {
	readonly _serviceBrand: undefined;
	readonly summary: IObservable<ISessionWorktreeCleanupSummary | undefined>;
	refresh(): Promise<void>;
	snooze(): void;
	reviewAndCleanup(): Promise<void>;
}

interface ICleanupPickItem extends IQuickPickItem {
	readonly candidate: ISessionWorktreeCleanupCandidate;
}

export class SessionWorktreeCleanupService extends Disposable implements ISessionWorktreeCleanupService {
	declare readonly _serviceBrand: undefined;

	private readonly _summary = observableValue<ISessionWorktreeCleanupSummary | undefined>(this, undefined);
	readonly summary = this._summary;

	private _lastScanAt = 0;
	private _refreshPromise: Promise<void> | undefined;

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
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, STORAGE_KEY_SNOOZED_UNTIL, this._store)(() => {
			if (this._isSnoozed()) {
				this._summary.set(undefined, undefined);
			} else {
				this._lastScanAt = 0;
			}
		}));
		this._register(this.sessionsManagementService.onDidArchiveSession(session => {
			const summary = this._summary.get();
			if (!summary) {
				return;
			}
			const candidates = summary.candidates.filter(candidate => candidate.session !== session);
			const totalBytes = candidates.reduce((total, candidate) => total + candidate.sizeBytes, 0);
			this._summary.set(totalBytes >= CLEANUP_THRESHOLD_BYTES ? { candidates, totalBytes } : undefined, undefined);
			this._lastScanAt = 0;
		}));
		const refreshScheduler = this._register(new RunOnceScheduler(() => {
			void this.refresh().catch(error => this.logService.warn('[SessionWorktreeCleanupService] Failed to refresh worktree usage', error));
		}, 10_000));
		this._register(this.sessionsManagementService.onDidChangeSessions(() => {
			this._lastScanAt = 0;
			refreshScheduler.schedule();
		}));
	}

	refresh(): Promise<void> {
		if (this._refreshPromise) {
			return this._refreshPromise;
		}
		if (Date.now() - this._lastScanAt < SCAN_CACHE_DURATION_MS) {
			return Promise.resolve();
		}

		const refresh = this._refresh();
		this._refreshPromise = refresh;
		return refresh.finally(() => {
			if (this._refreshPromise === refresh) {
				this._refreshPromise = undefined;
			}
		});
	}

	private async _refresh(): Promise<void> {
		this._lastScanAt = Date.now();
		if (this._isSnoozed()) {
			this._summary.set(undefined, undefined);
			return;
		}

		const activeSession = this.sessionsService.activeSession.get();
		const cutoff = Date.now() - MINIMUM_SESSION_AGE_MS;
		const sessions = this.sessionsManagementService.getSessions().filter(session =>
			session !== activeSession
			&& session.status.get() === SessionStatus.Completed
			&& !session.isArchived.get()
			&& !this.sessionsListModelService.isSessionPinned(session)
			&& session.updatedAt.get().getTime() <= cutoff
			&& session.workspace.get()?.folders.some(folder => folder.gitRepository?.workTreeUri) === true
		);

		const getDiskUsage = this.sessionsManagementService.getSessionWorktreeDiskUsage;
		if (!getDiskUsage || sessions.length === 0) {
			this._summary.set(undefined, undefined);
			return;
		}

		const limiter = new Limiter<ISessionWorktreeCleanupCandidate | undefined>(2);
		const measured = await Promise.all(sessions.map(session => limiter.queue(async () => {
			try {
				const sizeBytes = await getDiskUsage.call(this.sessionsManagementService, session);
				return typeof sizeBytes === 'number' && sizeBytes > 0 ? { session, sizeBytes } : undefined;
			} catch (error) {
				this.logService.warn(`[SessionWorktreeCleanupService] Failed to measure worktree for session ${session.sessionId}`, error);
				return undefined;
			}
		})));
		const candidates = measured
			.filter((candidate): candidate is ISessionWorktreeCleanupCandidate => candidate !== undefined)
			.sort((a, b) => a.session.updatedAt.get().getTime() - b.session.updatedAt.get().getTime());
		const totalBytes = candidates.reduce((total, candidate) => total + candidate.sizeBytes, 0);
		if (!this._store.isDisposed) {
			this._summary.set(totalBytes >= CLEANUP_THRESHOLD_BYTES ? { candidates, totalBytes } : undefined, undefined);
		}
	}

	snooze(): void {
		this.storageService.store(STORAGE_KEY_SNOOZED_UNTIL, Date.now() + SNOOZE_DURATION_MS, StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._summary.set(undefined, undefined);
	}

	async reviewAndCleanup(): Promise<void> {
		const summary = this._summary.get();
		if (!summary) {
			return;
		}

		const selected = await this._pickCandidates(summary.candidates);
		if (selected.length === 0) {
			return;
		}

		const selectedBytes = selected.reduce((total, candidate) => total + candidate.sizeBytes, 0);
		const confirmation = await this.dialogService.confirm({
			message: selected.length === 1
				? localize('worktreeCleanup.confirm.one', "Archive 1 session and clean up its worktree?")
				: localize('worktreeCleanup.confirm.many', "Archive {0} sessions and clean up their worktrees?", selected.length),
			detail: localize('worktreeCleanup.confirm.detail', "This can reclaim about {0}. You can restore archived sessions later.", ByteSize.formatSize(selectedBytes)),
			primaryButton: localize('worktreeCleanup.confirm.primary', "Archive and Clean Up"),
		});
		if (!confirmation.confirmed) {
			return;
		}

		for (const candidate of selected) {
			await this.sessionsManagementService.archiveSession(candidate.session);
		}
		const message = selected.length === 1
			? localize('worktreeCleanup.archived.one', "Archived 1 session. Worktree cleanup continues in the background.")
			: localize('worktreeCleanup.archived.many', "Archived {0} sessions. Worktree cleanup continues in the background.", selected.length);
		status(message);

		const selectedIds = new Set(selected.map(candidate => candidate.session.sessionId));
		const remaining = summary.candidates.filter(candidate => !selectedIds.has(candidate.session.sessionId));
		const totalBytes = remaining.reduce((total, candidate) => total + candidate.sizeBytes, 0);
		this._summary.set(totalBytes >= CLEANUP_THRESHOLD_BYTES ? { candidates: remaining, totalBytes } : undefined, undefined);
		this._lastScanAt = 0;
	}

	private _pickCandidates(candidates: readonly ISessionWorktreeCleanupCandidate[]): Promise<readonly ISessionWorktreeCleanupCandidate[]> {
		const store = new DisposableStore();
		const picker = store.add(this.quickInputService.createQuickPick<ICleanupPickItem>());
		picker.canSelectMany = true;
		picker.title = localize('worktreeCleanup.picker.title', "Clean Up Old Session Worktrees");
		picker.placeholder = localize('worktreeCleanup.picker.placeholder', "Select sessions to archive and clean up");
		picker.items = candidates.map(candidate => ({
			label: candidate.session.title.get() || localize('worktreeCleanup.untitled', "Untitled session"),
			description: ByteSize.formatSize(candidate.sizeBytes),
			detail: localize('worktreeCleanup.lastUpdated', "Last updated {0}", candidate.session.updatedAt.get().toLocaleDateString()),
			candidate,
		}));
		picker.selectedItems = [...picker.items];

		return new Promise(resolve => {
			store.add(picker.onDidAccept(() => {
				const selected = picker.selectedItems.map(item => item.candidate);
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
