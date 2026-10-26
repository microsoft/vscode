/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Limiter, raceCancellationError, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import type { IAgentHostWorktreeCleanupStatus } from '../../../../platform/agentHost/common/agentHostWorktreeCleanup.js';
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
export const LOW_DISK_SPACE_BYTES = 5 * ByteSize.GB;
export const CLEANUP_THRESHOLD_WORKTREES = 20;
const DEFAULT_MINIMUM_SESSION_AGE_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_CACHE_DURATION_MS = 60 * 60 * 1000;

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
	readonly isMeasuring?: boolean;
	readonly measurementFailed?: boolean;
	readonly worktreeCount: number;
	readonly cleanupState: SessionWorktreeCleanupState;
	readonly cleanupStatus?: IAgentHostWorktreeCleanupStatus;
	readonly cleanupStatusError?: string;
}

type IMeasuredSessionWorktree = Omit<ISessionWorktree, 'cleanupState'>;

export interface ISessionWorktreeMeasurementProgress {
	readonly scannedWorktrees: number;
	readonly totalWorktrees: number;
}

interface IWorktreeMeasurementProgress extends ISessionWorktreeMeasurementProgress {
	readonly worktrees: readonly IMeasuredSessionWorktree[];
}

export const ISessionWorktreeCleanupService = createDecorator<ISessionWorktreeCleanupService>('sessionWorktreeCleanupService');

export interface ISessionWorktreeCleanupService {
	readonly _serviceBrand: undefined;
	readonly suggestion: IObservable<ISessionWorktreeCleanupSuggestion | undefined>;
	activate(): Promise<void>;
	refresh(): Promise<void>;
	suppressForWindow(): void;
	setAvailableDiskSpace(availableBytes: number | undefined): void;
	/** Publishes initial and measured worktrees progressively. forceRefresh bypasses cached results without starting a separate background scan. */
	getWorktrees(minimumAgeDays: number, onUpdate?: (worktrees: readonly ISessionWorktree[], progress?: ISessionWorktreeMeasurementProgress) => void, token?: CancellationToken, forceRefresh?: boolean): Promise<readonly ISessionWorktree[]>;
	refreshPendingCleanup(sessionIds: readonly string[], minimumAgeDays: number, onUpdate?: (worktrees: readonly ISessionWorktree[]) => void, token?: CancellationToken): Promise<readonly ISessionWorktree[]>;
	cleanupWorktrees(candidates: readonly ISessionWorktreeCleanupCandidate[]): Promise<boolean>;
}

export class SessionWorktreeCleanupService extends Disposable implements ISessionWorktreeCleanupService {
	declare readonly _serviceBrand: undefined;

