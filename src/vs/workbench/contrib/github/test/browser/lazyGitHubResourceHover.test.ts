/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { ImmortalReference, IReference } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IGitHubClient } from '../../../../../platform/github/common/githubService.js';
import { GitHubIssue } from '../../../../../platform/github/common/githubQueryService.js';
import { FragmentState, PullRequestSnapshot } from '../../../../../platform/github/common/githubPullRequestService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
import { createLazyGitHubResourceHover, LazyGitHubResourceResolver, parseGitHubReferenceTarget } from '../../browser/lazyGitHubResourceHover.js';

suite('LazyGitHubResourceHover', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
					account: { host: 'github.com', accountId: 'test' },
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
		const resolver = store.add(new LazyGitHubResourceResolver(service, new NullLogService()));
		const issueResource = URI.parse('https://github.com/microsoft/vscode/issues/1');
		const pullRequestResource = URI.parse('https://github.com/microsoft/vscode/pull/2');
		const issueHover = createLazyGitHubResourceHover({
			kind: 'issue',
			target: parseGitHubReferenceTarget(issueResource, 'issue')!,
			resource: issueResource,
			resolver,
			onDidClickRepository: () => { },
			onDidClickReference: () => { },
			onDidClickBaseBranch: () => { },
			onDidClickHeadBranch: () => { },
		});
		const pullRequestHover = createLazyGitHubResourceHover({
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
			initialIssueText: 'Loading issue #1…',
			initialPullRequestText: 'Loading pull request #2…',
			issue: { className: 'sessions-issue-hover compact', text: 'microsoft/vscodeon Sep 1Issue title #1OpenIssue body@issue-author opened this issue' },
			issuePill: { className: 'sessions-issue-hover', text: 'microsoft/vscodeon Sep 1Issue title #1OpenIssue body@issue-author opened this issue' },
			pullRequest: { className: 'sessions-pr-hover compact', text: 'microsoft/vscodePull request title #2OpenChecks passedPull request bodymain←feature@pr-author opened this pull request' },
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
		const resolver = store.add(new LazyGitHubResourceResolver(upcastPartial<IWorkbenchGitHubService>({
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
						account: { host: 'github.com', accountId: 'test' },
						token: 'token',
						generation: 1,
						signal,
					}),
				}),
				pullRequests: upcastPartial<IGitHubClient['pullRequests']>({
					subscribePullRequest: () => upcastPartial<ReturnType<IGitHubClient['pullRequests']['subscribePullRequest']>>({
						resource: { ref: upcastPartial({}), snapshot },
						update: () => { },
						refresh: async fragment => {
							operations.push(String(fragment));
							if (fragment === 'checks') {
								checksStarted.complete();
								await finishChecks.p;
								if (failChecks) {
									throw new Error('Checks unavailable');
								}
							}
						},
						dispose: () => { },
					}),
				}),
			});
			const resolver = store.add(new LazyGitHubResourceResolver(upcastPartial<IWorkbenchGitHubService>({
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
			}, {
				afterPrefetch: ['core'],
				afterHover: ['core', 'core', 'checks'],
				statusWhileChecking: 'resolved',
				title: 'Pull request title',
			});
		});
	}

	test('does not resurrect an evicted prefetch when its hover is waiting', async () => {
		const acquired = new DeferredPromise<IReference<IGitHubClient>>();
		let acquisitions = 0;
		const resolver = store.add(new LazyGitHubResourceResolver(upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: () => { acquisitions++; return acquired.p; },
		}), new NullLogService()));
		const target = { owner: 'microsoft', repo: 'vscode', number: 1 };
		const prefetched = resolver.prefetchPullRequest(target);
		const hover = resolver.resolvePullRequest(target);
		resolver.retain([]);
		acquired.complete(new ImmortalReference(upcastPartial<IGitHubClient>({
			credentials: upcastPartial<IGitHubClient['credentials']>({
				getCredential: async signal => ({ account: { host: 'github.com', accountId: 'test' }, token: 'token', generation: 1, signal }),
			}),
			pullRequests: upcastPartial<IGitHubClient['pullRequests']>({
				subscribePullRequest: () => upcastPartial<ReturnType<IGitHubClient['pullRequests']['subscribePullRequest']>>({
					refresh: async () => { },
					dispose: () => { },
					resource: { ref: upcastPartial({}), snapshot: observableValue('evicted', upcastPartial<PullRequestSnapshot>({
						core: { status: 'ready', complete: true, value: {
							repositoryNameWithOwner: 'microsoft/vscode', number: 1, title: 'Old PR',
							url: 'https://github.com/microsoft/vscode/pull/1', state: 'open', draft: false,
							headSha: 'head', headRef: 'feature', baseSha: 'base', baseRef: 'main',
						} },
						checks: { status: 'missing', complete: false },
					})) },
				}),
			}),
		})));
		await prefetched;
		assert.deepStrictEqual({ hover: await hover, acquisitions, state: resolver.getPullRequestState(target).get() }, {
			hover: undefined, acquisitions: 1, state: { status: 'idle' },
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
					account: { host: 'github.com', accountId: 'test' },
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
		const resolver = store.add(new LazyGitHubResourceResolver(upcastPartial<IWorkbenchGitHubService>({
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
		const hover = createLazyGitHubResourceHover({
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
			retry: { text: 'Loading issue #1…', busy: 'true' },
			busy: 'false',
			className: 'sessions-issue-hover compact',
			text: 'microsoft/vscodeRecovered issue #1OpenRecovered body@issue-author opened this issue',
		});
	});
});
