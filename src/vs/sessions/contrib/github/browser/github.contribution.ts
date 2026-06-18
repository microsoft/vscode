/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { getPullRequestKey } from '../common/utils.js';
import { GitHubPullRequestState } from '../common/types.js';
import { GitHubService, IGitHubService } from './githubService.js';

export class GitHubPullRequestPollingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.githubPullRequestPolling';

	private readonly _pullRequests = new DisposableMap<string>();

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

		this._sessionsManagementService.onDidChangeSessions(this._onDidChangeSessions, this, this._store);
		this._onDidChangeSessions({ added: this._sessionsManagementService.getSessions(), removed: [], changed: [] });
	}

	private _onDidChangeSessions(e: ISessionsChangeEvent): void {
		// Added sessions
		for (const session of e.added) {
			// Archived
			if (session.isArchived.get()) {
				continue;
			}

			this._startPolling(session);
		}

		// Changes sessions
		for (const session of e.changed) {
			// Archived
			if (session.isArchived.get()) {
				this._disposePolling(session);
				continue;
			}

			this._startPolling(session);
		}

		// Removed sessions
		for (const session of e.removed) {
			this._disposePolling(session);
		}
	}

	private _startPolling(session: ISession): void {
		const gitHubInfo = session.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
		if (!gitHubInfo || !gitHubInfo.pullRequest) {
			return;
		}

		const key = getPullRequestKey(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
		if (this._pullRequests.has(key)) {
			return;
		}

		const disposables = new DisposableStore();
		const modelRef = this._gitHubService.createPullRequestModelReference(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);

		disposables.add(modelRef);
		disposables.add(modelRef.object.startPolling());

		// Poll CI checks and review threads so the session's PR icon can reflect
		// failing checks / unresolved comments even when the session is not active.
		const prNumber = gitHubInfo.pullRequest.number;
		disposables.add(autorun(reader => {
			const prDetails = modelRef.object.pullRequest.read(reader);
			if (!prDetails || prDetails.isDraft || prDetails.state !== GitHubPullRequestState.Open) {
				return;
			}

			const ciModelRef = reader.store.add(this._gitHubService.createPullRequestCIModelReference(gitHubInfo.owner, gitHubInfo.repo, prNumber, prDetails.headSha));
			ciModelRef.object.refresh();
			reader.store.add(ciModelRef.object.startPolling());

			const reviewThreadsModelRef = reader.store.add(this._gitHubService.createPullRequestReviewThreadsModelReference(gitHubInfo.owner, gitHubInfo.repo, prNumber));
			reviewThreadsModelRef.object.refresh();
			reader.store.add(reviewThreadsModelRef.object.startPolling());
		}));

		this._pullRequests.set(key, disposables);
	}

	private _disposePolling(session: ISession): void {
		const gitHubInfo = session.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
		if (!gitHubInfo || !gitHubInfo.pullRequest) {
			return;
		}

		const key = getPullRequestKey(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
		this._pullRequests.deleteAndDispose(key);
	}

	override dispose(): void {
		this._pullRequests.dispose();

		super.dispose();
	}
}

registerWorkbenchContribution2(GitHubPullRequestPollingContribution.ID, GitHubPullRequestPollingContribution, WorkbenchPhase.AfterRestored);

registerSingleton(IGitHubService, GitHubService, InstantiationType.Delayed);
