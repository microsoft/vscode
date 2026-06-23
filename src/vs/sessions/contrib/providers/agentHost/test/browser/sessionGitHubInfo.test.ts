/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { DisposableStore, ImmortalReference, type IReference } from '../../../../../../base/common/lifecycle.js';
import { autorun, observableValue, type IObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { SessionMeta } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IGitHubInfo } from '../../../../../services/sessions/common/session.js';
import { IGitHubService } from '../../../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestModel } from '../../../../github/browser/models/githubPullRequestModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../../../github/browser/models/githubPullRequestReviewThreadsModel.js';
import { computePullRequestIcon, GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPullRequest, IGitHubPullRequestReviewThread } from '../../../../github/common/types.js';
import { SessionGitHubInfoResolver } from '../../browser/sessionGitHubInfo.js';

suite('SessionGitHubInfoResolver', () => {

	const store = new DisposableStore();

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Build a resolver over a settable meta observable plus a (pre-configured)
	 * GitHub service, and start observing `gitHubInfo` so the async PR-number
	 * lookup and the live-model reads actually run. The service must be configured
	 * before this is called: the resolver looks up the PR number the moment
	 * `gitHubInfo` is first observed.
	 */
	function createResolver(meta: SessionMeta | undefined, gitHubService: TestGitHubService | undefined): {
		readonly resolver: SessionGitHubInfoResolver;
		readonly metaObs: ReturnType<typeof observableValue<SessionMeta | undefined>>;
	} {
		const metaObs = observableValue<SessionMeta | undefined>('test.meta', meta);
		const resolver = new SessionGitHubInfoResolver(metaObs, 'test:session', gitHubService, new NullLogService());
		store.add(autorun(reader => { resolver.gitHubInfo.read(reader); }));
		return { resolver, metaObs };
	}

	test('no git state yields no GitHub info', async () => {
		const { resolver } = createResolver(undefined, new TestGitHubService());
		await timeout(0);
		assert.strictEqual(resolver.gitHubInfo.get(), undefined);
	});

	test('coords with no pull request yield owner/repo without a pull request', async () => {
		// No PR number registered for the branch -> the lookup resolves undefined.
		const { resolver } = createResolver(gitMeta('owner', 'repo', 'feature'), new TestGitHubService());
		await timeout(0);
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get()), { owner: 'owner', repo: 'repo', pullRequest: undefined });
	});

	test('without a GitHub service the pull request stays dormant', async () => {
		const { resolver } = createResolver(gitMeta('owner', 'repo', 'feature'), undefined);
		await timeout(0);
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get()), { owner: 'owner', repo: 'repo', pullRequest: undefined });
	});

	test('a resolved PR number whose live model has not loaded has no icon yet', async () => {
		const gitHubService = new TestGitHubService();
		gitHubService.setPullRequestNumber('owner', 'repo', 'feature', 42);
		// No live pull request set -> the model stays empty, so there is no icon yet.
		const { resolver } = createResolver(gitMeta('owner', 'repo', 'feature'), gitHubService);
		await timeout(0);
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get()), {
			owner: 'owner',
			repo: 'repo',
			pullRequest: { number: 42, uri: 'https://github.com/owner/repo/pull/42', icon: undefined },
		});
	});

	test('an open pull request shows the open icon', async () => {
		const { resolver } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false });
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open));
	});

	test('a draft pull request shows the draft icon', async () => {
		const { resolver } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: true });
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon('draft'));
	});

	test('a merged pull request shows the merged icon and does not consult CI / review threads', async () => {
		const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Merged, isDraft: false });
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Merged));
		assert.deepStrictEqual({ ci: gitHubService.ciModelRefs, reviewThreads: gitHubService.reviewThreadModelRefs }, { ci: 0, reviewThreads: 0 });
	});

	test('a closed pull request shows the closed icon', async () => {
		const { resolver } = await resolvePullRequest({ state: GitHubPullRequestState.Closed, isDraft: false });
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Closed));
	});

	test('an open pull request with failing CI checks shows the error icon', async () => {
		const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false, headSha: 'sha1' });
		gitHubService.setCIStatus('owner', 'repo', 42, 'sha1', GitHubCIOverallStatus.Failure);
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open, { hasFailingChecks: true }));
	});

	test('an open pull request with unresolved review threads shows the comment icon', async () => {
		const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false });
		gitHubService.setReviewThreads('owner', 'repo', 42, [thread(false)]);
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open, { hasUnresolvedComments: true }));
	});

	test('resolved review threads do not change the open icon', async () => {
		const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false });
		gitHubService.setReviewThreads('owner', 'repo', 42, [thread(true), thread(true)]);
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open));
	});

	test('failing CI checks take precedence over unresolved review threads', async () => {
		const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false, headSha: 'sha1' });
		gitHubService.setCIStatus('owner', 'repo', 42, 'sha1', GitHubCIOverallStatus.Failure);
		gitHubService.setReviewThreads('owner', 'repo', 42, [thread(false)]);
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open, { hasFailingChecks: true }));
	});

	test('the icon updates reactively when the live pull request state changes', async () => {
		const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false });
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open));

		gitHubService.setPullRequest('owner', 'repo', 42, makePullRequest({ state: GitHubPullRequestState.Merged, isDraft: false }));
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Merged));
	});

	test('the icon updates reactively when CI flips to failing', async () => {
		const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false, headSha: 'sha1' });
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open));

		gitHubService.setCIStatus('owner', 'repo', 42, 'sha1', GitHubCIOverallStatus.Failure);
		assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open, { hasFailingChecks: true }));
	});

	test('a resolved PR number stays sticky across unobserve / re-observe (no re-lookup)', async () => {
		const gitHubService = new TestGitHubService();
		gitHubService.setPullRequestNumber('owner', 'repo', 'feature', 42);
		const { resolver } = createResolver(gitMeta('owner', 'repo', 'feature'), gitHubService);
		await timeout(0);
		assert.strictEqual(resolver.gitHubInfo.get()?.pullRequest?.number, 42);
		assert.strictEqual(gitHubService.lookupCalls, 1);

		// Drop all observers, then re-observe: the PR number must not flap back to
		// undefined and no new lookup may be issued.
		store.clear();
		let firstReObservedNumber: number | undefined;
		let captured = false;
		store.add(autorun(reader => {
			const number = resolver.gitHubInfo.read(reader)?.pullRequest?.number;
			if (!captured) { firstReObservedNumber = number; captured = true; }
		}));
		assert.strictEqual(firstReObservedNumber, 42);
		assert.strictEqual(gitHubService.lookupCalls, 1);
	});

	test('a branch change resolves a new pull request number', async () => {
		const gitHubService = new TestGitHubService();
		gitHubService.setPullRequestNumber('owner', 'repo', 'feature', 42);
		gitHubService.setPullRequestNumber('owner', 'repo', 'other', 7);
		const { resolver, metaObs } = createResolver(gitMeta('owner', 'repo', 'feature'), gitHubService);
		await timeout(0);
		assert.strictEqual(resolver.gitHubInfo.get()?.pullRequest?.number, 42);

		metaObs.set(gitMeta('owner', 'repo', 'other'), undefined);
		await timeout(0);
		assert.strictEqual(resolver.gitHubInfo.get()?.pullRequest?.number, 7);
	});

	// ---- helpers ------------------------------------------------------------

	/** Resolve a fully-loaded pull request (number 42 + live model) and return the resolver + service. */
	async function resolvePullRequest(details: PullRequestDetails): Promise<{ readonly resolver: SessionGitHubInfoResolver; readonly gitHubService: TestGitHubService }> {
		const gitHubService = new TestGitHubService();
		gitHubService.setPullRequestNumber('owner', 'repo', 'feature', 42);
		gitHubService.setPullRequest('owner', 'repo', 42, makePullRequest(details));
		const { resolver } = createResolver(gitMeta('owner', 'repo', 'feature'), gitHubService);
		await timeout(0);
		return { resolver, gitHubService };
	}
});

