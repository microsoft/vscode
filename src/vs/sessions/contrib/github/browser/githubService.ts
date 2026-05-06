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

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
	) {
		super();

		const apiClient = this._register(instantiationService.createInstance(GitHubApiClient));

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
}
