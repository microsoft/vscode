/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { authentication, Command, l10n, LogOutputChannel } from 'vscode';
import { Commit, Repository as GitHubRepository, Maybe } from '@octokit/graphql-schema';
import { API, Repository, SourceControlHistoryItemDetailsProvider } from './typings/git';
import { DisposableStore, getRepositoryDefaultRemote, getRepositoryDefaultRemoteUrl, getRepositoryFromUrl, sequentialize } from './util';
import { AuthenticationError, getOctokitGraphql } from './auth';

const AVATAR_SIZE = 20;

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
					avatarUrl(size: ${AVATAR_SIZE})
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
						avatarUrl(size: ${AVATAR_SIZE})
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

interface GitHubRepositoryStore {
	readonly users: GitHubUser[];
	readonly commits: Set<string>;
}

interface GitHubUser {
	readonly id: string;
	readonly login: string;
	readonly name?: Maybe<string>;
	readonly email: string;
	readonly avatarUrl: string;
}

export class GitHubSourceControlHistoryItemDetailsProvider implements SourceControlHistoryItemDetailsProvider {
	private _enabled = true;
	private readonly _store = new Map<string, GitHubRepositoryStore>();
	private readonly _disposables = new DisposableStore();

	constructor(private readonly _gitAPI: API, private readonly _logger: LogOutputChannel) {
		this._disposables.add(this._gitAPI.onDidCloseRepository(this._onDidCloseRepository));

		this._disposables.add(authentication.onDidChangeSessions(e => {
			if (e.provider.id === 'github') {
				this._enabled = true;
			}
		}));
	}

	async provideAvatar(repository: Repository, commit: string, authorName?: string, authorEmail?: string): Promise<string | undefined> {
		this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][provideAvatar] Avatar resolution for ${commit} in ${repository.rootUri.fsPath}.`);

		if (!this._enabled) {
			this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][provideAvatar] Avatar resolution is disabled.`);
			return undefined;
		}

		const descriptor = getRepositoryDefaultRemote(repository);
		if (!descriptor) {
			this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][provideAvatar] Repository does not have a GitHub remote.`);
			return undefined;
		}

		try {
			// Get the first page of the assignable users
			await this._loadAssignableUsers(descriptor);

			const repositoryStore = this._store.get(this._getRepositoryKey(descriptor));
			if (!repositoryStore) {
				return undefined;
			}

			// Lookup the user in the cache
			const avatarUrl = repositoryStore.users.find(
				user => user.email === authorEmail || user.name === authorName)?.avatarUrl;
			if (avatarUrl) {
				return this._getAvatarUrl(avatarUrl, AVATAR_SIZE);
			}

			// Check the commit against the list of known commits
			// that are known to have incomplte author information
			if (repositoryStore.commits.has(commit)) {
				return undefined;
			}

			// Get the commit details
			const commitAuthor = await this._getCommitAuthor(descriptor, commit);
			if (!commitAuthor) {
				// The commit has incomplete author information,
				// so we should not try to query the authors details
				// again
				repositoryStore.commits.add(commit);
				return undefined;
			}

			// Save the user to the cache
			repositoryStore.users.push(commitAuthor);

			return this._getAvatarUrl(commitAuthor.avatarUrl, AVATAR_SIZE);
		} catch (err) {
			// A GitHub authentication session could be missing if the user has not yet
			// signed in with their GitHub account or they have signed out. Disable the
			// avatar resolution until the user signes in with their GitHub account.
			if (err instanceof AuthenticationError) {
				this._enabled = false;
			}
		}

		return undefined;
	}

	async provideHoverCommands(repository: Repository): Promise<Command[] | undefined> {
		const url = getRepositoryDefaultRemoteUrl(repository);
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

	async provideMessageLinks(repository: Repository, message: string): Promise<string | undefined> {
		const descriptor = getRepositoryDefaultRemote(repository);
		if (!descriptor) {
			return undefined;
		}

		return message.replace(
			ISSUE_EXPRESSION,
			(match, _group1, owner: string | undefined, repo: string | undefined, _group2, number: string | undefined) => {
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

	private _onDidCloseRepository(repository: Repository) {
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

	@sequentialize
	private async _loadAssignableUsers(descriptor: { owner: string; repo: string }): Promise<void> {
		if (this._store.has(this._getRepositoryKey(descriptor))) {
			return;
		}

		this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][_loadAssignableUsers] Querying assignable user(s) for ${descriptor.owner}/${descriptor.repo}.`);

		try {
			const graphql = await getOctokitGraphql();
			const { repository } = await graphql<{ repository: GitHubRepository }>(ASSIGNABLE_USERS_QUERY, descriptor);

			const users: GitHubUser[] = [];
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
				} satisfies GitHubUser);
			}

			this._store.set(this._getRepositoryKey(descriptor), { users, commits: new Set() });
			this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][_loadAssignableUsers] Successfully queried assignable user(s) for ${descriptor.owner}/${descriptor.repo}: ${users.length} user(s).`);
		} catch (err) {
			this._logger.warn(`[GitHubSourceControlHistoryItemDetailsProvider][_loadAssignableUsers] Failed to load assignable user(s) for ${descriptor.owner}/${descriptor.repo}: ${err}`);
			throw err;
		}
	}

	private async _getCommitAuthor(descriptor: { owner: string; repo: string }, commit: string): Promise<GitHubUser | undefined> {
		this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][_getCommitAuthor] Querying commit author for ${descriptor.owner}/${descriptor.repo}/${commit}.`);

		try {
			const graphql = await getOctokitGraphql();
			const { repository } = await graphql<{ repository: GitHubRepository }>(COMMIT_AUTHOR_QUERY, { ...descriptor, commit });

			const commitAuthor = (repository.object as Commit).author;
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
			} satisfies GitHubUser;

			this._logger.trace(`[GitHubSourceControlHistoryItemDetailsProvider][_getCommitAuthor] Successfully queried commit author for ${descriptor.owner}/${descriptor.repo}/${commit}: ${user.login}.`);
			return user;
		} catch (err) {
			this._logger.warn(`[GitHubSourceControlHistoryItemDetailsProvider][_getCommitAuthor] Failed to get commit author for ${descriptor.owner}/${descriptor.repo}/${commit}: ${err}`);
			throw err;
		}
	}

	private _getAvatarUrl(url: string, size: number): string {
		return `${url}|height=${size},width=${size}`;
	}

	private _getRepositoryKey(descriptor: { owner: string; repo: string }): string {
		return `${descriptor.owner}/${descriptor.repo}`;
	}

	dispose(): void {
		this._disposables.dispose();
	}
}
