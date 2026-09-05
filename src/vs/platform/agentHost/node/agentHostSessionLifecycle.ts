/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey, AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { ActionType } from '../common/state/sessionActions.js';
import { getSessionRelatedPullRequestUrls, isSessionStatusArchived, readSessionGitHubState, SessionStatus, type SessionSummary } from '../common/state/sessionState.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { IAgentHostPullRequestStatusService } from './agentHostPullRequestStatusService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { ILogService } from '../../log/common/log.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export interface IAgentHostSessionLifecycleCandidate {
	readonly session: URI;
	readonly pullRequestUrl: string;
	readonly action: 'archive' | 'delete';
}

export interface IAgentHostSessionLifecycleAccessor {
	readonly listCandidates: (archiveCutoff: number | undefined, deleteCutoff: number | undefined) => Promise<readonly IAgentHostSessionLifecycleCandidate[]>;
	readonly restoreSession: (session: URI) => Promise<void>;
	readonly getAutoArchivedAt: (session: URI) => Promise<number | undefined>;
	readonly setAutoArchivedAt: (session: URI, timestamp: number) => Promise<void>;
	readonly canDeleteSession: (session: URI) => Promise<boolean>;
	readonly deleteSession: (session: URI, validate: () => Promise<boolean>) => Promise<boolean>;
}

export interface IAgentHostSessionLifecycleOptions {
	readonly intervalMs?: number;
	readonly now?: () => number;
	readonly start?: boolean;
}

/**
 * Owns the Agent Host policy for cleaning up inactive sessions whose pull
 * requests have merged. The client only configures the policy and presents
 * opt-in UI; candidate evaluation and cleanup side effects stay authoritative
 * in the host.
 */
export class AgentHostSessionLifecycle extends Disposable {

	private readonly _scheduler: RunOnceScheduler;
	private readonly _intervalMs: number;
	private readonly _now: () => number;
	private _runPromise = Promise.resolve();
	private _disposed = false;
	private _thresholds: { readonly archiveAfterDays: number; readonly deleteAfterDays: number };

	constructor(
		private readonly _accessor: IAgentHostSessionLifecycleAccessor,
		private readonly _configurationService: IAgentConfigurationService,
		private readonly _stateManager: AgentHostStateManager,
		private readonly _pullRequestStatusService: IAgentHostPullRequestStatusService,
		providerService: IAgentHostProviderService,
		private readonly _logService: ILogService,
		options: IAgentHostSessionLifecycleOptions = {},
	) {
		super();
		this._intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
		this._now = options.now ?? Date.now;
		this._thresholds = this._readThresholds();
		this._scheduler = this._register(new RunOnceScheduler(() => this._runScheduled(), this._intervalMs));
		this._register(this._configurationService.onDidRootConfigChange(() => {
			const thresholds = this._readThresholds();
			if (thresholds.archiveAfterDays === this._thresholds.archiveAfterDays
				&& thresholds.deleteAfterDays === this._thresholds.deleteAfterDays) {
				return;
			}
			this._thresholds = thresholds;
			this._schedule(0);
		}));
		this._register(providerService.onDidRegisterProvider(() => this._schedule(0)));
		if (options.start !== false && providerService.getProviders().length > 0) {
			this._schedule(0);
		}
	}

	override dispose(): void {
		this._disposed = true;
		super.dispose();
	}

	private _schedule(delay: number): void {
		if (!this._disposed) {
			this._scheduler.schedule(delay);
		}
	}

	private _runScheduled(): void {
		this._runPromise = this._runPromise
			.then(() => this.run())
			.catch(error => this._logService.warn('[AgentHostSessionLifecycle] Auto-archive pass failed', error))
			.finally(() => {
				if (this._thresholds.archiveAfterDays > 0 || this._thresholds.deleteAfterDays > 0) {
					this._schedule(this._intervalMs);
				}
			});
	}

	async run(): Promise<void> {
		const { archiveAfterDays, deleteAfterDays } = this._thresholds;
		if (archiveAfterDays === 0 && deleteAfterDays === 0) {
			return;
		}

		const archiveCutoff = archiveAfterDays > 0 ? this._now() - archiveAfterDays * DAY_MS : undefined;
		const deleteCutoff = deleteAfterDays > 0 ? this._now() - deleteAfterDays * DAY_MS : undefined;
		const candidates = await this._accessor.listCandidates(archiveCutoff, deleteCutoff);
		for (const candidate of candidates) {
			await this._evaluateCandidate(candidate);
		}
	}

	private _readThresholds(): { readonly archiveAfterDays: number; readonly deleteAfterDays: number } {
		return {
			archiveAfterDays: this._readThreshold(AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey),
			deleteAfterDays: this._readThreshold(AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey),
		};
	}

	private _readThreshold(key: typeof AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey | typeof AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey): number {
		const value = this._configurationService.getRootValue(platformRootSchema, key);
		return value === 1 || value === 7 || value === 15 || value === 30 ? value : 0;
	}

