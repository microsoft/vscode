/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RemoteSourceProvider, RemoteSource } from './typings/git';
import { getOctokit } from './octokit';
import { Octokit } from '@octokit/rest';

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

	async getRemoteSources(query?: string): Promise<RemoteSource[]> {
		const octokit = await getOctokit();
		const [fromUser, fromQuery] = await Promise.all([
			this.getUserRemoteSources(octokit, query),
			this.getQueryRemoteSources(octokit, query)
		]);

		const userRepos = new Set(fromUser.map(r => r.name));

		return [
			...fromUser,
			...fromQuery.filter(r => !userRepos.has(r.name))
		];
	}

	private async getUserRemoteSources(octokit: Octokit, query?: string): Promise<RemoteSource[]> {
		if (!query) {
			const res = await octokit.repos.list({ sort: 'pushed', per_page: 100 });
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
}
