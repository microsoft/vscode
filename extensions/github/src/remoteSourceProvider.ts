/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, env, l10n, workspace } from 'vscode';
import { RemoteSourceProvider, RemoteSource, RemoteSourceAction } from './typings/git-base.js';
import { GitHubService } from './auth.js';
import type { GitHubClient } from '@vscode/internal-github';
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
	private userReposClient: GitHubClient | undefined;

	constructor(private readonly githubService: GitHubService) { }

	async getRemoteSources(query?: string): Promise<RemoteSource[]> {
		const client = await this.githubService.getClient();

		if (query) {
			const repository = getRepositoryFromUrl(query);

			if (repository) {
				const raw = await client.repositories.get(repository);
				return [asRemoteSource(raw)];
			}
		}

		const all = await Promise.all([
			this.getQueryRemoteSources(client, query),
			this.getUserRemoteSources(client, query),
		]);

		const map = new Map<string, RemoteSource>();

		for (const group of all) {
			for (const remoteSource of group) {
				map.set(remoteSource.name, remoteSource);
			}
		}

		return [...map.values()];
	}

	private async getUserRemoteSources(client: GitHubClient, query?: string): Promise<RemoteSource[]> {
		if (this.userReposClient !== client) {
			this.userReposCache = [];
			this.userReposClient = client;
		}
		if (!query) {
			const repositories = await client.repositories.listForAuthenticatedUser({ sort: 'updated', per_page: 100 });
			const remoteSources = repositories.map(asRemoteSource);
			if (this.userReposClient === client) {
				this.userReposCache = remoteSources;
			}
			return remoteSources;
		}

		return this.userReposCache;
	}

	private async getQueryRemoteSources(client: GitHubClient, query?: string): Promise<RemoteSource[]> {
		if (!query) {
			return [];
		}

		const repository = getRepositoryFromQuery(query);

		if (repository) {
			query = `user:${repository.owner} ${repository.repo}`;
		}

		query += ` fork:true`;

		const repositories = await client.search.repositories(query);
		return repositories.map(asRemoteSource);
	}

	async getBranches(url: string): Promise<string[]> {
		const repository = getRepositoryFromUrl(url);

		if (!repository) {
			return [];
		}

		const client = await this.githubService.getClient();

		const branches: string[] = [];
		let page = 1;

		while (true) {
			const result = await client.repositories.listBranches(repository, { per_page: 100, page });

			if (result.length === 0) {
				break;
			}

			branches.push(...result.map(b => b.name));
			page++;
		}

		const repo = await client.repositories.get(repository);
		const defaultBranch = repo.default_branch;

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
