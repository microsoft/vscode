/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { autorun } from '@vscode/observables';
import 'mocha';
import * as vscode from 'vscode';
import {
	getGitHubIssueStatus,
	getGitHubLookupFailurePresentation,
	getGitHubPullRequestStatus,
	GitHubLookupError,
	resolveGitHubTreePath,
	shouldShowGitHubPullRequestChecks,
} from '../preview/githubLinkPresentationResolver';
import { getSessionLinkPresentation } from '../preview/agentSessionLinkPresentationResolver';
import { getGitCommitPresentation, GitLinkPresentationResolver, normalizeGitRemoteUrl } from '../preview/gitLinkPresentationResolver';
import { createAsyncLinkPresentation, ImmutableLinkPresentationCache, LinkPresentationCache } from '../preview/linkPresentationResolver';

suite('Markdown editor rich links', () => {
	test('separates GitHub branch names from folder paths', () => {
		const refs = [
			{ ref: 'refs/heads/main' },
			{ ref: 'refs/heads/feature/rich-links' },
		];

		assert.deepStrictEqual(resolveGitHubTreePath(['main'], refs), {
			branch: 'main',
		});
		assert.deepStrictEqual(resolveGitHubTreePath(['main', 'src', 'vs'], refs), {
			branch: 'main',
			path: 'src/vs',
		});
		assert.deepStrictEqual(resolveGitHubTreePath(['feature', 'rich-links'], refs), {
			branch: 'feature/rich-links',
		});
		assert.deepStrictEqual(resolveGitHubTreePath(['feature', 'rich-links', 'src'], refs), {
			branch: 'feature/rich-links',
			path: 'src',
		});
	});

	test('maps GitHub issue lifecycle states', () => {
		assert.deepStrictEqual(getGitHubIssueStatus('open', undefined), { kind: 'open', label: 'Open' });
		assert.deepStrictEqual(getGitHubIssueStatus('closed', 'completed'), { kind: 'closed', label: 'Closed' });
		assert.deepStrictEqual(getGitHubIssueStatus('closed', 'not_planned'), { kind: 'notPlanned', label: 'Not planned' });
	});

	test('maps GitHub pull request lifecycle states', () => {
		const open = getGitHubPullRequestStatus('open', false, false);
		const draft = getGitHubPullRequestStatus('open', true, false);
		const closed = getGitHubPullRequestStatus('closed', false, false);
		const merged = getGitHubPullRequestStatus('closed', false, true);

		assert.deepStrictEqual(open, { kind: 'open', label: 'Open' });
		assert.deepStrictEqual(draft, { kind: 'draft', label: 'Draft' });
		assert.deepStrictEqual(closed, { kind: 'closed', label: 'Closed' });
		assert.deepStrictEqual(merged, { kind: 'merged', label: 'Merged' });
		assert.strictEqual(shouldShowGitHubPullRequestChecks(open), true);
		assert.strictEqual(shouldShowGitHubPullRequestChecks(draft), true);
		assert.strictEqual(shouldShowGitHubPullRequestChecks(closed), false);
		assert.strictEqual(shouldShowGitHubPullRequestChecks(merged), false);
	});

	test('keeps GitHub lookup failures visible and actionable', () => {
		assert.deepStrictEqual(
			getGitHubLookupFailurePresentation(
				'https://github.com/hediet/demo-json-schema-validator/pull/5',
				new GitHubLookupError('authenticationRequired', 'No GitHub session.'),
			),
			{
				kind: 'pullRequest',
				status: { kind: 'error', label: 'Authorization required' },
				tooltip: 'Authorize GitHub repository access in VS Code to load this link. No GitHub session.',
				ariaLabel: 'GitHub pullRequest lookup failed: Authorization required',
			},
		);
		assert.deepStrictEqual(
			getGitHubLookupFailurePresentation(
				'https://github.com/hediet/demo-json-schema-validator/issues/1',
				new GitHubLookupError('rateLimited', '403 Forbidden'),
			)?.status,
			{ kind: 'error', label: 'Rate limited' },
		);
		assert.strictEqual(
			getGitHubLookupFailurePresentation('https://example.com/issues/1', new Error('offline')),
			undefined,
		);
	});

	test('publishes complete data-driven session presentations', () => {
		assert.deepStrictEqual(
			getSessionLinkPresentation({
				title: 'Implement rich-link metadata',
				description: 'Updating the Markdown extension',
				status: vscode.AgentSessionStatus.InProgress,
			}),
			{
				kind: 'session',
				title: 'Implement rich-link metadata',
				detail: 'Updating the Markdown extension',
				status: { kind: 'pending', label: 'Working' },
				tooltip: 'Implement rich-link metadata · Working',
				ariaLabel: 'Agent session Implement rich-link metadata, Working',
			},
		);
		assert.deepStrictEqual(
			getSessionLinkPresentation({
				title: 'Implement rich-link metadata',
				status: vscode.AgentSessionStatus.NeedsInput,
			}),
			{
				kind: 'session',
				title: 'Implement rich-link metadata',
				status: { kind: 'warning', label: 'Needs input' },
				tooltip: 'Implement rich-link metadata · Needs input',
				ariaLabel: 'Agent session Implement rich-link metadata, Needs input',
			},
		);
	});

	test('normalizes common Git remote URL formats', () => {
		assert.deepStrictEqual([
			normalizeGitRemoteUrl('https://github.com/microsoft/vscode.git'),
			normalizeGitRemoteUrl('git@github.com:microsoft/vscode.git'),
			normalizeGitRemoteUrl('ssh://git@github.com/microsoft/vscode.git'),
		], [
			'github.com/microsoft/vscode',
			'github.com/microsoft/vscode',
			'github.com/microsoft/vscode',
		]);
	});

	test('supports local and forge Git commit links', () => {
		const refresh = new vscode.EventEmitter<void>();
		const resolver = new GitLinkPresentationResolver(new ImmutableLinkPresentationCache());
		try {
			const context = {
				onDidRequestRefresh: refresh.event,
				logger: { trace: () => { } },
			};
			assert.deepStrictEqual({
				local: !!resolver.resolve('commit://1234567890abcdef', context),
				github: !!resolver.resolve('https://github.com/microsoft/vscode/commit/1234567890abcdef', context),
				gitlab: !!resolver.resolve('https://gitlab.com/microsoft/vscode/-/commit/1234567890abcdef', context),
				invalidLocal: !!resolver.resolve('commit:--output=package.json', context),
				invalidForge: !!resolver.resolve('https://github.com/microsoft/vscode/commit/--output=package.json', context),
				malformedForge: !!resolver.resolve('https://github.com/microsoft/vscode/commit/%', context),
				other: !!resolver.resolve('https://example.com/resource', context),
			}, {
				local: true,
				github: true,
				gitlab: true,
				invalidLocal: false,
				invalidForge: false,
				malformedForge: false,
				other: false,
			});
		} finally {
			resolver.dispose();
			refresh.dispose();
		}
	});

	test('ignores malformed GitHub paths', () => {
		assert.strictEqual(
			getGitHubLookupFailurePresentation('https://github.com/microsoft/vscode/issues/%', new Error('failed')),
			undefined,
		);
	});

	test('shows Git commit metadata', () => {
		assert.deepStrictEqual(getGitCommitPresentation({
			hash: '1234567890abcdef',
			message: 'Refactor rich-link resolvers\n\nUse observable lifetimes.',
			shortStat: {
				insertions: 20,
				deletions: 5,
			},
		}), {
			kind: 'commit',
			detail: 'Refactor rich-link resolvers',
			tooltip: '1234567 · Refactor rich-link resolvers · 20 insertions, 5 deletions',
			ariaLabel: 'Commit 1234567, 20 insertions and 5 deletions: Refactor rich-link resolvers',
		});
	});

	test('owns async resolution through observable lifetime', () => {
		const refresh = new vscode.EventEmitter<void>();
		let resolveCount = 0;
		const presentation = createAsyncLinkPresentation(
			'https://example.com/resource',
			{ kind: 'file', status: { kind: 'pending', label: 'Loading' } },
			{
				onDidRequestRefresh: refresh.event,
				logger: { trace: () => { } },
			},
			async () => ({ kind: 'file', detail: String(++resolveCount) }),
			() => ({ kind: 'file', status: { kind: 'error', label: 'Error' } }),
		);

		assert.strictEqual(resolveCount, 0);
		const observer = autorun(reader => presentation.read(reader));
		assert.strictEqual(resolveCount, 1);
		refresh.fire();
		assert.strictEqual(resolveCount, 2);
		observer.dispose();
		refresh.fire();
		assert.strictEqual(resolveCount, 2);
		refresh.dispose();
	});

	test('caches immutable Git commit presentations without expiry', async () => {
		const cache = new ImmutableLinkPresentationCache();
		let resolveCount = 0;
		const resolve = async () => getGitCommitPresentation({
			hash: '1234567890abcdef',
			message: 'Cached commit',
			shortStat: {
				insertions: ++resolveCount,
				deletions: 0,
			},
		});

		const href = 'https://github.com/microsoft/vscode/commit/1234567890abcdef';
		const first = await cache.get(href, resolve);
		const second = await cache.get(href, resolve);
		const third = await cache.get(href, resolve);

		assert.deepStrictEqual({
			first,
			second,
			third,
			resolveCount,
		}, {
			first: {
				kind: 'commit',
				detail: 'Cached commit',
				tooltip: '1234567 · Cached commit · 1 insertions, 0 deletions',
				ariaLabel: 'Commit 1234567, 1 insertions and 0 deletions: Cached commit',
			},
			second: {
				kind: 'commit',
				detail: 'Cached commit',
				tooltip: '1234567 · Cached commit · 1 insertions, 0 deletions',
				ariaLabel: 'Commit 1234567, 1 insertions and 0 deletions: Cached commit',
			},
			third: {
				kind: 'commit',
				detail: 'Cached commit',
				tooltip: '1234567 · Cached commit · 1 insertions, 0 deletions',
				ariaLabel: 'Commit 1234567, 1 insertions and 0 deletions: Cached commit',
			},
			resolveCount: 1,
		});
	});

	test('expires mutable link presentations after one minute', async () => {
		const cache = new LinkPresentationCache();
		let resolveCount = 0;
		const resolve = async () => ({ kind: 'issue' as const, title: String(++resolveCount) });

		const first = await cache.get('https://github.com/microsoft/vscode/issues/1', resolve, 0);
		const cached = await cache.get('https://github.com/microsoft/vscode/issues/1', resolve, 59_999);
		const refreshed = await cache.get('https://github.com/microsoft/vscode/issues/1', resolve, 60_000);

		assert.deepStrictEqual({ first, cached, refreshed, resolveCount }, {
			first: { kind: 'issue', title: '1' },
			cached: { kind: 'issue', title: '1' },
			refreshed: { kind: 'issue', title: '2' },
			resolveCount: 2,
		});
	});
});
