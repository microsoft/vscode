/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IGitHubChangedFile } from '../common/types.js';
import { GitHubApiClient } from './githubApiClient.js';
import { GitHubRepositoryModel, GitHubRepositoryModelReferenceCollection } from './models/githubRepositoryModel.js';
import { GitHubPullRequestModel, GitHubPullRequestModelReferenceCollection } from './models/githubPullRequestModel.js';
import { GitHubPullRequestReviewThreadsModel, GitHubPullRequestReviewThreadsModelReferenceCollection } from './models/githubPullRequestReviewThreadsModel.js';
import { GitHubPullRequestCIModel, GitHubPullRequestCIModelReferenceCollection } from './models/githubPullRequestCIModel.js';
import { GitHubChangesFetcher } from './fetchers/githubChangesFetcher.js';
import { getPullRequestKey } from '../common/utils.js';
import { derived, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export interface IGitHubService {
	readonly _serviceBrand: undefined;

	activeSessionPullRequestObs: IObservable<GitHubPullRequestModel | undefined>;
	activeSessionPullRequestCIObs: IObservable<GitHubPullRequestCIModel | undefined>;
	activeSessionPullRequestReviewThreadsObs: IObservable<GitHubPullRequestReviewThreadsModel | undefined>;

	/**
	 * Get a reference to a reactive model for a GitHub repository.
	 */
	createRepositoryModelReference(owner: string, repo: string): IReference<GitHubRepositoryModel>;

	/**
	 * Get a reference to a reactive model for a GitHub pull request.
	 */
	createPullRequestModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestModel>;

	/**
	 * Get a reference to a reactive model for review threads on a GitHub pull request.
	 */
	createPullRequestReviewThreadsModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestReviewThreadsModel>;

	/**
	 * Get a reference to a reactive model for CI checks on a pull request head SHA.
	 */
	createPullRequestCIModelReference(owner: string, repo: string, prNumber: number, headSha: string): IReference<GitHubPullRequestCIModel>;

	/**
	 * List files changed between two refs using the GitHub compare API.
	 */
	getChangedFiles(owner: string, repo: string, base: string, head: string): Promise<readonly IGitHubChangedFile[]>;

	/**
	 * Find the most recently updated pull request whose head branch is
	 * `branch` in `owner/repo`. Returns `undefined` if no PR exists.
	 *
	 * Successful numeric results are cached per `(owner, repo, branch)`
	 * for the lifetime of the service (PR number is monotonic per
	 * branch lifetime). Transient failures and `undefined` results are
	 * not cached, so a later retry can succeed once a PR is created.
	 */
	findPullRequestNumberByHeadBranch(owner: string, repo: string, branch: string): Promise<number | undefined>;
}

export const IGitHubService = createDecorator<IGitHubService>('sessionsGitHubService');

export class GitHubService extends Disposable implements IGitHubService {

	declare readonly _serviceBrand: undefined;

	readonly activeSessionPullRequestObs: IObservable<GitHubPullRequestModel | undefined>;
	readonly activeSessionPullRequestCIObs: IObservable<GitHubPullRequestCIModel | undefined>;
	readonly activeSessionPullRequestReviewThreadsObs: IObservable<GitHubPullRequestReviewThreadsModel | undefined>;

	private readonly _changesFetcher: GitHubChangesFetcher;
	private readonly _repositoryReferences: GitHubRepositoryModelReferenceCollection;
	private readonly _pullRequestReferences: GitHubPullRequestModelReferenceCollection;
	private readonly _pullRequestReviewThreadsReferences: GitHubPullRequestReviewThreadsModelReferenceCollection;
	private readonly _pullRequestCIReferences: GitHubPullRequestCIModelReferenceCollection;
	private readonly _apiClient: GitHubApiClient;

	/**
	 * Cache of in-flight / resolved `findPullRequestNumberByHeadBranch`
	 * lookups, keyed by `${owner}/${repo}#${branch}`. Promises are kept
	 * indefinitely — PR-number assignment is monotonic for the lifetime of
	 * a branch, and live PR state (open/closed/draft, CI) is refreshed via
	 * `createPullRequestModelReference` once we know the number.
	 */
	private readonly _findPRByBranchCache = new Map<string, Promise<number | undefined>>();

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
	) {
		super();

		const apiClient = this._register(instantiationService.createInstance(GitHubApiClient));
		this._apiClient = apiClient;

		this._changesFetcher = new GitHubChangesFetcher(apiClient);

		this._repositoryReferences = instantiationService.createInstance(GitHubRepositoryModelReferenceCollection, apiClient);
		this._pullRequestReferences = instantiationService.createInstance(GitHubPullRequestModelReferenceCollection, apiClient);
		this._pullRequestReviewThreadsReferences = instantiationService.createInstance(GitHubPullRequestReviewThreadsModelReferenceCollection, apiClient);
		this._pullRequestCIReferences = instantiationService.createInstance(GitHubPullRequestCIModelReferenceCollection, apiClient);

		const gitHubInfoObs = derivedOpts<{ owner: string; repo: string; pullRequestNumber: number } | undefined>({ equalsFn: structuralEquals },
			reader => {
				const gitHubInfo = sessionManagementService.activeSession.read(reader)?.gitHubInfo.read(reader);

				if (!gitHubInfo?.pullRequest) {
					return undefined;
				}

				return {
					owner: gitHubInfo.owner,
					repo: gitHubInfo.repo,
					pullRequestNumber: gitHubInfo.pullRequest.number
				};
			});

		this.activeSessionPullRequestObs = derived(reader => {
			const gitHubInfo = gitHubInfoObs.read(reader);
			if (!gitHubInfo) {
				return undefined;
			}

			const prModelRef = this.createPullRequestModelReference(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequestNumber);
			reader.store.add(prModelRef);

			return prModelRef.object;
		});

		const pullRequestInfoObs = derivedOpts<{ owner: string; repo: string; prNumber: number; headSha: string } | undefined>({ equalsFn: structuralEquals },
			reader => {
				const pullRequest = this.activeSessionPullRequestObs.read(reader);
				const pullRequestDetails = pullRequest?.pullRequest.read(reader);

				if (!pullRequest || !pullRequestDetails) {
					return undefined;
				}

				return {
					owner: pullRequest.owner,
					repo: pullRequest.repo,
					prNumber: pullRequest.prNumber,
					headSha: pullRequestDetails.headSha
				};
			});

		this.activeSessionPullRequestCIObs = derived(reader => {
			const pullRequestInfo = pullRequestInfoObs.read(reader);
			if (!pullRequestInfo) {
				return undefined;
			}

			const prModelRef = this.createPullRequestCIModelReference(pullRequestInfo.owner, pullRequestInfo.repo, pullRequestInfo.prNumber, pullRequestInfo.headSha);
			reader.store.add(prModelRef);

			return prModelRef.object;
		});

		this.activeSessionPullRequestReviewThreadsObs = derived(reader => {
			const gitHubInfo = gitHubInfoObs.read(reader);
			if (!gitHubInfo) {
				return undefined;
			}

			const reviewThreadsModelRef = this.createPullRequestReviewThreadsModelReference(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequestNumber);
			reader.store.add(reviewThreadsModelRef);

			return reviewThreadsModelRef.object;
		});
	}

	createRepositoryModelReference(owner: string, repo: string): IReference<GitHubRepositoryModel> {
		return this._repositoryReferences.acquire(`${owner}/${repo}`, owner, repo);
	}

	createPullRequestModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestModel> {
		return this._pullRequestReferences.acquire(getPullRequestKey(owner, repo, prNumber), owner, repo, prNumber);
	}

	createPullRequestReviewThreadsModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestReviewThreadsModel> {
		return this._pullRequestReviewThreadsReferences.acquire(getPullRequestKey(owner, repo, prNumber), owner, repo, prNumber);
	}

	createPullRequestCIModelReference(owner: string, repo: string, prNumber: number, headSha: string): IReference<GitHubPullRequestCIModel> {
		return this._pullRequestCIReferences.acquire(`${getPullRequestKey(owner, repo, prNumber)}/${headSha}`, owner, repo, prNumber, headSha);
	}

	getChangedFiles(owner: string, repo: string, base: string, head: string): Promise<readonly IGitHubChangedFile[]> {
		return this._changesFetcher.getChangedFiles(owner, repo, base, head);
	}

	findPullRequestNumberByHeadBranch(owner: string, repo: string, branch: string): Promise<number | undefined> {
		const key = `${owner}/${repo}#${branch}`;
		let promise = this._findPRByBranchCache.get(key);
		if (!promise) {
			promise = this._fetchPullRequestNumberByHeadBranch(owner, repo, branch);
			this._findPRByBranchCache.set(key, promise);
			// Only cache successful, numeric results indefinitely; the PR number
			// for a given (owner, repo, branch) is monotonic for that branch's
			// lifetime so it's safe to cache forever. For transient failures and
			// "no PR yet" results, drop the cache entry so the next call retries.
			promise.then(
				value => {
					if (typeof value !== 'number') {
						this._findPRByBranchCache.delete(key);
					}
				},
				() => {
					this._findPRByBranchCache.delete(key);
				},
			);
		}
		return promise.catch(() => undefined);
	}

	private async _fetchPullRequestNumberByHeadBranch(owner: string, repo: string, branch: string): Promise<number | undefined> {
		// Use the REST `pulls` list API filtered by `head=${owner}:${branch}`.
		// Default state is `open`; we include closed/merged so the button still
		// surfaces the PR after the agent run finishes and the PR is merged.
		// `per_page=1` + `sort=updated` gives us the most recent match.
		const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&sort=updated&direction=desc&per_page=1`;
		const response = await this._apiClient.request<readonly { readonly number: number }[]>(
			'GET',
			path,
			'githubApi.findPullRequestByHeadBranch',
		);
		const first = response.data?.[0];
		return first ? first.number : undefined;
	}
}
