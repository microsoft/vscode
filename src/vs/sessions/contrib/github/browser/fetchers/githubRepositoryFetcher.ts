/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Repository } from '../../../../../platform/github/common/core/repositories.js';
import { RepositorySearchItem } from '../../../../../platform/github/common/core/search.js';
import { IGitHubRepository } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';

export class GitHubRepositoryFetcher {
	constructor(readonly client: GitHubApiClient) { }

	getRepositories(query: string, token: CancellationToken): Promise<readonly IGitHubRepository[]> {
		return this.client.withClient(async (client, signal) => {
			if (query.trim()) {
				const [user, organizations] = await Promise.all([
					client.users.getAuthenticated(signal),
					client.organizations.listForAuthenticatedUser(signal, { query: { per_page: 100 } }),
				]);
				const scope = [`user:${user.login}`, ...organizations.map(organization => `org:${organization.login}`)].join(' ');
				const response = await client.search.repositories(`${query.trim()} in:name fork:true ${scope}`, signal, {
					query: { sort: 'updated', per_page: 100 },
				});
				return response.items.map(toGitHubRepository);
			}
			const repositories = await client.repositories.listForAuthenticatedUser(signal, {
				query: { per_page: 100, sort: 'updated', affiliation: 'owner,collaborator,organization_member' },
			});
			return repositories.map(toGitHubRepository);
		}, token);
	}

	getRepository(owner: string, repo: string, token?: CancellationToken): Promise<IGitHubRepository> {
		return this.client.withClient(async (client, signal) =>
			toGitHubRepository(await client.repositories.get({ owner, name: repo }, signal)), token);
	}
}

function toGitHubRepository(repository: Repository | RepositorySearchItem): IGitHubRepository {
	return {
		owner: repository.owner?.login ?? repository.full_name.split('/')[0],
		name: repository.name,
		fullName: repository.full_name,
		defaultBranch: repository.default_branch,
		isPrivate: repository.private,
		description: repository.description ?? '',
	};
}
