/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IGitHubCredentials } from '../../../../github/common/githubCredentialService.js';
import { FragmentState, PullRequestCore, PullRequestRef, PullRequestSnapshot, PullRequestSubscription } from '../../../../github/common/githubPullRequestService.js';
import { IGitHubClient } from '../../../../github/common/githubService.js';
import { IPullRequestResources } from '../../../../github/common/pullRequestResourceService.js';
import { AgentHostPullRequestResolver } from '../../../node/shared/pullRequestResolver.js';
import { createTestGitHubService } from '../testGitHubService.js';

suite('AgentHostPullRequestResolver', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function core(overrides: Partial<PullRequestCore> = {}): PullRequestCore {
		return {
			repositoryNameWithOwner: 'microsoft/vscode',
			headRepositoryNameWithOwner: 'microsoft/vscode',
			number: 42,
			title: 'Improve things',
			url: 'https://github.com/microsoft/vscode/pull/42',
			state: 'open',
			draft: false,
			headSha: 'a'.repeat(40),
			headRef: 'feature/pr',
			baseSha: 'b'.repeat(40),
			baseRef: 'main',
			...overrides,
		};
	}

	function createResolver(state: FragmentState<PullRequestCore>, apiHost = 'api.github.com', requested: PullRequestRef[] = []): AgentHostPullRequestResolver {
		const client = new class extends mock<IGitHubClient>() {
			override readonly credentials = new class extends mock<IGitHubCredentials>() {
				override readonly onDidInvalidate = Event.None;
				override async getCredential() {
					return { account: { host: apiHost, accountId: '1' }, token: 'token', generation: 1, signal: new AbortController().signal };
				}
			}();
			override readonly pullRequests = new class extends mock<IPullRequestResources>() {
				override subscribePullRequest(ref: PullRequestRef): PullRequestSubscription {
					requested.push(ref);
					return new class extends mock<PullRequestSubscription>() {
						override readonly resource = { ref, snapshot: constObservable(new class extends mock<PullRequestSnapshot>() { override readonly core = state; }()) };
						override async refresh() { }
						override dispose() { }
					}();
				}
			}();
		}();
		return disposables.add(new AgentHostPullRequestResolver(createTestGitHubService(client)));
	}

	async function messageOf(promise: Promise<unknown>): Promise<string> {
		try {
			await promise;
			return 'resolved';
		} catch (error) {
			return (error as Error).message;
		}
	}

	test('resolves a same-repository pull request from its URL', async () => {
		const requested: PullRequestRef[] = [];
		const resolver = createResolver({ status: 'ready', complete: true, value: core({ state: 'closed' }) }, 'api.github.com', requested);

		assert.deepStrictEqual({
			resolved: await resolver.resolve('https://github.com/microsoft/vscode/pull/42'),
			requested,
		}, {
			resolved: { url: 'https://github.com/microsoft/vscode/pull/42', webHost: 'github.com', owner: 'microsoft', repo: 'vscode', number: 42, headRef: 'feature/pr', baseRef: 'main' },
			requested: [{ host: 'api.github.com', accountId: '1', owner: 'microsoft', repo: 'vscode', number: 42 }],
		});
	});

	test('preserves the enterprise web host used to match the workspace remote', async () => {
		const resolver = createResolver({ status: 'ready', complete: true, value: core() }, 'api.tenant.ghe.com');

		assert.deepStrictEqual(await resolver.resolve('https://tenant.ghe.com/microsoft/vscode/pull/42'), {
			url: 'https://tenant.ghe.com/microsoft/vscode/pull/42',
			webHost: 'tenant.ghe.com',
			owner: 'microsoft',
			repo: 'vscode',
			number: 42,
			headRef: 'feature/pr',
			baseRef: 'main',
		});
	});

	test('rejects pull requests it cannot check out', async () => {
		const ready = (overrides: Partial<PullRequestCore>): FragmentState<PullRequestCore> => ({ status: 'ready', complete: true, value: core(overrides) });
		const url = 'https://github.com/microsoft/vscode/pull/42';

		assert.deepStrictEqual({
			invalidUrl: await messageOf(createResolver(ready({})).resolve('https://github.com/microsoft/vscode/issues/42')),
			otherHost: await messageOf(createResolver(ready({}), 'api.tenant.ghe.com').resolve(url)),
			unavailable: await messageOf(createResolver({ status: 'error', complete: false, error: { message: 'Not Found', kind: 'notFound', statusCode: 404 } }).resolve(url)),
			merged: await messageOf(createResolver(ready({ state: 'merged' })).resolve(url)),
			fork: await messageOf(createResolver(ready({ headRepositoryNameWithOwner: 'someone/vscode' })).resolve(url)),
			deletedFork: await messageOf(createResolver(ready({ headRepositoryNameWithOwner: undefined })).resolve(url)),
		}, {
			invalidUrl: `'https://github.com/microsoft/vscode/issues/42' is not a valid pull request URL.`,
			otherHost: 'Pull request #42 is not on the GitHub instance of the signed-in account.',
			unavailable: 'Pull request #42 could not be loaded: Not Found',
			merged: 'Pull request #42 has already been merged.',
			fork: 'Pull request #42 comes from a fork, which is not supported yet.',
			deletedFork: 'Pull request #42 comes from a fork, which is not supported yet.',
		});
	});
});
