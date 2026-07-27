/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IReader } from '../../../../base/common/observable.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { GitHubPullRequestState } from '../common/types.js';
import { GitHubService, IGitHubService } from './githubService.js';
import { IPullRequestIconCache, PullRequestIconCache } from './pullRequestIconCache.js';

import './pullRequestActions.js';

const TRACE_PREFIX = '[PR-ICON-TRACE]';

/**
 * Resolved PR identity for a session's poller, or the specific stage at which
 * resolution bailed out. Only the `ok` state keeps a PR model warm/polling; the
 * other kinds are logged so the trace pinpoints *why* a non-active session's PR
 * icon never refreshes (its model was never kept warm).
 */
type PullRequestIdentityState =
	| { readonly kind: 'ok'; readonly owner: string; readonly repo: string; readonly prNumber: number }
	| { readonly kind: 'archived' }
	| { readonly kind: 'no-workspace' }
	| { readonly kind: 'no-git-repository' }
	| { readonly kind: 'no-pull-request' };

export class GitHubPullRequestPollingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.githubPullRequestPolling';

	/** Per-session pollers, keyed by `session.sessionId`. */
	private readonly _sessionTrackers = this._register(new DisposableMap<string>());

	constructor(
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		const activeSessionResourceObs = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			if (!activeSession || !activeSession.resource || activeSession.isArchived.read(reader)) {
				return undefined;
			}

			return activeSession.resource;
		});

		// Pull request model
		this._register(autorun(reader => {
			const activeSessionResource = activeSessionResourceObs.read(reader);
			if (!activeSessionResource) {
				return;
			}

			const model = this._gitHubService.activeSessionPullRequestObs.read(reader);
			model?.refresh();
		}));

		// Pull request CI model
		this._register(autorun(reader => {
			const activeSessionResource = activeSessionResourceObs.read(reader);
			if (!activeSessionResource) {
				return;
			}

			const model = this._gitHubService.activeSessionPullRequestCIObs.read(reader);
			if (!model) {
				return;
			}

			model.refresh();
			reader.store.add(model.startPolling());
		}));

		// Pull request review threads model
		this._register(autorun(reader => {
			const activeSessionResource = activeSessionResourceObs.read(reader);
			if (!activeSessionResource) {
				return;
			}

			const model = this._gitHubService.activeSessionPullRequestReviewThreadsObs.read(reader);
			if (!model) {
				return;
			}

			model.refresh();
			reader.store.add(model.startPolling());
		}));

		this._sessionsManagementService.onDidChangeSessions(this._onDidChangeSessions, this, this._store);
		this._onDidChangeSessions({ added: this._sessionsManagementService.getSessions(), removed: [], changed: [] });
	}

	private _onDidChangeSessions(e: ISessionsChangeEvent): void {
		// Track added and changed sessions. Archived state and async PR-number
		// resolution are handled reactively inside the per-session poller, so we
		// can track unconditionally here (the tracker is a no-op until a PR
		// number actually resolves).
		for (const session of e.added) {
			this._trackSession(session);
		}

		for (const session of e.changed) {
			this._trackSession(session);
		}

		// Removed sessions
		for (const session of e.removed) {
			if (this._sessionTrackers.has(session.sessionId)) {
				this._logService.trace(`${TRACE_PREFIX} [PollingContribution] Session ${session.sessionId} removed; disposing its poller (PR model no longer kept warm)`);
				this._sessionTrackers.deleteAndDispose(session.sessionId);
			}
		}

		// Aggregate visibility: if non-active session icons aren't refreshing, the
		// first thing to check is whether this poller even sees the sessions. A low
		// tracked count here (e.g. 0/1 while the list shows many) means the sessions
		// never reach the poller, so their PR models are never kept warm.
		this._logService.trace(`${TRACE_PREFIX} [PollingContribution] onDidChangeSessions (added ${e.added.length}, changed ${e.changed.length}, removed ${e.removed.length}); now tracking ${this._sessionTrackers.size} session poller(s)`);
	}

	private _trackSession(session: ISession): void {
		if (this._sessionTrackers.has(session.sessionId)) {
			return;
		}

		this._logService.trace(`${TRACE_PREFIX} [PollingContribution] Session ${session.sessionId} now tracked; poller will keep its PR model warm once a PR number resolves`);
		this._sessionTrackers.set(session.sessionId, this._createSessionPoller(session));
	}

	/**
	 * Reactively poll the pull request for a single session.
	 *
	 * Unlike a one-shot snapshot, the returned autorun re-runs when the session's
	 * pull-request identity changes — so polling starts once a provider resolves
	 * the PR number asynchronously (e.g. the agent host), and stops when the
	 * session is archived or the PR goes away. A merged pull request can never
	 * change again, so it stops polling unless it is the active session.
	 */
	private _createSessionPoller(session: ISession): IDisposable {
		// PR identity (owner/repo/number) only. Structural equality keeps this
		// stable while the PR's live data — and therefore its computed icon —
		// updates, so the poller doesn't churn (or feed back into itself) every
		// time `gitHubInfo` re-derives.
		//
		// When there's no identity yet we carry the *reason* (archived / no
		// workspace / no git repository / no pull request) so the outer autorun
		// can log precisely which stage is missing. This is the key signal for
		// diagnosing "non-active session icons don't refresh": the shared PR
		// model is only kept warm (and polled) once this resolves to `ok`, so a
		// session stuck at e.g. `no-workspace` or `no-pull-request` explains why
		// its icon never refines. Structural equality still de-dupes these stable
		// reason objects, so the poller doesn't churn.
		const pullRequestIdentityObs = derivedOpts<PullRequestIdentityState>(
			{ owner: this, equalsFn: structuralEquals },
			reader => {
				if (session.isArchived.read(reader)) {
					return { kind: 'archived' };
				}

				const workspace = session.workspace.read(reader);
				if (!workspace) {
					return { kind: 'no-workspace' };
				}

				const gitRepository = workspace.folders[0]?.gitRepository;
				if (!gitRepository) {
					return { kind: 'no-git-repository' };
				}

				const gitHubInfo = gitRepository.gitHubInfo.read(reader);
				if (!gitHubInfo?.pullRequest) {
					return { kind: 'no-pull-request' };
				}

				return { kind: 'ok', owner: gitHubInfo.owner, repo: gitHubInfo.repo, prNumber: gitHubInfo.pullRequest.number };
			});

		return autorun(reader => {
			const identity = pullRequestIdentityObs.read(reader);
			if (identity.kind !== 'ok') {
				// Not kept warm. The `reason` disambiguates the four bail-out stages
				// (previously logged as one generic message), so the log tells us
				// exactly why a non-active session's PR model is never polled.
				this._logService.trace(`${TRACE_PREFIX} [PollingContribution] Session ${session.sessionId} has no PR identity yet (reason: ${identity.kind}); NOT keeping a PR model warm. Will re-run reactively if this input changes.`);
				return;
			}

			const { owner, repo, prNumber } = identity;
			this._logService.trace(`${TRACE_PREFIX} [PollingContribution] Session ${session.sessionId} resolved PR identity ${owner}/${repo}#${prNumber}; acquiring model and refreshing`);

			const modelRef = reader.store.add(this._gitHubService.createPullRequestModelReference(owner, repo, prNumber));
			const model = modelRef.object;

			// Fetch once so we learn the PR state and can render the icon — even for
			// a merged PR that won't keep polling.
			model.refresh();

			// Gate the repeating poll loop on a stable boolean so poll results (which
			// update `pullRequest`) don't toggle the loop on every refresh.
			const shouldPollObs = derived(this, pollReader => {
				const prDetails = model.pullRequest.read(pollReader);
				const isMerged = prDetails?.state === GitHubPullRequestState.Merged;
				return !isMerged || this._isActiveSession(session, pollReader);
			});
			reader.store.add(autorun(pollReader => {
				if (!shouldPollObs.read(pollReader)) {
					this._logService.trace(`${TRACE_PREFIX} [PollingContribution] Session ${session.sessionId} PR ${owner}/${repo}#${prNumber} is merged and not active; not polling`);
					return;
				}

				this._logService.trace(`${TRACE_PREFIX} [PollingContribution] Session ${session.sessionId} starting PR polling for ${owner}/${repo}#${prNumber}`);
				pollReader.store.add(model.startPolling());
			}));

			// Poll CI checks and review threads so the session's PR icon can reflect
			// failing checks / unresolved comments even when the session is not active.
			// Only open, non-draft PRs need this (merged/closed/draft don't surface it).
			reader.store.add(autorun(statusReader => {
				const prDetails = model.pullRequest.read(statusReader);
				if (!prDetails || prDetails.isDraft || prDetails.state !== GitHubPullRequestState.Open) {
					return;
				}

				this._logService.trace(`${TRACE_PREFIX} [PollingContribution] Session ${session.sessionId} starting CI + review-thread polling for ${owner}/${repo}#${prNumber}@${prDetails.headSha}`);

				const ciModelRef = statusReader.store.add(this._gitHubService.createPullRequestCIModelReference(owner, repo, prNumber, prDetails.headSha));
				ciModelRef.object.refresh();
				statusReader.store.add(ciModelRef.object.startPolling());

				const reviewThreadsModelRef = statusReader.store.add(this._gitHubService.createPullRequestReviewThreadsModelReference(owner, repo, prNumber));
				reviewThreadsModelRef.object.refresh();
				statusReader.store.add(reviewThreadsModelRef.object.startPolling());
			}));
		});
	}

	private _isActiveSession(session: ISession, reader: IReader): boolean {
		const activeSession = this._sessionsService.activeSession.read(reader);
		if (!activeSession || activeSession.isArchived.read(reader)) {
			return false;
		}

		return isEqual(activeSession.resource, session.resource);
	}
}

registerWorkbenchContribution2(GitHubPullRequestPollingContribution.ID, GitHubPullRequestPollingContribution, WorkbenchPhase.AfterRestored);

registerSingleton(IGitHubService, GitHubService, InstantiationType.Delayed);

registerSingleton(IPullRequestIconCache, PullRequestIconCache, InstantiationType.Delayed);