interface PullRequestDetails {
	readonly state: GitHubPullRequestState;
	readonly isDraft: boolean;
	readonly headSha?: string;
}

function gitMeta(owner: string, repo: string, branch: string): SessionMeta {
	return { git: { hasGitHubRemote: true, githubOwner: owner, githubRepo: repo, branchName: branch } };
}

function thread(isResolved: boolean): IGitHubPullRequestReviewThread {
	return { id: `thread-${isResolved}`, isResolved, path: 'file.ts', line: 1, comments: [] };
}

function makePullRequest(details: PullRequestDetails): IGitHubPullRequest {
	return {
		number: 42,
		title: '',
		body: '',
		state: details.state,
		author: { login: '', avatarUrl: '' },
		headRef: '',
		headSha: details.headSha ?? 'sha',
		baseRef: '',
		isDraft: details.isDraft,
		createdAt: '',
		updatedAt: '',
		mergedAt: undefined,
		mergeable: undefined,
		mergeableState: '',
	};
}

function snapshot(info: IGitHubInfo | undefined): { owner: string; repo: string; pullRequest: { number: number; uri: string; icon: ThemeIcon | undefined } | undefined } | undefined {
	if (!info) {
		return undefined;
	}
	return {
		owner: info.owner,
		repo: info.repo,
		pullRequest: info.pullRequest
			? { number: info.pullRequest.number, uri: info.pullRequest.uri.toString(), icon: info.pullRequest.icon }
			: undefined,
	};
}

