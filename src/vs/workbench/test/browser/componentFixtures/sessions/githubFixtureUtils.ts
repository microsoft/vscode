/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { timeout } from '../../../../../base/common/async.js';
import { Disposable, IDisposable, ImmortalReference, IReference, ReferenceCollection } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { GitHubCommit, GitHubIssue, GitHubIssueRef } from '../../../../../platform/github/common/githubQueryService.js';
import { FragmentState, PullRequestCore, PullRequestRef, PullRequestSnapshot } from '../../../../../platform/github/common/githubPullRequestService.js';
import { IGitHubClient } from '../../../../../platform/github/common/githubService.js';
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
import { GitHubIssueModel } from '../../../../../sessions/contrib/github/browser/models/githubIssueModel.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubIssueFetcher } from '../../../../../sessions/contrib/github/browser/fetchers/githubIssueFetcher.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubService } from '../../../../../sessions/contrib/github/browser/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { IPullRequestIconCache } from '../../../../../sessions/contrib/github/browser/pullRequestIconCache.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubCIOverallStatus, IGitHubIssue, IGitHubPullRequest, IGitHubPullRequestReviewThread } from '../../../../../sessions/contrib/github/common/types.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';

interface IFixturePullRequestEntry {
	readonly owner: string;
	readonly repo: string;
	readonly pullRequest: IGitHubPullRequest;
}

interface IFixtureIssueEntry {
	readonly owner: string;
	readonly repo: string;
	readonly issue: IGitHubIssue;
}

class FixtureGitHubPRFetcher extends mock<GitHubPRFetcher>() { }

class FixtureGitHubPullRequestModel extends GitHubPullRequestModel {

	override readonly pullRequest: IObservable<IGitHubPullRequest | undefined>;

	constructor(owner: string, repo: string, prNumber: number, pullRequest: IGitHubPullRequest | undefined) {
		super(owner, repo, prNumber, new FixtureGitHubPRFetcher(), new NullLogService());
		this.pullRequest = constObservable(pullRequest);
	}

	override refresh(): Promise<void> {
		return Promise.resolve();
	}

