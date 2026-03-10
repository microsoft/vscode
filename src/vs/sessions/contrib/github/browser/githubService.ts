/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { GitHubApiClient } from './githubApiClient.js';
import { GitHubRepositoryFetcher } from './fetchers/githubRepositoryFetcher.js';
import { GitHubPRFetcher } from './fetchers/githubPRFetcher.js';
import { GitHubPRCIFetcher } from './fetchers/githubPRCIFetcher.js';
import { GitHubRepositoryModel } from './models/githubRepositoryModel.js';
import { GitHubPullRequestModel } from './models/githubPullRequestModel.js';
import { GitHubPullRequestCIModel } from './models/githubPullRequestCIModel.js';

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
	 * Get or create a reactive model for CI checks on a pull request head ref.
	 * The model is cached by owner/repo/headRef key and disposed when the service is disposed.
	 */
	getPullRequestCI(owner: string, repo: string, headRef: string): GitHubPullRequestCIModel;
}

export const IGitHubService = createDecorator<IGitHubService>('sessionsGitHubService');

const LOG_PREFIX = '[GitHubService]';

export class GitHubService extends Disposable implements IGitHubService {

	declare readonly _serviceBrand: undefined;

	private readonly _apiClient: GitHubApiClient;
	private readonly _repoFetcher: GitHubRepositoryFetcher;
	private readonly _prFetcher: GitHubPRFetcher;
	private readonly _ciFetcher: GitHubPRCIFetcher;

	private readonly _repositories = this._register(new DisposableMap<string, GitHubRepositoryModel>());
	private readonly _pullRequests = this._register(new DisposableMap<string, GitHubPullRequestModel>());
	private readonly _ciModels = this._register(new DisposableMap<string, GitHubPullRequestCIModel>());

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._apiClient = this._register(instantiationService.createInstance(GitHubApiClient));
		this._repoFetcher = new GitHubRepositoryFetcher(this._apiClient);
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
		const key = `${owner}/${repo}/${prNumber}`;
		let model = this._pullRequests.get(key);
		if (!model) {
			this._logService.trace(`${LOG_PREFIX} Creating PR model for ${key}`);
			model = new GitHubPullRequestModel(owner, repo, prNumber, this._prFetcher, this._logService);
			this._pullRequests.set(key, model);
		}
		return model;
	}

	getPullRequestCI(owner: string, repo: string, headRef: string): GitHubPullRequestCIModel {
		const key = `${owner}/${repo}/${headRef}`;
		let model = this._ciModels.get(key);
		if (!model) {
			this._logService.trace(`${LOG_PREFIX} Creating CI model for ${key}`);
			model = new GitHubPullRequestCIModel(owner, repo, headRef, this._ciFetcher, this._logService);
			this._ciModels.set(key, model);
		}
		return model;
	}
}
