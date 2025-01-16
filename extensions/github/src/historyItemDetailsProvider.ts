/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, l10n } from 'vscode';
import { Commit, Repository as GitHubRepository, Maybe } from '@octokit/graphql-schema';
import { API, Repository, SourceControlHistoryItemDetailsProvider } from './typings/git';
import { DisposableStore, getRepositoryDefaultRemote, getRepositoryDefaultRemoteUrl, getRepositoryFromUrl, sequentialize } from './util';
import { getOctokitGraphql } from './auth';

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

interface GitHubUser {
	readonly id: string;
	readonly login: string;
	readonly name?: Maybe<string>;
	readonly email: string;
	readonly avatarUrl: string;
}

export class GitHubSourceControlHistoryItemDetailsProvider implements SourceControlHistoryItemDetailsProvider {
	private readonly _avatars = new Map<string, GitHubUser[]>();
	private readonly _disposables = new DisposableStore();

	constructor(private readonly _gitAPI: API) {
		this._disposables.add(this._gitAPI.onDidCloseRepository(this._onDidCloseRepository));
	}

	async provideAvatar(repository: Repository, commit: string, authorName?: string, authorEmail?: string): Promise<string | undefined> {
		const descriptor = getRepositoryDefaultRemote(repository);
		if (!descriptor) {
			return undefined;
		}

		// Get the first page of the assignable users
		await this._loadAssignableUsers(descriptor);

		const avatarUrl = this._avatars.get(this._getRepositoryKey(descriptor))?.find(
			user => user.email === authorEmail || user.name === authorName)?.avatarUrl;

		if (avatarUrl) {
			return this._getAvatarUrl(avatarUrl, AVATAR_SIZE);
		}

		// Get the commit details
		const commitAuthor = await this._getCommitAuthor(descriptor, commit);
		if (commitAuthor) {
			return this._getAvatarUrl(commitAuthor.avatarUrl, AVATAR_SIZE);
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

			this._avatars.delete(this._getRepositoryKey(repository));
		}
	}

	@sequentialize
	private async _loadAssignableUsers(descriptor: { owner: string; repo: string }): Promise<void> {
		if (this._avatars.has(this._getRepositoryKey(descriptor))) {
			return;
		}

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

			this._avatars.set(this._getRepositoryKey(descriptor), users);
		} catch {
			// TODO@lszomoru - log error
		}
	}

	private async _getCommitAuthor(descriptor: { owner: string; repo: string }, commit: string): Promise<GitHubUser | undefined> {
		try {
			const graphql = await getOctokitGraphql();
			const { repository } = await graphql<{ repository: GitHubRepository }>(COMMIT_AUTHOR_QUERY, { ...descriptor, commit });

			const commitAuthor = (repository.object as Commit).author;
			if (!commitAuthor?.user?.id || !commitAuthor.user?.login ||
				!commitAuthor?.name || !commitAuthor?.email || !commitAuthor?.avatarUrl) {
				return undefined;
			}

			const user = {
				id: commitAuthor.user.id,
				login: commitAuthor.user.login,
				name: commitAuthor.name,
				email: commitAuthor.email,
				avatarUrl: commitAuthor.avatarUrl,
			} satisfies GitHubUser;

			// Save the user
			const users = this._avatars.get(this._getRepositoryKey(descriptor));
			if (users) {
				users.push(user);
			}

			return user;
		} catch {
			// TODO@lszomoru - log error
		}

		return undefined;
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
