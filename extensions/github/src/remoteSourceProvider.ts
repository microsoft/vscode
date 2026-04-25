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

interface RankedRemoteSource extends RemoteSource {
	readonly fullName: string;
	readonly stars: number;
}

function asRemoteSource(raw: RemoteSourceResponse): RankedRemoteSource {
	const protocol = workspace.getConfiguration('github').get<'https' | 'ssh'>('gitProtocol');
	return {
		name: `$(github) ${raw.full_name}`,
		description: `${raw.stargazers_count > 0 ? `$(star-full) ${raw.stargazers_count}` : ''
			}`,
		detail: raw.description || undefined,
		url: protocol === 'https' ? raw.clone_url : raw.ssh_url,
		fullName: raw.full_name,
		stars: raw.stargazers_count
	};
}

/**
 * Computes a match tier for a repository's full name against the query.
 * Lower numbers indicate a better match. The tiers are designed to provide a
 * stable, deterministic ordering as the user types so that results do not
 * visibly shuffle when async batches arrive (see #163603).
 *
 * Tiers:
 *   0 - exact match on owner/repo or repo name (case-insensitive)
 *   1 - repo name starts with the query
 *   2 - full name (owner/repo) starts with the query
 *   3 - repo name or full name contains the query
 *   4 - no textual match
 */
export function getMatchTier(fullName: string, query: string | undefined): number {
	if (!query) {
		return 4;
	}

	const q = query.toLowerCase();
	const full = fullName.toLowerCase();
	const slash = full.indexOf('/');
	const repo = slash >= 0 ? full.slice(slash + 1) : full;

	if (repo === q || full === q) {
		return 0;
	}
	if (repo.startsWith(q)) {
		return 1;
	}
	if (full.startsWith(q)) {
		return 2;
	}
	if (repo.includes(q) || full.includes(q)) {
		return 3;
	}
	return 4;
}

/**
 * Stably orders the merged set of remote sources so that the displayed list
 * does not jump around as new async results arrive. The previous code relied
 * on Map insertion order combined with the GitHub search API's relevance
 * ranking, which changes per keystroke and surfaces forks above canonical
 * repositories. This function applies a deterministic local ordering driven
 * by the query rather than the API response order.
 */
export function sortRemoteSources<T extends RankedRemoteSource>(sources: T[], query: string | undefined): T[] {
	return sources.slice().sort((a, b) => {
		const tierA = getMatchTier(a.fullName, query);
		const tierB = getMatchTier(b.fullName, query);
		if (tierA !== tierB) {
			return tierA - tierB;
		}
		if (a.stars !== b.stars) {
			return b.stars - a.stars;
		}
		return a.fullName.localeCompare(b.fullName);
	});
}

export class GithubRemoteSourceProvider implements RemoteSourceProvider {

	readonly name = 'GitHub';
	readonly icon = 'github';
	readonly supportsQuery = true;

	private userReposCache: RankedRemoteSource[] = [];

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

		const map = new Map<string, RankedRemoteSource>();

		for (const group of all) {
			for (const remoteSource of group) {
				map.set(remoteSource.name, remoteSource);
			}
		}

		// Apply a deterministic local sort so that results do not visibly
		// shuffle as async batches arrive while the user is typing (#163603).
		return sortRemoteSources([...map.values()], query);
	}

	private async getUserRemoteSources(octokit: Octokit, query?: string): Promise<RankedRemoteSource[]> {
		if (!query) {
			const user = await octokit.users.getAuthenticated({});
			const username = user.data.login;
			const res = await octokit.repos.listForAuthenticatedUser({ username, sort: 'updated', per_page: 100 });
			this.userReposCache = res.data.map(asRemoteSource);
		}

		return this.userReposCache;
	}

	private async getQueryRemoteSources(octokit: Octokit, query?: string): Promise<RankedRemoteSource[]> {
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
