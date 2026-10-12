/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Limiter, raceCancellationError, raceTimeout, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
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
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export const CLEANUP_THRESHOLD_BYTES = 5 * ByteSize.GB;
export const CLEANUP_THRESHOLD_WORKTREES = 20;
const DEFAULT_MINIMUM_SESSION_AGE_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_CACHE_DURATION_MS = 60 * 60 * 1000;
const WORKTREE_MEASUREMENT_TIMEOUT_MS = 10_000;

export const AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING = 'chat.agentSessions.sessionStorageCleanupSuggestion.enabled';
export const LEGACY_AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING = 'sessions.chat.experimental.worktreeLimitPrompt';
export const MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID = 'sessions.chat.manageAgentSessionWorktrees';

export interface ISessionWorktreeCleanupCandidate {
	readonly session: ISession;
	readonly sizeBytes: number;
	readonly worktreeCount: number;
}

export interface ISessionWorktreeCleanupSuggestion {
	readonly description: string;
	manage(): Promise<void>;
	disable(): Promise<void>;
	dismiss(): void;
}

export type SessionWorktreeCleanupState = 'eligible' | 'active' | 'running' | 'needsInput' | 'pinned' | 'recent' | 'archived' | 'untitled' | 'error' | 'unavailable';

export interface ISessionWorktree {
	readonly session: ISession;
	readonly sizeBytes: number | undefined;
	readonly worktreeCount: number;
	readonly cleanupState: SessionWorktreeCleanupState;
}

type IMeasuredSessionWorktree = Omit<ISessionWorktree, 'cleanupState'>;

interface IWorktreeMeasurementProgress {
	readonly scannedWorktrees: number;
	readonly totalWorktrees: number;
}

export const ISessionWorktreeCleanupService = createDecorator<ISessionWorktreeCleanupService>('sessionWorktreeCleanupService');

export interface ISessionWorktreeCleanupService {
	readonly _serviceBrand: undefined;
	readonly suggestion: IObservable<ISessionWorktreeCleanupSuggestion | undefined>;
	activate(): Promise<void>;
	refresh(): Promise<void>;
	suppressForWindow(): void;
	getWorktrees(minimumAgeDays: number): Promise<readonly ISessionWorktree[]>;
	cleanupWorktrees(candidates: readonly ISessionWorktreeCleanupCandidate[]): Promise<boolean>;
}

export class SessionWorktreeCleanupService extends Disposable implements ISessionWorktreeCleanupService {
	declare readonly _serviceBrand: undefined;

