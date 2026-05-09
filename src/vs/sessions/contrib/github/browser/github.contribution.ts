/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getPullRequestKey } from '../common/utils.js';
import { GitHubService, IGitHubService } from './githubService.js';

export class GitHubPullRequestPollingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.githubPullRequestPolling';

	private readonly _pullRequests = new DisposableMap<string>();
	private readonly _pullRequestSessions = new Map<string, Set<string>>();
	private readonly _sessions = new DisposableMap<string>();

	constructor(
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();

		const activeSessionResourceObs = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => {
			const activeSession = this._sessionsManagementService.activeSession.read(reader);
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
		for (const session of e.added) {
			if (session.isArchived.get()) {
				continue;
			}

			this._observeSession(session);
		}

		for (const session of e.changed) {
			if (session.isArchived.get()) {
				this._disposeSession(session);
				continue;
			}

			this._observeSession(session);
		}

		for (const session of e.removed) {
			this._disposeSession(session);
		}
	}

	private _observeSession(session: ISession): void {
		if (this._sessions.has(session.sessionId)) {
			return;
		}

		let pullRequestKey: string | undefined;
		const disposables = new DisposableStore();
		disposables.add(autorun(reader => {
			if (session.isArchived.read(reader)) {
				if (pullRequestKey) {
					this._releasePullRequest(pullRequestKey, session.sessionId);
					pullRequestKey = undefined;
				}
				return;
			}

			const gitHubInfo = session.gitHubInfo.read(reader);
			const nextPullRequestKey = gitHubInfo?.pullRequest
				? getPullRequestKey(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number)
				: undefined;
			if (nextPullRequestKey === pullRequestKey) {
				return;
			}

			if (pullRequestKey) {
				this._releasePullRequest(pullRequestKey, session.sessionId);
			}
			pullRequestKey = nextPullRequestKey;

			if (gitHubInfo?.pullRequest) {
				this._retainPullRequest(session.sessionId, gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
			}
		}));
		disposables.add(toDisposable(() => {
			if (pullRequestKey) {
				this._releasePullRequest(pullRequestKey, session.sessionId);
				pullRequestKey = undefined;
			}
		}));

		this._sessions.set(session.sessionId, disposables);
	}

	private _retainPullRequest(sessionId: string, owner: string, repo: string, prNumber: number): void {
		const key = getPullRequestKey(owner, repo, prNumber);
		let sessions = this._pullRequestSessions.get(key);
		if (sessions) {
			sessions.add(sessionId);
			return;
		}

		sessions = new Set([sessionId]);
		this._pullRequestSessions.set(key, sessions);

		const disposables = new DisposableStore();
		const modelRef = this._gitHubService.createPullRequestModelReference(owner, repo, prNumber);
		disposables.add(modelRef);
		void modelRef.object.refreshPullRequest();
		disposables.add(modelRef.object.startPullRequestPolling());
		this._pullRequests.set(key, disposables);
	}

	private _releasePullRequest(key: string, sessionId: string): void {
		const sessions = this._pullRequestSessions.get(key);
		if (!sessions) {
			return;
		}

		sessions.delete(sessionId);
		if (sessions.size === 0) {
			this._pullRequestSessions.delete(key);
			this._pullRequests.deleteAndDispose(key);
		}
	}

	private _disposeSession(session: ISession): void {
		this._sessions.deleteAndDispose(session.sessionId);
	}

	override dispose(): void {
		this._sessions.dispose();
		this._pullRequests.dispose();
		this._pullRequestSessions.clear();

		super.dispose();
	}
}

registerWorkbenchContribution2(GitHubPullRequestPollingContribution.ID, GitHubPullRequestPollingContribution, WorkbenchPhase.AfterRestored);

registerSingleton(IGitHubService, GitHubService, InstantiationType.Delayed);