	private async _evaluateCandidate(candidate: IAgentHostSessionLifecycleCandidate): Promise<void> {
		const { session } = candidate;
		const sessionKey = session.toString();
		const pullRequest = await this._pullRequestStatusService.resolveForLifecycle(sessionKey, candidate.pullRequestUrl);
		if (pullRequest?.state !== 'merged'
			|| pullRequest.url.toLowerCase() !== candidate.pullRequestUrl.toLowerCase()) {
			return;
		}

		try {
			await this._accessor.restoreSession(session);
		} catch (error) {
			this._logService.warn(`[AgentHostSessionLifecycle] Failed to restore merged-session cleanup candidate ${session.toString()}`, error);
			return;
		}

		const currentArchiveAfterDays = this._thresholds.archiveAfterDays;
		const currentDeleteAfterDays = this._thresholds.deleteAfterDays;
		const refreshedCandidate = currentArchiveAfterDays > 0 || currentDeleteAfterDays > 0
			? await this._getCleanupCandidate(
				session,
				this._stateManager.getSessionSummary(sessionKey),
				currentArchiveAfterDays > 0 ? this._now() - currentArchiveAfterDays * DAY_MS : undefined,
				currentDeleteAfterDays > 0 ? this._now() - currentDeleteAfterDays * DAY_MS : undefined,
			)
			: undefined;
		if (refreshedCandidate?.action !== candidate.action
			|| refreshedCandidate.pullRequestUrl.toLowerCase() !== pullRequest.url.toLowerCase()) {
			return;
		}

		if (candidate.action === 'archive') {
			const finalArchiveAfterDays = this._thresholds.archiveAfterDays;
			const finalPullRequestUrl = finalArchiveAfterDays > 0
				? this._getArchiveCandidate(
					this._stateManager.getSessionSummary(sessionKey),
					this._now() - finalArchiveAfterDays * DAY_MS,
				)
				: undefined;
			if (finalPullRequestUrl?.toLowerCase() !== pullRequest.url.toLowerCase()) {
				return;
			}
			this._logService.info(`[AgentHostSessionLifecycle] Auto-archiving inactive merged-pull-request session: session=${sessionKey}, pr=${pullRequest.url}`);
			this._stateManager.dispatchServerAction(sessionKey, {
				type: ActionType.SessionIsArchivedChanged,
				isArchived: true,
			});
			await this._accessor.setAutoArchivedAt(session, this._now());
		} else {
			try {
				const deleted = await this._accessor.deleteSession(session, async () => {
					if (!await this._accessor.canDeleteSession(session)) {
						this._logService.info(`[AgentHostSessionLifecycle] Skipping permanent deletion because the archived session still has a worktree: session=${sessionKey}`);
						return false;
					}
					const finalDeleteAfterDays = this._thresholds.deleteAfterDays;
					const finalCandidate = finalDeleteAfterDays > 0
						? await this._getCleanupCandidate(
							session,
							this._stateManager.getSessionSummary(sessionKey),
							undefined,
							this._now() - finalDeleteAfterDays * DAY_MS,
						)
						: undefined;
					return this._thresholds.deleteAfterDays === finalDeleteAfterDays
						&& finalCandidate?.action === 'delete'
						&& finalCandidate.pullRequestUrl.toLowerCase() === pullRequest.url.toLowerCase();
				});
				if (deleted) {
					this._logService.info(`[AgentHostSessionLifecycle] Permanently deleted inactive archived merged-pull-request session: session=${sessionKey}, pr=${pullRequest.url}`);
				}
			} catch (error) {
				this._logService.warn(`[AgentHostSessionLifecycle] Failed to permanently delete merged-session cleanup candidate ${sessionKey}`, error);
			}
		}
	}

	private async _getCleanupCandidate(session: URI, summary: SessionSummary | undefined, archiveCutoff: number | undefined, deleteCutoff: number | undefined): Promise<{ readonly pullRequestUrl: string; readonly action: 'archive' | 'delete' } | undefined> {
		if (!summary
			|| isSessionStatusActive(summary.status)) {
			return undefined;
		}
		const pullRequestUrl = getSessionRelatedPullRequestUrls(readSessionGitHubState(summary._meta))[0];
		if (!pullRequestUrl) {
			return undefined;
		}
		if (!isSessionStatusArchived(summary.status)) {
			const modifiedTime = Date.parse(summary.modifiedAt);
			return archiveCutoff !== undefined && modifiedTime <= archiveCutoff
				? { pullRequestUrl, action: 'archive' }
				: undefined;
		}
		if (deleteCutoff === undefined) {
			return undefined;
		}
		const autoArchivedAt = await this._accessor.getAutoArchivedAt(session);
		return autoArchivedAt !== undefined && autoArchivedAt <= deleteCutoff
			? { pullRequestUrl, action: 'delete' }
			: undefined;
	}

	private _getArchiveCandidate(summary: SessionSummary | undefined, archiveCutoff: number): string | undefined {
		const modifiedTime = summary ? Date.parse(summary.modifiedAt) : Number.NaN;
		if (!summary
			|| isSessionStatusArchived(summary.status)
			|| isSessionStatusActive(summary.status)
			|| !Number.isFinite(modifiedTime)
			|| modifiedTime > archiveCutoff) {
			return undefined;
		}
		return getSessionRelatedPullRequestUrls(readSessionGitHubState(summary._meta))[0];
	}
}

function isSessionStatusActive(status: SessionStatus | undefined): boolean {
	return status !== undefined && (status & SessionStatus.InProgress) !== 0;
}
