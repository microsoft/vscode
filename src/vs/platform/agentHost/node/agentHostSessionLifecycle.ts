/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import type { IAgentSessionMetadata } from '../common/agent.js';
import { AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { ActionType } from '../common/state/sessionActions.js';
import { getSessionRelatedPullRequestUrls, isSessionStatusArchived, readSessionExternal, readSessionGitHubState, SessionStatus, type SessionSummary } from '../common/state/sessionState.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { IAgentHostPullRequestStatusService } from './agentHostPullRequestStatusService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { ILogService } from '../../log/common/log.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export interface IAgentHostSessionLifecycleAccessor {
	readonly listSessions: () => Promise<readonly IAgentSessionMetadata[]>;
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
		this._scheduler = this._register(new RunOnceScheduler(() => this._runScheduled(), this._intervalMs));
		this._register(this._configurationService.onDidRootConfigChange(() => this._schedule(0)));
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
				if (this._getArchiveAfterDays() > 0) {
					this._schedule(this._intervalMs);
				}
			});
	}

	async run(): Promise<void> {
		const archiveAfterDays = this._getArchiveAfterDays();
		if (archiveAfterDays === 0) {
			return;
		}

		const archiveCutoff = this._now() - archiveAfterDays * DAY_MS;
		const deleteCutoff = this._now() - archiveAfterDays * 2 * DAY_MS;
		const sessions = await this._accessor.listSessions();
		for (const session of sessions) {
			if (!this._isCandidate(session, archiveCutoff, deleteCutoff)) {
				continue;
			}
			await this._evaluateCandidate(session.session, archiveCutoff, deleteCutoff);
		}
	}

	private _getArchiveAfterDays(): number {
		const value = this._configurationService.getRootValue(platformRootSchema, AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey);
		return value === 1 || value === 7 || value === 15 || value === 30 ? value : 0;
	}

	private _isCandidate(session: IAgentSessionMetadata, archiveCutoff: number, deleteCutoff: number): boolean {
		if (readSessionExternal(session._meta)
			|| isSessionStatusActive(session.status)
			|| !Number.isFinite(session.modifiedTime)
			|| session.modifiedTime > (isSessionStatusArchived(session.status) ? deleteCutoff : archiveCutoff)) {
			return false;
		}
		return getSessionRelatedPullRequestUrls(readSessionGitHubState(session._meta)).length > 0;
	}

	private async _evaluateCandidate(session: URI, archiveCutoff: number, deleteCutoff: number): Promise<void> {
		try {
			await this._accessor.restoreSession(session);
		} catch (error) {
			this._logService.warn(`[AgentHostSessionLifecycle] Failed to restore merged-session cleanup candidate ${session.toString()}`, error);
			return;
		}

		const sessionKey = session.toString();
		const beforeRefresh = this._stateManager.getSessionSummary(sessionKey);
		const candidate = await this._getCleanupCandidate(session, beforeRefresh, archiveCutoff, deleteCutoff);
		if (!candidate) {
			return;
		}

		const pullRequest = await this._pullRequestStatusService.resolveForLifecycle(sessionKey);
		const afterRefresh = this._stateManager.getSessionSummary(sessionKey);
		const currentArchiveAfterDays = this._getArchiveAfterDays();
		const refreshedCandidate = currentArchiveAfterDays > 0
			? await this._getCleanupCandidate(
				session,
				afterRefresh,
				this._now() - currentArchiveAfterDays * DAY_MS,
				this._now() - currentArchiveAfterDays * 2 * DAY_MS,
			)
			: undefined;
		if (pullRequest?.state !== 'merged'
			|| pullRequest.url.toLowerCase() !== candidate.pullRequestUrl.toLowerCase()
			|| refreshedCandidate?.action !== candidate.action
			|| refreshedCandidate.pullRequestUrl.toLowerCase() !== pullRequest.url.toLowerCase()) {
			return;
		}

		if (candidate.action === 'archive') {
			this._logService.info(`[AgentHostSessionLifecycle] Auto-archiving inactive merged-pull-request session: session=${sessionKey}, pr=${pullRequest.url}`);
			await this._accessor.setAutoArchivedAt(session, this._now());
			this._stateManager.dispatchServerAction(sessionKey, {
				type: ActionType.SessionIsArchivedChanged,
				isArchived: true,
			});
		} else {
			try {
				const deleted = await this._accessor.deleteSession(session, async () => {
					if (!await this._accessor.canDeleteSession(session)) {
						this._logService.info(`[AgentHostSessionLifecycle] Skipping permanent deletion because the archived session still has a worktree: session=${sessionKey}`);
						return false;
					}
					const finalArchiveAfterDays = this._getArchiveAfterDays();
					const finalCandidate = finalArchiveAfterDays > 0
						? await this._getCleanupCandidate(
							session,
							this._stateManager.getSessionSummary(sessionKey),
							this._now() - finalArchiveAfterDays * DAY_MS,
							this._now() - finalArchiveAfterDays * 2 * DAY_MS,
						)
						: undefined;
					return this._getArchiveAfterDays() === finalArchiveAfterDays
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

	private async _getCleanupCandidate(session: URI, summary: SessionSummary | undefined, archiveCutoff: number, deleteCutoff: number): Promise<{ readonly pullRequestUrl: string; readonly action: 'archive' | 'delete' } | undefined> {
		const modifiedTime = summary ? Date.parse(summary.modifiedAt) : Number.NaN;
		if (!summary
			|| isSessionStatusActive(summary.status)
			|| !Number.isFinite(modifiedTime)
			|| modifiedTime > (isSessionStatusArchived(summary.status) ? deleteCutoff : archiveCutoff)) {
			return undefined;
		}
		const pullRequestUrl = getSessionRelatedPullRequestUrls(readSessionGitHubState(summary._meta))[0];
		if (!pullRequestUrl) {
			return undefined;
		}
		if (!isSessionStatusArchived(summary.status)) {
			return { pullRequestUrl, action: 'archive' };
		}
		const autoArchivedAt = await this._accessor.getAutoArchivedAt(session);
		return autoArchivedAt !== undefined && autoArchivedAt <= archiveCutoff
			? { pullRequestUrl, action: 'delete' }
			: undefined;
	}
}

function isSessionStatusActive(status: SessionStatus | undefined): boolean {
	return status !== undefined && (status & SessionStatus.InProgress) !== 0;
}
