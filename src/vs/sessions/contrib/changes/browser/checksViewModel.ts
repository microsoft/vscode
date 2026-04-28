/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../github/browser/models/githubPullRequestCIModel.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { structuralEquals } from '../../../../base/common/equals.js';

export class ChecksViewModel extends Disposable {
	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	readonly checksObs: IObservable<GitHubPullRequestCIModel | undefined>;

	constructor(
		@IGitHubService gitHubService: IGitHubService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
	) {
		super();

		this.activeSessionResourceObs = derived<URI | undefined>(this, reader => {
			const session = sessionManagementService.activeSession.read(reader);
			return session?.resource;
		});

		const pullRequestInfoObs = derivedOpts<{ owner: string; repo: string; headRef: string } | undefined>({
			equalsFn: structuralEquals
		}, reader => {
			const session = sessionManagementService.activeSession.read(reader);
			if (!session) {
				return undefined;
			}

			const gitHubInfo = session.gitHubInfo.read(reader);
			if (!gitHubInfo?.pullRequest) {
				return undefined;
			}

			const prModel = gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
			const pr = prModel.pullRequest.read(reader);
			if (!pr) {
				return undefined;
			}

			return {
				owner: gitHubInfo.owner,
				repo: gitHubInfo.repo,
				headRef: pr.headSha
			};
		});

		this.checksObs = derived(this, reader => {
			const pullRequestInfo = pullRequestInfoObs.read(reader);
			if (!pullRequestInfo) {
				return undefined;
			}

			// Use the PR's headSha (commit SHA) rather than the branch
			// name so CI checks can still be fetched after branch deletion
			// (e.g. after the PR is merged).
			const ciModel = gitHubService.getPullRequestCI(pullRequestInfo.owner, pullRequestInfo.repo, pullRequestInfo.headRef);
			ciModel.refresh();
			ciModel.startPolling();
			reader.store.add({ dispose: () => ciModel.stopPolling() });

			return ciModel;
		});
	}
}
