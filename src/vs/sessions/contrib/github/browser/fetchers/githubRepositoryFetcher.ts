/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGitHubRepository } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';

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

	async getRepository(owner: string, repo: string): Promise<IGitHubRepository> {
		const data = await this._apiClient.request<IGitHubRepoResponse>(
			'GET',
			`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
		);
		return {
			owner: data.owner.login,
			name: data.name,
			fullName: data.full_name,
			defaultBranch: data.default_branch,
			isPrivate: data.private,
			description: data.description ?? '',
		};
	}
}
