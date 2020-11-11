/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { API as GitAPI, RemoteSourceProvider, RemoteSource, Repository } from './typings/git';
import { getOctokit } from './auth';
import { Octokit } from '@octokit/rest';
import { publishRepository } from './publish';

function asRemoteSource(raw: any): RemoteSource {
	return {
		name: `$(github) ${raw.full_name}`,
		description: raw.description || undefined,
		url: raw.clone_url
	};
}

export class GithubRemoteSourceProvider implements RemoteSourceProvider {

	readonly name = 'GitHub';
	readonly icon = 'github';
	readonly supportsQuery = true;

	private userReposCache: RemoteSource[] = [];

	constructor(private gitAPI: GitAPI) { }

	async getRemoteSources(query?: string): Promise<RemoteSource[]> {
		const octokit = await getOctokit();

		if (query) {
			const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\.git/i.exec(query)
				|| /^git@github\.com:([^/]+)\/([^/]+)\.git/i.exec(query);

			if (match) {
				const raw = await octokit.repos.get({ owner: match[1], repo: match[2] });
				return [asRemoteSource(raw.data)];
			}
		}

		const all = await Promise.all([
			this.getUserRemoteSources(octokit, query),
			this.getQueryRemoteSources(octokit, query)
		]);

		const map = new Map<string, RemoteSource>();

		for (const group of all) {
			for (const remoteSource of group) {
				map.set(remoteSource.name, remoteSource);
			}
		}

		return [...map.values()];
	}

	private async getUserRemoteSources(octokit: Octokit, query?: string): Promise<RemoteSource[]> {
		if (!query) {
			const user = await octokit.users.getAuthenticated({});
			const username = user.data.login;
			const res = await octokit.repos.listForUser({ username, sort: 'updated', per_page: 100 });
			this.userReposCache = res.data.map(asRemoteSource);
		}

		return this.userReposCache;
	}

	private async getQueryRemoteSources(octokit: Octokit, query?: string): Promise<RemoteSource[]> {
		if (!query) {
			return [];
		}

		const raw = await octokit.search.repos({ q: query, sort: 'updated' });
		return raw.data.items.map(asRemoteSource);
	}

	publishRepository(repository: Repository): Promise<void> {
		return publishRepository(this.gitAPI, repository);
	}
}