	private readonly _measurementCancellation = this._register(new CancellationTokenSource());
	private _lastScanAt = -Infinity;
	private _lastMeasurementAt = 0;
	private _lastMeasuredWorktrees: readonly IMeasuredSessionWorktree[] | undefined;
	private _lastMeasuredSessionSignature = '';
	private _measurement: {
		readonly sessionSignature: string;
		readonly cancellation: CancellationTokenSource;
		consumers: number;
		readonly promise: Promise<readonly IMeasuredSessionWorktree[]>;
		readonly progressListeners: Set<(progress: IWorktreeMeasurementProgress) => void>;
		readonly getProgress: () => IWorktreeMeasurementProgress | undefined;
	} | undefined;
	private _foregroundMeasurement: Promise<void> | undefined;
	private _refreshPromise: Promise<void> | undefined;
	private readonly _refreshScheduler = this._register(new RunOnceScheduler(() => {
		if (this._activated) {
			void this._refreshIfNeeded().catch(error => this.logService.warn('[SessionWorktreeCleanupService] Failed to refresh worktree usage', error));
		}
	}, 10_000));
	private _activated = false;
	private _dismissed = false;
	private _availableDiskSpace: number | undefined;
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
			this._lastScanAt = -Infinity;
			this._updateSuggestion();
			if (!this._isEnabled()) {
				this._refreshScheduler.cancel();
				this._suggestion.set(undefined, undefined);
				return;
			}
			if (this._activated) {
				void this._refreshIfNeeded().catch(error => this.logService.warn('[SessionWorktreeCleanupService] Failed to refresh worktree usage', error));
			}
		}));
		this._register(this.sessionsManagementService.onDidArchiveSession(() => {
			this._updateSuggestion();
		}));
		this._register(this.sessionsManagementService.onDidChangeSessions(() => {
			this._updateSuggestion();
			this._refreshScheduler.schedule();
		}));
	}

	override dispose(): void {
		this._measurementCancellation.cancel();
		super.dispose();
	}

	activate(): Promise<void> {
		this._activated = true;
		return this._refreshIfNeeded();
	}

	refresh(): Promise<void> {
		this._lastMeasuredWorktrees = undefined;
		this._activated = true;
		this._lastScanAt = -Infinity;
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
		await this._getMeasuredWorktrees(DEFAULT_MINIMUM_SESSION_AGE_DAYS);
		if (this._store.isDisposed || !this._isEnabled()) {
			return;
		}
		this._updateSuggestion();
	}

	setAvailableDiskSpace(availableBytes: number | undefined): void {
		this._availableDiskSpace = availableBytes;
		this._updateSuggestion();
	}

	private _updateSuggestion(): void {
		if (this._store.isDisposed || !this._isEnabled() || this._dismissed) {
			this._suggestion.set(undefined, undefined);
			return;
		}
		const hasLocalWorktree = this.sessionsManagementService.getSessions().some(session =>
			session.workspace.get()?.folders.some(folder => folder.gitRepository?.workTreeUri?.scheme === Schemas.file)
		);
		if (hasLocalWorktree && this._availableDiskSpace !== undefined && this._availableDiskSpace < LOW_DISK_SPACE_BYTES) {
			this._suggestion.set(this._createSuggestion({
				description: localize('worktreeCleanup.nudge.lowDiskSpace', "Your disk is almost full ({0} available). Clean up agent session worktrees to free up space.", ByteSize.formatSize(this._availableDiskSpace)),
				includeRecent: true,
			}), undefined);
			return;
		}
		const measuredWorktrees = this._lastMeasuredSessionSignature === this._getWorktreeSessionSignature() ? this._lastMeasuredWorktrees : undefined;
		const worktrees = this._withCleanupState(measuredWorktrees ?? [], DEFAULT_MINIMUM_SESSION_AGE_DAYS);
		const candidates = this._getCleanupCandidates(worktrees);
		const totalBytes = candidates.reduce((total, candidate) => total + candidate.sizeBytes, 0);
		const totalWorktrees = candidates.reduce((total, candidate) => total + candidate.worktreeCount, 0);
		const thresholdReached = totalWorktrees >= CLEANUP_THRESHOLD_WORKTREES || totalBytes >= CLEANUP_THRESHOLD_BYTES;
		if (thresholdReached) {
			const description = totalWorktrees === 1
				? localize('worktreeCleanup.nudge.descriptionOne', "1 agent session worktree has been inactive for at least 15 days and can be cleaned up, reclaiming about {0}.", ByteSize.formatSize(totalBytes))
				: localize('worktreeCleanup.nudge.descriptionMany', "{0} agent session worktrees have been inactive for at least 15 days and can be cleaned up, reclaiming about {1}.", totalWorktrees, ByteSize.formatSize(totalBytes));
			this._suggestion.set(this._createSuggestion({ description }), undefined);
		} else {
			this._suggestion.set(undefined, undefined);
		}
	}

	private async _measureWorktrees(token: CancellationToken, onProgress: (progress: IWorktreeMeasurementProgress) => void): Promise<readonly IMeasuredSessionWorktree[]> {
		const worktreeSessions = this.sessionsManagementService.getSessions().filter(session =>
			session.workspace.get()?.folders.some(folder => folder.gitRepository?.workTreeUri) === true
		);
		const totalWorktrees = worktreeSessions.reduce((total, session) => total + this._countWorktrees(session), 0);
		let scannedWorktrees = 0;
		const measured: IMeasuredSessionWorktree[] = worktreeSessions.map(session => ({ session, sizeBytes: undefined, worktreeCount: this._countWorktrees(session), isMeasuring: true }));
		onProgress({ scannedWorktrees, totalWorktrees, worktrees: [...measured] });

		const getDiskUsage = this.sessionsManagementService.getSessionWorktreeDiskUsage;
		if (worktreeSessions.length === 0) {
			return [];
		}
		if (!getDiskUsage) {
			onProgress({ scannedWorktrees: totalWorktrees, totalWorktrees, worktrees: measured.map(worktree => ({ ...worktree, isMeasuring: false })) });
			return worktreeSessions.map(session => ({ session, sizeBytes: undefined, worktreeCount: this._countWorktrees(session) }));
		}

		const limiter = new Limiter<IMeasuredSessionWorktree>(2);
		return Promise.all(worktreeSessions.map((session, index) => limiter.queue(async () => {
			const worktreeCount = this._countWorktrees(session);
			measured[index] = await this._measureSessionWorktree(session, token);
			scannedWorktrees += worktreeCount;
			onProgress({ scannedWorktrees, totalWorktrees, worktrees: [...measured] });
			return measured[index];
		})));
	}

	private async _measureSessionWorktree(session: ISession, token: CancellationToken): Promise<IMeasuredSessionWorktree> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		let sizeBytes: number | undefined;
		let measurementFailed = false;
		try {
			sizeBytes = await this.sessionsManagementService.getSessionWorktreeDiskUsage?.(session, token);
		} catch (error) {
			if (token.isCancellationRequested) {
				throw error;
			}
			measurementFailed = true;
			this.logService.warn(`[SessionWorktreeCleanupService] Failed to measure worktree for session ${session.sessionId}`, error);
		}
		let cleanupStatus: IAgentHostWorktreeCleanupStatus | undefined;
		let cleanupStatusError: string | undefined;
		if (session.isArchived.get()) {
			try {
				cleanupStatus = await this.sessionsManagementService.sessionWorktreeCleanup?.(session, false);
			} catch (error) {
				if (token.isCancellationRequested) {
					throw error;
				}
				cleanupStatusError = getErrorMessage(error);
				const previousStatus = this._lastMeasuredWorktrees?.find(worktree => worktree.session.sessionId === session.sessionId)?.cleanupStatus;
				if (previousStatus?.state === 'pending' || previousStatus?.state === 'running') {
					cleanupStatus = previousStatus;
				}
				this.logService.warn(`[SessionWorktreeCleanupService] Failed to read cleanup status for session ${session.sessionId}`, error);
			}
		}
		return { session, sizeBytes, worktreeCount: this._countWorktrees(session), isMeasuring: false, measurementFailed, cleanupStatus, cleanupStatusError };
	}

	async refreshPendingCleanup(sessionIds: readonly string[], minimumAgeDays: number, onUpdate?: (worktrees: readonly ISessionWorktree[]) => void, token = CancellationToken.None): Promise<readonly ISessionWorktree[]> {
		const cached = this._lastMeasuredWorktrees;
		if (!cached) {
			return this._getWorktrees(minimumAgeDays, token);
		}
		const limiter = new Limiter<IMeasuredSessionWorktree>(2);
		const pendingIds = new Set(sessionIds);
		const updated = [...cached];
		let published = cached;
		await Promise.all(cached.map((worktree, index) => pendingIds.has(worktree.session.sessionId) && worktree.session.isArchived.get() && (worktree.sizeBytes ?? 0) > 0
			? limiter.queue(async () => {
				updated[index] = await this._measureSessionWorktree(worktree.session, token);
				// Another full scan or refresh may have superseded this snapshot while the request ran.
				if (this._lastMeasuredWorktrees === published) {
					published = [...updated];
					this._lastMeasuredWorktrees = published;
					onUpdate?.(this._filterWorktrees(this._withCleanupState(published, minimumAgeDays)));
				}
				return updated[index];
			})
			: worktree));
		return this._filterWorktrees(this._withCleanupState(this._lastMeasuredWorktrees ?? updated, minimumAgeDays));
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
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const measuredSessionSignature = this._getWorktreeSessionSignature();
		const measuredWorktreeSignature = this._getWorktreeSessionSignature(false);
		if (this._lastMeasuredWorktrees && this._lastMeasuredSessionSignature === measuredSessionSignature && Date.now() - this._lastMeasurementAt < SCAN_CACHE_DURATION_MS) {
			return this._withCleanupState(this._lastMeasuredWorktrees, minimumAgeDays);
		}

		let measurement = this._measurement;
		if (!measurement || measurement.cancellation.token.isCancellationRequested || measurement.sessionSignature !== measuredSessionSignature) {
			let latestProgress: IWorktreeMeasurementProgress | undefined;
			const progressListeners = new Set<(progress: IWorktreeMeasurementProgress) => void>();
			const cancellation = new CancellationTokenSource(this._measurementCancellation.token);
			measurement = {
				sessionSignature: measuredSessionSignature,
				cancellation,
				consumers: 0,
				promise: this._measureWorktrees(cancellation.token, progress => {
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
					cancellation.dispose();
					if (this._measurement === measurement) {
						this._measurement = undefined;
					}
				},
				() => {
					cancellation.dispose();
					if (this._measurement === measurement) {
						this._measurement = undefined;
					}
				},
			);
		}

		measurement.consumers++;
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
			if (--measurement.consumers === 0 && token.isCancellationRequested) {
				measurement.cancellation.cancel();
			}
		}
		if (this._getWorktreeSessionSignature(false) !== measuredWorktreeSignature) {
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

	private _getWorktreeSessionSignature(includeActivity = true): string {
		return this.sessionsManagementService.getSessions()
			.flatMap(session => session.workspace.get()?.folders
				.map(folder => folder.gitRepository?.workTreeUri)
				.filter(worktreeUri => worktreeUri !== undefined)
				.map(worktreeUri => includeActivity
					? `${session.sessionId}\0${worktreeUri.toString()}\0${session.updatedAt.get().getTime()}\0${session.status.get()}`
					: `${session.sessionId}\0${worktreeUri.toString()}`) ?? [])
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

	private _createSuggestion(options: { readonly description: string; readonly includeRecent?: boolean }): ISessionWorktreeCleanupSuggestion {
		return {
			description: options.description,
			manage: async () => {
				this.suppressForWindow();
				if (options.includeRecent) {
					await this.commandService.executeCommand(MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID, 'all');
				} else {
					await this.commandService.executeCommand(MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID);
				}
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

	async getWorktrees(minimumAgeDays: number, onUpdate?: (worktrees: readonly ISessionWorktree[], progress?: ISessionWorktreeMeasurementProgress) => void, token = CancellationToken.None, forceRefresh = false): Promise<readonly ISessionWorktree[]> {
		if (forceRefresh) {
			this._lastMeasurementAt = -Infinity;
		}
		if (onUpdate) {
			const worktrees = await this._getMeasuredWorktrees(minimumAgeDays, token, progress => {
				onUpdate(this._filterWorktrees(this._withCleanupState(progress.worktrees, minimumAgeDays)), {
					scannedWorktrees: progress.scannedWorktrees,
					totalWorktrees: progress.totalWorktrees,
				});
			});
			const totalWorktrees = worktrees.reduce((total, worktree) => total + worktree.worktreeCount, 0);
			onUpdate(this._filterWorktrees(worktrees), { scannedWorktrees: totalWorktrees, totalWorktrees });
			return this._filterWorktrees(worktrees);
		}
		const measuredSessionSignature = this._getWorktreeSessionSignature();
		if (this._lastMeasuredWorktrees
			&& this._lastMeasuredSessionSignature === measuredSessionSignature
			&& Date.now() - this._lastMeasurementAt < SCAN_CACHE_DURATION_MS
		) {
			return this._getWorktrees(minimumAgeDays);
		}

		if (!this._foregroundMeasurement) {
			const cancellation = new CancellationTokenSource();
			const foregroundMeasurement = this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('worktreeCleanup.measuringProgress', "Measuring agent session worktrees..."),
				delay: 300,
				cancellable: true,
			}, async progress => {
				await this._getMeasuredWorktrees(minimumAgeDays, cancellation.token, measurementProgress => {
					progress.report({
						message: localize('worktreeCleanup.measuringProgressCount', "Scanned {0} of {1} worktrees", measurementProgress.scannedWorktrees, measurementProgress.totalWorktrees),
					});
				});
			}, () => cancellation.cancel()).finally(() => cancellation.dispose());
			this._foregroundMeasurement = foregroundMeasurement;
			foregroundMeasurement.then(
				() => {
					if (this._foregroundMeasurement === foregroundMeasurement) {
						this._foregroundMeasurement = undefined;
					}
				},
				() => {
					if (this._foregroundMeasurement === foregroundMeasurement) {
						this._foregroundMeasurement = undefined;
					}
				},
			);
		}
		await this._foregroundMeasurement;
		return this._getWorktrees(minimumAgeDays);
	}

	/**
	 * Keep failed measurements and archived worktrees visible: archiving schedules removal but does
	 * not guarantee it succeeds. A successfully measured empty archived worktree needs no attention.
	 */
	private async _getWorktrees(minimumAgeDays: number, token = CancellationToken.None, onProgress?: (progress: IWorktreeMeasurementProgress) => void): Promise<readonly ISessionWorktree[]> {
		return this._filterWorktrees(await this._getMeasuredWorktrees(minimumAgeDays, token, onProgress));
	}

	private _filterWorktrees(worktrees: readonly ISessionWorktree[]): readonly ISessionWorktree[] {
		return worktrees.filter(worktree => worktree.isMeasuring || worktree.measurementFailed || !worktree.session.isArchived.get() || (worktree.sizeBytes !== undefined && worktree.sizeBytes > 0));
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
				if (candidate.session.isArchived.get()) {
					const result = await this.sessionsManagementService.sessionWorktreeCleanup?.(candidate.session, true);
					if (!result) {
						throw new Error(localize('worktreeCleanup.retryUnavailable', "Retrying worktree cleanup is unavailable for this session."));
					}
					this._lastMeasuredWorktrees = this._lastMeasuredWorktrees?.map(worktree => worktree.session.sessionId === candidate.session.sessionId
						? { ...worktree, cleanupStatus: result, cleanupStatusError: undefined }
						: worktree);
				} else {
					await this.sessionsManagementService.archiveSession(candidate.session);
				}
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
		return true;
	}

	private _isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING) === true;
	}
}
