/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference, ReferenceCollection } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubPRFetcher } from '../../../../../sessions/contrib/github/browser/fetchers/githubPRFetcher.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubPullRequestModel } from '../../../../../sessions/contrib/github/browser/models/githubPullRequestModel.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubPullRequestCIModel } from '../../../../../sessions/contrib/github/browser/models/githubPullRequestCIModel.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubPullRequestReviewThreadsModel } from '../../../../../sessions/contrib/github/browser/models/githubPullRequestReviewThreadsModel.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubService } from '../../../../../sessions/contrib/github/browser/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubPullRequest } from '../../../../../sessions/contrib/github/common/types.js';

interface IFixturePullRequestEntry {
	readonly owner: string;
	readonly repo: string;
	readonly pullRequest: IGitHubPullRequest;
}

class FixtureGitHubPRFetcher extends mock<GitHubPRFetcher>() { }

class FixtureGitHubPullRequestModel extends GitHubPullRequestModel {

	override readonly pullRequest: IObservable<IGitHubPullRequest | undefined>;

	constructor(owner: string, repo: string, prNumber: number, pullRequest: IGitHubPullRequest | undefined) {
		super(owner, repo, prNumber, new FixtureGitHubPRFetcher(), new NullLogService());
		this.pullRequest = constObservable(pullRequest);
	}
}

class FixtureGitHubPullRequestModelReferenceCollection extends ReferenceCollection<GitHubPullRequestModel> {

	constructor(private readonly _pullRequests: Map<string, IGitHubPullRequest>) {
		super();
	}

	protected override createReferencedObject(key: string, owner: string, repo: string, prNumber: number): GitHubPullRequestModel {
		return new FixtureGitHubPullRequestModel(owner, repo, prNumber, this._pullRequests.get(key));
	}

	protected override destroyReferencedObject(key: string, object: GitHubPullRequestModel): void {
		object.dispose();
	}
}

export function createFixtureGitHubService(entries: readonly IFixturePullRequestEntry[]): IGitHubService {
	const pullRequests = new Map(entries.map(entry => [toPullRequestKey(entry.owner, entry.repo, entry.pullRequest.number), entry.pullRequest]));

	return new class extends mock<IGitHubService>() {
		override readonly activeSessionPullRequestObs = constObservable<GitHubPullRequestModel | undefined>(undefined);
		override readonly activeSessionPullRequestCIObs = constObservable<GitHubPullRequestCIModel | undefined>(undefined);
		override readonly activeSessionPullRequestReviewThreadsObs = constObservable<GitHubPullRequestReviewThreadsModel | undefined>(undefined);

		private readonly _references = new FixtureGitHubPullRequestModelReferenceCollection(pullRequests);

		override createPullRequestModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestModel> {
			return this._references.acquire(toPullRequestKey(owner, repo, prNumber), owner, repo, prNumber);
		}
	}();
}

function toPullRequestKey(owner: string, repo: string, prNumber: number): string {
	return `${owner}/${repo}/${prNumber}`;
}
