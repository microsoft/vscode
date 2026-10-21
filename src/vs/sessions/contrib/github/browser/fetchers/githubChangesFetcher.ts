/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubApiClient } from '../githubApiClient.js';
import { IGitHubChangedFile } from '../../common/types.js';

export class GitHubChangesFetcher {
	constructor(private readonly _client: GitHubApiClient) { }

	getChangedFiles(owner: string, repo: string, base: string, head: string): Promise<readonly IGitHubChangedFile[]> {
		return this._client.withClient(async (client, signal) => {
			const comparison = await client.repositories.compare({ owner, name: repo }, base, head, signal);
			return comparison.files?.map(file => ({
				filename: file.filename,
				previous_filename: file.previous_filename,
				status: file.status,
				additions: file.additions,
				deletions: file.deletions,
				patch: file.patch,
			})) ?? [];
		});
	}
}
