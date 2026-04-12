/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { l10n, workspace } from 'vscode';
import { DisposableStore, getRepositoryDefaultRemote, getRepositoryDefaultRemoteUrl, getRepositoryFromUrl, groupBy, sequentialize } from './util.js';
import { AuthenticationError } from './auth.js';
import { getAvatarLink } from './links.js';
const ISSUE_EXPRESSION = /(([A-Za-z0-9_.\-]+)\/([A-Za-z0-9_.\-]+))?(#|GH-)([1-9][0-9]*)($|\b)/g;
const ASSIGNABLE_USERS_QUERY = `
	query assignableUsers($owner: String!, $repo: String!) {
		repository(owner: $owner, name: $repo) {
			assignableUsers(first: 100) {
				nodes {
					id
					login
					name
					email
					avatarUrl
				}
			}
		}
	}
`;
const COMMIT_AUTHOR_QUERY = `
	query commitAuthor($owner: String!, $repo: String!, $commit: String!) {
		repository(owner: $owner, name: $repo) {
			object(expression: $commit) {
				... on Commit {
					author {
						name
						email
						avatarUrl
						user {
							id
							login
						}
					}
				}
			}
		}
	}
`;
function getUserIdFromNoReplyEmail(email) {
    const match = email?.match(/^([0-9]+)\+[^@]+@users\.noreply\.github\.com$/);
    return match?.[1];
}
function compareAvatarQuery(a, b) {
    // Email
    const emailComparison = (a.authorEmail ?? '').localeCompare(b.authorEmail ?? '');
    if (emailComparison !== 0) {
        return emailComparison;
    }
    // Name
    return (a.authorName ?? '').localeCompare(b.authorName ?? '');
}
export class GitHubSourceControlHistoryItemDetailsProvider {
    _gitAPI;
    _octokitService;
    _logger;
    _isUserAuthenticated = true;
    _store = new Map();
    _disposables = new DisposableStore();
    constructor(_gitAPI, _octokitService, _logger) {
        this._gitAPI = _gitAPI;
        this._octokitService = _octokitService;
        this._logger = _logger;
        this._disposables.add(this._gitAPI.onDidCloseRepository(repository => this._onDidCloseRepository(repository)));
        this._disposables.add(this._octokitService.onDidChangeSessions(() => {
            this._isUserAuthenticated = true;
            this._store.clear();
        }));
        this._disposables.add(workspace.onDidChangeConfiguration(e => {
            if (!e.affectsConfiguration('github.showAvatar')) {
                return;
            }
            this._store.clear();
        }));
    }
    async provideAvatar(repository, query) {
        this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][provideAvatar] Avatar resolution for ${query.commits.length} commit(s) in ${repository.rootUri.fsPath}.`);
        const config = workspace.getConfiguration('github', repository.rootUri);
        const showAvatar = config.get('showAvatar', true) === true;
        if (!this._isUserAuthenticated || !showAvatar) {
            this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][provideAvatar] Avatar resolution is disabled. (${showAvatar === false ? 'setting' : 'auth'})`);
            return undefined;
        }
        // upstream -> origin -> first
        const descriptor = getRepositoryDefaultRemote(repository, ['upstream', 'origin']);
        if (!descriptor) {
            this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][provideAvatar] Repository does not have a GitHub remote.`);
            return undefined;
        }
        try {
            const logs = { cached: 0, email: 0, github: 0, incomplete: 0 };
            // Warm up the in-memory cache with the first page
            // (100 users) from this list of assignable users
            await this._loadAssignableUsers(descriptor);
            const repositoryStore = this._store.get(this._getRepositoryKey(descriptor));
            if (!repositoryStore) {
                return undefined;
            }
            // Group the query by author
            const authorQuery = groupBy(query.commits, compareAvatarQuery);
            const results = new Map();
            await Promise.all(authorQuery.map(async (commits) => {
                if (commits.length === 0) {
                    return;
                }
                // Query the in-memory cache for the user
                const avatarUrl = repositoryStore.users.find(user => user.email === commits[0].authorEmail || user.name === commits[0].authorName)?.avatarUrl;
                // Cache hit
                if (avatarUrl) {
                    // Add avatar for each commit
                    logs.cached += commits.length;
                    commits.forEach(({ hash }) => results.set(hash, `${avatarUrl}&s=${query.size}`));
                    return;
                }
                // Check if any of the commit are being tracked in the list
                // of known commits that have incomplte author information
                if (commits.some(({ hash }) => repositoryStore.commits.has(hash))) {
                    commits.forEach(({ hash }) => results.set(hash, undefined));
                    return;
                }
                // Try to extract the user identifier from GitHub no-reply emails
                const userIdFromEmail = getUserIdFromNoReplyEmail(commits[0].authorEmail);
                if (userIdFromEmail) {
                    logs.email += commits.length;
                    const avatarUrl = getAvatarLink(userIdFromEmail, query.size);
                    commits.forEach(({ hash }) => results.set(hash, avatarUrl));
                    return;
                }
                // Get the commit details
                const commitAuthor = await this._getCommitAuthor(descriptor, commits[0].hash);
                if (!commitAuthor) {
                    // The commit has incomplete author information, so
                    // we should not try to query the authors details again
                    logs.incomplete += commits.length;
                    for (const { hash } of commits) {
                        repositoryStore.commits.add(hash);
                        results.set(hash, undefined);
                    }
                    return;
                }
                // Save the user to the cache
                repositoryStore.users.push(commitAuthor);
                // Add avatar for each commit
                logs.github += commits.length;
                commits.forEach(({ hash }) => results.set(hash, `${commitAuthor.avatarUrl}&s=${query.size}`));
            }));
            this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][provideAvatar] Avatar resolution for ${query.commits.length} commit(s) in ${repository.rootUri.fsPath} complete: ${JSON.stringify(logs)}.`);
            return results;
        }
        catch (err) {
            // A GitHub authentication session could be missing if the user has not yet
            // signed in with their GitHub account or they have signed out. Disable the
            // avatar resolution until the user signes in with their GitHub account.
            if (err instanceof AuthenticationError) {
                this._isUserAuthenticated = false;
            }
            return undefined;
        }
    }
    async provideHoverCommands(repository) {
        // origin -> upstream -> first
        const url = getRepositoryDefaultRemoteUrl(repository, ['origin', 'upstream']);
        if (!url) {
            return undefined;
        }
        return [{
                title: l10n.t('{0} Open on GitHub', '$(github)'),
                tooltip: l10n.t('Open on GitHub'),
                command: 'github.openOnGitHub',
                arguments: [url]
            }];
    }
    async provideMessageLinks(repository, message) {
        // upstream -> origin -> first
        const descriptor = getRepositoryDefaultRemote(repository, ['upstream', 'origin']);
        if (!descriptor) {
            return undefined;
        }
        return message.replace(ISSUE_EXPRESSION, (match, _group1, owner, repo, _group2, number) => {
            if (!number || Number.isNaN(parseInt(number))) {
                return match;
            }
            const label = owner && repo
                ? `${owner}/${repo}#${number}`
                : `#${number}`;
            owner = owner ?? descriptor.owner;
            repo = repo ?? descriptor.repo;
            return `[${label}](https://github.com/${owner}/${repo}/issues/${number})`;
        });
    }
    _onDidCloseRepository(repository) {
        for (const remote of repository.state.remotes) {
            if (!remote.fetchUrl) {
                continue;
            }
            const repository = getRepositoryFromUrl(remote.fetchUrl);
            if (!repository) {
                continue;
            }
            this._store.delete(this._getRepositoryKey(repository));
        }
    }
    async _loadAssignableUsers(descriptor) {
        if (this._store.has(this._getRepositoryKey(descriptor))) {
            return;
        }
        this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][_loadAssignableUsers] Querying assignable user(s) for ${descriptor.owner}/${descriptor.repo}.`);
        try {
            const graphql = await this._octokitService.getOctokitGraphql();
            const { repository } = await graphql(ASSIGNABLE_USERS_QUERY, descriptor);
            const users = [];
            for (const node of repository.assignableUsers.nodes ?? []) {
                if (!node) {
                    continue;
                }
                users.push({
                    id: node.id,
                    login: node.login,
                    name: node.name,
                    email: node.email,
                    avatarUrl: node.avatarUrl,
                });
            }
            this._store.set(this._getRepositoryKey(descriptor), { users, commits: new Set() });
            this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][_loadAssignableUsers] Successfully queried assignable user(s) for ${descriptor.owner}/${descriptor.repo}: ${users.length} user(s).`);
        }
        catch (err) {
            this._logger.warn(`[GitHubSourceControlHistoryItemDetailsProvider][_loadAssignableUsers] Failed to load assignable user(s) for ${descriptor.owner}/${descriptor.repo}: ${err}`);
            throw err;
        }
    }
    async _getCommitAuthor(descriptor, commit) {
        this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][_getCommitAuthor] Querying commit author for ${descriptor.owner}/${descriptor.repo}/${commit}.`);
        try {
            const graphql = await this._octokitService.getOctokitGraphql();
            const { repository } = await graphql(COMMIT_AUTHOR_QUERY, { ...descriptor, commit });
            const commitAuthor = repository.object.author;
            if (!commitAuthor?.user?.id || !commitAuthor.user?.login ||
                !commitAuthor?.name || !commitAuthor?.email || !commitAuthor?.avatarUrl) {
                this._logger.info(`[GitHubSourceControlHistoryItemDetailsProvider][_getCommitAuthor] Incomplete commit author for ${descriptor.owner}/${descriptor.repo}/${commit}: ${JSON.stringify(repository.object)}`);
                return undefined;
            }
            const user = {
                id: commitAuthor.user.id,
                login: commitAuthor.user.login,
                name: commitAuthor.name,
                email: commitAuthor.email,
                avatarUrl: commitAuthor.avatarUrl,
            };
            this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][_getCommitAuthor] Successfully queried commit author for ${descriptor.owner}/${descriptor.repo}/${commit}: ${user.login}.`);
            return user;
        }
        catch (err) {
            this._logger.warn(`[GitHubSourceControlHistoryItemDetailsProvider][_getCommitAuthor] Failed to get commit author for ${descriptor.owner}/${descriptor.repo}/${commit}: ${err}`);
            throw err;
        }
    }
    _getRepositoryKey(descriptor) {
        return `${descriptor.owner}/${descriptor.repo}`;
    }
    dispose() {
        this._disposables.dispose();
    }
}
__decorate([
    sequentialize
], GitHubSourceControlHistoryItemDetailsProvider.prototype, "_loadAssignableUsers", null);
//# sourceMappingURL=historyItemDetailsProvider.js.map