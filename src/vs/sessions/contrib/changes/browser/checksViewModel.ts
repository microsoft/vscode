/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../github/browser/models/githubPullRequestCIModel.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

export class ChecksViewModel extends Disposable {
	readonly checks: IObservable<GitHubPullRequestCIModel | undefined>;

	constructor(
		@IGitHubService private readonly gitHubService: IGitHubService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
	) {
		super();

		this.checks = derived(this, reader => {
			const session = this.sessionManagementService.activeSession.read(reader);
			if (!session) {
				return undefined;
			}

			const gitHubInfo = session.gitHubInfo.read(reader);
			if (!gitHubInfo?.pullRequest) {
				return undefined;
			}

			const prModel = this.gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
			const pr = prModel.pullRequest.read(reader);
			if (!pr) {
				return undefined;
			}

			// Use the PR's headSha (commit SHA) rather than the branch
			// name so CI checks can still be fetched after branch deletion
			// (e.g. after the PR is merged).
			const ciModel = this.gitHubService.getPullRequestCI(gitHubInfo.owner, gitHubInfo.repo, pr.headSha);
			ciModel.refresh();
			ciModel.startPolling();
			reader.store.add({ dispose: () => ciModel.stopPolling() });

			return ciModel;
		});
	}
}
