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
}

export interface IAgentHostSessionLifecycleOptions {
	readonly intervalMs?: number;
	readonly now?: () => number;
	readonly start?: boolean;
}

/**
 * Owns the Agent Host policy for archiving inactive sessions whose pull
 * requests have merged. The client only configures the policy and presents
 * opt-in UI; candidate evaluation and archive side effects stay authoritative
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

		const cutoff = this._now() - archiveAfterDays * DAY_MS;
		const sessions = await this._accessor.listSessions();
		for (const session of sessions) {
			if (!this._isCandidate(session, cutoff)) {
				continue;
			}
			await this._evaluateCandidate(session.session, cutoff);
		}
	}

	private _getArchiveAfterDays(): number {
		const value = this._configurationService.getRootValue(platformRootSchema, AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey);
		return value === 1 || value === 7 || value === 15 || value === 30 ? value : 0;
	}

	private _isCandidate(session: IAgentSessionMetadata, cutoff: number): boolean {
		if (readSessionExternal(session._meta)
			|| isSessionStatusArchived(session.status)
			|| isSessionStatusActive(session.status)
			|| !Number.isFinite(session.modifiedTime)
			|| session.modifiedTime > cutoff) {
			return false;
		}
		return getSessionRelatedPullRequestUrls(readSessionGitHubState(session._meta)).length > 0;
	}

	private async _evaluateCandidate(session: URI, cutoff: number): Promise<void> {
		try {
			await this._accessor.restoreSession(session);
		} catch (error) {
			this._logService.warn(`[AgentHostSessionLifecycle] Failed to restore auto-archive candidate ${session.toString()}`, error);
			return;
		}

		const sessionKey = session.toString();
		const beforeRefresh = this._stateManager.getSessionSummary(sessionKey);
		const pullRequestUrl = this._eligiblePullRequestUrl(beforeRefresh, cutoff);
		if (!pullRequestUrl) {
			return;
		}

		const pullRequest = await this._pullRequestStatusService.resolveForLifecycle(sessionKey);
		const afterRefresh = this._stateManager.getSessionSummary(sessionKey);
		const currentArchiveAfterDays = this._getArchiveAfterDays();
		const currentCutoff = this._now() - currentArchiveAfterDays * DAY_MS;
		const refreshedPullRequestUrl = currentArchiveAfterDays > 0
			? this._eligiblePullRequestUrl(afterRefresh, currentCutoff)
			: undefined;
		if (pullRequest?.state !== 'merged'
			|| pullRequest.url.toLowerCase() !== pullRequestUrl.toLowerCase()
			|| refreshedPullRequestUrl?.toLowerCase() !== pullRequest.url.toLowerCase()) {
			return;
		}

		this._logService.info(`[AgentHostSessionLifecycle] Auto-archiving inactive merged-pull-request session: session=${sessionKey}, pr=${pullRequest.url}`);
		this._stateManager.dispatchServerAction(sessionKey, {
			type: ActionType.SessionIsArchivedChanged,
			isArchived: true,
		});
	}

	private _eligiblePullRequestUrl(summary: SessionSummary | undefined, cutoff: number): string | undefined {
		const modifiedTime = summary ? Date.parse(summary.modifiedAt) : Number.NaN;
		if (!summary
			|| isSessionStatusArchived(summary.status)
			|| isSessionStatusActive(summary.status)
			|| !Number.isFinite(modifiedTime)
			|| modifiedTime > cutoff) {
			return undefined;
		}
		return getSessionRelatedPullRequestUrls(readSessionGitHubState(summary._meta))[0];
	}
}

function isSessionStatusActive(status: SessionStatus | undefined): boolean {
	return status !== undefined && (status & SessionStatus.InProgress) !== 0;
}
