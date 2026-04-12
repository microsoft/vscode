/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Uri, env, l10n, workspace } from 'vscode';
import { getOctokit } from './auth.js';
import { getRepositoryFromQuery, getRepositoryFromUrl } from './util.js';
import { getBranchLink, getVscodeDevHost } from './links.js';
function asRemoteSource(raw) {
    const protocol = workspace.getConfiguration('github').get('gitProtocol');
    return {
        name: `$(github) ${raw.full_name}`,
        description: `${raw.stargazers_count > 0 ? `$(star-full) ${raw.stargazers_count}` : ''}`,
        detail: raw.description || undefined,
        url: protocol === 'https' ? raw.clone_url : raw.ssh_url
    };
}
export class GithubRemoteSourceProvider {
    name = 'GitHub';
    icon = 'github';
    supportsQuery = true;
    userReposCache = [];
    async getRemoteSources(query) {
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
        const map = new Map();
        for (const group of all) {
            for (const remoteSource of group) {
                map.set(remoteSource.name, remoteSource);
            }
        }
        return [...map.values()];
    }
    async getUserRemoteSources(octokit, query) {
        if (!query) {
            const user = await octokit.users.getAuthenticated({});
            const username = user.data.login;
            const res = await octokit.repos.listForAuthenticatedUser({ username, sort: 'updated', per_page: 100 });
            this.userReposCache = res.data.map(asRemoteSource);
        }
        return this.userReposCache;
    }
    async getQueryRemoteSources(octokit, query) {
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
    async getBranches(url) {
        const repository = getRepositoryFromUrl(url);
        if (!repository) {
            return [];
        }
        const octokit = await getOctokit();
        const branches = [];
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
    async getRemoteSourceActions(url) {
        const repository = getRepositoryFromUrl(url);
        if (!repository) {
            return [];
        }
        return [{
                label: l10n.t('Open on GitHub'),
                icon: 'github',
                run(branch) {
                    const link = getBranchLink(url, branch);
                    env.openExternal(Uri.parse(link));
                }
            }, {
                label: l10n.t('Checkout on vscode.dev'),
                icon: 'globe',
                run(branch) {
                    const link = getBranchLink(url, branch, getVscodeDevHost());
                    env.openExternal(Uri.parse(link));
                }
            }];
    }
}
//# sourceMappingURL=remoteSourceProvider.js.map