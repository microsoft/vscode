/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IGitHubChangedFile } from '../common/types.js';
import { GitHubApiClient } from './githubApiClient.js';
import { GitHubRepositoryFetcher } from './fetchers/githubRepositoryFetcher.js';
import { GitHubPRFetcher } from './fetchers/githubPRFetcher.js';
import { GitHubPRCIFetcher } from './fetchers/githubPRCIFetcher.js';
import { GitHubRepositoryModel } from './models/githubRepositoryModel.js';
import { GitHubPullRequestModel } from './models/githubPullRequestModel.js';
import { GitHubPullRequestReviewThreadsModel } from './models/githubPullRequestReviewThreadsModel.js';
import { GitHubPullRequestCIModel } from './models/githubPullRequestCIModel.js';
import { GitHubChangesFetcher } from './fetchers/githubChangesFetcher.js';
import { getPullRequestKey } from '../common/utils.js';

export interface IGitHubService {
	readonly _serviceBrand: undefined;

	/**
	 * Get or create a reactive model for a GitHub repository.
	 * The model is cached by owner/repo key and disposed when the service is disposed.
	 */
	getRepository(owner: string, repo: string): GitHubRepositoryModel;

	/**
	 * Get or create a reactive model for a GitHub pull request.
	 * The model is cached by owner/repo/prNumber key and disposed when the service is disposed.
	 */
	getPullRequest(owner: string, repo: string, prNumber: number): GitHubPullRequestModel;

	/**
	 * Dispose and remove cached models associated with a GitHub pull request, if they exist.
	 */
	disposePullRequest(owner: string, repo: string, prNumber: number): void;

	/**
	 * Get or create a reactive model for review threads on a GitHub pull request.
	 * The model is cached by owner/repo/prNumber key and disposed when the service is disposed.
	 */
	getPullRequestReviewThreads(owner: string, repo: string, prNumber: number): GitHubPullRequestReviewThreadsModel;

	/**
	 * Get or create a reactive model for CI checks on a pull request head SHA.
	 * The model is cached by owner/repo/prNumber/headSha key and disposed when the service is disposed.
	 */
	getPullRequestCI(owner: string, repo: string, prNumber: number, headSha: string): GitHubPullRequestCIModel;

	/**
	 * List files changed between two refs using the GitHub compare API.
	 */
	getChangedFiles(owner: string, repo: string, base: string, head: string): Promise<readonly IGitHubChangedFile[]>;
}

export const IGitHubService = createDecorator<IGitHubService>('sessionsGitHubService');

const LOG_PREFIX = '[GitHubService]';

export class GitHubService extends Disposable implements IGitHubService {

	declare readonly _serviceBrand: undefined;

	private readonly _apiClient: GitHubApiClient;
	private readonly _repoFetcher: GitHubRepositoryFetcher;
	private readonly _changesFetcher: GitHubChangesFetcher;
	private readonly _prFetcher: GitHubPRFetcher;
	private readonly _ciFetcher: GitHubPRCIFetcher;

	private readonly _repositories = this._register(new DisposableMap<string, GitHubRepositoryModel>());
	private readonly _pullRequests = this._register(new DisposableMap<string, GitHubPullRequestModel>());
	private readonly _pullRequestReviewThreads = this._register(new DisposableMap<string, GitHubPullRequestReviewThreadsModel>());
	private readonly _ciModels = this._register(new DisposableMap<string, DisposableMap<string, GitHubPullRequestCIModel>>());

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._apiClient = this._register(instantiationService.createInstance(GitHubApiClient));

		this._repoFetcher = new GitHubRepositoryFetcher(this._apiClient);
		this._changesFetcher = new GitHubChangesFetcher(this._apiClient);
		this._prFetcher = new GitHubPRFetcher(this._apiClient);
		this._ciFetcher = new GitHubPRCIFetcher(this._apiClient);
	}

	getRepository(owner: string, repo: string): GitHubRepositoryModel {
		const key = `${owner}/${repo}`;
		let model = this._repositories.get(key);
		if (!model) {
			this._logService.trace(`${LOG_PREFIX} Creating repository model for ${key}`);
			model = new GitHubRepositoryModel(owner, repo, this._repoFetcher, this._logService);
			this._repositories.set(key, model);
		}
		return model;
	}

	getPullRequest(owner: string, repo: string, prNumber: number): GitHubPullRequestModel {
		const key = getPullRequestKey(owner, repo, prNumber);
		let model = this._pullRequests.get(key);
		if (!model) {
			this._logService.trace(`${LOG_PREFIX} Creating PR model for ${key}`);
			model = new GitHubPullRequestModel(owner, repo, prNumber, this._prFetcher, this._logService);
			this._pullRequests.set(key, model);
		}
		return model;
	}

	getPullRequestReviewThreads(owner: string, repo: string, prNumber: number): GitHubPullRequestReviewThreadsModel {
		const key = getPullRequestKey(owner, repo, prNumber);
		let model = this._pullRequestReviewThreads.get(key);
		if (!model) {
			this._logService.trace(`${LOG_PREFIX} Creating PR review threads model for ${key}`);
			model = new GitHubPullRequestReviewThreadsModel(owner, repo, prNumber, this._prFetcher, this._logService);
			this._pullRequestReviewThreads.set(key, model);
		}
		return model;
	}

	getPullRequestCI(owner: string, repo: string, prNumber: number, headSha: string): GitHubPullRequestCIModel {
		const key = getPullRequestKey(owner, repo, prNumber);
		let models = this._ciModels.get(key);
		if (!models) {
			models = new DisposableMap<string, GitHubPullRequestCIModel>();
			this._ciModels.set(key, models);
		}

		let model = models.get(headSha);
		if (!model) {
			models.clearAndDisposeAll();
			this._logService.trace(`${LOG_PREFIX} Creating CI model for ${key}/${headSha}`);
			model = new GitHubPullRequestCIModel(owner, repo, headSha, this._ciFetcher, this._logService);
			models.set(headSha, model);
		}
		return model;
	}

	getChangedFiles(owner: string, repo: string, base: string, head: string): Promise<readonly IGitHubChangedFile[]> {
		return this._changesFetcher.getChangedFiles(owner, repo, base, head);
	}

	disposePullRequest(owner: string, repo: string, prNumber: number): void {
		const key = getPullRequestKey(owner, repo, prNumber);

		this._pullRequests.deleteAndDispose(key);
		this._pullRequestReviewThreads.deleteAndDispose(key);
		this._ciModels.deleteAndDispose(key);
	}

	override dispose(): void {
		this._pullRequests.dispose();
		this._pullRequestReviewThreads.dispose();
		this._ciModels.dispose();

		super.dispose();
	}
}
