/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IGitHubRepository } from '../../common/types.js';
import { GitHubApiClient, IGitHubApiRequestOptions, IGitHubApiResponse } from '../githubApiClient.js';

interface IGitHubRepoResponse {
	readonly name: string;
	readonly full_name: string;
	readonly owner: { readonly login: string };
	readonly default_branch: string;
	readonly private: boolean;
	readonly description: string | null;
}

/**
 * Stateless fetcher for GitHub repository data.
 * All methods return raw typed data with no caching or state.
 */
export class GitHubRepositoryFetcher {

	constructor(
		private readonly _apiClient: GitHubApiClient,
	) { }

	async getRepositories(query: string, token: CancellationToken): Promise<readonly IGitHubRepository[]> {
		const options: IGitHubApiRequestOptions = { token, createAuthenticationSession: false, authenticationScopes: ['repo'] };
		if (query.trim()) {
			const [user, organizations] = await Promise.all([
				this._apiClient.request<{ readonly login: string }>('GET', '/user', 'githubApi.getRepositorySearchUser', options),
				this._apiClient.request<readonly { readonly login: string }[]>('GET', '/user/orgs?per_page=100', 'githubApi.getRepositorySearchOrganizations', options),
			]);
			if (!user.data?.login || !organizations.data) {
				throw new Error('GitHub did not return an account and organizations for repository search');
			}
			const scope = [`user:${user.data.login}`, ...organizations.data.map(organization => `org:${organization.login}`)].join(' ');
			const response = await this._apiClient.request<{ readonly items: readonly IGitHubRepoResponse[] }>(
				'GET',
				`/search/repositories?q=${encodeURIComponent(`${query.trim()} in:name fork:true ${scope}`)}&sort=updated&per_page=100`,
				'githubApi.searchRepositories',
				options,
			);
			return response.data?.items.map(toGitHubRepository) ?? [];
		}

		const response = await this._apiClient.request<readonly IGitHubRepoResponse[]>(
			'GET',
			'/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
			'githubApi.getRepositories',
			options,
		);
		return response.data?.map(toGitHubRepository) ?? [];
	}

	async getRepository(owner: string, repo: string, etag?: string): Promise<IGitHubApiResponse<IGitHubRepository>> {
		const response = await this._apiClient.request<IGitHubRepoResponse>(
			'GET',
			`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
			'githubApi.getRepository',
			{ etag }
		);

		return {
			...response,
			data: response.data ? toGitHubRepository(response.data) : undefined
		};
	}
}

function toGitHubRepository(repository: IGitHubRepoResponse): IGitHubRepository {
	return {
		owner: repository.owner.login,
		name: repository.name,
		fullName: repository.full_name,
		defaultBranch: repository.default_branch,
		isPrivate: repository.private,
		description: repository.description ?? '',
	};
}