	override startPolling(): IDisposable {
		return Disposable.None;
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

class FixtureGitHubIssueFetcher extends mock<GitHubIssueFetcher>() { }

class FixtureGitHubIssueModel extends GitHubIssueModel {

	override readonly issue: IObservable<IGitHubIssue | undefined>;

	constructor(owner: string, repo: string, issueNumber: number, issue: IGitHubIssue | undefined) {
		super(owner, repo, issueNumber, new FixtureGitHubIssueFetcher(), new NullLogService());
		this.issue = constObservable(issue);
	}

	override refresh(): Promise<void> {
		return Promise.resolve();
	}

	override startPolling(): IDisposable {
		return Disposable.None;
	}
}

class FixtureGitHubIssueModelReferenceCollection extends ReferenceCollection<GitHubIssueModel> {

	constructor(private readonly _issues: Map<string, IGitHubIssue>) {
		super();
	}

	protected override createReferencedObject(key: string, owner: string, repo: string, issueNumber: number): GitHubIssueModel {
		return new FixtureGitHubIssueModel(owner, repo, issueNumber, this._issues.get(key));
	}

	protected override destroyReferencedObject(key: string, object: GitHubIssueModel): void {
		object.dispose();
	}
}

export function createFixtureGitHubService(entries: readonly IFixturePullRequestEntry[], issueEntries: readonly IFixtureIssueEntry[] = []): IGitHubService {
	const pullRequests = new Map(entries.map(entry => [toPullRequestKey(entry.owner, entry.repo, entry.pullRequest.number), entry.pullRequest]));
	const issues = new Map(issueEntries.map(entry => [toIssueKey(entry.owner, entry.repo, entry.issue.number), entry.issue]));

	return new class extends mock<IGitHubService>() {
		override readonly activeSessionPullRequestObs = constObservable<GitHubPullRequestModel | undefined>(undefined);
		override readonly activeSessionPullRequestCIObs = constObservable<GitHubPullRequestCIModel | undefined>(undefined);
		override readonly activeSessionPullRequestReviewThreadsObs = constObservable<GitHubPullRequestReviewThreadsModel | undefined>(undefined);

		override async getCommit(owner: string, repo: string, sha: string): Promise<GitHubCommit> {
			return {
				sha,
				message: `Commit ${sha}`,
				url: `https://github.com/${owner}/${repo}/commit/${sha}`,
				author: { login: 'octocat' },
				committedAt: '2026-01-01T00:00:00Z',
			};
		}

		private readonly _references = new FixtureGitHubPullRequestModelReferenceCollection(pullRequests);
		private readonly _issueReferences = new FixtureGitHubIssueModelReferenceCollection(issues);
		private readonly _ciModel = new class extends mock<GitHubPullRequestCIModel>() {
			override readonly overallStatus = constObservable(GitHubCIOverallStatus.Neutral);
			override refresh(): Promise<void> { return Promise.resolve(); }
			override startPolling(): IDisposable { return Disposable.None; }
		}();
		private readonly _reviewThreadsModel = new class extends mock<GitHubPullRequestReviewThreadsModel>() {
			override readonly reviewThreads = constObservable<readonly IGitHubPullRequestReviewThread[]>([]);
			override refresh(): Promise<void> { return Promise.resolve(); }
			override startPolling(): IDisposable { return Disposable.None; }
		}();

		override createPullRequestModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestModel> {
			return this._references.acquire(toPullRequestKey(owner, repo, prNumber), owner, repo, prNumber);
		}

		override createIssueModelReference(owner: string, repo: string, issueNumber: number): IReference<GitHubIssueModel> {
			return this._issueReferences.acquire(toIssueKey(owner, repo, issueNumber), owner, repo, issueNumber);
		}

		override createPullRequestCIModelReference(): IReference<GitHubPullRequestCIModel> {
			return { object: this._ciModel, dispose: () => { } };
		}

		override createPullRequestReviewThreadsModelReference(): IReference<GitHubPullRequestReviewThreadsModel> {
			return { object: this._reviewThreadsModel, dispose: () => { } };
		}
	}();
}

export function createFixturePullRequestIconCache(): IPullRequestIconCache {
	const icons = new Map<string, ThemeIcon>();
	return {
		_serviceBrand: undefined,
		get: link => icons.get(link),
		set: (link, icon) => { icons.set(link, icon); },
	};
}

interface IFixtureGitHubResources {
	readonly delayMs?: number;
	readonly beforeRefresh?: () => Promise<void>;
	readonly onDidRefresh?: () => void;
	readonly pullRequests?: readonly PullRequestCore[];
	readonly issues?: readonly GitHubIssue[];
}

export function createFixtureWorkbenchGitHubService(resources: IFixtureGitHubResources): IWorkbenchGitHubService {
	const issues = new Map((resources.issues ?? []).map(issue => [issue.number, issue]));
	const pullRequests = new Map((resources.pullRequests ?? []).map(pullRequest => [pullRequest.number, pullRequest]));
	const issueStates = new Map<number, ReturnType<typeof observableValue<FragmentState<GitHubIssue>>>>();
	const pullRequestStates = new Map<number, ReturnType<typeof observableValue<PullRequestSnapshot>>>();

	const refresh = async (apply: () => void): Promise<void> => {
		await resources.beforeRefresh?.();
		if (resources.delayMs) {
			await timeout(resources.delayMs);
		}
		apply();
		resources.onDidRefresh?.();
	};
	const client = new class extends mock<IGitHubClient>() {
		override readonly credentials = upcastGitHubCredentials();
		override readonly query = new class extends mock<IGitHubClient['query']>() {
			override subscribeIssue(ref: GitHubIssueRef): ReturnType<IGitHubClient['query']['subscribeIssue']> {
				let state = issueStates.get(ref.number);
				if (!state) {
					state = observableValue(`fixtureIssue.${ref.number}`, { status: 'missing', complete: false });
					issueStates.set(ref.number, state);
				}
				const issueState = state;
				return {
					resource: { ref, state: issueState },
					update: () => { },
					refresh: () => refresh(() => {
						const issue = issues.get(ref.number);
						issueState.set(issue
							? { status: 'ready', complete: true, value: issue }
							: { status: 'error', complete: false }, undefined);
					}),
					dispose: () => { },
				};
			}
		}();
		override readonly pullRequests = new class extends mock<IGitHubClient['pullRequests']>() {
			override subscribePullRequest(ref: PullRequestRef): ReturnType<IGitHubClient['pullRequests']['subscribePullRequest']> {
				let snapshot = pullRequestStates.get(ref.number);
				if (!snapshot) {
					snapshot = observableValue(`fixturePullRequest.${ref.number}`, createPullRequestSnapshot(ref));
					pullRequestStates.set(ref.number, snapshot);
				}
				const pullRequestSnapshot = snapshot;
				return {
					resource: { ref, snapshot: pullRequestSnapshot },
					update: () => { },
					refresh: fragment => refresh(() => {
						const pullRequest = pullRequests.get(ref.number);
						const current = pullRequestSnapshot.get();
						if (fragment === 'core') {
							pullRequestSnapshot.set({
								...current,
								core: pullRequest
									? { status: 'ready', complete: true, value: pullRequest }
									: { status: 'error', complete: false },
							}, undefined);
						} else if (fragment === 'checks') {
							pullRequestSnapshot.set({
								...current,
								checks: {
									status: 'ready',
									complete: true,
									value: { headSha: pullRequest?.headSha ?? '', checks: [], requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true },
								},
							}, undefined);
						}
					}),
					dispose: () => { },
				};
			}
		}();
	}();

	return new class extends mock<IWorkbenchGitHubService>() {
		override readonly onDidChangeDefaultClient = Event.None;
		override async acquireDefaultAccountClient(): Promise<IReference<IGitHubClient>> {
			return new ImmortalReference(client);
		}
	}();
}

function upcastGitHubCredentials(): IGitHubClient['credentials'] {
	return new class extends mock<IGitHubClient['credentials']>() {
		override readonly onDidInvalidate = Event.None;
		override async getCredential(signal: AbortSignal) {
			return {
				account: { host: 'api.github.com', accountId: 'fixture' },
				token: 'fixture',
				generation: 1,
				signal,
			};
		}
	}();
}

function createPullRequestSnapshot(ref: PullRequestRef): PullRequestSnapshot {
	return {
		ref,
		generation: 0,
		headGeneration: 0,
		core: { status: 'missing', complete: false },
		topLevelComments: { status: 'missing', complete: false },
		submittedReviews: { status: 'missing', complete: false },
		inlineComments: { status: 'missing', complete: false },
		reviewThreads: { status: 'missing', complete: false },
		checks: { status: 'missing', complete: false },
		mergeability: { status: 'missing', complete: false },
		participants: { status: 'missing', complete: false },
	};
}

function toPullRequestKey(owner: string, repo: string, prNumber: number): string {
	return `${owner}/${repo}/${prNumber}`;
}

function toIssueKey(owner: string, repo: string, issueNumber: number): string {
	return `${owner}/${repo}/issues/${issueNumber}`;
}
