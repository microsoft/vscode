/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ImmortalReference, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IGitHubClient } from '../../../../../platform/github/common/githubService.js';
import { IGitHubCredentials } from '../../../../../platform/github/common/githubCredentialService.js';
import { GitHubIssue } from '../../../../../platform/github/common/githubQueryService.js';
import { GitHubQueryService } from '../../../../../platform/github/common/githubQueryServiceImpl.js';
import { GitHubTransport } from '../../../../../platform/github/common/githubTransport.js';
import { IGitHubEndpointProvider } from '../../../../../platform/github/common/githubTypes.js';
import { FragmentState, PullRequestSnapshot } from '../../../../../platform/github/common/githubPullRequestService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
import { getChatPillLocationHover } from '../../../../browser/chatPills.js';
import { createGitHubResourceDetailsHover, getGitHubResourceDetailsPresentation, GitHubResourceDetailsResolver, parseGitHubReferenceTarget } from '../../browser/githubResourceDetails.js';
import { createIssueResourceHover, createPullRequestResourceHover, IGitHubIssueHoverModel, IGitHubPullRequestHoverModel } from '../../browser/githubResourceHover.js';

suite('GitHubResourceDetails', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('declares one polite atomic status region for issue and pull request cards', () => {
		const common = {
			owner: 'microsoft', repo: 'vscode', number: 1, density: 'compact' as const,
			repositoryHref: 'https://github.com/microsoft/vscode',
			referenceHref: 'https://github.com/microsoft/vscode/issues/1',
		};
		const issue = createIssueResourceHover({
			...common, issue: {
				title: 'Issue', body: '', state: 'open', author: { login: 'author' },
			}
		});
		const pullRequest = createPullRequestResourceHover({
			...common, pullRequest: {
				title: 'Pull request', body: '', state: 'open', isDraft: false,
				headRef: 'feature', baseRef: 'main', author: { login: 'author' },
			}
		});
		assert.deepStrictEqual([issue, pullRequest].map(hover => ({
			live: hover.statusRow?.getAttribute('aria-live'),
			atomic: hover.statusRow?.getAttribute('aria-atomic'),
			liveRegionCount: hover.element.querySelectorAll('[aria-live]').length,
			refreshIsNestedLiveRegion: hover.refreshStatus?.hasAttribute('aria-live'),
		})), Array.from({ length: 2 }, () => ({
			live: 'polite', atomic: 'true', liveRegionCount: 1, refreshIsNestedLiveRegion: false,
		})));
	});

	for (const density of ['default', 'compact'] as const) {
		test(`keeps short text previews content-sized and ${density} GitHub cards bounded`, () => {
			const measure = (element: HTMLElement): number => {
				const container = mainWindow.document.createElement('div');
				container.style.display = 'inline-block';
				container.style.maxWidth = '700px';
				container.style.setProperty('--vscode-spacing-size240', '24px');
				container.style.setProperty('--vscode-strokeThickness', '1px');
				container.appendChild(element);
				mainWindow.document.body.appendChild(container);
				store.add(toDisposable(() => container.remove()));
				return element.getBoundingClientRect().width;
			};
			const location = getChatPillLocationHover('plan.md').content;
			assert.ok(location instanceof HTMLElement);
			location.classList.toggle('compact', density === 'compact');
			const shortWidth = measure(location);
			const rich = createIssueResourceHover({
				owner: 'microsoft', repo: 'vscode', number: 1, density,
				repositoryHref: 'https://github.com/microsoft/vscode',
				referenceHref: 'https://github.com/microsoft/vscode/issues/1',
				issue: { title: 'Issue', body: '', state: 'open', author: { login: 'author' } },
			});
			const richWidth = measure(rich.element);
			const expectedRichWidth = Math.min(520, mainWindow.innerWidth - 50);
			assert.deepStrictEqual({
				shortUsesContentWidth: shortWidth > 0 && shortWidth < expectedRichWidth,
				richWidth,
			}, { shortUsesContentWidth: true, richWidth: expectedRichWidth });
		});
	}

	function createResolver() {
		const operations: string[] = [];
		const requests: { readonly kind: string; readonly number: number; readonly priority: string | undefined }[] = [];
		const warnings: string[] = [];
		const issue = observableValue<FragmentState<GitHubIssue>>('issue', {
			status: 'ready', complete: true,
			value: upcastPartial<GitHubIssue>({ title: 'Issue title', body: '', state: 'open', author: { login: 'author' } }),
		});
		const snapshot = observableValue<PullRequestSnapshot>('pullRequest', upcastPartial<PullRequestSnapshot>({
			core: {
				status: 'ready', complete: true,
				value: {
					repositoryNameWithOwner: 'microsoft/vscode', number: 1, title: 'PR title',
					url: 'https://github.com/microsoft/vscode/pull/1', state: 'open', draft: false,
					headSha: 'head', headRef: 'feature', baseSha: 'base', baseRef: 'main',
				},
			},
			checks: {
				status: 'ready', complete: true,
				value: {
					headSha: 'head', checks: [{ id: 'build', type: 'checkRun', name: 'Build', status: 'COMPLETED', conclusion: 'SUCCESS' }],
					requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true,
				},
			},
		}));
		let refresh = async (_fragment: string, _number: number) => { };
		const client = upcastPartial<IGitHubClient>({
			credentials: upcastPartial<IGitHubClient['credentials']>({
				getCredential: async signal => ({ account: { host: 'api.github.com', accountId: 'test' }, token: 'token', generation: 1, signal }),
			}),
			query: upcastPartial<IGitHubClient['query']>({
				subscribeIssue: (ref, options) => {
					requests.push({ kind: 'issue', number: ref.number, priority: options?.priority });
					return upcastPartial<ReturnType<IGitHubClient['query']['subscribeIssue']>>({
						resource: { ref: upcastPartial({}), state: issue },
						update: () => { },
						refresh: async () => { operations.push('issue'); await refresh('issue', ref.number); },
						dispose: () => { },
					});
				},
			}),
			pullRequests: upcastPartial<IGitHubClient['pullRequests']>({
				subscribePullRequest: (ref, options) => {
					requests.push({ kind: 'pullRequest', number: ref.number, priority: options.priority });
					return upcastPartial<ReturnType<IGitHubClient['pullRequests']['subscribePullRequest']>>({
						resource: { ref: upcastPartial({}), snapshot },
						update: () => { },
						refresh: async fragment => { operations.push(String(fragment)); await refresh(String(fragment), ref.number); },
						dispose: () => { },
					});
				},
			}),
		});
		const resolver = store.add(new GitHubResourceDetailsResolver(upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: async () => new ImmortalReference(client),
		}), new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}()));
		return { resolver, issue, snapshot, operations, requests, warnings, setRefresh: (callback: typeof refresh) => { refresh = callback; } };
	}

	test('keeps reference identity and recorded labels stable before details resolve', () => {
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		assert.deepStrictEqual((['idle', 'loading', 'failed'] as const).map(status =>
			getGitHubResourceDetailsPresentation('issue', target, { status }, 'Recorded title')),
			Array.from({ length: 3 }, () => ({
				label: 'Recorded title', badge: '#1', badgeBeforeLabel: true, className: 'chat-pill-reference', preserveLabelOnRefresh: false,
				pillLabel: '#1', ariaLabel: 'Open Issue #1: Recorded title', dropdownAriaLabel: '#1, Open Issue: Recorded title',
			})));
	});

	test('uses a meaningful fallback for missing titles in every state', () => {
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		assert.deepStrictEqual([
			getGitHubResourceDetailsPresentation('pullRequest', target, { status: 'idle' }, '').label,
			getGitHubResourceDetailsPresentation('issue', target, { status: 'loading' }, '').label,
			getGitHubResourceDetailsPresentation('issue', target, { status: 'resolved', value: { title: '', body: '', state: 'open', author: { login: 'author' } } }, 'Recorded title').label,
		], ['Pull Request', 'Issue', 'Recorded title']);
	});

	test('uses resolved status icons for fresh and stale pull requests', () => {
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		const pullRequest: IGitHubPullRequestHoverModel = {
			title: 'Live title', body: '', state: 'open', isDraft: false,
			author: { login: 'author' }, headRef: 'feature', baseRef: 'main',
		};
		const cases = [
			{ state: 'open', isDraft: false, checksStatus: 'success', icon: 'git-pull-request', color: 'charts.green' },
			{ state: 'open', isDraft: true, checksStatus: 'failure', icon: 'git-pull-request-draft', color: 'descriptionForeground' },
			{ state: 'closed', isDraft: false, checksStatus: 'failure', icon: 'git-pull-request-closed', color: 'charts.red' },
			{ state: 'merged', isDraft: false, checksStatus: 'success', icon: 'git-pull-request-done', color: 'charts.purple' },
			{ state: 'open', isDraft: false, checksStatus: 'failure', icon: 'git-pull-request-error', color: 'charts.orange' },
		] as const;
		assert.deepStrictEqual(cases.flatMap(testCase => [false, true].map(stale => {
			const entry = getGitHubResourceDetailsPresentation('pullRequest', target, {
				status: 'resolved', stale,
				value: { pullRequest: { ...pullRequest, state: testCase.state, isDraft: testCase.isDraft }, checksStatus: testCase.checksStatus },
			}, 'Recorded title');
			return { label: entry.label, badge: entry.badge, icon: entry.icon?.id, color: entry.icon?.color?.id };
		})), cases.flatMap(testCase => Array.from({ length: 2 }, () => ({
			label: 'Live title', badge: '#1', icon: testCase.icon, color: testCase.color,
		}))));
	});

	test('uses resolved issue state and completion reason icons', () => {
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		const issue: IGitHubIssueHoverModel = { title: 'Live title', body: '', state: 'open', author: { login: 'author' } };
		const cases = [
			{ state: 'open', stateReason: undefined, icon: 'issue-opened', color: 'charts.green' },
			{ state: 'closed', stateReason: 'completed', icon: 'issue-closed', color: 'charts.purple' },
			{ state: 'closed', stateReason: 'not_planned', icon: 'issue-closed', color: 'descriptionForeground' },
			{ state: 'closed', stateReason: 'duplicate', icon: 'issue-closed', color: 'descriptionForeground' },
		] as const;
		assert.deepStrictEqual(cases.map(testCase => {
			const entry = getGitHubResourceDetailsPresentation('issue', target, {
				status: 'resolved', value: { ...issue, state: testCase.state, stateReason: testCase.stateReason },
			}, 'Recorded title');
			return { label: entry.label, badge: entry.badge, icon: entry.icon?.id, color: entry.icon?.color?.id };
		}), cases.map(testCase => ({
			label: 'Live title', badge: '#1', icon: testCase.icon, color: testCase.color,
		})));
	});

	test('shows fresh cached hover details synchronously without a loading or refreshing state', async () => {
		const { resolver, operations } = createResolver();
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		await resolver.resolvePullRequest(target);
		const hover = createGitHubResourceDetailsHover({
			kind: 'pullRequest', target, resource: URI.parse('https://github.com/microsoft/vscode/pull/1'), resolver,
			onDidClickRepository: () => { }, onDidClickReference: () => { }, onDidClickBaseBranch: () => { }, onDidClickHeadBranch: () => { },
		});
		assert.ok(typeof hover.hover.content === 'function');
		const element = hover.hover.content();
		assert.ok(element instanceof HTMLElement);
		assert.deepStrictEqual({ title: element.querySelector('.sessions-pr-hover-title')?.textContent, busy: element.getAttribute('aria-busy'), refreshHidden: element.querySelector<HTMLElement>('.github-reference-refresh-status')?.hidden, operations }, {
			title: 'PR title\u00a0#1', busy: 'false', refreshHidden: true, operations: ['core', 'checks'],
		});
	});

	test('warms new references with bounded concurrency, but not restored history', async () => {
		const { resolver, operations, setRefresh } = createResolver();
		const finish = new DeferredPromise<void>();
		setRefresh(async () => finish.p);
		const reference = (number: number) => ({ identity: {}, resource: URI.parse(`https://github.com/microsoft/vscode/pull/${number}`) });
		const restored = [reference(1)];
		resolver.retain(restored, 'session-1');
		await timeout(0);
		const initial = [...operations];
		const added = Array.from({ length: 5 }, (_, index) => reference(index + 2));
		resolver.retain([...restored, ...added], 'session-1');
		resolver.retain([...restored, ...added, { ...added[0], identity: {} }], 'session-1');
		await timeout(0);
		const inFlight = [...operations];
		finish.complete();
		await timeout(0);
		resolver.retain([...restored, ...added, reference(7)], 'session-2');
		await timeout(0);
		assert.deepStrictEqual({ initial, inFlight, afterSessionSwitch: operations }, {
			initial: [], inFlight: ['core', 'core', 'core'], afterSessionSwitch: ['core', 'core', 'core', 'core', 'core'],
		});
	});

	for (const kind of ['issue', 'pullRequest'] as const) {
		test(`promotes a queued ${kind} on interactive intent without duplicate requests`, async () => {
			const { resolver, requests, setRefresh } = createResolver();
			const finish = new DeferredPromise<void>();
			setRefresh(async (_fragment, number) => {
				if (number !== 4) {
					await finish.p;
				}
			});
			const target = (number: number) => ({ owner: 'microsoft', repo: 'vscode', number });
			const prefetches = [1, 2, 3, 4, 5].map(number => kind === 'issue'
				? resolver.prefetchIssue(target(number))
				: resolver.prefetchPullRequest(target(number)));
			await timeout(0);
			const resolve = () => kind === 'issue' ? resolver.resolveIssue(target(4)) : resolver.resolvePullRequest(target(4));
			const interactive = [resolve(), resolve()];
			await timeout(0);
			const beforeBackgroundCompletes = {
				requests: [...requests],
				fresh: resolver.isFresh(kind, target(4)),
			};
			finish.complete();
			await Promise.all([...prefetches, ...interactive]);
			assert.deepStrictEqual({ beforeBackgroundCompletes, requests }, {
				beforeBackgroundCompletes: {
					requests: [1, 2, 3, 4].map(number => ({ kind, number, priority: number === 4 ? 'interactive' : 'background' })),
					fresh: true,
				},
				requests: [1, 2, 3, 4, 5].map(number => ({ kind, number, priority: number === 4 ? 'interactive' : 'background' })),
			});
		});
	}

	test('does not retry a failed promoted request when its old queue slot becomes available', async () => {
		const { resolver, requests, warnings, setRefresh } = createResolver();
		const finish = new DeferredPromise<void>();
		setRefresh(async (_fragment, number) => {
			if (number === 4) {
				throw new Error('offline');
			}
			await finish.p;
		});
		const target = (number: number) => ({ owner: 'microsoft', repo: 'vscode', number });
		const prefetches = [1, 2, 3, 4].map(number => resolver.prefetchIssue(target(number)));
		await timeout(0);
		const interactive = resolver.resolveIssue(target(4));
		await timeout(0);
		const failedBeforeRelease = resolver.getIssueState(target(4)).get().status;
		finish.complete();
		const results = await Promise.all([...prefetches, interactive]);
		assert.deepStrictEqual({
			failedBeforeRelease, requests, warnings: warnings.length,
			prefetchResult: results[3], interactiveResult: results[4],
		}, {
			failedBeforeRelease: 'failed',
			requests: [1, 2, 3, 4].map(number => ({ kind: 'issue', number, priority: number === 4 ? 'interactive' : 'background' })),
			warnings: 1, prefetchResult: undefined, interactiveResult: undefined,
		});
	});

	test('promotes a running prefetch through the real query service and transport queue', async () => {
		const account = { host: 'api.github.com', accountId: 'test' };
		const credentials = upcastPartial<IGitHubCredentials>({
			onDidInvalidate: Event.None,
			getCredential: async signal => ({ account, token: 'token', generation: 1, signal }),
			handleRequestError: () => { },
		});
		const release = new DeferredPromise<Response>();
		const started = new DeferredPromise<void>();
		const paths: string[] = [];
		const transport = store.add(new GitHubTransport(async input => {
			const path = new URL(String(input)).pathname;
			paths.push(path);
			if (path === '/busy') {
				started.complete();
				return release.p;
			}
			return new Response(JSON.stringify({
				number: 4, title: 'Authoritative title', body: '', state: 'open',
				html_url: 'https://github.com/microsoft/vscode/issues/4',
				user: { login: 'author' }, assignees: [], labels: [],
				created_at: '2026-10-07T00:00:00Z', updated_at: '2026-10-07T00:00:00Z',
			}));
		}, undefined, false, undefined, {
			queue: { maximumConcurrency: 1, maximumHostConcurrency: 1, maximumCallerConcurrency: 1 },
		}));
		const endpoint: IGitHubEndpointProvider = {
			onDidChange: Event.None,
			getApiBaseUri: () => 'https://api.github.com',
			getGraphQlUri: () => 'https://api.github.com/graphql',
		};
		const query = store.add(new GitHubQueryService(undefined, undefined, credentials, transport, endpoint, upcastPartial({}), new NullLogService()));
		const client = upcastPartial<IGitHubClient>({ credentials, query });
		const resolver = store.add(new GitHubResourceDetailsResolver(upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: async () => new ImmortalReference(client),
		}), new NullLogService()));
		const busy = transport.rest(account, 'token', { method: 'GET', url: 'https://api.github.com/busy', priority: 'background' }, new AbortController().signal);
		await started.p;
		const visible = transport.rest(account, 'token', { method: 'GET', url: 'https://api.github.com/visible', priority: 'visible' }, new AbortController().signal);
		const target = { owner: 'microsoft', repo: 'vscode', number: 4 };
		const background = resolver.prefetchIssue(target);
		await timeout(0);
		const interactive = resolver.resolveIssue(target);
		release.complete(new Response('{}'));
		await Promise.all([busy, visible, background, interactive]);
		assert.deepStrictEqual({ paths, fresh: resolver.isFresh('issue', target) }, {
			paths: ['/busy', '/repos/microsoft/vscode/issues/4', '/visible'], fresh: true,
		});
	});

	test('does not fetch evicted queued references', async () => {
		const { resolver, operations, setRefresh } = createResolver();
		const finish = new DeferredPromise<void>();
		setRefresh(async () => finish.p);
		const pending = Array.from({ length: 5 }, (_, number) => resolver.prefetchIssue({ owner: 'microsoft', repo: 'vscode', number: number + 1 }));
		await timeout(0);
		resolver.retain([]);
		finish.complete();
		await Promise.all(pending);
		assert.deepStrictEqual(operations, ['issue', 'issue', 'issue']);
	});

	test('settles canceled queued prefetches on disposal', async () => {
		const { resolver, setRefresh } = createResolver();
		const finish = new DeferredPromise<void>();
		setRefresh(async () => finish.p);
		const pending = Array.from({ length: 5 }, (_, number) => resolver.prefetchIssue({ owner: 'microsoft', repo: 'vscode', number: number + 1 }));
		await timeout(0);
		resolver.dispose();
		const results = await Promise.all(pending);
		finish.complete();
		assert.deepStrictEqual(results, Array.from({ length: 5 }, () => undefined));
	});

	test('revalidates titles and issue state after the interactive freshness budget', () => runWithFakedTimers({}, async () => {
		const { resolver, issue, operations, setRefresh } = createResolver();
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		await resolver.prefetchIssue(target);
		await timeout(59_999);
		await resolver.resolveIssue(target);
		const beforeExpiry = [...operations];
		await timeout(1);
		const finish = new DeferredPromise<void>();
		setRefresh(async () => finish.p);
		const pending = resolver.resolveIssue(target);
		const whileRefreshing = resolver.getIssueState(target).get();
		issue.set({ status: 'ready', complete: true, value: upcastPartial<GitHubIssue>({ title: 'Renamed issue', body: '', state: 'closed', author: { login: 'author' } }) }, undefined);
		finish.complete();
		const updated = await pending;
		assert.deepStrictEqual({ beforeExpiry, operations, whileRefreshing, updated: { title: updated?.title, state: updated?.state } }, {
			beforeExpiry: ['issue'], operations: ['issue', 'issue'],
			whileRefreshing: { status: 'resolved', value: { title: 'Issue title', body: '', state: 'open', stateReason: undefined, author: { login: 'author' }, createdAt: undefined } },
			updated: { title: 'Renamed issue', state: 'closed' },
		});
	}));

	test('reuses prefetched titles until the background freshness budget expires', () => runWithFakedTimers({}, async () => {
		const { resolver, operations } = createResolver();
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		await Promise.all([resolver.prefetchIssue(target), resolver.prefetchPullRequest(target)]);
		await timeout(15 * 60_000 - 1);
		await Promise.all([resolver.prefetchIssue(target), resolver.prefetchPullRequest(target)]);
		const beforeExpiry = [...operations];
		await timeout(1);
		await Promise.all([resolver.prefetchIssue(target), resolver.prefetchPullRequest(target)]);
		assert.deepStrictEqual({ beforeExpiry, operations }, {
			beforeExpiry: ['issue', 'core'], operations: ['issue', 'core', 'issue', 'core'],
		});
	}));

	test('does not mark an errored service snapshot as freshly resolved', () => runWithFakedTimers({}, async () => {
		const { resolver, issue, warnings } = createResolver();
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		const original = await resolver.resolveIssue(target);
		await timeout(60_000);
		issue.set({ ...issue.get(), status: 'error' }, undefined);
		await resolver.resolveIssue(target);
		assert.deepStrictEqual({ state: resolver.getIssueState(target).get(), fresh: resolver.isFresh('issue', target), warnings: warnings.length }, {
			state: { status: 'resolved', value: original, stale: true }, fresh: false, warnings: 1,
		});
	}));

	test('retains stale details and logs failed revalidation', () => runWithFakedTimers({}, async () => {
		const { resolver, operations, warnings, setRefresh } = createResolver();
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		const original = await resolver.resolveIssue(target);
		await timeout(60_000);
		setRefresh(async () => { throw new Error('offline'); });
		await resolver.resolveIssue(target);
		assert.deepStrictEqual({ state: resolver.getIssueState(target).get(), operations, warnings: warnings.length }, {
			state: { status: 'resolved', value: original, stale: true }, operations: ['issue', 'issue'], warnings: 1,
		});
	}));

	test('refreshes PR merge status and checks without claiming success from a different head', () => runWithFakedTimers({}, async () => {
		const { resolver, snapshot, operations } = createResolver();
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		const initial = await resolver.resolvePullRequest(target);
		await timeout(29_999);
		await resolver.resolvePullRequest(target);
		const beforeExpiry = [...operations];
		await timeout(1);
		const current = snapshot.get();
		assert.ok(current.core.value);
		snapshot.set({ ...current, core: { ...current.core, value: { ...current.core.value, title: 'Renamed PR', state: 'merged', headSha: 'new-head' } } }, undefined);
		const updated = await resolver.resolvePullRequest(target);
		assert.deepStrictEqual({
			initial: initial?.checksStatus, beforeExpiry, operations,
			updated: { title: updated?.pullRequest.title, state: updated?.pullRequest.state, checks: updated?.checksStatus },
		}, {
			initial: 'success', beforeExpiry: ['core', 'checks'], operations: ['core', 'checks', 'core', 'checks'],
			updated: { title: 'Renamed PR', state: 'merged', checks: undefined },
		});
	}));

	test('does not show cached checks as current when checks refresh fails', () => runWithFakedTimers({}, async () => {
		const { resolver, setRefresh, warnings } = createResolver();
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		await resolver.resolvePullRequest(target);
		await timeout(30_000);
		setRefresh(async fragment => {
			if (fragment === 'checks') {
				throw new Error('offline');
			}
		});
		const updated = await resolver.resolvePullRequest(target);
		assert.deepStrictEqual({ checks: updated?.checksStatus, unavailable: updated?.checksUnavailable, warnings: warnings.length }, {
			checks: undefined, unavailable: true, warnings: 1,
		});
	}));

	test('refreshes cached hover status without replacing focused links, and adopts renamed titles on reopening', () => runWithFakedTimers({}, async () => {
		const { resolver, issue, setRefresh } = createResolver();
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		await resolver.prefetchIssue(target);
		await timeout(60_000);
		const finish = new DeferredPromise<void>();
		setRefresh(async () => finish.p);
		const hover = createGitHubResourceDetailsHover({
			kind: 'issue', target, resource: URI.parse('https://github.com/microsoft/vscode/issues/1'), resolver,
			onDidClickRepository: () => { }, onDidClickReference: () => { }, onDidClickBaseBranch: () => { }, onDidClickHeadBranch: () => { },
		});
		assert.ok(typeof hover.hover.content === 'function');
		const element = hover.hover.content();
		assert.ok(element instanceof HTMLElement);
		document.body.appendChild(element);
		store.add({ dispose: () => element.remove() });
		const link = element.querySelector<HTMLElement>('.sessions-issue-hover-reference')!;
		link.focus();
		const initialText = element.textContent;
		issue.set({ status: 'ready', complete: true, value: upcastPartial<GitHubIssue>({ title: 'Renamed issue', body: '', state: 'closed', author: { login: 'author' } }) }, undefined);
		finish.complete();
		await timeout(0);
		const whileOpen = { sameLink: element.querySelector('.sessions-issue-hover-reference') === link, focused: document.activeElement === link, title: element.querySelector('.sessions-issue-hover-title')?.textContent, status: element.querySelector('.sessions-issue-hover-status-label')?.textContent };
		element.remove();
		hover.hover.content();
		const reopenedTitle = element.querySelector('.sessions-issue-hover-title')?.textContent;
		await timeout(0);
		assert.deepStrictEqual({ showedCachedTitle: initialText?.includes('Issue title'), whileOpen, reopenedTitle }, {
			showedCachedTitle: true,
			whileOpen: { sameLink: true, focused: true, title: 'Issue title\u00a0#1', status: 'Closed' },
			reopenedTitle: 'Renamed issue\u00a0#1',
		});
	}));

	test('never subscribes to public references through enterprise credentials', async () => {
		const subscriptions: string[] = [];
		const warnings: string[] = [];
		const client = upcastPartial<IGitHubClient>({
			credentials: upcastPartial<IGitHubClient['credentials']>({
				getCredential: async signal => ({
					account: { host: 'github.enterprise.example', accountId: 'enterprise' }, token: 'token', generation: 1, signal,
				}),
			}),
			query: upcastPartial<IGitHubClient['query']>({
				subscribeIssue: () => { subscriptions.push('issue'); throw new Error('Must not subscribe'); },
			}),
			pullRequests: upcastPartial<IGitHubClient['pullRequests']>({
				subscribePullRequest: () => { subscriptions.push('pullRequest'); throw new Error('Must not subscribe'); },
			}),
		});
		const resolver = store.add(new GitHubResourceDetailsResolver(upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: async () => new ImmortalReference(client),
		}), new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}()));
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		const results = await Promise.all([resolver.resolveIssue(target), resolver.resolvePullRequest(target)]);
		assert.deepStrictEqual({
			results, subscriptions, warnings: warnings.length,
			issue: resolver.getIssueState(target).get().status,
			pullRequest: resolver.getPullRequestState(target).get().status,
		}, { results: [undefined, undefined], subscriptions: [], warnings: 2, issue: 'failed', pullRequest: 'failed' });
	});

	for (const invalidation of ['evict', 'account', 'dispose'] as const) {
		for (const rejects of [true, false]) {
			test(`discards canceled checks after ${invalidation} when refresh ${rejects ? 'rejects' : 'resolves'}`, async () => {
				const changed = store.add(new Emitter<void>());
				const started = new DeferredPromise<void>();
				const finish = new DeferredPromise<void>();
				const warnings: string[] = [];
				const client = upcastPartial<IGitHubClient>({
					credentials: upcastPartial<IGitHubClient['credentials']>({
						getCredential: async signal => ({ account: { host: 'api.github.com', accountId: 'test' }, token: 'token', generation: 1, signal }),
					}),
					pullRequests: upcastPartial<IGitHubClient['pullRequests']>({
						subscribePullRequest: () => upcastPartial<ReturnType<IGitHubClient['pullRequests']['subscribePullRequest']>>({
							update: () => { },
							refresh: async fragment => {
								if (fragment === 'checks') {
									started.complete();
									await finish.p;
									if (rejects) {
										throw new Error('Request canceled');
									}
								}
							},
							dispose: () => { },
							resource: {
								ref: upcastPartial({}), snapshot: observableValue('canceled', upcastPartial<PullRequestSnapshot>({
									core: {
										status: 'ready', complete: true, value: {
											repositoryNameWithOwner: 'private/repo', number: 1, title: 'Old private title',
											url: 'https://github.com/private/repo/pull/1', state: 'open', draft: false,
											headSha: 'head', headRef: 'feature', baseSha: 'base', baseRef: 'main',
										}
									},
									checks: { status: 'missing', complete: false },
								}))
							},
						}),
					}),
				});
				const resolver = store.add(new GitHubResourceDetailsResolver(upcastPartial<IWorkbenchGitHubService>({
					onDidChangeDefaultClient: changed.event,
					acquireDefaultAccountClient: async () => new ImmortalReference(client),
				}), new class extends NullLogService {
					override warn(message: string): void { warnings.push(message); }
				}()));
				const pending = resolver.resolvePullRequest({ owner: 'private', repo: 'repo', number: 1 });
				await started.p;
				if (invalidation === 'account') {
					changed.fire();
				} else if (invalidation === 'dispose') {
					resolver.dispose();
				} else {
					resolver.retain([]);
				}
				finish.complete();
				assert.deepStrictEqual({ result: await pending, warnings }, { result: undefined, warnings: [] });
			});
		}
	}

	test('resolves references only when hover content is requested and reuses the result', async () => {
		const operations: string[] = [];
		const issue = observableValue<FragmentState<GitHubIssue>>('issue', {
			status: 'ready',
			complete: true,
			value: upcastPartial<GitHubIssue>({
				number: 1,
				title: 'Issue title',
				body: 'Issue body',
				state: 'open',
				author: { login: 'issue-author' },
				createdAt: '2026-09-01T12:00:00Z',
			}),
		});
		const pullRequest = observableValue<PullRequestSnapshot>('pullRequest', upcastPartial<PullRequestSnapshot>({
			core: {
				status: 'ready',
				complete: true,
				value: {
					repositoryNameWithOwner: 'microsoft/vscode',
					number: 2,
					title: 'Pull request title',
					body: 'Pull request body',
					url: 'https://github.com/microsoft/vscode/pull/2',
					state: 'open',
					draft: false,
					headSha: 'head',
					headRef: 'feature',
					baseSha: 'base',
					baseRef: 'main',
					author: { login: 'pr-author' },
				},
			},
			checks: {
				status: 'ready',
				complete: true,
				value: {
					headSha: 'head',
					checks: [{ id: 'check', type: 'checkRun', name: 'Build', status: 'COMPLETED', conclusion: 'SUCCESS' }],
					requirednessComplete: true,
					expectedSuites: [],
					expectedSuitesComplete: true,
				},
			},
		}));
		const client = upcastPartial<IGitHubClient>({
			credentials: upcastPartial<IGitHubClient['credentials']>({
				onDidInvalidate: Event.None,
				getCredential: async (signal: AbortSignal) => ({
					account: { host: 'api.github.com', accountId: 'test' },
					token: 'token',
					generation: 1,
					signal,
				}),
			}),
			query: upcastPartial<IGitHubClient['query']>({
				subscribeIssue: () => upcastPartial<ReturnType<IGitHubClient['query']['subscribeIssue']>>({
					resource: { ref: upcastPartial({}), state: issue },
					update: () => { },
					refresh: async () => { operations.push('issue.refresh'); },
					dispose: () => operations.push('issue.dispose'),
				}),
			}),
			pullRequests: upcastPartial<IGitHubClient['pullRequests']>({
				subscribePullRequest: () => upcastPartial<ReturnType<IGitHubClient['pullRequests']['subscribePullRequest']>>({
					resource: { ref: upcastPartial({}), snapshot: pullRequest },
					update: () => { },
					refresh: async fragment => { operations.push(`pullRequest.refresh.${fragment}`); },
					dispose: () => operations.push('pullRequest.dispose'),
				}),
			}),
		});
		const service = upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: async () => {
				operations.push('client.acquire');
				return { object: client, dispose: () => operations.push('client.dispose') };
			},
		});
		const resolver = store.add(new GitHubResourceDetailsResolver(service, new NullLogService()));
		const issueResource = URI.parse('https://github.com/microsoft/vscode/issues/1');
		const pullRequestResource = URI.parse('https://github.com/microsoft/vscode/pull/2');
		const issueHover = createGitHubResourceDetailsHover({
			kind: 'issue',
			target: parseGitHubReferenceTarget(issueResource, 'issue')!,
			resource: issueResource,
			resolver,
			onDidClickRepository: () => { },
			onDidClickReference: () => { },
			onDidClickBaseBranch: () => { },
			onDidClickHeadBranch: () => { },
		});
		const pullRequestHover = createGitHubResourceDetailsHover({
			kind: 'pullRequest',
			target: parseGitHubReferenceTarget(pullRequestResource, 'pullRequest')!,
			resource: pullRequestResource,
			resolver,
			onDidClickRepository: () => { },
			onDidClickReference: () => { },
			onDidClickBaseBranch: () => { },
			onDidClickHeadBranch: () => { },
		});

		assert.deepStrictEqual(operations, []);
		const issueElement = typeof issueHover.hover.content === 'function' ? issueHover.hover.content() : undefined;
		const initialIssueText = issueElement?.textContent;
		await timeout(0);
		const issuePillElement = await issueHover.pillHover.element({ isCancellationRequested: false, onCancellationRequested: Event.None });
		const pullRequestElement = typeof pullRequestHover.hover.content === 'function' ? pullRequestHover.hover.content() : undefined;
		const initialPullRequestText = pullRequestElement?.textContent;
		await timeout(0);

		assert.deepStrictEqual({
			operations,
			initialIssueText,
			initialPullRequestText,
			issue: { className: issueElement?.className, text: issueElement?.textContent },
			issuePill: { className: issuePillElement.className, text: issuePillElement.textContent },
			pullRequest: { className: pullRequestElement?.className, text: pullRequestElement?.textContent },
		}, {
			operations: [
				'client.acquire',
				'issue.refresh',
				'issue.dispose',
				'client.dispose',
				'client.acquire',
				'pullRequest.refresh.core',
				'pullRequest.refresh.checks',
				'pullRequest.dispose',
				'client.dispose',
			],
			initialIssueText: 'Issue #1',
			initialPullRequestText: 'Pull Request #2',
			issue: { className: 'chat-pill-hover-content sessions-issue-hover compact', text: 'microsoft/vscodeon Sep 1Issue title #1OpenIssue body@issue-author opened this issue' },
			issuePill: { className: 'chat-pill-hover-content sessions-issue-hover', text: 'microsoft/vscodeon Sep 1Issue title #1OpenIssue body@issue-author opened this issue' },
			pullRequest: { className: 'chat-pill-hover-content sessions-pr-hover compact', text: 'microsoft/vscodePull request title #2OpenChecks passedPull request bodymain←feature@pr-author opened this pull request' },
		});
	});

	test('parses only canonical GitHub issue and pull request URLs', () => {
		assert.deepStrictEqual([
			parseGitHubReferenceTarget(URI.parse('https://github.com/microsoft/vscode/issues/1'), 'issue'),
			parseGitHubReferenceTarget(URI.parse('https://github.com/microsoft/vscode/pull/2'), 'pullRequest'),
			parseGitHubReferenceTarget(URI.parse('https://github.com/microsoft/vscode/issues/1/comments'), 'issue'),
			parseGitHubReferenceTarget(URI.parse('http://github.com/microsoft/vscode/pull/2'), 'pullRequest'),
		], [
			{ owner: 'microsoft', repo: 'vscode', number: 1 },
			{ owner: 'microsoft', repo: 'vscode', number: 2 },
			undefined,
			undefined,
		]);
	});

	test('rejects non-canonical and unsafe reference numbers', () => {
		const segments = ['1e3', '1.0', '+1', '001', '0x10', '0', '-1', '9007199254740993'];
		assert.deepStrictEqual(segments.map(segment => ({
			issue: parseGitHubReferenceTarget(URI.parse(`https://github.com/microsoft/vscode/issues/${segment}`), 'issue'),
			pullRequest: parseGitHubReferenceTarget(URI.parse(`https://github.com/microsoft/vscode/pull/${segment}`), 'pullRequest'),
		})), segments.map(() => ({ issue: undefined, pullRequest: undefined })));
	});

	test('retains only current metadata and hover descriptors', () => {
		const resolver = store.add(new GitHubResourceDetailsResolver(upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
		}), new NullLogService()));
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		const issue = { identity: {}, resource: URI.parse('https://github.com/microsoft/vscode/issues/1') };
		const pullRequest = { identity: {}, resource: URI.parse('https://github.com/microsoft/vscode/pull/1') };
		const options = {
			kind: 'issue' as const, target, resource: issue.resource,
			onDidClickRepository: () => { }, onDidClickReference: () => { },
			onDidClickBaseBranch: () => { }, onDidClickHeadBranch: () => { },
		};
		const issueState = resolver.getIssueState(target);
		const pullRequestState = resolver.getPullRequestState(target);
		const hover = resolver.createHover(issue.identity, options);
		resolver.retain([issue, pullRequest]);
		const retained = resolver.getIssueState(target) === issueState && resolver.getPullRequestState(target) === pullRequestState && resolver.createHover(issue.identity, options) === hover;
		resolver.retain([issue]);
		const prEvicted = resolver.getPullRequestState(target) !== pullRequestState;
		resolver.retain([]);
		assert.deepStrictEqual({
			retained,
			prEvicted,
			issueEvicted: resolver.getIssueState(target) !== issueState,
			hoverEvicted: resolver.createHover(issue.identity, options) !== hover,
		}, { retained: true, prEvicted: true, issueEvicted: true, hoverEvicted: true });
	});

	for (const failChecks of [false, true]) {
		test(`preserves prefetched core metadata while checks ${failChecks ? 'fail' : 'resolve'}`, async () => {
			const operations: string[] = [];
			const initialChecks: boolean[] = [];
			const checksHeads: (string | undefined)[] = [];
			let coreRefreshes = 0;
			const checksStarted = new DeferredPromise<void>();
			const finishChecks = new DeferredPromise<void>();
			const snapshot = observableValue<PullRequestSnapshot>('prefetchPullRequest', upcastPartial<PullRequestSnapshot>({
				core: {
					status: 'ready',
					complete: true,
					value: {
						repositoryNameWithOwner: 'microsoft/vscode',
						number: 2,
						title: 'Pull request title',
						url: 'https://github.com/microsoft/vscode/pull/2',
						state: 'open',
						draft: false,
						headSha: 'head',
						headRef: 'feature',
						baseSha: 'base',
						baseRef: 'main',
					},
				},
				checks: {
					status: 'ready',
					complete: true,
					value: { headSha: 'head', checks: [], requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true },
				},
			}));
			const client = upcastPartial<IGitHubClient>({
				credentials: upcastPartial<IGitHubClient['credentials']>({
					onDidInvalidate: Event.None,
					getCredential: async (signal: AbortSignal) => ({
						account: { host: 'api.github.com', accountId: 'test' },
						token: 'token',
						generation: 1,
						signal,
					}),
				}),
				pullRequests: upcastPartial<IGitHubClient['pullRequests']>({
					subscribePullRequest: (_ref, options) => {
						initialChecks.push(!!options.checks);
						return upcastPartial<ReturnType<IGitHubClient['pullRequests']['subscribePullRequest']>>({
							resource: { ref: upcastPartial({}), snapshot },
							update: options => {
								if (options.checks) {
									checksHeads.push(snapshot.get().core.value?.headSha);
								}
							},
							refresh: async fragment => {
								operations.push(String(fragment));
								if (fragment === 'core' && ++coreRefreshes === 2) {
									const current = snapshot.get();
									assert.ok(current.core.value);
									snapshot.set({
										...current,
										core: { ...current.core, value: { ...current.core.value, headSha: 'new-head' } },
										checks: { status: 'missing', complete: false },
									}, undefined);
								}
								if (fragment === 'checks') {
									checksStarted.complete();
									await finishChecks.p;
									if (failChecks) {
										throw new Error('Checks unavailable');
									}
								}
							},
							dispose: () => { },
						});
					},
				}),
			});
			const resolver = store.add(new GitHubResourceDetailsResolver(upcastPartial<IWorkbenchGitHubService>({
				onDidChangeDefaultClient: Event.None,
				acquireDefaultAccountClient: async () => new ImmortalReference(client),
			}), new NullLogService()));
			const target = { owner: 'microsoft', repo: 'vscode', number: 2 };

			await resolver.prefetchPullRequest(target);
			const afterPrefetch = [...operations];
			const completion = resolver.resolvePullRequest(target);
			await checksStarted.p;
			const whileChecking = resolver.getPullRequestState(target).get();
			finishChecks.complete();
			const details = await completion;

			assert.deepStrictEqual({
				afterPrefetch,
				afterHover: operations,
				statusWhileChecking: whileChecking.status,
				title: details?.pullRequest.title,
				initialChecks,
				checksHeads,
			}, {
				afterPrefetch: ['core'],
				afterHover: ['core', 'core', 'checks'],
				statusWhileChecking: 'resolved',
				title: 'Pull request title',
				initialChecks: [false, false],
				checksHeads: ['new-head'],
			});
		});
	}

	test('does not resurrect an evicted prefetch when its hover is waiting', async () => {
		const acquired = new DeferredPromise<IReference<IGitHubClient>>();
		let acquisitions = 0;
		let acquisitionSignal: AbortSignal | undefined;
		const refreshCancellation: boolean[] = [];
		const resolver = store.add(new GitHubResourceDetailsResolver(upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: signal => { acquisitions++; acquisitionSignal = signal; return acquired.p; },
		}), new NullLogService()));
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		const prefetched = resolver.prefetchPullRequest(target);
		const hover = resolver.resolvePullRequest(target);
		resolver.retain([]);
		const abortedOnEviction = acquisitionSignal?.aborted;
		acquired.complete(new ImmortalReference(upcastPartial<IGitHubClient>({
			credentials: upcastPartial<IGitHubClient['credentials']>({
				getCredential: async signal => ({ account: { host: 'api.github.com', accountId: 'test' }, token: 'token', generation: 1, signal }),
			}),
			pullRequests: upcastPartial<IGitHubClient['pullRequests']>({
				subscribePullRequest: () => upcastPartial<ReturnType<IGitHubClient['pullRequests']['subscribePullRequest']>>({
					refresh: async (_fragment, token) => { refreshCancellation.push(token?.isCancellationRequested ?? false); },
					dispose: () => { },
					resource: {
						ref: upcastPartial({}), snapshot: observableValue('evicted', upcastPartial<PullRequestSnapshot>({
							core: {
								status: 'ready', complete: true, value: {
									repositoryNameWithOwner: 'microsoft/vscode', number: 1, title: 'Old PR',
									url: 'https://github.com/microsoft/vscode/pull/1', state: 'open', draft: false,
									headSha: 'head', headRef: 'feature', baseSha: 'base', baseRef: 'main',
								}
							},
							checks: { status: 'missing', complete: false },
						}))
					},
				}),
			}),
		})));
		await prefetched;
		assert.deepStrictEqual({ hover: await hover, acquisitions, abortedOnEviction, refreshCancellation, state: resolver.getPullRequestState(target).get() }, {
			hover: undefined, acquisitions: 1, abortedOnEviction: true, refreshCancellation: [true], state: { status: 'idle' },
		});
	});

	test('retries a reference hover after a transient resolution failure', async () => {
		let acquisitions = 0;
		const issue = observableValue<FragmentState<GitHubIssue>>('retryIssue', {
			status: 'ready',
			complete: true,
			value: upcastPartial<GitHubIssue>({
				number: 1,
				title: 'Recovered issue',
				body: 'Recovered body',
				state: 'open',
				author: { login: 'issue-author' },
			}),
		});
		const client = upcastPartial<IGitHubClient>({
			credentials: upcastPartial<IGitHubClient['credentials']>({
				onDidInvalidate: Event.None,
				getCredential: async (signal: AbortSignal) => ({
					account: { host: 'api.github.com', accountId: 'test' },
					token: 'token',
					generation: 1,
					signal,
				}),
			}),
			query: upcastPartial<IGitHubClient['query']>({
				subscribeIssue: () => upcastPartial<ReturnType<IGitHubClient['query']['subscribeIssue']>>({
					resource: { ref: upcastPartial({}), state: issue },
					update: () => { },
					refresh: async () => { },
					dispose: () => { },
				}),
			}),
		});
		const resolver = store.add(new GitHubResourceDetailsResolver(upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: async () => {
				acquisitions++;
				if (acquisitions === 1) {
					throw new Error('offline');
				}
				return { object: client, dispose: () => { } };
			},
		}), new NullLogService()));
		const resource = URI.parse('https://github.com/microsoft/vscode/issues/1');
		const hover = createGitHubResourceDetailsHover({
			kind: 'issue',
			target: parseGitHubReferenceTarget(resource, 'issue')!,
			resource,
			resolver,
			onDidClickRepository: () => { },
			onDidClickReference: () => { },
			onDidClickBaseBranch: () => { },
			onDidClickHeadBranch: () => { },
		});
		const content = hover.hover.content;
		const element = typeof content === 'function' ? content() : undefined;
		await timeout(0);
		const failedText = element?.textContent;
		if (typeof content === 'function') {
			content();
		}
		const retry = { text: element?.textContent, busy: element?.getAttribute('aria-busy') };
		await timeout(0);

		assert.deepStrictEqual({
			acquisitions,
			failedText,
			retry,
			busy: element?.getAttribute('aria-busy'),
			className: element?.className,
			text: element?.textContent,
		}, {
			acquisitions: 2,
			failedText: resource.toString(true),
			retry: { text: 'Issue #1', busy: 'true' },
			busy: 'false',
			className: 'chat-pill-hover-content sessions-issue-hover compact',
			text: 'microsoft/vscodeRecovered issue #1OpenRecovered body@issue-author opened this issue',
		});
	});
});
