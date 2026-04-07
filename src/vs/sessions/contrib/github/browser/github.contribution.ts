/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { GitHubService, IGitHubService } from './githubService.js';

/**
 * Immediately refreshes PR data when the active session changes so that
 * CI checks and PR state are up-to-date without waiting for the next
 * polling cycle.
 */
class GitHubActiveSessionRefreshContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.githubActiveSessionRefresh';

	private _lastSessionResource: URI | undefined;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
	) {
		super();

		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			if (!session) {
				this._lastSessionResource = undefined;
				return;
			}
			if (this._lastSessionResource?.toString() === session.resource.toString()) {
				return;
			}
			this._lastSessionResource = session.resource;
			const gitHubInfo = session.gitHubInfo.read(reader);
			if (!gitHubInfo?.pullRequest) {
				return;
			}
			const prModel = this._gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
			prModel.refresh();
		}));
	}
}

registerSingleton(IGitHubService, GitHubService, InstantiationType.Delayed);
registerWorkbenchContribution2(GitHubActiveSessionRefreshContribution.ID, GitHubActiveSessionRefreshContribution, WorkbenchPhase.AfterRestored);
