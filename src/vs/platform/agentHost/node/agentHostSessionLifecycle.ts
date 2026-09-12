/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey, AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
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
	readonly pullRequestUrls: readonly string[];
	readonly action: 'archive' | 'delete';
}

export interface IAgentHostSessionLifecycleAccessor {
	readonly listCandidates: (archiveCutoff: number | undefined, deleteCutoff: number | undefined) => Promise<readonly IAgentHostSessionLifecycleCandidate[]>;
	readonly restoreSession: (session: URI) => Promise<void>;
	readonly getAutoArchivedAt: (session: URI) => Promise<number | undefined>;
	readonly setAutoArchivedAt: (session: URI, timestamp: number) => Promise<void>;
	readonly archiveSession: (session: URI) => void;
	readonly canDeleteSession: (session: URI) => Promise<boolean>;
	readonly cleanupWorktree: (session: URI, sessionId: string) => Promise<void>;
	readonly deleteSession: (session: URI, validate: () => Promise<boolean>, canCommit: () => boolean) => Promise<boolean>;
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
	private _settings: { readonly archiveAfterDays: number; readonly deleteAfterDays: number };

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
		this._settings = this._readSettings();
		this._scheduler = this._register(new RunOnceScheduler(() => this._runScheduled(), this._intervalMs));
		this._register(this._configurationService.onDidRootConfigChange(() => {
			const settings = this._readSettings();
			if (settings.archiveAfterDays === this._settings.archiveAfterDays
				&& settings.deleteAfterDays === this._settings.deleteAfterDays) {
				return;
			}
			this._settings = settings;
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
				if (this._settings.archiveAfterDays > 0 || this._settings.deleteAfterDays > 0) {
					this._schedule(this._intervalMs);
				}
			});
	}

