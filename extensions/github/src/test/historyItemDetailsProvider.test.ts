/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Disposable, Uri, window } from 'vscode';
import type { GitHubClient, GitHubCommitAuthor, GitHubRepositories } from '@vscode/internal-github';
import type { GitHubService } from '../auth.js';
import { GitHubSourceControlHistoryItemDetailsProvider } from '../historyItemDetailsProvider.js';
import type { API, AvatarQueryCommit, Repository } from '../typings/git.d.ts';
import { DisposableStore } from '../util.js';

suite('GitHub commit avatars', () => {
	const first = { id: 'U1', login: 'first', name: 'Alex', email: 'first@example.com', avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4' };
	const second = { id: 'U2', login: 'second', name: 'Alex', email: 'second@example.com', avatarUrl: 'https://avatars.githubusercontent.com/u/2?v=4' };
	const repository = {
		rootUri: Uri.file('/repo'),
		state: { remotes: [{ name: 'origin', fetchUrl: 'https://github.com/owner/repo.git' }] }
	} as Repository;

	let disposables: DisposableStore;
	let provider: GitHubSourceControlHistoryItemDetailsProvider;
	let authors: Map<string, GitHubCommitAuthor>;
	let requests: string[];

	setup(() => {
		disposables = new DisposableStore();
		authors = new Map();
		requests = [];
		const repositories: Pick<GitHubRepositories, 'listAssignableUsers' | 'getCommitAuthor'> = {
			listAssignableUsers: async () => ({
				nodes: [first, { ...second, name: 'Another name', email: '' }],
				pageInfo: { endCursor: null, hasNextPage: false }
			}),
			getCommitAuthor: async (_repository, hash) => {
				requests.push(hash);
				return authors.get(hash) ?? null;
			}
		};
		const noEvent = () => Disposable.from();
		const git: Pick<API, 'onDidCloseRepository'> = { onDidCloseRepository: noEvent };
		const github: Pick<GitHubService, 'onDidChangeSessions' | 'getClient'> = {
			onDidChangeSessions: noEvent,
			getClient: async (): Promise<GitHubClient> => ({ repositories } as GitHubClient)
		};
		const logger = window.createOutputChannel('GitHub avatar tests', { log: true });
		disposables.add(logger);
		provider = new GitHubSourceControlHistoryItemDetailsProvider(git as API, github as GitHubService, logger);
		disposables.add(provider);
	});

	teardown(() => disposables.dispose());

	function getAvatars(...commits: AvatarQueryCommit[]) {
		return provider.provideAvatar(repository, { commits, size: 20 });
	}

	test('uses the numeric noreply ID despite a cached display name match', async () => {
		const avatars = await getAvatars({ hash: 'noreply', authorName: 'Alex', authorEmail: '2+second@users.noreply.github.com' });
		assert.deepStrictEqual([avatars?.get('noreply'), requests], ['https://avatars.githubusercontent.com/u/2?s=20', []]);
	});

	test('uses matching emails from both the assignable user cache and previous commit lookups', async () => {
		authors.set('lookup', { ...second, user: second });
		const avatars = await getAvatars(
			{ hash: 'known', authorName: 'Different Git name', authorEmail: first.email },
			{ hash: 'lookup', authorName: 'Alex', authorEmail: second.email },
			{ hash: 'same-author', authorName: 'Alex', authorEmail: second.email }
		);
		const cached = await getAvatars({ hash: 'later', authorName: 'New Git name', authorEmail: second.email });
		assert.deepStrictEqual({ avatars, cached, requests }, {
			avatars: new Map([
				['known', first.avatarUrl + '&s=20'],
				['lookup', second.avatarUrl + '&s=20'],
				['same-author', second.avatarUrl + '&s=20']
			]),
			cached: new Map([['later', second.avatarUrl + '&s=20']]),
			requests: ['lookup']
		});
	});

	test('resolves same-name commits individually when their emails are empty or missing', async () => {
		authors.set('one', { ...first, user: first });
		authors.set('two', { ...second, user: second });
		const commits = [
			{ hash: 'one', authorName: 'Alex', authorEmail: '' },
			{ hash: 'two', authorName: 'Alex' }
		];
		const avatars = await getAvatars(...commits);
		const larger = await provider.provideAvatar(repository, { commits, size: 40 });
		assert.deepStrictEqual({ avatars, larger, requests: requests.sort() }, {
			avatars: new Map([['one', first.avatarUrl + '&s=20'], ['two', second.avatarUrl + '&s=20']]),
			larger: new Map([['one', first.avatarUrl + '&s=40'], ['two', second.avatarUrl + '&s=40']]),
			requests: ['one', 'two']
		});
	});

	test('keeps distinct email addresses separate even when they collate equally', async () => {
		const composed = 'caf\u00e9@example.com';
		const decomposed = 'cafe\u0301@example.com';
		authors.set('one', { ...first, email: composed, user: first });
		authors.set('two', { ...second, email: decomposed, user: second });
		const avatars = await getAvatars(
			{ hash: 'one', authorName: 'Alex', authorEmail: composed },
			{ hash: 'two', authorName: 'Alex', authorEmail: decomposed }
		);
		assert.deepStrictEqual(avatars, new Map([['one', first.avatarUrl + '&s=20'], ['two', second.avatarUrl + '&s=20']]));
	});

	test('keeps an unknown commit unresolved when only its author name matches', async () => {
		const commit = { hash: 'unknown', authorName: 'Alex', authorEmail: 'unknown@example.com' };
		await getAvatars(commit);
		const avatars = await getAvatars(commit);
		assert.deepStrictEqual({ avatars, requests }, { avatars: new Map([['unknown', undefined]]), requests: ['unknown'] });
	});
});
