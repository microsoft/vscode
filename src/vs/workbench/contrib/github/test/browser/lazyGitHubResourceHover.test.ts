/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { ImmortalReference } from '../../../../../base/common/lifecycle.js';
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

	test('prefetches only pull request core metadata before a rich hover requests checks', async () => {
		const operations: string[] = [];
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
					refresh: async fragment => { operations.push(String(fragment)); },
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
		await resolver.resolvePullRequest(target);

		assert.deepStrictEqual({
			afterPrefetch,
			afterHover: operations,
		}, {
			afterPrefetch: ['core'],
			afterHover: ['core', 'core', 'checks'],
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