	async run(): Promise<void> {
		const { archiveAfterDays, deleteAfterDays } = this._settings;
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

	private _readSettings(): { readonly archiveAfterDays: number; readonly deleteAfterDays: number } {
		const archiveAfterDays = this._readThreshold(AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey);
		const deleteAfterDays = this._readThreshold(AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey);
		return { archiveAfterDays, deleteAfterDays };
	}

	private _readThreshold(key: typeof AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey | typeof AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey): number {
		const value = this._configurationService.getRootValue(platformRootSchema, key);
		return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
	}

	private async _evaluateCandidate(candidate: IAgentHostSessionLifecycleCandidate): Promise<void> {
		const { session } = candidate;
		const sessionKey = session.toString();
		if (!await this._arePullRequestsComplete(sessionKey, candidate.pullRequestUrls)) {
			return;
		}

		try {
			await this._accessor.restoreSession(session);
		} catch (error) {
			this._logService.warn(`[AgentHostSessionLifecycle] Failed to restore merged-session cleanup candidate ${session.toString()}`, error);
			return;
		}

		const currentArchiveAfterDays = this._settings.archiveAfterDays;
		const currentDeleteAfterDays = this._settings.deleteAfterDays;
		const refreshedCandidate = currentArchiveAfterDays > 0 || currentDeleteAfterDays > 0
			? await this._getCleanupCandidate(
				session,
				this._stateManager.getSessionSummary(sessionKey),
				currentArchiveAfterDays > 0 ? this._now() - currentArchiveAfterDays * DAY_MS : undefined,
				currentDeleteAfterDays > 0 ? this._now() - currentDeleteAfterDays * DAY_MS : undefined,
			)
			: undefined;
		if (refreshedCandidate?.action !== candidate.action
			|| !samePullRequestUrls(refreshedCandidate.pullRequestUrls, candidate.pullRequestUrls)) {
			return;
		}

		if (candidate.action === 'archive') {
			if (!await this._arePullRequestsComplete(sessionKey, candidate.pullRequestUrls)) {
				return;
			}
			const finalArchiveAfterDays = this._settings.archiveAfterDays;
			const finalPullRequestUrls = finalArchiveAfterDays > 0
				? this._getArchiveCandidate(
					this._stateManager.getSessionSummary(sessionKey),
					this._now() - finalArchiveAfterDays * DAY_MS,
				)
				: undefined;
			if (!samePullRequestUrls(finalPullRequestUrls, candidate.pullRequestUrls)) {
				return;
			}
			this._logService.info(`[AgentHostSessionLifecycle] Auto-archiving inactive merged-pull-request session: session=${sessionKey}, prs=${candidate.pullRequestUrls.join(',')}`);
			this._accessor.archiveSession(session);
			await this._accessor.setAutoArchivedAt(session, this._now());
		} else {
			try {
				let validatedDeleteAfterDays: number | undefined;
				const deleted = await this._accessor.deleteSession(session, async () => {
					if (!await this._arePullRequestsComplete(sessionKey, candidate.pullRequestUrls)) {
						return false;
					}
					if (!await this._accessor.canDeleteSession(session)) {
						await this._accessor.cleanupWorktree(session, sessionKey);
						if (!await this._accessor.canDeleteSession(session)) {
							this._logService.info(`[AgentHostSessionLifecycle] Skipping permanent deletion because the archived session still has a worktree: session=${sessionKey}`);
							return false;
						}
					}
					const finalDeleteAfterDays = this._settings.deleteAfterDays;
					const finalCandidate = finalDeleteAfterDays > 0
						? await this._getCleanupCandidate(
							session,
							this._stateManager.getSessionSummary(sessionKey),
							undefined,
							this._now() - finalDeleteAfterDays * DAY_MS,
						)
						: undefined;
					if (this._settings.deleteAfterDays !== finalDeleteAfterDays
						|| finalCandidate?.action !== 'delete'
						|| !samePullRequestUrls(finalCandidate.pullRequestUrls, candidate.pullRequestUrls)
						|| !await this._arePullRequestsComplete(sessionKey, candidate.pullRequestUrls)) {
						return false;
					}
					validatedDeleteAfterDays = finalDeleteAfterDays;
					return true;
				}, () => {
					const latestSummary = this._stateManager.getSessionSummary(sessionKey);
					return this._settings.deleteAfterDays === validatedDeleteAfterDays
						&& latestSummary !== undefined
						&& isSessionStatusArchived(latestSummary.status)
						&& !isSessionStatusActive(latestSummary.status)
						&& samePullRequestUrls(
							getSessionRelatedPullRequestUrls(readSessionGitHubState(latestSummary._meta)),
							candidate.pullRequestUrls,
						);
				});
				if (deleted) {
					this._logService.info(`[AgentHostSessionLifecycle] Permanently deleted inactive archived merged-pull-request session: session=${sessionKey}, prs=${candidate.pullRequestUrls.join(',')}`);
				}
			} catch (error) {
				this._logService.warn(`[AgentHostSessionLifecycle] Failed to permanently delete merged-session cleanup candidate ${sessionKey}`, error);
			}
		}
	}

	private async _arePullRequestsComplete(sessionKey: string, pullRequestUrls: readonly string[]): Promise<boolean> {
		let hasMergedPullRequest = false;
		for (const pullRequestUrl of pullRequestUrls) {
			const pullRequest = await this._pullRequestStatusService.resolveForLifecycle(sessionKey, pullRequestUrl);
			if (!pullRequest
				|| pullRequest.url.toLowerCase() !== pullRequestUrl.toLowerCase()
				|| pullRequest.state === 'open') {
				return false;
			}
			hasMergedPullRequest ||= pullRequest.state === 'merged';
		}
		return hasMergedPullRequest;
	}

	private async _getCleanupCandidate(session: URI, summary: SessionSummary | undefined, archiveCutoff: number | undefined, deleteCutoff: number | undefined): Promise<IAgentHostSessionLifecycleCandidate | undefined> {
		if (!summary
			|| isSessionStatusActive(summary.status)) {
			return undefined;
		}
		const pullRequestUrls = getSessionRelatedPullRequestUrls(readSessionGitHubState(summary._meta));
		if (pullRequestUrls.length === 0) {
			return undefined;
		}
		if (!isSessionStatusArchived(summary.status)) {
			const modifiedTime = Date.parse(summary.modifiedAt);
			if (archiveCutoff !== undefined && modifiedTime <= archiveCutoff) {
				return { session, pullRequestUrls, action: 'archive' };
			}
			return undefined;
		}
		if (deleteCutoff === undefined) {
			return undefined;
		}
		const autoArchivedAt = await this._accessor.getAutoArchivedAt(session);
		return autoArchivedAt !== undefined && autoArchivedAt <= deleteCutoff
			? { session, pullRequestUrls, action: 'delete' }
			: undefined;
	}

	private _getArchiveCandidate(summary: SessionSummary | undefined, archiveCutoff: number): readonly string[] | undefined {
		const modifiedTime = summary ? Date.parse(summary.modifiedAt) : Number.NaN;
		if (!summary
			|| isSessionStatusArchived(summary.status)
			|| isSessionStatusActive(summary.status)
			|| !Number.isFinite(modifiedTime)
			|| modifiedTime > archiveCutoff) {
			return undefined;
		}
		return getSessionRelatedPullRequestUrls(readSessionGitHubState(summary._meta));
	}
}

function isSessionStatusActive(status: SessionStatus | undefined): boolean {
	return status !== undefined && (status & SessionStatus.InProgress) !== 0;
}

function samePullRequestUrls(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
	if (!a || !b || a.length !== b.length) {
		return false;
	}
	const normalizedA = new Set(a.map(url => url.toLowerCase()));
	return normalizedA.size === b.length && b.every(url => normalizedA.has(url.toLowerCase()));
}
