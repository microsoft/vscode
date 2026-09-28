/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Limiter, RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { localize } from '../../../../nls.js';
import { IChatInputNudgeOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputNudge.js';
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

const CLEANUP_THRESHOLD_BYTES = 5 * ByteSize.GB;
const CLEANUP_THRESHOLD_WORKTREES = 20;
const DEFAULT_MINIMUM_SESSION_AGE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_CACHE_DURATION_MS = 60 * 60 * 1000;

export const AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING = 'sessions.chat.experimental.worktreeLimitPrompt';
export const MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID = 'sessions.chat.manageAgentSessionWorktrees';

export interface ISessionWorktreeCleanupCandidate {
	readonly session: ISession;
	readonly sizeBytes: number;
}

export type SessionWorktreeCleanupState = 'eligible' | 'active' | 'running' | 'needsInput' | 'pinned' | 'recent' | 'archived' | 'untitled' | 'error' | 'unavailable';

export interface ISessionWorktree {
	readonly session: ISession;
	readonly sizeBytes: number | undefined;
	readonly hasWorktree: boolean;
	readonly cleanupState: SessionWorktreeCleanupState;
}

export const ISessionWorktreeCleanupService = createDecorator<ISessionWorktreeCleanupService>('sessionWorktreeCleanupService');

export interface ISessionWorktreeCleanupService {
	readonly _serviceBrand: undefined;
	readonly nudge: IObservable<IChatInputNudgeOptions | undefined>;
	activate(): Promise<void>;
	getWorktrees(minimumAgeDays: number, includeSessionsWithoutWorktrees?: boolean): Promise<readonly ISessionWorktree[]>;
	cleanupWorktrees(candidates: readonly ISessionWorktreeCleanupCandidate[]): Promise<boolean>;
	getCleanupStateLabel(state: SessionWorktreeCleanupState): string;
}

export class SessionWorktreeCleanupService extends Disposable implements ISessionWorktreeCleanupService {
	declare readonly _serviceBrand: undefined;

	private _lastScanAt = 0;
	private _lastMeasurementAt = 0;
	private _lastMeasuredWorktrees: readonly ISessionWorktree[] | undefined;
	private _refreshPromise: Promise<void> | undefined;
	private _activated = false;
	private _dismissed = false;
	private readonly _nudge = observableValue<IChatInputNudgeOptions | undefined>(this, undefined);
	readonly nudge: IObservable<IChatInputNudgeOptions | undefined> = this._nudge;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsListModelService private readonly sessionsListModelService: ISessionsListModelService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProgressService private readonly progressService: IProgressService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (!event.affectsConfiguration(AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING)) {
				return;
			}
			this._lastScanAt = 0;
			if (!this._isEnabled()) {
				this._nudge.set(undefined, undefined);
				return;
			}
			if (this._activated) {
				void this._refreshIfNeeded().catch(error => this.logService.warn('[SessionWorktreeCleanupService] Failed to refresh worktree usage', error));
			}
		}));
		this._register(this.sessionsManagementService.onDidArchiveSession(() => {
			this._lastScanAt = 0;
			this._lastMeasurementAt = 0;
		}));
		const refreshScheduler = this._register(new RunOnceScheduler(() => {
			if (this._activated) {
				void this._refreshIfNeeded().catch(error => this.logService.warn('[SessionWorktreeCleanupService] Failed to refresh worktree usage', error));
			}
		}, 10_000));
		this._register(this.sessionsManagementService.onDidChangeSessions(() => {
			this._lastScanAt = 0;
			this._lastMeasurementAt = 0;
			refreshScheduler.schedule();
		}));
	}

	activate(): Promise<void> {
		this._activated = true;
		return this._refreshIfNeeded();
	}

	private _refreshIfNeeded(): Promise<void> {
		if (!this._isEnabled()) {
			return Promise.resolve();
		}
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
		const worktrees = await this._getMeasuredWorktrees(DEFAULT_MINIMUM_SESSION_AGE_DAYS);
		if (this._store.isDisposed || !this._isEnabled()) {
			return;
		}

		const existing = worktrees.filter(worktree => worktree.sizeBytes !== undefined);
		const candidates = this._getCleanupCandidates(worktrees);
		const totalBytes = candidates.reduce((total, candidate) => total + candidate.sizeBytes, 0);
		const thresholdReached = existing.length >= CLEANUP_THRESHOLD_WORKTREES || totalBytes >= CLEANUP_THRESHOLD_BYTES;
		if (thresholdReached && candidates.length > 0 && !this._dismissed) {
			this._nudge.set(this._createNudge(candidates.length, totalBytes), undefined);
		} else {
			this._nudge.set(undefined, undefined);
		}
	}

	private async _measureWorktrees(minimumAgeDays: number): Promise<readonly ISessionWorktree[]> {
		const activeSession = this.sessionsService.activeSession.get();
		const cutoff = Date.now() - minimumAgeDays * DAY_MS;
		const worktreeSessions = this.sessionsManagementService.getSessions().filter(session =>
			session.workspace.get()?.folders.some(folder => folder.gitRepository?.workTreeUri) === true
		);

		const getDiskUsage = this.sessionsManagementService.getSessionWorktreeDiskUsage;
		if (worktreeSessions.length === 0) {
			return [];
		}
		if (!getDiskUsage) {
			return worktreeSessions.map(session => ({ session, sizeBytes: undefined, hasWorktree: true, cleanupState: 'unavailable' }));
		}

		const limiter = new Limiter<ISessionWorktree>(2);
		return Promise.all(worktreeSessions.map(session => limiter.queue(async () => {
			let sizeBytes: number | undefined;
			try {
				sizeBytes = await getDiskUsage.call(this.sessionsManagementService, session);
			} catch (error) {
				this.logService.warn(`[SessionWorktreeCleanupService] Failed to measure worktree for session ${session.sessionId}`, error);
			}
			return {
				session,
				sizeBytes,
				hasWorktree: true,
				cleanupState: this._getCleanupState(session, sizeBytes, activeSession, cutoff),
			};
		})));
	}

	private async _getMeasuredWorktrees(minimumAgeDays: number): Promise<readonly ISessionWorktree[]> {
		if (this._lastMeasuredWorktrees && Date.now() - this._lastMeasurementAt < SCAN_CACHE_DURATION_MS) {
			const activeSession = this.sessionsService.activeSession.get();
			const cutoff = Date.now() - minimumAgeDays * DAY_MS;
			return this._lastMeasuredWorktrees.map(worktree => ({
				...worktree,
				cleanupState: this._getCleanupState(worktree.session, worktree.sizeBytes, activeSession, cutoff),
			}));
		}

		const worktrees = await this._measureWorktrees(minimumAgeDays);
		this._lastMeasuredWorktrees = worktrees;
		this._lastMeasurementAt = Date.now();
		return worktrees;
	}

	private _getCleanupState(session: ISession, sizeBytes: number | undefined, activeSession: ISession | undefined, cutoff: number): SessionWorktreeCleanupState {
		if (sizeBytes === undefined) {
			return 'unavailable';
		}
		if (session.isArchived.get()) {
			return 'archived';
		}
		if (session === activeSession) {
			return 'active';
		}
		if (session.status.get() === SessionStatus.InProgress) {
			return 'running';
		}
		if (session.status.get() === SessionStatus.NeedsInput) {
			return 'needsInput';
		}
		if (this.sessionsListModelService.isSessionPinned(session)) {
			return 'pinned';
		}
		if (session.updatedAt.get().getTime() > cutoff) {
			return 'recent';
		}
		if (session.status.get() === SessionStatus.Untitled) {
			return 'untitled';
		}
		if (session.status.get() === SessionStatus.Error) {
			return 'error';
		}
		return 'eligible';
	}

	private _getCleanupCandidates(worktrees: readonly ISessionWorktree[]): readonly ISessionWorktreeCleanupCandidate[] {
		return worktrees
			.filter((worktree): worktree is ISessionWorktree & { readonly sizeBytes: number } => worktree.cleanupState === 'eligible' && worktree.sizeBytes !== undefined)
			.map(worktree => ({ session: worktree.session, sizeBytes: worktree.sizeBytes }))
			.sort((a, b) => a.session.updatedAt.get().getTime() - b.session.updatedAt.get().getTime());
	}

	private _createNudge(candidateCount: number, reclaimableBytes: number): IChatInputNudgeOptions {
		const description = candidateCount === 1
			? localize('worktreeCleanup.nudge.descriptionOne', "1 agent session worktree has been inactive for at least 14 days and can be cleaned up, reclaiming about {0}. Active, running, needs-input, and pinned sessions are excluded.", ByteSize.formatSize(reclaimableBytes))
			: localize('worktreeCleanup.nudge.descriptionMany', "{0} agent session worktrees have been inactive for at least 14 days and can be cleaned up, reclaiming about {1}. Active, running, needs-input, and pinned sessions are excluded.", candidateCount, ByteSize.formatSize(reclaimableBytes));
		return {
			title: localize('worktreeCleanup.nudge.title', "Clean up agent session worktrees"),
			description,
			icon: Codicon.trash,
			primaryAction: {
				label: localize('worktreeCleanup.nudge.manage', "Manage Session Storage"),
				errorMessage: localize('worktreeCleanup.nudge.manageError', "Unable to manage agent session worktrees"),
				run: async () => {
					this._dismissed = true;
					this._nudge.set(undefined, undefined);
					await this.commandService.executeCommand(MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID);
				},
			},
			secondaryAction: {
				label: localize('worktreeCleanup.nudge.dontShowAgain', "Don't Show Again"),
				errorMessage: localize('worktreeCleanup.nudge.dontShowAgainError', "Unable to disable worktree cleanup suggestions"),
				run: async () => {
					this._dismissed = true;
					this._nudge.set(undefined, undefined);
					await this.configurationService.updateValue(AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING, false, ConfigurationTarget.APPLICATION);
				},
			},
			dismissLabel: localize('worktreeCleanup.nudge.dismiss', "Dismiss Worktree Cleanup Suggestion"),
			onDismiss: () => {
				this._dismissed = true;
				this._nudge.set(undefined, undefined);
			},
		};
	}

	getWorktrees(minimumAgeDays: number, includeSessionsWithoutWorktrees = false): Promise<readonly ISessionWorktree[]> {
		if (this._lastMeasuredWorktrees && Date.now() - this._lastMeasurementAt < SCAN_CACHE_DURATION_MS) {
			return this._getWorktrees(minimumAgeDays, includeSessionsWithoutWorktrees);
		}
		return this.progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('worktreeCleanup.measuringProgress', "Measuring agent session worktrees..."),
			delay: 300,
		}, () => this._getWorktrees(minimumAgeDays, includeSessionsWithoutWorktrees));
	}

	private async _getWorktrees(minimumAgeDays: number, includeSessionsWithoutWorktrees: boolean): Promise<readonly ISessionWorktree[]> {
		const measured = (await this._getMeasuredWorktrees(minimumAgeDays)).filter(worktree => worktree.sizeBytes !== undefined);
		if (!includeSessionsWithoutWorktrees) {
			return measured;
		}
		const measuredSessionIds = new Set(measured.map(worktree => worktree.session.sessionId));
		const activeSession = this.sessionsService.activeSession.get();
		const cutoff = Date.now() - minimumAgeDays * DAY_MS;
		const withoutWorktrees = this.sessionsManagementService.getSessions()
			.filter(session => !measuredSessionIds.has(session.sessionId)
				&& session.workspace.get()?.folders.some(folder => folder.gitRepository?.workTreeUri) !== true)
			.map(session => ({
				session,
				sizeBytes: 0,
				hasWorktree: false,
				cleanupState: this._getCleanupState(session, 0, activeSession, cutoff),
			}));
		return [...measured, ...withoutWorktrees];
	}

	async cleanupWorktrees(selected: readonly ISessionWorktreeCleanupCandidate[]): Promise<boolean> {
		if (selected.length === 0) {
			return false;
		}

		const selectedBytes = selected.reduce((total, candidate) => total + candidate.sizeBytes, 0);
		const confirmation = await this.dialogService.confirm({
			message: selected.length === 1
				? localize('worktreeCleanup.confirm.one', "Mark 1 session as done and clean up its worktree?")
				: localize('worktreeCleanup.confirm.many', "Mark {0} sessions as done and clean up their worktrees?", selected.length),
			detail: localize('worktreeCleanup.confirm.detail', "This can reclaim about {0}. You can restore sessions marked as done later.", ByteSize.formatSize(selectedBytes)),
			primaryButton: localize('worktreeCleanup.confirm.primary', "Mark as Done and Clean Up"),
		});
		if (!confirmation.confirmed) {
			return false;
		}

		for (const candidate of selected) {
			await this.sessionsManagementService.archiveSession(candidate.session);
		}
		const message = selected.length === 1
			? localize('worktreeCleanup.archived.one', "Marked 1 session as done. Worktree cleanup continues in the background.")
			: localize('worktreeCleanup.archived.many', "Marked {0} sessions as done. Worktree cleanup continues in the background.", selected.length);
		status(message);
		this._lastScanAt = 0;
		return true;
	}

	getCleanupStateLabel(state: SessionWorktreeCleanupState): string {
		switch (state) {
			case 'eligible':
				return localize('worktreeCleanup.state.eligible', "Eligible for cleanup");
			case 'active':
				return localize('worktreeCleanup.state.active', "Active session");
			case 'running':
				return localize('worktreeCleanup.state.running', "Session is running");
			case 'needsInput':
				return localize('worktreeCleanup.state.needsInput', "Session needs input");
			case 'pinned':
				return localize('worktreeCleanup.state.pinned', "Pinned session");
			case 'recent':
				return localize('worktreeCleanup.state.recent', "Updated within the selected period");
			case 'archived':
				return localize('worktreeCleanup.state.archived', "Archived; cleanup may still be in progress");
			case 'untitled':
				return localize('worktreeCleanup.state.untitled', "Session has not started");
			case 'error':
				return localize('worktreeCleanup.state.error', "Session ended with an error");
			case 'unavailable':
				return localize('worktreeCleanup.state.unavailable', "Worktree is missing or could not be measured");
		}
	}

	private _isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING) === true;
	}
}
