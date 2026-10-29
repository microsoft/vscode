/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { Limiter, raceCancellationError, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { basename, extUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { IAgentHostWorktreeCleanupStatus } from '../../../../platform/agentHost/common/agentHostWorktreeCleanup.js';
import { AGENT_BRANCH_PREFIX } from '../../../../platform/agentHost/common/worktreePaths.js';
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
import { IManagedSessionWorktree, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export const CLEANUP_THRESHOLD_BYTES = 5 * ByteSize.GB;
export const LOW_DISK_SPACE_BYTES = 5 * ByteSize.GB;
export const CLEANUP_THRESHOLD_WORKTREES = 20;
const DEFAULT_MINIMUM_SESSION_AGE_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCAN_CACHE_DURATION_MS = 60 * 60 * 1000;

export const AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING = 'chat.agentSessions.sessionStorageCleanupSuggestion.enabled';
export const LEGACY_AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING = 'sessions.chat.experimental.worktreeLimitPrompt';
export const MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID = 'sessions.chat.manageAgentSessionWorktrees';

type WorktreeCleanupOwner =
	| { readonly session: ISession; readonly unlinkedWorktree?: undefined }
	| { readonly session?: undefined; readonly unlinkedWorktree: IManagedSessionWorktree };

export type ISessionWorktreeCleanupCandidate = WorktreeCleanupOwner & {
	readonly sizeBytes: number | undefined;
	readonly worktreeCount: number;
	/** False for retained verification records absent from the current host inventory. */
	readonly isListedByHost?: boolean;
};

export function isWorktreeCleanupBranchSupported(owner: WorktreeCleanupOwner): boolean {
	if (owner.unlinkedWorktree) {
		return owner.unlinkedWorktree.branch.startsWith(AGENT_BRANCH_PREFIX);
	}
	return owner.session.workspace.get()?.folders.every(folder => !folder.gitRepository?.workTreeUri
		|| folder.gitRepository.branchName === undefined || folder.gitRepository.branchName.startsWith(AGENT_BRANCH_PREFIX)) !== false;
}

export function getWorktreeCleanupId(worktree: ISessionWorktreeCleanupCandidate): string {
	return worktree.session ? worktree.session.sessionId : `managed:${worktree.unlinkedWorktree.providerId}:${worktree.unlinkedWorktree.worktree}`;
}

export function getWorktreeCleanupTitle(worktree: ISessionWorktreeCleanupCandidate): string {
	return worktree.session?.title.get() || (worktree.unlinkedWorktree ? worktree.unlinkedWorktree.branch || basename(URI.parse(worktree.unlinkedWorktree.worktree)) : localize('sessionWorktreeCleanup.untitled', "Untitled session"));
}

/** Returns a total only when every selected worktree has a displayed disk usage estimate. */
export function getWorktreeCleanupDiskUsage(worktrees: readonly ISessionWorktreeCleanupCandidate[]): number | undefined {
	let total = 0;
	for (const worktree of worktrees) {
		if (worktree.session?.isArchived.get() || worktree.sizeBytes === undefined) {
			return undefined;
		}
		total += worktree.sizeBytes;
	}
	return total;
}

export type SessionWorktreeCleanupProgress =
	| { readonly state: 'started' }
	| { readonly state: 'scheduled'; readonly candidate: ISessionWorktreeCleanupCandidate }
	| { readonly state: 'failed'; readonly candidate: ISessionWorktreeCleanupCandidate; readonly message: string };

export interface ISessionWorktreeCleanupSuggestion {
	readonly description: string;
	manage(): Promise<void>;
	disable(): Promise<void>;
	dismiss(): void;
}

export type SessionWorktreeCleanupState = 'eligible' | 'active' | 'running' | 'needsInput' | 'pinned' | 'recent' | 'archived' | 'untitled' | 'error' | 'unavailable' | 'unlinked';

export type ISessionWorktree = ISessionWorktreeCleanupCandidate & {
	readonly isMeasuring?: boolean;
	readonly measurementFailed?: boolean;
	readonly cleanupState: SessionWorktreeCleanupState;
	readonly cleanupStatus?: IAgentHostWorktreeCleanupStatus;
	readonly cleanupStatusError?: string;
	readonly worktreeExists?: boolean;
	readonly worktreeCheckError?: string;
};

type IMeasuredSessionWorktree = Omit<ISessionWorktree, 'cleanupState'> & { readonly session: ISession; readonly unlinkedWorktree?: undefined };

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
	cleanupWorktrees(candidates: readonly ISessionWorktreeCleanupCandidate[], onProgress?: (progress: SessionWorktreeCleanupProgress) => void): Promise<boolean>;
	canForceCleanup(worktree: ISessionWorktree): boolean;
	forceCleanupWorktrees(worktrees: readonly ISessionWorktree[], onProgress?: (progress: SessionWorktreeCleanupProgress) => void): Promise<boolean>;
}

export class SessionWorktreeCleanupService extends Disposable implements ISessionWorktreeCleanupService {
	declare readonly _serviceBrand: undefined;

	private readonly _measurementCancellation = this._register(new CancellationTokenSource());
	private _lastScanAt = -Infinity;
	private _lastMeasurementAt = 0;
	private _lastMeasuredWorktrees: readonly IMeasuredSessionWorktree[] | undefined;
	private _unlinkedWorktrees: readonly ISessionWorktree[] = [];
	private readonly _requestedManagedCleanups = new Set<string>();
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
				? localize('worktreeCleanup.nudge.diskUsageOne', "1 agent session worktree has been inactive for at least 15 days and can be cleaned up. Estimated disk usage: {0}.", ByteSize.formatSize(totalBytes))
				: localize('worktreeCleanup.nudge.diskUsageMany', "{0} agent session worktrees have been inactive for at least 15 days and can be cleaned up. Estimated disk usage: {1}.", totalWorktrees, ByteSize.formatSize(totalBytes));
			this._suggestion.set(this._createSuggestion({ description }), undefined);
		} else {
			this._suggestion.set(undefined, undefined);
		}
	}

	private async _measureWorktrees(token: CancellationToken, onProgress: (progress: IWorktreeMeasurementProgress) => void): Promise<readonly IMeasuredSessionWorktree[]> {
		const worktreeSessions = this.sessionsManagementService.getSessions().filter(session =>
			session.workspace.get()?.folders.some(folder => folder.gitRepository?.workTreeUri) === true
			&& isWorktreeCleanupBranchSupported({ session })
		);
		const totalWorktrees = worktreeSessions.reduce((total, session) => total + (session.isArchived.get() ? 0 : this._countWorktrees(session)), 0);
		let scannedWorktrees = 0;
		const measured: (IMeasuredSessionWorktree | undefined)[] = worktreeSessions.map(session => session.isArchived.get() ? undefined : { session, sizeBytes: undefined, worktreeCount: this._countWorktrees(session), isMeasuring: true });
		onProgress({ scannedWorktrees, totalWorktrees, worktrees: coalesce(measured) });

		if (worktreeSessions.length === 0) {
			return [];
		}

		const limiter = new Limiter<IMeasuredSessionWorktree>(2);
		return Promise.all(worktreeSessions.map((session, index) => limiter.queue(async () => {
			const worktreeCount = measured[index]?.isMeasuring ? this._countWorktrees(session) : 0;
			const worktree = await this._measureSessionWorktree(session, token);
			measured[index] = worktree;
			scannedWorktrees += worktreeCount;
			onProgress({ scannedWorktrees, totalWorktrees, worktrees: coalesce(measured) });
			return worktree;
		})));
	}

	private async _measureSessionWorktree(session: ISession, token: CancellationToken): Promise<IMeasuredSessionWorktree> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		let sizeBytes: number | undefined;
		let measurementFailed = false;
		if (!session.isArchived.get()) {
			try {
				sizeBytes = await this.sessionsManagementService.getSessionWorktreeDiskUsage?.(session, token);
				measurementFailed = sizeBytes === undefined;
			} catch (error) {
				if (token.isCancellationRequested) {
					throw error;
				}
				measurementFailed = true;
				this.logService.warn(`[SessionWorktreeCleanupService] Failed to measure worktree for session ${session.sessionId}`, error);
			}
		}
		let cleanupStatus: IAgentHostWorktreeCleanupStatus | undefined;
		let cleanupStatusError: string | undefined;
		let worktreeExists: boolean | undefined;
		let worktreeCheckError: string | undefined;
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
			try {
				worktreeExists = await this.sessionsManagementService.sessionWorktreeExists?.(session, token);
			} catch (error) {
				if (token.isCancellationRequested) {
					throw error;
				}
				worktreeCheckError = getErrorMessage(error);
				this.logService.warn(`[SessionWorktreeCleanupService] Failed to check worktree existence for session ${session.sessionId}`, error);
			}
		}
		return { session, sizeBytes: session.isArchived.get() ? undefined : sizeBytes, worktreeCount: this._countWorktrees(session), isMeasuring: false, measurementFailed: !session.isArchived.get() && measurementFailed, cleanupStatus, cleanupStatusError, worktreeExists, worktreeCheckError };
	}

	async refreshPendingCleanup(sessionIds: readonly string[], minimumAgeDays: number, onUpdate?: (worktrees: readonly ISessionWorktree[]) => void, token = CancellationToken.None): Promise<readonly ISessionWorktree[]> {
		if (sessionIds.some(id => this._unlinkedWorktrees.some(worktree => getWorktreeCleanupId(worktree) === id))) {
			await this._refreshManagedWorktrees(token);
		}
		const cached = this._lastMeasuredWorktrees;
		if (!cached) {
			return this._getWorktrees(minimumAgeDays, token);
		}
		const limiter = new Limiter<IMeasuredSessionWorktree>(2);
		const pendingIds = new Set(sessionIds);
		const updated = [...cached];
		let published = cached;
		await Promise.all(cached.map((worktree, index) => pendingIds.has(worktree.session.sessionId) && worktree.session.isArchived.get()
			? limiter.queue(async () => {
				updated[index] = await this._measureSessionWorktree(worktree.session, token);
				// Another full scan or refresh may have superseded this snapshot while the request ran.
				if (this._lastMeasuredWorktrees === published) {
					published = [...updated];
					this._lastMeasuredWorktrees = published;
					onUpdate?.(this._withUnlinkedWorktrees(this._withCleanupState(published, minimumAgeDays)));
				}
				return updated[index];
			})
			: worktree));
		return this._withUnlinkedWorktrees(this._withCleanupState(this._lastMeasuredWorktrees ?? updated, minimumAgeDays));
	}

	private async _refreshManagedWorktrees(token: CancellationToken): Promise<void> {
		if (!this.sessionsManagementService.listManagedWorktrees) {
			return;
		}
		const inventory = await raceCancellationError(this.sessionsManagementService.listManagedWorktrees(this._unlinkedWorktrees.flatMap(worktree => worktree.unlinkedWorktree ?? [])), token);
		const linkedPaths = new Set(this.sessionsManagementService.getSessions().flatMap(session =>
			session.workspace.get()?.folders.flatMap(folder => folder.gitRepository?.workTreeUri
				? [`${session.providerId}:${extUri.getComparisonKey(folder.gitRepository.workTreeUri)}`] : []) ?? []));
		const seen = new Set<string>();
		const unlinked: ISessionWorktree[] = [];
		for (const worktree of inventory) {
			const path = `${worktree.providerId}:${extUri.getComparisonKey(URI.parse(worktree.worktree))}`;
			if (seen.has(path)) {
				continue;
			}
			seen.add(path);
			if (linkedPaths.has(path) || !isWorktreeCleanupBranchSupported({ unlinkedWorktree: worktree })) {
				continue;
			}
			unlinked.push({ unlinkedWorktree: worktree, sizeBytes: undefined, worktreeCount: 1, cleanupState: 'unlinked', cleanupStatus: worktree.cleanupStatus, worktreeExists: true, isListedByHost: true });
		}
		for (const previous of this._unlinkedWorktrees) {
			if (previous.unlinkedWorktree && isWorktreeCleanupBranchSupported(previous) && this._requestedManagedCleanups.has(getWorktreeCleanupId(previous))
				&& !seen.has(`${previous.unlinkedWorktree.providerId}:${extUri.getComparisonKey(URI.parse(previous.unlinkedWorktree.worktree))}`)
				&& !linkedPaths.has(`${previous.unlinkedWorktree.providerId}:${extUri.getComparisonKey(URI.parse(previous.unlinkedWorktree.worktree))}`)) {
				let worktreeExists: boolean | undefined;
				let worktreeCheckError: string | undefined;
				try {
					worktreeExists = await raceCancellationError(this.sessionsManagementService.managedWorktreeExists?.(previous.unlinkedWorktree) ?? Promise.resolve(undefined), token);
				} catch (error) {
					if (token.isCancellationRequested || isCancellationError(error)) {
						throw error;
					}
					worktreeCheckError = getErrorMessage(error);
					this.logService.warn('[SessionWorktreeCleanupService] Failed to verify managed worktree existence', error);
				}
				unlinked.push({
					...previous,
					isListedByHost: false,
					sizeBytes: worktreeExists === false ? 0 : undefined,
					worktreeExists,
					cleanupStatus: undefined,
					worktreeCheckError,
					cleanupStatusError: worktreeExists === false || worktreeCheckError ? undefined : localize('worktreeCleanup.inventoryUnavailable', "This worktree is no longer listed by its host. Refresh after reconnecting to verify cleanup."),
				});
				if (worktreeExists !== undefined) {
					this._requestedManagedCleanups.delete(getWorktreeCleanupId(previous));
				}
			}
		}
		this._unlinkedWorktrees = unlinked;
		const retainedIds = new Set(unlinked.map(getWorktreeCleanupId));
		for (const id of this._requestedManagedCleanups) {
			if (!retainedIds.has(id)) {
				this._requestedManagedCleanups.delete(id);
			}
		}
	}

	private _withUnlinkedWorktrees(worktrees: readonly ISessionWorktree[]): readonly ISessionWorktree[] {
		return [...worktrees, ...this._unlinkedWorktrees].filter(isWorktreeCleanupBranchSupported);
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
			await this.refreshPendingCleanup(this._lastMeasuredWorktrees.filter(worktree => worktree.session.isArchived.get()).map(worktree => worktree.session.sessionId), minimumAgeDays, undefined, token);
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
		return worktrees.filter(isWorktreeCleanupBranchSupported).map(worktree => ({
			...worktree,
			...(worktree.session.isArchived.get() ? { sizeBytes: worktree.worktreeExists === false ? 0 : undefined, isMeasuring: false, measurementFailed: false } : { worktreeExists: undefined, worktreeCheckError: undefined }),
			cleanupState: this._getCleanupState(worktree.session, worktree.sizeBytes, activeSessionId, cutoff),
		}));
	}

	private _getWorktreeSessionSignature(includeActivity = true): string {
		return this.sessionsManagementService.getSessions()
			.flatMap(session => session.workspace.get()?.folders
				.map(folder => folder.gitRepository?.workTreeUri)
				.filter(worktreeUri => worktreeUri !== undefined)
				.map(worktreeUri => includeActivity
					? `${session.sessionId}\0${worktreeUri.toString()}\0${session.updatedAt.get().getTime()}\0${session.status.get()}\0${session.isArchived.get()}`
					: `${session.sessionId}\0${worktreeUri.toString()}`) ?? [])
			.sort()
			.join('\n');
	}

	private _getCleanupState(session: ISession, sizeBytes: number | undefined, activeSessionId: string | undefined, cutoff: number): SessionWorktreeCleanupState {
		if (session.isArchived.get()) {
			return 'archived';
		}
		if (sizeBytes === undefined) {
			return 'unavailable';
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

	private _getCleanupCandidates(worktrees: readonly ISessionWorktree[]): readonly (ISessionWorktreeCleanupCandidate & { readonly sizeBytes: number })[] {
		return worktrees
			.filter((worktree): worktree is ISessionWorktree & { readonly session: ISession; readonly sizeBytes: number } => !!worktree.session && worktree.cleanupState === 'eligible' && worktree.sizeBytes !== undefined)
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
		let latestWorktrees: readonly ISessionWorktree[] = this._withCleanupState(this._lastMeasuredWorktrees ?? [], minimumAgeDays);
		let latestProgress: ISessionWorktreeMeasurementProgress | undefined;
		const inventory = this.sessionsManagementService.listManagedWorktrees
			? this._refreshManagedWorktrees(token).then(() => onUpdate?.(this._withUnlinkedWorktrees(latestWorktrees), latestProgress))
			: undefined;
		if (forceRefresh) {
			this._lastMeasurementAt = -Infinity;
		}
		if (onUpdate) {
			const [worktrees] = await Promise.all([this._getMeasuredWorktrees(minimumAgeDays, token, progress => {
				latestWorktrees = this._withCleanupState(progress.worktrees, minimumAgeDays);
				latestProgress = {
					scannedWorktrees: progress.scannedWorktrees,
					totalWorktrees: progress.totalWorktrees,
				};
				onUpdate(this._withUnlinkedWorktrees(latestWorktrees), latestProgress);
			}), inventory]);
			const totalWorktrees = worktrees.reduce((total, worktree) => total + (worktree.session?.isArchived.get() ? 0 : worktree.worktreeCount), 0);
			const combined = this._withUnlinkedWorktrees(worktrees);
			onUpdate(combined, { scannedWorktrees: totalWorktrees, totalWorktrees });
			return combined;
		}
		const measuredSessionSignature = this._getWorktreeSessionSignature();
		if (this._lastMeasuredWorktrees
			&& this._lastMeasuredSessionSignature === measuredSessionSignature
			&& Date.now() - this._lastMeasurementAt < SCAN_CACHE_DURATION_MS
		) {
			await inventory;
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
		await Promise.all([this._foregroundMeasurement, inventory]);
		return this._getWorktrees(minimumAgeDays);
	}

	private async _getWorktrees(minimumAgeDays: number, token = CancellationToken.None, onProgress?: (progress: IWorktreeMeasurementProgress) => void): Promise<readonly ISessionWorktree[]> {
		return this._withUnlinkedWorktrees(await this._getMeasuredWorktrees(minimumAgeDays, token, onProgress));
	}

	canForceCleanup(worktree: ISessionWorktree): boolean {
		return isWorktreeCleanupBranchSupported(worktree) && worktree.isListedByHost !== false && worktree.worktreeExists === true && !worktree.isMeasuring && !worktree.worktreeCheckError && !worktree.cleanupStatusError
			&& (worktree.cleanupStatus?.state === 'failed' || worktree.cleanupStatus?.state === 'skipped' || worktree.cleanupStatus?.state === 'inUse')
			&& (worktree.unlinkedWorktree !== undefined || worktree.session.isArchived.get())
			&& this.sessionsManagementService.canForceWorktreeCleanup?.(worktree.session ?? worktree.unlinkedWorktree) === true;
	}

	async forceCleanupWorktrees(worktrees: readonly ISessionWorktree[], onProgress?: (progress: SessionWorktreeCleanupProgress) => void): Promise<boolean> {
		if (worktrees.some(worktree => !this.canForceCleanup(worktree))) {
			throw new Error(localize('worktreeCleanup.forceUnavailable', "This worktree cannot be forcibly removed. Refresh its status and check that its host supports forced cleanup."));
		}
		return this.cleanupWorktrees(worktrees, onProgress, true);
	}

	async cleanupWorktrees(selected: readonly ISessionWorktreeCleanupCandidate[], onProgress?: (progress: SessionWorktreeCleanupProgress) => void, force = false): Promise<boolean> {
		if (selected.length === 0) {
			return false;
		}
		if (selected.some(candidate => !isWorktreeCleanupBranchSupported(candidate))) {
			throw new Error(localize('worktreeCleanup.branchUnavailable', "Only worktrees on branches starting with '{0}' can be cleaned up.", AGENT_BRANCH_PREFIX));
		}
		if (selected.some(candidate => candidate.isListedByHost === false)) {
			throw new Error(localize('worktreeCleanup.notListed', "This worktree is no longer listed by its host. Refresh the worktree inventory before cleanup."));
		}

		const selectedBytes = getWorktreeCleanupDiskUsage(selected);
		const worktreeCount = selected.reduce((total, candidate) => total + candidate.worktreeCount, 0);
		const confirmation = await this.dialogService.confirm({
			message: force
				? worktreeCount === 1
					? localize('worktreeCleanup.forceConfirm', "Forcibly remove {0}?", getWorktreeCleanupTitle(selected[0]))
					: localize('worktreeCleanup.forceConfirmMany', "Forcibly remove {0} worktrees?", worktreeCount)
				: worktreeCount === 1
					? localize('worktreeCleanup.confirm.one', "Clean up 1 worktree?")
					: localize('worktreeCleanup.confirm.many', "Clean up {0} worktrees?", worktreeCount),
			detail: force
				? localize('worktreeCleanup.forceDetail', "This permanently deletes the selected worktrees and all uncommitted changes, including ignored and untracked files, without saving them. This cannot be undone. Worktrees will be removed even if another session or chat is using them or their branch changed since they were listed. Those sessions or chats may stop working. Committed changes, branches, and session history are kept.")
				: selected.some(candidate => candidate.unlinkedWorktree)
					? localize('worktreeCleanup.confirm.unlinkedDetail', "Selected sessions will be marked as done. Worktrees with no matching session are removed only if the host verifies they are unused. Uncommitted changes are saved to their branch before removal; branches are kept. Ignored files are deleted. No session history will be created for these worktrees.")
					: selectedBytes === undefined
						? localize('worktreeCleanup.confirm.unmeasuredDetail', "This schedules worktree cleanup and marks the selected sessions as done. Disk usage is not measured for sessions already marked as done. You can restore a session later to recreate its worktree.")
						: localize('worktreeCleanup.confirm.diskUsageDetail', "Estimated disk usage: {0}. Actual freed space may be lower. The selected sessions will be marked as done. You can restore a session later to recreate its worktree.", ByteSize.formatSize(selectedBytes)),
			primaryButton: force ? localize('worktreeCleanup.forcePrimary', "Force Remove") : localize('worktreeCleanup.confirm.primary', "Clean Up"),
		});
		if (!confirmation.confirmed) {
			return false;
		}

		onProgress?.({ state: 'started' });
		const failures: string[] = [];
		let failedWorktrees = 0;
		await this.progressService.withProgress({
			location: ProgressLocation.Notification,
			title: worktreeCount === 1
				? localize('worktreeCleanup.cleaning.one', "Scheduling cleanup for 1 agent session worktree...")
				: localize('worktreeCleanup.cleaning.many', "Scheduling cleanup for {0} agent session worktrees...", worktreeCount),
		}, async progress => {
			let completedWorktrees = 0;
			for (const candidate of selected) {
				try {
					if (force && candidate.session && !candidate.session.isArchived.get()) {
						throw new Error(localize('worktreeCleanup.forceNotArchived', "Only sessions marked as done can have their worktrees forcibly removed."));
					}
					if (candidate.unlinkedWorktree) {
						if (!this.sessionsManagementService.cleanupManagedWorktree) {
							throw new Error(localize('worktreeCleanup.managedUnavailable', "This host does not support cleanup of worktrees without a session."));
						}
						this._requestedManagedCleanups.add(getWorktreeCleanupId(candidate));
						await this.sessionsManagementService.cleanupManagedWorktree(candidate.unlinkedWorktree, force || undefined);
						this._unlinkedWorktrees = this._unlinkedWorktrees.map(worktree => getWorktreeCleanupId(worktree) === getWorktreeCleanupId(candidate)
							? { ...worktree, cleanupStatus: { state: 'pending' } } : worktree);
					} else if (candidate.session.isArchived.get()) {
						const result = await this.sessionsManagementService.sessionWorktreeCleanup?.(candidate.session, true, force || undefined);
						if (!result) {
							throw new Error(localize('worktreeCleanup.retryUnavailable', "Retrying worktree cleanup is unavailable for this session."));
						}
						this._lastMeasuredWorktrees = this._lastMeasuredWorktrees?.map(worktree => worktree.session.sessionId === candidate.session?.sessionId
							? { ...worktree, cleanupStatus: result, cleanupStatusError: undefined }
							: worktree);
					} else {
						await this.sessionsManagementService.archiveSession(candidate.session);
					}
				} catch (error) {
					const message = getErrorMessage(error);
					this.logService.warn('[SessionWorktreeCleanupService] Failed to schedule worktree cleanup', error);
					failures.push(localize('worktreeCleanup.sessionFailure', "{0}: {1}", getWorktreeCleanupTitle(candidate), message));
					failedWorktrees += candidate.worktreeCount;
					onProgress?.({ state: 'failed', candidate, message });
					continue;
				}
				onProgress?.({ state: 'scheduled', candidate });
				completedWorktrees += candidate.worktreeCount;
				progress.report({
					increment: candidate.worktreeCount / worktreeCount * 100,
					message: localize('worktreeCleanup.cleaningProgress', "scheduled {0} of {1} worktrees", completedWorktrees, worktreeCount),
				});
			}
		});
		this._lastScanAt = 0;
		if (failures.length > 0) {
			throw new Error(localize('worktreeCleanup.schedulingFailed', "Couldn't schedule cleanup for {0} worktrees.\n{1}", failedWorktrees, failures.join('\n')));
		}
		if (!onProgress) {
			const message = worktreeCount === 1
				? localize('worktreeCleanup.archived.one', "Started cleanup for 1 worktree.")
				: localize('worktreeCleanup.archived.many', "Started cleanup for {0} worktrees.", worktreeCount);
			status(message);
		}
		return true;
	}

	private _isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING) === true;
	}
}
