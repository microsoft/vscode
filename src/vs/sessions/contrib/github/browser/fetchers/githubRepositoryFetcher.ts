/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGitHubRepository } from '../../common/types.js';
import { GitHubApiClient, IGitHubApiResponse } from '../githubApiClient.js';

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

	async getRepository(owner: string, repo: string, etag?: string): Promise<IGitHubApiResponse<IGitHubRepository>> {
		const response = await this._apiClient.request2<IGitHubRepoResponse>(
			'GET',
			`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
			'githubApi.getRepository',
			undefined,
			etag
		);

		return {
			...response,
			data: response.data
				? {
					owner: response.data.owner.login,
					name: response.data.name,
					fullName: response.data.full_name,
					defaultBranch: response.data.default_branch,
					isPrivate: response.data.private,
					description: response.data.description ?? '',
				}
				: undefined
		};
	}
}
