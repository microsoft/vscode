/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ImmortalReference } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IGitHubService } from '../../browser/githubService.js';
import { GitHubPullRequestModel } from '../../browser/models/githubPullRequestModel.js';
import { IPullRequestIconCache, PullRequestIconCache } from '../../browser/pullRequestIconCache.js';
import { computePullRequestRefPresentation, SessionPullRequestPresentationModel } from '../../browser/pullRequestIconStatus.js';
import { computePullRequestIcon, GitHubPullRequestState, IGitHubPullRequest } from '../../common/types.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';

suite('Pull request presentation origin isolation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const enterpriseHost of [undefined, 'ghe.example.com']) {
		for (const host of ['github.com', 'ghe.example.com']) {
			test(`service ${enterpriseHost ?? 'github.com'} presenting ${host}`, () => {
				let lookups = 0;
				const service = new class extends mock<IGitHubService>() {
					override readonly enterpriseHost = enterpriseHost;
					override createPullRequestModelReference = () => {
						lookups++;
						return new ImmortalReference(new class extends mock<GitHubPullRequestModel>() {
							override readonly pullRequest = constObservable(undefined);
						}());
					};
				}();
				const cache = new class extends mock<IPullRequestIconCache>() {
					override get = () => undefined;
					override getState = () => undefined;
					override getEntry = () => undefined;
				}();
				const ref = {
					owner: 'owner', repo: 'repo', number: 42, title: 'Host draft',
					uri: URI.parse(`https://${host}/owner/repo/pull/42`), icon: Codicon.gitPullRequestDraft,
				};
				const presentation = store.add(new SessionPullRequestPresentationModel(constObservable([ref]), service));
				const pill = presentation.pullRequests.get()[0];
				const provider = derived(reader => computePullRequestRefPresentation(reader, service, cache, ref)).get();
				assert.deepStrictEqual({
					lookups, pillTitle: pill.ref.title, pillIcon: pill.icon?.id,
					pullRequest: pill.pullRequest, provider,
				}, {
					lookups: host === (enterpriseHost ?? 'github.com') ? 2 : 0,
					pillTitle: 'Host draft', pillIcon: Codicon.gitPullRequestDraft.id,
					pullRequest: undefined,
					provider: { title: 'Host draft', icon: Codicon.gitPullRequestDraft, liveState: undefined },
				});
			});
		}
	}
});

suite('Pull request presentation state', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('restores the cached icon and state with one combined lookup', () => {
		const calls: string[] = [];
		const icon = computePullRequestIcon(GitHubPullRequestState.Open);
		const cache = new class extends mock<IPullRequestIconCache>() {
			override getEntry(link: string) {
				calls.push(link);
				return { icon, pullRequest: { state: GitHubPullRequestState.Open, isDraft: false, lastChecked: 1 } };
			}
			override get = () => assert.fail('Expected a combined cache lookup');
			override getState = () => assert.fail('Expected a combined cache lookup');
		}();
		const service = new class extends mock<IGitHubService>() {
			override readonly enterpriseHost = undefined;
			override createPullRequestModelReference = () => new ImmortalReference(new class extends mock<GitHubPullRequestModel>() {
				override readonly pullRequest = constObservable(undefined);
			}());
		}();
		const ref = { owner: 'owner', repo: 'repo', number: 42, uri: URI.parse('https://github.com/owner/repo/pull/42') };
		const result = derived(reader => computePullRequestRefPresentation(reader, service, cache, ref)).get();
		assert.deepStrictEqual({ result, calls }, {
			result: { icon, title: undefined, liveState: GitHubPullRequestState.Open }, calls: [ref.uri.toString()],
		});
	});

	test('restores an observed merge before the live model resolves after restart', () => {
		const storage = store.add(new InMemoryStorageService());
		const ref = {
			owner: 'owner', repo: 'repo', number: 42, title: 'Merged pull request',
			uri: URI.parse('https://github.com/owner/repo/pull/42'), icon: Codicon.gitPullRequest,
		};
		new PullRequestIconCache(storage).set(ref.uri.toString(), computePullRequestIcon(GitHubPullRequestState.Merged));
		const service = new class extends mock<IGitHubService>() {
			override readonly enterpriseHost = undefined;
			override createPullRequestModelReference = () => new ImmortalReference(new class extends mock<GitHubPullRequestModel>() {
				override readonly pullRequest = constObservable(undefined);
			}());
		}();

		const result = derived(reader => computePullRequestRefPresentation(reader, service, new PullRequestIconCache(storage), ref)).get();

		assert.deepStrictEqual(result, { icon: computePullRequestIcon(GitHubPullRequestState.Merged), title: ref.title, liveState: GitHubPullRequestState.Merged });
	});

	test('does not replace a host-observed merge with an older open cache entry', () => {
		const cache = new PullRequestIconCache(store.add(new InMemoryStorageService()));
		const ref = {
			owner: 'owner', repo: 'repo', number: 42, title: 'Merged pull request',
			uri: URI.parse('https://github.com/owner/repo/pull/42'), state: GitHubPullRequestState.Merged,
		};
		cache.setState(ref.uri.toString(), { state: GitHubPullRequestState.Open, isDraft: false });
		const service = new class extends mock<IGitHubService>() {
			override readonly enterpriseHost = undefined;
			override createPullRequestModelReference = () => new ImmortalReference(new class extends mock<GitHubPullRequestModel>() {
				override readonly pullRequest = constObservable(undefined);
			}());
		}();
		const result = derived(reader => computePullRequestRefPresentation(reader, service, cache, ref)).get();
		assert.deepStrictEqual(result, {
			icon: computePullRequestIcon(GitHubPullRequestState.Merged), title: ref.title, liveState: GitHubPullRequestState.Merged,
		});
	});

	test('presents a closed draft pull request as closed', () => {
		const livePullRequest: IGitHubPullRequest = {
			number: 42, title: 'Closed draft', body: '', state: GitHubPullRequestState.Closed,
			author: { login: 'author', avatarUrl: '' }, headRef: 'feature', headSha: 'head', baseRef: 'main',
			isDraft: true, createdAt: '', updatedAt: '', mergedAt: undefined, mergeable: undefined, mergeableState: 'unknown',
		};
		const service = new class extends mock<IGitHubService>() {
			override readonly enterpriseHost = undefined;
			override createPullRequestModelReference = () => new ImmortalReference(new class extends mock<GitHubPullRequestModel>() {
				override readonly pullRequest = constObservable(livePullRequest);
			}());
		}();
		const cache = new class extends mock<IPullRequestIconCache>() {
			override set = () => { };
		}();
		const ref = {
			owner: 'owner', repo: 'repo', number: 42, title: 'Closed draft',
			uri: URI.parse('https://github.com/owner/repo/pull/42'), icon: Codicon.gitPullRequestDraft,
		};
		const presentation = store.add(new SessionPullRequestPresentationModel(constObservable([ref]), service));
		const provider = derived(reader => computePullRequestRefPresentation(reader, service, cache, ref)).get();
		assert.deepStrictEqual({
			pillIcon: presentation.pullRequests.get()[0].icon?.id,
			providerIcon: provider.icon?.id,
		}, {
			pillIcon: Codicon.gitPullRequestClosed.id,
			providerIcon: Codicon.gitPullRequestClosed.id,
		});
	});
});
