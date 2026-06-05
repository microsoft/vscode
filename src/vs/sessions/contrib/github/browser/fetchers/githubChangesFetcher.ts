/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubApiClient } from '../githubApiClient.js';
import { IGitHubChangedFile } from '../../common/types.js';

interface IGitHubCompareResponse {
	readonly files: readonly {
		readonly filename: string;
		readonly previous_filename?: string;
		readonly status: IGitHubChangedFile['status'];
		readonly additions: number;
		readonly deletions: number;
	}[];
}

/**
 * Stateless fetcher for GitHub repository compare data.
 */
export class GitHubChangesFetcher {

	constructor(
		private readonly _apiClient: GitHubApiClient,
	) { }

	async getChangedFiles(owner: string, repo: string, base: string, head: string): Promise<readonly IGitHubChangedFile[]> {
		const response = await this._apiClient.request<IGitHubCompareResponse>(
			'GET',
			`/repos/${e(owner)}/${e(repo)}/compare/${e(base)}...${e(head)}`,
			'githubApi.getChangedFiles'
		);

		return response.data?.files.map(file => ({
			filename: file.filename,
			previous_filename: file.previous_filename,
			status: file.status,
			additions: file.additions,
			deletions: file.deletions,
		})) ?? [];
	}
}

const e = encodeURIComponent;
