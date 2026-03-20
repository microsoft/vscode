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
	readonly stargazers_count?: number;
	readonly clone_url?: string;
	readonly ssh_url?: string;
};

function asRemoteSource(raw: RemoteSourceResponse): RemoteSource {
	const protocol = workspace.getConfiguration('github').get<'https' | 'ssh'>('gitProtocol');
	const stars = raw.stargazers_count ?? 0;
	const cloneUrl = raw.clone_url ?? `https://github.com/${raw.full_name}.git`;
	const sshUrl = raw.ssh_url ?? `git@github.com:${raw.full_name}.git`;
	return {
		name: `$(github) ${raw.full_name}`,
		description: `${stars > 0 ? `$(star-full) ${stars}` : ''
			}`,
		detail: raw.description || undefined,
		url: protocol === 'https' ? cloneUrl : sshUrl
	};
}

export class GithubRemoteSourceProvider implements RemoteSourceProvider {

	readonly name = 'GitHub';
	readonly icon = 'github';
	readonly supportsQuery = true;

	private userReposCache: RemoteSource[] = [];
	private userRepoCachePopulated = false;

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
			this.getUserRemoteSources(octokit, query),
			this.getQueryRemoteSources(octokit, query),
		]);

		const map = new Map<string, RemoteSource>();

		for (const group of all) {
			for (const remoteSource of group) {
				const key = typeof remoteSource.url === 'string' ? remoteSource.url : remoteSource.url[0];
				if (!map.has(key)) {
					map.set(key, remoteSource);
				}
			}
		}

		return [...map.values()];
	}

	private async getUserRemoteSources(octokit: Octokit, query?: string): Promise<RemoteSource[]> {
		if (!this.userRepoCachePopulated) {
			try {
				const [userRepos, orgRepos] = await Promise.all([
					this.fetchUserRepos(octokit),
					this.fetchOrgRepos(octokit),
				]);
				this.userReposCache = [...userRepos, ...orgRepos];
				this.userRepoCachePopulated = true;
			} catch {
				// Swallow errors so that remote source querying can continue,
				// and allow a retry on the next invocation.
				this.userReposCache = [];
			}
		}

		if (!query) {
			return this.userReposCache;
		}

		const lowerQuery = query.toLowerCase();
		return this.userReposCache.filter(repo =>
			repo.name.toLowerCase().includes(lowerQuery) ||
			(repo.detail && repo.detail.toLowerCase().includes(lowerQuery))
		);
	}

	private async fetchUserRepos(octokit: Octokit): Promise<RemoteSource[]> {
		const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, { sort: 'updated', per_page: 100 });
		return repos.map(asRemoteSource);
	}

	private async fetchOrgRepos(octokit: Octokit): Promise<RemoteSource[]> {
		try {
			const orgs = await octokit.paginate(octokit.orgs.listForAuthenticatedUser, { per_page: 100 });

			if (orgs.length === 0) {
				return [];
			}

			const orgReposPromises = orgs.map(org =>
				octokit.paginate(octokit.repos.listForOrg, { org: org.login, sort: 'updated', per_page: 100 })
					.then(repos => repos.map(asRemoteSource))
					.catch(() => [] as RemoteSource[])
			);

			const orgReposArrays = await Promise.all(orgReposPromises);
			return orgReposArrays.flat();
		} catch {
			return [];
		}
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