class TestGitHubService extends mock<IGitHubService>() {

	lookupCalls = 0;
	ciModelRefs = 0;
	reviewThreadModelRefs = 0;

	private readonly _prNumbers = new Map<string, number>();
	private readonly _prModels = new Map<string, TestPullRequestModel>();
	private readonly _ciModels = new Map<string, TestCIModel>();
	private readonly _reviewThreadModels = new Map<string, TestReviewThreadsModel>();

	override findPullRequestNumberByHeadBranch = async (owner: string, repo: string, branch: string): Promise<number | undefined> => {
		this.lookupCalls++;
		return this._prNumbers.get(`${owner}/${repo}#${branch}`);
	};

	override createPullRequestModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestModel> {
		return new ImmortalReference(this._prModel(owner, repo, prNumber) as unknown as GitHubPullRequestModel);
	}

	override createPullRequestCIModelReference(owner: string, repo: string, prNumber: number, headSha: string): IReference<GitHubPullRequestCIModel> {
		this.ciModelRefs++;
		return new ImmortalReference(this._ciModel(owner, repo, prNumber, headSha) as unknown as GitHubPullRequestCIModel);
	}

	override createPullRequestReviewThreadsModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestReviewThreadsModel> {
		this.reviewThreadModelRefs++;
		return new ImmortalReference(this._reviewThreadModel(owner, repo, prNumber) as unknown as GitHubPullRequestReviewThreadsModel);
	}

	setPullRequestNumber(owner: string, repo: string, branch: string, prNumber: number): void {
		this._prNumbers.set(`${owner}/${repo}#${branch}`, prNumber);
	}

	setPullRequest(owner: string, repo: string, prNumber: number, pullRequest: IGitHubPullRequest): void {
		this._prModel(owner, repo, prNumber).set(pullRequest);
	}

	setCIStatus(owner: string, repo: string, prNumber: number, headSha: string, status: GitHubCIOverallStatus): void {
		this._ciModel(owner, repo, prNumber, headSha).set(status);
	}

	setReviewThreads(owner: string, repo: string, prNumber: number, threads: readonly IGitHubPullRequestReviewThread[]): void {
		this._reviewThreadModel(owner, repo, prNumber).set(threads);
	}

	private _prModel(owner: string, repo: string, prNumber: number): TestPullRequestModel {
		const key = `${owner}/${repo}/${prNumber}`;
		let model = this._prModels.get(key);
		if (!model) {
			model = new TestPullRequestModel();
			this._prModels.set(key, model);
		}
		return model;
	}

	private _ciModel(owner: string, repo: string, prNumber: number, headSha: string): TestCIModel {
		const key = `${owner}/${repo}/${prNumber}/${headSha}`;
		let model = this._ciModels.get(key);
		if (!model) {
			model = new TestCIModel();
			this._ciModels.set(key, model);
		}
		return model;
	}

	private _reviewThreadModel(owner: string, repo: string, prNumber: number): TestReviewThreadsModel {
		const key = `${owner}/${repo}/${prNumber}`;
		let model = this._reviewThreadModels.get(key);
		if (!model) {
			model = new TestReviewThreadsModel();
			this._reviewThreadModels.set(key, model);
		}
		return model;
	}
}

class TestPullRequestModel {
	private readonly _pullRequest = observableValue<IGitHubPullRequest | undefined>('test.pullRequest', undefined);
	readonly pullRequest: IObservable<IGitHubPullRequest | undefined> = this._pullRequest;
	set(pullRequest: IGitHubPullRequest): void { this._pullRequest.set(pullRequest, undefined); }
}

class TestCIModel {
	private readonly _overallStatus = observableValue<GitHubCIOverallStatus>('test.ciStatus', GitHubCIOverallStatus.Neutral);
	readonly overallStatus: IObservable<GitHubCIOverallStatus> = this._overallStatus;
	set(status: GitHubCIOverallStatus): void { this._overallStatus.set(status, undefined); }
}

class TestReviewThreadsModel {
	private readonly _reviewThreads = observableValue<readonly IGitHubPullRequestReviewThread[]>('test.reviewThreads', []);
	readonly reviewThreads: IObservable<readonly IGitHubPullRequestReviewThread[]> = this._reviewThreads;
	set(threads: readonly IGitHubPullRequestReviewThread[]): void { this._reviewThreads.set(threads, undefined); }
}
