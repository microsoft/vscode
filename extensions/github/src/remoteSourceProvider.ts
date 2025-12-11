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
import { getSelectedCategory, setSelectedCategory } from './categoryState.js';


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

	async setRepoFilter(filter: 'user' | 'orgs' | 'all'): Promise<void> {
		setSelectedCategory(filter);
	}

	async getRemoteSources(query?: string): Promise<RemoteSource[]> {
		const octokit = await getOctokit();

		// ---------------------------------------------------------------
		// 1. Direct URL → clone single repo
		// ---------------------------------------------------------------
		if (query) {
			const repository = getRepositoryFromUrl(query);
			if (repository) {
				const raw = await octokit.repos.get(repository);
				return [asRemoteSource(raw.data)];
			}

			// Search mode (typing into search bar)
			return this.getQueryRemoteSources(octokit, query);
		}

		// ---------------------------------------------------------------
		// 2. No query → use filtered repositories (user/org/all)
		// ---------------------------------------------------------------
		return this.getUserRemoteSources(octokit);
	}

	private async getUserRemoteSources(octokit: Octokit): Promise<RemoteSource[]> {
		const mode = getSelectedCategory() ?? 'user';

		this.userReposCache = [];

		// ============================
		// USER REPOS
		// ============================
		if (mode === 'user' || mode === 'all') {
			const res = await octokit.repos.listForAuthenticatedUser({
				sort: 'updated',
				per_page: 100
			});

			this.userReposCache.push(
				...res.data.map(r => ({
					...asRemoteSource(r as RemoteSourceResponse),
					name: `[User] ${r.full_name}`
				}))
			);
		}

		// ============================
		// ORG REPOS
		// ============================
		if (mode === 'orgs' || mode === 'all') {
			const orgs = await octokit.orgs.listForAuthenticatedUser();

			for (const org of orgs.data) {
				const repos = await octokit.repos.listForOrg({
					org: org.login,
					per_page: 100
				});

				this.userReposCache.push(
					...repos.data.map(r => ({
						...asRemoteSource(r as RemoteSourceResponse),
						name: `[Org: ${org.login}] ${r.full_name}`
					}))
				);
			}
		}

		return this.userReposCache;
	}

	private async getQueryRemoteSources(octokit: Octokit, query: string): Promise<RemoteSource[]> {
		const repository = getRepositoryFromQuery(query);

		if (repository) {
			query = `user:${repository.owner}+${repository.repo}`;
		}

		query += ` fork:true`;

		const raw = await octokit.search.repos({
			q: query,
			sort: 'stars'
		});

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
