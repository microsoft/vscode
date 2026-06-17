/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { GitHubService, IGitHubService } from './githubService.js';

/**
 * In addition to the sessions currently open in the grid, poll the pull request
 * state of the N most recently updated sessions so their list icons stay fresh
 * without polling every session's PR.
 */
const MAX_POLLED_RECENT_SESSIONS = 5;

export class GitHubPullRequestPollingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.githubPullRequestPolling';

	/**
	 * Per-session tracking (keyed by {@link ISession.sessionId}) that fetches and
	 * (when in the polling set) polls each session's pull request state for as
	 * long as the session exists.
	 */
	private readonly _sessionTracking = new DisposableMap<string>();

	/** Reactive mirror of all known sessions, used to pick the most recent ones. */
	private readonly _allSessions: ISettableObservable<readonly ISession[]> = observableValue(this, []);

	/**
	 * Session ids whose pull request state should be polled continuously: the
	 * sessions currently open in the grid plus the {@link MAX_POLLED_RECENT_SESSIONS}
	 * most recently updated (non-archived) sessions.
	 */
	private readonly _polledSessionIds: IObservable<ReadonlySet<string>>;

	constructor(
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
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

		this._polledSessionIds = derived(this, reader => {
			const ids = new Set<string>();

			// Always poll the sessions currently open in the grid.
			for (const session of this._sessionsService.visibleSessions.read(reader)) {
				if (session && !session.isArchived.read(reader)) {
					ids.add(session.sessionId);
				}
			}

			// Plus the most recently updated (non-archived) sessions.
			const recent = this._allSessions.read(reader)
				.filter(session => !session.isArchived.read(reader))
				.sort((a, b) => b.updatedAt.read(reader).getTime() - a.updatedAt.read(reader).getTime())
				.slice(0, MAX_POLLED_RECENT_SESSIONS);
			for (const session of recent) {
				ids.add(session.sessionId);
			}

			return ids;
		});

		this._sessionsManagementService.onDidChangeSessions(this._onDidChangeSessions, this, this._store);
		this._onDidChangeSessions({ added: this._sessionsManagementService.getSessions(), removed: [], changed: [] });
	}

	private _onDidChangeSessions(e: ISessionsChangeEvent): void {
		for (const session of [...e.added, ...e.changed]) {
			this._trackSession(session);
		}

		for (const session of e.removed) {
			this._sessionTracking.deleteAndDispose(session.sessionId);
		}

		this._allSessions.set(this._sessionsManagementService.getSessions(), undefined);
	}

	/**
	 * Track a session's pull request state.
	 *
	 * The PR icon shown in the sessions list is derived from the shared PR-state
	 * cache, so we must keep that cache populated for the session. We do two
	 * things, both reactive on the session's `gitHubInfo` (some providers — e.g.
	 * the agent host — resolve the PR number asynchronously):
	 *
	 * - Fetch the state once when the PR number first resolves (or changes),
	 *   unless the cache is already populated (it may have been seeded from
	 *   storage on reload). This keeps the icon correct for every session without
	 *   polling all of them.
	 * - Poll the state continuously while the session is in the limited polling
	 *   set (see {@link _polledSessionIds}). When the session leaves the set we
	 *   stop polling but keep the last-seen state in the cache, so the icon keeps
	 *   rendering.
	 */
	private _trackSession(session: ISession): void {
		const key = session.sessionId;
		if (this._sessionTracking.has(key)) {
			return;
		}

		// Depend only on the PR identity (owner/repo/number) via structural
		// equality so cache writes (which recompute `gitHubInfo`) don't re-trigger
		// the autoruns below. Archived sessions resolve to `undefined`.
		const pullRequestObs = derivedOpts<{ owner: string; repo: string; number: number } | undefined>(
			{ equalsFn: structuralEquals },
			reader => {
				if (session.isArchived.read(reader)) {
					return undefined;
				}
				const gitHubInfo = session.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
				if (!gitHubInfo?.pullRequest) {
					return undefined;
				}
				return { owner: gitHubInfo.owner, repo: gitHubInfo.repo, number: gitHubInfo.pullRequest.number };
			});

		// Boolean membership with default (value) equality so the polling autorun
		// only re-runs when this session actually joins/leaves the polling set.
		const isPolledObs = derived(reader => this._polledSessionIds.read(reader).has(session.sessionId));

		const disposables = new DisposableStore();

		// Fetch once when the PR number resolves/changes (skip if already cached).
		disposables.add(autorun(reader => {
			const pullRequest = pullRequestObs.read(reader);
			if (!pullRequest) {
				return;
			}
			if (this._gitHubService.getCachedPullRequestState(pullRequest.owner, pullRequest.repo, pullRequest.number).read(undefined) === undefined) {
				this._gitHubService.fetchPullRequestState(pullRequest.owner, pullRequest.repo, pullRequest.number);
			}
		}));

		// Poll while in the polling set; stops (retaining cached state) otherwise.
		disposables.add(autorun(reader => {
			const pullRequest = pullRequestObs.read(reader);
			if (!pullRequest || !isPolledObs.read(reader)) {
				return;
			}
			reader.store.add(this._gitHubService.pollPullRequestState(pullRequest.owner, pullRequest.repo, pullRequest.number));
		}));

		this._sessionTracking.set(key, disposables);
	}

	override dispose(): void {
		this._sessionTracking.dispose();

		super.dispose();
	}
}

registerWorkbenchContribution2(GitHubPullRequestPollingContribution.ID, GitHubPullRequestPollingContribution, WorkbenchPhase.AfterRestored);

registerSingleton(IGitHubService, GitHubService, InstantiationType.Delayed);
