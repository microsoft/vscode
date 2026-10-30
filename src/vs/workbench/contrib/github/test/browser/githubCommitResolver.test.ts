/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { ImmortalReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IGitHubClient } from '../../../../../platform/github/common/githubService.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
import { GitHubCommit } from '../../../../../platform/github/common/githubQueryService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { GitHubCommitResolver } from '../../browser/githubCommitResolver.js';

suite('GitHubCommitResolver', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const reason of ['dispose', 'remove'] as const) {
		test(`releases a client acquired after its entry is ${reason === 'dispose' ? 'disposed' : 'removed'}`, async () => {
			let released = 0;
			let credentialCalls = 0;
			const release = store.add(toDisposable(() => released++));
			const client = upcastPartial<IGitHubClient>({
				credentials: upcastPartial<IGitHubClient['credentials']>({
					getCredential: async signal => {
						credentialCalls++;
						signal.throwIfAborted();
						throw new Error('Unexpected credential lookup');
					},
				}),
			});
			const service = upcastPartial<IWorkbenchGitHubService>({
				onDidChangeDefaultClient: Event.None,
				acquireDefaultAccountClient: async () => ({ object: client, dispose: () => release.dispose() }),
			});
			const resolver = store.add(new GitHubCommitResolver(service, new NullLogService()));
			resolver.get({ owner: 'owner', repo: 'repo', sha: 'abc', resource: URI.parse('https://github.com/owner/repo/commit/abc') });
			if (reason === 'dispose') {
				resolver.dispose();
			} else {
				resolver.retain([]);
			}
			await timeout(0);
			assert.deepStrictEqual({ released, credentialCalls }, { released: 1, credentialCalls: 0 });
		});
	}

	test('retries credential resolution after a transient failure', async () => {
		let credentialCalls = 0;
		const commit: GitHubCommit = {
			sha: 'abc123',
			message: 'Fix hover',
			url: 'https://github.com/microsoft/vscode/commit/abc123',
			author: { login: 'octocat' },
			committedAt: '2026-09-23T00:00:00Z',
		};
		const client = upcastPartial<IGitHubClient>({
			credentials: upcastPartial<IGitHubClient['credentials']>({
				onDidInvalidate: Event.None,
				getCredential: async signal => {
					credentialCalls++;
					if (credentialCalls === 1) {
						throw new Error('offline');
					}
					return {
						account: { host: 'github.com', accountId: 'test' },
						token: 'token',
						generation: 1,
						signal,
					};
				},
			}),
			query: upcastPartial<IGitHubClient['query']>({
				subscribeCommit: ref => upcastPartial({
					resource: {
						ref,
						state: constObservable({
							status: 'ready',
							complete: true,
							value: commit,
						}),
					},
					update: () => { },
					refresh: async () => { },
					dispose: () => { },
				}),
			}),
		});
		const gitHubService = upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: async () => new ImmortalReference(client),
		});
		const warnings: string[] = [];
		const logService = upcastPartial<ILogService>({
			warn: message => warnings.push(String(message)),
		});
		const resolver = store.add(new GitHubCommitResolver(gitHubService, logService));
		const target = {
			owner: 'microsoft',
			repo: 'vscode',
			sha: 'abc123',
			resource: URI.parse(commit.url),
		};

		const value = resolver.get(target);
		await timeout(0);
		resolver.get(target);
		await timeout(0);

		assert.deepStrictEqual({
			credentialCalls,
			resolvedSha: value.get()?.sha,
			warnings,
		}, {
			credentialCalls: 2,
			resolvedSha: 'abc123',
			warnings: ['[GitHubCommitResolver] Failed to resolve GitHub credentials'],
		});
	});
});
