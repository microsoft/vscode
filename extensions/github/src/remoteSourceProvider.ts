/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, env, l10n, workspace } from 'vscode';
import { RemoteSourceProvider, RemoteSource, RemoteSourceAction } from './typings/git-base.js';
import { getOctokit } from './auth.js';
import { Octokit } from '@octokit/rest';
import { getRepositoryFromQuery, getRepositoryFromUrl } from './util.js';
import { getBranchLink, getVscodeDevHost } from './links.js';

type RemoteSourceResponse = {
	readonly full_name: string;
	readonly description: string | null;
	readonly stargazers_count: number;
	readonly clone_url: string;
	readonly ssh_url: string;
};

function asRemoteSource(raw: RemoteSourceResponse): RemoteSource {
	const protocol = workspace.getConfiguration('github').get<'https' | 'ssh'>('gitProtocol');
	return {
		name: `$(github) ${raw.full_name}`,
		description: `${raw.stargazers_count > 0 ? `$(star-full) ${raw.stargazers_count}` : ''
			}`,
		detail: raw.description || undefined,
		url: protocol === 'https' ? raw.clone_url : raw.ssh_url
	};
}

export class GithubRemoteSourceProvider implements RemoteSourceProvider {

	readonly name = 'GitHub';
	readonly icon = 'github';
	readonly supportsQuery = true;

	private userReposCache: RemoteSource[] = [];

	async getRemoteSources(query?: string): Promise<RemoteSource[]> {
		const octokit = await getOctokit();

		if (query) {
			const repository = getRepositoryFromUrl(query);

			if (repository) {
				const raw = await octokit.repos.get(repository);
				return [asRemoteSource(raw.data)];
			}
		}

		const all = await Promise.all([
			this.getQueryRemoteSources(octokit, query),
			this.getUserRemoteSources(octokit, query),
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
			const res = await octokit.repos.listForAuthenticatedUser({ username, sort: 'updated', per_page: 100 });
			this.userReposCache = res.data.map(asRemoteSource);
		}

		return this.userReposCache;
	}

	private async getQueryRemoteSources(octokit: Octokit, query?: string): Promise<RemoteSource[]> {
		if (!query) {
			return [];
		}

		const repository = getRepositoryFromQuery(query);

		if (repository) {
			query = `user:${repository.owner}+${repository.repo}`;
		}

		query += ` fork:true`;

		const raw = await octokit.search.repos({ q: query, sort: 'stars' });
		return raw.data.items.map(asRemoteSource);
	}

	async getBranches(url: string): Promise<string[]> {
		const repository = getRepositoryFromUrl(url);

		if (!repository) {
			return [];
		}

		const octokit = await getOctokit();

		const branches: string[] = [];
		let page = 1;

		while (true) {
			const res = await octokit.repos.listBranches({ ...repository, per_page: 100, page });

			if (res.data.length === 0) {
				break;
			}

			branches.push(...res.data.map(b => b.name));
			page++;
		}

		const repo = await octokit.repos.get(repository);
		const defaultBranch = repo.data.default_branch;

		return branches.sort((a, b) => a === defaultBranch ? -1 : b === defaultBranch ? 1 : 0);
	}

	async getRemoteSourceActions(url: string): Promise<RemoteSourceAction[]> {
		const repository = getRepositoryFromUrl(url);
		if (!repository) {
			return [];
		}

		return [{
			label: l10n.t('Open on GitHub'),
			icon: 'github',
			run(branch: string) {
				const link = getBranchLink(url, branch);
				env.openExternal(Uri.parse(link));
			}
		}, {
			label: l10n.t('Checkout on vscode.dev'),
			icon: 'globe',
			run(branch: string) {
				const link = getBranchLink(url, branch, getVscodeDevHost());
				env.openExternal(Uri.parse(link));
			}
		}];
	}
}