	private _lastScanAt = 0;
	private _lastMeasurementAt = 0;
	private _lastMeasuredWorktrees: readonly IMeasuredSessionWorktree[] | undefined;
	private _lastMeasuredSessionSignature = '';
	private _measurement: {
		readonly sessionSignature: string;
		readonly promise: Promise<readonly IMeasuredSessionWorktree[]>;
		readonly progressListeners: Set<(progress: IWorktreeMeasurementProgress) => void>;
		readonly getProgress: () => IWorktreeMeasurementProgress | undefined;
	} | undefined;
	private _refreshPromise: Promise<void> | undefined;
	private _activated = false;
	private _dismissed = false;
	private readonly _suggestion = observableValue<ISessionWorktreeCleanupSuggestion | undefined>(this, undefined);
	readonly suggestion: IObservable<ISessionWorktreeCleanupSuggestion | undefined> = this._suggestion;

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
			if (!event.affectsConfiguration(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING)) {
				return;
			}
			this._lastScanAt = 0;
			if (!this._isEnabled()) {
				this._suggestion.set(undefined, undefined);
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
			refreshScheduler.schedule();
		}));
	}

	activate(): Promise<void> {
		this._activated = true;
		return this._refreshIfNeeded();
	}

	refresh(): Promise<void> {
		this._activated = true;
		this._lastScanAt = 0;
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

		const candidates = this._getCleanupCandidates(worktrees);
		const totalBytes = candidates.reduce((total, candidate) => total + candidate.sizeBytes, 0);
		const totalWorktrees = candidates.reduce((total, candidate) => total + candidate.worktreeCount, 0);
		const thresholdReached = totalWorktrees >= CLEANUP_THRESHOLD_WORKTREES || totalBytes >= CLEANUP_THRESHOLD_BYTES;
		if (thresholdReached && !this._dismissed) {
			this._suggestion.set(this._createSuggestion(totalWorktrees, totalBytes), undefined);
		} else {
			this._suggestion.set(undefined, undefined);
		}
	}

	private async _measureWorktrees(onProgress: (progress: IWorktreeMeasurementProgress) => void): Promise<readonly IMeasuredSessionWorktree[]> {
		const worktreeSessions = this.sessionsManagementService.getSessions().filter(session =>
			session.workspace.get()?.folders.some(folder => folder.gitRepository?.workTreeUri) === true
		);
		const totalWorktrees = worktreeSessions.reduce((total, session) => total + this._countWorktrees(session), 0);
		let scannedWorktrees = 0;
		onProgress({ scannedWorktrees, totalWorktrees });

		const getDiskUsage = this.sessionsManagementService.getSessionWorktreeDiskUsage;
		if (worktreeSessions.length === 0) {
			return [];
		}
		if (!getDiskUsage) {
			onProgress({ scannedWorktrees: totalWorktrees, totalWorktrees });
			return worktreeSessions.map(session => ({ session, sizeBytes: undefined, worktreeCount: this._countWorktrees(session) }));
		}

		const limiter = new Limiter<IMeasuredSessionWorktree>(2);
		return Promise.all(worktreeSessions.map(session => limiter.queue(async () => {
			const worktreeCount = this._countWorktrees(session);
			let sizeBytes: number | undefined;
			try {
				sizeBytes = await raceTimeout(
					getDiskUsage.call(this.sessionsManagementService, session),
					WORKTREE_MEASUREMENT_TIMEOUT_MS,
					() => this.logService.warn(`[SessionWorktreeCleanupService] Timed out measuring worktree for session ${session.sessionId}`),
				);
			} catch (error) {
				this.logService.warn(`[SessionWorktreeCleanupService] Failed to measure worktree for session ${session.sessionId}`, error);
			}
			scannedWorktrees += worktreeCount;
			onProgress({ scannedWorktrees, totalWorktrees });
			return {
				session,
				sizeBytes,
				worktreeCount,
			};
		})));
	}

	/** Counts the distinct worktree checkouts a session owns so the threshold measures worktrees, not sessions. */
	private _countWorktrees(session: ISession): number {
		const worktreeUris = new Set<string>();
		for (const folder of session.workspace.get()?.folders ?? []) {
			const worktreeUri = folder.gitRepository?.workTreeUri;
			if (worktreeUri) {
				worktreeUris.add(worktreeUri.toString());
			}
		}
		return worktreeUris.size;
	}

	private async _getMeasuredWorktrees(minimumAgeDays: number, token = CancellationToken.None, onProgress?: (progress: IWorktreeMeasurementProgress) => void): Promise<readonly ISessionWorktree[]> {
		const measuredSessionSignature = this._getWorktreeSessionSignature();
		if (this._lastMeasuredWorktrees && this._lastMeasuredSessionSignature === measuredSessionSignature && Date.now() - this._lastMeasurementAt < SCAN_CACHE_DURATION_MS) {
			return this._withCleanupState(this._lastMeasuredWorktrees, minimumAgeDays);
		}

		let measurement = this._measurement;
		if (!measurement || measurement.sessionSignature !== measuredSessionSignature) {
			let latestProgress: IWorktreeMeasurementProgress | undefined;
			const progressListeners = new Set<(progress: IWorktreeMeasurementProgress) => void>();
			measurement = {
				sessionSignature: measuredSessionSignature,
				promise: this._measureWorktrees(progress => {
					latestProgress = progress;
					for (const listener of progressListeners) {
						listener(progress);
					}
				}),
				progressListeners,
				getProgress: () => latestProgress,
			};
			this._measurement = measurement;
			measurement.promise.then(
				() => {
					if (this._measurement === measurement) {
						this._measurement = undefined;
					}
				},
				() => {
					if (this._measurement === measurement) {
						this._measurement = undefined;
					}
				},
			);
		}

		if (onProgress) {
			measurement.progressListeners.add(onProgress);
			const progress = measurement.getProgress();
			if (progress) {
				onProgress(progress);
			}
		}
		let worktrees: readonly IMeasuredSessionWorktree[];
		try {
			worktrees = await raceCancellationError(measurement.promise, token);
		} finally {
			if (onProgress) {
				measurement.progressListeners.delete(onProgress);
			}
		}
		if (this._getWorktreeSessionSignature() !== measuredSessionSignature) {
			return this._getMeasuredWorktrees(minimumAgeDays, token, onProgress);
		}
		this._lastMeasuredWorktrees = worktrees;
		this._lastMeasuredSessionSignature = measuredSessionSignature;
		this._lastMeasurementAt = Date.now();
		return this._withCleanupState(worktrees, minimumAgeDays);
	}

	private _withCleanupState(worktrees: readonly IMeasuredSessionWorktree[], minimumAgeDays: number): readonly ISessionWorktree[] {
		const activeSessionId = this.sessionsService.activeSession.get()?.sessionId;
		const cutoff = Date.now() - minimumAgeDays * DAY_MS;
		return worktrees.map(worktree => ({
			...worktree,
			cleanupState: this._getCleanupState(worktree.session, worktree.sizeBytes, activeSessionId, cutoff),
		}));
	}

	private _getWorktreeSessionSignature(): string {
		return this.sessionsManagementService.getSessions()
			.flatMap(session => session.workspace.get()?.folders
				.map(folder => folder.gitRepository?.workTreeUri)
				.filter(worktreeUri => worktreeUri !== undefined)
				.map(worktreeUri => `${session.sessionId}\0${worktreeUri.toString()}`) ?? [])
			.sort()
			.join('\n');
	}

	private _getCleanupState(session: ISession, sizeBytes: number | undefined, activeSessionId: string | undefined, cutoff: number): SessionWorktreeCleanupState {
		if (sizeBytes === undefined) {
			return 'unavailable';
		}
		if (session.isArchived.get()) {
			return 'archived';
		}
		if (session.sessionId === activeSessionId) {
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
			.map(worktree => ({ session: worktree.session, sizeBytes: worktree.sizeBytes, worktreeCount: worktree.worktreeCount }))
			.sort((a, b) => a.session.updatedAt.get().getTime() - b.session.updatedAt.get().getTime());
	}

	private _createSuggestion(worktreeCount: number, reclaimableBytes: number): ISessionWorktreeCleanupSuggestion {
		const description = worktreeCount === 1
			? localize('worktreeCleanup.nudge.descriptionOne', "1 agent session worktree has been inactive for at least 15 days and can be cleaned up, reclaiming about {0}.", ByteSize.formatSize(reclaimableBytes))
			: localize('worktreeCleanup.nudge.descriptionMany', "{0} agent session worktrees have been inactive for at least 15 days and can be cleaned up, reclaiming about {1}.", worktreeCount, ByteSize.formatSize(reclaimableBytes));
		return {
			description,
			manage: async () => {
				this.suppressForWindow();
				await this.commandService.executeCommand(MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID);
			},
			disable: async () => {
				this.suppressForWindow();
				await this.configurationService.updateValue(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, false, ConfigurationTarget.APPLICATION);
			},
			dismiss: () => this.suppressForWindow(),
		};
	}

	suppressForWindow(): void {
		this._dismissed = true;
		this._suggestion.set(undefined, undefined);
	}

	async getWorktrees(minimumAgeDays: number): Promise<readonly ISessionWorktree[]> {
		const measuredSessionSignature = this._getWorktreeSessionSignature();
		if (this._lastMeasuredWorktrees
			&& this._lastMeasuredSessionSignature === measuredSessionSignature
			&& Date.now() - this._lastMeasurementAt < SCAN_CACHE_DURATION_MS
		) {
			return this._getWorktrees(minimumAgeDays);
		}
		const cancellation = new CancellationTokenSource();
		try {
			return await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('worktreeCleanup.measuringProgress', "Measuring agent session worktrees..."),
				delay: 300,
				cancellable: true,
			}, progress => this._getWorktrees(minimumAgeDays, cancellation.token, measurementProgress => {
				progress.report({
					message: localize('worktreeCleanup.measuringProgressCount', "Scanned {0} of {1} worktrees", measurementProgress.scannedWorktrees, measurementProgress.totalWorktrees),
				});
			}), () => cancellation.cancel());
		} finally {
			cancellation.dispose();
		}
	}

	/**
	 * Only sessions with a measured worktree are reported. Marking a session without a worktree as
	 * done reclaims no storage, so it does not belong in a storage manager; the Sessions list owns
	 * that decluttering.
	 */
	private async _getWorktrees(minimumAgeDays: number, token = CancellationToken.None, onProgress?: (progress: IWorktreeMeasurementProgress) => void): Promise<readonly ISessionWorktree[]> {
		return (await this._getMeasuredWorktrees(minimumAgeDays, token, onProgress))
			.filter(worktree => worktree.sizeBytes !== undefined && worktree.cleanupState !== 'archived');
	}

	async cleanupWorktrees(selected: readonly ISessionWorktreeCleanupCandidate[]): Promise<boolean> {
		if (selected.length === 0) {
			return false;
		}

		const selectedBytes = selected.reduce((total, candidate) => total + candidate.sizeBytes, 0);
		const worktreeCount = selected.reduce((total, candidate) => total + candidate.worktreeCount, 0);
		const confirmation = await this.dialogService.confirm({
			message: worktreeCount === 1
				? localize('worktreeCleanup.confirm.one', "Clean up 1 worktree?")
				: localize('worktreeCleanup.confirm.many', "Clean up {0} worktrees?", worktreeCount),
			detail: localize('worktreeCleanup.confirm.detail', "This reclaims about {0} and marks the selected sessions as done. You can restore a session later to recreate its worktree.", ByteSize.formatSize(selectedBytes)),
			primaryButton: localize('worktreeCleanup.confirm.primary', "Clean Up"),
		});
		if (!confirmation.confirmed) {
			return false;
		}

		await this.progressService.withProgress({
			location: ProgressLocation.Notification,
			title: worktreeCount === 1
				? localize('worktreeCleanup.cleaning.one', "Scheduling cleanup for 1 agent session worktree...")
				: localize('worktreeCleanup.cleaning.many', "Scheduling cleanup for {0} agent session worktrees...", worktreeCount),
		}, async progress => {
			let completedWorktrees = 0;
			for (const candidate of selected) {
				await this.sessionsManagementService.archiveSession(candidate.session);
				completedWorktrees += candidate.worktreeCount;
				progress.report({
					increment: candidate.worktreeCount / worktreeCount * 100,
					message: localize('worktreeCleanup.cleaningProgress', "Scheduled {0} of {1} worktrees", completedWorktrees, worktreeCount),
				});
			}
		});
		const message = worktreeCount === 1
			? localize('worktreeCleanup.archived.one', "Started cleanup for 1 worktree.")
			: localize('worktreeCleanup.archived.many', "Started cleanup for {0} worktrees.", worktreeCount);
		status(message);
		this._lastScanAt = 0;
		this._lastMeasurementAt = 0;
		return true;
	}

	private _isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING) === true;
	}
}
