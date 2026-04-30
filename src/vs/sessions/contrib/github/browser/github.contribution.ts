/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable, DisposableMap, toDisposable } from '../../../../base/common/lifecycle.js';
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

	constructor(
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();

		const activeSessionResourceObs = derivedOpts<URI | undefined>({ equalsFn: isEqual }, reader => {
			return this._sessionsManagementService.activeSession.read(reader)?.resource;
		});

		const gitHubInfoObs = derivedOpts<{ owner: string; repo: string; pullRequestNumber: number } | undefined>({ equalsFn: structuralEquals }, reader => {
			const gitHubInfo = this._sessionsManagementService.activeSession.read(reader)?.gitHubInfo.read(reader);
			if (!gitHubInfo?.pullRequest) {
				return undefined;
			}

			return {
				owner: gitHubInfo.owner,
				repo: gitHubInfo.repo,
				pullRequestNumber: gitHubInfo.pullRequest.number,
			};
		});

		this._register(autorun(reader => {
			const activeSessionResource = activeSessionResourceObs.read(reader);
			const activeSession = this._sessionsManagementService.activeSession.read(reader);
			if (!activeSessionResource || !activeSession || activeSession.isArchived.read(reader)) {
				return;
			}
			const gitHubInfo = gitHubInfoObs.read(reader);
			if (!gitHubInfo) {
				return;
			}
			const prModel = this._gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequestNumber);
			prModel.refresh();
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
				this._stopPolling(session);
				continue;
			}

			this._startPolling(session);
		}

		// Removed sessions
		for (const session of e.removed) {
			this._stopPolling(session);
		}
	}

	private _startPolling(session: ISession): void {
		const gitHubInfo = session.gitHubInfo.get();
		if (!gitHubInfo || !gitHubInfo.pullRequest) {
			return;
		}

		const key = getPullRequestKey(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
		if (this._pullRequests.has(key)) {
			return;
		}

		const model = this._gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
		this._pullRequests.set(key, toDisposable(() => model.stopPolling()));

		model.startPolling();
	}

	private _stopPolling(session: ISession): void {
		const gitHubInfo = session.gitHubInfo.get();
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
