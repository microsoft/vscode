/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ImmortalReference, ReferenceCollection } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IGitHubPullRequestRef } from '../../../../services/sessions/common/session.js';
import { IGitHubService } from '../../browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestModel } from '../../browser/models/githubPullRequestModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../browser/models/githubPullRequestReviewThreadsModel.js';
import { IPullRequestIconCache, PullRequestIconCache } from '../../browser/pullRequestIconCache.js';
import { computePullRequestRefPresentation, SessionPullRequestPresentationModel } from '../../browser/pullRequestIconStatus.js';
import { computePullRequestIcon, GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPullRequest } from '../../common/types.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';

class TestReferenceCollection<T> extends ReferenceCollection<T> {
	created = 0;
	destroyed = 0;

	constructor(private readonly createObject: () => T) {
		super();
	}

	protected override createReferencedObject(): T {
		this.created++;
		return this.createObject();
	}

	protected override destroyReferencedObject(): void {
		this.destroyed++;
	}
}

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

	for (const surface of ['provider', 'pill'] as const) {
		test(`${surface} retains shared models across recomputations and releases obsolete models`, () => {
			const ref: IGitHubPullRequestRef = {
				owner: 'owner', repo: 'repo', number: 42, title: 'Host title',
				uri: URI.parse('https://github.com/owner/repo/pull/42'),
			};
			const refs = observableValue<readonly IGitHubPullRequestRef[]>('refs', [ref]);
			const pullRequest = observableValue('pullRequest', upcastPartial<IGitHubPullRequest>({
				number: 42, title: 'Live title', state: GitHubPullRequestState.Open, headSha: 'head', isDraft: false,
			}));
			const ciStatus = observableValue<GitHubCIOverallStatus>('ciStatus', GitHubCIOverallStatus.Success);
			const prModels = new TestReferenceCollection(() => upcastPartial<GitHubPullRequestModel>({ pullRequest }));
			const ciModels = new TestReferenceCollection(() => upcastPartial<GitHubPullRequestCIModel>({ overallStatus: ciStatus }));
			const reviewModels = new TestReferenceCollection(() => upcastPartial<GitHubPullRequestReviewThreadsModel>({ reviewThreads: constObservable([]) }));
			const service = new class extends mock<IGitHubService>() {
				override readonly enterpriseHost = undefined;
				override createPullRequestModelReference = (_owner: string, _repo: string, number: number) => prModels.acquire(`${number}`);
				override createPullRequestCIModelReference = (_owner: string, _repo: string, number: number, sha: string) => ciModels.acquire(`${number}/${sha}`);
				override createPullRequestReviewThreadsModelReference = (_owner: string, _repo: string, number: number) => reviewModels.acquire(`${number}`);
			}();
			const cache = new class extends mock<IPullRequestIconCache>() {
				override get = () => undefined;
				override set = () => { };
			}();
			const model = store.add(new SessionPullRequestPresentationModel(refs, service));
			const presentation = surface === 'provider'
				? derived(reader => {
					const ref = refs.read(reader)[0];
					return ref && computePullRequestRefPresentation(reader, service, cache, ref);
				})
				: derived(reader => model.pullRequests.read(reader)[0]);
			const observer = store.add(autorun(reader => presentation.read(reader)));
			const counts = () => [prModels, ciModels, reviewModels].map(models => ({ created: models.created, destroyed: models.destroyed }));

			for (let i = 0; i < 20; i++) {
				refs.set([{ ...ref, title: `Host title ${i}` }], undefined);
				pullRequest.set({ ...pullRequest.get(), title: `Live title ${i}` }, undefined);
				ciStatus.set(i % 2 ? GitHubCIOverallStatus.Success : GitHubCIOverallStatus.Failure, undefined);
			}
			const afterUpdates = counts();
			pullRequest.set({ ...pullRequest.get(), headSha: 'new-head' }, undefined);
			const afterHeadChange = counts();
			refs.set([], undefined);
			const afterRemoval = counts();
			refs.set([ref], undefined);
			observer.dispose();

			assert.deepStrictEqual({ afterUpdates, afterHeadChange, afterRemoval, afterDispose: counts() }, {
				afterUpdates: [{ created: 1, destroyed: 0 }, { created: 1, destroyed: 0 }, { created: 1, destroyed: 0 }],
				afterHeadChange: [{ created: 1, destroyed: 0 }, { created: 2, destroyed: 1 }, { created: 1, destroyed: 0 }],
				afterRemoval: [{ created: 1, destroyed: 1 }, { created: 2, destroyed: 2 }, { created: 1, destroyed: 1 }],
				afterDispose: [{ created: 2, destroyed: 2 }, { created: 3, destroyed: 3 }, { created: 2, destroyed: 2 }],
			});
		});
	}

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
